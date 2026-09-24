import "dotenv/config";
import http from "node:http";
import https from "node:https";
import { networkInterfaces } from "node:os";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import express from "express";
import selfsigned from "selfsigned";
import { createBackend } from "./backend.js";
const secure = process.argv.includes("--https");
const production = process.argv.includes("--production");
const port = Number(process.env.PORT || 3000);
const backend = createBackend();
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a?.family === "IPv4" && !a.internal)
  .map((a) => a!.address);
let server: http.Server;
if (secure) {
  const folder = path.resolve(".local");
  await mkdir(folder, { recursive: true });
  let key: string, cert: string;
  try {
    [key, cert] = await Promise.all([
      readFile(path.join(folder, "key.pem"), "utf8"),
      readFile(path.join(folder, "cert.pem"), "utf8"),
    ]);
  } catch {
    const pems = selfsigned.generate(
      [{ name: "commonName", value: "Rheo local" }],
      {
        days: 30,
        keySize: 2048,
        algorithm: "sha256",
        extensions: [
          {
            name: "subjectAltName",
            altNames: [
              { type: 2, value: "localhost" },
              { type: 7, ip: "127.0.0.1" },
              ...addresses.map((ip) => ({ type: 7, ip })),
            ],
          },
        ],
      },
    );
    key = pems.private;
    cert = pems.cert;
    await Promise.all([
      writeFile(path.join(folder, "key.pem"), key),
      writeFile(path.join(folder, "cert.pem"), cert),
    ]);
  }
  server = https.createServer({ key, cert }, backend.app);
} else server = http.createServer(backend.app);
backend.attach(server);
let vite:
  Awaited<ReturnType<(typeof import("vite"))["createServer"]>> | undefined;
if (production) {
  backend.app.use(express.static(path.resolve("dist")));
  backend.app.get("/{*path}", (_req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
} else {
  const { createServer } = await import("vite");
  vite = await createServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  backend.app.use(vite.middlewares);
}
server.listen(port, "0.0.0.0", () => {
  const protocol = secure ? "https" : "http";
  console.log("\nRheo disponível em " + protocol + "://localhost:" + port);
  for (const address of addresses)
    console.log("Rede local: " + protocol + "://" + address + ":" + port);
  if (!secure)
    console.log("No celular, use npm run dev:https para habilitar a câmera.");
});
async function shutdown() {
  await backend.close();
  await vite?.close();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
