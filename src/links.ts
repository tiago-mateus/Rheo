export function obsLink(link: string) {
  const url = new URL(link);
  url.searchParams.set("clean", "1");
  return url.href;
}
