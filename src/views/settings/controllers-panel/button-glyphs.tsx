import type { Layout } from "./controller-shape";

const XBOX_FACE: Record<string, { color: string; label: string }> = {
  north: { color: "#f2e370", label: "Y" },
  east: { color: "#c94447", label: "B" },
  south: { color: "#78b263", label: "A" },
  west: { color: "#3f95c1", label: "X" },
};

const PS_GLYPH = "#e0e1e9";
const PS_DISC = "#4e5055";
const XBOX_DISC = "#141414";

const SIZE = 26;

function Disc({ fill, children }: { fill: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 32 32" width={SIZE} height={SIZE} className="shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="15" fill={fill} stroke="currentColor" strokeOpacity={0.16} />
      {children}
    </svg>
  );
}

function PsFace({ slot }: { slot: string }) {
  const stroke = { fill: "none", stroke: PS_GLYPH, strokeWidth: 2.2, strokeLinejoin: "round" as const };
  return (
    <Disc fill={PS_DISC}>
      {slot === "north" && <path d="M16 8.5 L23.5 22 L8.5 22 Z" {...stroke} />}
      {slot === "east" && <circle cx="16" cy="16" r="7" {...stroke} />}
      {slot === "west" && <rect x="9.5" y="9.5" width="13" height="13" rx="1.5" {...stroke} />}
      {slot === "south" && (
        <g {...stroke} strokeLinecap="round">
          <path d="M10.5 10.5 L21.5 21.5" />
          <path d="M21.5 10.5 L10.5 21.5" />
        </g>
      )}
    </Disc>
  );
}

function XboxFace({ slot }: { slot: string }) {
  const f = XBOX_FACE[slot];
  return (
    <Disc fill={XBOX_DISC}>
      <text
        x="16"
        y="16.5"
        dominantBaseline="central"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill={f.color}
      >
        {f.label}
      </text>
    </Disc>
  );
}

function Dpad({ vertical }: { vertical?: boolean }) {
  const arm = "fill-ink-muted";
  return (
    <svg viewBox="0 0 32 32" width={SIZE} height={SIZE} className="shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="15" fill={XBOX_DISC} stroke="currentColor" strokeOpacity={0.16} />
      <rect x="13" y="6.5" width="6" height="19" rx="1.6" className={arm} />
      {!vertical && <rect x="6.5" y="13" width="19" height="6" rx="1.6" className={arm} />}
    </svg>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="flex h-[26px] shrink-0 items-center rounded-full bg-canvas px-2.5 text-[11.5px] font-bold tracking-wide text-ink-muted ring-1 ring-inset ring-edge-soft">
      {label}
    </span>
  );
}

function Center({ pad }: { pad: Layout }) {
  return (
    <svg viewBox="0 0 32 32" width={SIZE} height={SIZE} className="shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="15" fill={pad === "ps" ? PS_DISC : XBOX_DISC} stroke="currentColor" strokeOpacity={0.16} />
      {pad === "ps" ? (
        <path d="M13 9.5 L19 9.5 L17.6 22.5 L14.4 22.5 Z" fill={PS_GLYPH} opacity={0.9} />
      ) : (
        <g className="fill-ink-muted">
          <rect x="9.5" y="11" width="13" height="2.2" rx="1.1" />
          <rect x="9.5" y="14.9" width="13" height="2.2" rx="1.1" />
          <rect x="9.5" y="18.8" width="13" height="2.2" rx="1.1" />
        </g>
      )}
    </svg>
  );
}

export type GlyphKind =
  | "dpad"
  | "dpadVertical"
  | "north"
  | "east"
  | "south"
  | "west"
  | "center"
  | "bumpers"
  | "triggers";

export function ButtonGlyph({ kind, pad }: { kind: GlyphKind; pad: Layout }) {
  if (kind === "dpad") return <Dpad />;
  if (kind === "dpadVertical") return <Dpad vertical />;
  if (kind === "center") return <Center pad={pad} />;
  if (kind === "bumpers")
    return (
      <span className="flex items-center gap-1.5">
        <Pill label={pad === "ps" ? "L1" : "LB"} />
        <Pill label={pad === "ps" ? "R1" : "RB"} />
      </span>
    );
  if (kind === "triggers")
    return (
      <span className="flex items-center gap-1.5">
        <Pill label={pad === "ps" ? "L2" : "LT"} />
        <Pill label={pad === "ps" ? "R2" : "RT"} />
      </span>
    );
  return pad === "ps" ? <PsFace slot={kind} /> : <XboxFace slot={kind} />;
}
