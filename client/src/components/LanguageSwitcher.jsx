import React from 'react';
import { IconButton, Dropdown, Menu, MenuItem, MenuButton, Select, Option, Stack, Button } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { languages, normalizeLanguageCode } from '../i18n';
import TranslateIcon from '@mui/icons-material/Translate';

/**
 * 语言切换
 * @param {string} variant - 'icon' | 'select' | 'buttons'
 * @param {string} size - 'sm', 'md', 'lg'
 * @param {boolean} fullWidth
 * @param {string} value
 * @param {Function} onChange 
 * @param {object} sx
 */
export default function LanguageSwitcher({
    variant = 'icon',
    size = 'sm',
    fullWidth = false,
    value,
    onChange,
    sx = {}
}) {
    const { i18n } = useTranslation();

    const changeLanguage = (lng) => {
        if (onChange) {
            onChange(lng);
            return;
        }

        i18n.changeLanguage(lng);
        localStorage.setItem('language', lng);
    };

    const currentLanguage = normalizeLanguageCode(value || i18n.language);

    if (variant === 'select') {
        const handleChange = (event, newValue) => {
            if (newValue) {
                changeLanguage(newValue);
            }
        };

        return (
            <Select
                value={currentLanguage}
                onChange={handleChange}
                size={size}
                slotProps={{
                    listbox: {
                        sx: { zIndex: 1400 },
                    },
                }}
                sx={{
                    minWidth: fullWidth ? undefined : 140,
                    width: fullWidth ? '100%' : undefined,
                    ...sx,
                }}
            >
                {languages.map((lang) => (
                    <Option key={lang.code} value={lang.code}>
                        {lang.nativeName}
                    </Option>
                ))}
            </Select>
        );
    }

    if (variant === 'buttons') {
        return (
            <Stack direction="row" spacing={1} sx={{ width: fullWidth ? '100%' : 'auto', ...sx }}>
                {languages.map((lang) => (
                    <Button
                        key={lang.code}
                        variant={currentLanguage === lang.code ? 'solid' : 'outlined'}
                        color={currentLanguage === lang.code ? 'primary' : 'neutral'}
                        size={size}
                        onClick={() => changeLanguage(lang.code)}
                        sx={{ flex: fullWidth ? 1 : 'none', borderRadius: 'lg' }}
                    >
                        {lang.nativeName}
                    </Button>
                ))}
            </Stack>
        );
    }

    return (
        <Dropdown>
            <MenuButton
                slots={{ root: IconButton }}
                slotProps={{
                    root: {
                        variant: 'plain',
                        size: size
                    }
                }}
                sx={sx}
            >
                <TranslateIcon />
            </MenuButton>
            <Menu placement="bottom-end">
                {languages.map((lang) => (
                    <MenuItem
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        selected={currentLanguage === lang.code}
                    >
                        {lang.nativeName}
                    </MenuItem>
                ))}
            </Menu>
        </Dropdown>
    );
}
