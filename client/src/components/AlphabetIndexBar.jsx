import React, { useCallback, useRef, useState } from 'react';
import { Box, Typography } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import {
    ALPHABET_INDEX_LETTERS,
    pickLetterAtClientY,
    resolveJumpLetter,
} from '../utils/localeSearch';

const SEARCH_RESULT_ROW_HEIGHT = 72;
const SEARCH_GROUP_HEADER_HEIGHT = 28;

export default function AlphabetIndexBar({
    letterToGroupIndex,
    availableLetters,
    onJumpToLetter,
}) {
    const { t } = useTranslation();
    const barRef = useRef(null);
    const [activeLetter, setActiveLetter] = useState(null);
    const draggingRef = useRef(false);

    const jumpToLetter = useCallback((letter) => {
        const resolved = resolveJumpLetter(letter, letterToGroupIndex);
        if (!resolved) {
            return;
        }

        setActiveLetter(resolved);
        onJumpToLetter?.(resolved);
    }, [letterToGroupIndex, onJumpToLetter]);

    const handlePointerLetter = useCallback((clientY) => {
        const rect = barRef.current?.getBoundingClientRect();
        if (!rect) {
            return;
        }

        const letter = pickLetterAtClientY(clientY, rect);
        if (letter) {
            jumpToLetter(letter);
        }
    }, [jumpToLetter]);

    const handlePointerDown = useCallback((event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        handlePointerLetter(event.clientY);
    }, [handlePointerLetter]);

    const handlePointerMove = useCallback((event) => {
        if (!draggingRef.current) {
            return;
        }
        handlePointerLetter(event.clientY);
    }, [handlePointerLetter]);

    const endDrag = useCallback((event) => {
        if (!draggingRef.current) {
            return;
        }
        draggingRef.current = false;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        window.setTimeout(() => setActiveLetter(null), 400);
    }, []);

    if (letterToGroupIndex.size === 0) {
        return null;
    }

    return (
        <Box
            role="navigation"
            aria-label={t('ui.downloadManagerSearchAlphabetIndex')}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            sx={{
                position: 'relative',
                flexShrink: 0,
                width: 28,
                alignSelf: 'stretch',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                py: 0.5,
                pr: 0.5,
                touchAction: 'none',
                userSelect: 'none',
                cursor: 'pointer',
            }}
        >
            {activeLetter ? (
                <Box
                    aria-hidden
                    sx={{
                        position: 'absolute',
                        right: '100%',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        mr: 1,
                        minWidth: 44,
                        minHeight: 44,
                        borderRadius: 'md',
                        bgcolor: 'primary.solidBg',
                        color: 'primary.solidColor',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: 'md',
                        pointerEvents: 'none',
                        zIndex: 2,
                    }}
                >
                    <Typography level="h3" sx={{ color: 'inherit' }}>{activeLetter}</Typography>
                </Box>
            ) : null}

            <Box
                ref={barRef}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                }}
            >
                {ALPHABET_INDEX_LETTERS.map((letter) => {
                    const enabled = availableLetters.has(letter);
                    const isActive = activeLetter === letter;

                    return (
                        <Box
                            key={letter}
                            component="button"
                            type="button"
                            disabled={!enabled}
                            aria-label={t('ui.downloadManagerSearchJumpToLetter', { letter })}
                            aria-disabled={!enabled}
                            onClick={(event) => {
                                event.stopPropagation();
                                jumpToLetter(letter);
                            }}
                            sx={{
                                border: 'none',
                                background: 'transparent',
                                p: 0,
                                m: 0,
                                width: 20,
                                height: 14,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.625rem',
                                lineHeight: 1,
                                fontWeight: isActive ? 700 : 500,
                                color: enabled
                                    ? (isActive ? 'primary.plainColor' : 'text.secondary')
                                    : 'text.tertiary',
                                opacity: enabled ? 1 : 0.35,
                                cursor: enabled ? 'pointer' : 'default',
                            }}
                        >
                            {letter}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

export { SEARCH_RESULT_ROW_HEIGHT, SEARCH_GROUP_HEADER_HEIGHT };
