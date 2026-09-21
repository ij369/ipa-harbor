import { getIntlLocale, normalizeLanguageCode } from '../../i18n';
import { getDownloadItemSearchFields } from './downloadItem.js';
import { resolveLocaleSearchStrategy } from './registry.js';
import { intlStrategy } from './strategies/intl.js';

export { registerLocaleSearchStrategy } from './registry.js';
export { getDownloadItemDisplayName, getDownloadItemSearchFields } from './downloadItem.js';
export {
    ALPHABET_INDEX_LETTERS,
    buildAlphabetGroups,
    resolveJumpLetter,
    pickLetterAtClientY,
} from './alphabetIndex.js';

/**
 * 创建当前 UI 语言下的搜索上下文（匹配 + 排序）。
 */
export function createLocaleSearchContext(languageCode) {
    const uiLanguage = normalizeLanguageCode(languageCode);
    const strategy = resolveLocaleSearchStrategy(uiLanguage);
    const collator = new Intl.Collator(getIntlLocale(uiLanguage), {
        sensitivity: 'base',
        numeric: true,
    });

    return {
        uiLanguage,
        strategy,
        collator,

        filterItems(items, rawQuery) {
            const trimmed = rawQuery.trim();
            if (!trimmed) {
                return [...items];
            }

            const queryNormalized = strategy.normalizeQuery(trimmed);

            return items.filter((item) => {
                const fields = getDownloadItemSearchFields(item);
                if (strategy.id === 'zh') {
                    return strategy.itemMatches(fields, trimmed);
                }
                return strategy.itemMatches(fields, trimmed, queryNormalized);
            });
        },

        sortItems(items) {
            return [...items].sort((a, b) => {
                const keyA = strategy.getSortKey(a);
                const keyB = strategy.getSortKey(b);
                const compared = collator.compare(keyA, keyB);
                if (compared !== 0) {
                    return compared;
                }
                return collator.compare(a.name ?? '', b.name ?? '');
            });
        },

        searchItems(items, rawQuery) {
            return this.sortItems(this.filterItems(items, rawQuery));
        },

        getIndexLetter(item) {
            if (typeof strategy.getIndexLetter === 'function') {
                return strategy.getIndexLetter(item);
            }
            return intlStrategy.getIndexLetter(item);
        },
    };
}
