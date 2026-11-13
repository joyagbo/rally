import { limitFor, countFor, TEXT_ONLY_UNSUPPORTED, NEEDS_IMAGE } from './limits.js';

// Everything the page needs to remember, in one place.
export const state = {
  connection: { connected: false },
  channels: [],
  currentOrgId: null,
  selectedChannelIds: new Set(),
  campaign: [],
  campaignTitle: '',
  image: null, // { blob, previewUrl, uploadedUrl } once the user picks an event image
};

export const selectedChannels = () => state.channels.filter((c) => state.selectedChannelIds.has(c.id));

export const needsVideo = (channel) => TEXT_ONLY_UNSUPPORTED.includes(String(channel.service).toLowerCase());

export const needsImage = (channel) => NEEDS_IMAGE.includes(String(channel.service).toLowerCase());

// The first chosen channel whose character limit this text would break, if any.
export function overLimit(text, chosen) {
  for (const c of chosen) {
    const limit = limitFor(c.service);
    if (!limit) continue;
    const count = countFor(c.service, text);
    if (count > limit) return { name: c.name, count, limit };
  }
  return null;
}

// Lets the parts of the page tell each other what happened, without importing each other.
export const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => document.addEventListener(name, fn);
