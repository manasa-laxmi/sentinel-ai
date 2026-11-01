/*
 * SentinelAI — site adapters
 * Each AI site has its own message box and send button. Selectors are listed in
 * order of preference; the generic fallbacks keep things working when a site
 * changes its markup. When a site breaks, this is the only file to update.
 */
(function (root) {
  "use strict";

  const ADAPTERS = {
    chatgpt: {
      input: ["#prompt-textarea", 'div.ProseMirror[contenteditable="true"]', 'textarea[name="prompt-textarea"]', "#mobile-composer-prompt", 'textarea[name="prompt"]'],
      send: ['button[data-testid="send-button"]', "#composer-submit-button", 'button[aria-label*="send" i]'],
      userMessage: '[data-message-author-role="user"]'
    },
    claude: {
      input: ['div.ProseMirror[contenteditable="true"]', 'fieldset [contenteditable="true"]', '[contenteditable="true"][role="textbox"]'],
      send: ['button[aria-label="Send message" i]', 'button[aria-label*="send" i]'],
      userMessage: '[data-testid="user-message"]'
    },
    gemini: {
      input: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]', '[contenteditable="true"][role="textbox"]'],
      send: ["button.send-button", 'button[aria-label*="send" i]'],
      userMessage: "user-query"
    },
    perplexity: {
      input: ["#ask-input", 'div[contenteditable="true"][role="textbox"]', "textarea[placeholder]", 'div[contenteditable="true"]'],
      send: ['button[data-testid="submit-button"]', 'button[aria-label="Submit" i]', 'button[aria-label*="submit" i]']
    },
    copilot: {
      input: ["#userInput", 'textarea[data-testid="composer-input"]', "textarea", '[contenteditable="true"][role="textbox"]'],
      send: ['button[data-testid="submit-button"]', 'button[aria-label*="submit" i]', 'button[aria-label*="send" i]']
    }
  };

  const GENERIC_SEND = /\b(send|submit)\b/i;
  const NOT_SEND = /\b(stop|cancel|feedback|share|voice|dictat|attach|upload)\b/i;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function isEditable(el) {
    return !!el && (el.tagName === "TEXTAREA" || el.isContentEditable);
  }

  // The outermost editable element (a click inside a <p> of the editor should resolve to the editor)
  function editableRoot(el) {
    if (!el) return null;
    if (el.tagName === "TEXTAREA") return el;
    let node = el.nodeType === 1 ? el : el.parentElement;
    let top = null;
    while (node && node.isContentEditable) {
      top = node;
      node = node.parentElement;
    }
    return top;
  }

  function create(siteId) {
    const cfg = ADAPTERS[siteId] || { input: ["textarea", '[contenteditable="true"]'], send: [] };

    function findComposer() {
      // Prefer what the user is typing in, if it is one of the site's composers
      const active = editableRoot(document.activeElement);
      if (active && cfg.input.some((s) => active.matches(s) || active.querySelector(s))) return active;
      for (const sel of cfg.input) {
        const nodes = document.querySelectorAll(sel);
        for (const n of nodes) {
          const rootEl = editableRoot(n) || n;
          if (isEditable(rootEl) && isVisible(rootEl)) return rootEl;
        }
      }
      return active && isVisible(active) ? active : null;
    }

    // Is this click target the site's send button?
    function sendButtonFor(target) {
      const btn = target && target.closest && target.closest('button, [role="button"]');
      if (!btn) return null;
      if (cfg.send.some((s) => btn.matches(s))) return btn;
      const name = [btn.getAttribute("aria-label"), btn.getAttribute("data-testid"), btn.getAttribute("title")].join(" ");
      if (GENERIC_SEND.test(name) && !NOT_SEND.test(name)) return btn;
      return null;
    }

    function findSendButton(composer) {
      // Search near the composer first so we don't hit a different "Send" on the page
      let scope = composer;
      for (let i = 0; i < 8 && scope; i++) {
        for (const sel of cfg.send) {
          const b = scope.querySelector && scope.querySelector(sel);
          if (b && isVisible(b)) return b;
        }
        scope = scope.parentElement;
      }
      for (const sel of cfg.send) {
        const b = document.querySelector(sel);
        if (b && isVisible(b)) return b;
      }
      return null;
    }

    return { siteId, findComposer, sendButtonFor, findSendButton, editableRoot, userMessage: cfg.userMessage || null };
  }

  root.SentinelAdapters = { create, ADAPTERS };
})(typeof self !== "undefined" ? self : this);
