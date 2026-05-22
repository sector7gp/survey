const API = {
    baseURL: '/api',

    getPublicIdFromPage() {
        const pathMatch = window.location.pathname.match(/^\/e\/([a-f0-9]{32})$/i);
        if (pathMatch) return pathMatch[1];
        const params = new URLSearchParams(window.location.search);
        return params.get('s') || params.get('publicId') || null;
    },

    async getConfig(publicId = null) {
        const pid = publicId || this.getPublicIdFromPage();
        try {
            const url = pid
                ? `${this.baseURL}/surveys/${pid}/config`
                : `${this.baseURL}/config${pid ? `?s=${pid}` : ''}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('API config failed');
            const data = await resp.json();
            return data.data;
        } catch (e) {
            console.warn('Backend API not found, falling back to local mock data for development.');
            try {
                const [qRes, cRes] = await Promise.all([
                    fetch('/preguntas.json'),
                    fetch('/cutoff.json'),
                ]);
                const pData = await qRes.json();
                const cData = await cRes.json();
                return {
                    surveyId: null,
                    publicId: pid,
                    questions: pData.questions,
                    profiles: pData.profiles,
                    scoring: cData.scoring,
                    meta: {},
                };
            } catch (err) {
                console.error('Critical error loading config', err);
                return null;
            }
        }
    },

    async saveLead(leadData) {
        try {
            const resp = await fetch(`${this.baseURL}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadData),
            });
            return await resp.json();
        } catch (e) {
            console.warn('Failed to save lead in API', e);
            return { success: false, error: 'Network error' };
        }
    },

    async trackEvent(eventType, data, lead_id = null) {
        try {
            const survey_id = data?.survey_id;
            const public_id = data?.public_id || window.API?.getPublicIdFromPage?.();
            const payload = { event_type: eventType, data, lead_id, survey_id, public_id };
            await fetch(`${this.baseURL}/analytics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (e) {
            console.warn('Analytics not tracked via API', eventType);
        }
    },
};

window.API = API;
