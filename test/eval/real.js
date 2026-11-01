// Prompts found while using the extension on real sites, plus the cases each one led to.
// Regression set: every gap found in real use gets added here.
module.exports = [
  // 1 Nov 2026, ChatGPT: lowercase, unusual spelling, Hinglish, name only linked by an email
  ["this teddy bear is so weird. my friend maliaka has been saying me to report it to 911 for ages now. her phone 8933746789 doesnt work anymore. uska tho hain na rahul. his email is rahulshetty@icloud.com",
    [["person", "maliaka"], ["person", "rahul"]]],
  ["my friend keerthy said hi", [["person", "keerthy"]]],
  ["my cousin tanu, who lives in pune, needs a resume", [["person", "tanu"]]],
  ["mere dost sonu ka phone kharab hai", [["person", "sonu"]]],
  ["my friend arjun is coming over, plan a game night", [["person", "arjun"]]],
  // 1 Nov 2026, ChatGPT: self-introduction with an unlisted name, and "X's friend"
  ["hi this is meghana, manasa's friend, i want to know about my salary like if getting 35k per month is okay as a 23year old. what can i do differently?",
    [["person", "meghana"], ["person", "manasa"], ["financial", "35k"]]],
  ["Priya Sharma's manager emailed me about the delay", [["person", "Priya Sharma"]]],
  ["rahul ki behen ka number chahiye", [["person", "rahul"]]],
  ["hello this is Arvind from accounts", [["person", "Arvind"]]],
  // self-introduction look-alikes that are not names
  ["this is great, thanks", []],
  ["hi this is weird, why does it fail", []],
  ["this is urgent, please help", []],
  ["my mom's friend called yesterday", []],
  ["the company's client list is outdated", []],
  // ordinary verbs after a relationship word are not names
  ["my boss approved the budget", []],
  ["my manager rejected my leave, what can I do", []],
  ["my client pays late every month", []],
  ["my roommate snores", []],
  ["my colleague forgot the meeting again", []],
  ["my mom cooks really well, suggest a gift", []],
  ["my teacher explained it well", []],
  ["Explain Arjun's dilemma in the Gita", []]
];
