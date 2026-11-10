import { buildCampaign } from '../src/services/planner.js';

// A sample event. Change these values to try your own.
const event = {
  title: 'Women in Tech Nasarawa Meetup',
  description: 'An evening of talks and networking for women building careers in tech.',
  startsLocal: '2026-12-05T10:00',
  timezone: 'Africa/Lagos',
  venue: 'Lafia Innovation Hub',
  link: 'https://example.com/register',
  speakers: ['Amina Yusuf', 'Chidi Okafor'],
  hashtag: '#WomenInTech',
};

for (const p of buildCampaign(event)) {
  console.log('='.repeat(60));
  console.log(`${p.label}  |  ${p.dueAtLocal}  (UTC ${p.dueAtUtc})`);
  if (p.skipped) console.log(`SKIPPED: ${p.reason}`);
  if (p.needsInput) console.log('(needs your notes after the event)');
  console.log('-'.repeat(60));
  console.log(p.text || '(empty for now)');
}
console.log('='.repeat(60));
