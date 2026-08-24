// Newly introduced safe UI copy remains usable until each locale provides an override.
// Locale-specific dictionaries are spread after this fallback and always take precedence.
const uiFallback: Record<string, string> = {
  "14s": "14s",
  "20s": "20s",
  "Addons ({n})": "Addons ({n})",
  "All selected": "All selected",
  "Apply and reload": "Apply and reload",
  "Changing the metadata language reloads Bear so the new language takes effect. Apply when you're done with the options above.":
    "Changing the metadata language reloads Bear so the new language takes effect. Apply when you're done with the options above.",
  "Choose source": "Choose source",
  Colored: "Colored",
  "Content Advisory": "Content Advisory",
  "Content advisory style": "Content advisory style",
  "Could not reach the extension list. Check your server connection and try again.":
    "Could not reach the extension list. Check your server connection and try again.",
  "Couldn't save the playlist. Free up storage space in Settings and try again.":
    "Couldn't save the playlist. Free up storage space in Settings and try again.",
  "Cursor speed": "Cursor speed",
  "Data copied from {name}": "Data copied from {name}",
  "Everything you pick is saved into one file. Restoring it later only touches what is in the file. Your Stremio sign-in is always left out.":
    "Everything you pick is saved into one file. Restoring it later only touches what is in the file. Your Stremio sign-in is always left out.",
  "Export your Bear setup to a single file — pick exactly what goes in. Restore brings back only what the file contains. Your Stremio sign-in is always left out.":
    "Export your Bear setup to a single file — pick exactly what goes in. Restore brings back only what the file contains. Your Stremio sign-in is always left out.",
  "Export your setup": "Export your setup",
  "Export {n} sections": "Export {n} sections",
  "Favorites ({n})": "Favorites ({n})",
  "How quickly the Bear cursor moves with the right stick.":
    "How quickly the Bear cursor moves with the right stick.",
  "Import data from {name}": "Import data from {name}",
  "Instant playback preparation": "Instant playback preparation",
  "Keyboard size": "Keyboard size",
  "Latest chapters": "Latest chapters",
  "Loads a backup file and restores exactly what it contains, without touching the rest of your setup. Your Stremio sign-in on this device stays as is.":
    "Loads a backup file and restores exactly what it contains, without touching the rest of your setup. Your Stremio sign-in on this device stays as is.",
  "Monochrome (White)": "Monochrome (White)",
  "New releases": "New releases",
  "On shows titles in your metadata language (English by default). Off keeps titles in English.":
    "On shows titles in your metadata language (English by default). Off keeps titles in English.",
  "Pick what to save, then everything you choose lands in one file: theme, home layout, settings, addons, profiles, watchlist, player layouts, watch progress, and more. Your Stremio sign-in is left out on purpose.":
    "Pick what to save, then everything you choose lands in one file: theme, home layout, settings, addons, profiles, watchlist, player layouts, watch progress, and more. Your Stremio sign-in is left out on purpose.",
  "Player screen lock": "Player screen lock",
  "Replace selected data?": "Replace selected data?",
  "Saved {when} from Bear {app}. Your Stremio sign-in stays as is.":
    "Saved {when} from Bear {app}. Your Stremio sign-in stays as is.",
  "Show a lock control in the player that blocks mouse, keyboard, remote, and media-key input until you unlock it.":
    "Show a lock control in the player that blocks mouse, keyboard, remote, and media-key input until you unlock it.",
  "Size of the controller on-screen keyboard.": "Size of the controller on-screen keyboard.",
  "Source extension": "Source extension",
  "Switch to sharing? This profile will use {name}'s library, watchlist and addons. Its own data is kept but hidden until you switch back.":
    "Switch to sharing? This profile will use {name}'s library, watchlist and addons. Its own data is kept but hidden until you switch back.",
  "This file restores its {n} saved entries and replaces only those parts of your setup. Anything it does not contain stays exactly as it is.":
    "This file restores its {n} saved entries and replaces only those parts of your setup. Anything it does not contain stays exactly as it is.",
  Unlink: "Unlink",
  "Use color to distinguish severity, or keep every advisory monochrome.":
    "Use color to distinguish severity, or keep every advisory monochrome.",
  "Watched history": "Watched history",
  "Watchlist ({n})": "Watchlist ({n})",
  "What should the backup include?": "What should the backup include?",
  "When a movie or episode starts, briefly show its Common Sense Media parental guide (violence, nudity, profanity, substances) with severity. Fades on its own.":
    "When a movie or episode starts, briefly show its Common Sense Media parental guide (violence, nudity, profanity, substances) with severity. Fades on its own.",
  "{n} of {total} chosen": "{n} of {total} chosen",
  "{n} px/s": "{n} px/s",
};

export default uiFallback;
