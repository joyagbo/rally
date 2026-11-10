import { $, el, cap } from './dom.js';
import { api } from './api.js';
import { state, selectedChannels, overLimit, emit, on } from './state.js';

let footRefreshers = []; // one small function per card that re-checks its character count

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

  $('form').addEventListener('submit', buildCampaign);
}

async function buildCampaign(event) {
  event.preventDefault();
  $('error').textContent = '';
  const body = {
    title: $('title').value,
    description: $('description').value,
    startsLocal: $('startsLocal').value,
    timezone: $('timezone').value,
    venue: $('venue').value,
    link: $('link').value,
    hashtag: $('hashtag').value,
    speakers: $('speakers').value.split(',').map((s) => s.trim()).filter(Boolean),
  };
  const { ok, data } = await api('/api/preview', { method: 'POST', body });
  if (!ok) {
    $('error').textContent = data.error || 'Something went wrong.';
    return;
  }
  state.campaignTitle = body.title.trim();
  state.campaign = data.posts.map((p) => ({ ...p, include: !p.skipped && !p.needsInput, status: null, message: '' }));
  showMessage('');
  renderPosts();
  $('results').scrollIntoView({ behavior: 'smooth' });
}

// ---------- The post cards ----------
function statusControls(p) {
  if (p.status === 'scheduled') return el('span', { class: 'badge ok' }, 'Scheduled ✓');
  if (p.skipped) return el('span', { class: 'badge warn' }, 'Time already passed');
  if (p.needsInput) return el('span', { class: 'badge' }, 'Written after the event');

  const include = el(
    'label',
    { class: 'inc' },
    el('input', {
      type: 'checkbox',
      checked: p.include,
      on: {
        change: (e) => {
          p.include = e.target.checked;
          updateSummary();
        },
      },
    }),
    'Include'
  );
  return el('div', { class: 'post-actions' }, p.status === 'failed' && el('span', { class: 'badge bad' }, 'Not scheduled'), include);
}

function postCard(p) {
  const textarea = el('textarea', {
    value: p.text,
    disabled: p.skipped || p.status === 'scheduled',
    placeholder: p.needsInput ? 'After the event, add your highlights here and we will help you write the recap.' : '',
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
    refresh();
    updateSummary();
  });
  refresh();

  return el(
    'div',
    { class: 'card post' + (p.skipped ? ' skipped' : '') },
    el(
      'div',
      { class: 'post-head' },
      el('div', {}, el('strong', {}, p.label), el('div', { class: 'when' }, p.dueAtLocal)),
      statusControls(p)
    ),
    textarea,
    el('div', { class: 'foot' }, counter),
    p.status === 'failed' && p.message && el('div', { class: 'failmsg' }, p.message)
  );
}

function renderPosts() {
  $('results').hidden = false;
  footRefreshers = [];
  $('posts').replaceChildren(...state.campaign.map(postCard));
  updateSummary();
}

// ---------- Summary line and the Schedule button ----------
const postsToSend = () =>
  state.campaign.filter((p) => p.include && p.status !== 'scheduled' && !p.skipped && !p.needsInput);

function updateSummary() {
  if (!state.campaign.length) return;
  const chosen = selectedChannels();
  const n = postsToSend().length;
  const c = chosen.length;
  const done = state.campaign.filter((p) => p.status === 'scheduled').length;

  let text = `${n} post${n === 1 ? '' : 's'} ready`;
  if (state.connection.connected) text += ` for ${c} channel${c === 1 ? '' : 's'}`;
  if (done) text += `, ${done} already scheduled`;
  $('summary').textContent = `${text}. The recap comes after the event.`;

  const tooLong = postsToSend().some((p) => overLimit(p.text, chosen));
  const button = $('scheduleBtn');
  button.disabled = !state.connection.connected || n === 0 || c === 0 || tooLong;
  button.textContent = !state.connection.connected
    ? 'Connect Buffer to schedule'
    : tooLong
      ? 'Some posts are too long'
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
      'They will be published publicly at the times shown. You can delete them in Buffer before then.'
  );
  if (!confirmed) return;

  $('scheduleBtn').disabled = true;
  showMessage('Scheduling… this can take a few seconds.');

  const { ok, status, data } = await api('/api/schedule', {
    method: 'POST',
    body: {
      organizationId: state.currentOrgId,
      channelIds: chosen.map((c) => c.id),
      eventTitle: state.campaignTitle,
      posts: send.map(({ type, label, text, dueAtUtc }) => ({ type, label, text, dueAtUtc })),
    },
  });

  if (status === 401) {
    emit('session-expired', 'Your session ended. Please connect again.');
    showMessage('Your session ended. Connect again, then try once more.', 'bad');
  } else if (status === 0) {
    showMessage('Could not reach the server. Check Buffer before trying again, in case some posts went through.', 'bad');
  } else if (!ok) {
    showMessage(data.error || 'Something went wrong.', 'bad');
  } else {
    for (const r of data.results) {
      const post = state.campaign.find((x) => x.type === r.type);
      if (!post) continue;
      post.status = r.status === 'scheduled' ? 'scheduled' : 'failed';
      post.message = r.message || '';
    }
    state.connection.requestsLeftToday = data.requestsLeftToday;
    renderPosts();
    emit('connection-changed');

    const failed = data.results.filter((r) => r.status !== 'scheduled').length;
    const succeeded = data.results.length - failed;
    if (failed === 0) {
      showMessage(`All ${succeeded} posts are scheduled. `, 'ok').append(
        el('a', { href: 'https://publish.buffer.com', target: '_blank', rel: 'noopener' }, 'See them in Buffer')
      );
    } else {
      showMessage(
        `${succeeded} scheduled, ${failed} did not go through. See the cards below. If a message says Buffer could not be reached, check Buffer before trying again, so you do not post twice.`,
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
}
