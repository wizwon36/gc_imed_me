/**
 * inspection-cert.js
 * 의료장비 검수확인서 PDF 생성 (브라우저 내장 Print API 사용 — 외부 라이브러리 불필요)
 *
 * 사용법:
 *   generateInspectionCertPDF(equipmentData);   // equipment-detail.js 에서 호출
 */

(function () {
  'use strict';

  /* ────────────────────────────────────────────────────────────
   * 유틸
   * ────────────────────────────────────────────────────────────*/
  function safeVal(v) {
    return (v === null || v === undefined || String(v).trim() === '') ? '-' : String(v).trim();
  }

  function fmtDate(v) {
    if (!v) return '-';
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[1] + '년 ' + m[2] + '월 ' + m[3] + '일';
    return s;
  }

  function fmtCost(v) {
    if (v === null || v === undefined || String(v).trim() === '') return '-';
    const n = Number(String(v).replace(/,/g, ''));
    if (isNaN(n)) return String(v);
    return n.toLocaleString('ko-KR') + ' 원';
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }

  function statusLabel(v) {
    const map = {
      IN_USE: '사용중', REPAIRING: '수리중',
      INSPECTING: '점검중', STORED: '보관중', DISPOSED: '폐기'
    };
    return map[String(v).trim().toUpperCase()] || safeVal(v);
  }

  /* ────────────────────────────────────────────────────────────
   * HTML 템플릿 생성
   * ────────────────────────────────────────────────────────────*/
  function buildCertHTML(eq) {
    const rows = [
      ['장  비  명',  safeVal(eq.equipment_name),  '모  델  명',  safeVal(eq.model_name)],
      ['제  조  사',  safeVal(eq.manufacturer),    '시리얼번호',  safeVal(eq.serial_no)],
      ['제 조 일 자',  fmtDate(eq.manufacture_date), '취 득 일 자', fmtDate(eq.purchase_date)],
      ['구  매  처',  safeVal(eq.vendor),           '취 득 가 액', fmtCost(eq.acquisition_cost)],
      ['사 용 부 서',  safeVal(eq.department),       '현재 위치',   safeVal(eq.location)],
      ['현재사용자',  safeVal(eq.current_user),      '현재 상태',   statusLabel(eq.status)],
      ['담  당  자',  safeVal(eq.manager_name),      '담당자연락처', safeVal(eq.manager_phone)],
      ['유지보수종료', fmtDate(eq.maintenance_end_date), '장 비 번 호', safeVal(eq.equipment_id)],
    ];

    const tableRows = rows.map(([l1, v1, l2, v2]) => `
      <tr>
        <th>${l1}</th><td>${v1}</td>
        <th>${l2}</th><td>${v2}</td>
      </tr>`).join('');

    const memo = safeVal(eq.memo);

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"/>
  <title>의료장비 검수확인서</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 18mm 18mm 18mm 18mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', 'NanumGothic', Arial, sans-serif;
      font-size: 10pt;
      color: #1a1a2e;
      background: #fff;
    }

    /* ── 헤더 ── */
    .cert-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 3px solid #1B4F8A;
      padding-bottom: 10px;
      margin-bottom: 16px;
    }
    .cert-logo-area { display: flex; align-items: center; gap: 10px; }
    .cert-logo-icon {
      width: 38px; height: 38px;
      background: #1B4F8A;
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 20px; font-weight: bold;
    }
    .cert-logo-texts .org { font-size: 8.5pt; color: #555; }
    .cert-logo-texts .sys { font-size: 10pt; font-weight: bold; color: #1B4F8A; }
    .cert-title-area { text-align: center; flex: 1; }
    .cert-title {
      font-size: 19pt;
      font-weight: bold;
      color: #1B4F8A;
      letter-spacing: 6px;
    }
    .cert-subtitle { font-size: 8.5pt; color: #666; margin-top: 2px; letter-spacing: 1px; }
    .cert-doc-info { text-align: right; font-size: 8pt; color: #555; line-height: 1.7; }
    .cert-doc-info strong { color: #1a1a2e; }

    /* ── 섹션 제목 ── */
    .section-label {
      background: #1B4F8A;
      color: #fff;
      font-size: 9.5pt;
      font-weight: bold;
      padding: 5px 12px;
      margin-bottom: 0;
      letter-spacing: 1px;
    }

    /* ── 기본 정보 테이블 ── */
    .info-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
    }
    .info-table th, .info-table td {
      border: 1px solid #b0c4de;
      padding: 6px 10px;
      font-size: 9.5pt;
      vertical-align: middle;
    }
    .info-table th {
      background: #EAF0F8;
      font-weight: bold;
      color: #1B4F8A;
      width: 13%;
      text-align: center;
      white-space: nowrap;
    }
    .info-table td {
      width: 24%;
      background: #fff;
    }

    /* ── 검수 확인 의견 ── */
    .opinion-box {
      border: 1px solid #b0c4de;
      min-height: 56px;
      padding: 10px 14px;
      font-size: 9.5pt;
      color: #333;
      background: #fff;
      margin-bottom: 14px;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* ── 서명란 ── */
    .sign-section {
      display: flex;
      gap: 12px;
      margin-bottom: 14px;
    }
    .sign-box {
      flex: 1;
      border: 1px solid #b0c4de;
      border-radius: 4px;
      overflow: hidden;
    }
    .sign-box-title {
      background: #2E75B6;
      color: #fff;
      font-size: 9pt;
      font-weight: bold;
      text-align: center;
      padding: 4px 0;
      letter-spacing: 2px;
    }
    .sign-box-body {
      display: flex;
      background: #F5F7FA;
    }
    .sign-field {
      flex: 1;
      padding: 8px 0 8px 12px;
    }
    .sign-field-label { font-size: 7.5pt; color: #777; margin-bottom: 2px; }
    .sign-field-value { font-size: 9pt; font-weight: bold; color: #1a1a2e; min-height: 18px; }
    .sign-stamp {
      width: 60px;
      display: flex; align-items: center; justify-content: center;
      border-left: 1px dashed #c0cfe0;
    }
    .stamp-circle {
      width: 44px; height: 44px;
      border: 2px solid #c0cfe0;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 7.5pt; color: #bbb; text-align: center; line-height: 1.3;
    }

    /* ── 확인 문구 ── */
    .confirm-statement {
      border: 1.5px solid #1B4F8A;
      border-radius: 4px;
      padding: 10px 16px;
      font-size: 9.5pt;
      color: #1B4F8A;
      text-align: center;
      font-weight: bold;
      letter-spacing: 0.5px;
      margin-bottom: 14px;
      background: #F0F4FA;
    }

    /* ── 푸터 ── */
    .cert-footer {
      border-top: 1px solid #dce4ef;
      padding-top: 7px;
      display: flex;
      justify-content: space-between;
      font-size: 7.5pt;
      color: #888;
    }
  </style>
</head>
<body>

  <!-- 헤더 -->
  <div class="cert-header">
    <div class="cert-logo-area">
      <div class="cert-logo-icon">+</div>
      <div class="cert-logo-texts">
        <div class="org">의료기관 의료장비 관리시스템</div>
        <div class="sys">IMED MANAGER</div>
      </div>
    </div>
    <div class="cert-title-area">
      <div class="cert-title">의료장비 검수확인서</div>
      <div class="cert-subtitle">Medical Equipment Inspection Certificate</div>
    </div>
    <div class="cert-doc-info">
      <div>발행일자 <strong>${todayStr()}</strong></div>
      <div>문서번호 <strong>CERT-${safeVal(eq.equipment_id)}</strong></div>
    </div>
  </div>

  <!-- 기본 정보 -->
  <div class="section-label">■ 장비 기본 정보</div>
  <table class="info-table">
    ${tableRows}
  </table>

  <!-- 비고 -->
  <div class="section-label">■ 비고 / 특이사항</div>
  <div class="opinion-box">${memo === '-' ? '' : memo}</div>

  <!-- 검수 확인 의견 -->
  <div class="section-label">■ 검수 확인 의견</div>
  <div class="opinion-box" style="min-height:70px;"></div>

  <!-- 서명란 -->
  <div class="sign-section">
    <div class="sign-box">
      <div class="sign-box-title">검 수 자</div>
      <div class="sign-box-body">
        <div class="sign-field">
          <div class="sign-field-label">성명</div>
          <div class="sign-field-value">${safeVal(eq.manager_name)}</div>
          <div class="sign-field-label" style="margin-top:6px;">부서</div>
          <div class="sign-field-value">${safeVal(eq.department)}</div>
        </div>
        <div class="sign-stamp"><div class="stamp-circle">서명<br/>또는<br/>인</div></div>
      </div>
    </div>
    <div class="sign-box">
      <div class="sign-box-title">확 인 자</div>
      <div class="sign-box-body">
        <div class="sign-field">
          <div class="sign-field-label">성명</div>
          <div class="sign-field-value"></div>
          <div class="sign-field-label" style="margin-top:6px;">직위</div>
          <div class="sign-field-value"></div>
        </div>
        <div class="sign-stamp"><div class="stamp-circle">서명<br/>또는<br/>인</div></div>
      </div>
    </div>
    <div class="sign-box">
      <div class="sign-box-title">승 인 자</div>
      <div class="sign-box-body">
        <div class="sign-field">
          <div class="sign-field-label">성명</div>
          <div class="sign-field-value"></div>
          <div class="sign-field-label" style="margin-top:6px;">직위</div>
          <div class="sign-field-value"></div>
        </div>
        <div class="sign-stamp"><div class="stamp-circle">서명<br/>또는<br/>인</div></div>
      </div>
    </div>
  </div>

  <!-- 확인 문구 -->
  <div class="confirm-statement">
    위 의료장비에 대하여 검수를 실시하고 이상 없음을 확인합니다.
  </div>

  <!-- 푸터 -->
  <div class="cert-footer">
    <span>본 문서는 의료장비 관리시스템에서 자동 생성되었습니다.</span>
    <span>발행일: ${todayStr()}</span>
  </div>

</body>
</html>`;
  }

  /* ────────────────────────────────────────────────────────────
   * 메인 함수 — 팝업 창으로 인쇄 다이얼로그 열기
   * ────────────────────────────────────────────────────────────*/
  function generateInspectionCertPDF(equipmentData) {
    if (!equipmentData) {
      alert('장비 데이터를 불러올 수 없습니다.');
      return;
    }

    const html = buildCertHTML(equipmentData);

    const win = window.open('', '_blank', 'width=900,height=1100,scrollbars=yes');
    if (!win) {
      alert('팝업이 차단되었습니다.\n브라우저 팝업 허용 설정을 확인해 주세요.');
      return;
    }

    win.document.open();
    win.document.write(html);
    win.document.close();

    // 렌더링 완료 후 인쇄 다이얼로그 (PDF 저장 가능)
    win.addEventListener('load', function () {
      setTimeout(function () {
        win.focus();
        win.print();
      }, 300);
    });
  }

  /* 전역 노출 */
  window.generateInspectionCertPDF = generateInspectionCertPDF;

})();
