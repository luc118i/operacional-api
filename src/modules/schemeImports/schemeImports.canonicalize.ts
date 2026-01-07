// src/modules/schemeImports/schemeImports.canonicalize.ts

import { CsvRow } from "./schemeImports.parser.csv";
import { SchemeImportBatch, SchemeImportDraft } from "./schemeImports.types";

/**
 * Canonicalização (modelo aprovado)
 * - Bloco lógico = (Codigo Linha + Sentido)
 * - Hora Partida NÃO abre novo bloco; apenas agrega horários (schemes-irmãos)
 * - Pontos entram no bloco atual
 * - Ao final: para cada horário do grupo, gera 1 SchemeImportDraft com os MESMOS points
 * - Grupo sem pontos: não gera schemes; registra erro NO_POINTS_FOR_GROUP (fora do batch, p/ debug)
 */

type PointDraft = {
  sequencia: number;
  descricaoRaw: string;
  paradaMin: number;
};

type Group = {
  codigoLinha: string;
  sentido: string;

  nomeLinha: string;
  operatingDaysMask: number;

  horarios: Set<string>;
  points: PointDraft[];

  // Dedup simples por "sequencia|descricao"
  pointKeySet: Set<string>;
};

type CanonicalizeError = {
  code: "NO_POINTS_FOR_GROUP";
  codigoLinha: string;
  sentido: string;
  horarios: string[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function value(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function normalizeSentido(s: string) {
  return (s ?? "").trim().toLowerCase(); // "ida"/"volta"
}

function normalizeHora(h: string) {
  return (h ?? "").trim(); // "10:00"
}

function parseParadaMin(v?: string | null) {
  // Ex.: "00:10" => 10
  if (!v) return 0;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

/**
 * Ex: "1- RODOVIARIA DE BRASILIA"
 */
function parseSequenciaDescricao(
  input: string
): { sequencia: number; descricao: string } | null {
  const match = input.match(/^(\d+)\s*-\s*(.+)$/);
  if (!match) return null;

  return {
    sequencia: Number(match[1]),
    descricao: match[2].trim(),
  };
}

function buildExternalKeyFromParts(params: {
  codigoLinha: string;
  sentido: string;
  horaPartida: string;
}): string {
  return [
    `COD=${params.codigoLinha}`,
    `SENTIDO=${params.sentido}`,
    `HORA=${params.horaPartida}`,
  ].join("|");
}

function groupKey(codigoLinha: string, sentido: string) {
  return `${codigoLinha}||${normalizeSentido(sentido)}`;
}

/**
 * Gera máscara semanal a partir das colunas Dom..Sáb
 */
function parseOperatingDaysMask(row: CsvRow): number {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  let mask = 0;

  days.forEach((day, index) => {
    const raw = value(row[day]);
    if (raw) mask |= 1 << index;
  });

  return mask;
}

function getFirst(row: CsvRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = value((row as any)[k]);
    if (v) return v;
  }
  return null;
}

// Normaliza título de coluna: remove acentos e baixa
function normKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

// Resolve dinamicamente uma coluna pelo "nome normalizado"
function getByNormalizedKey(row: CsvRow, wanted: string[]): string | null {
  const entries = Object.entries(row as any);
  const wantedSet = new Set(wanted.map(normKey));

  for (const [k, v] of entries) {
    if (wantedSet.has(normKey(k))) {
      const vv = value(v);
      if (vv) return vv;
    }
  }
  return null;
}

function isHeaderRow(row: CsvRow): boolean {
  const codigo = getByNormalizedKey(row, ["Codigo Linha", "Código Linha"]);
  const sentido = getByNormalizedKey(row, ["Sentido"]);
  const hora = getByNormalizedKey(row, ["Hora Partida", "Horário Partida"]);

  return (
    (codigo ?? "").toLowerCase() === "codigo linha" ||
    (codigo ?? "").toLowerCase() === "código linha" ||
    (sentido ?? "").toLowerCase() === "sentido" ||
    (hora ?? "").toLowerCase().includes("hora")
  );
}

// Heurística: se tiver "Sequencia" ou algo em "Local"/"Nome PCs cadastrado", é ponto
function isPointRow(row: CsvRow) {
  const raw = value(row["Sequencia - Nome PCs cadastrado"]);
  return Boolean(raw);
}

function parsePointFromRow(row: CsvRow): PointDraft {
  const raw = value(row["Sequencia - Nome PCs cadastrado"]) ?? "";

  const parsed = parseSequenciaDescricao(raw);
  if (!parsed) {
    return {
      sequencia: 0,
      descricaoRaw: raw,
      paradaMin: parseParadaMin(value(row["Parada"])),
    };
  }

  return {
    sequencia: parsed.sequencia,
    descricaoRaw: parsed.descricao,
    paradaMin: parseParadaMin(value(row["Parada"])),
  };
}

/* ------------------------------------------------------------------ */
/* Canonicalize                                                        */
/* ------------------------------------------------------------------ */

export function canonicalizeImport(rows: CsvRow[]): SchemeImportBatch {
  const groups = new Map<string, Group>();
  const errors: CanonicalizeError[] = [];

  let currentGroupKey: string | null = null;
  let currentGroup: Group | undefined = undefined;

  let lastCodigoLinha: string | null = null;
  let lastSentido: string | null = null;

  function ensureGroup(codigoLinha: string, sentido: string): Group {
    const key = groupKey(codigoLinha, sentido);
    const existing = groups.get(key);
    if (existing) return existing;

    const g: Group = {
      codigoLinha,
      sentido,
      nomeLinha: "",
      operatingDaysMask: 0,
      horarios: new Set<string>(),
      points: [],
      pointKeySet: new Set<string>(),
    };

    groups.set(key, g);
    return g;
  }

  function switchGroupIfNeeded(codigoLinha: string, sentido: string): Group {
    const key = groupKey(codigoLinha, sentido);
    if (currentGroupKey !== key) {
      currentGroupKey = key;
      currentGroup = ensureGroup(codigoLinha, sentido);
    }

    lastCodigoLinha = codigoLinha;
    lastSentido = sentido;
    // aqui, por contrato, currentGroup existe
    return currentGroup!;
  }

  function maybeAddHeaderData(
    g: Group,
    row: CsvRow,
    horaPartida: string | null
  ) {
    const nomeLinha =
      value(row["Nome da Linha"]) ?? value(row["Nome da Linha "]) ?? "";

    if (nomeLinha && !g.nomeLinha) g.nomeLinha = nomeLinha;

    const mask = parseOperatingDaysMask(row);
    if (mask && !g.operatingDaysMask) g.operatingDaysMask = mask;

    if (horaPartida) g.horarios.add(normalizeHora(horaPartida));
  }

  function maybeAddPoint(g: Group, row: CsvRow) {
    if (!isPointRow(row)) return;

    const p = parsePointFromRow(row);

    // Proteções mínimas:
    if (!p.descricaoRaw) return;

    // Se você quiser exigir sequencia > 0, descomente:
    // if (!p.sequencia) return;

    const pkey = `${p.sequencia}|${p.descricaoRaw}`;
    if (g.pointKeySet.has(pkey)) return;

    g.pointKeySet.add(pkey);
    g.points.push(p);
  }

  for (const row of rows) {
    if (isHeaderRow(row)) continue;

    const codigoLinha = value(row["Codigo Linha"]);
    const sentido = value(row["Sentido"]);
    const horaPartida = value(row["Hora Partida"]);

    /**
     * Identificação de grupo:
     * - caso típico: (codigoLinha && sentido) abre/troca grupo
     * - caso real de planilha: codigoLinha vem, mas sentido pode estar vazio -> herda do grupo atual
     */
    if (codigoLinha) {
      // ✅ se o CSV não repetir "Sentido" nas linhas de horário-irmão, herda do último bloco
      const effectiveSentido = sentido ?? lastSentido;

      if (!effectiveSentido) {
        // não dá para formar groupKey sem sentido
        continue;
      }

      const g = switchGroupIfNeeded(codigoLinha, effectiveSentido);
      maybeAddHeaderData(g, row, horaPartida);
      continue;
    }

    /**
     * Linha sem codigoLinha:
     * - se for ponto, entra no grupo atual
     * - se tiver horaPartida e você quiser suportar horários “soltos”, poderia agregar aqui
     */
    if (currentGroup) {
      // opcional (descomente se seu CSV trouxer hora sem código):
      // if (horaPartida) currentGroup.horarios.add(normalizeHora(horaPartida));

      maybeAddPoint(currentGroup, row);
    }
  }

  // Materializa schemes-irmãos
  const schemes: SchemeImportDraft[] = [];

  for (const g of groups.values()) {
    const pointsSorted = [...g.points].sort(
      (a, b) => a.sequencia - b.sequencia
    );

    if (pointsSorted.length === 0) {
      errors.push({
        code: "NO_POINTS_FOR_GROUP",
        codigoLinha: g.codigoLinha,
        sentido: g.sentido,
        horarios: [...g.horarios].sort(),
      });
      continue;
    }

    const horarios = [...g.horarios].map(normalizeHora).filter(Boolean).sort();
    if (horarios.length === 0) {
      // Sem horário => não cria schemes (conforme modelo). Se quiser, registre erro aqui também.
      continue;
    }

    for (const hora of horarios) {
      schemes.push({
        externalKey: buildExternalKeyFromParts({
          codigoLinha: g.codigoLinha,
          sentido: g.sentido,
          horaPartida: hora,
        }),
        codigoLinha: g.codigoLinha,
        nomeLinha: g.nomeLinha,
        sentido: g.sentido,
        horaPartida: hora,
        operatingDaysMask: g.operatingDaysMask,
        points: pointsSorted,
      });
    }
  }

  /**
   * Debug opcional:
   * - Se você quiser enxergar isso no DRY-RUN, logue no handler do endpoint.
   * - Mantive fora do return para não quebrar type de SchemeImportBatch.
   */
  // console.debug({ canonicalizeErrors: errors });

  return {
    schemes,
    meta: {
      totalRows: rows.length,
      totalSchemes: schemes.length,
    },
  };
}
