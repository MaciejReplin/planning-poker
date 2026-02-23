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
  window.location.href = `/room.html?id=${room.id}`;
});

document.getElementById('join-btn').addEventListener('click', () => {
  const code = document.getElementById('room-code').value.trim();
  if (!code) return alert('Enter a room code');
  window.location.href = `/room.html?id=${code}`;
});
