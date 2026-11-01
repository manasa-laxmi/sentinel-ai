/*
 * SentinelAI — on-page interface
 * Lives inside a closed Shadow DOM so the AI site's styles can't break it
 * and it can't break the site.
 *   - chip: a small pill next to the message box while typing ("2 sensitive items")
 *   - dialog: shown when sending (or when the chip is clicked) to review and fix
 *   - highlights: underlines sensitive text inside the message box
 */
(function (root) {
  "use strict";

  const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .t {
    --bg: #ffffff; --fg: #1f2328; --muted: #5d6670; --line: #e3e6ea; --soft: #f5f6f8;
    --warn: #b45309; --warn-bg: #fff4e0; --warn-line: #f5c46b;
    --primary: #1b5e4b; --primary-fg: #ffffff; --ok: #1b7f4f;
  }
  @media (prefers-color-scheme: dark) {
    .t {
      --bg: #1d2024; --fg: #eceff2; --muted: #a2abb5; --line: #343a41; --soft: #262a2f;
      --warn: #f5b041; --warn-bg: #3a2c12; --warn-line: #7a5a1c;
      --primary: #4fbf95; --primary-fg: #0d1a15; --ok: #5fd39f;
    }
  }

  /* chip */
  .chip {
    position: fixed; z-index: 2147483646; display: none; align-items: center; gap: 6px;
    padding: 5px 10px 5px 8px; border-radius: 999px; cursor: pointer;
    background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-line);
    font-size: 12.5px; font-weight: 600; line-height: 1; white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0,0,0,.12); transition: transform .12s ease;
  }
  .chip:hover { transform: translateY(-1px); }
  .chip.soft { background: var(--bg); color: var(--muted); border-color: var(--line); box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .maybe { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 999px; font-size: 10.5px; font-weight: 600; background: var(--soft); color: var(--muted); vertical-align: 1px; }
  .chip svg { width: 14px; height: 14px; flex: none; }

  /* dialog */
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center;
    background: rgba(10, 12, 14, .45); padding: 16px; animation: fade .12s ease;
  }
  @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
  .card {
    width: 100%; max-width: 460px; max-height: calc(100vh - 32px); overflow: auto;
    background: var(--bg); color: var(--fg); border-radius: 14px; border: 1px solid var(--line);
    box-shadow: 0 18px 50px rgba(0,0,0,.28); padding: 20px;
  }
  .head { display: flex; gap: 12px; align-items: flex-start; }
  .badge {
    width: 36px; height: 36px; border-radius: 10px; flex: none; display: grid; place-items: center;
    background: var(--warn-bg); color: var(--warn);
  }
  .badge svg { width: 20px; height: 20px; }
  h2 { margin: 0 0 4px; font-size: 16px; font-weight: 650; line-height: 1.3; }
  .sub { margin: 0; font-size: 13px; color: var(--muted); line-height: 1.45; }

  ul { list-style: none; margin: 16px 0 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; font-size: 13px; }
  li + li { border-top: 1px solid var(--line); }
  li input { width: 16px; height: 16px; margin: 0; accent-color: var(--primary); flex: none; cursor: pointer; }
  .what { flex: 1; min-width: 0; }
  .label { font-weight: 600; }
  .val { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .arrow { color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; white-space: nowrap; }
  .allow {
    border: 0; background: none; color: var(--muted); font-size: 11.5px; cursor: pointer; padding: 4px 6px; border-radius: 6px; white-space: nowrap;
  }
  .allow:hover { background: var(--soft); color: var(--fg); }

  .note { margin: 12px 0 0; font-size: 12px; color: var(--muted); display: flex; gap: 6px; align-items: center; }
  .note svg { width: 13px; height: 13px; color: var(--ok); flex: none; }

  .actions { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
  button.btn {
    font-size: 13.5px; font-weight: 600; border-radius: 9px; padding: 9px 14px; cursor: pointer; border: 1px solid var(--line);
    background: var(--soft); color: var(--fg);
  }
  button.btn:hover { filter: brightness(.97); }
  button.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; flex: 1; }
  button.primary:disabled { opacity: .5; cursor: default; }
  button.link { border: 0; background: none; color: var(--muted); font-size: 13px; padding: 9px 6px; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; margin-left: auto; }
  button.link:hover { color: var(--fg); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

  /* toast */
  .toast {
    position: fixed; z-index: 2147483647; left: 50%; bottom: 28px; transform: translateX(-50%);
    background: var(--fg); color: var(--bg); padding: 9px 14px; border-radius: 9px; font-size: 13px;
    box-shadow: 0 6px 20px rgba(0,0,0,.25); animation: fade .15s ease;
  }
  `;

  const ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  let host, shadow, wrap, chip, dialog, toastTimer;
  const HL_NAME = "sentinel-sensitive";

  function ensure() {
    if (host && host.isConnected) return;
    host = document.createElement("sentinel-ai-root");
    host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    wrap = document.createElement("div");
    wrap.className = "t";
    shadow.append(style, wrap);
    chip = document.createElement("div");
    chip.className = "chip";
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    wrap.append(chip);
    (document.body || document.documentElement).append(host);
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  /* ---------------- chip ---------------- */

  let chipHandler = null;
  function showChip(composer, findings, onClick) {
    ensure();
    const distinct = (list) => new Set(list.map((f) => f.type + "|" + f.value.toLowerCase().replace(/\s+/g, " "))).size;
    const likely = distinct(findings.filter((f) => f.selected));
    const n = likely || distinct(findings);
    const word = likely ? "sensitive" : "possible";
    chip.classList.toggle("soft", !likely);
    chip.innerHTML = ICON_SHIELD + "<span></span>";
    chip.querySelector("span").textContent = n + " " + word + " item" + (n === 1 ? "" : "s");
    chip.title = "SentinelAI: " + root.SentinelDetectors.summarize(findings).join(", ") + " — click to review";
    chipHandler = onClick;
    chip.onclick = () => chipHandler && chipHandler();
    chip.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); chipHandler && chipHandler(); } };
    chip.style.display = "flex";
    positionChip(composer);
  }

  function positionChip(composer) {
    if (!chip || chip.style.display === "none" || !composer) return;
    // anchor to the composer's visual container (the editor itself can be a thin line)
    // (only climb to parents that are about as wide as the editor, so we stop at the input card)
    let box = composer;
    const base = composer.getBoundingClientRect();
    for (let i = 0; i < 4 && box.parentElement; i++) {
      if (box.parentElement === document.body || box.parentElement === document.documentElement) break;
      const p = box.parentElement.getBoundingClientRect();
      if (p.width > 0 && p.width <= base.width + 120 && p.height < 400) box = box.parentElement; else break;
    }
    const r = box.getBoundingClientRect();
    const cw = chip.offsetWidth || 150;
    let top = r.top - 34;
    if (top < 8) top = r.bottom + 8;
    let left = Math.min(r.right - cw, window.innerWidth - cw - 12);
    left = Math.max(12, left);
    chip.style.top = top + "px";
    chip.style.left = left + "px";
  }

  function hideChip() {
    if (chip) chip.style.display = "none";
  }

  /* ---------------- highlights ---------------- */

  function setHighlights(likely, possible) {
    try {
      if (!window.CSS || !CSS.highlights || typeof Highlight === "undefined") return;
      const set = (name, ranges) => {
        if (!ranges || !ranges.length) CSS.highlights.delete(name);
        else CSS.highlights.set(name, new Highlight(...ranges));
      };
      set(HL_NAME, likely);
      set(HL_NAME + "-possible", possible);
    } catch (e) { /* not supported — the chip still works */ }
  }

  /* ---------------- dialog ---------------- */

  /**
   * opts: { mode: "send" | "review", findings, onReplace(ids), onSendAnyway(), onEdit(), onAllow(value) }
   */
  function showDialog(opts) {
    ensure();
    closeDialog();
    const D = root.SentinelDetectors;
    const findings = opts.findings;
    const sending = opts.mode === "send";

    const backdrop = el("div", "backdrop");
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-labelledby", "s-title");

    const card = el("div", "card");
    const head = el("div", "head");
    head.append(el("div", "badge", ICON_SHIELD));
    const titles = el("div");
    const h = el("h2");
    h.id = "s-title";
    h.textContent = sending ? "This message has sensitive information" : "Sensitive information in your message";
    const sub = el("p", "sub");
    sub.textContent = sending
      ? "Your message hasn't been sent. Choose what to replace with a safe placeholder before it goes to the AI."
      : "Tick what you want to replace with a safe placeholder. You can keep typing afterwards.";
    titles.append(h, sub);
    head.append(titles);

    // one row per distinct value: ticking "Rahul" replaces every "Rahul"
    const rows = [];
    for (const f of findings) {
      const key = f.type + "|" + f.value.toLowerCase().replace(/\s+/g, " ");
      const row = rows.find((r) => r.key === key);
      if (row) { row.ids.push(f.id); row.count++; } else rows.push({ key, f, ids: [f.id], count: 1 });
    }

    const CONTEXT_TYPES = new Set(["person", "health", "financial", "confidential"]);
    const preview = (f) => {
      if (!CONTEXT_TYPES.has(f.type)) return D.mask(f.value);
      const v = f.value.replace(/\s+/g, " ").trim();
      return v.length > 42 ? v.slice(0, 40) + "…" : v;
    };

    const list = el("ul");
    const boxes = [];
    rows.forEach((row) => {
      const f = row.f;
      const li = el("li");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = !!f.selected;
      cb.setAttribute("aria-label", "Replace " + f.label);
      boxes.push({ cb, f, ids: row.ids });
      const what = el("div", "what");
      const lab = el("div", "label");
      lab.textContent = f.label;
      if (!f.selected) {
        const tag = el("span", "maybe");
        tag.textContent = "Possible";
        tag.title = "SentinelAI isn't sure about this one, so it's not ticked";
        lab.append(tag);
      }
      const val = el("div", "val");
      val.textContent = preview(f) + (row.count > 1 ? "  ×" + row.count : "") + "  →  " + f.placeholder;
      what.append(lab, val);
      const allow = el("button", "allow");
      allow.type = "button";
      allow.textContent = "Always allow";
      allow.title = "Never flag this exact value again (you can undo this in Settings)";
      allow.onclick = () => {
        opts.onAllow && opts.onAllow(f.value);
        li.remove();
        boxes.splice(boxes.findIndex((b) => b.f === f), 1);
        if (!boxes.length) { closeDialog(); sending ? opts.onSendAnyway(true) : opts.onEdit(); } else sync();
      };
      li.append(cb, what, allow);
      list.append(li);
    });

    const note = el("p", "note", ICON_LOCK + "<span></span>");
    note.querySelector("span").textContent = opts.restoring
      ? "Checked on your device. The AI sees only placeholders; your real details reappear in its reply, on your screen only."
      : "Checked on your device. Nothing was sent anywhere.";

    const actions = el("div", "actions");
    const primary = el("button", "btn primary");
    primary.type = "button";
    const edit = el("button", "btn");
    edit.type = "button";
    edit.textContent = sending ? "Edit message" : "Close";
    actions.append(primary, edit);

    let anyway = null;
    if (sending) {
      anyway = el("button", "link");
      anyway.type = "button";
      anyway.textContent = "Send anyway";
      actions.append(anyway);
    }

    function selectedIds() { return boxes.filter((b) => b.cb.checked).flatMap((b) => b.ids); }
    function sync() {
      const n = boxes.filter((b) => b.cb.checked).length;
      primary.disabled = n === 0;
      primary.textContent = sending
        ? (n === boxes.length ? "Replace and send" : n ? "Replace " + n + " and send" : "Replace and send")
        : (n === boxes.length ? "Replace all" : "Replace " + n);
    }
    boxes.forEach((b) => (b.cb.onchange = sync));
    sync();

    primary.onclick = () => { const ids = selectedIds(); closeDialog(); opts.onReplace(ids); };
    edit.onclick = () => { closeDialog(); opts.onEdit(); };
    if (anyway) anyway.onclick = () => { closeDialog(); opts.onSendAnyway(false); };
    backdrop.onclick = (e) => { if (e.target === backdrop) { closeDialog(); opts.onEdit(); } };
    backdrop.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); closeDialog(); opts.onEdit(); }
    };

    card.append(head, list, note, actions);
    backdrop.append(card);
    wrap.append(backdrop);
    dialog = backdrop;
    setTimeout(() => primary.focus(), 0);
  }

  function closeDialog() {
    if (dialog) { dialog.remove(); dialog = null; }
  }

  function isDialogOpen() { return !!dialog; }

  function toast(message) {
    ensure();
    const old = wrap.querySelector(".toast");
    if (old) old.remove();
    const t = el("div", "toast");
    t.textContent = message;
    wrap.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }

  function destroy() {
    setHighlights(null);
    hideChip();
    closeDialog();
  }

  root.SentinelUI = { showChip, positionChip, hideChip, setHighlights, showDialog, closeDialog, isDialogOpen, toast, destroy };
})(typeof self !== "undefined" ? self : this);
