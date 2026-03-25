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
      icon: '🩺',
      url: `${CONFIG.SITE_BASE_URL}/pages/equipment/dashboard.html`
    },
    logs: {
      title: '시스템 로그',
      desc: '수정 이력 및 로그 확인',
      icon: '🧾',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/logs.html`
    },
    users_admin: {
      title: '사용자 관리',
      desc: '사용자 및 권한 관리',
      icon: '👤',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/users.html`
    }
  };

  try {
    const result = await apiGet('getUserPermissions', {
      user_email: user.email
    });

    const permissions = Array.isArray(result.data) ? result.data : [];

    if (!permissions.length) {
      if (gridEl) gridEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    const cards = permissions
      .map(p => {
        const app = APP_MAP[p.app_id];
        if (!app) return '';

        return `
          <a class="portal-app-card" href="${app.url}">
            <div class="portal-app-icon" aria-hidden="true">${app.icon}</div>
            <div>
              <h3 class="portal-app-title">${app.title}</h3>
              <p class="portal-app-desc">${app.desc}</p>
            </div>
            <div class="portal-app-meta">${escapeHtml(p.permission || '')}</div>
          </a>
        `;
      })
      .join('');

    if (gridEl) {
      gridEl.innerHTML = cards || '';
    }

    if (!cards && emptyEl) {
      emptyEl.style.display = 'block';
    }
  } catch (error) {
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="portal-empty">
          ${escapeHtml(error.message || '앱 정보를 불러오지 못했습니다.')}
        </div>
      `;
    }
  }
});

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
