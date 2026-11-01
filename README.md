# SentinelAI

A browser extension that stops passwords, API keys, card numbers and other personal data from reaching AI chatbots. Everything runs on your device — no servers, no accounts, no tracking.

Works on **ChatGPT, Gemini, Claude, Perplexity and Microsoft Copilot**, in Chrome, Edge and Brave.

## What it does

- **While you type:** sensitive text is underlined and a small label shows how many items were found.
- **When you send:** if the message has sensitive info, it's held back. You can replace each item with a safe placeholder (`[EMAIL]`, `[API_KEY]` …), edit the message yourself, or send it anyway.
- **Always allow:** mark a value (e.g. your work email) as fine to share, and it won't be flagged again.
- **Your own rules:** add patterns for things like employee IDs or project code names.
- **Activity:** counts of what was caught, kept on your device. The actual values are never stored.

## What it detects

| Type | How false alarms are avoided |
|---|---|
| Card numbers | Luhn checksum, card prefixes, consistent grouping |
| Aadhaar | Verhoeff checksum, valid first digit |
| PAN | Holder-type letter (4th character) check |
| UPI IDs | Known bank handles only (`@okaxis`, `@ybl` …) |
| Bank account numbers | Only when the text says "account no" |
| Phone numbers | Indian mobiles (6–9 start) and `+country` numbers; skips repeated/sequential digits |
| Email addresses | |
| API keys | Known formats (OpenAI, Anthropic, AWS, GitHub, Google, Slack, Stripe, Razorpay, Hugging Face …) plus random-looking values after words like `api_key`, `token`, `secret` |
| Passwords | `password: …` forms, and "my password is …" when the value looks like a password |
| Passwords in URLs | `postgres://user:PASSWORD@host` — only the password is replaced |
| Tokens and private keys | JWTs, `-----BEGIN … PRIVATE KEY-----` blocks |
| IP addresses | Valid IPv4/IPv6; skips localhost and version numbers |

## Install (developer mode)

1. Download and unzip this folder.
2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and pick the `sentinel-ai` folder.
5. Open any supported AI site and type as usual.

## How it works

```
manifest.json          MV3, only the "storage" permission
src/
  detectors.js         detection engine — returns exact text spans, resolves overlaps
  adapters.js          per-site selectors for the message box and send button
  editor.js            reads/edits rich editors (ProseMirror, Quill, Lexical) safely
  ui.js                chip, review dialog, highlights (inside Shadow DOM)
  content.js           ties it together: live scan + holding the message on send
  settings.js          settings and counts in chrome.storage.local
  background.js        opens the welcome page on install
pages/                 popup and settings page
test/                  detector tests + a browser test page
```

Key design choices:

- **Span-based detection.** Each detector returns exact positions, so overlapping matches are resolved once and only the sensitive part is replaced. A future on-device NER model (Phase 3) can plug in with the same output.
- **Editor-safe replacement.** AI sites use rich editors that keep their own state; changing `innerText` desyncs them. SentinelAI selects just the sensitive value and uses the browser's insert-text command, so the editor treats it like typing. Formatting and line breaks are kept.
- **Holding the message.** Enter and send-button clicks are caught before the site sees them. After the user decides, SentinelAI triggers the site's own send.
- **Privacy.** Only the `storage` permission. No network requests. Statistics store counts, never values.

## Tests

```
node test/detectors.test.js
```

Runs 47 checks: 26 prompts that should be caught, 17 that should not (order IDs, version numbers, timestamps, "the password is incorrect" …), and behaviour checks for sanitising, the allowlist, toggles and custom rules.

`test/harness/page.html` is a mock chat page used to test the on-page flow (live chip, holding on Enter and on click, replace-and-send, send anyway, unticking items, multi-line messages, textarea composers).

## Known limits

- AI sites change their markup often. If one stops being protected, update its selectors in `src/adapters.js`.
- Names, addresses and other free-form personal details aren't detected yet — that's Phase 3 (on-device NER).
- Files and images attached to a chat aren't scanned yet.

## Roadmap

- **Phase 3:** on-device NER for names and addresses, context-aware detection, file scanning, sensitivity levels, reversible placeholders (`[EMAIL_1]` swapped back in the AI's reply), local dashboard.
