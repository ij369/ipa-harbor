import prettyBytes from 'pretty-bytes';
// import { filesize } from 'filesize';

function isAppleDevice() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    return /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(ua);
}

export function formatFileSize(bytes) {
    const isApple = isAppleDevice();

    return prettyBytes(bytes, {
        binary: !isApple,                 // macOS用十进制，Windows用二进制
        minimumFractionDigits: 2,         // 固定2位小数
        maximumFractionDigits: 2
    });
}