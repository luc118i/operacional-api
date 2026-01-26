
# RFC — Importação de CSV para Schemes e Scheme Points

**Status:** Fechado para implementação  
**Modo:** A — Bloqueio total (all-or-nothing)  
**Escopo:** Apenas `schemes` e `scheme_points`  
**Banco:** Supabase / PostgreSQL  
**Padrão de código:** modules (`index.ts`, `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.types.ts`)

---

## 1. Objetivo

Importar um arquivo CSV contendo esquemas de viagem e seus pontos (paradas) para o banco de dados, garantindo:

- Determinismo (mesmo CSV → mesmo estado final)
- Idempotência (reimportação não duplica dados)
- Atomicidade (sem estado parcial)
- Observabilidade e facilidade de debug

---

## 2. Tabelas Alvo

### 2.1 `schemes`

Campos relevantes:
- `id uuid`
- `codigo text`
- `nome text`
- `direction text` (`Ida` | `Volta`)
- `trip_time text` (formato **HH:MM**)
- `created_at`, `updated_at`

**Chave de idempotência (definitiva):**
```sql
UNIQUE (codigo, direction, trip_time)
````

---

### 2.2 `scheme_points`

Campos esperados:

* `id uuid`
* `scheme_id uuid` (FK)
* `location_id uuid` (FK)
* `ordem int` (1..N)
* `tempo_no_local_min int`
* `is_initial bool` (opcional)
* `is_final bool` (opcional)

---

### 2.3 `locations` (fonte de verdade para matching)

```sql
create table public.locations (
  id uuid not null default gen_random_uuid (),
  sigla text not null,
  descricao text not null,
  cidade text not null,
  uf text not null,
  tipo text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamp with time zone null default now(),
  constraint locations_pkey primary key (id)
);
```

**Decisão:** o matching do CSV será feito por `locations.descricao`.

---

## 3. Contrato do CSV

### 3.1 Colunas relevantes

**Scheme (cabeçalho):**

* `Codigo Linha`
* `Nome da Linha `
* `Hora Partida` (sempre `HH:MM`)
* `Sentido` (`Ida` ou `Volta`)

**Point:**

* `Sequencia - Nome PCs cadastrado`
  Ex.: `1- GARAGEM DE GOIANIA - GO`
* `Parada`
  Ex.: `00:30`

---

### 3.2 Forward-fill (regra obrigatória)

O CSV vem em blocos (células “mescladas” na origem).

**Regra:**
Se `Codigo Linha`, `Nome da Linha`, `Hora Partida` ou `Sentido` vierem vazios, herdar o último valor não-vazio acima.

**Erro de contrato:**
Point antes do primeiro cabeçalho válido.

---

## 4. Normalização dos Points

### 4.1 Extração

De `Sequencia - Nome PCs cadastrado`:

* `rawPoint` → **campo literal inteiro**
  Ex.: `1- GARAGEM DE GOIANIA - GO`
* `seq_csv` → número antes do primeiro hífen (`1`)
* `location_text` → texto após o hífen (`GARAGEM DE GOIANIA - GO`)

---

### 4.2 Ordenação

1. Ordenar por `(seq_csv ASC, lineIndex ASC)`
2. Renumerar e gravar `ordem = 1..N` (sem buracos)

---

### 4.3 Tempo no local

* `Parada` (`HH:MM`) → minutos (`HH * 60 + MM`)
* vazio → `0`
* inválido → erro de contrato

---

### 4.4 Inicial / Final

* `is_initial = ordem == 1`
* `is_final = ordem == N`

---

## 5. Matching de Locations

### 5.1 Princípios

* CSV **não define tipo de local**
* O import apenas resolve `location_id`
* Tipo permanece sendo atributo de `locations.tipo`

---

### 5.2 Normalização canônica (Postgres)

#### Extensão

```sql
create extension if not exists unaccent;
```

#### Função canônica

```sql
create or replace function public.canonicalize_text(input text)
returns text
language sql
immutable
as $$
  select
    trim(
      regexp_replace(
        regexp_replace(
          unaccent(upper(coalesce(input, ''))),
          '[–—]', '-', 'g'
        ),
        '\s+', ' ', 'g'
      )
    );
$$;
```

#### Índice funcional

```sql
create index if not exists locations_descricao_canonical_idx
on public.locations (public.canonicalize_text(descricao));
```

---

## 6. Modo A — Bloqueio Total

**Regra central:**

> Se **qualquer** location não for encontrada, **nenhum dado é gravado**.

---

## 7. Retorno de Erro — `MISSING_LOCATIONS`

### Formato

```json
{
  "ok": false,
  "status": "MISSING_LOCATIONS",
  "missingLocations": [
    {
      "rawPoint": "1- GARAGEM DE GOIANIA - GO",
      "schemes": [
        "GORN0053034|Ida|15:30",
        "GORN0053034|Volta|08:00"
      ]
    }
  ],
  "stats": {
    "totalSchemesInFile": 2,
    "blockedSchemes": 2,
    "totalMissingLocations": 1
  }
}
```

**Regras:**

* `rawPoint` é literal do CSV (com sequência)
* Agrupado por local
* `schemes` usa `externalKey = codigo|direction|HH:MM`

---

## 8. Estratégia de Escrita (Banco)

### 8.1 Idempotência

```sql
alter table public.schemes
  add constraint schemes_codigo_direction_trip_time_uk
  unique (codigo, direction, trip_time);
```

---

### 8.2 RPC Transacional (decisão: SIM)

```sql
create or replace function public.commit_scheme_replace_points(
  p_codigo text,
  p_nome text,
  p_direction text,
  p_trip_time text,
  p_points jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_scheme_id uuid;
begin
  insert into public.schemes (codigo, nome, direction, trip_time)
  values (p_codigo, p_nome, p_direction, p_trip_time)
  on conflict (codigo, direction, trip_time)
  do update set
    nome = excluded.nome,
    updated_at = now()
  returning id into v_scheme_id;

  delete from public.scheme_points where scheme_id = v_scheme_id;

  insert into public.scheme_points (
    scheme_id,
    location_id,
    ordem,
    tempo_no_local_min,
    is_initial,
    is_final
  )
  select
    v_scheme_id,
    (elem->>'location_id')::uuid,
    (elem->>'ordem')::int,
    (elem->>'tempo_no_local_min')::int,
    coalesce((elem->>'is_initial')::boolean, false),
    coalesce((elem->>'is_final')::boolean, false)
  from jsonb_array_elements(p_points) as elem;

  return v_scheme_id;
end;
$$;
```

---

## 9. Arquitetura de Código (Modules)

```
src/modules/schemeImports/
  index.ts
  schemeImports.routes.ts
  schemeImports.controller.ts
  schemeImports.service.ts
  schemeImports.types.ts
  schemeImports.csv.ts
  schemeImports.locations.ts
  schemeImports.db.ts

src/middlewares/
  uploadSingleCsv.ts
```

---

## 10. Fluxo de Execução

1. Upload CSV (`multipart/form-data`, campo `file`)
2. Parse + validação + forward-fill
3. Normalização e agrupamento por scheme
4. Resolução global de locations
5. Se faltar location → retorna `MISSING_LOCATIONS`
6. Se tudo válido → chama RPC por scheme
7. Retorna `IMPORTED`

---

## 11. Invariantes Pós-Import

* 1 scheme por `(codigo, direction, trip_time)`
* `scheme_points.ordem = 1..N`
* `tempo_no_local_min >= 0`
* Reimportação gera o mesmo estado final

---

## 12. Checklist de Testes

* CSV inválido → `INVALID_CSV`
* Location faltante → bloqueio total
* Mesma location em vários schemes → 1 item no relatório
* Seq quebrada → renumeração correta
* Reimportação → idempotente

---

## 13. Decisões Finais

* Modo A (bloqueio total)
* Matching por `locations.descricao`
* Normalização no Postgres
* RPC para transação real
* `rawPoint` exibido com sequência literal

---

**Este documento é a referência oficial do importador.
A implementação deve seguir exatamente estas regras.**

```

---

Se quiser, no próximo passo posso:
- **transformar esse RFC em tasks de implementação (checklist técnico)**, ou  
- **escrever o código completo do módulo já colável**, arquivo por arquivo, seguindo esse documento como contrato.
```
