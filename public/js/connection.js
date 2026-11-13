import { $, el, cap } from './dom.js';
import { api } from './api.js';
import { state, needsVideo, needsImage, emit, on } from './state.js';

// Sentences for each reason the server can give. The page never prints text from the address bar.
const LOGIN_ERRORS = {
  denied: 'The connection was cancelled. Connect again when you are ready.',
  expired: 'That login took too long or was interrupted. Please connect again.',
  rejected: 'Buffer did not accept the login. Please try again.',
  unreachable: 'Rally could not reach Buffer. Check your internet connection and try again.',
  failed: 'Something went wrong while connecting. Please try again.',
};
const WRONG_ADDRESS =
  'Buffer sent you back to the wrong address, so the login could not finish. ' +
  'If you run this app yourself, check that REDIRECT_URI ends with /callback in your settings and in your Buffer client.';

// Reads the address bar once, then cleans it so a login code never stays in the browser history.
function readLoginNotice() {
  const params = new URLSearchParams(location.search);
  let notice = '';
  if (params.has('login_error')) notice = LOGIN_ERRORS[params.get('login_error')] || LOGIN_ERRORS.failed;
  else if (params.has('code') && params.has('state')) notice = WRONG_ADDRESS;
  if (location.search) history.replaceState(null, '', location.pathname);
  return notice;
}
let loginNotice = '';

// ---- The account chip in the top bar, and which part of "Send it" is shown ----
function renderConnection(message) {
  const bar = $('connectBar');
  bar.textContent = '';

  $('noticeBar').textContent = message || '';
  $('noticeBar').hidden = !message;

  const { connected, account } = state.connection;
  $('sendLocked').hidden = connected;
  $('sendReady').hidden = !connected;

  if (!connected) {
    bar.append(el('a', { class: 'btn', href: '/login' }, 'Connect Buffer'));
  } else {
    bar.append(
      el('span', { class: 'who' }, account.email),
      el('button', { type: 'button', class: 'secondary', on: { click: disconnect } }, 'Disconnect')
    );
  }
  emit('connection-changed');
}

async function disconnect() {
  await api('/api/logout', { method: 'POST' });
  state.connection = { connected: false };
  state.channels = [];
  state.selectedChannelIds.clear();
  renderConnection();
  emit('channels-changed');
}

// ---- The channel chips ----
function renderChannels() {
  const list = $('channelList');
  list.textContent = '';
  $('channelNote').textContent = state.channels.length === 0
    ? 'No channels found. Connect a channel in Buffer, then refresh.'
    : '';

  for (const ch of state.channels) {
    const blocked = needsVideo(ch);
    const checkbox = el('input', {
      type: 'checkbox',
      checked: state.selectedChannelIds.has(ch.id) && !blocked,
      disabled: blocked,
      on: {
        change: (e) => {
          if (e.target.checked) state.selectedChannelIds.add(ch.id);
          else state.selectedChannelIds.delete(ch.id);
          emit('channels-changed');
        },
      },
    });
    list.append(
      el(
        'label',
        { class: 'chip' + (blocked ? ' is-blocked' : '') },
        checkbox,
        el('span', {}, ch.name),
        el('span', { class: 'chip-service' }, cap(ch.service)),
        blocked && el('span', { class: 'badge warn' }, 'Needs a video'),
        !blocked && needsImage(ch) && el('span', { class: 'badge warn' }, 'Needs an image'),
        !blocked && ch.isQueuePaused && el('span', { class: 'badge warn' }, 'Queue paused')
      )
    );
  }
  emit('channels-changed');
}

async function loadChannels(organizationId, refresh = false) {
  state.currentOrgId = organizationId;
  const { ok, status, data } = await api(
    `/api/channels?organizationId=${encodeURIComponent(organizationId)}${refresh ? '&refresh=1' : ''}`
  );
  if (status === 401) {
    state.connection = { connected: false };
    return renderConnection('Your session ended. Please connect again.');
  }
  if (!ok) {
    $('channelNote').textContent = data.error || 'Could not load channels.';
    return;
  }
  state.channels = data.channels;
  if (!refresh && state.selectedChannelIds.size === 0) {
    // Channels that need a video or an image are left unticked until the user chooses them.
    state.channels.filter((c) => !needsVideo(c) && !needsImage(c)).forEach((c) => state.selectedChannelIds.add(c.id));
  }
  renderChannels();
}

async function loadConnection() {
  const { ok, status, data } = await api('/api/me');
  if (status === 0) return renderConnection(data.error);
  if (status === 401 || !data.connected) {
    state.connection = { connected: false };
    return renderConnection(loginNotice || (ok ? '' : data.error));
  }
  state.connection = data;
  renderConnection();

  const orgs = data.account.organizations;
  const select = $('orgSelect');
  select.textContent = '';
  orgs.forEach((o) => select.append(el('option', { value: o.id }, o.name)));
  select.hidden = orgs.length < 2;
  if (orgs.length) await loadChannels(orgs[0].id);
}

export function initConnection() {
  $('orgSelect').addEventListener('change', () => {
    state.selectedChannelIds.clear();
    loadChannels($('orgSelect').value);
  });
  $('refreshChannels').addEventListener('click', () =>
    loadChannels(state.currentOrgId || state.connection.account.organizations[0].id, true)
  );
  on('session-expired', (e) => {
    state.connection = { connected: false };
    renderConnection(e.detail);
  });
  loginNotice = readLoginNotice();
  loadConnection();
}
