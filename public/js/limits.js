// Character limits per network (from Buffer's "Character Limits" guide).
// Used by both the server and the page. Counts are close approximations;
// Buffer makes the final check when a post is created.
export const LIMITS = {
  facebook: 5000,
  instagram: 2196,
  twitter: 280, // the free X plan; paid plans allow more
  x: 280,
  linkedin: 3000,
  pinterest: 500,
  tiktok: 4000,
  threads: 500,
  bluesky: 300,
  googlebusiness: 4000,
  mastodon: 500,
  substack: 10000,
};

// YouTube posts need a video, and this app only writes text.
export const TEXT_ONLY_UNSUPPORTED = ['youtube'];

const URL_RE = /https?:\/\/\S+/g;

export function limitFor(service) {
  return LIMITS[String(service).toLowerCase()] ?? null;
}

export function countFor(service, text) {
  switch (String(service).toLowerCase()) {
    case 'linkedin':
      return text.replace(URL_RE, 'x'.repeat(24)).length; // every link counts as 24
    case 'twitter':
    case 'x':
    case 'mastodon':
      return text.replace(URL_RE, 'x'.repeat(23)).length; // every link counts as 23
    case 'instagram':
      return text.length + (text.match(/\n/g) ?? []).length; // line breaks count as 2
    case 'bluesky':
      return [...new Intl.Segmenter().segment(text)].length; // counts what you see
    default:
      return text.length;
  }
}
