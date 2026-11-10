import { limitFor, countFor, TEXT_ONLY_UNSUPPORTED } from '../../public/js/limits.js';
import { ApiError, AuthError } from '../lib/errors.js';

const lit = JSON.stringify; // JSON strings are valid GraphQL string literals

// Checks a schedule request before anything is sent to Buffer.
export function validateScheduleRequest(body, session) {
  const { organizationId, channelIds, eventTitle, posts } = body ?? {};
  const bad = (msg) => new ApiError(msg, 400);

  const known = session.channels?.[organizationId];
  if (!known) throw bad('Load your channels first.');
  if (!Array.isArray(channelIds) || channelIds.length < 1 || channelIds.length > 6) {
    throw bad('Choose between 1 and 6 channels.');
  }
  const chosen = channelIds.map((id) => known.find((c) => c.id === id));
  if (chosen.some((c) => !c)) throw bad('One of the chosen channels was not found.');
  const unsupported = chosen.find((c) => TEXT_ONLY_UNSUPPORTED.includes(String(c.service).toLowerCase()));
  if (unsupported) {
    throw bad(`${unsupported.name} (${unsupported.service}) needs a video, so it cannot be used for text posts yet.`);
  }

  if (!Array.isArray(posts) || posts.length < 1 || posts.length > 8) throw bad('Send between 1 and 8 posts.');

  const minTime = Date.now() + 5 * 60_000;
  const clean = posts.map((p) => {
    const item = {
      type: String(p.type ?? ''),
      label: String(p.label ?? 'Post').slice(0, 80),
      text: String(p.text ?? '').trim(),
      dueAt: new Date(p.dueAtUtc),
    };
    if (!item.text) throw bad(`"${item.label}" has no text.`);
    if (Number.isNaN(item.dueAt.getTime()) || item.dueAt.getTime() < minTime) {
      throw bad(`"${item.label}" is scheduled in the past. Pick a later event date.`);
    }
    for (const c of chosen) {
      const limit = limitFor(c.service);
      const count = countFor(c.service, item.text);
      if (limit && count > limit) throw bad(`"${item.label}" is too long for ${c.name} (${count}/${limit} characters).`);
    }
    return item;
  });

  return { organizationId, chosen, clean, title: String(eventTitle ?? 'Event').slice(0, 80) };
}

// Plan B: one ordinary post per channel
async function createPostsIndividually(client, chosen, p, due) {
  const done = [];
  const failed = [];
  for (const c of chosen) {
    const data = await client.query(
      `mutation {
         createPost(input: {
           text: ${lit(p.text)}, channelId: ${lit(c.id)},
           schedulingType: automatic, mode: customScheduled, dueAt: ${lit(due)}
         }) {
           ... on PostActionSuccess { post { id dueAt } }
           ... on MutationError { message }
         }
       }`
    );
    const out = data.createPost;
    if (out?.post) done.push(c.name);
    else failed.push(`${c.name}: ${out?.message ?? 'unknown error'}`);
  }
  if (failed.length === 0) return { status: 'scheduled', channels: done };
  return {
    status: 'failed',
    message: `${done.length ? `Scheduled on ${done.join(', ')}. ` : ''}Failed on ${failed.join('; ')}`,
  };
}

// One campaign post -> one content item covering every chosen channel
async function scheduleOne(client, { organizationId, chosen, title }, p) {
  const due = p.dueAt.toISOString();
  const variants = chosen
    .map(
      (c) =>
        `{ channelId: ${lit(c.id)}, text: ${lit(p.text)}, schedulingType: automatic, mode: customScheduled, dueAt: ${lit(due)} }`
    )
    .join(', ');

  let data;
  try {
    data = await client.query(
      `mutation {
         createContentItem(input: {
           organizationId: ${lit(organizationId)},
           title: ${lit(`${title} - ${p.label}`.slice(0, 120))},
           targetDate: ${lit(due)},
           posts: [${variants}]
         }) {
           ... on CreateContentItemSuccess {
             content { id body { ... on PostContent { posts { id status dueAt channel { id name } } } } }
           }
           ... on CreateContentItemFailure {
             message
             errors {
               ... on CreateContentItemVariantInvalidInputError { channelId message }
               ... on CreateContentItemVariantLimitReachedError { channelId message }
               ... on CreateContentItemVariantNotFoundError { channelId message }
               ... on MutationError { message }
             }
           }
           ... on MutationError { message }
         }
       }`
    );
  } catch (err) {
    // Content items are still an experimental part of Buffer's API. If Buffer
    // rejects the request itself, fall back to one plain post per channel.
    if (err instanceof ApiError && err.status === 502) {
      console.error('createContentItem failed, falling back to createPost:', err.message);
      return createPostsIndividually(client, chosen, p, due);
    }
    throw err;
  }

  const out = data.createContentItem;
  if (out?.content) {
    const names = out.content.body?.posts?.map((x) => x.channel?.name).filter(Boolean) ?? chosen.map((c) => c.name);
    return { status: 'scheduled', channels: names };
  }
  const details = (out?.errors ?? []).map((e) => e.message).filter(Boolean);
  return { status: 'failed', message: [out?.message, ...details].filter(Boolean).join(' - ') || 'Buffer rejected this post.' };
}

// Schedules every post, one after another. Returns a result per post.
export async function scheduleAll(client, plan) {
  const results = [];
  for (let i = 0; i < plan.clean.length; i++) {
    const p = plan.clean[i];
    try {
      results.push({ type: p.type, ...(await scheduleOne(client, plan, p)) });
    } catch (err) {
      if (err instanceof AuthError) throw err;
      results.push({ type: p.type, status: 'failed', message: err.message });
      if (err instanceof ApiError && err.status === 429) {
        for (const rest of plan.clean.slice(i + 1)) {
          results.push({ type: rest.type, status: 'failed', message: 'Not sent: Buffer asked us to slow down.' });
        }
        break;
      }
    }
  }
  return results;
}
