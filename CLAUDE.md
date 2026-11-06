# Planer — zasady pracy

Web app Google Apps Script. Kod w `src/` wkleja do edytora Apps Script ręcznie użytkownik (Mati, OPEX lead, nie programista, pisze po polsku). Jak planer ma działać: `SPEC.md`. Założenia **[Z-n]** w SPEC są kontraktem i każde ma test.

## Użytkownik
- Rozmawiaj po polsku, konkretnie, krok po kroku. Mati nie edytuje kodu sam, tylko podmienia całe pliki.
- **Utrata danych to błąd krytyczny.** Każdą zmianę zapisu, scalania, dat albo uprawnień przetestuj (`npm test`), zanim ją oddasz.
- Przy zgłoszeniu „nie działa” najpierw ustal, co jest wdrożone. Czerwony pasek kontroli wersji mówi, który plik jest stary.

## Każda zmiana kodu
1. Test najpierw: logika przeglądarki → `test(...)` w `src/js-testy.html`; serwer → `tests/server.test.js`; zachowanie całości (zapis, konflikty, UI) → `tests/e2e.test.js`.
2. **Podbij wersję zmienionego pliku** w obu miejscach: w stopce pliku (komentarz `KONIEC … (wersja X)` i `__planerParts.push('<plik>@X')`) oraz w mapie `PLANER_FILES` w `js-start`. Zmiana `Code.gs` lub `PlanLib.gs` → `CODE_VERSION` = `PLAN_LIB_VERSION` = `PLANER_VERSION` (js-start). Wersje mają postać `RRRR-MM-DD` + litera kolejnej poprawki tego dnia. Test `kontrola wklejenia` pilnuje zgodności.
3. `npm test` musi być zielony.
4. Dopisz wiersz na górze `CHANGELOG.md` (data, obszar, zmiana, pliki) i ten sam wiersz w dokumencie Claude Docs „Planer – opis zmian” (https://claude.ai/artifact/QyogqBV1iVy6r7AbxTXDQV), łącznie z numerem paczki w akapicie wstępnym.
5. `npm run paczka` → wyślij zip i wypisz wprost, **które pliki podmienić** (zwykle 1–3) i że wdrożenie to *Zarządzaj wdrożeniami → ołówek → Nowa wersja → Wdróż*.

## Stałe decyzje
- Zostaje podział na pliki. Nie sklejamy w jeden Index (temat zamknięty).
- Index skleja `js-*` w **jeden** `<script>` przez `include()`, a kolejność ma znaczenie. Pliki `js-*` to czysty JavaScript bez znaczników `<script>`. Stałe z wcześniejszego pliku są widoczne w późniejszych.
- `PlanLib.gs` jest jedynym źródłem `describeChanges` / `mergeForEditor`. Przeglądarka dostaje ten sam kod przez `planLibSource()`, więc nie kopiuj tej logiki do `js-*`.
- Uprawnienia egzekwuje serwer. Przeglądarka tylko ukrywa przyciski.
- Bez Arkusza edycja jest zablokowana. Nie ma przycisku „Przeładuj” (kasował zmiany). Konflikty rozwiązuje `mergePlans`.
- Zapis do Arkusza (wersja, kolejka, konflikty, przywrócenie) robi wyłącznie `createPlanSession` w `js-sesja`. Nie zna DOM ani `google.script.run`: dostaje adapter serwera i funkcje ekranu. Reszta kodu woła tylko `save()` (→ `session.changed()`) i `session.restore(id)`.
- Reguły zmiany statusu, zobowiązania i planu pierwotnego są tylko w `saveCard` (js-model). Karta zbiera dane i woła `saveCard`; nowy obiekt projektu zastępuje stary (poprzedni nietknięty, więc Anuluj nic nie zmienia).
- „W trakcie” w okresie liczy tylko `ongoingIn` / `stateInPeriod` (js-model). Portfel, KPI i Miary nie piszą własnych warunków na daty i statusy.
- Przyspieszanie ładowania (CacheService) odłożone świadomie.

## Testy
- `tests/mock-gas.js`: atrapa SpreadsheetApp / Session / LockService / PropertiesService / HtmlService. Uruchamia prawdziwe `Code.gs` + `PlanLib.gs` w `vm`, a Arkusz trzyma w pamięci (`gas.sheet(name)`, `gas.breakSheet()`).
- `tests/sesja.test.js`: `js-sesja` w Node na atrapie, odpowiedzi serwera wypuszczane ręcznie (`srv.respond()`), więc wyścigi są deterministyczne. Każda zmiana zapisu zaczyna się od testu tutaj.
- `tests/browser.js`: `openPlaner(gas, { user, delay, query, html })` otwiera prawdziwy Index w Chromium. `google.script.run` idzie do atrapy z opóźnieniem `delay` ms, jak wolny Apps Script. `edit(page, fn)` zmienia `AppState` i woła `renderAll()`, czyli dokładnie tę ścieżkę zapisu, której używa UI. `settle(page)` czeka na koniec zapisów.
- W tym środowisku Playwright jest preinstalowany globalnie: `NODE_PATH=$(npm root -g) npm test`, bez `npm install` i `playwright install`.
- Brakuje jeszcze testu e2e przeciągania (nowy wiersz, pas innej osoby, ramka „tu wyląduje” = miejsce po upuszczeniu).

## Agent skills

### Issue tracker

Zadania (poprawki, pomysły, porządki) są w GitHub Issues repo `CzubekxD/planer-apps-script`, obsługiwane przez `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Domyślne etykiety: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: jeden `CONTEXT.md` i `docs/adr/` w głównym folderze. See `docs/agents/domain.md`.
