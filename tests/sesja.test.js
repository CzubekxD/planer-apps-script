// Sesja planu (src/js-sesja.html) w Node: prawdziwy Code.gs + PlanLib.gs na atrapie, a odpowiedzi serwera
// wypuszczamy ręcznie (srv.respond()), żeby sterować wyścigami.  Uruchom: npm run test:sesja
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createGas, OWNER } = require('./mock-gas');

const EDITOR = 'jan@firma.pl';
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'js-sesja.html'), 'utf8');
const clone = v => JSON.parse(JSON.stringify(v));
const tick = () => new Promise(r => setImmediate(r));
async function until(cond, what) { for (let i = 0; i < 500; i++) { if (cond()) return; await tick(); } throw new Error('nie doczekałem się: ' + what); }

// Plan w postaci porównywalnej (tak, jak zwraca normalize w planerze)
const proj = (id, title, extra = {}) => ({ id, title, editors: [], ...extra });
const plan = (...projects) => ({ wipLimit: 2, horizonMonths: 20, tabs: [{ id: 't1', title: 'Portfolio', projects }] });
const titles = p => p.tabs.flatMap(t => t.projects.map(x => x.title));

// Adapter serwera z ręcznym wypuszczaniem odpowiedzi
function manualServer(gas, user) {
  const queue = [];
  const call = (name, args) => new Promise((resolve, reject) => queue.push({ name, run: () => { try { resolve(gas.call(name, clone(args), user)); } catch (e) { reject(e); } } }));
  return {
    queue,
    load: () => call('loadPlan', []),
    save: (p, v) => call('savePlan', [p, v]),
    restore: id => call('restoreVersion', [id]),
    async respond(name) {
      await until(() => queue.length, `wywołania ${name || 'serwera'}`);
      const c = queue.shift();
      if (name) assert.equal(c.name, name, 'kolejność wywołań serwera');
      c.run(); await tick(); await tick();
    }
  };
}

// Planer w miniaturze: „ekran” trzyma plan, sesja go czyta i podmienia
function openSession(gas, { user = OWNER, editable = () => true } = {}) {
  const ctx = vm.createContext({ window: { __planerParts: [] }, console, setTimeout, clearTimeout, JSON, Date, Math, Promise, Set, Map });
  vm.runInContext(SRC, ctx, { filename: 'js-sesja.html' });
  const srv = manualServer(gas, user);
  const ui = { plan: null, alarms: [], statuses: [] };
  const session = ctx.createPlanSession({
    server: srv,
    readPlan: () => clone(ui.plan),
    applyPlan: p => { ui.plan = clone(p); },
    normalize: p => p ? { wipLimit: p.wipLimit, horizonMonths: p.horizonMonths, tabs: clone(p.tabs || []) } : { wipLimit: 2, horizonMonths: 20, tabs: [] },
    canSave: editable,
    report: { status: t => ui.statuses.push(t), alarm: t => ui.alarms.push(t) },
    delay: 0
  });
  return { session, srv, ui, edit(fn) { fn(ui.plan); session.changed(); } };
}
async function opened(gas, opts) {
  const s = openSession(gas, opts);
  const p = s.session.load();
  await s.srv.respond('loadPlan');
  s.ui.plan = clone((await p).data || plan());
  return s;
}
const stored = gas => gas.storedPlan();

test('sesja: szybkie zmiany przy wolnym serwerze — jeden zapis w locie, ostatni stan trafia do Arkusza', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null], OWNER);
  const s = await opened(gas);
  s.edit(p => { p.tabs[0].projects[0].title = 'A1'; });
  await until(() => s.srv.queue.length === 1, 'pierwszego zapisu');
  s.edit(p => { p.tabs[0].projects[0].title = 'A2'; });
  s.edit(p => { p.tabs[0].projects.push(proj('b', 'B')); });
  await tick();
  assert.equal(s.srv.queue.length, 1, 'drugi zapis czeka na odpowiedź pierwszego');
  await s.srv.respond('savePlan');
  s.edit(p => { p.tabs[0].projects[0].title = 'A3'; });     // kolejna zmiana, gdy drugi zapis jest w locie…
  s.edit(p => { p.tabs[0].projects[0].title = 'A2'; });     // …i od razu cofnięta: nic nowego do wysłania
  await new Promise(r => setTimeout(r, 5));                 // odliczanie do zapisu mija, gdy zapis jest jeszcze w locie
  await s.srv.respond('savePlan');
  await until(() => s.session.idle(), 'końca zapisów');
  assert.equal(s.srv.queue.length, 0);
  assert.deepEqual(titles(stored(gas)), ['A2', 'B']);
  assert.deepEqual(s.ui.alarms, []);
});

test('sesja: render bez zmian nie wysyła zapisu', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null], OWNER);
  const s = await opened(gas);
  s.session.changed(); s.session.changed();
  await tick(); await tick();
  assert.equal(s.srv.queue.length, 0);
  assert.equal(s.session.idle(), true);
});

test('sesja: zmiana cofnięta, zanim wyszedł zapis — bez zapisu, a status nie wisi na „Zapisywanie…”', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null], OWNER);
  const s = await opened(gas);
  s.edit(p => { p.tabs[0].projects[0].title = 'A1'; });
  s.edit(p => { p.tabs[0].projects[0].title = 'A'; });
  await until(() => s.session.idle(), 'spokoju');
  assert.equal(s.srv.queue.length, 0);
  assert.match(s.ui.statuses.at(-1), /Zapisano/);
});

test('sesja: konflikt z inną kartą — scalenie projekt po projekcie, obie zmiany w Arkuszu', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A'), proj('b', 'B')), null], OWNER);
  const s = await opened(gas);
  gas.call('savePlan', [plan(proj('a', 'A z drugiej karty'), proj('b', 'B')), 1], OWNER);   // ktoś zapisał w międzyczasie
  s.edit(p => { p.tabs[0].projects[1].title = 'B moje'; });
  await s.srv.respond('savePlan');   // → conflict
  await s.srv.respond('loadPlan');
  await s.srv.respond('savePlan');
  await until(() => s.session.idle(), 'końca scalania');
  assert.deepEqual(titles(stored(gas)), ['A z drugiej karty', 'B moje']);
  assert.deepEqual(titles(s.ui.plan), ['A z drugiej karty', 'B moje']);
  assert.deepEqual(s.ui.alarms, []);
});

test('sesja: przywrócenie w trakcie zapisu czeka na zapis, a kolejna zmiana idzie bez fałszywego konfliktu', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'v1')), null], OWNER);
  gas.call('savePlan', [plan(proj('a', 'v2')), 1], OWNER);
  const v1 = gas.call('listHistory').find(e => e.changes.some(c => c.startsWith('Nowy projekt'))).id;
  const s = await opened(gas);
  s.edit(p => { p.tabs[0].projects[0].title = 'v3'; });
  await until(() => s.srv.queue.length === 1, 'zapisu v3');
  const restored = s.session.restore(v1);          // użytkownik klika „Cofnij” w trakcie zapisu
  await tick();
  assert.equal(s.srv.queue.length, 1, 'przywrócenie czeka, aż zapis się skończy');
  await s.srv.respond('savePlan');
  await s.srv.respond('restoreVersion');
  await restored;
  assert.deepEqual(titles(s.ui.plan), ['v1']);
  s.edit(p => { p.tabs[0].projects[0].title = 'v1 poprawione'; });
  await s.srv.respond('savePlan');
  await until(() => s.session.idle(), 'zapisu po przywróceniu');
  assert.equal(s.srv.queue.length, 0, 'bez scalania: wersja po przywróceniu jest aktualna');
  assert.deepEqual(titles(stored(gas)), ['v1 poprawione']);
  assert.deepEqual(s.ui.alarms, []);
});

test('sesja: edytor karty — zmiany poza jego kartą pominięte, ekran pokazuje prawdziwy stan Arkusza', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'Jana', { editors: [EDITOR] }), proj('b', 'Cudza')), null], OWNER);
  const s = await opened(gas, { user: EDITOR });
  s.edit(p => { p.tabs[0].projects[0].title = 'Jana v2'; p.tabs[0].projects[1].title = 'HACK'; });
  await s.srv.respond('savePlan');   // → ignored
  await s.srv.respond('loadPlan');   // pokaż prawdziwy stan
  await until(() => s.session.idle(), 'odświeżenia');
  assert.deepEqual(titles(stored(gas)), ['Jana v2', 'Cudza']);
  assert.deepEqual(titles(s.ui.plan), ['Jana v2', 'Cudza']);
  s.edit(p => { p.tabs[0].projects[0].title = 'Jana v3'; });
  await s.srv.respond('savePlan');
  await until(() => s.session.idle(), 'kolejnego zapisu');
  assert.equal(s.srv.queue.length, 0, 'bez konfliktu po pominięciu');
  assert.deepEqual(titles(stored(gas)), ['Jana v3', 'Cudza']);
});

test('sesja: błąd Arkusza przy zapisie — alarm i wstrzymanie kolejnych zapisów', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null], OWNER);
  const s = await opened(gas);
  gas.breakSheet();
  s.edit(p => { p.tabs[0].projects[0].title = 'A1'; });
  await s.srv.respond('savePlan');
  assert.equal(s.ui.alarms.length, 1);
  assert.match(s.ui.alarms[0], /NIE zapisała się/);
  s.edit(p => { p.tabs[0].projects[0].title = 'A2'; });
  await tick(); await tick();
  assert.equal(s.srv.queue.length, 0, 'po błędzie nic nie idzie „w próżnię”');
});

test('sesja: bez prawa edycji (podgląd, obserwator) nic nie wysyła', async () => {
  const gas = createGas();
  gas.call('savePlan', [plan(proj('a', 'A')), null], OWNER);
  const s = await opened(gas, { editable: () => false });
  s.edit(p => { p.tabs[0].projects[0].title = 'X'; });
  await tick(); await tick();
  assert.equal(s.srv.queue.length, 0);
});

test('sesja: Arkusz niedostępny przy wczytaniu — load zgłasza błąd, zmiany nie idą do serwera', async () => {
  const gas = createGas();
  gas.breakSheet();
  const s = openSession(gas);
  const rejected = assert.rejects(s.session.load(), /Dysku/);
  await s.srv.respond('loadPlan');
  await rejected;
  s.ui.plan = plan();
  s.edit(pl => { pl.tabs[0].projects.push(proj('a', 'A')); });
  await tick(); await tick();
  assert.equal(s.srv.queue.length, 0);
  assert.equal(s.session.available(), false);
});
