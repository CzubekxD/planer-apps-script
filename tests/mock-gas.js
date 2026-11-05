// Atrapa Apps Script: uruchamia PRAWDZIWE src/Code.gs + src/PlanLib.gs w Node (vm),
// z podstawionymi SpreadsheetApp / Session / LockService / PropertiesService / HtmlService / Utilities.
// Arkusz trzymany w pamięci — można go podejrzeć (gas.sheet('Planer_dane')) i „zepsuć” (gas.breakSheet()).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src');
const OWNER = 'wlasciciel@firma.pl';

class Sheet {
  constructor(name) { this.name = name; this.cells = new Map(); }
  key(r, c) { return r + ':' + c; }
  get(r, c) { const v = this.cells.get(this.key(r, c)); return v === undefined ? '' : v; }
  set(r, c, v) { if (v === '' || v === null || v === undefined) this.cells.delete(this.key(r, c)); else this.cells.set(this.key(r, c), v); }
  getLastRow() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(':')[0]); return m; }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) m = Math.max(m, +k.split(':')[1]); return m; }
  appendRow(vals) { const r = this.getLastRow() + 1; vals.forEach((v, i) => this.set(r, i + 1, v)); return this; }
  getRange(row, col, nr = 1, nc = 1) {
    if (row < 1 || col < 1 || nr < 1 || nc < 1) throw new Error(`Zakres poza arkuszem: ${row},${col},${nr},${nc}`);
    const sh = this;
    const each = fn => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fn(row + i, col + j, i, j); };
    return {
      getValue: () => sh.get(row, col),
      setValue: v => { sh.set(row, col, v); },
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.get(row + i, col + j))),
      setValues: vals => {
        if (vals.length !== nr || vals.some(r => r.length !== nc)) throw new Error('setValues: zły wymiar tablicy');
        each((r, c, i, j) => {
          const v = vals[i][j];
          if (typeof v === 'string' && v.length > 50000) throw new Error('Komórka > 50 000 znaków');
          sh.set(r, c, v);
        });
      },
      clearContent: () => each((r, c) => sh.set(r, c, ''))
    };
  }
}

class Spreadsheet {
  constructor(id, name) { this.id = id; this.name = name; this.sheets = new Map(); }
  getId() { return this.id; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this.id; }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
}

function createGas({ owners = [OWNER], files = {} } = {}) {
  const state = { user: OWNER, spreadsheets: new Map(), props: new Map(), broken: false, calls: [] };
  const read = name => files[name] ?? fs.readFileSync(path.join(SRC, name + (name.endsWith('.gs') ? '' : '.html')), 'utf8');

  const SpreadsheetApp = {
    getActive: () => null,   // skrypt samodzielny (nie z Arkusza)
    create: name => {
      if (state.broken) throw new Error('Brak dostępu do Dysku');
      const ss = new Spreadsheet('ss' + (state.spreadsheets.size + 1), name);
      state.spreadsheets.set(ss.id, ss); return ss;
    },
    openById: id => {
      if (state.broken) throw new Error('Nie można otworzyć Arkusza');
      const ss = state.spreadsheets.get(id); if (!ss) throw new Error('Nie ma Arkusza ' + id); return ss;
    }
  };
  const Session = { getActiveUser: () => ({ getEmail: () => state.user }), getScriptTimeZone: () => 'Europe/Warsaw' };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: k => state.props.get(k) ?? null, setProperty: (k, v) => { state.props.set(k, v); } }) };
  const pad = n => String(n).padStart(2, '0');
  const Utilities = { formatDate: d => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}` };
  const Logger = { log: () => {} };

  // Szablon HTML: obsługuje <?!= wyrażenie ?> (bez escapowania) i <?= wyrażenie ?> (z escapowaniem)
  const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HtmlService = {
    createHtmlOutputFromFile: name => ({ getContent: () => read(name) }),
    createTemplateFromFile: name => {
      const t = {
        evaluate() {
          const vars = Object.fromEntries(Object.entries(t).filter(([k]) => k !== 'evaluate'));
          const html = read(name).replace(/<\?(!?)=([\s\S]*?)\?>/g, (_, raw, expr) => {
            const v = vm.runInContext(`(function(){ with (this) { return (${expr}); } })`, ctx).call(vars);
            return raw ? String(v) : escHtml(v);
          });
          const out = { getContent: () => html, setTitle: () => out, addMetaTag: () => out };
          return out;
        }
      };
      return t;
    }
  };

  // Zegar serwera rośnie o ≥ 1 ms na każde „teraz” — w prawdziwym Apps Script zapis trwa sekundy, więc id wpisów ('w' + czas) się nie powtarzają
  let lastNow = 0;
  class GasDate extends Date {
    constructor(...a) { if (a.length) super(...a); else { lastNow = Math.max(Date.now(), lastNow + 1); super(lastNow); } }
    static now() { return new GasDate().getTime(); }
  }
  const ctx = vm.createContext({ SpreadsheetApp, Session, LockService, PropertiesService, Utilities, Logger, HtmlService, console, JSON, Date: GasDate, Math });
  let code = read('Code.gs').replace(/const OWNERS = \[[^\]]*\];/, `const OWNERS = ${JSON.stringify(owners)};`);
  // const nie trafia do globalnego obiektu kontekstu — dopisujemy eksport, żeby testy widziały wersje
  vm.runInContext(read('PlanLib.gs') + '\n' + code + '\n;this.__v = { CODE_VERSION, PLAN_LIB_VERSION, PLAN_LIB };', ctx, { filename: 'Code.gs+PlanLib.gs' });

  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const api = {
    state,
    versions: ctx.__v,
    PLAN_LIB: ctx.__v.PLAN_LIB,
    as(user) { state.user = user; return api; },
    // Wywołanie funkcji serwera tak, jak robi to google.script.run (argumenty i wynik przez JSON)
    call(name, args = [], user) {
      if (user !== undefined) state.user = user;
      state.calls.push(name);
      if (typeof ctx[name] !== 'function') throw new Error(`Script function not found: ${name}`);
      return clone(ctx[name](...clone(args)));
    },
    doGet(params = {}) { return ctx.doGet({ parameter: params }).getContent(); },
    spreadsheet() { const id = state.props.get('SHEET_ID'); return id ? state.spreadsheets.get(id) : null; },
    sheet(name) { const ss = api.spreadsheet(); return ss && ss.getSheetByName(name); },
    breakSheet(b = true) { state.broken = b; },
    storedPlan() { return api.call('loadPlan').data; }
  };
  return api;
}

module.exports = { createGas, OWNER };
