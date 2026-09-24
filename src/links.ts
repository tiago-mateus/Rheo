import type { AccessIssue } from "../shared/protocol";
export function sessionLocation(link: string, issue: AccessIssue | null) {
  const url = new URL(link);
  const activePath = url.pathname.replace(
    /^\/status\/(?:busy|expired|released)/,
    "",
  );
  url.pathname = issue ? "/status/" + issue + activePath : activePath;
  return url.href;
}
export function obsLink(link: string) {
  const url = new URL(sessionLocation(link, null));
  url.searchParams.set("clean", "1");
  return url.href;
}
