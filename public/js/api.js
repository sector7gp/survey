const API = {
    baseURL: '/api',

    async getConfig() {
        try {
            const resp = await fetch(`${this.baseURL}/config`);
            if (!resp.ok) throw new Error('API config failed');
            const data = await resp.json();
            return data.data; // { questions, profiles, scoring }
        } catch (e) {
            console.warn("Backend API not found, falling back to local mock data for development.");
            // Si el backend no está levantado, probamos con JSON locales asumiendo un server estático
            try {
                const [qRes, cRes] = await Promise.all([
                    fetch('/preguntas.json'),
                    fetch('/cutoff.json')
                ]);
                const pData = await qRes.json();
                const cData = await cRes.json();
                return {
                    questions: pData.questions,
                    profiles: pData.profiles,
                    scoring: cData.scoring
                };
            } catch (err) {
                console.error("Critical error loading config", err);
                return null;
            }
        }
    },

    async saveLead(leadData) {
        try {
            const resp = await fetch(`${this.baseURL}/leads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadData)
            });
            return await resp.json();
        } catch (e) {
            console.warn("Failed to save lead in API", e);
            return { success: false, error: "Network error" };
        }
    },

    async trackEvent(eventType, data) {
        try {
            await fetch(`${this.baseURL}/analytics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event_type: eventType, data })
            });
        } catch (e) {
            console.warn("Analytics not tracked via API", eventType);
        }
    }
};

window.API = API;
