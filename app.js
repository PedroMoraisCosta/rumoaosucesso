/* app.js — Dashboard V1 (localStorage) */
(function () {
  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    session: "ras_session_v1",
    data: "ras_data_v1"
  };

  const DEFAULT_DATA = {
    meta: { lastUpdated: null },
    patrimonio: { bancoPessoal: 0 },
    stocks: [],
    dividends: [],
    crypto: [],
    p2p: [],
    funds: []
  };

  // -----------------------
  // Helpers
  // -----------------------
  function nowISO() { return new Date().toISOString(); }

  function fmtEUR(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }

  function fmtPct(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function safeNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function confirmDanger(msg) {
    return window.confirm(msg);
  }

  function setData(data) {
    data.meta.lastUpdated = nowISO();
    localStorage.setItem(STORAGE.data, JSON.stringify(data));
  }

  function getData() {
    try {
      const raw = localStorage.getItem(STORAGE.data);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULT_DATA), ...parsed };
    } catch {
      return structuredClone(DEFAULT_DATA);
    }
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(STORAGE.session);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function requireSession() {
    const s = getSession();
    if (!s || !s.email) {
      window.location.href = "./index.html";
      return null;
    }
    return s;
  }

  // -----------------------
  // Navigation / Sections
  // -----------------------
  const SECTION_MAP = {
    patrimonio: { title: "Património", el: "sec-patrimonio" },
    acoes: { title: "Ações + Dividendos", el: "sec-acoes" },
    cripto: { title: "Cripto", el: "sec-cripto" },
    p2p: { title: "P2P", el: "sec-p2p" },
    fundos: { title: "Fundos Parados", el: "sec-fundos" },
    vendas: { title: "Vendas / Realizações", el: "sec-vendas" },
    graficos: { title: "Gráficos", el: "sec-graficos" },
    ia: { title: "Resumo por IA", el: "sec-ia" }
  };

  function setActiveMenu(section) {
    document.querySelectorAll("#menuList a").forEach(a => {
      const s = a.getAttribute("data-section");
      a.classList.toggle("active", s === section);
    });
  }

  function showSection(section) {
    const key = SECTION_MAP[section] ? section : "patrimonio";
    Object.values(SECTION_MAP).forEach(v => {
      const el = $(v.el);
      if (el) el.style.display = "none";
    });
    const target = $(SECTION_MAP[key].el);
    if (target) target.style.display = "block";
    setActiveMenu(key);
    const t = $("pageTitle");
    if (t) t.textContent = SECTION_MAP[key].title;
  }

  function readHash() {
    const h = (window.location.hash || "").replace("#", "").trim();
    return h || "patrimonio";
  }

  // -----------------------
  // Global actions (export/import/demo/wipe)
  // -----------------------
  function exportJSON() {
    const data = getData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rumo-ao-sucesso-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        const merged = { ...structuredClone(DEFAULT_DATA), ...obj };

        // Migração simples: se vier bancoCodeconnect antigo, passa para bancoPessoal
        if (merged?.patrimonio?.bancoCodeconnect != null && merged?.patrimonio?.bancoPessoal == null) {
          merged.patrimonio.bancoPessoal = merged.patrimonio.bancoCodeconnect;
          delete merged.patrimonio.bancoCodeconnect;
        }

        setData(merged);
        renderAll();
        alert("Importado com sucesso ✅");
      } catch {
        alert("JSON inválido. Não foi possível importar.");
      }
    };
    input.click();
  }

  async function loadDemo() {
    try {
      const res = await fetch("./data/demo.json", { cache: "no-store" });
      if (!res.ok) throw new Error("Falha a carregar demo.json");
      const obj = await res.json();
      const merged = { ...structuredClone(DEFAULT_DATA), ...obj };

      // Migração demo (se tiver bancoCodeconnect)
      if (merged?.patrimonio?.bancoCodeconnect != null && merged?.patrimonio?.bancoPessoal == null) {
        merged.patrimonio.bancoPessoal = merged.patrimonio.bancoCodeconnect;
        delete merged.patrimonio.bancoCodeconnect;
      }

      setData(merged);
      renderAll();
      alert("Demo carregada ✅");
    } catch {
      alert("Não consegui carregar ./data/demo.json. Confirma se existe na pasta /data.");
    }
  }

  function wipeAllData() {
    if (!confirmDanger("Tens a certeza que queres APAGAR todos os dados?")) return;
    setData(structuredClone(DEFAULT_DATA));
    renderAll();
  }

  // -----------------------
  // Calculators
  // -----------------------
  function calcStocks(data) {
    const invested = data.stocks.reduce((a, x) => a + safeNum(x.qty) * safeNum(x.avg), 0);
    const current = data.stocks.reduce((a, x) => a + safeNum(x.qty) * safeNum(x.cur), 0);
    const profit = current - invested;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;
    return { invested, current, profit, pct };
  }

  function calcCrypto(data) {
    const invested = data.crypto.reduce((a, x) => a + safeNum(x.invest), 0);
    const current = data.crypto.reduce((a, x) => a + safeNum(x.qty) * safeNum(x.price), 0);
    const profit = current - invested;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;
    return { invested, current, profit, pct };
  }

  function yearsFromDates(startStr, endStr) {
    if (!startStr || !endStr) return null;
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
    const diffMs = e.getTime() - s.getTime();
    if (diffMs <= 0) return null;
    return diffMs / (1000 * 60 * 60 * 24 * 365.25);
  }

  // P2P = JUROS SIMPLES
  function calcP2PRow(row) {
    const invested = safeNum(row.amount);
    const rate = safeNum(row.rate);

    let years = yearsFromDates(row.start, row.end);
    if (years == null) years = safeNum(row.years);
    if (!Number.isFinite(years) || years <= 0) years = 1;

    const profit = invested * (rate / 100) * years; // simples
    const finalValue = invested + profit;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;

    // lucro por ano (para o total anual)
    const profitPerYear = invested * (rate / 100);

    return { years, finalValue, profit, pct, profitPerYear };
  }

  function calcP2P(data) {
    const invested = data.p2p.reduce((a, x) => a + safeNum(x.amount), 0);
    const finals = data.p2p.reduce((a, x) => a + calcP2PRow(x).finalValue, 0);
    const profit = finals - invested;

    const avgPct =
      data.p2p.length > 0
        ? data.p2p.reduce((a, x) => a + calcP2PRow(x).pct, 0) / data.p2p.length
        : 0;

    // total anual estimado (simples)
    const profitPerYear = data.p2p.reduce((a, x) => a + calcP2PRow(x).profitPerYear, 0);

    return { invested, finals, profit, avgPct, profitPerYear };
  }

  // Fundos Parados = COMPOSTOS (mensal/anual)
  function annualRateFromFunds(rate, freq) {
    const r = safeNum(rate) / 100;
    if (freq === "monthly") {
      return (Math.pow(1 + r, 12) - 1) * 100;
    }
    return r * 100;
  }

  function calcFunds(data) {
    const total = data.funds.reduce((a, x) => a + safeNum(x.amount), 0);

    const yearProfit = data.funds.reduce((a, x) => {
      const ar = annualRateFromFunds(x.rate, x.freq) / 100;
      return a + safeNum(x.amount) * ar;
    }, 0);

    const avgRate =
      total > 0
        ? (data.funds.reduce((a, x) => {
            const ar = annualRateFromFunds(x.rate, x.freq) / 100;
            return a + safeNum(x.amount) * ar;
          }, 0) / total) * 100
        : 0;

    const monthProfit = yearProfit / 12;
    const dayProfit = yearProfit / 365.25;

    return { total, yearProfit, monthProfit, dayProfit, avgRate };
  }

  // Dividendos — total anual/mensal/diário
  function calcDividendsTotal(data) {
    let year = 0;
    for (const d of data.dividends) {
      const stRow = data.stocks.find(s => s.ticker === d.ticker);
      const qty = stRow ? safeNum(stRow.qty) : 0;
      year += qty * safeNum(d.yearPerShare);
    }
    const month = year / 12;
    const day = year / 365.25;
    return { year, month, day };
  }

  // -----------------------
  // Patrimonio (auto + ganhos recorrentes)
  // -----------------------
  function renderPatrimonio() {
    const data = getData();

    const st = calcStocks(data);
    const cr = calcCrypto(data);
    const p2 = calcP2P(data);
    const fd = calcFunds(data);
    const dv = calcDividendsTotal(data);

    const totalInvestidoAtivos = st.invested + cr.invested + p2.invested;
    const ativosAtuais = st.current + cr.current + p2.finals;

    const lucroTotal =
      (st.current - st.invested) +
      (cr.current - cr.invested) +
      (p2.finals - p2.invested);

    const pctLucro = totalInvestidoAtivos > 0 ? (lucroTotal / totalInvestidoAtivos) * 100 : 0;

    const banco = safeNum(data.patrimonio?.bancoPessoal);
    const patrimonioTotal = ativosAtuais + fd.total + banco;

    // total anual “recorrente” (estimativa)
    const totalRecorrenteAno = dv.year + p2.profitPerYear + fd.yearProfit;
    const totalRecorrenteMes = totalRecorrenteAno / 12;
    const totalRecorrenteDia = totalRecorrenteAno / 365.25;

    // KPIs principais
    if ($("plTotalInvestido")) $("plTotalInvestido").textContent = fmtEUR(totalInvestidoAtivos);
    if ($("plAtivosAtuais")) $("plAtivosAtuais").textContent = fmtEUR(ativosAtuais);
    if ($("plLucroTotal")) $("plLucroTotal").textContent = fmtEUR(lucroTotal);
    if ($("plPctLucro")) $("plPctLucro").textContent = fmtPct(pctLucro);
    if ($("plPatrimonioTotal")) $("plPatrimonioTotal").textContent = fmtEUR(patrimonioTotal);

    // Banco pessoal
    const inpB = $("inpBancoPessoal");
    if (inpB) inpB.value = String(banco || 0);

    // Recorrentes (totais)
    if ($("plRecAno")) $("plRecAno").textContent = fmtEUR(totalRecorrenteAno);
    if ($("plRecMes")) $("plRecMes").textContent = fmtEUR(totalRecorrenteMes);
    if ($("plRecDia")) $("plRecDia").textContent = fmtEUR(totalRecorrenteDia);

    // Breakdown
    if ($("plDvAno")) $("plDvAno").textContent = fmtEUR(dv.year);
    if ($("plDvMes")) $("plDvMes").textContent = fmtEUR(dv.month);
    if ($("plDvDia")) $("plDvDia").textContent = fmtEUR(dv.day);

    if ($("plP2Ano")) $("plP2Ano").textContent = fmtEUR(p2.profitPerYear);
    if ($("plP2Mes")) $("plP2Mes").textContent = fmtEUR(p2.profitPerYear / 12);
    if ($("plP2Dia")) $("plP2Dia").textContent = fmtEUR(p2.profitPerYear / 365.25);

    if ($("plFdAno")) $("plFdAno").textContent = fmtEUR(fd.yearProfit);
    if ($("plFdMes")) $("plFdMes").textContent = fmtEUR(fd.monthProfit);
    if ($("plFdDia")) $("plFdDia").textContent = fmtEUR(fd.dayProfit);
  }

  function saveBancoPessoal() {
    const data = getData();
    data.patrimonio = data.patrimonio || {};
    data.patrimonio.bancoPessoal = safeNum($("inpBancoPessoal")?.value);
    setData(data);
    renderPatrimonio();
  }

  // -----------------------
  // Stocks + Dividends
  // -----------------------
  let stEditingId = null;
  let dvEditingId = null;

  function upsertStock(row) {
    const data = getData();
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) return alert("Ticker inválido.");
    const qty = safeNum(row.qty);
    const avg = safeNum(row.avg);
    const cur = safeNum(row.cur);
    if (qty <= 0) return alert("Nº ações tem de ser > 0.");
    if (avg <= 0 || cur <= 0) return alert("Preço médio e atual têm de ser > 0.");

    if (stEditingId) {
      const idx = data.stocks.findIndex(x => x.id === stEditingId);
      if (idx >= 0) data.stocks[idx] = { ...data.stocks[idx], ticker, qty, avg, cur };
      stEditingId = null;
    } else {
      const id = cryptoRandomId();
      data.stocks.push({ id, ticker, qty, avg, cur });
    }

    setData(data);
    renderStocks();
    renderDividends();
    renderPatrimonio();
    clearStockForm();
  }

  function clearStockForm() {
    if ($("stTicker")) $("stTicker").value = "";
    if ($("stQty")) $("stQty").value = "";
    if ($("stAvg")) $("stAvg").value = "";
    if ($("stCur")) $("stCur").value = "";
    stEditingId = null;
  }

  function renderStocks() {
    const data = getData();
    const st = calcStocks(data);

    if ($("stTotalInvest")) $("stTotalInvest").textContent = fmtEUR(st.invested);
    if ($("stTotalCurrent")) $("stTotalCurrent").textContent = fmtEUR(st.current);
    if ($("stTotalProfit")) $("stTotalProfit").textContent = fmtEUR(st.profit);
    if ($("stTotalPct")) $("stTotalPct").textContent = fmtPct(st.pct);

    const tbody = $("stTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (const x of data.stocks) {
      const invested = safeNum(x.qty) * safeNum(x.avg);
      const current = safeNum(x.qty) * safeNum(x.cur);
      const profit = current - invested;
      const pct = invested > 0 ? (profit / invested) * 100 : 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fw-semibold">${escapeHtml(x.ticker)}</td>
        <td class="text-end">${safeNum(x.qty)}</td>
        <td class="text-end">${safeNum(x.avg)}</td>
        <td class="text-end">${safeNum(x.cur)}</td>
        <td class="text-end">${fmtEUR(invested)}</td>
        <td class="text-end">${fmtEUR(profit)}</td>
        <td class="text-end">${fmtPct(pct)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" data-act="rec" data-id="${x.id}" type="button">Reconciliar</button>
<button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
<button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>

      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        if (act === "edit") {
          const data2 = getData();
          const row = data2.stocks.find(r => r.id === id);
          if (act === "rec") {
  openReconcile("stocks", id);
}

          if (!row) return;
          stEditingId = id;
          if ($("stTicker")) $("stTicker").value = row.ticker;
          if ($("stQty")) $("stQty").value = row.qty;
          if ($("stAvg")) $("stAvg").value = row.avg;
          if ($("stCur")) $("stCur").value = row.cur;
        }
        if (act === "del") {
          if (!confirmDanger("Apagar esta ação?")) return;
          const data2 = getData();
          const removedTicker = (data2.stocks.find(r => r.id === id)?.ticker) || null;
          data2.stocks = data2.stocks.filter(r => r.id !== id);
          if (removedTicker) data2.dividends = data2.dividends.filter(d => d.ticker !== removedTicker);
          setData(data2);
          renderStocks();
          renderDividends();
          renderPatrimonio();
        }
      });
    });

    fillDividendTickerSelect();
  }

  function wipeStocksAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODAS as ações e dividendos?")) return;
    const data = getData();
    data.stocks = [];
    data.dividends = [];
    setData(data);
    renderStocks();
    renderDividends();
    renderPatrimonio();
    clearStockForm();
    clearDividendForm();
  }

  function fillDividendTickerSelect() {
    const data = getData();
    const sel = $("dvTicker");
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = "";
    const tickers = [...new Set(data.stocks.map(s => s.ticker))].sort();
    for (const t of tickers) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
    if (tickers.includes(current)) sel.value = current;
    updateDividendQtyAuto();
  }

  function updateDividendQtyAuto() {
    const data = getData();
    const ticker = $("dvTicker")?.value;
    const stRow = data.stocks.find(s => s.ticker === ticker);
    const inp = $("dvQtyAuto");
    if (inp) inp.value = stRow ? String(stRow.qty) : "0";
  }

  function upsertDividend(row) {
    const data = getData();
    const ticker = String(row.ticker || "").trim().toUpperCase();
    if (!ticker) return alert("Escolhe um ticker.");
    const stRow = data.stocks.find(s => s.ticker === ticker);
    if (!stRow) return alert("Ticker não existe em Ações.");
    const yearPerShare = safeNum(row.yearPerShare);
    const payN = safeNum(row.payN);
    if (yearPerShare <= 0) return alert("Dividendo/ano por ação tem de ser > 0.");
    if (![1, 2, 4, 12].includes(payN)) return alert("Pagamentos inválidos.");

    if (dvEditingId) {
      const idx = data.dividends.findIndex(d => d.id === dvEditingId);
      if (idx >= 0) data.dividends[idx] = { ...data.dividends[idx], ticker, yearPerShare, payN };
      dvEditingId = null;
    } else {
      const id = cryptoRandomId();
      const existsIdx = data.dividends.findIndex(d => d.ticker === ticker);
      if (existsIdx >= 0) data.dividends[existsIdx] = { ...data.dividends[existsIdx], yearPerShare, payN };
      else data.dividends.push({ id, ticker, yearPerShare, payN });
    }

    setData(data);
    renderDividends();
    renderPatrimonio();
    clearDividendForm();
  }

  function clearDividendForm() {
    if ($("dvYearPerShare")) $("dvYearPerShare").value = "";
    if ($("dvPay")) $("dvPay").value = "12";
    dvEditingId = null;
    updateDividendQtyAuto();
  }

  function renderDividends() {
    const data = getData();
    fillDividendTickerSelect();

    const tbody = $("dvTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (const d of data.dividends) {
      const stRow = data.stocks.find(s => s.ticker === d.ticker);
      const qty = stRow ? safeNum(stRow.qty) : 0;
      const yearPerShare = safeNum(d.yearPerShare);
      const receivedYear = qty * yearPerShare;
      const receivedMonth = receivedYear / 12;
      const receivedDay = receivedYear / 365.25;
      const perPay = safeNum(d.payN) > 0 ? receivedYear / safeNum(d.payN) : receivedYear;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fw-semibold">${escapeHtml(d.ticker)}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${yearPerShare}</td>
        <td class="text-end">${fmtEUR(receivedYear)}</td>
        <td class="text-end">${fmtEUR(receivedMonth)}</td>
        <td class="text-end">${fmtEUR(receivedDay)}</td>
        <td class="text-end">${fmtEUR(perPay)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${d.id}" type="button">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${d.id}" type="button">Apagar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const data2 = getData();
        if (act === "edit") {
          const row = data2.dividends.find(r => r.id === id);
          if (!row) return;
          dvEditingId = id;
          if ($("dvTicker")) $("dvTicker").value = row.ticker;
          updateDividendQtyAuto();
          if ($("dvYearPerShare")) $("dvYearPerShare").value = row.yearPerShare;
          if ($("dvPay")) $("dvPay").value = String(row.payN);
        }
        if (act === "del") {
          if (!confirmDanger("Apagar este dividendo?")) return;
          data2.dividends = data2.dividends.filter(r => r.id !== id);
          setData(data2);
          renderDividends();
          renderPatrimonio();
        }
      });
    });

    updateDividendQtyAuto();
  }

  function wipeDividendsAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODOS os dividendos?")) return;
    const data = getData();
    data.dividends = [];
    setData(data);
    renderDividends();
    renderPatrimonio();
  }

  // -----------------------
  // Crypto
  // -----------------------
  let crEditingId = null;

  function upsertCrypto(row) {
    const data = getData();
    const coin = String(row.coin || "").trim().toUpperCase();
    if (!coin) return alert("Moeda inválida.");
    const invest = safeNum(row.invest);
    const qty = safeNum(row.qty);
    const price = safeNum(row.price);
    if (invest <= 0) return alert("€ Investido tem de ser > 0.");
    if (qty <= 0) return alert("Quantidade tem de ser > 0.");
    if (price <= 0) return alert("Preço atual tem de ser > 0.");

    if (crEditingId) {
      const idx = data.crypto.findIndex(x => x.id === crEditingId);
      if (idx >= 0) data.crypto[idx] = { ...data.crypto[idx], coin, invest, qty, price };
      crEditingId = null;
    } else {
      const id = cryptoRandomId();
      data.crypto.push({ id, coin, invest, qty, price });
    }

    setData(data);
    renderCrypto();
    renderPatrimonio();
    clearCryptoForm();
  }

  function clearCryptoForm() {
    if ($("crCoin")) $("crCoin").value = "";
    if ($("crInvest")) $("crInvest").value = "";
    if ($("crQty")) $("crQty").value = "";
    if ($("crPrice")) $("crPrice").value = "";
    crEditingId = null;
  }

  function renderCrypto() {
    const data = getData();
    const c = calcCrypto(data);

    if ($("crTotalInvest")) $("crTotalInvest").textContent = fmtEUR(c.invested);
    if ($("crTotalCurrent")) $("crTotalCurrent").textContent = fmtEUR(c.current);
    if ($("crTotalProfit")) $("crTotalProfit").textContent = fmtEUR(c.profit);
    if ($("crTotalPct")) $("crTotalPct").textContent = fmtPct(c.pct);

    const tbody = $("crTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (const x of data.crypto) {
      const current = safeNum(x.qty) * safeNum(x.price);
      const profit = current - safeNum(x.invest);
      const pct = safeNum(x.invest) > 0 ? (profit / safeNum(x.invest)) * 100 : 0;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fw-semibold">${escapeHtml(x.coin)}</td>
        <td class="text-end">${fmtEUR(x.invest)}</td>
        <td class="text-end">${safeNum(x.qty)}</td>
        <td class="text-end">${safeNum(x.price)}</td>
        <td class="text-end">${fmtEUR(current)}</td>
        <td class="text-end">${fmtEUR(profit)}</td>
        <td class="text-end">${fmtPct(pct)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" data-act="rec" data-id="${x.id}" type="button">Reconciliar</button>
<button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
<button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>

      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const data2 = getData();
        if (act === "edit") {
          const row = data2.crypto.find(r => r.id === id);
          if (!row) return;
          crEditingId = id;
          if ($("crCoin")) $("crCoin").value = row.coin;
          if ($("crInvest")) $("crInvest").value = row.invest;
          if ($("crQty")) $("crQty").value = row.qty;
          if ($("crPrice")) $("crPrice").value = row.price;
        }
        if (act === "rec") {
  openReconcile("crypto", id);
}

        if (act === "del") {
          if (!confirmDanger("Apagar esta moeda?")) return;
          data2.crypto = data2.crypto.filter(r => r.id !== id);
          setData(data2);
          renderCrypto();
          renderPatrimonio();
        }
      });
    });
  }

  function wipeCryptoAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODAS as criptos?")) return;
    const data = getData();
    data.crypto = [];
    setData(data);
    renderCrypto();
    renderPatrimonio();
    clearCryptoForm();
  }

  // -----------------------
  // P2P
  // -----------------------
  let p2EditingId = null;

  function upsertP2P(row) {
    const data = getData();
    const platform = String(row.platform || "").trim();
    const project = String(row.project || "").trim();
    const amount = safeNum(row.amount);
    const rate = safeNum(row.rate);
    const years = safeNum(row.years);
    const start = row.start || "";
    const end = row.end || "";

    if (!platform) return alert("Plataforma inválida.");
    if (!project) return alert("Projeto inválido.");
    if (amount <= 0) return alert("€ Investido tem de ser > 0.");
    if (rate <= 0) return alert("% anual tem de ser > 0.");

    const idPayload = { platform, project, amount, rate, years, start, end };

    if (p2EditingId) {
      const idx = data.p2p.findIndex(x => x.id === p2EditingId);
      if (idx >= 0) data.p2p[idx] = { ...data.p2p[idx], ...idPayload };
      p2EditingId = null;
    } else {
      data.p2p.push({ id: cryptoRandomId(), ...idPayload });
    }

    setData(data);
    renderP2P();
    renderPatrimonio();
    clearP2PForm();
  }

  function clearP2PForm() {
    if ($("p2Platform")) $("p2Platform").value = "";
    if ($("p2Project")) $("p2Project").value = "";
    if ($("p2Amount")) $("p2Amount").value = "";
    if ($("p2Rate")) $("p2Rate").value = "";
    if ($("p2Years")) $("p2Years").value = "";
    if ($("p2Start")) $("p2Start").value = "";
    if ($("p2End")) $("p2End").value = "";
    p2EditingId = null;
  }

  function renderP2P() {
    const data = getData();
    const p = calcP2P(data);

    if ($("p2Invest")) $("p2Invest").textContent = fmtEUR(p.invested);
    if ($("p2Final")) $("p2Final").textContent = fmtEUR(p.finals);
    if ($("p2Profit")) $("p2Profit").textContent = fmtEUR(p.profit);
    if ($("p2AvgPct")) $("p2AvgPct").textContent = fmtPct(p.avgPct);

    const tbody = $("p2Table");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (const x of data.p2p) {
      const r = calcP2PRow(x);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(x.platform)}</td>
        <td>${escapeHtml(x.project)}</td>
        <td class="text-end">${fmtEUR(x.amount)}</td>
        <td class="text-end">${fmtPct(x.rate)}</td>
        <td class="text-end">${r.years.toFixed(2)}</td>
        <td class="text-end">${fmtEUR(r.finalValue)}</td>
        <td class="text-end">${fmtEUR(r.profit)}</td>
        <td class="text-end">${fmtPct(r.pct)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const data2 = getData();
        if (act === "edit") {
          const row = data2.p2p.find(r => r.id === id);
          if (!row) return;
          p2EditingId = id;
          if ($("p2Platform")) $("p2Platform").value = row.platform;
          if ($("p2Project")) $("p2Project").value = row.project;
          if ($("p2Amount")) $("p2Amount").value = row.amount;
          if ($("p2Rate")) $("p2Rate").value = row.rate;
          if ($("p2Years")) $("p2Years").value = row.years;
          if ($("p2Start")) $("p2Start").value = row.start || "";
          if ($("p2End")) $("p2End").value = row.end || "";
        }
        if (act === "del") {
          if (!confirmDanger("Apagar este projeto P2P?")) return;
          data2.p2p = data2.p2p.filter(r => r.id !== id);
          setData(data2);
          renderP2P();
          renderPatrimonio();
        }
      });
    });
  }

  function wipeP2PAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODOS os projetos P2P?")) return;
    const data = getData();
    data.p2p = [];
    setData(data);
    renderP2P();
    renderPatrimonio();
    clearP2PForm();
  }

  // -----------------------
  // Funds Parados
  // -----------------------
  let fdEditingId = null;

  function upsertFund(row) {
    const data = getData();
    const platform = String(row.platform || "").trim();
    const amount = safeNum(row.amount);
    const rate = safeNum(row.rate);
    const freq = row.freq === "monthly" ? "monthly" : "annual";

    if (!platform) return alert("Plataforma inválida.");
    if (amount <= 0) return alert("€ Valor tem de ser > 0.");
    if (rate <= 0) return alert("Juro (%) tem de ser > 0.");

    const payload = { platform, amount, rate, freq };

    if (fdEditingId) {
      const idx = data.funds.findIndex(x => x.id === fdEditingId);
      if (idx >= 0) data.funds[idx] = { ...data.funds[idx], ...payload };
      fdEditingId = null;
    } else {
      data.funds.push({ id: cryptoRandomId(), ...payload });
    }

    setData(data);
    renderFunds();
    renderPatrimonio();
    clearFundsForm();
  }

  function clearFundsForm() {
    if ($("fdPlatform")) $("fdPlatform").value = "";
    if ($("fdAmount")) $("fdAmount").value = "";
    if ($("fdRate")) $("fdRate").value = "";
    if ($("fdFreq")) $("fdFreq").value = "annual";
    fdEditingId = null;
  }

  function renderFunds() {
    const data = getData();
    const f = calcFunds(data);

    if ($("fdTotal")) $("fdTotal").textContent = fmtEUR(f.total);
    if ($("fdYearProfit")) $("fdYearProfit").textContent = fmtEUR(f.yearProfit);
    if ($("fdAvgRate")) $("fdAvgRate").textContent = fmtPct(f.avgRate);

    const tbody = $("fdTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    for (const x of data.funds) {
      const annualRate = annualRateFromFunds(x.rate, x.freq);
      const yearProfit = safeNum(x.amount) * (annualRate / 100);
      const monthProfit = yearProfit / 12;
      const dayProfit = yearProfit / 365.25;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(x.platform)}</td>
        <td class="text-end">${fmtEUR(x.amount)}</td>
        <td class="text-end">${fmtPct(annualRate)}</td>
        <td class="text-end">${fmtEUR(yearProfit)}</td>
        <td class="text-end">${fmtEUR(monthProfit)}</td>
        <td class="text-end">${fmtEUR(dayProfit)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // Atualiza cabeçalho se ainda estiver “curto”
    const theadRow = $("fdTable")?.closest("table")?.querySelector("thead tr");
    if (theadRow && theadRow.children.length === 5) {
      theadRow.innerHTML = `
        <th>Plataforma</th>
        <th class="text-end">€ Valor</th>
        <th class="text-end">Taxa anual (%)</th>
        <th class="text-end">Juro/ano (€)</th>
        <th class="text-end">/mês</th>
        <th class="text-end">/dia</th>
        <th class="text-end">Ações</th>
      `;
    }

    tbody.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");
        const data2 = getData();
        if (act === "edit") {
          const row = data2.funds.find(r => r.id === id);
          if (!row) return;
          fdEditingId = id;
          if ($("fdPlatform")) $("fdPlatform").value = row.platform;
          if ($("fdAmount")) $("fdAmount").value = row.amount;
          if ($("fdRate")) $("fdRate").value = row.rate;
          if ($("fdFreq")) $("fdFreq").value = row.freq || "annual";
        }
        if (act === "del") {
          if (!confirmDanger("Apagar este fundo parado?")) return;
          data2.funds = data2.funds.filter(r => r.id !== id);
          setData(data2);
          renderFunds();
          renderPatrimonio();
        }
      });
    });
  }

  function wipeFundsAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODOS os fundos parados?")) return;
    const data = getData();
    data.funds = [];
    setData(data);
    renderFunds();
    renderPatrimonio();
    clearFundsForm();
  }

  // -----------------------
  // Session / Logout
  // -----------------------
  function renderSession() {
    const s = requireSession();
    if (!s) return;

    const badge = $("badgeMode");
    const email = $("sessionEmail");
    const when = $("sessionWhen");

    if (badge) badge.textContent = s.mode === "demo" ? "Modo: demo" : "Modo: local";
    if (email) email.textContent = s.email || "—";
    if (when) when.textContent = s.createdAt ? new Date(s.createdAt).toLocaleString("pt-PT") : "—";
  }

  function logout() {
    if (!confirmDanger("Sair da sessão?")) return;
    localStorage.removeItem(STORAGE.session);
    window.location.href = "./index.html";
  }

  // -----------------------
  // Render All
  // -----------------------
  function renderAll() {
    renderSession();
    renderStocks();
    renderDividends();
    renderCrypto();
    renderP2P();
    renderFunds();
    renderPatrimonio();
  }
// ✅ API global para outros módulos (ex: vendas.js) forçarem refresh imediato
window.RAS = window.RAS || {};
window.RAS.refresh = function () {
  renderAll();
  showSection(readHash());
};

  // -----------------------
  // Events
  // -----------------------
  function bindEvents() {
    window.addEventListener("hashchange", () => {
      const s = readHash();
      showSection(s);
    });

    document.querySelectorAll("#menuList a").forEach(a => {
      a.addEventListener("click", () => {
        const s = a.getAttribute("data-section");
        showSection(s);
      });
    });

    $("btnExportJson")?.addEventListener("click", exportJSON);
    $("btnImportJson")?.addEventListener("click", importJSON);
    $("btnLoadDemo")?.addEventListener("click", loadDemo);
    $("btnWipeAll")?.addEventListener("click", wipeAllData);
    $("btnLogout")?.addEventListener("click", logout);

    // Banco pessoal
    $("btnSaveBancoPessoal")?.addEventListener("click", saveBancoPessoal);

    // Stocks
    $("stAdd")?.addEventListener("click", () => upsertStock({
      ticker: $("stTicker")?.value,
      qty: $("stQty")?.value,
      avg: $("stAvg")?.value,
      cur: $("stCur")?.value
    }));
    $("stCancelEdit")?.addEventListener("click", clearStockForm);
    $("btnStocksWipe")?.addEventListener("click", wipeStocksAll);

    // Dividends
    $("dvTicker")?.addEventListener("change", updateDividendQtyAuto);
    $("dvAdd")?.addEventListener("click", () => upsertDividend({
      ticker: $("dvTicker")?.value,
      yearPerShare: $("dvYearPerShare")?.value,
      payN: $("dvPay")?.value
    }));
    $("dvCancelEdit")?.addEventListener("click", clearDividendForm);
    $("btnDivWipe")?.addEventListener("click", wipeDividendsAll);

    // Crypto
    $("crAdd")?.addEventListener("click", () => upsertCrypto({
      coin: $("crCoin")?.value,
      invest: $("crInvest")?.value,
      qty: $("crQty")?.value,
      price: $("crPrice")?.value
    }));
    $("crCancelEdit")?.addEventListener("click", clearCryptoForm);
    $("btnCryptoWipe")?.addEventListener("click", wipeCryptoAll);

    // P2P
    $("p2Add")?.addEventListener("click", () => upsertP2P({
      platform: $("p2Platform")?.value,
      project: $("p2Project")?.value,
      amount: $("p2Amount")?.value,
      rate: $("p2Rate")?.value,
      years: $("p2Years")?.value,
      start: $("p2Start")?.value,
      end: $("p2End")?.value
    }));
    $("p2CancelEdit")?.addEventListener("click", clearP2PForm);
    $("btnP2PWipe")?.addEventListener("click", wipeP2PAll);

    // Funds
    $("fdAdd")?.addEventListener("click", () => upsertFund({
      platform: $("fdPlatform")?.value,
      amount: $("fdAmount")?.value,
      rate: $("fdRate")?.value,
      freq: $("fdFreq")?.value
    }));
    $("fdCancelEdit")?.addEventListener("click", clearFundsForm);
    $("btnFundsWipe")?.addEventListener("click", wipeFundsAll);
  }

  // -----------------------
  // Utilities
  // -----------------------
  function cryptoRandomId() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
// =======================
// Reconciliar (Modo Auditoria)
// =======================
let recState = { open: false, kind: null, id: null };

function ensureReconcileBox(sectionId, boxId, title) {
  const sec = document.getElementById(sectionId);
  if (!sec) return null;

  // tenta colocar dentro do primeiro .card-body, senão no topo da secção
  const host = sec.querySelector(".card-body") || sec;

  let box = document.getElementById(boxId);
  if (!box) {
    box = document.createElement("div");
    box.id = boxId;
    box.className = "mb-3 border rounded p-3 bg-white";
    box.style.display = "none";
    box.innerHTML = `
      <div class="d-flex justify-content-between align-items-center">
        <div class="fw-semibold">${title}</div>
        <button type="button" class="btn btn-sm btn-outline-secondary" data-rec-act="close">Fechar</button>
      </div>
      <div class="small text-secondary mt-1" id="${boxId}-hint">—</div>
      <div class="row g-2 mt-2" id="${boxId}-fields"></div>
      <div class="d-flex gap-2 mt-3">
        <button type="button" class="btn btn-sm btn-primary" data-rec-act="apply">Aplicar</button>
        <button type="button" class="btn btn-sm btn-outline-danger" data-rec-act="reset0">Zerar Qty</button>
      </div>
      <div class="small text-secondary mt-2">
        Nota: isto só ajusta o teu portefólio local (modo auditoria). Não mexe na corretora.
      </div>
    `;

    host.prepend(box);

    // eventos do próprio box
    box.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-rec-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-rec-act");
      if (act === "close") closeReconcile();
      if (act === "apply") applyReconcile();
      if (act === "reset0") resetReconcileQty();
    });
  }

  return box;
}

function openReconcile(kind, id) {
  recState = { open: true, kind, id };

  if (kind === "stocks") {
    const box = ensureReconcileBox("sec-acoes", "reconcileStocksBox", "Reconciliar (Ações)");
    if (!box) return;

    const data = getData();
    const row = data.stocks.find(x => x.id === id);
    if (!row) return;

    document.getElementById("reconcileStocksBox-hint").textContent =
      `Ticker: ${row.ticker} (atual: qty=${row.qty}, avg=${row.avg}, cur=${row.cur})`;

    document.getElementById("reconcileStocksBox-fields").innerHTML = `
      <div class="col-12 col-md-4">
        <label class="form-label small">Qty</label>
        <input type="number" step="1" min="0" id="rec_qty" class="form-control" value="${safeNum(row.qty)}">
      </div>
      <div class="col-12 col-md-4">
        <label class="form-label small">Preço médio (avg)</label>
        <input type="number" step="0.000001" min="0" id="rec_avg" class="form-control" value="${safeNum(row.avg)}">
      </div>
      <div class="col-12 col-md-4">
        <label class="form-label small">Preço atual (cur)</label>
        <input type="number" step="0.000001" min="0" id="rec_cur" class="form-control" value="${safeNum(row.cur)}">
      </div>
    `;

    box.style.display = "";
    return;
  }

  if (kind === "crypto") {
    const box = ensureReconcileBox("sec-cripto", "reconcileCryptoBox", "Reconciliar (Cripto)");
    if (!box) return;

    const data = getData();
    const row = data.crypto.find(x => x.id === id);
    if (!row) return;

    document.getElementById("reconcileCryptoBox-hint").textContent =
      `Moeda: ${row.coin} (atual: invest=${row.invest}, qty=${row.qty}, price=${row.price})`;

    document.getElementById("reconcileCryptoBox-fields").innerHTML = `
      <div class="col-12 col-md-4">
        <label class="form-label small">€ Investido</label>
        <input type="number" step="0.01" min="0" id="rec_invest" class="form-control" value="${safeNum(row.invest)}">
      </div>
      <div class="col-12 col-md-4">
        <label class="form-label small">Qty</label>
        <input type="number" step="0.00000001" min="0" id="rec_qty" class="form-control" value="${safeNum(row.qty)}">
      </div>
      <div class="col-12 col-md-4">
        <label class="form-label small">Preço atual</label>
        <input type="number" step="0.00000001" min="0" id="rec_price" class="form-control" value="${safeNum(row.price)}">
      </div>
    `;

    box.style.display = "";
    return;
  }
}

function closeReconcile() {
  recState = { open: false, kind: null, id: null };
  const a = document.getElementById("reconcileStocksBox");
  const c = document.getElementById("reconcileCryptoBox");
  if (a) a.style.display = "none";
  if (c) c.style.display = "none";
}

function resetReconcileQty() {
  const qtyEl = document.getElementById("rec_qty");
  if (qtyEl) qtyEl.value = "0";
}

function applyReconcile() {
  if (!recState.open || !recState.kind || !recState.id) return;

  const data = getData();

  if (recState.kind === "stocks") {
    const idx = data.stocks.findIndex(x => x.id === recState.id);
    if (idx === -1) return;

    const qty = safeNum(document.getElementById("rec_qty")?.value);
    const avg = safeNum(document.getElementById("rec_avg")?.value);
    const cur = safeNum(document.getElementById("rec_cur")?.value);

    // regras mínimas
    if (qty < 0) return alert("Qty inválida.");
    if (qty > 0 && (avg <= 0 || cur <= 0)) return alert("Avg/Cur têm de ser > 0 quando qty > 0.");

    data.stocks[idx].qty = qty;
    if (qty === 0) {
      // opcional: manter avg/cur como estão
    } else {
      data.stocks[idx].avg = avg;
      data.stocks[idx].cur = cur;
    }

    setData(data);
    renderStocks();
    renderDividends();
    renderPatrimonio();
    closeReconcile();
    return;
  }

  if (recState.kind === "crypto") {
    const idx = data.crypto.findIndex(x => x.id === recState.id);
    if (idx === -1) return;

    const invest = safeNum(document.getElementById("rec_invest")?.value);
    const qty = safeNum(document.getElementById("rec_qty")?.value);
    const price = safeNum(document.getElementById("rec_price")?.value);

    if (invest < 0) return alert("Invest inválido.");
    if (qty < 0) return alert("Qty inválida.");
    if (qty > 0 && price <= 0) return alert("Preço tem de ser > 0 quando qty > 0.");

    data.crypto[idx].invest = invest;
    data.crypto[idx].qty = qty;
    if (qty === 0) {
      // opcional: manter price
    } else {
      data.crypto[idx].price = price;
    }

    setData(data);
    renderCrypto();
    renderPatrimonio();
    closeReconcile();
    return;
  }
}

  // -----------------------
  // Init
  // -----------------------
  function init() {
    const s = requireSession();
    if (!s) retuACrn;

    if (!localStorage.getItem(STORAGE.data)) {
      setData(structuredClone(DEFAULT_DATA));
    }

    bindEvents();
    // 🔄 quando outro módulo (ex: vendas.js) alterar dados, re-render imediato
window.addEventListener("ras:data-updated", () => {
  renderAll();
  // mantém a secção atual (para não saltar)
  showSection(readHash());
});

    renderAll();

    const section = readHash();
    showSection(section);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
