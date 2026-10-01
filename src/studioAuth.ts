const key = "rheo-operator-key";
export function readStudioKey(): string {
  try { return sessionStorage.getItem(key) || ""; } catch { return ""; }
}
export function saveStudioKey(value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch { /* Browser may restrict session storage. */ }
}
