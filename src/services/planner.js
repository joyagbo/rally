import { DateTime } from 'luxon';

// ---------- helpers ----------
const lines = (arr) =>
  arr
    .filter((l) => l !== undefined && l !== null && l !== false)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const joinNames = (names) =>
  names.length > 1
    ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    : names[0];

// ---------- post wording (one set per language; we can add Hausa later) ----------
const TEMPLATES = {
  en: {
    announcement: (e) =>
      lines([
        `📣 Save the date: ${e.title}`,
        '',
        e.description || null,
        e.description ? '' : null,
        `🗓 ${e.dateText}, ${e.timeText}`,
        e.venue ? `📍 ${e.venue}` : null,
        e.link ? `🎟 Register: ${e.link}` : null,
        '',
        e.hashtag || null,
      ]),

    speakers: (e) =>
      lines([
        `🎤 Meet ${e.speakers.length > 1 ? 'our speakers' : 'our speaker'} for ${e.title}: ${joinNames(e.speakers)}.`,
        '',
        `🗓 ${e.dateText}, ${e.timeText}`,
        e.link ? `🎟 Save your seat: ${e.link}` : null,
        '',
        e.hashtag || null,
      ]),

    reminder: (e) =>
      lines([
        `⏳ Only 3 days to go until ${e.title}!`,
        '',
        `🗓 ${e.dateText}, ${e.timeText}`,
        e.venue ? `📍 ${e.venue}` : null,
        e.link ? `🎟 Register: ${e.link}` : null,
        '',
        e.hashtag || null,
      ]),

    tomorrow: (e) =>
      lines([
        `👀 Tomorrow! ${e.title} happens at ${e.timeText}.`,
        e.venue ? `📍 ${e.venue}` : null,
        e.link ? `🎟 Last chance to register: ${e.link}` : null,
        '',
        e.hashtag || null,
      ]),

    live: (e) =>
      lines([
        `🔴 Starting in about an hour: ${e.title}!`,
        e.venue ? `📍 ${e.venue}` : null,
        e.link ? `🔗 ${e.link}` : null,
        '',
        e.hashtag || null,
      ]),

    // The recap needs real notes from the organizer, so it starts empty.
    recap: () => '',
  },
};

// ---------- the campaign timeline ----------
const PLAN = [
  { type: 'announcement', label: 'Announcement', daysBefore: 14, at: '09:00' },
  { type: 'speakers', label: 'Speaker spotlight', daysBefore: 10, at: '09:00', onlyIfSpeakers: true },
  { type: 'reminder', label: '3 days to go', daysBefore: 3, at: '09:00' },
  { type: 'tomorrow', label: 'Tomorrow', daysBefore: 1, at: '09:00' },
  { type: 'live', label: 'Starting soon', hoursBefore: 1 },
  { type: 'recap', label: 'Recap', daysAfter: 1, at: '10:00', needsInput: true },
];

/**
 * input = {
 *   title, description?, startsLocal: '2026-12-05T10:00', timezone: 'Africa/Lagos',
 *   venue?, link?, speakers?: ['Name', ...], hashtag?
 * }
 * Returns a list of planned posts, each with a UTC send time ready for Buffer.
 */
export function buildCampaign(input, { now = DateTime.now(), lang = 'en' } = {}) {
  for (const field of ['title', 'startsLocal', 'timezone']) {
    if (!input[field]) throw new Error(`Missing required field: ${field}`);
  }

  const start = DateTime.fromISO(input.startsLocal, { zone: input.timezone });
  if (!start.isValid) {
    throw new Error(`Invalid start time or timezone: ${start.invalidExplanation}`);
  }

  const e = {
    ...input,
    speakers: (input.speakers ?? []).filter(Boolean),
    dateText: start.setLocale('en').toFormat('cccc, d LLLL yyyy'),
    timeText: `${start.setLocale('en').toFormat('h:mm a')} ${start.offsetNameShort}`,
  };

  const templates = TEMPLATES[lang] ?? TEMPLATES.en;

  return PLAN.filter((item) => !item.onlyIfSpeakers || e.speakers.length > 0).map((item) => {
    let due;
    if (item.hoursBefore) {
      due = start.minus({ hours: item.hoursBefore });
    } else {
      const [hour, minute] = item.at.split(':').map(Number);
      const day = item.daysAfter
        ? start.plus({ days: item.daysAfter })
        : start.minus({ days: item.daysBefore });
      due = day.set({ hour, minute, second: 0, millisecond: 0 });
    }

    // Buffer can't schedule in the past, so mark those instead of failing later.
    const inPast = due < now.plus({ minutes: 15 });

    return {
      type: item.type,
      label: item.label,
      text: templates[item.type](e),
      needsInput: Boolean(item.needsInput),
      skipped: inPast,
      reason: inPast ? 'This time has already passed' : null,
      dueAtLocal: due.setLocale('en').toFormat('ccc d LLL yyyy, h:mm a'),
      dueAtUtc: due.toUTC().toISO(),
    };
  });
}
