import { match, pinyin } from 'pinyin-pro';
import { getDownloadItemDisplayName } from '../downloadItem.js';
import { normalizeLatinText } from './intl.js';

export function createZhStrategy() {
    return {
        id: 'zh',

        normalizeQuery(query) {
            return query.trim().toLowerCase();
        },

        fieldMatches(field, rawQuery) {
            const trimmed = rawQuery.trim();
            if (!trimmed) {
                return true;
            }

            const text = String(field);
            if (text.includes(trimmed)) {
                return true;
            }

            // 拉丁片段仍走归一化包含（如 Bundle ID、版本号）
            const normalized = normalizeLatinText(trimmed);
            if (normalized && normalizeLatinText(text).includes(normalized)) {
                return true;
            }

            // 中文拼音全拼 / 首字母
            try {
                return Boolean(match(text, trimmed, { continuous: true }));
            } catch {
                return false;
            }
        },

        itemMatches(fields, rawQuery) {
            const trimmed = rawQuery.trim();
            if (!trimmed) {
                return true;
            }
            return fields.some((field) => this.fieldMatches(field, trimmed));
        },

        getSortKey(item) {
            const displayName = getDownloadItemDisplayName(item);
            if (!displayName) {
                return '';
            }
            try {
                return pinyin(displayName, { toneType: 'none', type: 'array' }).join('');
            } catch {
                return displayName;
            }
        },

        getIndexLetter(item) {
            const displayName = getDownloadItemDisplayName(item).trim();
            if (!displayName) {
                return '#';
            }

            const firstChar = displayName.charAt(0);
            if (/^[a-zA-Z]/.test(firstChar)) {
                const letter = normalizeLatinText(firstChar).toUpperCase();
                if (letter >= 'A' && letter <= 'Z') {
                    return letter;
                }
            }

            if (/^\d/.test(firstChar)) {
                return '#';
            }

            try {
                const initial = pinyin(firstChar, { pattern: 'first', toneType: 'none' });
                const letter = initial.charAt(0).toUpperCase();
                if (letter >= 'A' && letter <= 'Z') {
                    return letter;
                }
            } catch {
                // 忽略无法转拼音的字符
            }

            return '#';
        },
    };
}

export const zhStrategy = createZhStrategy();
