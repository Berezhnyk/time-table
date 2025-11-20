<script setup>
import { useI18n } from 'vue-i18n'
import { watch } from 'vue'

const { locale, availableLocales } = useI18n()

const languages = {
  en: { name: 'English', flag: '🇬🇧', code: 'ENG' },
  cs: { name: 'Čeština', flag: '🇨🇿', code: 'ČES' },
  uk: { name: 'Українська', flag: '🇺🇦', code: 'УКР' }
}

const changeLanguage = (lang) => {
  locale.value = lang
  localStorage.setItem('locale', lang)
  document.documentElement.setAttribute('lang', lang)
}

// Update HTML lang attribute when locale changes
watch(locale, (newLocale) => {
  document.documentElement.setAttribute('lang', newLocale)
})
</script>

<template>
  <div class="language-selector">
    <button
      v-for="lang in availableLocales"
      :key="lang"
      :class="['language-btn', { active: locale === lang }]"
      @click="changeLanguage(lang)"
      :title="languages[lang]?.name"
      :aria-label="`Switch to ${languages[lang]?.name}`"
    >
      <span class="lang-code">{{ languages[lang]?.code }}</span>
    </button>
  </div>
</template>

<style scoped>
.language-selector {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.language-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.6rem;
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
  border-radius: 0.35rem;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.language-btn:hover {
  background: var(--surface-dark);
  border-color: var(--border-default);
  color: var(--text-primary);
}

.language-btn.active {
  background: rgba(157, 230, 122, 0.15);
  border-color: rgba(157, 230, 122, 0.5);
  color: var(--text-primary);
  font-weight: 600;
}

.lang-code {
  font-size: 0.75rem;
  letter-spacing: 0.03em;
  font-weight: 600;
}

@media (max-width: 768px) {
  .language-btn {
    padding: 0.35rem 0.5rem;
  }
}
</style>
