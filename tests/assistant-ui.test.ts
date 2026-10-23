import { test } from "node:test";
import { detachedTestProcess, stopTestProcess } from "./process-tree";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Fastify from "fastify";
import { chromium } from "playwright";

test(
  "AI Chat UI configures provider, inspects DOM, saves and executes suite",
  { timeout: 90000 },
  async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "zc-ai-ui-")),
      evidence = resolve("test-results/assistant");
    await mkdir(evidence, { recursive: true });
    const provider = Fastify(),
      processes: ChildProcess[] = [];
    provider.get("/v1/models", async () => ({ data: [{ id: "ui-model" }] }));
    provider.post("/v1/chat/completions", async (request) => {
      const body = request.body as { messages: { content: string }[] };
      if (body.messages[0]?.content === "Reply OK")
        return { choices: [{ message: { content: "OK" } }] };
      if (body.messages[0]?.content.startsWith("You explore"))
        return { choices: [{ message: { content: '{"done":true}' } }] };
      if (body.messages[0]?.content.startsWith("You analyze"))
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary:
                    "Giriş sayfası incelendi; form doğrulaması test edilebilir.",
                  items: [
                    {
                      title: "Yanlış bilgiler uyarı verir",
                      category: "negative",
                      area: "Giriş",
                      description:
                        "Yanlış e-posta ve parola ile giriş denenir; hata mesajı görünür.",
                      preconditions: ["Giriş sayfası açık"],
                      steps: [
                        "Yanlış e-posta gir",
                        "Yanlış parola gir",
                        "Giriş yap",
                      ],
                      expectedResults: ["Hata mesajı görünür"],
                      pages: ["http://127.0.0.1:4100/login"],
                      testData: ["Yanlış e-posta", "Yanlış parola"],
                      feasible: true,
                    },
                    {
                      title: "Geçerli giriş dashboard'u açar",
                      category: "positive",
                      area: "Giriş",
                      description: "Geçerli bilgilerle giriş yapılır.",
                      pages: ["http://127.0.0.1:4100/login"],
                      testData: ["Geçerli kullanıcı"],
                      feasible: false,
                      note: "Geçerli kullanıcı bilgisi verilmedi.",
                    },
                  ],
                }),
              },
            },
          ],
        };
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: "Giriş doğrulama suite",
                targetUrl: "http://127.0.0.1:4100/login",
                scenarios: [
                  {
                    title: "Yanlış bilgiler uyarı verir",
                    category: "negative",
                    actions: [
                      {
                        kind: "fill",
                        locator: { kind: "testId", value: "login-email" },
                        value: "wrong@example.test",
                      },
                      {
                        kind: "fill",
                        locator: { kind: "testId", value: "login-password" },
                        value: "wrong",
                      },
                      {
                        kind: "click",
                        locator: { kind: "testId", value: "login-submit" },
                      },
                      {
                        kind: "assertText",
                        locator: { kind: "id", value: "error" },
                        expected: "Demo bilgileri hatalı",
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      };
    });
    await provider.listen({ host: "127.0.0.1", port: 4250 });
    for (const port of [3000, 4000, 4100])
      assert.equal(
        await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(300),
        }).then(
          () => true,
          () => false,
        ),
        false,
        `Port ${port} dolu`,
      );
    function start(script: string) {
      const child = spawn(
        process.execPath,
        script === "web"
          ? [
              "node_modules/next/dist/bin/next",
              "start",
              "apps/web",
              "--hostname",
              "127.0.0.1",
              "--port",
              "3000",
            ]
          : ["--import", "tsx", script],
        {
          detached: detachedTestProcess,
          stdio: "ignore",
          env: {
            ...process.env,
            ZC_DATA_DIR: dataDir,
            ZC_AI_ALLOW_LOCAL_PROVIDER: "1",
            NEXT_TELEMETRY_DISABLED: "1",
          },
        },
      );
      processes.push(child);
    }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
      start("apps/api/src/main.ts");
      start("tests/fixtures/server.ts");
      start("apps/worker/src/main.ts");
      start("web");
      const ready = async (url: string) => {
        for (let i = 0; i < 120; i++) {
          if (
            await fetch(url).then(
              (r) => r.ok,
              () => false,
            )
          )
            return;
          await new Promise((r) => setTimeout(r, 150));
        }
        throw new Error(`service not ready ${url}`);
      };
      await Promise.all([
        ready("http://127.0.0.1:3000"),
        ready("http://127.0.0.1:4000/health"),
        ready("http://127.0.0.1:4100/health"),
      ]);
      browser = await chromium.launch({
        executablePath:
          process.env.ZC_CHROMIUM_PATH ?? chromium.executablePath(),
        headless: true,
      });
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("http://127.0.0.1:3000");
      await page
        .getByRole("button", { name: /Yerel çalışma alanını aç/ })
        .click();
      await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
      const settings = page.locator(".ai-settings-card").last();
      await settings
        .getByRole("textbox", { name: "Provider adı" })
        .fill("Yerel test provider");
      await settings
        .getByRole("textbox", { name: "Custom Base URL" })
        .fill("http://127.0.0.1:4250/v1");
      await settings
        .getByRole("textbox", { name: "API Key" })
        .fill("ui-test-secret");
      await settings.getByRole("button", { name: "Fetch Models" }).click();
      await settings.getByText("1 model yüklendi.").waitFor();
      await settings
        .getByRole("combobox", { name: "Model", exact: true })
        .selectOption("ui-model");
      await settings.getByRole("button", { name: "Test Connection" }).click();
      await settings
        .getByText("Gerçek provider bağlantısı başarılı.")
        .waitFor();
      await settings.getByRole("button", { name: "Save Provider" }).click();
      await settings.getByText("Provider kaydedildi.").waitFor();
      await page
        .getByRole("textbox", { name: "Hedef site URL" })
        .fill("https://www.saucedemo.com/");
      await page.getByRole("button", { name: "Site ekle" }).click();
      await page
        .locator(".ai-provider-item")
        .getByText("https://www.saucedemo.com")
        .waitFor();
      await page.screenshot({
        path: join(evidence, "settings.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "AI Test Assistant", exact: true })
        .click();
      await page.waitForFunction(
        () =>
          (
            document.querySelector(
              'input[aria-label="Chat modeli"]',
            ) as HTMLInputElement
          )?.value === "ui-model",
      );
      assert.equal(
        await page.getByRole("textbox", { name: "API Key" }).count(),
        0,
      );
      await page.screenshot({
        path: join(evidence, "chat-empty.png"),
        fullPage: true,
      });
      await page
        .getByRole("textbox", { name: "Test isteği" })
        .fill(
          "http://127.0.0.1:4100/login adresini analiz et ve yanlış giriş suite hazırla.",
        );
      // Direct suite generation (the plan step is covered further below).
      await page
        .getByRole("checkbox", { name: "Önce analiz et ve test planı öner" })
        .uncheck();
      await page.getByRole("button", { name: "Gönder" }).click();
      await page
        .getByText("Giriş doğrulama suite")
        .first()
        .waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: "Taslağı düzenle" }).click();
      await page.getByRole("button", { name: "Onayla ve kaydet" }).click();
      await page.getByRole("button", { name: "Çalıştır", exact: true }).click();
      await page
        .getByText("Suite çalışması", { exact: false })
        .waitFor({ timeout: 10000 });
      await page
        .getByText("1 başarılı · 0 başarısız · 0 atlandı")
        .waitFor({ timeout: 30000 });
      await page.locator(".ai-thread").evaluate((element: HTMLElement) => {
        element.style.maxHeight = "none";
        element.style.overflow = "visible";
        element.scrollTop = 0;
      });
      await page
        .locator(".ai-chat")
        .screenshot({ path: join(evidence, "chat.png") });
      await page.screenshot({
        path: join(evidence, "suite.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: /^Elementler/ }).click();
      await page
        .getByRole("heading", {
          name: "Web sitelerinden kaydedilen elementler",
        })
        .waitFor();
      await page.getByText("testId: login-email").waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: /\/login.*4 element/ })
          .getAttribute("aria-expanded"),
        "true",
      );
      await page
        .getByPlaceholder("Ad, anahtar veya locator ile ara")
        .fill("login-pass");
      await page
        .getByText("testId: login-email")
        .waitFor({ state: "detached" });
      await page.getByText("testId: login-password").waitFor();
      await page.getByPlaceholder("Ad, anahtar veya locator ile ara").fill("");
      await page.getByText("testId: login-email").waitFor();
      // Check the AI element filter layout at desktop and narrow viewports.
      for (const width of [1440, 1050, 800, 600, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        const layout = await page
          .locator(".ai-element-filters")
          .evaluate((filter) => {
            const bounds = filter.getBoundingClientRect();
            const labels = [...filter.querySelectorAll("label")];
            return {
              overflow: filter.scrollWidth > filter.clientWidth + 1,
              outside: labels.some((label) => {
                const rect = label.getBoundingClientRect();
                return (
                  rect.left < bounds.left - 1 || rect.right > bounds.right + 1
                );
              }),
            };
          });
        assert.equal(layout.overflow, false, `Filter overflow at ${width}px`);
        assert.equal(layout.outside, false, `Filter clipping at ${width}px`);
        if (width === 800 || width === 390)
          await page.locator(".ai-element-list").screenshot({
            path: join(evidence, `ai-elements-${width}.png`),
          });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({
        path: join(evidence, "ai-elements.png"),
        fullPage: true,
      });
      // Name, key and approve a library element inline.
      await page
        .locator("tr", { hasText: "testId: login-email" })
        .getByRole("button", { name: /düzenle$/ })
        .click();
      await page.getByLabel("Element adı").fill("E-posta alanı");
      await page.getByLabel("Element anahtarı").fill("login.email");
      await page.getByLabel("Elementi onayla").check();
      await page.getByRole("button", { name: "Kaydet", exact: true }).click();
      await page.getByText("Kaydedildi (sürüm 2).").waitFor();
      assert.equal(
        await page.getByLabel("Element anahtarı").isDisabled(),
        true,
      );
      await page.getByLabel("Birincil locator değeri").fill("login-email-x");
      await page
        .getByText("Locator değişti: kaydedince onay kaldırılır", {
          exact: false,
        })
        .waitFor();
      assert.equal(await page.getByLabel("Elementi onayla").isChecked(), false);
      await page.screenshot({
        path: join(evidence, "ai-element-edit.png"),
        fullPage: true,
      });
      await page.getByRole("button", { name: "Kapat", exact: true }).click();
      await page.getByLabel("Kaydedilen element durumu").selectOption("true");
      await page.getByText("E-posta alanı").waitFor();
      await page
        .getByText("testId: login-password")
        .waitFor({ state: "detached" });
      await page.getByLabel("Kaydedilen element durumu").selectOption("");
      await page.getByRole("button", { name: /^Testler/ }).click();
      await page.getByRole("heading", { name: "AI suite’ler" }).waitFor();
      await page.getByText(/^Giriş doğrulama suite ·/).waitFor();
      await page.screenshot({
        path: join(evidence, "tests-list.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "AI Test Assistant", exact: true })
        .click();
      await page
        .getByRole("button", { name: /^http:\/\/127\.0\.0\.1:4100\/login/ })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: join(evidence, "mobile.png"),
        fullPage: true,
      });
      await page.setViewportSize({ width: 1440, height: 1000 });
      // Survey → proposed plan → only the selected tests are created (ADR 018).
      await page.getByRole("button", { name: "Yeni konuşma" }).click();
      await page
        .getByRole("checkbox", { name: "Önce analiz et ve test planı öner" })
        .check();
      await page
        .getByRole("textbox", { name: "Test isteği" })
        .fill("Giriş sayfasını incele ve ne test edilebileceğini öner.");
      await page.getByRole("button", { name: "Gönder" }).click();
      await page.getByText("Önerilen test planı · 2 test").waitFor({
        timeout: 30000,
      });
      assert.equal(
        await page
          .getByRole("checkbox", { name: "Geçerli giriş dashboard'u açar seç" })
          .isChecked(),
        false,
      );
      await page.getByText("Eksik bilgi: Geçerli kullanıcı").waitFor();
      const planDetails = page.locator(".ai-plan-details").first();
      await planDetails.locator("summary").click();
      assert.equal(
        await page.getByLabel("Test 1 adımları").inputValue(),
        "Yanlış e-posta gir\nYanlış parola gir\nGiriş yap",
      );
      await page
        .getByLabel("Test 1 beklenen sonuçları")
        .fill("Hata mesajı görünür\nGiriş sayfasında kalınır");
      assert.match(
        await page.getByLabel("Test 1 beklenen sonuçları").inputValue(),
        /Giriş sayfasında kalınır/,
      );
      await page.locator(".ai-plan").screenshot({
        path: join(evidence, "plan.png"),
      });
      await page.getByRole("button", { name: "Testleri oluştur (1)" }).click();
      await page
        .getByRole("button", { name: "Testler'de aç" })
        .waitFor({ timeout: 30000 });
      await page.getByRole("button", { name: "Testler'de aç" }).click();
      await page
        .locator(".tc-card")
        .getByText("Yanlış bilgiler uyarı verir")
        .first()
        .waitFor();
      await page.locator(".tc-card").screenshot({
        path: join(evidence, "plan-suite.png"),
      });
      await page
        .locator("aside.sidebar")
        .getByRole("button", { name: /^AI Test Assistant/ })
        .click();
      await page.getByRole("button", { name: "Yeni konuşma" }).click();
      await page
        .getByRole("textbox", { name: "Hedef URL" })
        .fill("https://example.com/");
      await page
        .getByRole("textbox", { name: "Test isteği" })
        .fill("Giriş formunu analiz et ve negatif suite hazırla.");
      await page.getByRole("button", { name: "Gönder" }).click();
      await page
        .getByRole("button", { name: "Siteyi ekle ve tekrar gönder" })
        .waitFor();
      await page.screenshot({
        path: join(evidence, "authorize.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Siteyi ekle ve tekrar gönder" })
        .click();
      await page.waitForFunction(
        () =>
          (
            document.querySelector(
              'textarea[aria-label="Test isteği"]',
            ) as HTMLTextAreaElement
          )?.value === "",
      );
      await page.getByRole("button", { name: "Ayarlar", exact: true }).click();
      await page
        .locator(".ai-provider-item")
        .getByText("https://example.com", { exact: true })
        .waitFor();
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      for (const child of processes)
        try {
          if (child.pid) stopTestProcess(child.pid, "SIGTERM");
        } catch {}
      await provider.close();
    }
  },
);
