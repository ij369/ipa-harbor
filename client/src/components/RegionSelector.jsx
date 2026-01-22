import React, { useState, useEffect } from 'react';
import {
    Modal,
    ModalDialog,
    ModalClose,
    Stack,
    Button,
    Autocomplete,
    AutocompleteOption,
    ListItemContent,
    Typography
} from '@mui/joy';
import { setUserRegion } from '../utils/api';
import Swal from 'sweetalert2';
import { useTranslation } from 'react-i18next';

const REGION = [
    {
        "code": "bh",
        "name": "Bahrain",
        "keyword": "ar-BH,Bahrain,البحرين",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "bw",
        "name": "Botswana",
        "keyword": "en-BW,Botswana",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "cm",
        "name": "Cameroon",
        "keyword": "en-CM,fr-CM,Cameroun",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "cf",
        "name": "Central African Republic",
        "keyword": "fr-CF,République Centrafricaine",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ci",
        "name": "Côte d'Ivoire",
        "keyword": "fr-CI,Côte d'Ivoire",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "eg",
        "name": "Egypt",
        "keyword": "ar-EG,Egypt,مصر",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "gw",
        "name": "Guinea-Bissau",
        "keyword": "pt-GW,Guinea-Bissau",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "gn",
        "name": "Guinea",
        "keyword": "fr-GN,Guinée",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "gq",
        "name": "Equatorial Guinea",
        "keyword": "es-GQ,fr-GQ,Guinée Equatoriale",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "in",
        "name": "India",
        "keyword": "en-IN,hi-IN,India",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "il",
        "name": "Israel",
        "keyword": "he-IL,Israel",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "jo",
        "name": "Jordan",
        "keyword": "ar-JO,Jordan,الأردن",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ke",
        "name": "Kenya",
        "keyword": "en-KE,Kenya",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "kw",
        "name": "Kuwait",
        "keyword": "ar-KW,Kuwait,الكويت",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "mg",
        "name": "Madagascar",
        "keyword": "fr-MG,Madagascar",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ml",
        "name": "Mali",
        "keyword": "fr-ML,Mali",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ma",
        "name": "Morocco",
        "keyword": "ar-MA,fr-MA,Maroc",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "mu",
        "name": "Mauritius",
        "keyword": "en-MU,Mauritius,Maurice",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "mz",
        "name": "Mozambique",
        "keyword": "pt-MZ,Mozambique",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ne",
        "name": "Niger",
        "keyword": "fr-NE,Niger",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ng",
        "name": "Nigeria",
        "keyword": "en-NG,Nigeria",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "om",
        "name": "Oman",
        "keyword": "ar-OM,Oman,عُمان",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "qa",
        "name": "Qatar",
        "keyword": "ar-QA,Qatar,قطر",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "sa",
        "name": "Saudi Arabia",
        "keyword": "ar-SA,Saudi Arabia,المملكة العربية السعودية",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "sn",
        "name": "Senegal",
        "keyword": "fr-SN,Sénégal",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "za",
        "name": "South Africa",
        "keyword": "en-ZA,South Africa",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "tn",
        "name": "Tunisia",
        "keyword": "ar-TN,Tunisia,Tunisie",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ug",
        "name": "Uganda",
        "keyword": "en-UG,Uganda",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "ae",
        "name": "United Arab Emirates",
        "keyword": "ar-AE,United Arab Emirates,الإمارات العربية المتحدة",
        "groupKey": "africa-middle-east-and-india"
    },
    {
        "code": "au",
        "name": "Australia",
        "keyword": "en-AU,Australia",
        "groupKey": "asia-pacific"
    },
    {
        "code": "cn",
        "name": "China",
        "keyword": "zh-CN,China,中国大陆",
        "groupKey": "asia-pacific"
    },
    {
        "code": "hk",
        "name": "Hong Kong",
        "keyword": "zh-HK,en-HK,Hong Kong,香港",
        "groupKey": "asia-pacific"
    },
    {
        "code": "id",
        "name": "Indonesia",
        "keyword": "id-ID,Indonesia",
        "groupKey": "asia-pacific"
    },
    {
        "code": "jp",
        "name": "Japan",
        "keyword": "ja-JP,Japan,日本",
        "groupKey": "asia-pacific"
    },
    {
        "code": "kr",
        "name": "Korea",
        "keyword": "ko-KR,Korea,대한민국",
        "groupKey": "asia-pacific"
    },
    {
        "code": "mo",
        "name": "Macao",
        "keyword": "zh-MO,pt-MO,Macao,澳門",
        "groupKey": "asia-pacific"
    },
    {
        "code": "my",
        "name": "Malaysia",
        "keyword": "ms-MY,Malaysia",
        "groupKey": "asia-pacific"
    },
    {
        "code": "nz",
        "name": "New Zealand",
        "keyword": "en-NZ,New Zealand",
        "groupKey": "asia-pacific"
    },
    {
        "code": "ph",
        "name": "Philippines",
        "keyword": "en-PH,Philippines",
        "groupKey": "asia-pacific"
    },
    {
        "code": "sg",
        "name": "Singapore",
        "keyword": "en-SG,zh-SG,Singapore",
        "groupKey": "asia-pacific"
    },
    {
        "code": "tw",
        "name": "Taiwan",
        "keyword": "zh-TW,Taiwan,台灣",
        "groupKey": "asia-pacific"
    },
    {
        "code": "th",
        "name": "Thailand",
        "keyword": "th-TH,Thailand,ไทย",
        "groupKey": "asia-pacific"
    },
    {
        "code": "vn",
        "name": "Vietnam",
        "keyword": "vi-VN,Vietnam,Việt Nam",
        "groupKey": "asia-pacific"
    },
    {
        "code": "am",
        "name": "Armenia",
        "keyword": "hy-AM,Armenia",
        "groupKey": "europe"
    },
    {
        "code": "at",
        "name": "Austria",
        "keyword": "de-AT,Österreich,Austria",
        "groupKey": "europe"
    },
    {
        "code": "az",
        "name": "Azerbaijan",
        "keyword": "az-AZ,Azerbaijan",
        "groupKey": "europe"
    },
    {
        "code": "be",
        "name": "Belgium",
        "keyword": "nl-BE,fr-BE,België,Belgique,Belgium",
        "groupKey": "europe"
    },
    {
        "code": "by",
        "name": "Belarus",
        "keyword": "be-BY,Belarus",
        "groupKey": "europe"
    },
    {
        "code": "bg",
        "name": "Bulgaria",
        "keyword": "bg-BG,България,Bulgaria",
        "groupKey": "europe"
    },
    {
        "code": "hr",
        "name": "Croatia",
        "keyword": "hr-HR,Hrvatska,Croatia",
        "groupKey": "europe"
    },
    {
        "code": "cz",
        "name": "Czech Republic",
        "keyword": "cs-CZ,Česko,Czech Republic",
        "groupKey": "europe"
    },
    {
        "code": "dk",
        "name": "Denmark",
        "keyword": "da-DK,Danmark,Denmark",
        "groupKey": "europe"
    },
    {
        "code": "ee",
        "name": "Estonia",
        "keyword": "et-EE,Eesti,Estonia",
        "groupKey": "europe"
    },
    {
        "code": "fi",
        "name": "Finland",
        "keyword": "fi-FI,Suomi,Finland",
        "groupKey": "europe"
    },
    {
        "code": "fr",
        "name": "France",
        "keyword": "fr-FR,France",
        "groupKey": "europe"
    },
    {
        "code": "ge",
        "name": "Georgia",
        "keyword": "ka-GE,Georgia",
        "groupKey": "europe"
    },
    {
        "code": "de",
        "name": "Germany",
        "keyword": "de-DE,Deutschland,Germany",
        "groupKey": "europe"
    },
    {
        "code": "gr",
        "name": "Greece",
        "keyword": "el-GR,Ελλάδα,Greece",
        "groupKey": "europe"
    },
    {
        "code": "hu",
        "name": "Hungary",
        "keyword": "hu-HU,Magyarország,Hungary",
        "groupKey": "europe"
    },
    {
        "code": "ie",
        "name": "Ireland",
        "keyword": "en-IE,Ireland",
        "groupKey": "europe"
    },
    {
        "code": "it",
        "name": "Italy",
        "keyword": "it-IT,Italia,Italy",
        "groupKey": "europe"
    },
    {
        "code": "kz",
        "name": "Kazakhstan",
        "keyword": "kk-KZ,Kazakhstan",
        "groupKey": "europe"
    },
    {
        "code": "kg",
        "name": "Kyrgyzstan",
        "keyword": "ky-KG,Kyrgyzstan",
        "groupKey": "europe"
    },
    {
        "code": "lv",
        "name": "Latvia",
        "keyword": "lv-LV,Latvija,Latvia",
        "groupKey": "europe"
    },
    {
        "code": "li",
        "name": "Liechtenstein",
        "keyword": "de-LI,Liechtenstein",
        "groupKey": "europe"
    },
    {
        "code": "lt",
        "name": "Lithuania",
        "keyword": "lt-LT,Lietuva,Lithuania",
        "groupKey": "europe"
    },
    {
        "code": "lu",
        "name": "Luxembourg",
        "keyword": "fr-LU,de-LU,Luxembourg",
        "groupKey": "europe"
    },
    {
        "code": "mt",
        "name": "Malta",
        "keyword": "en-MT,Malta",
        "groupKey": "europe"
    },
    {
        "code": "md",
        "name": "Moldova",
        "keyword": "ro-MD,Moldova",
        "groupKey": "europe"
    },
    {
        "code": "me",
        "name": "Montenegro",
        "keyword": "sr-ME,Montenegro",
        "groupKey": "europe"
    },
    {
        "code": "nl",
        "name": "Netherlands",
        "keyword": "nl-NL,Nederland,Netherlands",
        "groupKey": "europe"
    },
    {
        "code": "mk",
        "name": "North Macedonia",
        "keyword": "mk-MK,North Macedonia",
        "groupKey": "europe"
    },
    {
        "code": "no",
        "name": "Norway",
        "keyword": "no-NO,Norge,Norway",
        "groupKey": "europe"
    },
    {
        "code": "pl",
        "name": "Poland",
        "keyword": "pl-PL,Polska,Poland",
        "groupKey": "europe"
    },
    {
        "code": "pt",
        "name": "Portugal",
        "keyword": "pt-PT,Portugal",
        "groupKey": "europe"
    },
    {
        "code": "ro",
        "name": "Romania",
        "keyword": "ro-RO,România,Romania",
        "groupKey": "europe"
    },
    {
        "code": "ru",
        "name": "Russia",
        "keyword": "ru-RU,Россия,Russia",
        "groupKey": "europe"
    },
    {
        "code": "sk",
        "name": "Slovakia",
        "keyword": "sk-SK,Slovensko,Slovakia",
        "groupKey": "europe"
    },
    {
        "code": "si",
        "name": "Slovenia",
        "keyword": "sl-SI,Slovenia",
        "groupKey": "europe"
    },
    {
        "code": "es",
        "name": "Spain",
        "keyword": "es-ES,España,Spain",
        "groupKey": "europe"
    },
    {
        "code": "ch",
        "name": "Switzerland",
        "keyword": "de-CH,fr-CH,it-CH,Schweiz,Suisse,Switzerland",
        "groupKey": "europe"
    },
    {
        "code": "se",
        "name": "Sweden",
        "keyword": "sv-SE,Sverige,Sweden",
        "groupKey": "europe"
    },
    {
        "code": "tj",
        "name": "Tajikistan",
        "keyword": "tg-TJ,Tajikistan",
        "groupKey": "europe"
    },
    {
        "code": "tr",
        "name": "Turkey",
        "keyword": "tr-TR,Türkiye,Turkey",
        "groupKey": "europe"
    },
    {
        "code": "tm",
        "name": "Turkmenistan",
        "keyword": "tk-TM,Turkmenistan",
        "groupKey": "europe"
    },
    {
        "code": "ua",
        "name": "Ukraine",
        "keyword": "uk-UA,Україна,Ukraine",
        "groupKey": "europe"
    },
    {
        "code": "gb",
        "name": "United Kingdom",
        "keyword": "en-GB,United Kingdom",
        "groupKey": "europe"
    },
    {
        "code": "uz",
        "name": "Uzbekistan",
        "keyword": "uz-UZ,Uzbekistan",
        "groupKey": "europe"
    },
    {
        "code": "ai",
        "name": "Anguilla",
        "keyword": "en-AI,Anguilla",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ag",
        "name": "Antigua & Barbuda",
        "keyword": "en-AG,Antigua & Barbuda,Antigua and Barbuda",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ar",
        "name": "Argentina",
        "keyword": "es-AR,Argentina",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "bb",
        "name": "Barbados",
        "keyword": "en-BB,Barbados",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "bz",
        "name": "Belize",
        "keyword": "en-BZ,Belize",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "bm",
        "name": "Bermuda",
        "keyword": "en-BM,Bermuda",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "bo",
        "name": "Bolivia",
        "keyword": "es-BO,Bolivia",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "br",
        "name": "Brazil",
        "keyword": "pt-BR,Brasil,Brazil",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "vg",
        "name": "British Virgin Islands",
        "keyword": "en-VG,British Virgin Islands",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ky",
        "name": "Cayman Islands",
        "keyword": "en-KY,Cayman Islands",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "cl",
        "name": "Chile",
        "keyword": "es-CL,Chile",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "co",
        "name": "Colombia",
        "keyword": "es-CO,Colombia",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "cr",
        "name": "Costa Rica",
        "keyword": "es-CR,Costa Rica",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "dm",
        "name": "Dominica",
        "keyword": "en-DM,Dominica",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "do",
        "name": "Dominican Republic",
        "keyword": "es-DO,República Dominicana,Dominican Republic",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ec",
        "name": "Ecuador",
        "keyword": "es-EC,Ecuador",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "sv",
        "name": "El Salvador",
        "keyword": "es-SV,El Salvador",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "gd",
        "name": "Grenada",
        "keyword": "en-GD,Grenada",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "gt",
        "name": "Guatemala",
        "keyword": "es-GT,Guatemala",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "gy",
        "name": "Guyana",
        "keyword": "en-GY,Guyana",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "hn",
        "name": "Honduras",
        "keyword": "es-HN,Honduras",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "jm",
        "name": "Jamaica",
        "keyword": "en-JM,Jamaica",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "mx",
        "name": "Mexico",
        "keyword": "es-MX,México,Mexico",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ms",
        "name": "Montserrat",
        "keyword": "en-MS,Montserrat",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ni",
        "name": "Nicaragua",
        "keyword": "es-NI,Nicaragua",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "pa",
        "name": "Panama",
        "keyword": "es-PA,Panamá,Panama",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "py",
        "name": "Paraguay",
        "keyword": "es-PY,Paraguay",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "pe",
        "name": "Peru",
        "keyword": "es-PE,Perú,Peru",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "kn",
        "name": "St. Kitts & Nevis",
        "keyword": "en-KN,St. Kitts & Nevis,St. Kitts and Nevis",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "lc",
        "name": "St. Lucia",
        "keyword": "en-LC,St. Lucia",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "vc",
        "name": "St. Vincent & The Grenadines",
        "keyword": "en-VC,St. Vincent & The Grenadines,St. Vincent and The Grenadines",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "sr",
        "name": "Suriname",
        "keyword": "nl-SR,Suriname",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "bs",
        "name": "The Bahamas",
        "keyword": "en-BS,The Bahamas,Bahamas",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "tt",
        "name": "Trinidad & Tobago",
        "keyword": "en-TT,Trinidad & Tobago,Trinidad and Tobago",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "tc",
        "name": "Turks & Caicos",
        "keyword": "en-TC,Turks & Caicos,Turks and Caicos",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "uy",
        "name": "Uruguay",
        "keyword": "es-UY,Uruguay",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ve",
        "name": "Venezuela",
        "keyword": "es-VE,Venezuela",
        "groupKey": "latin-america-and-the-caribbean"
    },
    {
        "code": "ca",
        "name": "Canada",
        "keyword": "en-CA,fr-CA,Canada (English),Canada (Français),Canada",
        "groupKey": "united-states-canada-and-puerto-rico"
    },
    {
        "code": "pr",
        "name": "Puerto Rico",
        "keyword": "en-PR,Puerto Rico (English),Puerto Rico",
        "groupKey": "united-states-canada-and-puerto-rico"
    },
    {
        "code": "us",
        "name": "United States",
        "keyword": "en-US,United States",
        "groupKey": "united-states-canada-and-puerto-rico"
    }
]

export default function RegionSelector({ open, onClose, currentRegion }) {
    const { t } = useTranslation();
    const [selectedRegion, setSelectedRegion] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open && currentRegion) {
            const region = REGION.find(c => c.code === currentRegion);
            setSelectedRegion(region || null);
        }
    }, [open, currentRegion]);

    const handleSave = async () => {
        if (!selectedRegion) {
            Swal.fire({
                icon: 'warning',
                title: t('ui.pleaseSelectRegion'),
                confirmButtonText: t('ui.ok')
            });
            return;
        }

        setLoading(true);
        try {
            const response = await setUserRegion(selectedRegion.code);
            Swal.fire({
                icon: 'success',
                title: t('ui.regionUpdated'),
                text: t('ui.regionSetTo', { name: selectedRegion.name }),
                timer: 2000,
                showConfirmButton: false
            });
            // 传递更新后的用户数据
            onClose(response.data);
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: t('ui.failedToUpdateRegion'),
                text: error.message,
                confirmButtonText: t('ui.ok')
            });
        } finally {
            setLoading(false);
        }
    };

    const handleClear = async () => {
        setLoading(true);
        try {
            const response = await setUserRegion('');
            Swal.fire({
                icon: 'success',
                title: t('ui.regionCleared'),
                text: t('ui.usingDefaultRegion'),
                timer: 2000,
                showConfirmButton: false
            });
            setSelectedRegion(null);
            onClose(response.data);
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: t('ui.failedToClearRegion'),
                text: error.message,
                confirmButtonText: t('ui.ok')
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal open={open} onClose={() => onClose(false)}>
            <ModalDialog sx={{ minWidth: 400 }}>
                <ModalClose />
                <Typography level="h4" sx={{ mb: 2 }}>
                    {t('ui.specifyRegionTitle')}
                </Typography>

                <Stack spacing={2}>
                    <Typography level="body-sm" sx={{ color: 'text.secondary' }}>
                        {t('ui.specifyRegionDescription')}
                    </Typography>

                    <Autocomplete
                        placeholder={t('ui.searchCountryPlaceholder')}
                        options={REGION}
                        getOptionLabel={(option) => option.name}
                        value={selectedRegion}
                        onChange={(event, newValue) => setSelectedRegion(newValue)}
                        groupBy={(option) => t(`ui.${option.groupKey}`)}
                        filterOptions={(options, { inputValue }) => {
                            const searchValue = inputValue.toLowerCase();
                            return options.filter((option) => {
                                return (
                                    option.name.toLowerCase().includes(searchValue) ||
                                    option.code.toLowerCase().includes(searchValue) ||
                                    option.keyword.toLowerCase().includes(searchValue)
                                );
                            });
                        }}
                        renderOption={(props, option) => {
                            const { key, ...otherProps } = props;
                            return (
                                <AutocompleteOption key={key} {...otherProps}>
                                    <ListItemContent>
                                        <Typography level="body-md">{option.name}</Typography>
                                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                                            {option.code.toUpperCase()}
                                        </Typography>
                                    </ListItemContent>
                                </AutocompleteOption>
                            );
                        }}
                    />

                    <Stack direction="column" spacing={1} justifyContent="flex-end">

                        <Button
                            onClick={handleSave}
                            loading={loading}
                        >
                            {t('ui.save')}
                        </Button>
                        {currentRegion && (
                            <Button
                                variant="soft"
                                color="success"
                                onClick={handleClear}
                                loading={loading}
                                sx={{ mr: 'auto' }}
                            >
                                {t('ui.clear')}
                            </Button>
                        )}
                        <Button
                            variant="outlined"
                            color="neutral"
                            onClick={() => onClose(false)}
                        >
                            {t('ui.cancel')}
                        </Button>
                    </Stack>
                </Stack>
            </ModalDialog>
        </Modal>
    );
}
