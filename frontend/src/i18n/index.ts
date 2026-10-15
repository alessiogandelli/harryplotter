import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import it from './it';

export const SUPPORTED_LANGUAGES = ['en', 'it'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'figurelab.language';

function initialLanguage(): Language {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'it') return stored;
    const navigatorLang = window.navigator.language?.slice(0, 2);
    if (navigatorLang === 'it') return 'it';
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(language: Language): void {
  void i18n.changeLanguage(language);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, language);
  }
}

export default i18n;
