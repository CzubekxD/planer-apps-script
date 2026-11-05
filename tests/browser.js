// Otwiera planer w Chromium (Playwright) podpięty do atrapy Apps Script.
// google.script.run w przeglądarce → page.exposeFunction → gas.call(...) w Node, z opóźnieniem jak prawdziwy serwer.
'use strict';
const { chromium } = require('playwright');

let browserP = null;
const browser = () => (browserP = browserP || chromium.launch());
async function closeBrowser() { if (browserP) await (await browserP).close(); browserP = null; }

// Podstawiony google.script.run: withSuccessHandler / withFailureHandler / dowolnaFunkcja(...args)
const RUN_STUB = () => {
  const make = (ok, fail) => new Proxy({}, {
    get: (_, name) => {
      if (name === 'withSuccessHandler') return h => make(h, fail);
      if (name === 'withFailureHandler') return h => make(ok, h);
      return (...args) => {
        window.__gasCall(String(name), JSON.stringify(args)).then(r => {
          const res = JSON.parse(r);
          if (res.error) { if (fail) fail(new Error(res.error)); }
          else if (ok) ok(res.value);
        });
      };
    }
  });
  window.google = { script: { run: make(null, null) } };
};

/**
 * @param gas   atrapa z createGas()
 * @param opts  user (e-mail), delay (ms odpowiedzi serwera), query ('?test'), html (własny HTML zamiast doGet)
 */
async function openPlaner(gas, { user, delay = 0, query = '', html } = {}) {
  const ctx = await (await browser()).newContext({ viewport: { width: 1400, height: 900 }, locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.pending = 0;
  await page.exposeFunction('__gasCall', async (name, argsJson) => {
    page.pending++;
    try {
      if (delay) await new Promise(r => setTimeout(r, delay));
      try { return JSON.stringify({ value: gas.call(name, JSON.parse(argsJson), user ?? gas.state.user) ?? null }); }
      catch (e) { return JSON.stringify({ error: e.message }); }
    } finally { page.pending--; }
  });
  await page.addInitScript(RUN_STUB);
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.route('https://planer.test/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html ?? gas.doGet(query.includes('test') ? { test: '' } : {}) }));
  await page.goto('https://planer.test/' + query);
  await page.waitForFunction(() => typeof AppState !== 'undefined' && /Wczytano|Zapis|Podgląd|Edytujesz|Brak połączenia/.test(document.getElementById('statusZapisu').textContent));
  page.close2 = () => ctx.close();
  return page;
}

// Czeka, aż przeglądarka nie ma nic do zapisania i serwer nic nie przetwarza
async function settle(page) {
  await page.waitForFunction(() => !saveInFlight && !savePending && !document.getElementById('statusZapisu').textContent.startsWith('Zapisywanie'), null, { timeout: 20000 });
  await page.waitForTimeout(50);
  while (page.pending) await page.waitForTimeout(50);
}

// Zmiana w planie tak, jak robi to UI: modyfikacja AppState + save()
const edit = (page, fn, arg) => page.evaluate(([src, a]) => { (0, eval)(`(${src})`)(a); renderAll(); }, [fn.toString(), arg]);

module.exports = { openPlaner, settle, edit, closeBrowser };
