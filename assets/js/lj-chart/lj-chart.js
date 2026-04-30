/**
 * lj-chart.js
 * L-J 정도관리 차트 앱 - 프론트엔드
 * app_id: 'lj_chart'
 */

const APP_ID = 'lj_chart';

// ─────────────────────────────────────────────
// 상태
// ─────────────────────────────────────────────
let state = {
  items: [],        // 검사 항목 목록 { item_id, item_name, unit, mean, sd, memo }
  activeItemId: null,
  entries: {},      // { item_id: [ { entry_id, date, value, memo } ] }
  chart: null
};

// ─────────────────────────────────────────────
// DOM 참조
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.getSession?.();
  if (!user) {
    alert('로그인 세션이 만료되었습니다.\n다시 로그인해 주세요.');
    location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
    return;
  }

  // globalLoading 대신 스켈레톤으로 초기 로딩 표시
  $('skeletonBody').style.display = '';
  bindEvents();

  try {
    const isAdmin = String(user.role || '').trim().toLowerCase() === 'admin';

    const permissionPromise = isAdmin
      ? Promise.resolve(true)
      : window.appPermission.hasPermission(APP_ID);

    const itemsPromise = apiGet('ljGetItems', { request_user_email: user.email })
      .then(r => Array.isArray(r.data) ? r.data : [])
      .catch(() => null);

    const [hasAccess, itemsResult] = await Promise.all([permissionPromise, itemsPromise]);

    // 스켈레톤 제거
    $('skeletonBody').style.display = 'none';

    if (!hasAccess) {
      $('permissionDenied').style.display = '';
      return;
    }

    $('appBody').style.display = '';

    if (itemsResult === null) {
      showItemEmptyState();
    } else {
      state.items = itemsResult;
      renderItemSelect();
      if (state.items.length > 0) {
        selectItem(state.items[0].item_id);
      } else {
        showItemEmptyState();
      }
    }
  } catch (e) {
    $('skeletonBody').style.display = 'none';
    showMessage(e.message || '불러오는 중 오류가 발생했습니다.', 'error');
  }
});

// ─────────────────────────────────────────────
// 이벤트 바인딩
// ─────────────────────────────────────────────
function bindEvents() {
  // 항목 추가 버튼 (항목 있을 때 / 없을 때 둘 다)
  $('addItemTabBtn').addEventListener('click', () => openItemModal(null));
  $('addItemTabBtnEmpty').addEventListener('click', () => openItemModal(null));

  $('editItemBtn').addEventListener('click', () => {
    const item = getActiveItem();
    if (item) openItemModal(item);
  });
  $('deleteItemBtn').addEventListener('click', deleteActiveItem);

  // 셀렉트 변경 시 항목 전환
  $('itemSelect').addEventListener('change', e => {
    if (e.target.value) selectItem(e.target.value);
  });

  $('itemModalClose').addEventListener('click', closeItemModal);
  $('itemModalCancel').addEventListener('click', closeItemModal);
  $('itemModalSave').addEventListener('click', saveItem);

  $('addEntryBtn').addEventListener('click', addEntry);
  $('entryValue').addEventListener('keydown', e => { if (e.key === 'Enter') addEntry(); });
  $('sampleDataBtn').addEventListener('click', loadSampleData);
  $('exportCsvBtn').addEventListener('click', exportCsv);
  $('exportExcelBtn').addEventListener('click', exportExcel);
  $('exportPdfBtn').addEventListener('click', exportPdf);

  $('itemModal').addEventListener('click', e => {
    if (e.target === $('itemModal')) closeItemModal();
  });

  $('entryDate').value = new Date().toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// API 연동 — 검사 항목
// ─────────────────────────────────────────────
async function loadItems() {
  const user = window.auth.getSession();
  try {
    showGlobalLoading('불러오는 중...');
    const result = await apiGet('ljGetItems', { request_user_email: user.email });
    state.items = Array.isArray(result.data) ? result.data : [];
    renderItemSelect();
    if (state.items.length > 0) {
      selectItem(state.items[0].item_id);
    } else {
      showItemEmptyState();
    }
  } catch (e) {
    showMessage(e.message || '항목을 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function loadEntriesForItem(itemId) {
  const user = window.auth.getSession();

  // 테이블 영역에 스켈레톤 표시
  $('dataEmptyState').style.display = 'none';
  $('dataTable').style.display = '';
  $('dataTableBody').innerHTML = Array(4).fill(0).map(() => `
    <tr>
      <td><div class="skeleton" style="height:14px;width:90px;border-radius:6px;"></div></td>
      <td><div class="skeleton" style="height:14px;width:50px;border-radius:6px;margin:0 auto;"></div></td>
      <td><div class="skeleton" style="height:20px;width:52px;border-radius:6px;margin:0 auto;"></div></td>
      <td><div class="skeleton" style="height:20px;width:60px;border-radius:6px;margin:0 auto;"></div></td>
      <td><div class="skeleton" style="height:14px;width:80px;border-radius:6px;"></div></td>
      <td></td>
    </tr>
  `).join('');

  try {
    const result = await apiGet('ljGetEntries', {
      item_id: itemId,
      request_user_email: user.email
    });
    state.entries[itemId] = (Array.isArray(result.data) ? result.data : []).map(e => ({
      ...e,
      date: normalizeDate(e.date)
    }));
    renderDataTable();
    renderStats();
    renderChart();
  } catch (e) {
    showMessage(e.message || '데이터를 불러오지 못했습니다.', 'error');
    $('dataTable').style.display = 'none';
    $('dataEmptyState').style.display = '';
  }
}

// ─────────────────────────────────────────────
// 검사 항목 탭 렌더링
// ─────────────────────────────────────────────
function renderItemSelect() {
  const selectEl = $('itemSelect');
  const selectRow = $('itemSelectRow');
  const emptyRow = $('itemEmptyRow');

  if (state.items.length === 0) {
    selectRow.style.display = 'none';
    emptyRow.style.display = '';
    return;
  }

  selectRow.style.display = 'flex';
  emptyRow.style.display = 'none';

  selectEl.innerHTML = state.items.map(item =>
    `<option value="${escHtml(item.item_id)}" ${item.item_id === state.activeItemId ? 'selected' : ''}>
      ${escHtml(item.item_name)}
    </option>`
  ).join('');
}

function selectItem(itemId) {
  state.activeItemId = itemId;
  renderItemSelect();

  const item = getActiveItem();
  if (!item) return;

  $('itemEmptyState').style.display = 'none';
  $('settingsSection').style.display = '';
  $('dataEntrySection').style.display = '';
  $('editItemBtn').style.display = '';
  $('deleteItemBtn').style.display = '';

  $('settingsSectionTitle').textContent = item.item_name;
  $('chartSectionTitle').textContent = `L-J 차트 — ${item.item_name}`;

  renderSettingsDisplay(item);

  if (state.entries[itemId]) {
    renderDataTable();
    renderStats();
    renderChart();
  } else {
    loadEntriesForItem(itemId);
  }
}

function showItemEmptyState() {
  $('itemEmptyState').style.display = '';
  $('settingsSection').style.display = 'none';
  $('dataEntrySection').style.display = 'none';
  $('statsSection').style.display = 'none';
  $('chartSection').style.display = 'none';
  $('editItemBtn').style.display = 'none';
  $('deleteItemBtn').style.display = 'none';
}

function getActiveItem() {
  return state.items.find(it => it.item_id === state.activeItemId) || null;
}

// ─────────────────────────────────────────────
// 설정 표시
// ─────────────────────────────────────────────
function renderSettingsDisplay(item) {
  const mean = Number(item.mean);
  const sd   = Number(item.sd);

  const tiles = [
    { label: '목표 평균 (Mean)', value: mean.toFixed(2), unit: item.unit },
    { label: '표준편차 (SD)',    value: sd.toFixed(2),   unit: item.unit },
    { label: '+2SD 상한',        value: (mean + 2*sd).toFixed(2), unit: item.unit },
    { label: '-2SD 하한',        value: (mean - 2*sd).toFixed(2), unit: item.unit }
  ];

  let html = tiles.map(t => `
    <div class="kpi-card">
      <div class="kpi-label">${escHtml(t.label)}</div>
      <div style="font-size:20px;font-weight:900;color:#0b1f44;line-height:1;letter-spacing:-0.02em;">${escHtml(t.value)}</div>
      <div style="font-size:10px;color:#8494aa;margin-top:3px;font-weight:600;">${escHtml(t.unit)}</div>
    </div>
  `).join('');

  if (item.memo) {
    html += `<div class="kpi-card full-span"><div class="kpi-label">메모</div><div style="font-size:14px;font-weight:600;color:#334155;">${escHtml(item.memo)}</div></div>`;
  }

  $('settingsDisplay').innerHTML = html;
}

// ─────────────────────────────────────────────
// 검사 항목 모달
// ─────────────────────────────────────────────
function openItemModal(item) {
  $('itemModalTitle').textContent = item ? '검사 항목 수정' : '검사 항목 추가';
  $('modalItemId').value = item ? item.item_id : '';
  $('modalItemName').value = item ? item.item_name : '';
  $('modalItemUnit').value = item ? item.unit : '';
  $('modalItemMean').value = item ? item.mean : '';
  $('modalItemSd').value = item ? item.sd : '';
  $('modalItemMemo').value = item ? (item.memo || '') : '';
  $('itemModal').style.display = '';
  setTimeout(() => $('modalItemName').focus(), 50);
}

function closeItemModal() {
  $('itemModal').style.display = 'none';
}

async function saveItem() {
  const itemId = $('modalItemId').value.trim();
  const itemName = $('modalItemName').value.trim();
  const unit = $('modalItemUnit').value.trim();
  const mean = parseFloat($('modalItemMean').value);
  const sd = parseFloat($('modalItemSd').value);
  const memo = $('modalItemMemo').value.trim();

  if (!itemName) { alert('검사 항목명을 입력하세요.'); $('modalItemName').focus(); return; }
  if (!unit) { alert('단위를 입력하세요.'); $('modalItemUnit').focus(); return; }
  if (isNaN(mean)) { alert('목표 평균을 입력하세요.'); $('modalItemMean').focus(); return; }
  if (isNaN(sd) || sd <= 0) { alert('표준편차를 올바르게 입력하세요. (0보다 커야 합니다)'); $('modalItemSd').focus(); return; }

  const user = window.auth.getSession();
  const isEdit = !!itemId;

  try {
    showGlobalLoading(isEdit ? '항목 수정 중...' : '항목 저장 중...');
    closeItemModal();

    if (isEdit) {
      await apiPost('ljUpdateItem', {
        item_id: itemId, item_name: itemName, unit, mean, sd, memo,
        request_user_email: user.email
      });
      const idx = state.items.findIndex(it => it.item_id === itemId);
      if (idx !== -1) state.items[idx] = { ...state.items[idx], item_name: itemName, unit, mean, sd, memo };
    } else {
      const result = await apiPost('ljCreateItem', {
        item_name: itemName, unit, mean, sd, memo,
        request_user_email: user.email
      });
      state.items.push(result.data);
    }

    renderItemSelect();
    selectItem(isEdit ? itemId : state.items[state.items.length - 1].item_id);
    showMessage(isEdit ? '항목이 수정되었습니다.' : '항목이 추가되었습니다.', 'success');
  } catch (e) {
    showMessage(e.message || '저장에 실패했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function deleteActiveItem() {
  const item = getActiveItem();
  if (!item) return;
  if (!confirm(`"${item.item_name}" 항목을 삭제하시겠습니까?\n입력된 모든 데이터도 함께 삭제됩니다.`)) return;

  const user = window.auth.getSession();
  try {
    showGlobalLoading('항목 삭제 중...');
    await apiPost('ljDeleteItem', {
      item_id: item.item_id,
      request_user_email: user.email
    });

    state.items = state.items.filter(it => it.item_id !== item.item_id);
    delete state.entries[item.item_id];
    state.activeItemId = null;

    if (state.chart) { state.chart.destroy(); state.chart = null; }

    renderItemSelect();
    if (state.items.length > 0) {
      selectItem(state.items[0].item_id);
    } else {
      showItemEmptyState();
    }
    showMessage('항목이 삭제되었습니다.', 'success');
  } catch (e) {
    showMessage(e.message || '삭제에 실패했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

// ─────────────────────────────────────────────
// 데이터 입력 / 삭제
// ─────────────────────────────────────────────
async function addEntry() {
  const date = $('entryDate').value;
  const value = parseFloat($('entryValue').value);
  const memo = $('entryMemo').value.trim();

  if (!date) { alert('측정일을 선택하세요.'); $('entryDate').focus(); return; }
  if (isNaN(value)) { alert('측정값을 입력하세요.'); $('entryValue').focus(); return; }
  if (!state.activeItemId) return;

  const user = window.auth.getSession();
  try {
    showGlobalLoading('데이터 저장 중...');
    const result = await apiPost('ljCreateEntry', {
      item_id: state.activeItemId, date, value, memo,
      request_user_email: user.email
    });

    if (!state.entries[state.activeItemId]) state.entries[state.activeItemId] = [];
    const newEntry = { ...result.data, date: normalizeDate(result.data.date) };
    state.entries[state.activeItemId].push(newEntry);
    state.entries[state.activeItemId].sort((a, b) => a.date.localeCompare(b.date));

    $('entryValue').value = '';
    $('entryMemo').value = '';
    $('entryDate').value = new Date().toISOString().slice(0, 10);

    renderDataTable();
    renderStats();
    renderChart();
  } catch (e) {
    showMessage(e.message || '저장에 실패했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function deleteEntry(entryId) {
  if (!confirm('이 데이터를 삭제하시겠습니까?')) return;
  const user = window.auth.getSession();
  try {
    showGlobalLoading('삭제 중...');
    await apiPost('ljDeleteEntry', {
      entry_id: entryId,
      item_id: state.activeItemId,
      request_user_email: user.email
    });

    state.entries[state.activeItemId] = state.entries[state.activeItemId].filter(e => e.entry_id !== entryId);
    renderDataTable();
    renderStats();
    renderChart();
  } catch (e) {
    showMessage(e.message || '삭제에 실패했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

// ─────────────────────────────────────────────
// Westgard Rules 판정
// ─────────────────────────────────────────────
function analyzeEntries(entries, mean, sd) {
  if (!entries || entries.length === 0) return [];

  return entries.map((entry, idx) => {
    const val = Number(entry.value);
    const sdi = (val - mean) / sd;
    const absSDI = Math.abs(sdi);
    const violations = [];

    // 1₃s: 1개 값이 ±3SD 벗어남 → 거부
    if (absSDI >= 3) violations.push({ code: '1₃s', type: 'reject' });

    // 1₂s: 1개 값이 ±2SD 벗어남 → 경고 (거부 아닌 경우만)
    else if (absSDI >= 2) violations.push({ code: '1₂s', type: 'warn' });

    // 2₂s: 연속 2개 값이 같은 방향 ±2SD → 거부
    if (idx >= 1) {
      const prev = entries[idx - 1];
      const prevSDI = (Number(prev.value) - mean) / sd;
      if (sdi >= 2 && prevSDI >= 2) violations.push({ code: '2₂s', type: 'reject' });
      if (sdi <= -2 && prevSDI <= -2) violations.push({ code: '2₂s', type: 'reject' });

      // R₄s: 연속 2개 값의 범위가 4SD 초과 → 거부
      if (Math.abs(sdi - prevSDI) > 4) violations.push({ code: 'R₄s', type: 'reject' });
    }

    // 4₁s: 연속 4개 값이 같은 방향 ±1SD → 거부
    if (idx >= 3) {
      const sdis = [idx - 3, idx - 2, idx - 1, idx].map(i => (Number(entries[i].value) - mean) / sd);
      if (sdis.every(s => s > 1)) violations.push({ code: '4₁s', type: 'reject' });
      if (sdis.every(s => s < -1)) violations.push({ code: '4₁s', type: 'reject' });
    }

    // 10x: 연속 10개 값이 평균 같은 쪽에 → 거부
    if (idx >= 9) {
      const sdis = entries.slice(idx - 9, idx + 1).map(e => (Number(e.value) - mean) / sd);
      if (sdis.every(s => s > 0)) violations.push({ code: '10x', type: 'reject' });
      if (sdis.every(s => s < 0)) violations.push({ code: '10x', type: 'reject' });
    }

    // 중복 제거 (같은 코드 두 번 들어갈 수 있음)
    const seen = new Set();
    const uniqueViolations = violations.filter(v => {
      const key = v.code + v.type;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { ...entry, sdi, violations: uniqueViolations };
  });
}

// ─────────────────────────────────────────────
// 데이터 테이블 렌더링
// ─────────────────────────────────────────────
function renderDataTable() {
  const itemId = state.activeItemId;
  const item = getActiveItem();
  const entries = state.entries[itemId] || [];

  if (entries.length === 0) {
    $('dataEmptyState').style.display = '';
    $('dataTable').style.display = 'none';
    return;
  }

  $('dataEmptyState').style.display = 'none';
  $('dataTable').style.display = '';

  const analyzed = analyzeEntries(entries, Number(item.mean), Number(item.sd));
  const tbody = $('dataTableBody');

  tbody.innerHTML = [...analyzed].reverse().map(row => {
    const hasReject = row.violations.some(v => v.type === 'reject');
    const hasWarn = row.violations.some(v => v.type === 'warn');
    const rowClass = hasReject ? 'lj-row--reject' : (hasWarn ? 'lj-row--warn' : '');

    const sdiClass = Math.abs(row.sdi) >= 3 ? 'lj-sdi-badge--reject'
                   : Math.abs(row.sdi) >= 2 ? 'lj-sdi-badge--warn'
                   : 'lj-sdi-badge--normal';

    const badges = row.violations.map(v =>
      `<span class="lj-rule-badge lj-rule-badge--${v.type}">${escHtml(v.code)}</span>`
    ).join('') || '<span style="color:#94a3b8;font-size:12px;">정상</span>';

    return `
      <tr class="${rowClass}">
        <td>${escHtml(row.date)}</td>
        <td style="font-weight:700;">${Number(row.value).toFixed(2)}</td>
        <td><span class="lj-sdi-badge ${sdiClass}">${row.sdi.toFixed(2)}</span></td>
        <td>${badges}</td>
        <td style="font-size:12px;color:#64748b;">${escHtml(row.memo || '')}</td>
        <td><button type="button" class="lj-del-btn" onclick="deleteEntry('${escHtml(row.entry_id)}')">✕</button></td>
      </tr>
    `;
  }).join('');
}

// ─────────────────────────────────────────────
// 통계 렌더링
// ─────────────────────────────────────────────
function renderStats() {
  const itemId = state.activeItemId;
  const item = getActiveItem();
  const entries = state.entries[itemId] || [];

  if (entries.length === 0) {
    $('statsSection').style.display = 'none';
    return;
  }

  $('statsSection').style.display = '';

  const values = entries.map(e => Number(e.value));
  const n = values.length;
  const actualMean = values.reduce((s, v) => s + v, 0) / n;
  const actualSD = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - actualMean, 2), 0) / n);
  const cv = (actualSD / actualMean) * 100;

  const analyzed = analyzeEntries(entries, Number(item.mean), Number(item.sd));
  const warnCount   = analyzed.filter(r => r.violations.length > 0 && !r.violations.some(v => v.type === 'reject')).length;
  const rejectCount = analyzed.filter(r => r.violations.some(v => v.type === 'reject')).length;

  const cards = [
    { label: '데이터 수',  value: n,                   unit: '건' },
    { label: '실측 평균',  value: actualMean.toFixed(2), unit: item.unit },
    { label: '실측 SD',    value: actualSD.toFixed(2),   unit: item.unit },
    { label: '%CV',        value: cv.toFixed(1),          unit: '%' },
    { label: '경고 건수',  value: warnCount,   unit: '건', warn: warnCount > 0 },
    { label: '거부 건수',  value: rejectCount, unit: '건', danger: rejectCount > 0 }
  ];

  $('statGrid').innerHTML = cards.map(c => `
    <div class="kpi-card">
      <div class="kpi-label">${escHtml(c.label)}</div>
      <div style="font-size:20px;font-weight:900;color:${c.danger ? '#b42318' : c.warn ? '#c2410c' : '#0b1f44'};line-height:1;letter-spacing:-0.02em;">${escHtml(String(c.value))}</div>
      <div style="font-size:10px;color:#8494aa;margin-top:3px;font-weight:600;">${escHtml(c.unit)}</div>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// L-J 차트 렌더링
// ─────────────────────────────────────────────
function renderChart() {
  const itemId = state.activeItemId;
  const item = getActiveItem();
  const entries = state.entries[itemId] || [];

  if (entries.length === 0) {
    $('chartSection').style.display = 'none';
    return;
  }

  $('chartSection').style.display = '';

  const mean = Number(item.mean);
  const sd = Number(item.sd);
  const analyzed = analyzeEntries(entries, mean, sd);

  const labels = analyzed.map(e => e.date);
  const values = analyzed.map(e => Number(e.value));

  // 포인트 색상
  const pointColors = analyzed.map(e => {
    if (e.violations.some(v => v.type === 'reject')) return '#dc2626';
    if (e.violations.length > 0) return '#d97706';
    return '#2563eb';
  });
  const pointBorderColors = analyzed.map(e => {
    if (e.violations.some(v => v.type === 'reject')) return '#991b1b';
    if (e.violations.length > 0) return '#92400e';
    return '#1d4ed8';
  });
  const pointRadii = analyzed.map(e => (e.violations.length > 0 ? 6 : 4));

  const lineCount = analyzed.length;
  const makeConstLine = val => Array(lineCount).fill(val);

  if (state.chart) { state.chart.destroy(); state.chart = null; }

  const ctx = $('ljChartCanvas').getContext('2d');

  state.chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: item.item_name,
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'transparent',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointBorderColors,
          pointRadius: pointRadii,
          pointHoverRadius: 8,
          borderWidth: 2,
          tension: 0.1,
          order: 0,
          z: 10
        },
        { label: 'Mean',  data: makeConstLine(mean),       borderColor: '#334155', borderWidth: 1.5, borderDash: [], pointRadius: 0, fill: false, order: 1 },
        { label: '+1SD',  data: makeConstLine(mean + sd),  borderColor: '#94a3b8', borderWidth: 1,   borderDash: [4,3], pointRadius: 0, fill: false, order: 2 },
        { label: '-1SD',  data: makeConstLine(mean - sd),  borderColor: '#94a3b8', borderWidth: 1,   borderDash: [4,3], pointRadius: 0, fill: false, order: 2 },
        { label: '+2SD',  data: makeConstLine(mean + 2*sd),borderColor: '#f59e0b', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, fill: false, order: 3 },
        { label: '-2SD',  data: makeConstLine(mean - 2*sd),borderColor: '#f59e0b', borderWidth: 1.5, borderDash: [6,3], pointRadius: 0, fill: false, order: 3 },
        { label: '+3SD',  data: makeConstLine(mean + 3*sd),borderColor: '#ef4444', borderWidth: 1.5, borderDash: [8,3], pointRadius: 0, fill: false, order: 4 },
        { label: '-3SD',  data: makeConstLine(mean - 3*sd),borderColor: '#ef4444', borderWidth: 1.5, borderDash: [8,3], pointRadius: 0, fill: false, order: 4 }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 24, padding: 12 }
        },
        tooltip: {
          callbacks: {
            afterBody(items) {
              const idx = items[0]?.dataIndex;
              if (idx === undefined) return;
              const e = analyzed[idx];
              if (!e.violations.length) return ['판정: 정상'];
              return ['판정: ' + e.violations.map(v => `${v.code}(${v.type === 'reject' ? '거부' : '경고'})`).join(', ')];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 11 }, maxRotation: 45 },
          grid: { color: '#f1f5f9' }
        },
        y: {
          ticks: { font: { size: 11 } },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────
// 샘플 데이터
// ─────────────────────────────────────────────
async function loadSampleData() {
  const item = getActiveItem();
  if (!item) return;
  if (!confirm('샘플 데이터 20건을 추가하시겠습니까?\n기존 데이터에 덧붙여집니다.')) return;

  const mean = Number(item.mean);
  const sd = Number(item.sd);
  const user = window.auth.getSession();
  const today = new Date();

  try {
    showGlobalLoading('샘플 데이터 저장 중...');
    const randomNormal = () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };

    for (let i = 19; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const value = parseFloat((mean + randomNormal() * sd).toFixed(2));
      const result = await apiPost('ljCreateEntry', {
        item_id: state.activeItemId, date: dateStr, value, memo: '샘플',
        request_user_email: user.email
      });
      if (!state.entries[state.activeItemId]) state.entries[state.activeItemId] = [];
      state.entries[state.activeItemId].push({ ...result.data, date: normalizeDate(result.data.date) });
    }
    state.entries[state.activeItemId].sort((a, b) => a.date.localeCompare(b.date));
    renderDataTable();
    renderStats();
    renderChart();
    showMessage('샘플 데이터 20건이 추가되었습니다.', 'success');
  } catch (e) {
    showMessage(e.message || '샘플 데이터 저장에 실패했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

// ─────────────────────────────────────────────
// CSV 내보내기
// ─────────────────────────────────────────────
function exportCsv() {
  const item = getActiveItem();
  const entries = state.entries[state.activeItemId] || [];
  if (entries.length === 0) return;

  const analyzed = analyzeEntries(entries, Number(item.mean), Number(item.sd));
  const header = ['측정일', '측정값', 'SDI', 'Westgard 판정', '메모'];
  const rows = analyzed.map(e => [
    e.date,
    e.value,
    e.sdi.toFixed(3),
    e.violations.length ? e.violations.map(v => v.code).join(' / ') : '정상',
    e.memo || ''
  ]);

  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `LJ_${item.item_name}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────
// 엑셀 내보내기 (SheetJS)
// ─────────────────────────────────────────────
function exportExcel() {
  const item = getActiveItem();
  const entries = state.entries[state.activeItemId] || [];
  if (entries.length === 0) { showMessage('데이터가 없습니다.', 'error'); return; }
  if (typeof XLSX === 'undefined') { showMessage('라이브러리 로딩 중입니다. 잠시 후 다시 시도해 주세요.', 'error'); return; }

  const mean = Number(item.mean);
  const sd   = Number(item.sd);
  const analyzed = analyzeEntries(entries, mean, sd);
  const today = new Date().toISOString().slice(0, 10);

  // ── 시트1: 통계 요약 ──
  const values = entries.map(e => Number(e.value));
  const n = values.length;
  const actualMean = values.reduce((s, v) => s + v, 0) / n;
  const actualSD   = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - actualMean, 2), 0) / n);
  const cv = (actualSD / actualMean) * 100;
  const warnCount   = analyzed.filter(r => r.violations.length > 0 && !r.violations.some(v => v.type === 'reject')).length;
  const rejectCount = analyzed.filter(r => r.violations.some(v => v.type === 'reject')).length;

  const summaryData = [
    ['L-J 정도관리 차트 — 통계 요약'],
    [],
    ['검사 항목', item.item_name],
    ['단위',     item.unit],
    ['출력일',   today],
    [],
    ['항목',       '값'],
    ['목표 평균',  mean],
    ['표준편차',   sd],
    ['+2SD 상한',  mean + 2 * sd],
    ['-2SD 하한',  mean - 2 * sd],
    [],
    ['데이터 수',  n],
    ['실측 평균',  parseFloat(actualMean.toFixed(2))],
    ['실측 SD',    parseFloat(actualSD.toFixed(2))],
    ['%CV',        parseFloat(cv.toFixed(1))],
    ['경고 건수',  warnCount],
    ['거부 건수',  rejectCount],
  ];

  // ── 시트2: QC 데이터 ──
  const dataRows = [
    ['측정일', '측정값', `단위(${item.unit})`, 'SDI', 'Westgard 판정', '메모'],
    ...analyzed.map(e => [
      e.date,
      Number(e.value),
      item.unit,
      parseFloat(e.sdi.toFixed(3)),
      e.violations.length ? e.violations.map(v => v.code).join(' / ') : '정상',
      e.memo || ''
    ])
  ];

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  const wsData    = XLSX.utils.aoa_to_sheet(dataRows);

  // 열 너비
  wsSummary['!cols'] = [{ wch: 16 }, { wch: 20 }];
  wsData['!cols']    = [{ wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 20 }];

  XLSX.utils.book_append_sheet(wb, wsSummary, '통계 요약');
  XLSX.utils.book_append_sheet(wb, wsData,    'QC 데이터');

  XLSX.writeFile(wb, `LJ_${item.item_name}_${today}.xlsx`);
}

// ─────────────────────────────────────────────
// PDF 내보내기 — HTML 결과지 캡처 방식 (한글 완벽 지원)
// ─────────────────────────────────────────────
async function exportPdf() {
  const item = getActiveItem();
  const entries = state.entries[state.activeItemId] || [];
  if (entries.length === 0) { showMessage('데이터가 없습니다.', 'error'); return; }
  if (typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined') {
    showMessage('라이브러리 로딩 중입니다. 잠시 후 다시 시도해 주세요.', 'error'); return;
  }

  const { jsPDF } = window.jspdf;
  const mean = Number(item.mean);
  const sd   = Number(item.sd);
  const analyzed = analyzeEntries(entries, mean, sd);
  const today = new Date().toISOString().slice(0, 10);
  const values = entries.map(e => Number(e.value));
  const n = values.length;
  const actualMean = values.reduce((s, v) => s + v, 0) / n;
  const actualSD   = Math.sqrt(values.reduce((s, v) => s + Math.pow(v - actualMean, 2), 0) / n);
  const cv = (actualSD / actualMean) * 100;
  const warnCount   = analyzed.filter(r => r.violations.length > 0 && !r.violations.some(v => v.type === 'reject')).length;
  const rejectCount = analyzed.filter(r => r.violations.some(v => v.type === 'reject')).length;

  // 차트 이미지 캡처 (DOM canvas → dataURL)
  const chartImgData = $('ljChartCanvas')
    ? $('ljChartCanvas').toDataURL('image/png', 1.0)
    : null;

  try {
    showGlobalLoading('PDF 생성 중...');

    // ── 결과지 HTML 동적 생성 ──
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      'width:794px',   // A4 96dpi 기준
      'background:#fff',
      'font-family:Pretendard,"Noto Sans KR","Malgun Gothic",sans-serif',
      'color:#0f172a', 'font-size:13px', 'line-height:1.5'
    ].join(';');

    const statRows = [
      { label: '목표 평균 (Mean)', value: `${mean.toFixed(2)} ${item.unit}` },
      { label: '표준편차 (SD)',    value: `${sd.toFixed(2)} ${item.unit}` },
      { label: '+2SD 상한',        value: `${(mean + 2*sd).toFixed(2)} ${item.unit}` },
      { label: '-2SD 하한',        value: `${(mean - 2*sd).toFixed(2)} ${item.unit}` },
      { label: '데이터 수',        value: `${n}건` },
      { label: '실측 평균',        value: `${actualMean.toFixed(2)} ${item.unit}` },
      { label: '실측 SD',          value: `${actualSD.toFixed(2)} ${item.unit}` },
      { label: '%CV',              value: `${cv.toFixed(1)}%` },
      { label: '경고 건수',        value: `${warnCount}건`, warn: warnCount > 0 },
      { label: '거부 건수',        value: `${rejectCount}건`, danger: rejectCount > 0 },
    ];

    const dataRowsHtml = analyzed.map((e, i) => {
      const hasReject = e.violations.some(v => v.type === 'reject');
      const hasWarn   = e.violations.length > 0 && !hasReject;
      const bg = hasReject ? '#fef2f2' : hasWarn ? '#fffbeb' : (i % 2 === 0 ? '#fff' : '#f8fafc');
      const sdiColor = Math.abs(e.sdi) >= 3 ? '#b42318' : Math.abs(e.sdi) >= 2 ? '#c2410c' : '#15803d';
      const judgment = e.violations.length
        ? e.violations.map(v => `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:700;background:${v.type==='reject'?'#fee2e2':'#fef9c3'};color:${v.type==='reject'?'#b91c1c':'#a16207'};border:1px solid ${v.type==='reject'?'#fca5a5':'#fde047'};">${escHtml(v.code)}</span>`).join(' ')
        : '<span style="color:#94a3b8;">정상</span>';
      return `<tr style="background:${bg};">
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-family:monospace;font-size:12px;color:#475569;">${escHtml(e.date)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-weight:700;">${Number(e.value).toFixed(2)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;font-family:monospace;font-weight:700;color:${sdiColor};">${e.sdi.toFixed(2)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:center;">${judgment}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#64748b;">${escHtml(e.memo || '')}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div style="padding:32px 36px;">

        <!-- 헤더 -->
        <div style="background:#2563eb;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;">
          <div>
            <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.7);letter-spacing:.08em;margin-bottom:4px;">L-J LEVEY-JENNINGS QC REPORT</div>
            <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.02em;">${escHtml(item.item_name)}</div>
          </div>
          <div style="text-align:right;color:rgba(255,255,255,.85);font-size:13px;line-height:1.7;">
            <div>단위: <strong>${escHtml(item.unit)}</strong></div>
            <div>출력일: <strong>${today}</strong></div>
            ${item.memo ? `<div style="font-size:12px;margin-top:2px;">${escHtml(item.memo)}</div>` : ''}
          </div>
        </div>

        <!-- 통계 요약 -->
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;font-weight:800;color:#1d4ed8;letter-spacing:.08em;margin-bottom:10px;padding-left:10px;border-left:3px solid #2563eb;">통계 요약</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
            ${statRows.map(r => `
              <div style="background:#f8fafc;border:1.5px solid #d0d8e8;border-radius:10px;padding:10px 12px;">
                <div style="font-size:10px;font-weight:700;color:#6b7a90;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px;">${escHtml(r.label)}</div>
                <div style="font-size:17px;font-weight:900;color:${r.danger?'#b42318':r.warn?'#c2410c':'#0b1f44'};letter-spacing:-0.02em;">${escHtml(r.value)}</div>
              </div>`).join('')}
          </div>
        </div>

        <!-- 차트 -->
        ${chartImgData ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:11px;font-weight:800;color:#1d4ed8;letter-spacing:.08em;margin-bottom:10px;padding-left:10px;border-left:3px solid #2563eb;">L-J 차트</div>
          <div style="border:1.5px solid #d0d8e8;border-radius:12px;padding:12px;background:#fff;">
            <img src="${chartImgData}" style="width:100%;height:auto;display:block;" />
          </div>
        </div>` : ''}

        <!-- QC 데이터 테이블 -->
        <div>
          <div style="font-size:11px;font-weight:800;color:#1d4ed8;letter-spacing:.08em;margin-bottom:10px;padding-left:10px;border-left:3px solid #2563eb;">QC 데이터 (${n}건)</div>
          <table style="width:100%;border-collapse:collapse;border:1.5px solid #d0d8e8;border-radius:10px;overflow:hidden;">
            <thead>
              <tr style="background:#f7f9fd;">
                <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:800;color:#3d5068;letter-spacing:.04em;text-transform:uppercase;border-bottom:1.5px solid #e0e7f2;">측정일</th>
                <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:800;color:#3d5068;letter-spacing:.04em;text-transform:uppercase;border-bottom:1.5px solid #e0e7f2;">측정값</th>
                <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:800;color:#3d5068;letter-spacing:.04em;text-transform:uppercase;border-bottom:1.5px solid #e0e7f2;">SDI</th>
                <th style="padding:9px 10px;text-align:center;font-size:10px;font-weight:800;color:#3d5068;letter-spacing:.04em;text-transform:uppercase;border-bottom:1.5px solid #e0e7f2;">Westgard 판정</th>
                <th style="padding:9px 10px;text-align:left;font-size:10px;font-weight:800;color:#3d5068;letter-spacing:.04em;text-transform:uppercase;border-bottom:1.5px solid #e0e7f2;">메모</th>
              </tr>
            </thead>
            <tbody>${dataRowsHtml}</tbody>
          </table>
        </div>

        <!-- 푸터 -->
        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e0e7f2;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;color:#94a3b8;">MSO관리팀 업무지원 시스템 · L-J 정도관리 차트</span>
          <span style="font-size:11px;color:#94a3b8;">${today}</span>
        </div>
      </div>
    `;

    document.body.appendChild(wrap);

    // html2canvas 캡처
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false
    });

    document.body.removeChild(wrap);

    // jsPDF에 이미지로 삽입
    const imgData = canvas.toDataURL('image/png');
    const pdfW = 210; // A4 mm
    const pdfH = (canvas.height / canvas.width) * pdfW;

    const doc = new jsPDF({
      orientation: pdfH > 297 ? 'portrait' : 'portrait',
      unit: 'mm',
      format: pdfH > 297 ? [pdfW, pdfH] : 'a4'
    });

    doc.addImage(imgData, 'PNG', 0, 0, pdfW, Math.min(pdfH, 297));

    // 내용이 A4 한 장을 넘으면 페이지 분할
    if (pdfH > 297) {
      let remainH = pdfH - 297;
      let pageTop = 297;
      while (remainH > 0) {
        doc.addPage();
        doc.addImage(imgData, 'PNG', 0, -pageTop, pdfW, pdfH);
        pageTop += 297;
        remainH -= 297;
      }
    }

    doc.save(`LJ_${item.item_name}_${today}.pdf`);
    showMessage('PDF가 저장되었습니다.', 'success');
  } catch (e) {
    showMessage('PDF 생성 중 오류가 발생했습니다: ' + e.message, 'error');
  } finally {
    hideGlobalLoading();
  }
}





function showMessage(text, type = 'error') {
  const box = $('messageBox');
  if (!box) return;
  box.textContent = text;
  box.className = 'message-box is-' + type;
  box.style.display = '';
  setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function escHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// 날짜 정규화 — GAS에서 Date 객체가 문자열로 직렬화된 경우 yyyy-MM-dd로 변환
function normalizeDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  // 이미 yyyy-MM-dd 형식이면 그대로
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // 그 외 Date 문자열 파싱
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

window.deleteEntry = deleteEntry;
