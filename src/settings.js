/*
 * SentinelAI — shared settings and local statistics.
 * Everything is stored in chrome.storage.local on this device only.
 * Statistics store counts by type — never the detected values themselves.
 */
(function (root) {
  "use strict";

  const SITES = [
    { id: "chatgpt", name: "ChatGPT", hosts: ["chatgpt.com", "chat.openai.com"] },
    { id: "gemini", name: "Gemini", hosts: ["gemini.google.com"] },
    { id: "claude", name: "Claude", hosts: ["claude.ai"] },
    { id: "perplexity", name: "Perplexity", hosts: ["www.perplexity.ai", "perplexity.ai"] },
    { id: "copilot", name: "Microsoft Copilot", hosts: ["copilot.microsoft.com"] }
  ];

  const DEFAULT_SETTINGS = {
    enabled: true,          // master switch
    liveWarnings: true,     // show the chip and highlights while typing
    checkOnSend: true,      // hold the message until the user decides
    sensitivity: "balanced",// relaxed | balanced | strict
    projectTerms: [],       // confidential project or product names
    restoreReplies: true,   // show real values in place of placeholders in the AI's reply (this screen only)
    sites: { chatgpt: true, gemini: true, claude: true, perplexity: true, copilot: true },
    detectors: {},          // { [detectorId]: false } to switch one off; missing = on
    customRules: [],        // [{ id, label, pattern, enabled, caseSensitive }]
    allowlist: []           // values that are fine to share, e.g. a work email
  };

  const DEFAULT_STATS = {
    since: null,
    checks: 0,              // prompts that had something sensitive
    found: {},              // { [detectorLabel]: count }
    actions: { replaced: 0, sentAnyway: 0, edited: 0 }
  };

  const hasChrome = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;

  function merge(defaults, saved) {
    const out = JSON.parse(JSON.stringify(defaults));
    if (!saved) return out;
    for (const k of Object.keys(saved)) {
      if (out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) && saved[k] && typeof saved[k] === "object") {
        out[k] = Object.assign(out[k], saved[k]);
      } else {
        out[k] = saved[k];
      }
    }
    return out;
  }

  function load() {
    return new Promise((resolve) => {
      if (!hasChrome) return resolve(merge(DEFAULT_SETTINGS));
      chrome.storage.local.get(["settings"], (r) => resolve(merge(DEFAULT_SETTINGS, r && r.settings)));
    });
  }

  function save(settings) {
    return new Promise((resolve) => {
      if (!hasChrome) return resolve();
      chrome.storage.local.set({ settings }, () => resolve());
    });
  }

  function loadStats() {
    return new Promise((resolve) => {
      if (!hasChrome) return resolve(merge(DEFAULT_STATS));
      chrome.storage.local.get(["stats"], (r) => resolve(merge(DEFAULT_STATS, r && r.stats)));
    });
  }

  // action: "replaced" | "sentAnyway" | "edited"; labels: detector labels found
  async function recordEvent(action, labels) {
    if (!hasChrome) return;
    const stats = await loadStats();
    if (!stats.since) stats.since = new Date().toISOString();
    stats.checks += 1;
    if (action && stats.actions[action] !== undefined) stats.actions[action] += 1;
    for (const l of labels || []) stats.found[l] = (stats.found[l] || 0) + 1;
    await new Promise((res) => chrome.storage.local.set({ stats }, res));
  }

  function resetStats() {
    return new Promise((resolve) => {
      if (!hasChrome) return resolve();
      chrome.storage.local.set({ stats: merge(DEFAULT_STATS) }, resolve);
    });
  }

  function siteForHost(host) {
    return SITES.find((s) => s.hosts.includes(host)) || null;
  }

  function onChange(cb) {
    if (!hasChrome || !chrome.storage.onChanged) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.settings) cb(merge(DEFAULT_SETTINGS, changes.settings.newValue));
    });
  }

  root.SentinelSettings = { SITES, DEFAULT_SETTINGS, load, save, loadStats, recordEvent, resetStats, siteForHost, onChange };
})(typeof self !== "undefined" ? self : this);
