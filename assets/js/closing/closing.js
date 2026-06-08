/**
 * closing.js
 * GC녹십자아이메드 월마감 자동화 앱
 *
 * 기능
 *  - Raw 입고 / 사용현황 엑셀 업로드 → GC케어 / 아이메드 자동 분류
 *  - 산출물 6종 엑셀 다운로드 (ExcelJS 서식 완전 적용)
 *  - 거래처 마스터 관리 (API 연동 → 서버 저장)
 */

'use strict';

// ═══════════════════════════════════════════════════════════
// 0. 진입점
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  try {
    showGlobalLoading('월마감 앱 초기화 중...');

    // 로그인 체크
    const user = window.auth?.getSession?.();
    if (!user) { location.replace(`${CONFIG.SITE_BASE_URL}/index.html`); return; }

    // 로그아웃
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      window.auth?.logout?.();
      location.replace(`${CONFIG.SITE_BASE_URL}/index.html`);
    });

    // 권한 체크 (closing: view 이상)
    const ok = await window.appPermission?.requirePermission?.('closing', ['admin', 'edit', 'view']);
    if (ok === false) {
      document.getElementById('permissionDenied').style.display = '';
      return;
    }

    // 관리자 여부 저장
    const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
    const editPerm = await window.appPermission?.getPermission?.('closing');
    App.canEdit = isAdmin || ['admin', 'edit'].includes(editPerm);

    document.getElementById('appBody').style.display = '';

    // 거래처 데이터 미리 로드 (탭 전환 시 빠른 표시를 위해)
    loadVendorsFromServer().catch(() => {});

  } catch (e) {
    showMessage('앱 초기화 중 오류가 발생했습니다: ' + e.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
});

// ═══════════════════════════════════════════════════════════
// 1. 앱 상태
// ═══════════════════════════════════════════════════════════
const App = {
  canEdit: false,
  ipgoRaw: null,
  usageRaw: null,
  ipgoData: [],
  usageData: [],
  R: {},             // 처리 결과
  vendors: [],       // 거래처 마스터 (서버에서 로드)
  vendorsDirty: false,
};

// ═══════════════════════════════════════════════════════════
// 2. 탭 전환
// ═══════════════════════════════════════════════════════════
function switchTab(tab) {
  ['closing', 'vendor'].forEach(t => {
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`)
      ?.classList.toggle('active', t === tab);
    document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}Content`)
      ?.classList.toggle('active', t === tab);
  });
  if (tab === 'vendor') renderVendorTable();
}

// ═══════════════════════════════════════════════════════════
// 3. 파일 업로드
// ═══════════════════════════════════════════════════════════
function dragOver(e, id) { e.preventDefault(); document.getElementById(id).classList.add('dragover'); }
function dragLeave(id)   { document.getElementById(id).classList.remove('dragover'); }
function dropFile(e, type) {
  e.preventDefault();
  document.getElementById('zone-' + type).classList.remove('dragover');
  if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0], type);
}
function handleFile(input, type) {
  if (input.files[0]) processFile(input.files[0], type);
}
function processFile(file, type) {
  const reader = new FileReader();
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' });
    App[type + 'Raw'] = { wb, name: file.name };
    document.getElementById('zone-' + type).classList.add('uploaded');
    document.getElementById('status-' + type).textContent = '✓ ' + file.name;
    if (App.ipgoRaw && App.usageRaw) {
      document.getElementById('btnNext1').disabled = false;
    }
  };
  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════
// 4. 스텝 내비게이션
// ═══════════════════════════════════════════════════════════
function goStep(n) {
  [1, 2, 3, 4].forEach(i => {
    document.getElementById('sec' + i)?.classList.toggle('active', i === n);
    const el = document.getElementById('step' + i);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    else if (i === n) el.classList.add('active');
    el.querySelector('.cl-step-num').textContent = i < n ? '✓' : i;
  });
}
function startProcessing() {
  goStep(3);
  setTimeout(runProcessing, 200);
}

// ═══════════════════════════════════════════════════════════
// 5. 로그 / 진행
// ═══════════════════════════════════════════════════════════
function clog(msg, cls = 'info') {
  const box = document.getElementById('logBox');
  if (!box) return;
  const t = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  box.innerHTML += `<div class="cl-log-line ${cls}"><span class="cl-log-time">[${t}]</span>${msg}</div>`;
  box.scrollTop = box.scrollHeight;
}
function prog(pct, label) {
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressLabel').textContent = label;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════
// 6. 파싱
// ═══════════════════════════════════════════════════════════
function toN(v) { const n = parseFloat(String(v || 0).replace(/,/g, '')); return isNaN(n) ? 0 : n; }
const sumF = (arr, k) => arr.reduce((s, r) => s + toN(r[k]), 0);

function parseIpgo(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hr = 0;
  for (let i = 0; i < all.length; i++) {
    if (String(all[i][0]).trim() === 'No.') { hr = i; break; }
  }
  const hdrs = all[hr].map(h => String(h).trim());
  const data = [];
  for (let i = hr + 1; i < all.length; i++) {
    const row = all[i];
    if (!String(row[0]).trim() || isNaN(parseInt(row[0]))) continue;
    const obj = {};
    hdrs.forEach((h, idx) => { obj[h] = row[idx]; });
    const t = String(obj['자재구분'] || '').trim();
    obj['구분'] = (t === '소모품' || t === '시약') ? 'GC케어' : '아이메드';
    data.push(obj);
  }
  return data;
}

function parseUsage(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hr = 1;
  for (let i = 0; i < all.length; i++) {
    if (String(all[i][0]).trim() === '부서명' || String(all[i][1]).trim() === '부서명') { hr = i; break; }
  }
  const hdrs = all[hr].map(h => String(h).trim());
  const data = [];
  for (let i = hr + 1; i < all.length; i++) {
    const row = all[i];
    if (!String(row[0]).trim() && !String(row[1]).trim()) continue;
    const obj = {};
    hdrs.forEach((h, idx) => { if (h) obj[h] = row[idx]; });
    data.push(obj);
  }
  return data;
}

// ═══════════════════════════════════════════════════════════
// 7. 집계 헬퍼
// ═══════════════════════════════════════════════════════════
function byVendor(data) {
  const m = {};
  data.forEach(r => {
    const v = String(r['공급업체'] || '').trim(); if (!v) return;
    if (!m[v]) m[v] = { 공급업체: v, 공급가액: 0, 부가세: 0, 합계금액: 0 };
    m[v].공급가액 += toN(r['공급가액']); m[v].부가세 += toN(r['부가세']); m[v].합계금액 += toN(r['합계금액']);
  });
  return Object.values(m).sort((a, b) => b.공급가액 - a.공급가액);
}
function byDeptIpgo(data) {
  const m = {};
  data.forEach(r => {
    const k = String(r['의뢰부서'] || '').trim() + '||' + String(r['자재구분'] || '').trim();
    if (!m[k]) m[k] = { 의뢰부서: String(r['의뢰부서'] || '').trim(), 자재구분: String(r['자재구분'] || '').trim(), 공급가액: 0, 부가세: 0, 합계금액: 0 };
    m[k].공급가액 += toN(r['공급가액']); m[k].부가세 += toN(r['부가세']); m[k].합계금액 += toN(r['합계금액']);
  });
  return Object.values(m);
}
function byDeptUsage(data) {
  const m = {};
  data.forEach(r => {
    const k = String(r['부서명'] || '').trim() + '||' + String(r['자재구분'] || '').trim();
    if (!m[k]) m[k] = { 부서명: String(r['부서명'] || '').trim(), 자재구분: String(r['자재구분'] || '').trim(), 사용공급가: 0, 사용부가세: 0, 사용합계: 0 };
    m[k].사용공급가 += toN(r['사용공급가']); m[k].사용부가세 += toN(r['사용부가세']); m[k].사용합계 += toN(r['사용합계']);
  });
  return Object.values(m);
}
function byItem(data, codeKey, nameKey, qtyKey, amtKey) {
  const m = {};
  data.forEach(r => {
    const code = String(r[codeKey] || '').trim(); if (!code) return;
    if (!m[code]) m[code] = { 코드: code, 명: String(r[nameKey] || ''), 구분: String(r['자재구분'] || ''), 수량: 0, 금액: 0 };
    m[code].수량 += toN(r[qtyKey]); m[code].금액 += toN(r[amtKey]);
  });
  return Object.values(m);
}

// ═══════════════════════════════════════════════════════════
// 8. 메인 처리
// ═══════════════════════════════════════════════════════════
async function runProcessing() {
  const branch  = document.getElementById('inputBranch').value.trim() || '서울숲';
  const ym      = document.getElementById('inputMonth').value;
  const [y, m]  = ym.split('-');
  const mi      = parseInt(m);
  const cc      = document.getElementById('inputCC').value.trim();
  const account = '11301101'; // 계정코드 고정값

  try {
    clog('처리를 시작합니다...', 'info'); await sleep(150);
    prog(10, '입고 데이터 파싱 중...');
    const ipgoData  = parseIpgo(App.ipgoRaw.wb);
    App.ipgoData    = ipgoData;
    clog(`입고 ${ipgoData.length}건 파싱 완료 (소계행 자동 제거)`, 'ok');

    await sleep(150); prog(22, '사용현황 파싱 중...');
    const usageData = parseUsage(App.usageRaw.wb);
    App.usageData   = usageData;
    clog(`사용현황 ${usageData.length}건 파싱 완료`, 'ok');

    await sleep(150); prog(38, 'GC케어 / 아이메드 분류 중...');
    const gcIpgo    = ipgoData.filter(r => r['구분'] === 'GC케어');
    const imedIpgo  = ipgoData.filter(r => r['구분'] === '아이메드');
    const usageSiyak   = usageData.filter(r => String(r['자재구분'] || '').trim() === '시약');
    const usageSomoum  = usageData.filter(r => String(r['자재구분'] || '').trim() === '소모품');
    const usageGC   = [...usageSiyak, ...usageSomoum];
    const usageImed = usageData.filter(r => String(r['자재구분'] || '').trim() === '의약품');
    clog(`입고 GC케어:${gcIpgo.length}건 / 아이메드:${imedIpgo.length}건`, 'ok');
    clog(`사용 GC케어(시약+소모품):${usageGC.length}건 / 아이메드(의약품):${usageImed.length}건`, 'ok');

    await sleep(150); prog(55, '피벗 집계 중...');
    const gcVendors        = byVendor(gcIpgo);
    const imedVendors      = byVendor(imedIpgo);
    const gcDepts          = byDeptIpgo(gcIpgo);
    const imedDepts        = byDeptIpgo(imedIpgo);
    const itemIpgoPivot    = byItem(ipgoData, '자재코드', '자재명', '수량', '공급가액')
                              .filter(it => !String(it.코드).startsWith('6'));  // 의약품 제외
    const itemUsagePivot   = byItem(usageGC, '자재코드', '자재명', '사용수량(입)', '사용공급가');
    const siyakPivot       = byDeptUsage(usageSiyak);
    const imedSiSoPivot    = byDeptUsage(usageGC);
    const imedDrugPivot    = byDeptUsage(usageImed);
    clog('피벗 집계 완료', 'ok');

    await sleep(150); prog(70, 'SAP 양식 생성 중...');
    // 거래처 맵 (서버 데이터 우선)
    const vendorMap = {};
    App.vendors.forEach(v => { vendorMap[v.vendor_name] = v; });

    const sapRows = gcIpgo.map(r => {
      const vm = vendorMap[String(r['공급업체'] || '').trim()] || {};
      return {
        거래처:    String(r['공급업체'] || ''),
        사업자번호: vm.biz_no       || '',
        공급가액:  toN(r['공급가액']),
        기준일:    String(r['입고일자'] || ''),
        적요:     `(${branch})${r['의뢰부서']}${r['자재명']}${r['수량']}`,
        지급일:   vm.credit_days   != null ? vm.credit_days : 90,
        결제방법:  vm.pay_method   || '현금결제',
        계정:     '11301101',   // 계정코드 고정값
        전표번호:  '',
      };
    });
    clog(`SAP 양식 ${sapRows.length}건 생성`, 'ok');

    await sleep(150); prog(85, '수불 집계 중...');
    const subulMap = {};
    usageData.forEach(r => {
      const code = String(r['자재코드'] || '').trim(); if (!code) return;
      if (!subulMap[code]) subulMap[code] = { code, name: String(r['자재명'] || ''), type: String(r['자재구분'] || ''), 증가: 0, 감소: toN(r['사용공급가']) };
      else subulMap[code].감소 += toN(r['사용공급가']);
    });
    ipgoData.forEach(r => {
      const code = String(r['자재코드'] || '').trim(); if (!code) return;
      if (!subulMap[code]) subulMap[code] = { code, name: String(r['자재명'] || ''), type: String(r['자재구분'] || ''), 증가: toN(r['공급가액']), 감소: 0 };
      else subulMap[code].증가 += toN(r['공급가액']);
    });

    // 미등록 거래처 경고
    const unreg = [...new Set(gcIpgo.map(r => String(r['공급업체'] || '').trim()).filter(v => v && !vendorMap[v]))];
    if (unreg.length) clog(`⚠ 거래처 관리 미등록: ${unreg.join(', ')}`, 'warn');

    App.R = { gcIpgo, imedIpgo, gcVendors, imedVendors, gcDepts, imedDepts,
              itemIpgoPivot, itemUsagePivot, usageGC, usageImed, usageSiyak, usageSomoum,
              siyakPivot, imedSiSoPivot, imedDrugPivot, sapRows, subulMap,
              vendorMap, y, m: mi, branch, cc, account };

    clog('모든 처리 완료!', 'ok');
    await sleep(300); prog(100, '완료!');
    await sleep(400);

    goStep(4);
    renderResults();

  } catch (err) {
    clog('처리 중 오류: ' + err.message, 'err');
    showMessage('처리 중 오류가 발생했습니다: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// 9. 결과 렌더링
// ═══════════════════════════════════════════════════════════
function renderResults() {
  const R = App.R;
  const gcT  = R.gcVendors.reduce((s, v) => s + v.합계금액, 0);
  const imT  = R.imedVendors.reduce((s, v) => s + v.합계금액, 0);

  document.getElementById('summaryGrid').innerHTML = `
    <div class="cl-stat">
      <div class="cl-stat-label">총 입고 건수</div>
      <div class="cl-stat-val">${(R.gcIpgo.length + R.imedIpgo.length).toLocaleString()}</div>
      <div class="cl-stat-sub">GC케어 ${R.gcIpgo.length} / 아이메드 ${R.imedIpgo.length}</div>
    </div>
    <div class="cl-stat">
      <div class="cl-stat-label">전체 입고금액</div>
      <div class="cl-stat-val">${Math.round((gcT + imT) / 1000).toLocaleString()}천원</div>
      <div class="cl-stat-sub">합계금액 기준</div>
    </div>
    <div class="cl-stat" style="border-left:3px solid #0e7c3a;">
      <div class="cl-stat-label" style="color:#0e7c3a;">GC케어 입고</div>
      <div class="cl-stat-val" style="color:#0e7c3a;">${Math.round(gcT / 1000).toLocaleString()}천원</div>
      <div class="cl-stat-sub">소모품·시약 ${R.gcVendors.length}개 거래처</div>
    </div>
    <div class="cl-stat" style="border-left:3px solid #b45309;">
      <div class="cl-stat-label" style="color:#b45309;">아이메드 입고</div>
      <div class="cl-stat-val" style="color:#b45309;">${Math.round(imT / 1000).toLocaleString()}천원</div>
      <div class="cl-stat-sub">의약품 ${R.imedVendors.length}개 거래처</div>
    </div>
  `;

  renderPreview();

  document.getElementById('downloadGrid').innerHTML = `
    <div class="cl-dl-card both" onclick="dlIpgo()">
      <span class="cl-dl-tag both">공통</span>
      <div class="cl-dl-name">입고 (편집본)</div>
      <div class="cl-dl-sheets">거래처 피벗 · 입고원본 · GC케어 입고분 · 원가집계표 피벗 · GC케어 마감피벗 · 아이메드 입고분 · 아이메드 마감피벗</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card both" onclick="dlUsage()">
      <span class="cl-dl-tag both">공통</span>
      <div class="cl-dl-name">사용현황 (편집본)</div>
      <div class="cl-dl-sheets">사용원본 · 시약,소모품 · 원가집계표 피벗 · 소모품 · 시약 · 시약 마감피벗 · 시약5% · 의약품 · 아이메드 마감피벗(시,소) · 아이메드 마감피벗(의약품)</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card gc" onclick="dlGCReport()">
      <span class="cl-dl-tag gc">GC케어</span>
      <div class="cl-dl-name">거래처 구매 내역 및 원재료 보고</div>
      <div class="cl-dl-sheets">결재 · 부서별 금액 · 원재료비 · 연간 원재료비</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card imed" onclick="dlImedReport()">
      <span class="cl-dl-tag imed">아이메드</span>
      <div class="cl-dl-name">거래처 구매 내역 및 원재료 보고</div>
      <div class="cl-dl-sheets">결재 · 부서별 금액 · 원재료비 · 연간 원재료비</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card gc" onclick="dlSAP()">
      <span class="cl-dl-tag gc">GC케어</span>
      <div class="cl-dl-name">GC케어 입고분 SAP 입력 양식</div>
      <div class="cl-dl-sheets">SAP 전표 입력 (거래처 관리 자동 반영) · 거래처 관리 시트</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
    <div class="cl-dl-card imed" onclick="dlSubul()">
      <span class="cl-dl-tag imed">아이메드→GC케어 제출</span>
      <div class="cl-dl-name">★ 아이메드 수불 집계표 ★</div>
      <div class="cl-dl-sheets">품목별 기초·증가·감소·기말 원가집계표</div>
      <button class="btn" style="margin-top:6px;font-size:12px;padding:5px 12px;">⬇ 다운로드</button>
    </div>
  `;
}

function renderPreview() {
  const filter = document.getElementById('previewFilter').value;
  let data = App.ipgoData;
  if (filter !== 'all') data = data.filter(r => r['구분'] === filter);
  const show = data.slice(0, 15);
  const cols = ['공급업체', '자재구분', '자재명', '입고일자', '수량', '공급가액', '부가세', '합계금액', '의뢰부서', '구분'];
  let html = '<table class="cl-preview"><thead><tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
  show.forEach(r => {
    const tag = r['구분'] === 'GC케어' ? '<span class="cl-tag-gc">GC케어</span>' : '<span class="cl-tag-imed">아이메드</span>';
    html += `<tr>
      <td>${r['공급업체'] || ''}</td>
      <td>${r['자재구분'] || ''}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;">${r['자재명'] || ''}</td>
      <td>${r['입고일자'] || ''}</td>
      <td class="num">${toN(r['수량']).toLocaleString()}</td>
      <td class="num">${toN(r['공급가액']).toLocaleString()}</td>
      <td class="num">${toN(r['부가세']).toLocaleString()}</td>
      <td class="num">${toN(r['합계금액']).toLocaleString()}</td>
      <td>${r['의뢰부서'] || ''}</td>
      <td>${tag}</td>
    </tr>`;
  });
  if (data.length > 15) html += `<tr><td colspan="${cols.length}" class="more">외 ${data.length - 15}건 더 있음</td></tr>`;
  html += '</tbody></table>';
  document.getElementById('previewTable').innerHTML = html;
}

function restart() {
  App.ipgoRaw = null; App.usageRaw = null;
  App.ipgoData = []; App.usageData = []; App.R = {};
  ['ipgo', 'usage'].forEach(t => {
    document.getElementById('status-' + t).textContent = '';
    document.getElementById('zone-' + t).classList.remove('uploaded');
  });
  document.getElementById('btnNext1').disabled = true;
  document.getElementById('logBox').innerHTML = '';
  document.getElementById('progressFill').style.width = '0%';
  goStep(1);
}

// ═══════════════════════════════════════════════════════════
// 10. ExcelJS 서식 상수
// ═══════════════════════════════════════════════════════════
const F = {
  base:  { name: 'Calibri', size: 10 },
  bold:  { name: 'Calibri', size: 10, bold: true },
  hdr:   { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  total: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  title: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  red:   { name: 'Calibri', size: 10, color: { argb: 'FFC00000' } },
  redb:  { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC00000' } },
};
const FILL = {
  hdr:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
  total:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } },
  subtot: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } },
  odd:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } },
  even:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3FB' } },
  gc:     { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } },
  imed:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
  title:  { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } },
  warn:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF99' } },
};
const BORDER_THIN = {
  top: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  left: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  bottom: { style: 'thin', color: { argb: 'FFB8CCE4' } },
  right: { style: 'thin', color: { argb: 'FFB8CCE4' } },
};
const BORDER_TOTAL = {
  top: { style: 'medium', color: { argb: 'FF2F5496' } },
  left: { style: 'medium', color: { argb: 'FF2F5496' } },
  bottom: { style: 'medium', color: { argb: 'FF2F5496' } },
  right: { style: 'medium', color: { argb: 'FF2F5496' } },
};
const NUM_FMT = '#,##0';
const AL = (h, v) => ({ horizontal: h || 'left', vertical: v || 'center', wrapText: false });

// ── 셀 스타일 헬퍼 ────────────────────────────────────────
function sc(cell, { value, font, fill, alignment, border, numFmt } = {}) {
  if (value !== undefined) cell.value = value;
  if (font)      cell.font      = font;
  if (fill)      cell.fill      = fill;
  if (alignment) cell.alignment = alignment;
  if (border)    cell.border    = border;
  if (numFmt)    cell.numFmt    = numFmt;
}
function hdrCell(ws, r, c, v, span = 1) {
  const cell = ws.getCell(r, c);
  sc(cell, { value: v, font: F.hdr, fill: FILL.hdr, alignment: AL('center'), border: BORDER_THIN });
  if (span > 1) ws.mergeCells(r, c, r, c + span - 1);
  ws.getRow(r).height = 18;
}
function numCell(ws, r, c, v, fill, bold = false) {
  const nv = toN(v);
  const cell = ws.getCell(r, c);
  sc(cell, {
    value: nv || null,
    font: nv < 0 ? (bold ? F.redb : F.red) : (bold ? F.total : F.base),
    fill: fill || FILL.odd,
    alignment: AL('right'),
    border: BORDER_THIN,
    numFmt: NUM_FMT,
  });
}
function txtCell(ws, r, c, v, fill, bold = false, center = false) {
  sc(ws.getCell(r, c), {
    value: v || null,
    font: bold ? F.bold : F.base,
    fill: fill || FILL.odd,
    alignment: AL(center ? 'center' : 'left'),
    border: BORDER_THIN,
  });
}
function titleRow(ws, r, c, v, span, rowH = 22) {
  const cell = ws.getCell(r, c);
  sc(cell, { value: ' ' + v, font: F.title, fill: FILL.title, alignment: AL('left'), border: BORDER_THIN });
  if (span > 1) ws.mergeCells(r, c, r, c + span - 1);
  ws.getRow(r).height = rowH;
}
function totalRow(ws, r, numCols, numVals, textCols, textVals) {
  numCols.forEach((c, i) => {
    const cell = ws.getCell(r, c);
    sc(cell, { value: Math.round(toN(numVals[i])) || null, font: F.total, fill: FILL.total, alignment: AL('right'), border: BORDER_TOTAL, numFmt: NUM_FMT });
  });
  textCols.forEach((c, i) => {
    sc(ws.getCell(r, c), { value: textVals[i] || null, font: F.total, fill: FILL.total, alignment: AL('center'), border: BORDER_TOTAL });
  });
  ws.getRow(r).height = 18;
}
function subtotRow(ws, r, textCols, textVals, numCols, numVals) {
  textCols.forEach((c, i) => sc(ws.getCell(r, c), { value: textVals[i] || null, font: F.bold, fill: FILL.subtot, alignment: AL('center'), border: BORDER_THIN }));
  numCols.forEach((c, i) => { const cell = ws.getCell(r, c); sc(cell, { value: Math.round(toN(numVals[i])) || null, font: F.bold, fill: FILL.subtot, alignment: AL('right'), border: BORDER_THIN, numFmt: NUM_FMT }); });
  ws.getRow(r).height = 18;
}
function cw(ws, arr) { arr.forEach(([c, w]) => ws.getColumn(c).width = w); }

// ── 데이터 시트 공통 ──────────────────────────────────────
function writeDataSheet(ws, headers, rows, numCols, colWidths) {
  headers.forEach((h, i) => hdrCell(ws, 1, i + 1, h));
  const numSet = new Set(numCols);
  rows.forEach((row, ri) => {
    const r = ri + 2;
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    row.forEach((v, ci) => {
      const c = ci + 1;
      if (numSet.has(c)) numCell(ws, r, c, v, fill);
      else txtCell(ws, r, c, v, fill);
    });
    ws.getRow(r).height = 16;
  });
  colWidths.forEach((w, i) => ws.getColumn(i + 1).width = w);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 거래처 ──────────────────────────────────────────
function writePivotVendor(ws, gcVendors, imedVendors) {
  [[1, '구분'], [2, '공급업체'], [3, '합계 : 공급가액'], [4, '합계 : 부가세'], [5, '합계 : 합계금액']]
    .forEach(([c, v]) => hdrCell(ws, 1, c, v));
  let r = 2;
  let firstGC = true;
  gcVendors.forEach(v => {
    const fill = FILL.gc;
    txtCell(ws, r, 1, firstGC ? 'GC케어' : null, fill, firstGC);
    txtCell(ws, r, 2, v.공급업체, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [v.공급가액, v.부가세, v.합계금액][i], fill));
    ws.getRow(r).height = 16; r++; firstGC = false;
  });
  const gcS = [sumF(gcVendors, '공급가액'), sumF(gcVendors, '부가세'), sumF(gcVendors, '합계금액')];
  subtotRow(ws, r, [1, 2], ['GC케어 요약', null], [3, 4, 5], gcS); r++;
  let firstIM = true;
  imedVendors.forEach(v => {
    const fill = FILL.imed;
    txtCell(ws, r, 1, firstIM ? '아이메드' : null, fill, firstIM);
    txtCell(ws, r, 2, v.공급업체, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [v.공급가액, v.부가세, v.합계금액][i], fill));
    ws.getRow(r).height = 16; r++; firstIM = false;
  });
  const imS = [sumF(imedVendors, '공급가액'), sumF(imedVendors, '부가세'), sumF(imedVendors, '합계금액')];
  subtotRow(ws, r, [1, 2], ['아이메드 요약', null], [3, 4, 5], imS); r++;
  totalRow(ws, r, [3, 4, 5], [gcS[0] + imS[0], gcS[1] + imS[1], gcS[2] + imS[2]], [1, 2], ['총합계', null]);
  cw(ws, [[1, 14], [2, 22], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 부서/자재구분 ───────────────────────────────────
function writePivotDept(ws, data) {
  [[1, '의뢰부서'], [2, '자재구분'], [3, '합계 : 공급가액'], [4, '합계 : 부가세'], [5, '합계 : 합계금액']]
    .forEach(([c, v]) => hdrCell(ws, 1, c, v));
  let r = 2, prev = null;
  data.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, d.의뢰부서 !== prev ? d.의뢰부서 : null, fill, d.의뢰부서 !== prev);
    txtCell(ws, r, 2, d.자재구분, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [d.공급가액, d.부가세, d.합계금액][i], fill));
    ws.getRow(r).height = 16; r++; prev = d.의뢰부서;
  });
  totalRow(ws, r, [3, 4, 5], [sumF(data, '공급가액'), sumF(data, '부가세'), sumF(data, '합계금액')], [1, 2], ['총합계', null]);
  cw(ws, [[1, 16], [2, 10], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 품목별 ──────────────────────────────────────────
function writePivotItem(ws, data, isUsage = false) {
  const q = isUsage ? '합계 : 사용수량(입)' : '합계 : 수량';
  const a = isUsage ? '합계 : 사용공급가' : '합계 : 공급가액';
  [[1, '자재코드'], [2, '자재명'], [3, q], [4, a]].forEach(([c, v]) => hdrCell(ws, 1, c, v));
  let r = 2;
  data.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, d.코드, fill); txtCell(ws, r, 2, d.명, fill);
    numCell(ws, r, 3, d.수량, fill); numCell(ws, r, 4, d.금액, fill);
    ws.getRow(r).height = 16; r++;
  });
  totalRow(ws, r, [3, 4], [sumF(data, '수량'), sumF(data, '금액')], [1, 2], ['총합계', null]);
  cw(ws, [[1, 14], [2, 45], [3, 16], [4, 16]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 피벗: 사용현황 부서별 ─────────────────────────────────
function writePivotUsageDept(ws, data, cols3, hasFivePct = false) {
  [[1, '부서명'], [2, '자재구분'], [3, cols3[0]], [4, cols3[1]], [5, cols3[2]]]
    .forEach(([c, v]) => hdrCell(ws, 1, c, v));
  let r = 2, prev = null;
  data.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, d.부서명 !== prev ? d.부서명 : null, fill, d.부서명 !== prev);
    txtCell(ws, r, 2, d.자재구분, fill);
    const f = hasFivePct ? 1.05 : 1;
    numCell(ws, r, 3, Math.round(d.사용공급가 * f), fill);
    numCell(ws, r, 4, Math.round(d.사용부가세 * f), fill);
    numCell(ws, r, 5, Math.round(d.사용합계 * f), fill);
    ws.getRow(r).height = 16; r++; prev = d.부서명;
  });
  const f = hasFivePct ? 1.05 : 1;
  totalRow(ws, r, [3, 4, 5],
    [Math.round(sumF(data, '사용공급가') * f), Math.round(sumF(data, '사용부가세') * f), Math.round(sumF(data, '사용합계') * f)],
    [1, 2], ['총합계', null]);
  cw(ws, [[1, 16], [2, 10], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 결재 시트 ─────────────────────────────────────────────
function writeKyuljai(ws, year, month, label, vendors) {
  const ym = `${year}/${String(month).padStart(2, '0')}/01 ~ ${year}/${String(month).padStart(2, '0')}/31`;
  titleRow(ws, 1, 1, `${year}년 ${month}월 ${label} 마감내역`, 9, 24);
  const c4 = ws.getCell(4, 6); c4.value = `기준: ${ym}`; c4.font = F.base; c4.alignment = AL('right');
  ws.mergeCells(4, 6, 4, 9);
  [['순번', 1], ['공급업체', 2], ['사업자등록번호', 3], ['구매총액', 4], ['결제방법', 7], ['결제기일', 8], ['비고', 9]]
    .forEach(([v, c]) => hdrCell(ws, 5, c, v));
  ['', '', '', '공급가액', '부가세액', '합계금액', '', '', ''].forEach((v, i) => {
    const cell = ws.getCell(6, i + 1);
    cell.font = F.hdr; cell.fill = FILL.hdr; cell.alignment = AL('center'); cell.border = BORDER_THIN;
    if (v) cell.value = v;
  });
  [1, 2, 3, 7, 8, 9].forEach(c => ws.mergeCells(5, c, 6, c));
  ws.mergeCells(5, 4, 5, 6);
  ws.getRow(5).height = 18; ws.getRow(6).height = 18;
  let r = 7;
  vendors.forEach((v, i) => {
    const fill = i % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, i + 1, fill, false, true);
    txtCell(ws, r, 2, v.공급업체, fill);
    txtCell(ws, r, 3, v.사업자번호 || '', fill, false, true);
    numCell(ws, r, 4, v.공급가액, fill); numCell(ws, r, 5, v.부가세, fill); numCell(ws, r, 6, v.합계금액, fill);
    txtCell(ws, r, 7, '현금결제', fill, false, true);
    txtCell(ws, r, 8, 90, fill, false, true);
    txtCell(ws, r, 9, '', fill);
    ws.getRow(r).height = 16; r++;
  });
  ws.mergeCells(r, 1, r, 3);
  totalRow(ws, r, [4, 5, 6], [sumF(vendors, '공급가액'), sumF(vendors, '부가세'), sumF(vendors, '합계금액')],
    [1, 7, 8, 9], ['총합계', '현금결제', '', '']);
  cw(ws, [[1, 8], [2, 22], [3, 16], [4, 16], [5, 14], [6, 16], [7, 10], [8, 10], [9, 12]]);
  ws.views = [{ state: 'frozen', ySplit: 6 }];
}

// ── 부서별 금액 시트 ─────────────────────────────────────
function writeDeptAmount(ws, month, depts) {
  titleRow(ws, 1, 1, `${month}월 부서별 구매 내역`, 5, 24);
  ws.getCell(2, 5).value = '(단위 : 원)'; ws.getCell(2, 5).font = F.base; ws.getCell(2, 5).alignment = AL('right');
  [[1, '의뢰부서'], [2, '자재구분'], [3, '합계: 공급가액'], [4, '합계: 부가세'], [5, '합계: 합계금액']]
    .forEach(([c, v]) => hdrCell(ws, 3, c, v));
  let r = 4, prev = null;
  depts.forEach((d, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, d.의뢰부서 !== prev ? d.의뢰부서 : null, fill, d.의뢰부서 !== prev);
    txtCell(ws, r, 2, d.자재구분, fill);
    [3, 4, 5].forEach((c, i) => numCell(ws, r, c, [d.공급가액, d.부가세, d.합계금액][i], fill));
    ws.getRow(r).height = 16; r++; prev = d.의뢰부서;
  });
  totalRow(ws, r, [3, 4, 5], [sumF(depts, '공급가액'), sumF(depts, '부가세'), sumF(depts, '합계금액')], [1, 2], ['총합계', null]);
  cw(ws, [[1, 16], [2, 10], [3, 18], [4, 16], [5, 18]]);
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── 사용현황 5% 시트 ─────────────────────────────────────
function writeUsageWith5pct(ws, headers, rows, numCols, colWidths) {
  headers.forEach((h, i) => hdrCell(ws, 1, i + 1, h));
  const numSet = new Set(numCols);
  rows.forEach((row, ri) => {
    const r = ri + 2;
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    row.forEach((v, ci) => {
      const c = ci + 1;
      if (numSet.has(c)) numCell(ws, r, c, v, fill);
      else txtCell(ws, r, c, v, fill);
    });
    ws.getRow(r).height = 16;
  });
  colWidths.forEach((w, i) => ws.getColumn(i + 1).width = w);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── SAP 시트 ─────────────────────────────────────────────
function writeSAP(ws, year, month, branch, sapRows, totalSup, cc, account, vendorMap) {
  ws.getCell(2, 4).value = account; ws.getCell(2, 4).font = F.bold;
  ws.getCell(2, 7).value = totalSup; ws.getCell(2, 7).font = F.bold; ws.getCell(2, 7).numFmt = NUM_FMT;
  ws.getCell(2, 10).value = '양식 기준'; ws.getCell(2, 10).font = F.base;
  ws.getCell(2, 12).value = cc; ws.getCell(2, 12).font = F.base;
  ws.getRow(2).height = 16;
  ['', '거래처', '사업자 번호', '계정', '', '', '공급가액', '', '기준일', '적요', '', 'CC', '지급일', '전표번호']
    .forEach((v, i) => { if (v) hdrCell(ws, 3, i + 1, v); });
  ws.getRow(3).height = 18;
  sapRows.forEach((r, ri) => {
    const row = ri + 4;
    const isUnreg = vendorMap && !vendorMap[r.거래처];
    const fill = isUnreg ? FILL.warn : (ri % 2 === 0 ? FILL.odd : FILL.even);
    txtCell(ws, row, 2, r.거래처, fill);
    txtCell(ws, row, 3, r.사업자번호 || '', fill);
    txtCell(ws, row, 4, r.계정 || account, fill, false, true);
    numCell(ws, row, 7, r.공급가액, fill);
    txtCell(ws, row, 9, r.기준일, fill, false, true);
    txtCell(ws, row, 10, r.적요, fill);
    txtCell(ws, row, 12, cc, fill, false, true);
    txtCell(ws, row, 13, r.지급일, fill, false, true);
    txtCell(ws, row, 14, r.전표번호 || '', fill);
    ws.getRow(row).height = 16;
  });
  cw(ws, [[1, 4], [2, 18], [3, 14], [4, 12], [5, 4], [6, 4], [7, 16], [8, 4], [9, 12], [10, 52], [11, 4], [12, 12], [13, 8], [14, 14]]);
  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ── 거래처 관리 시트 ─────────────────────────────────────
function writeVendorMasterSheet(ws, vendors) {
  [['거래처명', 1], ['사업자등록번호', 2], ['여신기간(일)', 3], ['결제방법', 4]]
    .forEach(([v, c]) => hdrCell(ws, 1, c, v));
  vendors.forEach((v, ri) => {
    const r = ri + 2;
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, v.vendor_name, fill);
    txtCell(ws, r, 2, v.biz_no, fill);
    numCell(ws, r, 3, v.credit_days, fill);
    txtCell(ws, r, 4, v.pay_method, fill, false, true);
    ws.getRow(r).height = 16;
  });
  cw(ws, [[1, 24], [2, 16], [3, 12], [4, 12]]);
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

// ── 수불 집계표 ───────────────────────────────────────────
function writeSubul(ws, year, month, branch, items) {
  titleRow(ws, 1, 1, '원가집계표', 13, 22);
  txtCell(ws, 2, 1, '회사명 : GC케어', null, true);
  txtCell(ws, 2, 14, '-VAT', null, false, true);
  [['품목코드', 1], ['품목명', 2], ['구분', 3], ['기초', 4], ['증가', 7], ['감소', 9], ['기말', 11]]
    .forEach(([v, c]) => hdrCell(ws, 3, c, v));
  ws.mergeCells(3, 4, 3, 6); ws.mergeCells(3, 7, 3, 8); ws.mergeCells(3, 9, 3, 10); ws.mergeCells(3, 11, 3, 13);
  ['', '', '', '수량', '단가', '금액', '수량', '금액', '수량', '금액', '수량', '단가', '금액']
    .forEach((v, i) => { const cell = ws.getCell(4, i + 1); cell.font = F.hdr; cell.fill = FILL.hdr; cell.alignment = AL('center'); cell.border = BORDER_THIN; if (v) cell.value = v; });
  [1, 2, 3].forEach(c => ws.mergeCells(3, c, 4, c));
  ws.getRow(3).height = 18; ws.getRow(4).height = 18;
  let r = 5;
  items.forEach((it, ri) => {
    const fill = ri % 2 === 0 ? FILL.odd : FILL.even;
    txtCell(ws, r, 1, it.code, fill); txtCell(ws, r, 2, it.name, fill); txtCell(ws, r, 3, it.type, fill, false, true);
    numCell(ws, r, 8, it.증가, fill); numCell(ws, r, 10, it.감소, fill); numCell(ws, r, 13, it.증가 - it.감소, fill);
    ws.getRow(r).height = 16; r++;
  });
  const tI = items.reduce((s, it) => s + it.증가, 0);
  const tD = items.reduce((s, it) => s + it.감소, 0);
  ws.mergeCells(r, 1, r, 3);
  totalRow(ws, r, [8, 10, 13], [tI, tD, tI - tD], [1], ['총합계']);
  cw(ws, [[1, 14], [2, 42], [3, 8], [4, 8], [5, 8], [6, 12], [7, 8], [8, 14], [9, 8], [10, 14], [11, 8], [12, 8], [13, 14]]);
  ws.views = [{ state: 'frozen', ySplit: 4 }];
}

// ═══════════════════════════════════════════════════════════
// 11. 다운로드 함수
// ═══════════════════════════════════════════════════════════
function newWb() { return new ExcelJS.Workbook(); }
async function saveWb(wb, filename) {
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

async function dlIpgo() {
  try {
    showGlobalLoading('입고 편집본 생성 중...');
    const R = App.R; const wb = newWb();
    const ic = ['공급업체', '구매번호', '자재구분', '자재코드', '자재명', '상태', '입고일자', '수량', '단가', '공급가액', '부가세', '합계금액', '규격', '산출단위', '입고단위', '의뢰부서', '구분'];
    const iw = [16, 14, 8, 12, 40, 8, 12, 8, 12, 14, 12, 14, 10, 8, 8, 14, 10];
    const in_ = [8, 9, 10, 11, 12];
    writePivotVendor(wb.addWorksheet('거래처 피벗'), R.gcVendors, R.imedVendors);
    writeDataSheet(wb.addWorksheet('입고원본'), ic, [...R.gcIpgo, ...R.imedIpgo].map(d => ic.map(c => d[c] || '')), in_, iw);
    writeDataSheet(wb.addWorksheet('GC케어 입고분'), ic, R.gcIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotItem(wb.addWorksheet('원가집계표 피벗'), R.itemIpgoPivot, false);
    writePivotDept(wb.addWorksheet('GC케어 마감피벗'), R.gcDepts);
    writeDataSheet(wb.addWorksheet('아이메드 입고분'), ic, R.imedIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotDept(wb.addWorksheet('아이메드 마감피벗'), R.imedDepts);
    await saveWb(wb, `${R.y.slice(2)}년 ${R.m}월 입고 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlUsage() {
  try {
    showGlobalLoading('사용현황 편집본 생성 중...');
    const R = App.R; const wb = newWb();
    const uc  = ['부서명', '자재구분', '자재코드', '자재명', '구매번호', '사용일자', '사용수량(입)', '사용수량(산)', '사용공급가', '사용부가세', '사용합계', '공급업체', '규격'];
    const uw  = [14, 8, 12, 40, 14, 12, 10, 10, 14, 12, 14, 16, 10];
    const un  = [7, 8, 9, 10, 11];
    const uc5 = ['부서명', '자재구분', '자재코드', '자재명', '구매번호', '사용일자', '사용수량(입)', '사용수량(산)', '사용공급가', '공5%', '사용부가세', '부5%', '사용합계', '계5%', '공급업체', '규격'];
    const uw5 = [14, 8, 12, 40, 14, 12, 10, 10, 14, 12, 12, 10, 14, 12, 16, 10];
    const un5 = [7, 8, 9, 10, 11, 12, 13, 14];
    const make5 = d => {
      const sup = toN(d['사용공급가']), vat = toN(d['사용부가세']), tot = toN(d['사용합계']);
      return [d['부서명'], d['자재구분'], d['자재코드'], d['자재명'], d['구매번호'], d['사용일자'],
        toN(d['사용수량(입)']), toN(d['사용수량(산)']),
        sup, Math.round(sup * 1.05), vat, Math.round(vat * 1.05), tot, Math.round(tot * 1.05),
        d['공급업체'], d['규격']];
    };
    writeDataSheet(wb.addWorksheet('사용원본'), uc, App.usageData.map(d => uc.map(c => d[c] || '')), un, uw);
    writeUsageWith5pct(wb.addWorksheet('시약, 소모품'), uc5, R.usageGC.map(make5), un5, uw5);
    writePivotItem(wb.addWorksheet('원가집계표 피벗'), R.itemUsagePivot, true);
    writeUsageWith5pct(wb.addWorksheet('소모품'), uc5, R.usageSomoum.map(make5), un5, uw5);
    writeUsageWith5pct(wb.addWorksheet('시약'), uc5, R.usageSiyak.map(make5), un5, uw5);
    writePivotUsageDept(wb.addWorksheet('시약 마감피벗'), R.siyakPivot, ['합계 : 사용공급가', '합계 : 사용부가세', '합계 : 사용합계'], false);
    writePivotUsageDept(wb.addWorksheet('시약5%'), R.siyakPivot, ['합계 : 공5%', '합계 : 부5%', '합계 : 계5%'], true);
    writeDataSheet(wb.addWorksheet('의약품'), uc, R.usageImed.map(d => uc.map(c => d[c] || '')), un, uw);
    writePivotUsageDept(wb.addWorksheet('아이메드 마감피벗(시, 소)'), R.imedSiSoPivot, ['합계 : 공5%', '합계 : 부5%', '합계 : 계5%'], true);
    writePivotUsageDept(wb.addWorksheet('아이메드 마감피벗(의약품)'), R.imedDrugPivot, ['합계 : 사용공급가', '합계 : 사용부가세', '합계 : 사용합계'], false);
    await saveWb(wb, `${R.y.slice(2)}년 ${R.m}월 사용현황 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlReport(label, vendors, depts, filename) {
  const R = App.R; const wb = newWb();
  writeKyuljai(wb.addWorksheet(`${R.m}월결재`), R.y, R.m, label, vendors);
  writeDeptAmount(wb.addWorksheet(`${R.m}월 부서별 금액`), R.m, depts);
  const ws3 = wb.addWorksheet('원재료비 ' + R.y.slice(2) + '년 ' + R.m + '월');
  titleRow(ws3, 1, 1, `${R.m}월 원재료비 계산`, 6, 22);
  [['부서', 1], ['기초재고', 2], ['당기매입', 3], ['당기사용', 4], ['기말재고', 5], ['비고', 6]]
    .forEach(([v, c]) => hdrCell(ws3, 2, c, v));
  const ws4 = wb.addWorksheet(R.y + '년도 원재료비 ');
  titleRow(ws4, 1, 1, '■ ' + R.y + '년도 원재료비', 15, 22);
  ['구   분', '기초', '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월', '기말']
    .forEach((v, i) => hdrCell(ws4, 2, i + 1, v));
  await saveWb(wb, filename);
}
async function dlGCReport() {
  try {
    showGlobalLoading('GC케어 보고서 생성 중...');
    const R = App.R;
    await dlReport('시약 및 소모품', R.gcVendors, R.gcDepts, `${R.y.slice(2)}년 ${R.m}월 거래처 구매 내역 및 원재료 보고 - GC케어 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}
async function dlImedReport() {
  try {
    showGlobalLoading('아이메드 보고서 생성 중...');
    const R = App.R;
    await dlReport('원재료 및 소모품', R.imedVendors, R.imedDepts, `${R.y.slice(2)}년 ${R.m}월 거래처 구매 내역 및 원재료 보고 - 아이메드 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlSAP() {
  try {
    showGlobalLoading('SAP 입력 양식 생성 중...');
    const R = App.R; const wb = newWb();
    const totalSup = R.gcIpgo.reduce((s, r) => s + toN(r['공급가액']), 0);
    writeSAP(wb.addWorksheet(`GC케어 SAP 입고 - ${R.y.slice(2)}년 ${R.m}월 - ${R.branch}`),
      R.y, R.m, R.branch, R.sapRows, totalSup, R.cc, R.account, R.vendorMap);
    writeVendorMasterSheet(wb.addWorksheet('거래처 관리'), App.vendors);
    await saveWb(wb, `${R.y.slice(2)}년 ${R.m}월 GC케어 입고분 SAP 입력 양식 - ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function dlSubul() {
  try {
    showGlobalLoading('수불 집계표 생성 중...');
    const R = App.R; const wb = newWb();
    writeSubul(wb.addWorksheet(`원가집계표-${R.y.slice(2)}년 ${R.m}월 ${R.branch}`),
      R.y, R.m, R.branch, Object.values(R.subulMap));
    await saveWb(wb, `★ ${R.y.slice(2)}년도 ${R.m}월 아이메드 수불 - GC케어 제출용 ★ ${R.branch}.xlsx`);
  } finally {
    await hideGlobalLoading();
  }
}

async function downloadAll() {
  try {
    showGlobalLoading('전체 산출물 생성 중...');
    const R = App.R; 
    // 스피너는 유지한 채 순차 생성
    const wb1 = newWb();
    const ic = ['공급업체', '구매번호', '자재구분', '자재코드', '자재명', '상태', '입고일자', '수량', '단가', '공급가액', '부가세', '합계금액', '규격', '산출단위', '입고단위', '의뢰부서', '구분'];
    const iw = [16, 14, 8, 12, 40, 8, 12, 8, 12, 14, 12, 14, 10, 8, 8, 14, 10];
    const in_ = [8, 9, 10, 11, 12];
    writePivotVendor(wb1.addWorksheet('거래처 피벗'), R.gcVendors, R.imedVendors);
    writeDataSheet(wb1.addWorksheet('입고원본'), ic, [...R.gcIpgo, ...R.imedIpgo].map(d => ic.map(c => d[c] || '')), in_, iw);
    writeDataSheet(wb1.addWorksheet('GC케어 입고분'), ic, R.gcIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotItem(wb1.addWorksheet('원가집계표 피벗'), R.itemIpgoPivot, false);
    writePivotDept(wb1.addWorksheet('GC케어 마감피벗'), R.gcDepts);
    writeDataSheet(wb1.addWorksheet('아이메드 입고분'), ic, R.imedIpgo.map(d => ic.map(c => d[c] || '')), in_, iw);
    writePivotDept(wb1.addWorksheet('아이메드 마감피벗'), R.imedDepts);
    await saveWb(wb1, `${R.y.slice(2)}년 ${R.m}월 입고 - ${R.branch}.xlsx`);
    await sleep(200);

    // 나머지는 개별 함수 재사용 (각 함수 내부 스피너는 hideGlobalLoading 하지 않도록 플래그 없이 직접 호출)
    await hideGlobalLoading();
    await dlUsage();   await sleep(200);
    await dlGCReport(); await sleep(200);
    await dlImedReport(); await sleep(200);
    await dlSAP();     await sleep(200);
    await dlSubul();
  } catch(e) {
    await hideGlobalLoading();
    showMessage('전체 다운로드 중 오류: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// 12. 거래처 관리 (API 연동)
// ═══════════════════════════════════════════════════════════
async function loadVendorsFromServer() {
  try {
    const user = window.auth?.getSession?.();
    const res  = await apiGet('closingGetVendors', { request_user_email: user?.email });
    App.vendors = Array.isArray(res.data) ? res.data : [];
  } catch (e) {
    // 서버 오류 시 빈 배열 유지, 조용히 처리
    App.vendors = [];
  }
}

function renderVendorTable() {
  const tbody = document.getElementById('vendorTbody');
  if (!tbody) return;

  if (!App.vendors.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">등록된 거래처가 없습니다. [+ 행 추가] 또는 [엑셀 업로드]를 이용하세요.</td></tr>`;
    return;
  }

  tbody.innerHTML = App.vendors.map((v, i) => `
    <tr>
      <td><input type="text" value="${escHtml(v.vendor_name || '')}" data-idx="${i}" data-field="vendor_name" onchange="vendorEdit(this)"></td>
      <td><input type="text" value="${escHtml(v.biz_no || '')}" data-idx="${i}" data-field="biz_no" onchange="vendorEdit(this)"></td>
      <td style="text-align:center;"><input type="number" value="${v.credit_days ?? 90}" data-idx="${i}" data-field="credit_days" min="0" style="width:70px;text-align:center;" onchange="vendorEdit(this)"></td>
      <td style="text-align:center;">
        <select data-idx="${i}" data-field="pay_method" onchange="vendorEdit(this)">
          <option ${v.pay_method === '현금결제' ? 'selected' : ''}>현금결제</option>
          <option ${v.pay_method === '어음결제' ? 'selected' : ''}>어음결제</option>
          <option ${v.pay_method === '카드결제' ? 'selected' : ''}>카드결제</option>
        </select>
      </td>
      <td style="text-align:center;"><button onclick="deleteVendor(${i})" style="background:none;border:none;cursor:pointer;color:#c0392b;font-size:16px;" title="삭제">🗑</button></td>
    </tr>
  `).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function vendorEdit(el) {
  const idx   = parseInt(el.dataset.idx);
  const field = el.dataset.field;
  const val   = field === 'credit_days' ? (parseInt(el.value) || 0) : el.value;
  App.vendors[idx][field] = val;
  App.vendorsDirty = true;
}

function addVendorRow() {
  App.vendors.push({ vendor_name: '', biz_no: '', credit_days: 90, pay_method: '현금결제' });
  App.vendorsDirty = true;
  renderVendorTable();
  const lastRow = document.getElementById('vendorTbody').lastElementChild;
  lastRow?.querySelector('input')?.focus();
}

// ═══════════════════════════════════════════════════════════
// 13. 거래처 엑셀 업로드
// ═══════════════════════════════════════════════════════════

// 템플릿 다운로드
function downloadVendorTemplate() {
  const wb = XLSX.utils.book_new();
  const headers = ['거래처명 *', '사업자등록번호 *', '여신기간(일)', '결제방법'];
  const sample  = [
    ['GC메디아이', '2018155688', 90, '현금결제'],
    ['녹십자MS(주)', '1358167475', 90, '현금결제'],
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  // 컬럼 너비
  ws['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, '거래처마스터');
  XLSX.writeFile(wb, '거래처마스터_템플릿.xlsx');
}

// 엑셀 파일 선택 시 파싱 → 미리보기
let _uploadedVendorRows = [];

async function handleVendorExcel(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = ''; // 같은 파일 재선택 허용

  try {
    showGlobalLoading('파일을 분석하는 중...');
    _uploadedVendorRows = await parseVendorExcel(file);
    renderVendorUploadPreview(_uploadedVendorRows);
  } catch (err) {
    showMessage('파일 읽기 오류: ' + err.message, 'error');
  } finally {
    await hideGlobalLoading();
  }
}

function parseVendorExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const raw  = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!raw.length) { reject(new Error('데이터가 없습니다.')); return; }

        // 헤더 정규화 (* 제거, 공백 trim)
        const rows = raw.map((rawRow, idx) => {
          const norm = {};
          Object.entries(rawRow).forEach(([k, v]) => {
            norm[k.replace(/\s*\*$/, '').trim()] = String(v || '').trim();
          });
          const errors = [];
          if (!norm['거래처명'])       errors.push('거래처명 누락');
          if (!norm['사업자등록번호']) errors.push('사업자등록번호 누락');
          return {
            _row:       idx + 2,
            _errors:    errors,
            vendor_name:  norm['거래처명']       || '',
            biz_no:       norm['사업자등록번호'] || '',
            credit_days:  parseInt(norm['여신기간(일)']) || 90,
            pay_method:   norm['결제방법']       || '현금결제',
          };
        });
        resolve(rows);
      } catch (err) {
        reject(new Error('엑셀 파일을 읽지 못했습니다: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function renderVendorUploadPreview(rows) {
  const preview  = document.getElementById('vendorUploadPreview');
  const table    = document.getElementById('vendorUploadTable');
  const countEl  = document.getElementById('vendorUploadCount');
  const errorEl  = document.getElementById('vendorUploadError');
  const applyBtn = document.getElementById('btnApplyUpload');
  if (!preview || !table) return;

  // 기존 거래처 맵 (신규/업데이트 구분용)
  const existingMap = {};
  App.vendors.forEach(v => { existingMap[v.vendor_name] = true; });

  const errRows  = rows.filter(r => r._errors.length > 0);
  const newCount = rows.filter(r => !r._errors.length && !existingMap[r.vendor_name]).length;
  const updCount = rows.filter(r => !r._errors.length &&  existingMap[r.vendor_name]).length;

  countEl.textContent = `총 ${rows.length}건 (신규 ${newCount} / 업데이트 ${updCount})`;
  errorEl.textContent = errRows.length ? `오류 ${errRows.length}건 — 수정 후 다시 업로드해 주세요.` : '';
  if (applyBtn) applyBtn.style.display = errRows.length ? 'none' : '';

  const cols = ['거래처명', '사업자등록번호', '여신기간(일)', '결제방법'];
  const thead = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th>구분</th><th>검증</th></tr></thead>`;
  const tbody = `<tbody>${rows.map(r => {
    const hasErr = r._errors.length > 0;
    const isNew  = !existingMap[r.vendor_name];
    const badge  = hasErr ? '' : isNew
      ? `<span style="background:#e8effd;color:#1a56db;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">신규</span>`
      : `<span style="background:#f0fdf4;color:#0e7c3a;font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">업데이트</span>`;
    return `<tr style="${hasErr ? 'background:#fff5f5;' : ''}">
      <td>${escHtml(r.vendor_name)}</td>
      <td>${escHtml(r.biz_no)}</td>
      <td class="num">${r.credit_days}</td>
      <td>${escHtml(r.pay_method)}</td>
      <td style="text-align:center;">${badge}</td>
      <td>${hasErr ? `<span style="color:#c0392b;font-size:11px;">${escHtml(r._errors.join(', '))}</span>` : '✓'}</td>
    </tr>`;
  }).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
  preview.style.display = '';
  preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function applyVendorUpload() {
  const validRows = _uploadedVendorRows.filter(r => r._errors.length === 0);

  // 기존 데이터를 거래처명 기준 맵으로 변환
  const existingMap = {};
  App.vendors.forEach(v => { existingMap[v.vendor_name] = v; });

  let updated = 0, added = 0;

  validRows.forEach(({ vendor_name, biz_no, credit_days, pay_method }) => {
    if (existingMap[vendor_name]) {
      // 기존 거래처 → 업데이트
      existingMap[vendor_name] = { ...existingMap[vendor_name], biz_no, credit_days, pay_method };
      updated++;
    } else {
      // 신규 거래처 → 추가
      existingMap[vendor_name] = { vendor_name, biz_no, credit_days, pay_method };
      added++;
    }
  });

  App.vendors = Object.values(existingMap);
  App.vendorsDirty = true;
  cancelVendorUpload();
  renderVendorTable();

  const msg = [];
  if (updated) msg.push(`${updated}건 업데이트`);
  if (added)   msg.push(`${added}건 신규 추가`);
  showMessage(msg.join(', ') + ' 됐습니다. 저장 버튼을 눌러 반영하세요.', 'success');
}

function cancelVendorUpload() {
  _uploadedVendorRows = [];
  const preview = document.getElementById('vendorUploadPreview');
  if (preview) preview.style.display = 'none';
}

function deleteVendor(i) {
  App.vendors.splice(i, 1);
  App.vendorsDirty = true;
  renderVendorTable();
}

async function saveVendors() {
  if (!App.canEdit) { showMessage('저장 권한이 없습니다.', 'error'); return; }

  const btn = document.getElementById('btnSaveVendors');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  try {
    showGlobalLoading('거래처 정보 저장 중...');
    const user = window.auth?.getSession?.();
    await apiPost('closingSaveVendors', {
      request_user_email: user?.email,
      vendors: App.vendors,
    });
    App.vendorsDirty = false;
    showMessage('거래처 정보가 저장됐습니다.', 'success');
    btn.textContent = '✓ 저장됨';
    setTimeout(() => { btn.textContent = '💾 저장'; btn.disabled = false; }, 2000);
  } catch (e) {
    showMessage('저장 중 오류: ' + e.message, 'error');
    btn.textContent = '💾 저장';
    btn.disabled = false;
  } finally {
    await hideGlobalLoading();
  }
}
