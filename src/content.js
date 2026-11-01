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
  const V = window.SentinelVault;

  const site = S.siteForHost(location.hostname);
  if (!site) return;
  const adapter = window.SentinelAdapters.create(site.id);
  const VERSION = (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : "dev";
  const log = (...a) => console.info("[SentinelAI]", ...a);
  const fail = (where, e) => console.error("[SentinelAI] error in " + where + ":", e);
  log("v" + VERSION + " active on " + site.name);
  try { if (V) V.setUserMessageSelector(adapter.userMessage); } catch (e) { fail("restore setup", e); }

  let settings = S.DEFAULT_SETTINGS;
  let active = true;            // enabled globally and for this site
  let bypassUntil = 0;          // short window where our own re-sent click/Enter passes through
  let scanTimer = null;
  let lastComposer = null;
  let lastFindings = [];

  function applySettings(s) {
    settings = s;
    active = !!(s.enabled && s.sites[site.id] !== false);
    try { if (V) V.setEnabled(active && s.restoreReplies !== false); } catch (e) { fail("restore setup", e); }
    if (!active) UI.destroy();
    else liveScan();
  }

  S.load().then(applySettings);
  S.onChange(applySettings);

  const restoring = () => settings.restoreReplies !== false;

  // Numbered placeholders that stay the same across the whole conversation
  function withPlaceholders(findings) {
    if (!restoring() || !V) return findings;
    try { return V.plan(findings); } catch (e) { fail("placeholders", e); return findings; }
  }

  // Replace the chosen findings and remember them so the reply can be restored
  async function replaceChosen(composer, chosen) {
    const final = withPlaceholders(chosen); // re-plan so unticked items don't leave gaps
    const ok = await E.replaceFindings(composer, final);
    if (ok && restoring() && V) { try { V.commit(final); } catch (e) { fail("remembering placeholders", e); } }
    S.recordEvent("replaced", final.map((f) => f.label));
    return ok;
  }

  function scanOptions() {
    return {
      enabled: settings.detectors,
      customRules: settings.customRules,
      allowlist: settings.allowlist,
      projectTerms: settings.projectTerms,
      sensitivity: settings.sensitivity
    };
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
      const ranges = (list) => list.map((f) => E.rangeFor(segments, f.start, f.end)).filter(Boolean);
      UI.setHighlights(ranges(findings.filter((f) => f.selected)), ranges(findings.filter((f) => !f.selected)));
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
    try { openReviewInner(); } catch (e) { fail("review", e); UI.toast("SentinelAI couldn't open the review. Please report this."); }
  }
  function openReviewInner() {
    const composer = adapter.findComposer();
    if (!composer) { log("review: message box not found"); return; }
    const found = scanComposer(composer).findings;
    if (!found.length) { liveScan(); return; }
    const findings = withPlaceholders(found);
    UI.showDialog({
      mode: "review",
      findings,
      restoring: restoring(),
      onReplace: async (ids) => {
        const chosen = findings.filter((f) => ids.includes(f.id));
        const ok = await replaceChosen(composer, chosen);
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
    return findings.some((f) => f.selected) ? findings : null;
  }

  function block(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // If something goes wrong while checking, never let the message slip through silently:
  // hold it once, explain, and let the user send it on purpose.
  function failSafe(e, where, ev) {
    fail(where, e);
    if (ev) block(ev);
    bypassUntil = Date.now() + 8000;
    UI.toast("SentinelAI couldn't check this message, so it wasn't sent. Send again to send it as is.");
  }

  // Enter to send (Shift+Enter is a new line on every supported site)
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.isComposing || e.keyCode === 229) return;
    const composer = adapter.editableRoot(e.target);
    if (!composer) return; // Enter elsewhere (including our dialog buttons) is left alone
    try {
      if (UI.isDialogOpen()) { block(e); return; }
      const findings = shouldHold(composer);
      if (!findings) return;
      block(e);
      holdAndAsk(composer, findings);
    } catch (err) { failSafe(err, "Enter", e); }
  }, true);

  // Clicking the send button
  const onPointer = (e) => {
    const btn = adapter.sendButtonFor(e.target);
    if (!btn) return;
    try {
      if (UI.isDialogOpen()) { block(e); return; }
      const composer = adapter.findComposer();
      const findings = shouldHold(composer);
      if (!findings) return;
      block(e);
      if (e.type === "click") holdAndAsk(composer, findings);
    } catch (err) { if (e.type === "click") failSafe(err, "send button", e); else block(e); }
  };
  // Sites send on pointerdown, pointerup, mousedown or click: block them all, ask once
  ["pointerdown", "pointerup", "mousedown", "mouseup", "click"].forEach((t) => window.addEventListener(t, onPointer, true));

  // Sites that wrap the box in a <form>
  window.addEventListener("submit", (e) => {
    const composer = adapter.findComposer();
    if (!composer || !e.target.contains(composer)) return;
    const findings = shouldHold(composer);
    if (!findings) return;
    block(e);
    holdAndAsk(composer, findings);
  }, true);

  function holdAndAsk(composer, found) {
    if (UI.isDialogOpen()) return;
    log("holding message:", found.length, "item(s)");
    const findings = withPlaceholders(found);
    UI.showDialog({
      mode: "send",
      findings,
      restoring: restoring(),
      onReplace: async (ids) => {
        const chosen = findings.filter((f) => ids.includes(f.id));
        const ok = await replaceChosen(composer, chosen);
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
      // Press it the way a real mouse does: some sites send on pointerup, others on click
      const r = btn.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
      btn.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ pointerId: 1, isPrimary: true, pointerType: "mouse", buttons: 1 }, at)));
      btn.dispatchEvent(new MouseEvent("mousedown", Object.assign({ buttons: 1 }, at)));
      btn.dispatchEvent(new PointerEvent("pointerup", Object.assign({ pointerId: 1, isPrimary: true, pointerType: "mouse" }, at)));
      btn.dispatchEvent(new MouseEvent("mouseup", at));
      await E.nextFrame();
      // If the site already sent on pointerup (message box emptied), don't click and send twice
      const stillThere = composer.isConnected && E.extract(composer).text.trim().length > 0;
      if (stillThere) btn.click();
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
        reply({ site: site.id, siteName: site.name, active, composerFound: !!adapter.findComposer(), remembered: V.size() });
      }
    });
  }
})();
