function detectSensitiveData(text) {
  const patterns = {
    email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    phone: /\b(\+91[\-\s]?)?[6-9]\d{9}\b/,
    creditCard: /\b(?:\d[ -]*?){13,16}\b/,
    pan: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,
    aadhaar: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
    jwt: /\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/
  };

  const detected = [];

  for (const key in patterns) {
    if (patterns[key].test(text)) {
      detected.push(key);
    }
  }

  return detected;
}

function sanitizeText(text) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
    .replace(/\b(\+91[\-\s]?)?[6-9]\d{9}\b/g, "[PHONE]")
    .replace(/\b(?:\d[ -]*?){13,16}\b/g, "[CREDIT_CARD]")
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[PAN]")
    .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[AADHAAR]")
    .replace(/\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/g, "[JWT]");
}
