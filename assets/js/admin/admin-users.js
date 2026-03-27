let editingUserEmail = '';
let allUsers = [];
let hasLoadedUsers = false;

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  if (user.role !== 'admin') {
    alert('관리자만 접근할 수 있습니다.');
    location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
    return;
  }

  showGlobalLoading('조직 정보를 불러오는 중...');

  try {
    await OrgService.preload();
    await initUserOrgSelectors();
    await initUserFilterClinic();
  } catch (error) {
    setAdminMessage(error.message || '조직 정보를 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }

  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    showGlobalLoading('로그아웃 중...');
    window.auth.logout();
  });

  document.getElementById('saveUserBtn')?.addEventListener('click', handleSaveUser);
  document.getElementById('cancelEditBtn')?.addEventListener('click', resetEditMode);
  document.getElementById('searchUsersBtn')?.addEventListener('click', searchUsers);

  document.getElementById('userSearchKeyword')?.addEventListener('input', () => {
    if (hasLoadedUsers) renderUserList();
  });

  document.getElementById('userFilterActive')?.addEventListener('change', () => {
    if (hasLoadedUsers) renderUserList();
  });

  document.getElementById('userFilterRole')?.addEventListener('change', () => {
    if (hasLoadedUsers) renderUserList();
  });

  document.getElementById('userFilterClinic')?.addEventListener('change', () => {
    if (hasLoadedUsers) renderUserList();
  });
});

async function initUserOrgSelectors(user = {}) {
  await OrgService.bindClinicTeam(
    document.getElementById('clinic_code'),
    document.getElementById('team_code'),
    {
      initialClinicCode: user.clinic_code || '',
      initialTeamCode: user.team_code || '',
      clinicEmptyLabel: '의원을 선택하세요',
      teamEmptyLabel: '팀을 선택하세요'
    }
  );
}

async function initUserFilterClinic() {
  await OrgService.fillClinicSelect(document.getElementById('userFilterClinic'), {
    includeEmpty: true,
    emptyLabel: '전체 의원',
    selectedValue: ''
  });
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

async function buildUserOrgPayload() {
  const clinicCode = document.getElementById('clinic_code')?.value || '';
  const teamCode = document.getElementById('team_code')?.value || '';

  return await OrgService.buildOrgPayload(clinicCode, teamCode);
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
  const phone = document.getElementById('phone')?.value.trim();
  const role = document.getElementById('globalRole')?.value;
  const active = document.getElementById('userActive')?.value || 'Y';
  const permissions = collectPermissions();
  const org = await buildUserOrgPayload();

  if (!user_email) {
    setAdminMessage('이메일을 입력해 주세요.', 'error');
    return;
  }

  if (!user_name) {
    setAdminMessage('이름을 입력해 주세요.', 'error');
    return;
  }

  if (!org.clinic_code) {
    setAdminMessage('의원을 선택해 주세요.', 'error');
    return;
  }

  if (!org.team_code) {
    setAdminMessage('팀을 선택해 주세요.', 'error');
    return;
  }

  showGlobalLoading('사용자 등록 중...');
  await waitForPaint();

  try {
    const result = await apiPost('createUser', {
      user_email,
      user_name,
      phone,
      role,
      active,
      permissions,
      ...org
    });

    setAdminMessage(
      result.message || '사용자가 등록되었습니다. 초기 비밀번호는 1111입니다.',
      'success'
    );

    clearUserForm();
    resetEditMode(false);

    if (hasLoadedUsers) {
      await loadUsers();
      await waitForPaint();
    }
  } catch (error) {
    setAdminMessage(error.message || '사용자 등록 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function updateUser() {
  const user_email = editingUserEmail;
  const user_name = document.getElementById('userName')?.value.trim();
  const phone = document.getElementById('phone')?.value.trim();
  const role = document.getElementById('globalRole')?.value;
  const active = document.getElementById('userActive')?.value || 'Y';
  const permissions = collectPermissions();
  const org = await buildUserOrgPayload();

  if (!user_email) {
    setAdminMessage('수정할 사용자 정보가 없습니다.', 'error');
    return;
  }

  if (!user_name) {
    setAdminMessage('이름을 입력해 주세요.', 'error');
    return;
  }

  if (!org.clinic_code) {
    setAdminMessage('의원을 선택해 주세요.', 'error');
    return;
  }

  if (!org.team_code) {
    setAdminMessage('팀을 선택해 주세요.', 'error');
    return;
  }

  showGlobalLoading('사용자 정보 수정 중...');
  await waitForPaint();

  try {
    const result = await apiPost('updateUser', {
      user_email,
      user_name,
      phone,
      role,
      active,
      permissions,
      ...org
    });

    setAdminMessage(result.message || '사용자 정보가 수정되었습니다.', 'success');
    clearUserForm();
    resetEditMode(false);

    if (hasLoadedUsers) {
      await loadUsers();
      await waitForPaint();
    }
  } catch (error) {
    setAdminMessage(error.message || '사용자 수정 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function searchUsers() {
  showGlobalLoading('사용자 목록 조회 중...');
  await waitForPaint();

  try {
    await loadUsers();
    hasLoadedUsers = true;
    await waitForPaint();
  } finally {
    hideGlobalLoading();
  }
}

async function editUser(userEmail) {
  if (!userEmail) return;

  showGlobalLoading('사용자 정보 불러오는 중...');
  await waitForPaint();

  try {
    const result = await apiGet('getUserDetail', { user_email: userEmail });
    const data = result.data || {};
    const user = data.user || {};
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];

    document.getElementById('userEmail').value = user.user_email || '';
    document.getElementById('userName').value = user.user_name || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('globalRole').value = user.role || 'user';
    document.getElementById('userActive').value = user.active || 'Y';

    await initUserOrgSelectors(user);
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

async function resetUserPassword(userEmail) {
  if (!userEmail) return;

  const confirmed = confirm(`"${userEmail}" 사용자의 비밀번호를 1111로 초기화할까요?`);
  if (!confirmed) return;

  showGlobalLoading('비밀번호 초기화 중...');
  await waitForPaint();

  try {
    const result = await apiPost('resetUserPassword', { user_email: userEmail });
    setAdminMessage(result.message || '비밀번호가 초기화되었습니다.', 'success');

    if (hasLoadedUsers) {
      await loadUsers();
      await waitForPaint();
    }
  } catch (error) {
    setAdminMessage(error.message || '비밀번호 초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function setUserActive(userEmail, active) {
  if (!userEmail) return;

  const actionLabel = active === 'Y' ? '활성화' : '비활성화';
  const confirmed = confirm(`"${userEmail}" 사용자를 ${actionLabel}할까요?`);
  if (!confirmed) return;

  showGlobalLoading(`사용자 ${actionLabel} 처리 중...`);
  await waitForPaint();

  try {
    const result = await apiPost('setUserActive', { user_email: userEmail, active });
    setAdminMessage(result.message || `사용자 ${actionLabel} 처리가 완료되었습니다.`, 'success');

    if (editingUserEmail && editingUserEmail === userEmail && active === 'N') {
      resetEditMode(false);
    }

    if (hasLoadedUsers) {
      await loadUsers();
      await waitForPaint();
    }
  } catch (error) {
    setAdminMessage(error.message || `사용자 ${actionLabel} 중 오류가 발생했습니다.`, 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function loadUsers() {
  try {
    const result = await apiGet('listUsers');
    allUsers = Array.isArray(result.data) ? result.data : [];
    renderUserList();
  } catch (error) {
    const listEl = document.getElementById('userList');
    const countEl = document.getElementById('userListCount');

    if (countEl) countEl.textContent = '';
    if (listEl) {
      listEl.innerHTML = `
        <div class="user-item">
          <span>${escapeHtml(error.message || '사용자 목록을 불러오지 못했습니다.')}</span>
        </div>
      `;
    }
  }
}

function renderUserList() {
  const listEl = document.getElementById('userList');
  const countEl = document.getElementById('userListCount');

  if (!listEl) return;

  const keyword = String(document.getElementById('userSearchKeyword')?.value || '').trim().toLowerCase();
  const activeFilter = String(document.getElementById('userFilterActive')?.value || '').trim().toUpperCase();
  const roleFilter = String(document.getElementById('userFilterRole')?.value || '').trim().toLowerCase();
  const clinicFilter = String(document.getElementById('userFilterClinic')?.value || '').trim();

  const filteredUsers = allUsers.filter((user) => {
    const name = String(user.user_name || '').toLowerCase();
    const email = String(user.user_email || '').toLowerCase();
    const department = String(user.department || '').toLowerCase();
    const clinicName = String(user.clinic_name || '').toLowerCase();
    const teamName = String(user.team_name || '').toLowerCase();
    const active = String(user.active || '').toUpperCase();
    const role = String(user.role || '').toLowerCase();
    const clinicCode = String(user.clinic_code || '').trim();

    const matchesKeyword =
      !keyword ||
      name.includes(keyword) ||
      email.includes(keyword) ||
      department.includes(keyword) ||
      clinicName.includes(keyword) ||
      teamName.includes(keyword);

    const matchesActive = !activeFilter || active === activeFilter;
    const matchesRole = !roleFilter || role === roleFilter;
    const matchesClinic = !clinicFilter || clinicCode === clinicFilter;

    return matchesKeyword && matchesActive && matchesRole && matchesClinic;
  });

  if (countEl) {
    countEl.textContent = `총 ${filteredUsers.length}명 / 전체 ${allUsers.length}명`;
  }

  if (!filteredUsers.length) {
    listEl.innerHTML = `
      <div class="user-item">
        <span>조건에 맞는 사용자가 없습니다.</span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filteredUsers.map((user) => {
    const isActive = String(user.active || 'Y').toUpperCase() === 'Y';
    const statusBadge = isActive
      ? '<span class="user-status-badge active">활성</span>'
      : '<span class="user-status-badge inactive">비활성</span>';

    const orgText = user.department || (
      (user.clinic_name || '') && (user.team_name || '')
        ? `${user.clinic_name} / ${user.team_name}`
        : ''
    );

    return `
      <div class="user-item">
        <div class="user-item-top">
          <div class="user-item-title">
            <strong>${escapeHtml(user.user_name || '')}</strong>
            <span class="user-item-email">${escapeHtml(user.user_email || '')}</span>
          </div>
        </div>

        <div class="user-meta-row">
          ${statusBadge}
          <span class="user-role-badge">${escapeHtml(user.role || '')}</span>
        </div>

        <div class="user-info-chips">
          <span class="user-info-chip">${escapeHtml(orgText || '소속 없음')}</span>
          <span class="user-info-chip">${escapeHtml(user.phone || '연락처 없음')}</span>
        </div>

        <div class="user-sub-line">
          첫 로그인: ${escapeHtml(user.first_login || 'N')}
        </div>

        <div class="user-item-actions">
          <button type="button" class="admin-btn secondary" onclick="editUser('${escapeJs(user.user_email || '')}')">수정</button>
          <button type="button" class="admin-btn warning" onclick="resetUserPassword('${escapeJs(user.user_email || '')}')">비밀번호 초기화</button>
          ${
            isActive
              ? `<button type="button" class="admin-btn danger" onclick="setUserActive('${escapeJs(user.user_email || '')}', 'N')">비활성화</button>`
              : `<button type="button" class="admin-btn success" onclick="setUserActive('${escapeJs(user.user_email || '')}', 'Y')">활성화</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

function clearUserForm() {
  ['userEmail', 'userName', 'phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const clinicEl = document.getElementById('clinic_code');
  const teamEl = document.getElementById('team_code');

  if (clinicEl) clinicEl.value = '';
  if (teamEl) {
    teamEl.innerHTML = '<option value="">팀을 선택하세요</option>';
    teamEl.disabled = true;
  }

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
    passwordHint.innerHTML = '수정 모드에서는 이메일을 변경할 수 없습니다. 비밀번호 초기화는 우측 목록에서 진행할 수 있습니다.';
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
  initUserOrgSelectors();

  if (clearMessage) {
    setAdminMessage('', '');
  }
}

function showGlobalLoading(text = '처리 중...') {
  const overlay = document.getElementById('globalLoading');
  if (!overlay) return;

  const textEl = document.getElementById('globalLoadingText');
  if (textEl) textEl.textContent = text;

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

window.editUser = editUser;
window.resetUserPassword = resetUserPassword;
window.setUserActive = setUserActive;
