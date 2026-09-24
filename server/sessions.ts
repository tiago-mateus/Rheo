import { randomBytes } from "node:crypto";
import type { Role, SessionKeys } from "../shared/protocol.js";
interface Session extends SessionKeys {
  expiresAt: number;
  sender?: string;
  viewer?: string;
}
export class SessionStore {
  private sessions = new Map<string, Session>();
  constructor(
    private clock = Date.now,
    private ttl = 4 * 60 * 60 * 1000,
  ) {}
  create(): SessionKeys {
    this.sweep();
    if (this.sessions.size >= 128)
      throw new Error(
        "Limite de sessões atingido. Tente novamente mais tarde.",
      );
    const session = {
      id: randomBytes(12).toString("hex"),
      sendToken: randomBytes(24).toString("hex"),
      viewToken: randomBytes(24).toString("hex"),
      expiresAt: this.clock() + this.ttl,
    };
    this.sessions.set(session.id, session);
    return {
      id: session.id,
      sendToken: session.sendToken,
      viewToken: session.viewToken,
    };
  }
  get(id: string) {
    const session = this.sessions.get(id);
    if (session && session.expiresAt <= this.clock()) {
      this.sessions.delete(id);
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
  end(id: string) {
    this.sessions.delete(id);
  }
  sweep() {
    for (const id of this.sessions.keys()) this.get(id);
  }
}
