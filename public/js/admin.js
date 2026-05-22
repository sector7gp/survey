const Admin = {
    token: sessionStorage.getItem('admin_token'),
    surveys: [],
    selectedSurveyId: '',

    screens: {
        login: document.getElementById('login-screen'),
        dashboard: document.getElementById('dashboard-screen'),
    },
    modal: document.getElementById('modal-details'),
    surveyModal: document.getElementById('modal-survey-editor'),

    init() {
        this.bindEvents();
        if (this.token) this.showDashboard();
    },

    headers() {
        return { 'x-admin-token': this.token, 'Content-Type': 'application/json' };
    },

    bindEvents() {
        document.getElementById('form-login').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());
        document.getElementById('btn-export').addEventListener('click', () => this.exportCSV());
        document.getElementById('btn-refresh').addEventListener('click', () => this.loadData());
        document.getElementById('btn-close-modal').addEventListener('click', () => this.closeModal());
        document.getElementById('filter-survey').addEventListener('change', (e) => {
            this.selectedSurveyId = e.target.value;
            this.loadData();
        });

        document.querySelectorAll('.admin-tab').forEach((tab) => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        document.getElementById('btn-new-survey').addEventListener('click', () => this.openSurveyEditor(null));
        document.getElementById('btn-close-survey-editor').addEventListener('click', () => this.closeSurveyEditor());
        document.getElementById('btn-cancel-survey-editor').addEventListener('click', () => this.closeSurveyEditor());
        document.getElementById('form-survey-editor').addEventListener('submit', (e) => this.saveSurveyEditor(e));

        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
            if (e.target === this.surveyModal) this.closeSurveyEditor();
        });
    },

    switchTab(tabName) {
        document.querySelectorAll('.admin-tab').forEach((t) => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });
        document.getElementById('tab-leads').classList.toggle('hidden', tabName !== 'leads');
        document.getElementById('tab-surveys').classList.toggle('hidden', tabName !== 'surveys');
        if (tabName === 'surveys') this.loadSurveys();
    },

    async handleLogin(e) {
        e.preventDefault();
        const pass = document.getElementById('admin-pass').value;

        try {
            const resp = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pass }),
            });

            if (resp.ok) {
                this.token = pass;
                sessionStorage.setItem('admin_token', this.token);
                this.showDashboard();
            } else {
                document.getElementById('login-error').classList.remove('hidden');
            }
        } catch (err) {
            console.error(err);
        }
    },

    handleLogout() {
        sessionStorage.removeItem('admin_token');
        location.reload();
    },

    showDashboard() {
        this.screens.login.classList.add('hidden', 'screen-hidden');
        this.screens.login.classList.remove('screen-active');

        this.screens.dashboard.classList.remove('hidden', 'screen-hidden');
        this.screens.dashboard.classList.add('screen-active');

        this.loadSurveys().then(() => this.loadData());
    },

    async loadSurveys() {
        try {
            const resp = await fetch('/api/admin/surveys', { headers: this.headers() });
            if (!resp.ok) return;
            const { data } = await resp.json();
            this.surveys = data;
            this.renderSurveysTable(data);
            this.populateSurveyFilter(data);
        } catch (err) {
            console.error('Error loading surveys', err);
        }
    },

    populateSurveyFilter(surveyList) {
        const select = document.getElementById('filter-survey');
        const current = this.selectedSurveyId;
        select.innerHTML = '<option value="">Todas las encuestas</option>';
        surveyList.forEach((s) => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = s.name + (s.is_default ? ' (default)' : '');
            select.appendChild(opt);
        });
        select.value = current;
    },

    renderSurveysTable(data) {
        const body = document.getElementById('surveys-body');
        body.innerHTML = '';
        const origin = window.location.origin;

        data.forEach((s) => {
            const tr = document.createElement('tr');
            const publicUrl = `${origin}/e/${s.public_id}`;
            const status = s.active
                ? s.is_default
                    ? '✅ Default'
                    : '✅ Activa'
                : '⏸ Inactiva';

            tr.innerHTML = `
                <td><strong>${s.name}</strong>${s.is_default ? ' <span class="badge-default">DEFAULT</span>' : ''}</td>
                <td><code class="public-id">${s.public_id}</code></td>
                <td>${s.lead_count || 0}</td>
                <td>${status}</td>
                <td class="actions-cell">
                    <button class="btn btn-outline btn-sm btn-copy-link" data-url="${publicUrl}" title="Copiar enlace">🔗</button>
                    <button class="btn btn-outline btn-sm btn-edit-survey" data-id="${s.id}" title="Editar">✏️</button>
                    ${s.is_default ? '' : `<button class="btn btn-outline btn-sm btn-delete-survey text-red" data-id="${s.id}" title="Eliminar">🗑️</button>`}
                </td>
            `;
            body.appendChild(tr);
        });

        body.querySelectorAll('.btn-copy-link').forEach((btn) => {
            btn.addEventListener('click', () => {
                navigator.clipboard.writeText(btn.dataset.url);
                btn.textContent = '✓';
                setTimeout(() => { btn.textContent = '🔗'; }, 1500);
            });
        });

        body.querySelectorAll('.btn-edit-survey').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.openSurveyEditor(parseInt(btn.dataset.id, 10));
            });
        });

        body.querySelectorAll('.btn-delete-survey').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.deleteSurvey(parseInt(btn.dataset.id, 10));
            });
        });
    },

    async openSurveyEditor(surveyId) {
        if (surveyId === null) {
            const name = prompt('Nombre de la nueva encuesta:');
            if (!name) return;

            const cloneDefault = confirm('¿Clonar configuración de la encuesta por defecto? (Cancelar = plantilla vacía)');

            let clone_from_id = null;
            if (cloneDefault) {
                const def = this.surveys.find((s) => s.is_default) || this.surveys[0];
                if (def) clone_from_id = def.id;
            }

            const resp = await fetch('/api/admin/surveys', {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify({ name, clone_from_id }),
            });
            const result = await resp.json();
            if (!result.success) {
                alert(result.error || 'Error al crear');
                return;
            }
            await this.loadSurveys();
            alert(`Encuesta creada.\nEnlace público: ${window.location.origin}${result.data.public_url}`);
            this.openSurveyEditor(result.data.id);
            return;
        }

        const resp = await fetch(`/api/admin/surveys/${surveyId}`, { headers: this.headers() });
        if (!resp.ok) return;
        const { data } = await resp.json();

        document.getElementById('survey-editor-title').textContent = `Editar: ${data.name}`;
        document.getElementById('edit-survey-id').value = data.id;
        document.getElementById('edit-survey-name').value = data.name;
        document.getElementById('edit-survey-active').checked = !!data.active;
        document.getElementById('edit-survey-default').checked = !!data.is_default;
        document.getElementById('edit-survey-config').value = JSON.stringify(data.config, null, 2);

        this.surveyModal.classList.remove('hidden');
    },

    closeSurveyEditor() {
        this.surveyModal.classList.add('hidden');
    },

    async saveSurveyEditor(e) {
        e.preventDefault();
        const id = document.getElementById('edit-survey-id').value;
        let config;
        try {
            config = JSON.parse(document.getElementById('edit-survey-config').value);
        } catch {
            alert('JSON inválido en la configuración');
            return;
        }

        const body = {
            name: document.getElementById('edit-survey-name').value,
            active: document.getElementById('edit-survey-active').checked,
            is_default: document.getElementById('edit-survey-default').checked,
            config,
        };

        const resp = await fetch(`/api/admin/surveys/${id}`, {
            method: 'PUT',
            headers: this.headers(),
            body: JSON.stringify(body),
        });
        const result = await resp.json();
        if (result.success) {
            this.closeSurveyEditor();
            await this.loadSurveys();
            this.loadData();
        } else {
            alert(result.error || 'Error al guardar');
        }
    },

    async deleteSurvey(id) {
        if (!confirm('¿Eliminar o desactivar esta encuesta?')) return;
        const resp = await fetch(`/api/admin/surveys/${id}`, {
            method: 'DELETE',
            headers: this.headers(),
        });
        const result = await resp.json();
        if (result.success) {
            await this.loadSurveys();
            this.loadData();
            if (result.message) alert(result.message);
        } else {
            alert(result.error || 'Error');
        }
    },

    async loadData() {
        const headers = this.headers();
        const surveyQuery = this.selectedSurveyId
            ? `?survey_id=${this.selectedSurveyId}`
            : '';

        try {
            const statsResp = await fetch(`/api/admin/stats${surveyQuery}`, { headers });
            if (statsResp.ok) {
                const { stats } = await statsResp.json();
                document.getElementById('stat-leads').textContent = stats.total_leads;
                document.getElementById('stat-started').textContent = stats.total_started;

                const dist = stats.profile_distribution || {};
                document.getElementById('dist-red').textContent = dist.red || 0;
                document.getElementById('dist-yellow').textContent = dist.yellow || 0;
                document.getElementById('dist-green').textContent = dist.green || 0;
            }

            const leadsResp = await fetch(`/api/admin/results${surveyQuery}`, { headers });
            if (leadsResp.ok) {
                const { data } = await leadsResp.json();
                this.resultsData = data;
                this.renderTable(data);
            }
        } catch (err) {
            console.error('Error loading dashboard data', err);
        }
    },

    renderTable(data) {
        const body = document.getElementById('leads-body');
        body.innerHTML = '';

        const maxScoreDefault = 24;

        data.forEach((lead) => {
            const tr = document.createElement('tr');
            const profile =
                lead.score_data && lead.score_data.profile ? lead.score_data.profile : 'N/A';
            const score =
                lead.score_data && lead.score_data.score !== undefined
                    ? lead.score_data.score
                    : '-';
            const requestedReport = lead.score_data ? '✅' : '❌';
            const clickedCta = lead.clicked_cta ? '✅' : '❌';

            tr.innerHTML = `
                <td>${new Date(lead.fecha).toLocaleDateString()}</td>
                <td><strong>${lead.nombre}</strong></td>
                <td>${lead.email}</td>
                <td>${lead.empresa || '-'}</td>
                <td>${lead.tamano_empresa || '-'}</td>
                <td>${lead.cargo || '-'}</td>
                <td>${lead.whatsapp || '-'}</td>
                <td>${[lead.ciudad, lead.provincia].filter(Boolean).join(', ') || '-'}</td>
                <td><span class="survey-tag">${lead.survey_name || '-'}</span></td>
                <td><span class="badge-profile ${profile}">${String(profile).toUpperCase()}</span></td>
                <td>${score} / ${maxScoreDefault}</td>
                <td style="text-align:center">${requestedReport}</td>
                <td style="text-align:center">${clickedCta}</td>
                <td><button class="btn btn-outline btn-sm btn-view-detail" data-id="${lead.id}" title="Ver Detalle">👁️</button></td>
                <td><button class="btn btn-outline btn-sm btn-delete-lead text-red" data-id="${lead.id}" title="Borrar Registro">🗑️</button></td>
            `;
            body.appendChild(tr);
        });

        body.querySelectorAll('.btn-view-detail').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
                this.openDetails(id);
            });
        });

        body.querySelectorAll('.btn-delete-lead').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
                this.deleteLead(id);
            });
        });
    },

    async deleteLead(id) {
        if (
            !confirm(
                '¿Estás seguro de que deseas eliminar este registro permanentemente? (Se borrará el lead y todas sus respuestas)'
            )
        )
            return;

        try {
            const resp = await fetch(`/api/admin/leads/${id}`, {
                method: 'DELETE',
                headers: this.headers(),
            });

            if (resp.ok) this.loadData();
            else alert('Error al eliminar el registro.');
        } catch (err) {
            console.error(err);
        }
    },

    openDetails(id) {
        const lead = this.resultsData.find((l) => l.id === id);
        if (!lead) return;

        document.getElementById('md-name').textContent = lead.nombre || '-';
        document.getElementById('md-email').textContent = lead.email || '-';
        document.getElementById('md-company').textContent = lead.empresa || '-';
        document.getElementById('md-size').textContent = lead.tamano_empresa || '-';
        document.getElementById('md-role').textContent = lead.cargo || '-';
        document.getElementById('md-whatsapp').textContent = lead.whatsapp || '-';
        document.getElementById('md-location').textContent =
            [lead.ciudad, lead.provincia].filter(Boolean).join(', ') || '-';
        document.getElementById('md-rubro').textContent = lead.rubro || '-';

        const list = document.getElementById('answers-list');
        list.innerHTML = '';

        const answers =
            lead.score_data && lead.score_data.detailedAnswers
                ? lead.score_data.detailedAnswers
                : [];
        if (answers.length === 0) {
            list.innerHTML =
                '<p class="text-muted text-center py-4">No hay detalles de respuestas disponibles para este registro.</p>';
        } else {
            answers.forEach((a) => {
                const item = document.createElement('div');
                item.className = 'answer-item';
                item.innerHTML = `
                    <div class="ans-q">${a.question}</div>
                    <div class="ans-a">${a.answer}</div>
                `;
                list.appendChild(item);
            });
        }

        this.modal.classList.remove('hidden');
    },

    closeModal() {
        this.modal.classList.add('hidden');
    },

    exportCSV() {
        if (!this.resultsData) return;

        const headers = [
            'Fecha',
            'Nombre',
            'Email',
            'Empresa',
            'Tamaño',
            'Cargo',
            'WhatsApp',
            'Provincia',
            'Ciudad',
            'Rubro',
            'Encuesta',
            'Perfil',
            'Score',
        ];
        const rows = this.resultsData.map((l) => [
            new Date(l.fecha).toLocaleDateString(),
            `"${(l.nombre || '').replace(/"/g, '""')}"`,
            `"${(l.email || '').replace(/"/g, '""')}"`,
            `"${(l.empresa || '').replace(/"/g, '""')}"`,
            `"${(l.tamano_empresa || '').replace(/"/g, '""')}"`,
            `"${(l.cargo || '').replace(/"/g, '""')}"`,
            `"${(l.whatsapp || '').replace(/"/g, '""')}"`,
            `"${(l.provincia || '').replace(/"/g, '""')}"`,
            `"${(l.ciudad || '').replace(/"/g, '""')}"`,
            `"${(l.rubro || '').replace(/"/g, '""')}"`,
            `"${(l.survey_name || '').replace(/"/g, '""')}"`,
            l.score_data ? l.score_data.profile : '',
            l.score_data ? l.score_data.score : '',
        ]);

        const csvContent =
            '\uFEFF' +
            headers.join(',') +
            '\n' +
            rows.map((e) => e.join(',')).join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute(
            'download',
            `leads_encuesta_${new Date().toISOString().split('T')[0]}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
