import { createIntlStrategy } from './intl.js';
import { getDownloadItemDisplayName } from '../downloadItem.js';

/**
 * 日语策略占位：当前复用 Intl.Collator 排序
 * 后续可在此扩展五十音（あ行…わ行）排序键
 */
export function createJaStrategy() {
    const intl = createIntlStrategy();

    return {
        ...intl,
        id: 'ja',

        getSortKey(item) {
            return getDownloadItemDisplayName(item);
        },
    };
}

export const jaStrategy = createJaStrategy();
