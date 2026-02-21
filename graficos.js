// graficos.js — Gráficos (V4) com Setores + Ledger (investimento novo)
(function () {
  const PORT_KEY = "ras_data_v1";
  const HIST_KEY = "ras_history_v1";
  const SALES_KEY = "ras_vendas_v1";
  const LEDGER_KEY = "ras_ledger_v1";

  const $ = (id) => document.getElementById(id);
  const sec = $("sec-graficos");
  if (!sec) return;

  // -----------------------
  // Helpers
  // -----------------------
  function num(v) {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }
  function euro(n) {
    return num(n).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }
  function safeJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function monthsBackList(nMonths) {
    const months = [];
    const now = new Date();
    for (let i = (nMonths - 1); i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push(ym);
    }
    return months;
  }
  function yearsBackList(nYears) {
    const years = [];
    const now = new Date();
    const y = now.getFullYear();
    for (let i = (nYears - 1); i >= 0; i--) years.push(String(y - i));
    return years;
  }

  function getPortfolio() {
    const d = safeJSON(PORT_KEY, null);
    return d && typeof d === "object"
      ? d
      : { patrimonio: { bancoPessoal: 0 }, stocks: [], dividends: [], crypto: [], p2p: [], funds: [] };
  }

  function getSales() {
    const s = safeJSON(SALES_KEY, { list: [] });
    return s && typeof s === "object" ? s : { list: [] };
  }

  function getLedger() {
    const arr = safeJSON(LEDGER_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function getHistoryRows() {
    const h = safeJSON(HIST_KEY, null);
    if (!h || typeof h !== "object") return [];

    // teu histórico é months: { "YYYY-MM": { snapshot... } }
    if (h.months && typeof h.months === "object") {
      const keys = Object.keys(h.months)
        .filter(k => /^\d{4}-\d{2}$/.test(k))
        .sort((a, b) => a.localeCompare(b));

      return keys.map(k => {
        const snap = h.months[k]?.snapshot;
        const total = snap?.totals?.patrimonioTotal ?? 0;
        return { month: k, patrimonioTotal: num(total) };
      });
    }

    // fallback para outros formatos
    const candidates = [h.rows, h.list, h.items, h.snapshots, h.data, h.history];
    const arr = candidates.find(Array.isArray);
    if (!Array.isArray(arr)) return [];

    return arr
      .map((r) => ({
        month: String(r.month || r.key || r.ym || r.date?.slice?.(0, 7) || r.when?.slice?.(0, 7) || ""),
        patrimonioTotal: num(r.patrimonioTotal ?? r.total ?? r.totalPatrimonio ?? r.patrimonio ?? 0),
      }))
      .filter((x) => x.month && x.month.length === 7)
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  function calcCurrent(port) {
    const banco = num(port?.patrimonio?.bancoPessoal);

    const stocks = (port.stocks || []).map((s) => {
      const ticker = String(s.ticker || "").toUpperCase().trim();
      const qty = num(s.qty);
      const cur = num(s.cur);
      const avg = num(s.avg);
      const sector = String(s.sector || "").trim() || "Sem setor";
      return {
        ticker, qty, cur, avg, sector,
        currentValue: qty * cur,
        investedValue: qty * avg
      };
    });

    const crypto = (port.crypto || []).map((c) => {
      const coin = String(c.coin || "").toUpperCase().trim();
      const qty = num(c.qty);
      const price = num(c.price);
      const invest = num(c.invest);
      return { coin, qty, price, invest, currentValue: qty * price };
    });

    // P2P no teu app.js é juros simples e final = calcP2PRow, mas aqui basta estimar:
    // final ≈ amount + amount*(rate/100)*years (se years vazio, assume 1)
    const p2p = (port.p2p || []).map((p) => {
      const amount = num(p.amount);
      const rate = num(p.rate) / 100;
      let years = num(p.years);
      if (!years && p.start && p.end) {
        const ms = new Date(p.end).getTime() - new Date(p.start).getTime();
        years = ms > 0 ? ms / (365.25 * 24 * 3600 * 1000) : 0;
      }
      years = years > 0 ? years : 1;
      const final = amount + (amount * rate * years);
      return { amount, final };
    });

    const funds = (port.funds || []).map((f) => {
      const amount = num(f.amount);
      const rate = num(f.rate) / 100;
      const freq = String(f.freq || "annual");
      const annualRate = freq === "monthly" ? (Math.pow(1 + rate, 12) - 1) : rate;
      const annualIncome = amount * annualRate;
      const monthlyIncome = annualIncome / 12;
      return { platform: String(f.platform || "—"), amount, annualIncome, monthlyIncome };
    });

    const stocksCurrent = stocks.reduce((a, x) => a + x.currentValue, 0);
    const cryptoCurrent = crypto.reduce((a, x) => a + x.currentValue, 0);
    const p2pInvest = p2p.reduce((a, x) => a + x.amount, 0);
    const p2pFinal = p2p.reduce((a, x) => a + x.final, 0);
    const fundsTotal = funds.reduce((a, x) => a + x.amount, 0);

    const ativosAtuais = stocksCurrent + cryptoCurrent + p2pFinal;
    const patrimonioTotal = ativosAtuais + fundsTotal + banco;

    return {
      banco,
      stocks,
      crypto,
      p2pInvest,
      p2pFinal,
      funds,
      fundsTotal,
      stocksCurrent,
      cryptoCurrent,
      patrimonioTotal
    };
  }

  function calcSalesByMonth(salesList) {
    const map = new Map();
    for (const row of (salesList || [])) {
      const ym = String(row.date || "").slice(0, 7);
      if (ym.length !== 7) continue;

      const qty = num(row.qty);
      const avgBuy = num(row.avgBuy);
      const sellPrice = num(row.sellPrice);
      const fees = num(row.fees);

      const invested = qty * avgBuy + fees;
      const received = qty * sellPrice;
      const profit = received - invested;

      map.set(ym, (map.get(ym) || 0) + profit);
    }
    return map;
  }

  function calcLedgerByMonth(ledger) {
    const map = new Map();
    for (const x of (ledger || [])) {
      const ym = String(x.date || "").slice(0, 7);
      if (ym.length !== 7) continue;
      const sign = x.type === "out" ? -1 : 1;
      map.set(ym, (map.get(ym) || 0) + sign * num(x.amount));
    }
    return map;
  }

  function calcLedgerByYear(ledger) {
    const map = new Map();
    for (const x of (ledger || [])) {
      const yy = String(x.date || "").slice(0, 4);
      if (yy.length !== 4) continue;
      const sign = x.type === "out" ? -1 : 1;
      map.set(yy, (map.get(yy) || 0) + sign * num(x.amount));
    }
    return map;
  }

  function groupSum(items, keyFn, valueFn) {
    const map = new Map();
    for (const it of items) {
      const k = keyFn(it);
      const v = valueFn(it);
      map.set(k, (map.get(k) || 0) + v);
    }
    return map;
  }

  function topNWithOthersFromMap(map, n, othersLabel) {
    const arr = Array.from(map.entries()).map(([k, v]) => ({ k, v: num(v) }));
    arr.sort((a, b) => b.v - a.v);
    const top = arr.slice(0, n);
    const rest = arr.slice(n);
    const restSum = rest.reduce((a, x) => a + x.v, 0);
    const labels = top.map(x => x.k);
    const values = top.map(x => x.v);
    if (restSum > 0) {
      labels.push(othersLabel);
      values.push(restSum);
    }
    return { labels, values };
  }

  // -----------------------
  // UI
  // -----------------------
  function ensureUI() {
    if ($("gxWrap")) return;

    sec.innerHTML = `
      <div id="gxWrap" class="card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
            <div>
              <h5 class="mb-0">Gráficos</h5>
              <div class="text-secondary small">Setores + alocação + vendas + investimento novo</div>
            </div>

            <div class="d-flex gap-2 align-items-center flex-wrap">
              <label class="text-secondary small mb-0" for="gxRange">Período</label>
              <select id="gxRange" class="form-select form-select-sm" style="width:160px">
                <option value="6">Últimos 6 meses</option>
                <option value="12">Últimos 12 meses</option>
                <option value="24" selected>Últimos 24 meses</option>
                <option value="60">Últimos 60 meses</option>
              </select>
              <span class="text-secondary small" id="gxHint"></span>
            </div>
          </div>

          <div id="gxErr" class="alert alert-warning mt-3 d-none"></div>

          <hr class="my-3"/>

          <div class="row g-3">
            <div class="col-12 col-xl-7">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Património total (Histórico)</div>
                <div style="height:300px; margin-top:10px;">
                  <canvas id="gxChartTotal"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12 col-xl-5">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Alocação total</div>
                <div class="text-secondary small">Ações/Cripto/P2P/Fundos/Banco</div>
                <div style="height:300px; margin-top:10px;">
                  <canvas id="gxChartAllocTotal"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Ações — Top tickers (valor atual)</div>
                <div style="height:280px; margin-top:10px;">
                  <canvas id="gxChartStocks"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Cripto — % por moeda</div>
                <div style="height:280px; margin-top:10px;">
                  <canvas id="gxChartCrypto"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Ações — Setores (valor atual)</div>
                <div class="text-secondary small">Usa o campo “Setor” em Ações.</div>
                <div style="height:280px; margin-top:10px;">
                  <canvas id="gxChartSectors"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Investimento novo (net flow) — por mês</div>
                <div class="text-secondary small">Entradas − Saídas (Movimentos)</div>
                <div style="height:280px; margin-top:10px;">
                  <canvas id="gxChartFlowMonth"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Investimento novo (net flow) — por ano</div>
                <div style="height:260px; margin-top:10px;">
                  <canvas id="gxChartFlowYear"></canvas>
                </div>
              </div>
            </div>

            <div class="col-12">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Lucro realizado por mês (Vendas)</div>
                <div style="height:260px; margin-top:10px;">
                  <canvas id="gxChartSales"></canvas>
                </div>
              </div>
            </div>
          </div>

          <div class="small text-secondary mt-3">
            Dica: se “Setores” estiver vazio, vai a Ações e preenche o campo Setor em cada ticker.
          </div>
        </div>
      </div>
    `;
  }

  function setErr(msg) {
    const box = $("gxErr");
    if (!box) return;
    box.classList.remove("d-none");
    box.textContent = msg;
  }
  function clearErr() {
    const box = $("gxErr");
    if (!box) return;
    box.classList.add("d-none");
    box.textContent = "";
  }

  // -----------------------
  // Charts
  // -----------------------
  let charts = [];
  function destroyCharts() {
    for (const c of charts) {
      try { c.destroy(); } catch {}
    }
    charts = [];
  }

  function getRangeMonths() {
    const sel = $("gxRange");
    const v = sel ? Number(sel.value) : 24;
    return Number.isFinite(v) ? v : 24;
  }

  function isGraphsActive() {
    const hash = (location.hash || "").replace("#", "");
    return hash === "graficos";
  }

  function wireUI() {
    const sel = $("gxRange");
    if (sel && !sel.__wired) {
      sel.__wired = true;
      sel.addEventListener("change", () => renderCharts());
    }
  }

  function renderCharts() {
    if (!isGraphsActive()) return;

    ensureUI();
    wireUI();
    clearErr();

    if (typeof window.Chart === "undefined") {
      setErr("Chart.js não carregou. Verifica o CDN / ligação à internet.");
      return;
    }

    try {
      const rangeN = getRangeMonths();

      const port = getPortfolio();
      const sales = getSales();
      const histAll = getHistoryRows();
      const ledger = getLedger();
      const cur = calcCurrent(port);

      const hint = $("gxHint");
      if (hint) {
        hint.textContent = `Património atual: ${euro(cur.patrimonioTotal)}`;
      }

      destroyCharts();

      // 1) Histórico património
      const hist = histAll.slice(Math.max(0, histAll.length - rangeN));
      const ctxTotal = $("gxChartTotal")?.getContext("2d");
      if (ctxTotal) {
        charts.push(new Chart(ctxTotal, {
          type: "line",
          data: {
            labels: hist.map(x => x.month),
            datasets: [{ label: "Património total", data: hist.map(x => x.patrimonioTotal), tension: 0.25 }]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

      // 2) Alocação total
      const ctxAlloc = $("gxChartAllocTotal")?.getContext("2d");
      if (ctxAlloc) {
        const labels = ["Ações", "Cripto", "P2P", "Fundos", "Banco"];
        const data = [cur.stocksCurrent, cur.cryptoCurrent, cur.p2pFinal, cur.fundsTotal, cur.banco];
        charts.push(new Chart(ctxAlloc, {
          type: "doughnut",
          data: { labels, datasets: [{ label: "Alocação total", data }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
        }));
      }

      // 3) Ações por ticker (Top 12 + Outros)
      const ctxStocks = $("gxChartStocks")?.getContext("2d");
      if (ctxStocks) {
        const map = groupSum(cur.stocks.filter(s => s.ticker), (s) => s.ticker, (s) => s.currentValue);
        const packed = topNWithOthersFromMap(map, 12, "OUTROS");
        charts.push(new Chart(ctxStocks, {
          type: "bar",
          data: { labels: packed.labels, datasets: [{ label: "Valor atual (€)", data: packed.values }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

      // 4) Cripto por moeda (doughnut)
      const ctxCrypto = $("gxChartCrypto")?.getContext("2d");
      if (ctxCrypto) {
        const rows = cur.crypto.filter(x => x.coin && x.currentValue > 0);
        charts.push(new Chart(ctxCrypto, {
          type: "doughnut",
          data: { labels: rows.map(x => x.coin), datasets: [{ label: "Cripto (€)", data: rows.map(x => x.currentValue) }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
        }));
      }

      // 5) Setores (doughnut)
      const ctxSectors = $("gxChartSectors")?.getContext("2d");
      if (ctxSectors) {
        const sectorMap = groupSum(
          cur.stocks.filter(s => s.currentValue > 0),
          (s) => s.sector || "Sem setor",
          (s) => s.currentValue
        );

        const packed = topNWithOthersFromMap(sectorMap, 10, "OUTROS");
        charts.push(new Chart(ctxSectors, {
          type: "doughnut",
          data: { labels: packed.labels, datasets: [{ label: "Setores (€)", data: packed.values }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
        }));
      }

      // 6) Net flow por mês (ledger)
      const ctxFlowM = $("gxChartFlowMonth")?.getContext("2d");
      if (ctxFlowM) {
        const mapM = calcLedgerByMonth(ledger);
        const months = monthsBackList(rangeN);
        const series = months.map(m => num(mapM.get(m) || 0));

        charts.push(new Chart(ctxFlowM, {
          type: "bar",
          data: { labels: months, datasets: [{ label: "Net flow (mês)", data: series }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

      // 7) Net flow por ano (ledger)
      const ctxFlowY = $("gxChartFlowYear")?.getContext("2d");
      if (ctxFlowY) {
        const mapY = calcLedgerByYear(ledger);
        const years = yearsBackList(6);
        const series = years.map(y => num(mapY.get(y) || 0));

        charts.push(new Chart(ctxFlowY, {
          type: "bar",
          data: { labels: years, datasets: [{ label: "Net flow (ano)", data: series }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

      // 8) Vendas: lucro por mês
      const ctxSales = $("gxChartSales")?.getContext("2d");
      if (ctxSales) {
        const profitByMonth = calcSalesByMonth((sales && sales.list) ? sales.list : []);
        const months = monthsBackList(rangeN);
        const series = months.map(m => num(profitByMonth.get(m) || 0));

        charts.push(new Chart(ctxSales, {
          type: "bar",
          data: { labels: months, datasets: [{ label: "Lucro realizado (mês)", data: series }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

    } catch (e) {
      console.error("[graficos.js] renderCharts falhou:", e);
      setErr("Erro ao desenhar gráficos. Abre o Console (F12) para ver o detalhe.");
    }
  }

  // -----------------------
  // Fix: menu usa replaceState (sem hashchange)
  // -----------------------
  function bindMenuHooks() {
    const menu = document.getElementById("menuList");
    if (menu && !menu.__gx_wired) {
      menu.__gx_wired = true;
      menu.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-section]");
        if (!a) return;
        const s = a.getAttribute("data-section");
        if (s === "graficos") setTimeout(() => renderCharts(), 0);
      });
    }
    window.addEventListener("popstate", () => setTimeout(() => renderCharts(), 0));
  }

  window.addEventListener("ras:data-updated", () => renderCharts());
  window.addEventListener("hashchange", () => renderCharts());
  document.addEventListener("DOMContentLoaded", () => {
    bindMenuHooks();
    renderCharts(); // se abrir diretamente em #graficos
  });
})();