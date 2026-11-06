// Testy serwera: prawdziwy Code.gs + PlanLib.gs na atrapie Apps Script.  Uruchom: npm run test:server
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGas, OWNER } = require('./mock-gas');

const EDITOR = 'jan@firma.pl', GUEST = 'gosc@firma.pl';
const proj = (id, title, extra = {}) => ({ id, title, status: 'planned', start: '2026-11-02', end: '2026-11-30', assignments: [], milestones: [], editors: [], ...extra });
const plan = (...projects) => ({ wipLimit: 2, horizonMonths: 20, tabs: [{ id: 't1', title: 'Portfolio', projects }] });

test('pierwsze wczytanie zakłada Arkusz i zapamiętuje SHEET_ID', () => {
  const gas = createGas();
  const r = gas.call('loadPlan');
  assert.equal(r.data, null);
  assert.equal(r.version, null);
  assert.equal(r.isOwner, true);
  assert.ok(gas.state.props.get('SHEET_ID'));
  assert.deepEqual(r.parts, { code: gas.versions.CODE_VERSION, planLib: gas.versions.PLAN_LIB_VERSION });
});

test('zapis właściciela: wersja rośnie, każdy zapis = wpis w dzienniku z kopią planu', () => {
  const gas = createGas();
  gas.call('loadPlan');
  assert.deepEqual(gas.call('savePlan', [plan(proj('a', 'A')), null]), { version: 1, ignored: false });
  assert.deepEqual(gas.call('savePlan', [plan(proj('a', 'A2')), 1]), { version: 2, ignored: false });
  const h = gas.call('listHistory');
  assert.equal(h.length, 2);
  assert.ok(h.every(e => e.hasSnapshot));
  assert.match(h[0].changes[0], /Nowy projekt „A”/);
  assert.match(h[1].changes[0], /nazwa: „A” → „A2”/);
  assert.equal(gas.storedPlan().tabs[0].projects[0].title, 'A2');
});

test('zapis ze starą wersją = conflict, nic się nie nadpisuje', () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null]);
  gas.call('savePlan', [plan(proj('a', 'B')), 1]);
  assert.deepEqual(gas.call('savePlan', [plan(proj('a', 'STARE')), 1]), { conflict: true });
  assert.equal(gas.storedPlan().tabs[0].projects[0].title, 'B');
});

test('zapis bez zmian i pusty plan na pustym Arkuszu nie śmiecą w dzienniku', () => {
  const gas = createGas();
  assert.deepEqual(gas.call('savePlan', [plan(), null]), { version: null });
  gas.call('savePlan', [plan(proj('a', 'A')), null]);
  assert.deepEqual(gas.call('savePlan', [{ ...plan(proj('a', 'A')), activeTab: 'inna' }, 1]), { version: 1, ignored: false });
  assert.equal(gas.call('listHistory').length, 1);
});

test('pierwszy zapis na Arkuszu z danymi (np. wklejonymi ręcznie) dopisuje „Stan początkowy”', () => {
  const gas = createGas();
  gas.call('loadPlan');
  const sh = gas.sheet('Planer_dane');
  sh.getRange(1, 2).setValue(JSON.stringify(plan(proj('a', 'A'))));
  gas.call('savePlan', [plan(proj('a', 'A'), proj('b', 'B')), null]);
  const h = gas.call('listHistory');
  assert.equal(h[0].initial, true);
  assert.equal(h.length, 2);
});

test('edytor karty zmienia tylko swoją kartę; reszta jest ignorowana', () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'Jana', { editors: [EDITOR] }), proj('b', 'Cudza')), null]);
  const r = gas.call('savePlan', [plan(proj('a', 'Jana zmieniona', { editors: [EDITOR, 'inny@firma.pl'] }), proj('b', 'Hack'), proj('c', 'Nowy')), 1], EDITOR);
  assert.deepEqual(r, { version: 2, ignored: true });
  const ps = gas.storedPlan().tabs[0].projects;
  assert.deepEqual(ps.map(p => p.title), ['Jana zmieniona', 'Cudza']);
  assert.deepEqual(ps[0].editors, [EDITOR], 'edytor nie zmienia listy edytorów');
  assert.equal(gas.call('loadPlan', [], EDITOR).isOwner, false);
});

test('gość nic nie zmienia; brak e-maila = odmowa', () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null]);
  assert.deepEqual(gas.call('savePlan', [plan(proj('a', 'X')), 1], GUEST), { version: 1, ignored: true });
  assert.equal(gas.call('savePlan', [plan(proj('a', 'X')), 1], '').denied, true);
  assert.equal(gas.storedPlan().tabs[0].projects[0].title, 'A');
});

test('właściciel z wielkimi literami w OWNERS jest rozpoznany', () => {
  const gas = createGas({ owners: ['Wlasciciel@Firma.pl'] });
  assert.equal(gas.call('loadPlan', [], 'Wlasciciel@Firma.pl'.toLowerCase()).isOwner, true);
});

test('przywrócenie wersji z Historii: tylko właściciel, wraca dokładny stan', () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'v1')), null]);
  gas.call('savePlan', [plan(proj('a', 'v2')), 1]);
  const h = gas.call('listHistory');
  const v1 = h.find(e => e.changes.some(c => c.startsWith('Nowy projekt')));
  assert.match(gas.call('restoreVersion', [v1.id], EDITOR).error, /tylko właściciel/);
  const r = gas.call('restoreVersion', [v1.id], OWNER);
  assert.equal(r.version, 3);
  assert.equal(gas.storedPlan().tabs[0].projects[0].title, 'v1');
  assert.equal(gas.call('listHistory').at(-1).restore, true);
});

test('duży plan (> 50 000 znaków) dzieli się na kawałki i wraca bez strat', () => {
  const gas = createGas();
  const big = plan(...Array.from({ length: 300 }, (_, i) => proj('p' + i, 'Projekt ' + i, { notes: 'x'.repeat(400) })));
  gas.call('savePlan', [big, null]);
  assert.ok(gas.sheet('Planer_dane').getLastColumn() > 3, 'JSON w kilku komórkach');
  assert.deepEqual(gas.storedPlan(), big);
  // mniejszy plan po dużym: stare kawałki muszą zniknąć
  gas.call('savePlan', [plan(proj('a', 'mały')), 1]);
  assert.equal(gas.storedPlan().tabs[0].projects.length, 1);
});

test('Arkusz niedostępny = błąd (przeglądarka blokuje wtedy edycję)', () => {
  const gas = createGas();
  gas.breakSheet();
  assert.throws(() => gas.call('loadPlan'), /Dysku|Arkusza/);
});

test('describeChanges: każda różnica daje wpis (inaczej serwer pominąłby zapis)', () => {
  const { PLAN_LIB } = createGas();
  const a = plan(proj('a', 'A')), b = plan(proj('a', 'A', { history: [{ date: '2026-11-05', status: 'ongoing' }] }));
  assert.ok(PLAN_LIB.describeChanges(a, b).length > 0);
  assert.equal(PLAN_LIB.describeChanges(a, { ...a, activeTab: 'x' }).length, 0);
});

test('doGet skleja wszystkie pliki w jeden <script> we właściwej kolejności', () => {
  const html = createGas().doGet();
  const order = ['js-sesja', 'js-model', 'js-os', 'js-karta', 'js-portfel', 'js-historia', 'js-miary', 'js-testy'];
  const pos = [...order.map(n => html.indexOf(`window.__planerParts.push('${n}@`)), html.indexOf('const PLANER_FILES')];
  order.push('js-start');
  pos.forEach((p, i) => assert.ok(p > 0, `${order[i]} dołączony`));
  assert.deepEqual([...pos].sort((x, y) => x - y), pos);
  assert.ok(!html.includes('<?'), 'brak nieprzetworzonych scriptletów');
  assert.match(html, /const PLAN_LIB = \(function PLAN_LIB_FACTORY/);
});

test('kontrola wklejenia: stopki js-* = mapa PLANER_FILES w js-start, a serwer = PLANER_VERSION', () => {
  const fs = require('fs'), path = require('path');
  const src = n => fs.readFileSync(path.join(__dirname, '..', 'src', n), 'utf8');
  const start = src('js-start.html');
  const files = JSON.parse(start.match(/const PLANER_FILES = (\{[^}]*\})/)[1].replace(/'/g, '"'));
  const footers = {};
  fs.readdirSync(path.join(__dirname, '..', 'src')).filter(n => /^js-.*\.html$/.test(n) && n !== 'js-start.html').forEach(n => {
    const m = src(n).match(/window\.__planerParts\.push\('([^@']+)@([^']+)'\);\s*$/);
    assert.ok(m, `${n}: brak stopki __planerParts na końcu pliku`);
    assert.equal(m[1] + '.html', n, `${n}: stopka zgłasza złą nazwę`);
    const koniec = src(n).match(/KONIEC (\S+) \(wersja ([^)]+)\)/);
    assert.ok(koniec && koniec[2] === m[2], `${n}: komentarz KONIEC ma inną wersję niż stopka`);
    footers[m[1]] = m[2];
  });
  assert.deepEqual(footers, files, 'PLANER_FILES w js-start musi mieć dokładnie te wersje, które mają stopki');
  const gas = createGas();
  const planerVersion = start.match(/const PLANER_VERSION = '([^']+)'/)[1];
  assert.equal(gas.versions.CODE_VERSION, planerVersion, 'CODE_VERSION (Code.gs) ≠ PLANER_VERSION (js-start)');
  assert.equal(gas.versions.PLAN_LIB_VERSION, planerVersion, 'PLAN_LIB_VERSION (PlanLib.gs) ≠ PLANER_VERSION (js-start)');
});

test('termin: poza TERM i DATE_LIB (js-model) w kodzie nie ma ręcznych „±1 dzień”', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src');
  // Wyjątki: kroki osi czasu i kalendarza (to nie są końce terminów) — dopisuj świadomie, z powodem
  const ALLOW = [
    /for \(let day = new Date\(start\); day < end; day = addDays\(day, 1\)\)/,   // pętla dni na osi (js-os)
  ];
  const FORBID = [
    /addDays\([^;]*?,\s*[-+]?\s*1\s*\)/,            // addDays(cokolwiek, ±1)
    /diffDays\([^;]*?\)\s*[-+]\s*1\b/,              // diffDays(...) ± 1
    /\b1\s*\+\s*diffDays\(/,                        // 1 + diffDays(...)
    /getDate\(\)\s*[-+]\s*1\b/                      // getDate() ± 1
  ];
  const bad = [];
  fs.readdirSync(dir).filter(n => /^js-.*\.html$/.test(n) && n !== 'js-testy.html').forEach(n => {
    const lines = fs.readFileSync(path.join(dir, n), 'utf8').split('\n');
    let skip = null;   // wnętrze DATE_LIB i TERM w js-model
    lines.forEach((line, i) => {
      if (n === 'js-model.html' && /^const (DATE_LIB = \(\(\) => \{|TERM = \{)/.test(line)) skip = /^const DATE_LIB/.test(line) ? /^\}\)\(\);/ : /^\};/;
      if (skip) { if (skip.test(line)) skip = null; return; }
      if (ALLOW.some(r => r.test(line))) return;
      if (FORBID.some(r => r.test(line))) bad.push(`${n}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  });
  assert.deepEqual(bad, []);
});

// --- PlanLib.gs ma własną zamianę „koniec wyłączny → ostatni dzień” (endIncl): działa na serwerze bez DATE_LIB.
// Test pilnuje, że daje dokładnie to samo co TERM.lastDay z js-model, także w strefach ze zmianą czasu.
function termFromJsModel() {
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js-model.html'), 'utf8');
  const from = src.indexOf('const DATE_LIB = '), endTerm = src.indexOf('\n};', src.indexOf('const TERM = {')) + 3;
  const ctx = vm.createContext({});
  // formatDate/addDays/diffDays są potrzebne TERM-owi, a w pliku powstają dopiero po DATE_LIB
  vm.runInContext(src.slice(from, src.indexOf('// ===== KONIEC DATE_LIB =====')).replace('const DATE_LIB', 'var DATE_LIB') +
    '\nvar addDays = DATE_LIB.addDays, diffDays = DATE_LIB.diffDays, formatDate = DATE_LIB.format;\n' +
    src.slice(src.indexOf('const TERM = {'), endTerm).replace('const TERM', 'var TERM'), ctx);
  return ctx;
}

test('endIncl (PlanLib) = TERM.lastDay: koniec miesiąca, roku, rok przestępny, jednodniowy, zmiana czasu', () => {
  const oldTZ = process.env.TZ;
  const { PLAN_LIB } = createGas();
  const ends = ['2026-12-01', '2027-01-01', '2028-03-01', '2027-03-01', '2026-11-02',   // 1. dzień miesiąca/roku, luty przestępny i zwykły, jednodniowy
                '2027-03-28', '2027-03-29', '2027-03-30', '2026-10-25', '2026-10-26', '2026-03-30', '2026-03-29'];  // wokół zmiany czasu (PL/UE)
  try {
    for (const tz of ['UTC', 'Europe/Warsaw', 'America/New_York', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      const { TERM, DATE_LIB } = termFromJsModel();
      for (const end of ends) {
        const start = DATE_LIB.toISO(TERM.lastDay(DATE_LIB.fromISO(end)));   // jednodniowy: start = ostatni dzień
        const opis = PLAN_LIB.describeChanges(
          { tabs: [{ id: 't', title: 'T', projects: [{ id: 'a', title: 'A', start, end: '2000-01-01' }] }] },
          { tabs: [{ id: 't', title: 'T', projects: [{ id: 'a', title: 'A', start, end }] }] })[0];
        const last = DATE_LIB.toISO(TERM.lastDay(DATE_LIB.fromISO(end)));
        const mm = s => `${s.slice(8, 10)}.${s.slice(5, 7)}`;
        assert.ok(opis.endsWith(`→ ${mm(start)}–${mm(last)}`), `${tz} ${end}: ${opis}`);
      }
    }
  } finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
});

test('endIncl: brak daty, jednodniowy termin i nieparzyste wejście nie zrywają opisu zmian', () => {
  const { PLAN_LIB } = createGas();
  const p = (start, end) => ({ tabs: [{ id: 't', title: 'T', projects: [{ id: 'a', title: 'A', start, end }] }] });
  assert.deepEqual([...PLAN_LIB.describeChanges(p('2026-11-04', '2026-11-05'), p('2026-11-04', null))], ['„A”: termin 04.11–04.11 → 04.11–—']);
  assert.deepEqual([...PLAN_LIB.describeChanges(p(null, null), p('2026-11-04', '2026-11-05'))], ['„A”: termin —–— → 04.11–04.11']);
});

test('termin: PlanLib.gs i Code.gs mają jedną zamianę końca (endIncl), bez innych „±1 dzień”', () => {
  const fs = require('fs'), path = require('path');
  const bad = [];
  ['PlanLib.gs', 'Code.gs'].forEach(n => fs.readFileSync(path.join(__dirname, '..', 'src', n), 'utf8').split('\n').forEach((line, i) => {
    if (/^\s*const endIncl = /.test(line)) return;                                  // jedyne dozwolone miejsce (patrz komentarz i SPEC Z-19)
    if (/addDays\(|diffDays\(|setDate\(|getDate\(\)|86400000|Date\.UTC\(/.test(line)) bad.push(`${n}:${i + 1}: ${line.trim().slice(0, 100)}`);
  }));
  assert.deepEqual(bad, []);
});
