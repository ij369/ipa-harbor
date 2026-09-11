import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import {
    buildI18nResources,
    defaultLanguage,
    languageDefinitions,
    languages,
    normalizeLanguageCode,
    getIntlLocale,
    getLanguageDefinition,
    getDefaultStoreRegion,
    getBrowserLanguageStoreRegion,
    browserLanguageStoreRegions,
} from './languages';

export {
    languageDefinitions,
    languages,
    defaultLanguage,
    normalizeLanguageCode,
    getIntlLocale,
    getLanguageDefinition,
    getDefaultStoreRegion,
    getBrowserLanguageStoreRegion,
    browserLanguageStoreRegions,
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: buildI18nResources(),
        fallbackLng: defaultLanguage,
        lng: localStorage.getItem('language') || defaultLanguage,
        debug: false,
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            lookupLocalStorage: 'language',
        },
    });

export default i18n;
