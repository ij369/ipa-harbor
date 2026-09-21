import { intlStrategy } from './strategies/intl.js';
import { zhStrategy } from './strategies/zh.js';
import { jaStrategy } from './strategies/ja.js';

const strategyByLanguage = new Map([
    ['default', intlStrategy],
    ['en', intlStrategy],
    ['es', intlStrategy],
    ['zh', zhStrategy],
    ['ja', jaStrategy], // 先占
]);

/**
 * 注册语言搜索策略，便于后续扩展新 locale。
 * @param {string|string[]} languageCodes
 * @param {object} strategy
 */
export function registerLocaleSearchStrategy(languageCodes, strategy) {
    const codes = Array.isArray(languageCodes) ? languageCodes : [languageCodes];
    for (const code of codes) {
        strategyByLanguage.set(code.toLowerCase(), strategy);
    }
}

export function resolveLocaleSearchStrategy(languageCode) {
    if (!languageCode || typeof languageCode !== 'string') {
        return strategyByLanguage.get('default');
    }

    const normalized = languageCode.toLowerCase();
    if (strategyByLanguage.has(normalized)) {
        return strategyByLanguage.get(normalized);
    }

    const base = normalized.split('-')[0];
    if (strategyByLanguage.has(base)) {
        return strategyByLanguage.get(base);
    }

    return strategyByLanguage.get('default');
}
