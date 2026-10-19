import { createApp } from "./app";
const app = await createApp();
await app.listen({ host: "127.0.0.1", port: 4000 });
console.log(
  JSON.stringify({ service: "api", event: "ready", mode: "local-prototype" }),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close();
  });
