const CONFIG = {
  APP_NAME: 'MSO관리팀 업무지원 시스템',
  API_BASE_URL: 'https://script.google.com/macros/s/AKfycbzh5cjixtZzHArX6JrWqTcAUVlY3a9fhXKpAfmQuRCXpHRtBMbuzPK4zyyPyVauRCWc/exec',
  SITE_BASE_URL: 'https://wizwon36.github.io/gc_imed_me',

  // 의료장비 앱 오픈 허용 의원 목록 — 신규 의원 추가 시 여기만 수정
  EQUIPMENT_ALLOWED_CLINICS: ['서울숲의원'],

  // 세션/캐시 스토리지 키 — 버전 변경 시 여기만 수정
  CACHE_KEYS: {
    DASHBOARD_SESSION:    'gc_imed_dashboard_v3',
    DASHBOARD_PERMISSION: 'gc_imed_dashboard_permission_v1',
    ORG_DATA:             'gc_imed_me_org_data_v1'
  }
};
