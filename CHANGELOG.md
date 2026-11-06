# Zmiany

Od najnowszych. „Pliki” = co podmienić w edytorze Apps Script. Pełny opis z krokami wdrożenia: dokument Claude Docs „Planer – opis zmian”.

Aktualna paczka: **2026-11-06b**

| Data | Obszar | Zmiana | Pliki |
|---|---|---|---|
| 06.11 | Miary | Zamiast wykresu „WIP portfela”: projekty wg statusu w miesiącach (12 wstecz + 3 do przodu) z przełącznikiem Stan w miesiącu / Przepływ; kafelek „Projekty w toku” bez czerwonego alarmu (#1). | js-miary, Styles, js-testy, js-start |
| 06.11 | Opóźnienie | Zakończony projekt liczy opóźnienie od faktycznej daty zakończenia, nie od końca na karcie (#2). | js-model, js-testy, js-start |
| 06.11 | Porządki | Bez nazwy firmy w kodzie: tytuł „Planer”, nowy Arkusz „Planer – dane”, przykładowe e-maile @firma.pl, klucze przeglądarki `planer.*` (jednorazowo znikają zapamiętane: skala, „Od”, widok, metoda). Wersje wszystkich plików: 2026-11-06. Działanie bez zmian. | wszystkie poza Styles |
| 05.11 | Repo | Kod w repozytorium; specyfikacja (SPEC.md); testy serwera i przeglądarki na atrapie Apps Script; manifest `appsscript.json`. Kod planera bez zmian. | — |
| 05.11 | Karta projektu | Klik obok okna zamyka kartę, jeśli nic w niej nie zmieniłeś; ze zmianami okno zostaje i pokazuje „Masz niezapisane zmiany: Zapisz albo Anuluj”. | js-karta, js-start |
| 05.11 | Karta projektu | Podpowiedzi w polu „Osoba” tylko z wpisanej roli (najczęstsi na górze); nowa rola → wszyscy. | js-karta, js-start |
| 05.11 | Oś czasu | Naprawa: podwójne kliknięcie znowu otwiera kartę; przeciąganie zaczyna się od 6 px ruchu. | js-os, Styles, js-start |
| 05.11 | Testy | Okno z testami tylko przy NOK, z listą testów, które nie przeszły. | js-testy, js-start |
| 05.11 | Zapis | Kolejka zapisów: kolejny zapis czeka na odpowiedź poprzedniego (naprawa utraty danych przy fałszywym konflikcie). | js-model |
| 05.11 | Zapis | Konflikt dwóch osób / kart scala się sam, projekt po projekcie; przy tym samym projekcie ostrzeżenie, obie wersje w Historii. | js-model, js-historia |
| 05.11 | Zapis | Usunięty przycisk „Przeładuj plan” (wyrzucał niezapisane zmiany). | Index, js-portfel |
| 05.11 | Karta projektu | Przyklejony pasek z tytułem, Anuluj i Zapisz; Ctrl+S = zapisz, Esc = zamknij. | Index, Styles, js-karta |
| 05.11 | Karta projektu | Pola Start i Koniec (włącznie); koniec nie może być przed startem. | Index, Styles, js-karta |
| 05.11 | Oś czasu | Przeciąganie: ramka „tu wyląduje”, podświetlony pas docelowy, daty na żywo. | js-os, Styles |
| 05.11 | Bezpieczeństwo | Komunikat błędu zamiast pustej strony; kontrola wklejenia plików; blokada edycji bez Arkusza; alarm przy nieudanym zapisie. | Index, js-model, js-start, Code, PlanLib |
| 04.11 | Oś czasu | „Od” z dokładnym dniem; zmiana skali trzyma datę z lewej krawędzi. | js-model, js-os, js-portfel, Index |
| 04.11 | Oś czasu | Przesuwanie w pionie: inny / nowy wiersz, pas innej osoby; miejsce zapamiętane w Arkuszu. | js-model, js-os, PlanLib |
| 04.11 | Widoki | Widok „Wszystko”; N/A = „nie dotyczy”; pusty pas „nieprzypisane” ukryty. | js-model, js-os, js-portfel, Index |
| 04.11 | Karta projektu | Klik obok okna nie zamyka karty; przy niezapisanych zmianach pytanie. | js-karta, Styles |
| 04.11 | Testy | Testy w tle przy każdym otwarciu. | js-testy, js-start |
| 04.11 | Serwer | Skrypt sam zakłada Arkusz „Planer – dane” i pamięta jego ID. | Code |
| 04.11 | Wdrożenie | Jeden plik HTML podzielony na pliki Apps Script; logika wspólna w PlanLib. | wszystkie |
| 04.11 | Poprawki z przeglądu | Zmiana samego planu pierwotnego zapisuje się; każdy zapis osobno w dzienniku; edytor nie przeniesie karty do innej zakładki. | PlanLib, Code, js-model |
| 04.11 | Daty | Logika dat w jednym bloku z testami; 30 lutego odrzucany. | js-model, js-testy |
| 04.11 | Uprawnienia | Domyślnie podgląd; edycja karty po e-mailu; właściciel = OWNERS; „Podgląd jako”. | Code, PlanLib, js-karta, js-historia |
| 04.11 | Historia | Dziennik zmian z pełną kopią planu i cofaniem. | Code, js-historia |
| 04.11 | Oś czasu | Skala Dni / Tygodnie / Miesiące. | js-os |
