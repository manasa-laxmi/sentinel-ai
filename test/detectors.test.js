// Run: node test/detectors.test.js
// Test data below is synthetic: card numbers are public test numbers, keys are fake.
const D = require("../src/detectors.js");

// [text, expected detector ids in order]
const SHOULD_FIND = [
  ["mail me at riya.sharma@gmail.com please", ["email"]],
  ["call 98480 22338 tomorrow", ["phone"]],
  ["call 09848022338", ["phone"]],
  ["my number is +91-9876543210", ["phone"]],
  ["US office: +1 (415) 555-0132", ["phone"]],
  ["card 4539 9550 2920 0158 exp 12/29", ["creditCard"]],
  ["card 5274-7652-8571-0113", ["creditCard"]],
  ["amex 376448926337129", ["creditCard"]],
  ["aadhaar 2345 6789 0124", ["aadhaar"]],
  ["PAN is ABCPE1234F", ["pan"]],
  ["pay to riya@okaxis", ["upi"]],
  ["my account no: 123456789012 at SBI", ["bankAccount"]],
  ["OPENAI_API_KEY=sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z", ["apiKey"]],
  ["key AKIA2E0A8F3B244C9986", ["apiKey"]],
  ["token ghp_aBcD1234eFgH5678iJkL9012mNoP3456qRsT", ["apiKey"]],
  ["AIzaSyA-1234567890abcdefghijklmnopqrstu", ["apiKey"]],
  ["api_key: 9f8e7d6c5b4a3F2E1D0Cxyz123", ["apiKey"]],
  ["Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", ["jwt"]],
  ["password: Hunter@2024", ["password"]],
  ["\"password\": \"s3cr3tP@ss\"", ["password"]],
  ["my password is tiger@123", ["password"]],
  ["postgres://admin:SuperS3cret@db.internal:5432/app", ["connectionString"]],
  ["server at 192.168.1.20 is down", ["ipAddress"]],
  ["ipv6 2001:db8:85a3::8a2e:370:7334", ["ipAddress"]],
  ["-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----", ["privateKey"]],
  ["Email a@b.co, phone 9123456780, PAN ABCPE1234F", ["email", "phone", "pan"]]
];

// Text that should NOT trigger anything
const SHOULD_IGNORE = [
  "order id 1234567890123456",            // fails Luhn
  "transaction 1111 1111 1111",           // repeated digits
  "invoice 2024 1234 5678",               // fails Verhoeff
  "version 1.2.3.4 released",
  "localhost is 127.0.0.1",
  "the password is incorrect",
  "password: ********",
  "the meeting is at 10:30",
  "population 1400000000 people",
  "call 1234567890",                      // Indian mobiles start 6-9
  "use the api key from settings",
  "the token expired",
  "my email is on my profile",
  "timestamp 1730448000",
  "ratio 3.14159 and 2.71828",
  "ISBN 978-0-13-468599-1",
  "pincode 500078"
];

let pass = 0, fail = 0;
for (const [text, expected] of SHOULD_FIND) {
  const got = D.scan(text).map((f) => f.type);
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  if (!ok) console.log("MISS  ", JSON.stringify(text), "expected", expected, "got", got);
}
for (const text of SHOULD_IGNORE) {
  const got = D.scan(text);
  const ok = got.length === 0;
  ok ? pass++ : fail++;
  if (!ok) console.log("FALSE+", JSON.stringify(text), "got", got.map((f) => f.type + ":" + f.value));
}

// Known test values and "example" context are shown as low confidence, not hidden silently
{
  const f = D.scan("use test card 4111 1111 1111 1111 for the demo", { all: true });
  const ok = f.length === 1 && f[0].confidence < 0.5;
  ok ? pass++ : (fail++, console.log("TEST VALUE", f));
}

// Sanitising replaces only the sensitive span
const t = "postgres://admin:SuperS3cret@db:5432 and mail riya@gmail.com";
const s = D.sanitize(t, D.scan(t));
const sOk = s === "postgres://admin:[PASSWORD]@db:5432 and mail [EMAIL]";
sOk ? pass++ : (fail++, console.log("SANITIZE", s));

// Allowlist and per-detector toggles
const a = D.scan("mail team@company.com", { allowlist: ["team@company.com"] });
a.length === 0 ? pass++ : (fail++, console.log("ALLOWLIST failed"));
const off = D.scan("mail riya@gmail.com", { enabled: { email: false } });
off.length === 0 ? pass++ : (fail++, console.log("TOGGLE failed"));

// Custom rule
const c = D.scan("employee EMP-004512 joined", { customRules: [{ label: "Employee ID", pattern: "EMP-\\d{6}" }] });
c.length === 1 && D.sanitize("employee EMP-004512 joined", c) === "employee [EMPLOYEE_ID] joined" ? pass++ : (fail++, console.log("CUSTOM failed", c));

console.log(`\n${pass} passed, ${fail} failed (${SHOULD_FIND.length} should-find, ${SHOULD_IGNORE.length} should-ignore, 4 behaviour checks)`);
process.exit(fail ? 1 : 0);
