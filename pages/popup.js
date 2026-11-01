(async function () {
  "use strict";
  const S = window.SentinelSettings;
  const $ = (id) => document.getElementById(id);

  let settings = await S.load();
  let site = null;

  $("enabled").checked = settings.enabled;
  $("liveToggle").checked = settings.liveWarnings;

  // Ask the page's content script whether this is a supported AI site
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    site = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: "sentinel:status" }, (res) => {
        void chrome.runtime.lastError; // no content script = not a supported site
        resolve(res || null);
      });
    });
  } catch (e) { site = null; }

  function render() {
    const status = $("status");
    status.className = "card status";
    $("siteCard").hidden = !site;
    if (!settings.enabled) {
      status.classList.add("paused");
      $("statusTitle").textContent = "SentinelAI is off";
      $("statusText").textContent = "Turn it on to check your messages.";
    } else if (!site) {
      $("statusTitle").textContent = "Not an AI chat page";
      $("statusText").textContent = "Works on ChatGPT, Gemini, Claude, Perplexity and Copilot.";
    } else if (settings.sites[site.site] === false) {
      status.classList.add("paused");
      $("statusTitle").textContent = "Paused on " + site.siteName;
      $("statusText").textContent = "Turn on “Protect this site” below.";
    } else {
      status.classList.add("on");
      $("statusTitle").textContent = "Protecting " + site.siteName;
      $("statusText").textContent = "Messages are checked before they're sent.";
    }
    if (site) {
      $("siteToggle").checked = settings.sites[site.site] !== false;
      $("siteLabel").textContent = "Protect " + site.siteName;
    }
  }

  async function update(mut) {
    mut(settings);
    await S.save(settings);
    render();
  }

  $("enabled").onchange = (e) => update((s) => (s.enabled = e.target.checked));
  $("siteToggle").onchange = (e) => update((s) => (s.sites[site.site] = e.target.checked));
  $("liveToggle").onchange = (e) => update((s) => (s.liveWarnings = e.target.checked));
  $("openSettings").onclick = () => chrome.runtime.openOptionsPage();
  $("howItWorks").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome.html") });

  // Replaced details kept in memory so replies can show real values (wiped when the browser closes)
  function renderVault() {
    chrome.storage.session.get(["sentinelVault"], (r) => {
      const n = r && r.sentinelVault ? Object.keys(r.sentinelVault.map || {}).length : 0;
      $("vaultCard").hidden = n === 0;
      $("vaultText").textContent = n === 1 ? "Remembering 1 replaced detail" : "Remembering " + n + " replaced details";
    });
  }
  $("forget").onclick = () => chrome.storage.session.remove("sentinelVault", renderVault);
  try { renderVault(); } catch (e) { /* session storage unavailable */ }

  const stats = await S.loadStats();
  $("found").textContent = Object.values(stats.found).reduce((a, b) => a + b, 0);
  $("replaced").textContent = stats.actions.replaced;

  render();
})();
