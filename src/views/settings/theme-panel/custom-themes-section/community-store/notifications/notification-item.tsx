import { ArrowDownToLine, MessageSquare, Star } from "lucide-react";
import type { ThemeNotification } from "@/lib/theme-store";
import { timeAgo } from "../time-ago";

function describe(n: ThemeNotification): { Icon: typeof Star; text: string } {
  if (n.type === "downloads") return { Icon: ArrowDownToLine, text: `hit ${n.count ?? 0} downloads` };
  if (n.type === "stars") return { Icon: Star, text: `reached ${n.count ?? 0} five-star ratings` };
  return { Icon: MessageSquare, text: `${n.actor || "Someone"} left a comment` };
}

export function NotificationItem({ n, onOpen }: { n: ThemeNotification; onOpen: () => void }) {
  const { Icon, text } = describe(n);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface ${n.read ? "" : "bg-accent-soft"}`}
    >
      <span className="relative grid h-10 w-12 shrink-0 place-items-center overflow-hidden rounded-[4px] bg-elevated">
        {n.cover ? (
          <img src={n.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Icon size={16} className="text-ink-subtle" />
        )}
        {n.cover && (
          <span className="absolute end-0.5 bottom-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/60 text-white backdrop-blur-sm">
            <Icon size={9} strokeWidth={2.4} />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12.5px] leading-snug text-ink">
          <span className="font-semibold">{n.themeName}</span> {text}
        </span>
        <span className="text-[11.5px] text-ink-subtle">{timeAgo(n.createdAt)}</span>
      </span>
      {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
    </button>
  );
}
