import React, { useEffect } from 'react';
import './Dialog.css';
import { Close as CloseIcon } from '@mui/icons-material';
import { IconButton } from '@mui/joy';
import { useTranslation } from 'react-i18next';
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
    hasNext,
    headerActions
}) {
    const { t } = useTranslation();
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
                                    // 上一个
                                    title={t('ui.previous')}
                                >
                                    ‹
                                </button>
                                <button
                                    className="dialog-nav-btn"
                                    onClick={onNext}
                                    disabled={!hasNext}
                                    // 下一个
                                    title={t('ui.next')}
                                >
                                    ›
                                </button>
                            </>
                        )}
                        {headerActions}
                        <IconButton className="dialog-close" onClick={onClose} aria-label={t('ui.close')}>
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
