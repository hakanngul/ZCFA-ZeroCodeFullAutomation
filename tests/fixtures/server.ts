import Fastify from "fastify";
const app = Fastify();
const style =
  "<style>body{font:16px system-ui;background:#f1f5f9;color:#18212e;padding:80px}main{max-width:420px;margin:auto;background:white;border:1px solid #ddd;border-radius:16px;padding:36px}label{display:block;margin-top:20px}input,button{box-sizing:border-box;width:100%;padding:12px;margin-top:8px;border-radius:6px;border:1px solid #cbd5e1}button{background:#196554;color:white}h1{font-size:26px}</style>";
app.get("/health", async () => ({ status: "ok", service: "demo-fixture" }));
app.get("/login", async (req, reply) => {
  const variant = (req.query as { variant?: string }).variant ?? "healthy";
  const duplicate =
    variant === "ambiguous"
      ? '<button data-testid="login-submit" type="button">Giriş yap</button>'
      : "";
  return reply
    .type("text/html")
    .send(
      `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Demo Bank · Giriş</title>${style}<main><small>YEREL TEST UYGULAMASI</small><h1>Demo Bank</h1><p>Bu uygulama otomasyon doğrulaması içindir.</p><form><label for="email">E-posta</label><input id="email" type="email" aria-label="E-posta" data-testid="login-email" data-semantic="login.username" required><label for="password">Parola</label><input id="password" type="password" aria-label="Parola" data-testid="login-password" data-semantic="login.password" required><button data-testid="login-submit" data-semantic="login.submit" aria-label="Giriş yap">Giriş yap</button>${duplicate}</form><p id="error" role="alert"></p></main><script>document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(document.querySelector('#email').value==='qa@example.test'&&document.querySelector('#password').value==='local-fixture-only'){sessionStorage.setItem('fixture-auth','yes');location.href='/dashboard'+location.search}else{document.querySelector('#error').textContent='Demo bilgileri hatalı'}})</script></html>`,
    );
});
app.get("/dashboard", async (req, reply) => {
  const variant = (req.query as { variant?: string }).variant ?? "healthy";
  if (variant === "slow")
    await new Promise((resolve) => setTimeout(resolve, 8000));
  return reply.type("text/html").send(dashboard(variant, false));
});
app.get("/dashboard-preview", async (_, reply) =>
  reply.type("text/html").send(dashboard("healthy", true)),
);
function dashboard(variant: string, preview: boolean) {
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Demo Bank · Dashboard</title>${style}<main><small>${preview ? "KEŞİF İÇİN ÖĞRETİM SAYFASI" : "DEMO BANK"}</small><h1 data-testid="dashboard-heading" data-semantic="dashboard.heading" aria-label="Dashboard" ${variant === "broken" ? "hidden" : ""}>Dashboard</h1><p>Kullanılabilir bakiye</p><strong data-testid="dashboard-balance" data-semantic="dashboard.balance" aria-label="Bakiye">${variant === "broken" ? "0,00 TL" : "1.250,00 TL"}</strong><p>Gerçek hesap veya para içermez.</p></main>${preview ? "" : "<script>if(sessionStorage.getItem('fixture-auth')!=='yes')location.href='/login'</script>"}</html>`;
}
await app.listen({ host: "127.0.0.1", port: 4100 });
console.log("demo-fixture ready");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close();
  });
