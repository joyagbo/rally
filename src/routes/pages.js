import { Router } from 'express';
import { config } from '../config/env.js';
import { renderPrivacy } from '../views/privacy.js';

const router = Router();

router.get('/privacy', (req, res) => {
  res.type('html').send(renderPrivacy(config.contactEmail));
});

export default router;
