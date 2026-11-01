/*
 * SentinelAI — context-aware detectors (rules layer)
 *
 * Unlike card numbers or API keys, names, health details and salaries have no fixed
 * format. Whether they are sensitive depends on the words around them. Each detector
 * here returns spans with a confidence between 0 and 1; detectors.js then applies the
 * user's sensitivity level and combination rules.
 *
 * English and Hinglish (Hindi typed in English letters) cues are both supported.
 */
(function (root) {
  "use strict";

  const N = (typeof module !== "undefined" && module.exports) ? require("./data/names.js") : root.SentinelNames;

  /* ------------------------------------------------------------------ */
  /* Tokens                                                              */
  /* ------------------------------------------------------------------ */

  function tokenize(text) {
    const out = [];
    const re = /[A-Za-z][A-Za-z'’]*/g;
    let m;
    while ((m = re.exec(text))) {
      let w = m[0];
      let end = m.index + w.length;
      const poss = /['’]s?$/.test(w) && w.length > 2;
      if (poss) { const cut = w.match(/['’]s?$/)[0].length; w = w.slice(0, -cut); end -= cut; }
      out.push({ w, lw: w.toLowerCase(), start: m.index, end, poss });
    }
    return out;
  }

  const isCap = (t) => /^[A-Z][a-z]+$/.test(t.w) || (/^[A-Z]{3,}$/.test(t.w) && (N.first.has(t.lw) || N.last.has(t.lw)));
  const isInitial = (t) => /^[A-Z]$/.test(t.w);
  const inLists = (t) => N.first.has(t.lw) || N.last.has(t.lw);
  const notName = (t) => N.notNames.has(t.lw);

  // Can this token be part of a name? strict = needs a list hit unless capitalised
  function nameLike(t, allowLower) {
    if (notName(t)) return false;
    if (isCap(t) || isInitial(t)) return true;
    return allowLower && inLists(t) && !N.common.has(t.lw);
  }

  // Tokens are adjacent if only spaces (or an initial's dot) sit between them
  function adjacent(text, a, b) {
    const gap = text.slice(a.end + (a.poss ? 2 : 0), b.start);
    return /^\.?\s{1,2}$/.test(gap);
  }

  // Expand a name starting at token index i (max 3 tokens)
  // Ordinary words that often follow "my friend …" / "mera dost …" and are not names
  const LOWER_STOP = new Set((
    "is was has have had and or but who whom which that this the a an to from in on at for with of by about as also " +
    "just really always never still already said says told tells asked asks wants wanted keeps kept thinks thought " +
    "lives lived works worked got gets went goes came comes called calls texted messaged sent sends will would can " +
    "could should might must did does do are am be been being not no yes so very too much many more most some any " +
    "all both each every other another own same such only here there when where why how what if then than because " +
    "since while after before until though like likes liked loves loved hates suggested recommended wrote writes " +
    "made makes gave gives took takes saw sees heard hears know knows knew feel feels felt seems seemed needs needed " +
    "tried tries started stopped used uses old new close good dear little big younger older elder female male whose " +
    "named called recently once twice today yesterday tomorrow now back again " +
    "forgot went came made gave took saw knew left lost bought brought taught caught ate drove ran met paid felt " +
    "found held built broke chose spoke woke won sold slept spent stood understood fell let put read set cut hit " +
    "quit shut told sent kept got said thought wrote " +
    "fine great weird urgent important bad okay ok wrong true false broken strange interesting crazy amazing " +
    "awesome annoying confusing hard easy difficult ready real sure everyone someone anyone nobody everybody " +
    "somebody people its this that these those me myself mine yours ours theirs one " +
    "ne ko ka ki ke hai hain tha thi the se bhi bola boli bole kaha kehta kehti aur ya toh tho na nahi yaar ab kal aaj"
  ).split(" "));

  // allowLower: false | true (known names only) | "any" (first word may be any non-ordinary lowercase word)
  function expandName(text, toks, i, allowLower) {
    if (i >= toks.length) return null;
    const first = toks[i];
    const unknownLowerOk = allowLower === "any" && /^[a-z]{3,}$/.test(first.w) && !LOWER_STOP.has(first.lw) &&
      !notName(first) && !N.common.has(first.lw);
    if (!nameLike(first, allowLower) && !unknownLowerOk) return null;
    if (isInitial(toks[i]) && !(toks[i + 1] && adjacent(text, toks[i], toks[i + 1]))) return null;
    let j = i;
    while (j + 1 < toks.length && j - i < 2 && !toks[j].poss && adjacent(text, toks[j], toks[j + 1])) {
      const nx = toks[j + 1];
      if (notName(nx)) break;
      if (isCap(nx) || isInitial(nx) || (allowLower && inLists(nx) && !N.common.has(nx.lw))) j++;
      else break;
    }
    const span = toks.slice(i, j + 1);
    if (span.every(isInitial)) return null;
    return { start: span[0].start, end: span[span.length - 1].end, toks: span };
  }

  function tokenAt(toks, pos) {
    // first token starting at or after pos (skipping spaces, colons, commas)
    for (let i = 0; i < toks.length; i++) if (toks[i].start >= pos) return i;
    return -1;
  }

  function windowAround(text, start, end, before, after) {
    let a = Math.max(0, start - before);
    let b = Math.min(text.length, end + after);
    const nlBefore = text.lastIndexOf("\n", start - 1);
    const nlAfter = text.indexOf("\n", end);
    if (nlBefore >= a) a = nlBefore + 1;
    if (nlAfter !== -1 && nlAfter < b) b = nlAfter;
    return { before: text.slice(a, start), after: text.slice(end, b), all: text.slice(a, b) };
  }

  /* ------------------------------------------------------------------ */
  /* Names                                                               */
  /* ------------------------------------------------------------------ */

  const RELATIONS =
    "friend|best friend|colleague|coworker|co-worker|manager|boss|senior|junior|client|customer|patient|student|" +
    "employee|intern|teammate|team lead|lead|neighbou?r|landlord|tenant|roommate|flatmate|brother|sister|mother|mom|" +
    "mum|father|dad|wife|husband|son|daughter|uncle|aunt|aunty|cousin|cofounder|co-founder|partner|girlfriend|" +
    "boyfriend|fianc[eé]e?|doctor|lawyer|teacher|professor|recruiter|reportee|mentor|grandfather|grandmother|" +
    "bestie|bff|buddy|crush|ex|bro|sis|classmate|batchmate|hod|supervisor|guide|vendor|contractor|tutor|driver|" +
    "dost|bhai|bhaiya|behen|behan|didi|chacha|chachi|mama|mami|mausi|bua|papa|mummy|biwi|pati|beta|beti|saheli|nana|nani|dada|dadi";

  // longest first so "mummy" isn't read as "mum" + "my"
  const REL_SORTED = RELATIONS.split("|").sort((a, b) => b.length - a.length).join("|");

  const CUES = [
    // [regex ending right before the name, confidence, allowLowercaseName, cueKind]
    [new RegExp("\\b(?:my|our|his|her|their|mera|meri|mere|hamara|hamari|hamare|uska|uski|uske)\\s+(?:" + REL_SORTED + ")\\b\\s*(?:,|:|-)?\\s*", "gi"), 0.85, true, "relation"],
    [new RegExp("\\b(?:a|the|this|our)\\s+(?:patient|client|customer|candidate|applicant|employee|tenant|student)\\s+(?:named\\s+|called\\s+)?", "gi"), 0.7, false, "relation"],
    [/\b(?:my name is|my name's|my full name is|mera naam|mera nam|meraa naam|naam hai|i am called|call me)\s*[:-]?\s*/gi, 0.85, true, "intro"],
    [/\b(?:full name|employee name|customer name|patient name|candidate name|applicant name|student name|name|naam)\s*[:=\-]\s*/gi, 0.85, true, "assign"],
    [/\b(?:candidate|attendee|attendees|employee|customer|client|patient|applicant|contact|owner|assignee|reviewer|author|from|to|cc)\s*:\s*/gi, 0.75, true, "assign"],
    [/\b(?:sent by|prepared by|submitted by|signed by|reported by|approved by)\s*:?\s*/gi, 0.7, false, "assign"],
    [/\b(?:me and|myself and)\s+/gi, 0.6, false, "relation"],
    [/\b(?:named|called)\s+/gi, 0.55, false, "named"],
    [/\b(?:i am|i'm|im|this is|main|mai)\s+/gi, 0.7, true, "self"],
    [/\b(?:mr|mrs|ms|miss|dr|prof|smt|shri|sri|kumari|adv|capt|col)\.?\s+/gi, 0.8, false, "honorific"],
    [/(?:^|\n)\s*(?:dear|respected)\s+/gi, 0.75, true, "greeting"],
    [/(?:^|\n)\s*(?:hi|hello|hey)\s+/gi, 0.6, false, "greeting"],
    [/\b(?:regards|best regards|warm regards|kind regards|thanks and regards|thanks & regards|sincerely|yours sincerely|yours truly|thanks|thank you|cheers|best)\s*,?\s*\n\s*/gi, 0.75, false, "signoff"]
  ];

  const AFTER_DETAIL = /^\s*(?:'s|’s|ka|ki|ke|ko|ne|se)?\s*(?:phone|mobile|number|no\.?|contact|whatsapp|email|e-mail|mail|address|ghar|salary|account|aadhaar|aadhar|pan|dob|date of birth|birthday|passport|details|cibil|credit score|bank)\b/i;
  const AFTER_HONORIFIC = /^\s*(?:ji|bhai|bhaiya|didi|sir|madam|ma'am|uncle|aunty|sahab|saab)\b/i;

  function isHealthWord(w) {
    CONDITION_RE.lastIndex = 0;
    const hit = CONDITION_RE.test(w);
    CONDITION_RE.lastIndex = 0;
    return hit;
  }

  function findNames(text) {
    const toks = tokenize(text);
    const cands = [];

    // 1. Cue phrases: "my colleague ___", "mera naam ___", "Dr. ___", "Dear ___"
    for (const [re, conf, allowLower, kind] of CUES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (m[0].length === 0) { re.lastIndex++; continue; }
        const i = tokenAt(toks, m.index + m[0].length);
        if (i < 0 || toks[i].start - (m.index + m[0].length) > 1) continue;
        // "I'm" / "this is" / "named": only names we recognise (avoids "I'm Tired", "named Pipeline")
        const strictList = kind === "self" || kind === "named";
        const known = N.first.has(toks[i].lw) && !N.common.has(toks[i].lw);
        // "I'm Esha and I run…" — an unknown capitalised word is accepted when a clause follows
        const t1 = toks[i];
        const lineStart = text.lastIndexOf("\n", m.index - 1) + 1;
        const greeted = /^\s*(?:hi+|hello|hey+|hai|namaste|namaskar|good (?:morning|afternoon|evening))\b[\s,!.]*$/i.test(text.slice(lineStart, m.index));
        const clauseAfter = /^\s*(?:,|and\b|from\b|here\b|-|—)/i.test(text.slice(t1.end + (t1.poss ? 2 : 0)));
        const plausible = /^[A-Za-z]{3,}$/.test(t1.w) && !LOWER_STOP.has(t1.lw) && !notName(t1) && !N.common.has(t1.lw) && !/(?:ed|ing|ly)$/.test(t1.lw);
        // lowercase unknown words need a greeting ("hi this is meghana"); otherwise a capital ("I'm Esha and…")
        const introduces = kind === "self" && plausible && !isHealthWord(t1.lw) && (greeted || (clauseAfter && isCap(t1)));
        if (strictList && !known && !introduces) continue;
        const lower = (allowLower && ["relation", "intro", "assign"].includes(kind)) || introduces ? "any" : allowLower;
        const span = expandName(text, toks, i, lower);
        if (!span) continue;
        let c = conf;
        // An unknown lowercase word ("my friend maliaka"): only a name if it doesn't look like a verb
        // and the next word confirms it ("maliaka has…", "sonu ka…", "rahul,")
        const t0 = span.toks[0];
        if (span.toks.length === 1 && !isCap(t0) && !inLists(t0)) {
          if (/(?:ed|ing|ly)$/.test(t0.lw)) continue;
          const confirm = /^(?:\s*(?:,|\.|!|\?|;|$)|['’]s\b|\s+(?:is|was|has|had|and|said|says|told|tells|who|from|ne|ka|ki|ke|ko|bhi|se|hai|tha|thi|ji|bhai|didi|aur)\b)/i
            .test(text.slice(t0.end + (t0.poss ? 0 : 0)));
          const confirmWord = /^(?:\s*,|['’]s\b|\s+(?:is|was|has|had|and|said|says|told|tells|who|from|ne|ka|ki|ke|ko|bhi|se|hai|tha|thi|ji|bhai|didi|aur)\b)/i.test(text.slice(t0.end));
          if (/s$/.test(t0.lw) && !confirmWord) continue;
          c = confirm ? (introduces ? c : c - 0.15) : 0.5;
        }
        cands.push({ start: span.start, end: span.end, conf: c, kind, toks: span.toks });
      }
    }

    // 1a. Someone's relation: "manasa's friend", "Priya Sharma's manager", "rahul ki behen"
    const OWNS = new RegExp("^(?:['’]s?|\\s+(?:ka|ki|ke))\\s+(?:best\\s+|close\\s+|old\\s+)?(?:" + REL_SORTED + ")\\b", "i");
    const RELWORDS = new Set(RELATIONS.split("|"));
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (!OWNS.test(text.slice(t.end))) continue;
      if (!/^[A-Za-z]{3,}$/.test(t.w) || notName(t) || LOWER_STOP.has(t.lw) || RELWORDS.has(t.lw) || /(?:ed|ing|ly)$/.test(t.lw)) continue;
      let s0 = i;
      if (i > 0 && adjacent(text, toks[i - 1], t) && !toks[i - 1].poss && nameLike(toks[i - 1], true) && !LOWER_STOP.has(toks[i - 1].lw)) s0 = i - 1;
      cands.push({ start: toks[s0].start, end: t.end, conf: 0.75, kind: "relation", toks: toks.slice(s0, i + 1) });
    }

    // 1b. Name described right after: "thejas gowda, my teammate", "Oluwaseun Adeyemi who was my intern"
    const APPOS = new RegExp("^\\s*(?:,\\s*|\\s+(?:who|whom)\\s+(?:is|was|has been)\\s+|\\s+(?:is|was)\\s+)(?:my|our|his|her|mera|meri|mere)\\s+(?:" + REL_SORTED + ")\\b", "i");
    const ANDI = /^\s+and\s+(?:i|me|myself)\b/i;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      const rest = text.slice(t.end);
      const appos = APPOS.test(rest), andI = ANDI.test(rest);
      if (!appos && !andI) continue;
      // walk back over up to 3 name-like words (lowercase allowed for an apposition)
      let s0 = i;
      const ok = (x) => !notName(x) && (isCap(x) || isInitial(x) || (appos && /^[a-z]{3,}$/.test(x.w) && !N.common.has(x.lw)));
      if (!ok(t)) continue;
      while (s0 > 0 && i - s0 < 2 && ok(toks[s0 - 1]) && adjacent(text, toks[s0 - 1], toks[s0]) && !toks[s0 - 1].poss) s0--;
      // lowercase words must be at least partly recognisable, or a pair (first + last)
      const span = toks.slice(s0, i + 1);
      if (!span.some(isCap) && !span.some(inLists) && span.length < 2) continue;
      cands.push({ start: span[0].start, end: t.end, conf: appos ? 0.75 : 0.6, kind: appos ? "relation" : "pair", toks: span });
    }

    // 2. Name followed by a personal detail: "Rahul's phone", "Priya ka number", "Amit ji"
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (!(isCap(t) || inLists(t)) || notName(t)) continue;
      if (!inLists(t) && !isCap(t)) continue;
      // walk back to include a first name before a surname
      let s = i;
      if (i > 0 && adjacent(text, toks[i - 1], t) && !toks[i - 1].poss && nameLike(toks[i - 1], true) && (isCap(toks[i - 1]) === isCap(t))) s = i - 1;
      const rest = text.slice(t.end);
      const detail = AFTER_DETAIL.test(rest) || (t.poss && /^\s*(?:phone|mobile|number|contact|email|address|salary|account|aadhaar|pan|details)\b/i.test(text.slice(t.end + 2)));
      const hon = AFTER_HONORIFIC.test(rest);
      if (!detail && !hon) continue;
      if (!inLists(t) && !(isCap(t) && s < i)) { if (!(isCap(t) && detail)) continue; }
      if (N.common.has(t.lw) && !detail) continue;
      cands.push({ start: toks[s].start, end: t.end, conf: detail ? 0.75 : 0.6, kind: detail ? "detail" : "honorific", toks: toks.slice(s, i + 1) });
    }

    // 3. Known first name + surname: "Ananya Iyer", "rahul sharma"
    for (let i = 0; i + 1 < toks.length; i++) {
      const a = toks[i], b = toks[i + 1];
      if (!adjacent(text, a, b) || a.poss) continue;
      if (notName(a) || notName(b)) continue;
      const aFirst = N.first.has(a.lw), bLast = N.last.has(b.lw), bFirst = N.first.has(b.lw);
      let conf = 0;
      if (isCap(a) && isCap(b)) {
        if (aFirst && bLast) conf = 0.7;
        else if (aFirst && !N.common.has(a.lw)) conf = 0.55;
        else if (N.last.has(a.lw) === false && bLast && aFirst) conf = 0.6;
      } else if (aFirst && bLast && !N.common.has(a.lw) && /^[a-z]/.test(a.w) && /^[a-z]/.test(b.w)) {
        conf = 0.5;
      }
      if (conf) {
        const span = expandName(text, toks, i, !isCap(a));
        cands.push({ start: a.start, end: span ? span.end : b.end, conf, kind: "pair", toks: span ? span.toks : [a, b] });
      }
    }

    // 3b. A word that starts an email address in the message: "rahul … rahulshetty@icloud.com"
    const locals = [];
    const emailRe = /([A-Za-z0-9._%+\-]+)@[A-Za-z0-9\-]+\./g;
    let em;
    while ((em = emailRe.exec(text))) locals.push({ local: em[1].toLowerCase(), start: em.index, end: em.index + em[0].length });
    if (locals.length) {
      for (const t of toks) {
        if (t.w.length < 3 || notName(t) || LOWER_STOP.has(t.lw) || N.common.has(t.lw)) continue;
        if (locals.some((l) => t.start >= l.start && t.start < l.end)) continue; // inside the email itself
        const parts = (l) => l.local.split(/[._\-+\d]+/).filter(Boolean);
        const match = locals.some((l) => parts(l).some((p) => p === t.lw || (p.startsWith(t.lw) && t.w.length >= 4)));
        if (match) cands.push({ start: t.start, end: t.end, conf: 0.75, kind: "detail", toks: [t] });
      }
    }

    // 3c. A lowercase known first name: weak alone, but becomes likely next to a phone or email (see combine)
    for (const t of toks) {
      if (!/^[a-z]{3,}$/.test(t.w) || !N.first.has(t.lw) || N.common.has(t.lw) || LOWER_STOP.has(t.lw)) continue;
      cands.push({ start: t.start, end: t.end, conf: 0.4, kind: "single", toks: [t] });
    }

    // 4. A single recognised first name mid-sentence (only surfaces on Strict)
    for (let i = 1; i < toks.length; i++) {
      const t = toks[i];
      if (!/^[A-Z][a-z]+$/.test(t.w) || !N.first.has(t.lw) || N.common.has(t.lw)) continue;
      const before = text.slice(Math.max(0, t.start - 3), t.start);
      if (/[.!?]\s*$|^\s*$/.test(before) || /\n\s*$/.test(text.slice(0, t.start))) continue; // sentence start
      cands.push({ start: t.start, end: t.end, conf: 0.5, kind: "single", toks: [t] });
    }

    // Merge overlapping candidates: keep the most confident, widen to the longest span
    cands.sort((x, y) => y.conf - x.conf || (y.end - y.start) - (x.end - x.start));
    const kept = [];
    for (const c of cands) {
      const hit = kept.find((k) => c.start < k.end && k.start < c.end);
      if (!hit) { kept.push(Object.assign({}, c)); continue; }
      if (c.start <= hit.start && c.end >= hit.end && c.conf >= hit.conf - 0.3) { hit.start = c.start; hit.end = c.end; }
    }

    // Public figures and mythology: low risk unless tied to the user
    const personalKinds = new Set(["relation", "intro", "assign", "greeting", "signoff", "detail", "honorific"]);
    for (const k of kept) {
      const value = text.slice(k.start, k.end).toLowerCase().replace(/\s+/g, " ");
      const words = value.split(" ");
      const isPublic = N.publicFull.has(value) || (words.length === 1 && N.publicSingle.has(value));
      // titles and authors: "the film Arjun Reddy", "Atomic Habits by James Clear"
      const workRef = /\b(?:by|film|movie|book|novel|song|album|show|series|starring|directed by|character|actor|actress|author|singer)\s+(?:the\s+)?$/i.test(text.slice(Math.max(0, k.start - 30), k.start));
      if ((isPublic || workRef) && !personalKinds.has(k.kind)) k.conf = 0.15;
      // "my friend Arjun" is a real person; "Dear Krishna" or "Dr. Shiva" stays cautious
      else if (isPublic && !["relation", "intro", "assign", "detail"].includes(k.kind)) k.conf = Math.min(k.conf, 0.55);
    }

    return kept.map((k) => ({ start: k.start, end: k.end, conf: Math.max(0, Math.min(1, k.conf)), cue: k.kind }));
  }

  /* ------------------------------------------------------------------ */
  /* Health                                                              */
  /* ------------------------------------------------------------------ */

  const CONDITIONS = [
    "type\\s*[12]\\s*diabetes", "diabetes", "diabetic", "sugar", "high bp", "low bp", "bp", "blood pressure", "hypertension",
    "thyroid", "hypothyroidism", "hyperthyroidism", "pcos", "pcod", "asthma", "cancer", "tumou?r", "leukemia",
    "lymphoma", "chemo(?:therapy)?", "hiv", "aids", "hepatitis\\s*[abc]?", "tuberculosis", "tb", "depression",
    "depressed", "anxiety", "panic attacks?", "adhd", "autism", "autistic", "bipolar", "schizophrenia", "ocd", "ptsd",
    "migraines?", "epilepsy", "seizures?", "dengue", "malaria", "typhoid", "covid(?:-19)?", "pregnant", "pregnancy",
    "miscarriage", "infertility", "ivf", "kidney (?:disease|failure|stones?)", "dialysis", "heart (?:disease|attack|condition|problem)",
    "stroke", "paralysis", "arthritis", "cholesterol", "anemia", "anaemia", "insomnia", "eating disorder", "anorexia",
    "bulimia", "std", "sti", "herpes", "psoriasis", "eczema", "vitiligo", "alzheimer'?s", "dementia", "parkinson'?s",
    "dyslexia", "obesity", "fatty liver", "jaundice", "piles", "hernia", "slip disc", "sciatica", "cataract",
    "glaucoma", "endometriosis", "fibroids?", "ulcer", "gastritis", "ibs", "crohn'?s", "lupus", "addiction",
    "alcoholism", "rehab", "therapy", "therapist", "psychiatrist", "antidepressants?", "metformin", "insulin",
    "sertraline", "fluoxetine", "escitalopram", "lithium", "thyronorm", "eltroxin"
  ];
  const CONDITION_RE = new RegExp("\\b(?:" + CONDITIONS.join("|") + ")\\b", "gi");

  const SELF_OR_OTHER = new RegExp(
    "\\b(?:i|i'm|i've|i am|i have|i had|me|my|mine|we|our|he|she|his|her|him|they|their|mujhe|mujhko|mera|meri|mere|" +
    "hamein|humein|hamara|hamari|use|usko|unko|uska|uski|unka|unki|iska|iski|patient|" + RELATIONS + ")\\b", "i");
  const HEALTH_VERB = /\b(?:have|has|had|having|diagnosed|suffering|suffers|suffered|tested positive|positive for|on medication|taking|takes|prescribed|treated for|treatment for|undergoing|recovering|hai|tha|thi|ho gaya|ho gayi|ho gya|ho gyi|chal rahi|chal raha|chalu hai|le raha|le rahi|leta|leti)\b/i;
  const EDUCATIONAL = /\b(?:what is|what are|what causes|explain|symptoms of|causes of|signs of|how to (?:prevent|treat|cure)|how does|tell me about|define|definition|overview|research on|statistics|prevalence|kya hota|kya hai|kaise hota|ke lakshan|essay|article|blog|lecture|notes on|flashcards?|quiz|exam|mcqs?|syllabus|study|revision|class \d+|mbbs|neet|assignment)\b/i;
  const SUGAR_FOOD = /\b(?:sugar)\s+(?:free|cane|syrup|level|levels|intake|content|in|and|to|of|for|substitute)|(?:add|less|more|no|brown|white|cup of|grams of|spoon of|teaspoon of|without)\s+sugar\b/i;

  function findHealth(text) {
    const out = [];
    CONDITION_RE.lastIndex = 0;
    let m;
    while ((m = CONDITION_RE.exec(text))) {
      const v = m[0].toLowerCase();
      const w = windowAround(text, m.index, m.index + m[0].length, 90, 50);
      if (v === "sugar") {
        const medical = /\b(?:sugar)\s+(?:hai|ho|tha|thi|bhi|problem|patient|ki bimari|issue|level)|\b(?:has|have|had|got|ko)\s+(?:\w+\s+){0,4}sugar\b/i.test(w.all) ||
          /\b(?:bp|blood pressure|diabetes|thyroid|cholesterol)\b/i.test(w.all);
        if (SUGAR_FOOD.test(w.all) || !medical) continue;
      }
      if ((v === "bp" || v === "tb" || v === "std" || v === "ibs" || v === "sti") && m[0] !== m[0].toUpperCase()) continue;
      if ((v === "therapy" || v === "rehab") && !/\b(?:my|i|mujhe|meri|mera|in|going to|attend)\b/i.test(w.before)) continue;
      const personal = SELF_OR_OTHER.test(w.before) || SELF_OR_OTHER.test(w.after.slice(0, 25));
      if (!personal) continue;
      let conf = 0.55;
      if (HEALTH_VERB.test(w.all)) conf += 0.1;
      if (EDUCATIONAL.test(w.all) && !/\b(?:i have|i've|i am|i'm|my \w+ (?:has|have|had)|mujhe|meri \w+ ko|mere \w+ ko)\b/i.test(w.all)) conf -= 0.35;
      out.push({ start: m.index, end: m.index + m[0].length, conf });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Salary and money                                                    */
  /* ------------------------------------------------------------------ */

  const AMOUNT = /(?:(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|l|lakhs?|lacs?|lpa|cr|crores?|m|mn|million|thousand|hazaar|hazar)?\b|\b\d[\d,]*(?:\.\d+)?\s?(?:k|lakhs?|lacs?|lpa|cr|crores?|thousand|hazaar|hazar|rupees|rupaye|rupay|dollars)\b|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d{4,8}\b)/gi;
  const MONEY_WORD = /\b(?:make|makes|making|salary|salaries|ctc|package|in-hand|inhand|in hand|take home|take-home|stipend|income|earn|earns|earning|earned|paid|pays|pay|payslip|appraisal|hike|bonus|incentive|net worth|savings|saved|bank balance|balance|loan|emi|debt|owe|owes|credit score|cibil|tanakhwah|tankhwah|kamai|kamata|kamati|kamate|investment|portfolio|fd|rent|offer)\b/i;
  const GENERAL_MONEY = /\b(?:average|avg|typical|median|range|market|trend|trends|industry|expected|benchmark|for freshers|entry[- ]level|in india for|kitni hoti|kitna hota|usually|generally|statistics|survey|minimum wage|tax slab|tax slabs)\b/i;
  const PERSONAL = new RegExp("\\b(?:i|i'm|i've|i am|me|my|mine|we|our|his|her|their|he|she|mujhe|mera|meri|mere|hamara|hamari|uska|uski|unka|unki|" + RELATIONS + ")\\b", "i");

  function findMoney(text) {
    const out = [];
    // credit score: the 3-digit number
    const cs = /\b(?:credit score|cibil(?:\s+score)?)\s*(?:is|of|:|=|hai)?\s*(\d{3})\b/gid;
    let m;
    while ((m = cs.exec(text))) {
      const w = windowAround(text, m.index, m.index + m[0].length, 60, 20);
      if (!PERSONAL.test(w.all)) continue;
      const [s, e] = m.indices[1];
      out.push({ start: s, end: e, conf: 0.6 });
    }
    AMOUNT.lastIndex = 0;
    while ((m = AMOUNT.exec(text))) {
      const raw = m[0];
      if (/^\d{4}$/.test(raw) && +raw >= 1950 && +raw <= 2100) continue; // a year
      const w = windowAround(text, m.index, m.index + raw.length, 60, 30);
      if (!MONEY_WORD.test(w.all)) continue;
      // a bare number needs the money word right next to it
      if (/^\d+$/.test(raw.replace(/,/g, "")) && !/(?:salary|ctc|stipend|income|balance|emi|rent|loan|bonus|pay|kamai)\D{0,15}$/i.test(w.before)) continue;
      if (out.some((o) => m.index < o.end && o.start < m.index + raw.length)) continue;
      let conf = PERSONAL.test(w.all) ? 0.55 : 0.35;
      if (GENERAL_MONEY.test(w.all)) conf = 0.2;
      out.push({ start: m.index, end: m.index + raw.length, conf });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Confidential                                                        */
  /* ------------------------------------------------------------------ */

  const CONF_MARKER = /\b(?:strictly confidential|confidential|internal use only|internal only|for internal use|not for distribution|do not share|don'?t share|do not forward|don'?t forward|under nda|covered by (?:an |the )?nda|embargoed|under embargo|proprietary|trade secret|not yet announced|unannounced|unreleased|privileged (?:and|&) confidential|sirf internal|bahar mat (?:batana|bhejna)|kisi ko mat batana|share mat karna)\b/gi;
  const CONF_ABOUT = /\b(?:how (?:should|do|can|to) (?:i |we |you )?(?:mark|label|tag|classify|handle)|what does|what is|meaning of|how to (?:mark|label|handle)|definition|explain|write an? (?:nda|confidentiality)|draft an? (?:nda|confidentiality)|confidentiality (?:agreement|clause)|template)\b/i;

  function findConfidential(text, projectTerms) {
    const out = [];
    let m;
    CONF_MARKER.lastIndex = 0;
    while ((m = CONF_MARKER.exec(text))) {
      const w = windowAround(text, m.index, m.index + m[0].length, 80, 80);
      if (CONF_ABOUT.test(w.all)) continue;
      // the paragraph the marker belongs to
      let s = text.lastIndexOf("\n\n", m.index);
      s = s === -1 ? 0 : s + 2;
      let e = text.indexOf("\n\n", m.index);
      e = e === -1 ? text.length : e;
      if (out.some((o) => o.start === s)) continue;
      out.push({ start: s, end: e, conf: 0.75, kind: "marker" });
    }
    for (const term of projectTerms || []) {
      const t = String(term).trim();
      if (t.length < 2) continue;
      const re = new RegExp("(?<![A-Za-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![A-Za-z0-9])", "gi");
      while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, conf: 0.9, kind: "term" });
    }
    return out;
  }

  const api = { findNames, findHealth, findMoney, findConfidential, tokenize, windowAround };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SentinelContext = api;
})(typeof self !== "undefined" ? self : this);
