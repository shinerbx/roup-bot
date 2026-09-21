/* Mirrors Telegram's colour scheme onto <html data-scheme="light|dark"> so CSS can
   pick accent inks / glass tints per scheme. Pure DOM: no React, no re-renders,
   no network. If Telegram isn't present the attribute is omitted and the UI
   uses its dark default. */
(function () {
  var root = document.documentElement;
  var tg = window.Telegram && window.Telegram.WebApp;
  function apply() {
    var s = tg && tg.colorScheme;
    if (s === 'light' || s === 'dark') root.setAttribute('data-scheme', s);
    else root.removeAttribute('data-scheme');
  }
  apply();
  if (tg && typeof tg.onEvent === 'function') tg.onEvent('themeChanged', apply);
})();
