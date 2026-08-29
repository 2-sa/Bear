import ar from "./locales/ar";
import pt from "./locales/pt";
import ru from "./locales/ru";
import { registerUiCatalog } from "./translate";

// Desktop's boot decision, imported for its side effect by main.tsx before the
// root mounts, so every catalog is present on the first render exactly as it
// was when translate.ts imported them itself. Keeping the static imports in a
// module of its own is what lets the television entry leave 1.97MB out of its
// render-blocking chunk: rollup only pulls the locale barrels eagerly into the
// entries that can reach this file.
registerUiCatalog("ar", ar);
registerUiCatalog("pt", pt);
registerUiCatalog("ru", ru);
