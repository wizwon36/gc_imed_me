let editingUserEmail = '';

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  if (user.role !== 'admin') {
    alert('관리자만 접근할 수 있습니다.');
    location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
    return;
  }

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    showGlobalLoading('로그아웃 중...');
    window.auth.logout();
  });

  document.getElementById('saveUserBtn')?.addEventListener('click', handleSaveUser);
  document.getElementById('cancelEditBtn')?.addEventListener('click', resetEditMode);

  showGlobalLoading('사용자 목록 불러오는 중...');
  await waitForPaint();

  try {
    await loadUsers();
  } finally {
    hideGlobalLoading();
  }
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

async function handleSaveUser() {
  if (editingUserEmail) {
    await updateUser();
  } else {
    await createUser();
  }
}

async function createUser() {
  const user_email = document.getElementById('userEmail')?.value.trim();
  const user_name = document.getElementById('userName')?.value.trim();
  const department = document.getElementById('department')?.value.trim();
  const phone = document.getElementById('phone')?.value.trim();
  const role = document.getElementById('globalRole')?.value;
  const active = document.getElementById('userActive')?.value || 'Y';
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
      active,
      permissions
    });

    setAdminMessage(result.message || '사용자가 등록되었습니다. 초기 비밀번호는 1111입니다.', 'success');
    clearUserForm();
    resetEditMode(false);
    await loadUsers();
    await waitForPaint();
  } catch (error) {
    setAdminMessage(error.message || '사용자 등록 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function updateUser() {
  const user_email = editingUserEmail;
  const user_name = document.getElementById('userName')?.value.trim();
  const department = document.getElementById('department')?.value.trim();
  const phone = document.getElementById('phone')?.value.trim();
  const role = document.getElementById('globalRole')?.value;
  const active = document.getElementById('userActive')?.value || 'Y';
  const permissions = collectPermissions();

  if (!user_email) {
    setAdminMessage('수정할 사용자 정보가 없습니다.', 'error');
    return;
  }

  if (!user_name) {
    setAdminMessage('이름을 입력해 주세요.', 'error');
    return;
  }

  showGlobalLoading('사용자 정보 수정 중...');
  await waitForPaint();

  try {
    const result = await apiPost('updateUser', {
      user_email,
      user_name,
      department,
      phone,
      role,
      active,
      permissions
    });

    setAdminMessage(result.message || '사용자 정보가 수정되었습니다.', 'success');
    clearUserForm();
    resetEditMode(false);
    await loadUsers();
    await waitForPaint();
  } catch (error) {
    setAdminMessage(error.message || '사용자 수정 중 오류가 발생했습니다.', 'error');
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

  const activeEl = document.getElementById('userActive');
  if (activeEl) activeEl.value = 'Y';

  document.querySelectorAll('.app-permission').forEach((el) => {
    el.value = '';
  });
}

function setPermissionValues(permissions = []) {
  const permissionMap = {};
  permissions.forEach((item) => {
    if (item?.app_id) {
      permissionMap[item.app_id] = item.permission || '';
    }
  });

  document.querySelectorAll('.app-permission').forEach((el) => {
    const appId = el.dataset.appId;
    el.value = permissionMap[appId] || '';
  });
}

function setEditMode(user) {
  editingUserEmail = user.user_email || '';

  const formTitle = document.getElementById('formTitle');
  const formDesc = document.getElementById('formDesc');
  const saveBtn = document.getElementById('saveUserBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const emailInput = document.getElementById('userEmail');
  const passwordHint = document.getElementById('passwordHint');

  if (formTitle) formTitle.textContent = '사용자 수정';
  if (formDesc) formDesc.textContent = '기존 사용자 정보를 수정하고 권한을 다시 저장합니다.';
  if (saveBtn) saveBtn.textContent = '사용자 수정';
  if (cancelBtn) cancelBtn.style.display = 'inline-flex';
  if (emailInput) emailInput.disabled = true;
  if (passwordHint) {
    passwordHint.innerHTML = '수정 모드에서는 이메일을 변경할 수 없습니다. 비밀번호 초기화는 추후 별도 기능으로 추가할 수 있습니다.';
  }
}

function resetEditMode(clearMessage = true) {
  editingUserEmail = '';

  const formTitle = document.getElementById('formTitle');
  const formDesc = document.getElementById('formDesc');
  const saveBtn = document.getElementById('saveUserBtn');
  const cancelBtn = document.getElementById('cancelEditBtn');
  const emailInput = document.getElementById('userEmail');
  const passwordHint = document.getElementById('passwordHint');

  if (formTitle) formTitle.textContent = '사용자 등록';
  if (formDesc) formDesc.textContent = '신규 사용자를 등록하고 앱별 권한을 부여합니다.';
  if (saveBtn) saveBtn.textContent = '사용자 등록';
  if (cancelBtn) cancelBtn.style.display = 'none';
  if (emailInput) emailInput.disabled = false;
  if (passwordHint) {
    passwordHint.innerHTML = '신규 사용자는 초기 비밀번호 <strong>1111</strong>로 등록되며, 첫 로그인 후 변경하도록 안내됩니다.';
  }

  clearUserForm();

  if (clearMessage) {
    setAdminMessage('', '');
  }
}

async function editUser(userEmail) {
  if (!userEmail) return;

  showGlobalLoading('사용자 정보 불러오는 중...');
  await waitForPaint();

  try {
    const result = await apiGet('getUserDetail', {
      user_email: userEmail
    });

    const data = result.data || {};
    const user = data.user || {};
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];

    document.getElementById('userEmail').value = user.user_email || '';
    document.getElementById('userName').value = user.user_name || '';
    document.getElementById('department').value = user.department || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('globalRole').value = user.role || 'user';
    document.getElementById('userActive').value = user.active || 'Y';

    setPermissionValues(permissions);
    setEditMode(user);
    setAdminMessage(`사용자 ${user.user_name || user.user_email} 정보를 불러왔습니다.`, 'success');

    await waitForPaint();
  } catch (error) {
    setAdminMessage(error.message || '사용자 정보를 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
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
        <div class="user-item-top">
          <div>
            <strong>${escapeHtml(user.user_name || '')}</strong>
            <span>${escapeHtml(user.user_email || '')}</span>
          </div>
        </div>
        <span>${escapeHtml(user.department || '')} / ${escapeHtml(user.role || '')}</span>
        <span>상태: ${escapeHtml(user.active || '')} / 첫 로그인: ${escapeHtml(user.first_login || 'N')}</span>
        <div class="user-item-actions">
          <button type="button" class="admin-btn secondary" onclick="editUser('${escapeJs(user.user_email || '')}')">수정</button>
          <button type="button" class="admin-btn warning" onclick="resetUserPassword('${escapeJs(user.user_email || '')}')">비밀번호 초기화</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    listEl.innerHTML = `<div class="user-item"><span>${escapeHtml(error.message || '사용자 목록을 불러오지 못했습니다.')}</span></div>`;
  }
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

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJs(value) {
  return String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'");
}

async function resetUserPassword(userEmail) {
  if (!userEmail) return;

  const confirmed = confirm(`"${userEmail}" 사용자의 비밀번호를 1111로 초기화할까요?`);
  if (!confirmed) return;

  showGlobalLoading('비밀번호 초기화 중...');
  await waitForPaint();

  try {
    const result = await apiPost('resetUserPassword', {
      user_email: userEmail
    });

    setAdminMessage(result.message || '비밀번호가 초기화되었습니다.', 'success');
    await loadUsers();
    await waitForPaint();
  } catch (error) {
    setAdminMessage(error.message || '비밀번호 초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

window.editUser = editUser;
window.resetUserPassword = resetUserPassword;
