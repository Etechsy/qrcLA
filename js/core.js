// Attendance rules with no DOM or storage, so they run in the browser and in
// Node tests alike. Ported from core/ (Kotlin) and backend/functions/src
// (TypeScript) and checked against the same shared/ fixtures.

export const MAX_RAW_INPUT = 2048;
export const MAX_ROWS = 20000;
export const MAX_TICKET_LENGTH = 256;
export const DEFAULT_ZONE = 'Asia/Damascus';
export const IMPORT_METHOD = 'IMPORT';

const MAX_CANDIDATES = 8;
const MAX_CANDIDATE_LENGTH = 256;
const ch = (code) => String.fromCharCode(code);

export const ELLIPSIS = ch(0x2026);

// ---------------------------------------------------------------- tickets

function isEdgeJunk(c) {
  const code = c.charCodeAt(0);
  return /\s/.test(c) || code === 0xa0 || (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 || code === 0x2029 || code === 0xfeff;
}

/** Removes surrounding whitespace and invisible marks only. */
export function normalizeTicket(value) {
  let start = 0;
  let end = value.length;
  while (start < end && isEdgeJunk(value[start])) start++;
  while (end > start && isEdgeJunk(value[end - 1])) end--;
  return value.slice(start, end);
}

const TICKET_PATTERN = /[A-Za-z]{2,10}-\d{6,8}-[A-Za-z0-9]{4,16}/g;
const URL_TICKET_PARAMS = ['ticket', 'ticketNumber', 'ticket_number', 'ticketId', 'ticket_id', 'code', 't'];

/**
 * Values that may be the ticket number, in priority order. The exact payload
 * comes first; the others only apply when a QR code wraps the ticket number
 * in a URL or longer text.
 */
export function ticketCandidates(raw) {
  const exact = normalizeTicket(raw);
  if (!exact) return [];
  const out = [exact];
  const add = (v) => {
    if (!v) return;
    const n = normalizeTicket(v);
    if (n && n.length <= MAX_CANDIDATE_LENGTH && !out.includes(n)) out.push(n);
  };
  if (/^https?:\/\//i.test(exact)) {
    try {
      const url = new URL(exact);
      for (const key of URL_TICKET_PARAMS) add(url.searchParams.get(key));
      const segments = url.pathname.split('/').filter((s) => s.length > 0);
      if (segments.length > 0) add(decodeURIComponent(segments[segments.length - 1]));
    } catch {
      // Not a parseable URL; the pattern search below still applies.
    }
  }
  for (const m of exact.matchAll(TICKET_PATTERN)) add(m[0]);
  return out.slice(0, MAX_CANDIDATES);
}

/** Short form for lists: the full value when short, otherwise head…tail. */
export function displayTicket(ticket, maxLength = 24) {
  const t = normalizeTicket(ticket);
  if (t.length <= maxLength) return t;
  return t.slice(0, 10) + ELLIPSIS + t.slice(-8);
}

// ---------------------------------------------------------------- workbook columns

export const COL = {
  SHEET: 'Attendance',
  NAME: 'الاسم',
  EMAIL: 'البريد الإلكتروني',
  PHONE: 'رقم الهاتف',
  TICKET: 'رقم التذكرة',
  BOOKING_DATE: 'تاريخ الحجز',
  STATUS: 'الحالة',
  ATTENDANCE: 'تاريخ الحضور',
};
export const REQUIRED_COLUMNS = [COL.NAME, COL.EMAIL, COL.PHONE, COL.TICKET, COL.BOOKING_DATE, COL.STATUS, COL.ATTENDANCE];

function isInvisible(code) {
  return code === 0x0640 || (code >= 0x200b && code <= 0x200f) || code === 0xfeff;
}

/** Ignores surrounding/repeated spaces, tatweel and invisible marks. */
export function normalizeHeader(h) {
  let s = '';
  for (const c of String(h).normalize('NFC')) if (!isInvisible(c.charCodeAt(0))) s += c;
  return s.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- import validation

export const Issue = {
  NOT_XLSX: 'NOT_XLSX',
  CORRUPT_FILE: 'CORRUPT_FILE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  USED_OTHER_SHEET: 'USED_OTHER_SHEET',
  EMPTY_SHEET: 'EMPTY_SHEET',
  MISSING_COLUMN: 'MISSING_COLUMN',
  DUPLICATE_COLUMN: 'DUPLICATE_COLUMN',
  MISSING_TICKET: 'MISSING_TICKET',
  DUPLICATE_TICKET: 'DUPLICATE_TICKET',
  TICKET_TOO_LONG: 'TICKET_TOO_LONG',
  NO_PARTICIPANTS: 'NO_PARTICIPANTS',
  TOO_MANY_ROWS: 'TOO_MANY_ROWS',
  MISSING_NAME: 'MISSING_NAME',
  HAS_ATTENDANCE: 'HAS_ATTENDANCE',
};

const issue = (code, severity, rows = [], value = null) => ({ code, severity, rows, value });

export function failedPreview(fileName, code) {
  return {
    fileName, sheetName: '', headers: [], columnWidths: [], rightToLeft: false, rows: [],
    issues: [issue(code, 'ERROR')],
  };
}

export const isValid = (preview) => preview.issues.every((i) => i.severity !== 'ERROR');
export const errorsOf = (preview) => preview.issues.filter((i) => i.severity === 'ERROR');
export const warningsOf = (preview) => preview.issues.filter((i) => i.severity === 'WARNING');

function colIndex(headers, name) {
  return headers.findIndex((h) => normalizeHeader(h) === name);
}

export const ticketOf = (preview, row) => row.cells[colIndex(preview.headers, COL.TICKET)] ?? '';
export const nameOf = (preview, row) => row.cells[colIndex(preview.headers, COL.NAME)] ?? '';

function missingColumns(headers) {
  const present = new Set(headers.map(normalizeHeader));
  return REQUIRED_COLUMNS.filter((c) => !present.has(c)).map((c) => issue(Issue.MISSING_COLUMN, 'ERROR', [], c));
}

function firstNonBlankRow(sheet) {
  return sheet.rows.find((r) => r.cells.some((c) => c.trim() !== ''));
}

/**
 * Validates the sheets read from a workbook. Every cell stays text exactly as
 * read, so ticket and phone numbers keep their leading zeros.
 */
export function previewFromSheets(sheets, fileName) {
  if (sheets.length === 0) return failedPreview(fileName, Issue.SHEET_NOT_FOUND);
  const issues = [];

  const named = sheets.find((s) => s.name.trim().toLowerCase() === COL.SHEET.toLowerCase());
  let sheet = named;
  if (!sheet) {
    sheet = sheets.find((s) => {
      const header = firstNonBlankRow(s);
      return header && missingColumns(header.cells).length === 0;
    });
    if (sheet) issues.push(issue(Issue.USED_OTHER_SHEET, 'WARNING', [], sheet.name));
  }
  if (!sheet) {
    issues.push(issue(Issue.SHEET_NOT_FOUND, 'ERROR', [], COL.SHEET));
    const header = sheets[0].rows[0];
    if (header) issues.push(...missingColumns(header.cells));
    return { fileName, sheetName: sheets[0].name, headers: [], columnWidths: [], rightToLeft: false, rows: [], issues };
  }

  const headerRow = firstNonBlankRow(sheet);
  if (!headerRow) {
    issues.push(issue(Issue.EMPTY_SHEET, 'ERROR', [], sheet.name));
    return { fileName, sheetName: sheet.name, headers: [], columnWidths: [], rightToLeft: sheet.rightToLeft, rows: [], issues };
  }
  const headers = [...headerRow.cells];
  while (headers.length > 0 && headers[headers.length - 1].trim() === '') headers.pop();
  const widths = headers.map((_, i) => sheet.columnWidths[i] ?? null);
  const base = { fileName, sheetName: sheet.name, headers, columnWidths: widths, rightToLeft: sheet.rightToLeft };

  issues.push(...missingColumns(headers));
  const normalized = headers.map(normalizeHeader);
  for (const required of REQUIRED_COLUMNS) {
    if (normalized.filter((h) => h === required).length > 1) {
      issues.push(issue(Issue.DUPLICATE_COLUMN, 'ERROR', [], required));
    }
  }
  if (issues.some((i) => i.severity === 'ERROR')) return { ...base, rows: [], issues };

  const ticketCol = normalized.indexOf(COL.TICKET);
  const nameCol = normalized.indexOf(COL.NAME);
  const attendanceCol = normalized.indexOf(COL.ATTENDANCE);

  const rows = sheet.rows
    .filter((r) => r.rowNumber > headerRow.rowNumber)
    .map((r) => ({ rowNumber: r.rowNumber, cells: headers.map((_, i) => r.cells[i] ?? '') }))
    .filter((r) => r.cells.some((c) => c.trim() !== ''));

  if (rows.length > MAX_ROWS) {
    issues.push(issue(Issue.TOO_MANY_ROWS, 'ERROR', [], String(MAX_ROWS)));
    return { ...base, rows: [], issues };
  }

  const missingTicket = [];
  const tooLong = [];
  const missingName = [];
  const hasAttendance = [];
  const byTicket = new Map();
  for (const r of rows) {
    const ticket = normalizeTicket(r.cells[ticketCol]);
    if (!ticket) missingTicket.push(r.rowNumber);
    else if (ticket.length > MAX_TICKET_LENGTH) tooLong.push(r.rowNumber);
    else {
      if (!byTicket.has(ticket)) byTicket.set(ticket, []);
      byTicket.get(ticket).push(r.rowNumber);
    }
    if (r.cells[nameCol].trim() === '') missingName.push(r.rowNumber);
    if (r.cells[attendanceCol].trim() !== '') hasAttendance.push(r.rowNumber);
  }
  if (missingTicket.length) issues.push(issue(Issue.MISSING_TICKET, 'ERROR', missingTicket));
  if (tooLong.length) issues.push(issue(Issue.TICKET_TOO_LONG, 'ERROR', tooLong));
  for (const [ticket, rowNumbers] of byTicket) {
    if (rowNumbers.length > 1) issues.push(issue(Issue.DUPLICATE_TICKET, 'ERROR', rowNumbers, ticket));
  }
  if (rows.length === 0) issues.push(issue(Issue.NO_PARTICIPANTS, 'ERROR'));
  if (missingName.length) issues.push(issue(Issue.MISSING_NAME, 'WARNING', missingName));
  if (hasAttendance.length) issues.push(issue(Issue.HAS_ATTENDANCE, 'WARNING', hasAttendance));

  return { ...base, rows, issues };
}

// ---------------------------------------------------------------- import plan

/**
 * Works out the list to store. A confirmed check-in is never discarded: it is
 * carried over to the matching new row, and a replacement that would drop a
 * checked-in ticket is refused. Records are keyed by the normalized ticket.
 */
export function planImport(preview, existing, replace) {
  if (existing.length > 0 && !replace) return { kind: 'CONFIRM_REPLACE', existingCount: existing.length };

  const attendanceCol = colIndex(preview.headers, COL.ATTENDANCE);
  const incoming = new Map();
  for (const row of preview.rows) incoming.set(normalizeTicket(ticketOf(preview, row)), row);

  const missing = existing.filter((r) => r.checkedIn && !incoming.has(r.key)).map((r) => r.ticketNumber);
  if (missing.length > 0) return { kind: 'CHECKED_IN_MISSING', tickets: missing };

  const priorByKey = new Map(existing.map((r) => [r.key, r]));
  let preCheckedIn = 0;
  let carriedOver = 0;
  const records = [];
  for (const [key, row] of incoming) {
    const prior = priorByKey.get(key);
    const attendanceText = attendanceCol >= 0 ? (row.cells[attendanceCol] ?? '').trim() : '';
    let state = { checkedIn: false, checkedInAt: null, checkedInAtText: null, checkedInMethod: null };
    if (prior && prior.checkedIn && prior.checkedInMethod !== IMPORT_METHOD) {
      carriedOver++;
      state = {
        checkedIn: true,
        checkedInAt: prior.checkedInAt,
        checkedInAtText: prior.checkedInAtText,
        checkedInMethod: prior.checkedInMethod,
      };
    } else if (attendanceText) {
      // The workbook already records attendance for this person.
      preCheckedIn++;
      state = { checkedIn: true, checkedInAt: null, checkedInAtText: attendanceText, checkedInMethod: IMPORT_METHOD };
    }
    records.push({
      key,
      ticketNumber: ticketOf(preview, row),
      name: nameOf(preview, row),
      rowNumber: row.rowNumber,
      cells: row.cells,
      ...state,
    });
  }
  return {
    kind: 'REPLACE',
    records,
    counts: {
      count: records.length,
      preCheckedIn,
      carriedOver,
      removed: existing.filter((r) => !incoming.has(r.key)).length,
    },
  };
}

// ---------------------------------------------------------------- check-in decision

/**
 * Picks the participant a scan refers to from the records found for its
 * candidates. Several different matches are never guessed.
 */
export function matchParticipant(found) {
  const unique = [...new Map(found.filter(Boolean).map((r) => [r.key, r])).values()];
  if (unique.length === 0) return { kind: 'NOT_FOUND' };
  if (unique.length > 1) return { kind: 'AMBIGUOUS' };
  return { kind: 'MATCH', record: unique[0] };
}

// ---------------------------------------------------------------- time

export function isValidTimeZone(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** "yyyy-MM-dd HH:mm:ss" in the event's time zone (same as the backend). */
export function formatInZone(epochMillis, timeZone) {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMillis));
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export const formatTime = (epochMillis, timeZone) => formatInZone(epochMillis, timeZone).slice(11);

// ---------------------------------------------------------------- export

export const SCAN_LOG_SHEET = 'Scan Log';
export const SCAN_LOG_HEADERS = [
  'الوقت / Time',
  'النتيجة / Result',
  'المُدخل / Input',
  'رقم التذكرة / Ticket',
  'الاسم / Name',
  'الموظف / Staff',
  'الجهاز / Device',
  'الطريقة / Method',
];
export const SCAN_LOG_WIDTHS = [20, 12, 30, 26, 22, 28, 20, 10];
export const LOCAL_STAFF = 'local';

/** The original rows, in workbook order, with تاريخ الحضور filled from check-ins. */
export function exportRows(headers, records, timeZone) {
  const attendanceCol = colIndex(headers, COL.ATTENDANCE);
  let checkedInCount = 0;
  const rows = [...records].sort((a, b) => a.rowNumber - b.rowNumber).map((r) => {
    const cells = [...r.cells];
    while (cells.length < headers.length) cells.push('');
    if (r.checkedIn) checkedInCount++;
    if (attendanceCol >= 0) {
      if (r.checkedInAt != null) cells[attendanceCol] = formatInZone(r.checkedInAt, timeZone);
      else if (r.checkedInAtText && r.checkedInAtText.trim() !== '') cells[attendanceCol] = r.checkedInAtText;
    }
    return cells;
  });
  return { rows, checkedInCount };
}

export function scanLogRows(logs, timeZone) {
  return [...logs].sort((a, b) => a.at - b.at || a.id - b.id).map((l) => [
    formatInZone(l.at, timeZone),
    l.result,
    l.input,
    l.ticketNumber ?? '',
    l.participantName ?? '',
    LOCAL_STAFF,
    l.deviceId ?? '',
    l.method,
  ]);
}

/** e.g. attendance_<event>_202610241930.xlsx */
export function exportFileName(eventName, now = new Date()) {
  const safe = eventName.trim().replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60).replace(/^_+|_+$/g, '');
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}`;
  return safe ? `attendance_${safe}_${stamp}.xlsx` : `attendance_${stamp}.xlsx`;
}

// ---------------------------------------------------------------- search

const LETTER_MAP = new Map([
  [0x0622, 0x0627], [0x0623, 0x0627], [0x0625, 0x0627], [0x0671, 0x0627],
  [0x0649, 0x064a], [0x0626, 0x064a], [0x0629, 0x0647], [0x0624, 0x0648],
]);

function isSearchIgnorable(code) {
  return (code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640 ||
    (code >= 0x200b && code <= 0x200f) || code === 0xfeff;
}

/**
 * Search-box normalization only (never used for ticket matching): case and
 * diacritics ignored, common Arabic letter variants treated as equal.
 */
export function searchNormalize(text) {
  let out = '';
  let lastSpace = true;
  for (const c of String(text).normalize('NFC').toLowerCase()) {
    const code = c.charCodeAt(0);
    if (isSearchIgnorable(code)) continue;
    if (/\s/.test(c)) {
      if (!lastSpace) out += ' ';
      lastSpace = true;
      continue;
    }
    out += LETTER_MAP.has(code) ? ch(LETTER_MAP.get(code)) : c;
    lastSpace = false;
  }
  return out.trimEnd();
}

export function searchMatches(query, ...fields) {
  const q = searchNormalize(query);
  if (!q) return true;
  return fields.some((f) => searchNormalize(f).includes(q));
}
