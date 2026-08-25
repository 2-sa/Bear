type LinkOutActivationEvent = {
  button?: number;
  target: EventTarget | null;
  preventDefault(): void;
};

type LinkTarget = {
  closest?(selector: string): { getAttribute(name: string): string | null } | null;
};

export function handleLinkOutActivation(
  event: LinkOutActivationEvent,
  open: (href: string) => void,
): boolean {
  if (event.button != null && event.button > 1) return false;
  const anchor = (event.target as LinkTarget | null)?.closest?.("a");
  const href = anchor?.getAttribute("href");
  if (!href) return false;
  event.preventDefault();
  open(href);
  return true;
}
