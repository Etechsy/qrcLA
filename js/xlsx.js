// Minimal .xlsx reader and writer (Office Open XML / SpreadsheetML), ported
// from core/src/main/kotlin/.../xlsx. Every cell is handled as text so ticket
// and phone numbers keep their leading zeros.

import { strFromU8, strToU8, unzipSync, zipSync } from '../vendor/fflate.js';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ENTRY_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_ROWS = 100000;
const MAX_COLUMNS = 256;
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export class XlsxError extends Error {
  /** @param {'NOT_XLSX'|'CORRUPT'|'TOO_LARGE'} reason */
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

// ---------------------------------------------------------------- reading

/**
 * @param {Uint8Array} bytes
 * @param {(xml: string) => Document} parseXml defaults to the browser's DOMParser
 * @returns {{name: string, rows: {rowNumber: number, cells: string[]}[], columnWidths: Object<number, number>, rightToLeft: boolean}[]}
 */
export function readXlsx(bytes, parseXml = browserParseXml) {
  if (bytes.length > MAX_FILE_BYTES) throw new XlsxError('TOO_LARGE', 'File too large');
  const parts = unzip(bytes);
  const workbookXml = parts['xl/workbook.xml'];
  if (workbookXml === undefined) throw new XlsxError('NOT_XLSX', 'xl/workbook.xml not found');
  try {
    const doc = (name) => parseXml(guard(parts[name]));
    const workbook = doc('xl/workbook.xml').documentElement;
    const pr = child(workbook, 'workbookPr')?.getAttribute('date1904');
    const date1904 = pr === '1' || pr === 'true';
    const rels = parts['xl/_rels/workbook.xml.rels'] !== undefined
      ? relationships(doc('xl/_rels/workbook.xml.rels').documentElement) : {};
    const shared = parts['xl/sharedStrings.xml'] !== undefined
      ? children(doc('xl/sharedStrings.xml').documentElement, 'si').map(textOf) : [];
    const dateStyles = parts['xl/styles.xml'] !== undefined
      ? dateStyleIndexes(doc('xl/styles.xml').documentElement) : new Set();

    const sheets = children(child(workbook, 'sheets'), 'sheet');
    return sheets.map((sheet, i) => {
      const name = sheet.getAttribute('name') ?? '';
      const rid = sheet.getAttributeNS(NS_REL, 'id') || sheet.getAttribute('r:id') || '';
      const path = resolve(rels[rid] ?? `worksheets/sheet${i + 1}.xml`);
      if (parts[path] === undefined) throw new XlsxError('CORRUPT', `Missing sheet part ${path}`);
      return parseSheet(name, doc(path).documentElement, shared, dateStyles, date1904);
    });
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError('CORRUPT', e?.message ?? 'Corrupt workbook');
  }
}

function unzip(bytes) {
  let files;
  let total = 0;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        const name = f.name.replace(/^\//, '');
        if (name.endsWith('/') || !(name.endsWith('.xml') || name.endsWith('.rels'))) return false;
        total += f.originalSize;
        if (f.originalSize > MAX_ENTRY_BYTES || total > MAX_TOTAL_BYTES) {
          throw new XlsxError('TOO_LARGE', 'Workbook is too large');
        }
        return true;
      },
    });
  } catch (e) {
    if (e instanceof XlsxError) throw e;
    throw new XlsxError('NOT_XLSX', 'Not a zip package');
  }
  const parts = {};
  let actual = 0;
  for (const [name, data] of Object.entries(files)) {
    actual += data.length;
    if (data.length > MAX_ENTRY_BYTES || actual > MAX_TOTAL_BYTES) throw new XlsxError('TOO_LARGE', 'Workbook is too large');
    parts[name.replace(/^\//, '')] = strFromU8(data);
  }
  if (Object.keys(parts).length === 0) throw new XlsxError('NOT_XLSX', 'Not an .xlsx file');
  return parts;
}

/** Workbook parts never need a DOCTYPE; refusing one rules out entity tricks. */
function guard(xml) {
  if (/<!DOCTYPE/i.test(xml)) throw new XlsxError('CORRUPT', 'DOCTYPE not allowed');
  return xml;
}

function browserParseXml(xml) {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  if (d.getElementsByTagName('parsererror').length > 0) throw new XlsxError('CORRUPT', 'Invalid XML');
  return d;
}

function resolve(target) {
  const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const out = [];
  for (const seg of raw.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return out.join('/');
}

function relationships(root) {
  const out = {};
  for (const r of children(root, 'Relationship')) out[r.getAttribute('Id')] = r.getAttribute('Target');
  return out;
}

/** Concatenated text of all <t> nodes, skipping phonetic runs (<rPh>). */
function textOf(element) {
  let s = '';
  const walk = (node) => {
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      const n = local(c);
      if (n === 'rPh') continue;
      if (n === 't') s += c.textContent;
      else walk(c);
    }
  };
  walk(element);
  return s;
}

const BUILT_IN_DATE_FORMATS = new Set([
  ...range(14, 22), ...range(27, 36), ...range(45, 47), ...range(50, 58),
]);

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

function dateStyleIndexes(root) {
  const custom = new Map();
  for (const f of children(child(root, 'numFmts'), 'numFmt')) {
    const id = parseInt(f.getAttribute('numFmtId'), 10);
    if (!Number.isNaN(id)) custom.set(id, f.getAttribute('formatCode') ?? '');
  }
  const out = new Set();
  children(child(root, 'cellXfs'), 'xf').forEach((xf, index) => {
    const id = parseInt(xf.getAttribute('numFmtId') ?? '0', 10) || 0;
    if (BUILT_IN_DATE_FORMATS.has(id) || (custom.has(id) && looksLikeDateFormat(custom.get(id)))) out.add(index);
  });
  return out;
}

function looksLikeDateFormat(code) {
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[(?![hHmMsS]+\])[^\]]*\]/g, '')
    .replace(/\\./g, '');
  return /[dmyhsDMYHS]/.test(stripped);
}

function parseSheet(name, root, shared, dateStyles, date1904) {
  const rightToLeft = children(child(root, 'sheetViews'), 'sheetView').some((v) => {
    const a = v.getAttribute('rightToLeft');
    return a === '1' || a === 'true';
  });

  const columnWidths = {};
  for (const col of children(child(root, 'cols'), 'col')) {
    const min = parseInt(col.getAttribute('min'), 10);
    if (Number.isNaN(min)) continue;
    const maxRaw = parseInt(col.getAttribute('max'), 10);
    const max = Math.min(Number.isNaN(maxRaw) ? min : maxRaw, MAX_COLUMNS);
    const width = parseFloat(col.getAttribute('width'));
    if (Number.isNaN(width)) continue;
    for (let c = min; c <= max; c++) columnWidths[c - 1] = width;
  }

  const rows = [];
  let nextRow = 1;
  for (const row of children(child(root, 'sheetData'), 'row')) {
    const r = parseInt(row.getAttribute('r'), 10);
    const rowNumber = Number.isNaN(r) ? nextRow : r;
    nextRow = rowNumber + 1;
    if (rows.length >= MAX_ROWS) throw new XlsxError('TOO_LARGE', 'Too many rows');
    const cells = [];
    let nextCol = 0;
    for (const c of children(row, 'c')) {
      const ref = c.getAttribute('r') ?? '';
      const col = ref ? columnIndex(ref) : nextCol;
      nextCol = col + 1;
      if (col < 0 || col >= MAX_COLUMNS) continue;
      while (cells.length <= col) cells.push('');
      cells[col] = cellValue(c, shared, dateStyles, date1904);
    }
    rows.push({ rowNumber, cells });
  }
  return { name, rows, columnWidths, rightToLeft };
}

/** "AB12" -> 27 (0-based). */
export function columnIndex(ref) {
  let n = 0;
  for (const c of ref) {
    const u = c.toUpperCase();
    if (u < 'A' || u > 'Z') break;
    n = n * 26 + (u.charCodeAt(0) - 64);
  }
  return n - 1;
}

function cellValue(c, shared, dateStyles, date1904) {
  const type = c.getAttribute('t') ?? '';
  const v = child(c, 'v')?.textContent ?? null;
  switch (type) {
    case 's': {
      const i = parseInt((v ?? '').trim(), 10);
      return Number.isNaN(i) ? '' : (shared[i] ?? '');
    }
    case 'inlineStr': {
      const is = child(c, 'is');
      return is ? textOf(is) : '';
    }
    case 'str':
    case 'e':
      return v ?? '';
    case 'b':
      return (v ?? '').trim() === '1' ? 'TRUE' : 'FALSE';
    default: {
      if (v === null || v.trim() === '') return '';
      const style = parseInt(c.getAttribute('s') ?? '0', 10) || 0;
      if (dateStyles.has(style)) return excelDate(v, date1904) ?? plainNumber(v);
      return plainNumber(v);
    }
  }
}

/** Decimal text without exponent or trailing zeros ("1.50" -> "1.5", "9.8E8" -> "980000000"). */
export function plainNumber(v) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(v.trim());
  if (!m || (m[2] === '' && (m[3] ?? '') === '')) return v;
  const exp = m[4] ? parseInt(m[4], 10) : 0;
  if (Math.abs(exp) > 400) return v;
  let digits = m[2] + (m[3] ?? '');
  let point = m[2].length + exp;
  while (digits.length > 0 && digits[0] === '0') {
    digits = digits.slice(1);
    point--;
  }
  digits = digits.replace(/0+$/, '');
  if (digits === '') return '0';
  const sign = m[1] === '-' ? '-' : '';
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

export function excelDate(v, date1904) {
  const serial = Number(v.trim());
  if (v.trim() === '' || !Number.isFinite(serial) || serial < 0 || serial > 2958465) return null;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const days = Math.floor(serial);
  const seconds = Math.round((serial - days) * 86400);
  const d = new Date(base + days * 86400000 + seconds * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const date = `${String(d.getUTCFullYear()).padStart(4, '0')}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  if (seconds === 0) return date;
  const hm = `${date} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  return seconds % 60 === 0 ? hm : `${hm}:${p(d.getUTCSeconds())}`;
}

function local(node) {
  return node.localName ?? node.nodeName.split(':').pop();
}

function children(el, name) {
  if (!el) return [];
  const out = [];
  for (const n of el.childNodes) if (n.nodeType === 1 && local(n) === name) out.push(n);
  return out;
}

function child(el, name) {
  return children(el, name)[0] ?? null;
}

// ---------------------------------------------------------------- writing

const MAX_CELL_CHARS = 32767;
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

/**
 * @param {{name: string, rows: string[][], columnWidths?: (number|null)[], rightToLeft?: boolean}[]} sheets
 *   The first row of each sheet is the header row and is written in bold.
 * @returns {Uint8Array}
 */
export function writeXlsx(sheets, now = new Date()) {
  if (sheets.length === 0) throw new Error('At least one sheet is required');
  const names = uniqueSheetNames(sheets.map((s) => s.name));
  const strings = new SharedStrings();
  const sheetXml = sheets.map((s) => worksheet(s, strings));

  const files = {
    '[Content_Types].xml': contentTypes(sheets.length),
    '_rels/.rels': ROOT_RELS,
    'docProps/app.xml': appProps(names),
    'docProps/core.xml': coreProps(now),
    'xl/workbook.xml': workbook(names),
    'xl/_rels/workbook.xml.rels': workbookRels(sheets.length),
    'xl/styles.xml': STYLES,
    'xl/sharedStrings.xml': strings.xml(),
  };
  sheetXml.forEach((xml, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = xml; });
  const zipped = {};
  for (const [path, content] of Object.entries(files)) zipped[path] = [strToU8(content), { level: 6 }];
  return zipSync(zipped);
}

function worksheet(sheet, strings) {
  const rows = sheet.rows;
  let s = XML_HEADER + `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">`;
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  if (maxCols > 0 && rows.length > 0) s += `<dimension ref="A1:${columnName(maxCols - 1)}${rows.length}"/>`;
  s += '<sheetViews><sheetView workbookViewId="0"' + (sheet.rightToLeft ? ' rightToLeft="1"' : '') + '/></sheetViews>';
  s += '<sheetFormatPr defaultRowHeight="15"/>';
  const widths = (sheet.columnWidths ?? []).map((w, i) => [i, w]).filter(([, w]) => w != null && w > 0);
  if (widths.length > 0) {
    s += '<cols>';
    for (const [i, w] of widths) s += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    s += '</cols>';
  }
  const out = [s, '<sheetData>'];
  rows.forEach((row, r) => {
    const rowNum = r + 1;
    let line = `<row r="${rowNum}">`;
    row.forEach((value, c) => {
      const style = r === 0 ? ' s="1"' : '';
      line += `<c r="${columnName(c)}${rowNum}"${style} t="s"><v>${strings.index(value)}</v></c>`;
    });
    out.push(line + '</row>');
  });
  out.push('</sheetData>');
  out.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
  out.push('</worksheet>');
  return out.join('');
}

class SharedStrings {
  constructor() {
    this.map = new Map();
    this.count = 0;
  }

  index(value) {
    this.count++;
    const v = clean(String(value ?? ''));
    if (!this.map.has(v)) this.map.set(v, this.map.size);
    return this.map.get(v);
  }

  xml() {
    const out = [XML_HEADER + `<sst xmlns="${NS_MAIN}" count="${this.count}" uniqueCount="${this.map.size}">`];
    for (const s of this.map.keys()) {
      const preserve = s.length > 0 && (/^\s|\s$/.test(s) || s.includes('\n'));
      out.push((preserve ? '<si><t xml:space="preserve">' : '<si><t>') + escapeXml(s) + '</t></si>');
    }
    out.push('</sst>');
    return out.join('');
  }
}

function clean(value) {
  const v = value.length > MAX_CELL_CHARS ? value.slice(0, MAX_CELL_CHARS) : value;
  let out = '';
  for (let i = 0; i < v.length; i++) if (isXmlChar(v.charCodeAt(i))) out += v[i];
  return out;
}

function isXmlChar(code) {
  return code === 0x9 || code === 0xa || code === 0xd || (code >= 0x20 && code <= 0xfffd);
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function columnName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function uniqueSheetNames(names) {
  const used = new Set();
  return names.map((raw) => {
    let base = '';
    for (const c of String(raw)) if (!'[]:*?/\\'.includes(c) && isXmlChar(c.charCodeAt(0))) base += c;
    base = base.trim() || 'Sheet';
    base = base.slice(0, 31);
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLowerCase())) {
      const suffix = ` (${n})`;
      candidate = base.slice(0, 31 - suffix.length) + suffix;
      n++;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

function contentTypes(sheetCount) {
  let s = XML_HEADER + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
  s += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>';
  s += '<Default Extension="xml" ContentType="application/xml"/>';
  s += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
  for (let i = 1; i <= sheetCount; i++) {
    s += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  s += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
  s += '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>';
  s += '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>';
  s += '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
  return s + '</Types>';
}

function workbook(names) {
  let s = XML_HEADER + `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><bookViews><workbookView/></bookViews><sheets>`;
  names.forEach((n, i) => { s += `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`; });
  return s + '</sheets></workbook>';
}

function workbookRels(sheetCount) {
  let s = XML_HEADER + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  for (let i = 1; i <= sheetCount; i++) {
    s += `<Relationship Id="rId${i}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`;
  }
  s += `<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`;
  s += `<Relationship Id="rId${sheetCount + 2}" Type="${NS_REL}/sharedStrings" Target="sharedStrings.xml"/>`;
  return s + '</Relationships>';
}

function appProps(names) {
  let s = XML_HEADER + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ';
  s += 'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">';
  s += '<Application>Lafeef Check-in</Application>';
  s += '<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>';
  s += `<vt:variant><vt:i4>${names.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`;
  s += `<TitlesOfParts><vt:vector size="${names.length}" baseType="lpstr">`;
  for (const n of names) s += `<vt:lpstr>${escapeXml(n)}</vt:lpstr>`;
  return s + '</vt:vector></TitlesOfParts></Properties>';
}

function coreProps(now) {
  const ts = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  return XML_HEADER +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:creator>Lafeef Check-in</dc:creator>' +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${ts}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${ts}</dcterms:modified>` +
    '</cp:coreProperties>';
}

const ROOT_RELS = XML_HEADER +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

// Style 0: text. Style 1: bold header. numFmt 49 ("@") keeps values as text.
const STYLES = XML_HEADER +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';
