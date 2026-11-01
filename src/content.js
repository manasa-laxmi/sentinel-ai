/*
 * SentinelAI — main controller (runs on supported AI sites)
 *
 * While typing: scan the message box (debounced), show a chip and underline what was found.
 * On send:      catch Enter / the send button before the site sees it. If something sensitive
 *               is in the message, hold it and let the user replace, edit, or send anyway.
 */
(function () {
  "use strict";

  const S = window.SentinelSettings;
  const D = window.SentinelDetectors;
  const E = window.SentinelEditor;
  const UI = window.SentinelUI;

  const site = S.siteForHost(location.hostname);
  if (!site) return;
  const adapter = window.SentinelAdapters.create(site.id);

  let settings = S.DEFAULT_SETTINGS;
  let active = true;            // enabled globally and for this site
  let bypassUntil = 0;          // short window where our own re-sent click/Enter passes through
  let scanTimer = null;
  let lastComposer = null;
  let lastFindings = [];

  function applySettings(s) {
    settings = s;
    active = !!(s.enabled && s.sites[site.id] !== false);
    if (!active) UI.destroy();
    else liveScan();
  }

  S.load().then(applySettings);
  S.onChange(applySettings);

  function scanOptions() {
    return { enabled: settings.detectors, customRules: settings.customRules, allowlist: settings.allowlist };
  }

  function scanComposer(composer) {
    const { text, segments } = E.extract(composer);
    const findings = D.scan(text, scanOptions());
    return { text, segments, findings };
  }

  /* ------------------------------------------------------------------ */
  /* Live warnings while typing                                          */
  /* ------------------------------------------------------------------ */

  function liveScan() {
    if (!active || !settings.liveWarnings) { UI.hideChip(); UI.setHighlights(null); return; }
    const composer = adapter.findComposer();
    lastComposer = composer;
    if (!composer) { UI.hideChip(); UI.setHighlights(null); return; }

    const { segments, findings } = scanComposer(composer);
    lastFindings = findings;
    if (!findings.length) { UI.hideChip(); UI.setHighlights(null); return; }

    UI.showChip(composer, findings, () => openReview());
    if (segments) {
      UI.setHighlights(findings.map((f) => E.rangeFor(segments, f.start, f.end)).filter(Boolean));
    } else {
      UI.setHighlights(null); // plain textareas can't be highlighted; the chip still shows
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(liveScan, 250);
  }

  document.addEventListener("input", (e) => {
    if (!active) return;
    const root = adapter.editableRoot(e.target);
    if (root) scheduleScan();
  }, true);

  // Sites swap the message box when you change chats; keep the chip in place
  window.addEventListener("resize", () => UI.positionChip(lastComposer));
  window.addEventListener("scroll", () => UI.positionChip(lastComposer), true);
  setInterval(() => {
    if (!active || !settings.liveWarnings) return;
    const c = adapter.findComposer();
    if (c !== lastComposer) liveScan();
    else if (lastFindings.length) UI.positionChip(c);
  }, 1500);

  function openReview() {
    const composer = adapter.findComposer();
    if (!composer) return;
    const { findings } = scanComposer(composer);
    if (!findings.length) { liveScan(); return; }
    UI.showDialog({
      mode: "review",
      findings,
      onReplace: async (ids) => {
        const chosen = findings.filter((f) => ids.includes(f.id));
        const ok = await E.replaceFindings(composer, chosen);
        S.recordEvent("replaced", chosen.map((f) => f.label));
        UI.toast(ok ? "Replaced " + chosen.length + " item" + (chosen.length > 1 ? "s" : "") : "Couldn't edit the message box. Please edit it yourself.");
        liveScan();
      },
      onEdit: () => composer.focus(),
      onSendAnyway: () => {},
      onAllow: allowValue
    });
  }

  /* ------------------------------------------------------------------ */
  /* Hold the message on send                                            */
  /* ------------------------------------------------------------------ */

  function shouldHold(composer) {
    if (!active || !settings.checkOnSend || !composer) return null;
    if (Date.now() < bypassUntil) return null;
    const { findings } = scanComposer(composer);
    return findings.length ? findings : null;
  }

  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // Enter to send (Shift+Enter is a new line on every supported site)
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    const composer = adapter.editableRoot(e.target);
    if (!composer) return; // Enter elsewhere (including our dialog buttons) is left alone
    if (UI.isDialogOpen()) { block(e); return; }
    const findings = shouldHold(composer);
    if (!findings) return;
    block(e);
    holdAndAsk(composer, findings);
  }, true);

  // Clicking the send button
  const onPointer = (e) => {
    const btn = adapter.sendButtonFor(e.target);
    if (!btn) return;
    if (UI.isDialogOpen()) { block(e); return; }
    const composer = adapter.findComposer();
    const findings = shouldHold(composer);
    if (!findings) return;
    block(e);
    if (e.type === "click") holdAndAsk(composer, findings);
  };
  // Some sites send on pointerdown/mousedown instead of click — block all three, ask once
  window.addEventListener("pointerdown", onPointer, true);
  window.addEventListener("mousedown", onPointer, true);
  window.addEventListener("click", onPointer, true);

  // Sites that wrap the box in a <form>
  window.addEventListener("submit", (e) => {
    const composer = adapter.findComposer();
    if (!composer || !e.target.contains(composer)) return;
    const findings = shouldHold(composer);
    if (!findings) return;
    block(e);
    holdAndAsk(composer, findings);
  }, true);

  function holdAndAsk(composer, findings) {
    if (UI.isDialogOpen()) return;
    UI.showDialog({
      mode: "send",
      findings,
      onReplace: async (ids) => {
        const chosen = findings.filter((f) => ids.includes(f.id));
        const ok = await E.replaceFindings(composer, chosen);
        S.recordEvent("replaced", chosen.map((f) => f.label));
        liveScan();
        if (!ok) {
          UI.toast("Couldn't edit the message box. Please remove the details yourself.");
          composer.focus();
          return;
        }
        // Anything the user unticked is a deliberate choice — let it through
        resend(composer);
      },
      onEdit: () => {
        S.recordEvent("edited", findings.map((f) => f.label));
        composer.focus();
      },
      onSendAnyway: (allAllowed) => {
        if (!allAllowed) S.recordEvent("sentAnyway", findings.map((f) => f.label));
        resend(composer);
      },
      onAllow: allowValue
    });
  }

  // Re-trigger the site's own send after the user decided
  async function resend(composer) {
    await E.nextFrame();
    await E.nextFrame();
    bypassUntil = Date.now() + 1500;

    // wait for the send button to become enabled (the site updates it after an edit)
    let btn = null;
    for (let i = 0; i < 20; i++) {
      btn = adapter.findSendButton(composer);
      if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") break;
      await new Promise((r) => setTimeout(r, 50));
    }

    if (btn && !btn.disabled) {
      btn.click();
    } else {
      composer.focus();
      const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
      composer.dispatchEvent(new KeyboardEvent("keydown", opts));
      composer.dispatchEvent(new KeyboardEvent("keyup", opts));
    }
    setTimeout(() => { bypassUntil = 0; scheduleScan(); }, 600);
  }

  async function allowValue(value) {
    const s = await S.load();
    const v = value.trim();
    if (!s.allowlist.some((a) => a.toLowerCase() === v.toLowerCase())) s.allowlist.push(v);
    await S.save(s);
    settings = s;
    UI.toast("Won't flag that value again");
    scheduleScan();
  }

  /* ------------------------------------------------------------------ */
  /* Popup asks "is this page protected?"                                */
  /* ------------------------------------------------------------------ */

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
      if (msg && msg.type === "sentinel:status") {
        reply({ site: site.id, siteName: site.name, active, composerFound: !!adapter.findComposer() });
      }
    });
  }
})();
