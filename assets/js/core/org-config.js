window.ORG_CONFIG = {
  CLINIC_GROUP: 'ORG_CLINIC',
  TEAM_GROUP: 'ORG_TEAM',
  cache: {
    loaded: false,
    clinics: [],
    teams: []
  }
};

window.OrgService = {
  async load() {
    if (window.ORG_CONFIG.cache.loaded) {
      return window.ORG_CONFIG.cache;
    }

    const [clinicRes, teamRes] = await Promise.all([
      window.apiGet('getCodes', { code_group: window.ORG_CONFIG.CLINIC_GROUP }),
      window.apiGet('getCodes', { code_group: window.ORG_CONFIG.TEAM_GROUP })
    ]);

    const clinics = Array.isArray(clinicRes.data) ? clinicRes.data : [];
    const teams = Array.isArray(teamRes.data) ? teamRes.data : [];

    window.ORG_CONFIG.cache.loaded = true;
    window.ORG_CONFIG.cache.clinics = clinics;
    window.ORG_CONFIG.cache.teams = teams;

    return window.ORG_CONFIG.cache;
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
