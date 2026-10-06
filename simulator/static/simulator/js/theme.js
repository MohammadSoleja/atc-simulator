(() => {
  const storageKey = 'atc-ui-theme';
  let theme = 'light';
  try {
    if (localStorage.getItem(storageKey) === 'dark') theme = 'dark';
  } catch (_) { /* The toggle still works when browser storage is unavailable. */ }
  document.documentElement.dataset.theme = theme;

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('themeBtn');
    function updateButton() {
      button.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
    }
    button.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem(storageKey, theme); } catch (_) {}
      updateButton();
    });
    updateButton();
  });
})();
