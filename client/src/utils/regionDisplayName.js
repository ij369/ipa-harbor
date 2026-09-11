import { getIntlLocale, getBrowserLanguageStoreRegion } from '../i18n';

const displayNamesCache = new Map();

export function getRegionDisplayName(code, language, fallbackName = '') {
    if (!code) {
        return fallbackName || '';
    }

    const locale = getIntlLocale(language);
    if (!displayNamesCache.has(locale)) {
        try {
            displayNamesCache.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
        } catch {
            displayNamesCache.set(locale, null);
        }
    }

    const displayNames = displayNamesCache.get(locale);
    const upperCode = code.toUpperCase();
    return displayNames?.of(upperCode) || fallbackName || upperCode;
}

export function getBrowserRegionCode(availableCodes) {
    if (typeof navigator === 'undefined') {
        return null;
    }

    const locale = navigator.language || '';
    const [lang, region] = locale.split('-');
    const regionCode = region?.toLowerCase();

    if (regionCode && availableCodes.has(regionCode)) {
        return regionCode;
    }

    const langCode = lang?.toLowerCase();
    const fallbackCode = getBrowserLanguageStoreRegion(langCode);
    if (fallbackCode && availableCodes.has(fallbackCode)) {
        return fallbackCode;
    }

    return null;
}

export function resolveRegionScrollTarget(currentRegion, storeRegion, availableCodes) {
    const currentCode = currentRegion || storeRegion;
    if (currentCode && availableCodes.has(currentCode)) {
        return currentCode;
    }

    return getBrowserRegionCode(availableCodes);
}
