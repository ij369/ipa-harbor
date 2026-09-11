/** iTunes Lookup 返回的 mzstatic URL 末尾尺寸段，如 320x480bb.jpg */
const MZSTATIC_SIZE_SUFFIX = /\d+x\d+(?:bb|ss|w|-\d+)?\.(jpe?g|png)$/i;

/** 列表用小/中图，点击放大用大图 */
const APP_SCREENSHOTS_VARIANTS = {
    phone: [
        { key: 'small', size: null, width: 320 },
        { key: 'medium', size: '643x0w', width: 643 },
        { key: 'large', size: '1290x2796bb', width: 1290, height: 2796 },
    ],
    ipad: [
        { key: 'small', size: null, width: 360 },
        { key: 'medium', size: '643x0w', width: 643 },
        { key: 'large', size: '2064x2752bb', width: 2064, height: 2752 },
    ],
};

export function upgradeMzstaticScreenshotUrl(url, targetSize) {
    if (!url || typeof url !== 'string') {
        return url;
    }

    if (!targetSize || !MZSTATIC_SIZE_SUFFIX.test(url)) {
        return url;
    }

    return url.replace(MZSTATIC_SIZE_SUFFIX, `${targetSize}.jpg`);
}

export function buildScreenshotPictureSources(originalUrl, device) {
    const variants = APP_SCREENSHOTS_VARIANTS[device] || APP_SCREENSHOTS_VARIANTS.phone;
    const previewVariants = variants.slice(0, 2);
    const largeVariant = variants[2];

    if (!previewVariants.length || !largeVariant) {
        return null;
    }

    const previewSources = previewVariants.map((variant) => ({
        url: upgradeMzstaticScreenshotUrl(originalUrl, variant.size),
        width: variant.width,
    }));

    const srcSet = previewSources.map(({ url, width }) => `${url} ${width}w`).join(', ');
    const mediumUrl = previewSources[previewSources.length - 1].url;
    const largeUrl = upgradeMzstaticScreenshotUrl(originalUrl, largeVariant.size);
    const aspectRatio = largeVariant.height / largeVariant.width;
    const lightboxSrcSet = variants.map((variant) => ({
        src: upgradeMzstaticScreenshotUrl(originalUrl, variant.size),
        width: variant.width,
        height: Math.round(variant.width * aspectRatio),
    }));

    return {
        src: mediumUrl,
        srcSet,
        zoomSrc: largeUrl,
        lightboxSlide: {
            src: largeUrl,
            width: largeVariant.width,
            height: largeVariant.height,
            srcSet: lightboxSrcSet,
        },
    };
}

/** 转为 yet-another-react-lightbox 的 slides */
export function screenshotItemsToLightboxSlides(items, alt = '') {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }

    return items
        .map((item) => {
            if (!item?.lightboxSlide?.src) {
                return null;
            }

            return {
                ...item.lightboxSlide,
                alt,
            };
        })
        .filter(Boolean);
}

function mapScreenshotUrlList(urls, device) {
    if (!Array.isArray(urls) || urls.length === 0) {
        return [];
    }

    return urls
        .map((url) => buildScreenshotPictureSources(url, device))
        .filter(Boolean);
}

export function getAppScreenshotGroups(app) {
    if (!app) {
        return { phone: null, ipad: null };
    }

    const phoneItems = mapScreenshotUrlList(app.screenshotUrls, 'phone');
    const ipadItems = mapScreenshotUrlList(app.ipadScreenshotUrls, 'ipad');

    return {
        phone: phoneItems.length > 0 ? { items: phoneItems } : null,
        ipad: ipadItems.length > 0 ? { items: ipadItems } : null,
    };
}
