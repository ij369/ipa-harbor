import React from 'react';
import Dialog from './Dialog';
import AppDetail from './AppDetail';

export default function AppDetailDialog({
    isOpen,
    onClose,
    title,
    loading,
    app,
    onPrevious,
    onNext,
    hasPrevious = false,
    hasNext = false,
}) {
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="large"
            onPrevious={onPrevious}
            onNext={onNext}
            hasPrevious={hasPrevious}
            hasNext={hasNext}
        >
            <AppDetail
                app={app}
                loading={loading}
            />
        </Dialog>
    );
}
