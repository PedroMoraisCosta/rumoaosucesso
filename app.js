/* app.js — Dashboard V1 (localStorage) */
(function () {
  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    session: "ras_session_v1",
    data: "ras_data_v1"
  };

  const DEFAULT_DATA = {
    meta: { lastUpdated: null },
    patrimonio: { bancoCodeconnect: 0 },
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
    patrimonio: { title: "Património Líquido", el: "sec-patrimonio" },
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
    $("pageTitle").textContent = SECTION_MAP[key].title;
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
    a.download = `rumo-ao-sucesso-backup-${new Date().toISOString().slice(0,10)}.json`;
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

  // P2P agora = JUROS SIMPLES
  function calcP2PRow(row) {
    const invested = safeNum(row.amount);
    const rate = safeNum(row.rate);

    let years = yearsFromDates(row.start, row.end);
    if (years == null) years = safeNum(row.years);
    if (!Number.isFinite(years) || years <= 0) years = 1;

    const profit = invested * (rate / 100) * years;     // simples
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

    // total anual estimado (simples): soma de invested * rate
    const profitPerYear = data.p2p.reduce((a, x) => a + calcP2PRow(x).profitPerYear, 0);

    return { invested, finals, profit, avgPct, profitPerYear };
  }

  // Fundos Parados = COMPOSTOS (mensal/anual)
  function annualRateFromFunds(rate, freq) {
    const r = safeNum(rate) / 100;
    if (freq === "monthly") {
      // taxa mensal -> taxa anual efetiva composta
      return (Math.pow(1 + r, 12) - 1) * 100;
    }
    // anual já é anual
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
  // Patrimonio Liquido (automatic + total juros)
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

    const banco = safeNum(data.patrimonio?.bancoCodeconnect);
    const patrimonioTotal = ativosAtuais + fd.total + banco;

    // ✅ total anual de “juros/ganhos recorrentes” (dividendos + p2p + fundos)
    const totalRecorrenteAno = dv.year + p2.profitPerYear + fd.yearProfit;
    const totalRecorrenteMes = totalRecorrenteAno / 12;
    const totalRecorrenteDia = totalRecorrenteAno / 365.25;

    // Caixa principal (já existia)
    $("plTotalInvestido").textContent = fmtEUR(totalInvestidoAtivos);
    $("plAtivosAtuais").textContent = fmtEUR(ativosAtuais);
    $("plLucroTotal").textContent = fmtEUR(lucroTotal);
    $("plPctLucro").textContent = fmtPct(pctLucro);
    $("plPatrimonioTotal").textContent = fmtEUR(patrimonioTotal);
    $("inpBancoCodeconnect").value = String(banco || 0);

    // Inject de 1 bloco extra “Juros/Dividendos anuais” (sem mexer no HTML)
    // Se já existe, só atualiza.
    const host = $("sec-patrimonio").querySelector(".card-body");
    let box = $("plJurosBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "plJurosBox";
      box.className = "mt-3 border rounded p-3 bg-white";
      box.innerHTML = `
        <div class="d-flex justify-content-between align-items-center">
          <div class="fw-semibold">Total de juros + dividendos (estimativa)</div>
          <div class="small text-secondary">Dividendos + P2P + Fundos Parados</div>
        </div>
        <div class="row g-3 mt-1">
          <div class="col-12 col-md-4">
            <div class="text-secondary small">Ano</div>
            <div class="fs-4 fw-bold" id="plRecAno">0,00 €</div>
          </div>
          <div class="col-12 col-md-4">
            <div class="text-secondary small">Mês</div>
            <div class="fs-4 fw-bold" id="plRecMes">0,00 €</div>
          </div>
          <div class="col-12 col-md-4">
            <div class="text-secondary small">Dia</div>
            <div class="fs-4 fw-bold" id="plRecDia">0,00 €</div>
          </div>
        </div>

        <hr class="my-3"/>

        <div class="row g-3">
          <div class="col-12 col-md-4">
            <div class="text-secondary small">Dividendos (ano)</div>
            <div class="fw-bold" id="plDvAno">0,00 €</div>
            <div class="small text-secondary">mês: <span id="plDvMes">0,00 €</span> | dia: <span id="plDvDia">0,00 €</span></div>
          </div>
          <div class="col-12 col-md-4">
            <div class="text-secondary small">P2P (juros/ano)</div>
            <div class="fw-bold" id="plP2Ano">0,00 €</div>
            <div class="small text-secondary">mês: <span id="plP2Mes">0,00 €</span> | dia: <span id="plP2Dia">0,00 €</span></div>
          </div>
          <div class="col-12 col-md-4">
            <div class="text-secondary small">Fundos (juros/ano)</div>
            <div class="fw-bold" id="plFdAno">0,00 €</div>
            <div class="small text-secondary">mês: <span id="plFdMes">0,00 €</span> | dia: <span id="plFdDia">0,00 €</span></div>
          </div>
        </div>

        <div class="small text-secondary mt-2">
          Nota: isto é uma estimativa anual (run-rate). Não é “realizado” automaticamente sem datas/movimentos.
        </div>
      `;
      host.appendChild(box);
    }

    $("plRecAno").textContent = fmtEUR(totalRecorrenteAno);
    $("plRecMes").textContent = fmtEUR(totalRecorrenteMes);
    $("plRecDia").textContent = fmtEUR(totalRecorrenteDia);

    $("plDvAno").textContent = fmtEUR(dv.year);
    $("plDvMes").textContent = fmtEUR(dv.month);
    $("plDvDia").textContent = fmtEUR(dv.day);

    $("plP2Ano").textContent = fmtEUR(p2.profitPerYear);
    $("plP2Mes").textContent = fmtEUR(p2.profitPerYear / 12);
    $("plP2Dia").textContent = fmtEUR(p2.profitPerYear / 365.25);

    $("plFdAno").textContent = fmtEUR(fd.yearProfit);
    $("plFdMes").textContent = fmtEUR(fd.monthProfit);
    $("plFdDia").textContent = fmtEUR(fd.dayProfit);
  }

  function saveBanco() {
    const data = getData();
    data.patrimonio = data.patrimonio || {};
    data.patrimonio.bancoCodeconnect = safeNum($("inpBancoCodeconnect").value);
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
    $("stTicker").value = "";
    $("stQty").value = "";
    $("stAvg").value = "";
    $("stCur").value = "";
    stEditingId = null;
  }

  function renderStocks() {
    const data = getData();
    const st = calcStocks(data);

    $("stTotalInvest").textContent = fmtEUR(st.invested);
    $("stTotalCurrent").textContent = fmtEUR(st.current);
    $("stTotalProfit").textContent = fmtEUR(st.profit);
    $("stTotalPct").textContent = fmtPct(st.pct);

    const tbody = $("stTable");
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
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}">Apagar</button>
        </td>
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
          if (!row) return;
          stEditingId = id;
          $("stTicker").value = row.ticker;
          $("stQty").value = row.qty;
          $("stAvg").value = row.avg;
          $("stCur").value = row.cur;
        }
        if (act === "del") {
          if (!confirmDanger("Apagar esta ação?")) return;
          const data2 = getData();
          const removedTicker = (data2.stocks.find(r=>r.id===id)?.ticker) || null;
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
    const ticker = $("dvTicker").value;
    const stRow = data.stocks.find(s => s.ticker === ticker);
    $("dvQtyAuto").value = stRow ? String(stRow.qty) : "0";
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
    if (![1,2,4,12].includes(payN)) return alert("Pagamentos inválidos.");

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
    $("dvYearPerShare").value = "";
    $("dvPay").value = "12";
    dvEditingId = null;
    updateDividendQtyAuto();
  }

  function renderDividends() {
    const data = getData();
    fillDividendTickerSelect();

    const tbody = $("dvTable");
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
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${d.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${d.id}">Apagar</button>
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
          $("dvTicker").value = row.ticker;
          updateDividendQtyAuto();
          $("dvYearPerShare").value = row.yearPerShare;
          $("dvPay").value = String(row.payN);
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
    $("crCoin").value = "";
    $("crInvest").value = "";
    $("crQty").value = "";
    $("crPrice").value = "";
    crEditingId = null;
  }

  function renderCrypto() {
    const data = getData();
    const c = calcCrypto(data);

    $("crTotalInvest").textContent = fmtEUR(c.invested);
    $("crTotalCurrent").textContent = fmtEUR(c.current);
    $("crTotalProfit").textContent = fmtEUR(c.profit);
    $("crTotalPct").textContent = fmtPct(c.pct);

    const tbody = $("crTable");
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
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}">Apagar</button>
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
          const row = data2.crypto.find(r => r.id === id);
          if (!row) return;
          crEditingId = id;
          $("crCoin").value = row.coin;
          $("crInvest").value = row.invest;
          $("crQty").value = row.qty;
          $("crPrice").value = row.price;
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
    $("p2Platform").value = "";
    $("p2Project").value = "";
    $("p2Amount").value = "";
    $("p2Rate").value = "";
    $("p2Years").value = "";
    $("p2Start").value = "";
    $("p2End").value = "";
    p2EditingId = null;
  }

  function renderP2P() {
    const data = getData();
    const p = calcP2P(data);

    $("p2Invest").textContent = fmtEUR(p.invested);
    $("p2Final").textContent = fmtEUR(p.finals);
    $("p2Profit").textContent = fmtEUR(p.profit);
    $("p2AvgPct").textContent = fmtPct(p.avgPct);

    const tbody = $("p2Table");
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
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}">Apagar</button>
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
          $("p2Platform").value = row.platform;
          $("p2Project").value = row.project;
          $("p2Amount").value = row.amount;
          $("p2Rate").value = row.rate;
          $("p2Years").value = row.years;
          $("p2Start").value = row.start || "";
          $("p2End").value = row.end || "";
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
    $("fdPlatform").value = "";
    $("fdAmount").value = "";
    $("fdRate").value = "";
    $("fdFreq").value = "annual";
    fdEditingId = null;
  }

  function renderFunds() {
    const data = getData();
    const f = calcFunds(data);

    $("fdTotal").textContent = fmtEUR(f.total);
    $("fdYearProfit").textContent = fmtEUR(f.yearProfit);
    $("fdAvgRate").textContent = fmtPct(f.avgRate);

    const tbody = $("fdTable");
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
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}">Apagar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // ✅ Atualiza cabeçalho da tabela com mais 2 colunas (mês/dia) sem mexer no HTML
    // Se ainda não alterou, altera uma vez.
    const theadRow = $("fdTable").closest("table").querySelector("thead tr");
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
          $("fdPlatform").value = row.platform;
          $("fdAmount").value = row.amount;
          $("fdRate").value = row.rate;
          $("fdFreq").value = row.freq || "annual";
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

    $("badgeMode").textContent = s.mode === "demo" ? "Modo: demo" : "Modo: local";
    $("sessionEmail").textContent = s.email || "—";
    $("sessionWhen").textContent = s.createdAt ? new Date(s.createdAt).toLocaleString("pt-PT") : "—";
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

    $("btnExportJson").addEventListener("click", exportJSON);
    $("btnImportJson").addEventListener("click", importJSON);
    $("btnLoadDemo").addEventListener("click", loadDemo);
    $("btnWipeAll").addEventListener("click", wipeAllData);
    $("btnLogout").addEventListener("click", logout);

    $("btnSaveBanco").addEventListener("click", saveBanco);

    // Stocks
    $("stAdd").addEventListener("click", () => upsertStock({
      ticker: $("stTicker").value,
      qty: $("stQty").value,
      avg: $("stAvg").value,
      cur: $("stCur").value
    }));
    $("stCancelEdit").addEventListener("click", clearStockForm);
    $("btnStocksWipe").addEventListener("click", wipeStocksAll);

    // Dividends
    $("dvTicker").addEventListener("change", updateDividendQtyAuto);
    $("dvAdd").addEventListener("click", () => upsertDividend({
      ticker: $("dvTicker").value,
      yearPerShare: $("dvYearPerShare").value,
      payN: $("dvPay").value
    }));
    $("dvCancelEdit").addEventListener("click", clearDividendForm);
    $("btnDivWipe").addEventListener("click", wipeDividendsAll);

    // Crypto
    $("crAdd").addEventListener("click", () => upsertCrypto({
      coin: $("crCoin").value,
      invest: $("crInvest").value,
      qty: $("crQty").value,
      price: $("crPrice").value
    }));
    $("crCancelEdit").addEventListener("click", clearCryptoForm);
    $("btnCryptoWipe").addEventListener("click", wipeCryptoAll);

    // P2P
    $("p2Add").addEventListener("click", () => upsertP2P({
      platform: $("p2Platform").value,
      project: $("p2Project").value,
      amount: $("p2Amount").value,
      rate: $("p2Rate").value,
      years: $("p2Years").value,
      start: $("p2Start").value,
      end: $("p2End").value
    }));
    $("p2CancelEdit").addEventListener("click", clearP2PForm);
    $("btnP2PWipe").addEventListener("click", wipeP2PAll);

    // Funds
    $("fdAdd").addEventListener("click", () => upsertFund({
      platform: $("fdPlatform").value,
      amount: $("fdAmount").value,
      rate: $("fdRate").value,
      freq: $("fdFreq").value
    }));
    $("fdCancelEdit").addEventListener("click", clearFundsForm);
    $("btnFundsWipe").addEventListener("click", wipeFundsAll);
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

  // -----------------------
  // Init
  // -----------------------
  function init() {
    const s = requireSession();
    if (!s) return;

    if (!localStorage.getItem(STORAGE.data)) {
      setData(structuredClone(DEFAULT_DATA));
    }

    bindEvents();
    renderAll();

    const section = readHash();
    showSection(section);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
