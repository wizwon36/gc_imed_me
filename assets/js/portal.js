document.addEventListener('DOMContentLoaded', () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  const nameEl = document.getElementById('portalUserName');
  const subEl = document.getElementById('portalUserSub');
  const logoutBtn = document.getElementById('logoutBtn');
  const gridEl = document.getElementById('portalAppGrid');
  const emptyEl = document.getElementById('portalEmpty');

  if (nameEl) {
    nameEl.textContent = user.name || user.user_name || user.email || '사용자';
  }

  if (subEl) {
    const dept = user.department || '부서 미지정';
    const role = user.role || 'user';
    subEl.textContent = `${dept} / ${role}`;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      window.auth.logout();
    });
  }

  const appList = [
    {
      id: 'equipment',
      title: '의료장비 관리 시스템',
      desc: '장비 등록, 조회, 이력 관리, 라벨 출력 기능을 사용할 수 있습니다.',
      href: 'equipment-dashboard.html',
      icon: '🩺',
      roles: ['admin', 'manager', 'user']
    },
    {
      id: 'admin-users',
      title: '사용자 관리',
      desc: '사용자 등록, 권한 설정, 활성 여부를 관리합니다.',
      href: 'admin-users.html',
      icon: '👤',
      roles: ['admin']
    },
    {
      id: 'admin-logs',
      title: '시스템 로그',
      desc: '수정 이력 및 시스템 작업 로그를 확인합니다.',
      href: 'admin-logs.html',
      icon: '🧾',
      roles: ['admin', 'manager']
    }
  ];

  const currentRole = user.role || 'user';
  const availableApps = appList.filter(app => app.roles.includes(currentRole));

  if (!availableApps.length) {
    if (gridEl) gridEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  if (gridEl) {
    gridEl.innerHTML = availableApps.map(app => `
      <a class="portal-app-card" href="${app.href}">
        <div class="portal-app-icon" aria-hidden="true">${app.icon}</div>
        <div>
          <h3 class="portal-app-title">${app.title}</h3>
          <p class="portal-app-desc">${app.desc}</p>
        </div>
        <div class="portal-app-meta">앱 열기</div>
      </a>
    `).join('');
  }
});
