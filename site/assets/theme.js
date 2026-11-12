// search-mcp-site theme switch. Loaded in <head> so the saved choice applies before first paint.
// The choice (system, light or dark) lives in this browser's localStorage only. It is never
// sent anywhere, and the site works the same when storage is blocked.
(function () {
  "use strict";
  var KEY = "search-mcp-site-theme";
  var ORDER = ["system", "light", "dark"];
  var root = document.documentElement;

  function read() {
    try {
      var v = window.localStorage.getItem(KEY);
      return ORDER.indexOf(v) >= 0 ? v : "system";
    } catch (e) {
      return "system";
    }
  }
  function write(v) {
    try {
      if (v === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, v);
    } catch (e) { /* storage blocked: the choice lasts for this page only */ }
  }
  function apply(v) {
    if (v === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", v);
  }

  apply(read());

  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("theme-btn");
    if (!btn) return;
    function label(v) {
      btn.textContent = "Theme: " + v;
      btn.setAttribute("aria-label", "Color theme: " + v + ". Activate to change.");
    }
    var current = read();
    label(current);
    btn.hidden = false;
    btn.addEventListener("click", function () {
      current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      apply(current);
      write(current);
      label(current);
    });
  });
})();
