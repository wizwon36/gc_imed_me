/**
 * signage-form.js
 * 사인물 / 명판 제작 신청 폼 컨트롤러
 */

const NAMEPLATE_SIZES = {
  A: '높이 5cm (20cm / 16cm)',
  B: '높이 4cm (20cm / 18cm)',
  C: '높이 3cm (20cm / 18cm)',
  D: '높이 2.5cm (20cm)'
};

const MAX_SINGLE_FILE_MB = 10;
const MAX_TOTAL_FILE_MB  = 20;
const MAX_SINGLE_BYTES   = MAX_SINGLE_FILE_MB * 1024 * 1024;
const MAX_TOTAL_BYTES    = MAX_TOTAL_FILE_MB  * 1024 * 1024;

const uploadedFileIds   = { main: [], location: [], reference: [] };
const uploadedFileSizes = { main: [], location: [], reference: [] };
let pendingUploads = 0;
let isSubmitting = false;

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = window.auth?.requireAuth?.();
  if (!user) return;

  const isHistAdmin = await window.appPermission?.hasPermission?.('signage', ['admin'])
    || String(user.role || '').trim().toLowerCase() === 'admin';

  // admin이면 이력 탭 설명 변경
  if (isHistAdmin) {
    const heroDesc = document.getElementById('historyHeroDesc');
    if (heroDesc) heroDesc.textContent = '전체 사인물 제작 신청 내역을 조회합니다.';
  }

  // ── 폼 데이터 초기화
  // 스피너는 여기서만 — 버튼 바인딩 전에 완료해야 스피너가 클릭을 막는 버그 방지
  try {
    showGlobalLoading('화면을 준비하는 중...');

    await window.orgSelect.loadOrgData();
    prefillUserInfo(user);

    if (typeof NAMEPLATE_IMAGES !== 'undefined') {
      const el = document.getElementById('layoutImg');
      if (el) el.src = NAMEPLATE_IMAGES.layout || '';
    }
  } catch (err) {
    showMessage(err.message || '초기화 중 오류가 발생했습니다.', 'error');
  } finally {
    hideGlobalLoading();
  }

  // ── 폼 이벤트 바인딩 (스피너 해제 후 등록 — 스피너가 클릭을 막는 현상 방지) ──
  bindTypeSelector();
  bindUrgentToggle();
  bindFileDropzones();
  bindNameplateTypeSelector();
  document.getElementById('signageForm').addEventListener('submit', handleSubmit);

  // ── 탭 전환 (topbar 버튼) ──────────────────────────────────────
  function switchTab(tab) {
    const btnHistory = document.getElementById('tabBtnHistory');
    const btnForm    = document.getElementById('tabBtnForm');

    if (btnHistory) btnHistory.style.display = tab === 'form'    ? '' : 'none';
    if (btnForm)    btnForm.style.display    = tab === 'history' ? '' : 'none';

    document.querySelectorAll('.signage-tab-pane').forEach(p => p.classList.remove('is-active'));
    document.getElementById(tab === 'form' ? 'tabPaneForm' : 'tabPaneHistory').classList.add('is-active');

    if (tab === 'history' && !histLoaded) histFetchList();
  }

  document.getElementById('tabBtnHistory')?.addEventListener('click', () => switchTab('history'));
  document.getElementById('tabBtnForm')?.addEventListener('click',    () => switchTab('form'));

  // ── 이력 탭 초기화 ─────────────────────────────────────────────
  const today   = histTodayYmd();
  const weekAgo = histDateOffset(-7);
  const fromEl  = document.getElementById('histFilterDateFrom');
  const toEl    = document.getElementById('histFilterDateTo');
  if (fromEl) { fromEl.value = weekAgo; fromEl.max = today; }
  if (toEl)   { toEl.value   = today;   toEl.max   = today; }

  // 의원·팀 필터: admin이 아닌 경우 숨김
  const clinicWrap = document.getElementById('histFilterClinicWrap');
  const teamWrap   = document.getElementById('histFilterTeamWrap');
  if (!isHistAdmin) {
    if (clinicWrap) clinicWrap.style.display = 'none';
    if (teamWrap)   teamWrap.style.display   = 'none';
  }

  // 의원·팀 셀렉트 채우기 (orgSelect는 이미 loadOrgData 완료됨)
  const clinicSel = document.getElementById('histFilterClinic');
  const teamSel   = document.getElementById('histFilterTeam');

  if (clinicSel) {
    (window.orgSelect?.getClinics?.() || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value       = c.code_value;
      opt.textContent = c.code_name;
      clinicSel.appendChild(opt);
    });

    clinicSel.addEventListener('change', () => {
      const code = clinicSel.value;
      while (teamSel.options.length > 1) teamSel.remove(1);
      if (code) {
        const teams = (window.orgSelect?.getTeams?.() || [])
          .filter(t => (t.parent_code || t.parentCode || t.clinic_code) === code);
        teams.forEach(t => {
          const opt = document.createElement('option');
          opt.value       = t.code_value;
          opt.textContent = t.code_name;
          teamSel.appendChild(opt);
        });
        teamSel.disabled = teams.length === 0;
      } else {
        teamSel.disabled = true;
      }
      teamSel.value = '';
    });
  }

  document.getElementById('histSearchBtn')?.addEventListener('click', histFetchList);
  document.getElementById('histExportBtn')?.addEventListener('click', histExportExcel);

  ['histFilterKeyword', 'histFilterType', 'histFilterUrgent',
   'histFilterClinic', 'histFilterTeam', 'histFilterDateFrom', 'histFilterDateTo']
    .forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') histFetchList();
      });
    });

  document.getElementById('histModalBackdrop')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) histCloseModal();
  });
  document.getElementById('histModalClose')?.addEventListener('click', histCloseModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') histCloseModal(); });

  // ── 이력: 상태 변수 ────────────────────────────────────────────
  const HIST_PAGE_SIZE = 20;
  let histAllRows  = [];
  let histLoaded   = false;
  let histCurPage  = 1;
  let histTotPages = 1;

  document.getElementById('histPrevBtn')?.addEventListener('click', () => {
    if (histCurPage > 1) { histCurPage--; histRenderPage(); }
  });
  document.getElementById('histNextBtn')?.addEventListener('click', () => {
    if (histCurPage < histTotPages) { histCurPage++; histRenderPage(); }
  });

  // ── 이력: 데이터 조회 ───────────────────────────────────────────
  async function histFetchList() {
    const email    = (user.user_email || user.email || '').trim().toLowerCase();
    const keyword  = histGetVal('histFilterKeyword');
    const type     = histGetVal('histFilterType');
    const urgent   = histGetVal('histFilterUrgent');
    const clinic   = histGetVal('histFilterClinic');
    const team     = histGetVal('histFilterTeam');
    const dateFrom = histGetVal('histFilterDateFrom');
    const dateTo   = histGetVal('histFilterDateTo');

    if (!dateFrom || !dateTo) { histShowMsg('조회 기간을 입력해 주세요.', 'error'); return; }
    const diff = (new Date(dateTo) - new Date(dateFrom)) / 86400000;
    if (diff < 0)  { histShowMsg('종료일이 시작일보다 앞에 있습니다.', 'error'); return; }
    if (diff > 90) { histShowMsg('조회 기간은 최대 3개월(90일)까지 가능합니다.', 'error'); return; }

    histClearMsg();

    const params = { request_user_email: email, date_from: dateFrom, date_to: dateTo };
    if (!isHistAdmin) params.target_user_email = email;
    if (keyword) params.keyword     = keyword;
    if (type)    params.type        = type;
    if (urgent)  params.is_urgent   = urgent;
    if (clinic)  params.clinic_code = clinic;
    if (team)    params.team_code   = team;

    const searchBtn = document.getElementById('histSearchBtn');
    try {
      if (searchBtn) { searchBtn.disabled = true; searchBtn.textContent = '조회 중...'; }
      showGlobalLoading('신청 이력을 불러오는 중...');
      const result = await window.apiGet('listSignageRequests', params);
      histAllRows  = Array.isArray(result.data) ? result.data : [];
      histLoaded   = true;
      histCurPage  = 1;
      histTotPages = histAllRows.length === 0 ? 1 : Math.ceil(histAllRows.length / HIST_PAGE_SIZE);
      histRenderPage();
    } catch (err) {
      histShowMsg(err.message || '신청 이력을 불러오지 못했습니다.', 'error');
      histRenderPage();
    } finally {
      hideGlobalLoading();
      if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = '조회'; }
    }
  }

  // ── 이력: 페이지 렌더링 ─────────────────────────────────────────
  function histRenderPage() {
    const rows      = histAllRows;
    const total     = rows.length;
    const exportBtn = document.getElementById('histExportBtn');
    const countEl   = document.getElementById('histListCount');
    const prevBtn   = document.getElementById('histPrevBtn');
    const nextBtn   = document.getElementById('histNextBtn');
    const pageInfo  = document.getElementById('histPageInfo');

    if (exportBtn) exportBtn.style.display = (isHistAdmin && total) ? '' : 'none';

    if (!total) {
      if (countEl) countEl.textContent = histLoaded ? '조회된 신청 내역이 없습니다.' : '조회 버튼을 눌러 주세요.';
      [prevBtn, nextBtn, pageInfo].forEach(el => { if (el) el.style.display = 'none'; });
      histRenderTable([]);
      return;
    }

    if (countEl) countEl.textContent = `총 ${total.toLocaleString()}건 (${histCurPage} / ${histTotPages} 페이지)`;

    const showPaging = histTotPages > 1;
    [prevBtn, nextBtn, pageInfo].forEach(el => { if (el) el.style.display = showPaging ? '' : 'none'; });
    if (prevBtn)  prevBtn.disabled  = histCurPage <= 1;
    if (nextBtn)  nextBtn.disabled  = histCurPage >= histTotPages;
    if (pageInfo) pageInfo.textContent = `${histCurPage} / ${histTotPages}`;

    const start = (histCurPage - 1) * HIST_PAGE_SIZE;
    histRenderTable(rows.slice(start, start + HIST_PAGE_SIZE));
  }

  // ── 이력: 테이블 행 렌더링 ──────────────────────────────────────
  function histRenderTable(rows) {
    const tbody = document.getElementById('histTableBody');
    if (!tbody) return;

    if (!rows.length) {
      tbody.innerHTML = `
        <tr><td colspan="8">
          <div class="hist-table-empty">
            <div class="hist-table-empty-icon">🪧</div>
            <div>${histLoaded ? '조건에 맞는 신청 내역이 없습니다.' : '조건을 설정한 뒤 <strong>조회</strong> 버튼을 눌러 주세요.'}</div>
          </div>
        </td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(histBuildRow).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const row = histAllRows.find(r => r.request_id === tr.dataset.id);
        if (row) histOpenModal(row);
      });
    });
  }

  function histBuildRow(row) {
    const typeLabel = { NAMEPLATE: '규격 명판', SIGN: '일반 사인물' }[row.type] || row.type;
    const content = row.text_content || row.nameplate_text || '-';
    return `
      <tr data-id="${hesc(row.request_id)}">
        <td style="text-align:center; font-size:12px; color:#64748b; font-weight:700;">${hesc(row.request_id)}</td>
        <td style="text-align:center;">${hesc(String(row.created_at || '-').slice(0, 10))}</td>
        <td style="text-align:center;"><span class="hist-badge hist-badge-${hesc(row.type)}">${hesc(typeLabel)}</span></td>
        <td style="text-align:center;">${hesc(row.clinic_name || '-')}</td>
        <td style="text-align:center;">${hesc(row.team_name || row.department || '-')}</td>
        <td style="text-align:center;">${hesc(row.requester_name || '-')}</td>
        <td style="text-align:center;">${hesc(String(row.quantity || 1))}</td>
        <td class="wrap">${hesc(content)}</td>
      </tr>`;
  }

  // ── 이력: 모달 ──────────────────────────────────────────────────
  function histOpenModal(row) {
    const ENV    = { INDOOR: '실내', OUTDOOR: '실외' };
    const typeLabel = { NAMEPLATE: '규격 명판', SIGN: '일반 사인물' }[row.type] || row.type;

    const commonHtml = `
      <div class="shm-section">
        <p class="shm-section-title">📋 신청 정보</p>
        <div class="shm-grid">
          <div class="shm-item"><div class="shm-item-label">신청번호</div><div class="shm-item-value">${hesc(row.request_id)}</div></div>
          <div class="shm-item"><div class="shm-item-label">제작 종류</div><div class="shm-item-value">${hesc(typeLabel)}</div></div>
          <div class="shm-item"><div class="shm-item-label">긴급 여부</div><div class="shm-item-value">${row.is_urgent === 'Y' ? '🚨 긴급' + (row.urgent_reason ? ' — ' + hesc(row.urgent_reason) : '') : '일반'}</div></div>
          <div class="shm-item"><div class="shm-item-label">부서</div><div class="shm-item-value">${hesc(row.team_name || row.department || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">요청자</div><div class="shm-item-value">${hesc(row.requester_name || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">연락처</div><div class="shm-item-value">${hesc(row.contact || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">수량</div><div class="shm-item-value">${hesc(String(row.quantity || 1))}개</div></div>
        </div>
      </div>`;

    const detailHtml = row.type === 'NAMEPLATE' ? `
      <div class="shm-section">
        <p class="shm-section-title">🏷 명판 상세</p>
        <div class="shm-grid">
          <div class="shm-item"><div class="shm-item-label">명판 타입</div><div class="shm-item-value">${hesc(row.nameplate_type || '-')} 타입</div></div>
          <div class="shm-item"><div class="shm-item-label">설치 환경</div><div class="shm-item-value">${hesc(ENV[row.install_env] || '-')}</div></div>
        </div>
        ${row.nameplate_text ? `<div class="shm-grid single" style="margin-top:8px;"><div class="shm-item"><div class="shm-item-label">명판 문구</div><div class="shm-item-value">${hesc(row.nameplate_text)}</div></div></div>` : ''}
      </div>` : `
      <div class="shm-section">
        <p class="shm-section-title">🪧 사인물 상세</p>
        <div class="shm-grid">
          <div class="shm-item"><div class="shm-item-label">사이즈</div><div class="shm-item-value">${hesc(row.sign_size || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">형태/종류</div><div class="shm-item-value">${hesc(row.sign_type || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">설치 환경</div><div class="shm-item-value">${hesc(ENV[row.install_env] || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">설치 위치</div><div class="shm-item-value">${hesc(row.install_location || '-')}</div></div>
        </div>
        ${row.text_content ? `<div class="shm-grid single" style="margin-top:8px;"><div class="shm-item"><div class="shm-item-label">문구</div><div class="shm-item-value">${hesc(row.text_content)}</div></div></div>` : ''}
      </div>`;

    const metaHtml = `
      <div class="shm-section">
        <p class="shm-section-title">🕐 신청 메타</p>
        <div class="shm-grid">
          <div class="shm-item"><div class="shm-item-label">신청일시</div><div class="shm-item-value">${hesc(row.created_at || '-')}</div></div>
          <div class="shm-item"><div class="shm-item-label">신청계정</div><div class="shm-item-value">${hesc(row.created_by || '-')}</div></div>
        </div>
      </div>`;

    document.getElementById('histModalTitle').textContent = typeLabel + ' 신청 상세';
    document.getElementById('histModalBody').innerHTML = commonHtml + detailHtml + metaHtml;
    document.getElementById('histModalBackdrop').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function histCloseModal() {
    document.getElementById('histModalBackdrop').classList.remove('is-open');
    document.body.style.overflow = '';
  }

  // ── 이력: 엑셀 내보내기 (admin 전용) ────────────────────────────
  function histExportExcel() {
    if (!window.XLSX) { alert('엑셀 라이브러리를 불러오지 못했습니다.'); return; }
    if (!histAllRows.length) { alert('다운로드할 데이터가 없습니다.'); return; }

    const exportBtn = document.getElementById('histExportBtn');
    try {
      if (exportBtn) { exportBtn.disabled = true; exportBtn.textContent = '다운로드 중...'; }

      const TYPE_LABEL = { NAMEPLATE: '규격 명판', SIGN: '일반 사인물' };
      const headers = ['신청번호', '신청일자', '종류', '소속 의원', '소속 부서', '신청인', '수량', '신청 내용'];

      const FONT_BASE   = { name: '맑은 고딕', sz: 10 };
      const FONT_HEADER = { name: '맑은 고딕', sz: 10, bold: true, color: { rgb: '1F3864' } };
      const FILL_HEADER = { patternType: 'solid', fgColor: { rgb: 'B8CCE4' } };
      const BORDER = {
        top:    { style: 'thin', color: { rgb: 'BFBFBF' } },
        bottom: { style: 'thin', color: { rgb: 'BFBFBF' } },
        left:   { style: 'thin', color: { rgb: 'BFBFBF' } },
        right:  { style: 'thin', color: { rgb: 'BFBFBF' } }
      };
      const ALIGN_LEFT   = { horizontal: 'left',   vertical: 'center' };
      const ALIGN_CENTER = { horizontal: 'center', vertical: 'center' };

      const COL_DATE = new Set([1]);
      const COL_NUM  = new Set([6]);

      const rowData = histAllRows.map(r => {
        const content = r.text_content || r.nameplate_text || '';
        return [
          r.request_id     || '',
          String(r.created_at || '').slice(0, 10),
          TYPE_LABEL[r.type] || r.type || '',
          r.clinic_name    || '',
          r.team_name      || r.department || '',
          r.requester_name || '',
          Number(r.quantity || 1),
          content
        ];
      });

      const ws = {};
      const totalCols = headers.length;
      const totalRows = rowData.length + 1;

      headers.forEach((h, c) => {
        ws[window.XLSX.utils.encode_cell({ r: 0, c })] = {
          v: h, t: 's',
          s: { font: FONT_HEADER, fill: FILL_HEADER, border: BORDER, alignment: ALIGN_CENTER }
        };
      });

      rowData.forEach((row, r) => {
        row.forEach((val, c) => {
          const isDate = COL_DATE.has(c);
          const isNum  = COL_NUM.has(c);
          const cell = {
            v: val, t: isNum ? 'n' : 's',
            s: { font: FONT_BASE, border: BORDER, alignment: (isDate || isNum) ? ALIGN_CENTER : ALIGN_LEFT }
          };
          if (isDate && val) { cell.z = 'yyyy-mm-dd'; }
          ws[window.XLSX.utils.encode_cell({ r: r + 1, c })] = cell;
        });
      });

      ws['!ref']  = window.XLSX.utils.encode_range({ r: 0, c: 0 }, { r: totalRows - 1, c: totalCols - 1 });
      ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 40 }];
      ws['!rows'] = Array(totalRows).fill({ hpt: 18 });

      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, '사인물신청이력');

      const now = new Date();
      const dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      window.XLSX.writeFile(wb, `사인물신청이력_${dateStr}.xlsx`);
    } catch (err) {
      alert(err.message || '엑셀 다운로드 중 오류가 발생했습니다.');
    } finally {
      if (exportBtn) { exportBtn.disabled = false; exportBtn.textContent = '📥 엑셀 다운로드'; }
    }
  }

  // ── 이력: 유틸 ──────────────────────────────────────────────────
  function hesc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function histGetVal(id) { return (document.getElementById(id)?.value || '').trim(); }
  function histTodayYmd() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function histDateOffset(days) {
    const d = new Date(); d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function histShowMsg(msg, type) {
    const box = document.getElementById('historyMsgBox');
    if (!box) return;
    box.className = `message-box ${type}`;
    box.textContent = msg;
    box.style.display = 'block';
  }
  function histClearMsg() {
    const box = document.getElementById('historyMsgBox');
    if (!box) return;
    box.style.display = 'none';
    box.textContent = '';
  }
});

// ─────────────────────────────────────────────
// 로그인 유저 정보 자동 입력
// ─────────────────────────────────────────────
function prefillUserInfo(user) {
  setVal('clinic_code', user.clinic_code || '');
  setVal('team_code',   user.team_code   || '');

  const clinics = window.orgSelect.getClinics();
  const teams   = window.orgSelect.getTeams();

  const clinicName = resolveOrgName(user.clinic_name, user.clinic_code, clinics);
  const teamName   = resolveOrgName(user.team_name,   user.team_code,   teams);

  setVal('clinic_name_display', clinicName);
  setVal('team_name_display',   teamName);
  setVal('requester_name', user.name      || user.user_name  || '');
  setVal('contact',        user.phone     || '');
}

function resolveOrgName(sessionName, code, list) {
  if (sessionName && String(sessionName).trim()) return String(sessionName).trim();
  if (!code || !Array.isArray(list) || !list.length) return '';
  const found = list.find(item =>
    String(item.code_value || '').trim() === String(code || '').trim()
  );
  return found ? String(found.code_name || '').trim() : '';
}

// ─────────────────────────────────────────────
// 제작 종류 선택
// ─────────────────────────────────────────────
function bindTypeSelector() {
  document.querySelectorAll('input[name="type"]').forEach(radio => {
    radio.addEventListener('change', handleTypeChange);
  });
}

function handleTypeChange(e) {
  const type = e.target.value;

  document.querySelectorAll('.signage-type-card').forEach(c => c.classList.remove('is-selected'));
  document.getElementById('typeCard_' + type)?.classList.add('is-selected');

  showEl('sectionCommon');
  showEl('formActions');

  if (type === 'SIGN') {
    showEl('sectionSign');
    hideEl('sectionNameplate');
    setRequired('sign_size', true);
    setRequired('sign_type', true);
    setRequired('install_env', true);
    setRequired('install_location', true);
    setRequired('install_env_nameplate', false);
    setRequired('nameplate_text', false);
  } else {
    hideEl('sectionSign');
    showEl('sectionNameplate');
    setRequired('sign_size', false);
    setRequired('sign_type', false);
    setRequired('install_env', false);
    setRequired('install_location', false);
    setRequired('install_env_nameplate', true);
    setRequired('nameplate_text', true);
  }

  setTimeout(() => {
    document.getElementById('sectionCommon')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}

// ─────────────────────────────────────────────
// 긴급 여부 토글
// ─────────────────────────────────────────────
function bindUrgentToggle() {
  document.getElementById('is_urgent')?.addEventListener('change', function () {
    const isUrgent = this.value === 'Y';
    const field = document.getElementById('urgentReasonField');
    if (field) field.style.display = isUrgent ? '' : 'none';
    setRequired('urgent_reason', isUrgent);
  });
}

// ─────────────────────────────────────────────
// 명판 타입 선택 → 디자인 이미지 표시
// ─────────────────────────────────────────────
function bindNameplateTypeSelector() {
  document.querySelectorAll('input[name="nameplate_type"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const type = e.target.value;

      document.querySelectorAll('.signage-np-card').forEach(c => c.classList.remove('is-selected'));
      document.getElementById('npCard_' + type)?.classList.add('is-selected');

      if (typeof NAMEPLATE_IMAGES !== 'undefined') {
        const designImg = document.getElementById('nameplateDesignImg');
        if (designImg) designImg.src = NAMEPLATE_IMAGES[type] || '';
      }

      const sizeText = document.getElementById('selectedSizeText');
      if (sizeText) {
        sizeText.textContent = type + ' 타입 — ' + (NAMEPLATE_SIZES[type] || '');
        sizeText.style.display = '';
      }

      const placeholder = document.getElementById('npDesignPlaceholder');
      const designImg = document.getElementById('nameplateDesignImg');
      if (placeholder) placeholder.style.display = 'none';
      if (designImg) designImg.style.display = '';
    });
  });
}

// ─────────────────────────────────────────────
// 드래그 앤 드롭 / 파일 업로드
// ─────────────────────────────────────────────
function bindFileDropzones() {
  bindDrop(null, 'file_main',      'main',      'fileList_main');
  bindDrop(null, 'file_location',  'location',  'fileList_location');
  bindDrop(null, 'file_reference', 'reference', 'fileList_reference');
}

function bindDrop(zoneId, inputId, key, listId) {
  const input = document.getElementById(inputId);
  if (!input) return;

  input.addEventListener('change', e => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      const fileNameKey = inputId.replace('file_', '');
      const fileNameEl = document.getElementById('fileName_' + fileNameKey);
      if (fileNameEl) {
        fileNameEl.textContent = files.length === 1
          ? files[0].name
          : files.length + '개 파일 선택됨';
      }
    }
    processFiles(Array.from(e.target.files), key, listId);
    input.value = '';
  });
}

// ─────────────────────────────────────────────
// 전체 업로드 용량 합산
// ─────────────────────────────────────────────
function getTotalUploadedBytes() {
  return [
    ...uploadedFileSizes.main,
    ...uploadedFileSizes.location,
    ...uploadedFileSizes.reference
  ].reduce((acc, size) => acc + size, 0);
}

function formatFileSize(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function processFiles(files, key, listId) {
  const user      = window.auth?.getSession?.() || {};
  const createdBy = user.user_email || user.email || '';

  for (const file of files) {
    if (file.size > MAX_SINGLE_BYTES) {
      showMessage(
        `파일 용량 초과: "${file.name}" (${formatFileSize(file.size)}) — 개별 파일은 ${MAX_SINGLE_FILE_MB}MB 이하만 가능합니다.`,
        'error'
      );
      continue;
    }

    const currentTotal = getTotalUploadedBytes();
    if (currentTotal + file.size > MAX_TOTAL_BYTES) {
      showMessage(
        `전체 첨부 용량 초과 — 현재 ${formatFileSize(currentTotal)}, 추가 시 ${formatFileSize(currentTotal + file.size)} (최대 ${MAX_TOTAL_FILE_MB}MB)`,
        'error'
      );
      continue;
    }

    pendingUploads++;
    const itemId = 'fi_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const listEl = document.getElementById(listId);

    if (listEl) {
      listEl.insertAdjacentHTML('beforeend',
        `<div class="signage-file-item is-uploading" id="${itemId}">
          <span class="signage-file-item-name">${escapeHtml(file.name)}</span>
          <span class="signage-file-item-status">업로드 중...</span>
        </div>`
      );
    }

    try {
      const base64 = await toBase64(file);
      const res    = await apiPost('uploadSignageFile', {
        file_base64: base64,
        file_name:   file.name,
        created_by:  createdBy
      });
      const fileId = res?.data?.file_id;
      uploadedFileIds[key].push(fileId);
      uploadedFileSizes[key].push(file.size);

      const itemEl = document.getElementById(itemId);
      if (itemEl) {
        itemEl.classList.replace('is-uploading', 'is-done');
        itemEl.querySelector('.signage-file-item-status').textContent = `✓ ${formatFileSize(file.size)}`;
      }
    } catch (err) {
      const itemEl = document.getElementById(itemId);
      if (itemEl) {
        itemEl.classList.replace('is-uploading', 'is-error');
        itemEl.querySelector('.signage-file-item-status').textContent = '업로드 실패';
      }
      showMessage(`"${file.name}" 업로드 실패: ${err.message || '오류'}`, 'error');
    } finally {
      pendingUploads--;
    }

    const previewEmpty = document.getElementById('previewEmpty_' + key);
    if (previewEmpty) previewEmpty.style.display = 'none';
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// 폼 제출
// ─────────────────────────────────────────────
async function handleSubmit(e) {
  e.preventDefault();
  clearMessage();
  if (isSubmitting) return;
  if (pendingUploads > 0) { showMessage('파일 업로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.', 'error'); return; }

  const payload = buildPayload();
  if (!payload) return;

  const submitBtn = document.getElementById('submitBtn');
  try {
    isSubmitting = true;
    setLoading(submitBtn, true, '신청 중...');
    showGlobalLoading('사인물 신청을 처리하는 중...');

    const res = await apiPost('createSignageRequest', payload);
    const notifyEmail = res.data?.notify_email || '';
    const alertMsg = notifyEmail
      ? `신청이 완료되었습니다.\n담당자(${notifyEmail})에게 알림이 전송되었습니다.`
      : '신청이 완료되었습니다.';
    alert(alertMsg);
    location.href = '../../portal.html';
  } catch (err) {
    showMessage(err.message || '신청 중 오류가 발생했습니다.', 'error');
    isSubmitting = false;
  } finally {
    hideGlobalLoading();
    setLoading(submitBtn, false);
  }
}

// ─────────────────────────────────────────────
// Payload 생성
// ─────────────────────────────────────────────
function buildPayload() {
  const user = window.auth?.getSession?.() || {};
  const type = document.querySelector('input[name="type"]:checked')?.value;

  if (!type) {
    showMessage('제작 종류를 선택해 주세요.', 'error');
    document.querySelector('.signage-type-grid')?.scrollIntoView({ behavior: 'smooth' });
    return null;
  }

  const clinicCode = getValue('clinic_code');
  const teamCode   = getValue('team_code');
  const requesterName = getValue('requester_name');
  const contact    = getValue('contact');
  const quantity   = parseInt(getValue('quantity'), 10) || 1;
  const isUrgent   = getValue('is_urgent') || 'N';
  const urgentReason = getValue('urgent_reason');
  const textContent  = getValue('text_content');

  if (!clinicCode)    return fail('의원 정보가 없습니다. 다시 로그인해 주세요.', null);
  if (!teamCode)      return fail('팀 정보가 없습니다. 다시 로그인해 주세요.', null);
  if (!requesterName) return fail('요청자명을 입력해 주세요.', 'requester_name');
  if (!contact)       return fail('연락처를 입력해 주세요.', 'contact');
  if (quantity < 1)   return fail('수량을 1 이상 입력해 주세요.', 'quantity');
  if (isUrgent === 'Y' && !urgentReason) return fail('긴급 사유를 입력해 주세요.', 'urgent_reason');
  if (!textContent)   return fail('문구(텍스트)를 입력해 주세요.', 'text_content');

  if (type === 'SIGN') {
    if (!getValue('sign_size'))        return fail('사이즈를 입력해 주세요.', 'sign_size');
    if (!getValue('sign_type'))        return fail('형태/종류를 입력해 주세요.', 'sign_type');
    if (!getValue('install_env'))      return fail('설치 환경을 선택해 주세요.', 'install_env');
    if (!getValue('install_location')) return fail('설치 위치를 입력해 주세요.', 'install_location');
  } else {
    if (!document.querySelector('input[name="nameplate_type"]:checked')) return fail('명판 타입을 선택해 주세요.', null);
    if (!getValue('install_env_nameplate')) return fail('설치 환경을 선택해 주세요.', 'install_env_nameplate');
    if (!getValue('nameplate_text'))        return fail('명판 문구 상세를 입력해 주세요.', 'nameplate_text');
  }

  return {
    type,
    clinic_code:      clinicCode,
    team_code:        teamCode,
    requester_name:   requesterName,
    contact,
    quantity,
    text_content:     textContent,
    is_urgent:        isUrgent,
    urgent_reason:    urgentReason,
    file_ids:         uploadedFileIds.main,
    location_file_ids: uploadedFileIds.location,
    reference_file_ids: uploadedFileIds.reference,
    sign_size:        getValue('sign_size'),
    sign_type:        getValue('sign_type'),
    install_location: getValue('install_location'),
    install_env:      type === 'SIGN' ? getValue('install_env') : getValue('install_env_nameplate'),
    nameplate_type:   document.querySelector('input[name="nameplate_type"]:checked')?.value || '',
    nameplate_text:   getValue('nameplate_text'),
    created_by:       user.user_email || user.email || ''
  };
}

function fail(msg, focusId) {
  showMessage(msg, 'error');
  if (focusId) document.getElementById(focusId)?.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  return null;
}

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────
function getValue(id)       { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
function setVal(id, val)    { const el = document.getElementById(id); if (el) el.value = val; }
function showEl(id)         { const el = document.getElementById(id); if (el) el.style.display = ''; }
function hideEl(id)         { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function setRequired(id, v) { const el = document.getElementById(id); if (el) el.required = v; }
