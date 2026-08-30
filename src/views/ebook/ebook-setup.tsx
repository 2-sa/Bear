import { ArrowRight, BookOpen, FolderOpen, Globe2, PackagePlus, ShieldCheck } from "lucide-react";
import "./ebook-setup.css";

export function EBookSetup({ onSetup }: { onSetup: () => void }) {
  const routes = [
    {
      icon: <FolderOpen size={20} />,
      title: "Open a folder",
      text: "Read EPUB, text, Markdown, and HTML books already on this device.",
    },
    {
      icon: <PackagePlus size={20} />,
      title: "Install an extension",
      text: "Add trusted eBook sources from a Bear-compatible repository.",
    },
    {
      icon: <Globe2 size={20} />,
      title: "Connect a source",
      text: "Bring a server-rendered library aboard with your own source configuration.",
    },
  ];

  return (
    <main className="ebook-setup-shell flex-1 overflow-y-auto overflow-x-hidden px-12 pb-16 pt-24">
      <section className="ebook-setup-card">
        <div className="ebook-setup-copy">
          <span className="ebook-setup-kicker">
            <BookOpen size={15} /> Bear reading room
          </span>
          <h1 className="font-display text-[clamp(42px,6vw,74px)] font-medium leading-[0.95] tracking-[-0.045em] text-ink">
            Your shelf is
            <span className="block text-accent">ready for a story.</span>
          </h1>
          <p className="max-w-xl text-balance text-[15.5px] leading-relaxed text-ink-muted">
            Set up at least one readable eBook source to begin. Metadata can describe a book, but a
            folder, extension, or custom source is what lets Bear open it.
          </p>
          <button type="button" onClick={onSetup} className="ebook-setup-primary">
            Set up eBooks <ArrowRight size={18} />
          </button>
          <span className="ebook-setup-trust">
            <ShieldCheck size={15} /> Bear never hosts your books or source files.
          </span>
        </div>

        <div className="ebook-setup-shelf" aria-hidden="true">
          <div className="ebook-setup-lamp"><i /></div>
          <div className="ebook-setup-empty-slot">
            <BookOpen size={34} />
            <span>Reserved for your next book</span>
          </div>
          <div className="ebook-setup-books">
            <i /><i /><i /><i />
          </div>
          <div className="ebook-setup-shelf-edge" />
        </div>
      </section>

      <section className="ebook-setup-routes" aria-label="Ways to add an eBook source">
        {routes.map((route, index) => (
          <button key={route.title} type="button" onClick={onSetup} className="ebook-setup-route">
            <span className="ebook-setup-route-number">0{index + 1}</span>
            <span className="ebook-setup-route-icon">{route.icon}</span>
            <span className="min-w-0 text-start">
              <strong>{route.title}</strong>
              <small>{route.text}</small>
            </span>
            <ArrowRight size={17} className="ebook-setup-route-arrow" />
          </button>
        ))}
      </section>
    </main>
  );
}
