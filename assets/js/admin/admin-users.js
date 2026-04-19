let currentSessionUser = null;
let editingUserEmail = '';
let allUsers = [];
let hasLoadedUsers = false;
let orgBinder = null;

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
    await initializeOrgData();
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
  document.getElementById('loadPendingBtn')?.addEventListener('click', loadPendingRegistrations);

  // 가입신청 목록 이벤트 위임 (승인 / 거절)
  document.getElementById('pendingList')?.addEventListener('click', async (event) => {
    const approveBtn = event.target.closest('.js-approve');
    if (approveBtn) {
      await handleApprove(approveBtn.dataset.id);
      return;
    }
    const rejectBtn = event.target.closest('.js-reject');
    if (rejectBtn) {
      await handleReject(rejectBtn.dataset.id);
    }
  });

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
  });

  // 아이디 입력 시 허용되지 않는 문자 실시간 제거 (한글·공백·특수문자)
  document.getElementById('userEmail')?.addEventListener('input', (e) => {
    const raw = e.target.value;
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (raw !== cleaned) e.target.value = cleaned;
    e.target.classList.remove('is-invalid');
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
  return String(currentSessionUser?.email || currentSessionUser?.user_email || '')
    .trim()
    .toLowerCase();
}

async function initializeOrgData() {
  await window.orgSelect.loadOrgData();

  window.orgSelect.fillSelectOptions(
    document.getElementById('clinic_code'),
    window.orgSelect.getClinics(),
    { emptyText: '의원을 선택하세요' }
  );

  window.orgSelect.fillSelectOptions(
    document.getElementById('userFilterClinic'),
    window.orgSelect.getClinics(),
    { emptyText: '전체 의원' }
  );

  window.orgSelect.fillSelectOptions(
    document.getElementById('team_code'),
    [],
    { emptyText: '팀을 선택하세요' }
  );

  orgBinder = window.orgSelect.bindClinicTeamSelects({
    clinicSelect: document.getElementById('clinic_code'),
    teamSelect: document.getElementById('team_code')
  });
}

function buildDepartmentText(clinicName, teamName) {
  const clinic = normalize(clinicName);
  const team = normalize(teamName);

  if (clinic && team) return `${clinic} / ${team}`;
  if (team) return team;
  if (clinic) return clinic;
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

function buildUserOrgPayload() {
  const clinicEl = document.getElementById('clinic_code');
  const teamEl = document.getElementById('team_code');

  return {
    clinic_code: normalize(clinicEl?.value),
    team_code: normalize(teamEl?.value)
  };
}

function validateUserForm(data) {
  clearFieldInvalid();

  if (!data.user_email) {
    markFieldInvalid('userEmail');
    throw new Error('아이디를 입력해 주세요.');
  }

  // 아이디 형식 검증: 영문 소문자·숫자·점·하이픈·언더바만 허용
  if (!/^[a-z0-9._-]+$/.test(data.user_email)) {
    markFieldInvalid('userEmail');
    throw new Error('아이디는 영문 소문자, 숫자, 점(.), 하이픈(-), 언더바(_)만 사용할 수 있습니다.');
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
    team_code: org.team_code,

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
    team_code: org.team_code,

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

    const clinicSelect = document.getElementById('clinic_code');
    if (clinicSelect) {
      clinicSelect.value = user.clinic_code || '';
    }

    if (orgBinder?.renderTeamsByClinic) {
      orgBinder.renderTeamsByClinic(user.clinic_code || '', user.team_code || '');
    } else {
      window.orgSelect.fillSelectOptions(
        document.getElementById('team_code'),
        [],
        { emptyText: '팀을 선택하세요' }
      );
      document.getElementById('team_code').value = user.team_code || '';
    }

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

  const clinicSelect = document.getElementById('clinic_code');
  const teamSelect = document.getElementById('team_code');

  if (clinicSelect) {
    clinicSelect.value = '';
  }

  if (teamSelect) {
    window.orgSelect.fillSelectOptions(teamSelect, [], {
      emptyText: '팀을 선택하세요'
    });
  }

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
    passwordHint.innerHTML = '수정 모드에서는 아이디를 변경할 수 없습니다. 비밀번호 초기화는 우측 목록에서 진행할 수 있습니다.';
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


// ── 가입 신청 관리 ──

function setPendingMessage(message, type = '') {
  const el = document.getElementById('pendingMessage');
  if (!el) return;
  el.textContent = message || '';
  el.className = 'message-box';
  if (type) el.classList.add(type);
}

async function loadPendingRegistrations() {
  const listEl = document.getElementById('pendingList');
  const countEl = document.getElementById('pendingListCount');
  const btn = document.getElementById('loadPendingBtn');

  if (btn) btn.disabled = true;
  setPendingMessage('');
  showGlobalLoading('가입 신청 목록을 불러오는 중...');

  try {
    const result = await apiGet('listPendingRegistrations', {
      request_user_email: getRequestUserEmail()
    });

    const list = Array.isArray(result.data) ? result.data : [];

    if (countEl) {
      countEl.textContent = list.length > 0
        ? `대기 중인 신청 ${list.length}건`
        : '대기 중인 신청이 없습니다.';
    }

    if (!list.length) {
      listEl.innerHTML = `<div class="user-list-empty">대기 중인 가입 신청이 없습니다.</div>`;
      return;
    }

    listEl.innerHTML = list.map(item => {
      const id = escapeHtml(item.id || item.reg_id || '');
      const name = escapeHtml(item.user_name || '');
      const email = escapeHtml(item.user_email || '');
      const org = escapeHtml(
        item.clinic_name && item.team_name
          ? `${item.clinic_name} / ${item.team_name}`
          : item.clinic_name || item.team_name || '소속 미입력'
      );
      const phone = escapeHtml(item.phone || '연락처 없음');
      const memo = item.memo ? `<div class="pending-item__memo">💬 ${escapeHtml(item.memo)}</div>` : '';
      const appliedAt = escapeHtml(item.created_at || item.applied_at || '');

      return `
        <div class="pending-item" data-id="${id}">
          <div class="pending-item__main">
            <div class="pending-item__title">
              <strong>${name}</strong>
              <span>${email}</span>
            </div>
            <div class="pending-item__meta">
              <span>📍 ${org}</span>
              <span>📞 ${phone}</span>
              ${appliedAt ? `<span>🕐 ${appliedAt}</span>` : ''}
            </div>
            ${memo}
          </div>
          <div class="pending-item__actions">
            <button type="button" class="admin-btn small approve js-approve" data-id="${id}">✅ 승인</button>
            <button type="button" class="admin-btn small danger js-reject" data-id="${id}">❌ 거절</button>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    setPendingMessage(err.message || '신청 목록을 불러오지 못했습니다.', 'error');
    if (listEl) listEl.innerHTML = `<div class="user-list-empty">불러오기 실패. 다시 시도해 주세요.</div>`;
  } finally {
    if (btn) btn.disabled = false;
    hideGlobalLoading();
  }
}

async function handleApprove(regId) {
  if (!regId) return;

  const confirmed = confirm('신청을 승인하시겠습니까?\n초기 비밀번호 1111로 계정이 생성됩니다.');
  if (!confirmed) return;

  showGlobalLoading('승인 처리 중...');
  setPendingMessage('');

  try {
    const result = await apiPost('approveRegistration', {
      request_user_email: getRequestUserEmail(),
      reg_id: regId
    });
    setPendingMessage(result.message || '승인이 완료되었습니다.', 'success');
  } catch (err) {
    setPendingMessage(err.message || '승인 처리 중 오류가 발생했습니다.', 'error');
    return;
  } finally {
    hideGlobalLoading();
  }

  // 스피너를 완전히 끈 뒤 목록 새로고침 (loadPendingRegistrations가 자체 스피너 관리)
  await loadPendingRegistrations();
}

async function handleReject(regId) {
  if (!regId) return;

  const reason = prompt('거절 사유를 입력하세요 (선택사항):');
  if (reason === null) return;

  showGlobalLoading('거절 처리 중...');
  setPendingMessage('');

  try {
    const result = await apiPost('rejectRegistration', {
      request_user_email: getRequestUserEmail(),
      reg_id: regId,
      reason: String(reason || '').trim()
    });
    setPendingMessage(result.message || '거절 처리가 완료되었습니다.', 'success');
  } catch (err) {
    setPendingMessage(err.message || '거절 처리 중 오류가 발생했습니다.', 'error');
    return;
  } finally {
    hideGlobalLoading();
  }

  await loadPendingRegistrations();
}
