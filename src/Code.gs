/**
 * Planer — serwer (Apps Script, V8)
 *
 * WDROŻENIE: Wdróż → Aplikacja internetowa
 *   • Wykonaj jako: JA (właściciel)       ← skrypt pisze do Arkusza Twoimi uprawnieniami
 *   • Kto ma dostęp: wszyscy w organizacji
 *   • Arkusz udostępnij innym najwyżej do podglądu (albo wcale) — wtedy jedyną drogą zmiany jest savePlan poniżej.
 *
 * UPRAWNIENIA
 *   • OWNERS — pełna edycja, lista edytorów kart, cofanie historii.
 *   • Edytor karty — e-mail wpisany w polu „Kto może edytować tę kartę”: zmienia tylko te karty
 *     (nie dodaje, nie usuwa, nie przenosi między zakładkami, nie zmienia listy edytorów). Reszta zmian z jego zapisu jest ignorowana.
 *   • Pozostali — podgląd.
 *
 * Pliki projektu: Code.gs (serwer), PlanLib.gs (logika wspólna), Index (szkielet), Styles (CSS), js-* (aplikacja).
 */
const CODE_VERSION = '2026-11-06';   // musi się zgadzać z wersją plików js-* (kontrola wklejenia)
const OWNERS = ['twoj.email@firma.pl'];   // ← wpisz swój służbowy e-mail (małe litery)
const SHEET_ID = '';   // opcjonalnie: ID istniejącego Arkusza. Puste = skrypt sam założy „Planer – dane” na Twoim Dysku
const PLAN_SHEET = 'Planer_dane';      // A1 = wersja, B1… = plan (JSON)
const LOG_SHEET = 'Planer_dziennik';   // historia zmian z kopiami planu
const CHUNK = 45000;          // limit komórki to 50 000 znaków — JSON dzielimy na kawałki
const KEEP_SNAPSHOTS = 200;   // tyle ostatnich wpisów trzyma pełną kopię planu do cofania (historia pokazuje 100)
const TYPE_START = 'start', TYPE_RESTORE = 'przywrócenie';   // kolumna E w Dzienniku

function doGet(e) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.runTests = !!(e && e.parameter && 'test' in e.parameter);   // adres web appa + ?test
  return t.evaluate()
    .setTitle('Planer')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}
// Dołącza plik HTML z projektu jako tekst (Styles, js-*)
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ---------- API wołane z HTML ----------
function loadPlan() {
  const user = currentUser_();
  const cur = readPlan_();
  return { data: cur.data, version: cur.version, user: user, isOwner: isOwner_(user), parts: { code: CODE_VERSION, planLib: PLAN_LIB_VERSION } };
}

function savePlan(incoming, version) {
  const user = currentUser_();
  if (!user) return { denied: true, error: 'Brak e-maila użytkownika — zapis zablokowany.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = readPlan_();
    if (version != null && cur.version != null && Number(version) !== Number(cur.version)) return { conflict: true };
    const empty = p => !p || !(p.tabs || []).some(t => (t.projects || []).length);
    if (empty(cur.data) && empty(incoming)) return { version: cur.version };   // pusty Arkusz + pusty plan — nie śmiecimy w dzienniku
    const owner = isOwner_(user);
    let next = incoming, ignored = false;
    if (!owner) {
      const r = PLAN_LIB.mergeForEditor(cur.data, incoming, user);
      next = r.plan; ignored = r.ignored;
    }
    const changes = PLAN_LIB.describeChanges(cur.data, next);
    if (!changes.length) return { version: cur.version, ignored: ignored };   // nic się nie zmieniło — bez zapisu
    ensureInitialLog_(cur.data);
    const v = (Number(cur.version) || 0) + 1;
    writePlan_(next, v);
    logChange_(user, next, false);
    return { version: v, ignored: ignored };
  } finally {
    lock.releaseLock();
  }
}

function listHistory() {
  const sh = logSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const from = Math.max(2, last - 99);
  const rows = sh.getRange(from, 1, last - from + 1, 6).getValues();
  return rows.map(r => ({
    id: String(r[2]), ts: new Date(r[0]).getTime(), user: String(r[1]),
    changes: String(r[3]).split('\n').filter(Boolean),
    restore: r[4] === TYPE_RESTORE, initial: r[4] === TYPE_START,
    hasSnapshot: r[5] !== ''
  }));
}

function restoreVersion(id) {
  const user = currentUser_();
  if (!isOwner_(user)) return { error: 'Cofać zmiany może tylko właściciel planu.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = logSheet_();
    const ids = sh.getRange(2, 3, Math.max(1, sh.getLastRow() - 1), 1).getValues().map(r => String(r[0]));
    const i = ids.lastIndexOf(String(id));
    if (i < 0) return { error: 'Nie znaleziono wpisu.' };
    const row = i + 2;
    const snap = readChunks_(sh, row, 6);
    if (!snap) return { error: 'Ten wpis nie ma już kopii planu (za stary).' };
    const data = JSON.parse(snap);
    const v = (Number(readPlan_().version) || 0) + 1;
    writePlan_(data, v);
    const when = Utilities.formatDate(new Date(sh.getRange(row, 1).getValue()), Session.getScriptTimeZone(), 'dd.MM.yyyy HH:mm');
    logChange_(user, data, true, ['Przywrócono stan z ' + when]);
    return { data: data, version: v };
  } finally {
    lock.releaseLock();
  }
}

// ---------- przechowywanie planu ----------
// Arkusz „Planer_dane”: A1 = wersja, B1… = JSON w kawałkach
function readPlan_() {
  const sh = sheet_(PLAN_SHEET);
  const version = sh.getRange(1, 1).getValue();
  const json = readChunks_(sh, 1, 2);
  return { data: json ? JSON.parse(json) : null, version: version === '' ? null : Number(version) };
}
function writePlan_(data, version) {
  const sh = sheet_(PLAN_SHEET);
  sh.getRange(1, 1).setValue(version);
  writeChunks_(sh, 1, 2, JSON.stringify(data));
}

// ---------- dziennik ----------
// Arkusz „Planer_dziennik”: A czas · B kto · C id · D zmiany · E typ · F… kopia planu (JSON w kawałkach)
function logSheet_() {
  const sh = sheet_(LOG_SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(['Czas', 'Kto', 'Id', 'Zmiany', 'Typ', 'Kopia planu']);
  return sh;
}
function ensureInitialLog_(data) {
  const sh = logSheet_();
  if (sh.getLastRow() > 1 || !data) return;
  const row = 2;
  sh.getRange(row, 1, 1, 5).setValues([[new Date(), '', 'p' + Date.now(), 'Stan początkowy', TYPE_START]]);
  writeChunks_(sh, row, 6, JSON.stringify(data));
}
// Każdy zapis z realną zmianą = osobny wiersz z kopią planu (można cofnąć dokładnie tę zmianę)
function logChange_(user, snapshot, isRestore, fixedChanges) {
  const sh = logSheet_();
  const last = sh.getLastRow();
  const prev = last >= 2 ? readChunks_(sh, last, 6) : '';
  const changes = fixedChanges || PLAN_LIB.describeChanges(prev ? JSON.parse(prev) : null, snapshot);
  const row = last + 1, now = new Date();
  sh.getRange(row, 1, 1, 5).setValues([[now, user, 'w' + now.getTime(), changes.join('\n'), isRestore ? TYPE_RESTORE : '']]);
  writeChunks_(sh, row, 6, JSON.stringify(snapshot));
  if (row % 50 === 0) pruneSnapshots_(sh);
}
function pruneSnapshots_(sh) {
  const last = sh.getLastRow(), stop = last - KEEP_SNAPSHOTS;
  if (stop < 3) return;
  const width = Math.max(1, sh.getLastColumn() - 5);
  sh.getRange(3, 6, stop - 2, width).clearContent();   // wiersz 2 (stan początkowy) zostaje
}

// ---------- pomocnicze ----------
function currentUser_() { return String(Session.getActiveUser().getEmail() || '').toLowerCase(); }
function isOwner_(user) { return !!user && OWNERS.map(e => e.toLowerCase()).indexOf(user) >= 0; }
function sheet_(name) {
  const ss = spreadsheet_();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
// Skąd brać Arkusz: 1) skrypt założony z Arkusza, 2) SHEET_ID wpisany ręcznie, 3) Arkusz założony przez skrypt (ID w Właściwościach skryptu)
function spreadsheet_() {
  const active = SpreadsheetApp.getActive();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = SHEET_ID || props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Planer – dane');   // pierwsze uruchomienie: zakładamy Arkusz na Dysku właściciela
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}
// Uruchom w edytorze (wybierz gdzieSaDane → Uruchom), żeby zobaczyć w Dzienniku wykonania adres Arkusza z danymi
function gdzieSaDane() {
  Logger.log(spreadsheet_().getUrl());
}
function readChunks_(sh, row, col) {
  const lastCol = sh.getLastColumn();
  if (lastCol < col) return '';
  return sh.getRange(row, col, 1, lastCol - col + 1).getValues()[0].join('');
}
function writeChunks_(sh, row, col, text) {
  const parts = [];
  for (let i = 0; i < text.length; i += CHUNK) parts.push(text.slice(i, i + CHUNK));
  const lastCol = sh.getLastColumn();
  if (lastCol >= col) sh.getRange(row, col, 1, lastCol - col + 1).clearContent();
  if (parts.length) sh.getRange(row, col, 1, parts.length).setValues([parts]);
}
