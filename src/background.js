// SentinelAI — background worker. No network access, no tracking.

// Reversible placeholders keep "[PERSON_1] = Rahul" pairs in session storage: held in memory,
// never written to disk, wiped when the browser closes. Content scripts need access to it.
function allowSessionAccess() {
  try {
    chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });
  } catch (e) { /* older browsers: placeholders are restored for the current page only */ }
}
allowSessionAccess();
chrome.runtime.onStartup.addListener(allowSessionAccess);

// Welcome page: on first install, and as "What's new" when a feature release lands (3.0 → 3.1),
// but not for small fixes (3.1.0 → 3.1.1). Anyone can reopen it from "How it works".
const minor = (v) => (v || "").split(".").slice(0, 2).join(".");
chrome.runtime.onInstalled.addListener((details) => {
  allowSessionAccess();
  const page = chrome.runtime.getURL("pages/welcome.html");
  if (details.reason === "install") {
    chrome.tabs.create({ url: page });
  } else if (details.reason === "update" && minor(details.previousVersion) !== minor(chrome.runtime.getManifest().version)) {
    chrome.tabs.create({ url: page + "#whats-new" });
  }
});
