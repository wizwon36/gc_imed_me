document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  const nameEl = document.getElementById('portalUserName');
  const subEl = document.getElementById('portalUserSub');
  const logoutBtn = document.getElementById('logoutBtn');
  const gridEl = document.getElementById('portalAppGrid');
  const emptyEl = document.getElementById('portalEmpty');

  if (nameEl) {
    nameEl.textContent = user.name || user.email || '사용자';
  }

  if (subEl) {
    subEl.textContent = `${user.department || '부서 없음'} / ${user.role || 'user'}`;
  }

  logoutBtn?.addEventListener('click', () => {
    window.auth.logout();
  });

  const APP_MAP = {
    equipment: {
      title: '의료장비 관리 시스템',
      desc: '장비 등록, 조회, 이력 관리',
      url: `${CONFIG.SITE_BASE_URL}/equipment-dashboard.html`,
      badgeClass: 'is-equipment'
    },
    logs: {
      title: '시스템 로그',
      desc: '수정 이력 및 로그 확인',
      url: `${CONFIG.SITE_BASE_URL}/admin-logs.html`,
      badgeClass: 'is-admin'
    },
    users_admin: {
      title: '사용자 관리',
      desc: '사용자 및 권한 관리',
      url: `${CONFIG.SITE_BASE_URL}/admin-users.html`,
      badgeClass: 'is-admin'
    }
  };

  try {
    const result = await apiGet('getUserPermissions', { user_email: user.email });
    const permissions = Array.isArray(result.data) ? result.data : [];

    if (!permissions.length) {
      if (gridEl) gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    const cards = permissions
      .map(item => {
        const app = APP_MAP[item.app_id];
        if (!app) return '';

        const permissionText = escapeHtml(item.permission || '');
        const badgeLabel = getPermissionLabel(item.permission);

        return `
          <a class="portal-app-card" href="${app.url}">
            <div class="portal-app-card__header">
              <h3 class="portal-app-card__title">${escapeHtml(app.title)}</h3>
              <span class="portal-app-card__badge ${app.badgeClass}">
                ${badgeLabel}
              </span>
            </div>
            <p class="portal-app-card__desc">${escapeHtml(app.desc)}</p>
            <div class="portal-app-card__meta">권한: ${permissionText}</div>
          </a>
        `;
      })
      .filter(Boolean)
      .join('');

    if (gridEl) {
      gridEl.innerHTML = cards;
    }

    if (emptyEl) {
      emptyEl.style.display = cards ? 'none' : 'block';
    }
  } catch (error) {
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="empty-state">
          ${escapeHtml(error.message || '앱 정보를 불러오지 못했습니다.')}
        </div>
      `;
    }
    if (emptyEl) {
      emptyEl.style.display = 'none';
    }
  }
});

function getPermissionLabel(permission) {
  const map = {
    view: '조회',
    edit: '수정',
    admin: '관리자'
  };
  return map[permission] || permission || '-';
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
