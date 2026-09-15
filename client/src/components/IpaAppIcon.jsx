import React, { useState } from 'react';
import { Box, Skeleton } from '@mui/joy';
import { getAppIconUrl } from '../utils/api';

const ICON_FETCH_SIZE = 128;

export default function IpaAppIcon({ appId, size = 128, disabled = false, country, file }) {
    const [loaded, setLoaded] = useState(false);
    const iconUrl = appId ? getAppIconUrl(appId, ICON_FETCH_SIZE, country, file) : null;

    return (
        <Box
            sx={{
                position: 'relative',
                width: size,
                height: size,
                transition: 'width 0.12s ease-out, height 0.12s ease-out',
                borderRadius: '22%',
                overflow: 'hidden',
                backgroundColor: 'background.level1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: disabled ? 'grayscale(100%)' : 'none',
                opacity: disabled ? 0.5 : 1,
            }}
            boxShadow="md"
        >
            {!loaded && (
                <Skeleton
                    variant="rectangular"
                    width="100%"
                    height="100%"
                    sx={{ borderRadius: '22%' }}
                />
            )}

            {iconUrl && (
                <img
                    src={iconUrl}
                    alt={`App Icon - ${appId}`}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '22%',
                        display: loaded ? 'block' : 'none',
                    }}
                    onLoad={() => setLoaded(true)}
                    onError={() => setLoaded(true)}
                />
            )}

            {!iconUrl && !loaded && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: size / 3,
                        color: 'text.tertiary',
                        transition: 'font-size 0.12s ease-out',
                    }}
                >
                    .
                </Box>
            )}
        </Box>
    );
}
