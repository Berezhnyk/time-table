import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import cs from './locales/cs.json'
import uk from './locales/uk.json'

const messages = {
  en,
  cs,
  uk
}

// Get user's preferred language from localStorage or browser
const savedLocale = localStorage.getItem('locale')
const browserLocale = navigator.language.split('-')[0]
const defaultLocale = savedLocale || (messages[browserLocale] ? browserLocale : 'en')

// Set initial lang attribute on HTML element
document.documentElement.setAttribute('lang', defaultLocale)

const i18n = createI18n({
  legacy: false,
  locale: defaultLocale,
  fallbackLocale: 'en',
  messages,
  globalInjection: true
})

export default i18n
