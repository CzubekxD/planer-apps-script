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
  assert.ok(res.length >= 55, `testów: ${res.length}`);   // stan na paczkę 05g: 55
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
  assert.deepEqual(await page.evaluate(() => [Perm.isOwner, canEditAny()]), [false, true]);
  assert.equal(await page.locator('.klocek.edytowalny').count(), 1);
  await rename(page, 'a', 'Karta Jana v2');
  await rename(page, 'b', 'Cudza HACK');
  await settle(page);
  assert.deepEqual(titles(gas), ['Cudza', 'Karta Jana v2']);
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
  assert.equal(await page.evaluate(() => canEditAny()), false);
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
