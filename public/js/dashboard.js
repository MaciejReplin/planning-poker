const $ = (sel) => document.querySelector(sel);
let jiraConfigured = false;

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Init ---

async function init() {
  try {
    const res = await fetch('/api/jira/status');
    const data = await res.json();
    jiraConfigured = data.configured;

    const banner = $('#jira-status');
    if (data.configured) {
      banner.innerHTML = `<div class="status-banner ok">Connected to ${escapeHtml(data.baseUrl)}</div>`;
      loadBoards();
    } else {
      banner.innerHTML = `<div class="status-banner warn">Jira not configured. Set JIRA_BASE_URL, JIRA_EMAIL, and JIRA_TOKEN environment variables on the server.</div>`;
      $('#load-room-btn').disabled = true;
      $('#load-sprint-btn').disabled = true;
    }
  } catch {
    $('#jira-status').innerHTML = `<div class="status-banner warn">Could not check Jira status.</div>`;
  }
}

init();

// --- Tabs ---

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const view = btn.dataset.view;
    $('#room-view').classList.toggle('hidden', view !== 'room');
    $('#sprint-view').classList.toggle('hidden', view !== 'sprint');
  });
});

// --- Per Room ---

$('#load-room-btn').addEventListener('click', loadRoom);
$('#room-id-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') loadRoom(); });

async function loadRoom() {
  const roomId = $('#room-id-input').value.trim();
  if (!roomId) return;

  $('#room-stats').innerHTML = '';
  $('#room-table').innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const res = await fetch(`/api/jira/compare/room/${roomId}`);
    if (!res.ok) {
      const err = await res.json();
      $('#room-table').innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.error)}</p>`;
      return;
    }

    const data = await res.json();

    if (!data.comparisons.length) {
      $('#room-table').innerHTML = '<p style="color:var(--text-muted)">No accepted estimations with Jira keys in this room.</p>';
      return;
    }

    renderStats(data.stats, '#room-stats');
    renderTable(data.comparisons, '#room-table', false);
  } catch (err) {
    $('#room-table').innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(err.message)}</p>`;
  }
}

// --- Per Sprint ---

async function loadBoards() {
  try {
    const res = await fetch('/api/jira/boards');
    const data = await res.json();
    const select = $('#board-select');
    select.innerHTML = '<option value="">-- Select a board --</option>';
    data.boards.forEach(b => {
      select.innerHTML += `<option value="${b.id}">${escapeHtml(b.name)}</option>`;
    });
  } catch {
    $('#board-select').innerHTML = '<option value="">Failed to load boards</option>';
  }
}

$('#board-select').addEventListener('change', async () => {
  const boardId = $('#board-select').value;
  const sprintSelect = $('#sprint-select');

  if (!boardId) {
    sprintSelect.disabled = true;
    sprintSelect.innerHTML = '<option value="">Select a board first</option>';
    $('#load-sprint-btn').disabled = true;
    return;
  }

  sprintSelect.innerHTML = '<option value="">Loading sprints...</option>';
  sprintSelect.disabled = true;

  try {
    const res = await fetch(`/api/jira/boards/${boardId}/sprints`);
    const data = await res.json();
    sprintSelect.innerHTML = '<option value="">-- Select a sprint --</option>';
    data.sprints.forEach(s => {
      const label = `${s.name}${s.state === 'active' ? ' (active)' : ''}`;
      sprintSelect.innerHTML += `<option value="${s.id}">${escapeHtml(label)}</option>`;
    });
    sprintSelect.disabled = false;
  } catch {
    sprintSelect.innerHTML = '<option value="">Failed to load sprints</option>';
  }
});

$('#sprint-select').addEventListener('change', () => {
  $('#load-sprint-btn').disabled = !$('#sprint-select').value;
});

$('#load-sprint-btn').addEventListener('click', loadSprint);

async function loadSprint() {
  const sprintId = $('#sprint-select').value;
  if (!sprintId) return;

  $('#sprint-stats').innerHTML = '';
  $('#sprint-table').innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';

  try {
    const res = await fetch(`/api/jira/compare/sprint/${sprintId}`);
    if (!res.ok) {
      const err = await res.json();
      $('#sprint-table').innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.error)}</p>`;
      return;
    }

    const data = await res.json();

    if (!data.comparisons.length) {
      $('#sprint-table').innerHTML = '<p style="color:var(--text-muted)">No issues found in this sprint.</p>';
      return;
    }

    renderStats(data.stats, '#sprint-stats');
    renderTable(data.comparisons, '#sprint-table', true);
  } catch (err) {
    $('#sprint-table').innerHTML = `<p style="color:var(--danger)">Error: ${escapeHtml(err.message)}</p>`;
  }
}

// --- Shared renderers ---

function renderStats(stats, selector) {
  const container = $(selector);
  if (!stats) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="panel">
      <div class="stats" style="flex-wrap:wrap;">
        <div class="stat">
          <div class="value">${stats.totalCompared}</div>
          <div class="label">Compared</div>
        </div>
        <div class="stat">
          <div class="value">${stats.avgDifference > 0 ? '+' : ''}${stats.avgDifference}</div>
          <div class="label">Avg Difference</div>
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

function renderTable(comparisons, selector, showStatus) {
  const container = $(selector);
  let html = '<div class="table-wrap"><table><thead><tr>';
  html += '<th>Jira Key</th><th>Title</th>';
  if (showStatus) html += '<th>Status</th>';
  html += '<th>Our Estimate</th><th>Jira SP</th><th>Diff</th>';
  html += '</tr></thead><tbody>';

  comparisons.forEach(c => {
    const diffClass = c.difference == null ? '' :
      c.difference === 0 ? 'diff-zero' :
      Math.abs(c.difference) <= 2 ? 'diff-low' : 'diff-high';

    const diffText = c.difference == null ? '-' :
      (c.difference > 0 ? '+' : '') + c.difference;

    html += `<tr>
      <td>${escapeHtml(c.jiraKey)}</td>
      <td>${escapeHtml(c.title)}</td>`;
    if (showStatus) html += `<td style="font-size:0.85rem">${escapeHtml(c.jiraStatus) || '-'}</td>`;
    html += `<td><strong>${escapeHtml(c.ourEstimate) || '-'}</strong></td>
      <td>${c.jiraStoryPoints != null ? c.jiraStoryPoints : '-'}</td>
      <td class="${diffClass}">${diffText}</td>
    </tr>`;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}
