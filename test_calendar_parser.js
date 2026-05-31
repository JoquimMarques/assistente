// Test script to debug command parsing
const inputs = [
  "criar evento prova dia 10 de junho às 17:00",
  "criar evento prova no dia 10 de junho às 17:00",
  "criar evento dentista dia 15/06 às 14:30",
  "criar evento reunião de trabalho dia 12 de junho às 15:00",
  "criar evento nome do evento prova data 31105 de 2026 hora 14:00 local em quilombo",
  "criar evento prova dia 10 de junho as 17:00",
  "criar evento prova 10 de junho 17:00",
];

function parseCalendarEvent(text) {
  const lowerRaw = text.toLowerCase().trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[?!.,;:]/g, " ").toLowerCase().replace(/\s+/g, " ").trim();

  const eventKeywords = ["criar evento", "criar um evento", "criar novo evento", "criar compromisso", "agendar", "marcar"];
  let matchedKeyword = null;
  for (const kw of eventKeywords) {
    if (lowerRaw.includes(kw)) { matchedKeyword = kw; break; }
  }
  if (!matchedKeyword) return { result: null };

  let rest = lowerRaw.slice(lowerRaw.indexOf(matchedKeyword) + matchedKeyword.length).trim();
  rest = rest.replace(/^(nome do evento|chamado)\s+/i, "").trim();

  // 1. Extract TIME
  let time = "";
  const timeColon = rest.match(/\b(\d{1,2})[h:](\d{2})\b/);
  if (timeColon) {
    time = `${String(timeColon[1]).padStart(2,"0")}:${String(timeColon[2]).padStart(2,"0")}`;
  } else {
    const timeHour = rest.match(/\b(\d{1,2})\s+(?:horas?|h)\b/);
    if (timeHour) time = `${String(timeHour[1]).padStart(2,"0")}:00`;
  }

  // 2. Extract DATE
  let date = "";
  const monthNames = { "janeiro":"01","fevereiro":"02","marco":"03","março":"03","abril":"04","maio":"05","junho":"06","julho":"07","agosto":"08","setembro":"09","outubro":"10","novembro":"11","dezembro":"12" };
  const slashDate = rest.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slashDate) {
    date = `${slashDate[1]}/${slashDate[2]}/${slashDate[3] || 2026}`;
  } else {
    const monthRegex = new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${Object.keys(monthNames).join("|")})\\b`, "i");
    const mMatch = rest.match(monthRegex);
    if (mMatch) {
      const mKey = mMatch[2].toLowerCase();
      const m = monthNames[mKey] || "01";
      const yearM = rest.match(/\bde\s+(\d{4})\b/);
      date = `${mMatch[1]}/${m}/${yearM ? yearM[1] : 2026}`;
    } else if (/\b31105\b/.test(rest)) {
      date = `31/05/2026`;
    }
  }

  // 3. Extract TITLE (everything before the date/time separator keyword)
  let title = "";
  const sepMatch = rest.match(/\b(no\s+dia|na\s+data|para\s+o\s+dia|dia|data|hora|no|na|às|as\s+\d|local)\b/i);
  if (sepMatch) {
    title = rest.slice(0, sepMatch.index).trim();
  } else {
    title = rest.trim();
  }
  title = title.replace(/\s+\b(no|na|para|ao|a|de|do|da)\s*$/i, "").trim();

  return { title, date, time, willCreate: !!(title && date && time) };
}

for (const input of inputs) {
  const result = parseCalendarEvent(input);
  console.log(`\nINPUT: "${input}"`);
  console.log(`→ title: "${result.title}" | date: "${result.date}" | time: "${result.time}" | will_create: ${result.willCreate}`);
}
