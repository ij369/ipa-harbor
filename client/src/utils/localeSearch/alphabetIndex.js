/** A–Z + # 索引字母表（# 表示数字/符号/未归类，放最后） */
export const ALPHABET_INDEX_LETTERS = [
    ...Array.from({ length: 26 }, (_v, index) => String.fromCharCode(65 + index)),
    '#',
];

/**
 * 将已排序条目按索引字母分组。
 * @returns {{ groups, groupCounts, flatItems, letterToGroupIndex, availableLetters }}
 */
export function buildAlphabetGroups(items, getIndexLetter) {
    if (!items.length) {
        return {
            groups: [],
            groupCounts: [],
            flatItems: [],
            letterToGroupIndex: new Map(),
            availableLetters: new Set(),
        };
    }

    const groups = [];
    const letterToGroupIndex = new Map();

    for (const item of items) {
        const letter = getIndexLetter(item);
        let group = groups[groups.length - 1];

        if (!group || group.letter !== letter) {
            if (!letterToGroupIndex.has(letter)) {
                letterToGroupIndex.set(letter, groups.length);
            }
            group = { letter, items: [] };
            groups.push(group);
        }

        group.items.push(item);
    }

    return {
        groups,
        groupCounts: groups.map((group) => group.items.length),
        flatItems: groups.flatMap((group) => group.items),
        letterToGroupIndex,
        availableLetters: new Set(groups.map((group) => group.letter)),
    };
}

/**
 * 定位到最近的有效字母（iOS 通讯录：点击无数据字母时跳到下一可用段）。
 */
export function resolveJumpLetter(letter, letterToGroupIndex) {
    if (letterToGroupIndex.has(letter)) {
        return letter;
    }

    const startIndex = ALPHABET_INDEX_LETTERS.indexOf(letter);
    if (startIndex === -1) {
        return null;
    }

    for (let index = startIndex; index < ALPHABET_INDEX_LETTERS.length; index += 1) {
        const candidate = ALPHABET_INDEX_LETTERS[index];
        if (letterToGroupIndex.has(candidate)) {
            return candidate;
        }
    }

    for (let index = startIndex - 1; index >= 0; index -= 1) {
        const candidate = ALPHABET_INDEX_LETTERS[index];
        if (letterToGroupIndex.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

/** 根据指针 Y 坐标计算当前字母（用于索引条拖拽，基于紧凑字母条区域） */
export function pickLetterAtClientY(clientY, containerRect, letters = ALPHABET_INDEX_LETTERS) {
    if (!letters.length) {
        return null;
    }
    if (!containerRect.height) {
        return letters[0];
    }

    const relativeY = clientY - containerRect.top;
    if (relativeY <= 0) {
        return letters[0];
    }
    if (relativeY >= containerRect.height) {
        return letters[letters.length - 1];
    }

    const index = Math.min(
        Math.floor((relativeY / containerRect.height) * letters.length),
        letters.length - 1,
    );
    return letters[index];
}
