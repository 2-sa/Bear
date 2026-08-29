import { Check, ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string };

const MENU_MAX = 320;

export function Dropdown({
  value,
  options,
  onChange,
  placeholder,
  className = "",
  size = "md",
}: {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const natural = options.length * 40 + 8;
      const desired = Math.min(natural, 360, window.innerHeight * 0.6) + 10;
      const below = window.innerHeight - rect.bottom;
      const above = rect.top;
      setDropUp(below < desired && above > below);
      setAlignEnd(window.innerWidth - rect.left < MENU_MAX + 24);
    }
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, options.length]);

  const chevRef = useRef<HTMLSpanElement>(null);
  const spinChevron = (next: boolean) => {
    const chev = chevRef.current;
    if (!chev) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const from = next ? 0 : 180;
    const to = next ? 180 : 0;
    chev.animate(
      [
        { transform: `rotate(${from}deg) scale(1, 1)` },
        { transform: `rotate(${(from + to) / 2}deg) scale(1.2, 0.8)`, offset: 0.42 },
        { transform: `rotate(${to + (next ? 12 : -12)}deg) scale(0.94, 1.08)`, offset: 0.72 },
        { transform: `rotate(${to}deg) scale(1, 1)` },
      ],
      { duration: 400, easing: "ease-in-out" },
    );
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          spinChevron(!open);
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 rounded-md outline-none transition-colors ${
          size === "sm" ? "h-9 px-3 text-[12.5px]" : "h-11 px-3.5 text-[13.5px]"
        } ${open ? "bg-raised" : "bg-canvas hover:bg-elevated"}`}
      >
        <span className={`truncate ${selected ? "text-ink" : "text-ink-subtle"}`}>
          {selected?.label ?? placeholder ?? ""}
        </span>
        <span
          ref={chevRef}
          aria-hidden
          className="shrink-0 text-ink-subtle"
          style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDown size={16} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          style={{ maxWidth: `min(${MENU_MAX}px, calc(100vw - 2rem))` }}
          className={`absolute z-50 max-h-[min(360px,60vh)] w-max min-w-full overflow-y-auto rounded-md bg-elevated p-1 shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)] ${
            alignEnd ? "end-0" : "start-0"
          } ${
            dropUp ? "bottom-[calc(100%+6px)] animate-menu-in-up" : "top-[calc(100%+6px)] animate-menu-in"
          }`}
        >
          {options.map((o, i) => {
            const active = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={active}
                data-selected={active}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                style={{ animationDelay: `${Math.min(i, 8) * 22}ms` }}
                className={`animate-item-in flex w-full items-center justify-between gap-3 rounded-[4px] px-3 text-start transition-colors ${
                  size === "sm" ? "h-9 text-[12.5px]" : "h-10 text-[13.5px]"
                } ${
                  active ? "bg-ink font-semibold text-canvas" : "text-ink-muted hover:bg-raised hover:text-ink"
                }`}
              >
                <span className="truncate">{o.label}</span>
                {active && (
                  <Check size={15} strokeWidth={2.4} className="animate-badge-pop shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
