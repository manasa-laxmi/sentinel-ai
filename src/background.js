// SentinelAI — opens a short welcome page on first install. No network access, no tracking.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/options.html#welcome") });
  }
});
