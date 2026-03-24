// ledger.js — Movimentos (ras_ledger_v1)
(function () {
  const KEY = "ras_ledger_v1";
  const $ = (id) => document.getElementById(id);

  const section = $("sec-movimentos");
  if (!section) return;

  const els = {
    form: $("ledgerForm"),
    date: $("ldDate"),
    type: $("ldType"),
    cls: $("ldClass"),
    category: $("ldCategory"),
    amount: $("ldAmount"),
    note: $("ldNote"),
    btnCancel: $("btnLedgerCancel"),
    btnWipe: $("btnLedgerWipe"),
    tbody: $("ledgerTbody"),
    netMonth: $("ldNetMonth"),
    netYear: $("ldNetYear"),
    count: $("ldCount"),
    divMonth: $("ldDivMonth"),
    p2pMonth: $("ldP2PMonth"),
    fundMonth: $("ldFundMonth"),
    passiveMonth: $("ldPassiveMonth"),
  };

  let editingId = null;

  function nowISO() { return new Date().toISOString(); }
  function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
  function euro(n) { return num(n).toLocaleString("pt-PT", { style: "currency", currency: "EUR" }); }
  function esc(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function uid() { return "l_" + Math.random().toString(16).slice(2) + Date.now().toString(16); }

   function categoryLabel(v) {
  const map = {
    deposit: "Depósito / reforço",

    stock_dividend: "Dividendo ações",
    stock_sale: "Venda ações",
    stock_buy: "Compra ações",

    crypto_sale: "Venda cripto",
    crypto_buy: "Compra cripto",

    p2p_interest: "Juros P2P",
    p2p_buy: "Reforço P2P",

    fund_interest: "Juros fundos",

    transfer_in: "Transferência recebida",
    transfer_out: "Transferência enviada",

    withdraw: "Levantamento",

    other_in: "Outro (entrada)",
    other_out: "Outro (saída)"
  };
  return map[v] || "—";
}

    function getCategoryOptions(type, cls) {
    const isIn = type === "in";
    const isOut = type === "out";

    const commonIn = [
      { value: "transfer_in", label: "Transferência recebida" },
      { value: "other_in", label: "Outro (entrada)" }
    ];

    const commonOut = [
      { value: "transfer_out", label: "Transferência enviada" },
      { value: "withdraw", label: "Levantamento" },
      { value: "other_out", label: "Outro (saída)" }
    ];

    if (isIn && cls === "acoes") {
      return [
        { value: "stock_dividend", label: "Dividendo ações" },
        { value: "stock_sale", label: "Venda ações" },
        ...commonIn
      ];
    }

    if (isIn && cls === "cripto") {
      return [
        { value: "crypto_sale", label: "Venda cripto" },
        ...commonIn
      ];
    }

    if (isIn && cls === "p2p") {
      return [
        { value: "p2p_interest", label: "Juros P2P" },
        ...commonIn
      ];
    }

    if (isIn && cls === "fundos") {
      return [
        { value: "fund_interest", label: "Juros fundos" },
        { value: "deposit", label: "Depósito / reforço" },
        ...commonIn
      ];
    }

    if (isIn && cls === "banco") {
      return [
        { value: "deposit", label: "Depósito / reforço" },
        ...commonIn
      ];
    }

    if (isOut && cls === "acoes") {
      return [
        { value: "stock_buy", label: "Compra ações" },
        ...commonOut
      ];
    }

    if (isOut && cls === "cripto") {
      return [
        { value: "crypto_buy", label: "Compra cripto" },
        ...commonOut
      ];
    }

    if (isOut && cls === "p2p") {
      return [
        { value: "p2p_buy", label: "Reforço P2P" },
        ...commonOut
      ];
    }

    if (isOut && cls === "fundos") {
      return [
        ...commonOut
      ];
    }

    if (isOut && cls === "banco") {
      return [
        ...commonOut
      ];
    }

    return isIn ? commonIn : commonOut;
  }

    function syncCategoryOptions(preferredValue = "") {
    if (!els.category || !els.type || !els.cls) return;

    const options = getCategoryOptions(els.type.value, els.cls.value);
    const currentValue = preferredValue || els.category.value;

    els.category.innerHTML = options
      .map((opt) => `<option value="${opt.value}">${esc(opt.label)}</option>`)
      .join("");

    const exists = options.some((opt) => opt.value === currentValue);
    els.category.value = exists ? currentValue : (options[0]?.value || "");
  }

  function getList() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function setList(arr) {
    localStorage.setItem(KEY, JSON.stringify(arr));
    window.dispatchEvent(new Event("ras:data-updated"));
  }

  function monthKey(dateStr) { return String(dateStr || "").slice(0, 7); }
  function yearKey(dateStr) { return String(dateStr || "").slice(0, 4); }

  function calcNet(list, predicate) {
    let net = 0;
    for (const x of list) {
      if (!predicate(x)) continue;
      const sign = x.type === "out" ? -1 : 1;
      net += sign * num(x.amount);
    }
    return net;
  }

  function validate() {
        const date = (els.date?.value || "").trim();
    const type = (els.type?.value || "").trim(); // in|out
    const cls = (els.cls?.value || "").trim();   // banco|acoes|cripto|p2p|fundos
    const category = (els.category?.value || "").trim();
    const amount = num(els.amount?.value);
    const note = (els.note?.value || "").trim();

      if (!date) return { ok: false, msg: "Falta a data." };
    if (!["in", "out"].includes(type)) return { ok: false, msg: "Tipo inválido." };
    if (!["banco", "acoes", "cripto", "p2p", "fundos"].includes(cls)) return { ok: false, msg: "Classe inválida." };
if (![
  "deposit",

  "stock_dividend",
  "stock_sale",
  "stock_buy",

  "crypto_sale",
  "crypto_buy",

  "p2p_interest",
  "p2p_buy",

  "fund_interest",

  "transfer_in",
  "transfer_out",

  "withdraw",

  "other_in",
  "other_out"
].includes(category)) {
  return { ok: false, msg: "Origem / Evento inválido." };
}
    if (amount <= 0) return { ok: false, msg: "Valor tem de ser > 0." };

    return { ok: true, data: { date, type, cls, category, amount, note } };
  }

  function clearForm() {
    editingId = null;
    if (els.form) els.form.reset();
    if (els.btnCancel) els.btnCancel.classList.add("d-none");

    // default date = hoje
    if (els.date && !els.date.value) {
      const d = new Date();
      els.date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
         if (els.type) els.type.value = "in";
    if (els.cls) els.cls.value = "banco";
    syncCategoryOptions("deposit");
  }

  function setEdit(id) {
    const list = getList();
    const row = list.find(x => x.id === id);
    if (!row) return;

    editingId = id;
        if (els.date) els.date.value = row.date || "";
    if (els.type) els.type.value = row.type || "in";
    if (els.cls) els.cls.value = row.cls || "banco";
    syncCategoryOptions(row.category || "deposit");
    if (els.amount) els.amount.value = row.amount ?? "";
    if (els.note) els.note.value = row.note || "";

    if (els.btnCancel) els.btnCancel.classList.remove("d-none");
  }

  function upsert() {
    const v = validate();
    if (!v.ok) return alert(v.msg);

    const list = getList();

    if (editingId) {
      const idx = list.findIndex(x => x.id === editingId);
      if (idx >= 0) list[idx] = { ...list[idx], ...v.data };
    } else {
      list.push({ id: uid(), createdAt: nowISO(), ...v.data });
    }

    // ordenar desc por data
    list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    setList(list);
    clearForm();
    render();
  }

  function remove(id) {
    if (!confirm("Apagar este movimento?")) return;
    const list = getList().filter(x => x.id !== id);
    setList(list);
    render();
  }

  function wipeAll() {
    if (!confirm("Tens a certeza que queres apagar TODOS os movimentos?")) return;
    setList([]);
    clearForm();
    render();
  }

  function render() {
    const list = getList();

    // KPIs
    const today = new Date();
    const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const yy = String(today.getFullYear());

    const netM = calcNet(list, (x) => monthKey(x.date) === ym);
    const netY = calcNet(list, (x) => yearKey(x.date) === yy);
        let divMonth = 0;
    let p2pMonth = 0;
    let fundMonth = 0;

    for (const x of list) {
      if (monthKey(x.date) !== ym) continue;

      if (x.category === "stock_dividend") {
        divMonth += num(x.amount);
      }

      if (x.category === "p2p_interest") {
        p2pMonth += num(x.amount);
      }

      if (x.category === "fund_interest") {
        fundMonth += num(x.amount);
      }
    }

    const passiveMonth = divMonth + p2pMonth + fundMonth;

    if (els.netMonth) els.netMonth.textContent = euro(netM);
    if (els.netYear) els.netYear.textContent = euro(netY);
    if (els.count) els.count.textContent = String(list.length);
    if (els.divMonth) els.divMonth.textContent = euro(divMonth);
    if (els.p2pMonth) els.p2pMonth.textContent = euro(p2pMonth);
    if (els.fundMonth) els.fundMonth.textContent = euro(fundMonth);
    if (els.passiveMonth) els.passiveMonth.textContent = euro(passiveMonth);

    // table
    if (!els.tbody) return;
    els.tbody.innerHTML = "";

        if (!list.length) {
      els.tbody.innerHTML = `<tr><td colspan="7" class="text-secondary small">Sem movimentos ainda.</td></tr>`;
      return;
    }

    for (const x of list) {
      const tr = document.createElement("tr");
            tr.innerHTML = `
        <td>${esc(x.date)}</td>
        <td>${x.type === "out" ? "Saída" : "Entrada"}</td>
        <td>${esc(x.cls)}</td>
        <td>${esc(categoryLabel(x.category))}</td>
        <td class="text-end">${euro(x.amount)}</td>
        <td>${esc(x.note || "")}</td>
        <td class="text-end">
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary" data-act="edit" data-id="${x.id}">Editar</button>
            <button class="btn btn-outline-danger" data-act="del" data-id="${x.id}">Apagar</button>
          </div>
        </td>
      `;
      els.tbody.appendChild(tr);
    }
  }

  function wire() {
    if (els.form && !els.form.__wired) {
      els.form.__wired = true;
      els.form.addEventListener("submit", (e) => { e.preventDefault(); upsert(); });
    }
        if (els.type && !els.type.__wiredCategory) {
      els.type.__wiredCategory = true;
      els.type.addEventListener("change", () => syncCategoryOptions());
    }

    if (els.cls && !els.cls.__wiredCategory) {
      els.cls.__wiredCategory = true;
      els.cls.addEventListener("change", () => syncCategoryOptions());
    }
    if (els.btnCancel) els.btnCancel.addEventListener("click", clearForm);
    if (els.btnWipe) els.btnWipe.addEventListener("click", wipeAll);

    if (els.tbody && !els.tbody.__wired) {
      els.tbody.__wired = true;
      els.tbody.addEventListener("click", (e) => {
        const btn = e.target.closest("button[data-act]");
        if (!btn) return;
        const act = btn.getAttribute("data-act");
        const id = btn.getAttribute("data-id");
        if (!id) return;
        if (act === "edit") setEdit(id);
        if (act === "del") remove(id);
      });
    }
  }

  // API para gráficos
  window.LEDGER = window.LEDGER || {};
  window.LEDGER.getAll = getList;
  window.LEDGER.render = render;
  window.LEDGER.getPassiveIncomeMonth = function () {
  const list = getList();
  const today = new Date();
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  let total = 0;

  for (const x of list) {
    if (monthKey(x.date) !== ym) continue;

    if (
      x.category === "stock_dividend" ||
      x.category === "p2p_interest" ||
      x.category === "fund_interest"
    ) {
      total += num(x.amount);
    }
  }

  return total;
};

  document.addEventListener("DOMContentLoaded", () => {
    wire();
    clearForm();
    render();
  });
})();