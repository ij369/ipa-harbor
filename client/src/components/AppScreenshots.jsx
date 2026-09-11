import React, { useCallback, useMemo, useRef, useState } from 'react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import 'yet-another-react-lightbox/styles.css';
import { Box, Button, Sheet, Stack, Typography } from '@mui/joy';
import { useTheme } from '@mui/joy/styles';
import { useJoyDown } from '../hooks/useJoyMedia';
import { screenshotItemsToLightboxSlides } from '../utils/appScreenshotUrls';

const containSx = {
    minWidth: 0,
    maxWidth: '100%',
};

const scrollRowSx = {
    display: 'flex',
    gap: 1.5,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    overscrollBehaviorX: 'contain',
    pb: 0.5,
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'thin',
    '& img': {
        scrollSnapAlign: 'start',
    },
};

const pictureImgStyle = {
    display: 'block',
    width: 'auto',
    maxWidth: 'none',
    borderRadius: 'var(--joy-radius-md)',
    boxShadow: 'var(--joy-shadow-sm)',
    touchAction: 'manipulation',
};

const TAP_MOVE_THRESHOLD = 10;

function useTapWithoutScrollGuard() {
    const gestureRef = useRef(null);

    const onPointerDown = useCallback((event) => {
        gestureRef.current = {
            x: event.clientX,
            y: event.clientY,
            moved: false,
        };
    }, []);

    const onPointerMove = useCallback((event) => {
        const gesture = gestureRef.current;
        if (!gesture || gesture.moved) {
            return;
        }

        const dx = Math.abs(event.clientX - gesture.x);
        const dy = Math.abs(event.clientY - gesture.y);
        if (dx > TAP_MOVE_THRESHOLD || dy > TAP_MOVE_THRESHOLD) {
            gesture.moved = true;
        }
    }, []);

    const onPointerCancel = useCallback(() => {
        gestureRef.current = null;
    }, []);

    const shouldHandleTap = useCallback(() => {
        const moved = gestureRef.current?.moved ?? true;
        gestureRef.current = null;
        return !moved;
    }, []);

    return {
        onPointerDown,
        onPointerMove,
        onPointerCancel,
        shouldHandleTap,
    };
}

function ScreenshotThumbnail({ item, sizes, imageHeight, alt, onOpen }) {
    const {
        onPointerDown,
        onPointerMove,
        onPointerCancel,
        shouldHandleTap,
    } = useTapWithoutScrollGuard();

    const handleClick = () => {
        if (shouldHandleTap()) {
            onOpen();
        }
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
        }
    };

    return (
        <Box
            sx={{
                flexShrink: 0,
                '& img': {
                    height: imageHeight,
                },
            }}
        >
            <Box
                role="button"
                tabIndex={0}
                aria-label={alt}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerCancel={onPointerCancel}
                sx={{
                    display: 'block',
                    lineHeight: 0,
                    cursor: 'zoom-in',
                    borderRadius: 'var(--joy-radius-md)',
                    '&:focus-visible': {
                        outline: '2px solid var(--joy-palette-primary-500)',
                        outlineOffset: 2,
                    },
                }}
            >
                <picture style={{ display: 'block', margin: 0, pointerEvents: 'none' }}>
                    <source srcSet={item.srcSet} />
                    <img
                        src={item.src}
                        alt=""
                        sizes={sizes}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        style={pictureImgStyle}
                    />
                </picture>
            </Box>
        </Box>
    );
}

function ScreenshotRow({ items, sizes, imageHeight = { xs: 200, sm: 240 }, alt }) {
    const theme = useTheme();
    const belowMd = useJoyDown('md');
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState(0);
    const slides = useMemo(
        () => screenshotItemsToLightboxSlides(items, alt),
        [items, alt],
    );
    const hideNavButtons = belowMd || slides.length <= 1;
    const lightboxRender = useMemo(() => ({
        buttonPrev: hideNavButtons ? () => null : undefined,
        buttonNext: hideNavButtons ? () => null : undefined,
        buttonZoom: () => null,
        buttonClose: () => null,
    }), [hideNavButtons]);
    const lightboxStyles = useMemo(() => {
        const backdropColor = theme.palette.background.body;

        return {
            root: {
                '--yarl__color_backdrop': backdropColor,
                '--yarl__color_button': theme.palette.text.secondary,
                '--yarl__color_button_active': theme.palette.text.primary,
                '--yarl__color_button_disabled': theme.palette.text.tertiary,
                '--yarl__button_filter': 'none',
            },
            container: { backgroundColor: backdropColor },
            toolbar: { display: 'none' },
        };
    }, [theme.palette.background.body, theme.palette.text.primary, theme.palette.text.secondary, theme.palette.text.tertiary]);

    const openLightbox = useCallback((index) => {
        setLightboxIndex(index);
        setLightboxOpen(true);
    }, []);
    const closeLightbox = useCallback(() => setLightboxOpen(false), []);
    const handleView = useCallback(({ index }) => {
        setLightboxIndex(index);
    }, []);

    return (
        <>
            <Box sx={{ ...containSx, overflow: 'hidden' }}>
                <Box sx={scrollRowSx}>
                    {items.map((item, index) => (
                        <ScreenshotThumbnail
                            key={`${item.src}-${index}`}
                            item={item}
                            sizes={sizes}
                            imageHeight={imageHeight}
                            alt={alt}
                            onOpen={() => openLightbox(index)}
                        />
                    ))}
                </Box>
            </Box>
            <Lightbox
                open={lightboxOpen}
                index={lightboxIndex}
                close={closeLightbox}
                slides={slides}
                plugins={[Zoom]}
                on={{ view: handleView }}
                toolbar={{ buttons: [] }}
                carousel={{
                    finite: true,
                    padding: 0,
                    spacing: '8%',
                    imageFit: 'contain',
                }}
                render={lightboxRender}
                controller={{
                    closeOnPullDown: true,
                    closeOnBackdropClick: true,
                }}
                zoom={{
                    maxZoomPixelRatio: 3,
                    pinchZoomV4: true,
                    scrollToZoom: true,
                }}
                styles={lightboxStyles}
            />
        </>
    );
}

export default function AppScreenshots({
    phoneGroup,
    ipadGroup,
    showGallery,
    onLoadOnce,
    title,
    phoneTitle,
    ipadTitle,
    loadOnceLabel,
    emptyLabel,
    screenshotAlt = '',
}) {
    const hasPhone = Boolean(phoneGroup?.items?.length);
    const hasIpad = Boolean(ipadGroup?.items?.length);
    const hasAnyScreenshot = hasPhone || hasIpad;
    const showSeparateSections = hasPhone && hasIpad;

    if (!showGallery) {
        return (
            <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md', ...containSx }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1.5}>
                    <Typography level="title-sm">{title}</Typography>
                    <Button size="sm" variant="soft" onClick={onLoadOnce}>
                        {loadOnceLabel}
                    </Button>
                </Stack>
            </Sheet>
        );
    }

    if (!hasAnyScreenshot) {
        return (
            <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md', ...containSx }}>
                <Typography level="title-sm" sx={{ mb: 1 }}>{title}</Typography>
                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>{emptyLabel}</Typography>
            </Sheet>
        );
    }

    const renderSection = (group, sectionTitle, sizes, imageHeight) => (
        <Stack key={sectionTitle} gap={1} sx={containSx}>
            {showSeparateSections && (
                <Typography level="body-sm" fontWeight="md">{sectionTitle}</Typography>
            )}
            <ScreenshotRow
                items={group.items}
                sizes={sizes}
                imageHeight={imageHeight}
                alt={screenshotAlt}
            />
        </Stack>
    );

    return (
        <Sheet variant="outlined" sx={{ p: 2, borderRadius: 'md', ...containSx, overflow: 'hidden' }}>
            <Typography level="title-sm" sx={{ mb: 1.5 }}>{title}</Typography>
            <Stack gap={2} sx={containSx}>
                {hasPhone && renderSection(
                    phoneGroup,
                    phoneTitle,
                    '(max-width: 600px) 200px, 240px',
                    { xs: 200, sm: 240 },
                )}
                {hasIpad && renderSection(
                    ipadGroup,
                    ipadTitle,
                    '(max-width: 600px) 160px, 200px',
                    { xs: 160, sm: 200 },
                )}
            </Stack>
        </Sheet>
    );
}
