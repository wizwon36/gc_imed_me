let CURRENT_USERS_ADMIN_PERMISSION = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  const ok = await window.appPermission.requirePermission('users_admin', ['admin']);
  if (!ok) return;

  CURRENT_USERS_ADMIN_PERMISSION = await window.appPermission.getPermission('users_admin');

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.auth.logout();
  });

  document.getElementById('createUserBtn')?.addEventListener('click', createUser);

  applyAdminUsersPermission();
  await loadUsers();
});

function isUsersAdmin() {
  return CURRENT_USERS_ADMIN_PERMISSION === 'admin';
}

function applyAdminUsersPermission() {
  const createBtn = document.getElementById('createUserBtn');
  const form = document.getElementById('adminUserForm') || document.querySelector('.admin-user-form');

  if (!isUsersAdmin()) {
    if (form) {
      Array.from(form.querySelectorAll('input, select, textarea, button')).forEach(el => {
        if (el.id === 'logoutBtn') return;
        el.disabled = true;
        if ('readOnly' in el) el.readOnly = true;
      });
    }

    if (createBtn) {
      createBtn.disabled = true;
      createBtn.textContent = '권한 없음';
      createBtn.title = '관리자 권한이 없습니다.';
    }

    setAdminMessage('관리자만 사용자 등록/수정이 가능합니다.', 'error');
    return;
  }

  window.appPermission.disableByPermission('users_admin', '#createUserBtn', ['admin']);
}

function setAdminMessage(message, type = '') {
  const el = document.getElementById('adminUserMessage');
  if (!el) return;

  el.textContent = message || '';
  el.className = 'message-box';

  if (type) {
    el.classList.add(type);
  }
}

function collectPermissions() {
  const permissionEls = document.querySelectorAll('.app-permission');
  const activeEls = document.querySelectorAll('.app-active');
  const activeMap = {};

  activeEls.forEach(el => {
    activeMap[el.dataset.appId] = el.value;
  });

  const permissions = [];
  permissionEls.forEach(el => {
    const appId = el.dataset.appId;
    const permission = el.value;
    const active = activeMap[appId] || 'Y';

    if (permission) {
      permissions.push({ app_id: appId, permission, active });
    }
  });

  return permissions;
}

async function createUser() {
  if (!isUsersAdmin()) {
    setAdminMessage('사용자 등록 권한이 없습니다.', 'error');
    return;
  }

  const user_email = document.getElementById('userEmail')?.value.trim();
  const user_name = document.getElementById('userName')?.value.trim();
  const password = document.getElementById('userPassword')?.value.trim();
  const department = document.getElementById('department')?.value.trim();
  const phone = document.getElementById('phone')?.value.trim();
  const role = document.getElementById('globalRole')?.value;
  const permissions = collectPermissions();

  if (!user_email) {
    setAdminMessage('이메일을 입력해 주세요.', 'error');
    return;
  }

  if (!user_name) {
    setAdminMessage('이름을 입력해 주세요.', 'error');
    return;
  }

  if (!password) {
    setAdminMessage('초기 비밀번호를 입력해 주세요.', 'error');
    return;
  }

  try {
    const result = await apiPost('createUser', {
      user_email,
      user_name,
      password,
      department,
      phone,
      role,
      permissions
    });

    setAdminMessage(result.message || '사용자가 등록되었습니다.', 'success');
    clearUserForm();
    await loadUsers();
  } catch (error) {
    setAdminMessage(error.message || '사용자 등록 중 오류가 발생했습니다.', 'error');
  }
}

function clearUserForm() {
  ['userEmail', 'userName', 'userPassword', 'department', 'phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const roleEl = document.getElementById('globalRole');
  if (roleEl) roleEl.value = 'user';

  document.querySelectorAll('.app-permission').forEach(el => {
    el.value = '';
  });

  document.querySelectorAll('.app-active').forEach(el => {
    el.value = 'Y';
  });
}

async function loadUsers() {
  const listEl = document.getElementById('userList');
  if (!listEl) return;

  try {
    const result = await apiGet('listUsers');
    const users = result.data || [];

    if (!users.length) {
      listEl.innerHTML = `
        <div class="empty-state">등록된 사용자가 없습니다.</div>
      `;
      return;
    }

    listEl.innerHTML = users.map(user => `
      <article class="user-card">
        <div class="user-card__title">
          ${escapeHtml(user.user_name || '')}
        </div>
        <div class="user-card__meta">
          ${escapeHtml(user.user_email || '')}
        </div>
        <div class="user-card__meta">
          ${escapeHtml(user.department || '')} / ${escapeHtml(user.role || '')}
        </div>
        <div class="user-card__meta">
          상태: ${escapeHtml(user.active || '')}
        </div>
      </article>
    `).join('');
  } catch (error) {
    listEl.innerHTML = `
      <div class="empty-state">${escapeHtml(error.message || '사용자 목록을 불러오지 못했습니다.')}</div>
    `;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
