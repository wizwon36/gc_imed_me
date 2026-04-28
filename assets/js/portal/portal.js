document.addEventListener('DOMContentLoaded', async () => {
  const nameEl = document.getElementById('portalUserName');
  const subEl = document.getElementById('portalUserSub');
  const gridEl = document.getElementById('portalAppGrid');
  const emptyEl = document.getElementById('portalEmpty');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminPageBtn = document.getElementById('adminPageBtn');

  logoutBtn?.addEventListener('click', () => {
    try {
      showGlobalLoading('로그아웃 중...');
    } catch (e) {}
    window.auth.logout();
  });

  adminPageBtn?.addEventListener('click', () => {
    location.href = `${CONFIG.SITE_BASE_URL}/pages/admin/users.html`;
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
  if (adminPageBtn) {
    adminPageBtn.style.display = isAdmin ? '' : 'none';
  }

  const APP_MAP = {
    equipment: {
      title: '의료장비 관리',
      desc: '장비 등록, 조회, 이력 관리',
      icon: '🩺',
      url: `${CONFIG.SITE_BASE_URL}/pages/equipment/dashboard.html`
    },
    signage: {
      title: '사인물 신청',
      desc: '사인물 / 명판 제작 요청',
      icon: '🪧',
      url: `${CONFIG.SITE_BASE_URL}/pages/signage/signage-form.html`
    },
    // ── 수정요청: 권한 없어도 모든 사용자에게 노출 ──────────────────
    support: {
      title: '프로그램 수정요청',
      desc: '불편사항·기능 개선 요청',
      icon: '🛠️',
      url: `${CONFIG.SITE_BASE_URL}/pages/support/support-form.html`
    },
    users_admin: {
      title: '사용자 관리',
      desc: '사용자 등록 및 권한 관리',
      icon: '👤',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/users.html`
    },
    logs: {
      title: '시스템 로그',
      desc: '작업 이력과 기록 조회',
      icon: '🧾',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/logs.html`
    },
    // ── 관리자: 수정요청 관리 ──────────────────────────────────────
    support_admin: {
      title: '수정요청 관리',
      desc: '접수된 수정요청 처리',
      icon: '⚙️',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/support-admin.html`
    }
  };

  const startedAt = Date.now();

  try {
    showGlobalLoading('앱 목록 불러오는 중...');

    const result = await apiGet('getUserPermissions', {
      user_email: user.email,
      request_user_email: user.email
    });

    const permissions = Array.isArray(result.data) ? [...result.data] : [];

    // 관리자 전용 앱 자동 추가
    if (isAdmin) {
      ['users_admin', 'logs', 'support_admin'].forEach(appId => {
        if (!permissions.some(item => item.app_id === appId)) {
          permissions.push({ app_id: appId, permission: 'admin', active: 'Y' });
        }
      });
    }

    // 수정요청은 모든 로그인 사용자에게 노출 (권한 불필요)
    if (!permissions.some(item => item.app_id === 'support')) {
      permissions.push({ app_id: 'support', permission: 'view', active: 'Y' });
    }

    const visiblePermissions = permissions.filter(item => {
      if (!item || !item.app_id) return false;
      if (String(item.active || 'Y').trim().toUpperCase() !== 'Y') return false;
      return !!APP_MAP[item.app_id];
    });

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
          item.permission === 'edit'  ? '편집'   :
          item.permission === 'view'  ? '조회'   :
          (item.permission || '');

        return `
          <a class="portal-app-card" href="${app.url}">
            <div class="portal-app-icon">${escapeHtml(app.icon)}</div>
            <div class="portal-app-body">
              <div class="portal-app-title-row">
                <strong class="portal-app-title">${escapeHtml(app.title)}</strong>
                <span class="portal-app-badge">${escapeHtml(permissionLabel)}</span>
              </div>
              <div class="portal-app-desc">${escapeHtml(app.desc)}</div>
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
