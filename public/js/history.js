const params = new URLSearchParams(window.location.search);
const roomId = params.get('id');
if (!roomId) window.location.href = '/';

document.getElementById('room-link').href = `/room.html?id=${roomId}`;
document.getElementById('export-btn').href = `/api/rooms/${roomId}/history/export`;

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function load() {
  const container = document.getElementById('history-content');

  try {
    const [roomRes, histRes] = await Promise.all([
      fetch(`/api/rooms/${roomId}`),
      fetch(`/api/rooms/${roomId}/history`),
    ]);

    if (!roomRes.ok) {
      container.innerHTML = '<p style="color:var(--danger)">Room not found.</p>';
      return;
    }

    const room = await roomRes.json();
    const history = await histRes.json();

    document.getElementById('room-title').textContent = `${room.name} - History`;

    if (history.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted)">No accepted estimations yet.</p>';
      return;
    }

    let html = '<div class="table-wrap"><table><thead><tr>';
    html += '<th>Jira Key</th><th>Title</th><th>Estimate</th><th>Votes</th><th>Date</th>';
    html += '</tr></thead><tbody>';

    history.forEach(e => {
      const voteSummary = e.votes.map(v => `${escapeHtml(v.participant)}: ${escapeHtml(v.value)}`).join(', ');
      const key = e.jira_url
        ? `<a href="${escapeHtml(e.jira_url)}" target="_blank">${escapeHtml(e.jira_key)}</a>`
        : escapeHtml(e.jira_key);

      html += `<tr>
        <td>${key || '-'}</td>
        <td>${escapeHtml(e.title)}</td>
        <td><strong>${escapeHtml(e.final_estimate) || '-'}</strong></td>
        <td style="font-size:0.85rem">${voteSummary}</td>
        <td style="font-size:0.85rem;color:var(--text-muted)">${escapeHtml(e.created_at)}</td>
      </tr>`;
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger)">Error loading history: ${err.message}</p>`;
  }
}

load();
