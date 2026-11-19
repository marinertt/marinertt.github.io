"use strict";

const supportedLanguages = ["en", "de", "ar"];

// Load only English and the selected language; keep loaded bundles for switching.
async function loadTranslations(language) {
  if (i18next.hasResourceBundle(language, "translation")) return;
  const response = await fetch(`locales/${language}.json`);
  if (!response.ok) throw new Error(`Unable to load ${language}: ${response.status}`);
  i18next.addResourceBundle(language, "translation", await response.json());
}

async function selectLanguage(language) {
  const selected = supportedLanguages.includes(language) ? language : "en";
  try {
    await loadTranslations(selected);
    await i18next.changeLanguage(selected);
  } catch (error) {
    console.warn("Using English because the selected translation could not load", error);
    await i18next.changeLanguage("en");
  }
}

async function initializeTranslations() {
  await i18next.init({
    lng: "en",
    fallbackLng: "en",
    supportedLngs: supportedLanguages,
    resources: {},
    keySeparator: false,
    returnEmptyString: false,
    // Translation output uses textContent; comparison cells intentionally embed money markup.
    interpolation: { escapeValue: false },
  });
  await loadTranslations("en");
  const preferred = (navigator.languages || [navigator.language])
    .map((locale) => locale.toLowerCase().split(/[-_]/)[0])
    .find((locale) => supportedLanguages.includes(locale)) || "en";
  await selectLanguage(preferred);
}
