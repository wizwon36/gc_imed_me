let currentSessionUser = null;
let editingUserEmail = '';
let allUsers = [];
let hasLoadedUsers = false;
let orgDataCache = {
  clinics: [],
  teams: []
};

document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  currentSessionUser = user;

  if (String(user.role || '').trim().toLowerCase() !== 'admin') {
    alert('관리자만 접근할 수 있습니다.');
    location.replace(`${CONFIG.SITE_BASE_URL}/portal.html`);
    return;
  }

  bindEvents();

  showGlobalLoading('초기 정보를 불러오는 중...');
  try {
    await loadOrgData();
  } catch (error) {
    setAdminMessage(error.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
});

function bindEvents() {
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    showGlobalLoading('로그아웃 중...');
    window.auth.logout();
  });

  document.getElementById('saveUserBtn')?.addEventListener('click', handleSaveUser);
  document.getElementById('cancelEditBtn')?.addEventListener('click', () => resetEditMode());
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

  document.getElementById('clinic_code')?.addEventListener('change', () => {
    clearFieldInvalid();
    syncTeamSelectByClinic('');
  });

  document.getElementById('userList')?.addEventListener('click', async (event) => {
    const editBtn = event.target.closest('.js-edit-user');
    if (editBtn) {
      const email = editBtn.dataset.email;
      if (email) await editUser(email);
      return;
    }

    const resetBtn = event.target.closest('.js-reset-password');
    if (resetBtn) {
      const email = resetBtn.dataset.email;
      if (email) await resetUserPassword(email);
      return;
    }

    const activeBtn = event.target.closest('.js-toggle-active');
    if (activeBtn) {
      const email = activeBtn.dataset.email;
      const active = activeBtn.dataset.active;
      if (email && active) await setUserActive(email, active);
    }
  });
}

function getRequestUserEmail() {
  return String(currentSessionUser?.email || '').trim().toLowerCase();
}

async function loadOrgData() {
  const result = await apiGet('getOrgData');
  orgDataCache = result.data || { clinics: [], teams: [] };

  populateClinicSelect(
    document.getElementById('clinic_code'),
    orgDataCache.clinics,
    '의원을 선택하세요'
  );

  populateClinicSelect(
    document.getElementById('userFilterClinic'),
    orgDataCache.clinics,
    '전체 의원'
  );

  populateTeamSelect(
    document.getElementById('team_code'),
    [],
    '팀을 선택하세요'
  );
}

function populateClinicSelect(selectEl, clinics, emptyLabel, selectedValue = '') {
  if (!selectEl) return;

  const options = [`<option value="">${escapeHtml(emptyLabel)}</option>`]
    .concat(
      (clinics || []).map((clinic) => {
        const code = normalize(clinic.code || clinic.code_value);
        const name = normalize(clinic.code_name || clinic.name);
        const selected = code === selectedValue ? ' selected' : '';
        return `<option value="${escapeHtml(code)}"${selected}>${escapeHtml(name)}</option>`;
      })
    )
    .join('');

  selectEl.innerHTML = options;
  selectEl.disabled = false;
}

function populateTeamSelect(selectEl, teams, emptyLabel, selectedValue = '') {
  if (!selectEl) return;

  const options = [`<option value="">${escapeHtml(emptyLabel)}</option>`]
    .concat(
      (teams || []).map((team) => {
        const code = normalize(team.code || team.code_value);
        const name = normalize(team.code_name || team.name);
        const selected = code === selectedValue ? ' selected' : '';
        return `<option value="${escapeHtml(code)}"${selected}>${escapeHtml(name)}</option>`;
      })
    )
    .join('');

  selectEl.innerHTML = options;
  selectEl.disabled = false;
}

function getTeamsByClinicCode(clinicCode) {
  const code = normalize(clinicCode);
  if (!code) return [];

  return (orgDataCache.teams || []).filter((team) => {
    const parentClinicCode =
      normalize(team.parent_code) ||
      normalize(team.parent_code_value) ||
      normalize(team.clinic_code);
    return parentClinicCode === code;
  });
}

function syncTeamSelectByClinic(selectedTeamCode = '') {
  const clinicSelect = document.getElementById('clinic_code');
  const teamSelect = document.getElementById('team_code');
  if (!clinicSelect || !teamSelect) return;

  const clinicCode = normalize(clinicSelect.value);
  const teams = getTeamsByClinicCode(clinicCode);

  populateTeamSelect(teamSelect, teams, '팀을 선택하세요', selectedTeamCode);
}

function buildDepartmentText(clinicName, teamName) {
  const clinic = normalize(clinicName);
  const team = normalize(teamName);
  if (clinic && team) return `${clinic} / ${team}`;
  return '';
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

function clearAdminMessage() {
  setAdminMessage('');
}

function clearFieldInvalid() {
  document.querySelectorAll('.is-invalid').forEach((el) => {
    el.classList.remove('is-invalid');
  });
}

function markFieldInvalid(fieldId) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  el.classList.add('is-invalid');
  el.focus();
}




function normalize(value) {
  return String(value || '').trim();
}

function collectPermissions() {
  const permissionEls = document.querySelectorAll('.app-permission');
  const permissions = [];

  permissionEls.forEach((el) => {
    const appId = normalize(el.dataset.appId);
    const permission = normalize(el.value);

    if (!appId || !permission) return;

    permissions.push({
      app_id: appId,
      permission,
      active: 'Y'
    });
  });

  return permissions;
}

function getSelectedText(selectEl) {
  if (!selectEl) return '';
  const option = selectEl.options[selectEl.selectedIndex];
  return option ? normalize(option.textContent) : '';
}

function buildUserOrgPayload() {
  const clinicEl = document.getElementById('clinic_code');
  const teamEl = document.getElementById('team_code');

  const clinic_code = normalize(clinicEl?.value);
  const clinic_name = getSelectedText(clinicEl);
  const team_code = normalize(teamEl?.value);
  const team_name = getSelectedText(teamEl);

  return {
    clinic_code,
    clinic_name,
    team_code,
    team_name,
    department: buildDepartmentText(clinic_name, team_name)
  };
}

function validateUserForm(data) {
  clearFieldInvalid();

  if (!data.user_email) {
    markFieldInvalid('userEmail');
    throw new Error('이메일을 입력해 주세요.');
  }

  if (!data.user_name) {
    markFieldInvalid('userName');
    throw new Error('이름을 입력해 주세요.');
  }

  if (!data.clinic_code) {
    markFieldInvalid('clinic_code');
    throw new Error('의원을 선택해 주세요.');
  }

  if (!data.team_code) {
    markFieldInvalid('team_code');
    throw new Error('팀을 선택해 주세요.');
  }
}

async function handleSaveUser() {
  clearAdminMessage();

  try {
    if (editingUserEmail) {
      await updateUser();
    } else {
      await createUser();
    }
  } catch (error) {
    setAdminMessage(error.message || '사용자 저장 중 오류가 발생했습니다.', 'error');
  }
}

async function createUser() {
  const org = buildUserOrgPayload();
  const payload = {
    request_user_email: getRequestUserEmail(),
    user_email: normalize(document.getElementById('userEmail')?.value).toLowerCase(),
    user_name: normalize(document.getElementById('userName')?.value),
    clinic_code: org.clinic_code,
    clinic_name: org.clinic_name,
    team_code: org.team_code,
    team_name: org.team_name,
    department: org.department,
    phone: normalize(document.getElementById('phone')?.value),
    role: normalize(document.getElementById('globalRole')?.value) || 'user',
    active: normalize(document.getElementById('userActive')?.value) || 'Y',
    permissions: collectPermissions()
  };

  validateUserForm(payload);

  const saveBtn = document.getElementById('saveUserBtn');
  if (saveBtn) saveBtn.disabled = true;

  showGlobalLoading('사용자 등록 중...');
  try {
    const result = await apiPost('createUser', payload);
    setAdminMessage(result.message || '사용자가 등록되었습니다. 초기 비밀번호는 1111입니다.', 'success');

    resetEditMode(false);

    hasLoadedUsers = false;
    allUsers = [];
    document.getElementById('userListCount').textContent = '아직 조회하지 않았습니다.';
    document.getElementById('userList').innerHTML = `
      <div class="user-list-empty">
        등록이 완료되었습니다. 필요하면 <strong>사용자 조회</strong>를 눌러 목록을 다시 불러와 주세요.
      </div>
    `;
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    hideGlobalLoading();
  }
}

async function updateUser() {
  const org = buildUserOrgPayload();
  const payload = {
    request_user_email: getRequestUserEmail(),
    user_email: editingUserEmail,
    user_name: normalize(document.getElementById('userName')?.value),
    clinic_code: org.clinic_code,
    clinic_name: org.clinic_name,
    team_code: org.team_code,
    team_name: org.team_name,
    department: org.department,
    phone: normalize(document.getElementById('phone')?.value),
    role: normalize(document.getElementById('globalRole')?.value) || 'user',
    active: normalize(document.getElementById('userActive')?.value) || 'Y',
    permissions: collectPermissions()
  };

  validateUserForm(payload);

  const saveBtn = document.getElementById('saveUserBtn');
  if (saveBtn) saveBtn.disabled = true;

  showGlobalLoading('사용자 정보 수정 중...');
  try {
    const result = await apiPost('updateUser', payload);
    setAdminMessage(result.message || '사용자 정보가 수정되었습니다.', 'success');

    resetEditMode(false);

    if (hasLoadedUsers) {
      await loadUsers();
    }
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    hideGlobalLoading();
  }
}

async function searchUsers() {
  const searchBtn = document.getElementById('searchUsersBtn');
  if (searchBtn) searchBtn.disabled = true;

  try {
    await loadUsers();
    hasLoadedUsers = true;
  } catch (error) {
    setAdminMessage(error.message || '사용자 목록 조회 중 오류가 발생했습니다.', 'error');
  } finally {
    if (searchBtn) searchBtn.disabled = false;
  }
}

async function loadUsers() {
  const listEl = document.getElementById('userList');
  const countEl = document.getElementById('userListCount');

  showGlobalLoading('사용자 목록을 불러오는 중입니다...');

  try {
    const result = await apiGet('listUsers', {
      request_user_email: getRequestUserEmail()
    });

    allUsers = Array.isArray(result.data) ? result.data : [];
    renderUserList();
  } catch (error) {
    allUsers = [];
    if (countEl) countEl.textContent = '';

    if (listEl) {
      listEl.innerHTML = `
        <div class="user-list-empty error">
          ${escapeHtml(error.message || '사용자 목록을 불러오지 못했습니다.')}
        </div>
      `;
    }
    throw error;
  } finally {
    hideGlobalLoading();
  }
}

function renderUserList() {
  const listEl = document.getElementById('userList');
  const countEl = document.getElementById('userListCount');
  if (!listEl) return;

  const keyword = normalize(document.getElementById('userSearchKeyword')?.value).toLowerCase();
  const activeFilter = normalize(document.getElementById('userFilterActive')?.value).toUpperCase();
  const roleFilter = normalize(document.getElementById('userFilterRole')?.value).toLowerCase();
  const clinicFilter = normalize(document.getElementById('userFilterClinic')?.value);

  const filteredUsers = allUsers.filter((user) => {
    const name = normalize(user.user_name).toLowerCase();
    const email = normalize(user.user_email).toLowerCase();
    const department = normalize(user.department).toLowerCase();
    const clinicName = normalize(user.clinic_name).toLowerCase();
    const teamName = normalize(user.team_name).toLowerCase();
    const active = normalize(user.active).toUpperCase();
    const role = normalize(user.role).toLowerCase();
    const clinicCode = normalize(user.clinic_code);

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
      <div class="user-list-empty">
        조건에 맞는 사용자가 없습니다.
      </div>
    `;
    return;
  }

  listEl.innerHTML = filteredUsers.map((user) => {
    const isActive = normalize(user.active || 'Y').toUpperCase() === 'Y';
    const statusClass = isActive ? 'active' : 'inactive';
    const statusText = isActive ? '활성' : '비활성';
    const orgText =
      normalize(user.department) ||
      (
        normalize(user.clinic_name) && normalize(user.team_name)
          ? `${normalize(user.clinic_name)} / ${normalize(user.team_name)}`
          : ''
      ) ||
      '소속 없음';

    return `
      <div class="user-item">
        <div class="user-item__main">
          <div class="user-item__title">
            <strong>${escapeHtml(user.user_name || '')}</strong>
            <span>${escapeHtml(user.user_email || '')}</span>
            <span class="status-chip ${statusClass}">${statusText}</span>
          </div>

          <div class="user-item__meta">
            <span>역할: ${escapeHtml(user.role || 'user')}</span>
            <span>첫 로그인: ${escapeHtml(user.first_login || 'N')}</span>
          </div>

          <div class="user-item__sub">${escapeHtml(orgText)}</div>
          <div class="user-item__sub">${escapeHtml(user.phone || '연락처 없음')}</div>
        </div>

        <div class="user-item__actions">
          <button type="button" class="admin-btn small js-edit-user" data-email="${escapeHtml(user.user_email || '')}">수정</button>
          <button type="button" class="admin-btn small js-reset-password" data-email="${escapeHtml(user.user_email || '')}">비밀번호 초기화</button>
          <button type="button" class="admin-btn small ${isActive ? 'danger' : 'secondary'} js-toggle-active" data-email="${escapeHtml(user.user_email || '')}" data-active="${isActive ? 'N' : 'Y'}">
            ${isActive ? '비활성화' : '활성화'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function editUser(userEmail) {
  if (!userEmail) return;

  clearAdminMessage();
  showGlobalLoading('사용자 정보를 불러오는 중...');

  try {
    const result = await apiGet('getUserDetail', {
      user_email: userEmail,
      request_user_email: getRequestUserEmail()
    });

    const data = result.data || {};
    const user = data.user || {};
    const permissions = Array.isArray(data.permissions) ? data.permissions : [];

    document.getElementById('userEmail').value = user.user_email || '';
    document.getElementById('userName').value = user.user_name || '';
    document.getElementById('phone').value = user.phone || '';
    document.getElementById('globalRole').value = user.role || 'user';
    document.getElementById('userActive').value = user.active || 'Y';

    populateClinicSelect(
      document.getElementById('clinic_code'),
      orgDataCache.clinics,
      '의원을 선택하세요',
      user.clinic_code || ''
    );

    syncTeamSelectByClinic(user.team_code || '');
    setPermissionValues(permissions);
    setEditMode(user);

    setAdminMessage(`사용자 ${user.user_name || user.user_email} 정보를 불러왔습니다.`, 'success');
  } catch (error) {
    setAdminMessage(error.message || '사용자 정보를 불러오지 못했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }
}

async function resetUserPassword(userEmail) {
  if (!userEmail) return;

  const confirmed = confirm(`"${userEmail}" 계정의 비밀번호를 1111로 초기화하시겠습니까?`);
  if (!confirmed) return;

  showGlobalLoading('비밀번호를 초기화하는 중...');

  try {
    const result = await apiPost('resetUserPassword', {
      request_user_email: getRequestUserEmail(),
      user_email: userEmail
    });

    setAdminMessage(result.message || '비밀번호가 초기화되었습니다.', 'success');

    if (hasLoadedUsers) {
      await loadUsers();
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
  const confirmed = confirm(`"${userEmail}" 사용자를 ${actionLabel}하시겠습니까?`);
  if (!confirmed) return;

  showGlobalLoading(`사용자 ${actionLabel} 처리 중...`);

  try {
    const result = await apiPost('setUserActive', {
      request_user_email: getRequestUserEmail(),
      user_email: userEmail,
      active
    });

    setAdminMessage(result.message || `사용자 ${actionLabel} 처리가 완료되었습니다.`, 'success');

    if (editingUserEmail && editingUserEmail === userEmail && active === 'N') {
      resetEditMode(false);
    }

    if (hasLoadedUsers) {
      await loadUsers();
    }
  } catch (error) {
    setAdminMessage(error.message || `사용자 ${actionLabel} 중 오류가 발생했습니다.`, 'error');
  } finally {
    hideGlobalLoading();
  }
}

function clearUserForm() {
  ['userEmail', 'userName', 'phone'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  populateClinicSelect(
    document.getElementById('clinic_code'),
    orgDataCache.clinics,
    '의원을 선택하세요',
    ''
  );

  populateTeamSelect(
    document.getElementById('team_code'),
    [],
    '팀을 선택하세요',
    ''
  );

  const roleEl = document.getElementById('globalRole');
  if (roleEl) roleEl.value = 'user';

  const activeEl = document.getElementById('userActive');
  if (activeEl) activeEl.value = 'Y';

  document.querySelectorAll('.app-permission').forEach((el) => {
    el.value = '';
  });

  clearFieldInvalid();
}

function setPermissionValues(permissions = []) {
  const permissionMap = {};

  permissions.forEach((item) => {
    if (item?.app_id && normalize(item.active || 'Y') === 'Y') {
      permissionMap[item.app_id] = item.permission || '';
    }
  });

  document.querySelectorAll('.app-permission').forEach((el) => {
    const appId = normalize(el.dataset.appId);
    el.value = permissionMap[appId] || '';
  });
}

function setEditMode(user) {
  editingUserEmail = normalize(user.user_email).toLowerCase();

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

  clearFieldInvalid();
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
    clearAdminMessage();
  }
}
