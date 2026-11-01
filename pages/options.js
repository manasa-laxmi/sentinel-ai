(async function () {
  "use strict";
  const S = window.SentinelSettings;
  const D = window.SentinelDetectors;
  const $ = (id) => document.getElementById(id);

  const EXAMPLES = {
    privateKey: "-----BEGIN PRIVATE KEY-----",
    jwt: "Login tokens starting with eyJ…",
    connectionString: "postgres://user:password@host",
    apiKey: "sk-…, AKIA…, ghp_…, AIza…",
    password: "password: …",
    email: "name@example.com",
    upi: "name@okaxis",
    creditCard: "Checked with the card checksum",
    aadhaar: "Checked with the Aadhaar checksum",
    pan: "ABCPE1234F",
    bankAccount: "When written as \"account no …\"",
    phone: "Indian and international numbers",
    ipAddress: "192.168.1.20, IPv6",
    person: "Rahul Sharma, mera naam Priya…",
    health: "When linked to a person: \"my dad has diabetes\"",
    financial: "Your salary, savings, loans, credit score",
    confidential: "Text marked confidential or internal only"
  };

  let settings = await S.load();


  let toastTimer;
  async function save() {
    await S.save(settings);
    $("saved").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("saved").classList.remove("show"), 1200);
  }

  function toggleRow(title, sub, checked, onChange) {
    const row = document.createElement("div");
    row.className = "row";
    const text = document.createElement("div");
    text.className = "text";
    const b = document.createElement("b");
    b.textContent = title;
    text.append(b);
    if (sub) {
      const s = document.createElement("small");
      s.textContent = sub;
      text.append(s);
    }
    const label = document.createElement("label");
    label.className = "switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = checked;
    input.setAttribute("aria-label", title);
    input.onchange = () => onChange(input.checked);
    label.append(input, document.createElement("span"));
    row.append(text, label);
    return row;
  }

  /* behaviour */
  $("checkOnSend").checked = settings.checkOnSend;
  $("liveWarnings").checked = settings.liveWarnings;
  $("checkOnSend").onchange = (e) => { settings.checkOnSend = e.target.checked; save(); };
  $("liveWarnings").onchange = (e) => { settings.liveWarnings = e.target.checked; save(); };
  $("restoreReplies").checked = settings.restoreReplies !== false;
  $("restoreReplies").onchange = (e) => {
    settings.restoreReplies = e.target.checked;
    if (!e.target.checked) try { chrome.storage.session.remove("sentinelVault"); } catch (err) { /* nothing kept */ }
    save();
  };

  /* sites */
  S.SITES.forEach((site) => {
    $("sites").append(toggleRow(site.name, site.hosts[0], settings.sites[site.id] !== false, (on) => {
      settings.sites[site.id] = on; save();
    }));
  });

  /* detectors */
  D.detectors.forEach((det) => {
    $(det.group === "context" ? "contextDetectors" : "detectors").append(toggleRow(det.label, EXAMPLES[det.id] || det.placeholder, settings.detectors[det.id] !== false, (on) => {
      if (on) delete settings.detectors[det.id]; else settings.detectors[det.id] = false;
      save();
    }));
  });

  /* custom rules */
  function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function renderRules() {
    const box = $("rules");
    box.innerHTML = "";
    if (!settings.customRules.length) {
      const e = document.createElement("div");
      e.className = "rules-empty";
      e.textContent = "No rules yet.";
      box.append(e);
      return;
    }
    settings.customRules.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "rule";
      const name = document.createElement("b");
      name.textContent = r.label;
      name.style.fontSize = "13.5px";
      const pat = document.createElement("code");
      pat.textContent = r.pattern;
      pat.style.overflowWrap = "anywhere";
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;align-items:center";
      const sw = document.createElement("label");
      sw.className = "switch";
      const inp = document.createElement("input");
      inp.type = "checkbox";
      inp.checked = r.enabled !== false;
      inp.setAttribute("aria-label", "Enable " + r.label);
      inp.onchange = () => { r.enabled = inp.checked; save(); };
      sw.append(inp, document.createElement("span"));
      const del = document.createElement("button");
      del.className = "btn danger";
      del.type = "button";
      del.textContent = "Remove";
      del.onclick = () => { settings.customRules.splice(i, 1); save(); renderRules(); };
      actions.append(sw, del);
      row.append(name, pat, actions);
      box.append(row);
    });
  }
  renderRules();

  function currentPattern() {
    const raw = $("rulePattern").value.trim();
    return $("ruleExact").checked ? escapeRegex(raw) : raw;
  }

  function validate() {
    const msg = $("ruleMsg");
    msg.className = "";
    msg.textContent = "";
    const p = currentPattern();
    if (!p) return false;
    try { new RegExp(p); } catch (e) {
      msg.className = "err";
      msg.textContent = "That pattern isn't valid. Try “plain text”.";
      return false;
    }
    if (new RegExp(p).test("")) {
      msg.className = "err";
      msg.textContent = "This pattern matches empty text. Make it more specific.";
      return false;
    }
    const sample = $("ruleTest").value;
    if (sample) {
      const found = D.scan(sample, { enabled: Object.fromEntries(D.detectors.map((d) => [d.id, false])), customRules: [{ label: $("ruleLabel").value || "Rule", pattern: p }] });
      msg.className = found.length ? "ok" : "muted";
      msg.textContent = found.length ? "Matches: " + found.map((f) => f.value).join(", ") : "No match in your sample";
    }
    return true;
  }
  ["rulePattern", "ruleTest", "ruleExact"].forEach((id) => $(id).addEventListener("input", validate));

  $("addRule").onsubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    settings.customRules.push({
      id: Date.now().toString(36),
      label: $("ruleLabel").value.trim(),
      pattern: currentPattern(),
      enabled: true
    });
    save();
    renderRules();
    $("addRule").reset();
    $("ruleMsg").textContent = "";
  };

  /* sensitivity */
  document.querySelectorAll('input[name="sensitivity"]').forEach((r) => {
    r.checked = r.value === (settings.sensitivity || "balanced");
    r.onchange = () => { settings.sensitivity = r.value; save(); };
  });

  /* confidential names */
  $("projectTerms").value = (settings.projectTerms || []).join("\n");
  let termTimer;
  $("projectTerms").addEventListener("input", () => {
    clearTimeout(termTimer);
    termTimer = setTimeout(() => {
      settings.projectTerms = $("projectTerms").value.split("\n").map((s) => s.trim()).filter(Boolean);
      save();
    }, 500);
  });

  /* allowlist */
  $("allowlist").value = settings.allowlist.join("\n");
  let allowTimer;
  $("allowlist").addEventListener("input", () => {
    clearTimeout(allowTimer);
    allowTimer = setTimeout(() => {
      settings.allowlist = $("allowlist").value.split("\n").map((s) => s.trim()).filter(Boolean);
      save();
    }, 500);
  });

  /* stats */
  async function renderStats() {
    const st = await S.loadStats();
    const total = Object.values(st.found).reduce((a, b) => a + b, 0);
    $("sFound").textContent = total;
    $("sReplaced").textContent = st.actions.replaced;
    $("sAnyway").textContent = st.actions.sentAnyway;
    const parts = Object.entries(st.found).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + v);
    $("sByType").textContent = parts.length ? parts.join(" · ") : "Nothing caught yet.";
    $("sSince").textContent = st.since ? "Since " + new Date(st.since).toLocaleDateString() : "";
  }
  $("resetStats").onclick = async () => {
    if (!confirm("Reset all counts?")) return;
    await S.resetStats();
    renderStats();
  };
  renderStats();

  // keep in sync if the popup or a page changes settings (e.g. "Always allow")
  S.onChange((s) => {
    settings = s;
    if (document.activeElement !== $("allowlist")) $("allowlist").value = s.allowlist.join("\n");
  });
})();
