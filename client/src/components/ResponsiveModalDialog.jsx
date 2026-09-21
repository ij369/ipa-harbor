import { ModalDialog } from '@mui/joy';
import { useFullscreenDialog } from '../hooks/useJoyMedia';

export default function ResponsiveModalDialog({
    layout,
    sx,
    className,
    safeAreaBottom,
    ...props
}) {
    const fullscreen = useFullscreenDialog();
    const useSafeAreaBottom = safeAreaBottom ?? fullscreen;
    const mergedClassName = [
        'responsive-modal-dialog',
        className,
        fullscreen ? 'safe-area-x' : '',
        useSafeAreaBottom ? 'safe-area-bottom' : '',
    ].filter(Boolean).join(' ');

    return (
        <ModalDialog
            layout={fullscreen ? 'fullscreen' : layout}
            className={mergedClassName || undefined}
            sx={[
                sx,
                fullscreen && {
                    minWidth: 0,
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    '--safe-area-pad-bottom': '16px',
                    '--safe-area-pad-x': '16px',
                },
            ]}
            {...props}
        />
    );
}
