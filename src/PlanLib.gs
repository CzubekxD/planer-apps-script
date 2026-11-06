/**
 * PlanLib.gs — JEDNO źródło logiki wspólnej dla serwera i przeglądarki:
 *   • describeChanges — opis zmian do Dziennika („„Kaizen”: termin 20.11–09.01 → 27.11–16.01”)
 *   • mergeForEditor  — co z zapisu edytora karty wolno przyjąć (reszta jest ignorowana)
 * Serwer używa PLAN_LIB bezpośrednio, a Index.html wkleja tę samą funkcję do przeglądarki (planLibSource).
 * Zmieniasz tylko tutaj. Testy: adres web appa + ?test.
 */
const PLAN_LIB_VERSION = '2026-11-06i';
function PLAN_LIB_FACTORY() {
  const fmtISO = s => s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : '—';
  // ŚWIADOME ODSTĘPSTWO od TERM (js-model): koniec w danych jest wyłączny, a w opisie zmian pokazujemy ostatni dzień.
  // To samo robi TERM.lastDay, ale PlanLib musi działać na serwerze (bez DATE_LIB, bez DOM) i jest wklejany do
  // przeglądarki jako tekst, więc nie może zależeć od js-model. Liczy na tekście RRRR-MM-DD w UTC (bez stref czasowych
  // i zmiany czasu). Test w tests/server.test.js pilnuje zgodności z TERM.lastDay i że to jedyne takie miejsce w .gs.
  const endIncl = s => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10); }; // bez stref czasowych
  const term = p => `${fmtISO(p.start)}–${fmtISO(endIncl(p.end))}`;
  const STATUS = { planned: 'planowany', ongoing: 'w trakcie', done: 'zakończony' };
  const RAG = { green: 'zielony', amber: 'żółty', red: 'czerwony', '': 'brak' };
  const SKIP = ['id', 'title', 'start', 'end', 'status', 'rag', 'assignments', 'milestones', 'editors', 'notes', 'history', 'startedAt', 'doneAt', 'baselineStart', 'baselineEnd', 'rowHint'];
  const J = v => JSON.stringify(v ?? null);

  function index(plan) {
    const m = new Map();
    ((plan && plan.tabs) || []).forEach(t => (t.projects || []).forEach(p => m.set(p.id, { p, tab: t.title, tabId: t.id })));
    return m;
  }
  // activeTab to tylko „która zakładka była otwarta” — nie jest zmianą planu
  const withoutView = plan => plan && { ...plan, activeTab: undefined };

  // Lista zmian czytelna dla człowieka: co się zmieniło między dwoma planami
  function describeChanges(a, b) {
    const out = [];
    const A = index(a), B = index(b);
    B.forEach(({ p, tab }, id) => { if (!A.has(id)) out.push(`Nowy projekt „${p.title}” (${tab})`); });
    A.forEach(({ p }, id) => { if (!B.has(id)) out.push(`Usunięty projekt „${p.title}”`); });
    B.forEach(({ p, tab }, id) => {
      const o = A.get(id); if (!o) return;
      const q = o.p, n = `„${p.title}”`, ch = [];
      if (q.title !== p.title) ch.push(`nazwa: „${q.title}” → „${p.title}”`);
      if (q.start !== p.start || q.end !== p.end) ch.push(`termin ${term(q)} → ${term(p)}`);
      if (q.status !== p.status) ch.push(`status: ${STATUS[q.status] || q.status} → ${STATUS[p.status] || p.status}`);
      if ((q.rag || '') !== (p.rag || '')) ch.push(`RAG: ${RAG[q.rag || '']} → ${RAG[p.rag || '']}`);
      if (J(q.assignments) !== J(p.assignments)) ch.push('osoby');
      if (J(q.milestones) !== J(p.milestones)) ch.push('kamienie milowe');
      if (J(q.editors) !== J(p.editors)) ch.push(`edytorzy: ${(p.editors || []).join(', ') || 'tylko właściciel'}`);
      if (q.baselineStart !== p.baselineStart || q.baselineEnd !== p.baselineEnd) ch.push('plan pierwotny');
      if ((q.rowHint ?? null) !== (p.rowHint ?? null)) ch.push('miejsce w pasie');
      if ((q.notes || '') !== (p.notes || '')) ch.push('notatki');
      if (Object.keys({ ...q, ...p }).some(k => !SKIP.includes(k) && J(q[k]) !== J(p[k]))) ch.push('metryczka');
      if (o.tab !== tab) ch.push(`przeniesiony do „${tab}”`);
      if (ch.length) out.push(`${n}: ${ch.join(' · ')}`);
    });
    const ta = new Map(((a && a.tabs) || []).map(t => [t.id, t.title])), tb = new Map(((b && b.tabs) || []).map(t => [t.id, t.title]));
    tb.forEach((t, id) => { if (!ta.has(id)) out.push(`Nowa zakładka „${t}”`); else if (ta.get(id) !== t) out.push(`Zakładka „${ta.get(id)}” → „${t}”`); });
    ta.forEach((t, id) => { if (!tb.has(id)) out.push(`Usunięta zakładka „${t}”`); });
    if (a && b && a.wipLimit !== b.wipLimit) out.push(`Limit WIP: ${a.wipLimit} → ${b.wipLimit}`);
    if (a && b && a.horizonMonths !== b.horizonMonths) out.push(`Horyzont: ${a.horizonMonths} → ${b.horizonMonths} mies.`);
    // Siatka bezpieczeństwa: każda różnica w danych musi dać wpis, inaczej serwer uzna „brak zmian” i nie zapisze
    if (!out.length && J(withoutView(a)) !== J(withoutView(b))) out.push('Inne zmiany (kolejność, historia statusów)');
    return out;
  }

  // Zapis osoby, która nie jest właścicielem: bierzemy zapisany plan i podmieniamy WYŁĄCZNIE karty,
  // w których ta osoba jest w „editors”. Reszta (inne karty, nowe/usunięte projekty, zakładki, ustawienia) jest ignorowana.
  function mergeForEditor(stored, incoming, user) {
    user = String(user || '').toLowerCase();
    const plan = JSON.parse(JSON.stringify(stored || { tabs: [] }));
    const inc = index(incoming);
    let ignored = false;
    plan.tabs.forEach(t => {
      t.projects = t.projects.map(p => {
        const n = inc.get(p.id);
        if (!n) { ignored = true; return p; } // próba usunięcia
        inc.delete(p.id);
        const allowed = (p.editors || []).includes(user);
        if (n.tabId !== t.id) ignored = true;               // przeniesienie do innej zakładki — pomijamy
        if (!allowed) { if (J(n.p) !== J(p)) ignored = true; return p; }
        if (J(n.p.editors) !== J(p.editors)) ignored = true; // edytor nie zmienia listy edytorów
        return { ...n.p, id: p.id, editors: p.editors };
      });
    });
    if (inc.size) ignored = true; // próba dodania projektu
    return { plan, ignored };
  }

  return { describeChanges, mergeForEditor };
}
const PLAN_LIB = PLAN_LIB_FACTORY();

// Kod PLAN_LIB jako tekst dla przeglądarki
function planLibSource() {
  return 'const PLAN_LIB = (' + PLAN_LIB_FACTORY.toString() + ')();';
}
