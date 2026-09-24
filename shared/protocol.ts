export type Role = "sender" | "viewer";
export type AccessIssue = "busy" | "expired" | "released";
export interface SessionKeys {
  id: string;
  sendToken: string;
  viewToken: string;
}
export interface IceSettings {
  iceServers: RTCIceServer[];
  hasTurn: boolean;
}
export type Signal =
  | { type: "join"; id: string; token: string; resumeKey?: string }
  | { type: "joined"; role: Role; config: IceSettings }
  | { type: "ready" }
  | { type: "description"; description: RTCSessionDescriptionInit }
  | { type: "candidate"; candidate: RTCIceCandidateInit }
  | { type: "peer-left" }
  | { type: "release-viewer" }
  | { type: "released" }
  | { type: "end" }
  | { type: "ended" }
  | {
      type: "error";
      message: string;
      code?: "ROLE_OCCUPIED" | "SESSION_EXPIRED";
    };
