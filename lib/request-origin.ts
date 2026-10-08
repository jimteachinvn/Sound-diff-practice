// Netlify may address the server by a deployment hostname while the browser
// uses the site's canonical URL. Trust this configured origin, never forwarded
// headers supplied by a caller.
export function isAllowedRequestOrigin(request: Request, canonicalOrigin: string, development = false): boolean {
  let source: URL;
  let target: URL;
  try { source = new URL(request.headers.get("origin") ?? ""); target = new URL(request.url); }
  catch { return false; }
  if (source.origin === target.origin) return true;
  try {
    const canonical = new URL(canonicalOrigin);
    if (canonical.protocol === "https:" && source.origin === canonical.origin) return true;
  } catch { /* Missing or invalid canonical configuration grants nothing. */ }
  return development && source.protocol === "http:" && target.protocol === "http:" &&
    source.port === target.port && ["localhost", "127.0.0.1"].includes(source.hostname) &&
    ["localhost", "127.0.0.1"].includes(target.hostname);
}
export const canonicalAppOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://ho-am-tieng-anh.netlify.app";
