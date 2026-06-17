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

    // 업로드 현황 최초 로드
    await loadUploadStatus();

  } catch (error) {
    console.error(error);
    showMessage?.(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});

// ── 탭 전환 ────────────────────────────────────────────────
function switchStatsTab(tab) {
  const tabs = ['upload', 'dashboard'];
  tabs.forEach(t => {
    document.getElementById(`tab${capitalize(t)}`)?.classList.toggle('active', t === tab);
    document.getElementById(`tab${capitalize(t)}Content`)?.classList.toggle('active', t === tab);
  });
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── 업로드 현황 조회/렌더링 ────────────────────────────────
const ALL_MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];

async function loadUploadStatus() {
  const branch = document.getElementById('statsBranch').value;
  const area = document.getElementById('uploadStatusArea');
  area.innerHTML = '<p style="color:#6b7280;font-size:12px;">불러오는 중...</p>';

  try {
    const status = await window.statsClient.getUploadStatus(branch);
    if (!status.length) {
      area.innerHTML = '<p style="color:#9ca3af;font-size:12px;">업로드된 데이터가 없습니다.</p>';
      return;
    }

    const rows = status.slice().reverse().map(s => {
      const renderMonths = (months, allLabel) => {
        if (!months.length) return '<span style="color:#d1d5db;">없음</span>';
        if (months.length === 12) return `<span style="color:#059669;font-weight:600;">${allLabel} (1~12월 전체)</span>`;
        const last = months[months.length - 1];
        return `<span style="color:#1a56db;">${months.length}개월 (~${last}월)</span>`;
      };
      return `
        <tr>
          <td style="padding:6px 10px;font-size:12px;font-weight:600;border-bottom:1px solid #f1f5f9;">${s.year}년</td>
          <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f1f5f9;">입고: ${renderMonths(s.purchaseMonths, '완료')}</td>
          <td style="padding:6px 10px;font-size:12px;border-bottom:1px solid #f1f5f9;">사용현황: ${renderMonths(s.usageMonths, '완료')}</td>
        </tr>`;
    }).join('');

    area.innerHTML = `<table style="width:100%;border-collapse:collapse;"><tbody>${rows}</tbody></table>`;
  } catch (error) {
    console.error(error);
    area.innerHTML = `<p style="color:#dc2626;font-size:12px;">오류: ${error.message}</p>`;
  }
}

// ── 통계 조회: 서브탭 전환 ─────────────────────────────────
let currentSubtab = 'vendor';
function switchStatsSubtab(subtab) {
  currentSubtab = subtab;
  ['vendor', 'dept', 'item', 'trend'].forEach(t => {
    document.getElementById(`subtab${capitalize(t)}`)?.classList.toggle('active', t === subtab);
  });
  runStatsDashboard();
}

// ── 통계 조회: 실행 ────────────────────────────────────────
async function runStatsDashboard() {
  const resultArea = document.getElementById('statsResultArea');
  const branch = document.getElementById('statDashBranch').value;
  const ymFrom = document.getElementById('statDashYmFrom').value;
  const ymTo   = document.getElementById('statDashYmTo').value;

  const filters = { branch, ymFrom: ymFrom || null, ymTo: ymTo || null };

  resultArea.innerHTML = '<p style="color:#6b7280;font-size:13px;">조회 중...</p>';

  try {
    if (currentSubtab === 'vendor') {
      const data = await window.statsClient.getVendorStats(filters);
      renderStatsTable(resultArea, data, [
        { key: 'vendor_name',   label: '거래처' },
        { key: 'supply_amount', label: '공급가액', numeric: true },
        { key: 'vat_amount',    label: '부가세',   numeric: true },
        { key: 'total_amount',  label: '합계금액', numeric: true },
        { key: 'record_count',  label: '건수',     numeric: true },
      ]);
    } else if (currentSubtab === 'dept') {
      const data = await window.statsClient.getDeptStats(filters);
      renderStatsTable(resultArea, data, [
        { key: 'dept',          label: '부서' },
        { key: 'usage_supply',  label: '사용공급가', numeric: true },
        { key: 'usage_vat',     label: '사용부가세', numeric: true },
        { key: 'usage_total',   label: '사용합계',   numeric: true },
        { key: 'record_count',  label: '건수',       numeric: true },
      ]);
    } else {
      resultArea.innerHTML = '<p style="color:#9ca3af;font-size:13px;">🚧 준비 중인 기능입니다.</p>';
    }
  } catch (error) {
    console.error(error);
    resultArea.innerHTML = `<p style="color:#dc2626;font-size:13px;">오류: ${error.message}</p>`;
  }
}

// ── 결과 표 렌더링 (공통) ──────────────────────────────────
function renderStatsTable(container, rows, columns) {
  if (!rows.length) {
    container.innerHTML = '<p style="color:#6b7280;font-size:13px;">조회 결과가 없습니다.</p>';
    return;
  }

  const fmtNum = v => Number(v || 0).toLocaleString('ko-KR');

  const thead = columns.map(c =>
    `<th style="text-align:${c.numeric ? 'right' : 'left'};padding:8px 10px;border-bottom:2px solid #e5e7eb;font-size:12px;color:#374151;">${c.label}</th>`
  ).join('');

  const tbody = rows.map((row, i) => {
    const cells = columns.map(c => {
      const val = c.numeric ? fmtNum(row[c.key]) : row[c.key];
      return `<td style="text-align:${c.numeric ? 'right' : 'left'};padding:7px 10px;font-size:13px;border-bottom:1px solid #f1f5f9;">${val}</td>`;
    }).join('');
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#fafbfc'};">${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <p style="color:#9ca3af;font-size:11px;margin-top:10px;">총 ${rows.length}건</p>
  `;
}
// ── 파일 업로드 (드래그&드롭) ──────────────────────────────
const StatsApp = { purchaseRaw: null, usageRaw: null };

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

  resultEl.innerHTML = '<p style="color:#6b7280;font-size:12px;">업로드 중...</p>';
  btn.disabled = true;

  const lines = [];
  try {
    if (StatsApp.purchaseRaw) {
      const results = await window.uploadStatsFile(StatsApp.purchaseRaw, branch, 'purchase', year);
      results.forEach(r => lines.push(`<div style="color:#059669;font-size:12px;">✓ 입고 ${r.ym}: ${r.count}건 저장</div>`));
    }
    if (StatsApp.usageRaw) {
      const results = await window.uploadStatsFile(StatsApp.usageRaw, branch, 'usage', year);
      results.forEach(r => lines.push(`<div style="color:#059669;font-size:12px;">✓ 사용현황 ${r.ym}: ${r.count}건 저장</div>`));
    }
    resultEl.innerHTML = lines.join('');

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
    resultEl.innerHTML = `<div style="color:#dc2626;font-size:12px;">오류: ${error.message}</div>` + lines.join('');
  } finally {
    btn.disabled = !(StatsApp.purchaseRaw || StatsApp.usageRaw);
  }
}
