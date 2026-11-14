import { $, el, cap } from './dom.js';
import { api } from './api.js';
import { state, selectedChannels, overLimit, needsImage, emit, on, newPostImage, imageFor } from './state.js';
import { ensureImagesUploaded, shrink } from './image.js';
import { burst } from './confetti.js';

let footRefreshers = []; // one small function per card that re-checks its character count
let refreshTimer = null;
let requestNumber = 0;

// ---------- The event form ----------
function setupForm() {
  // Timezone list, defaulting to Lagos
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Africa/Lagos', 'UTC'];
  const preferred = zones.includes('Africa/Lagos') ? 'Africa/Lagos' : Intl.DateTimeFormat().resolvedOptions().timeZone;
  zones.forEach((z) => $('timezone').append(el('option', { value: z, selected: z === preferred }, z)));

  // Default start: 3 weeks from now at 10:00
  const d = new Date();
  d.setDate(d.getDate() + 21);
  const pad = (n) => String(n).padStart(2, '0');
  $('startsLocal').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;

  // The campaign updates by itself shortly after the user stops typing.
  $('form').addEventListener('submit', (e) => e.preventDefault());
  $('form').addEventListener('input', queueRefresh);
  $('form').addEventListener('change', queueRefresh);
}

const readForm = () => ({
  title: $('title').value,
  description: $('description').value,
  startsLocal: $('startsLocal').value,
  timezone: $('timezone').value,
  venue: $('venue').value,
  link: $('link').value,
  hashtag: $('hashtag').value,
  speakers: $('speakers').value.split(',').map((s) => s.trim()).filter(Boolean),
});

function queueRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshPreview, 300);
}

// Keeps what the user already did (their edits, unticked posts, posts already scheduled)
// when the event details change and the posts are written again.
function mergeCampaign(previous, fresh) {
  const before = new Map(previous.map((p) => [p.type, p]));
  const merged = fresh.map((p) => {
    const old = before.get(p.type);
    if (old?.status === 'scheduled') return old; // already sent to Buffer: never change it
    return {
      ...p,
      text: old?.edited ? old.text : p.text,
      edited: Boolean(old?.edited),
      unticked: Boolean(old?.unticked),
      include: !p.skipped && !p.needsInput && !old?.unticked,
      status: null,
      message: '',
      image: old?.image ?? newPostImage(),
    };
  });
  for (const old of previous) {
    if (old.status === 'scheduled' && !merged.some((p) => p.type === old.type)) merged.push(old);
  }
  return merged;
}

async function refreshPreview() {
  const body = readForm();
  const ticket = ++requestNumber;

  if (!body.title.trim() || !body.startsLocal) {
    $('error').textContent = '';
    if (!state.campaign.some((p) => p.status === 'scheduled')) state.campaign = [];
    return renderPosts();
  }

  const { ok, data } = await api('/api/preview', { method: 'POST', body });
  if (ticket !== requestNumber) return; // a newer answer is on its way
  if (!ok) {
    $('error').textContent = data.error || 'Something went wrong.';
    return;
  }
  $('error').textContent = '';
  state.campaignTitle = body.title.trim();
  state.campaign = mergeCampaign(state.campaign, data.posts);
  renderPosts();
}

// ---------- The timeline of post cards ----------
// Makes a post's text box as tall as its text, so the whole post is visible.
function fitTextarea(box) {
  box.style.height = 'auto';
  if (box.scrollHeight > 0) box.style.height = `${box.scrollHeight + 4}px`;
}

function statusControls(p) {
  if (p.status === 'scheduled') return el('span', { class: 'badge ok' }, 'Scheduled ✓');
  if (p.skipped) return el('span', { class: 'badge warn' }, 'Time has passed');
  if (p.needsInput) return el('span', { class: 'badge' }, 'Written after your event');

  const include = el(
    'label',
    { class: 'inc' },
    el('input', {
      type: 'checkbox',
      checked: p.include,
      on: {
        change: (e) => {
          p.include = e.target.checked;
          p.unticked = !e.target.checked;
          updateSummary();
        },
      },
    }),
    'Include'
  );
  return el('div', { class: 'post-actions' }, p.status === 'failed' && el('span', { class: 'badge bad' }, 'Not scheduled'), include);
}

// ---------- Each post's image: the cover, its own photo, or none ----------
function imageControls(p) {
  const choice = p.image ?? newPostImage();
  const current = imageFor(p);
  const note = el('div', { class: 'error', role: 'alert' }, p.imageNote || '');
  p.imageNote = '';

  const picker = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
  picker.addEventListener('change', async () => {
    const file = picker.files[0];
    if (!file) return;
    try {
      const prepared = await shrink(file);
      if (choice.custom?.previewUrl) URL.revokeObjectURL(choice.custom.previewUrl);
      p.image = { mode: 'custom', custom: { ...prepared, uploadedUrl: null } };
    } catch (err) {
      p.imageNote = err.message;
    }
    renderPosts();
  });

  const setMode = (mode) => () => {
    p.image = { mode, custom: choice.custom };
    renderPosts();
  };

  const status =
    choice.mode === 'custom'
      ? 'Using this post’s own photo'
      : choice.mode === 'none'
        ? 'No image on this post'
        : state.image
          ? 'Using your cover image'
          : 'No image yet';
  const tip =
    p.type === 'speakers' && choice.mode !== 'custom'
      ? el('div', { class: 'small' }, 'Tip: add a photo of your speaker so this post stands out.')
      : null;

  return el(
    'div',
    { class: 'post-image' },
    current
      ? el('img', { class: 'post-thumb', src: current.previewUrl, alt: '' })
      : el('div', { class: 'post-thumb post-thumb-empty', 'aria-hidden': 'true' }, '🖼'),
    el(
      'div',
      { class: 'post-image-body' },
      el('strong', {}, 'Image'),
      el('span', { class: 'small' }, status),
      tip,
      el(
        'div',
        { class: 'post-image-actions' },
        el('button', { type: 'button', class: 'secondary', on: { click: () => picker.click() } },
          choice.mode === 'custom' ? 'Change photo' : 'Add a photo'),
        choice.mode !== 'cover' && el('button', { type: 'button', class: 'secondary', on: { click: setMode('cover') } }, 'Use cover image'),
        choice.mode !== 'none' && el('button', { type: 'button', class: 'secondary', on: { click: setMode('none') } }, 'No image')
      ),
      picker,
      note
    )
  );
}

function postCard(p) {
  const textarea = el('textarea', {
    value: p.text,
    disabled: p.skipped || p.status === 'scheduled',
    placeholder: p.needsInput ? 'The recap isn’t scheduled with the other posts. Write it after your event.' : '',
  });
  const counter = el('span');
  const refresh = () => {
    const over = overLimit(textarea.value, selectedChannels());
    counter.className = over ? 'over' : '';
    counter.textContent = over
      ? `${textarea.value.length} characters · too long for ${over.name} (${over.count}/${over.limit})`
      : `${textarea.value.length} characters`;
  };
  footRefreshers.push(refresh);
  textarea.addEventListener('input', () => {
    p.text = textarea.value;
    p.edited = true;
    fitTextarea(textarea);
    refresh();
    updateSummary();
  });
  refresh();

  return el(
    'article',
    { class: 'post' + (p.skipped ? ' skipped' : '') + (p.status === 'scheduled' ? ' done' : '') },
    el(
      'div',
      { class: 'post-head' },
      el('div', {}, el('strong', {}, p.label), el('span', { class: 'when' }, p.dueAtLocal)),
      statusControls(p)
    ),
    textarea,
    el('div', { class: 'foot' }, counter),
    !p.skipped && !p.needsInput && p.status !== 'scheduled' && imageControls(p),
    p.status === 'failed' && p.message && el('div', { class: 'failmsg' }, p.message)
  );
}

function emptyState() {
  return el(
    'div',
    { class: 'empty' },
    'Your posts will show up here.',
    el('span', {}, 'Add your event name and date and Rally starts writing right away.')
  );
}

function renderPosts() {
  footRefreshers = [];
  $('posts').replaceChildren(...(state.campaign.length ? state.campaign.map(postCard) : [emptyState()]));
  requestAnimationFrame(() => $('posts').querySelectorAll('textarea').forEach(fitTextarea));
  updateSummary();
}

// ---------- Summary line and the Schedule button ----------
const postsToSend = () =>
  state.campaign.filter((p) => p.include && p.status !== 'scheduled' && !p.skipped && !p.needsInput);

function updateSummary() {
  const chosen = selectedChannels();
  const n = postsToSend().length;
  const c = chosen.length;
  const done = state.campaign.filter((p) => p.status === 'scheduled').length;

  if (!state.campaign.length) {
    $('summary').textContent = '';
  } else {
    let text = `${n} post${n === 1 ? '' : 's'} ready`;
    if (state.connection.connected) text += ` for ${c} channel${c === 1 ? '' : 's'}`;
    if (done) text += `, ${done} already scheduled`;
    $('summary').textContent = `${text}. The recap comes after the event.`;
  }

  const tooLong = postsToSend().some((p) => overLimit(p.text, chosen));
  const needy = chosen.find(needsImage);
  const postWithoutImage = needy && postsToSend().find((p) => !imageFor(p));
  const missingImage = postWithoutImage ? { name: needy.name, post: postWithoutImage.label } : null;
  const button = $('scheduleBtn');
  button.disabled = !state.connection.connected || n === 0 || c === 0 || tooLong || Boolean(missingImage);
  button.textContent = !state.campaign.length
    ? 'Add your event to begin'
    : tooLong
      ? 'Some posts are too long to send'
      : missingImage
        ? `${missingImage.name} needs an image on “${missingImage.post}”`
        : c === 0
          ? 'Pick a channel to send to'
          : `Schedule ${n} post${n === 1 ? '' : 's'} on ${c} channel${c === 1 ? '' : 's'}`;
}

function refreshAll() {
  footRefreshers.forEach((f) => f());
  updateSummary();
}

function showMessage(text, kind = '') {
  const box = $('scheduleMsg');
  box.className = kind;
  box.textContent = text;
  return box;
}

async function schedule() {
  const chosen = selectedChannels();
  const send = postsToSend();
  if (!send.length || !chosen.length) return;

  const names = chosen.map((c) => `${c.name} (${cap(c.service)})`).join(', ');
  const confirmed = confirm(
    `Schedule ${send.length} post${send.length === 1 ? '' : 's'} on: ${names}?\n\n` +
    (send.some(imageFor) ? `${send.filter(imageFor).length} of ${send.length} posts include an image.\n` : '') +
    'They will be published publicly at the times shown. You can delete them in Buffer before then.'
  );
  if (!confirmed) return;

  $('scheduleBtn').disabled = true;

  if (send.some(imageFor)) {
    showMessage('Uploading your images…');
    const upload = await ensureImagesUploaded(send);
    if (upload.status === 401) {
      emit('session-expired', 'Your session ended. Please connect again.');
      showMessage('Your session ended. Connect again, then try once more.', 'bad');
      return updateSummary();
    }
    if (!upload.ok) {
      showMessage(upload.data?.error || 'We couldn’t upload an image. Please try again.', 'bad');
      return updateSummary();
    }
  }
  showMessage('Scheduling your posts… this takes a few seconds.');

  const { ok, status, data } = await api('/api/schedule', {
    method: 'POST',
    body: {
      organizationId: state.currentOrgId,
      channelIds: chosen.map((c) => c.id),
      eventTitle: state.campaignTitle,
      posts: send.map((p) => ({
        type: p.type,
        label: p.label,
        text: p.text,
        dueAtUtc: p.dueAtUtc,
        imageUrl: imageFor(p)?.uploadedUrl || null,
      })),
    },
  });

  if (status === 401) {
    emit('session-expired', 'Your session ended. Please connect again.');
    showMessage('Your session ended. Connect again, then try once more.', 'bad');
  } else if (status === 0) {
    showMessage('We couldn’t reach Rally. Check Buffer before trying again, in case some posts went through.', 'bad');
  } else if (!ok) {
    showMessage(data.error || 'Something went wrong.', 'bad');
  } else {
    for (const r of data.results) {
      const post = state.campaign.find((x) => x.type === r.type);
      if (!post) continue;
      post.status = r.status === 'scheduled' ? 'scheduled' : 'failed';
      post.message = r.message || '';
    }
    renderPosts();

    const failed = data.results.filter((r) => r.status !== 'scheduled').length;
    const succeeded = data.results.length - failed;
    if (failed === 0) {
      burst();
      showMessage(`You’re all set! ${succeeded} posts are scheduled. `, 'ok').append(
        el('a', { href: 'https://publish.buffer.com', target: '_blank', rel: 'noopener' }, 'See them in Buffer')
      );
    } else {
      showMessage(
        `${succeeded} scheduled, ${failed} did not go through. See the cards above. If a message says Buffer could not be reached, check Buffer before trying again, so you do not post twice.`,
        'bad'
      );
    }
  }
  updateSummary();
}

export function initCampaign() {
  setupForm();
  $('scheduleBtn').addEventListener('click', schedule);
  on('channels-changed', refreshAll);
  on('connection-changed', updateSummary);
  on('image-changed', renderPosts);
  refreshPreview(); // the default date is filled in, so wait for a name
}