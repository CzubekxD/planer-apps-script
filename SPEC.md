# Planer — specyfikacja

Stan: paczka **2026-11-06f**. Dokument opisuje, jak planer ma działać. Każde założenie oznaczone **[Z-n]** jest pilnowane testem (tabela na końcu); zmiana kodu, która łamie założenie, jest błędem, chyba że najpierw zmienimy ten dokument.

## 1. Po co to jest

Wizualny portfel projektów i warsztatów OPEX na najbliższy rok: kto (kupiec, lider, zespół) jest zajęty czym i kiedy. Nakładające się projekty są normalne, nie są ostrzeżeniem. Karta projektu łączy metryczkę Obeya (problem → cel → KPI) ze standardem Agile/Scrum.

Użytkownicy: właściciel planu (Mati) edytuje wszystko; koledzy z firmy oglądają, a wybrani edytują tylko swoje karty.

## 2. Funkcje

### 2.1 Oś czasu
- Kafel = projekt, kolor = osoba w wybranej roli (domyślnie Kupiec). Kolor liczony z nazwy, więc literówka (Darek / Dariusz) daje dwa kolory i jest widoczna od razu. Nie ma katalogu osób ani ról.
- Widok wg roli: pas na osobę w tej roli, pas „nieprzypisane” (ukryty, gdy pusty). Widok „Wszystko”: wiersz na projekt, kolor = kupiec, opcja „pokaż zakończone”.
- „N/A”, „nie dotyczy”, „—” w polu osoby = brak osoby (bez pasa, bez WIP).
- Skala Dni / Tygodnie / Miesiące. Tygodnie ISO, weekendy przyciemnione. Zmiana skali trzyma datę z lewej krawędzi. Pole „Od”: oś zaczyna się od wybranego dnia (domyślnie dziś). Horyzont w miesiącach.
- Rysowanie nowego projektu przeciągnięciem po pustym pasie (tylko właściciel).
- Przeciąganie kafla: w poziomie zmienia termin, w pionie wiersz w pasie (`rowHint`) albo pas innej osoby (zmiana osoby w roli). Niebieska ramka „tu wyląduje” = miejsce po upuszczeniu. Uchwyty na końcach zmieniają start/koniec.
- **[Z-1]** Podwójne kliknięcie kafla otwiera kartę także przy drgnięciu myszy do 6 px. Przeciąganie zaczyna się dopiero od 6 px ruchu.
- Status kafla: planowany / w trakcie / zakończony; opóźnienie „+N dni” wobec planu pierwotnego; kamienie milowe (osiągnięty, po terminie); kropka RAG.
- **[Z-14]** Opóźnienie = koniec minus koniec planu pierwotnego; dla zakończonego liczy się od faktycznej daty zakończenia (zakończony przed planem nie ma plakietki).

### 2.2 Karta projektu
- Metryczka: problem, cel, KPI, baseline → target, korzyść PLN/rok, rytm przeglądu Obeya, zakres w/poza, przeszkody, notatki.
- Metoda: Klasyczna (PMBOK/PRINCE2), DMAIC, Kaizen, Scrum, Kanban, Hybryda; każda ma własne pola (np. sprint, DoD).
- Osoby: tabela rola → osoba w dwóch grupach. **Zespół** liczy się do obciążenia, **Interesariusze** nie. Podpowiedzi w polu „Osoba” pochodzą z ludzi, którzy już byli w tej roli.
- Start (otwarcie) i Koniec (zamknięcie, **włącznie** w UI). W danych `end` jest **wyłączny** (dzień po ostatnim). Koniec przed startem jest odrzucany.
- Plan pierwotny (baseline) zamraża się, gdy projekt przechodzi na „w trakcie”. Zapisuje się data faktycznego startu i zakończenia oraz historia statusów.
- **[Z-17]** Reguły zmiany statusu siedzą w jednym miejscu (`saveCard`): każda zmiana statusu = wpis w historii statusów; → w trakcie: zobowiązanie = dziś; → zakończony: data zakończenia = dziś (planowany → zakończony bierze za zobowiązanie datę startu z karty); powrót do planowanego czyści zobowiązanie i plan pierwotny; ponowne otwarcie zakończonego czyści datę zakończenia. „Nowy plan pierwotny” wchodzi dopiero po Zapisz, Anuluj go wyrzuca. Plan pierwotny zmienia właściciel i edytor karty. Niezmienniki (`lifecycleInvariants`, przy wczytaniu i po zapisie karty): planowany nie ma zobowiązania, daty zakończenia ani planu pierwotnego; w trakcie i zakończony mają plan pierwotny; tylko zakończony ma datę zakończenia.
- „Kto może edytować tę kartę”: lista e-maili.
- Ctrl+S = zapisz, Esc = zamknij. Klik obok okna zamyka kartę tylko bez niezapisanych zmian; ze zmianami okno zostaje z „Zapisz albo Anuluj”.

### 2.3 Portfel, Obeya, Miary
- Zakładki (np. Portfolio, Warsztaty): osobne listy projektów w jednym planie.
- Panel portfela: KPI, heatmapa obciążenia osób w miesiącach (Zespół), limit WIP, decyzje do podjęcia.
- **[Z-18]** „W trakcie” ma jedną definicję (`ongoingIn` / `stateInPeriod`, js-model): od zobowiązania do faktycznego zakończenia; w trakcie po terminie z karty zostaje w trakcie. Heatmapa, limit WIP, decyzje „Przeciążenie” i kafelek „W trakcie dziś” liczą tylko projekty w trakcie (zakończony w danym miesiącu obciąża osobę w tym miesiącu). Planowane widać na heatmapie jako szare „+N” (planowany po dacie startu także w bieżącym i przyszłych miesiącach) i nie liczą się do limitu. Tej samej definicji używają: kafelek „Opóźnione”, decyzje, tabela Obeya A3, Miary (projekty w toku, wiek projektów) i czas realizacji (`leadTime`).
- Obeya review (A3): podsumowanie do przeglądu.
- Widok Miary: lead time (P50/P85/P95), wiek projektów w trakcie, projekty w toku, przepustowość, terminowość, prognoza Monte Carlo dla planowanych projektów. Poniżej 10 zakończonych projektów pokazuje „Mało danych”.
- **[Z-15]** Wykres „Projekty wg statusu w miesiącach”: 12 miesięcy wstecz (z bieżącym) + 3 do przodu, przełącznik **Stan w miesiącu** (słupki piętrowe, domyślnie) / **Przepływ** (diagram skumulowanego przepływu), wybór zapamiętany w przeglądarce. W miesiącu projekt ma jeden stan: zakończony (faktyczna data zakończenia w tym miesiącu) > w trakcie (po zobowiązaniu, przed zakończeniem) > planowany (na koniec miesiąca; od pierwszego wpisu w historii statusów, a bez historii tylko w bieżącym miesiącu). Przyszłe miesiące liczą się z terminów na kartach; termin, który już minął, nie zmienia stanu (w trakcie zostaje w trakcie, planowany planowanym). Linia „dziś” stoi w dzisiejszym dniu bieżącego miesiąca. Słowo „WIP” w Miarach nie występuje (limit WIP dotyczy osoby).
- Eksport / Import planu jako JSON.

### 2.4 Historia zmian
- Każdy zapis z realną zmianą = wpis: kto, kiedy, co (czytelny opis z `describeChanges`), pełna kopia planu.
- **[Z-2]** Każda różnica w danych daje przynajmniej jeden wpis opisu („Inne zmiany…”), inaczej serwer uznałby „brak zmian” i nie zapisał. Sama zmiana otwartej zakładki (`activeTab`) zmianą nie jest.
- Właściciel może cofnąć do stanu z dowolnego wpisu z kopią. **[Z-3]** Cofnięcie przywraca **cały** plan (także późniejsze zmiany innych osób) i samo trafia do dziennika jako „przywrócenie”. Cofać może tylko właściciel.
- Pełne kopie trzyma 200 ostatnich wpisów, a historia pokazuje 100 ostatnich. Wiersz „Stan początkowy” zostaje zawsze.

## 3. Uprawnienia

| Kto | Rozpoznanie | Może |
|---|---|---|
| Właściciel | e-mail w `OWNERS` w Code.gs (wielkość liter bez znaczenia) | wszystko: projekty, zakładki, ustawienia, edytorzy kart, cofanie |
| Edytor karty | e-mail w `editors` danej karty | zmieniać **tylko te karty** |
| Pozostali w organizacji | każdy inny zalogowany | podgląd |

- **[Z-4]** Uprawnień pilnuje serwer (`mergeForEditor`), nie przeglądarka. Z zapisu edytora serwer bierze wyłącznie jego karty. Ignoruje dodanie i usunięcie projektu, przeniesienie do innej zakładki, zmianę listy edytorów i zmiany cudzych kart, a w odpowiedzi daje `ignored: true`.
- **[Z-5]** Gość nic nie zmienia, a zapis bez e-maila użytkownika jest odrzucany (`denied`).
- Właściciel ma „Podgląd jako <e-mail>”: widzi to, co dana osoba. W tym trybie nic się nie zapisuje.
- Arkusz z danymi udostępniamy innym najwyżej do podglądu. Jedyną drogą zmiany jest `savePlan`.

## 4. Dane

### 4.1 Arkusz „Planer – dane”
Zakłada go skrypt przy pierwszym uruchomieniu na Dysku właściciela. ID zapisuje we Właściwościach skryptu jako `SHEET_ID`. Kolejność wyboru Arkusza: skrypt przypięty do Arkusza → stała `SHEET_ID` w Code.gs → właściwość `SHEET_ID` → nowy Arkusz. Funkcja `gdzieSaDane()` uruchomiona w edytorze wypisuje adres Arkusza.

| Zakładka | Układ |
|---|---|
| `Planer_dane` | A1 = numer wersji planu, B1… = JSON planu pocięty na kawałki po 45 000 znaków (limit komórki to 50 000) |
| `Planer_dziennik` | A czas · B kto · C id wpisu · D opis zmian (linie) · E typ (`start` / `przywrócenie` / puste) · F… kopia planu (JSON w kawałkach) |

**[Z-6]** Plan dowolnej wielkości wraca z Arkusza bez strat. Zapis mniejszego planu czyści stare kawałki.

### 4.2 Plan (JSON)
```jsonc
{
  "wipLimit": 2, "horizonMonths": 20, "activeTab": "<id>",
  "tabs": [{ "id": "…", "title": "Portfolio", "projects": [ /* Projekt */ ] }]
}
```
Projekt:
```jsonc
{
  "id": "…", "title": "…",
  "status": "planned | ongoing | done", "rag": "green | amber | red | ''",
  "start": "RRRR-MM-DD", "end": "RRRR-MM-DD (wyłączny)",
  "baselineStart": "…", "baselineEnd": "…",          // tylko gdy status ≠ planned
  "startedAt": "…", "doneAt": "…",
  "assignments": [{ "group": "team | stakeholders", "role": "Kupiec", "person": "Jan" }],
  "milestones": [{ "name": "…", "date": "…", "done": false, "doneAt": null }],
  "editors": ["jan@firma.pl"], "rowHint": 0,
  "method": "klasyczna | dmaic | kaizen | scrum | kanban | hybryda", "mf": { /* pola metody */ },
  "problem": "", "goal": "", "kpi": "", "baseline": "", "benefit": "", "scope": "", "obeya": "", "impediments": "",
  "notes": "", "history": [{ "date": "…", "status": "…" }]
}
```
Stary format `{ projects: [...] }` (bez zakładek) jest czytany jako jedna zakładka „Portfolio”.

### 4.3 Daty
- Daty w danych to lokalne `RRRR-MM-DD`, bez stref czasowych. Cała logika dat siedzi w `DATE_LIB` (js-model) z testami.
- **[Z-19]** Termin `[start, end)`: koniec w danych jest wyłączny, a na ekranie i w dacie zakończenia jest ostatni dzień. Zamianę robi tylko `TERM` (js-model): ostatni dzień, koniec, koniec o danej długości, długość, etykieta „od – do”, zawieranie dnia, nakładanie. W `js-*` nie ma ręcznych „±1 dzień” przy końcu terminu (PlanLib ma własne `endIncl`, bo działa też na serwerze).
- **[Z-7]** Nieistniejąca data (30 lutego) jest odrzucana, a nie przesuwana na 2 marca. Różnice dni są poprawne przez zmianę czasu (doby 23 h / 25 h). Tygodnie liczone wg ISO.

## 5. Serwer (API dla `google.script.run`)

| Funkcja | Wejście | Wynik |
|---|---|---|
| `loadPlan()` | — | `{ data, version, user, isOwner, parts: { code, planLib } }` |
| `savePlan(plan, version)` | plan, wersja, na której oparto zmianę (`null` = pierwszy zapis) | `{ version, ignored }` · `{ conflict: true }` · `{ denied, error }` |
| `listHistory()` | — | do 100 ostatnich wpisów `{ id, ts, user, changes[], restore, initial, hasSnapshot }` |
| `restoreVersion(id)` | id wpisu | `{ data, version }` · `{ error }` |

- `savePlan` działa pod `LockService.getScriptLock()`. Gdy wersja się nie zgadza, zwraca `conflict` i nic nie zapisuje **[Z-8]**. Pusty plan na pustym Arkuszu i zapis bez zmian nie tworzą wpisu w dzienniku.
- Web app: „Wykonaj jako: ja”, „Kto ma dostęp: wszyscy w organizacji” (`appsscript.json`: `USER_DEPLOYING`, `DOMAIN`). Strefa czasowa skryptu Europe/Warsaw.

## 6. Zapis w przeglądarce (najważniejsze: zero utraty danych)

1. Każda zmiana → kopia w `localStorage` → po 800 ms zapis do Arkusza.
2. **[Z-9]** Kolejka: w locie jest najwyżej jeden zapis. Kolejny czeka na odpowiedź i wychodzi z nową wersją. Przy serwerze odpowiadającym 1–3 s szybkie zmiany nie mogą dać fałszywego konfliktu ani zginąć.
3. **[Z-10]** Konflikt (ktoś inny albo inna karta przeglądarki zapisała w międzyczasie): pobranie planu z Arkusza, trójstronne scalanie `mergePlans(base, moje, ich)` projekt po projekcie i ponowny zapis, bez pytania użytkownika i bez przycisku „Przeładuj”.
   - zmienił tylko jeden → jego wersja;
   - zmienili oboje ten sam projekt → wygrywa zapisujący teraz, ostrzeżenie „zmienił też ktoś inny”, obie wersje zostają w Historii;
   - usunięcie przegrywa ze zmianą (nie kasujemy cudzej pracy);
   - nowe projekty z obu stron zostają.
   - po 3 nieudanych próbach scalania zapis jest wstrzymany, a użytkownik widzi czerwony alarm z prośbą o Eksport.
4. **[Z-16]** Przywrócenie z Historii w trakcie zapisu czeka, aż zapisy w toku się skończą, i dopiero wtedy podmienia plan; następna zmiana zapisuje się bez scalania. Render bez zmian w planie nie wysyła zapisu.
5. **[Z-11]** Arkusz nie odpowiada przy wczytaniu → czerwony pasek, edycja zablokowana, plan z `localStorage` **nie** jest pokazywany jako prawdziwy. Nieudany zapis → czerwony pasek, kolejne zapisy wstrzymane.
6. Arkusz rządzi: pusty Arkusz = pusty plan (bez dociągania z `localStorage`). Bez Apps Script (plik otwarty lokalnie) planer działa na `localStorage` jako makieta.

## 7. Wdrażanie i kontrola wklejenia

Kod trafia do edytora Apps Script przez ręczne wklejenie plików (bez clasp). Dlatego:

- Index skleja wszystkie `js-*` w **jeden** `<script>` przez `include()` w stałej kolejności: sesja, model, os, karta, portfel, historia, miary, testy, start. Kolejność ma znaczenie, bo późniejsze pliki używają stałych z wcześniejszych.
- **[Z-12]** Każdy `js-*` (poza js-start) kończy się linią `// ===== KONIEC <plik> (wersja X)` i `window.__planerParts.push('<plik>@X')`. Mapa `PLANER_FILES` w js-start zawiera dokładnie te wersje. `CODE_VERSION` = `PLAN_LIB_VERSION` = `PLANER_VERSION`. Plik ucięty przy wklejaniu albo w starej wersji → czerwony pasek z nazwą pliku.
- Łapacz błędów w Index zamiast pustej strony pokazuje komunikat z listą plików, które wczytały się do końca.
- Aktualizacja wyłącznie przez **Wdróż → Zarządzaj wdrożeniami → ołówek → Wersja: Nowa wersja → Wdróż**. „Nowe wdrożenie” zmienia adres. Adres `/dev` pokazuje ostatnio zapisany kod, ale pisze do **tego samego** Arkusza.
- **[Z-13]** Testy w przeglądarce (`js-testy`, obecnie 93) idą w tle 1,5 s po starcie u właściciela, a z `?test` u każdego. Okno pojawia się wyłącznie przy NOK.

## 8. Czego świadomie nie ma
- Jeden Index zamiast plików: temat zamknięty, zostaje podział na pliki.
- Katalog osób i ról oraz zmiana nazwy osoby wszędzie naraz.
- Przyspieszanie ładowania (CacheService), dziś ok. 2 s + 1 s planu.
- Ostrzeżenia o nakładaniu się projektów.

## 9. Pomysły na dalej
- „Przywróć tylko tę kartę” w Historii (dziś cofa się cały plan).
- Porządki: duplikaty formatowania dat, nazwy zmiennych w PlanLib.
- Test e2e przeciągania (nowy wiersz, pas innej osoby, ramka = miejsce po upuszczeniu).

## 10. Założenia → testy

| Założenie | Test |
|---|---|
| Z-1 dwuklik z drgnięciem | e2e: `podwójne kliknięcie kafla…` |
| Z-2 każda różnica ma opis | server: `describeChanges…`; js-testy |
| Z-3 cofanie | server: `przywrócenie wersji z Historii…` |
| Z-4 edytor karty | server: `edytor karty…`; e2e: `edytor karty…`; js-testy |
| Z-5 gość / brak e-maila | server: `gość nic nie zmienia…`; e2e: `gość…` |
| Z-6 duży plan | server: `duży plan…` |
| Z-7 daty | js-testy (sekcja „daty”) |
| Z-8 conflict po stronie serwera | server: `zapis ze starą wersją…` |
| Z-9 kolejka zapisów | sesja: `szybkie zmiany…`, `zmiana cofnięta…`; e2e: `wyścig zapisów…` |
| Z-10 scalanie | sesja: `konflikt z inną kartą…`, `edytor karty…`; e2e: `dwie karty…` (×2); js-testy (sekcja „scalanie”) |
| Z-11 brak Arkusza | server: `Arkusz niedostępny…`; sesja: `błąd Arkusza…`, `Arkusz niedostępny…`; e2e: `brak Arkusza…` |
| Z-12 kontrola wklejenia | server: `kontrola wklejenia…`, `doGet skleja…`; e2e: `ucięty plik…`, `stary Code.gs…` |
| Z-13 testy w przeglądarce | e2e: `start: wszystkie testy w przeglądarce OK…` |
| Z-14 opóźnienie | js-testy (sekcja „opóźnienie”) |
| Z-15 wykres statusów | js-testy (sekcja „Miary”); e2e: `Miary: wykres wg statusu…` |
| Z-16 przywrócenie w trakcie zapisu | sesja: `przywrócenie w trakcie zapisu…`, `render bez zmian…`; e2e: `przywrócenie z Historii w trakcie zapisu…` |
| Z-17 cykl życia projektu | js-testy (sekcja „cykl”, w tym niezmienniki przy wczytaniu); e2e: `karta: „Nowy plan pierwotny”…`, `karta: edytor karty…` |
| Z-18 stan projektu w okresie | js-testy (sekcja „stan”: jeden portfel, cztery widoki); e2e: `portfel: heatmapa liczy tylko w trakcie…` |
| Z-19 termin z wyłącznym końcem | js-testy (sekcja „termin”); server: `termin: poza TERM i DATE_LIB…` (skan kodu: każde `addDays(…, ±1)`, `diffDays(…) ± 1`, `getDate() ± 1`) |
