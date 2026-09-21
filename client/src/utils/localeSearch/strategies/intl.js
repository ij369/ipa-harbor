import { getDownloadItemDisplayName } from '../downloadItem.js';

/** 去除组合音标，便于西语等带重音字符的模糊匹配 */
export function normalizeLatinText(value) {
    return String(value)
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
}

export function createIntlStrategy() {
    return {
        id: 'intl',

        normalizeQuery(query) {
            return normalizeLatinText(query.trim());
        },

        fieldMatches(field, rawQuery, normalizedQuery) {
            const text = String(field);
            if (text.includes(rawQuery.trim())) {
                return true;
            }
            if (!normalizedQuery) {
                return true;
            }
            return normalizeLatinText(text).includes(normalizedQuery);
        },

        itemMatches(fields, rawQuery, normalizedQuery) {
            const trimmed = rawQuery.trim();
            if (!trimmed) {
                return true;
            }
            return fields.some((field) => this.fieldMatches(field, trimmed, normalizedQuery));
        },

        getSortKey(item) {
            return getDownloadItemDisplayName(item);
        },

        getIndexLetter(item) {
            const sortKey = this.getSortKey(item).trim();
            if (!sortKey) {
                return '#';
            }

            const first = normalizeLatinText(sortKey.charAt(0)).toUpperCase();
            if (first >= 'A' && first <= 'Z') {
                return first;
            }

            return '#';
        },
    };
}

export const intlStrategy = createIntlStrategy();
