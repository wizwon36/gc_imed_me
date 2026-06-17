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

// ── 업로드 핸들러 ──────────────────────────────────────────
async function handleStatsUpload(kind) {
  const inputId = kind === 'purchase' ? 'purchaseFileInput' : 'usageFileInput';
  const resultId = kind === 'purchase' ? 'purchaseUploadResult' : 'usageUploadResult';
  const fileInput = document.getElementById(inputId);
  const resultEl = document.getElementById(resultId);
  const branch = document.getElementById('statsBranch').value;

  const file = fileInput.files[0];
  if (!file) {
    resultEl.innerHTML = '<span style="color:#dc2626;">파일을 선택해주세요.</span>';
    return;
  }

  resultEl.innerHTML = '<span style="color:#6b7280;">업로드 중...</span>';

  try {
    const results = await window.uploadStatsFile(file, branch, kind);
    resultEl.innerHTML = results.map(r =>
      `<div style="color:#059669;">✓ ${r.ym}: ${r.count}건 저장</div>`
    ).join('');
    fileInput.value = '';
  } catch (error) {
    console.error(error);
    resultEl.innerHTML = `<span style="color:#dc2626;">오류: ${error.message}</span>`;
  }
}
