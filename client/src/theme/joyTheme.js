import { extendTheme } from '@mui/joy/styles';
import switchClasses from '@mui/joy/Switch/switchClasses';

function getCheckedTrackColor(theme, color) {
    const palette = theme.vars.palette[color] ?? theme.vars.palette.primary;
    return palette.solidBg;
}

function getCheckedTrackHoverColor(theme, color) {
    const palette = theme.vars.palette[color] ?? theme.vars.palette.primary;
    return palette.solidHoverBg ?? palette.solidBg;
}

export const joyTheme = extendTheme({
    zIndex: {
        tooltip: 1350,
        popup: 1380,
        modal: 1400,
    },
    components: {
        JoySwitch: {
            styleOverrides: {
                root: ({ theme, ownerState }) => {
                    const checkedTrack = getCheckedTrackColor(theme, ownerState.color);
                    const checkedTrackHover = getCheckedTrackHoverColor(theme, ownerState.color);

                    return {
                        '--Switch-thumbShadow': '0 3px 7px 0 rgba(0 0 0 / 0.12)',
                        '--Switch-thumbSize': '27px',
                        '--Switch-trackWidth': '51px',
                        '--Switch-trackHeight': '31px',
                        '--Switch-trackBackground': theme.vars.palette.background.level3,
                        '--Switch-thumbBackground': '#fff',
                        [`& .${switchClasses.thumb}`]: {
                            transition: 'width 0.2s, left 0.2s',
                        },
                        '&:hover': {
                            '@media (hover: hover)': {
                                '--Switch-trackBackground': theme.vars.palette.background.level3,
                            },
                        },
                        '&:active': {
                            '--Switch-thumbWidth': '32px',
                        },
                        [`&.${switchClasses.checked}`]: {
                            '--Switch-trackBackground': checkedTrack,
                            '&:hover': {
                                '@media (hover: hover)': {
                                    '--Switch-trackBackground': checkedTrackHover,
                                },
                            },
                        },
                    };
                },
            },
        },
    },
});
