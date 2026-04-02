document.addEventListener('DOMContentLoaded', async () => {
  const nameEl = document.getElementById('portalUserName');
  const subEl = document.getElementById('portalUserSub');
  const gridEl = document.getElementById('portalAppGrid');
  const emptyEl = document.getElementById('portalEmpty');
  const logoutBtn = document.getElementById('logoutBtn');
  const adminPageBtn = document.getElementById('adminPageBtn');

  logoutBtn?.addEventListener('click', () => {
    showGlobalLoading('로그아웃 중...');
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
    const dept =
      user.department ||
      ((clinicName && teamName) ? `${clinicName} / ${teamName}` : '소속 없음');
    const role = user.role || user.permission || 'user';
    subEl.textContent = `${dept} / ${role}`;
  }

  const isAdmin = String(user.role || '').trim().toLowerCase() === 'admin';

  if (adminPageBtn) {
    adminPageBtn.style.display = isAdmin ? '' : 'none';
  }

  const APP_MAP = {
    equipment: {
      title: '의료장비 관리',
      desc: '장비 등록 및 이력 관리',
      icon: '🩺',
      url: `${CONFIG.SITE_BASE_URL}/pages/equipment/dashboard.html`
    },
    logs: {
      title: '시스템 로그',
      desc: '작업 이력 조회',
      icon: '🧾',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/logs.html`
    },
    users_admin: {
      title: '사용자 관리',
      desc: '사용자 등록 및 권한 관리',
      icon: '👤',
      url: `${CONFIG.SITE_BASE_URL}/pages/admin/users.html`
    }
  };

  document.addEventListener('click', (e) => {
    const link = e.target.closest('.portal-app-card');
    if (!link) return;
    showGlobalLoading('이동 중...');
  });

  const loadingStartedAt = Date.now();
  showGlobalLoading('앱 목록 불러오는 중...');

  await waitForPaint();
  await delay(120);

  try {
    const result = await apiGet('getUserPermissions', {
      user_email: user.email,
      request_user_email: user.email
    });

    const permissions = Array.isArray(result.data) ? [...result.data] : [];

    if (isAdmin && !permissions.some((p) => p.app_id === 'users_admin')) {
      permissions.push({
        app_id: 'users_admin',
        permission: 'admin',
        active: 'Y'
      });
    }

    const visiblePermissions = permissions.filter((p) => {
      if (!p || !p.app_id) return false;
      if (String(p.active || 'Y').trim().toUpperCase() !== 'Y') return false;
      return !!APP_MAP[p.app_id];
    });

    if (!visiblePermissions.length) {
      if (gridEl) {
        gridEl.innerHTML = '';
      }
      if (emptyEl) {
        emptyEl.style.display = 'block';
      }
      await waitForPaint();
      await delayUntilMinimum(loadingStartedAt, 700);
      return;
    }

    if (emptyEl) {
      emptyEl.style.display = 'none';
    }

    const cards = visiblePermissions
      .map((p) => {
        const app = APP_MAP[p.app_id];
        const permissionLabel =
          p.permission === 'admin'
            ? '관리자'
            : p.permission === 'edit'
              ? '편집'
              : p.permission === 'view'
                ? '조회'
                : (p.permission || '');

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
      })
      .join('');

    if (gridEl) {
      gridEl.innerHTML = cards;
    }

    await waitForPaint();

    if (document.fonts && document.fonts.ready) {
      try {
        await document.fonts.ready;
      } catch (e) {
        // ignore
      }
    }

    await waitForPaint();
    await delayUntilMinimum(loadingStartedAt, 700);
  } catch (error) {
    if (gridEl) {
      gridEl.innerHTML = `
        <div class="portal-error-box">
          ${escapeHtml(error.message || '불러오기 실패')}
        </div>
      `;
    }
    await waitForPaint();
    await delayUntilMinimum(loadingStartedAt, 500);
  } finally {
    hideGlobalLoading();
  }
});

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function delayUntilMinimum(startedAt, minimumMs) {
  const elapsed = Date.now() - startedAt;
  const remain = Math.max(0, minimumMs - elapsed);
  if (remain > 0) {
    await delay(remain);
  }
}

window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    hideGlobalLoading();
  }
});
