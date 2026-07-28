const CAN = [
  "Any HTML layout: headings, paragraphs, lists, tables, sections, divs.",
  "Any CSS: colors, gradients, grid, flex, animations, web fonts via @import from https.",
  "Images and video from https or data URLs.",
  "Links open in a new tab automatically.",
];

const CANNOT = [
  "No JavaScript. Scripts, inline handlers, and javascript: URLs are removed.",
  "No nested iframes, objects, or embeds.",
  "No forms or popups. The canvas cannot navigate the page.",
];

function List({ items, tone }: { items: string[]; tone: "ok" | "no" }) {
  return (
    <ul className="space-y-1.5">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-ink-muted">
          <span className={tone === "ok" ? "text-success" : "text-ink-subtle"}>{tone === "ok" ? "+" : "-"}</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function CustomizationDocs() {
  return (
    <div className="space-y-4 rounded-[14px] bg-elevated/60 p-4 ring-1 ring-edge-soft">
      <div>
        <h3 className="text-[14px] font-semibold text-ink">How the canvas works</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          Your HTML and CSS render inside a sandboxed frame, fully isolated from the rest of Bear. Write it like a
          tiny self-contained page. Font and page background are separate controls above, applied to the whole profile.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Allowed</div>
          <List items={CAN} tone="ok" />
        </div>
        <div>
          <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-subtle">Not allowed</div>
          <List items={CANNOT} tone="no" />
        </div>
      </div>
      <p className="text-[12px] text-ink-subtle">HTML and CSS are each capped at 16,384 characters.</p>
    </div>
  );
}
