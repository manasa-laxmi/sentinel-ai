(function () {
  "use strict";
  const D = window.SentinelDetectors;
  const S = window.SentinelSettings;
  const $ = (id) => document.getElementById(id);

  // Opened after an update: show what's new
  if (location.hash === "#whats-new") {
    $("news").hidden = false;
    try { $("newsTitle").textContent = "What's new in SentinelAI " + chrome.runtime.getManifest().version; } catch (e) { /* page opened outside the extension */ }
  }

  S.load().then((s) => {
    if (!s.enabled) { $("status").textContent = "SentinelAI is off"; $("status").style.opacity = ".6"; }
  });

  S.SITES.forEach((site) => {
    const el = document.createElement("span");
    el.className = "site";
    el.textContent = site.name;
    $("sites").append(el);
  });

  $("openSettings").onclick = () => {
    try { chrome.runtime.openOptionsPage(); } catch (e) { location.href = "options.html"; }
  };

  /* ---------------- Try it ---------------- */

  const SAMPLES = [
    {
      text: "Hey, can you draft a birthday message for my friend Priya Sharma? Her number is 98480 22338 and she loves trekking.",
      reply: "Here's one you can send to [PHONE_1]: \"Happy birthday, [PERSON_1]! Hope this year takes you up even better trails.\""
    },
    {
      text: "Why does this fail?\nDATABASE_URL=postgres://admin:S3cretPass@db.internal:5432/app\nOPENAI_API_KEY=sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z",
      reply: "The URL format is fine. Check that the database host accepts connections from your machine. Also, rotate [API_KEY_1] if it was ever committed to git."
    },
    {
      text: "mera naam Rohan Verma hai, meri salary 45k hai. budget banane mein help karo",
      reply: "Namaste [PERSON_1]! [AMOUNT_1] mein 50/30/20 rule try karo: half zaroori kharche, 30% apne liye, 20% savings."
    },
    {
      text: "Explain how UPI payments work in India",
      reply: ""
    }
  ];

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Numbered placeholders, as the extension gives them in a conversation
  function numbered(findings) {
    const counters = {}, seen = {};
    return findings.map((f) => {
      const base = f.placeholder.replace(/_\d+\]$/, "]");
      const key = base + "|" + f.value.toLowerCase().replace(/\s+/g, " ");
      if (!seen[key]) {
        counters[base] = (counters[base] || 0) + 1;
        seen[key] = base.replace(/\]$/, "_" + counters[base] + "]");
      }
      return Object.assign({}, f, { placeholder: seen[key] });
    });
  }

  let sampleIndex = -1;

  function render() {
    const text = $("input").value;
    const all = D.scan(text);
    const likely = numbered(all.filter((f) => f.selected));
    const possible = all.filter((f) => !f.selected);

    // what was found
    const found = $("found");
    found.innerHTML = "";
    if (!all.length) {
      const e = document.createElement("span");
      e.className = "empty";
      e.textContent = text.trim() ? "Nothing sensitive found. This message would be sent without any interruption." : "";
      found.append(e);
    }
    const tag = (label, cls) => { const t = document.createElement("span"); t.className = "tag " + cls; t.textContent = label; found.append(t); };
    const seen = new Set();
    likely.forEach((f) => { const k = f.placeholder; if (!seen.has(k)) { seen.add(k); tag(f.label + ": " + f.placeholder, "likely"); } });
    possible.forEach((f) => tag("Possible " + f.label.toLowerCase() + " (not replaced)", ""));

    // what the AI receives: likely items replaced
    let html = "", last = 0;
    likely.slice().sort((a, b) => a.start - b.start).forEach((f) => {
      html += esc(text.slice(last, f.start)) + '<span class="ph">' + esc(f.placeholder) + "</span>";
      last = f.end;
    });
    html += esc(text.slice(last));
    $("sent").innerHTML = html || '<span class="empty">Type a message above.</span>';

    // a reply that uses the placeholders, shown with real values restored
    const pairs = {};
    likely.forEach((f) => { pairs[f.placeholder] = f.value; });
    const sample = SAMPLES[sampleIndex];
    let reply = sample && sample.text === text ? sample.reply : "";
    if (!reply && likely.length) {
      const names = Object.keys(pairs).slice(0, 2);
      reply = "Sure. I'll use " + names.join(" and ") + (names.length > 1 ? " where they belong" : " where it belongs") + " in my answer.";
    }
    if (!reply) {
      $("reply").innerHTML = '<span class="empty">' + (text.trim() ? "Sent as typed, so the reply needs nothing restored." : "") + "</span>";
      return;
    }
    $("reply").innerHTML = esc(reply).replace(/\[[A-Z_]+_\d+\]/g, (ph) =>
      pairs[ph] !== undefined ? '<span class="real" title="Restored by SentinelAI; the AI saw ' + ph + '">' + esc(pairs[ph]) + "</span>" : ph);
  }

  document.querySelectorAll("[data-sample]").forEach((b) => {
    b.onclick = () => {
      sampleIndex = +b.dataset.sample;
      $("input").value = SAMPLES[sampleIndex].text;
      render();
    };
  });
  let t;
  $("input").addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 150); });

  sampleIndex = 0;
  $("input").value = SAMPLES[0].text;
  render();
})();
