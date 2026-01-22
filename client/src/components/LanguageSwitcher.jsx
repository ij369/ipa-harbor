import React from 'react';
import { IconButton, Dropdown, Menu, MenuItem, MenuButton, Select, Option } from '@mui/joy';
import { useTranslation } from 'react-i18next';
import { languages, normalizeLanguageCode } from '../i18n';
import TranslateIcon from '@mui/icons-material/Translate';
/**
 * 语言切换
 * @param {string} variant - 'icon' 'select' 
 * @param {string} size - 'sm', 'md', 'lg'
 * @param {boolean} fullWidth
 * @param {object} sx
 */
export default function LanguageSwitcher({
    variant = 'icon',
    size = 'sm',
    fullWidth = false,
    sx = {}
}) {
    const { i18n } = useTranslation();

    const changeLanguage = (lng) => {
        i18n.changeLanguage(lng);
        localStorage.setItem('language', lng);
    };

    const currentLanguage = normalizeLanguageCode(i18n.language);

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
                fullWidth={fullWidth}
                sx={{
                    minWidth: 140,
                    ...sx
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
