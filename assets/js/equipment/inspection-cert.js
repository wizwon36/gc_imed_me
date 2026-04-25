(function () {
  'use strict';

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

  function buildCertHTML(eq) {
    const rows = [
      ['장  비  명', safeVal(eq.equipment_name), '모  델  명',  safeVal(eq.model_name)],
      ['제  조  사', safeVal(eq.manufacturer),   '시리얼번호',  safeVal(eq.serial_no)],
      ['제 조 일 자', fmtDate(eq.manufacture_date), '취 득 일 자', fmtDate(eq.purchase_date)],
      ['구  매  처', safeVal(eq.vendor),          '취 득 가 액', fmtCost(eq.acquisition_cost)],
      ['사 용 부 서', safeVal(eq.department),      '현재 상태',   statusLabel(eq.status)],
      ['담  당  자', safeVal(eq.manager_name),    '담당자연락처', safeVal(eq.manager_phone)],
    ];

    const tableRows = rows.map(([l1, v1, l2, v2]) => `
      <tr>
        <th>${l1}</th><td>${v1}</td>
        <th>${l2}</th><td>${v2}</td>
      </tr>`).join('');

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
      border-bottom: 3px solid #1B4F8A;
      padding-bottom: 10px;
      margin-bottom: 16px;
      text-align: center;
    }
    .cert-title {
      font-size: 22pt;
      font-weight: bold;
      color: #1B4F8A;
      letter-spacing: 6px;
    }

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

    /* ── 빈칸 박스 (비고, 검수의견) ── */
    .blank-box {
      border: 1px solid #b0c4de;
      height: 80px;
      background: #fff;
      margin-bottom: 14px;
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
      padding: 5px 0;
      letter-spacing: 2px;
    }
    .sign-box-body {
      height: 70px;
      background: #F5F7FA;
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
      background: #F0F4FA;
    }
  </style>
</head>
<body>

  <!-- 헤더 -->
  <div class="cert-header">
    <div class="cert-title">의료장비 검수확인서</div>
  </div>

  <!-- 기본 정보 -->
  <div class="section-label">■ 장비 기본 정보</div>
  <table class="info-table">
    ${tableRows}
  </table>

  <!-- 비고 -->
  <div class="section-label">■ 비고 / 특이사항</div>
  <div class="blank-box"></div>

  <!-- 검수 확인 의견 -->
  <div class="section-label">■ 검수 확인 의견</div>
  <div class="blank-box"></div>

  <!-- 서명란 -->
  <div class="sign-section">
    <div class="sign-box">
      <div class="sign-box-title">검 수 자</div>
      <div class="sign-box-body"></div>
    </div>
    <div class="sign-box">
      <div class="sign-box-title">확 인 자</div>
      <div class="sign-box-body"></div>
    </div>
  </div>

  <!-- 확인 문구 -->
  <div class="confirm-statement">
    위 의료장비에 대하여 검수를 실시하고 이상 없음을 확인합니다.
  </div>

</body>
</html>`;
  }

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

    win.addEventListener('load', function () {
      setTimeout(function () {
        win.focus();
        win.print();
      }, 300);
    });
  }

  window.generateInspectionCertPDF = generateInspectionCertPDF;

})();
