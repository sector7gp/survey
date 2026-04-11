const Admin = {
    token: sessionStorage.getItem('admin_token'),
    
    // DOM
    screens: {
        login: document.getElementById('login-screen'),
        dashboard: document.getElementById('dashboard-screen')
    },
    modal: document.getElementById('modal-details'),
    
    init() {
        this.bindEvents();
        if (this.token) {
            this.showDashboard();
        }
    },

    bindEvents() {
        document.getElementById('form-login').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());
        document.getElementById('btn-export').addEventListener('click', () => this.exportCSV());
        document.getElementById('btn-refresh').addEventListener('click', () => this.loadData());
        document.getElementById('btn-close-modal').addEventListener('click', () => this.closeModal());
        
        // Cerrar modal al clickear afuera
        window.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });
    },

    async handleLogin(e) {
        e.preventDefault();
        const pass = document.getElementById('admin-pass').value;
        
        try {
            const resp = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pass })
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
        
        this.loadData();
    },

    async loadData() {
        const headers = { 'x-admin-token': this.token };
        
        try {
            // Stats
            const statsResp = await fetch('/api/admin/stats', { headers });
            if (statsResp.ok) {
                const { stats } = await statsResp.json();
                document.getElementById('stat-leads').textContent = stats.total_leads;
                document.getElementById('stat-started').textContent = stats.total_started;
                document.getElementById('dist-red').textContent = stats.profile_distribution.red;
                document.getElementById('dist-yellow').textContent = stats.profile_distribution.yellow;
                document.getElementById('dist-green').textContent = stats.profile_distribution.green;
            }

            // Results Table
            const leadsResp = await fetch('/api/admin/results', { headers });
            if (leadsResp.ok) {
                const { data } = await leadsResp.json();
                this.resultsData = data; // Guardar para exportar
                this.renderTable(data);
            }
        } catch (err) {
            console.error("Error loading dashboard data", err);
        }
    },

    renderTable(data) {
        const body = document.getElementById('leads-body');
        body.innerHTML = '';
        
        data.forEach(lead => {
            const tr = document.createElement('tr');
            // Asegurar que profile y score tengan valores por defecto seguros
            const profile = (lead.score_data && lead.score_data.profile) ? lead.score_data.profile : 'N/A';
            const score = (lead.score_data && lead.score_data.score !== undefined) ? lead.score_data.score : '-';
            const clickedCta = lead.clicked_cta ? '✅' : '❌';
            
            tr.innerHTML = `
                <td>${new Date(lead.fecha).toLocaleDateString()}</td>
                <td><strong>${lead.nombre}</strong></td>
                <td>${lead.email}</td>
                <td>${lead.rubro || '-'}</td>
                <td><span class="badge-profile ${profile}">${String(profile).toUpperCase()}</span></td>
                <td>${score} / 24</td>
                <td style="text-align:center">${clickedCta}</td>
                <td><button class="btn btn-outline btn-sm btn-view-detail" data-id="${lead.id}">👁️ Detalle</button></td>
                <td><button class="btn btn-outline btn-sm btn-delete-lead text-red" data-id="${lead.id}">🗑️ Borrar</button></td>
            `;
            body.appendChild(tr);
        });

        // Event delegation para botones de detalle
        body.querySelectorAll('.btn-view-detail').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                this.openDetails(id);
            });
        });

        // Event delegation para botones de eliminar
        body.querySelectorAll('.btn-delete-lead').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'));
                this.deleteLead(id);
            });
        });
    },

    async deleteLead(id) {
        if (!confirm("¿Estás seguro de que deseas eliminar este registro permanentemente? (Se borrará el lead y todas sus respuestas)")) return;

        try {
            const resp = await fetch(`/api/admin/leads/${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-token': this.token }
            });

            if (resp.ok) {
                this.loadData(); // Refrescar tabla y stats
            } else {
                alert("Error al eliminar el registro.");
            }
        } catch (err) {
            console.error(err);
        }
    },

    openDetails(id) {
        const lead = this.resultsData.find(l => l.id === id);
        if (!lead || !lead.score_data) return;

        document.getElementById('md-name').textContent = lead.nombre;
        document.getElementById('md-email').textContent = lead.email;
        
        const list = document.getElementById('answers-list');
        list.innerHTML = '';

        const answers = lead.score_data.detailedAnswers || [];
        if (answers.length === 0) {
            list.innerHTML = '<p class="text-muted">No hay detalles de respuestas disponibles para este registro.</p>';
        } else {
            answers.forEach(a => {
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
        
        const headers = ["Fecha", "Nombre", "Email", "Rubro", "Empresa", "Perfil", "Score"];
        const rows = this.resultsData.map(l => [
            new Date(l.fecha).toLocaleDateString(),
            l.nombre,
            l.email,
            l.rubro,
            l.empresa,
            l.score_data ? l.score_data.profile : '',
            l.score_data ? l.score_data.score : ''
        ]);
        
        let csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `leads_encuesta_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
