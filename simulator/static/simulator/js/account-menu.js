/* A hover-friendly disclosure with the same controls on touch and keyboard. */
(() => {
  const container = document.getElementById('accountDropdown');
  const toggle = document.getElementById('accountToggle');
  const options = document.getElementById('accountOptions');
  let pinned = false;
  function show(open) {
    options.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  container.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse') show(true);
  });
  container.addEventListener('pointerleave', () => {
    if (!pinned && !container.contains(document.activeElement)) show(false);
  });
  toggle.addEventListener('click', () => {
    pinned = !pinned;
    show(pinned);
  });
  container.addEventListener('focusout', event => {
    if (!container.contains(event.relatedTarget)) { pinned = false; show(false); }
  });
  document.addEventListener('click', event => {
    if (!container.contains(event.target)) { pinned = false; show(false); }
  });
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      pinned = false; show(false); toggle.focus(); event.preventDefault();
    }
    if (event.key === 'ArrowDown' && event.target === toggle) {
      show(true); options.querySelector('button, a').focus(); event.preventDefault();
    }
  });
})();
