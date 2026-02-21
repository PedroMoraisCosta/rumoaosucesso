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
    amount: $("ldAmount"),
    note: $("ldNote"),
    btnCancel: $("btnLedgerCancel"),
    btnWipe: $("btnLedgerWipe"),
    tbody: $("ledgerTbody"),
    netMonth: $("ldNetMonth"),
    netYear: $("ldNetYear"),
    count: $("ldCount"),
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
    const amount = num(els.amount?.value);
    const note = (els.note?.value || "").trim();

    if (!date) return { ok: false, msg: "Falta a data." };
    if (!["in", "out"].includes(type)) return { ok: false, msg: "Tipo inválido." };
    if (!["banco", "acoes", "cripto", "p2p", "fundos"].includes(cls)) return { ok: false, msg: "Classe inválida." };
    if (amount <= 0) return { ok: false, msg: "Valor tem de ser > 0." };

    return { ok: true, data: { date, type, cls, amount, note } };
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
  }

  function setEdit(id) {
    const list = getList();
    const row = list.find(x => x.id === id);
    if (!row) return;

    editingId = id;
    if (els.date) els.date.value = row.date || "";
    if (els.type) els.type.value = row.type || "in";
    if (els.cls) els.cls.value = row.cls || "banco";
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

    if (els.netMonth) els.netMonth.textContent = euro(netM);
    if (els.netYear) els.netYear.textContent = euro(netY);
    if (els.count) els.count.textContent = String(list.length);

    // table
    if (!els.tbody) return;
    els.tbody.innerHTML = "";

    if (!list.length) {
      els.tbody.innerHTML = `<tr><td colspan="6" class="text-secondary small">Sem movimentos ainda.</td></tr>`;
      return;
    }

    for (const x of list) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(x.date)}</td>
        <td>${x.type === "out" ? "Saída" : "Entrada"}</td>
        <td>${esc(x.cls)}</td>
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

  document.addEventListener("DOMContentLoaded", () => {
    wire();
    clearForm();
    render();
  });
})();