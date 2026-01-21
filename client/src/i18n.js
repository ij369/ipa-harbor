import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import zhTranslation from '../locales/zh.json';
import enTranslation from '../locales/en.json';

export const languages = [
    {
        code: 'zh',
        nativeName: '简体中文',
        translation: zhTranslation,
        variants: ['zh', 'zh-CN', 'zh-TW', 'zh-HK']
    },
    {
        code: 'en',
        nativeName: 'English',
        translation: enTranslation,
        variants: ['en', 'en-US', 'en-GB']
    }
];

export const defaultLanguage = 'en';

const generateResources = () => {
    const resources = {};
    languages.forEach(lang => {
        lang.variants.forEach(variant => {
            resources[variant] = { translation: lang.translation };
        });
    });
    return resources;
};

// 规范化语言代码
export const normalizeLanguageCode = (code) => {
    const lang = languages.find(l =>
        l.code === code || l.variants.includes(code)
    );
    return lang ? lang.code : defaultLanguage;
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: generateResources(),
        fallbackLng: defaultLanguage,
        lng: localStorage.getItem('language') || defaultLanguage,
        debug: false,

        interpolation: {
            escapeValue: false
        },

        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            lookupLocalStorage: 'language'
        }
    });

export default i18n;
