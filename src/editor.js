/*
 * SentinelAI — reading and editing the message box safely.
 *
 * AI sites use rich editors (ProseMirror on ChatGPT and Claude, Quill on Gemini,
 * Lexical on Perplexity) that keep their own internal state. Setting innerText
 * directly desyncs that state, so the site may send the old text. Instead we:
 *   1. read the text while remembering which DOM text node each character came from
 *   2. select just the sensitive value
 *   3. use the browser's own "insert text" command, which the editor handles like typing
 * Formatting and line breaks are kept, and only the sensitive values change.
 */
(function (root) {
  "use strict";

  const BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|PRE|BLOCKQUOTE|TR|TABLE|SECTION|ARTICLE)$/;

  // → { text, segments: [{ node, start, end }] }
  function extract(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      return { text: el.value || "", segments: null };
    }
    let text = "";
    const segments = [];
    const newline = () => { if (text && !text.endsWith("\n")) text += "\n"; };

    (function walk(node) {
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          const v = child.nodeValue;
          if (!v) continue;
          segments.push({ node: child, start: text.length, end: text.length + v.length });
          text += v;
        } else if (child.nodeType === 1) {
          if (child.tagName === "BR") { text += "\n"; continue; }
          if (child.getAttribute("aria-hidden") === "true" && !child.textContent.trim()) continue;
          const block = BLOCK.test(child.tagName);
          if (block) newline();
          walk(child);
          if (block) newline();
        }
      }
    })(el);

    // zero-width characters editors use as cursor anchors are kept (offsets stay exact)
    return { text, segments };
  }

  function point(segments, pos, isEnd) {
    for (const s of segments) {
      if (isEnd ? pos > s.start && pos <= s.end : pos >= s.start && pos < s.end) {
        return { node: s.node, offset: pos - s.start };
      }
    }
    return null;
  }

  function rangeFor(segments, start, end) {
    if (!segments) return null;
    const a = point(segments, start, false);
    const b = point(segments, end, true);
    if (!a || !b) return null;
    const r = document.createRange();
    try {
      r.setStart(a.node, a.offset);
      r.setEnd(b.node, b.offset);
    } catch (e) {
      return null;
    }
    return r;
  }

  function nextFrame() {
    return new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
  }

  function setTextareaValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // Replace each finding with its placeholder. Works from the end of the text backwards
  // so earlier offsets stay valid. Returns true if the box no longer contains the values.
  async function replaceFindings(el, findings) {
    const list = findings.slice().sort((a, b) => b.start - a.start);
    el.focus();

    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      for (const f of list) {
        el.setSelectionRange(f.start, f.end);
        const ok = document.execCommand("insertText", false, f.placeholder);
        if (!ok) {
          const v = el.value;
          setTextareaValue(el, v.slice(0, f.start) + f.placeholder + v.slice(f.end));
        }
      }
      return verify(el, findings);
    }

    const sel = window.getSelection();
    for (const f of list) {
      const { text, segments } = extract(el); // re-read: editors may rebuild nodes after each edit
      if (text.slice(f.start, f.end) !== f.value) continue;
      const r = rangeFor(segments, f.start, f.end);
      if (!r) continue;
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand("insertText", false, f.placeholder);
      await nextFrame();
    }
    if (verify(el, findings)) return true;

    // Fallback: some editors ignore insertText. Paste the whole cleaned text instead,
    // which every rich editor supports.
    const { text } = extract(el);
    const D = root.SentinelDetectors;
    const cleaned = D.sanitize(text, D.scan(text).filter((f) => findings.some((g) => g.value === f.value)));
    const all = document.createRange();
    all.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(all);
    const dt = new DataTransfer();
    dt.setData("text/plain", cleaned);
    const handled = !el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    if (!handled) document.execCommand("insertText", false, cleaned);
    await nextFrame();
    return verify(el, findings);
  }

  function verify(el, findings) {
    const { text } = extract(el);
    return findings.every((f) => !text.includes(f.value));
  }

  root.SentinelEditor = { extract, rangeFor, replaceFindings, verify, nextFrame };
})(typeof self !== "undefined" ? self : this);
