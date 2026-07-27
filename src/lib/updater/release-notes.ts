export type NoteMedia = {
  src: string;
  kind?: "image" | "sprite";
  alt?: string;
  height?: number;
};

export type NoteSection = { heading?: string; items: string[] };

export type ReleaseNote = {
  title?: string;
  intro?: string;
  media?: NoteMedia;
  sections?: NoteSection[];
};

export async function releaseNote(_version: string | null | undefined): Promise<ReleaseNote | null> {
  return null;
}

export function hasRichNote(n: ReleaseNote | null | undefined): n is ReleaseNote {
  return !!n && !!(n.media || n.title || (n.sections && n.sections.length > 0));
}
