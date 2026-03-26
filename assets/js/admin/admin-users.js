document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  if (user.role !== 'admin') {
    alert('관리자만 접근할 수 있습니다.');
    location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
    return;
  }

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    window.auth.logout();
  });

  document.getElementById('createUserBtn')?.addEventListener('click', createUser);

  await loadUsers();
});

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
  const permissions = [];

  permissionEls.forEach((el) => {
    const appId = el.dataset.appId;
    const permission = el.value;

    if (permission) {
      permissions.push({
        app_id: appId,
        permission,
        active: 'Y'
      });
    }
  });

  return permissions;
}

async function createUser() {
  const user_email = document.getElementById('userEmail')?.value.trim();
  const user_name = document.getElementById('userName')?.value.trim();
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

  showGlobalLoading('사용자 등록 중...');
  await waitForPaint();

  try {
    const result = await apiPost('createUser', {
      user_email,
      user_name,
      department,
      phone,
      role,
      permissions
    });

    setAdminMessage(result.message || '사용자가 등록되었습니다. 초기 비밀번호는 1111입니다.', 'success');
    clearUserForm();
    await loadUsers();
    await waitForPaint();
  } catch (error) {
    setAdminMessage(error.message || '사용자 등록 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

function clearUserForm() {
  ['userEmail', 'userName', 'department', 'phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const roleEl = document.getElementById('globalRole');
  if (roleEl) roleEl.value = 'user';

  document.querySelectorAll('.app-permission').forEach((el) => {
    el.value = '';
  });
}

async function loadUsers() {
  const listEl = document.getElementById('userList');
  if (!listEl) return;

  try {
    const result = await apiGet('listUsers');
    const users = Array.isArray(result.data) ? result.data : [];

    if (!users.length) {
      listEl.innerHTML = '<div class="user-item"><span>등록된 사용자가 없습니다.</span></div>';
      return;
    }

    listEl.innerHTML = users.map((user) => `
      <div class="user-item">
        <strong>${escapeHtml(user.user_name || '')}</strong>
        <span>${escapeHtml(user.user_email || '')}</span>
        <span>${escapeHtml(user.department || '')} / ${escapeHtml(user.role || '')}</span>
        <span>상태: ${escapeHtml(user.active || '')} / 첫 로그인: ${escapeHtml(user.first_login || 'N')}</span>
      </div>
    `).join('');
  } catch (error) {
    listEl.innerHTML = `<div class="user-item"><span>${escapeHtml(error.message || '사용자 목록을 불러오지 못했습니다.')}</span></div>`;
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

function showGlobalLoading(text = '처리 중...') {
  const overlay = document.getElementById('globalLoading');
  if (!overlay) return;

  const textEl = document.getElementById('globalLoadingText');
  if (textEl) {
    textEl.textContent = text;
  }

  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
}

function hideGlobalLoading() {
  const overlay = document.getElementById('globalLoading');
  if (!overlay) return;

  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
