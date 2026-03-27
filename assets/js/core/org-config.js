window.ORG_CONFIG = {
  CACHE_KEY: 'gc_imed_me_org_data_v1',
  CACHE_TTL: 1000 * 60 * 30, // 30분
  cache: {
    loaded: false,
    loadingPromise: null,
    clinics: [],
    teams: []
  }
};

window.OrgService = {
  getCachedData() {
    try {
      const raw = sessionStorage.getItem(window.ORG_CONFIG.CACHE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.savedAt || !parsed.data) return null;

      const isExpired = (Date.now() - parsed.savedAt) > window.ORG_CONFIG.CACHE_TTL;
      if (isExpired) return null;

      return parsed.data;
    } catch (error) {
      return null;
    }
  },

  setCachedData(data) {
    try {
      sessionStorage.setItem(
        window.ORG_CONFIG.CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          data
        })
      );
    } catch (error) {
      // 저장 실패해도 무시
    }
  },

  async load() {
    if (window.ORG_CONFIG.cache.loaded) {
      return window.ORG_CONFIG.cache;
    }

    const cached = this.getCachedData();
    if (cached) {
      window.ORG_CONFIG.cache.loaded = true;
      window.ORG_CONFIG.cache.clinics = Array.isArray(cached.clinics) ? cached.clinics : [];
      window.ORG_CONFIG.cache.teams = Array.isArray(cached.teams) ? cached.teams : [];
      return window.ORG_CONFIG.cache;
    }

    if (window.ORG_CONFIG.cache.loadingPromise) {
      return window.ORG_CONFIG.cache.loadingPromise;
    }

    window.ORG_CONFIG.cache.loadingPromise = (async () => {
      const result = await window.apiGet('getOrgData');
      const data = result.data || {};

      const clinics = Array.isArray(data.clinics) ? data.clinics : [];
      const teams = Array.isArray(data.teams) ? data.teams : [];

      window.ORG_CONFIG.cache.loaded = true;
      window.ORG_CONFIG.cache.clinics = clinics;
      window.ORG_CONFIG.cache.teams = teams;

      this.setCachedData({ clinics, teams });

      return window.ORG_CONFIG.cache;
    })();

    try {
      return await window.ORG_CONFIG.cache.loadingPromise;
    } finally {
      window.ORG_CONFIG.cache.loadingPromise = null;
    }
  },

  async preload() {
    await this.load();
  },

  async getClinics() {
    const cache = await this.load();
    return cache.clinics;
  },

  async getTeams() {
    const cache = await this.load();
    return cache.teams;
  },

  async getTeamsByClinicCode(clinicCode) {
    const teams = await this.getTeams();
    return teams.filter(team => String(team.parent_code || '').trim() === String(clinicCode || '').trim());
  },

  async getClinicName(clinicCode) {
    const clinics = await this.getClinics();
    const found = clinics.find(item => String(item.code_value || '').trim() === String(clinicCode || '').trim());
    return found ? String(found.code_name || '').trim() : '';
  },

  async getTeamName(teamCode) {
    const teams = await this.getTeams();
    const found = teams.find(item => String(item.code_value || '').trim() === String(teamCode || '').trim());
    return found ? String(found.code_name || '').trim() : '';
  },

  setLoadingState(clinicEl, teamEl) {
    if (clinicEl) {
      clinicEl.innerHTML = '<option value="">의원 불러오는 중...</option>';
      clinicEl.disabled = true;
    }

    if (teamEl) {
      teamEl.innerHTML = '<option value="">팀 불러오는 중...</option>';
      teamEl.disabled = true;
    }
  },

  async fillClinicSelect(selectEl, options = {}) {
    if (!selectEl) return;

    const {
      includeEmpty = true,
      emptyLabel = '의원을 선택하세요',
      selectedValue = ''
    } = options;

    const clinics = await this.getClinics();

    let html = '';
    if (includeEmpty) {
      html += `<option value="">${emptyLabel}</option>`;
    }

    html += clinics.map(item => {
      const value = String(item.code_value || '').trim();
      const name = String(item.code_name || '').trim();
      return `<option value="${value}">${name}</option>`;
    }).join('');

    selectEl.innerHTML = html;
    selectEl.disabled = false;
    selectEl.value = selectedValue || '';
  },

  async fillTeamSelect(selectEl, clinicCode, options = {}) {
    if (!selectEl) return;

    const {
      includeEmpty = true,
      emptyLabel = '팀을 선택하세요',
      selectedValue = ''
    } = options;

    const teams = clinicCode ? await this.getTeamsByClinicCode(clinicCode) : [];

    let html = '';
    if (includeEmpty) {
      html += `<option value="">${emptyLabel}</option>`;
    }

    html += teams.map(item => {
      const value = String(item.code_value || '').trim();
      const name = String(item.code_name || '').trim();
      return `<option value="${value}">${name}</option>`;
    }).join('');

    selectEl.innerHTML = html;
    selectEl.disabled = !clinicCode;
    selectEl.value = selectedValue || '';
  },

  async bindClinicTeam(clinicEl, teamEl, options = {}) {
    const {
      clinicEmptyLabel = '의원을 선택하세요',
      teamEmptyLabel = '팀을 선택하세요',
      initialClinicCode = '',
      initialTeamCode = ''
    } = options;

    this.setLoadingState(clinicEl, teamEl);

    await this.fillClinicSelect(clinicEl, {
      includeEmpty: true,
      emptyLabel: clinicEmptyLabel,
      selectedValue: initialClinicCode
    });

    await this.fillTeamSelect(teamEl, initialClinicCode, {
      includeEmpty: true,
      emptyLabel: teamEmptyLabel,
      selectedValue: initialTeamCode
    });

    clinicEl.addEventListener('change', async () => {
      await this.fillTeamSelect(teamEl, clinicEl.value, {
        includeEmpty: true,
        emptyLabel: teamEmptyLabel,
        selectedValue: ''
      });
    });
  },

  async buildOrgPayload(clinicCode, teamCode) {
    const clinic_name = await this.getClinicName(clinicCode);
    const team_name = await this.getTeamName(teamCode);

    return {
      clinic_code: clinicCode || '',
      clinic_name: clinic_name || '',
      team_code: teamCode || '',
      team_name: team_name || '',
      department: clinic_name && team_name ? `${clinic_name} / ${team_name}` : ''
    };
  }
};
