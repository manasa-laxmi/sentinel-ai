/*
 * SentinelAI — reversible placeholders
 *
 * When the user replaces "Rahul Sharma" with [PERSON_1], the vault remembers that pair.
 * The AI only ever sees [PERSON_1]. When its reply (or the user's own sent message) shows
 * [PERSON_1] on the page, the vault swaps the real value back in — on this screen only.
 *
 * Privacy:
 *  - The pairs live in chrome.storage.session: kept in memory, never written to disk,
 *    and wiped when the browser closes. "Forget now" in the popup clears them at once.
 *  - The message box itself is never touched, so restored values can't be sent by accident.
 *  - Numbering is shared across the conversation, so [PERSON_1] always means the same person.
 */
(function (root) {
  "use strict";

  const KEY = "sentinelVault";
  let state = { map: {}, byValue: {}, counters: {} }; // placeholder -> value, base|value -> placeholder
  let loaded = false;
  let enabled = true;
  const listeners = [];

  const session = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session;
  const norm = (v) => v.toLowerCase().replace(/\s+/g, " ").trim();
  const baseOf = (ph) => ph.replace(/_\d+\]$/, "]");

  function load() {
    return new Promise((resolve) => {
      if (!session) { loaded = true; return resolve(); }
      try {
        session.get([KEY], (r) => {
          void (chrome.runtime && chrome.runtime.lastError);
          if (r && r[KEY]) state = r[KEY];
          loaded = true;
          resolve();
        });
      } catch (e) { loaded = true; resolve(); }
    });
  }

  function persist() {
    if (!session) return;
    try { session.set({ [KEY]: state }, () => void (chrome.runtime && chrome.runtime.lastError)); } catch (e) { /* memory only */ }
  }

  if (session && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "session" && changes[KEY]) {
        state = changes[KEY].newValue || { map: {}, byValue: {}, counters: {} };
        listeners.forEach((fn) => fn());
      }
    });
  }

  /**
   * Give each finding a conversation-wide numbered placeholder without saving anything yet.
   * A value already replaced earlier keeps its number; new values get the next free one.
   */
  function plan(findings) {
    const extra = {};
    const local = {};
    return findings.map((f) => {
      const base = baseOf(f.placeholder);
      const k = base + "|" + norm(f.value);
      let ph = state.byValue[k] || local[k];
      if (!ph) {
        extra[base] = (extra[base] || 0) + 1;
        ph = base.replace(/\]$/, "_" + ((state.counters[base] || 0) + extra[base]) + "]");
        local[k] = ph;
      }
      return Object.assign({}, f, { placeholder: ph });
    });
  }

  // Save the pairs for findings that were actually replaced
  function commit(findings) {
    for (const f of findings) {
      const base = baseOf(f.placeholder);
      const k = base + "|" + norm(f.value);
      if (state.byValue[k]) continue;
      state.byValue[k] = f.placeholder;
      state.map[f.placeholder] = f.value;
      const n = +((f.placeholder.match(/_(\d+)\]$/) || [])[1] || 0);
      state.counters[base] = Math.max(state.counters[base] || 0, n);
    }
    persist();
    listeners.forEach((fn) => fn());
  }

  function clear() {
    state = { map: {}, byValue: {}, counters: {} };
    persist();
    listeners.forEach((fn) => fn());
  }

  function size() { return Object.keys(state.map).length; }

  /* ------------------------------------------------------------------ */
  /* Restoring real values on the page                                   */
  /* ------------------------------------------------------------------ */

  let pattern = null;
  function buildPattern() {
    const names = Object.keys(state.map).map((ph) => ph.slice(1, -1)); // PERSON_1
    if (!names.length) { pattern = null; return; }
    names.sort((a, b) => b.length - a.length); // PERSON_12 before PERSON_1
    const alt = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    // [PERSON_1], PERSON_1, or \[PERSON\_1\] as some markdown renderers leave it
    pattern = new RegExp("\\\\?\\[(" + alt + ")\\\\?\\]|(?<![A-Za-z0-9_])(" + alt + ")(?![A-Za-z0-9_])", "g");
  }
  listeners.push(buildPattern);

  const restoredRanges = [];
  const HL = "sentinel-restored";

  let userMessageSelector = null; // the user's own sent messages: keep showing what the AI actually received
  function skip(node) {
    if (userMessageSelector && node.parentElement && node.parentElement.closest(userMessageSelector)) return true;
    for (let el = node.parentElement; el; el = el.parentElement) {
      if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "INPUT") return true; // never the message box
      if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "NOSCRIPT") return true;
      if (el.tagName === "SENTINEL-AI-ROOT") return true;
    }
    return false;
  }

  function restoreTextNode(node) {
    if (!pattern || !node.nodeValue || skip(node)) return;
    const text = node.nodeValue;
    pattern.lastIndex = 0;
    if (!pattern.test(text)) return;
    pattern.lastIndex = 0;
    let out = "";
    let last = 0;
    const spans = [];
    let m;
    while ((m = pattern.exec(text))) {
      const name = m[1] || m[2];
      const value = state.map["[" + name + "]"];
      if (value === undefined) continue;
      out += text.slice(last, m.index);
      spans.push([out.length, out.length + value.length]);
      out += value;
      last = m.index + m[0].length;
    }
    if (!spans.length) return;
    out += text.slice(last);
    // Changing the text in place (not swapping nodes) keeps the site's own renderer happy
    node.nodeValue = out;
    for (const [s, e] of spans) {
      try {
        const r = document.createRange();
        r.setStart(node, s);
        r.setEnd(node, e);
        restoredRanges.push(r);
      } catch (err) { /* node changed under us */ }
    }
    paint();
  }

  function paint() {
    try {
      if (!window.CSS || !CSS.highlights || typeof Highlight === "undefined") return;
      // drop ranges whose text the site has since replaced
      for (let i = restoredRanges.length - 1; i >= 0; i--) {
        const r = restoredRanges[i];
        if (r.collapsed || !r.startContainer.isConnected) restoredRanges.splice(i, 1);
      }
      if (restoredRanges.length > 400) restoredRanges.splice(0, restoredRanges.length - 400);
      if (restoredRanges.length) CSS.highlights.set(HL, new Highlight(...restoredRanges));
      else CSS.highlights.delete(HL);
    } catch (e) { /* highlights unsupported: values are still restored */ }
  }

  function restoreIn(rootNode) {
    if (!pattern || !rootNode) return;
    if (rootNode.nodeType === 3) { restoreTextNode(rootNode); return; }
    if (rootNode.nodeType !== 1 && rootNode.nodeType !== 9 && rootNode.nodeType !== 11) return;
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    nodes.forEach(restoreTextNode);
  }

  // Watch the page: AI replies stream in token by token, so re-check changed text as it arrives
  let observer = null;
  let pendingRoots = new Set();
  let timer = null;
  function flush() {
    timer = null;
    const roots = [...pendingRoots];
    pendingRoots = new Set();
    roots.forEach(restoreIn);
  }

  function start() {
    if (observer || !document.body) return;
    observer = new MutationObserver((muts) => {
      if (!enabled || !pattern) return;
      for (const m of muts) {
        if (m.type === "characterData") pendingRoots.add(m.target);
        else m.addedNodes.forEach((n) => pendingRoots.add(n));
      }
      if (!timer) timer = setTimeout(flush, 80);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    if (enabled) restoreIn(document.body);
  }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) {
      if (document.body) { start(); restoreIn(document.body); }
      else document.addEventListener("DOMContentLoaded", start, { once: true });
    }
  }

  listeners.push(() => { if (enabled && document.body) restoreIn(document.body); });

  root.SentinelVault = {
    ready: load().then(buildPattern),
    plan,
    commit,
    clear,
    size,
    setEnabled,
    setUserMessageSelector: (sel) => { userMessageSelector = sel || null; },
    restoreIn,
    isLoaded: () => loaded,
    _state: () => state
  };
})(typeof self !== "undefined" ? self : this);
