// Lafeef Check-in, offline web version: one phone, no server, no account.

import {
  COL, DEFAULT_ZONE, SCAN_LOG_HEADERS, SCAN_LOG_SHEET, SCAN_LOG_WIDTHS, displayTicket, errorsOf,
  exportFileName, exportRows, failedPreview, formatInZone, formatTime, isValid, previewFromSheets,
  scanLogRows, searchMatches, warningsOf,
} from './core.js';
import * as db from './db.js';
import { applyLang, getLang, setLang, t } from './i18n.js';
import { XlsxError, readXlsx, writeXlsx } from './xlsx.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const LIST_LIMIT = 300;
const SAME_CODE_COOLDOWN_MS = 3000;

const root = document.getElementById('app');
let cleanup = () => {};

// ---------------------------------------------------------------- DOM helpers

/** Builds an element. Text is always set as text, never parsed as HTML. */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ltr = (text, cls = '') => h('bdi', { class: `ltr ${cls}`.trim(), dir: 'ltr', text });

function deviceId() {
  try {
    let id = localStorage.getItem('deviceId');
    if (!id) {
      id = `web-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('deviceId', id);
    }
    return id;
  } catch {
    return 'web';
  }
}

const isStandalone = () =>
  window.navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;

// ---------------------------------------------------------------- sound

let audio = null;

/** iOS only allows sound after a tap, so this is called from a tap handler. */
function unlockAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch {
    audio = null;
  }
}

function beep(ok) {
  if (!audio) return;
  try {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = ok ? 1046 : 220;
    g.gain.setValueAtTime(0.0001, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + (ok ? 0.15 : 0.4));
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + (ok ? 0.16 : 0.42));
  } catch {
    // Sound is a nicety; the coloured result is what counts.
  }
  navigator.vibrate?.(ok ? 60 : [80, 60, 80]);
}

// ---------------------------------------------------------------- layout

function shell(title, { back, body }) {
  const header = h('header', { class: 'bar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': t('action.back'), onclick: back }, h('span', { class: 'chev', 'aria-hidden': 'true' })) : null,
    back ? null : h('img', { class: 'logo', src: 'img/logo.svg', alt: 'Lafeef' }),
    h('h1', { text: title }),
    h('button', {
      class: 'lang-btn',
      onclick: () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); render(); },
      text: t('lang.switch'),
    }),
  );
  const banner = h('div', { class: 'banner', role: 'status' }, h('span', { class: 'dot' }), t('banner.local'));
  root.replaceChildren(header, banner, h('main', {}, body));
  window.scrollTo(0, 0);
}

function toast(message, kind = 'info') {
  const el = h('div', { class: `toast ${kind}`, role: 'alert', text: message });
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}

const go = (hash) => { location.hash = hash; };

// ---------------------------------------------------------------- router

async function render() {
  cleanup();
  cleanup = () => {};
  applyLang();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] === 'e' && parts[1]) {
      const event = await db.getEvent(decodeURIComponent(parts[1]));
      if (!event) return go('');
      const view = parts[2] ?? '';
      if (view === 'scan') return scanView(event);
      if (view === 'manual') return manualView(event);
      if (view === 'list') return listView(event);
      if (view === 'import') return importView(event);
      return dashboardView(event);
    }
    return eventsView();
  } catch (e) {
    console.error(e);
    shell(t('app.title'), { body: h('p', { class: 'card error', text: t('storage.error') }) });
  }
}

const eventPath = (event, view = '') => `#/e/${encodeURIComponent(event.id)}${view ? `/${view}` : ''}`;

// ---------------------------------------------------------------- events

async function eventsView() {
  const events = await db.listEvents();
  const list = events.length === 0
    ? h('p', { class: 'muted center', text: t('events.empty') })
    : h('div', { class: 'stack' }, events.map((e) => h('button', { class: 'card event-card', onclick: () => go(eventPath(e)) },
      h('span', { class: 'event-name', text: e.name }),
      e.date ? ltr(e.date, 'muted small') : null,
      h('span', { class: 'row small' },
        h('span', { text: t('events.participants', e.participantCount) }),
        h('span', { class: 'ok', text: t('events.checkedIn', e.checkedInCount) }),
        h('span', { class: `chip ${e.status === 'OPEN' ? 'chip-open' : 'chip-closed'}`, text: t(`status.${e.status}`) })),
    )));

  const hint = isStandalone() ? null : h('p', { class: 'card hint', text: t('install.hint') });
  shell(t('events.title'), {
    body: [hint, list, h('button', { class: 'btn primary', onclick: createEventDialog, text: `+ ${t('events.new')}` })],
  });
}

function createEventDialog() {
  const today = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const name = h('input', { id: 'ev-name', required: true, maxlength: '200', autocomplete: 'off' });
  const date = h('input', { id: 'ev-date', type: 'date', value: `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}` });
  const zone = h('input', { id: 'ev-zone', dir: 'ltr', value: DEFAULT_ZONE, autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const error = h('p', { class: 'error', hidden: true });
  const dialog = h('dialog', { class: 'dialog' },
    h('form', {
      method: 'dialog',
      onsubmit: async (ev) => {
        ev.preventDefault();
        if (!name.value.trim()) return name.focus();
        try {
          const id = await db.createEvent({ name: name.value, date: date.value, timeZone: zone.value });
          dialog.close();
          dialog.remove();
          go(`#/e/${encodeURIComponent(id)}`);
        } catch (e) {
          error.textContent = e.code === 'INVALID_TIME_ZONE' ? t('create.badZone') : t('result.ERROR');
          error.hidden = false;
        }
      },
    },
    h('h2', { text: t('create.title') }),
    h('label', { for: 'ev-name', text: t('create.name') }), name,
    h('label', { for: 'ev-date', text: t('create.date') }), date,
    h('label', { for: 'ev-zone', text: t('create.zone') }), zone,
    error,
    h('div', { class: 'row end' },
      h('button', { type: 'button', class: 'btn ghost', onclick: () => { dialog.close(); dialog.remove(); }, text: t('action.cancel') }),
      h('button', { type: 'submit', class: 'btn primary', text: t('create.button') }))));
  document.body.append(dialog);
  dialog.showModal();
  name.focus();
}

// ---------------------------------------------------------------- dashboard

async function dashboardView(event) {
  const [participants, counts] = await Promise.all([db.getParticipants(event.id), db.counters(event.id)]);
  const total = participants.length;
  const checkedIn = participants.filter((p) => p.checkedIn).length;
  const pct = total ? Math.floor((checkedIn * 100) / total) : 0;

  const tile = (label, value, cls) => h('div', { class: `tile ${cls}` }, h('span', { class: 'tile-value', text: String(value) }), h('span', { class: 'tile-label', text: label }));
  const bar = h('div', { class: 'bar-fill' });
  bar.style.width = `${pct}%`;

  const toggle = h('input', {
    type: 'checkbox', role: 'switch', id: 'open-toggle', checked: event.status === 'OPEN',
    onchange: async (e) => { await db.setStatus(event.id, e.target.checked); render(); },
  });

  const exportArea = h('div', { class: 'stack' });
  shell(event.name, {
    back: () => go(''),
    body: [
      h('div', { class: 'row small' },
        h('span', { class: event.status === 'OPEN' ? 'ok strong' : 'bad strong', text: t(`status.${event.status}`) }),
        event.date ? ltr(event.date, 'muted') : null),
      event.sourceFileName ? h('p', { class: 'muted small', text: t('dash.source', event.sourceFileName) }) : null,
      total === 0 ? h('p', { class: 'card notice', text: t('dash.noList') }) : null,
      h('div', { class: 'tiles' }, tile(t('dash.total'), total, 'tile-total'), tile(t('dash.in'), checkedIn, 'tile-in'), tile(t('dash.left'), total - checkedIn, 'tile-left')),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar),
      h('p', { class: 'small', text: t('dash.progress', pct) }),
      h('div', { class: 'tiles two' }, tile(t('dash.dup'), counts.duplicate, 'tile-warn'), tile(t('dash.unknown'), counts.unknown, 'tile-bad')),
      h('button', { class: 'btn primary big', disabled: total === 0, onclick: () => { unlockAudio(); go(eventPath(event, 'scan')); }, text: t('action.scan') }),
      h('button', { class: 'btn', disabled: total === 0, onclick: () => { unlockAudio(); go(eventPath(event, 'manual')); }, text: t('action.manual') }),
      h('button', { class: 'btn', onclick: () => go(eventPath(event, 'list')), text: t('action.list') }),
      h('button', { class: 'btn', onclick: () => go(eventPath(event, 'import')), text: t('action.import') }),
      h('button', { class: 'btn', onclick: () => prepareExport(event, exportArea), text: t('action.export') }),
      exportArea,
      h('label', { class: 'card switch-row', for: 'open-toggle' }, h('span', { text: t('dash.open') }), toggle),
      total > 0 ? h('p', { class: 'muted small', text: t('dash.exportReminder') }) : null,
    ],
  });
}

// ---------------------------------------------------------------- export

/**
 * Builds the file first, then offers a separate "save / share" tap: iOS only
 * opens the share sheet straight from a tap, not after a long computation.
 */
async function prepareExport(event, area) {
  area.replaceChildren(h('p', { class: 'muted', text: t('export.working') }));
  try {
    const fresh = await db.getEvent(event.id);
    const [records, logs] = await Promise.all([db.getParticipants(event.id), db.getLogs(event.id)]);
    if (records.length === 0) {
      area.replaceChildren(h('p', { class: 'card notice', text: t('export.noList') }));
      return;
    }
    const { rows, checkedInCount } = exportRows(fresh.headers, records, fresh.timeZone);
    const bytes = writeXlsx([
      { name: fresh.sheetName || COL.SHEET, rows: [fresh.headers, ...rows], columnWidths: fresh.columnWidths, rightToLeft: fresh.rightToLeft },
      { name: SCAN_LOG_SHEET, rows: [SCAN_LOG_HEADERS, ...scanLogRows(logs, fresh.timeZone)], columnWidths: SCAN_LOG_WIDTHS, rightToLeft: fresh.rightToLeft },
    ]);
    const name = exportFileName(fresh.name);
    const file = new File([bytes], name, { type: XLSX_MIME });
    const summary = t('export.done', rows.length, checkedInCount);
    area.replaceChildren(
      h('p', { class: 'card success-soft', text: `${t('export.ready', name)}\n${summary}` }),
      h('button', { class: 'btn primary', onclick: () => saveFile(file), text: t('export.save') }),
    );
  } catch (e) {
    console.error(e);
    area.replaceChildren(h('p', { class: 'card error', text: t('export.failed') }));
  }
}

async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      // Fall back to a download below.
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------------------------------------------------------------- import

function issueText(issue) {
  const rows = issue.rows.length > 12 ? `${issue.rows.slice(0, 12).join(', ')}, …` : issue.rows.join(', ');
  return t(`issue.${issue.code}`, { value: issue.value ?? '', rows });
}

function importView(event) {
  const status = h('div', { class: 'stack' });
  const input = h('input', {
    type: 'file', id: 'xlsx-input', class: 'visually-hidden',
    accept: `.xlsx,${XLSX_MIME}`,
    onchange: () => { if (input.files[0]) readFile(input.files[0]); input.value = ''; },
  });

  async function readFile(file) {
    status.replaceChildren(h('p', { class: 'muted', text: t('import.reading') }));
    let preview;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      preview = previewFromSheets(readXlsx(bytes), file.name);
    } catch (e) {
      const code = e instanceof XlsxError
        ? { NOT_XLSX: 'NOT_XLSX', TOO_LARGE: 'FILE_TOO_LARGE' }[e.reason] ?? 'CORRUPT_FILE'
        : 'CORRUPT_FILE';
      preview = failedPreview(file.name, code);
    }
    showPreview(preview);
  }

  function showPreview(preview) {
    const errors = errorsOf(preview);
    const warnings = warningsOf(preview);
    const save = h('button', { class: 'btn primary', disabled: !isValid(preview), text: t('import.save') });
    save.addEventListener('click', () => store(preview, false, save));
    status.replaceChildren(
      h('p', { class: 'card', text: t('import.summary', preview.fileName, preview.sheetName || '-', preview.rows.length) }),
      errors.length ? h('div', { class: 'card error' }, h('strong', { text: t('import.errors') }), h('ul', {}, errors.map((i) => h('li', { text: issueText(i) })))) : null,
      warnings.length ? h('div', { class: 'card notice' }, h('strong', { text: t('import.warnings') }), h('ul', {}, warnings.map((i) => h('li', { text: issueText(i) })))) : null,
      save,
    );
  }

  async function store(preview, replace, button) {
    button.disabled = true;
    button.textContent = t('import.saving');
    try {
      const r = await db.importParticipants(event.id, preview, replace);
      if (r.kind === 'CONFIRM_REPLACE') {
        if (window.confirm(t('import.confirmReplace', r.existingCount))) return store(preview, true, button);
        button.disabled = false;
        button.textContent = t('import.save');
        return;
      }
      if (r.kind === 'CHECKED_IN_MISSING') {
        status.append(h('p', { class: 'card error', text: t('import.missing', r.tickets.join(', ')) }));
        button.textContent = t('import.save');
        return;
      }
      status.replaceChildren(
        h('p', { class: 'card success-soft', text: t('import.done', r.counts.count) }),
        h('p', { class: 'muted small', text: t('import.doneDetail', r.counts.carriedOver, r.counts.preCheckedIn, r.counts.removed) }),
        h('button', { class: 'btn primary', onclick: () => go(eventPath(event)), text: t('action.back') }),
      );
    } catch (e) {
      console.error(e);
      status.append(h('p', { class: 'card error', text: t('import.failed') }));
      button.disabled = false;
      button.textContent = t('import.save');
    }
  }

  shell(t('import.title'), {
    back: () => go(eventPath(event)),
    body: [
      h('p', { text: t('import.intro') }),
      input,
      h('label', { for: 'xlsx-input', class: 'btn primary', role: 'button', tabindex: '0', text: t('import.pick') }),
      status,
    ],
  });
}

// ---------------------------------------------------------------- result panel

function resultPanel(outcome) {
  const kind = outcome.reason === 'AMBIGUOUS' ? 'AMBIGUOUS' : outcome.code;
  const cls = { SUCCESS: 'res-ok', DUPLICATE: 'res-warn' }[outcome.code] ?? 'res-bad';
  const zone = outcome.timeZone;
  const lines = [];
  if (outcome.name != null) lines.push(h('p', { class: 'res-name', text: outcome.name.trim() || '—' }));
  if (outcome.ticketNumber) lines.push(ltr(displayTicket(outcome.ticketNumber), 'res-ticket'));
  if (outcome.code === 'SUCCESS') {
    lines.push(h('p', { text: t('result.time', formatTime(outcome.checkedInAt, zone)) }));
  } else if (outcome.code === 'DUPLICATE') {
    lines.push(h('p', {
      class: 'strong',
      text: outcome.checkedInAt != null
        ? t('result.dupByPhone', formatInZone(outcome.checkedInAt, zone))
        : t('result.dupImported', outcome.checkedInAtText ?? ''),
    }));
  } else if (outcome.code === 'NOT_FOUND') {
    lines.push(h('p', { text: t('result.notFoundDetail') }));
    lines.push(h('p', { class: 'small', text: t('result.scanned', displayTicket(outcome.input, 40)) }));
  }
  return h('section', { class: `result ${cls}`, role: 'alert' }, h('h2', { text: t(`result.${kind}`) }), lines);
}

// ---------------------------------------------------------------- scanner

function scanView(event) {
  const video = h('video', { class: 'camera', playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const message = h('p', { class: 'muted center', text: t('scan.starting') });
  const resultArea = h('div', { class: 'stack' });
  const viewport = h('div', { class: 'viewport' }, video, h('div', { class: 'frame', 'aria-hidden': 'true' }));

  let stream = null;
  let stopped = false;
  let paused = false;
  let busy = false;
  let lastCode = '';
  let lastAt = 0;
  let timer = 0;

  const photoInput = h('input', {
    type: 'file', accept: 'image/*', capture: 'environment', id: 'photo-input', class: 'visually-hidden',
    onchange: async () => {
      const f = photoInput.files[0];
      photoInput.value = '';
      if (!f) return;
      const code = await decodeImage(f);
      if (code) handle(code);
      else toast(t('scan.photoNoCode'), 'bad');
    },
  });

  async function handle(code) {
    if (busy || paused || stopped) return;
    const now = Date.now();
    if (code === lastCode && now - lastAt < SAME_CODE_COOLDOWN_MS) return;
    busy = true;
    paused = true;
    lastCode = code;
    lastAt = now;
    resultArea.replaceChildren(h('p', { class: 'muted center', text: t('scan.checking') }));
    let outcome;
    try {
      outcome = await db.checkIn(event.id, code, 'QR', deviceId());
    } catch (e) {
      console.error(e);
      outcome = { code: 'ERROR', input: code, method: 'QR' };
    }
    busy = false;
    if (stopped) return;
    beep(outcome.code === 'SUCCESS');
    const next = h('button', {
      class: 'btn primary big',
      onclick: () => { lastAt = Date.now(); paused = false; resultArea.replaceChildren(); viewport.scrollIntoView({ block: 'nearest' }); },
      text: t('scan.next'),
    });
    resultArea.replaceChildren(resultPanel(outcome), next);
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function tick() {
    if (stopped) return;
    if (!paused && !busy && video.readyState >= 2 && video.videoWidth > 0) {
      const scale = Math.min(1, 800 / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale);
      const hgt = Math.round(video.videoHeight * scale);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== hgt) canvas.height = hgt;
      ctx.drawImage(video, 0, 0, w, hgt);
      const found = window.jsQR(ctx.getImageData(0, 0, w, hgt).data, w, hgt, { inversionAttempts: 'attemptBoth' });
      if (found?.data) handle(found.data);
    }
    timer = setTimeout(tick, 150);
  }

  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
      video.srcObject = stream;
      await video.play();
      message.textContent = t('scan.hint');
      tick();
    } catch (e) {
      console.warn('camera', e);
      viewport.hidden = true;
      message.className = 'card error';
      message.textContent = t('scan.denied');
    }
  }

  cleanup = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((tr) => tr.stop());
  };

  shell(t('scan.title'), {
    back: () => go(eventPath(event)),
    body: [
      event.status !== 'OPEN' ? h('p', { class: 'card error', text: t('result.EVENT_CLOSED') }) : null,
      viewport,
      message,
      resultArea,
      photoInput,
      h('div', { class: 'row' },
        h('label', { for: 'photo-input', class: 'btn', role: 'button', tabindex: '0', text: t('scan.photo') }),
        h('button', { class: 'btn', onclick: () => go(eventPath(event, 'manual')), text: t('action.manual') })),
    ],
  });
  start();
}

async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const hgt = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = hgt;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, hgt);
    return window.jsQR(cx.getImageData(0, 0, w, hgt).data, w, hgt, { inversionAttempts: 'attemptBoth' })?.data ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------- manual entry

function manualView(event) {
  const input = h('input', {
    id: 'ticket-input', dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    inputmode: 'text', enterkeyhint: 'go',
  });
  const resultArea = h('div', { class: 'stack' });
  let busy = false;
  const form = h('form', {
    class: 'stack',
    onsubmit: async (e) => {
      e.preventDefault();
      if (busy || !input.value.trim()) return;
      busy = true;
      let outcome;
      try {
        outcome = await db.checkIn(event.id, input.value, 'MANUAL', deviceId());
      } catch (err) {
        console.error(err);
        outcome = { code: 'ERROR', input: input.value, method: 'MANUAL' };
      }
      busy = false;
      beep(outcome.code === 'SUCCESS');
      resultArea.replaceChildren(resultPanel(outcome));
      if (outcome.code === 'SUCCESS' || outcome.code === 'DUPLICATE') input.value = '';
      input.focus();
    },
  },
  h('label', { for: 'ticket-input', text: t('manual.label') }),
  input,
  h('button', { type: 'submit', class: 'btn primary big', text: t('manual.submit') }));

  shell(t('manual.title'), {
    back: () => go(eventPath(event)),
    body: [event.status !== 'OPEN' ? h('p', { class: 'card error', text: t('result.EVENT_CLOSED') }) : null, form, resultArea],
  });
  input.focus();
}

// ---------------------------------------------------------------- attendance list

async function listView(event) {
  const participants = await db.getParticipants(event.id);
  let filter = 'all';
  const search = h('input', { type: 'search', placeholder: t('list.search'), 'aria-label': t('list.search'), autocomplete: 'off' });
  const count = h('p', { class: 'muted small' });
  const list = h('ul', { class: 'people' });

  const tabs = ['all', 'in', 'out'].map((f) => h('button', {
    class: `seg ${f === filter ? 'active' : ''}`,
    'aria-pressed': String(f === filter),
    onclick: (e) => {
      filter = f;
      for (const b of tabs) { b.classList.toggle('active', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); }
      update();
    },
    text: t(`list.${f}`),
  }));

  function update() {
    const q = search.value;
    const matches = participants.filter((p) =>
      (filter === 'all' || (filter === 'in') === p.checkedIn) && searchMatches(q, p.name, p.ticketNumber));
    count.textContent = t('list.count', matches.length, participants.length);
    const shown = matches.slice(0, LIST_LIMIT);
    list.replaceChildren(...shown.map((p) => h('li', { class: p.checkedIn ? 'in' : '' },
      h('span', { class: 'person-name', text: p.name.trim() || '—' }),
      ltr(displayTicket(p.ticketNumber), 'muted small'),
      p.checkedIn
        ? h('span', {
          class: 'ok small',
          text: p.checkedInAt != null ? formatInZone(p.checkedInAt, event.timeZone) : t('list.imported', p.checkedInAtText ?? ''),
        })
        : null)));
    if (matches.length === 0) list.append(h('li', { class: 'muted center', text: t('list.empty') }));
    if (matches.length > LIST_LIMIT) list.append(h('li', { class: 'muted center small', text: t('list.more', LIST_LIMIT) }));
  }
  search.addEventListener('input', update);

  shell(t('list.title'), {
    back: () => go(eventPath(event)),
    body: [search, h('div', { class: 'segmented', role: 'group' }, tabs), count, list],
  });
  update();
}

// ---------------------------------------------------------------- start

window.addEventListener('hashchange', render);
db.requestPersistence();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker', e));
}
render();
