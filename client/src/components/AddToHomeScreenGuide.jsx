import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Link, Sheet, Stack, Typography } from '@mui/joy';
import { OpenInNew } from '@mui/icons-material';
import { motion, useReducedMotion } from 'motion/react';
import { Trans, useTranslation } from 'react-i18next';
import Dialog from './Dialog';
import { useJoyDown } from '../hooks/useJoyMedia';
import { normalizeLanguageCode } from '../i18n';
import {
    APPLE_GUIDE_ICON_SIZES,
    APPLE_GUIDE_SCREENSHOT_2X_HEIGHT,
    APPLE_GUIDE_SCREENSHOT_2X_WIDTH,
    APPLE_GUIDE_SCREENSHOT_SLIDES,
    getAppleGuideIconUrl,
} from '../utils/appleGuideIcons';

const SCREENSHOT_PHASE_LABELS = {
    before: 'ui.addToHomeScreenScreenshotBefore',
    after: 'ui.addToHomeScreenScreenshotAfter',
};

const CAROUSEL_EASE = [0.4, 0, 0.2, 1];
const CAROUSEL_DWELL_MS = 3200;
const CAROUSEL_TRANSITION_S = 0.42;
const STACKED_SCREENSHOT_MAX_HEIGHT = 'min(38vh, 260px)';

const sectionSx = {
    p: 2,
    borderRadius: 'md',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

const APPLE_DOC_URLS = {
    zh: 'https://support.apple.com/zh-cn/guide/iphone/iphea86e5236/26/ios/26',
    en: 'https://support.apple.com/guide/iphone/iphea86e5236/26/ios/26',
    es: 'https://support.apple.com/es-es/guide/iphone/iphea86e5236/26/ios/26',
};

const STEP_KEYS = [
    'ui.addToHomeScreenStep1',
    'ui.addToHomeScreenStep2',
    'ui.addToHomeScreenStep3',
    'ui.addToHomeScreenStep4',
    'ui.addToHomeScreenStep5',
    'ui.addToHomeScreenStep6',
    'ui.addToHomeScreenStep7',
];

function AppleGuideIcon({ name }) {
    const size = APPLE_GUIDE_ICON_SIZES[name] || APPLE_GUIDE_ICON_SIZES.safari;

    return (
        <Box
            component="img"
            src={getAppleGuideIconUrl(name)}
            alt=""
            aria-hidden
            sx={{
                display: 'inline-block',
                verticalAlign: 'middle',
                width: size.width,
                height: size.height,
                mx: 0.25,
                mb: '2px',
            }}
        />
    );
}

function AddToHomeScreenStep({ stepKey }) {
    const iconComponents = useMemo(() => ({
        safariIcon: <AppleGuideIcon name="safari" />,
        moreIcon: <AppleGuideIcon name="more" />,
        shareIcon: <AppleGuideIcon name="share" />,
        addIcon: <AppleGuideIcon name="add" />,
    }), []);

    return (
        <Trans
            i18nKey={stepKey}
            components={iconComponents}
        />
    );
}

function AppleGuideScreenshotImage({ slide, t, compact = false }) {
    const labelKey = SCREENSHOT_PHASE_LABELS[slide.phase];

    return (
        <Box
            component="img"
            src={slide.src}
            alt={t(labelKey)}
            width={APPLE_GUIDE_SCREENSHOT_2X_WIDTH}
            height={APPLE_GUIDE_SCREENSHOT_2X_HEIGHT}
            loading="eager"
            decoding="async"
            sx={{
                display: 'block',
                ...(compact
                    ? {
                        maxWidth: '100%',
                        maxHeight: '100%',
                        width: 'auto',
                        height: 'auto',
                        objectFit: 'contain',
                    }
                    : {
                        width: '100%',
                        height: 'auto',
                    }),
            }}
        />
    );
}

function AppleGuideScreenshotIndicators({ slides, activeSlide, total, t, onSelect }) {
    if (total <= 1) {
        return null;
    }

    return (
        <Stack
            direction="row"
            alignItems="center"
            justifyContent="center"
            gap={0.75}
            sx={{ mt: 0.75, width: '100%' }}
        >
            {slides.map((slide, slideIndex) => (
                <Box
                    key={slide.phase}
                    component="button"
                    type="button"
                    aria-label={`${t(SCREENSHOT_PHASE_LABELS[slide.phase])} (${slideIndex + 1} / ${total})`}
                    aria-current={slideIndex === activeSlide ? 'true' : undefined}
                    onClick={() => onSelect(slideIndex)}
                    sx={{
                        width: slideIndex === activeSlide ? 24 : 16,
                        height: 2,
                        p: 0,
                        border: 'none',
                        borderRadius: '999px',
                        bgcolor: slideIndex === activeSlide ? 'neutral.500' : 'neutral.300',
                        cursor: 'pointer',
                        transition: 'width 0.28s ease, background-color 0.28s ease',
                    }}
                />
            ))}
        </Stack>
    );
}

function AppleGuideScreenshotCarousel({ active, slides }) {
    const { t } = useTranslation();
    const prefersReducedMotion = useReducedMotion();
    const isStackedLayout = useJoyDown('sm');
    const [index, setIndex] = useState(0);
    const [disableTransition, setDisableTransition] = useState(false);
    const total = slides.length;
    const loopSlides = useMemo(
        () => (total > 1 ? [...slides, slides[0]] : slides),
        [slides, total],
    );
    const loopLength = loopSlides.length;
    const activeSlide = total > 0 ? index % total : 0;
    const slideTransition = prefersReducedMotion
        ? { duration: 0 }
        : { duration: CAROUSEL_TRANSITION_S, ease: CAROUSEL_EASE };

    useEffect(() => {
        if (!active) {
            setIndex(0);
            setDisableTransition(false);
        }
    }, [active]);

    useEffect(() => {
        if (!active) {
            return undefined;
        }

        slides.forEach((slide) => {
            const image = new Image();
            image.src = slide.src;
        });
    }, [active, slides]);

    useEffect(() => {
        if (!active || total <= 1) {
            return undefined;
        }

        const advanceDelay = CAROUSEL_DWELL_MS + (prefersReducedMotion ? 0 : CAROUSEL_TRANSITION_S * 1000);
        const timer = window.setTimeout(() => {
            setIndex((current) => (current >= total ? current : current + 1));
        }, advanceDelay);

        return () => window.clearTimeout(timer);
    }, [active, index, prefersReducedMotion, total]);

    const handleSlideSelect = (slideIndex) => {
        if (slideIndex === activeSlide) {
            return;
        }

        if (slideIndex > activeSlide) {
            setIndex(slideIndex);
            return;
        }

        // 始终向前滑到末尾克隆帧，再无动画回到起点
        setIndex(total);
    };

    const handleTrackAnimationComplete = () => {
        if (index !== total) {
            return;
        }

        setDisableTransition(true);
        setIndex(0);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setDisableTransition(false);
            });
        });
    };

    if (total === 0) {
        return null;
    }

    const activeLabelKey = SCREENSHOT_PHASE_LABELS[slides[activeSlide].phase];

    return (
        <Stack
            alignItems="center"
            gap={0.5}
            sx={{
                flexShrink: 0,
                width: isStackedLayout ? '100%' : { xs: '100%', sm: 168 },
                maxWidth: isStackedLayout ? '100%' : 168,
            }}
        >
            <Box
                sx={{
                    width: '100%',
                    overflow: 'hidden',
                    ...(isStackedLayout ? { height: STACKED_SCREENSHOT_MAX_HEIGHT } : {}),
                }}
            >
                <Box
                    component={motion.div}
                    animate={{
                        x: loopLength > 1 ? `-${(index / loopLength) * 100}%` : 0,
                    }}
                    transition={disableTransition || prefersReducedMotion
                        ? { duration: 0 }
                        : {
                            ...slideTransition,
                            type: 'tween',
                        }}
                    onAnimationComplete={handleTrackAnimationComplete}
                    sx={{
                        display: 'flex',
                        height: isStackedLayout ? '100%' : 'auto',
                        width: `${loopLength * 100}%`,
                    }}
                >
                    {loopSlides.map((slide, slideIndex) => {
                        const isClone = slideIndex === total;

                        return (
                            <Stack
                                key={isClone ? `${slide.phase}-clone` : slide.phase}
                                alignItems="center"
                                justifyContent={isStackedLayout ? 'center' : 'flex-start'}
                                gap={0.5}
                                sx={{
                                    width: `${100 / loopLength}%`,
                                    height: isStackedLayout ? '100%' : 'auto',
                                    flexShrink: 0,
                                }}
                            >
                                <AppleGuideScreenshotImage
                                    slide={slide}
                                    t={t}
                                    compact={isStackedLayout}
                                />
                                {!isStackedLayout && (
                                    <Typography
                                        level="body-xs"
                                        sx={{
                                            color: 'text.tertiary',
                                            lineHeight: 1.2,
                                            minHeight: '1.2em',
                                        }}
                                    >
                                        {t(SCREENSHOT_PHASE_LABELS[slide.phase])}
                                    </Typography>
                                )}
                            </Stack>
                        );
                    })}
                </Box>
            </Box>

            {isStackedLayout && (
                <Typography
                    level="body-xs"
                    sx={{
                        color: 'text.tertiary',
                        lineHeight: 1.2,
                        minHeight: '1.2em',
                    }}
                >
                    {t(activeLabelKey)}
                </Typography>
            )}

            <AppleGuideScreenshotIndicators
                slides={slides}
                activeSlide={activeSlide}
                total={total}
                t={t}
                onSelect={handleSlideSelect}
            />
        </Stack>
    );
}

export default function AddToHomeScreenGuide() {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);

    const lang = normalizeLanguageCode(i18n.language);

    const appleDocUrl = useMemo(() => {
        return APPLE_DOC_URLS[lang] || APPLE_DOC_URLS.en;
    }, [lang]);

    return (
        <>
            <Sheet variant="outlined" sx={sectionSx}>
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    justifyContent="space-between"
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                    gap={1.5}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography level="title-md">
                            {t('ui.addToHomeScreen')}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 0.5 }}>
                            {t('ui.addToHomeScreenHint')}
                        </Typography>
                    </Box>
                    <Button
                        variant="outlined"
                        color="neutral"
                        size="sm"
                        onClick={() => setOpen(true)}
                        sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}
                    >
                        {t('ui.addToHomeScreenViewGuide')}
                    </Button>
                </Stack>
            </Sheet>

            <Dialog
                isOpen={open}
                onClose={() => setOpen(false)}
                title={t('ui.addToHomeScreenDialogTitle')}
                size="large"
                actions={(
                    <Stack direction="row" gap={1} sx={{ width: '100%', justifyContent: 'flex-end' }}>
                        <Button variant="plain" color="neutral" onClick={() => setOpen(false)}>
                            {t('ui.close')}
                        </Button>
                    </Stack>
                )}
            >
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    gap={2.5}
                    alignItems={{ xs: 'stretch', sm: 'flex-start' }}
                >
                    <AppleGuideScreenshotCarousel active={open} slides={APPLE_GUIDE_SCREENSHOT_SLIDES} />

                    <Stack gap={2} sx={{ flex: 1, minWidth: 0, width: '100%' }}>
                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                            {t('ui.addToHomeScreenIntro')}
                        </Typography>

                        <Box
                            component="ol"
                            sx={{
                                m: 0,
                                pl: 2.25,
                                '& > li': {
                                    pl: 0.5,
                                    mb: 1,
                                    '&:last-child': { mb: 0 },
                                },
                                typography: 'body-sm',
                                color: 'text.primary',
                            }}
                        >
                            {STEP_KEYS.map((stepKey) => (
                                <Box component="li" key={stepKey}>
                                    <AddToHomeScreenStep stepKey={stepKey} />
                                </Box>
                            ))}
                        </Box>

                        <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                            {t('ui.addToHomeScreenFooter')}
                        </Typography>

                        <Link
                            href={appleDocUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            level="body-sm"
                            endDecorator={<OpenInNew sx={{ fontSize: 16 }} />}
                            sx={{ alignSelf: 'flex-start' }}
                        >
                            {t('ui.addToHomeScreenAppleDoc')}
                        </Link>
                    </Stack>
                </Stack>
            </Dialog>
        </>
    );
}
