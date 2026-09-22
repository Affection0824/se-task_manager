export const THEME_KEY = 'shixu.theme.v1'

export function loadTheme(storage) {
  return storage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
}

export function saveTheme(storage, theme) {
  if (!['light', 'dark'].includes(theme)) throw new Error('无效的主题。')
  storage.setItem(THEME_KEY, theme)
}
