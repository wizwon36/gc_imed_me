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

    // 의원 드롭다운 기본값: 본인 소속 의원
    const branchSelect = document.getElementById('statsBranch');
    if (branchSelect && user.clinic_name) {
      const matched = Array.from(branchSelect.options).find(o => user.clinic_name.includes(o.value));
      if (matched) branchSelect.value = matched.value;
    }

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
    const content = document.getElementById(`tab${capitalize(t)}Content`);
    if (content) content.style.display = t === tab ? '' : 'none';
  });
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

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
  const resultEl = document.getElementById('statsUploadResult');
  const btn = document.getElementById('btnStatsUpload');

  resultEl.innerHTML = '<p style="color:#6b7280;font-size:12px;">업로드 중...</p>';
  btn.disabled = true;

  const lines = [];
  try {
    if (StatsApp.purchaseRaw) {
      const results = await window.uploadStatsFile(StatsApp.purchaseRaw, branch, 'purchase');
      results.forEach(r => lines.push(`<div style="color:#059669;font-size:12px;">✓ 입고 ${r.ym}: ${r.count}건 저장</div>`));
    }
    if (StatsApp.usageRaw) {
      const results = await window.uploadStatsFile(StatsApp.usageRaw, branch, 'usage');
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
  } catch (error) {
    console.error(error);
    resultEl.innerHTML = `<div style="color:#dc2626;font-size:12px;">오류: ${error.message}</div>` + lines.join('');
  } finally {
    btn.disabled = !(StatsApp.purchaseRaw || StatsApp.usageRaw);
  }
}
