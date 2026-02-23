const scaleSelect = document.getElementById('scale-type');
const customWrap = document.getElementById('custom-scale-wrap');

scaleSelect.addEventListener('change', () => {
  customWrap.classList.toggle('hidden', scaleSelect.value !== 'custom');
});

document.getElementById('create-btn').addEventListener('click', async () => {
  const name = document.getElementById('room-name').value.trim();
  if (!name) return alert('Enter a room name');

  const body = {
    name,
    scaleType: scaleSelect.value,
    customScale: document.getElementById('custom-scale').value,
  };

  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    return alert(err.error || 'Failed to create room');
  }

  const room = await res.json();
  saveRoom(room.id, room.name);
  window.location.href = `/room.html?id=${room.id}`;
});

document.getElementById('join-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code').value.trim();
  if (!code) return alert('Enter a room code');
  window.location.href = `/room.html?id=${code}`;
});

// --- Recent rooms (localStorage) ---

function getRecentRooms() {
  try { return JSON.parse(localStorage.getItem('poker_recent_rooms') || '[]'); }
  catch { return []; }
}

function saveRoom(id, name) {
  let rooms = getRecentRooms().filter(r => r.id !== id);
  rooms.unshift({ id, name, ts: Date.now() });
  rooms = rooms.slice(0, 10);
  localStorage.setItem('poker_recent_rooms', JSON.stringify(rooms));
}

function renderRecentRooms() {
  const rooms = getRecentRooms();
  const panel = document.getElementById('recent-rooms-panel');
  const container = document.getElementById('recent-rooms');

  if (!rooms.length) {
    panel.style.display = 'none';
    return;
  }

  container.innerHTML = rooms.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border);">
      <div>
        <a href="/room.html?id=${r.id}" style="font-weight:500;">${escapeHtml(r.name)}</a>
        <span style="color:var(--text-muted);font-size:0.8rem;margin-left:0.5rem;">${r.id}</span>
      </div>
      <span class="remove-room" data-id="${r.id}" style="cursor:pointer;color:var(--text-muted);font-size:0.8rem;" title="Remove">&times;</span>
    </div>
  `).join('');

  container.querySelectorAll('.remove-room').forEach(btn => {
    btn.addEventListener('click', () => {
      const rooms = getRecentRooms().filter(r => r.id !== btn.dataset.id);
      localStorage.setItem('poker_recent_rooms', JSON.stringify(rooms));
      renderRecentRooms();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

renderRecentRooms();
