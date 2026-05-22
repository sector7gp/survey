document.addEventListener('DOMContentLoaded', async () => {
    const screenIntro = document.getElementById('screen-intro');
    const screenSurvey = document.getElementById('screen-survey');
    const screenInterstitial = document.getElementById('screen-interstitial');
    const screenResult = document.getElementById('screen-result');

    const btnStart = document.getElementById('btn-start');
    const btnSkipLead = document.getElementById('btn-skip-lead');
    const formInterstitial = document.getElementById('form-interstitial');
    const formLead = document.getElementById('form-lead');
    const leadFormContent = document.getElementById('lead-form-content');
    const formSuccessMsg = document.getElementById('form-success_msg');

    let envConfig = null;
    let finalScore = 0;
    let finalProfileCode = 'red';
    let currentLeadId = sessionStorage.getItem('current_lead_id');
    let surveyAnswers = [];
    let userData = {
        nombre: sessionStorage.getItem('lead_nombre') || '',
        email: sessionStorage.getItem('lead_email') || '',
    };

    function applyMeta(meta) {
        if (meta.pageTitle) document.title = meta.pageTitle;
        if (meta.introTitle) {
            const el = document.getElementById('intro-title');
            if (el) el.textContent = meta.introTitle;
        }
        if (meta.introSubtitle) {
            const el = document.getElementById('intro-subtitle');
            if (el) el.textContent = meta.introSubtitle;
        }
        if (meta.interstitialTitle) {
            const el = document.getElementById('interstitial-title');
            if (el) el.textContent = meta.interstitialTitle;
        }
    }

    function buildScorePayload() {
        return {
            score: finalScore,
            profile: finalProfileCode,
            detailedAnswers: surveyAnswers.map((a, i) => ({
                question: envConfig.questions[i].text,
                answer: a.text,
                points: a.points,
            })),
        };
    }

    function leadPayload(extra = {}) {
        return {
            ...extra,
            survey_id: envConfig.surveyId,
            public_id: envConfig.publicId,
            scoreData: buildScorePayload(),
        };
    }

    async function init() {
        btnStart.textContent = 'Cargando...';
        btnStart.disabled = true;

        envConfig = await window.API.getConfig();

        if (!envConfig || !envConfig.questions) {
            btnStart.textContent = 'Encuesta no encontrada';
            return;
        }

        window.Scoring.init(envConfig.scoring);
        window.Analytics.setSurveyContext(envConfig.surveyId, envConfig.publicId);
        applyMeta(envConfig.meta || {});

        btnStart.textContent = 'Comenzar Evaluación';
        btnStart.disabled = false;
    }

    function switchScreen(hideScreen, showScreen) {
        hideScreen.classList.remove('screen-active');
        hideScreen.classList.add('screen-hidden');

        setTimeout(() => {
            showScreen.classList.remove('screen-hidden');
            showScreen.classList.add('screen-active');
        }, 100);
    }

    btnStart.addEventListener('click', () => {
        window.Analytics.startSurvey();
        switchScreen(screenIntro, screenSurvey);
        window.SurveyEngine.init(envConfig.questions, handleSurveyComplete);
    });

    function handleSurveyComplete(answers) {
        surveyAnswers = answers;
        finalScore = window.Scoring.calculateScore(answers);
        finalProfileCode = window.Scoring.getProfile(finalScore);

        window.Analytics.surveyCompleted(finalScore, finalProfileCode);

        renderResults(finalScore, finalProfileCode);
        switchScreen(screenSurvey, screenInterstitial);
    }

    formInterstitial.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = formInterstitial.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Generando informe...';

        const payload = leadPayload({
            nombre: document.getElementById('int-name').value,
            email: document.getElementById('int-email').value,
            rubro: 'Pendiente',
            empresa: 'Pendiente',
        });

        const result = await window.API.saveLead(payload);
        if (result.success) {
            currentLeadId = result.lead_id;
            sessionStorage.setItem('current_lead_id', currentLeadId);
            sessionStorage.setItem('lead_nombre', payload.nombre);
            sessionStorage.setItem('lead_email', payload.email);
            userData.nombre = payload.nombre;
            userData.email = payload.email;

            document.getElementById('lead-name').value = userData.nombre;
            document.getElementById('lead-email').value = userData.email;

            window.Analytics.leadSubmitted(result.lead_id);
            switchScreen(screenInterstitial, screenResult);
        } else {
            alert('Error guardando datos.');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Enviar mi informe';
        }
    });

    btnSkipLead.addEventListener('click', () => {
        window.API.trackEvent(
            'survey_finished_anonymous',
            window.Analytics.withSurvey(buildScorePayload())
        );
        switchScreen(screenInterstitial, screenResult);
    });

    function renderResults(score, profileCode) {
        const profile = envConfig.profiles[profileCode];
        if (!profile) return;

        document.body.className = profile.scoreClass || `profile-${profileCode}`;

        document.getElementById('result-emoji').textContent = profile.emoji;
        document.getElementById('result-label').textContent = profile.label || 'Tu perfil';
        document.getElementById('result-title').textContent = profile.title;

        const maxScore = envConfig.scoring.max || 24;
        document.getElementById('score-text').textContent = `${score} / ${maxScore}`;

        document.getElementById('result-desc').textContent = profile.desc;
        document.getElementById('cta-title').textContent = profile.ctaTitle || 'Siguiente paso';
        document.getElementById('cta-text').textContent = profile.ctaText || '';

        const btnCtaPrimary = document.getElementById('btn-cta-primary');
        btnCtaPrimary.textContent = profile.ctaBtn || 'Agendar Reunión';

        if (userData.nombre) document.getElementById('lead-name').value = userData.nombre;
        if (userData.email) document.getElementById('lead-email').value = userData.email;

        const agendaLink =
            profile.ctaLink || 'https://calendar.app.google/MVb6cbu5iAAZ1SG1A';
        btnCtaPrimary.href = agendaLink;

        btnCtaPrimary.onclick = () => {
            window.Analytics.ctaClicked('primary', agendaLink, currentLeadId);
        };
    }

    formLead.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = formLead.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Enviando...';

        const payload = leadPayload({
            nombre: document.getElementById('lead-name').value,
            email: document.getElementById('lead-email').value,
            rubro: document.getElementById('lead-industry').value,
            empresa: document.getElementById('lead-company').value,
            tamano_empresa: document.getElementById('lead-size').value,
            provincia: document.getElementById('lead-province').value,
            ciudad: document.getElementById('lead-city').value,
            whatsapp: document.getElementById('lead-whatsapp').value,
            cargo: document.getElementById('lead-role').value,
        });

        const result = await window.API.saveLead(payload);

        if (result.success) {
            currentLeadId = result.lead_id;
            sessionStorage.setItem('current_lead_id', currentLeadId);

            leadFormContent.classList.add('hidden');
            formSuccessMsg.classList.remove('hidden');
            window.Analytics.leadSubmitted(result.lead_id);
        } else {
            alert('Ocurrió un error guardando tus datos. Intentá de nuevo.');
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Recibir Reporte Detallado';
        }
    });

    init();
});
