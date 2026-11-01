/*
 * SentinelAI — detection engine
 * Runs fully on the user's device. Nothing here makes network requests.
 *
 * Each detector returns spans ({ start, end }) so that:
 *  - overlapping matches can be resolved (one value is never counted twice)
 *  - sanitising replaces exact spans instead of re-running regexes in order
 *  - a future NER detector (Phase 3) can plug in with the same output shape
 *
 * Works in the browser (window.SentinelDetectors) and in Node (module.exports) for tests.
 */
(function (root) {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Validators                                                          */
  /* ------------------------------------------------------------------ */

  function digitsOnly(s) {
    return s.replace(/\D/g, "");
  }

  // Luhn checksum — used by every major card network
  function luhnValid(num) {
    let sum = 0;
    let double = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let n = num.charCodeAt(i) - 48;
      if (double) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      double = !double;
    }
    return sum % 10 === 0;
  }

  // Verhoeff checksum — the last digit of every valid Aadhaar number
  const VD = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];
  const VP = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 7, 8, 6, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
  ];
  function verhoeffValid(num) {
    let c = 0;
    const digits = num.split("").reverse();
    for (let i = 0; i < digits.length; i++) {
      c = VD[c][VP[i % 8][+digits[i]]];
    }
    return c === 0;
  }

  function allSameChar(s) {
    return /^(.)\1*$/.test(s);
  }

  function isSequential(d) {
    return "0123456789012345678901234567890".includes(d) ||
      "9876543210987654321098765432109".includes(d);
  }

  // Shannon entropy in bits per character — random secrets score high, words score low
  function entropy(s) {
    const freq = {};
    for (const ch of s) freq[ch] = (freq[ch] || 0) + 1;
    let e = 0;
    for (const k in freq) {
      const p = freq[k] / s.length;
      e -= p * Math.log2(p);
    }
    return e;
  }

  function looksRandom(s) {
    if (s.length < 16) return false;
    const classes =
      (/[a-z]/.test(s) ? 1 : 0) + (/[A-Z]/.test(s) ? 1 : 0) +
      (/\d/.test(s) ? 1 : 0) + (/[_\-+/=.]/.test(s) ? 1 : 0);
    return classes >= 2 && entropy(s) >= 3.2;
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */

  // Collect spans for a global regex. If `group` is set, the span covers only that
  // capture group (e.g. the password value, not the word "password").
  function collect(re, text, opts) {
    opts = opts || {};
    const out = [];
    re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (++guard > 5000) break;
      let start = m.index;
      let end = m.index + m[0].length;
      if (opts.group && m.indices && m.indices[opts.group]) {
        [start, end] = m.indices[opts.group];
      }
      const value = text.slice(start, end);
      if (opts.validate && !opts.validate(value, m, text, start)) continue;
      out.push({ start, end });
    }
    return out;
  }

  const B = "(?<![A-Za-z0-9_\\-])"; // left boundary that also respects - and _
  const E = "(?![A-Za-z0-9_\\-])";  // right boundary

  /* ------------------------------------------------------------------ */
  /* Detectors                                                           */
  /* priority: lower wins when two matches overlap                       */
  /* ------------------------------------------------------------------ */

  const API_KEY_PATTERNS = [
    "sk-ant-[A-Za-z0-9_\\-]{20,}",                     // Anthropic
    "sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_\\-]{20,}", // OpenAI
    "(?:AKIA|ASIA)[A-Z0-9]{16}",                        // AWS access key ID
    "gh[pousr]_[A-Za-z0-9]{36,}",                       // GitHub tokens
    "github_pat_[A-Za-z0-9_]{22,}",                     // GitHub fine-grained
    "AIza[0-9A-Za-z_\\-]{35}",                          // Google API key
    "xox[abprs]-[A-Za-z0-9\\-]{10,}",                   // Slack
    "(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}",         // Stripe secret / restricted
    "SG\\.[A-Za-z0-9_\\-]{16,}\\.[A-Za-z0-9_\\-]{16,}", // SendGrid
    "hf_[A-Za-z0-9]{30,}",                              // Hugging Face
    "glpat-[A-Za-z0-9_\\-]{20,}",                       // GitLab
    "npm_[A-Za-z0-9]{36}",                              // npm
    "rzp_(?:live|test)_[A-Za-z0-9]{14,}"                // Razorpay
  ];

  const PASSWORD_PLACEHOLDERS = /^(?:\*+|x+|null|none|empty|n\/a|na|required|optional|hidden|secret|password|your[_-]?password|<.*>|\{.*\}|\$\{.*\}|changeme)$/i;

  const DETECTORS = [
    {
      id: "privateKey",
      label: "Private key",
      placeholder: "[PRIVATE_KEY]",
      priority: 1,
      find: (t) => collect(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g, t)
    },
    {
      id: "jwt",
      label: "Access token (JWT)",
      placeholder: "[TOKEN]",
      priority: 2,
      find: (t) => collect(/\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}/g, t)
    },
    {
      id: "connectionString",
      label: "Password in a connection URL",
      placeholder: "[PASSWORD]",
      priority: 3,
      // postgres://user:SECRET@host — only the password part is replaced
      find: (t) => collect(/\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|sqlserver|s?ftp|https?):\/\/[^\s:@\/]+:([^\s@\/]+)@/gid, t, { group: 1 })
    },
    {
      id: "apiKey",
      label: "API key or secret",
      placeholder: "[API_KEY]",
      priority: 4,
      find: (t) => {
        const known = collect(new RegExp(B + "(?:" + API_KEY_PATTERNS.join("|") + ")" + E, "g"), t);
        // Generic: a random-looking value right after words like api_key / secret / token / Bearer
        const generic = collect(
          /\b(?:api[_\- ]?key|apikey|secret(?:[_\- ]?key)?|client[_\- ]?secret|access[_\- ]?token|auth[_\- ]?token|refresh[_\- ]?token|private[_\- ]?token|token|bearer)\b["']?\s*(?:[:=]\s*|is\s+)?["']?([A-Za-z0-9_\-.\/+=]{16,})/gid,
          t,
          { group: 1, validate: (v) => looksRandom(v) }
        );
        return known.concat(generic);
      }
    },
    {
      id: "password",
      label: "Password",
      placeholder: "[PASSWORD]",
      priority: 5,
      find: (t) => {
        // password: X / pwd=X / "password": "X"
        const assigned = collect(
          /\b(?:password|passwd|passwrd|pwd|passcode|pass|pw)\b["']?\s*[:=]\s*["']?([^\s"',;]{4,})/gid,
          t,
          { group: 1, validate: (v) => !PASSWORD_PLACEHOLDERS.test(v) }
        );
        // my password is X — only when X looks like a password (has a digit or symbol)
        const spoken = collect(
          /\b(?:password|passwd|pwd|passcode)\s+(?:is|was|=)\s+["']?([^\s"',;]{4,})/gid,
          t,
          { group: 1, validate: (v) => /[\d!@#$%^&*?_~]/.test(v) && !PASSWORD_PLACEHOLDERS.test(v) }
        );
        return assigned.concat(spoken);
      }
    },
    {
      id: "email",
      label: "Email address",
      placeholder: "[EMAIL]",
      priority: 6,
      find: (t) => collect(/(?<![A-Za-z0-9._%+\-])[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}\b/g, t)
    },
    {
      id: "upi",
      label: "UPI ID",
      placeholder: "[UPI_ID]",
      priority: 7,
      // name@okaxis — a handle with a bank code and no domain dot after it
      find: (t) => collect(
        /(?<![A-Za-z0-9._\-])[A-Za-z0-9._\-]{2,64}@(?:okaxis|okhdfcbank|okicici|oksbi|ybl|ibl|axl|paytm|upi|apl|yapl|ptyes|ptaxis|pthdfc|ptsbi|axisbank|icici|hdfcbank|sbi|kotak|idfcbank|freecharge|jupiteraxis|fbl|waaxis|wahdfcbank|wasbi|waicici|naviaxis|superyes|pingpay|ikwik|abfspay|airtel|rbl|indus|federal|barodampay|unionbank|pnb|boi|cnrb|aubank|dbs|hsbc|sc|citi)(?![A-Za-z0-9.\-])/gi,
        t
      )
    },
    {
      id: "creditCard",
      label: "Card number",
      placeholder: "[CARD_NUMBER]",
      priority: 8,
      find: (t) => collect(/(?<![\d\-])(?:\d[ \-]?){12,18}\d(?![\d\-])/g, t, {
        validate: (v) => {
          const d = digitsOnly(v);
          if (d.length < 13 || d.length > 19) return false;
          if (allSameChar(d) || isSequential(d)) return false;
          // separators, if used, must be consistent (4-4-4-4 style), not random
          if (/[ \-]/.test(v) && !/^\d{4}([ \-])\d{4,6}(\1\d{4,5}){0,1}(\1\d{1,4})*$/.test(v)) return false;
          return /^[2-6]/.test(d) && luhnValid(d);
        }
      })
    },
    {
      id: "aadhaar",
      label: "Aadhaar number",
      placeholder: "[AADHAAR]",
      priority: 9,
      find: (t) => collect(/(?<![\d\-])[2-9]\d{3}([ \-]?)\d{4}\1\d{4}(?![\d\-])/g, t, {
        validate: (v) => {
          const d = digitsOnly(v);
          return d.length === 12 && !allSameChar(d) && verhoeffValid(d);
        }
      })
    },
    {
      id: "pan",
      label: "PAN",
      placeholder: "[PAN]",
      priority: 10,
      // 4th character is the holder type: P = person, C = company, H = HUF, F = firm...
      find: (t) => collect(/\b[A-Za-z]{3}[ABCFGHLJPTabcfghljpt][A-Za-z]\d{4}[A-Za-z]\b/g, t, {
        validate: (v) => v === v.toUpperCase() || v === v.toLowerCase()
      })
    },
    {
      id: "bankAccount",
      label: "Bank account number",
      placeholder: "[BANK_ACCOUNT]",
      priority: 11,
      // only flagged when the text says it is an account number, to avoid catching random numbers
      find: (t) => collect(
        /\b(?:a\/c|acc(?:ount)?|acct|bank\s+account)\.?\s*(?:no|number|num|#)?\.?\s*(?:is\s*)?[:\-#]?\s*(\d{9,18})(?!\d)/gid,
        t,
        { group: 1, validate: (v) => !allSameChar(v) }
      )
    },
    {
      id: "phone",
      label: "Phone number",
      placeholder: "[PHONE]",
      priority: 12,
      find: (t) => {
        // Indian mobile: 98765 43210, +91 98765-43210, 09876543210
        const india = collect(/(?<![\d+])(?:(?:\+|00)91[ \-]?|0)?[6-9]\d{4}[ \-]?\d{5}(?!\d)/g, t, {
          validate: (v) => {
            const d = digitsOnly(v).slice(-10);
            return !allSameChar(d) && !isSequential(d);
          }
        });
        // International with a leading +country code: +1 (415) 555-0132, +44 20 7946 0958
        const intl = collect(/(?<![\w+])\+[1-9]\d{0,2}[ \-]?\(?\d{1,4}\)?(?:[ \-]?\d{2,5}){1,4}(?!\d)/g, t, {
          validate: (v) => {
            const n = digitsOnly(v).length;
            return n >= 8 && n <= 15;
          }
        });
        return india.concat(intl);
      }
    },
    {
      id: "ipAddress",
      label: "IP address",
      placeholder: "[IP_ADDRESS]",
      priority: 13,
      find: (t) => {
        const oct = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
        const v4 = collect(new RegExp("(?<![\\d.\\w])" + oct + "(?:\\." + oct + "){3}(?![\\d]|\\.\\d)", "g"), t, {
          validate: (v, m, text, start) => {
            if (/^(?:0\.0\.0\.0|127\.0\.0\.1|255\.255\.255\.255)$/.test(v)) return false;
            // skip version numbers such as "v1.2.3.4" or "version 1.2.3.4"
            const before = text.slice(Math.max(0, start - 9), start).toLowerCase();
            return !/(?:v|version\s?)$/.test(before);
          }
        });
        // IPv6: grab colon-hex candidates, then validate the structure in code
        const v6 = collect(/(?<![\w:.])[0-9a-f:]{6,39}(?![\w:])/gi, t, {
          validate: (v) => {
            if (!/^[0-9a-f]*(?::[0-9a-f]*)+$/i.test(v)) return false;
            const halves = v.split("::");
            if (halves.length > 2) return false;
            const groups = halves.join(":").split(":").filter(Boolean);
            if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;
            if (/:::/.test(v)) return false;
            if (halves.length === 1) return groups.length === 8;
            if (groups.length > 7) return false;
            // compressed form: needs enough groups to not be a time or ratio
            return (groups.length >= 3 && /[a-f]/i.test(v)) || groups.length >= 5;
          }
        });
        return v4.concat(v6);
      }
    }
  ];

  /* ------------------------------------------------------------------ */
  /* Public API                                                          */
  /* ------------------------------------------------------------------ */

  const MAX_SCAN_LENGTH = 200000; // very large pastes are scanned up to this length

  function compileCustomRules(rules) {
    const compiled = [];
    (rules || []).forEach((r, i) => {
      if (!r || r.enabled === false || !r.pattern) return;
      try {
        const flags = "g" + (r.caseSensitive ? "" : "i");
        const re = new RegExp(r.pattern, flags);
        const label = r.label || "Custom rule";
        compiled.push({
          id: "custom:" + (r.id || i),
          label,
          placeholder: "[" + label.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "") + "]",
          priority: 5.5, // user-defined rules beat most built-ins
          custom: true,
          find: (t) => collect(re, t)
        });
      } catch (e) {
        /* invalid regex — skipped; the settings page validates on save */
      }
    });
    return compiled;
  }

  /* ------------------------------------------------------------------ */
  /* Context-aware detectors (names, health, money, confidential)        */
  /* ------------------------------------------------------------------ */

  const Ctx = (typeof module !== "undefined" && module.exports) ? require("./context.js") : root.SentinelContext;

  const CONTEXT_DETECTORS = [
    { id: "person", label: "Name", placeholder: "[PERSON]", priority: 20, numbered: true,
      find: (t) => Ctx.findNames(t) },
    { id: "health", label: "Health information", placeholder: "[HEALTH_INFO]", priority: 21,
      find: (t) => Ctx.findHealth(t) },
    { id: "financial", label: "Salary or money detail", placeholder: "[AMOUNT]", priority: 22,
      find: (t) => Ctx.findMoney(t) },
    { id: "confidential", label: "Confidential text", placeholder: "[CONFIDENTIAL_TEXT]", priority: 19,
      find: (t, o) => Ctx.findConfidential(t, o.projectTerms).map((f) =>
        f.kind === "term" ? Object.assign(f, { label: "Confidential project name", placeholder: "[PROJECT]", priority: 4.5 }) : f) }
  ];

  /* ------------------------------------------------------------------ */
  /* Scoring                                                             */
  /* ------------------------------------------------------------------ */

  // show: lowest confidence that is shown at all. tick: lowest that is pre-ticked and holds the message.
  const LEVELS = {
    relaxed: { show: 0.75, tick: 0.75 },
    balanced: { show: 0.5, tick: 0.7 },
    strict: { show: 0.3, tick: 0.5 }
  };

  // Words that mean "this is an example, not real data"
  const EXAMPLE_HINT = /\b(?:example|examples|e\.g\.|eg:|sample|dummy|fake|placeholder|mock|test card|test data|test number|test key|format|regex|validate|validation|generate (?:a|some|random)|random)\b/i;
  const KNOWN_TEST_VALUES = new Set([
    "4111111111111111", "4242424242424242", "5555555555554444", "4000056655665556", "378282246310005",
    "6011111111111117", "akiaiosfodnn7example"
  ]);
  const IDENTIFIERS = new Set(["email", "phone", "aadhaar", "pan", "upi", "bankAccount", "creditCard"]);

  function sentenceOf(text, start, end) {
    let a = start;
    while (a > 0 && !/[.!?\n]/.test(text[a - 1])) a--;
    let b = end;
    while (b < text.length && !/[!?\n]/.test(text[b]) && !(text[b] === "." && /\s/.test(text[b + 1] || " "))) b++;
    return text.slice(a, b);
  }

  function adjust(f, text) {
    if (f.contextual) return;
    const digits = f.value.replace(/[\s\-]/g, "").toLowerCase();
    if (KNOWN_TEST_VALUES.has(digits)) { f.confidence = 0.2; return; }
    if (f.type === "email" && /@(?:example|test|domain|email|company|yourcompany)\.(?:com|org|net|in)$/i.test(f.value)) { f.confidence = 0.25; return; }
    if (EXAMPLE_HINT.test(sentenceOf(text, f.start, f.end))) f.confidence -= 0.45;
  }

  // A name next to a phone number is riskier than either alone. Health or salary details
  // matter most when the message also identifies someone.
  function combine(findings, text) {
    const ids = findings.filter((f) => IDENTIFIERS.has(f.type) || (f.type === "person" && f.confidence >= 0.6));
    for (const f of findings) {
      if (f.type === "person") {
        const near = ids.some((g) => g !== f && g.type !== "person" && Math.abs(g.start - f.end) < 90 && Math.abs(f.start - g.end) < 90);
        if (near) f.confidence = Math.min(1, Math.max(f.confidence, 0.5) + 0.2);
      }
      if ((f.type === "health" || f.type === "financial") && f.confidence >= 0.5 && ids.length) {
        f.confidence = Math.max(f.confidence, 0.8);
      }
    }
  }

  // [PERSON_1], [PERSON_2]... the same value always gets the same number
  function number(findings) {
    const groups = {};
    for (const f of findings) (groups[f.placeholder] = groups[f.placeholder] || []).push(f);
    for (const ph of Object.keys(groups)) {
      const list = groups[ph];
      const distinct = [];
      for (const f of list) {
        const key = f.value.toLowerCase().replace(/\s+/g, " ");
        if (!distinct.includes(key)) distinct.push(key);
      }
      if (distinct.length < 2 && !list[0].numbered) continue;
      for (const f of list) {
        const n = distinct.indexOf(f.value.toLowerCase().replace(/\s+/g, " ")) + 1;
        f.placeholder = ph.replace(/\]$/, "_" + n + "]");
      }
    }
  }

  /**
   * scan(text, options) → findings sorted by position
   * options.enabled: { [detectorId]: boolean } (missing = on)
   * options.customRules: [{ id, label, pattern, enabled, caseSensitive }]
   * options.allowlist: [string] values to ignore (case-insensitive)
   * options.projectTerms: [string] confidential project or product names
   * options.sensitivity: "relaxed" | "balanced" (default) | "strict"
   * options.all: true to also return findings below the show threshold (for tests)
   *
   * Each finding has: type, label, placeholder, value, start, end,
   *   confidence (0–1), selected (pre-ticked; holds the message on send)
   */
  function scan(text, options) {
    options = options || {};
    if (!text) return [];
    if (text.length > MAX_SCAN_LENGTH) text = text.slice(0, MAX_SCAN_LENGTH);

    const enabled = options.enabled || {};
    const level = LEVELS[options.sensitivity] || LEVELS.balanced;
    const allow = new Set((options.allowlist || []).map((s) => String(s).trim().toLowerCase()).filter(Boolean));
    const structured = DETECTORS.filter((d) => enabled[d.id] !== false).concat(compileCustomRules(options.customRules));
    const contextual = Ctx ? CONTEXT_DETECTORS.filter((d) => enabled[d.id] !== false) : [];

    const raw = [];
    const push = (det, s, isCtx) => {
      const value = text.slice(s.start, s.end);
      if (!value.trim()) return;
      if (allow.has(value.trim().toLowerCase())) return;
      raw.push({
        type: det.id,
        label: s.label || det.label,
        placeholder: s.placeholder || det.placeholder,
        priority: s.priority || det.priority,
        numbered: !!det.numbered,
        contextual: isCtx,
        confidence: isCtx ? s.conf : (det.custom ? 0.9 : 0.95),
        start: s.start,
        end: s.end,
        value
      });
    };
    for (const det of structured) {
      let spans = [];
      try { spans = det.find(text); } catch (e) { spans = []; }
      spans.forEach((s) => push(det, s, false));
    }
    for (const det of contextual) {
      let spans = [];
      try { spans = det.find(text, options); } catch (e) { spans = []; }
      spans.forEach((s) => push(det, s, true));
    }

    raw.forEach((f) => adjust(f, text));

    // Resolve overlaps: drop near-zero findings first so they can't hide real ones
    const usable = raw.filter((f) => f.confidence >= 0.1);
    usable.sort((a, b) => a.priority - b.priority || (b.end - b.start) - (a.end - a.start));
    const kept = [];
    for (const f of usable) {
      if (!kept.some((k) => f.start < k.end && k.start < f.end)) kept.push(f);
    }

    combine(kept, text);

    // The same value gets the same score everywhere, so replacing it is all-or-nothing
    const best = {};
    for (const f of kept) {
      const key = f.type + "|" + f.value.toLowerCase().replace(/\s+/g, " ");
      best[key] = Math.max(best[key] || 0, f.confidence);
    }
    for (const f of kept) f.confidence = best[f.type + "|" + f.value.toLowerCase().replace(/\s+/g, " ")];

    let out = options.all ? kept : kept.filter((f) => f.confidence >= level.show - 1e-9);
    out.sort((a, b) => a.start - b.start);
    number(out);
    out.forEach((f, i) => {
      f.id = i;
      f.confidence = Math.round(Math.max(0, Math.min(1, f.confidence)) * 100) / 100;
      f.selected = f.confidence >= level.tick - 1e-9;
      delete f.priority;
      delete f.numbered;
      delete f.contextual;
    });
    return out;
  }

  /**
   * sanitize(text, findings, onlyIds?) → text with each finding swapped for its placeholder.
   * onlyIds lets the user untick findings they want to keep.
   */
  function sanitize(text, findings, onlyIds) {
    const pick = onlyIds ? new Set(onlyIds) : null;
    const list = findings
      .filter((f) => !pick || pick.has(f.id))
      .slice()
      .sort((a, b) => b.start - a.start);
    let out = text;
    for (const f of list) {
      if (out.slice(f.start, f.end) !== f.value) continue; // text changed since scan
      out = out.slice(0, f.start) + f.placeholder + out.slice(f.end);
    }
    return out;
  }

  // Short preview that never shows the full value on screen
  function mask(value) {
    const v = value.replace(/\s+/g, " ").trim();
    if (v.startsWith("-----BEGIN")) return "-----BEGIN … PRIVATE KEY-----";
    if (v.length <= 4) return "•".repeat(v.length);
    if (v.length <= 8) return v.slice(0, 1) + "•".repeat(v.length - 2) + v.slice(-1);
    return v.slice(0, 2) + "•".repeat(Math.min(v.length - 4, 8)) + v.slice(-2);
  }

  function summarize(findings) {
    const counts = {};
    for (const f of findings) counts[f.label] = (counts[f.label] || 0) + 1;
    return Object.keys(counts).map((label) => (counts[label] > 1 ? counts[label] + " × " : "") + label);
  }

  const api = {
    scan,
    sanitize,
    mask,
    summarize,
    detectors: DETECTORS.map((d) => ({ id: d.id, label: d.label, placeholder: d.placeholder, group: "structured" }))
      .concat(CONTEXT_DETECTORS.map((d) => ({ id: d.id, label: d.label, placeholder: d.placeholder, group: "context" }))),
    LEVELS,
    _internal: { luhnValid, verhoeffValid, entropy, looksRandom }
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SentinelDetectors = api;
})(typeof self !== "undefined" ? self : this);
