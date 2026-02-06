/* app.js — V1 local (robusto em file:/// no Firefox)
   + Export/Import JSON (dados privados)
   + Limpar dados
   + Demo via ficheiro ./data/demo.json (GitHub Pages) com fallback interno (file:///)
   + REGRA B: Investido Total = apenas saídas de "Dinheiro colocado" + "Compra/Reforço"
*/

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STORAGE_KEYS = {
    session: "ras_session_v1",
    localUser: "ras_local_user_v1",
    movements: "ras_movements_v1",
    sidebar: "ras_sidebar_state_v1",
    updatedAt: "ras_updated_at_v1",
  };

  const INVEST_CATEGORIES = new Set(["Dinheiro colocado", "Compra/Reforço"]);

  // Caminho do ficheiro demo no repo/Pages
  const DEMO_URL = "./data/demo.json";

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
  // BACKUP JSON (dados privados)
  // -----------------------
  function buildExportPayload() {
    return {
      schema: "RAS_EXPORT_V1",
      exportedAt: nowISO(),
      movements: getMovements(),
      updatedAt: localStorage.getItem(STORAGE_KEYS.updatedAt) || null,
    };
  }

  function downloadJSON(filename, obj) {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const d = new Date();
    const stamp = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
      "_",
      String(d.getHours()).padStart(2, "0"),
      String(d.getMinutes()).padStart(2, "0"),
    ].join("");

    downloadJSON(`rumo-ao-sucesso_backup_${stamp}.json`, buildExportPayload());
  }

  function validateImportPayload(obj) {
    return !!(
      obj &&
      typeof obj === "object" &&
      obj.schema === "RAS_EXPORT_V1" &&
      Array.isArray(obj.movements)
    );
  }

  function applyImportPayload(obj) {
    setMovements(obj.movements);
    localStorage.setItem(STORAGE_KEYS.updatedAt, obj.updatedAt || nowISO());
  }

  // -----------------------
  // DEMO (fallback interno)
  // -----------------------
  function demoFallbackPayload() {
    // payload no mesmo formato do export/import
    const today = new Date();
    const fmt = (daysAgo) => {
      const x = new Date(today);
      x.setDate(x.getDate() - daysAgo);
      const yyyy = x.getFullYear();
      const mm = String(x.getMonth() + 1).padStart(2, "0");
      const dd = String(x.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    };

    const uuid = (n) => `demo-fallback-${String(n).padStart(3, "0")}`;

    return {
      schema: "RAS_EXPORT_V1",
      exportedAt: nowISO(),
      updatedAt: nowISO(),
      movements: [
        {
          id: uuid(1),
          date: fmt(30),
          type: "saida",
          category: "Dinheiro colocado",
          assetClass: "Caixa",
          description: "Reforço inicial (fallback)",
          amount: 500,
          createdAt: nowISO(),
        },
        {
          id: uuid(2),
          date: fmt(25),
          type: "saida",
          category: "Compra/Reforço",
          assetClass: "Ações",
          description: "Compra Microsoft (fallback)",
          amount: 200,
          createdAt: nowISO(),
        },
        {
          id: uuid(3),
          date: fmt(22),
          type: "saida",
          category: "Compra/Reforço",
          assetClass: "Cripto",
          description: "Compra BTC (fallback)",
          amount: 150,
          createdAt: nowISO(),
        },
        {
          id: uuid(4),
          date: fmt(15),
          type: "entrada",
          category: "Dividendos",
          assetClass: "Ações",
          description: "Dividendos (fallback)",
          amount: 7.5,
          createdAt: nowISO(),
        },
        {
          id: uuid(5),
          date: fmt(10),
          type: "entrada",
          category: "Juros",
          assetClass: "P2P",
          description: "Juros P2P (fallback)",
          amount: 4.2,
          createdAt: nowISO(),
        },
        {
          id: uuid(6),
          date: fmt(5),
          type: "saida",
          category: "Comissões",
          assetClass: "Ações",
          description: "Comissão corretora (fallback)",
          amount: 1.0,
          createdAt: nowISO(),
        },
      ],
    };
  }

  async function fetchDemoPayload() {
    // tenta buscar o demo.json (funciona em GitHub Pages)
    // em file:/// pode falhar -> lançamos erro e fazemos fallback
    const res = await fetch(DEMO_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("DEMO_FETCH_NOT_OK");
    const obj = await res.json();
    if (!validateImportPayload(obj)) throw new Error("DEMO_SCHEMA_INVALID");
    return obj;
  }

  // -----------------------
  // INDEX
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
        lines.push(`<strong>Início:</strong> ${new Date(s.startedAt).toLocaleString("pt-PT")}`);
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

    btnClearSession?.addEventListener("click", () => {
      clearSession();
      location.reload();
    });

    // Demo robusto: entra no dashboard por query param
    btnDemo?.addEventListener("click", () => {
      window.location.assign("./dashboard.html?demo=1");
    });

    btnSignup?.addEventListener("click", () => {
      const email = (emailEl?.value || "").trim();
      const pass = passEl?.value || "";

      if (!email.includes("@")) return alert("Coloca um email válido.");
      if (pass.length < 8) return alert("Password tem de ter pelo menos 8 caracteres.");

      upsertLocalUser(email, pass);
      alert("Utilizador local criado ✅ (V1)");
      renderSessionInfo();
    });

    btnLogin?.addEventListener("click", () => {
      const email = (emailEl?.value || "").trim();
      const pass = passEl?.value || "";
      const u = getLocalUser();

      if (!u) return alert("Ainda não existe utilizador local. Faz Inscrição ou usa Demo.");
      if (u.email !== email || u.password !== pass) return alert("Credenciais inválidas.");

      const qs = new URLSearchParams({ local: "1", email });
      window.location.assign(`./dashboard.html?${qs.toString()}`);
    });
  }

  // -----------------------
  // DASHBOARD
  // -----------------------
  function initDashboard() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("demo") === "1") {
      setSession({ mode: "demo", email: "demo@rumoaosucesso.local", startedAt: nowISO() });
      try {
        const url = new URL(window.location.href);
        url.search = "";
        history.replaceState({}, document.title, url.toString());
      } catch {}
    }

    if (params.get("local") === "1") {
      const email = (params.get("email") || "").trim() || "local@rumoaosucesso.local";
      setSession({ mode: "local", email, startedAt: nowISO() });
      try {
        const url = new URL(window.location.href);
        url.search = "";
        history.replaceState({}, document.title, url.toString());
      } catch {}
    }

    const session = getSession();
    if (!session) {
      window.location.assign("./index.html");
      return;
    }

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

    const btnExportJSON = $("btnExportJSON");
    const btnImportJSON = $("btnImportJSON");
    const btnClearData = $("btnClearData");
    const btnLoadDemo = $("btnLoadDemo");
    const fileImport = $("fileImport");

    if (badgeMode) badgeMode.textContent = `Modo: ${session.mode}`;
    if (badgeUser) badgeUser.textContent = session.email;

    btnLogout?.addEventListener("click", () => {
      clearSession();
      window.location.assign("./index.html");
    });

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

    // (secções ligamos a seguir; por agora mantém simples)
    document.querySelectorAll(".ras-nav__item").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".ras-nav__item").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });

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

    // ✅ REGRA B: investidoTotal só com categorias de investimento
    function computeTotals(moves) {
      let entradas = 0;
      let saidas = 0;
      let investidoTotal = 0;

      for (const m of moves) {
        const amt = Number(m.amount) || 0;

        if (m.type === "entrada") entradas += amt;

        if (m.type === "saida") {
          saidas += amt;
          if (INVEST_CATEGORIES.has(m.category)) investidoTotal += amt;
        }
      }

      return {
        entradas,
        saidas,
        saldo: entradas - saidas,
        investidoTotal,
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
          localStorage.setItem(STORAGE_KEYS.updatedAt, nowISO());
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

      const updatedAt = localStorage.getItem(STORAGE_KEYS.updatedAt);
      if (kUpdated) {
        kUpdated.textContent = updatedAt ? new Date(updatedAt).toLocaleString("pt-PT") : "—";
      }

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
      localStorage.setItem(STORAGE_KEYS.updatedAt, nowISO());

      closeModal();
      renderAll();
    });

    // Export JSON (backup privado)
    btnExportJSON?.addEventListener("click", () => {
      if (!confirm("Exportar backup JSON dos teus movimentos?")) return;
      exportJSON();
    });

    // Import JSON (restore/migração)
    btnImportJSON?.addEventListener("click", () => fileImport?.click());

    fileImport?.addEventListener("change", async () => {
      const file = fileImport.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const obj = JSON.parse(text);

        if (!validateImportPayload(obj)) {
          alert("Ficheiro inválido. (schema não reconhecido)");
          fileImport.value = "";
          return;
        }

        const ok = confirm("Importar vai substituir os movimentos atuais. Continuar?");
        if (!ok) {
          fileImport.value = "";
          return;
        }

        applyImportPayload(obj);
        alert("Importação concluída ✅");
        fileImport.value = "";
        renderAll();
      } catch {
        alert("Erro a importar. Confirma se é um JSON válido.");
        fileImport.value = "";
      }
    });

    // Limpar dados
    btnClearData?.addEventListener("click", () => {
      const ok = confirm("Isto vai apagar TODOS os movimentos (dados). Tens backup? Continuar?");
      if (!ok) return;

      localStorage.removeItem(STORAGE_KEYS.movements);
      localStorage.removeItem(STORAGE_KEYS.updatedAt);
      alert("Dados apagados. (código mantém-se)");
      renderAll();
    });

    // Carregar Demo: tenta demo.json (Pages), se falhar usa fallback
    btnLoadDemo?.addEventListener("click", async () => {
      const ok = confirm("Carregar demo vai substituir os teus movimentos atuais. Continuar?");
      if (!ok) return;

      try {
        const payload = await fetchDemoPayload();
        applyImportPayload(payload);
        alert("Demo carregada via demo.json ✅");
      } catch {
        // fallback para file:///
        applyImportPayload(demoFallbackPayload());
        alert("Demo carregada (fallback local) ✅");
      }

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
