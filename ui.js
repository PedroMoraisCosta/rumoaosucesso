/* ui.js — Pintar positivos/negativos (texto + caixas) — V2 (sem refresh)
   - KPIs: pinta texto + caixa do KPI
   - Tabelas: pinta apenas texto (Lucro, %, Líquido)
   - Auto-recolor: menu clicks + hashchange + ras:data-updated + MutationObserver
   - Quick Actions: colapsável (por defeito fechado)
   - Mobile: Offcanvas fecha ao clicar num link do menu
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
    colorTableCells("stTable", [{ idx: 5 }, { idx: 6 }]);

    // Cripto: Lucro idx 5, % idx 6
    colorTableCells("crTable", [{ idx: 5 }, { idx: 6 }]);

    // P2P: Lucro idx 6, % idx 7
    colorTableCells("p2Table", [{ idx: 6 }, { idx: 7 }]);

    // Vendas: Lucro idx 8, % idx 9, Líquido idx 12
    colorTableCells("tradesTbody", [{ idx: 8 }, { idx: 9 }, { idx: 12 }]);
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

    // 4) clique no menu desktop
    document.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;

  const a = target.closest("#menuList a[data-section]");
  if (!a) return;

  setTimeout(scheduleRecolor, 0);
}, true);

    // 5) MutationObserver: se alguma tabela/KPI for re-renderizada, repinta
    const obs = new MutationObserver(() => scheduleRecolor());

    // ✅ observa o main certo (teu HTML: <main id="mainCol"...>)
    const main = document.getElementById("mainCol") || document.querySelector("main");
    obs.observe(main || document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });
  }

  // -------------------------
  // Quick Actions (colapsável)
  // -------------------------
  function initQuickActions() {
    const btn = $("btnToggleQuickActions");
    const body = $("quickActionsBody");
    if (!btn || !body) return;

    // default: fechado
    body.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");

    btn.addEventListener("click", () => {
      const open = body.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

 // -------------------------
// Mobile Offcanvas: abre secção (mesmo mecanismo do desktop) + fecha
// -------------------------
function initMobileOffcanvasClose() {
  const navMobile = document.getElementById("rasNavMobile");
  const offcanvasEl = document.getElementById("rasOffcanvas");
  if (!navMobile || !offcanvasEl) return;

  navMobile.addEventListener("click", (e) => {
    const target = e.target;
    const a = (target && target.closest) ? target.closest("a") : null;
    if (!a) return;

    // 1) abre a secção usando o MESMO mecanismo do desktop
    const key = a.getAttribute("data-section");
    if (key) {
      const desktopLink = document.querySelector(`#menuList a[data-section="${key}"]`);
      if (desktopLink) {
        e.preventDefault(); // evita só hash/scroll
        desktopLink.click();
      }
    }

    // 2) fecha o offcanvas
    if (typeof bootstrap === "undefined" || !bootstrap.Offcanvas) return;
    const instance =
      bootstrap.Offcanvas.getInstance(offcanvasEl) || new bootstrap.Offcanvas(offcanvasEl);
    instance.hide();
  }, true);
}

function initSidebarCollapse() {
  const btn = document.getElementById("btnToggleMenu");

  // estado inicial (memória)
  document.body.classList.toggle(
    "sidebar-collapsed",
    localStorage.getItem("ras_sidebar_collapsed") === "1"
  );

  function toggleSidebar(e) {
    if (e) e.preventDefault();
    const collapsedNow = document.body.classList.toggle("sidebar-collapsed");
    localStorage.setItem("ras_sidebar_collapsed", collapsedNow ? "1" : "0");
  }

  // ✅ 1) Handler direto no botão (mais fiável)
  if (btn) {
    btn.addEventListener("click", toggleSidebar);
  }

  // ✅ 2) Salvaguarda por delegation (se o botão for re-renderizado)
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const b = target.closest("#btnToggleMenu");
      if (!b) return;

      toggleSidebar(e);
    },
    true
  );
}

function initThemeToggle() {
  const KEY = "ras_theme_v1"; // "dark" | "light"

  // 1) aplicar tema guardado ao carregar
  const saved = localStorage.getItem(KEY);
  if (saved === "dark") document.body.classList.add("dark");
  if (saved === "light") document.body.classList.remove("dark");

  // 2) atualizar ícones/texto
  function syncButtons() {
    const isDark = document.body.classList.contains("dark");
    const b1 = document.getElementById("btnThemeToggle");        // mobile topbar
    const b2 = document.getElementById("btnThemeToggleDesktop"); // desktop sidebar

    if (b1) b1.textContent = isDark ? "☀️" : "🌙";
    if (b2) b2.textContent = isDark ? "☀️ Modo claro" : "🌙 Modo escuro";
  }

  function toggle() {
    const isDark = document.body.classList.toggle("dark");
    localStorage.setItem(KEY, isDark ? "dark" : "light");
    syncButtons();
  }

  // 3) ligar eventos (se existirem)
  const btnMobile = document.getElementById("btnThemeToggle");
  const btnDesk = document.getElementById("btnThemeToggleDesktop");

  if (btnMobile) btnMobile.addEventListener("click", toggle);
  if (btnDesk) btnDesk.addEventListener("click", toggle);

  // 4) primeira sync
  syncButtons();
}

// API manual (debug)
window.RAS_UI = { recolor: scheduleRecolor };

// -------------------------
// INIT único
// -------------------------
document.addEventListener("DOMContentLoaded", () => {
  bindAutoTriggers();
  initQuickActions();
  initMobileOffcanvasClose();
  initSidebarCollapse();
  initThemeToggle();      // ✅ FALTAVA ESTA LINHA
  scheduleRecolor(); // 1ª pintura
});

})(); // ✅ FECHO do IIFE