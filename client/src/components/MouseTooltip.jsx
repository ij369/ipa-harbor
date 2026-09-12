import { useState, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

const VIEWPORT_MARGIN = 8;
const CURSOR_OFFSET = 14;

function computeTooltipPosition(clientX, clientY, width, height) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = clientX + CURSOR_OFFSET;
    let y = clientY + CURSOR_OFFSET;

    if (x + width > vw - VIEWPORT_MARGIN) {
        x = clientX - width - CURSOR_OFFSET;
    }
    if (y + height > vh - VIEWPORT_MARGIN) {
        y = clientY - height - CURSOR_OFFSET;
    }

    x = Math.max(VIEWPORT_MARGIN, Math.min(x, vw - width - VIEWPORT_MARGIN));
    y = Math.max(VIEWPORT_MARGIN, Math.min(y, vh - height - VIEWPORT_MARGIN));

    return { x, y };
}

export default function MouseTooltip({ title, children, disabled = false }) {
    const [visible, setVisible] = useState(false);
    const [ready, setReady] = useState(false);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const mouseRef = useRef({ x: 0, y: 0 });
    const tooltipRef = useRef(null);

    const reposition = useCallback(() => {
        const el = tooltipRef.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        const { x, y } = mouseRef.current;
        setPosition(computeTooltipPosition(x, y, width, height));
    }, []);

    const handleMouseMove = useCallback((event) => {
        if (disabled || !title) return;
        mouseRef.current = { x: event.clientX, y: event.clientY };
        if (!visible) {
            setPosition({
                x: event.clientX + CURSOR_OFFSET,
                y: event.clientY + CURSOR_OFFSET,
            });
            setVisible(true);
            return;
        }
        reposition();
    }, [disabled, title, visible, reposition]);

    const handleMouseLeave = useCallback(() => {
        setVisible(false);
        setReady(false);
    }, []);

    useLayoutEffect(() => {
        if (!visible) return;
        reposition();
        setReady(true);
    }, [visible, title, reposition]);

    if (!title) {
        return children;
    }

    return (
        <>
            <span
                onMouseEnter={handleMouseMove}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ display: 'inline-block' }}
            >
                {children}
            </span>
            {visible && !disabled && createPortal(
                <div
                    ref={tooltipRef}
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: position.x,
                        top: position.y,
                        zIndex: 'var(--z-tooltip)',
                        pointerEvents: 'none',
                        opacity: ready ? 1 : 0,
                        maxWidth: 300,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--joy-palette-neutral-outlinedBorder, rgba(0, 0, 0, 0.2))',
                        backgroundColor: 'var(--joy-palette-background-surface, #fff)',
                        color: 'var(--joy-palette-text-primary, inherit)',
                        boxShadow: 'var(--joy-shadow-md, 0 2px 8px rgba(0, 0, 0, 0.15))',
                        fontSize: '0.75rem',
                        lineHeight: 1.5,
                    }}
                >
                    {title}
                </div>,
                document.body
            )}
        </>
    );
}
