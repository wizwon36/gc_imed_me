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

function renderEquipmentRows(items) {
  const tbody = qs('#equipmentTableBody');

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-box">조회 결과가 없습니다.</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items.map(item => `
    <tr>
      <td>${escapeHtml(item.equipment_id)}</td>
      <td>${escapeHtml(item.equipment_name)}</td>
      <td>${escapeHtml(item.model_name)}</td>
      <td>${escapeHtml(item.department)}</td>
      <td>${escapeHtml(item.serial_no)}</td>
      <td>${escapeHtml(item.manufacturer)}</td>
      <td><span class="badge">${escapeHtml(statusLabel(item.status))}</span></td>
      <td>${escapeHtml(item.location)}</td>
      <td>
        <button class="btn" onclick="goToDetail('${escapeHtml(item.equipment_id)}')">보기</button>
      </td>
    </tr>
  `).join('');
}

async function loadEquipments() {
  clearMessage();

  const params = {
    keyword: qs('#keyword').value.trim(),
    department: qs('#department').value.trim(),
    status: qs('#status').value,
    manufacturer: qs('#manufacturer').value.trim()
  };

  try {
    const result = await apiGet('listEquipments', params);
    renderEquipmentRows(result.data || []);
  } catch (error) {
    showMessage(error.message, 'error');
    renderEquipmentRows([]);
  }
}

function resetSearchForm() {
  qs('#keyword').value = '';
  qs('#department').value = '';
  qs('#status').value = '';
  qs('#manufacturer').value = '';
  loadEquipments();
}

document.addEventListener('DOMContentLoaded', () => {
  qs('#searchBtn').addEventListener('click', loadEquipments);
  qs('#resetBtn').addEventListener('click', resetSearchForm);
  loadEquipments();
});
