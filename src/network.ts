// ICE host candidates can include local IPs or browser-generated mDNS names.
// Reject public and server-derived addresses in LAN-only mode.
export function isLanAddress(address: string | undefined): boolean {
  if (!address) return false;
  const value = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.endsWith(".local")) return true;
  const parts = value.split(".").map(Number);
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  )
    return (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254)
    );
  return value.startsWith("fe80:") || /^f[cd][0-9a-f]{2}:/i.test(value);
}

export function isLanCandidate(candidate: string): boolean {
  const fields = candidate.trim().replace(/^a=/, "").split(/\s+/);
  const typeIndex = fields.indexOf("typ");
  return (
    Boolean(fields[0]?.startsWith("candidate:")) &&
    typeIndex >= 0 &&
    fields[typeIndex + 1] === "host" &&
    isLanAddress(fields[4])
  );
}

export function lanDescription<T extends { sdp?: string }>(description: T): T {
  if (!description.sdp) return description;
  return {
    ...description,
    sdp: description.sdp
      .split(/(?<=\n)/)
      .filter(
        (line) => !line.startsWith("a=candidate:") || isLanCandidate(line),
      )
      .join(""),
  };
}

export function mediaRoute(
  local?: { candidateType?: string; address?: string; ip?: string },
  remote?: { candidateType?: string; address?: string; ip?: string },
  lanOnly = false,
): string {
  if (!local || !remote) return "Rota não identificada";
  if (local.candidateType === "relay" || remote.candidateType === "relay")
    return "Via TURN";
  if (
    lanOnly &&
    ["host", "prflx"].includes(local.candidateType || "") &&
    ["host", "prflx"].includes(remote.candidateType || "")
  )
    return "LAN";
  if (local.candidateType === "host" && remote.candidateType === "host") {
    const localAddress = local.address || local.ip;
    const remoteAddress = remote.address || remote.ip;
    if (isLanAddress(localAddress) && isLanAddress(remoteAddress)) return "LAN";
  }
  return "Direta · LAN não confirmada";
}
