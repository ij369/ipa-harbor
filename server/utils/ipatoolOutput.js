/**
 * 解析 ipatool --format json 的 NDJSON 输出（zerolog 日志行）
 */
function parseIpatoolJsonLines(text) {
    if (!text || !text.trim()) {
        return [];
    }

    const parsed = [];
    for (const line of text.trim().split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }

        try {
            parsed.push(JSON.parse(trimmed));
        } catch {
            // 忽略非 JSON 行
        }
    }

    return parsed;
}

function containsTwoFactorHint(text) {
    return typeof text === 'string' && text.includes('2FA code is required');
}

function detectTwoFactorRequired(lines, rawText) {
    if (containsTwoFactorHint(rawText)) {
        return true;
    }

    return lines.some((line) => containsTwoFactorHint(line.message));
}

function extractAccountFromLines(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.success === true && line.email) {
            return {
                name: line.name,
                email: line.email,
            };
        }
    }

    return null;
}

function extractKnownStderrError(stderr) {
    if (typeof stderr !== 'string' || !stderr.trim()) {
        return null;
    }

    if (stderr.includes('Could not allocate dynamic translator buffer')) {
        return 'ipatool 认证引擎初始化失败：服务器可用内存不足（Linux 首次登录约需 1GB+ 内存或 swap）';
    }

    if (stderr.includes('failed to create config directory')) {
        return 'ipatool 配置目录初始化失败，请检查 data 卷挂载与 HOME 环境变量';
    }

    return null;
}

function extractErrorFromLines(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.success === false || line.level === 'error') {
            return line.error || line.message || '未知错误';
        }
    }

    return null;
}

function extractListVersionsFromLines(lines) {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (line.success === true && Array.isArray(line.externalVersionIdentifiers)) {
            return {
                externalVersionIdentifiers: line.externalVersionIdentifiers,
                latestExternalVersionID: line.latestExternalVersionID,
                bundleID: line.bundleID,
            };
        }
    }

    return null;
}

/**
 * @param {string} stdout
 * @param {string} [stderr]
 * @returns {{ success: boolean, data?: object, needsTwoFactor?: boolean, error?: string, rawOutput?: string }}
 */
function parseIpatoolOutput(stdout, stderr = '') {
    const combined = [stdout, stderr].filter(Boolean).join('\n');
    const lines = parseIpatoolJsonLines(combined);

    const stderrError = extractKnownStderrError(stderr);
    if (stderrError) {
        return {
            success: false,
            error: stderrError,
            rawOutput: combined,
        };
    }

    const error = extractErrorFromLines(lines);
    if (error) {
        return {
            success: false,
            error,
            rawOutput: combined,
        };
    }

    if (detectTwoFactorRequired(lines, combined)) {
        return {
            success: false,
            needsTwoFactor: true,
            message: '需要二次验证码',
            rawOutput: combined,
        };
    }

    const account = extractAccountFromLines(lines);
    if (account) {
        return {
            success: true,
            data: account,
        };
    }

    return {
        success: false,
        error: '未能解析 ipatool 响应',
        rawOutput: combined,
    };
}

module.exports = {
    parseIpatoolOutput,
    parseIpatoolJsonLines,
    extractErrorFromLines,
    extractListVersionsFromLines,
};
