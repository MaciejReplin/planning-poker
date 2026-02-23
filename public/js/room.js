const params = new URLSearchParams(window.location.search);
const roomId = params.get('id');
if (!roomId) window.location.href = '/';

let ws;
let myName = '';
let isHost = false;
let currentScale = [];
let myVote = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Toast
function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// Restore saved name
const savedName = localStorage.getItem('poker_display_name');
if (savedName) $('#display-name').value = savedName;

// Join
$('#join-room-btn').addEventListener('click', joinRoom);
$('#display-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });

function joinRoom() {
  myName = $('#display-name').value.trim();
  if (!myName) return alert('Enter a name');
  localStorage.setItem('poker_display_name', myName);

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}?room=${roomId}&name=${encodeURIComponent(myName)}`);

  ws.onopen = () => {
    $('#name-prompt').classList.add('hidden');
    $('#room-ui').classList.remove('hidden');
  };

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    toast('Disconnected from room', true);
  };
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

// Message router
function handleMessage(msg) {
  switch (msg.type) {
    case 'room_state': onRoomState(msg); break;
    case 'participant_joined':
    case 'participant_left': renderParticipants(msg.participants); break;
    case 'host_changed': onHostChanged(msg); break;
    case 'voting_started': onVotingStarted(msg); break;
    case 'vote_cast': onVoteCast(msg); break;
    case 'votes_revealed': onVotesRevealed(msg); break;
    case 'estimate_accepted': onEstimateAccepted(msg); break;
    case 'scale_changed': onScaleChanged(msg); break;
    case 'kicked':
      alert('You have been removed from the room');
      window.location.href = '/';
      break;
    case 'error':
      toast(msg.message, true);
      break;
  }
}

// --- Handlers ---

function onRoomState(msg) {
  currentScale = msg.room.scale;
  isHost = msg.host === myName;
  $('#room-name-display').textContent = msg.room.name;
  $('#room-code-display').textContent = ` (${msg.room.id})`;
  $('#history-link').href = `/history.html?id=${roomId}`;
  $('#leaderboard-link').href = `/leaderboard.html?id=${roomId}`;
  renderParticipants(msg.participants);
  updateHostUI();

  if (msg.currentEstimation) {
    showEstimation(msg.currentEstimation);
    msg.votedNames.forEach(n => markVoted(n));
    if (msg.currentEstimation.status === 'voting') {
      $('#vote-progress').classList.remove('hidden');
      updateVoteProgress(msg.votedNames.length, msg.participants.length);
    }
  }
}

function onHostChanged(msg) {
  isHost = msg.host === myName;
  updateHostUI();
  toast(`${msg.host} is now the host`);
}

function onVotingStarted(msg) {
  myVote = null;
  showEstimation(msg.estimation);
  $('#results-area').classList.add('hidden');
  $('#voting-area').classList.remove('hidden');
  $('#vote-progress').classList.remove('hidden');
  updateVoteProgress(0);
  renderCards();
  updateHostButtons('voting');
}

function onVoteCast(msg) {
  markVoted(msg.participant);
  updateVoteProgress(msg.totalVotes, msg.totalParticipants);
}

function onVotesRevealed(msg) {
  $('#voting-area').classList.add('hidden');
  $('#vote-progress').classList.add('hidden');
  $('#results-area').classList.remove('hidden');

  // Render individual votes
  const container = $('#vote-results');
  container.innerHTML = '';
  msg.votes.forEach(v => {
    container.innerHTML += `
      <div class="vote-result-item">
        <div class="card-revealed">${escapeHtml(v.value)}</div>
        <div class="name">${escapeHtml(v.participant)}</div>
      </div>`;
  });

  // Stats
  const statsEl = $('#stats');
  statsEl.innerHTML = '';
  if (msg.stats.average != null) {
    statsEl.innerHTML += `<div class="stat"><div class="value">${msg.stats.average}</div><div class="label">Average</div></div>`;
    statsEl.innerHTML += `<div class="stat"><div class="value">${msg.stats.median}</div><div class="label">Median</div></div>`;
  }
  statsEl.innerHTML += `<div class="stat"><div class="value">${msg.stats.consensus ? 'Yes' : 'No'}</div><div class="label">Consensus</div></div>`;

  updateHostButtons('revealed');

  // Pre-fill final estimate
  if (isHost && msg.stats.median != null) {
    $('#final-estimate').value = msg.stats.median;
  }
}

function onEstimateAccepted(msg) {
  toast(`Accepted: ${msg.estimation.finalEstimate || 'no value'}`);
  $('#estimation-panel').classList.add('hidden');
  $('#vote-progress').classList.add('hidden');
  showStartPanel();
  resetParticipantVotes();
}

function onScaleChanged(msg) {
  currentScale = msg.scale;
  renderCards();
  toast('Scale changed');
}

// --- UI Helpers ---

function updateHostUI() {
  $$('.host-only').forEach(el => {
    el.classList.toggle('hidden', !isHost);
  });
  if (isHost && !$('#estimation-panel').classList.contains('hidden')) return;
  if (isHost) showStartPanel();
}

function showStartPanel() {
  if (isHost) {
    $('#start-panel').classList.remove('hidden');
    $('#jira-key').value = '';
    $('#jira-title').value = '';
    $('#jira-url').value = '';
  }
}

function showEstimation(est) {
  $('#estimation-panel').classList.remove('hidden');
  $('#start-panel').classList.add('hidden');
  const display = est.jiraKey ? `${est.jiraKey}: ${est.title}` : est.title;
  $('#est-title').textContent = display;
  if (est.jiraUrl) {
    $('#est-link').textContent = est.jiraUrl;
    $('#est-link').href = est.jiraUrl;
    $('#est-link').classList.remove('hidden');
  } else {
    $('#est-link').classList.add('hidden');
  }
  renderCards();
}

function renderCards() {
  const grid = $('#card-grid');
  grid.innerHTML = '';
  currentScale.forEach(val => {
    const card = document.createElement('div');
    card.className = 'vote-card' + (myVote === val ? ' selected' : '');
    card.textContent = val;
    card.addEventListener('click', () => {
      myVote = val;
      $$('.vote-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      send({ type: 'vote', value: val });
    });
    grid.appendChild(card);
  });
}

function renderParticipants(list) {
  const container = $('#participants');
  container.innerHTML = '';
  list.forEach(p => {
    let html = `<div class="participant-chip" data-name="${escapeHtml(p.name)}">`;
    if (p.hasVoted) html += `<span class="voted-dot"></span>`;
    html += escapeHtml(p.name);
    if (p.isHost) html += ` <span class="host-badge">HOST</span>`;
    if (isHost && p.name !== myName) {
      html += ` <span class="kick-btn" data-name="${escapeHtml(p.name)}" style="cursor:pointer;color:var(--danger);font-size:0.8rem;" title="Kick">&times;</span>`;
    }
    html += `</div>`;
    container.innerHTML += html;
  });

  // Kick handlers
  container.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(`Kick ${btn.dataset.name}?`)) {
        send({ type: 'kick', participant: btn.dataset.name });
      }
    });
  });
}

function markVoted(name) {
  const chip = document.querySelector(`.participant-chip[data-name="${CSS.escape(name)}"]`);
  if (chip && !chip.querySelector('.voted-dot')) {
    chip.insertAdjacentHTML('afterbegin', '<span class="voted-dot"></span>');
  }
}

function resetParticipantVotes() {
  document.querySelectorAll('.voted-dot').forEach(d => d.remove());
}

function updateVoteProgress(voted, total) {
  const participants = document.querySelectorAll('.participant-chip').length;
  const t = total || participants;
  const v = voted != null ? voted : 0;
  $('#vote-count').textContent = v;
  $('#vote-total').textContent = t;
  const pct = t > 0 ? Math.round((v / t) * 100) : 0;
  const fill = $('#vote-progress-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('complete', v > 0 && v === t);
}

function updateHostButtons(status) {
  if (!isHost) return;
  const reveal = $('#reveal-btn');
  const revote = $('#revote-btn');
  const accept = $('#accept-btn');
  const acceptControls = $('#accept-controls');

  if (status === 'voting') {
    reveal.classList.remove('hidden');
    revote.classList.add('hidden');
    accept.classList.add('hidden');
    if (acceptControls) acceptControls.classList.add('hidden');
  } else if (status === 'revealed') {
    reveal.classList.add('hidden');
    revote.classList.remove('hidden');
    accept.classList.remove('hidden');
    if (acceptControls) acceptControls.classList.remove('hidden');
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Actions ---

$('#start-voting-btn').addEventListener('click', () => {
  send({
    type: 'start_voting',
    jiraKey: $('#jira-key').value.trim(),
    title: $('#jira-title').value.trim(),
    jiraUrl: $('#jira-url').value.trim(),
  });
});

$('#reveal-btn').addEventListener('click', () => send({ type: 'reveal' }));
$('#revote-btn').addEventListener('click', () => send({ type: 'revote' }));
$('#accept-btn').addEventListener('click', () => {
  send({ type: 'accept', finalEstimate: $('#final-estimate').value.trim(), jiraSp: $('#jira-sp').value.trim() });
});

$('#copy-link').addEventListener('click', (e) => {
  e.preventDefault();
  navigator.clipboard.writeText(window.location.href).then(
    () => toast('Link copied!'),
    () => toast('Failed to copy', true)
  );
});
