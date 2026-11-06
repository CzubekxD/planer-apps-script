// Testy w przeglądarce: prawdziwy Index + js-* w Chromium, serwer = atrapa Apps Script.  Uruchom: npm run test:e2e
'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { createGas, OWNER } = require('./mock-gas');
const { openPlaner, settle, edit, closeBrowser } = require('./browser');

after(closeBrowser);

const EDITOR = 'jan@firma.pl';
const proj = (id, title, extra = {}) => ({ id, title, status: 'planned', start: '2026-11-02', end: '2026-11-30',
  assignments: [{ group: 'team', role: 'Kupiec', person: 'Jan' }], milestones: [], editors: [], ...extra });
const seed = (gas, ...projects) => gas.call('savePlan', [{ wipLimit: 2, horizonMonths: 20, tabs: [{ id: 't1', title: 'Portfolio', projects }] }, null], OWNER);
const titles = gas => gas.storedPlan().tabs.flatMap(t => t.projects.map(p => p.title)).sort();
const addProject = (page, p) => edit(page, p => { AppState.projects.push(normProject(p)); }, p);
const rename = (page, id, title) => edit(page, ([id, title]) => { AppState.projects.find(p => p.id === id).title = title; }, [id, title]);
const alarmText = page => page.evaluate(() => (document.getElementById('alarmPasek') || {}).textContent || '');

test('start: wszystkie testy w przeglądarce OK, brak czerwonego paska i błędów JS', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'Kaizen'));
  const page = await openPlaner(gas, { query: '?test' });
  const res = await page.evaluate(() => runTests());
  const bad = res.filter(r => !r.ok);
  assert.deepEqual(bad, [], 'testy NOK w js-testy');
  assert.ok(res.length >= 93, `testów: ${res.length}`);   // stan na paczkę 06f: 93
  assert.equal(await alarmText(page), '');
  assert.deepEqual(page.errors, []);
  assert.equal(await page.locator('.klocek').count(), 1);
  await page.close2();
});

test('wyścig zapisów: 3 szybkie zmiany przy wolnym serwerze (1,5 s) — wszystkie trafiają do Arkusza', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'A'));
  const page = await openPlaner(gas, { delay: 1500 });
  await addProject(page, proj('b', 'B'));
  await page.waitForTimeout(900);            // pierwszy zapis już „w locie”
  await addProject(page, proj('c', 'C'));
  await page.waitForTimeout(900);
  await rename(page, 'a', 'A zmienione');
  await settle(page);
  assert.deepEqual(titles(gas), ['A zmienione', 'B', 'C']);
  assert.equal(await alarmText(page), '');
  assert.match(await page.textContent('#statusZapisu'), /Zapisano w Arkuszu/);
  await page.close2();
});

test('dwie karty przeglądarki, różne projekty → obie zmiany zostają, bez alarmu', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'A'), proj('b', 'B'));
  const p1 = await openPlaner(gas), p2 = await openPlaner(gas);
  await rename(p1, 'a', 'A z karty 1'); await settle(p1);
  await rename(p2, 'b', 'B z karty 2'); await settle(p2);   // p2 ma starą wersję → conflict → scalenie
  assert.deepEqual(titles(gas), ['A z karty 1', 'B z karty 2']);
  assert.equal(await alarmText(p2), '');
  await p1.close2(); await p2.close2();
});

test('dwie karty, ten sam projekt → ostrzeżenie, wygrywa ostatni, obie wersje w Historii', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'A'));
  const p1 = await openPlaner(gas), p2 = await openPlaner(gas);
  await rename(p1, 'a', 'A wersja 1'); await settle(p1);
  await rename(p2, 'a', 'A wersja 2'); await settle(p2);
  assert.deepEqual(titles(gas), ['A wersja 2']);
  assert.match(await alarmText(p2), /zmienił też ktoś inny/);
  const changes = gas.call('listHistory').flatMap(e => e.changes).join('\n');
  assert.match(changes, /A wersja 1/);
  assert.match(changes, /A wersja 2/);
  await p1.close2(); await p2.close2();
});

test('edytor karty: widzi ołówek tylko na swojej karcie, zapis innych kart jest pomijany', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'Karta Jana', { editors: [EDITOR] }), proj('b', 'Cudza'));
  const page = await openPlaner(gas, { user: EDITOR });
  assert.deepEqual(await page.evaluate(() => [Perm.canManage(), Perm.canEditAny()]), [false, true]);
  assert.equal(await page.locator('.klocek.edytowalny').count(), 1);
  await rename(page, 'a', 'Karta Jana v2');
  await rename(page, 'b', 'Cudza HACK');
  await settle(page);
  assert.deepEqual(titles(gas), ['Cudza', 'Karta Jana v2']);
  await page.close2();
});

test('„Podgląd jako”: właściciel widzi jak edytor karty, nic nie zapisuje, po wyjściu znów jest właścicielem', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'Karta Jana', { editors: [EDITOR] }), proj('b', 'Cudza'));
  const page = await openPlaner(gas, { user: OWNER });
  const who = () => page.evaluate(() => [Perm.role(), Perm.canManage(), document.body.classList.contains('tylko-odczyt'), document.querySelectorAll('.klocek.edytowalny').length]);
  assert.deepEqual(await who(), ['owner', true, false, 2]);
  await page.selectOption('#jakoWybor', EDITOR);
  assert.deepEqual(await who(), ['editor', false, true, 1]);
  await rename(page, 'b', 'HACK'); await page.waitForTimeout(1200);
  assert.deepEqual(titles(gas), ['Cudza', 'Karta Jana']);
  await page.selectOption('#jakoWybor', '');
  await settle(page);
  assert.deepEqual(await who(), ['owner', true, false, 2]);
  await page.close2();
});

test('gość: tylko podgląd, nic nie wysyła do zapisu', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'A'));
  const page = await openPlaner(gas, { user: 'gosc@firma.pl' });
  assert.match(await page.textContent('#statusZapisu'), /Podgląd/);
  await rename(page, 'a', 'X');
  await page.waitForTimeout(1200);
  assert.ok(!gas.state.calls.includes('savePlan') || titles(gas)[0] === 'A');
  assert.deepEqual(titles(gas), ['A']);
  await page.close2();
});

test('brak Arkusza: czerwony pasek i blokada edycji', async () => {
  const gas = createGas();
  gas.breakSheet();
  const page = await openPlaner(gas);
  assert.match(await alarmText(page), /Edycja jest zablokowana/);
  assert.equal(await page.evaluate(() => document.body.classList.contains('tylko-odczyt')), true);
  assert.equal(await page.evaluate(() => Perm.canEditAny()), false);
  await page.close2();
});

test('kontrola wklejenia: ucięty plik (bez stopki) → czerwony pasek z nazwą pliku', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'A'));
  const html = gas.doGet().replace(/window\.__planerParts\.push\('js-karta@[^']+'\);/, '');
  const page = await openPlaner(gas, { html });
  assert.match(await alarmText(page), /js-karta/);
  await page.close2();
});

test('kontrola wklejenia: stary Code.gs (inna CODE_VERSION) → czerwony pasek „Code”', async () => {
  const fs = require('fs'), path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8').replace(/const CODE_VERSION = '[^']+'/, "const CODE_VERSION = '2000-01-01'");
  const gas = createGas({ files: { 'Code.gs': code } });
  seed(gas, proj('a', 'A'));
  const page = await openPlaner(gas);
  assert.match(await alarmText(page), /Code/);
  await page.close2();
});

test('podwójne kliknięcie kafla (z drgnięciem myszy do 6 px) otwiera kartę', async () => {
  const gas = createGas();
  const today = new Date(); const iso = d => d.toISOString().slice(0, 10);
  seed(gas, proj('a', 'Kafel', { start: iso(new Date(today.getTime() + 2 * 864e5)), end: iso(new Date(today.getTime() + 40 * 864e5)) }));
  for (const jitter of [0, 3, 6]) {
    const page = await openPlaner(gas);
    const box = await page.locator('.klocek').first().boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down(); await page.mouse.move(x + jitter, y); await page.mouse.up();
    await page.mouse.down(); await page.mouse.up();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.getElementById('projektModal').classList.contains('active')), true, `drgnięcie ${jitter} px`);
    await page.close2();
  }
});

test('Miary: wykres wg statusu w miesiącach, przełącznik stan / przepływ zapamiętany po odświeżeniu', async () => {
  const gas = createGas();
  const pad = n => String(n).padStart(2, '0'), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;   // data lokalna, nie UTC
  const day = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
  seed(gas, proj('a', 'W trakcie', { status: 'ongoing', start: day(-40), end: day(30), startedAt: day(-40), baselineStart: day(-40), baselineEnd: day(30) }),
    proj('b', 'Planowany', { start: day(60), end: day(90), history: [{ date: day(-10), status: 'planned' }] }));
  const page = await openPlaner(gas);
  await page.click('[data-view="miary"]');
  const karta = page.locator('.mi-status');
  assert.equal(await karta.count(), 1, 'karta wykresu statusów');
  assert.equal(await page.locator('text=WIP portfela').count(), 0, 'stary wykres „WIP portfela” zniknął');
  assert.equal(await karta.locator('svg.st-slupki').count(), 1, 'domyślnie: stan w miesiącu (słupki)');
  assert.equal(await karta.locator('svg.st-slupki rect.st-seg').count() > 0, true, 'są segmenty słupków');
  await karta.locator('button', { hasText: 'Przepływ' }).click();
  assert.equal(await page.locator('.mi-status svg.st-cfd').count(), 1, 'po kliknięciu: przepływ');
  await page.reload();
  await page.waitForFunction(() => typeof AppState !== 'undefined' && document.querySelector('.mi-status'));
  assert.equal(await page.locator('.mi-status svg.st-cfd').count(), 1, 'wybór zapamiętany');
  assert.deepEqual(page.errors, []);
  await page.close2();
});

test('przywrócenie z Historii w trakcie zapisu (wolny serwer): plan = przywrócony stan, kolejna zmiana bez scalania', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'v1'));
  gas.call('savePlan', [{ wipLimit: 2, horizonMonths: 20, tabs: [{ id: 't1', title: 'Portfolio', projects: [proj('a', 'v2')] }] }, 1], OWNER);
  const v1 = gas.call('listHistory').find(e => e.changes.some(c => c.startsWith('Nowy projekt')));
  const page = await openPlaner(gas, { delay: 800 });
  await rename(page, 'a', 'v3');
  await page.waitForTimeout(900);                                   // zapis v3 w locie
  page.on('dialog', d => d.accept());                              // „Przywrócić cały plan…?” → Tak
  await page.evaluate(id => restoreEntry({ id, ts: Date.now() }, 1), v1.id);
  await page.waitForTimeout(100);
  await settle(page);
  assert.deepEqual(titles(gas), ['v1']);
  assert.deepEqual(await page.evaluate(() => AppState.projects.map(p => p.title)), ['v1']);
  const calls = gas.state.calls.length;
  await rename(page, 'a', 'v1 poprawione');
  await settle(page);
  assert.deepEqual(gas.state.calls.slice(calls), ['savePlan'], 'jeden zapis, bez scalania');
  assert.deepEqual(titles(gas), ['v1 poprawione']);
  assert.equal(await alarmText(page), '');
  await page.close2();
});

test('karta: „Nowy plan pierwotny” + Anuluj nic nie zmienia; + Zapisz przyjmuje obecne daty', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'Opóźniony', { status: 'ongoing', start: '2026-11-09', end: '2026-12-08', startedAt: '2026-11-05', baselineStart: '2026-11-02', baselineEnd: '2026-12-01' }));
  const page = await openPlaner(gas);
  page.on('dialog', d => d.accept());
  const stan = () => { const p = gas.storedPlan().tabs[0].projects[0]; return `${p.baselineStart}..${p.baselineEnd}`; };
  const otworz = () => page.evaluate(() => openModal(AppState.projects[0]));
  await otworz();
  await page.click('#rebaselineBtn');
  await page.click('#anulujBtn');
  await settle(page);
  assert.equal(stan(), '2026-11-02..2026-12-01', 'Anuluj: plan pierwotny bez zmian');
  assert.equal(await page.evaluate(() => toLocalISO(AppState.projects[0].baselineStart)), '2026-11-02', 'Anuluj: ekran bez zmian');
  await otworz();
  await page.click('#rebaselineBtn');
  await page.click('#dodajBtn');
  await settle(page);
  assert.equal(stan(), '2026-11-09..2026-12-08', 'Zapisz: plan pierwotny = obecne daty');
  assert.equal(await alarmText(page), '');
  await page.close2();
});

test('karta: edytor karty może przyjąć nowy plan pierwotny swojej karty; napis pokazuje daty wpisane na karcie', async () => {
  const gas = createGas();
  seed(gas, proj('a', 'Karta Jana', { status: 'ongoing', editors: [EDITOR], start: '2026-11-09', end: '2026-12-08', startedAt: '2026-11-05', baselineStart: '2026-11-02', baselineEnd: '2026-12-01' }));
  const page = await openPlaner(gas, { user: EDITOR });
  page.on('dialog', d => d.accept());
  await page.evaluate(() => openModal(AppState.projects[0]));
  await page.click('#rebaselineBtn');
  await page.fill('#projKoniec', '2026-12-14');
  assert.match(await page.textContent('#baselineTekst'), /14\.12\.2026/);
  await page.click('#dodajBtn');
  await settle(page);
  const p = gas.storedPlan().tabs[0].projects[0];
  assert.equal(`${p.baselineStart}..${p.baselineEnd}`, '2026-11-09..2026-12-15');
  await page.close2();
});

test('portfel: heatmapa liczy tylko w trakcie, planowane jako szare „+N”; „W trakcie dziś” bez planowanego po dacie startu', async () => {
  const gas = createGas();
  const pad = n => String(n).padStart(2, '0'), iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const day = n => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
  seed(gas,
    proj('a', 'W trakcie', { status: 'ongoing', start: day(-20), end: day(40), startedAt: day(-20), baselineStart: day(-20), baselineEnd: day(40) }),
    proj('b', 'Planowany po dacie startu', { start: day(-5), end: day(40) }));
  const page = await openPlaner(gas);
  const kpi = await page.evaluate(() => [...document.querySelectorAll('#portfelKpi .kpi-tile')].map(t => `${t.querySelector('.l').textContent}=${t.querySelector('.v').textContent}`));
  assert.ok(kpi.includes('W trakcie dziś=1'), kpi.join(' | '));
  const komorka = await page.locator('#heatWrap tbody tr').first().locator('td').nth(1).textContent();
  assert.equal(komorka, '1+1', 'bieżący miesiąc: 1 w trakcie, +1 planowany');
  await page.close2();
});

// Przeciąganie kafla (SPEC §9): ramka „tu wyląduje” = miejsce po upuszczeniu; zakończony się nie rusza
const dragKafel = async (page, id, dx, toY, during) => {
  const box = await page.locator(`.klocek[data-id="${id}"]`).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 10, y + 10, { steps: 2 });
  // po ruszeniu pasy rosną o pusty wiersz, więc cel (toY jako funkcja) mierzymy dopiero teraz
  const ty = typeof toY === 'function' ? await toY() : (toY ?? y);
  await page.mouse.move(x + dx, ty, { steps: 5 });
  const seen = during ? await during() : null;
  await page.mouse.up();
  return seen;
};
test('przeciąganie: do pasa innej osoby, nowy wiersz — ramka podglądu = miejsce po upuszczeniu, zapis w Arkuszu', async () => {
  const gas = createGas();
  seed(gas,
    proj('a', 'Janowy', { start: '2026-12-01', end: '2027-01-01' }),
    proj('e1', 'Ewy 1', { start: '2026-12-01', end: '2027-01-01', assignments: [{ group: 'team', role: 'Kupiec', person: 'Ewa' }] }));
  const page = await openPlaner(gas);
  await edit(page, () => { AppState.viewRole = 'Kupiec'; });
  await settle(page);
  // pas Ewy: wiersz 0 zajęty (Ewy 1) → celujemy w wiersz 1 (nowy, pusty) przesuwając kafel o tydzień
  const ewaRow1 = async () => (await page.locator('.lane-track[data-person="Ewa"]').boundingBox()).y + 64 * 1.5;
  const ghost = await dragKafel(page, 'a', 140, ewaRow1, () => page.evaluate(() => {
    const g = document.querySelector('.drop-ghost'); return { person: g.parentElement.dataset.person, top: g.style.top, left: parseFloat(g.style.left) };
  }));
  assert.equal(ghost.person, 'Ewa');
  await settle(page);
  const after = await page.evaluate(() => { const k = document.querySelector('.klocek[data-id="a"]'); return { person: k.parentElement.dataset.person, top: k.style.top, left: parseFloat(k.style.left) }; });
  assert.deepEqual(after, ghost, 'podgląd = wynik');
  const a = gas.storedPlan().tabs[0].projects.find(p => p.id === 'a');
  assert.deepEqual(a.assignments.map(x => x.person), ['Ewa']);
  assert.notEqual(a.start, '2026-12-01', 'daty przesunięte');
  assert.equal(a.rowHint, 1);
  assert.deepEqual(page.errors, []);
  await page.close2();
});
test('przeciąganie: wejście w zajęty wiersz spycha inny niżej, podgląd = wynik', async () => {
  const gas = createGas();
  seed(gas,
    proj('a', 'Górny', { start: '2026-12-01', end: '2027-01-01', rowHint: 0 }),
    proj('b', 'Dolny', { start: '2026-12-01', end: '2027-01-01', rowHint: 1 }));
  const page = await openPlaner(gas);
  await edit(page, () => { AppState.viewRole = 'Kupiec'; });
  await settle(page);
  const janRow0 = async () => (await page.locator('.lane-track[data-person="Jan"]').boundingBox()).y + 32;
  const seen = await dragKafel(page, 'b', 0, janRow0, () => page.evaluate(() => ({ top: document.querySelector('.drop-ghost').style.top, tip: document.getElementById('tooltip') ? document.getElementById('tooltip').textContent : '' })));
  await settle(page);
  const tops = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.klocek')].map(k => [k.dataset.id, k.style.top])));
  assert.equal(tops.b, seen.top);
  assert.ok(parseFloat(tops.a) > parseFloat(tops.b), 'Górny zepchnięty niżej');
  await page.close2();
});
test('przeciąganie: kafel zakończonego projektu się nie rusza (ani przesunięcie, ani rozciągnięcie)', async () => {
  const gas = createGas();
  seed(gas, proj('d', 'Zrobiony', { status: 'done', start: '2026-12-01', end: '2026-12-20', startedAt: '2026-11-01', doneAt: '2026-12-19' }));
  const page = await openPlaner(gas);
  await edit(page, () => { AppState.viewRole = 'Kupiec'; AppState.showDone = true; });
  await settle(page);
  assert.equal(await page.locator('.klocek[data-id="d"]').count(), 1, 'kafel zakończonego widoczny');
  await dragKafel(page, 'd', 200);
  const h = await page.locator('.klocek[data-id="d"] .resize-right').boundingBox();
  if (h) { await page.mouse.move(h.x + 2, h.y + 5); await page.mouse.down(); await page.mouse.move(h.x + 200, h.y + 5, { steps: 5 }); await page.mouse.up(); }
  await settle(page);
  const d = gas.storedPlan().tabs[0].projects[0];
  assert.deepEqual([d.start, d.end], ['2026-12-01', '2026-12-20']);
  await page.close2();
});
