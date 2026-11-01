# Context-aware detection — accuracy (Phase 3, rules layer)

Run with `node test/eval/run.js <dev|holdout|everyday> <relaxed|balanced|strict> [--verbose]`.

All prompts are synthetic, written to resemble real use (English and Hinglish). They are a starting point, not a substitute for real prompts from users.

## Sets

| Set | Prompts | Purpose |
|---|---|---|
| `dev.js` | 119 | Used while writing and tuning the rules |
| `holdout.js` | 62 | Written after tuning: new phrasing, names outside the word lists, casual typing |
| `everyday.js` | 40 | Ordinary prompts with nothing sensitive, written after all fixes, never tuned on — measures false alarms |

## Honest baseline: first blind run on the holdout set (Balanced)

| Category | Recall | Precision |
|---|---|---|
| Names | 58% | 100% |
| Health | 100% | 78% |
| Salary / money | 75% | 100% |
| Confidential | 100% | 100% |
| **All** | **70%** | **94%** |

Clean prompts interrupted on send: **0 of 26**.

The main weakness: names that aren't in the word lists ("Oluwaseun Adeyemi", "thejas gowda") and names without a cue phrase ("Shalini will cover for Manoj").

## After general fixes (holdout no longer blind)

Fixes were general rules, not per-example patches: names described by an apposition ("X, my teammate"), "I'm X and…", field labels ("candidate:", "From:"), more relationship words, any capitalised word after a known first name, and study context for health terms.

| Set | Recall | Precision | Clean prompts interrupted |
|---|---|---|---|
| Dev (Balanced) | 100% | 100% | 0 of 53 |
| Holdout (Balanced) | 98% | 98% | 0 of 26 |
| Everyday (Balanced) | – | – | 0 of 40, no "possible" items shown |

Because the holdout was used to find these fixes, **98% is optimistic. The 70% baseline is the more realistic estimate for unseen text** until a fresh set is measured.

## By sensitivity level (holdout, after fixes)

| Level | Recall | Precision | Found items that hold the message |
|---|---|---|---|
| Relaxed | 48% | 95% | 100% |
| Balanced | 98% | 98% | 60% |
| Strict | 98% | 98% | 100% |

On Balanced, health and salary details on their own are shown as "possible" and don't stop the message. They become blocking when the same message also identifies someone (a name, phone, email or ID).

## Real-use regression set (`real.js`)

Prompts found while using the extension on live sites. The first one (1 Nov 2026, ChatGPT) showed that lowercase names with unusual spellings ("my friend maliaka") and names only linked by an email ("rahul … rahulshetty@icloud.com") were missed. Fixes:

- After a relationship cue, an unknown lowercase word is accepted as a name only if it doesn't look like a verb (-ed, -ing, irregular past tense) and the next word confirms it ("maliaka *has*", "sonu *ka*").
- A word that matches the start of an email address in the same message is treated as a name.
- A lowercase known first name next to a phone or email becomes likely.

`real.js` currently has 13 prompts: all names caught, no false alarms, including 8 "my boss approved…"-style sentences that must not be flagged.

## Known limits

- Bare numbers without a unit ("my current is 21") are not caught as salary.
- Film and book titles that look like names are only handled when introduced by words like "film" or "by".
- Hinglish coverage depends on cue phrases; free-form Hinglish names without a cue rely on the word lists.

## Next

1. Collect 100+ real prompts (from the survey or friends, with consent) as a fresh holdout.
2. Add the optional on-device model and compare: rules only vs rules + model, on the same fresh set.
