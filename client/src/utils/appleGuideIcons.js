// Apple 支持文档内联 UI 符号（已缓存至 public/apple-guide/）
// 命名：icon-{name}.svg/.png | screenshot-{phase}.webp | screenshot-{phase}-2x.webp
const ICON_BASE = `${import.meta.env.BASE_URL}apple-guide`;

const ICON_FILES = {
    safari: 'icon-safari.svg',
    more: 'icon-more.png',
    share: 'icon-share.png',
    add: 'icon-add.png',
};

// 轮播最大渲染宽度 168px，2x 资源宽 336px
export const APPLE_GUIDE_SCREENSHOT_RENDER_WIDTH = 168;
export const APPLE_GUIDE_SCREENSHOT_2X_WIDTH = 336;
export const APPLE_GUIDE_SCREENSHOT_2X_HEIGHT = 628;

const SCREENSHOT_FILES = {
    before: {
        original: 'screenshot-before.webp',
        display: 'screenshot-before-2x.webp',
    },
    after: {
        original: 'screenshot-after.webp',
        display: 'screenshot-after-2x.webp',
    },
};

export function getAppleGuideIconUrl(icon) {
    const fileName = ICON_FILES[icon];

    if (!fileName) {
        return '';
    }

    return `${ICON_BASE}/${fileName}`;
}

export function getAppleGuideScreenshotUrl(phase, variant = 'display') {
    const files = SCREENSHOT_FILES[phase];

    if (!files) {
        return '';
    }

    return `${ICON_BASE}/${files[variant]}`;
}

export const APPLE_GUIDE_ICON_SIZES = {
    safari: { width: 22, height: 22 },
    more: { width: 22, height: 22 },
    share: { width: 18, height: 22 },
    add: { width: 22, height: 22 },
};

export const APPLE_GUIDE_SCREENSHOT_SLIDES = [
    {
        phase: 'before',
        src: getAppleGuideScreenshotUrl('before'),
    },
    {
        phase: 'after',
        src: getAppleGuideScreenshotUrl('after'),
    },
];
