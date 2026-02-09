// vendas.js — Vendas / Realizações (V1) — isolado do app.js
(function () {
  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);

  const STORAGE = {
    trades: "ras_vendas_v1",
    settings: "ras_vendas_settings_v1",
  };

  const DEFAULT_SETTINGS = {
    showTax: true,
    taxRate: 28, // %
    year: "all",
    classe: "all",
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function safeParse(json, fallback) {
    try {
      const v = JSON.parse(json);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }

  function loadTrades() {
    return safeParse(localStorage.getItem(STORAGE.trades), []);
  }

  function saveTrades(items) {
    localStorage.setItem(STORAGE.trades, JSON.stringify(items));
  }

  function loadSettings() {
    const s = safeParse(localStorage.getItem(STORAGE.settings), null);
    return { ...DEFAULT_SETTINGS, ...(s || {}) };
  }

  function saveSettings(s) {
    localStorage.setItem(STORAGE.settings, JSON.stringify(s));
  }

  function euro(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
  }

  function pct(n) {
    const v = Number(n || 0);
    return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function toNum(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    const s = String(v).replace(",", ".").trim();
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }

  function toDateISO(v) {
    // Espera yyyy-mm-dd (input type="date")
    if (!v) return "";
    return String(v).trim();
  }

  function yearOf(dateISO) {
    if (!dateISO || dateISO.length < 4) return "";
    return dateISO.slice(0, 4);
  }

  function makeId() {
    return "t_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
  }

  function computeRow(row) {
    const qty = toNum(row.qty);
    const avg = toNum(row.avgBuy);
    const sell = toNum(row.sellPrice);
    const fees = toNum(row.fees);

    const invested = qty * avg + fees;
    const received = qty * sell;
    const profit = received - invested;

    const profitPct = invested > 0 ? (profit / invested) * 100 : 0;

    return {
      ...row,
      qty,
      avgBuy: avg,
      sellPrice: sell,
      fees,
      invested,
      received,
      profit,
      profitPct,
    };
  }

  function computeTotals(rows) {
    const totals = rows.reduce(
      (acc, r) => {
        acc.invested += r.invested || 0;
        acc.received += r.received || 0;
        acc.profit += r.profit || 0;
        return acc;
      },
      { invested: 0, received: 0, profit: 0 }
    );

    totals.profitPct = totals.invested > 0 ? (totals.profit / totals.invested) * 100 : 0;
    return totals;
  }

  function applyFilters(allRows, settings) {
    return allRows.filter((r) => {
      const y = yearOf(r.date);
      const okYear = settings.year === "all" ? true : y === settings.year;
      const okClasse = settings.classe === "all" ? true : String(r.classe || "").toLowerCase() === settings.classe;
      return okYear && okClasse;
    });
  }

  function buildYears(allRows) {
    const years = Array.from(
      new Set(allRows.map((r) => yearOf(r.date)).filter(Boolean))
    ).sort((a, b) => Number(b) - Number(a));
    return years;
  }

  // --- Património Líquido: publicar lucro realizado (se existirem IDs no HTML)
  function publishRealizadoToPatrimonio(allRows) {
    const elTotal = $("pl_realizado_total");
    const elYtd = $("pl_realizado_ytd");
    if (!elTotal && !elYtd) return;

    const rows = allRows.map(computeRow);
    const totalProfit = rows.reduce((s, r) => s + (r.profit || 0), 0);

    const y = String(new Date().getFullYear());
    const ytdProfit = rows
      .filter((r) => yearOf(r.date) === y)
      .reduce((s, r) => s + (r.profit || 0), 0);

    if (elTotal) elTotal.textContent = euro(totalProfit);
    if (elYtd) elYtd.textContent = euro(ytdProfit);
  }

  // --- UI state (edição)
  let editingId = null;

  function resetForm() {
    editingId = null;
    const f = $("tradeForm");
    if (f) f.reset();

    const btnAdd = $("btnTradeAdd");
    const btnCancel = $("btnTradeCancel");
    if (btnAdd) btnAdd.textContent = "Adicionar";
    if (btnCancel) btnCancel.classList.add("d-none");

    // default date hoje
    const d = $("tradeDate");
    if (d) d.value = new Date().toISOString().slice(0, 10);
  }

  function fillForm(row) {
    $("tradeDate").value = row.date || "";
    $("tradeClasse").value = String(row.classe || "acoes").toLowerCase();
    $("tradeTicker").value = row.ticker || "";
    $("tradeQty").value = row.qty ?? "";
    $("tradeAvgBuy").value = row.avgBuy ?? "";
    $("tradeSellPrice").value = row.sellPrice ?? "";
    $("tradeFees").value = row.fees ?? "";
    $("tradeNotes").value = row.notes || "";

    const btnAdd = $("btnTradeAdd");
    const btnCancel = $("btnTradeCancel");
    if (btnAdd) btnAdd.textContent = "Guardar edição";
    if (btnCancel) btnCancel.classList.remove("d-none");
  }

  function validateForm() {
    const date = toDateISO($("tradeDate")?.value);
    const classe = String($("tradeClasse")?.value || "").trim();
    const ticker = String($("tradeTicker")?.value || "").trim().toUpperCase();
    const qty = toNum($("tradeQty")?.value);
    const avgBuy = toNum($("tradeAvgBuy")?.value);
    const sellPrice = toNum($("tradeSellPrice")?.value);
    const fees = toNum($("tradeFees")?.value);
    const notes = String($("tradeNotes")?.value || "").trim();

    if (!date) return { ok: false, msg: "Data é obrigatória." };
    if (!classe) return { ok: false, msg: "Classe é obrigatória." };
    if (!ticker) return { ok: false, msg: "Ticker/Moeda é obrigatório." };
    if (!(qty > 0)) return { ok: false, msg: "Quantidade vendida tem de ser > 0." };
    if (!(avgBuy > 0)) return { ok: false, msg: "Preço médio (compra) tem de ser > 0." };
    if (!(sellPrice > 0)) return { ok: false, msg: "Preço de venda tem de ser > 0." };
    if (fees < 0) return { ok: false, msg: "Comissões não podem ser negativas." };

    return {
      ok: true,
      data: {
        date,
        classe: classe.toLowerCase(),
        ticker,
        qty,
        avgBuy,
        sellPrice,
        fees,
        notes,
      },
    };
  }

  function render() {
    const all = loadTrades().map(computeRow);
    const settings = loadSettings();
    const filtered = applyFilters(all, settings);

    // dropdown anos
    const years = buildYears(all);
    const selYear = $("filterYear");
    if (selYear) {
      const cur = settings.year;
      selYear.innerHTML = `
        <option value="all">Todos</option>
        ${years.map((y) => `<option value="${y}">${y}</option>`).join("")}
      `;
      selYear.value = years.includes(cur) ? cur : "all";
    }

    // dropdown classe
    const selClasse = $("filterClasse");
    if (selClasse) {
      selClasse.value = settings.classe || "all";
    }

    // cards topo
    const totals = computeTotals(filtered);
    $("t_invested").textContent = euro(totals.invested);
    $("t_received").textContent = euro(totals.received);
    $("t_profit").textContent = euro(totals.profit);
    $("t_profit_pct").textContent = pct(totals.profitPct);

    // imposto estimado
    const showTax = !!settings.showTax;
    const taxRate = toNum(settings.taxRate);
    const taxBox = $("taxBox");
    const taxValue = $("t_tax");
    const chk = $("toggleTax");
    const inpRate = $("taxRate");

    if (chk) chk.checked = showTax;
    if (inpRate) inpRate.value = String(taxRate || 28);

    if (taxBox) taxBox.classList.toggle("d-none", !showTax);
    if (showTax && taxValue) {
      const taxable = Math.max(0, totals.profit);
      const tax = taxable * (taxRate / 100);
      taxValue.textContent = euro(tax);
    }

    // tabela
    const tbody = $("tradesTbody");
    if (tbody) {
      if (!filtered.length) {
        tbody.innerHTML = `
          <tr>
            <td colspan="12" class="text-secondary">Ainda não tens realizações registadas.</td>
          </tr>
        `;
      } else {
        tbody.innerHTML = filtered
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .map((r) => {
            const clsLabel =
              r.classe === "acoes" ? "Ações/ETF" :
              r.classe === "cripto" ? "Cripto" :
              r.classe === "outros" ? "Outros" : r.classe;

            return `
              <tr>
                <td>${r.date}</td>
                <td>${clsLabel}</td>
                <td><strong>${r.ticker}</strong></td>
                <td>${r.qty}</td>
                <td>${toNum(r.avgBuy).toLocaleString("pt-PT")}</td>
                <td>${toNum(r.sellPrice).toLocaleString("pt-PT")}</td>
                <td>${euro(r.invested)}</td>
                <td>${euro(r.received)}</td>
                <td class="${r.profit >= 0 ? "text-success" : "text-danger"}">${euro(r.profit)}</td>
                <td>${pct(r.profitPct)}</td>
                <td>${euro(r.fees)}</td>
                <td class="text-end">
                  <button class="btn btn-sm btn-outline-primary me-1" data-act="edit" data-id="${r.id}">Editar</button>
                  <button class="btn btn-sm btn-outline-danger" data-act="del" data-id="${r.id}">Apagar</button>
                </td>
              </tr>
            `;
          })
          .join("");
      }
    }

    // publicar no Património (se houver IDs)
    publishRealizadoToPatrimonio(all);
  }

  function onAddOrSave() {
    const v = validateForm();
    if (!v.ok) {
      alert(v.msg);
      return;
    }

    const all = loadTrades();
    if (editingId) {
      const idx = all.findIndex((x) => x.id === editingId);
      if (idx === -1) {
        alert("Edição: registo não encontrado.");
        resetForm();
        return;
      }
      all[idx] = { ...all[idx], ...v.data, updatedAt: nowISO() };
    } else {
      all.push({ id: makeId(), ...v.data, createdAt: nowISO() });
    }

    saveTrades(all);
    resetForm();
    render();
  }

  function onCancelEdit() {
    resetForm();
  }

  function onTableClick(e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;

    const act = btn.getAttribute("data-act");
    const id = btn.getAttribute("data-id");
    const all = loadTrades();

    const row = all.find((x) => x.id === id);
    if (!row) return;

    if (act === "edit") {
      editingId = id;
      fillForm(row);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (act === "del") {
      const ok = confirm(`Tens a certeza que queres apagar a realização de ${row.ticker} (${row.date})?`);
      if (!ok) return;
      const next = all.filter((x) => x.id !== id);
      saveTrades(next);
      render();
      return;
    }
  }

  function onClearAll() {
    const ok = confirm("Tens a certeza que queres apagar TODAS as vendas/realizações? Esta ação não dá para desfazer.");
    if (!ok) return;
    saveTrades([]);
    resetForm();
    render();
  }

  function onSettingsChange() {
    const s = loadSettings();
    s.year = $("filterYear")?.value || "all";
    s.classe = $("filterClasse")?.value || "all";
    s.showTax = !!$("toggleTax")?.checked;
    s.taxRate = toNum($("taxRate")?.value || 28);

    saveSettings(s);
    render();
  }

  function init() {
    // Só arranca se a secção existir (para não dar erros noutras páginas)
    if (!$("vendasSection")) return;

    // defaults
    if ($("tradeDate")) $("tradeDate").value = new Date().toISOString().slice(0, 10);

    // binds
    $("btnTradeAdd")?.addEventListener("click", (e) => { e.preventDefault(); onAddOrSave(); });
    $("btnTradeCancel")?.addEventListener("click", (e) => { e.preventDefault(); onCancelEdit(); });
    $("btnVendasClearAll")?.addEventListener("click", (e) => { e.preventDefault(); onClearAll(); });

    $("filterYear")?.addEventListener("change", onSettingsChange);
    $("filterClasse")?.addEventListener("change", onSettingsChange);
    $("toggleTax")?.addEventListener("change", onSettingsChange);
    $("taxRate")?.addEventListener("input", onSettingsChange);

    $("tradesTbody")?.addEventListener("click", onTableClick);

    // render inicial
    resetForm();
    render();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
