// vendas.js — Vendas / Realizações (V2 - sincroniza com ras_data_v1)
// Regras (cálculo):
// Investido = (qty * avgBuy) + fees
// Recebido  = (qty * sellPrice)
// Lucro     = Recebido - Investido
// %         = Lucro / Investido
// Imposto   = (Lucro > 0) ? (Lucro * taxRate/100) : 0
// Líquido   = Lucro - Imposto
//
// Sync portefólio (ras_data_v1):
// - Ações/ETF: reduz stocks.qty
// - Cripto: reduz crypto.qty e reduz crypto.invest por (qty*avgBuy)  [simples]
// - Em editar/apagar/limpar: faz rollback do impacto anterior.

(function () {
  const $ = (id) => document.getElementById(id);

  const SALES_KEY = "ras_vendas_v1";
  const PORT_KEY = "ras_data_v1";

  const DEFAULT_PORTFOLIO = {
    meta: { lastUpdated: null },
    patrimonio: { bancoCodeconnect: 0 },
    stocks: [],
    dividends: [],
    crypto: [],
    p2p: [],
    funds: []
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

  let state = {
    list: [],
    editingId: null,
    showTax: true,
    taxRate: 28,
  };

  // -----------------------
  // Helpers
  // -----------------------
  function euro(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }

  function pct(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
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
    function portfolioQtyFor(classe, ticker) {
    const port = getPortfolio();
    const t = normalizeTicker(ticker);

    if (classe === "acoes") {
      const row = port.stocks.find(s => normalizeTicker(s.ticker) === t);
      return row ? num(row.qty) : 0;
    }

    if (classe === "cripto") {
      const row = port.crypto.find(c => normalizeTicker(c.coin) === t);
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

    // qty atual no portefólio
    let available = portfolioQtyFor(classe, ticker);

    // se está a editar, "devolve" a qty antiga para comparar corretamente
    if (editingId) {
      const prev = state.list.find(x => x.id === editingId);
      if (prev && normalizeTicker(prev.ticker) === ticker && prev.classe === classe) {
        available += num(prev.qty);
      }
    }

    if (qtyNew > available) {
      return {
        ok: false,
        msg: `Não dá para vender ${qtyNew} de ${ticker}. Tens ${available} disponível.`
      };
    }

    return { ok: true };
  }

function notifyDashboard() {
  window.dispatchEvent(new CustomEvent("ras:data-updated", {
    detail: { source: "vendas", at: nowISO() }
  }));
}

  function saveSales() {
    localStorage.setItem(SALES_KEY, JSON.stringify(state));
  }

  function loadSales() {
    try {
      const raw = localStorage.getItem(SALES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        state = {
          ...state,
          ...parsed,
          list: Array.isArray(parsed.list) ? parsed.list : [],
        };
      }
    } catch {
      // ignora
    }
  }

  function getPortfolio() {
    try {
      const raw = localStorage.getItem(PORT_KEY);
      if (!raw) return structuredClone(DEFAULT_PORTFOLIO);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_PORTFOLIO), ...parsed };
    } catch {
      return structuredClone(DEFAULT_PORTFOLIO);
    }
  }

  function setPortfolio(data) {
  data.meta = data.meta || {};
  data.meta.lastUpdated = nowISO();
  localStorage.setItem(PORT_KEY, JSON.stringify(data));

  // ✅ força update imediato do dashboard (sem refresh)
  if (window.RAS && typeof window.RAS.refresh === "function") {
    window.RAS.refresh();
  } else {
    // fallback
    window.dispatchEvent(new Event("ras:data-updated"));
  }
}
function portfolioHasTicker(classe, ticker) {
  const port = getPortfolio();

  if (classe === "acoes") {
    return port.stocks.some(s => normalizeTicker(s.ticker) === ticker);
  }

  if (classe === "cripto") {
    return port.crypto.some(c => normalizeTicker(c.coin) === ticker);
  }

  return true; // outras classes não bloqueiam
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
    const classe = trade.classe;
    const ticker = normalizeTicker(trade.ticker);
    const qty = num(trade.qty);
    const avgBuy = num(trade.avgBuy);

    if (!ticker || qty <= 0) return;

    const port = getPortfolio();

    if (classe === "acoes") {
      const idx = port.stocks.findIndex(s => normalizeTicker(s.ticker) === ticker);
      if (idx === -1) {
        // Não existe no portefólio — não mexe, mas avisa (debug)
        console.warn("[Vendas Sync] Ticker não existe em stocks:", ticker);
        return;
      }

      const delta = -qty * dir; // aplicar: -qty | rollback: +qty
      const newQty = num(port.stocks[idx].qty) + delta;
      port.stocks[idx].qty = Math.max(0, newQty);

      // se qty ficar 0, opcionalmente podes manter a linha (eu mantenho)
      setPortfolio(port);
      return;
    }

    if (classe === "cripto") {
      const idx = port.crypto.findIndex(c => normalizeTicker(c.coin) === ticker);
      if (idx === -1) {
        console.warn("[Vendas Sync] Moeda não existe em crypto:", ticker);
        return;
      }

      const deltaQty = -qty * dir; // aplicar: -qty | rollback: +qty
      const newQty = num(port.crypto[idx].qty) + deltaQty;
      port.crypto[idx].qty = Math.max(0, newQty);

      // Ajuste simples do investido (custo base por qty*avgBuy)
      // aplicar: reduz invest | rollback: aumenta invest
      const deltaInvest = -(qty * avgBuy) * dir;
      const newInvest = num(port.crypto[idx].invest) + deltaInvest;
      port.crypto[idx].invest = Math.max(0, newInvest);

      setPortfolio(port);
      return;
    }

    // "outros": não mexe no portefólio (por agora)
  }

  function rollbackTradeById(id) {
    const prev = state.list.find(x => x.id === id);
    if (!prev) return;
    // rollback = dir -1
    applyTradeToPortfolio(prev, -1);
  }

  function applyTrade(trade) {
    // aplicar = dir +1
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
    const year = els.filterYear.value || "all";
    const classe = els.filterClasse.value || "all";

    return state.list.filter(it => {
      const y = (it.date || "").slice(0, 4);
      const okYear = year === "all" ? true : y === year;
      const okClasse = classe === "all" ? true : it.classe === classe;
      return okYear && okClasse;
    });
  }

  function applyTaxUI() {
    const show = !!state.showTax;
    const nodes = document.querySelectorAll(".tax-ui");
    nodes.forEach(n => {
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

    els.tradeDate.value = row.date || "";
    els.tradeClasse.value = row.classe || "acoes";
    els.tradeTicker.value = row.ticker || "";
    els.tradeQty.value = row.qty ?? "";
    els.tradeAvgBuy.value = row.avgBuy ?? "";
    els.tradeSellPrice.value = row.sellPrice ?? "";
    els.tradeFees.value = row.fees ?? 0;
    els.tradeNotes.value = row.notes || "";

    els.btnAdd.textContent = "Guardar";
    els.btnCancel.classList.remove("d-none");
  }

  function clearEditMode() {
    state.editingId = null;
    els.btnAdd.textContent = "Adicionar";
    els.btnCancel.classList.add("d-none");
    els.form.reset();
    els.tradeFees.value = 0;
  }

  function validateForm() {
    const date = (els.tradeDate.value || "").trim();
    const classe = (els.tradeClasse.value || "").trim();
    const ticker = normalizeTicker(els.tradeTicker.value);
// S2 — bloquear vendas de tickers que não existem no portefólio (para ações/cripto)
if ((classe === "acoes" || classe === "cripto") && !portfolioHasTicker(classe, ticker)) {
  return { ok: false, msg: `Esse ${classe === "acoes" ? "ticker" : "ativo"} não existe no portefólio (${ticker}).` };
}

    const qty = num(els.tradeQty.value);
    const avgBuy = num(els.tradeAvgBuy.value);
    const sellPrice = num(els.tradeSellPrice.value);
    const fees = num(els.tradeFees.value);

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
        notes: (els.tradeNotes.value || "").trim(),
      }
    };
  }

  function upsertTrade() {
    const v = validateForm();
    if (!v.ok) {
      alert(v.msg);
      return;
    }
    // ✅ valida se não está a vender mais do que tem (considera edição)
    const guard = canApplyTrade(v.data, state.editingId);
    if (!guard.ok) {
      alert(guard.msg);
      return;
    }

    // 1) se está a editar, faz rollback do impacto anterior no portefólio
    if (state.editingId) {
      rollbackTradeById(state.editingId);
    }

    // 2) aplica a nova venda no portefólio
    applyTrade(v.data);

    // 3) guarda na lista (update/insert)
    if (state.editingId) {
      const idx = state.list.findIndex(x => x.id === state.editingId);
      if (idx >= 0) {
        state.list[idx] = { ...state.list[idx], ...v.data };
      }
    } else {
      state.list.push({ id: uid(), ...v.data });
    }

    state.editingId = null;

    // ordena por data desc
    state.list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    saveSales();
    rebuildYearFilter();
    clearEditMode();
    notifyDashboard();
    render();
  }

  function removeTrade(id) {
    if (!confirm("Tens a certeza que queres apagar esta realização?")) return;

    // rollback no portefólio
    rollbackTradeById(id);

    state.list = state.list.filter(x => x.id !== id);
    saveSales();
    rebuildYearFilter();
    render();
  }
  window.dispatchEvent(new Event("ras:data-updated"));

  function clearAll() {
    if (!confirm("Tens a certeza que queres apagar TODAS as vendas/realizações?")) return;

    // rollback de todas as vendas (volta o portefólio ao estado pré-vendas)
    for (const t of state.list) {
      applyTradeToPortfolio(t, -1);
    }

    state.list = [];
    saveSales();
    rebuildYearFilter();
    clearEditMode();
    notifyDashboard();
    render();
  }
window.dispatchEvent(new Event("ras:data-updated"));

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

    els.tInvested.textContent = euro(investedSum);
    els.tReceived.textContent = euro(receivedSum);
    els.tProfit.textContent = euro(profitSum);
    els.tProfitPct.textContent = pct(pctSum);

    els.tTax.textContent = euro(taxSum);
    els.tNet.textContent = euro(netSum);

    els.yProfit.textContent = euro(profitSum);
    els.yTax.textContent = euro(taxSum);
    els.yNet.textContent = euro(netSum);
    els.yCount.textContent = String(list.length);
  }

  function renderTable(list) {
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
    state.taxRate = num(els.taxRate.value || state.taxRate);
    els.taxRate.value = state.taxRate;

    const list = filteredList();
    renderTotals(list);
    renderTable(list);
    applyTaxUI();
    saveSales();
  }

  // -----------------------
  // Events
  // -----------------------
  function wireEvents() {
    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      upsertTrade();
    });

    els.btnCancel.addEventListener("click", () => {
      clearEditMode();
    });

    els.btnClearAll.addEventListener("click", () => {
      clearAll();
    });

    els.filterYear.addEventListener("change", render);
    els.filterClasse.addEventListener("change", render);

    els.toggleTax.addEventListener("change", () => {
      state.showTax = !!els.toggleTax.checked;
      applyTaxUI();
      render();
    });

    els.taxRate.addEventListener("input", () => {
      state.taxRate = num(els.taxRate.value);
      render();
    });

    els.tbody.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;

      const act = btn.getAttribute("data-act");
      const id = btn.getAttribute("data-id");

      if (act === "edit") setEditMode(id);
      if (act === "del") removeTrade(id);
    });
  }

  function initDefaults() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    if (!els.tradeDate.value) els.tradeDate.value = `${yyyy}-${mm}-${dd}`;
  }

  function init() {
    if (!els.section) return;

    loadSales();

    els.toggleTax.checked = state.showTax !== false;
    state.showTax = !!els.toggleTax.checked;

    els.taxRate.value = state.taxRate ?? 28;

    rebuildYearFilter();
    wireEvents();
    initDefaults();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
