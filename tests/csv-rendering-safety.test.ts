import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseKpiCsvContent } from "../src/utils/csv-ingest.js";

const header = "01 Año,02 Mes,04 Id Cargo,03 Orden,05 Puesto,06 Id,07 Valor,08 KPI,09 Resultado,10 Objetivo,11 Valor Real,12 Calificacion,13 Tendencia,14 Parametros,15 Suma Valor,16 Suma Calificacion,17 Calificacion General";
const rootDir = path.resolve(process.cwd(), "..");

describe("render seguro de contenido CSV", () => {
  it("conserva <BR> y <script> como texto del CSV", () => {
    const csv = `${header}
2026,1,201,1,JEFATURA DE CONTABILIDAD,20101,10,"KPI <script>alert(1)</script>","NA ","--","--",0,0,"Linea 1<br />Linea 2<script>alert(2)</script>",95,75,78.9 %`;
    const [row] = parseKpiCsvContent(csv);

    expect(row.kpiNombre).toContain("<script>alert(1)</script>");
    expect(row.parametrosRaw).toContain("<br />");
    expect(row.parametrosRaw).toContain("<script>alert(2)</script>");
  });

  it("frontend usa SafeMultilineText y no dangerouslySetInnerHTML", () => {
    const frontendSrc = path.join(rootDir, "frontend", "src");
    const files = fs.readdirSync(frontendSrc, { recursive: true })
      .filter((file) => String(file).endsWith(".jsx") || String(file).endsWith(".js"));
    const contents = files.map((file) => fs.readFileSync(path.join(frontendSrc, String(file)), "utf8")).join("\n");

    expect(contents).not.toContain("dangerouslySetInnerHTML");
    expect(contents).toContain("split(/<br\\s*\\/?>/gi)");
    expect(contents).toContain("SafeMultilineText");
  });
});
