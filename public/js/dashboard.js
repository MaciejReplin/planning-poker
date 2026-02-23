const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

$('#load-room-btn').addEventListener('click', loadRoom);
$('#room-id-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRoom(); });

async function loadRoom() {
  const roomId = $('#room-id-input').value.trim();
  if (!roomId) return;

  $('#room-stats').innerHTML = '';
  $('#room-table').innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const res = await fetch(`/api/compare/compare/room/${roomId}`);
    if (!res.ok) {
      const err = await res.json();
      $('#room-table').innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.error)}</p>`;
      return;
    }

    const data = await res.json();

    if (!data.comparisons.length) {
      $('#room-table').innerHTML = '<p style="color:var(--text-muted)">No estimations with Jira SP values in this room. Enter Jira SP when accepting estimates in the room.</p>';
      return;
    }

    renderStats(data.stats);
    renderTable(data.comparisons);
  } catch (err) {
    $('#room-table').innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderStats(stats) {
  const el = $('#room-stats');
  if (!stats) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="panel">
      <div class="stats" style="flex-wrap:wrap;">
        <div class="stat">
          <div class="value">${stats.totalCompared}</div>
          <div class="label">Compared</div>
        </div>
        <div class="stat">
          <div class="value">${stats.avgDifference > 0 ? '+' : ''}${stats.avgDifference}</div>
          <div class="label">Avg Diff</div>
        </div>
        <div class="stat">
          <div class="value">${stats.avgAbsDifference}</div>
          <div class="label">Avg |Diff|</div>
        </div>
        <div class="stat">
          <div class="value">${stats.correlation != null ? stats.correlation : 'N/A'}</div>
          <div class="label">Correlation</div>
        </div>
        <div class="stat">
          <div class="value diff-zero">${stats.exactMatches}</div>
          <div class="label">Exact</div>
        </div>
        <div class="stat">
          <div class="value diff-low">${stats.overEstimated}</div>
          <div class="label">Over</div>
        </div>
        <div class="stat">
          <div class="value diff-high">${stats.underEstimated}</div>
          <div class="label">Under</div>
        </div>
      </div>
    </div>`;
}

function renderTable(comparisons) {
  let html = '<div class="table-wrap"><table><thead><tr>';
  html += '<th>Jira Key</th><th>Title</th><th>Our Estimate</th><th>Jira SP</th><th>Diff</th>';
  html += '</tr></thead><tbody>';

  comparisons.forEach(c => {
    const diffClass = c.difference == null ? '' :
      c.difference === 0 ? 'diff-zero' :
      Math.abs(c.difference) <= 2 ? 'diff-low' : 'diff-high';

    const diffText = c.difference == null ? '-' :
      (c.difference > 0 ? '+' : '') + c.difference;

    html += `<tr>
      <td>${escapeHtml(c.jiraKey) || '-'}</td>
      <td>${escapeHtml(c.title)}</td>
      <td><strong>${escapeHtml(c.ourEstimate) || '-'}</strong></td>
      <td>${c.jiraStoryPoints != null ? c.jiraStoryPoints : '-'}</td>
      <td class="${diffClass}">${diffText}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  $('#room-table').innerHTML = html;
}
