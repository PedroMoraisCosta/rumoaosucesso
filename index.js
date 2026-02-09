// index.js — login + demo/local (página inicial)
(function () {
  const $ = (id) => document.getElementById(id);

  const STORAGE = {
    session: "ras_session_v1"
  };

  function setSession(session) {
    localStorage.setItem(STORAGE.session, JSON.stringify(session));
  }

  function goDashboard(section = "patrimonio") {
    window.location.href = `./dashboard.html#${section}`;
  }

  function onDemo() {
    // sessão demo SEM criar conta real
    setSession({
      mode: "demo",
      email: "demo@rumoaosucesso.local",
      createdAt: new Date().toISOString()
    });

    // entra direto no dashboard
    goDashboard("patrimonio");
  }

  function onLogin() {
    const email = ($("email")?.value || "").trim();
    const pass = ($("password")?.value || "").trim();

    // validações mínimas
    if (!email || !email.includes("@")) {
      alert("Email inválido.");
      return;
    }
    if (pass.length < 8) {
      alert("Password tem de ter pelo menos 8 caracteres.");
      return;
    }

    // V1: não há backend, logo é “login local”
    setSession({
      mode: "local",
      email,
      createdAt: new Date().toISOString()
    });

    goDashboard("patrimonio");
  }

  function init() {
    // ids esperados no index.html:
    // btnDemo, btnLogin, (email, password)
    const btnDemo = $("btnDemo");
    const btnLogin = $("btnLogin");

    if (btnDemo) btnDemo.addEventListener("click", (e) => { e.preventDefault(); onDemo(); });
    if (btnLogin) btnLogin.addEventListener("click", (e) => { e.preventDefault(); onLogin(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
