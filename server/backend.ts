import express from "express";
import { randomUUID } from "node:crypto";
import type { Server, IncomingMessage } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { SessionStore } from "./sessions.js";
import { iceSettings } from "./ice.js";
import type { Role } from "../shared/protocol.js";
type Client = {
  socket: WebSocket;
  id: string;
  session?: string;
  role?: Role;
  alive: boolean;
  resumeKey?: string;
};
export function createBackend(options: { publicOrigin?: string } = {}) {
  // Render terminates TLS before forwarding HTTP to this process.
  // Pin the public origin instead of trusting client-supplied forwarded headers.
  const configuredOrigin =
    options.publicOrigin ??
    process.env.PUBLIC_ORIGIN ??
    process.env.RENDER_EXTERNAL_URL;
  const publicOrigin = configuredOrigin
    ? new URL(configuredOrigin).origin
    : undefined;
  const expectedOrigin = (req: IncomingMessage) =>
    publicOrigin ??
    ("encrypted" in req.socket ? "https" : "http") + "://" + req.headers.host;
  const app = express();
  app.disable("x-powered-by");
  const store = new SessionStore();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const clients = new Map<string, Client>();
  const limits = new Map<string, { count: number; until: number }>();
  const send = (client: Client | undefined, value: object) => {
    if (client?.socket.readyState === WebSocket.OPEN)
      client.socket.send(JSON.stringify(value));
  };
  const peer = (client: Client) => {
    const session = client.session ? store.get(client.session) : undefined;
    const id = session?.[client.role === "sender" ? "viewer" : "sender"];
    return id ? clients.get(id) : undefined;
  };
  app.use((_req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.post("/api/sessions", (req, res) => {
    if (req.headers.origin && req.headers.origin !== expectedOrigin(req)) {
      res.status(403).json({ error: "Origem não permitida." });
      return;
    }
    const ip = req.socket.remoteAddress || "local";
    const now = Date.now();
    let limit = limits.get(ip);
    if (!limit || limit.until < now) {
      limit = { count: 0, until: now + 60000 };
      limits.set(ip, limit);
    }
    if (++limit.count > 20) {
      res.status(429).json({ error: "Muitas sessões. Aguarde um minuto." });
      return;
    }
    try {
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json(store.create());
    } catch (error) {
      res.status(503).json({ error: (error as Error).message });
    }
  });
  wss.on("connection", (socket) => {
    const client: Client = { socket, id: randomUUID(), alive: true };
    clients.set(client.id, client);
    const joinDeadline = setTimeout(() => {
      if (!client.session) socket.close(1008, "Join timeout");
    }, 10000);
    let windowStart = Date.now(),
      messageCount = 0;
    socket.on("pong", () => {
      client.alive = true;
    });
    socket.on("error", () => socket.terminate());
    socket.on("message", (data) => {
      if (Date.now() - windowStart > 1000) {
        windowStart = Date.now();
        messageCount = 0;
      }
      if (++messageCount > 100) {
        socket.close(1008, "Rate limit");
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        if (!message || typeof message !== "object")
          throw new Error("Mensagem inválida.");
        if (message.type === "join") {
          if (client.session)
            throw new Error("Esta conexão já entrou em uma sessão.");
          if (
            typeof message.id !== "string" ||
            typeof message.token !== "string"
          )
            throw new Error("Link inválido.");
          const role = store.authorize(message.id, message.token);
          if (!role) {
            send(client, {
              type: "error",
              message:
                "Link inválido ou sessão expirada. Peça um novo link ao transmissor.",
            });
            socket.close(1008);
            return;
          }
          const previousId = store.get(message.id)?.[role];
          const previous = previousId ? clients.get(previousId) : undefined;
          const resumeKey =
            typeof message.resumeKey === "string" &&
            message.resumeKey.length >= 12 &&
            message.resumeKey.length <= 128
              ? message.resumeKey
              : undefined;
          if (previous && resumeKey && previous.resumeKey === resumeKey) {
            store.leave(message.id, role, previous.id);
            previous.session = undefined;
            previous.role = undefined;
            previous.socket.close(1000, "Reconnected");
          }
          client.resumeKey = resumeKey;
          if (!store.join(message.id, role, client.id)) {
            send(client, {
              type: "error",
              message:
                "Este link já está em uso. Feche o outro receptor ou transmissor e tente novamente.",
            });
            socket.close(1008);
            return;
          }
          client.session = message.id;
          client.role = role;
          clearTimeout(joinDeadline);
          send(client, { type: "joined", role, config: iceSettings() });
          const other = peer(client);
          if (other) {
            send(client, { type: "ready" });
            send(other, { type: "ready" });
          }
          return;
        }
        if (!client.session || !store.get(client.session))
          throw new Error("Sessão inválida ou expirada.");
        if (message.type === "end") {
          if (client.role !== "sender")
            throw new Error("Somente o transmissor pode encerrar a sessão.");
          const other = peer(client);
          store.end(client.session);
          for (const member of [client, other]) {
            send(member, { type: "ended" });
            member?.socket.close(1000);
          }
        } else if (message.type === "description") {
          const d = message.description;
          const expected = client.role === "sender" ? "offer" : "answer";
          if (
            d?.type !== expected ||
            typeof d.sdp !== "string" ||
            d.sdp.length > 60000
          )
            throw new Error("Descrição de mídia inválida.");
          send(peer(client), {
            type: "description",
            description: { type: d.type, sdp: d.sdp },
          });
        } else if (message.type === "candidate") {
          const c = message.candidate;
          if (
            !c ||
            typeof c.candidate !== "string" ||
            c.candidate.length > 8192
          )
            throw new Error("Candidato de rede inválido.");
          send(peer(client), { type: "candidate", candidate: c });
        } else throw new Error("Mensagem desconhecida.");
      } catch (error) {
        send(client, {
          type: "error",
          message:
            error instanceof SyntaxError
              ? "Mensagem inválida."
              : (error as Error).message,
        });
      }
    });
    socket.on("close", () => {
      clearTimeout(joinDeadline);
      const other = peer(client);
      const ownsSlot =
        client.session &&
        client.role &&
        store.get(client.session)?.[client.role] === client.id;
      if (client.session && client.role)
        store.leave(client.session, client.role, client.id);
      clients.delete(client.id);
      if (ownsSlot) send(other, { type: "peer-left" });
    });
  });
  const timer = setInterval(() => {
    store.sweep();
    for (const [ip, limit] of limits)
      if (limit.until < Date.now()) limits.delete(ip);
    for (const client of clients.values()) {
      if (client.session && !store.get(client.session)) {
        send(client, { type: "ended" });
        client.socket.close(1000);
        continue;
      }
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, 15000);
  timer.unref();
  return {
    app,
    attach(server: Server) {
      server.on("upgrade", (req, socket, head) => {
        if (req.url !== "/signal") return; // Vite handles its own development socket.
        if (req.headers.origin !== expectedOrigin(req) || clients.size >= 256) {
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) =>
          wss.emit("connection", ws, req),
        );
      });
    },
    async close() {
      clearInterval(timer);
      for (const c of clients.values()) c.socket.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
    },
  };
}
