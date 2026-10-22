/** Business time zone for run dates, seeds and file names. Override with RUN_TIMEZONE. */
export const RUN_TIMEZONE = process.env.RUN_TIMEZONE ?? 'America/Chicago';

function parts(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: RUN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
}

/** YYYY-MM-DD in the business time zone. */
export function localDate(d = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** YYYY-MM-DDTHH-MM-SS in the business time zone, safe for file names. */
export function localStamp(d = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}-${p.minute}-${p.second}`;
}
