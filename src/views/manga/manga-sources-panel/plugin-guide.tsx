import { useState } from "react";
import { Blocks, Check, ChevronDown, Copy, Download, FileCode2 } from "lucide-react";
import { CARD } from "./shared";
import { useT } from "@/lib/i18n";

const EXAMPLE_PLUGIN = String.raw`// Bear manga source plugin, minimal annotated example.
//
// This whole file runs as the body of a function that receives one argument named
// harbor. There is no DOM, no fetch, no storage. Reach the network only through
// harbor.http and parse HTML only through harbor.parseHtml.
//
// Replace BASE and the selectors with the real site you are targeting. The structure
// (five required methods + optional tags) is what matters.

const BASE = "https://example-manga-host.test";

async function getDoc(path) {
  const res = await harbor.http(BASE + path, { responseType: "text" });
  if (!res.ok) throw new Error("http " + res.status + " for " + path);
  return harbor.parseHtml(res.body);
}

// Covers and page images MUST be absolute http(s) or Bear drops them.
function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

function cardToSummary(el) {
  const link = el.querySelector("a.cover");
  const img = el.querySelector("img");
  if (!link) return null;
  const href = link.attr("href") || "";
  return {
    // The id is opaque to Bear and handed straight back to detail/chapters.
    id: href.replace(/^\/manga\//, "").replace(/\/$/, ""),
    title: (link.attr("title") || el.querySelector(".title")?.text() || "").trim(),
    cover: abs(img?.attr("data-src") || img?.attr("src")),
  };
}

const plugin = {
  // id must match the manifest id in repo.json.
  id: "example-source",
  name: "Example Source",

  // offset is an item offset (0, 48, 96, ...). tagId is set when the user filters.
  async popular(offset, tagId) {
    const page = Math.floor(offset / 48) + 1;
    const query = tagId ? "&genre=" + encodeURIComponent(tagId) : "";
    const doc = await getDoc("/browse?sort=popular&page=" + page + query);
    return doc.querySelectorAll(".grid .card").map(cardToSummary).filter(Boolean);
  },

  async search(query, offset, tagId) {
    const page = Math.floor(offset / 48) + 1;
    const tag = tagId ? "&genre=" + encodeURIComponent(tagId) : "";
    const doc = await getDoc("/search?q=" + encodeURIComponent(query) + "&page=" + page + tag);
    return doc.querySelectorAll(".grid .card").map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc("/manga/" + id);
    const root = doc.querySelector(".series");
    if (!root) return null;
    return {
      id,
      title: root.querySelector("h1")?.text() || id,
      altTitle: root.querySelector(".alt-title")?.text(),
      cover: abs(root.querySelector("img.poster")?.attr("src")),
      description: root.querySelector(".summary")?.text(),
      status: root.querySelector(".status")?.text(),
      author: root.querySelector(".author")?.text(),
      lastChapter: root.querySelector(".chapter-list li a")?.text(),
    };
  },

  async chapters(id) {
    const doc = await getDoc("/manga/" + id + "/chapters");
    return doc
      .querySelectorAll(".chapter-list li a")
      .map((a) => {
        const href = a.attr("href") || "";
        return {
          // Encode what pageUrls will need (the chapter path) into the id.
          id: href.replace(/^\//, ""),
          chapter: a.attr("data-number") || null,
          title: a.querySelector(".name")?.text(),
          volume: a.attr("data-volume") || null,
          pages: 0,
          language: "en",
          publishAt: a.querySelector(".date")?.attr("datetime") || undefined,
        };
      })
      .filter((c) => c.id);
  },

  async pageUrls(chapterId) {
    // responseType json returns the parsed value directly (or null if invalid).
    const data = await harbor.http(BASE + "/api/" + chapterId + "/pages", { responseType: "json" });
    if (data && Array.isArray(data.images)) return data.images.map(abs).filter(Boolean);
    // Fallback: scrape the reader page. parseHtml cannot see <script> tags, so if the
    // list lived in a script you would regex res.body instead.
    const doc = await getDoc("/" + chapterId);
    return doc
      .querySelectorAll(".reader img")
      .map((img) => abs(img.attr("data-src") || img.attr("src")))
      .filter(Boolean);
  },

  // Optional. Defining tags() shows a genre filter and passes tagId back in.
  async tags() {
    const doc = await getDoc("/genres");
    return doc
      .querySelectorAll(".genre-list a")
      .map((a) => ({ id: (a.attr("href") || "").replace(/^\/genre\//, ""), name: a.text(), group: "Genre" }))
      .filter((t) => t.id && t.name);
  },
};
`;

const EXAMPLE_REPO = `{
  "name": "My Manga Repo",
  "plugins": [
    {
      "id": "example-source",
      "name": "Example Source",
      "version": "1.0.0",
      "lang": "en",
      "nsfw": false,
      "icon": "https://example-manga-host.test/icon.png",
      "entry": "example.plugin.js"
    }
  ]
}
`;

const EBOOK_EXAMPLE_REPO = `{
  "type": "ebook",
  "name": "My eBook Repo",
  "plugins": [
    {
      "id": "example-source",
      "name": "Example Source",
      "version": "1.4.0",
      "lang": "en",
      "nsfw": false,
      "icon": "https://example-ebook-host.test/icon.png",
      "entry": "example.plugin.js"
    }
  ]
}
`;

const API_REFERENCE = String.raw`# Bear manga source plugin API

Bear ships zero sources and hosts nothing. Every source is a plugin you install from a
repo URL you paste in yourself. A plugin is one JavaScript file that runs in a locked-down
Web Worker: no DOM, no fetch, no storage, no Tauri. Its only link to the outside is the
"harbor" bridge Bear injects. You implement one object, MangaProvider, and Bear drives
it.

## 1. The MangaProvider interface

    type MangaProvider = {
      id: string;
      name: string;
      popular(offset: number, tagId?: string): Promise<MangaSummary[]>;
      search(query: string, offset: number, tagId?: string): Promise<MangaSummary[]>;
      detail(id: string): Promise<MangaSummary | null>;
      chapters(id: string): Promise<MangaChapter[]>;
      pageUrls(chapterId: string): Promise<string[]>;
      tags?(): Promise<MangaTag[]>;
    };

- offset is an item offset, not a page number. Page one is 0, page two is 48 (MANGA_PAGE).
  If your backend pages by number, divide by 48.
- tagId is set when the user filters by a tag. Defining tags() turns on that filter.
- id values are opaque to Bear and handed straight back to detail, chapters, and
  pageUrls. Encode whatever you need into them (slug, numeric id, path).

## 2. Return shapes

    type MangaSummary = {
      id: string;             // required, your stable identifier
      title: string;          // required
      altTitle?: string;
      cover?: string;         // MUST be an absolute http(s) URL or it is dropped
      year?: number;
      status?: string;        // e.g. "ongoing" | "completed"
      description?: string;
      contentRating?: string;
      lastChapter?: string;
      author?: string;
    };

    type MangaChapter = {
      id: string;             // required
      chapter: string | null; // chapter number as a string, or null
      title?: string;
      volume?: string | null;
      pages: number;          // integer >= 0; 0 is fine if unknown
      language: string;       // ISO code, defaults to "en"
      group?: string;         // scanlation group
      publishAt?: string;     // date string
    };

    type MangaTag = { id: string; name: string; group?: string };

Bear sanitizes everything you return. Hard rules:
- Summaries missing id or title are dropped. Chapters missing id are dropped.
- cover and every pageUrls entry must be absolute http(s). Resolve relative URLs yourself.
  Do not set chapter.downloaded.
- Result counts cap at: summaries 500, chapters 5000, page URLs 2000, tags 1000.

## 3. The host bridge (the "harbor" object)

    harbor.http(url, opts)     // mediated network request
    harbor.parseHtml(html)     // parse HTML into a queryable tree
    harbor.register(provider)  // register your provider (alternative to a global)
    harbor.log(...args)        // debug log

harbor.http(url, opts) => Promise. opts (all optional):

    { method?: string,                             // default GET
      headers?: Record<string, string>,
      body?: string,                               // ignored on GET/HEAD
      responseType?: "text" | "json" | "base64",   // default text
      timeoutMs?: number }                         // clamped 1000..45000, default 20000

Returns:
- text / base64: { status, ok, headers, body }. base64 body is base64 bytes (binary).
- json: the already-parsed value, or null if the body was not valid JSON.

Host rules for harbor.http:
- http(s) only. Private, loopback, and link-local hosts are blocked.
- These request headers are stripped: host, cookie, authorization, origin, referer,
  content-length, connection, and anything starting with sec- or x-harbor. You can set
  user-agent.
- Cookies are never sent. The response body is capped at 8 MB.
- At most 6 in-flight harbor.http calls per plugin. Batch with care.

harbor.parseHtml(html) => Promise<HDocument>. The host strips script, style, and iframe
tags before you see the tree, so you CANNOT read data hidden in a script tag this way. For
that, fetch as text and regex the raw body instead.

    const doc = await harbor.parseHtml(res.body);
    doc.querySelector(sel);     // HElement | null
    doc.querySelectorAll(sel);  // HElement[]
    el.text();                  // text content, collapsed and trimmed
    el.attr(name);              // attribute value, or null

Supported selectors: tag, #id, .class (stacked .a.b), *, [attr], [attr=v], [attr*=v],
[attr^=v], [attr$=v], [attr~=v], descendant (space), child (>), groups (a, b).
Not supported: sibling combinators (+ ~), pseudo-classes (:not, :nth-child), case-
insensitive attribute flags. Keep selectors simple.

## 4. The worker environment

Available: the harbor bridge, standard JS built-ins (Object, Array, JSON, Math, Date,
Promise, RegExp, Map, Set, and the rest), timers, TextEncoder/TextDecoder, atob/btoa, URL,
URLSearchParams, crypto, console (DevTools only).

Not available (removed or undefined): fetch, XMLHttpRequest, WebSocket, importScripts,
indexedDB, localStorage, Worker, self, globalThis, window, document, location, navigator,
postMessage. Do all networking through harbor.http and all parsing through harbor.parseHtml.

Per-method host timeouts: popular/search/detail 20s, chapters 25s, pageUrls 30s, tags 15s.
Exceed it and the worker is torn down and the call rejects.

## 5. Writing the file

Your file runs as the body of a function that receives harbor. Register your provider
either by declaring a top-level "plugin" object, or by calling harbor.register(...). If you
do both, harbor.register wins. The object must have id, name, and the five required
methods, or install fails with "plugin registered no provider".

Constraints: source under 2 MB; rely on no global except harbor and the built-ins; keep
methods idempotent and side-effect free (workers are warmed and respawned freely).

## 6. The repo / manifest format

A repo is a JSON file you host anywhere. Users paste its URL into Bear.

    {
      "name": "My Manga Repo",
      "plugins": [
        {
          "id": "my-source",                 // must match your provider id
          "name": "My Source",
          "version": "1.0.0",
          "lang": "en",
          "nsfw": false,
          "icon": "https://example.com/icon.png",
          "entry": "my-source.plugin.js"      // absolute, or relative to the repo URL
        }
      ]
    }

- entry resolves with new URL(entry, repoUrl), so a filename next to repo.json works.
- Only id, name, and entry are required per plugin. Missing any of the three: skipped.
- The repo JSON and every plugin file go through the same host safety checks.

## 7. Hosting and adding

Serve repo.json and each plugin JS from any static HTTPS host (GitHub Pages,
raw.githubusercontent.com, an object store, your own server). The simplest layout is
repo.json and the plugin files side by side in one folder.

In Bear: Manga > Set up a source > Extensions > paste your repo.json URL > Install. On
install Bear fetches the source, hashes it (SHA-256), spins up a throwaway worker to
confirm it registers a valid provider, then stores it. Enabled plugins load on startup as
sources of kind "plugin", exactly like the built-in Suwayomi and local folder sources.

## 8. Debugging checklist

- "plugin registered no provider": no top-level plugin and no harbor.register call, or the
  object is missing id/name.
- A row is empty: items failed sanitization, usually a relative cover or page URL. Make
  them absolute http(s).
- A method never returns: you hit a method timeout, or the 6-concurrent harbor.http limit
  and later calls queued behind rejected ones.
- HTML data missing: it lived in a stripped tag (script/style/iframe). Regex the raw text
  body instead of parseHtml.
- ReferenceError on fetch/window/document: not available. Use harbor.http / harbor.parseHtml.
`;

function saveFile(name: string, text: string, type: string) {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    void navigator.clipboard?.writeText(text);
  }
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[13px] font-bold text-accent">
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[14.5px] font-semibold text-ink">{title}</span>
        <span className="text-[13.5px] leading-relaxed text-ink-muted">{body}</span>
      </div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="max-h-80 overflow-auto rounded-xl bg-canvas p-4 ring-1 ring-edge-soft">
      <pre className="whitespace-pre text-[11.5px] leading-relaxed text-ink-muted">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function asEBook(text: string): string {
  return text
    .replaceAll("MangaProvider", "EBookProvider")
    .replaceAll("MangaSummary", "EBookSummary")
    .replaceAll("MangaChapter", "EBookChapter")
    .replaceAll("MangaTag", "EBookTag")
    .replaceAll("MANGA_PAGE", "EBOOK_PAGE")
    .replaceAll("manga", "ebook")
    .replaceAll("Manga", "eBook");
}

function asEBookPlugin(text: string): string {
  const converted = asEBook(text)
    .replace(
      "Covers and page images MUST be absolute http(s) or Harbor drops them.",
      "Covers MUST be absolute http(s) or Harbor drops them.",
    )
    .replace(
      "function cardToSummary(el) {",
      `function cleanTitle(value) {
  return (value || "")
    .replace(/[^\\p{L}\\p{N}'’]+/gu, " ")
    .replace(/\\s+(?:kol|كول)$/iu, "")
    .replace(/\\s+/g, " ")
    .trim();
}

function cardToSummary(el) {`,
    )
    .replace(
      '  const href = link.attr("href") || "";',
      `  const rawTitle = (link.attr("title") || el.querySelector(".title")?.text() || "").trim();
  const href = link.attr("href") || "";`,
    )
    .replace(
      '    title: (link.attr("title") || el.querySelector(".title")?.text() || "").trim(),',
      "    title: cleanTitle(rawTitle),",
    )
    .replace(
      "    title: cleanTitle(rawTitle),",
      `    title: cleanTitle(rawTitle),
    // Metadata hints are optional. Exact IDs beat title matching when the source has them.
    seriesTitle: el.attr("data-series-title") || undefined,
    altTitles: (el.attr("data-alt-titles") || "").split("|").filter(Boolean),
    isbn: el.attr("data-isbn") || undefined,
    googleBooksId: el.attr("data-google-books-id") || undefined,
    openLibraryId: el.attr("data-open-library-id") || undefined,
    wikidataId: el.attr("data-wikidata-id") || undefined,
    anilistId: Number(el.attr("data-anilist-id")) || undefined,`,
    )
    .replace(
      '    cover: abs(img?.attr("data-src") || img?.attr("src")),',
      `    cover: abs(img?.attr("data-src") || img?.attr("src")),
    // Customize these selectors/markers for the site. Harbor drops true entries.
    isFanMade:
      !!el.querySelector("[data-edition='fan'], .fan-edition") ||
      /(?:fan[ -]?made|fan edition|نسخة\\s*الفان)/iu.test(rawTitle),`,
    )
    .replace(
      '      title: root.querySelector("h1")?.text() || id,',
      '      title: cleanTitle(root.querySelector("h1")?.text() || id),',
    )
    .replace(
      '      title: cleanTitle(root.querySelector("h1")?.text() || id),',
      `      title: cleanTitle(root.querySelector("h1")?.text() || id),
      // Send every identifier the site exposes. Omit unknown values; never invent IDs.
      seriesTitle: root.querySelector(".series-title")?.text(),
      altTitles: root.querySelectorAll(".alt-title").map((node) => node.text()).filter(Boolean),
      isbn: root.attr("data-isbn") || undefined,
      googleBooksId: root.attr("data-google-books-id") || undefined,
      openLibraryId: root.attr("data-open-library-id") || undefined,
      wikidataId: root.attr("data-wikidata-id") || undefined,
      anilistId: Number(root.attr("data-anilist-id")) || undefined,`,
    )
    .replace(
      '      lastChapter: root.querySelector(".chapter-list li a")?.text(),',
      `      chapters: Number(root.attr("data-chapters")) || undefined,
      volumes: Number(root.attr("data-volumes")) || undefined,`,
    )
    .replace(
      "  async chapters(id) {",
      `  // Flat shape: return the source's explicit volume on every chapter. "0" is a
  // valid first volume. Never derive a volume from words in the chapter title.
  // Harbor also accepts [{ volume: "0", chapters: [...] }, ...].
  async chapters(id) {`,
    )
    .replace(
      '.map((a) => {\n        const href = a.attr("href") || "";',
      `.map((a, position) => {
        const href = a.attr("href") || "";`,
    )
    .replace(
      '          volume: a.attr("data-volume") || null,',
      `          // Keep the site's value stable: "0", "1", "2", and so on.
          volume: a.attr("data-volume") ?? undefined,
          // Optional exact source title, e.g. "المجلد الأول: طبيعة الشيطان لا تتغير".
          volumeTitle: a.attr("data-volume-title") || undefined,`,
    )
    .replace(
      '          chapter: a.attr("data-number") || null,',
      `          chapter: a.attr("data-number") || undefined,
          // Zero-based reading position. Reverse newest-first source lists before mapping.
          position,`,
    )
    .replace(
      '          publishAt: a.querySelector(".date")?.attr("datetime") || undefined,',
      `          publishAt: a.querySelector(".date")?.attr("datetime") || undefined,
          // Use a number or the source's text count, such as "1.2K".
          views: a.querySelector(".views")?.text().replace(/\\s*views?$/i, "").trim() || undefined,`,
    );
  const start = converted.indexOf("  async pageUrls(chapterId) {");
  const end = converted.indexOf("\n\n  // Optional.", start);
  if (start < 0 || end < 0) return converted;
  return `${converted.slice(0, start)}  async content(chapterId) {
    const doc = await getDoc("/" + chapterId);
    return doc.querySelector(".chapter-content")?.text() || "";
  },${converted.slice(end)}`;
}

const EBOOK_API_REFERENCE = String.raw`# Harbor eBook source plugin API

An eBook plugin is one JavaScript file running in Harbor's isolated worker. It has no DOM,
fetch, storage, files, or Tauri access. Networking and HTML parsing go through harbor.

    type EBookProvider = {
      id: string;
      name: string;
      popular(offset: number, tagId?: string): Promise<EBookSummary[]>;
      search(query: string, offset: number, tagId?: string): Promise<EBookSummary[]>;
      detail(id: string): Promise<EBookSummary | null>;
      chapters(id: string): Promise<Array<EBookChapter | EBookVolume>>;
      content(chapterId: string): Promise<string | { text?: string; images?: string[] }>;
      tags?(): Promise<EBookTag[]>;
    };

    type EBookChapter = {
      id: string;
      chapter?: string;
      title?: string;
      position?: number;
      volume?: string;
      volumeTitle?: string;
      publishAt?: string;
      views?: number | string;
    };

    type EBookVolume = {
      volume: string;
      volumeTitle?: string;
      chapters: EBookChapter[];
    };

    type EBookSummary = {
      id: string;
      title: string;
      seriesTitle?: string;
      altTitle?: string;
      altTitles?: string[];
      author?: string;
      authors?: string[];
      anilistId?: number;
      googleBooksId?: string;
      openLibraryId?: string;
      wikidataId?: string;
      isbn?: string;
      cover?: string;
      description?: string;
      year?: number;
      status?: string;
      genres?: string[];
      chapters?: number;
      volumes?: number;
      siteUrl?: string;
      isFanMade?: boolean;
    };

EBookSummary requires id and title. It may include altTitle, cover, year, status,
description, author or authors, genres, chapters, volumes, siteUrl, and isFanMade. Covers
and siteUrl must be absolute HTTP(S) URLs. Set isFanMade: true from the source site's own
edition badge or metadata and Harbor will discard that entry. If a site only marks fan
editions in titles, detect that site's marker in the plugin and set isFanMade rather than
making Harbor guess. Return the canonical title; Harbor also normalizes punctuation used
as word separators and removes trailing source branding such as "kol"/"كول" before
metadata matching.

Before Harbor renders a source result, it resolves metadata in this order:

1. anilistId, when supplied by the source.
2. AniList exact normalized title, seriesTitle, and alternate-title matching.
3. googleBooksId or isbn, then Google Books exact title and alternate-title matching.
4. openLibraryId or isbn, then Open Library exact title and alternate-title matching.
5. wikidataId, then Wikidata exact label and alias matching.

Return identifiers only when they are explicitly present in the source. anilistId is the
numeric AniList media ID. openLibraryId is the work ID with or without the /works/ prefix.
googleBooksId is the Google Books volume ID and wikidataId is a Q-prefixed Wikidata item ID.
isbn accepts ISBN-10 or ISBN-13; separators are allowed. seriesTitle groups separate books
or volumes under one canonical work. altTitle accepts one alias; altTitles accepts all
known language/native aliases. Better source hints mean fewer metadata requests and avoid
wrong matches. Harbor preserves the source id and chapter route while replacing display
metadata with the resolved canonical record. If no metadata provider matches, Harbor
shows the clean source record unchanged.

EBookChapter requires id. chapter is the chapter number or source label. position is the
zero-based reading position, where lower values are earlier. Supply position for every
chapter or omit it from every chapter. When every chapter has a position, Harbor uses that
exact order. Without positions, Harbor sorts numbered chapters numerically, followed by
unnumbered chapters in natural title order. views accepts a number or the source's text
count. publishAt accepts the source's date string.

Return volume data in one of these two forms:

    // Flat: repeat the explicit source volume on every chapter.
    [{
      id: "v0-c1",
      volume: "0",
      volumeTitle: "Volume One: The Beginning",
      chapter: "1",
      position: 0,
      title: "Chapter 1",
      views: 1200
    }]

    // Nested: put each source volume around its chapters.
    [{
      volume: "0",
      volumeTitle: "Volume One: The Beginning",
      chapters: [{ id: "v0-c1", chapter: "1", position: 0, title: "Chapter 1", views: "1.2K" }]
    }]

Volume "0" is valid. Keep volume identifiers stable and return every source volume,
including volumes with one chapter or more than 1000 chapters. Do not derive volume data
from chapter titles. Omit volume only when the source has no volume structure. Do not
return volume headers as fake chapters. volumeTitle is optional and must contain the
source's real volume name. Harbor displays it in the volume picker; volumes without a
title keep the generated Volume N label.

Harbor groups chapters by the supplied volume and sorts numbered volumes numerically.
content() returns readable text, or an object containing text and/or absolute HTTP(S)
image URLs.

Use harbor.http(url, opts) for requests and harbor.parseHtml(html) for selector parsing.
harbor.http supports method, headers, body, responseType (text, json, or base64), and
timeoutMs. Private, loopback, and link-local hosts are blocked; cookies and sensitive
headers are stripped. harbor.parseHtml exposes querySelector, querySelectorAll, text(),
and attr(name). Script, style, and iframe nodes are removed.

Register a top-level plugin object or call harbor.register(provider). Host repo.json and
the plugin file on HTTPS, then paste the manifest URL into eBook > Sources > Extensions.

    {
      "type": "ebook",
      "name": "My eBook Repo",
      "plugins": [{
        "id": "my-source",
        "name": "My Source",
        "version": "1.4.0",
        "lang": "en",
        "nsfw": false,
        "entry": "my-source.plugin.js"
      }]
    }

The provider id must match the manifest id. repo.json contains installation metadata
only. Return book metadata hints, volumes, chapters, dates, and views from
example.plugin.js. Source files are
limited to 2 MB. Harbor validates popular, search, detail, chapters, and content during
installation. Existing image-based plugins using pageUrls remain supported for
compatibility.`;

export function PluginGuide({ kind = "manga" }: { kind?: "manga" | "ebook" }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState("");
  const ebook = kind === "ebook";
  const examplePlugin = ebook ? asEBookPlugin(EXAMPLE_PLUGIN) : EXAMPLE_PLUGIN;
  const exampleRepo = ebook ? EBOOK_EXAMPLE_REPO : EXAMPLE_REPO;
  const apiReference = ebook ? EBOOK_API_REFERENCE : API_REFERENCE;

  const copy = (what: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied(""), 1600);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="mt-2 px-1 text-[12.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
        {t("Make your own source")}
      </p>
      <div className={`transition-all ${open ? "ring-edge" : "hover:ring-edge"} ${CARD}`}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-4 px-5 py-4 text-start active:scale-[0.99]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-canvas text-ink-muted ring-1 ring-edge-soft">
            <Blocks size={20} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-semibold text-ink">{t("Build a source plugin")}</span>
            <span className="truncate text-[13px] text-ink-muted">
              {t("Write a scraper for any site, host it, and install it like any other plugin")}
            </span>
          </span>
          <ChevronDown
            size={20}
            className={`shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="flex flex-col gap-6 border-t border-edge-soft p-5">
            <div className="flex flex-col gap-4">
              <Step
                n={1}
                title={t("Write one JavaScript file")}
                body={t(
                  `Implement the ${ebook ? "EBookProvider" : "MangaProvider"} object: popular, search, detail, chapters, ${ebook ? "content" : "pageUrls"}, and optional tags. Nothing else.`,
                )}
              />
              <Step
                n={2}
                title={t("Use the harbor bridge")}
                body={t(
                  "Reach the network with harbor.http(url, opts) and parse HTML with harbor.parseHtml(html). There is no fetch, DOM, or storage in the sandbox.",
                )}
              />
              <Step
                n={3}
                title={t("Host it with a repo.json")}
                body={t(
                  "Put your plugin file and a repo.json manifest on any static HTTPS host: GitHub Pages, a raw gist, an object store, your own server.",
                )}
              />
              <Step
                n={4}
                title={t("Install it in Extensions")}
                body={t(
                  "Paste your repo.json URL into Extensions above, then install. That is how you bring any site's sources back.",
                )}
              />
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
                  <FileCode2 size={15} /> example.plugin.js
                </span>
                <button
                  type="button"
                  onClick={() => copy("plugin", examplePlugin)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-ink-subtle transition-colors hover:text-ink"
                >
                  {copied === "plugin" ? (
                    <Check size={14} strokeWidth={2.6} className="text-accent" />
                  ) : (
                    <Copy size={13} />
                  )}
                  {copied === "plugin" ? t("Copied") : t("Copy")}
                </button>
              </div>
              <CodeBlock code={examplePlugin} />
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted">
                  <FileCode2 size={15} /> repo.json
                </span>
                <button
                  type="button"
                  onClick={() => copy("repo", exampleRepo)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12.5px] font-medium text-ink-subtle transition-colors hover:text-ink"
                >
                  {copied === "repo" ? (
                    <Check size={14} strokeWidth={2.6} className="text-accent" />
                  ) : (
                    <Copy size={13} />
                  )}
                  {copied === "repo" ? t("Copied") : t("Copy")}
                </button>
              </div>
              <CodeBlock code={exampleRepo} />
              {ebook && (
                <p className="text-[12px] leading-relaxed text-ink-subtle">
                  {t(
                    "repo.json identifies and versions the plugin. Filtering, title cleanup, volumes, chapters, dates, and views are returned by example.plugin.js.",
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() =>
                  saveFile(`harbor-${kind}-plugin-api.md`, apiReference, "text/markdown")
                }
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-[14px] font-semibold text-canvas transition-all hover:opacity-90 active:scale-95"
              >
                <Download size={17} strokeWidth={2.2} />
                {t("Download full API reference")}
              </button>
              <button
                type="button"
                onClick={() => saveFile("example.plugin.js", examplePlugin, "text/javascript")}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-raised px-5 text-[14px] font-semibold text-ink-muted ring-1 ring-edge-soft transition-all hover:text-ink active:scale-95"
              >
                <Download size={16} />
                example.plugin.js
              </button>
              <button
                type="button"
                onClick={() => saveFile("repo.json", exampleRepo, "application/json")}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-raised px-5 text-[14px] font-semibold text-ink-muted ring-1 ring-edge-soft transition-all hover:text-ink active:scale-95"
              >
                <Download size={16} />
                repo.json
              </button>
            </div>

            <p className="text-[12.5px] leading-relaxed text-ink-subtle">
              {t(
                "Plugins run sandboxed in an isolated worker with no access to your files, accounts, or the rest of Bear. What a plugin scrapes is between you and the site it targets. Only install plugins from repositories you trust.",
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
