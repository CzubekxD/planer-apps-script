# Planer

Wizualny portfel projektów OPEX na najbliższy rok: kto jest zajęty czym i kiedy, co jest w toku i do czego się przygotowujemy.

## Projekt i jego obraz

**Projekt**:
Jedna planowana praca z terminem, osobami i metryczką; każdy rodzaj pracy (także warsztat Kaizen) jest projektem, a rodzaj określa jego metoda.
_Avoid_: klocek, zadanie, inicjatywa, warsztat (jako osobny byt)

**Karta**:
Okno z metryczką projektu, w którym się go ogląda i zmienia.
_Avoid_: formularz, modal

**Kafel**:
Prostokąt projektu na osi czasu.
_Avoid_: klocek, pasek, blok

**Metoda**:
Sposób prowadzenia projektu (klasyczna, DMAIC, Kaizen, Scrum, Kanban, hybryda), który wyznacza jego rodzaj i dodatkowe pola karty.
_Avoid_: typ, rodzaj projektu (jako osobne pole)

**Zakładka**:
Dowolna grupa projektów do porządku (np. OVHDS, LOG); nie niesie żadnego znaczenia biznesowego i może się zmieniać.
_Avoid_: portfel, obszar, dział

## Termin i stan

**Planowany**:
Projekt przed zobowiązaniem: pokazuje, do czego się przygotowujemy i co będzie następne, a jego termin można dowolnie przesuwać. Planowany, któremu minęła data startu z karty, a nikt go nie zaczął, zostaje planowanym od dziś w przód (heatmapa, Miary), aż zapadnie zobowiązanie albo zostanie usunięty; nigdy nie obciąża ludzi.
_Avoid_: backlog, szkic

**Zobowiązanie**:
Moment, w którym decydujemy się na pracę nad projektem: przejście z „planowany” na „w trakcie”; od niego liczy się czas realizacji. Przy przejściu z „planowany” prosto na „zakończony” za zobowiązanie uznaje się datę startu z karty.
_Avoid_: start, uruchomienie, data zatwierdzenia

**Plan pierwotny**:
Daty startu i końca projektu zamrożone w chwili zobowiązania; od nich liczy się opóźnienie. Zmienić go może właściciel i edytor karty tego projektu.
_Avoid_: baseline (bez dopowiedzenia)

**Wartość wyjściowa → cel**:
Poziom KPI przed projektem i poziom, który projekt ma osiągnąć (np. 45 → 30 min).
_Avoid_: baseline (bez dopowiedzenia), target

**Zakończony**:
Projekt, nad którym praca się skończyła, także wtedy, gdy przerwano go przed celem; ma faktyczną datę zakończenia.
_Avoid_: zamknięty, gotowy, done

**Opóźnienie**:
Liczba dni, o którą koniec projektu wypada po końcu planu pierwotnego; dla zakończonego liczy się od faktycznej daty zakończenia.
_Avoid_: poślizg, slip

**Anulowany**, **Przerwany**:
Takie stany nie istnieją. Planowany, który się nie odbędzie, usuwa się (ślad zostaje w Historii); projekt przerwany po zobowiązaniu oznacza się jako zakończony.

## Ludzie i obciążenie

**Kupiec**:
Rola wiodąca projektu: osoba z biznesu, z którą i dla której projekt jest robiony; po niej planer domyślnie grupuje pasy i koloruje kafle.
_Avoid_: klient, zleceniodawca

**Limit WIP**:
Największa liczba projektów w trakcie, w których jedna osoba z Zespołu może być naraz w danym miesiącu, liczona w obrębie jednej zakładki; planowane się do niego nie liczą. Dotyczy zawsze osoby, nigdy całej zakładki.
_Avoid_: WIP portfela, limit obciążenia

**Projekty w toku**:
Liczba projektów w trakcie w zakładce w danym okresie; zwykła miara przepływu, bez limitu.
_Avoid_: WIP

## Uprawnienia

**Właściciel**:
Osoba, która może zmieniać cały plan, nadawać edytorów kart i cofać zmiany.
_Avoid_: admin

**Edytor karty**:
Osoba, której e-mail jest wpisany na karcie projektu; może zmieniać tylko te karty.
_Avoid_: współpracownik, edytor (bez dopowiedzenia)

**Obserwator**:
Każdy inny użytkownik w organizacji; widzi plan, niczego nie zmienia.
_Avoid_: gość, osoba spoza kart, podgląd

## Historia

**Historia**:
Lista wszystkich zapisanych zmian planu: kto, kiedy, co.
_Avoid_: dziennik, log, changelog

**Wpis**:
Jedna zapisana zmiana w Historii razem z kopią całego planu z tej chwili.
_Avoid_: rekord, wiersz dziennika

**Przywrócenie**:
Powrót całego planu do stanu z wybranego wpisu; samo też staje się wpisem.
_Avoid_: cofnięcie, undo, rollback
