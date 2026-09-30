/** Preview is derived from source; never persist this wrapper into a revision. */
export function htmlPreview(html: string, allowScripts = false): string {
  const policy = [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "img-src data:",
    "media-src 'none'",
    "font-src 'none'",
    "style-src 'unsafe-inline'",
    allowScripts ? "script-src 'unsafe-inline'" : "script-src 'none'",
  ].join("; ");
  // An outer document puts the enforced policy before any supplied markup,
  // including malformed fragments, comments, and a second <head> element.
  // Additional supplied CSPs can only restrict this policy, never relax it.
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"></head><body>${html}</body></html>`;
}
