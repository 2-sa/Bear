import { GitPullRequest } from "lucide-react";
import { GitHubIcon } from "@/components/github-icon";
import { openUrl } from "@/lib/window";

const REPO = "https://github.com/harborstremio/harbor";

export function ContributorCard() {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-elevated p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-canvas text-ink">
          <GitPullRequest size={16} strokeWidth={1.9} />
        </span>
        <div className="flex flex-col gap-1">
          <h3 className="text-[13.5px] font-semibold text-ink">Want to fix it yourself?</h3>
          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            Bear is open source. PRs that reference a bug get reviewed within 48h and ship with credit
            in the release notes.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => openUrl(REPO)}
          className="flex h-9 items-center gap-2 rounded-md bg-raised px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <GitHubIcon size={14} strokeWidth={1.9} />
          Open repo on GitHub
        </button>
        <button
          type="button"
          onClick={() => openUrl(`${REPO}/pulls`)}
          className="flex h-9 items-center gap-2 rounded-md bg-raised px-3 text-[12.5px] font-medium text-ink-muted transition-colors hover:text-ink"
        >
          <GitPullRequest size={14} strokeWidth={1.9} />
          Browse pull requests
        </button>
      </div>
    </div>
  );
}
