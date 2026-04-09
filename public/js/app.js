/* ============================================================
   app.js — Mensajes Fraudulentos
   ============================================================ */

// ── Estado global ──────────────────────────────────────────
const state = {
  currentPage:  1,
  totalPages:   1,
  total:        0,
  limit:        50,
  sortBy:       'received_at',
  sortDir:      'desc',
  isLoading:    false,
  filters: {
    q:        '',
    content:  '',
    sender:   '',
    dateFrom: '',
    dateTo:   '',
    minScore: 0,
    maxScore: 100
  }
};

// ── Refs DOM ───────────────────────────────────────────────
const $ = id => document.getElementById(id);

const searchGlobal   = $('search-global');
const filterContent  = $('filter-content');
const filterSender   = $('filter-sender');
const filterDateFrom = $('filter-date-from');
const filterDateTo   = $('filter-date-to');
const scoreMin       = $('score-min');
const scoreMax       = $('score-max');
const scoreLabel     = $('score-range-label');
const trackFill      = $('score-track-fill');
const applyBtn       = $('apply-filters-btn');
const clearBtn       = $('clear-filters-btn');
const sortByEl       = $('sort-by');
const sortDirBtn     = $('sort-dir-btn');
const sortDirIcon    = $('sort-dir-icon');
const pageLimitEl    = $('page-limit');
const tableWrapper   = $('table-wrapper');
const tbody          = $('messages-tbody');
const pagination     = $('pagination');
const prevPageBtn    = $('prev-page-btn');
const nextPageBtn    = $('next-page-btn');
const pageNumbers    = $('page-numbers');
const stateLoading   = $('state-loading');
const stateError     = $('state-error');
const stateEmpty     = $('state-empty');
const errorText      = $('error-text');
const retryBtn       = $('retry-btn');
const resultSummary  = $('result-summary');
const summaryCount   = $('summary-count');
const searchSpinner  = $('search-spinner');
const senderSuggestions = $('sender-suggestions');
const mobileFiltersBtn  = $('mobile-filters-btn');
const filtersPanel      = document.querySelector('.filters-panel');
const detailModal    = $('detail-modal');
const modalClose     = $('modal-close');
const detailId       = $('detail-id');
const detailSender   = $('detail-sender');
const detailScore    = $('detail-score');
const detailDate     = $('detail-date');
const detailContent  = $('detail-content');

// ── Inicialización ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadMeta();
  loadSuggestions();
  fetchMessages();

  // Botones
  applyBtn.addEventListener('click', () => {
    readFilters();
    state.currentPage = 1;
    fetchMessages();
  });

  clearBtn.addEventListener('click', clearAllFilters);

  retryBtn.addEventListener('click', fetchMessages);

  sortByEl.addEventListener('change', () => {
    state.sortBy = sortByEl.value;
    state.currentPage = 1;
    fetchMessages();
  });

  sortDirBtn.addEventListener('click', toggleSortDir);

  pageLimitEl.addEventListener('change', () => {
    state.limit = parseInt(pageLimitEl.value);
    state.currentPage = 1;
    fetchMessages();
  });

  prevPageBtn.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      fetchMessages();
    }
  });

  nextPageBtn.addEventListener('click', () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      fetchMessages();
    }
  });

  // Score dual slider
  scoreMin.addEventListener('input', updateScoreSlider);
  scoreMax.addEventListener('input', updateScoreSlider);
  updateScoreSlider();

  // Enter en inputs → apply
  [searchGlobal, filterContent, filterSender, filterDateFrom, filterDateTo]
    .forEach(el => el.addEventListener('keydown', e => {
      if (e.key === 'Enter') applyBtn.click();
    }));

  // Búsqueda global con debounce
  let debounceTimer;
  searchGlobal.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    searchSpinner.classList.remove('hidden');
    debounceTimer = setTimeout(() => {
      searchSpinner.classList.add('hidden');
      // No aplica auto, esperamos click de botón
    }, 400);
  });

  // Sender autocomplete
  filterSender.addEventListener('input', () => {
    const val = filterSender.value.toLowerCase();
    renderSuggestions(val);
  });
  filterSender.addEventListener('focus', () => {
    renderSuggestions(filterSender.value.toLowerCase());
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrapper')) {
      senderSuggestions.classList.add('hidden');
    }
  });

  // Mobile filters
  mobileFiltersBtn.addEventListener('click', () => {
    filtersPanel.classList.toggle('mobile-open');
  });

  // Modal
  modalClose.addEventListener('click', closeModal);
  detailModal.addEventListener('click', e => {
    if (e.target === detailModal) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
});

// ── Meta: fechas y scores mínimos/máximos ─────────────────
async function loadMeta() {
  try {
    const res  = await fetch('/api/meta');
    const data = await res.json();
    if (data.minDate) filterDateFrom.min = data.minDate;
    if (data.maxDate) filterDateTo.max   = data.maxDate;
  } catch (_) { /* silencioso */ }
}

// ── Sugerencias de remitentes ─────────────────────────────
let allSenders = [];
async function loadSuggestions() {
  try {
    const res  = await fetch('/api/remitentes');
    allSenders = await res.json();
  } catch (_) {}
}

function renderSuggestions(val) {
  const filtered = val
    ? allSenders.filter(s => s.toLowerCase().includes(val))
    : allSenders.slice(0, 20);

  if (!filtered.length) {
    senderSuggestions.classList.add('hidden');
    return;
  }

  senderSuggestions.innerHTML = '';
  filtered.slice(0, 30).forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    li.addEventListener('click', () => {
      filterSender.value = s;
      senderSuggestions.classList.add('hidden');
    });
    senderSuggestions.appendChild(li);
  });
  senderSuggestions.classList.remove('hidden');
}

// ── Slider dual de score ──────────────────────────────────
function updateScoreSlider() {
  let minVal = parseInt(scoreMin.value);
  let maxVal = parseInt(scoreMax.value);

  if (minVal > maxVal) {
    if (this === scoreMin) { minVal = maxVal; scoreMin.value = minVal; }
    else                   { maxVal = minVal; scoreMax.value = maxVal; }
  }

  scoreLabel.textContent = `${minVal} – ${maxVal}`;

  const pct  = v => (v / 100) * 100;
  const left  = pct(minVal);
  const right = pct(maxVal);
  trackFill.style.left  = left  + '%';
  trackFill.style.width = (right - left) + '%';
}

// ── Leer filtros del formulario ───────────────────────────
function readFilters() {
  state.filters.q        = searchGlobal.value.trim();
  state.filters.content  = filterContent.value.trim();
  state.filters.sender   = filterSender.value.trim();
  state.filters.dateFrom = filterDateFrom.value;
  state.filters.dateTo   = filterDateTo.value;
  state.filters.minScore = parseInt(scoreMin.value);
  state.filters.maxScore = parseInt(scoreMax.value);
}

// ── Limpiar todos los filtros ─────────────────────────────
function clearAllFilters() {
  searchGlobal.value   = '';
  filterContent.value  = '';
  filterSender.value   = '';
  filterDateFrom.value = '';
  filterDateTo.value   = '';
  scoreMin.value = 0;
  scoreMax.value = 100;
  updateScoreSlider();

  state.filters = { q:'', content:'', sender:'', dateFrom:'', dateTo:'', minScore:0, maxScore:100 };
  state.currentPage = 1;
  fetchMessages();
}

// ── Ordenamiento ──────────────────────────────────────────
function toggleSortDir() {
  state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
  sortDirIcon.className = state.sortDir === 'desc'
    ? 'fas fa-sort-amount-down'
    : 'fas fa-sort-amount-up';
  state.currentPage = 1;
  fetchMessages();
}

// ── Fetch principal ───────────────────────────────────────
async function fetchMessages() {
  if (state.isLoading) return;
  state.isLoading = true;

  showState('loading');

  const params = new URLSearchParams({
    page:    state.currentPage,
    limit:   state.limit,
    sortBy:  state.sortBy,
    sortDir: state.sortDir,
    ...(state.filters.q        && { q:        state.filters.q }),
    ...(state.filters.content  && { content:  state.filters.content }),
    ...(state.filters.sender   && { sender:   state.filters.sender }),
    ...(state.filters.dateFrom && { dateFrom: state.filters.dateFrom }),
    ...(state.filters.dateTo   && { dateTo:   state.filters.dateTo }),
    ...(state.filters.minScore > 0   && { minScore: state.filters.minScore }),
    ...(state.filters.maxScore < 100 && { maxScore: state.filters.maxScore })
  });

  try {
    const res  = await fetch(`/api/mensajes?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.total      = data.total;
    state.totalPages = data.totalPages;

    if (!data.data.length) {
      showState('empty');
      resultSummary.classList.add('hidden');
    } else {
      renderTable(data.data);
      renderPagination();
      summaryCount.textContent = data.total.toLocaleString('es-CO');
      resultSummary.classList.remove('hidden');
      showState('table');
    }
  } catch (err) {
    errorText.textContent = `Error al consultar: ${err.message}`;
    showState('error');
  } finally {
    state.isLoading = false;
  }
}

// ── Mostrar estado ────────────────────────────────────────
function showState(s) {
  stateLoading.classList.add('hidden');
  stateError.classList.add('hidden');
  stateEmpty.classList.add('hidden');
  tableWrapper.classList.add('hidden');
  pagination.classList.add('hidden');

  if (s === 'loading') stateLoading.classList.remove('hidden');
  if (s === 'error')   stateError.classList.remove('hidden');
  if (s === 'empty')   stateEmpty.classList.remove('hidden');
  if (s === 'table') {
    tableWrapper.classList.remove('hidden');
    pagination.classList.remove('hidden');
  }
}

// ── Renderizar tabla ──────────────────────────────────────
function renderTable(data) {
  tbody.innerHTML = '';

  data.forEach(msg => {
    const tr = document.createElement('tr');
    tr.dataset.id = msg.id;

    tr.innerHTML = `
      <td class="col-id">
        <span class="id-badge">#${msg.id}</span>
      </td>
      <td class="col-sender">
        <span class="sender-chip">
          <i class="fas fa-user-circle"></i>
          ${escHtml(msg.sender)}
        </span>
      </td>
      <td class="col-content">
        <span class="msg-content" title="${escHtml(msg.message_body)}">
          ${escHtml(msg.message_body || '—')}
        </span>
      </td>
      <td class="col-score" style="text-align:center;">
        ${renderScoreBadge(msg.detection_score)}
      </td>
      <td class="col-date">
        <div class="date-cell">
          <span class="date-day">${formatDate(msg.received_at)}</span>
          <span class="date-time">${formatTime(msg.received_at)}</span>
        </div>
      </td>
      <td class="col-actions">
        <button class="row-action-btn" title="Ver detalle" data-id="${msg.id}">
          <i class="fas fa-expand-alt"></i>
        </button>
      </td>
    `;

    // Click fila → modal
    tr.addEventListener('click', () => openModal(msg));

    // Click botón acción → modal (evitamos doble disparo)
    tr.querySelector('.row-action-btn').addEventListener('click', e => {
      e.stopPropagation();
      openModal(msg);
    });

    tbody.appendChild(tr);
  });
}

// ── Score badge ───────────────────────────────────────────
function renderScoreBadge(score) {
  if (score === null || score === undefined) {
    return `<span class="score-badge score-low"><i class="fas fa-minus"></i>N/D</span>`;
  }
  const pct = parseFloat(score).toFixed(1);
  if (score < 60) {
    return `<span class="score-badge score-low"><i class="fas fa-check-circle"></i>${pct}%</span>`;
  } else if (score < 70) {
    return `<span class="score-badge score-mid"><i class="fas fa-exclamation-circle"></i>${pct}%</span>`;
  } else if (score < 80) {
    return `<span class="score-badge score-high"><i class="fas fa-exclamation-triangle"></i>${pct}%</span>`;
  } else {
    return `<span class="score-badge score-very-high"><i class="fas fa-radiation-alt"></i>${pct}%</span>`;
  }
}

// ── Paginación ────────────────────────────────────────────
function renderPagination() {
  const { currentPage: cp, totalPages: tp } = state;

  prevPageBtn.disabled = cp <= 1;
  nextPageBtn.disabled = cp >= tp;

  pageNumbers.innerHTML = '';

  const pages = buildPageList(cp, tp);
  pages.forEach(p => {
    const btn = document.createElement('button');
    if (p === '…') {
      btn.className = 'page-num ellipsis';
      btn.textContent = '…';
      btn.disabled = true;
    } else {
      btn.className = `page-num${p === cp ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => {
        state.currentPage = p;
        fetchMessages();
      });
    }
    pageNumbers.appendChild(btn);
  });
}

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

// ── Modal detalle ─────────────────────────────────────────
function openModal(msg) {
  detailId.textContent      = `#${msg.id}`;
  detailSender.textContent  = msg.sender || 'Desconocido';
  detailDate.textContent    = formatDateTime(msg.received_at);
  detailContent.textContent = msg.message_body || '—';

  // Score con color
  const score = msg.detection_score;
  if (score !== null && score !== undefined) {
    detailScore.textContent = `${parseFloat(score).toFixed(2)}%`;
    detailScore.style.color = scoreColor(score);
  } else {
    detailScore.textContent = 'N/D';
    detailScore.style.color = '';
  }

  detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  detailModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function scoreColor(s) {
  if (s < 60) return 'var(--success)';
  if (s < 70) return 'var(--warn)';
  if (s < 80) return '#fb923c';
  return 'var(--danger)';
}

// ── Utilidades de fecha ───────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('es-CO', {
    day:'2-digit', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit', second:'2-digit'
  });
}

// ── Escape HTML ───────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
