/* app.js — Dashboard V1 (localStorage) — FIXED */
(function () {
  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    session: "ras_session_v1",
    data: "ras_data_v1",
    history: "ras_history_v1",
    ledger: "ras_ledger_v1" // reservado (para futuro)
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

  const DEFAULT_HISTORY = {
    meta: { lastUpdated: null },
    months: {
      // "YYYY-MM": { createdAt, snapshot: {...}, notes }
    }
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

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function cryptoRandomId() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // Merge defensivo (sem shallow traps)
  function mergeData(incoming) {
    const base = structuredClone(DEFAULT_DATA);
    if (!incoming || typeof incoming !== "object") return base;

    const out = structuredClone(base);
    Object.assign(out, incoming);

    out.meta = { ...(base.meta || {}), ...(incoming.meta || {}) };
    out.patrimonio = { ...(base.patrimonio || {}), ...(incoming.patrimonio || {}) };

    out.stocks = Array.isArray(incoming.stocks) ? incoming.stocks : [];
    out.dividends = Array.isArray(incoming.dividends) ? incoming.dividends : [];
    out.crypto = Array.isArray(incoming.crypto) ? incoming.crypto : [];
    out.p2p = Array.isArray(incoming.p2p) ? incoming.p2p : [];
    out.funds = Array.isArray(incoming.funds) ? incoming.funds : [];

    return out;
  }

  // -----------------------
  // Data storage
  // -----------------------
  function setData(data) {
    const merged = mergeData(data);
    merged.meta = merged.meta || {};
    merged.meta.lastUpdated = nowISO();
    localStorage.setItem(STORAGE.data, JSON.stringify(merged));

    // 🔔 notifica UI + outros módulos (vendas.js / graficos.js)
    window.dispatchEvent(new Event("ras:data-updated"));
  }

  function getData() {
    try {
      const raw = localStorage.getItem(STORAGE.data);
      if (!raw) return structuredClone(DEFAULT_DATA);
      const parsed = JSON.parse(raw);
      return mergeData(parsed);
    } catch {
      return structuredClone(DEFAULT_DATA);
    }
  }

  // -----------------------
  // History storage (ÚNICO)
  // -----------------------
  function isValidMonthKey(m) {
    return typeof m === "string" && /^\d{4}-\d{2}$/.test(m);
  }

  function monthKeyFromDate(d = new Date()) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  function getHistory() {
    try {
      const raw = localStorage.getItem(STORAGE.history);
      if (!raw) return structuredClone(DEFAULT_HISTORY);
      const parsed = JSON.parse(raw);
      const merged = { ...structuredClone(DEFAULT_HISTORY), ...parsed };
      merged.meta = merged.meta || {};
      merged.months = parsed?.months && typeof parsed.months === "object" ? parsed.months : {};
      return merged;
    } catch {
      return structuredClone(DEFAULT_HISTORY);
    }
  }

  function setHistory(hist) {
    hist.meta = hist.meta || {};
    hist.months = hist.months || {};
    hist.meta.lastUpdated = nowISO();
    localStorage.setItem(STORAGE.history, JSON.stringify(hist));

    // 🔔 atualiza imediatamente (histórico é seção própria)
    renderHistorico();
  }

  // Snapshot mensal: guardamos investido e atual
  function buildSnapshotFromData(data) {
  const st = calcStocks(data);
  const cr = calcCrypto(data);
  const p2 = calcP2P(data);
  const fd = calcFunds(data);
  const dv = calcDividendsTotal(data);

  const banco = safeNum(data.patrimonio?.bancoPessoal);

  const acoesAtual = st.current;
  const criptoAtual = cr.current;
  const p2pFinal = p2.finals;
  const fundosTotal = fd.total;

  const patrimonioTotal = banco + acoesAtual + criptoAtual + p2pFinal + fundosTotal;

  const passiveIncomeAnnual = dv.year + p2.profitPerYear + fd.yearProfit;
  const passiveIncomeMonth = passiveIncomeAnnual / 12;

  let passiveIncomeRealMonth = 0;
  if (window.LEDGER && typeof window.LEDGER.getPassiveIncomeMonth === "function") {
    passiveIncomeRealMonth = safeNum(window.LEDGER.getPassiveIncomeMonth());
  }

  const fiGoalMonth = safeNum(data.patrimonio?.fiGoalMonth);
  const fiProgressPct = fiGoalMonth > 0
    ? Math.max(0, Math.min(100, (passiveIncomeMonth / fiGoalMonth) * 100))
    : 0;

  return {
    banco,

    acoes: {
      invested: st.invested,
      current: st.current,
      profit: st.profit,
      pct: st.pct
    },

    cripto: {
      invested: cr.invested,
      current: cr.current,
      profit: cr.profit,
      pct: cr.pct
    },

    p2p: {
      invested: p2.invested,
      finals: p2.finals,
      profit: p2.profit,
      avgPct: p2.avgPct,
      profitPerYear: p2.profitPerYear
    },

    fundos: {
      total: fd.total,
      yearProfit: fd.yearProfit,
      avgRate: fd.avgRate
    },

    fire: {
      passiveIncomeAnnual,
      passiveIncomeMonth,
      passiveIncomeRealMonth,
      fiGoalMonth,
      fiProgressPct
    },

    totals: {
      acoesAtual,
      criptoAtual,
      p2pFinal,
      fundosTotal,
      patrimonioTotal
    }
  };
}

  function historySnapshot(monthKey) {
    const m = isValidMonthKey(monthKey) ? monthKey : monthKeyFromDate(new Date());
    const hist = getHistory();
    const data = getData();

    hist.months[m] = {
      createdAt: nowISO(),
      snapshot: buildSnapshotFromData(data),
      notes: ""
    };

    setHistory(hist);
    alert(`Histórico guardado para ${m} ✅`);
  }

  function historyDeleteMonth(monthKey) {
    const hist = getHistory();
    if (hist.months && hist.months[monthKey]) {
      delete hist.months[monthKey];
      setHistory(hist);
    }
  }

  function historyClearAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODO o histórico?")) return;
    setHistory(structuredClone(DEFAULT_HISTORY));
    alert("Histórico apagado ✅");
  }

  function historyExportJSON() {
    const hist = getHistory();
    const blob = new Blob([JSON.stringify(hist, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rumo-ao-sucesso-historico-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // -----------------------
  // Chart.js — Histórico
  // -----------------------
  function renderHistChart(hist) {
    try {
      const canvas = $("histChart");
      if (!canvas) return;

      if (!window.Chart) return;

      const monthsObj = hist?.months || {};
      const keysAll = Object.keys(monthsObj)
        .filter(k => isValidMonthKey(k))
        .sort((a, b) => a.localeCompare(b));

      const labels = [];
      const values = [];

      for (const k of keysAll) {
        const snap = monthsObj[k]?.snapshot;
        const val = snap?.totals?.patrimonioTotal ?? 0;
        labels.push(k);
        values.push(Number(val || 0));
      }

      if (!labels.length) {
        if (window.__RAS_HIST_CHART__) {
          window.__RAS_HIST_CHART__.data.labels = [];
          window.__RAS_HIST_CHART__.data.datasets[0].data = [];
          window.__RAS_HIST_CHART__.update();
        }
        return;
      }

      if (!window.__RAS_HIST_CHART__) {
        window.__RAS_HIST_CHART__ = new Chart(canvas, {
          type: "line",
          data: {
            labels,
            datasets: [{
              label: "Património total (€)",
              data: values,
              tension: 0.25
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
              y: { ticks: { callback: (v) => `${Number(v).toLocaleString("pt-PT")} €` } }
            }
          }
        });
      } else {
        const ch = window.__RAS_HIST_CHART__;
        ch.data.labels = labels;
        ch.data.datasets[0].data = values;
        ch.update();
      }
    } catch (e) {
      console.warn("Hist chart error:", e);
    }
  }

  function renderHistorico() {
    const tbody = $("histTable");
    if (!tbody) return;

    const hist = getHistory();
    const keys = Object.keys(hist.months || {})
      .filter(isValidMonthKey)
      .sort((a, b) => b.localeCompare(a));

    if (!keys.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-secondary small">Sem histórico guardado.</td></tr>`;
      renderHistChart(hist);
      return;
    }

    tbody.innerHTML = keys.map((m) => {
      const s = hist.months[m]?.snapshot;
      const t = s?.totals || {};

      return `
        <tr>
          <td class="fw-semibold">${escapeHtml(m)}</td>
          <td class="text-end">${fmtEUR(s?.banco || 0)}</td>
          <td class="text-end">${fmtEUR(t?.acoesAtual || 0)}</td>
          <td class="text-end">${fmtEUR(t?.criptoAtual || 0)}</td>
          <td class="text-end">${fmtEUR(t?.p2pFinal || 0)}</td>
          <td class="text-end">${fmtEUR(t?.fundosTotal || 0)}</td>
          <td class="text-end fw-semibold">${fmtEUR(t?.patrimonioTotal || 0)}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-outline-danger" data-act="hist-del" data-month="${escapeHtml(m)}" type="button">Apagar</button>
          </td>
        </tr>
      `;
    }).join("");

    if (!tbody.__bound) {
      tbody.__bound = true;
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act='hist-del']");
        if (!btn) return;
        const m = btn.getAttribute("data-month");
        if (!m) return;
        if (!confirmDanger(`Apagar histórico de ${m}?`)) return;
        historyDeleteMonth(m);
      });
    }

    renderHistChart(hist);
  }

  function bindHistoryUI() {
    if (window.__RAS_HISTORY_UI_BOUND__) return;
    window.__RAS_HISTORY_UI_BOUND__ = true;

    const inpMonth = $("histMonth");
    const btnNow = $("btnHistSnapshotNow");
    const btnMonth = $("btnHistSnapshotMonth");
    const btnExport = $("btnHistExport");
    const btnWipe = $("btnHistWipe");

    if (btnNow) btnNow.addEventListener("click", () => historySnapshot(monthKeyFromDate(new Date())));

    if (btnMonth) btnMonth.addEventListener("click", () => {
      const m = inpMonth?.value || "";
      if (!isValidMonthKey(m)) return alert("Escolhe um mês válido (AAAA-MM).");
      historySnapshot(m);
    });

    if (btnExport) btnExport.addEventListener("click", historyExportJSON);
    if (btnWipe) btnWipe.addEventListener("click", historyClearAll);

    if (inpMonth && !inpMonth.__bound) {
      inpMonth.__bound = true;
      inpMonth.addEventListener("change", () => renderHistorico());
    }
  }

  // Ledger reservado (futuro)
  function ledgerAppend(entry) {
    try {
      const raw = localStorage.getItem(STORAGE.ledger);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ ...entry, createdAt: nowISO() });
      localStorage.setItem(STORAGE.ledger, JSON.stringify(arr));
    } catch {}
  }

  // -----------------------
  // Session
  // -----------------------
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
    movimentos: { title: "Movimentos", el: "sec-movimentos" },
    historico: { title: "Histórico", el: "sec-historico" }
  };

  function setActiveMenu(section) {
    document.querySelectorAll("#menuList a").forEach(a => {
      const s = a.getAttribute("data-section");
      a.classList.toggle("active", s === section);
    });
  }

  function getActiveKey() {
    const h = (window.location.hash || "").replace("#", "").trim();
    return SECTION_MAP[h] ? h : "patrimonio";
  }

 function renderSection(key) {
  try {
    if (key === "patrimonio") renderPatrimonio();
    if (key === "acoes") { renderStocks(); renderDividends(); }
    if (key === "cripto") renderCrypto();
    if (key === "p2p") renderP2P();
    if (key === "fundos") renderFunds();
    if (key === "historico") renderHistorico();

    if (key === "vendas") {
      if (window.VENDAS && typeof window.VENDAS.render === "function") window.VENDAS.render();
      else console.warn("[VENDAS] vendas.js não carregou ou não expôs window.VENDAS.render()");
    }

    // ✅ MOVIMENTOS (Ledger)
    if (key === "movimentos") {
      if (window.LEDGER && typeof window.LEDGER.render === "function") window.LEDGER.render();
      else console.warn("[LEDGER] Módulo ledger.js não carregou ou não expôs window.LEDGER.render()");
    }

    // graficos.js trata do render dele (hook no menu/eventos)
  } catch (e) {
    console.warn("[renderSection] erro na secção:", key, e);
  }
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

    renderSection(key);
  }

  // -----------------------
  // Global actions (export/import/demo/wipe)
  // -----------------------
  const SALES_KEY = "ras_vendas_v1";

  function exportBackupAll() {
  try {
    const dataRaw = localStorage.getItem(STORAGE.data);
    const histRaw = localStorage.getItem(STORAGE.history);
    const salesRaw = localStorage.getItem(SALES_KEY);

    // ✅ inclui ledger + movements
    const ledgerRaw = localStorage.getItem("ras_ledger_v1");
    const movementsRaw = localStorage.getItem("ras_movements_v1");

    const bundle = {
      schema: "ras_backup_all_v2",
      exportedAt: nowISO(),
      app: "Rumo ao Sucesso",
      payload: {
        data: dataRaw ? JSON.parse(dataRaw) : structuredClone(DEFAULT_DATA),
        history: histRaw ? JSON.parse(histRaw) : structuredClone(DEFAULT_HISTORY),
        vendas: salesRaw ? JSON.parse(salesRaw) : { list: [], showTax: true, taxRate: 28 },

        // ✅ novos
        ledger: ledgerRaw ? JSON.parse(ledgerRaw) : [],
        movements: movementsRaw ? JSON.parse(movementsRaw) : []
      }
    };

    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rumo-ao-sucesso-backup-TOTAL-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    alert("Backup TOTAL exportado ✅");
  } catch (e) {
    console.error("[exportBackupAll] erro:", e);
    alert("Falha ao exportar backup TOTAL.");
  }
}

function importBackupAll() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";

  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const obj = JSON.parse(text);

      // ✅ Aceita Backup TOTAL v1 e v2
      const schema = String(obj?.schema || "");
      const isTotalBackup = (schema === "ras_backup_all_v1" || schema === "ras_backup_all_v2");

      // v2 -> payload; v1 pode existir sem payload (ficamos robustos)
      const p = (obj && typeof obj.payload === "object" && obj.payload) ? obj.payload : {};

      // valida que tem conteúdo mínimo
      const hasCore =
        (p.data != null) || (p.history != null) || (p.vendas != null) || (p.ledger != null) || (p.movements != null);

      if (!isTotalBackup || !hasCore) {
        alert("Este ficheiro não é um backup TOTAL válido (ras_backup_all_v1/v2).");
        return;
      }

      const incomingData = p.data ?? structuredClone(DEFAULT_DATA);
      const incomingHist = p.history ?? structuredClone(DEFAULT_HISTORY);
      const incomingSales = p.vendas ?? { list: [], showTax: true, taxRate: 28 };

      // ✅ novos (se não existirem no ficheiro, ficam vazios)
      const incomingLedger = p.ledger ?? [];
      const incomingMovements = p.movements ?? [];

      // MIGRAÇÃO: bancoCodeconnect -> bancoPessoal
      if (incomingData?.patrimonio?.bancoCodeconnect != null && incomingData?.patrimonio?.bancoPessoal == null) {
        incomingData.patrimonio.bancoPessoal = incomingData.patrimonio.bancoCodeconnect;
        delete incomingData.patrimonio.bancoCodeconnect;
      }

      localStorage.setItem(STORAGE.data, JSON.stringify(mergeData(incomingData)));
      localStorage.setItem(STORAGE.history, JSON.stringify({ ...structuredClone(DEFAULT_HISTORY), ...incomingHist }));
      localStorage.setItem(SALES_KEY, JSON.stringify(incomingSales));

      // ✅ repõe ledger + movements
      localStorage.setItem("ras_ledger_v1", JSON.stringify(incomingLedger));
      localStorage.setItem("ras_movements_v1", JSON.stringify(incomingMovements));

      window.dispatchEvent(new Event("ras:data-updated"));
      alert("Backup TOTAL importado ✅");
      location.reload();
    } catch (e) {
      console.error("[importBackupAll] erro:", e);
      alert("Falha ao importar. JSON inválido ou corrompido.");
    }
  };

  input.click();
}

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

      // MIGRAÇÃO: bancoCodeconnect -> bancoPessoal
      if (obj?.patrimonio?.bancoCodeconnect != null && obj?.patrimonio?.bancoPessoal == null) {
        obj.patrimonio.bancoPessoal = obj.patrimonio.bancoCodeconnect;
        delete obj.patrimonio.bancoCodeconnect;
      }

      setData(obj);
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

    if (obj?.patrimonio?.bancoCodeconnect != null && obj?.patrimonio?.bancoPessoal == null) {
      obj.patrimonio.bancoPessoal = obj.patrimonio.bancoCodeconnect;
      delete obj.patrimonio.bancoCodeconnect;
    }

    setData(obj);
    alert("Demo carregada ✅");
  } catch {
    alert("Não consegui carregar ./data/demo.json. Confirma se existe na pasta /data.");
  }
}

function wipeAllData() {
  if (!confirmDanger("Tens a certeza que queres APAGAR todos os dados?")) return;
  setData(structuredClone(DEFAULT_DATA));
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

    const profit = invested * (rate / 100) * years;
    const finalValue = invested + profit;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;

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

    const profitPerYear = data.p2p.reduce((a, x) => a + calcP2PRow(x).profitPerYear, 0);
    return { invested, finals, profit, avgPct, profitPerYear };
  }

  // Fundos Parados = COMPOSTOS (mensal/anual)
  function annualRateFromFunds(rate, freq) {
    const r = safeNum(rate) / 100;
    if (freq === "monthly") return (Math.pow(1 + r, 12) - 1) * 100;
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
  // Patrimonio
  // -----------------------
  function renderPatrimonio() {
    const data = getData();

    const st = calcStocks(data);
    const cr = calcCrypto(data);
    const p2 = calcP2P(data);
    const fd = calcFunds(data);
    const dv = calcDividendsTotal(data);
        let passiveRealMonth = 0;
    if (window.LEDGER && typeof window.LEDGER.getPassiveIncomeMonth === "function") {
      passiveRealMonth = window.LEDGER.getPassiveIncomeMonth();
    }

    const totalInvestidoAtivos = st.invested + cr.invested + p2.invested;
    const ativosAtuais = st.current + cr.current + p2.finals;

    const lucroTotal =
      (st.current - st.invested) +
      (cr.current - cr.invested) +
      (p2.finals - p2.invested);

    const pctLucro = totalInvestidoAtivos > 0 ? (lucroTotal / totalInvestidoAtivos) * 100 : 0;

    const banco = safeNum(data.patrimonio?.bancoPessoal);
    const patrimonioTotal = ativosAtuais + fd.total + banco;

    const totalRecorrenteAno = dv.year + p2.profitPerYear + fd.yearProfit;
    const totalRecorrenteMes = totalRecorrenteAno / 12;
    const totalRecorrenteDia = totalRecorrenteAno / 365.25;
    const fiGoalMonth = safeNum(data.patrimonio?.fiGoalMonth);
    const fiCurrentMonth = totalRecorrenteMes;
    const fiMissingMonth = Math.max(0, fiGoalMonth - fiCurrentMonth);
    const fiProgressPct = fiGoalMonth > 0 ? (fiCurrentMonth / fiGoalMonth) * 100 : 0;
    const fiProgressPctClamped = Math.max(0, Math.min(100, fiProgressPct));

    if ($("plTotalInvestido")) $("plTotalInvestido").textContent = fmtEUR(totalInvestidoAtivos);
    if ($("plAtivosAtuais")) $("plAtivosAtuais").textContent = fmtEUR(ativosAtuais);
    if ($("plLucroTotal")) $("plLucroTotal").textContent = fmtEUR(lucroTotal);
    if ($("plPctLucro")) $("plPctLucro").textContent = fmtPct(pctLucro);
    if ($("plPatrimonioTotal")) $("plPatrimonioTotal").textContent = fmtEUR(patrimonioTotal);

    const inpB = $("inpBancoPessoal");
    if (inpB) inpB.value = String(banco || 0);

    if ($("plRecAno")) $("plRecAno").textContent = fmtEUR(totalRecorrenteAno);
    if ($("plRecMes")) $("plRecMes").textContent = fmtEUR(totalRecorrenteMes);
    if ($("plRecMesReal")) $("plRecMesReal").textContent = fmtEUR(passiveRealMonth);
    if ($("plRecDia")) $("plRecDia").textContent = fmtEUR(totalRecorrenteDia);

    if ($("plDvAno")) $("plDvAno").textContent = fmtEUR(dv.year);
    if ($("plDvMes")) $("plDvMes").textContent = fmtEUR(dv.month);
    if ($("plDvDia")) $("plDvDia").textContent = fmtEUR(dv.day);

    if ($("plP2Ano")) $("plP2Ano").textContent = fmtEUR(p2.profitPerYear);
    if ($("plP2Mes")) $("plP2Mes").textContent = fmtEUR(p2.profitPerYear / 12);
    if ($("plP2Dia")) $("plP2Dia").textContent = fmtEUR(p2.profitPerYear / 365.25);

    if ($("plFdAno")) $("plFdAno").textContent = fmtEUR(fd.yearProfit);
    if ($("plFdMes")) $("plFdMes").textContent = fmtEUR(fd.monthProfit);
    if ($("plFdDia")) $("plFdDia").textContent = fmtEUR(fd.dayProfit);
        if ($("inpFiGoalMonth")) $("inpFiGoalMonth").value = fiGoalMonth ? String(fiGoalMonth) : "";
    if ($("fiCurrentMonth")) $("fiCurrentMonth").textContent = fmtEUR(fiCurrentMonth);
    if ($("fiGoalMonth")) $("fiGoalMonth").textContent = fmtEUR(fiGoalMonth);
    if ($("fiMissingMonth")) $("fiMissingMonth").textContent = fmtEUR(fiMissingMonth);
    if ($("fiProgressPct")) $("fiProgressPct").textContent = fmtPct(fiProgressPct);

    const fiBar = $("fiProgressBar");
    if (fiBar) {
      fiBar.style.width = `${fiProgressPctClamped}%`;
      fiBar.textContent = `${fiProgressPctClamped.toFixed(1)}%`;
      fiBar.setAttribute("aria-valuenow", String(fiProgressPctClamped.toFixed(1)));
    }
        renderFireRadar();
  }
  function renderFireRadar() {
    const hist = getHistory();
    const months = Object.keys(hist.months || {})
      .filter(isValidMonthKey)
      .sort((a, b) => a.localeCompare(b));

    const setTxt = (id, txt) => {
      if ($(id)) $(id).textContent = txt;
    };

    if (months.length < 2) {
      setTxt("fiGrowthYear", "—");
      setTxt("fiGapMonth", "—");
      setTxt("fiYearsToFire", "—");
      setTxt("fiFireYear", "—");
      return;
    }

    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];

    const firstPassive = safeNum(hist.months[firstMonth]?.snapshot?.fire?.passiveIncomeMonth);
    const lastPassive = safeNum(hist.months[lastMonth]?.snapshot?.fire?.passiveIncomeMonth);
    const fiGoal = safeNum(hist.months[lastMonth]?.snapshot?.fire?.fiGoalMonth);

    const gap = Math.max(0, fiGoal - lastPassive);
    setTxt("fiGapMonth", fmtEUR(gap));

    if (firstPassive <= 0 || lastPassive <= 0 || fiGoal <= 0) {
      setTxt("fiGrowthYear", "—");
      setTxt("fiYearsToFire", "—");
      setTxt("fiFireYear", "—");
      return;
    }

    const monthsDiff = months.length - 1;
    if (monthsDiff <= 0) {
      setTxt("fiGrowthYear", "—");
      setTxt("fiYearsToFire", "—");
      setTxt("fiFireYear", "—");
      return;
    }

    const growthRateMonth = Math.pow(lastPassive / firstPassive, 1 / monthsDiff) - 1;
    const growthRateYear = Math.pow(1 + growthRateMonth, 12) - 1;

    if (!Number.isFinite(growthRateYear)) {
      setTxt("fiGrowthYear", "—");
    } else {
      setTxt("fiGrowthYear", fmtPct(growthRateYear * 100));
    }

    if (lastPassive >= fiGoal) {
      setTxt("fiYearsToFire", "Atingido");
      setTxt("fiFireYear", String(new Date().getFullYear()));
      return;
    }

    if (!Number.isFinite(growthRateMonth) || growthRateMonth <= 0) {
      setTxt("fiYearsToFire", "Sem projeção");
      setTxt("fiFireYear", "—");
      return;
    }

    const monthsToFire = Math.log(fiGoal / lastPassive) / Math.log(1 + growthRateMonth);
    const yearsToFire = monthsToFire / 12;

    if (!Number.isFinite(yearsToFire) || yearsToFire < 0) {
      setTxt("fiYearsToFire", "Sem projeção");
      setTxt("fiFireYear", "—");
      return;
    }

    const fireYear = new Date().getFullYear() + yearsToFire;

    setTxt("fiYearsToFire", `${yearsToFire.toFixed(1)} anos`);
    setTxt("fiFireYear", String(Math.round(fireYear)));
  }
  
  function saveBancoPessoal() {
    const data = getData();
    data.patrimonio = data.patrimonio || {};
    data.patrimonio.bancoPessoal = safeNum($("inpBancoPessoal")?.value);
    setData(data);
  }
    function saveFiGoalMonth() {
    const data = getData();
    data.patrimonio = data.patrimonio || {};
    data.patrimonio.fiGoalMonth = safeNum($("inpFiGoalMonth")?.value);
    setData(data);
  }

  // -----------------------
  // Stocks + Dividends
  // -----------------------
  let stEditingId = null;
  let dvEditingId = null;

  function upsertStock(row) {
    const data = getData();
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const sector = String(row.sector || "").trim(); // ✅
    if (!ticker) return alert("Ticker inválido.");
    const qty = safeNum(row.qty);
    const avg = safeNum(row.avg);
    const cur = safeNum(row.cur);
    if (qty <= 0) return alert("Nº ações tem de ser > 0.");
    if (avg <= 0 || cur <= 0) return alert("Preço médio e atual têm de ser > 0.");

    if (stEditingId) {
      const idx = data.stocks.findIndex(x => x.id === stEditingId);
      if (idx >= 0) data.stocks[idx] = { ...data.stocks[idx], ticker, sector, qty, avg, cur }; // ✅ sector
      stEditingId = null;
    } else {
      const id = cryptoRandomId();
      data.stocks.push({ id, ticker, sector, qty, avg, cur }); // ✅ sector
    }

    setData(data);
    clearStockForm();
  }

  function clearStockForm() {
    if ($("stTicker")) $("stTicker").value = "";
    if ($("stSector")) $("stSector").value = ""; // ✅
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

    let list = [...data.stocks];

if (window.__stocksSortKey) {

  const key = window.__stocksSortKey;
  const dir = window.__stocksSortDir || 1;

  list.sort((a, b) => {

    let av = 0;
    let bv = 0;

    if (key === "ticker") {
      return dir * a.ticker.localeCompare(b.ticker);
    }

    if (key === "qty") {
      av = safeNum(a.qty);
      bv = safeNum(b.qty);
    }

    if (key === "avg") {
      av = safeNum(a.avg);
      bv = safeNum(b.avg);
    }

    if (key === "cur") {
      av = safeNum(a.cur);
      bv = safeNum(b.cur);
    }

    if (key === "invested") {
      av = safeNum(a.qty) * safeNum(a.avg);
      bv = safeNum(b.qty) * safeNum(b.avg);
    }

    if (key === "profit") {
      av = safeNum(a.qty) * safeNum(a.cur) - safeNum(a.qty) * safeNum(a.avg);
      bv = safeNum(b.qty) * safeNum(b.cur) - safeNum(b.qty) * safeNum(b.avg);
    }

    if (key === "pct") {
      const ai = safeNum(a.qty) * safeNum(a.avg);
      const bi = safeNum(b.qty) * safeNum(b.avg);

      av = ai > 0 ? ((safeNum(a.qty) * safeNum(a.cur) - ai) / ai) * 100 : 0;
      bv = bi > 0 ? ((safeNum(b.qty) * safeNum(b.cur) - bi) / bi) * 100 : 0;
    }

    return dir * (av - bv);
  });
}

for (const x of list) {
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
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    if (!tbody.__bound) {
      tbody.__bound = true;
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const id = btn.getAttribute("data-id");
        const act = btn.getAttribute("data-act");

        if (act === "edit") {
          const data2 = getData();
          const row = data2.stocks.find(r => r.id === id);
          if (!row) return;
          stEditingId = id;
          if ($("stTicker")) $("stTicker").value = row.ticker;
          if ($("stSector")) $("stSector").value = row.sector || ""; // ✅
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
        }
      });
    }

    fillDividendTickerSelect();

if (!window.__stocksSortBound) {

  window.__stocksSortBound = true;

  const headers = document.querySelectorAll("#sec-acoes th[data-sort]");

  headers.forEach(th => {

  th.classList.add("ras-sort");

    th.style.cursor = "pointer";

    th.addEventListener("click", () => {

      const key = th.dataset.sort;

      if (window.__stocksSortKey === key) {
        window.__stocksSortDir *= -1;
      } else {
        window.__stocksSortKey = key;
        window.__stocksSortDir = 1;
      }

      headers.forEach(h=>{
  h.classList.remove("ras-sort-active-asc","ras-sort-active-desc");
});

if (window.__stocksSortDir === 1) {
  th.classList.add("ras-sort-active-asc");
} else {
  th.classList.add("ras-sort-active-desc");
}

headers.forEach(h => {
  h.classList.remove("ras-sort-active-asc", "ras-sort-active-desc");
});

if (window.__stocksSortDir === 1) {
  th.classList.add("ras-sort-active-asc");
} else {
  th.classList.add("ras-sort-active-desc");
}

renderStocks();

    });

  });

  }
  }

  function wipeStocksAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODAS as ações e dividendos?")) return;
    const data = getData();
    data.stocks = [];
    data.dividends = [];
    setData(data);
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

    let list = [...data.dividends];

if (window.__divSortKey) {

  const key = window.__divSortKey;
  const dir = window.__divSortDir || 1;

  list.sort((a, b) => {

    const data = getData();

    const stA = data.stocks.find(s => s.ticker === a.ticker);
    const stB = data.stocks.find(s => s.ticker === b.ticker);

    const qtyA = stA ? safeNum(stA.qty) : 0;
    const qtyB = stB ? safeNum(stB.qty) : 0;

    let av = 0;
    let bv = 0;

    if (key === "ticker") {
      return dir * a.ticker.localeCompare(b.ticker);
    }

    if (key === "yield") {

  const priceA = stA ? safeNum(stA.cur) : 0;
  const priceB = stB ? safeNum(stB.cur) : 0;

  av = priceA > 0 ? (safeNum(a.yearPerShare) / priceA) * 100 : 0;
  bv = priceB > 0 ? (safeNum(b.yearPerShare) / priceB) * 100 : 0;

}

    if (key === "year") {
      av = qtyA * safeNum(a.yearPerShare);
      bv = qtyB * safeNum(b.yearPerShare);
    }

    if (key === "month") {
      av = (qtyA * safeNum(a.yearPerShare)) / 12;
      bv = (qtyB * safeNum(b.yearPerShare)) / 12;
    }

    if (key === "pay") {
      const payA = safeNum(a.payN) > 0 ? (qtyA * safeNum(a.yearPerShare)) / safeNum(a.payN) : 0;
      const payB = safeNum(b.payN) > 0 ? (qtyB * safeNum(b.yearPerShare)) / safeNum(b.payN) : 0;

      av = payA;
      bv = payB;
    }

    return dir * (av - bv);
  });

}

for (const d of list) {
      const stRow = data.stocks.find(s => s.ticker === d.ticker);
      const qty = stRow ? safeNum(stRow.qty) : 0;
      const yearPerShare = safeNum(d.yearPerShare);
      const price = stRow ? safeNum(stRow.cur) : 0;
      const yieldPct = price > 0 ? (yearPerShare / price) * 100 : 0;
      const receivedYear = qty * yearPerShare;
      const receivedMonth = receivedYear / 12;
      const receivedDay = receivedYear / 365.25;
      const perPay = safeNum(d.payN) > 0 ? receivedYear / safeNum(d.payN) : receivedYear;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="fw-semibold">${escapeHtml(d.ticker)}</td>
        <td class="text-end">${qty}</td>
        <td class="text-end">${yearPerShare}</td>
        <td class="text-end">${fmtPct(yieldPct)}</td>
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

    if (!tbody.__bound) {
      tbody.__bound = true;
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
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
        }
      });
    }

    updateDividendQtyAuto();
    if (!window.__divSortBound) {

  window.__divSortBound = true;

  const headers = document.querySelectorAll('#sec-acoes .ras-cbox[data-cbox="dividends"] th[data-sort]');

  headers.forEach(th => {

    th.addEventListener("click", () => {

      const key = th.dataset.sort;

      if (window.__divSortKey === key) {
        window.__divSortDir *= -1;
      } else {
        window.__divSortKey = key;
        window.__divSortDir = 1;
      }

      renderDividends();

    });

  });

}
  }

  function wipeDividendsAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODOS os dividendos?")) return;
    const data = getData();
    data.dividends = [];
    setData(data);
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

    let list = [...data.crypto];

if (window.__crSortKey) {

  const key = window.__crSortKey;
  const dir = window.__crSortDir || 1;

  list.sort((a, b) => {

    let av = 0;
    let bv = 0;

    if (key === "coin") {
      return dir * a.coin.localeCompare(b.coin);
    }

    if (key === "invest") {
      av = safeNum(a.invest);
      bv = safeNum(b.invest);
    }

    if (key === "qty") {
      av = safeNum(a.qty);
      bv = safeNum(b.qty);
    }

    if (key === "price") {
      av = safeNum(a.price);
      bv = safeNum(b.price);
    }

    if (key === "current") {
      av = safeNum(a.qty) * safeNum(a.price);
      bv = safeNum(b.qty) * safeNum(b.price);
    }

    if (key === "profit") {
      av = (safeNum(a.qty) * safeNum(a.price)) - safeNum(a.invest);
      bv = (safeNum(b.qty) * safeNum(b.price)) - safeNum(b.invest);
    }

    if (key === "pct") {
      const ai = safeNum(a.invest);
      const bi = safeNum(b.invest);

      av = ai > 0 ? (((safeNum(a.qty) * safeNum(a.price)) - ai) / ai) * 100 : 0;
      bv = bi > 0 ? (((safeNum(b.qty) * safeNum(b.price)) - bi) / bi) * 100 : 0;
    }

    return dir * (av - bv);
  });

}

for (const x of list) {
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
      <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
      <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>
    </td>
  `;
  tbody.appendChild(tr);
}

    if (!tbody.__bound) {
      tbody.__bound = true;
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
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

        if (act === "del") {
          if (!confirmDanger("Apagar esta moeda?")) return;
          data2.crypto = data2.crypto.filter(r => r.id !== id);
          setData(data2);
        }
      });
    }
    if (!window.__crSortBound) {
  window.__crSortBound = true;

  const headers = document.querySelectorAll("#sec-cripto th[data-sort]");

  headers.forEach(th => {
    th.style.cursor = "pointer";

    th.addEventListener("click", () => {
      const key = th.dataset.sort;

      if (window.__crSortKey === key) {
        window.__crSortDir *= -1;
      } else {
        window.__crSortKey = key;
        window.__crSortDir = 1;
      }

      renderCrypto();
    });
  });
}
  }

  function wipeCryptoAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODAS as criptos?")) return;
    const data = getData();
    data.crypto = [];
    setData(data);
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

    const payload = { platform, project, amount, rate, years, start, end };

    if (p2EditingId) {
      const idx = data.p2p.findIndex(x => x.id === p2EditingId);
      if (idx >= 0) data.p2p[idx] = { ...data.p2p[idx], ...payload };
      p2EditingId = null;
    } else {
      data.p2p.push({ id: cryptoRandomId(), ...payload });
    }

    setData(data);
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

   let list = [...data.p2p];

if (window.__p2SortKey) {

  const key = window.__p2SortKey;
  const dir = window.__p2SortDir || 1;

  list.sort((a, b) => {

    const ra = calcP2PRow(a);
    const rb = calcP2PRow(b);

    let av = 0;
    let bv = 0;

    if (key === "platform") {
      return dir * a.platform.localeCompare(b.platform);
    }

    if (key === "project") {
      return dir * a.project.localeCompare(b.project);
    }

    if (key === "amount") {
      av = safeNum(a.amount);
      bv = safeNum(b.amount);
    }

    if (key === "rate") {
      av = safeNum(a.rate);
      bv = safeNum(b.rate);
    }

    if (key === "years") {
      av = ra.years;
      bv = rb.years;
    }

    if (key === "final") {
      av = ra.finalValue;
      bv = rb.finalValue;
    }

    if (key === "profit") {
      av = ra.profit;
      bv = rb.profit;
    }

    if (key === "pct") {
      av = ra.pct;
      bv = rb.pct;
    }

    return dir * (av - bv);
  });

}

for (const x of list) {

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

    if (!tbody.__bound) {
      tbody.__bound = true;
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
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
        }
      });
    }
    if (!window.__p2SortBound) {
      window.__p2SortBound = true;

      const headers = document.querySelectorAll("#sec-p2p th[data-sort]");

      headers.forEach(th => {
        th.style.cursor = "pointer";

        th.addEventListener("click", () => {
          const key = th.dataset.sort;

          if (window.__p2SortKey === key) {
            window.__p2SortDir *= -1;
          } else {
            window.__p2SortKey = key;
            window.__p2SortDir = 1;
          }

          renderP2P();
        });
      });
    }
  }

  function wipeP2PAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODOS os projetos P2P?")) return;
    const data = getData();
    data.p2p = [];
    setData(data);
    clearP2PForm();
  }

  // -----------------------
  // Funds
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

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(x.platform)}</td>
        <td class="text-end">${fmtEUR(x.amount)}</td>
        <td class="text-end">${fmtPct(annualRate)}</td>
        <td class="text-end">${fmtEUR(yearProfit)}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${x.id}" type="button">Editar</button>
          <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${x.id}" type="button">Apagar</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    if (!tbody.__bound) {
      tbody.__bound = true;
      tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
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
        }
      });
    }
  }

  function wipeFundsAll() {
    if (!confirmDanger("Tens a certeza que queres apagar TODOS os fundos parados?")) return;
    const data = getData();
    data.funds = [];
    setData(data);
    clearFundsForm();
  }

  // -----------------------
  // Render All (só usado no init)
  // -----------------------
  function renderAll() {
    renderSession();
    renderStocks();
    renderDividends();
    renderCrypto();
    renderP2P();
    renderFunds();
    renderPatrimonio();
    renderHistorico();
  }

  // -----------------------
  // Events
  // -----------------------
  function bindEvents() {
    $("btnExportAll")?.addEventListener("click", exportBackupAll);
    $("btnImportAll")?.addEventListener("click", importBackupAll);

    window.addEventListener("hashchange", () => {
      showSection(getActiveKey());
    });

    document.querySelectorAll("#menuList a").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const s = a.getAttribute("data-section");
        if (!s) return;
        history.replaceState(null, "", `#${s}`);
        showSection(s);
      });
    });

    $("btnExportJson")?.addEventListener("click", exportJSON);
    $("btnImportJson")?.addEventListener("click", importJSON);
    $("btnLoadDemo")?.addEventListener("click", loadDemo);
    $("btnWipeAll")?.addEventListener("click", wipeAllData);
    $("btnLogout")?.addEventListener("click", logout);

    $("btnSaveBancoPessoal")?.addEventListener("click", saveBancoPessoal);
    if ($("btnSaveFiGoalMonth")) $("btnSaveFiGoalMonth").addEventListener("click", saveFiGoalMonth);

    // Stocks
    $("stAdd")?.addEventListener("click", () => upsertStock({
      ticker: $("stTicker")?.value,
      sector: $("stSector")?.value, // ✅
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

    // 🔄 re-render quando dados mudam
    window.addEventListener("ras:data-updated", () => {
      showSection(getActiveKey());
    });
  }

  // -----------------------
  // Init (ÚNICO e limpo)
  // -----------------------
  function init() {
    if (window.__RAS_INIT_ONCE__) return;
    window.__RAS_INIT_ONCE__ = true;

    const s = requireSession();
    if (!s) return;

    if (!localStorage.getItem(STORAGE.data)) {
      setData(structuredClone(DEFAULT_DATA));
    }

    if (!localStorage.getItem(STORAGE.history)) {
      const hist = structuredClone(DEFAULT_HISTORY);
      hist.meta = hist.meta || {};
      hist.meta.lastUpdated = nowISO();
      localStorage.setItem(STORAGE.history, JSON.stringify(hist));
    }

    // API global (mantém simples e leve)
    window.RAS = window.RAS || {};
    window.RAS.refresh = () => {
      showSection(getActiveKey());
    };
    window.RAS.history = window.RAS.history || {};
    window.RAS.history.snapshot = historySnapshot;
    window.RAS.ledger = window.RAS.ledger || {};
    window.RAS.ledger.append = ledgerAppend;

    bindEvents();
    bindHistoryUI();

    renderAll();
    showSection(getActiveKey());
  }

  document.addEventListener("DOMContentLoaded", init);
})();