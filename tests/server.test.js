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

test('termin: poza TERM (js-model) w kodzie nie ma ręcznych „±1 dzień” przy końcu terminu', () => {
  const fs = require('fs'), path = require('path');
  const dir = path.join(__dirname, '..', 'src');
  const bad = [];
  fs.readdirSync(dir).filter(n => /^js-.*\.html$/.test(n) && n !== 'js-testy.html').forEach(n => {
    fs.readFileSync(path.join(dir, n), 'utf8').split('\n').forEach((line, i) => {
      if (/TERM = \{|^\s+(lastDay|endAfter):/.test(line)) return;   // definicja TERM
      if (/addDays\([^()]*(end|End|Incl|doneAt|tempEnd)[^()]*,\s*-?1\)|diffDays\([^()]*\)\s*\+\s*1|addDays\(addDays\(/.test(line)) bad.push(`${n}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  });
  assert.deepEqual(bad, []);
});
