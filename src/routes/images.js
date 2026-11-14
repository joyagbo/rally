import crypto from 'crypto';
import express, { Router } from 'express';
import { imagesConfigured } from '../config/env.js';
import { images } from '../store/index.js';
import { detectImageType } from '../lib/imageType.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { ApiError } from '../lib/errors.js';
import { loadSession, requireSession } from '../middleware/session.js';
import { uploadToCloudinary } from '../services/cloudinary.js';

const router = Router();

const MAX_BYTES = 3 * 1024 * 1024; // the page shrinks images well below this
const MAX_PER_ACCOUNT = 60; // a campaign can use a cover plus a photo per post
const KEEP_RECORD_DAYS = 90;

// Upload one image. Returns the public address Buffer will use.
router.post(
  '/api/images',
  loadSession,
  requireSession,
  express.raw({ type: ['image/jpeg', 'image/png'], limit: MAX_BYTES }),
  asyncHandler(async (req, res) => {
    if (!imagesConfigured()) {
      throw new ApiError('Images are not set up on this server yet. Posts can still be scheduled without an image.', 503);
    }
    const owner = req.session.account?.id;
    if (!owner) throw new ApiError('Please reload the page and connect again.', 400);

    const bytes = req.body;
    const type = Buffer.isBuffer(bytes) && bytes.length ? detectImageType(bytes) : null;
    if (!type) throw new ApiError('Choose a JPG or PNG image.', 400);

    if ((await images.countByOwner(owner)) >= MAX_PER_ACCOUNT) {
      throw new ApiError(`You have reached the limit of ${MAX_PER_ACCOUNT} uploaded images.`, 400);
    }

    const { url, publicId } = await uploadToCloudinary(bytes, type.mime);
    await images.put({
      id: crypto.randomBytes(12).toString('base64url'),
      owner,
      url,
      publicId,
      expiresAt: Date.now() + KEEP_RECORD_DAYS * 24 * 60 * 60 * 1000,
    });
    res.json({ url });
  })
);

export default router;