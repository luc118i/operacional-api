

# 🚍 Painel Operacional — Backend

Backend responsável por toda a **inteligência operacional**, **validação de regras ANTT**, **cálculo de trechos rodoviários**, **gestão de esquemas e pontos de rota** do sistema Painel Operacional.

Este não é um backend CRUD.
Ele implementa uma **engine de domínio operacional** para transporte rodoviário interestadual.

---

## 🧠 Conceito do domínio

O sistema modela a realidade operacional de uma linha rodoviária da seguinte forma:

```
locations  →  scheme_points  →  schemes  →  summary  →  rules evaluation
                 ↑
            road_segments (cache inteligente ORS/fallback)
```

### Entidades principais

| Entidade        | O que representa                                                             |
| --------------- | ---------------------------------------------------------------------------- |
| `locations`     | Cidades, garagens, pontos de apoio, restaurantes, bases operacionais         |
| `scheme_points` | A rota real da viagem, ponto a ponto, com distância, tempo, funções e regras |
| `schemes`       | Cabeçalho do esquema (linha, sentido, km total, origem, destino)             |
| `road_segments` | Cache inteligente dos trechos rodoviários entre dois pontos                  |

---

## 🏗 Arquitetura

```
src/
 ├─ modules/
 │   ├─ schemes/
 │   ├─ schemePoints/
 │   ├─ roadSegments/
 │   └─ locations/
 │
 ├─ routes/
 │   └─ authRoutes.ts
 │
 ├─ middlewares/
 │   └─ authMiddleware.ts
 │
 ├─ utils/
 │   └─ jwt.ts
 │
 └─ config/
     └─ supabaseClient.ts
```

Separação clara de responsabilidades:

* **routes** → expõe HTTP
* **controller** → traduz HTTP ↔ domínio
* **service** → regras de negócio reais
* **types** → contratos formais
* **rules / evaluation** → engine ANTT
* **roadSegments** → motor geográfico de distâncias

---

## 🔐 Autenticação

JWT próprio.

### Login

`POST /auth/login`

Retorna:

```json
{
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "user": { ... }
}
```

Rotas protegidas:

* Criar/editar/deletar `schemes`
* Manipular `scheme_points`

---

## 🧩 Módulo Schemes

Responsável pelo **cabeçalho do esquema**.

### Rotas

| Método | Rota                   | Descrição                               |
| ------ | ---------------------- | --------------------------------------- |
| GET    | `/schemes`             | Lista todos com resumo calculado        |
| GET    | `/schemes/:id`         | Cabeçalho do esquema                    |
| GET    | `/schemes/:id/full`    | Esquema + locations + pontos            |
| GET    | `/schemes/:id/summary` | Resumo analítico                        |
| GET    | `/schemes/search`      | Busca por (codigo, direction, tripTime) |
| POST   | `/schemes`             | Criar (auth)                            |
| PUT    | `/schemes/:id`         | Atualizar (auth)                        |
| DELETE | `/schemes/:id`         | Remover (auth)                          |

---

## 🧭 Módulo SchemePoints

Representa a **rota real da viagem**.

Cada ponto possui:

* Local (`location`)
* Ordem
* Distância do ponto anterior
* Tempo de deslocamento
* Tempo no local
* Flags operacionais (descanso, apoio, troca de motorista)
* Campos derivados (offsets, km acumulado, velocidade média)

### Responsabilidades

* CRUD de pontos
* Reordenamento
* Recalcular trechos quando location muda
* Recalcular todo o esquema
* Atualizar campos derivados
* Normalizar funções → flags

---

## 📏 Motor de distâncias — `roadSegments`

Esse é um dos pontos mais avançados do sistema.

### Estratégia

Para cada trecho A → B:

1. Verifica cache em `road_segments`
2. Se válido → usa
3. Se inválido:

   * Tenta ORS (OpenRouteService)
   * Se falhar → fallback Haversine + estimativa de duração
4. Salva no cache
5. Usa **lock distribuído via RPC** para evitar corrida entre instâncias
6. Usa **single-flight** no processo para evitar chamadas duplicadas

### Resultado padronizado

```ts
RoadDistanceResult {
  roadSegmentUuid
  distanceKm
  durationMin
  cached
  source: "db" | "ors" | "fallback"
}
```

---

## ⚙️ Campos derivados dos pontos

Após qualquer alteração relevante:

* `distancia_acumulada_km`
* `velocidade_media_kmh`
* `chegada_offset_min`
* `saida_offset_min`

São recalculados de forma **determinística**.

---

## 📋 Engine de Regras ANTT (`schemePoints.rules.ts`)

Avalia ponto a ponto:

| Regra              | Limite | O que valida      |
| ------------------ | ------ | ----------------- |
| Parada obrigatória | 330 km | Descanso          |
| Ponto de apoio     | 495 km | Alimentação/apoio |
| Troca motorista    | 660 km | Jornada           |

Cada violação gera:

* `violation` estruturado (para UI inteligente)
* `ui_hints` (para destacar ponto no frontend)

Isso permite o frontend **guiar o usuário** para corrigir o esquema.

---

## 📊 Summary do esquema

Gerado dinamicamente:

* Km total
* Paradas
* Pontos de apoio (PA)
* Velocidade média
* Duração total
* Avaliação geral das regras

Usado na Home e dashboards.

---

## 🗄 Dependência do Supabase

Tabelas principais:

* `locations`
* `schemes`
* `scheme_points`
* `road_segments`
* `users`

RPCs usadas:

* `try_lock_road_segment`
* `unlock_road_segment`

---

## ▶️ Rodando local

```bash
npm install
npm run dev
```

Variáveis obrigatórias:

```
SUPABASE_URL=
SUPABASE_KEY=
JWT_SECRET=
ORS_API_KEY=
```

---

## 🚀 Deploy (Railway)

* Porta dinâmica via `PORT`
* Bind em `0.0.0.0`
* CORS configurado
* Stateless (cache no Supabase)

---

## 🧠 Decisões arquiteturais importantes

* O **esquema não guarda lógica** → a lógica está nos pontos
* O resumo é **derivado**, nunca salvo manualmente
* Distância não é confiada ao usuário → sempre recalculada
* Fallback garante funcionamento mesmo sem ORS
* Regras ANTT são **interpretáveis pela UI**
* Backend protege contra inconsistência de dados operacionais

---

## 🎯 Objetivo deste backend

Garantir que um esquema operacional:

* Seja **geograficamente coerente**
* Esteja **dentro das regras ANTT**
* Tenha **dados operacionais confiáveis**
* Seja **visualizável e validável pelo frontend**

---

## 📌 Este projeto demonstra

* Modelagem de domínio real
* Engine de regras complexa
* Cache inteligente geográfico
* Arquitetura limpa
* Integração Supabase avançada
* Tratamento de concorrência distribuída

---

**Autor:** Lucas Luiz Inácio da Silva
**Projeto:** Painel Operacional – Esquemas Rodoviários
