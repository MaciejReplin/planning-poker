(function () {
  const COLORS = [
    '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4',
    '#a855f7', '#ec4899', '#84cc16', '#f97316', '#14b8a6',
    '#f43f5e', '#0ea5e9', '#d97706', '#10b981', '#8b5cf6',
  ];

  const canvas = document.getElementById('wheel');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) / 2 - 4;

  const nameInput = document.getElementById('name-input');
  const addBtn = document.getElementById('add-btn');
  const namesList = document.getElementById('names-list');
  const clearBtn = document.getElementById('clear-btn');
  const spinBtn = document.getElementById('spin-btn');
  const winnerBox = document.getElementById('winner-box');
  const winnerNameEl = document.getElementById('winner-name');

  let names = [];
  let currentAngle = 0;
  let spinning = false;

  try {
    const saved = localStorage.getItem('wheel-names');
    if (saved) names = JSON.parse(saved);
  } catch (e) {}

  function save() {
    localStorage.setItem('wheel-names', JSON.stringify(names));
  }

  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderNamesList() {
    namesList.innerHTML = '';
    if (names.length === 0) {
      namesList.innerHTML = '<li class="names-empty" style="list-style:none;">No names yet — add some above</li>';
    } else {
      names.forEach((name, i) => {
        const li = document.createElement('li');
        li.innerHTML =
          `<span class="name-color-dot" style="background:${COLORS[i % COLORS.length]}"></span>` +
          `<span class="name-text">${escHtml(name)}</span>` +
          `<button class="btn btn-danger btn-sm" data-i="${i}">&times;</button>`;
        li.querySelector('button').addEventListener('click', () => {
          names.splice(i, 1);
          save();
          renderNamesList();
          drawWheel(currentAngle);
          updateSpinBtn();
          winnerBox.style.display = 'none';
        });
        namesList.appendChild(li);
      });
    }
    updateSpinBtn();
  }

  function updateSpinBtn() {
    spinBtn.disabled = names.length < 2 || spinning;
  }

  function drawWheel(angle) {
    ctx.clearRect(0, 0, W, H);
    const n = names.length;

    if (n === 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, 2 * Math.PI);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Add names to spin', cx, cy);
      return;
    }

    const segAngle = (2 * Math.PI) / n;

    for (let i = 0; i < n; i++) {
      const startA = angle + i * segAngle;
      const endA = startA + segAngle;
      const midA = startA + segAngle / 2;

      // Segment
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startA, endA);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      const fontSize = Math.max(9, Math.min(14, Math.round(segAngle * R * 0.38)));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(midA);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${fontSize}px sans-serif`;
      let label = names[i];
      const maxW = R - 30;
      if (ctx.measureText(label).width > maxW) {
        while (ctx.measureText(label + '\u2026').width > maxW && label.length > 1) {
          label = label.slice(0, -1);
        }
        label += '\u2026';
      }
      ctx.fillText(label, R - 12, 0);
      ctx.restore();
    }

    // Center cap
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function getWinnerIndex(angle, n) {
    const segAngle = (2 * Math.PI) / n;
    // Pointer is at top = -PI/2; find which segment sits there
    let a = ((-Math.PI / 2 - angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    return Math.floor(a / segAngle) % n;
  }

  function spin() {
    if (spinning || names.length < 2) return;
    spinning = true;
    spinBtn.disabled = true;
    winnerBox.style.display = 'none';

    // 6–12 full rotations + random extra angle
    const totalSpin = Math.PI * 2 * (6 + Math.random() * 6) + Math.random() * Math.PI * 2;
    const startAngle = currentAngle;
    const duration = 4000 + Math.random() * 2000;
    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4); // quartic ease-out
      currentAngle = startAngle + totalSpin * ease;
      drawWheel(currentAngle);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        currentAngle = startAngle + totalSpin;
        drawWheel(currentAngle);
        spinning = false;
        const winnerIdx = getWinnerIndex(currentAngle, names.length);
        showWinner(names[winnerIdx]);
        updateSpinBtn();
      }
    }

    requestAnimationFrame(frame);
  }

  function showWinner(name) {
    winnerNameEl.textContent = name;
    // Re-trigger animation
    winnerBox.style.display = 'none';
    // Force reflow so animation replays
    void winnerBox.offsetWidth;
    winnerBox.style.display = 'block';
    winnerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function addName() {
    const name = nameInput.value.trim();
    if (!name) return;
    names.push(name);
    nameInput.value = '';
    nameInput.focus();
    save();
    renderNamesList();
    drawWheel(currentAngle);
    updateSpinBtn();
    winnerBox.style.display = 'none';
  }

  addBtn.addEventListener('click', addName);
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') addName(); });

  clearBtn.addEventListener('click', () => {
    if (names.length === 0) return;
    if (!confirm('Clear all names?')) return;
    names = [];
    save();
    renderNamesList();
    drawWheel(currentAngle);
    winnerBox.style.display = 'none';
    updateSpinBtn();
  });

  spinBtn.addEventListener('click', spin);

  // Scale canvas visually on small screens without changing its internal resolution
  function resizeCanvas() {
    const panel = canvas.parentElement;
    const maxW = Math.min(420, panel.offsetWidth - 32);
    canvas.style.width = maxW + 'px';
    canvas.style.height = maxW + 'px';
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  renderNamesList();
  drawWheel(currentAngle);
})();
