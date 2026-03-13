// graficos.js — Gráficos (V4.2) com Setores + Alocação + Dividendos + Fundos + Ledger + Vendas
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

    // P2P: estimativa simples (igual à lógica do app.js)
    const p2p = (port.p2p || []).map((p) => {
      const amount = num(p.amount);
      const rate = num(p.rate) / 100;
      let years = num(p.years);
      if (!years && p.start && p.end) {
        const ms = new Date(p.end).getTime() - new Date(p.start).getTime();
        years = ms > 0 ? ms / (365.25 * 24 * 3600 * 1000) : 0;
      }
      years = years > 0 ? years : 1;
      const profitPerYear = amount * rate;
      const final = amount + (amount * rate * years);
      return { amount, final, profitPerYear };
    });

    // Fundos: converte taxa mensal -> anual efetiva
    const funds = (port.funds || []).map((f) => {
      const platform = String(f.platform || "—");
      const amount = num(f.amount);
      const r = num(f.rate) / 100;
      const freq = String(f.freq || "annual");
      const annualRate = freq === "monthly" ? (Math.pow(1 + r, 12) - 1) : r;
      const annualIncome = amount * annualRate;
      const monthlyIncome = annualIncome / 12;
      return { platform, amount, annualIncome, monthlyIncome };
    });

    const stocksCurrent = stocks.reduce((a, x) => a + x.currentValue, 0);
    const cryptoCurrent = crypto.reduce((a, x) => a + x.currentValue, 0);
    const p2pFinal = p2p.reduce((a, x) => a + x.final, 0);
    const fundsTotal = funds.reduce((a, x) => a + x.amount, 0);

    const ativosAtuais = stocksCurrent + cryptoCurrent + p2pFinal;
    const patrimonioTotal = ativosAtuais + fundsTotal + banco;

    return {
      banco,
      stocks,
      crypto,
      p2p,
      p2pFinal,
      funds,
      fundsTotal,
      stocksCurrent,
      cryptoCurrent,
      patrimonioTotal
    };
  }

  // Dividendos: cruza dividends[] com stocks[] para qty
  function calcDividends(port) {
    const stocks = Array.isArray(port?.stocks) ? port.stocks : [];
    const divs = Array.isArray(port?.dividends) ? port.dividends : [];

    const qtyByTicker = new Map();
    for (const s of stocks) {
      const t = String(s.ticker || "").toUpperCase().trim();
      if (!t) continue;
      qtyByTicker.set(t, num(s.qty));
    }

    const byTicker = new Map();
    for (const d of divs) {
      const t = String(d.ticker || "").toUpperCase().trim();
      if (!t) continue;
      const qty = num(qtyByTicker.get(t) || 0);
      const yearPerShare = num(d.yearPerShare);
      const year = qty * yearPerShare;
      byTicker.set(t, (byTicker.get(t) || 0) + year);
    }

    const totalYear = Array.from(byTicker.values()).reduce((a, v) => a + num(v), 0);
    const totalMonth = totalYear / 12;

    return { byTicker, totalYear, totalMonth };
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
              <div class="text-secondary small">Alocação + Top holdings + Setores + Rendimentos</div>
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
  <div class="bg-white border rounded p-3 gx-graph-card">
    <div class="gx-graph-head">
      <div class="fw-semibold">Top holdings — Ações (valor atual)</div>
      <button type="button" class="btn btn-outline-secondary btn-sm gx-head-btn" id="btnExpandStocksChart">
        Expandir
      </button>
    </div>
    <div class="gx-chart-scroll" style="margin-top:10px;">
      <div style="height:280px; min-width:900px;">
        <canvas id="gxChartStocks"></canvas>
      </div>
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
    <div class="fw-semibold">P2P — Investido vs Valor final</div>
    <div class="text-secondary small">Comparação por projeto</div>
    <div style="height:280px; margin-top:10px;">
      <canvas id="gxChartP2PProjects"></canvas>
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
  <div class="bg-white border rounded p-3 gx-graph-card">
    <div class="gx-graph-head gx-graph-head--stack">
      <div>
        <div class="fw-semibold">Dividendos — por empresa (€/ano)</div>
        <div class="text-secondary small" id="gxDivHint"></div>
      </div>
      <button type="button" class="btn btn-outline-secondary btn-sm gx-head-btn" id="btnExpandDividendsChart">
        Expandir
      </button>
    </div>
    <div class="gx-chart-scroll" style="margin-top:10px;">
      <div style="height:280px; min-width:900px;">
        <canvas id="gxChartDivTickers"></canvas>
      </div>
    </div>
  </div>
</div>


            <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Fundos parados — juros por plataforma (€/ano)</div>
                <div class="text-secondary small" id="gxFundsHint"></div>
                <div style="height:280px; margin-top:10px;">
                  <canvas id="gxChartFundsIncome"></canvas>
                </div>
              </div>
            </div>

                        <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Top ROI do portefólio</div>
                <div class="text-secondary small">Ações + Cripto ordenadas por ROI</div>

                <div class="table-responsive mt-3">
                  <table class="table table-sm align-middle mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Ativo</th>
                        <th>Tipo</th>
                        <th class="text-end">Investido</th>
                        <th class="text-end">Atual</th>
                        <th class="text-end">Lucro</th>
                        <th class="text-end">ROI %</th>
                      </tr>
                    </thead>
                    <tbody id="gxRoiTable"></tbody>
                  </table>
                </div>
              </div>
            </div>

                        <div class="col-12 col-xl-6">
              <div class="bg-white border rounded p-3">
                <div class="fw-semibold">Ranking plataformas P2P</div>
                <div class="text-secondary small">Agrupado por plataforma</div>

                <div class="table-responsive mt-3">
                  <table class="table table-sm align-middle mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Plataforma</th>
                        <th class="text-end">Investido</th>
                        <th class="text-end">Valor final</th>
                        <th class="text-end">Lucro</th>
                        <th class="text-end">ROI %</th>
                      </tr>
                    </thead>
                    <tbody id="gxP2PPlatformTable"></tbody>
                  </table>
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
    <div class="fw-semibold">Rendimento passivo por mês</div>
    <div class="text-secondary small">Dividendos + P2P + Fundos + Total</div>
    <div style="height:280px; margin-top:10px;">
      <canvas id="gxChartPassiveMonth"></canvas>
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
            <div class="col-12">
  <div class="bg-white border rounded p-3">
    <div class="fw-semibold">Progresso para independência financeira (FIRE)</div>
    <div class="text-secondary small">Progresso mensal em direção ao objetivo</div>
    <div style="height:280px; margin-top:10px;">
      <canvas id="gxChartFireProgress"></canvas>
    </div>
  </div>
</div>

<div class="col-12">
  <div class="bg-white border rounded p-3">
    <div class="fw-semibold">Rendimento passivo vs objetivo FIRE</div>
    <div class="text-secondary small">Comparação mensal</div>
    <div style="height:280px; margin-top:10px;">
      <canvas id="gxChartFireIncome"></canvas>
    </div>
  </div>
</div>

<div class="col-12">
  <div class="bg-white border rounded p-3">
    <div class="fw-semibold">FIRE Trajectory</div>
    <div class="text-secondary small">Histórico + projeção até atingir o objetivo</div>
    <div style="height:300px; margin-top:10px;">
      <canvas id="gxChartFireTrajectory"></canvas>
    </div>
  </div>
</div>
          </div>

                   <div class="small text-secondary mt-3">
            Dica: se “Setores” estiver vazio, vai a Ações e preenche o campo Setor em cada ticker.
          </div>
        </div>
      </div>

      <div class="modal fade" id="gxExpandModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header">
              <div>
                <h5 class="modal-title mb-0" id="gxExpandModalTitle">Gráfico expandido</h5>
                <div class="text-secondary small" id="gxExpandModalHint"></div>
              </div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>

            <div class="modal-body">
  <div class="gx-chart-scroll">
    <div style="height:360px; min-width:1000px;">
      <canvas id="gxExpandCanvas"></canvas>
    </div>
  </div>
</div>
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

  let expandedChart = null;

  function setChartMinWidth(canvasId, totalLabels) {
  const canvas = $(canvasId);
  if (!canvas) return;

  const baseWidth = 700;
  const widthPerLabel = 70;
  const finalWidth = Math.max(baseWidth, totalLabels * widthPerLabel);

  const wrap = canvas.parentElement;
  if (wrap) {
    wrap.style.minWidth = `${finalWidth}px`;
  }
}

function destroyExpandedChart() {
  if (expandedChart) {
    try { expandedChart.destroy(); } catch {}
    expandedChart = null;
  }
}

function buildExpandedData(type) {
  const port = getPortfolio();
  const cur = calcCurrent(port);
  const div = calcDividends(port);

  if (type === "stocks") {
    const map = groupSum(
      cur.stocks.filter(s => s.ticker),
      (s) => s.ticker,
      (s) => s.currentValue
    );

    const arr = Array.from(map.entries())
      .map(([label, value]) => ({ label, value: num(value) }))
      .sort((a, b) => b.value - a.value);

    return {
      title: "Top holdings — Ações (expandido)",
      hint: `${arr.length} posições`,
      labels: arr.map(x => x.label),
      values: arr.map(x => x.value),
      datasetLabel: "Valor atual (€)"
    };
  }

  if (type === "dividends") {
    const arr = Array.from(div.byTicker.entries())
      .map(([label, value]) => ({ label, value: num(value) }))
      .sort((a, b) => b.value - a.value);

    return {
      title: "Dividendos — por empresa (expandido)",
       hint: `${arr.length} empresas`,
      labels: arr.map(x => x.label),
      values: arr.map(x => x.value),
      datasetLabel: "Dividendos (€/ano)"
    };
  }

  return null;
}

function openExpandedChart(type) {
  const modalEl = $("gxExpandModal");
  const canvas = $("gxExpandCanvas");
  const titleEl = $("gxExpandModalTitle");
  const hintEl = $("gxExpandModalHint");

  if (!modalEl || !canvas || typeof bootstrap === "undefined") return;

  const data = buildExpandedData(type);
  if (!data) return;

   const totalValue = data.values.reduce((a, v) => a + num(v), 0);

  if (titleEl) titleEl.textContent = data.title;

  if (hintEl) {
    if (type === "dividends") {
      hintEl.textContent = `${data.hint} • ${euro(totalValue)}/ano`;
    } else {
      hintEl.textContent = `${data.hint} • ${euro(totalValue)}`;
    }
  }

    const innerWrap = canvas.parentElement;
  if (innerWrap) {
    const baseWidth = 1000;
    const widthPerLabel = 75;
    const finalWidth = Math.max(baseWidth, data.labels.length * widthPerLabel);
    innerWrap.style.minWidth = `${finalWidth}px`;
  }

  destroyExpandedChart();

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  expandedChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: data.labels,
      datasets: [{
        label: data.datasetLabel,
        data: data.values
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.dataset.label || "Valor";
              const value = num(context.parsed.y);
              return `${label}: ${euro(value)}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            autoSkip: false,
            maxRotation: 45,
            minRotation: 20
          }
        },
        y: {
          ticks: {
            callback: (v) => euro(v)
          }
        }
      }
    }
  });

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function buildPortfolioRoiRanking() {
  const port = getPortfolio();
  const cur = calcCurrent(port);

  const stockRows = cur.stocks
    .map((s) => {
      const invested = num(s.investedValue);
      const current = num(s.currentValue);
      const profit = current - invested;
      const roiPct = invested > 0 ? (profit / invested) * 100 : 0;

      return {
        name: s.ticker,
        type: "Ação",
        invested,
        current,
        profit,
        roiPct
      };
    })
    .filter((x) => x.name && x.invested > 0);

  const cryptoRows = cur.crypto
    .map((c) => {
      const invested = num(c.invest);
      const current = num(c.currentValue);
      const profit = current - invested;
      const roiPct = invested > 0 ? (profit / invested) * 100 : 0;

      return {
        name: c.coin,
        type: "Cripto",
        invested,
        current,
        profit,
        roiPct
      };
    })
    .filter((x) => x.name && x.invested > 0);

  return [...stockRows, ...cryptoRows]
    .sort((a, b) => b.roiPct - a.roiPct);
}

function buildP2PPlatformRanking() {
  const port = getPortfolio();
  const rows = Array.isArray(port.p2p) ? port.p2p : [];

  const map = new Map();

  for (const p of rows) {
    const platform = String(p.platform || "—").trim() || "—";
    const amount = num(p.amount);
    const rate = num(p.rate) / 100;

    let years = num(p.years);
    if (!years && p.start && p.end) {
      const ms = new Date(p.end).getTime() - new Date(p.start).getTime();
      years = ms > 0 ? ms / (365.25 * 24 * 3600 * 1000) : 0;
    }
    years = years > 0 ? years : 1;

    const final = amount + (amount * rate * years);
    const profit = final - amount;

    if (!map.has(platform)) {
      map.set(platform, {
        platform,
        invested: 0,
        final: 0,
        profit: 0
      });
    }

    const acc = map.get(platform);
    acc.invested += amount;
    acc.final += final;
    acc.profit += profit;
  }

  return Array.from(map.values())
    .map((x) => ({
      ...x,
      roiPct: x.invested > 0 ? (x.profit / x.invested) * 100 : 0
    }))
    .sort((a, b) => b.roiPct - a.roiPct);
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

  const btnStocks = $("btnExpandStocksChart");
  const btnDiv = $("btnExpandDividendsChart");

    if (btnStocks && !btnStocks.__wired) {
    btnStocks.__wired = true;
    btnStocks.addEventListener("click", () => {
      openExpandedChart("stocks");
    });
  }

   if (btnDiv && !btnDiv.__wired) {
    btnDiv.__wired = true;
    btnDiv.addEventListener("click", () => {
      openExpandedChart("dividends");
    });
  }

    const modalEl = $("gxExpandModal");
  if (modalEl && !modalEl.__wired) {
    modalEl.__wired = true;
    modalEl.addEventListener("hidden.bs.modal", () => {
      destroyExpandedChart();
    });
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
      const div = calcDividends(port);

      const hint = $("gxHint");
      if (hint) hint.textContent = `Património atual: ${euro(cur.patrimonioTotal)}`;

      const divHint = $("gxDivHint");
      if (divHint) divHint.textContent = `Total: ${euro(div.totalYear)}/ano • ${euro(div.totalMonth)}/mês`;

      const fundsYear = cur.funds.reduce((a, x) => a + num(x.annualIncome), 0);
      const fundsMonth = fundsYear / 12;
      const fundsHint = $("gxFundsHint");
      if (fundsHint) fundsHint.textContent = `Total: ${euro(fundsYear)}/ano • ${euro(fundsMonth)}/mês`;

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
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { ticks: { callback: (v) => euro(v) } } }
          }
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
        setChartMinWidth("gxChartStocks", packed.labels.length);
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

      // 5) P2P — Investido vs Valor final por projeto
const ctxP2P = $("gxChartP2PProjects")?.getContext("2d");
if (ctxP2P) {
  const rows = (port.p2p || []).map((p) => {
    const amount = num(p.amount);
    const rate = num(p.rate) / 100;

    let years = num(p.years);
    if (!years && p.start && p.end) {
      const ms = new Date(p.end).getTime() - new Date(p.start).getTime();
      years = ms > 0 ? ms / (365.25 * 24 * 3600 * 1000) : 0;
    }
    years = years > 0 ? years : 1;

    const final = amount + (amount * rate * years);

    return {
      label: `${String(p.project || "Projeto")} (${String(p.platform || "—")})`,
      invested: amount,
      final: final
    };
  }).filter(x => x.invested > 0 || x.final > 0);

  charts.push(new Chart(ctxP2P, {
    type: "bar",
    data: {
      labels: rows.map(x => x.label),
      datasets: [
        { label: "Investido", data: rows.map(x => x.invested) },
        { label: "Valor final", data: rows.map(x => x.final) }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: {
            callback: (v) => euro(v)
          }
        }
      }
    }
  }));
}

      // 6) Setores (doughnut)
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

      // 7) Dividendos por ticker (€/ano) — Top 12 + OUTROS
      const ctxDiv = $("gxChartDivTickers")?.getContext("2d");
      if (ctxDiv) {
        const packed = topNWithOthersFromMap(div.byTicker, 12, "OUTROS");
        setChartMinWidth("gxChartDivTickers", packed.labels.length);
        charts.push(new Chart(ctxDiv, {
          type: "bar",
          data: { labels: packed.labels, datasets: [{ label: "Dividendos (€/ano)", data: packed.values }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

      // 8) Fundos parados — juros por plataforma (€/ano) — Top 10 + OUTROS
      const ctxFunds = $("gxChartFundsIncome")?.getContext("2d");
      if (ctxFunds) {
        const map = groupSum(cur.funds, (f) => f.platform || "—", (f) => f.annualIncome);
        const packed = topNWithOthersFromMap(map, 10, "OUTROS");
        charts.push(new Chart(ctxFunds, {
          type: "bar",
          data: { labels: packed.labels, datasets: [{ label: "Juros (€/ano)", data: packed.values }] },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { ticks: { callback: (v) => euro(v) } } } }
        }));
      }

      // 9) Net flow por mês (ledger)
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

      // 10) Rendimento passivo por mês
const ctxPassive = $("gxChartPassiveMonth")?.getContext("2d");
if (ctxPassive) {
  const months = monthsBackList(rangeN);

  const divMonth = div.totalMonth;
  const p2pMonth = cur.p2p.reduce((a, x) => a + num(x.profitPerYear), 0) / 12;
  const fundsMonth = cur.funds.reduce((a, x) => a + num(x.monthlyIncome), 0);

 const currentMonth = new Date().toISOString().slice(0, 7);

const divSeries = months.map(m => m >= currentMonth ? divMonth : 0);
const p2pSeries = months.map(m => m >= currentMonth ? p2pMonth : 0);
const fundsSeries = months.map(m => m >= currentMonth ? fundsMonth : 0);
const totalSeries = months.map(m => m >= currentMonth ? (divMonth + p2pMonth + fundsMonth) : 0);

  charts.push(new Chart(ctxPassive, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Dividendos", data: divSeries },
        { label: "P2P", data: p2pSeries },
        { label: "Fundos", data: fundsSeries },
        { label: "Total", data: totalSeries, type: "line", tension: 0.25 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: {
            callback: (v) => euro(v)
          }
        }
      }
    }
  }));
}

      // 11) Vendas: lucro por mês
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

    // FIRE — progresso histórico
const ctxFireProgress = $("gxChartFireProgress")?.getContext("2d");

if (ctxFireProgress) {
  const histData = safeJSON(HIST_KEY, null);

  if (histData && histData.months) {
    const months = Object.keys(histData.months)
      .filter(m => /^\d{4}-\d{2}$/.test(m))
      .sort((a, b) => a.localeCompare(b));

    const firePct = months.map(m => {
      const fire = histData.months[m]?.snapshot?.fire;
      return num(fire?.fiProgressPct || 0);
    });

    charts.push(new Chart(ctxFireProgress, {
      type: "line",
      data: {
        labels: months,
        datasets: [{
          label: "Progresso FIRE (%)",
          data: firePct,
          tension: 0.25
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: (v) => v + "%"
            }
          }
        }
      }
    }));
  }
}


// FIRE — rendimento passivo vs objetivo
const ctxFireIncome = $("gxChartFireIncome")?.getContext("2d");

if (ctxFireIncome) {
  const histData = safeJSON(HIST_KEY, null);

  if (histData && histData.months) {
    const months = Object.keys(histData.months)
      .filter(m => /^\d{4}-\d{2}$/.test(m))
      .sort((a, b) => a.localeCompare(b));

    const passive = months.map(m => {
      const fire = histData.months[m]?.snapshot?.fire;
      return num(fire?.passiveIncomeMonth || 0);
    });

    const goal = months.map(m => {
      const fire = histData.months[m]?.snapshot?.fire;
      return num(fire?.fiGoalMonth || 0);
    });

    charts.push(new Chart(ctxFireIncome, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Rendimento passivo mensal",
            data: passive,
            tension: 0.25
          },
          {
            label: "Objetivo FIRE",
            data: goal,
            borderDash: [6, 6],
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: (v) => euro(v)
            }
          }
        }
      }
    }));
  }
}

// FIRE — trajetória futura até ao objetivo
const ctxFireTrajectory = $("gxChartFireTrajectory")?.getContext("2d");

if (ctxFireTrajectory) {
  const histData = safeJSON(HIST_KEY, null);

  if (histData && histData.months) {
    const histMonths = Object.keys(histData.months)
      .filter(m => /^\d{4}-\d{2}$/.test(m))
      .sort((a, b) => a.localeCompare(b));

    const passiveHist = histMonths.map(m => {
      const fire = histData.months[m]?.snapshot?.fire;
      return num(fire?.passiveIncomeMonth || 0);
    });

    const goalHist = histMonths.map(m => {
      const fire = histData.months[m]?.snapshot?.fire;
      return num(fire?.fiGoalMonth || 0);
    });

    const lastPassive = passiveHist.length ? passiveHist[passiveHist.length - 1] : 0;
    const lastGoal = goalHist.length ? goalHist[goalHist.length - 1] : 0;
    const firstPassive = passiveHist.length ? passiveHist[0] : 0;
    const monthsDiff = histMonths.length - 1;

    let growthRateMonth = 0;
    if (histMonths.length >= 2 && firstPassive > 0 && lastPassive > 0 && monthsDiff > 0) {
      growthRateMonth = Math.pow(lastPassive / firstPassive, 1 / monthsDiff) - 1;
    }

    const labels = [...histMonths];
    const histSeries = [...passiveHist];
    const projectionSeries = new Array(histMonths.length).fill(null);
    const goalSeries = [...goalHist];

    if (lastGoal > 0) {
      let projected = lastPassive;
      let d = histMonths.length
        ? new Date(histMonths[histMonths.length - 1] + "-01")
        : new Date();

      let guard = 0;

      while (projected < lastGoal && guard < 180) {
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

        if (growthRateMonth > 0) {
          projected = projected * (1 + growthRateMonth);
        }

        labels.push(ym);
        histSeries.push(null);
        projectionSeries.push(projected);
        goalSeries.push(lastGoal);

        guard++;
      }
    }

    charts.push(new Chart(ctxFireTrajectory, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Histórico",
            data: histSeries,
            tension: 0.25
          },
          {
            label: "Projeção",
            data: projectionSeries,
            tension: 0.25,
            borderDash: [8, 4]
          },
          {
            label: "Objetivo FIRE",
            data: goalSeries,
            tension: 0,
            borderDash: [4, 4]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            ticks: {
              callback: (v) => euro(v)
            }
          }
        }
      }
    }));
  }
}
            // 12) Ranking ROI do portefólio
      const roiTable = $("gxRoiTable");
      if (roiTable) {
        const rows = buildPortfolioRoiRanking().slice(0, 10);

        roiTable.innerHTML = rows.map((r) => {
          const profitClass = r.profit >= 0 ? "ras-pos" : "ras-neg";
          const roiClass = r.roiPct >= 0 ? "ras-pos" : "ras-neg";

          return `
            <tr>
              <td><strong>${r.name}</strong></td>
              <td>${r.type}</td>
              <td class="text-end">${euro(r.invested)}</td>
              <td class="text-end">${euro(r.current)}</td>
              <td class="text-end ${profitClass}">${euro(r.profit)}</td>
              <td class="text-end ${roiClass}">${r.roiPct.toFixed(2)}%</td>
            </tr>
          `;
        }).join("");
      }

            // 13) Ranking plataformas P2P
      const p2pTable = $("gxP2PPlatformTable");
      if (p2pTable) {
        const rows = buildP2PPlatformRanking();

        p2pTable.innerHTML = rows.map((r) => {
          const profitClass = r.profit >= 0 ? "ras-pos" : "ras-neg";
          const roiClass = r.roiPct >= 0 ? "ras-pos" : "ras-neg";

          return `
            <tr>
              <td><strong>${r.platform}</strong></td>
              <td class="text-end">${euro(r.invested)}</td>
              <td class="text-end">${euro(r.final)}</td>
              <td class="text-end ${profitClass}">${euro(r.profit)}</td>
              <td class="text-end ${roiClass}">${r.roiPct.toFixed(2)}%</td>
            </tr>
          `;
        }).join("");
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
    renderCharts();
  });
})();