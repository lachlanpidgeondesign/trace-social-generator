// ==============================
// CONFIG
// ==============================

const DEBUG = false; // Set true to append processed OCR canvases to the DOM

const SCALE = 4;
const REF = 300;
const EXPORT_SIZE = REF * SCALE;

const LAYOUT = {
  topPad: 20,
  titleFontSize: 18,
  textGridGap: 20,
  gridSvgGap: 16,
  svgW: 131,
  svgH: 14,
  bottomPad: 12,
  circleDiam: 25,
  letterFontSize: 13.5,
  gridBorder: 1.5,
  gridRadius: 4,
  cellBorder: 0.8,
  circleBorder: 0.8,
  shadowOffsetY: 2,
};

const TEXT_TOP_Y  = LAYOUT.topPad;
const GRID_TOP_Y  = TEXT_TOP_Y + LAYOUT.titleFontSize + LAYOUT.textGridGap;
const GRID_BOT_Y  = REF - LAYOUT.bottomPad - LAYOUT.svgH - LAYOUT.gridSvgGap;
const GRID_REF    = GRID_BOT_Y - GRID_TOP_Y;
const GRID_LEFT_X = (REF - GRID_REF) / 2;
const SVG_TOP_Y   = GRID_BOT_Y + LAYOUT.gridSvgGap;
const SVG_LEFT_X  = (REF - LAYOUT.svgW) / 2;

const COLORS = {
  titleText:      '#191919',
  gridBorder:     '#C28A31',
  gridBg:         '#fcfcfc',
  cellBorder:     '#C28A31',
  activeBg:       '#C28A31',
  activeText:     '#ffffff',
  inactiveBg:     '#FADEB1',
  inactiveBorder: '#C28A31',
  inactiveText:   '#926725',
  shadow:         '#C28A31',
};

// ==============================
// SHARED ASSETS
// ==============================

let bgImage = null;
let svgLogo = null;
let headlineSvg = null;

async function loadAssets() {
  await document.fonts.ready;
  const [bg, svg, headline] = await Promise.all([loadImg('TraceBG.png'), loadImg('DM___Games.svg'), loadImg('headline.svg')]);
  bgImage = bg;
  svgLogo = svg;
  headlineSvg = headline;
}

// ==============================
// JOBS STATE
// ==============================

let nextJobId = 1;
const jobs = [];

function createJob(file, image) {
  return {
    id: nextJobId++,
    name: file.name,
    image,
    thumbUrl: null,
    editorState: null,
    outputCanvas: null,
    status: 'uploaded',
  };
}

// ==============================
// DOM REFS
// ==============================

const uploadInput    = document.getElementById('upload');
const scanAllBtn     = document.getElementById('scanAllBtn');
const generateAllBtn = document.getElementById('generateAllBtn');
const exportAllBtn   = document.getElementById('exportAllBtn');
const clearAllBtn    = document.getElementById('clearAllBtn');
const sidebarList    = document.getElementById('sidebarList');
const imageCount     = document.getElementById('imageCount');
const mainArea       = document.getElementById('mainArea');

// ==============================
// HELPERS
// ==============================

function s(v) { return v * SCALE; }

function loadImg(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => { console.warn('Failed to load:', src); resolve(null); };
    img.src = src;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function getJob(id) { return jobs.find(j => j.id === id); }

// ==============================
// IMAGE UPLOAD (multiple)
// ==============================

uploadInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const firstNewIdx = jobs.length;

  for (const file of files) {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();

    const job = createJob(file, img);

    // Small thumbnail
    const tc = document.createElement('canvas');
    const size = 80;
    tc.width = size; tc.height = size;
    const tctx = tc.getContext('2d');
    const scale = Math.min(size / img.width, size / img.height);
    const sw = img.width * scale, sh = img.height * scale;
    tctx.drawImage(img, (size - sw) / 2, (size - sh) / 2, sw, sh);
    job.thumbUrl = tc.toDataURL('image/jpeg', 0.7);

    jobs.push(job);
  }

  uploadInput.value = '';
  refreshSidebar();
  updateBatchButtons();
  renderMainArea();

  // Scroll to first newly added job
  const anchor = document.getElementById('job-' + jobs[firstNewIdx].id);
  if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ==============================
// SIDEBAR
// ==============================

function refreshSidebar() {
  imageCount.textContent = '(' + jobs.length + ')';
  sidebarList.innerHTML = '';

  for (const job of jobs) {
    const el = document.createElement('div');
    el.className = 'sidebar-item';
    el.dataset.id = job.id;

    const thumb = document.createElement('img');
    thumb.src = job.thumbUrl;

    const info = document.createElement('div');
    info.className = 'item-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'item-name';
    nameDiv.title = job.name;
    nameDiv.textContent = job.name;

    const statusDiv = document.createElement('div');
    statusDiv.className = 'item-status' + (job.status === 'generated' ? ' done' : '');
    statusDiv.textContent = statusLabel(job.status);

    info.appendChild(nameDiv);
    info.appendChild(statusDiv);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'item-remove';
    removeBtn.innerHTML = '\u00d7';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      removeJob(job.id);
    });

    el.appendChild(thumb);
    el.appendChild(info);
    el.appendChild(removeBtn);

    // Scroll to this job in the main area
    el.addEventListener('click', function() {
      const target = document.getElementById('job-' + job.id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    sidebarList.appendChild(el);
  }
}

function statusLabel(status) {
  if (status === 'uploaded')  return 'Ready to scan';
  if (status === 'scanned')   return 'Scanned';
  if (status === 'generated') return '\u2713 Generated';
  return status;
}

function removeJob(id) {
  const idx = jobs.findIndex(function(j) { return j.id === id; });
  if (idx < 0) return;
  jobs.splice(idx, 1);

  refreshSidebar();
  updateBatchButtons();
  renderMainArea();
}

function renameJob(id, newName) {
  const job = getJob(id);
  if (!job || !newName.trim()) return;
  job.name = newName.trim();
  refreshSidebar();
}

// ==============================
// MAIN AREA RENDERING
// ==============================

function renderMainArea() {
  mainArea.innerHTML = '';

  if (!jobs.length) {
    const empty = document.createElement('div');
    empty.className = 'main-empty';
    empty.textContent = 'Upload images to get started';
    mainArea.appendChild(empty);
    return;
  }

  for (const job of jobs) {
    mainArea.appendChild(buildJobCard(job));
    // Build editor grid if scanned
    if (job.editorState) {
      buildEditorGridUI(job);
    }
  }
}

function buildJobCard(job) {
  const card = document.createElement('div');
  card.className = 'job-card';
  card.id = 'job-' + job.id;

  // --- Card header: thumb, editable name, status, action buttons, remove ---
  const header = document.createElement('div');
  header.className = 'job-card-header';

  const thumb = document.createElement('img');
  thumb.className = 'job-thumb';
  thumb.src = job.thumbUrl;

  const title = document.createElement('div');
  title.className = 'job-card-title';
  title.contentEditable = 'true';
  title.spellcheck = false;
  title.textContent = job.name;
  title.title = 'Click to rename';
  title.addEventListener('blur', function() {
    const val = title.textContent.trim();
    if (val) renameJob(job.id, val);
    else title.textContent = job.name;
  });
  title.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); title.blur(); }
    if (e.key === 'Escape') { title.textContent = job.name; title.blur(); }
  });

  const status = document.createElement('div');
  status.className = 'job-card-status' + (job.status === 'generated' ? ' done' : '');
  status.textContent = statusLabel(job.status);

  const actions = document.createElement('div');
  actions.className = 'job-card-actions';

  const scanBtn = document.createElement('button');
  scanBtn.textContent = 'Scan';
  scanBtn.addEventListener('click', function() { scanJob(job.id); });
  actions.appendChild(scanBtn);

  if (job.editorState) {
    const genBtn = document.createElement('button');
    genBtn.textContent = 'Regenerate';
    genBtn.addEventListener('click', function() { generateJob(job.id); });
    actions.appendChild(genBtn);
  }

  if (job.outputCanvas) {
    const expBtn = document.createElement('button');
    expBtn.className = 'btn-secondary';
    expBtn.textContent = 'Export';
    expBtn.addEventListener('click', function() { exportJob(job.id); });
    actions.appendChild(expBtn);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'job-card-remove';
  removeBtn.innerHTML = '\u00d7';
  removeBtn.title = 'Remove';
  removeBtn.addEventListener('click', function() { removeJob(job.id); });

  header.appendChild(thumb);
  header.appendChild(title);
  header.appendChild(status);
  header.appendChild(actions);
  header.appendChild(removeBtn);
  card.appendChild(header);

  // --- Card body: input + editor + output side by side ---
  const body = document.createElement('div');
  body.className = 'job-card-body';

  // Input panel
  const inputPanel = document.createElement('div');
  inputPanel.className = 'panel panel-input';
  const inputHeader = document.createElement('div');
  inputHeader.className = 'panel-header';
  inputHeader.textContent = 'Input';
  const inputBody = document.createElement('div');
  inputBody.className = 'panel-body';
  const inputImg = document.createElement('img');
  inputImg.src = job.image.src;
  inputBody.appendChild(inputImg);
  inputPanel.appendChild(inputHeader);
  inputPanel.appendChild(inputBody);
  body.appendChild(inputPanel);

  // Editor panel
  if (job.editorState) {
    const edPanel = document.createElement('div');
    edPanel.className = 'panel';
    const edHeader = document.createElement('div');
    edHeader.className = 'panel-header';
    edHeader.textContent = 'Edit Grid';
    const edBody = document.createElement('div');
    edBody.className = 'panel-body';
    edBody.style.flexDirection = 'column';
    const edGrid = document.createElement('div');
    edGrid.id = 'editorGrid-' + job.id;
    edGrid.className = 'editor-grid';
    const edHelp = document.createElement('div');
    edHelp.className = 'editor-help';
    edHelp.innerHTML = 'Type a letter to add a tile. Backspace to clear.<br>Click the <strong>\u2605</strong> button to toggle starting letter.';
    edBody.appendChild(edGrid);
    edBody.appendChild(edHelp);
    edPanel.appendChild(edHeader);
    edPanel.appendChild(edBody);
    body.appendChild(edPanel);
  }

  // Output panel
  if (job.outputCanvas) {
    const outPanel = document.createElement('div');
    outPanel.className = 'panel panel-output';
    const outHeader = document.createElement('div');
    outHeader.className = 'panel-header';
    outHeader.textContent = 'Output';
    const outBody = document.createElement('div');
    outBody.className = 'panel-body';
    const preview = document.createElement('canvas');
    preview.width = EXPORT_SIZE;
    preview.height = EXPORT_SIZE;
    preview.getContext('2d').drawImage(job.outputCanvas, 0, 0);
    outBody.appendChild(preview);
    outPanel.appendChild(outHeader);
    outPanel.appendChild(outBody);
    body.appendChild(outPanel);
  }

  card.appendChild(body);
  return card;
}

function rerenderJobCard(jobId) {
  const job = getJob(jobId);
  if (!job) return;
  const existing = document.getElementById('job-' + jobId);
  if (!existing) { renderMainArea(); return; }
  const newCard = buildJobCard(job);
  existing.replaceWith(newCard);
  if (job.editorState) buildEditorGridUI(job);
}

// ==============================
// BATCH BUTTON VISIBILITY
// ==============================

function updateBatchButtons() {
  const hasJobs      = jobs.length > 0;
  const hasGenerated = jobs.some(function(j) { return j.status === 'generated'; });

  scanAllBtn.classList.toggle('hidden', !hasJobs);
  generateAllBtn.classList.add('hidden'); // generation is automatic after scan
  exportAllBtn.classList.toggle('hidden', !hasGenerated);
  clearAllBtn.classList.toggle('hidden', !hasJobs);
}

// ==============================
// EDITOR GRID UI
// ==============================

function buildEditorGridUI(job) {
  const es = job.editorState;
  if (!es) return;

  const gridEl = document.getElementById('editorGrid-' + job.id);
  if (!gridEl) return;

  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = 'repeat(' + es.gridSize + ', 46px)';
  gridEl.style.gridTemplateRows    = 'repeat(' + es.gridSize + ', 46px)';
  gridEl.style.gap = '1px';

  // Helper: find the next (or prev) input that belongs to a tile cell
  function findNextTileInput(fromRow, fromCol, forward) {
    const total = es.gridSize * es.gridSize;
    const startIdx = fromRow * es.gridSize + fromCol;
    for (let step = 1; step < total; step++) {
      const idx = forward
        ? (startIdx + step) % total
        : (startIdx - step + total) % total;
      const r = Math.floor(idx / es.gridSize);
      const c = idx % es.gridSize;
      if (es.cells.has(r + ',' + c)) {
        const inp = gridEl.querySelector('input[data-key="' + r + ',' + c + '"]');
        if (inp) return inp;
      }
    }
    return null;
  }

  for (let row = 0; row < es.gridSize; row++) {
    for (let col = 0; col < es.gridSize; col++) {
      const key = row + ',' + col;
      const info = es.cells.get(key);

      const cell = document.createElement('div');
      cell.className = 'ecell';
      cell.dataset.key = key;

      const inp = document.createElement('input');
      inp.type = 'text';
      inp.maxLength = 1;
      inp.dataset.key = key;

      const tog = document.createElement('button');
      tog.className = 'toggle-type';
      tog.textContent = '\u2605';
      tog.title = 'Toggle starting letter';
      tog.dataset.key = key;

      if (info) {
        inp.value = info.letter;
        cell.classList.add('has-tile');
        if (info.active) cell.classList.add('active-tile');
      }

      inp.addEventListener('focus', function() { inp.select(); });
      inp.addEventListener('mouseup', function(e) { e.preventDefault(); });

      inp.addEventListener('input', (function(key, cell, inp, es) {
        return function() {
          const v = inp.value.toUpperCase().replace(/[^A-Z]/g, '');
          inp.value = v;
          if (v) {
            if (!es.cells.has(key)) {
              es.cells.set(key, { letter: v, active: false });
            } else {
              es.cells.get(key).letter = v;
            }
            cell.classList.add('has-tile');
          }
        };
      })(key, cell, inp, es));

      inp.addEventListener('keydown', (function(row, col, key, cell, es, gridEl) {
        return function(e) {
          if (e.key === 'Backspace' && !inp.value) {
            es.cells.delete(key);
            cell.classList.remove('has-tile', 'active-tile');
          }
          // Tab / Shift+Tab: jump to next/prev tile cell
          if (e.key === 'Tab') {
            e.preventDefault();
            const nextTile = findNextTileInput(row, col, !e.shiftKey);
            if (nextTile) nextTile.focus();
            return;
          }
          let nr = row, nc = col;
          if (e.key === 'ArrowRight') nc = Math.min(col + 1, es.gridSize - 1);
          if (e.key === 'ArrowLeft')  nc = Math.max(col - 1, 0);
          if (e.key === 'ArrowDown')  nr = Math.min(row + 1, es.gridSize - 1);
          if (e.key === 'ArrowUp')    nr = Math.max(row - 1, 0);
          if (nr !== row || nc !== col) {
            e.preventDefault();
            const next = gridEl.querySelector('input[data-key="' + nr + ',' + nc + '"]');
            if (next) next.focus();
          }
        };
      })(row, col, key, cell, es, gridEl));

      // Auto-advance to next tile cell after typing
      inp.addEventListener('input', (function(row, col, inp) {
        return function() {
          if (inp.value) {
            const nextTile = findNextTileInput(row, col, true);
            if (nextTile) nextTile.focus();
          }
        };
      })(row, col, inp));

      tog.addEventListener('click', (function(key, cell, es) {
        return function(e) {
          e.stopPropagation();
          const cellInfo = es.cells.get(key);
          if (!cellInfo) return;
          cellInfo.active = !cellInfo.active;
          cell.classList.toggle('active-tile', cellInfo.active);
        };
      })(key, cell, es));

      cell.appendChild(inp);
      cell.appendChild(tog);
      gridEl.appendChild(cell);
    }
  }
}

function readEditorTiles(job) {
  const tiles = [];
  if (!job.editorState) return tiles;
  for (const [key, info] of job.editorState.cells) {
    if (!info.letter) continue;
    const [r, c] = key.split(',').map(Number);
    tiles.push({ row: r, col: c, letter: info.letter, active: info.active });
  }
  return tiles;
}

// ==============================
// SCAN (single job)
// ==============================

async function scanJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = job.image.width;
    tempCanvas.height = job.image.height;
    tempCanvas.getContext('2d').drawImage(job.image, 0, 0);

    const gridCanvas = cropGrid(tempCanvas);
    const gridSize   = detectGridSize(gridCanvas);
    const cells      = splitIntoCells(gridCanvas, gridSize);
    const detected   = await classifyCells(cells);

    job.editorState = { gridSize: gridSize, cells: new Map() };
    for (const t of detected) {
      job.editorState.cells.set(t.row + ',' + t.col, { letter: t.letter, active: t.active });
    }

    job.status = 'scanned';
    refreshSidebar();
    updateBatchButtons();
    rerenderJobCard(job.id);

    // Auto-generate immediately after scanning
    await generateJob(job.id);
  } catch (err) {
    console.error(err);
    alert('Scan error (' + job.name + '): ' + err.message);
  }
}

// ==============================
// GENERATE (single job)
// ==============================

async function generateJob(jobId) {
  const job = getJob(jobId);
  if (!job || !job.editorState) return;

  const tiles = readEditorTiles(job);
  if (!tiles.length) { alert('No tiles in grid'); return; }

  try {
    const offCanvas = document.createElement('canvas');
    offCanvas.width  = EXPORT_SIZE;
    offCanvas.height = EXPORT_SIZE;
    const offCtx = offCanvas.getContext('2d');

    await renderOutput(offCtx, tiles, job.editorState.gridSize);
    job.outputCanvas = offCanvas;
    job.status = 'generated';

    refreshSidebar();
    updateBatchButtons();
    rerenderJobCard(job.id);
  } catch (err) {
    console.error(err);
    alert('Generate error (' + job.name + '): ' + err.message);
  }
}

// ==============================
// EXPORT (single job)
// ==============================

function exportJob(jobId) {
  const job = getJob(jobId);
  if (!job || !job.outputCanvas) return;

  const link = document.createElement('a');
  const baseName = job.name.replace(/\.[^.]+$/, '');
  link.download = baseName + '-trace-social.png';
  link.href = job.outputCanvas.toDataURL('image/png');
  link.click();
}

// ==============================
// BATCH OPERATIONS
// ==============================

scanAllBtn.addEventListener('click', async function() {
  scanAllBtn.textContent = 'Scanning\u2026';
  scanAllBtn.disabled = true;

  let scanned = 0;
  for (const job of jobs) {
    if (job.status === 'uploaded') {
      try { await scanJob(job.id); scanned++; }
      catch (e) { console.error(e); }
    }
  }

  scanAllBtn.textContent = 'Scan All';
  scanAllBtn.disabled = false;

  if (scanned === 0) alert('All images already scanned');
});

generateAllBtn.addEventListener('click', async function() {
  generateAllBtn.textContent = 'Generating\u2026';
  generateAllBtn.disabled = true;

  let count = 0;
  for (const job of jobs) {
    if (job.editorState && job.status !== 'generated') {
      await generateJob(job.id);
      count++;
    }
  }

  generateAllBtn.textContent = 'Generate All';
  generateAllBtn.disabled = false;

  if (count === 0) alert('All scanned images already generated');
});

exportAllBtn.addEventListener('click', function() {
  let count = 0;
  for (const job of jobs) {
    if (job.outputCanvas) {
      exportJob(job.id);
      count++;
    }
  }
  if (count === 0) alert('No generated images to export');
});

clearAllBtn.addEventListener('click', function() {
  if (!jobs.length) return;
  if (!confirm('Remove all ' + jobs.length + ' image(s)?')) return;
  jobs.length = 0;
  nextJobId = 1;
  refreshSidebar();
  updateBatchButtons();
  renderMainArea();
});

// ==============================
// INPUT-IMAGE COLOUR HELPERS
// ==============================

function isGreyColor(r, g, b) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const maxDiff = Math.max(Math.abs(r - g), Math.abs(r - b), Math.abs(g - b));
  return luma > 100 && luma < 210 && maxDiff < 35;
}

function isNonWhite(r, g, b) {
  return (r + g + b) / 3 < 220;
}

// ==============================
// CROP GRID
// ==============================

function cropGrid(canvas) {
  const ctx  = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  const colHist = new Float64Array(w);
  const rowHist = new Float64Array(h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isNonWhite(data[i], data[i+1], data[i+2])) {
        colHist[x]++;
        rowHist[y]++;
      }
    }
  }

  const colMax = Math.max(...colHist);
  const rowMax = Math.max(...rowHist);
  const colTh  = colMax * 0.08;
  const rowTh  = rowMax * 0.08;

  let left = 0, right = w - 1, top = 0, bottom = h - 1;
  while (left < w   && colHist[left]   < colTh) left++;
  while (right > 0  && colHist[right]  < colTh) right--;
  while (top < h    && rowHist[top]    < rowTh) top++;
  while (bottom > 0 && rowHist[bottom] < rowTh) bottom--;

  const pad = 2;
  left   = Math.max(0, left - pad);
  top    = Math.max(0, top - pad);
  right  = Math.min(w - 1, right + pad);
  bottom = Math.min(h - 1, bottom + pad);

  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  console.log('Grid crop: (' + left + ',' + top + ')->(' + right + ',' + bottom + ')  ' + cropW + 'x' + cropH);

  const temp = document.createElement('canvas');
  temp.width  = cropW;
  temp.height = cropH;
  temp.getContext('2d').drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
  return temp;
}

// ==============================
// DETECT GRID SIZE
// ==============================

function detectGridSize(gridCanvas) {
  const ctx  = gridCanvas.getContext('2d');
  const w = gridCanvas.width, h = gridCanvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  const colGrey = new Float64Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isGreyColor(data[i], data[i+1], data[i+2])) colGrey[x]++;
    }
  }

  const threshold = h * 0.30;
  let peaks = [];
  let inPeak = false, peakStart = 0;

  for (let x = 0; x < w; x++) {
    if (colGrey[x] >= threshold && !inPeak) {
      peakStart = x; inPeak = true;
    } else if (colGrey[x] < threshold && inPeak) {
      peaks.push(Math.round((peakStart + x - 1) / 2));
      inPeak = false;
    }
  }
  if (inPeak) peaks.push(Math.round((peakStart + w - 1) / 2));

  if (peaks.length < 3) {
    console.log('Grey detection found too few peaks, using non-white fallback');
    const colNW = new Float64Array(w);
    for (let y2 = 0; y2 < h; y2++) {
      for (let x2 = 0; x2 < w; x2++) {
        const i2 = (y2 * w + x2) * 4;
        if (isNonWhite(data[i2], data[i2+1], data[i2+2])) colNW[x2]++;
      }
    }
    const th2 = h * 0.50;
    peaks = [];
    inPeak = false;
    for (let x3 = 0; x3 < w; x3++) {
      if (colNW[x3] >= th2 && !inPeak) { peakStart = x3; inPeak = true; }
      else if (colNW[x3] < th2 && inPeak) {
        peaks.push(Math.round((peakStart + x3 - 1) / 2));
        inPeak = false;
      }
    }
    if (inPeak) peaks.push(Math.round((peakStart + w - 1) / 2));
  }

  const gridSize = Math.max(2, peaks.length - 1);
  console.log('Detected ' + peaks.length + ' vertical lines -> ' + gridSize + 'x' + gridSize + ' grid');
  return gridSize;
}

// ==============================
// SPLIT INTO CELLS
// ==============================

function splitIntoCells(gridCanvas, gridSize) {
  const cells = [];
  const cellW = gridCanvas.width  / gridSize;
  const cellH = gridCanvas.height / gridSize;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const sx = Math.round(col * cellW);
      const sy = Math.round(row * cellH);
      const sw = Math.round(cellW);
      const sh = Math.round(cellH);

      const temp = document.createElement('canvas');
      temp.width  = sw;
      temp.height = sh;
      temp.getContext('2d').drawImage(gridCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      cells.push({ row, col, canvas: temp });
    }
  }
  return cells;
}

// ==============================
// CLASSIFY CELLS
// ==============================

async function classifyCells(cells) {
  buildTemplates();
  const results = [];

  for (const cell of cells) {
    const type = classifyCell(cell.canvas);
    if (type === 'empty') continue;

    const letter = await extractLetter(cell.canvas, type === 'active');

    results.push({
      row:    cell.row,
      col:    cell.col,
      letter,
      active: type === 'active',
    });

    console.log('Cell (' + cell.row + ',' + cell.col + '): ' + type + '  guess="' + letter + '"');
  }

  return results;
}

function classifyCell(canvas) {
  const ctx  = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  const mx = Math.floor(w * 0.25);
  const my = Math.floor(h * 0.25);
  let darkPx = 0, midPx = 0, total = 0;

  for (let y = my; y < h - my; y++) {
    for (let x = mx; x < w - mx; x++) {
      const i = (y * w + x) * 4;
      const luma = (data[i] + data[i+1] + data[i+2]) / 3;
      total++;
      if (luma < 80)       darkPx++;
      else if (luma < 180) midPx++;
    }
  }

  const darkPct = darkPx / total;
  const midPct  = midPx  / total;

  if (darkPct > 0.20) return 'active';
  if (darkPct > 0.03 || midPct > 0.10) return 'inactive';
  return 'empty';
}

// ==============================
// TEMPLATE MATCHING
// ==============================

const TMPL_SIZE = 60;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let templates = null;

function buildTemplates() {
  if (templates) return;
  templates = {};

  const c = document.createElement('canvas');
  c.width = TMPL_SIZE;
  c.height = TMPL_SIZE;
  const ctx = c.getContext('2d');

  for (const ch of ALPHABET) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, TMPL_SIZE, TMPL_SIZE);

    ctx.fillStyle = '#000';
    ctx.font = 'bold ' + (TMPL_SIZE * 0.6) + 'px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ch, TMPL_SIZE / 2, TMPL_SIZE / 2);

    const d = ctx.getImageData(0, 0, TMPL_SIZE, TMPL_SIZE).data;
    const bmp = new Uint8Array(TMPL_SIZE * TMPL_SIZE);
    for (let i = 0; i < bmp.length; i++) {
      bmp[i] = d[i * 4] < 128 ? 1 : 0;
    }
    templates[ch] = bmp;
  }
}

function extractCellBitmap(cellCanvas, isActive) {
  const w = cellCanvas.width, h = cellCanvas.height;

  const crop = 0.25;
  const cx = Math.floor(w * crop);
  const cy = Math.floor(h * crop);
  const cw = w - 2 * cx;
  const ch = h - 2 * cy;

  const tmp = document.createElement('canvas');
  tmp.width = TMPL_SIZE;
  tmp.height = TMPL_SIZE;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(cellCanvas, cx, cy, cw, ch, 0, 0, TMPL_SIZE, TMPL_SIZE);

  const d = tctx.getImageData(0, 0, TMPL_SIZE, TMPL_SIZE).data;
  const bmp = new Uint8Array(TMPL_SIZE * TMPL_SIZE);

  if (isActive) {
    for (let i = 0; i < bmp.length; i++) {
      const luma = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
      bmp[i] = luma > 160 ? 1 : 0;
    }
  } else {
    for (let i = 0; i < bmp.length; i++) {
      const luma = 0.299 * d[i*4] + 0.587 * d[i*4+1] + 0.114 * d[i*4+2];
      bmp[i] = luma < 100 ? 1 : 0;
    }
  }

  return bmp;
}

function centreBitmap(bmp) {
  const S = TMPL_SIZE;
  let minX = S, maxX = 0, minY = S, maxY = 0, count = 0;

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (bmp[y * S + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        count++;
      }
    }
  }

  if (count < 3) return bmp;

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const offX = Math.floor((S - bw) / 2) - minX;
  const offY = Math.floor((S - bh) / 2) - minY;

  const out = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (bmp[y * S + x]) {
        const nx = x + offX;
        const ny = y + offY;
        if (nx >= 0 && nx < S && ny >= 0 && ny < S) {
          out[ny * S + nx] = 1;
        }
      }
    }
  }
  return out;
}

function matchScore(input, tmpl) {
  const n = input.length;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += input[i]; sumB += tmpl[i]; }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const a = input[i] - meanA;
    const b = tmpl[i] - meanB;
    num  += a * b;
    denA += a * a;
    denB += b * b;
  }

  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

function recogniseLetterTemplate(cellCanvas, isActive) {
  buildTemplates();

  let rawBmp = extractCellBitmap(cellCanvas, isActive);
  rawBmp = centreBitmap(rawBmp);

  if (!templates._centred) {
    for (const ch of ALPHABET) {
      templates['_c' + ch] = centreBitmap(templates[ch]);
    }
    templates._centred = true;
  }

  let bestLetter = '?';
  let bestScore  = -Infinity;

  for (const ch of ALPHABET) {
    const score = matchScore(rawBmp, templates['_c' + ch]);
    if (score > bestScore) {
      bestScore = score;
      bestLetter = ch;
    }
  }

  console.log('  Template match: "' + bestLetter + '" (score ' + bestScore.toFixed(3) + ')');
  return bestLetter;
}

// ==============================
// IMPROVED LETTER DETECTION (OCR)
// ==============================

/**
 * Crop the centre of a cell canvas, removing grid lines and circular borders.
 * @param {HTMLCanvasElement} canvas - The full cell canvas
 * @param {number} cropRatio - Fraction of the canvas to KEEP (0.35 = 35%)
 * @returns {HTMLCanvasElement} Cropped canvas
 */
function cropLetterRegion(canvas, cropRatio) {
  const w = canvas.width;
  const h = canvas.height;
  const keepW = Math.round(w * cropRatio);
  const keepH = Math.round(h * cropRatio);
  const offX = Math.round((w - keepW) / 2);
  const offY = Math.round((h - keepH) / 2);

  const out = document.createElement('canvas');
  out.width = keepW;
  out.height = keepH;
  out.getContext('2d').drawImage(canvas, offX, offY, keepW, keepH, 0, 0, keepW, keepH);
  return out;
}

/**
 * Upscale a canvas by a given factor with no smoothing (sharp pixel edges).
 * @param {HTMLCanvasElement} canvas
 * @param {number} factor - Upscale multiplier (e.g. 4)
 * @returns {HTMLCanvasElement}
 */
function upscale(canvas, factor) {
  const out = document.createElement('canvas');
  out.width = canvas.width * factor;
  out.height = canvas.height * factor;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

/**
 * Convert canvas to high-contrast black & white via thresholding.
 * Active cells have white letters on dark bg; inactive cells have dark letters on light bg.
 * @param {HTMLCanvasElement} canvas
 * @param {boolean} isActive
 * @returns {HTMLCanvasElement}
 */
function preprocess(canvas, isActive) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Threshold: for active cells, bright pixels are the letter (invert);
  // for inactive cells, dark pixels are the letter.
  const threshold = isActive ? 160 : 120;

  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let isLetterPixel;
    if (isActive) {
      isLetterPixel = luma > threshold; // bright on dark
    } else {
      isLetterPixel = luma < threshold; // dark on light
    }
    // Tesseract expects dark text on white background
    const val = isLetterPixel ? 0 : 255;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
    data[i + 3] = 255;
  }

  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d').putImageData(imgData, 0, 0);
  return out;
}

// Lazily-initialised Tesseract worker
let _ocrWorker = null;

async function getOCRWorker() {
  if (_ocrWorker) return _ocrWorker;
  _ocrWorker = await Tesseract.createWorker('eng', 1, {
    logger: DEBUG ? (m) => console.log('[Tesseract]', m) : undefined,
  });
  await _ocrWorker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    tessedit_pageseg_mode: '10', // single character
  });
  return _ocrWorker;
}

/**
 * Run the full improved letter-detection pipeline on one cell canvas.
 * Tries several crop ratios and picks the result with highest OCR confidence.
 * Falls back to template matching if OCR produces nothing.
 *
 * @param {HTMLCanvasElement} cellCanvas
 * @param {boolean} isActive
 * @returns {Promise<string>} Uppercase letter
 */
async function extractLetter(cellCanvas, isActive) {
  const worker = await getOCRWorker();
  const cropRatios = [0.35, 0.40, 0.45];
  const upscaleFactor = 4;

  let bestLetter = '';
  let bestConf = -1;

  for (const ratio of cropRatios) {
    // 1. Crop centre
    const cropped = cropLetterRegion(cellCanvas, ratio);
    // 2. Upscale
    const scaled = upscale(cropped, upscaleFactor);
    // 3. High-contrast threshold
    const bw = preprocess(scaled, isActive);

    // DEBUG: show what OCR sees
    if (DEBUG) {
      const label = document.createElement('div');
      label.style.cssText = 'color:#ccc;font-size:11px;margin:8px 4px 2px;font-family:monospace;';
      label.textContent = (isActive ? 'ACTIVE' : 'INACTIVE') + ' crop=' + ratio;
      document.body.appendChild(label);
      bw.style.cssText = 'border:1px solid #555;margin:2px 4px;';
      document.body.appendChild(bw.cloneNode(true));
      // also draw the clone so the original stays usable
      const clone = bw.cloneNode(true);
      clone.getContext('2d').drawImage(bw, 0, 0);
      document.body.appendChild(clone);
    }

    // 4. OCR
    const { data } = await worker.recognize(bw);
    const text = (data.text || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    const conf = data.confidence || 0;

    console.log('  OCR crop=' + ratio + ': "' + text + '" conf=' + conf);

    if (text.length === 1 && conf > bestConf) {
      bestConf = conf;
      bestLetter = text;
    }
  }

  // Fallback to template matching if OCR didn't produce a single letter
  if (!bestLetter) {
    console.log('  OCR failed, falling back to template matching');
    bestLetter = recogniseLetterTemplate(cellCanvas, isActive);
  } else {
    console.log('  OCR best: "' + bestLetter + '" conf=' + bestConf);
  }

  return bestLetter;
}

// Synchronous wrapper kept for backward compat; prefer extractLetter for async callers
function recogniseLetter(cellCanvas, isActive) {
  // Template-match fallback used during synchronous scan
  return recogniseLetterTemplate(cellCanvas, isActive);
}

// ==============================
// RENDER OUTPUT (gold theme)
// ==============================

async function renderOutput(ctx, tiles, gridSize) {
  await loadAssets();

  // 1. Background
  const bgPad = s(28);
  if (bgImage) {
    ctx.drawImage(bgImage, 0, -bgPad, EXPORT_SIZE, EXPORT_SIZE + bgPad * 2);
  } else {
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);
  }

  // 2. Title (headline SVG)
  if (headlineSvg) {
    const hlW = s(250);
    const hlH = s(19);
    const hlX = (EXPORT_SIZE - hlW) / 2;
    ctx.drawImage(headlineSvg, hlX, s(TEXT_TOP_Y), hlW, hlH);
  }

  // 3. Grid
  const N  = gridSize;
  const gx = s(GRID_LEFT_X);
  const gy = s(GRID_TOP_Y);
  const gw = s(GRID_REF);
  const gh = s(GRID_REF);
  const gr = s(LAYOUT.gridRadius);
  const cellPx = gw / N;

  // Shadow
  ctx.save();
  roundRectPath(ctx, gx, gy + s(LAYOUT.shadowOffsetY), gw, gh, gr);
  ctx.fillStyle = COLORS.shadow;
  ctx.fill();
  ctx.restore();

  // Background + clip
  ctx.save();
  roundRectPath(ctx, gx, gy, gw, gh, gr);
  ctx.fillStyle = COLORS.gridBg;
  ctx.fill();
  ctx.clip();

  // Cell lines
  ctx.strokeStyle = COLORS.cellBorder;
  ctx.lineWidth = s(LAYOUT.cellBorder);
  for (let i = 1; i < N; i++) {
    ctx.beginPath();
    ctx.moveTo(gx + i * cellPx, gy);
    ctx.lineTo(gx + i * cellPx, gy + gh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx, gy + i * cellPx);
    ctx.lineTo(gx + gw, gy + i * cellPx);
    ctx.stroke();
  }
  ctx.restore();

  // Outer border
  roundRectPath(ctx, gx, gy, gw, gh, gr);
  ctx.strokeStyle = COLORS.gridBorder;
  ctx.lineWidth = s(LAYOUT.gridBorder);
  ctx.stroke();

  // 4. Tiles
  const cr = s(LAYOUT.circleDiam) / 2;
  const fontSize = s(LAYOUT.letterFontSize);

  for (const tile of tiles) {
    const tcx = gx + tile.col * cellPx + cellPx / 2;
    const tcy = gy + tile.row * cellPx + cellPx / 2;

    // Drop shadow
    ctx.beginPath();
    ctx.arc(tcx, tcy + s(1.5), cr, 0, Math.PI * 2);
    ctx.fillStyle = '#C28A31';
    ctx.fill();

    // Circle
    ctx.beginPath();
    ctx.arc(tcx, tcy, cr, 0, Math.PI * 2);

    if (tile.active) {
      ctx.fillStyle = COLORS.activeBg;
      ctx.fill();
    } else {
      ctx.fillStyle = COLORS.inactiveBg;
      ctx.fill();
      ctx.strokeStyle = COLORS.inactiveBorder;
      ctx.lineWidth = s(LAYOUT.circleBorder);
      ctx.stroke();
    }

    // Letter
    ctx.fillStyle = tile.active ? COLORS.activeText : COLORS.inactiveText;
    ctx.font = 'bold ' + fontSize + 'px "Inter"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    const metrics = ctx.measureText(tile.letter);
    const ascent  = metrics.actualBoundingBoxAscent  || fontSize * 0.72;
    const descent = metrics.actualBoundingBoxDescent || fontSize * 0.05;
    const glyphH  = ascent + descent;
    const baselineY = tcy + glyphH / 2 - descent;

    ctx.fillText(tile.letter, tcx, baselineY);
  }

  // 5. SVG logo
  if (svgLogo) {
    ctx.drawImage(svgLogo, s(SVG_LEFT_X), s(SVG_TOP_Y), s(LAYOUT.svgW), s(LAYOUT.svgH));
  }
}
