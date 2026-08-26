import { parseExternalLink } from "./external-link-policy";

type LinkOutActivationEvent = {
  button?: number;
  target: EventTarget | null;
  preventDefault(): void;
};

type LinkTarget = {
  closest?(selector: string): { getAttribute(name: string): string | null } | null;
};

export function safeExternalUrl(value: string): string | null {
  const parsed = parseExternalLink(value);
  return parsed.ok ? parsed.link.href : null;
}

export function handleLinkOutActivation(
  event: LinkOutActivationEvent,
  open: (href: string) => void,
): boolean {
  if (event.button != null && event.button > 1) return false;
  const anchor = (event.target as LinkTarget | null)?.closest?.("a");
  const href = anchor?.getAttribute("href");
  if (!href) return false;
  event.preventDefault();
  const safeHref = safeExternalUrl(href);
  if (safeHref) open(safeHref);
  return true;
}
