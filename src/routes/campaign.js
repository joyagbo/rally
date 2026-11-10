import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/errors.js';
import { loadSession, requireSession } from '../middleware/session.js';
import { buildCampaign } from '../services/planner.js';
import { validateScheduleRequest, scheduleAll } from '../services/scheduler.js';

const router = Router();
const clean = (v) => String(v ?? '').trim();

// Turn event details into a list of posts. No Buffer calls, so it costs no quota.
router.post('/api/preview', (req, res) => {
  const b = req.body ?? {};
  const event = {
    title: clean(b.title),
    description: clean(b.description),
    startsLocal: clean(b.startsLocal),
    timezone: clean(b.timezone),
    venue: clean(b.venue),
    link: clean(b.link),
    hashtag: clean(b.hashtag),
    speakers: Array.isArray(b.speakers) ? b.speakers.map(clean).filter(Boolean) : [],
  };
  try {
    res.json({ posts: buildCampaign(event) });
  } catch (err) {
    throw new ApiError(err.message, 400);
  }
});

// Send the posts to Buffer.
router.post(
  '/api/schedule',
  loadSession,
  requireSession,
  asyncHandler(async (req, res) => {
    const plan = validateScheduleRequest(req.body, req.session);
    const results = await scheduleAll(req.buffer, plan);
    res.json({ results, requestsLeftToday: req.buffer.requestsLeftToday() });
  })
);

export default router;
