/* ui.js — Pintar positivos/negativos (texto + caixas) — V2 (sem refresh)
   - KPIs: pinta texto + caixa do KPI
   - Tabelas: pinta apenas texto (Lucro, %, Líquido)
   - Auto-recolor: menu clicks + hashchange + ras:data-updated + MutationObserver
*/

(function () {
  function $(id) { return document.getElementById(id); }

  // -------------------------
  // Parse números PT
  // -------------------------
  function parsePTNumber(text) {
    // aceita: "1 234,56 €", "19,99%", "-600,00 €", "13 025,16 €"
    const s = String(text || "")
      .replace(/\u00A0/g, " ")      // NBSP -> space
      .replace(/\s/g, "")          // remove spaces
      .replace("€", "")
      .replace("%", "")
      .replace(/\./g, "")          // remove separador de milhar
      .replace(",", ".");          // decimal pt -> decimal js

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // -------------------------
  // Classes
  // -------------------------
  function clearSignClasses(el, mode) {
    if (!el) return;
    el.classList.remove("ras-pos", "ras-neg");

    // Só KPIs pintam "caixa"
    if (mode === "kpi") {
      const box = el.closest(".border.rounded, .border.rounded-3, .border.rounded-4, .card");
      if (box) box.classList.remove("ras-box-pos", "ras-box-neg");
    }
  }

  function applySign(el, value, mode) {
    if (!el || typeof value !== "number") return;

    clearSignClasses(el, mode);

    if (value > 0) el.classList.add("ras-pos");
    else if (value < 0) el.classList.add("ras-neg");

    if (mode === "kpi") {
      const box = el.closest(".border.rounded, .border.rounded-3, .border.rounded-4, .card");
      if (box) {
        if (value > 0) box.classList.add("ras-box-pos");
        else if (value < 0) box.classList.add("ras-box-neg");
      }
    }
  }

  // -------------------------
  // KPIs (totais principais)
  // -------------------------
  const KPI_IDS = [
    // Património
    "plLucroTotal", "plPctLucro",

    // Ações
    "stTotalProfit", "stTotalPct",

    // Cripto
    "crTotalProfit", "crTotalPct",

    // P2P
    "p2Profit", "p2AvgPct",

    // Vendas (cards topo + resumo)
    "t_profit", "t_profit_pct", "t_net",
    "y_profit", "y_net"
  ];

  function colorKPIs() {
    for (const id of KPI_IDS) {
      const el = $(id);
      if (!el) continue;
      const n = parsePTNumber(el.textContent);
      if (n == null) continue;
      applySign(el, n, "kpi");
    }
  }

  // -------------------------
  // Tabelas (por linha)
  // -------------------------
  function colorTableCells(tbodyId, specs) {
    const tb = $(tbodyId);
    if (!tb) return;

    const rows = Array.from(tb.querySelectorAll("tr"));
    for (const tr of rows) {
      const tds = Array.from(tr.querySelectorAll("td"));
      for (const s of specs) {
        const td = tds[s.idx];
        if (!td) continue;

        const n = parsePTNumber(td.textContent);
        if (n == null) continue;

        // tabela = só texto (não mexe em caixas)
        applySign(td, n, "cell");
      }
    }
  }

  function colorAllTables() {
    // Ações: Lucro idx 5, % idx 6
    colorTableCells("stTable", [
      { idx: 5 },
      { idx: 6 }
    ]);

    // Cripto: Lucro idx 5, % idx 6
    colorTableCells("crTable", [
      { idx: 5 },
      { idx: 6 }
    ]);

    // P2P: Lucro idx 6, % idx 7
    colorTableCells("p2Table", [
      { idx: 6 },
      { idx: 7 }
    ]);

    // Vendas: Lucro idx 8, % idx 9, Líquido idx 12
    colorTableCells("tradesTbody", [
      { idx: 8 },   // Lucro
      { idx: 9 },   // %
      { idx: 12 }   // Líquido
    ]);
  }

  // -------------------------
  // Recolor (com throttle)
  // -------------------------
  let scheduled = false;

  function recolor() {
    scheduled = false;
    colorKPIs();
    colorAllTables();
  }

  function scheduleRecolor() {
    if (scheduled) return;
    scheduled = true;
    // rAF dá tempo para o render acabar antes de pintar
    requestAnimationFrame(() => setTimeout(recolor, 0));
  }

  // -------------------------
  // Auto triggers (sem refresh)
  // -------------------------
  function bindAutoTriggers() {
    // 1) dados atualizados
    window.addEventListener("ras:data-updated", scheduleRecolor);

    // 2) hashchange (caso uses)
    window.addEventListener("hashchange", scheduleRecolor);

    // 3) popstate (back/forward)
    window.addEventListener("popstate", scheduleRecolor);

    // 4) clique no menu (isto resolve o teu caso porque usas replaceState + showSection)
    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest ? e.target.closest("#menuList a[data-section]") : null;
      if (!a) return;
      // deixa o app trocar secção e depois pinta
      setTimeout(scheduleRecolor, 0);
    }, true);

    // 5) MutationObserver: se alguma tabela/KPI for re-renderizada, repinta
    const obs = new MutationObserver((mutList) => {
      for (const m of mutList) {
        if (m.type === "childList" || m.type === "characterData") {
          scheduleRecolor();
          break;
        }
      }
    });

    // observa só o MAIN para não gastar performance
    const main = document.querySelector("main");
    if (main) {
      obs.observe(main, {
        subtree: true,
        childList: true,
        characterData: true
      });
    } else {
      // fallback
      obs.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true
      });
    }
  }

  // API manual (para debug)
  window.RAS_UI = { recolor: scheduleRecolor };

  document.addEventListener("DOMContentLoaded", () => {
    bindAutoTriggers();
    scheduleRecolor(); // 1ª pintura
  });
})();