import { getIntlLocale } from '../i18n';

const displayNamesCache = new Map();

function normalizeLanguageTag(code) {
    if (!code || typeof code !== 'string') {
        return '';
    }

    const parts = code.trim().split('-').filter(Boolean);
    if (parts.length === 0) {
        return '';
    }

    const base = parts[0].toLowerCase();
    if (parts.length === 1) {
        return base;
    }

    const subtag = parts[1];
    if (subtag.length === 4) {
        return `${base}-${subtag.charAt(0).toUpperCase()}${subtag.slice(1).toLowerCase()}`;
    }

    return `${base}-${subtag.toUpperCase()}`;
}

export function getLanguageDisplayName(code, language, fallbackName = '') {
    const tag = normalizeLanguageTag(code);
    if (!tag) {
        return fallbackName || '';
    }

    const locale = getIntlLocale(language);
    if (!displayNamesCache.has(locale)) {
        try {
            displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: 'language' }));
        } catch {
            displayNamesCache.set(locale, null);
        }
    }

    const displayNames = displayNamesCache.get(locale);
    const candidates = tag.includes('-') ? [tag, tag.split('-')[0]] : [tag];

    for (const candidate of candidates) {
        const label = displayNames?.of(candidate);
        if (label) {
            return label;
        }
    }

    return fallbackName || code.toUpperCase();
}

export function formatAppLanguageCodes(codes, language) {
    if (!Array.isArray(codes) || codes.length === 0) {
        return null;
    }

    return codes
        .map((code) => getLanguageDisplayName(code, language, code))
        .join(', ');
}
