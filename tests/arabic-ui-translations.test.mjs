import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("Arabic UI translates sidebar and profile-song controls", async (context) => {
  const server = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  context.after(() => server.close());

  const { t } = await server.ssrLoadModule("/src/lib/i18n/translate.ts");
  const { setUiLanguage } = await server.ssrLoadModule("/src/lib/i18n/store.ts");
  setUiLanguage("ar");

  const expected = new Map([
    ["nav.catalogs", "الكتالوجات"],
    ["nav.manga", "المانجا"],
    ["Profile songs", "أغاني الملف الشخصي"],
    [
      "People can pin a track to their profile. This controls what happens when you visit one.",
      "يمكن للأشخاص تثبيت مقطع موسيقي في ملفهم الشخصي. يحدد هذا الخيار ما يحدث عند زيارة أحد الملفات.",
    ],
    ["Play automatically", "تشغيل تلقائيًا"],
    ["Only when I press play", "فقط عند الضغط على تشغيل"],
    ["Never", "أبدًا"],
    ["Profile songs stay hidden and never play.", "تبقى أغاني الملف الشخصي مخفية ولا يتم تشغيلها."],
    [
      "You can always mute or stop a song from the card itself.",
      "يمكنك دائمًا كتم الأغنية أو إيقافها من البطاقة نفسها.",
    ],
  ]);

  for (const [key, value] of expected) assert.equal(t(key), value, key);
});
