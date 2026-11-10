import { Router } from 'express';
import { sessions } from '../store/index.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { loadSession, requireSession } from '../middleware/session.js';
import { ApiError } from '../lib/errors.js';

const router = Router();

// Who is connected? Cached after the first call, so it costs one Buffer request per login.
router.get(
  '/api/me',
  loadSession,
  asyncHandler(async (req, res) => {
    if (!req.session) return res.json({ connected: false });

    if (!req.session.account) {
      const data = await req.buffer.query(`query { account { id email timezone organizations { id name } } }`);
      req.session.account = data.account;
      await sessions.set(req.session);
    }
    res.json({
      connected: true,
      account: req.session.account,
      requestsLeftToday: req.buffer.requestsLeftToday(),
    });
  })
);

// The channels (Instagram, LinkedIn, ...) of one organization. Cached too.
router.get(
  '/api/channels',
  loadSession,
  requireSession,
  asyncHandler(async (req, res) => {
    const organizationId = String(req.query.organizationId ?? '');
    const known = req.session.account?.organizations ?? [];
    if (!known.some((o) => o.id === organizationId)) throw new ApiError('Unknown organization', 400);

    if (!req.session.channels[organizationId] || req.query.refresh === '1') {
      const data = await req.buffer.query(
        `query GetChannels($organizationId: OrganizationId!) {
           channels(input: { organizationId: $organizationId }) {
             id name service avatar isQueuePaused
           }
         }`,
        { organizationId }
      );
      req.session.channels[organizationId] = data.channels;
      await sessions.set(req.session);
    }
    res.json({
      channels: req.session.channels[organizationId],
      requestsLeftToday: req.buffer.requestsLeftToday(),
    });
  })
);

export default router;
