// 新增语言：添加 locales/{code}.json（含 _locale）并在下方 import + 注册
import en from '../../locales/en.json';
import zh from '../../locales/zh.json';
import es from '../../locales/es.json';

const localeFiles = [en, zh, es];

// 无 UI 翻译时的 App Store 地区回退
export const browserLanguageStoreRegions = {
    ja: 'jp',
    ko: 'kr',
    fr: 'fr',
    de: 'de',
    pt: 'pt',
    it: 'it',
    ru: 'ru',
    ar: 'sa',
    hi: 'in',
};

function parseLocaleFile(raw) {
    const meta = raw._locale;
    if (!meta?.code || !meta.nativeName || !meta.intlLocale) {
        return null;
    }

    const { _locale, ...translation } = raw;

    return {
        code: meta.code,
        nativeName: meta.nativeName,
        intlLocale: meta.intlLocale,
        defaultStoreRegion: meta.defaultStoreRegion,
        default: Boolean(meta.default),
        order: typeof meta.order === 'number' ? meta.order : 999,
        variants: Array.isArray(meta.variants) && meta.variants.length > 0
            ? meta.variants
            : [meta.code],
        translation,
    };
}

export const languageCatalog = localeFiles
    .map(parseLocaleFile)
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.nativeName.localeCompare(b.nativeName));

if (languageCatalog.length === 0) {
    throw new Error('未注册任何语言，请在 localeFiles 中添加 locales/*.json');
}

export const languageDefinitions = languageCatalog.map(({
    code,
    nativeName,
    intlLocale,
    variants,
    defaultStoreRegion,
    translation,
}) => ({
    code,
    nativeName,
    intlLocale,
    variants,
    defaultStoreRegion,
    translation,
}));

export const defaultLanguage = languageCatalog.find((item) => item.default)?.code
    ?? languageCatalog.find((item) => item.code === 'en')?.code
    ?? languageCatalog[0].code;

const definitionByCode = new Map(
    languageDefinitions.map((definition) => [definition.code, definition])
);

const definitionByVariant = new Map(
    languageDefinitions.flatMap((definition) =>
        definition.variants.map((variant) => [variant, definition])
    )
);

export const languages = languageDefinitions;

export function getLanguageDefinition(code) {
    if (!code || typeof code !== 'string') {
        return definitionByCode.get(defaultLanguage);
    }

    if (definitionByCode.has(code)) {
        return definitionByCode.get(code);
    }

    return definitionByVariant.get(code) ?? definitionByCode.get(defaultLanguage);
}

export function normalizeLanguageCode(code) {
    return getLanguageDefinition(code).code;
}

export function getIntlLocale(language) {
    const definition = getLanguageDefinition(
        typeof language === 'string' ? language : defaultLanguage
    );
    return definition.intlLocale;
}

export function getDefaultStoreRegion(language) {
    return getLanguageDefinition(language).defaultStoreRegion ?? null;
}

export function getBrowserLanguageStoreRegion(langCode) {
    if (!langCode) {
        return null;
    }

    const normalized = langCode.toLowerCase().split('-')[0];
    const fromDefinition = definitionByCode.get(normalized)?.defaultStoreRegion;
    if (fromDefinition) {
        return fromDefinition;
    }

    return browserLanguageStoreRegions[normalized] ?? null;
}

export function buildI18nResources() {
    const resources = {};

    languageDefinitions.forEach((definition) => {
        definition.variants.forEach((variant) => {
            resources[variant] = { translation: definition.translation };
        });
    });

    return resources;
}
