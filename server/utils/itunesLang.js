// iTunes Lookup lang 参数映射（经 lookup?id= 实测 HTTP 200）
// 规范形式统一为小写连字符，如 en-us、zh-cn、es-mx

/** @type {readonly string[]} iTunes Lookup 直接支持的 lang 值 */
const ITUNES_SUPPORTED_LANGS = [
    'ca-es',
    'cs-cz',
    'da-dk',
    'de-ch',
    'de-de',
    'el-gr',
    'en-au',
    'en-ca',
    'en-gb',
    'en-us',
    'es-es',
    'es-mx',
    'fi-fi',
    'fr-ca',
    'fr-fr',
    'hi-in',
    'hr-hr',
    'hu-hu',
    'id-id',
    'it-it',
    'ja-jp',
    'ko-kr',
    'ms-my',
    'nl-nl',
    'no-no',
    'pl-pl',
    'pt-br',
    'pt-pt',
    'ro-ro',
    'ru-ru',
    'sk-sk',
    'sv-se',
    'th-th',
    'tr-tr',
    'uk-ua',
    'vi-vi',
    'zh-cn',
    'zh-hk',
    'zh-tw',
];

const ITUNES_SUPPORTED_SET = new Set(ITUNES_SUPPORTED_LANGS);

// 仅语言码（无地区）时的默认映射；no 单独使用会 400，必须带地区
const ITUNES_DEFAULT_BY_LANGUAGE = {
    ar: 'en-us',
    ca: 'ca-es',
    cs: 'cs-cz',
    da: 'da-dk',
    de: 'de-de',
    el: 'el-gr',
    en: 'en-us',
    es: 'es-mx',
    fi: 'fi-fi',
    fr: 'fr-fr',
    hi: 'hi-in',
    hr: 'hr-hr',
    hu: 'hu-hu',
    id: 'id-id',
    it: 'it-it',
    ja: 'ja-jp',
    ko: 'ko-kr',
    ms: 'ms-my',
    nl: 'nl-nl',
    no: 'no-no',
    nb: 'no-no',
    nn: 'no-no',
    pl: 'pl-pl',
    pt: 'pt-br',
    ro: 'ro-ro',
    ru: 'ru-ru',
    sk: 'sk-sk',
    sv: 'sv-se',
    th: 'th-th',
    tr: 'tr-tr',
    uk: 'uk-ua',
    vi: 'vi-vi',
    zh: 'zh-cn',
};

// BCP47 / 界面语言 variants -> iTunes lang（含 iTunes 不支持的码）
const ITUNES_LANG_ALIASES = {
    // English
    en: 'en-us',
    'en-us': 'en-us',
    en_us: 'en-us',
    'en-gb': 'en-gb',
    en_gb: 'en-gb',
    'en-au': 'en-au',
    en_au: 'en-au',
    'en-ca': 'en-ca',
    en_ca: 'en-ca',

    // 中文
    zh: 'zh-cn',
    'zh-cn': 'zh-cn',
    zh_cn: 'zh-cn',
    'zh-tw': 'zh-tw',
    zh_tw: 'zh-tw',
    'zh-hk': 'zh-hk',
    zh_hk: 'zh-hk',

    // 西班牙语（es-419 / es-AR 等不被 iTunes 接受）
    es: 'es-mx',
    'es-mx': 'es-mx',
    es_mx: 'es-mx',
    'es-es': 'es-es',
    es_es: 'es-es',
    'es-419': 'es-mx',
    es_419: 'es-mx',
    'es-ar': 'es-mx',
    es_ar: 'es-mx',
    'es-co': 'es-mx',
    es_co: 'es-mx',
    'es-cl': 'es-mx',
    es_cl: 'es-mx',

    // 法语
    fr: 'fr-fr',
    'fr-fr': 'fr-fr',
    fr_fr: 'fr-fr',
    'fr-ca': 'fr-ca',
    fr_ca: 'fr-ca',

    // 德语
    de: 'de-de',
    'de-de': 'de-de',
    de_de: 'de-de',
    'de-ch': 'de-ch',
    de_ch: 'de-ch',

    // 日语（ja_jp 亦可用）
    ja: 'ja-jp',
    'ja-jp': 'ja-jp',
    ja_jp: 'ja-jp',

    // 韩语
    ko: 'ko-kr',
    'ko-kr': 'ko-kr',
    ko_kr: 'ko-kr',

    // 葡萄牙语
    pt: 'pt-br',
    'pt-br': 'pt-br',
    pt_br: 'pt-br',
    'pt-pt': 'pt-pt',
    pt_pt: 'pt-pt',

    // 意大利语
    it: 'it-it',
    'it-it': 'it-it',
    it_it: 'it-it',

    // 俄语
    ru: 'ru-ru',
    'ru-ru': 'ru-ru',
    ru_ru: 'ru-ru',

    // 荷兰语
    nl: 'nl-nl',
    'nl-nl': 'nl-nl',
    nl_nl: 'nl-nl',

    // 北欧
    sv: 'sv-se',
    'sv-se': 'sv-se',
    sv_se: 'sv-se',
    da: 'da-dk',
    'da-dk': 'da-dk',
    da_dk: 'da-dk',
    fi: 'fi-fi',
    'fi-fi': 'fi-fi',
    fi_fi: 'fi-fi',
    no: 'no-no',
    'no-no': 'no-no',
    no_no: 'no-no',
    nb: 'no-no',
    nn: 'no-no',

    // 东欧 / 其他欧洲
    pl: 'pl-pl',
    'pl-pl': 'pl-pl',
    pl_pl: 'pl-pl',
    tr: 'tr-tr',
    'tr-tr': 'tr-tr',
    tr_tr: 'tr-tr',
    uk: 'uk-ua',
    'uk-ua': 'uk-ua',
    uk_ua: 'uk-ua',
    cs: 'cs-cz',
    'cs-cz': 'cs-cz',
    cs_cz: 'cs-cz',
    hu: 'hu-hu',
    'hu-hu': 'hu-hu',
    hu_hu: 'hu-hu',
    ro: 'ro-ro',
    'ro-ro': 'ro-ro',
    ro_ro: 'ro-ro',
    sk: 'sk-sk',
    'sk-sk': 'sk-sk',
    sk_sk: 'sk-sk',
    hr: 'hr-hr',
    'hr-hr': 'hr-hr',
    hr_hr: 'hr-hr',
    el: 'el-gr',
    'el-gr': 'el-gr',
    el_gr: 'el-gr',
    ca: 'ca-es',
    'ca-es': 'ca-es',
    ca_es: 'ca-es',

    // 亚洲 / 中东
    th: 'th-th',
    'th-th': 'th-th',
    th_th: 'th-th',
    vi: 'vi-vi',
    'vi-vi': 'vi-vi',
    vi_vi: 'vi-vi',
    id: 'id-id',
    'id-id': 'id-id',
    id_id: 'id-id',
    ms: 'ms-my',
    'ms-my': 'ms-my',
    ms_my: 'ms-my',
    hi: 'hi-in',
    'hi-in': 'hi-in',
    hi_in: 'hi-in',
    ar: 'en-us',
    'ar-sa': 'en-us',
    ar_sa: 'en-us',
};

function toLookupKey(lang) {
    return lang.trim().replace(/_/g, '-').toLowerCase();
}

function toCanonicalTag(lang) {
    const parts = lang.split('-');
    if (parts.length !== 2) {
        return null;
    }

    return `${parts[0].toLowerCase()}-${parts[1].toLowerCase()}`;
}

/**
 * 将界面语言码转为 iTunes Lookup 可用的 lang 参数
 * @param {string} lang
 * @returns {string}
 */
function normalizeItunesLang(lang) {
    if (!lang || typeof lang !== 'string') {
        return 'en-us';
    }

    const trimmed = lang.trim();
    if (!trimmed) {
        return 'en-us';
    }

    const lookupKey = toLookupKey(trimmed);
    if (ITUNES_LANG_ALIASES[lookupKey]) {
        return ITUNES_LANG_ALIASES[lookupKey];
    }

    const canonical = toCanonicalTag(lookupKey);
    if (canonical && ITUNES_SUPPORTED_SET.has(canonical)) {
        return canonical;
    }

    const baseLanguage = lookupKey.split('-')[0];
    if (ITUNES_DEFAULT_BY_LANGUAGE[baseLanguage]) {
        return ITUNES_DEFAULT_BY_LANGUAGE[baseLanguage];
    }

    return 'en-us';
}

module.exports = {
    ITUNES_SUPPORTED_LANGS,
    ITUNES_LANG_ALIASES,
    ITUNES_DEFAULT_BY_LANGUAGE,
    normalizeItunesLang,
};
