export interface HtmlPreviewConsent {
  source: string;
  mode: "protected" | "confirming" | "interactive";
}

export type HtmlPreviewConsentAction = {
  type: "source-changed" | "request" | "approve" | "dismiss" | "disable";
  source: string;
};

/** A trust decision belongs to the displayed source, never an incoming import. */
export function htmlPreviewConsent(
  state: HtmlPreviewConsent,
  action: HtmlPreviewConsentAction,
): HtmlPreviewConsent {
  if (action.type === "source-changed")
    return action.source === state.source
      ? state
      : { source: action.source, mode: "protected" };
  if (action.source !== state.source) return state;
  if (action.type === "request" && state.mode === "protected")
    return { ...state, mode: "confirming" };
  if (action.type === "approve" && state.mode === "confirming")
    return { ...state, mode: "interactive" };
  if (
    (action.type === "dismiss" && state.mode === "confirming") ||
    (action.type === "disable" && state.mode === "interactive")
  )
    return { ...state, mode: "protected" };
  return state;
}

/** Preview is derived from source; never persist this wrapper into a revision. */
export function htmlPreview(html: string, allowScripts = false): string {
  const policy = [
    "default-src 'none'",
    "base-uri about:",
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
  // srcdoc otherwise inherits the application's base URL. The first base wins,
  // keeping native fragment links inside this opaque, sandboxed document.
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><base href="about:srcdoc" target="_self"><meta name="referrer" content="no-referrer"></head><body>${html}</body></html>`;
}
