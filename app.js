/* app.js — V1 local (robusto em file:/// no Firefox)
   Resolve o “pisca e volta ao login” criando sessão via query param.
*/

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEYS = {
    session: "ras_session_v1",
    localUser: "ras_local_user_v1",
    movements: "ras_movements_v1",
    sidebar: "ras_sidebar_state_v1",
  };

  function nowISO() {
    return new Date().toISOString();
  }

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function setSession(session) {
    try {
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    } catch {}
  }

  function getSession() {
    try {
      return safeParse(localStorage.getItem(STORAGE_KEYS.session), null);
    } catch {
      return null;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(STORAGE_KEYS.session);
    } catch {}
  }

  function getMovements() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.movements), []);
  }

  function setMovements(list) {
    localStorage.setItem(STORAGE_KEYS.movements, JSON.stringify(list));
  }

  function upsertLocalUser(email, password) {
    localStorage.setItem(
      STORAGE_KEYS.localUser,
      JSON.stringify({ email, password, createdAt: nowISO() })
    );
  }

  function getLocalUser() {
    return safeParse(localStorage.getItem(STORAGE_KEYS.localUser), null);
  }

  function formatEUR(n) {
    if (typeof n !== "number" || Number.isNaN(n)) return "—";
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n);
  }

  // -----------------------
  // INDEX (login)
  // -----------------------
  function initIndex() {
    const btnDemo = $("btnDemo");
    const btnLogin = $("btnLogin");
    const btnSignup = $("btnSignup");

    const emailEl = $("email");
    const passEl = $("password");

    const banner = $("bannerSession");
    const bannerText = $("bannerSessionText");
    const btnClearSession = $("btnClearSession");
    const sessionInfo = $("sessionInfo");
    const authForm = $("authForm");

    if (authForm) authForm.addEventListener("submit", (e) => e.preventDefault());

    function renderSessionInfo() {
      const s = getSession();
      const u = getLocalUser();
      const lines = [];

      if (s) {
        lines.push(`<strong>Estado:</strong> Autenticado`);
        lines.push(`<strong>Modo:</strong> ${s.mode}`);
        lines.push(`<strong>Conta:</strong> ${s.email}`);
        lines.push(
          `<strong>Início:</strong> ${new Date(s.startedAt).toLocaleString("pt-PT")}`
        );
      } else {
        lines.push(`<strong>Estado:</strong> Não autenticado`);
      }

      lines.push(`<strong>Utilizador local:</strong> ${u ? "Existe" : "Não existe"}`);
      if (u) lines.push(`${u.email}`);

      if (sessionInfo) sessionInfo.innerHTML = lines.join("<br/>");

      if (banner && bannerText) {
        if (s) {
          banner.classList.remove("d-none");
          banner.classList.add("d-flex");
          bannerText.textContent = `${s.mode} — ${s.email}`;
        } else {
          banner.classList.add("d-none");
          banner.classList.remove("d-flex");
        }
      }
    }

    renderSessionInfo();

    if (btnClearSession) {
      btnClearSession.addEventListener("click", () => {
        clearSession();
        location.reload();
      });
    }

    // ✅ DEMO: não depende do localStorage para “passar” de página
    if (btnDemo) {
      btnDemo.addEventListener("click", () => {
        // vai com parâmetro demo=1 (o dashboard cria sessão lá dentro)
        window.location.assign("./dashboard.html?demo=1");
      });
    }

    if (btnSignup) {
      btnSignup.addEventListener("click", () => {
        const email = (emailEl?.value || "").trim();
        const pass = passEl?.value || "";

        if (!email.includes("@")) return alert("Coloca um email válido.");
        if (pass.length < 8) return alert("Password tem de ter pelo menos 8 caracteres.");

        upsertLocalUser(email, pass);
        alert("Utilizador local criado ✅ (V1)");
        renderSessionInfo();
      });
    }

    if (btnLogin) {
      btnLogin.addEventListener("click", () => {
        const email = (emailEl?.value || "").trim();
        const pass = passEl?.value || "";
        const u = getLocalUser();

        if (!u) return alert("Ainda não existe utilizador local. Faz Inscrição ou usa Demo.");
        if (u.email !== email || u.password !== pass) return alert("Credenciais inválidas.");

        // vai com local=1 (o dashboard cria sessão lá dentro)
        const qs = new URLSearchParams({ local: "1", email });
        window.location.assign(`./dashboard.html?${qs.toString()}`);
      });
    }
  }

  // -----------------------
  // DASHBOARD
  // -----------------------
  function initDashboard() {
    // ✅ 1) Se vier por query param, cria sessão ANTES de validar
    const params = new URLSearchParams(window.location.search);

    if (params.get("demo") === "1") {
      setSession({
        mode: "demo",
        email: "demo@rumoaosucesso.local",
        startedAt: nowISO(),
      });
      // limpar query para não ficar “sujo”
      try {
        const url = new URL(window.location.href);
        url.search = "";
        history.replaceState({}, document.title, url.toString());
      } catch {}
    }

    if (params.get("local") === "1") {
      const email = (params.get("email") || "").trim() || "local@rumoaosucesso.local";
      setSession({
        mode: "local",
        email,
        startedAt: nowISO(),
      });
      try {
        const url = new URL(window.location.href);
        url.search = "";
        history.replaceState({}, document.title, url.toString());
      } catch {}
    }

    // ✅ 2) Agora valida sessão
    const session = getSession();
    if (!session) {
      window.location.assign("./index.html");
      return;
    }

    // UI refs (se existirem no teu dashboard)
    const badgeMode = $("badgeMode");
    const badgeUser = $("badgeUser");
    const btnLogout = $("btnLogout");

    const sidebar = $("sidebar");
    const btnSidebarToggle = $("btnSidebarToggle");
    const btnMobileMenu = $("btnMobileMenu");

    const btnOpenAdd = $("btnOpenAdd");
    const modal = $("modalAdd");
    const backdrop = $("modalBackdrop");
    const btnCloseAdd = $("btnCloseAdd");
    const btnCancelMove = $("btnCancelMove");
    const btnSaveMove = $("btnSaveMove");

    const fDate = $("fDate");
    const fType = $("fType");
    const fAmount = $("fAmount");
    const fCategory = $("fCategory");
    const fClass = $("fClass");
    const fDesc = $("fDesc");

    const mInvestido = $("mInvestido");
    const mSaldo = $("mSaldo");
    const kEntradas = $("kEntradas");
    const kSaidas = $("kSaidas");
    const kCount = $("kCount");
    const kUpdated = $("kUpdated");
    const tbody = $("movementsTbody");

    if (badgeMode) badgeMode.textContent = `Modo: ${session.mode}`;
    if (badgeUser) badgeUser.textContent = session.email;

    if (btnLogout) {
      btnLogout.addEventListener("click", () => {
        clearSession();
        window.location.assign("./index.html");
      });
    }

    // Sidebar collapse (opcional)
    const savedSidebar = localStorage.getItem(STORAGE_KEYS.sidebar);
    if (savedSidebar === "collapsed") sidebar?.classList.add("is-collapsed");

    function toggleSidebar() {
      if (!sidebar) return;
      sidebar.classList.toggle("is-collapsed");
      localStorage.setItem(
        STORAGE_KEYS.sidebar,
        sidebar.classList.contains("is-collapsed") ? "collapsed" : "expanded"
      );
    }

    btnSidebarToggle?.addEventListener("click", toggleSidebar);
    btnMobileMenu?.addEventListener("click", toggleSidebar);

    // Modal helpers
    function openModal() {
      if (!modal || !backdrop) return;
      backdrop.classList.remove("d-none");
      modal.classList.remove("d-none");

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");

      if (fDate) fDate.value = `${yyyy}-${mm}-${dd}`;
      if (fType) fType.value = "saida";
      if (fAmount) fAmount.value = "";
      if (fCategory) fCategory.value = "Dinheiro colocado";
      if (fClass) fClass.value = "Caixa";
      if (fDesc) fDesc.value = "";
      fAmount?.focus();
    }

    function closeModal() {
      backdrop?.classList.add("d-none");
      modal?.classList.add("d-none");
    }

    btnOpenAdd?.addEventListener("click", openModal);
    btnCloseAdd?.addEventListener("click", closeModal);
    btnCancelMove?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", closeModal);

    // Regra 2: totais
    function computeTotals(moves) {
      let entradas = 0;
      let saidas = 0;

      for (const m of moves) {
        const amt = Number(m.amount) || 0;
        if (m.type === "entrada") entradas += amt;
        if (m.type === "saida") saidas += amt;
      }

      return {
        entradas,
        saidas,
        saldo: entradas - saidas,
        investidoTotal: saidas,
      };
    }

    function renderTable(moves) {
      if (!tbody) return;
      tbody.innerHTML = "";

      if (!moves.length) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="7" class="text-secondary">Ainda não tens movimentos.</td>`;
        tbody.appendChild(tr);
        return;
      }

      for (const m of moves) {
        const tr = document.createElement("tr");
        const badge =
          m.type === "entrada"
            ? `<span class="badge text-bg-success">Entrada</span>`
            : `<span class="badge text-bg-danger">Saída</span>`;

        tr.innerHTML = `
          <td>${m.date || "—"}</td>
          <td>${badge}</td>
          <td>${m.category || "—"}</td>
          <td>${m.assetClass || "—"}</td>
          <td>${m.description || ""}</td>
          <td class="text-end fw-semibold">${formatEUR(Number(m.amount) || 0)}</td>
          <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-del="${m.id}">Apagar</button></td>
        `;
        tbody.appendChild(tr);
      }

      tbody.querySelectorAll("button[data-del]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-del");
          if (!confirm("Apagar este movimento?")) return;
          const list = getMovements().filter((x) => x.id !== id);
          setMovements(list);
          renderAll();
        });
      });
    }

    function renderAll() {
      const moves = getMovements()
        .slice()
        .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

      const totals = computeTotals(moves);

      if (mInvestido) mInvestido.textContent = formatEUR(totals.investidoTotal);
      if (mSaldo) mSaldo.textContent = formatEUR(totals.saldo);

      if (kEntradas) kEntradas.textContent = formatEUR(totals.entradas);
      if (kSaidas) kSaidas.textContent = formatEUR(totals.saidas);
      if (kCount) kCount.textContent = String(moves.length);

      const updatedAt = localStorage.getItem("ras_updated_at_v1");
      if (kUpdated)
        kUpdated.textContent = updatedAt
          ? new Date(updatedAt).toLocaleString("pt-PT")
          : "—";

      renderTable(moves);
    }

    btnSaveMove?.addEventListener("click", () => {
      const date = (fDate?.value || "").trim();
      const type = fType?.value || "saida";
      const amount = Number(String(fAmount?.value || "").replace(",", "."));

      if (!date) return alert("Escolhe uma data.");
      if (!Number.isFinite(amount) || amount <= 0) return alert("Montante inválido.");

      const movement = {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        date,
        type,
        category: fCategory?.value || "Outro",
        assetClass: fClass?.value || "Outra",
        description: (fDesc?.value || "").trim(),
        amount,
        createdAt: nowISO(),
      };

      const list = getMovements();
      list.push(movement);
      setMovements(list);
      localStorage.setItem("ras_updated_at_v1", nowISO());

      closeModal();
      renderAll();
    });

    renderAll();
  }

  // -----------------------
  // Boot
  // -----------------------
  document.addEventListener("DOMContentLoaded", () => {
    const path = (location.pathname || "").toLowerCase();

    if (path.endsWith("dashboard.html")) initDashboard();
    else initIndex();
  });
})();
