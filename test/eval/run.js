// Accuracy report for the context-aware detectors.
// Run: node test/eval/run.js [dev|holdout] [relaxed|balanced|strict] [--verbose]
const D = require("../../src/detectors.js");

const setName = process.argv[2] || "dev";
const level = process.argv[3] || "balanced";
const verbose = process.argv.includes("--verbose");
const data = require("./" + setName + ".js");
const TYPES = ["person", "health", "financial", "confidential"];

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const stats = {};
TYPES.forEach((t) => (stats[t] = { tp: 0, fp: 0, fn: 0, held: 0 }));
let cleanPrompts = 0, cleanHeld = 0, cleanShown = 0;
const errors = [];

for (const [text, expected] of data) {
  const found = D.scan(text, { sensitivity: level }).filter((f) => TYPES.includes(f.type));
  const used = new Set();
  for (const [type, value] of expected) {
    const v = norm(value);
    const hit = found.find((f, i) => !used.has(i) && f.type === type && (norm(f.value).includes(v) || v.includes(norm(f.value))) &&
      (used.add(i) || true));
    if (hit) { stats[type].tp++; if (hit.selected) stats[type].held++; }
    else { stats[type].fn++; errors.push(["MISSED", type, value, text]); }
  }
  found.forEach((f, i) => {
    if (!used.has(i)) { stats[f.type].fp++; errors.push(["FALSE ALARM", f.type, f.value + " (" + f.confidence + ")", text]); }
  });
  if (!expected.length) {
    cleanPrompts++;
    if (found.length) cleanShown++;
    if (found.some((f) => f.selected)) cleanHeld++;
  }
}

const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "–");
console.log(`\n${setName} set · ${data.length} prompts · sensitivity: ${level}\n`);
console.log("category       caught  missed  false alarms  recall  precision  held on send");
let T = { tp: 0, fp: 0, fn: 0, held: 0 };
for (const t of TYPES) {
  const s = stats[t];
  T.tp += s.tp; T.fp += s.fp; T.fn += s.fn; T.held += s.held;
  console.log(t.padEnd(14), String(s.tp).padStart(6), String(s.fn).padStart(7), String(s.fp).padStart(13),
    pct(s.tp, s.tp + s.fn).padStart(7), pct(s.tp, s.tp + s.fp).padStart(10), pct(s.held, s.tp).padStart(13));
}
console.log("ALL".padEnd(14), String(T.tp).padStart(6), String(T.fn).padStart(7), String(T.fp).padStart(13),
  pct(T.tp, T.tp + T.fn).padStart(7), pct(T.tp, T.tp + T.fp).padStart(10), pct(T.held, T.tp).padStart(13));
console.log(`\nprompts with nothing sensitive: ${cleanPrompts} · interrupted on send: ${cleanHeld} (${pct(cleanHeld, cleanPrompts)}) · showed a possible item: ${cleanShown}`);

if (verbose) for (const e of errors) console.log(e[0].padEnd(12), e[1].padEnd(12), JSON.stringify(e[2]).padEnd(40), "|", e[3].replace(/\n/g, "⏎").slice(0, 90));
