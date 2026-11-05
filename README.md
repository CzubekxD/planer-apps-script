# Planer (Apps Script)

Oś czasu portfela projektów i warsztatów OPEX jako aplikacja internetowa Google Apps Script. Dane trzyma w Arkuszu Google. Podgląd jest dla wszystkich w organizacji, edycję kart nadaje się po e-mailu, a każdy zapis trafia do historii z możliwością cofnięcia.

- **Jak ma działać:** [SPEC.md](SPEC.md)
- **Co się zmieniło:** [CHANGELOG.md](CHANGELOG.md) (szczegóły: dokument „Planer – opis zmian”)
- **Zasady pracy nad kodem (także dla Claude):** [CLAUDE.md](CLAUDE.md)

## Pliki

Wszystko, co trafia do edytora Apps Script, leży w `src/`, po jednym pliku na plik w projekcie:

| W repo | W edytorze Apps Script | Co to |
|---|---|---|
| `Code.gs` | Code.gs | serwer: wczytanie, zapis, historia, cofanie |
| `PlanLib.gs` | PlanLib.gs | logika wspólna serwera i przeglądarki (opis zmian, uprawnienia edytora) |
| `Index.html` | Index | szkielet strony |
| `Styles.html` | Styles | wygląd |
| `js-*.html` | js-model, js-os, js-karta, js-portfel, js-historia, js-miary, js-testy, js-start | aplikacja w przeglądarce |
| `appsscript.json` | manifest (Ustawienia projektu → „Pokaż plik manifestu”) | strefa czasowa, „wykonaj jako ja”, dostęp w domenie |

## Pierwsze wdrożenie (nowy projekt Apps Script)

1. [script.google.com](https://script.google.com) → Nowy projekt → nazwa „Planer”.
2. Dodaj pliki: **+ → Skrypt** dla `Code`, `PlanLib`, a **+ → HTML** dla `Index`, `Styles` i każdego `js-…`. Nazwy bez rozszerzeń. Do każdego wklej zawartość z `src/` (Ctrl+A, wklej, Ctrl+S).
3. W `Code.gs` w linii `const OWNERS = ['twoj.email@firma.pl'];` wpisz swój służbowy e-mail małymi literami.
4. Ustawienia projektu → Strefa czasowa: **(GMT+01:00) Warszawa**.
5. **Wdróż → Nowe wdrożenie → Aplikacja internetowa**: Wykonaj jako **Ja**, Kto ma dostęp **Wszyscy w Twojej organizacji** → Wdróż → zatwierdź uprawnienia.
6. Otwórz adres `/exec`. Przy pierwszym wejściu skrypt sam założy Arkusz „Planer – dane” na Twoim Dysku.

## Aktualizacja (każda kolejna paczka)

1. Podmień **tylko pliki wymienione przy zmianie** (zwykle 1–3): Ctrl+A, wklej, Ctrl+S. Na dole każdego `js-…` musi być linia `// ===== KONIEC js-… (wersja …)`.
2. **Wdróż → Zarządzaj wdrożeniami → ołówek → Wersja: Nowa wersja → Wdróż.**
   Nie „Nowe wdrożenie”: to tworzy nowy adres, a stary dalej pokazuje stary kod.
3. Odśwież planer przez Ctrl+F5. Brak czerwonego paska oznacza, że wszystkie pliki są w dobrej wersji.
4. Test zapisu: 2–3 szybkie zmiany, poczekaj na „Zapisano w Arkuszu”, F5. Zmiany muszą zostać.

## Warto wiedzieć

- **Czerwony pasek na górze** oznacza, że planer czegoś nie zapisał albo któryś plik jest w złej wersji. Komunikat mówi, który plik i co zrobić.
- Adres **/dev** pokazuje ostatnio zapisany kod, ale pisze do **tego samego** Arkusza co /exec, więc zmiany w projektach są prawdziwe.
- **Cofanie w Historii przywraca cały plan**, łącznie z późniejszymi zmianami innych osób.
- Gdzie są dane: w edytorze wybierz funkcję `gdzieSaDane` → Uruchom → Dziennik wykonania pokaże adres Arkusza.
- Testy w przeglądarce: dopisz `?test` do adresu. Okno pokazuje się tylko, gdy coś jest NOK.

## Testy na komputerze (dla Claude / programisty)

Wymaga Node 20+. Prawdziwy `Code.gs` + `PlanLib.gs` chodzi na atrapie Apps Script (`tests/mock-gas.js`), a przeglądarka (Playwright, Chromium) ładuje prawdziwy Index ze wszystkimi `js-*`.

```bash
npm install
npx playwright install chromium
npm test              # serwer + przeglądarka
npm run test:server   # tylko serwer (szybkie, bez przeglądarki)
npm run paczka        # dist/planer-<wersja>.zip do wysłania / wklejenia
```

Testy uruchamiają się też same na GitHubie przy każdym pushu (zakładka Actions).
