// src/modules/schemeImports/schemeImports.parser.csv.ts

import Papa from "papaparse";

export type CsvRow = Record<string, string>;

export async function parseCsvFile(fileBuffer: Buffer): Promise<CsvRow[]> {
  const csvText = fileBuffer.toString("utf-8");

  const result = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0) {
    console.error("[parseCsvFile] erros:", result.errors);
    throw new Error("Erro ao processar CSV");
  }

  return result.data;
}
