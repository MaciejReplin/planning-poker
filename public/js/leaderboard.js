const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Pre-fill room from URL
const params = new URLSearchParams(window.location.search);
const roomId = params.get('id');
if (roomId) {
  $('#room-id-input').value = roomId;
  $('#back-link').href = `/room.html?id=${roomId}`;
  loadLeaderboard();
} else {
  $('#back-link').href = '/';
}

$('#load-btn').addEventListener('click', loadLeaderboard);
$('#room-id-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadLeaderboard(); });

async function loadLeaderboard() {
  const roomId = $('#room-id-input').value.trim();
  if (!roomId) return;

  $('#podium').innerHTML = '';
  $('#leaderboard-content').innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const res = await fetch(`/api/rooms/${roomId}/leaderboard`);
    if (!res.ok) {
      const err = await res.json();
      $('#leaderboard-content').innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.error)}</p>`;
      return;
    }

    const data = await res.json();

    if (!data.leaderboard.length) {
      $('#leaderboard-content').innerHTML = '<p style="color:var(--text-muted)">No accepted estimations with numeric values yet. Play some rounds first!</p>';
      return;
    }

    renderPodium(data.leaderboard);
    renderTable(data.leaderboard);
  } catch (err) {
    $('#leaderboard-content').innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderPodium(lb) {
  const top3 = lb.slice(0, 3);
  const medals = ['gold', 'silver', 'bronze'];
  const icons = ['1st', '2nd', '3rd'];

  let html = '<div class="podium">';
  top3.forEach((p, i) => {
    html += `
      <div class="podium-item podium-${medals[i]}">
        <div class="podium-rank">${icons[i]}</div>
        <div class="podium-name">${escapeHtml(p.name)}</div>
        <div class="podium-stat">${p.accuracyPct}% exact</div>
        <div class="podium-detail">${p.exactMatches}/${p.totalVotes} votes</div>
      </div>`;
  });
  html += '</div>';
  $('#podium').innerHTML = html;
}

function renderTable(lb) {
  let html = '<div class="table-wrap"><table><thead><tr>';
  html += '<th>#</th><th>Name</th><th>Votes</th><th>Exact</th><th>Within 1</th><th>Accuracy</th><th>Avg |Diff|</th><th>Bias</th>';
  html += '</tr></thead><tbody>';

  lb.forEach(p => {
    const biasText = p.bias > 0 ? `+${p.bias}` : `${p.bias}`;
    const biasClass = p.bias > 0 ? 'diff-low' : p.bias < 0 ? 'diff-high' : 'diff-zero';
    const accClass = p.accuracyPct >= 50 ? 'diff-zero' : p.accuracyPct >= 25 ? 'diff-low' : 'diff-high';

    html += `<tr>
      <td><strong>${p.rank}</strong></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.totalVotes}</td>
      <td>${p.exactMatches}</td>
      <td>${p.withinOne} (${p.withinOnePct}%)</td>
      <td class="${accClass}"><strong>${p.accuracyPct}%</strong></td>
      <td>${p.avgDiff}</td>
      <td class="${biasClass}">${biasText}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  html += '<p style="color:var(--text-muted);font-size:0.8rem;margin-top:0.75rem;">Accuracy = exact match with final estimate. Bias: positive = tends to overestimate, negative = underestimate.</p>';
  $('#leaderboard-content').innerHTML = html;
}
