document.addEventListener('DOMContentLoaded', async () => {
  const nameEl = document.getElementById('portalUserName');
  const subEl = document.getElementById('portalUserSub');
  const gridEl = document.getElementById('portalAppGrid');
  const emptyEl = document.getElementById('portalEmpty');
  const logoutBtn = document.getElementById('logoutBtn');

  logoutBtn?.addEventListener('click', () => {
    try {
      showGlobalLoading('로그아웃 중...');
    } catch (e) {}
    window.auth.logout();
  });

  const user = window.auth?.getSession?.();
  if (!user) {
    alert('로그인 세션이 만료되었습니다.\n다시 로그인해 주세요.');
    location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
    return;
  }

  if (nameEl) {
    nameEl.textContent = user.name || user.email || '사용자';
  }

  if (subEl) {
    const clinicName = user.clinic_name || '';
    const teamName = user.team_name || '';
    const dept = user.department || ((clinicName && teamName) ? `${clinicName} / ${teamName}` : '소속 없음');
    const role = user.role || 'user';
    subEl.textContent = `${dept} / ${role}`;
  }

  const isAdmin = String(user.role || '').trim().toLowerCase() === 'admin';

  const startedAt = Date.now();

  try {
    showGlobalLoading('앱 목록 불러오는 중...');

    // 단일 진실 소스화(2026-06) — 11개 앱의 이름/설명/아이콘/URL/표시순서를
    // 여기 APP_MAP에 하드코딩하고 있었는데, 같은 정보가 users.html의 정적
    // 라디오 버튼 마크업과 user_app_permissions DB의 CHECK 제약에도 각각
    // 따로 하드코딩되어 있어 앱 하나 추가할 때마다 3곳을 사람이 맞춰
    // 고쳐야 했다. app_registry 테이블(GAS의 getAppRegistry API)을 단일
    // 진실 소스로 두고 동적으로 가져온다 — 이제 앱 추가는 그 테이블에
    // 행 하나 넣는 것으로 끝나고, 이 파일은 손댈 필요가 없다.
    const [registryResult, permissionResult] = await Promise.all([
      apiGet('getAppRegistry', { request_user_email: user.email }),
      apiGet('getUserPermissions', { user_email: user.email, request_user_email: user.email })
    ]);

    const appList = Array.isArray(registryResult.data) ? registryResult.data : [];
    const APP_MAP = {};
    appList.forEach(app => { APP_MAP[app.app_id] = app; });
    // app_registry는 이미 sort_order로 정렬되어 내려오므로 그 순서를 그대로 표시 순서로 사용
    const APP_ORDER = appList.map(app => app.app_id);

    const permissions = Array.isArray(permissionResult.data) ? [...permissionResult.data] : [];

    // 관리자 전용 앱 자동 추가 (admin_auto_grant=true인 앱은 admin 역할이면 항상 접근 가능)
    if (isAdmin) {
      appList
        .filter(app => app.admin_auto_grant)
        .forEach(app => {
          if (!permissions.some(item => item.app_id === app.app_id)) {
            permissions.push({ app_id: app.app_id, permission: 'admin', active: 'Y' });
          }
        });
    }

    // support / support_admin 은 권한 기반으로만 노출 (강제 노출 제거)

    const visiblePermissions = permissions
      .filter(item => {
        if (!item || !item.app_id) return false;
        if (String(item.active || 'Y').trim().toUpperCase() !== 'Y') return false;
        return !!APP_MAP[item.app_id];
      })
      .sort((a, b) => APP_ORDER.indexOf(a.app_id) - APP_ORDER.indexOf(b.app_id));

    if (!visiblePermissions.length) {
      if (gridEl) gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      await delayUntilMinimum(startedAt, 400);
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    if (gridEl) {
      gridEl.innerHTML = visiblePermissions.map(item => {
        const app = APP_MAP[item.app_id];
        const permissionLabel =
          item.permission === 'admin' ? '관리자' :
          item.permission === 'manager' ? '팀장'   :
          item.permission === 'edit'  ? '편집'   :
          item.permission === 'view'  ? '조회'   :
          (item.permission || '');

        return `
          <a class="portal-app-card" href="${CONFIG.SITE_BASE_URL}${app.app_url}">
            <div class="portal-app-icon">${escapeHtml(app.app_icon)}</div>
            <div class="portal-app-body">
              <div class="portal-app-title-row">
                <strong class="portal-app-title">${escapeHtml(app.app_name)}</strong>
                <span class="portal-app-badge">${escapeHtml(permissionLabel)}</span>
              </div>
              <div class="portal-app-desc">${escapeHtml(app.app_desc)}</div>
            </div>
          </a>
        `;
      }).join('');
    }

    await delayUntilMinimum(startedAt, 400);
  } catch (error) {
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="portal-error-box">
          ${escapeHtml(error.message || '앱 목록을 불러오지 못했습니다.')}
        </div>
      `;
    }
  } finally {
    try {
      hideGlobalLoading();
    } catch (e) {}
  }
});

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function delayUntilMinimum(startedAt, minimumMs) {
  const elapsed = Date.now() - startedAt;
  const remain = Math.max(0, minimumMs - elapsed);
  if (remain > 0) {
    await delay(remain);
  }
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    try {
      hideGlobalLoading();
    } catch (e) {}
  }
});
