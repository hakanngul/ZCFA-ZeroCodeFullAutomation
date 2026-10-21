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
      `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Demo Bank · Giriş</title>${style}<main><img alt="Demo Bank logosu" width="24" height="24" src="data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2724%27%20height=%2724%27%3E%3Crect%20width=%2724%27%20height=%2724%27%20rx=%276%27%20fill=%27%23196554%27/%3E%3C/svg%3E"><small>YEREL TEST UYGULAMASI</small><h1>Demo Bank</h1><p>Bu uygulama otomasyon doğrulaması içindir.</p><form><label for="email">E-posta</label><input id="email" name="email" placeholder="E-posta adresin" type="email" aria-label="E-posta" data-testid="login-email" data-semantic="login.username" required><label for="password">Parola</label><input id="password" name="password" placeholder="Demo parolan" type="password" aria-label="Parola" data-testid="login-password" data-semantic="login.password" required><button title="Demo hesabıyla giriş yap" data-testid="login-submit" data-semantic="login.submit" aria-label="Giriş yap">Giriş yap</button>${duplicate}</form><p id="error" role="alert"></p></main><script>document.querySelector('form').addEventListener('submit',e=>{e.preventDefault();if(document.querySelector('#email').value==='qa@example.test'&&document.querySelector('#password').value==='local-fixture-only'){sessionStorage.setItem('fixture-auth','yes');location.href='/dashboard'+location.search}else{document.querySelector('#error').textContent='Demo bilgileri hatalı'}})</script></html>`,
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
// Page-quality fixtures (console, links, accessibility); Demo Bank is unchanged.
const qualityPage = (title: string, body: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>${title}</title><main><h1>${title}</h1>${body}</main></html>`;
const qualityPages: Record<string, string> = {
  clean: qualityPage(
    "Quality clean",
    '<a href="/quality/clean#top">Self</a> <a href="/health">Health</a> <a href="https://example.com/">External</a><label for="q">Search</label><input id="q">',
  ),
  console: qualityPage(
    "Quality console",
    "<p>Console</p><script>console.error('fixture console failure');setTimeout(()=>{throw new Error('fixture uncaught')},0)</script>",
  ),
  links: qualityPage(
    "Quality links",
    '<a href="/quality/clean">Clean</a> <a href="/quality/missing?token=abc">Missing</a>',
  ),
  a11y: qualityPage(
    "Quality a11y",
    '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><input type="text">',
  ),
};
app.get("/quality/:page", async (req, reply) => {
  const html = qualityPages[(req.params as { page: string }).page];
  return html
    ? reply.type("text/html").send(html)
    : reply.code(404).send("not found");
});
function dashboard(variant: string, preview: boolean) {
  return `<!doctype html><html lang="tr"><meta charset="utf-8"><title>Demo Bank · Dashboard</title>${style}<main><small>${preview ? "KEŞİF İÇİN ÖĞRETİM SAYFASI" : "DEMO BANK"}</small><h1 data-testid="dashboard-heading" data-semantic="dashboard.heading" aria-label="Dashboard" ${variant === "broken" ? "hidden" : ""}>Dashboard</h1><p>Kullanılabilir bakiye</p><strong data-testid="dashboard-balance" data-semantic="dashboard.balance" aria-label="Bakiye">${variant === "broken" ? "0,00 TL" : "1.250,00 TL"}</strong><p>Gerçek hesap veya para içermez.</p></main>${preview ? "" : "<script>if(sessionStorage.getItem('fixture-auth')!=='yes')location.href='/login'</script>"}</html>`;
}
await app.listen({ host: "127.0.0.1", port: 4100 });
console.log("demo-fixture ready");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close();
  });
