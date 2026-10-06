// Serves fixture calendars over HTTP so the app can subscribe to them during E2E tests.
import { createServer } from "node:http";
import { SOURCE_A, SOURCE_B } from "../test/engine/fixtures.ts";

const calendars: Record<string, string> = {
  "/work.ics": SOURCE_A.replace("PRODID:-//Source A//EN", "PRODID:-//Source A//EN\r\nX-WR-CALNAME:Work"),
  "/family.ics": SOURCE_B.replace("PRODID:-//Source B//EN", "PRODID:-//Source B//EN\r\nX-WR-CALNAME:Family"),
};

// An event starting now, so the preview always has something today, in any timezone.
function withTodayEvent(ics: string): string {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  const event = ["BEGIN:VEVENT", "UID:today@example.com", `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(now)}`, `DTEND:${stamp(now + 30 * 60_000)}`, "SUMMARY:Planning", "END:VEVENT"];
  return ics.replace("END:VCALENDAR", `${event.join("\r\n")}\r\nEND:VCALENDAR`);
}

const port = Number(process.env.PORT ?? 8790);
createServer((req, res) => {
  const body = req.url === "/work.ics" ? withTodayEvent(calendars[req.url]) : calendars[req.url ?? ""];
  if (!body) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/calendar; charset=utf-8" }).end(body);
}).listen(port, () => console.log(`calendar fixtures on http://localhost:${port}`));
