// Inject detector functions
function detectSensitiveData(text) {
  const patterns = {
    email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    phone: /\b(\+?\d{1,3}[\s-]?)?\d{10}\b/,
    creditCard: /\b(?:\d[ -]*?){13,16}\b/,
    pan: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/,
    aadhaar: /\b\d{4}\s?\d{4}\s?\d{4}\b/,
    jwt: /\beyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\b/,
    apiKey: /\bsk-[A-Za-z0-9]{20,}\b/,
    ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/
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

function getInputField() {
  return document.querySelector('[contenteditable="true"]');
}


function removeExistingBanner() {
  const existing = document.getElementById("sentinel-banner");
  if (existing) existing.remove();
}

function showWarning(detectedTypes, textarea) {
  removeExistingBanner();

  const banner = document.createElement("div");
  banner.id = "sentinel-banner";

  const message = document.createElement("span");
  message.innerText =
    "Sensitive data detected: " + detectedTypes.join(", ");

  const sanitizeBtn = document.createElement("button");
  sanitizeBtn.innerText = "Sanitize";

  sanitizeBtn.onclick = () => {
    textarea.innerText = sanitizeText(textarea.innerText);

    removeExistingBanner();
  };

  const sendBtn = document.createElement("button");
  sendBtn.innerText = "Send Anyway";

  sendBtn.onclick = () => {
    removeExistingBanner();
  };

  banner.appendChild(message);
  banner.appendChild(sanitizeBtn);
  banner.appendChild(sendBtn);

  document.body.appendChild(banner);
}

function checkInput() {
  const textarea = getInputField();

  if (!textarea) return;

  const text = textarea.innerText;

  const detected = detectSensitiveData(text);

  if (detected.length > 0) {
    showWarning(detected, textarea);
  } else {
    removeExistingBanner();
  }
}

function startMonitoring() {
  const observer = new MutationObserver(() => {
    checkInput();
  });

  const inputField = getInputField();

  if (inputField) {
    observer.observe(inputField, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
}

// Wait for ChatGPT input to render
setTimeout(startMonitoring, 2000);


// document.addEventListener("paste", () => {
//   setTimeout(checkInput, 100);
// });

// document.addEventListener("keydown", (event) => {
//   if (event.key === "Enter") {
//     checkInput();
//   }
// });

console.log("SentinelAI loaded");
