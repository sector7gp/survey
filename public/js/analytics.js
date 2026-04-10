const Analytics = {
    logs: [],
    startTime: null,

    logEvent(eventType, data = {}) {
        const payload = {
            timestamp: new Date().toISOString(),
            eventType,
            ...data
        };
        this.logs.push(payload);
        console.log(`[Event: ${eventType}]`, payload);
        
        // Push to backend asynchronously
        if (window.API) {
            window.API.trackEvent(eventType, payload, data.lead_id);
        }
    },

    startSurvey() {
        this.startTime = Date.now();
        this.logEvent('survey_started');
    },

    questionAnswered(index, question, answerText, points) {
        this.logEvent('question_answered', { index, question, answerText, points });
    },

    surveyCompleted(score, profileCode) {
        const timeSpent = (Date.now() - this.startTime) / 1000;
        this.logEvent('survey_completed', { score, profileCode, timeSpentSeconds: timeSpent });
    },

    ctaClicked(ctaType, link, leadId = null) {
        this.logEvent('cta_clicked', { cta_type: ctaType, link, lead_id: leadId });
    },

    leadSubmitted(leadId) {
        this.logEvent('lead_submitted', { lead_id: leadId });
    }
};

window.Analytics = Analytics;
