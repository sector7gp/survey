const Analytics = {
    logs: [],
    startTime: null,

    logEvent(eventType, data = {}) {
        const payload = {
            timestamp: new Date().toISOString(),
            eventType,
            ...data,
        };
        this.logs.push(payload);
        console.log(`[Event: ${eventType}]`, payload);

        if (window.API) {
            window.API.trackEvent(eventType, payload, data.lead_id);
        }
    },

    setSurveyContext(surveyId, publicId) {
        this.surveyId = surveyId;
        this.publicId = publicId;
    },

    withSurvey(data = {}) {
        return {
            ...data,
            survey_id: this.surveyId,
            public_id: this.publicId,
        };
    },

    startSurvey() {
        this.startTime = Date.now();
        this.logEvent('survey_started', this.withSurvey());
    },

    questionAnswered(index, question, answerText, points) {
        this.logEvent('question_answered', this.withSurvey({ index, question, answerText, points }));
    },

    surveyCompleted(score, profileCode) {
        const timeSpent = (Date.now() - this.startTime) / 1000;
        this.logEvent('survey_completed', this.withSurvey({ score, profileCode, timeSpentSeconds: timeSpent }));
    },

    ctaClicked(ctaType, link, leadId = null) {
        this.logEvent('cta_clicked', this.withSurvey({ cta_type: ctaType, link, lead_id: leadId }));
    },

    leadSubmitted(leadId) {
        this.logEvent('lead_submitted', this.withSurvey({ lead_id: leadId }));
    }
};

window.Analytics = Analytics;
