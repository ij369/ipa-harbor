import React, { useEffect } from 'react';
import './Dialog.css';
import { Close as CloseIcon } from '@mui/icons-material';
import { IconButton } from '@mui/joy';
export default function Dialog({
    isOpen,
    onClose,
    title,
    children,
    size = 'medium',
    actions,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext
}) {
    // 处理ESC键关闭
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="dialog-overlay" onClick={onClose}>
            <div className={`dialog-content dialog-${size}`} onClick={(e) => e.stopPropagation()}>
                <div className="dialog-header">
                    <h2 className="dialog-title">{title}</h2>
                    <div className="dialog-header-actions">
                        {(onPrevious || onNext) && (
                            <>
                                <button
                                    className="dialog-nav-btn"
                                    onClick={onPrevious}
                                    disabled={!hasPrevious}
                                    title="上一个"
                                >
                                    ‹
                                </button>
                                <button
                                    className="dialog-nav-btn"
                                    onClick={onNext}
                                    disabled={!hasNext}
                                    title="下一个"
                                >
                                    ›
                                </button>
                            </>
                        )}
                        <IconButton className="dialog-close" onClick={onClose}>
                            <CloseIcon />
                        </IconButton>
                    </div>
                </div>
                <div className="dialog-body">
                    {children}
                </div>
                {actions && (
                    <div className="dialog-actions">
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}
