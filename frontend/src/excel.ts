import { strToU8, zipSync } from "fflate";

// Genera un .xlsx mínimo (una hoja) sin librerías pesadas: el formato es un
// zip de archivos XML. Los textos van como "inlineStr" para no necesitar la
// tabla de cadenas compartidas.

export type Celda = string | number | null;

// Índices de cellXfs en styles.xml.
const NORMAL = 0;
const NEGRITA = 1;
const MONTO = 2;
const MONTO_NEGRITA = 3;

const escapar = (texto: string) =>
  texto.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);

const columna = (i: number) => {
  let nombre = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) nombre = String.fromCharCode(65 + ((n - 1) % 26)) + nombre;
  return nombre;
};

function celda(valor: Celda, ref: string, negrita: boolean): string {
  if (valor === null || valor === "") return "";
  if (typeof valor === "number") return `<c r="${ref}" s="${negrita ? MONTO_NEGRITA : MONTO}"><v>${valor}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${negrita ? NEGRITA : NORMAL}"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`;
}

export function crearExcel(hoja: string, encabezado: string[], filas: Celda[][], pie: Celda[], anchos: number[]): Blob {
  const todas = [encabezado, ...filas, [], pie];
  const xmlFilas = todas
    .map((fila, f) => {
      const negrita = f === 0 || f === todas.length - 1;
      const celdas = fila.map((v, c) => celda(v, `${columna(c)}${f + 1}`, negrita)).join("");
      return `<row r="${f + 1}">${celdas}</row>`;
    })
    .join("");
  const cols = anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${xmlFilas}</sheetData></worksheet>`;

  // numFmtId 4 es el formato integrado "#,##0.00": Excel lo muestra con los
  // separadores del idioma del equipo (1.234,56 en español).
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/><xf numFmtId="4" xfId="0" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const archivos = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(hoja)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet,
    "xl/styles.xml": styles,
  };

  const zip = zipSync(Object.fromEntries(Object.entries(archivos).map(([nombre, xml]) => [nombre, strToU8(xml)])));
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function descargar(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
