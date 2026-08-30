import type { CSSProperties } from "react";

export function FlameStreak({
  size = 14,
  className,
  style,
}: {
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      className={`harbor-flame ${className ?? ""}`}
      style={style}
    >
      <path
        className="harbor-flame-body"
        fill="currentColor"
        d="M12.6 1.6c.5 2.4.2 4.3-.7 6.1 1-.5 1.7-1.3 2.2-2.4 1 1.5 1.8 2.9 2.5 4.2 1 1.9 1.5 3.4 1.5 4.9a6.1 6.1 0 0 1-12.2 0c0-1.7.6-3.3 1.9-5.2A24 24 0 0 0 9.7 5c.4 1 1 1.8 1.7 2.4.2-2.1.6-4 1.2-5.8Z"
      />
      <path
        className="harbor-flame-core"
        fill="#fff"
        opacity="0.5"
        d="M12 13.1c1.4 1.6 2.1 2.7 2.1 3.8a2.9 2.9 0 0 1-5.8 0c0-1 .5-1.9 1.6-3.2.3.5.7.9 1.1 1.1.1-.6.4-1.2 1-1.7Z"
      />
    </svg>
  );
}
