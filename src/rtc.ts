import type { IceSettings, Role, Signal } from "../shared/protocol";
export interface Stats {
  bitrate?: number;
  fps?: number;
  rtt?: number;
  route?: string;
  resolution?: string;
  lost?: number;
}
interface Callbacks {
  status: (text: string) => void;
  error: (text: string) => void;
  remote: (stream: MediaStream | null) => void;
  ended: () => void;
  config: (config: IceSettings) => void;
  stats: (stats: Stats) => void;
}
export class RtcSession {
  private socket?: WebSocket;
  private pc?: RTCPeerConnection;
  private stopped = false;
  private terminal = false;
  private attempt = 0;
  private iceAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private iceTimer?: ReturnType<typeof setTimeout>;
  private statsTimer?: ReturnType<typeof setInterval>;
  private config?: IceSettings;
  private pending: RTCIceCandidateInit[] = [];
  private resumeKey = Array.from(
    crypto.getRandomValues(new Uint8Array(24)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  private previous?: { bytes: number; time: number };
  constructor(
    private id: string,
    private token: string,
    private role: Role,
    private stream: MediaStream | null,
    private callbacks: Callbacks,
    private relay = false,
  ) {}
  connect() {
    if (this.stopped) return;
    this.callbacks.status(this.attempt ? "Reconectando…" : "Conectando…");
    const socket = new WebSocket(
      (location.protocol === "https:" ? "wss:" : "ws:") +
        "//" +
        location.host +
        "/signal",
    );
    this.socket = socket;
    let queue = Promise.resolve();
    socket.onopen = () =>
      this.send({
        type: "join",
        id: this.id,
        token: this.token,
        resumeKey: this.resumeKey,
      });
    socket.onmessage = (event) => {
      queue = queue
        .then(async () => {
          if (this.socket !== socket || this.stopped) return;
          await this.receive(JSON.parse(event.data) as Signal);
        })
        .catch((error) => {
          if (!this.stopped)
            this.callbacks.error(
              "Falha na conexão: " +
                (error as Error).message +
                ". Tente reconectar.",
            );
        });
    };
    socket.onerror = () => {}; // onclose owns retries and user feedback.
    socket.onclose = () => {
      if (this.socket !== socket || this.stopped || this.terminal) return;
      this.closePeer();
      if (this.attempt >= 5) {
        this.callbacks.status("Desconectado");
        this.callbacks.error(
          "Não foi possível alcançar o servidor. Confira a rede e clique em Reconectar.",
        );
        return;
      }
      this.callbacks.status("Reconectando…");
      this.reconnectTimer = setTimeout(
        () => this.connect(),
        Math.min(1000 * 2 ** this.attempt++, 8000),
      );
    };
  }
  private send(message: Signal) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  private async receive(message: Signal) {
    if (message.type === "joined") {
      if (message.role !== this.role) {
        this.terminal = true;
        this.socket?.close();
        this.callbacks.error(
          "Este link pertence a outro tipo de acesso. Use o link correto.",
        );
        return;
      }
      this.config = message.config;
      this.callbacks.config(message.config);
      this.attempt = 0;
      if (this.relay && !message.config.hasTurn) {
        this.terminal = true;
        this.socket?.close();
        this.callbacks.error(
          "O teste por relay exige um servidor TURN configurado no .env.",
        );
        return;
      }
      this.callbacks.status(
        this.role === "sender" ? "Aguardando receptor" : "Aguardando câmera",
      );
      return;
    }
    if (message.type === "ready") {
      const pc = this.createPeer();
      this.callbacks.status("Conectando mídia…");
      if (this.role === "sender") {
        await pc.setLocalDescription(await pc.createOffer());
        if (this.pc === pc)
          this.send({
            type: "description",
            description: pc.localDescription!.toJSON(),
          });
      }
    } else if (message.type === "description") {
      const pc = this.pc || this.createPeer();
      await pc.setRemoteDescription(message.description);
      for (const candidate of this.pending.splice(0))
        await pc.addIceCandidate(candidate);
      if (this.role === "viewer") {
        await pc.setLocalDescription(await pc.createAnswer());
        if (this.pc === pc)
          this.send({
            type: "description",
            description: pc.localDescription!.toJSON(),
          });
      }
    } else if (message.type === "candidate") {
      if (this.pc?.remoteDescription)
        await this.pc.addIceCandidate(message.candidate);
      else this.pending.push(message.candidate);
    } else if (message.type === "peer-left") {
      this.closePeer();
      this.callbacks.status(
        this.role === "sender" ? "Aguardando receptor" : "Aguardando câmera",
      );
    } else if (message.type === "ended") {
      this.dispose();
      this.callbacks.ended();
    } else if (message.type === "error") {
      this.terminal = true;
      this.closePeer();
      this.socket?.close();
      this.callbacks.status("Conexão indisponível");
      this.callbacks.error(message.message);
    }
  }
  private createPeer() {
    this.closePeer();
    this.iceAttempts = 0;
    const pc = new RTCPeerConnection({
      iceServers: this.config?.iceServers,
      iceTransportPolicy: this.relay ? "relay" : "all",
    });
    this.pc = pc;
    if (this.stream)
      for (const track of this.stream.getTracks())
        pc.addTrack(track, this.stream);
    pc.onicecandidate = (event) => {
      if (event.candidate && this.pc === pc)
        this.send({ type: "candidate", candidate: event.candidate.toJSON() });
    };
    const remote = new MediaStream();
    pc.ontrack = (event) => {
      if (this.pc !== pc) return;
      if (!remote.getTracks().some((t) => t.id === event.track.id))
        remote.addTrack(event.track);
      this.callbacks.remote(remote);
    };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === "connected") {
        clearTimeout(this.iceTimer);
        this.iceAttempts = 0;
        this.callbacks.error("");
        this.callbacks.status("Conectado");
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        this.callbacks.status("Reconectando mídia…");
        clearTimeout(this.iceTimer);
        this.iceTimer = setTimeout(
          () => {
            void this.restartIce(pc);
          },
          pc.connectionState === "failed" ? 500 : 5000,
        );
      }
    };
    this.statsTimer = setInterval(() => {
      void this.collectStats(pc);
    }, 1500);
    return pc;
  }
  private async restartIce(pc: RTCPeerConnection) {
    if (this.pc !== pc || pc.connectionState === "connected") return;
    if (this.role !== "sender") return; // The sender is the sole offerer.
    if (this.iceAttempts++ >= 2) {
      this.callbacks.error(
        "A mídia não reconectou. Confira a rede ou a configuração TURN e clique em Reconectar.",
      );
      return;
    }
    try {
      if (pc.signalingState === "stable") {
        await pc.setLocalDescription(
          await pc.createOffer({ iceRestart: true }),
        );
        if (this.pc === pc)
          this.send({
            type: "description",
            description: pc.localDescription!.toJSON(),
          });
      }
      this.iceTimer = setTimeout(() => {
        void this.restartIce(pc);
      }, 8000);
    } catch {
      this.callbacks.error(
        "Não foi possível recuperar a mídia. Clique em Reconectar.",
      );
    }
  }
  private async collectStats(pc: RTCPeerConnection) {
    try {
      const stats = await pc.getStats();
      if (this.pc !== pc) return;
      const result: Stats = {};
      stats.forEach((report) => {
        if (
          report.type ===
            (this.role === "sender" ? "outbound-rtp" : "inbound-rtp") &&
          report.kind === "video" &&
          !report.isRemote
        ) {
          const bytes =
            this.role === "sender" ? report.bytesSent : report.bytesReceived;
          if (this.previous && report.timestamp > this.previous.time)
            result.bitrate = Math.max(
              0,
              ((bytes - this.previous.bytes) * 8) /
                (report.timestamp - this.previous.time),
            );
          this.previous = { bytes, time: report.timestamp };
          result.fps = report.framesPerSecond;
          if (report.frameWidth)
            result.resolution = report.frameWidth + " × " + report.frameHeight;
          result.lost = report.packetsLost;
        }
        if (report.type === "transport" && report.selectedCandidatePairId) {
          const pair = stats.get(report.selectedCandidatePairId);
          if (pair?.currentRoundTripTime !== undefined)
            result.rtt = Math.round(pair.currentRoundTripTime * 1000);
          const local = stats.get(pair?.localCandidateId);
          const remote = stats.get(pair?.remoteCandidateId);
          result.route =
            local?.candidateType === "relay" ||
            remote?.candidateType === "relay"
              ? "Via TURN"
              : "Direta";
        }
      });
      this.callbacks.stats(result);
    } catch {
      /* Peer may have closed while reading stats. */
    }
  }
  private closePeer() {
    clearInterval(this.statsTimer);
    clearTimeout(this.iceTimer);
    if (this.pc) {
      this.pc.onconnectionstatechange = null;
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.close();
      this.pc = undefined;
    }
    this.pending = [];
    this.previous = undefined;
    this.callbacks.remote(null);
    this.callbacks.stats({});
  }
  end() {
    this.send({ type: "end" });
    this.dispose();
    this.callbacks.ended();
  }
  dispose() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.closePeer();
    this.socket?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
