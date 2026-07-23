import DOMPurify from "dompurify";

// F-9: Validate that a hostname is a safe LAN/loopback address. In web mode,
// `stremio-server.ts` constructs `http://${window.location.hostname}:11470`.
// If the hostname is a public domain (DNS rebind or hostile reverse proxy),
// that URL would point at an attacker's server. We only allow loopback or
// RFC1918 hostnames.
export function isSafeLanHost(hostname: string): boolean {
  const h = hostname.toLowerCase().trim();
  // IPv4 dot-decimal
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const parts = h.split(".").map(Number);
    if (parts.some((n) => n > 255)) return false;
    const [a, b] = parts;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // RFC1918
    if (a === 192 && b === 168) return true; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
    if (a === 169 && b === 254) return false; // link-local — reject
    return false;
  }
  // IPv6 loopback
  if (h === "::1" || h === "[::1]") return true;
  // "localhost"
  if (h === "localhost") return true;
  // Reject everything else — public hostnames and unknown formats.
  return false;
}

// F-7: External URL scheme validation. The only schemes the Harbor frontend
// is ever allowed to hand to the OS opener or `window.open` are http(s).
// Magnet/torrent hashes are handled by `openMagnet` which routes through
// the torrent engine — never through the OS open path.
const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function assertSafeExternalUrl(raw: string): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject control characters that could smuggle a scheme past URL parsing
  // (e.g. `java\x00script:`). URL() tolerates them in some browsers.
  if (hasControlCharacter(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (!SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.href;
}

// `openMagnet` is the only sanctioned escape hatch for non-http(s) URLs.
// It dispatches an internal CustomEvent that the torrent engine handles;
// it never invokes `tauriOpenUrl` or `window.open` directly.
export function openMagnet(magnet: string): void {
  if (typeof window === "undefined") return;
  if (!magnet || !/^magnet:\?/i.test(magnet)) return;
  window.dispatchEvent(new CustomEvent("harbor:open-magnet", { detail: { magnet } }));
}

// F-4 + F-6: DOMPurify-configured HTML sanitizer.
// AniList returns comment HTML that may contain formatting tags and links.
// We keep a conservative allowlist and reject every event handler, the
// `style` attribute (CSS exfiltration / behavior expressions), and any URL
// scheme other than http(s) on href/src.
const COMMENT_ALLOWED_TAGS = [
  "a", "abbr", "b", "blockquote", "br", "code", "del", "em", "hr", "i",
  "img", "ins", "li", "mark", "ol", "p", "pre", "q", "s", "small", "span",
  "strong", "sub", "sup", "ul",
];

const COMMENT_ALLOWED_ATTR = ["href", "src", "alt", "title"];

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  const name = data.attrName.toLowerCase();
  const value = (data.attrValue ?? "").replace(/\s+/g, "").toLowerCase();
  if (name === "href" || name === "src") {
    if (!/^https?:/.test(value)) {
      // DOMPurify will already strip javascript:/data:/vbscript: but we
      // also drop file:, blob:, magnet:, chrome-extension:, … so an
      // attacker cannot leverage the img `src` to leak the user's IP via
      // a magnet: link (some browsers will fire a protocol handler).
      data.keepAttr = false;
      return;
    }
  }
});

export function sanitizeHtmlStrict(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: COMMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: COMMENT_ALLOWED_ATTR,
    FORBID_ATTR: ["style", "class", "id"],
    FORBID_TAGS: ["style", "iframe", "script", "object", "embed", "form", "input", "math", "noscript", "template", "svg"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}

// F-6: A much smaller allowlist for theme "custom layout" HTML. Only layout
// primitives are permitted; no media, no links (the chrome is not meant to
// be clickable), no form elements.
const THEME_ALLOWED_TAGS = [
  "div", "span", "nav", "ul", "li", "header", "footer", "section", "aside", "main",
];

export function sanitizeThemeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: THEME_ALLOWED_TAGS,
    ALLOWED_ATTR: [],
    FORBID_ATTR: ["style", "class"],
    FORBID_TAGS: ["script", "iframe", "style", "link", "img", "form", "input", "svg"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
}
