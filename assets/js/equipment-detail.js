let currentEquipmentId = '';

function statusLabel(status) {
  const map = {
    IN_USE: '사용중',
    REPAIRING: '수리중',
    INSPECTING: '점검중',
    STORED: '보관',
    DISPOSED: '폐기'
  };
  return map[status] || status || '';
}

function historyTypeLabel(type) {
  const map = {
    REPAIR: '수리',
    REGULAR_CHECK: '정기점검',
    LEGAL_INSPECTION: '법정검사',
    PREVENTIVE: '예방점검',
    ETC: '기타'
  };
  return map[type] || type || '';
}

function conditionStatusLabel(type) {
  const map = {
    NORMAL: '정상',
    NEED_REPAIR: '수리필요',
    LOCATION_MISMATCH: '위치불일치',
    MISSING: '분실의심',
    DISPOSAL_TARGET: '폐기대상'
  };
  return map[type] || type || '';
}

function renderDetail(item) {
  const detailArea = qs('#detailArea');

  detailArea.innerHTML = `
    <div class="detail-label">장비번호</div><div class="detail-value">${escapeHtml(item.equipment_id)}</div>
    <div class="detail-label">장비명</div><div class="detail-value">${escapeHtml(item.equipment_name)}</div>
    <div class="detail-label">모델명</div><div class="detail-value">${escapeHtml(item.model_name)}</div>
    <div class="detail-label">사용부서</div><div class="detail-value">${escapeHtml(item.department)}</div>
    <div class="detail-label">제조사</div><div class="detail-value">${escapeHtml(item.manufacturer)}</div>
    <div class="detail-label">제조일자</div><div class="detail-value">${escapeHtml(item.manufacture_date)}</div>
    <div class="detail-label">시리얼번호</div><div class="detail-value">${escapeHtml(item.serial_no)}</div>
    <div class="detail-label">구매처</div><div class="detail-value">${escapeHtml(item.vendor)}</div>
    <div class="detail-label">담당자</div><div class="detail-value">${escapeHtml(item.manager_name)}</div>
    <div class="detail-label">연락처</div><div class="detail-value">${escapeHtml(item.manager_phone)}</div>
    <div class="detail-label">취득가액</div><div class="detail-value">${formatNumber(item.acquisition_cost)}</div>
    <div class="detail-label">유지보수 종료일</div><div class="detail-value">${escapeHtml(item.maintenance_end_date)}</div>
    <div class="detail-label">상태</div><div class="detail-value"><span class="badge">${escapeHtml(statusLabel(item.status))}</span></div>
    <div class="detail-label">위치</div><div class="detail-value">${escapeHtml(item.location)}</div>
    <div class="detail-label">현재 사용자</div><div class="detail-value">${escapeHtml(item.current_user)}</div>
    <div class="detail-label">비고</div><div class="detail-value">${nl2br(item.memo)}</div>
    <div class="detail-label">등록일시</div><div class="detail-value">${escapeHtml(item.created_at)}</div>
    <div class="detail-label">수정일시</div><div class="detail-value">${escapeHtml(item.updated_at)}</div>
  `;
}

function renderHistories(items) {
  const area = qs('#historyArea');

  if (!items.length) {
    area.innerHTML = `<div class="empty-box">등록된 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = items.map(item => `
    <div style="padding: 14px 0; border-bottom: 1px solid #e5e7eb;">
      <div style="font-weight: 700; margin-bottom: 6px;">${escapeHtml(historyTypeLabel(item.history_type))}</div>
      <div class="sub-text">처리일자: ${escapeHtml(item.work_date)}</div>
      <div class="sub-text">처리업체: ${escapeHtml(item.vendor_name)}</div>
      <div class="sub-text">수리금액: ${formatNumber(item.amount)}</div>
      <div style="margin-top: 8px;">${nl2br(item.description)}</div>
    </div>
  `).join('');
}

function renderInventoryLogs(items) {
  const area = qs('#inventoryArea');

  if (!items.length) {
    area.innerHTML = `<div class="empty-box">등록된 재고조사 이력이 없습니다.</div>`;
    return;
  }

  area.innerHTML = items.map(item => `
    <div style="padding: 14px 0; border-bottom: 1px solid #e5e7eb;">
      <div style="font-weight: 700; margin-bottom: 6px;">${escapeHtml(conditionStatusLabel(item.condition_status))}</div>
      <div class="sub-text">점검일시: ${escapeHtml(item.checked_at)}</div>
      <div class="sub-text">점검자: ${escapeHtml(item.checked_by)}</div>
      <div class="sub-text">부서: ${escapeHtml(item.department_at_check)}</div>
      <div class="sub-text">위치: ${escapeHtml(item.location_at_check)}</div>
      <div style="margin-top: 8px;">${nl2br(item.memo)}</div>
    </div>
  `).join('');
}

async function loadEquipmentDetail() {
  clearMessage();

  const id = getQueryParam('id');
  currentEquipmentId = id;

  if (!id) {
    showMessage('장비 ID가 없습니다.', 'error');
    return;
  }

  try {
    const [detailResult, historyResult, inventoryResult] = await Promise.all([
      apiGet('getEquipment', { id }),
      apiGet('listHistories', { equipment_id: id }),
      apiGet('listInventoryLogs', { equipment_id: id })
    ]);

    renderDetail(detailResult.data);
    renderHistories(historyResult.data || []);
    renderInventoryLogs(inventoryResult.data || []);
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

async function deleteCurrentEquipment() {
  if (!currentEquipmentId) return;

  const confirmed = confirm('이 장비를 삭제하시겠습니까?');
  if (!confirmed) return;

  try {
    await apiPost('deleteEquipment', {
      equipment_id: currentEquipmentId,
      deleted_by: 'admin@hospital.com'
    });

    alert('삭제되었습니다.');
    location.href = 'equipment-list.html';
  } catch (error) {
    showMessage(error.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#deleteBtn').addEventListener('click', deleteCurrentEquipment);
  loadEquipmentDetail();
});
