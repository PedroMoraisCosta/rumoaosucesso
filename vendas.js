// vendas.js — Vendas / Realizações (V2 - sincroniza com ras_data_v1)
// Regras (cálculo):
// Investido = (qty * avgBuy) + fees
// Recebido = (qty * sellPrice)
// Lucro = Recebido - Investido
// % = Lucro / Investido
// Imposto = (Lucro > 0) ? (Lucro * taxRate/100) : 0
// Líquido = Lucro - Imposto
//
// Sync portefólio (ras_data_v1):
// - Ações/ETF: reduz stocks.qty
// - Cripto: reduz crypto.qty e reduz crypto.invest por (qty*avgBuy) [simples]
// - Em editar/apagar/limpar: faz rollback do impacto anterior.

(function () {
  const $ = (id) => document.getElementById(id);

  const SALES_KEY = "ras_vendas_v1";
  const PORT_KEY = "ras_data_v1";

  // ✅ alinhar com app.js (bancoPessoal)
  const DEFAULT_PORTFOLIO = {
    meta: { lastUpdated: null },
    patrimonio: { bancoPessoal: 0 },
    stocks: [],
    dividends: [],
    crypto: [],
    p2p: [],
    funds: [],
  };

  const els = {
    section: $("vendasSection"),

    filterYear: $("filterYear"),
    filterClasse: $("filterClasse"),

    tInvested: $("t_invested"),
    tReceived: $("t_received"),
    tProfit: $("t_profit"),
    tProfitPct: $("t_profit_pct"),
    tTax: $("t_tax"),
    tNet: $("t_net"),

    yProfit: $("y_profit"),
    yTax: $("y_tax"),
    yNet: $("y_net"),
    yCount: $("y_count"),

    toggleTax: $("toggleTax"),
    taxRate: $("taxRate"),

    form: $("tradeForm"),
    tradeDate: $("tradeDate"),
    tradeClasse: $("tradeClasse"),
    tradeTicker: $("tradeTicker"),
    tradeQty: $("tradeQty"),
    tradeAvgBuy: $("tradeAvgBuy"),
    tradeSellPrice: $("tradeSellPrice"),
    tradeFees: $("tradeFees"),
    tradeNotes: $("tradeNotes"),

    btnAdd: $("btnTradeAdd"),
    btnCancel: $("btnTradeCancel"),
    btnClearAll: $("btnVendasClearAll"),

    tbody: $("tradesTbody"),
  };

  // ✅ Se a secção de Vendas não existir no HTML, não rebenta o dashboard
  if (!els.section) return;

  let state = {
    list: [],
    editingId: null,
    showTax: true,
    taxRate: 28,
  };

  // -----------------------
  // Helpers
  // -----------------------
  function notifyVendasChanged() {
    // evento simples (compatível com o app.js)
    window.dispatchEvent(new Event("ras:data-updated"));

    // extra: detalhe para debug (não parte nada mesmo que ninguém use)
    try {
      window.dispatchEvent(
        new CustomEvent("ras:data-updated", {
          detail: { source: "vendas", at: new Date().toISOString() },
        })
      );
    } catch {}
  }

  function euro(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }

  function pct(n) {
    const v = Number(n || 0);
    return (
      v.toLocaleString("pt-PT", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + "%"
    );
  }

  function num(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  function uid() {
    return "t_" + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function normalizeTicker(t) {
    return String(t || "").trim().toUpperCase();
  }

  function safeSetText(el, value) {
    if (!el) return;
    el.textContent = value;
  }

  // -----------------------
  // Storage
  // -----------------------
  function saveSales() {
    // guarda só o estado necessário
    const payload = {
      list: state.list,
      showTax: state.showTax,
      taxRate: state.taxRate
    };
    localStorage.setItem(SALES_KEY, JSON.stringify(payload));
  }

  function loadSales() {
    try {
      const raw = localStorage.getItem(SALES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);

      state.list = Array.isArray(parsed.list) ? parsed.list : [];
      state.showTax = parsed.showTax !== false;
      state.taxRate = Number.isFinite(Number(parsed.taxRate)) ? Number(parsed.taxRate) : 28;
    } catch {
      // ignora
    }
  }

  function getPortfolio() {
    try {
      const raw = localStorage.getItem(PORT_KEY);
      if (!raw) return structuredClone(DEFAULT_PORTFOLIO);
      const parsed = JSON.parse(raw);

      // ✅ migração defensiva (caso exista bancoCodeconnect antigo)
      if (parsed?.patrimonio?.bancoCodeconnect != null && parsed?.patrimonio?.bancoPessoal == null) {
        parsed.patrimonio.bancoPessoal = parsed.patrimonio.bancoCodeconnect;
        delete parsed.patrimonio.bancoCodeconnect;
      }

      return { ...structuredClone(DEFAULT_PORTFOLIO), ...parsed };
    } catch {
      return structuredClone(DEFAULT_PORTFOLIO);
    }
  }

  function setPortfolio(data) {
    data.meta = data.meta || {};
    data.meta.lastUpdated = nowISO();
    localStorage.setItem(PORT_KEY, JSON.stringify(data));
  }

  // -----------------------
  // Portfolio helpers (S2)
  // -----------------------
  function portfolioHasTicker(classe, tickerNorm) {
    const port = getPortfolio();
    const t = normalizeTicker(tickerNorm);

    if (classe === "acoes") {
      return (port.stocks || []).some(s => normalizeTicker(s.ticker) === t);
    }
    if (classe === "cripto") {
      return (port.crypto || []).some(c => normalizeTicker(c.coin) === t);
    }
    return true; // outras classes não bloqueiam
  }

  function portfolioQtyFor(classe, ticker) {
    const port = getPortfolio();
    const t = normalizeTicker(ticker);

    if (classe === "acoes") {
      const row = (port.stocks || []).find(s => normalizeTicker(s.ticker) === t);
      return row ? num(row.qty) : 0;
    }

    if (classe === "cripto") {
      const row = (port.crypto || []).find(c => normalizeTicker(c.coin) === t);
      return row ? num(row.qty) : 0;
    }

    return 0;
  }

  function canApplyTrade(trade, editingId) {
    const classe = (trade.classe || "").trim();
    const ticker = normalizeTicker(trade.ticker);
    const qtyNew = num(trade.qty);

    // só validamos classes que mexem no portefólio
    if (!["acoes", "cripto"].includes(classe)) return { ok: true };

    let available = portfolioQtyFor(classe, ticker);

    // ✅ Permitir registar venda mesmo que o ticker não exista no portefólio.
    // Se não existe, não validamos quantidade (fica só como histórico).
    if (!portfolioHasTicker(classe, ticker)) return { ok: true };

    // se está a editar, devolve qty antiga
    if (editingId) {
      const prev = state.list.find(x => x.id === editingId);
      if (prev && normalizeTicker(prev.ticker) === ticker && prev.classe === classe) {
        available += num(prev.qty);
      }
    }

    if (qtyNew > available) {
      return { ok: false, msg: `Não dá para vender ${qtyNew} de ${ticker}. Tens ${available} disponível.` };
    }
    return { ok: true };
  }

  // -----------------------
  // Cálculos
  // -----------------------
  function calcRow(row) {
    const qty = num(row.qty);
    const avgBuy = num(row.avgBuy);
    const sellPrice = num(row.sellPrice);
    const fees = num(row.fees);

    const invested = qty * avgBuy + fees;
    const received = qty * sellPrice;
    const profit = received - invested;
    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;

    const taxRate = num(state.taxRate);
    const tax = profit > 0 ? profit * (taxRate / 100) : 0;
    const net = profit - tax;

    return { invested, received, profit, profitPct, tax, net };
  }

  // -----------------------
  // Sync com portefólio
  // -----------------------
  function applyTradeToPortfolio(trade, dir) {
    // dir = +1 aplicar venda (reduz holdings)
    // dir = -1 rollback (volta a aumentar holdings)
    const classe = (trade.classe || "").trim();
    const ticker = normalizeTicker(trade.ticker);
    const qty = num(trade.qty);
    const avgBuy = num(trade.avgBuy);

    if (!ticker || qty <= 0) return;

    const port = getPortfolio();

    if (classe === "acoes") {
      const idx = (port.stocks || []).findIndex(s => normalizeTicker(s.ticker) === ticker);
      if (idx === -1) {
        console.warn("[Vendas Sync] Ticker não existe em stocks:", ticker);
        return;
      }

      const deltaQty = -qty * dir; // aplicar: -qty | rollback: +qty
      const newQty = num(port.stocks[idx].qty) + deltaQty;
      port.stocks[idx].qty = Math.max(0, newQty);

      setPortfolio(port);
      return;
    }

    if (classe === "cripto") {
      const idx = (port.crypto || []).findIndex(c => normalizeTicker(c.coin) === ticker);
      if (idx === -1) {
        console.warn("[Vendas Sync] Moeda não existe em crypto:", ticker);
        return;
      }

      const deltaQty = -qty * dir;
      const newQty = num(port.crypto[idx].qty) + deltaQty;
      port.crypto[idx].qty = Math.max(0, newQty);

      // Ajuste simples do investido (custo base por qty*avgBuy)
      const deltaInvest = -(qty * avgBuy) * dir;
      const newInvest = num(port.crypto[idx].invest) + deltaInvest;
      port.crypto[idx].invest = Math.max(0, newInvest);

      setPortfolio(port);
      return;
    }
  }

  function rollbackTradeById(id) {
    const prev = state.list.find(x => x.id === id);
    if (!prev) return;
    applyTradeToPortfolio(prev, -1);
  }

  function applyTrade(trade) {
    applyTradeToPortfolio(trade, +1);
  }

  // -----------------------
  // Filtros
  // -----------------------
  function getYearsFromList(list) {
    const years = new Set();
    for (const it of list) {
      const y = (it.date || "").slice(0, 4);
      if (y && y.length === 4) years.add(y);
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }

  function rebuildYearFilter() {
    if (!els.filterYear) return;

    const current = els.filterYear.value || "all";
    const years = getYearsFromList(state.list);

    els.filterYear.innerHTML = `<option value="all">Todos</option>`;
    for (const y of years) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      els.filterYear.appendChild(opt);
    }

    if ([...els.filterYear.options].some(o => o.value === current)) {
      els.filterYear.value = current;
    } else {
      els.filterYear.value = "all";
    }
  }

  function filteredList() {
    const year = els.filterYear ? (els.filterYear.value || "all") : "all";
    const classe = els.filterClasse ? (els.filterClasse.value || "all") : "all";

    return state.list.filter(it => {
      const y = (it.date || "").slice(0, 4);
      const okYear = year === "all" ? true : y === year;
      const okClasse = classe === "all" ? true : it.classe === classe;
      return okYear && okClasse;
    });
  }

  function applyTaxUI() {
    const show = !!state.showTax;
    document.querySelectorAll(".tax-ui").forEach(n => {
      n.style.display = show ? "" : "none";
    });
  }

  // -----------------------
// CRUD
// -----------------------
function setEditMode(id) {
  state.editingId = id;
  const row = state.list.find(x => x.id === id);
  if (!row) return;

  if (els.tradeDate) els.tradeDate.value = row.date || "";
  if (els.tradeClasse) els.tradeClasse.value = row.classe || "acoes";
  if (els.tradeTicker) els.tradeTicker.value = row.ticker || "";
  if (els.tradeQty) els.tradeQty.value = row.qty ?? "";
  if (els.tradeAvgBuy) els.tradeAvgBuy.value = row.avgBuy ?? "";
  if (els.tradeSellPrice) els.tradeSellPrice.value = row.sellPrice ?? "";
  if (els.tradeFees) els.tradeFees.value = row.fees ?? 0;
  if (els.tradeNotes) els.tradeNotes.value = row.notes || "";

  if (els.btnAdd) els.btnAdd.textContent = "Guardar";
  if (els.btnCancel) els.btnCancel.classList.remove("d-none");
}

function clearEditMode() {
  state.editingId = null;

  if (els.btnAdd) els.btnAdd.textContent = "Adicionar";
  if (els.btnCancel) els.btnCancel.classList.add("d-none");

  if (els.form) els.form.reset();
  if (els.tradeFees) els.tradeFees.value = 0;
}

function validateForm() {
  const date = (els.tradeDate?.value || "").trim();
  const classe = (els.tradeClasse?.value || "").trim();
  const ticker = normalizeTicker(els.tradeTicker?.value);

  const qty = num(els.tradeQty?.value);
  const avgBuy = num(els.tradeAvgBuy?.value);
  const sellPrice = num(els.tradeSellPrice?.value);
  const fees = num(els.tradeFees?.value);

  if (!date) return { ok: false, msg: "Falta a data." };
  if (!classe) return { ok: false, msg: "Falta a classe." };
  if (!ticker) return { ok: false, msg: "Falta o ticker/moeda." };
  if (qty <= 0) return { ok: false, msg: "Quantidade tem de ser > 0." };
  if (avgBuy <= 0) return { ok: false, msg: "Preço médio tem de ser > 0." };
  if (sellPrice <= 0) return { ok: false, msg: "Preço de venda tem de ser > 0." };
  if (fees < 0) return { ok: false, msg: "Comissões não podem ser negativas." };

  return {
    ok: true,
    data: {
      date,
      classe,
      ticker,
      qty,
      avgBuy,
      sellPrice,
      fees,
      notes: (els.tradeNotes?.value || "").trim(),
    }
  };
}

function upsertTrade() {
  const v = validateForm();
  if (!v.ok) return alert(v.msg);

  const guard = canApplyTrade(v.data, state.editingId);
  if (!guard.ok) return alert(guard.msg);

  // 1) se editar, rollback impacto anterior
  if (state.editingId) rollbackTradeById(state.editingId);

  // 2) aplica nova venda
  applyTrade(v.data);

  // 3) guarda na lista
  if (state.editingId) {
    const idx = state.list.findIndex(x => x.id === state.editingId);
    if (idx >= 0) state.list[idx] = { ...state.list[idx], ...v.data };
  } else {
    state.list.push({ id: uid(), ...v.data });
  }

  state.editingId = null;
  state.list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  saveSales();
  rebuildYearFilter();
  clearEditMode();
  render();

  // ✅ só dispara evento 1x no fim
  notifyVendasChanged();
}

function removeTrade(id) {
  if (!confirm("Tens a certeza que queres apagar esta realização?")) return;

  rollbackTradeById(id);

  state.list = state.list.filter(x => x.id !== id);
  saveSales();
  rebuildYearFilter();
  render();

  notifyVendasChanged();
}

function clearAll() {
  if (!confirm("Tens a certeza que queres apagar TODAS as vendas/realizações?")) return;

  for (const t of state.list) {
    applyTradeToPortfolio(t, -1);
  }

  state.list = [];
  saveSales();
  rebuildYearFilter();
  clearEditMode();
  render();

  notifyVendasChanged();
}

// -----------------------
// Render
// -----------------------
function renderTotals(list) {
  let investedSum = 0;
  let receivedSum = 0;
  let profitSum = 0;
  let taxSum = 0;
  let netSum = 0;

  for (const row of list) {
    const c = calcRow(row);
    investedSum += c.invested;
    receivedSum += c.received;
    profitSum += c.profit;
    taxSum += c.tax;
    netSum += c.net;
  }

  const pctSum = investedSum > 0 ? (profitSum / investedSum) * 100 : 0;

  safeSetText(els.tInvested, euro(investedSum));
  safeSetText(els.tReceived, euro(receivedSum));
  safeSetText(els.tProfit, euro(profitSum));
  safeSetText(els.tProfitPct, pct(pctSum));

  safeSetText(els.tTax, euro(taxSum));
  safeSetText(els.tNet, euro(netSum));

  safeSetText(els.yProfit, euro(profitSum));
  safeSetText(els.yTax, euro(taxSum));
  safeSetText(els.yNet, euro(netSum));
  safeSetText(els.yCount, String(list.length));
}

function renderTable(list) {
  if (!els.tbody) return;

  els.tbody.innerHTML = "";

  if (!list.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="14" class="text-secondary small">Sem realizações ainda.</td>`;
    els.tbody.appendChild(tr);
    return;
  }

  for (const row of list) {
    const c = calcRow(row);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.date || ""}</td>
      <td>${row.classe || ""}</td>
      <td>${normalizeTicker(row.ticker)}</td>
      <td class="text-end">${num(row.qty).toLocaleString("pt-PT")}</td>
      <td class="text-end">${num(row.avgBuy).toLocaleString("pt-PT", { maximumFractionDigits: 8 })}</td>
      <td class="text-end">${num(row.sellPrice).toLocaleString("pt-PT", { maximumFractionDigits: 8 })}</td>
      <td class="text-end">${euro(c.invested)}</td>
      <td class="text-end">${euro(c.received)}</td>
      <td class="text-end">${euro(c.profit)}</td>
      <td class="text-end">${pct(c.profitPct)}</td>
      <td class="text-end">${euro(num(row.fees))}</td>
      <td class="text-end tax-ui">${euro(c.tax)}</td>
      <td class="text-end tax-ui">${euro(c.net)}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-secondary" data-act="edit" data-id="${row.id}">Editar</button>
          <button class="btn btn-outline-danger" data-act="del" data-id="${row.id}">Apagar</button>
        </div>
      </td>
    `;

    if (row.notes) tr.title = row.notes;
    els.tbody.appendChild(tr);
  }
}

function render() {
  // ✅ defensivo se taxRate não existir no HTML
  if (els.taxRate) {
    state.taxRate = num(els.taxRate.value || state.taxRate);
    els.taxRate.value = state.taxRate;
  }

  const list = filteredList();
  renderTotals(list);
  renderTable(list);
  applyTaxUI();

  // ⚠️ IMPORTANTÍSSIMO: NÃO chamar saveSales() aqui para não criar loops
}

// -----------------------
// Events
// -----------------------
function wireEvents() {
  if (els.form) {
    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      upsertTrade();
    });
  }

  if (els.btnCancel) {
    els.btnCancel.addEventListener("click", () => clearEditMode());
  }

  if (els.btnClearAll) {
    els.btnClearAll.addEventListener("click", () => clearAll());
  }

  if (els.filterYear) els.filterYear.addEventListener("change", render);
  if (els.filterClasse) els.filterClasse.addEventListener("change", render);

  if (els.toggleTax) {
    els.toggleTax.addEventListener("change", () => {
      state.showTax = !!els.toggleTax.checked;
      saveSales();
      applyTaxUI();
      render();
      notifyVendasChanged();
    });
  }

  if (els.taxRate) {
    els.taxRate.addEventListener("input", () => {
      state.taxRate = num(els.taxRate.value);
      saveSales();
      render();
      notifyVendasChanged();
    });
  }

  if (els.tbody) {
    els.tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");

      if (act === "edit") setEditMode(id);
      if (act === "del") removeTrade(id);
    });
  }
}

function initDefaults() {
  if (!els.tradeDate) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");

  if (!els.tradeDate.value) els.tradeDate.value = `${yyyy}-${mm}-${dd}`;
  if (els.tradeFees && (els.tradeFees.value == null || els.tradeFees.value === "")) els.tradeFees.value = 0;
}

// -----------------------
// Public API (para app.js)
// -----------------------
window.VENDAS = window.VENDAS || {};
window.VENDAS.render = render;

// -----------------------
// Init
// -----------------------
function init() {
  loadSales();

  if (els.toggleTax) {
    els.toggleTax.checked = state.showTax !== false;
    state.showTax = !!els.toggleTax.checked;
  }

  if (els.taxRate) {
    els.taxRate.value = state.taxRate ?? 28;
  }

  rebuildYearFilter();
  wireEvents();
  initDefaults();
  render();
}

document.addEventListener("DOMContentLoaded", init);
})();