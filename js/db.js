// On-device storage (IndexedDB). This phone is the only copy of the records.

import {
  DEFAULT_ZONE, MAX_RAW_INPUT, isValidTimeZone, matchParticipant, planImport, ticketCandidates,
} from './core.js';

const DB_NAME = 'lafeef-checkin';
const DB_VERSION = 1;
const MAX_LOG_INPUT = 300;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('events', { keyPath: 'id' });
      const p = db.createObjectStore('participants', { keyPath: ['eventId', 'key'] });
      p.createIndex('byEvent', 'eventId');
      const l = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
      l.createIndex('byEvent', 'eventId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database blocked by another tab'));
  });
  return dbPromise;
}

const done = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const committed = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
});

/** Asks the browser not to evict this site's storage under pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Not supported; storage still works, just without the extra protection.
  }
  return false;
}

// ---------------------------------------------------------------- events

export async function listEvents() {
  const db = await openDb();
  const tx = db.transaction(['events', 'participants'], 'readonly');
  const events = await done(tx.objectStore('events').getAll());
  const index = tx.objectStore('participants').index('byEvent');
  const out = [];
  for (const e of events) {
    const parts = await done(index.getAll(e.id));
    out.push({ ...e, participantCount: parts.length, checkedInCount: parts.filter((p) => p.checkedIn).length });
  }
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
}

export async function createEvent({ name, date, timeZone }) {
  const zone = (timeZone || DEFAULT_ZONE).trim();
  if (!isValidTimeZone(zone)) throw Object.assign(new Error('INVALID_TIME_ZONE'), { code: 'INVALID_TIME_ZONE' });
  const event = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: name.trim().slice(0, 200),
    date: (date || '').trim().slice(0, 40),
    timeZone: zone,
    status: 'OPEN',
    sourceFileName: '',
    sheetName: 'Attendance',
    headers: [],
    columnWidths: [],
    rightToLeft: true,
    createdAt: Date.now(),
  };
  const db = await openDb();
  const tx = db.transaction('events', 'readwrite');
  tx.objectStore('events').add(event);
  await committed(tx);
  return event.id;
}

export async function getEvent(id) {
  const db = await openDb();
  return (await done(db.transaction('events').objectStore('events').get(id))) ?? null;
}

export async function setStatus(id, isOpen) {
  const db = await openDb();
  const tx = db.transaction('events', 'readwrite');
  const store = tx.objectStore('events');
  const e = await done(store.get(id));
  if (e) store.put({ ...e, status: isOpen ? 'OPEN' : 'CLOSED' });
  await committed(tx);
}

export async function getParticipants(eventId) {
  const db = await openDb();
  const all = await done(db.transaction('participants').objectStore('participants').index('byEvent').getAll(eventId));
  return all.sort((a, b) => a.rowNumber - b.rowNumber);
}

export async function getLogs(eventId) {
  const db = await openDb();
  return done(db.transaction('logs').objectStore('logs').index('byEvent').getAll(eventId));
}

export async function counters(eventId) {
  const logs = await getLogs(eventId);
  return {
    duplicate: logs.filter((l) => l.result === 'DUPLICATE').length,
    unknown: logs.filter((l) => l.result === 'NOT_FOUND').length,
  };
}

// ---------------------------------------------------------------- import

/**
 * Stores (or, with replace, replaces) the list in one transaction, so a
 * failure leaves the previous list untouched.
 * @returns {{kind: 'IMPORTED', counts}|{kind: 'CONFIRM_REPLACE', existingCount}|{kind: 'CHECKED_IN_MISSING', tickets}}
 */
export async function importParticipants(eventId, preview, replace) {
  const db = await openDb();
  const tx = db.transaction(['events', 'participants'], 'readwrite');
  const events = tx.objectStore('events');
  const store = tx.objectStore('participants');
  const event = await done(events.get(eventId));
  if (!event) throw new Error('Event not found');
  const existing = await done(store.index('byEvent').getAll(eventId));
  const plan = planImport(preview, existing, replace);
  if (plan.kind !== 'REPLACE') {
    tx.abort();
    await committed(tx).catch(() => {});
    return plan;
  }
  for (const r of existing) store.delete([eventId, r.key]);
  for (const r of plan.records) store.put({ ...r, eventId });
  events.put({
    ...event,
    sourceFileName: preview.fileName.slice(0, 255),
    sheetName: preview.sheetName.slice(0, 31) || 'Attendance',
    headers: preview.headers,
    columnWidths: preview.columnWidths,
    rightToLeft: preview.rightToLeft,
    importedAt: Date.now(),
  });
  await committed(tx);
  return { kind: 'IMPORTED', counts: plan.counts };
}

// ---------------------------------------------------------------- check-in

/**
 * Records the first check-in of a ticket. The read and the write happen in one
 * readwrite transaction; IndexedDB runs overlapping transactions one after the
 * other, so two quick scans of the same ticket cannot both succeed.
 */
export async function checkIn(eventId, input, method, deviceId) {
  const payload = String(input).slice(0, MAX_RAW_INPUT);
  const db = await openDb();
  const tx = db.transaction(['events', 'participants', 'logs'], 'readwrite');
  const store = tx.objectStore('participants');
  const now = Date.now();
  const log = (result, record) => tx.objectStore('logs').add({
    eventId,
    at: now,
    result,
    input: payload.length > MAX_LOG_INPUT ? payload.slice(0, MAX_LOG_INPUT) + String.fromCharCode(0x2026) : payload,
    ticketNumber: record?.ticketNumber ?? null,
    participantName: record?.name ?? null,
    method,
    deviceId,
  });

  const event = await done(tx.objectStore('events').get(eventId));
  if (!event) {
    tx.abort();
    return { code: 'ERROR', input: payload, method };
  }
  const zone = event.timeZone;
  let outcome;
  if (event.status !== 'OPEN') {
    outcome = { code: 'EVENT_CLOSED', input: payload, method, timeZone: zone };
  } else {
    const candidates = ticketCandidates(payload);
    const found = [];
    for (const c of candidates) found.push(await done(store.get([eventId, c])));
    const match = matchParticipant(found);
    if (match.kind === 'NOT_FOUND') {
      log('NOT_FOUND', null);
      outcome = { code: 'NOT_FOUND', input: payload, method, timeZone: zone };
    } else if (match.kind === 'AMBIGUOUS') {
      log('AMBIGUOUS', null);
      outcome = { code: 'ERROR', reason: 'AMBIGUOUS', input: payload, method, timeZone: zone };
    } else if (match.record.checkedIn) {
      const r = match.record;
      log('DUPLICATE', r);
      outcome = {
        code: 'DUPLICATE', input: payload, method, timeZone: zone,
        name: r.name, ticketNumber: r.ticketNumber,
        checkedInAt: r.checkedInAt, checkedInAtText: r.checkedInAtText,
        byThisPhone: r.checkedInMethod !== 'IMPORT',
      };
    } else {
      const r = { ...match.record, checkedIn: true, checkedInAt: now, checkedInAtText: null, checkedInMethod: method };
      store.put(r);
      log('SUCCESS', r);
      outcome = {
        code: 'SUCCESS', input: payload, method, timeZone: zone,
        name: r.name, ticketNumber: r.ticketNumber, checkedInAt: now,
      };
    }
  }
  await committed(tx);
  return outcome;
}
