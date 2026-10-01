import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import type { Role, SessionKeys } from "../shared/protocol.js";
import { defaultFormat, validFormat, type VideoFormat } from "../shared/video.js";
interface Session extends SessionKeys {
  format: VideoFormat;
  managed: boolean;
  expiresAt: number;
  sender?: string;
  viewer?: string;
  releasedViewers: Set<string>;
}
export class SessionStore {
  private sessions = new Map<string, Session>();
  constructor(
    private clock = Date.now,
    private ttl = 4 * 60 * 60 * 1000,
    private persistencePath?: string,
  ) {
    if (persistencePath) this.restore();
  }
  private restore() {
    if (!this.persistencePath || !existsSync(this.persistencePath)) return;
    // Fail closed on malformed files: silently issuing new rooms would invalidate old links.
    const parsed: unknown = JSON.parse(readFileSync(this.persistencePath, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("Arquivo de sessões inválido.");
    for (const item of parsed) {
      if (!item || typeof item !== "object") throw new Error("Arquivo de sessões inválido.");
      const value = item as Record<string, unknown>;
      if (
        typeof value.id !== "string" || !/^[a-f0-9]{24}$/.test(value.id) ||
        !["sendToken", "viewToken", "controlToken"].every(
          (key) => typeof value[key] === "string" && /^[a-f0-9]{48}$/.test(value[key] as string)
        ) ||
        typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt) ||
        typeof value.managed !== "boolean" || !validFormat(value.format) ||
        !Array.isArray(value.releasedViewers) ||
        !value.releasedViewers.every((key: unknown) => typeof key === "string" && key.length >= 12 && key.length <= 128)
      ) throw new Error("Arquivo de sessões inválido.");
      if (value.expiresAt > this.clock()) {
        const session = value as unknown as Omit<Session, "releasedViewers"> & { releasedViewers: string[] };
        this.sessions.set(session.id, {
          ...session,
          sender: undefined,
          viewer: undefined,
          releasedViewers: new Set(session.releasedViewers.slice(-128)),
        });
      }
    }
    this.persist(); // Remove expired entries from the durable snapshot.
  }
  private persist() {
    if (!this.persistencePath) return;
    const records = [...this.sessions.values()].map(
      ({ id, sendToken, viewToken, controlToken, format, managed, expiresAt, releasedViewers }) =>
        ({ id, sendToken, viewToken, controlToken, format, managed, expiresAt, releasedViewers: [...releasedViewers] })
    );
    mkdirSync(dirname(this.persistencePath), { recursive: true, mode: 0o700 });
    const temp = `${this.persistencePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify(records), { mode: 0o600, flag: "wx" });
      renameSync(temp, this.persistencePath);
    } finally {
      if (existsSync(temp)) unlinkSync(temp);
    }
  }
  create(format: VideoFormat = defaultFormat, managed = false): SessionKeys {
    this.sweep();
    if (this.sessions.size >= 128)
      throw new Error(
        "Limite de sessões atingido. Tente novamente mais tarde.",
      );
    const session = {
      id: randomBytes(12).toString("hex"),
      sendToken: randomBytes(24).toString("hex"),
      viewToken: randomBytes(24).toString("hex"),
      controlToken: randomBytes(24).toString("hex"),
      format: { ...format },
      managed,
      expiresAt: this.clock() + this.ttl,
      releasedViewers: new Set<string>(),
    };
    this.sessions.set(session.id, session);
    try {
      this.persist();
    } catch (error) {
      this.sessions.delete(session.id);
      throw error;
    }
    return {
      id: session.id,
      sendToken: session.sendToken,
      viewToken: session.viewToken,
      controlToken: session.controlToken,
    };
  }
  get(id: string) {
    const session = this.sessions.get(id);
    if (session && session.expiresAt <= this.clock()) {
      this.sessions.delete(id);
      this.persist();
      return undefined;
    }
    return session;
  }
  authorize(id: string, token: string): Role | null {
    const session = this.get(id);
    if (!session || !token) return null;
    return token === session.sendToken
      ? "sender"
      : token === session.viewToken
        ? "viewer"
        : null;
  }
  join(id: string, role: Role, connection: string) {
    const session = this.get(id);
    if (!session || session[role]) return false;
    session[role] = connection;
    return true;
  }
  leave(id: string, role: Role, connection: string) {
    const session = this.get(id);
    if (session?.[role] === connection) delete session[role];
  }
  markViewerReleased(id: string, resumeKey?: string) {
    const session = this.get(id);
    if (session && resumeKey) {
      // Only recent connection identities need protection from automatic retry.
      if (session.releasedViewers.size >= 128)
        session.releasedViewers.delete(
          session.releasedViewers.values().next().value!,
        );
      session.releasedViewers.add(resumeKey);
      this.persist();
    }
  }
  isViewerReleased(id: string, resumeKey: string) {
    return this.get(id)?.releasedViewers.has(resumeKey) ?? false;
  }
  end(id: string) {
    const previous = this.sessions.get(id);
    if (!previous) return;
    this.sessions.delete(id);
    try {
      this.persist();
    } catch (error) {
      this.sessions.set(id, previous);
      throw error;
    }
  }
  sweep() {
    for (const id of this.sessions.keys()) this.get(id);
  }
}
