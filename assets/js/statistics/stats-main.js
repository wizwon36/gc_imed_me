/**
 * stats-main.js
 * 구매·사용 통계 앱 진입점
 */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  try {
    showGlobalLoading('통계 앱 초기화 중...');

    // 로그인 체크
    const user = window.auth?.getSession?.();
    if (!user) { location.replace(`${CONFIG.SITE_BASE_URL}/index.html`); return; }

    // 로그아웃
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      window.auth?.logout?.();
      location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
    });

    // 권한 체크 (statistics: view 이상) — 기존 closing과 동일 패턴
    const ok = await window.appPermission?.requirePermission?.('statistics', ['admin', 'edit', 'view']);
    if (ok === false) {
      document.getElementById('permissionDenied').style.display = '';
      return;
    }

    // 거래처 관리(저장)는 edit 이상만 가능 — StatsApp.canEdit으로 stats-vendor.js에서 참조
    const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
    const editPerm = await window.appPermission?.getPermission?.('statistics');
    window.StatsApp = window.StatsApp || {};
    StatsApp.canEdit = isAdmin || ['admin', 'edit'].includes(editPerm);

    document.getElementById('appBody').style.display = '';

    // 연도 선택 옵션 생성: 2016 ~ 올해
    const yearSelect = document.getElementById('statsYear');
    if (yearSelect) {
      const curYear = new Date().getFullYear();
      let opts = '';
      for (let y = curYear; y >= 2016; y--) {
        opts += `<option value="${y}">${y}년</option>`;
      }
      yearSelect.innerHTML = opts;
    }

    // 의원 드롭다운 기본값: 본인 소속 의원 (업로드/조회 탭 둘 다)
    ['statsBranch', 'statDashBranch'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel && user.clinic_name) {
        const matched = Array.from(sel.options).find(o => user.clinic_name.includes(o.value));
        if (matched) sel.value = matched.value;
      }
    });

    // 통계 조회 기본 기간: 지난달
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
    const ymFromEl = document.getElementById('statDashYmFrom');
    const ymToEl   = document.getElementById('statDashYmTo');
    if (ymFromEl) ymFromEl.value = lastMonthStr;
    if (ymToEl)   ymToEl.value   = lastMonthStr;

    // 업로드 현황 최초 로드
    await loadUploadStatus();

    // 거래처 필터(자동완성)용으로 거래처 마스터 미리 로드
    await loadVendorsFromServer();
    populateVendorDatalist();

    // 통계 조회 탭이 기본 활성 탭이므로, 지난달 기준으로 최초 조회 자동 실행
    await runStatsDashboard();

  } catch (error) {
    console.error(error);
    showMessage?.(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});

// ── 탭 전환 ────────────────────────────────────────────────
function switchStatsTab(tab) {
  const tabs = ['upload', 'dashboard', 'vendor'];
  tabs.forEach(t => {
    document.getElementById(`tab${capitalize(t)}`)?.classList.toggle('active', t === tab);
    document.getElementById(`tab${capitalize(t)}Content`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'vendor') {
    ensureVendorTabLoaded();
  }
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── 업로드 현황 조회/렌더링 ────────────────────────────────
const ALL_MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

async function loadUploadStatus() {
  const branch = document.getElementById('statsBranch').value;
  const year = document.getElementById('statsYear').value;
  const area = document.getElementById('uploadStatusArea');
  area.innerHTML = '<p style="color:#6b7280;font-size:12px;">불러오는 중...</p>';

  try {
    const status = await window.statsClient.getUploadStatus(branch);
    const yearStatus = status.find(s => s.year === year);

    if (!yearStatus || (!yearStatus.purchaseMonths.length && !yearStatus.usageMonths.length)) {
      area.innerHTML = `<p style="color:#9ca3af;font-size:12px;">${year}년에 업로드된 데이터가 없습니다.</p>`;
      return;
    }

    const renderMonths = (months, allLabel) => {
      if (!months.length) return '<span style="color:#d1d5db;">없음</span>';
      if (months.length === 12) return `<span style="color:#059669;font-weight:600;">${allLabel} (1~12월 전체)</span>`;
      const last = months[months.length - 1];
      return `<span style="color:#1a56db;">${months.length}개월 (~${last}월)</span>`;
    };

    area.innerHTML = `
      <table style="width:100%;border-collapse:collapse;">
        <tbody>
          <tr>
            <td style="padding:6px 10px;font-size:12px;font-weight:600;border-bottom:1px solid #f1f5f9;">${year}년</td>
            <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f1f5f9;">입고: ${renderMonths(yearStatus.purchaseMonths, '완료')}</td>
            <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f1f5f9;">사용현황: ${renderMonths(yearStatus.usageMonths, '완료')}</td>
          </tr>
        </tbody>
      </table>`;
  } catch (error) {
    console.error(error);
    area.innerHTML = `<p style="color:#dc2626;font-size:12px;">오류: ${error.message}</p>`;
  }
}

// ── 거래처 필터 자동완성 목록 채우기 ──────────────────────────
function populateVendorDatalist() {
  const list = document.getElementById('statDashVendorList');
  if (!list) return;
  const names = (StatsApp.vendors || []).map(v => v.vendor_name).filter(Boolean);
  list.innerHTML = names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');
}

// ── 통계 조회: 서브탭 전환 ─────────────────────────────────
let currentSubtab = 'vendor';
function switchStatsSubtab(subtab) {
  currentSubtab = subtab;
  ['vendor', 'dept', 'item', 'trend'].forEach(t => {
    document.getElementById(`subtab${capitalize(t)}`)?.classList.toggle('active', t === subtab);
  });

  // 거래처별 탭일 때만 거래처 필터, 부서별 탭일 때만 부서 필터 노출
  const vendorField = document.getElementById('statDashVendorField');
  const deptField    = document.getElementById('statDashDeptField');
  if (vendorField) vendorField.style.display = subtab === 'vendor' ? '' : 'none';
  if (deptField)    deptField.style.display    = subtab === 'dept'   ? '' : 'none';

  runStatsDashboard();
}

// ── 통계 조회: 실행 ────────────────────────────────────────
async function runStatsDashboard() {
  const resultArea = document.getElementById('statsResultArea');
  const summaryGrid = document.getElementById('statsSummaryGrid');
  const branch = document.getElementById('statDashBranch').value;
  const ymFrom = document.getElementById('statDashYmFrom').value;
  const ymTo   = document.getElementById('statDashYmTo').value;

  // 거래처별 탭: 거래처명 입력값을 사업자번호로 변환해서 정확히 필터링
  let vendorBizNo = null;
  const vendorInputVal = document.getElementById('statDashVendor')?.value?.trim();
  if (currentSubtab === 'vendor' && vendorInputVal) {
    const matched = (StatsApp.vendors || []).find(v => v.vendor_name === vendorInputVal);
    vendorBizNo = matched ? matched.biz_no : null;
  }
  const deptVal = currentSubtab === 'dept' ? document.getElementById('statDashDept')?.value?.trim() : null;

  const filters = {
    branch, ymFrom: ymFrom || null, ymTo: ymTo || null,
    vendorBizNo: vendorBizNo || null,
    dept: deptVal || null,
  };

  resultArea.innerHTML = '<div class="stat-loading-row"><span class="stat-mini-spinner"></span>조회 중...</div>';
  summaryGrid.innerHTML = '';

  const startedAt = Date.now();
  const MIN_LOADING_MS = 300;

  try {
    let renderFn;

    if (currentSubtab === 'vendor') {
      const { data, summary } = await window.statsClient.getVendorStats(filters);
      renderFn = () => {
        renderSummaryCards(summaryGrid, summary, '거래처', '구매');
        renderStatsTable(resultArea, data, 'total_amount', [
          { key: 'vendor_name',   label: '거래처' },
          { key: 'supply_amount', label: '공급가액', numeric: true },
          { key: 'vat_amount',    label: '부가세',   numeric: true },
          { key: 'total_amount',  label: '합계금액', numeric: true, withBar: true },
          { key: 'record_count',  label: '건수',     numeric: true },
        ]);
      };
    } else if (currentSubtab === 'dept') {
      const { data, summary } = await window.statsClient.getDeptStats(filters);
      renderFn = () => {
        renderSummaryCards(summaryGrid, summary, '부서', '사용');
        renderStatsTable(resultArea, data, 'usage_total', [
          { key: 'dept',          label: '부서' },
          { key: 'usage_supply',  label: '사용공급가', numeric: true },
          { key: 'usage_vat',     label: '사용부가세', numeric: true },
          { key: 'usage_total',   label: '사용합계',   numeric: true, withBar: true },
          { key: 'record_count',  label: '건수',       numeric: true },
        ]);
      };
    } else {
      renderFn = () => {
        resultArea.innerHTML = '<p style="color:#9ca3af;font-size:13px;">🚧 준비 중인 기능입니다.</p>';
      };
    }

    // 최소 로딩 표시 시간 보장 (너무 빠르면 스피너가 깜빡임처럼 느껴짐)
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_LOADING_MS) {
      await new Promise(r => setTimeout(r, MIN_LOADING_MS - elapsed));
    }
    renderFn();
  } catch (error) {
    console.error(error);
    resultArea.innerHTML = `<p style="color:#dc2626;font-size:13px;">오류: ${error.message}</p>`;
  }
}

// ── 결과 표 렌더링 (공통) ──────────────────────────────────
// ── 요약 카드 렌더링 ───────────────────────────────────────
function renderSummaryCards(container, summary, groupLabel, amountLabel) {
  const fmtNum = v => Number(v || 0).toLocaleString('ko-KR');

  container.innerHTML = `
    <div class="stat-summary-card">
      <div class="stat-summary-label">총 ${amountLabel}액</div>
      <div class="stat-summary-value">${fmtNum(summary.total)}원</div>
    </div>
    <div class="stat-summary-card">
      <div class="stat-summary-label">${groupLabel} 수</div>
      <div class="stat-summary-value">${fmtNum(summary.groupCount)}개</div>
      <div class="stat-summary-sub">총 ${fmtNum(summary.totalRecords)}건</div>
    </div>
    <div class="stat-summary-card">
      <div class="stat-summary-label">${groupLabel}당 평균</div>
      <div class="stat-summary-value">${fmtNum(Math.round(summary.avgPerGroup))}원</div>
    </div>
    <div class="stat-summary-card">
      <div class="stat-summary-label">최다 ${groupLabel}</div>
      <div class="stat-summary-value small">${summary.topName || '-'}</div>
      <div class="stat-summary-sub">${fmtNum(summary.topAmount)}원</div>
    </div>
  `;
}

// ── 결과 표 렌더링: 순위 배지 + 점유율 바 포함 ────────────────
function renderStatsTable(container, rows, barKey, columns) {
  if (!rows.length) {
    container.innerHTML = '<p style="color:#6b7280;font-size:13px;">조회 결과가 없습니다.</p>';
    return;
  }

  const fmtNum = v => Number(v || 0).toLocaleString('ko-KR');
  const maxVal = Math.max(...rows.map(r => Number(r[barKey]) || 0), 1);
  const rankClass = i => i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : '';

  const thead = columns.map(c =>
    `<th class="${c.numeric ? 'num' : ''}">${c.label}</th>`
  ).join('');

  const tbody = rows.map((row, i) => {
    const cells = columns.map(c => {
      if (c.key === columns[0].key) {
        // 첫 번째(이름) 컬럼: 순위 배지 + 이름 + (미등록 거래처는 경고 표시)
        const unmatchedBadge = row.unmatched
          ? ` <span title="거래처 마스터에 등록되지 않음" style="color:#d97706;font-size:11px;">⚠ 미등록</span>`
          : '';
        const nameCell = `
          <span class="stat-name-cell">
            <span class="stat-rank-badge ${rankClass(i)}">${i + 1}</span>
            ${row[c.key] || '-'}${unmatchedBadge}
          </span>`;
        return `<td>${nameCell}</td>`;
      }
      if (c.withBar) {
        const val = Number(row[c.key]) || 0;
        const pct = (val / maxVal) * 100;
        return `<td class="num">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
            <span class="stat-bar-track" style="flex:1;max-width:90px;">
              <span class="stat-bar-fill" style="width:${pct}%;"></span>
            </span>
            <span>${fmtNum(val)}</span>
          </div>
        </td>`;
      }
      const val = c.numeric ? fmtNum(row[c.key]) : (row[c.key] || '-');
      return `<td class="${c.numeric ? 'num' : ''}">${val}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="stat-table">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <p style="color:#9ca3af;font-size:11px;margin-top:10px;">총 ${rows.length}건</p>
  `;
}
// ── 로그 출력 (closing 모듈의 clog와 동일한 패턴) ─────────────
function statsLog(msg, cls = 'info') {
  const box = document.getElementById('statsUploadResult');
  if (!box) return;
  const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  box.innerHTML += `<div class="cl-log-line ${cls}"><span class="cl-log-time">[${t}]</span>${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}

// ── 파일 업로드 (드래그&드롭) ──────────────────────────────
window.StatsApp = window.StatsApp || {};
StatsApp.purchaseRaw = null;
StatsApp.usageRaw = null;

function statsDragOver(e, id) { e.preventDefault(); document.getElementById(id).classList.add('dragover'); }
function statsDragLeave(id)   { document.getElementById(id).classList.remove('dragover'); }
function statsDropFile(e, type) {
  e.preventDefault();
  document.getElementById('zone-' + type).classList.remove('dragover');
  if (e.dataTransfer.files[0]) statsProcessFile(e.dataTransfer.files[0], type);
}
function statsHandleFile(input, type) {
  if (input.files[0]) statsProcessFile(input.files[0], type);
}
function statsProcessFile(file, type) {
  StatsApp[type + 'Raw'] = file;
  document.getElementById('zone-' + type).classList.add('uploaded');
  document.getElementById('status-' + type).textContent = '✓ ' + file.name;

  const btn = document.getElementById('btnStatsUpload');
  if (btn) btn.disabled = !(StatsApp.purchaseRaw || StatsApp.usageRaw);
}

// ── 업로드 실행 ────────────────────────────────────────────
async function handleStatsUpload() {
  const branch = document.getElementById('statsBranch').value;
  const year = document.getElementById('statsYear').value;
  const resultEl = document.getElementById('statsUploadResult');
  const btn = document.getElementById('btnStatsUpload');

  resultEl.innerHTML = '';
  statsLog(`업로드 시작 — ${branch} ${year}년`, 'info');

  // 파일 형식(헤더) 검증 — 잘못된 영역에 올렸거나 형식이 다르면 즉시 중단
  try {
    if (StatsApp.purchaseRaw) {
      await window.validateStatsFileHeaders(StatsApp.purchaseRaw, 'purchase');
    }
    if (StatsApp.usageRaw) {
      await window.validateStatsFileHeaders(StatsApp.usageRaw, 'usage');
    }
  } catch (error) {
    statsLog(`⚠ ${error.message.replace(/\n/g, '<br>')}`, 'err');
    return;
  }

  // 이미 데이터가 있는 월과 겹치는지 사전 확인 → 겹치면 확인창
  try {
    const status = await window.statsClient.getUploadStatus(branch);
    const yearStatus = status.find(s => s.year === year);

    if (yearStatus) {
      const overlapMsgs = [];

      if (StatsApp.purchaseRaw && yearStatus.purchaseMonths.length) {
        const targetMonths = await window.peekStatsFileMonths(StatsApp.purchaseRaw, 'purchase', year);
        const overlap = targetMonths.filter(m => yearStatus.purchaseMonths.includes(m));
        if (overlap.length) overlapMsgs.push(`입고: ${overlap.join(', ')}월`);
      }
      if (StatsApp.usageRaw && yearStatus.usageMonths.length) {
        const targetMonths = await window.peekStatsFileMonths(StatsApp.usageRaw, 'usage', year);
        const overlap = targetMonths.filter(m => yearStatus.usageMonths.includes(m));
        if (overlap.length) overlapMsgs.push(`사용현황: ${overlap.join(', ')}월`);
      }

      if (overlapMsgs.length) {
        const msg = `${branch} ${year}년의 다음 데이터가 이미 존재하며, 새 파일로 덮어쓰게 됩니다.\n\n` +
          overlapMsgs.join('\n') +
          `\n\n계속하시겠습니까?`;
        if (!confirm(msg)) {
          statsLog('사용자가 업로드를 취소했습니다.', 'warn');
          return;
        }
        statsLog(`겹치는 월 확인됨 (${overlapMsgs.join(' / ')}) — 덮어쓰기로 진행`, 'warn');
      }
    }
  } catch (e) {
    console.warn('업로드 현황 사전 확인 실패, 진행을 계속합니다.', e);
  }

  // 진행 단계 가중치 계산: 선택된 파일 수에 따라 50/50 또는 100%
  const fileKinds = [];
  if (StatsApp.purchaseRaw) fileKinds.push({ kind: 'purchase', file: StatsApp.purchaseRaw, label: '입고' });
  if (StatsApp.usageRaw)    fileKinds.push({ kind: 'usage',    file: StatsApp.usageRaw,    label: '사용현황' });

  const progressBox   = document.getElementById('statsProgressBox');
  const progressLabel = document.getElementById('statsProgressLabel');
  const progressPct   = document.getElementById('statsProgressPct');
  const progressFill  = document.getElementById('statsProgressFill');

  const setProgress = (pct, label) => {
    progressFill.style.width = `${pct}%`;
    progressPct.textContent = `${Math.round(pct)}%`;
    if (label) progressLabel.textContent = label;
  };

  progressBox.style.display = '';
  setProgress(0, '준비 중...');
  btn.disabled = true;

  try {
    for (let fi = 0; fi < fileKinds.length; fi++) {
      const { kind, file, label } = fileKinds[fi];
      const baseProgress = (fi / fileKinds.length) * 100;
      const fileWeight = 100 / fileKinds.length;

      statsLog(`${label} 파일 처리 시작: ${file.name}`, 'info');

      const results = await window.uploadStatsFile(file, branch, kind, year, (info) => {
        if (info.phase === 'parsing') {
          setProgress(baseProgress, `${label} 파일 분석 중...`);
        } else if (info.phase === 'uploading') {
          const innerPct = info.total ? (info.current / info.total) : 0;
          setProgress(baseProgress + innerPct * fileWeight,
            `${label} 업로드 중... (${info.current}/${info.total}개월${info.ym ? ', ' + info.ym : ''})`);
        }
      });

      results.forEach(r => statsLog(`${label} ${r.ym}: ${r.count}건 저장`, 'ok'));
    }

    setProgress(100, '완료');
    statsLog('모든 파일 업로드 완료', 'ok');

    // 업로드 완료 후 초기화
    ['purchase', 'usage'].forEach(type => {
      StatsApp[type + 'Raw'] = null;
      document.getElementById('zone-' + type).classList.remove('uploaded');
      document.getElementById('status-' + type).textContent = '';
      const inputEl = document.querySelector(`#zone-${type} input[type=file]`);
      if (inputEl) inputEl.value = '';
    });

    // 업로드 현황 갱신
    await loadUploadStatus();
  } catch (error) {
    console.error(error);
    statsLog(`오류: ${error.message}`, 'err');
  } finally {
    btn.disabled = !(StatsApp.purchaseRaw || StatsApp.usageRaw);
    setTimeout(() => { progressBox.style.display = 'none'; }, 1500);
  }
}
