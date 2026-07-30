import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("Arabic UI translates settings, language pickers, and profile-song controls", async (context) => {
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
    ["Storage", "التخزين"],
    ["Sub sources", "مصادر الترجمة"],
    ["Beta", "تجريبي"],
    ["Made with", "صُنع بـ"],
    ["by Bear contributors", "بواسطة مساهمي Bear"],
    ["Know more", "اعرف المزيد"],
    [
      "Bear checks our signed GitHub releases for new versions. Nothing installs until you choose to, and every installer must pass signature verification.",
      "يتحقق Bear من إصداراتنا الموقّعة على GitHub بحثًا عن إصدارات جديدة. لن يُثبَّت أي شيء حتى تختار ذلك، ويجب أن يجتاز كل مُثبّت التحقق من التوقيع.",
    ],
    [
      "Checking our signed GitHub releases for a newer build.",
      "جارٍ التحقق من إصداراتنا الموقّعة على GitHub بحثًا عن إصدار أحدث.",
    ],
    [
      "Search languages (Tamil, Telugu, ...)",
      "ابحث عن اللغات (التاميلية، التيلوغوية، ...)",
    ],
    ["Arabic", "العربية"],
    ["Portuguese (Brazil)", "البرتغالية (البرازيل)"],
    ["Indonesian", "الإندونيسية"],
    ["Circle", "دائرة"],
    ["Square", "مربع"],
    ["P2P & servers", "P2P والخوادم"],
    ["Stream filters", "مرشّحات البث"],
    ["Addon wait time", "مدة انتظار الإضافات"],
    ["60s", "60 ثانية"],
    ["90s", "90 ثانية"],
    ["Bear Relay", "مرحّل Bear"],
    ["Trakt", "تراكت (Trakt)"],
    ["Mark watched on Trakt", "تحديد كمُشاهَد على تراكت"],
    ["Edit", "تعديل"],
    ["MyAnimeList", "ماي أنمي ليست (MAL)"],
    ["Letterboxd", "ليتربوكسد (Letterboxd)"],
    ["My Trakt", "تراكت الخاص بي"],
    ["Trakt anticipated", "المنتظر على تراكت"],
    ["Trakt watchlist", "قائمة مشاهدة تراكت"],
    ["Downloads", "التنزيلات"],
    ["Auto-download", "التنزيل التلقائي"],
    ["No downloads yet", "لا توجد تنزيلات بعد"],
    ["Organize downloads into folders", "تنظيم التنزيلات في مجلدات"],
    ["Notifications", "الإشعارات"],
    ["You are all caught up.", "لا توجد إشعارات جديدة."],
    ["asian drama", "دراما آسيوية"],
    ["debrid support", "دعم ديبريد"],
    ["tv shows", "مسلسلات"],
    ["{n} titles", "{n} عنوانًا"],
    ["Award icons", "أيقونات الجوائز"],
    ["Action", "أكشن"],
    ["Documentary", "وثائقي"],
    ["Science Fiction", "خيال علمي"],
    ["Western", "غربي"],
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
