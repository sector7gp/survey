document.addEventListener('DOMContentLoaded', async () => {
    // Referencias DOM
    const screenIntro = document.getElementById('screen-intro');
    const screenSurvey = document.getElementById('screen-survey');
    const screenInterstitial = document.getElementById('screen-interstitial');
    const screenResult = document.getElementById('screen-result');
    
    const btnStart = document.getElementById('btn-start');
    const btnSkipLead = document.getElementById('btn-skip-lead');
    const formInterstitial = document.getElementById('form-interstitial');
    const formLead = document.getElementById('form-lead');
    const formSuccessMsg = document.getElementById('form-success_msg');
    
    // Variables globales
    let envConfig = null;
    let finalScore = 0;
    let finalProfileCode = 'red';
    let currentLeadId = sessionStorage.getItem('current_lead_id');
    let surveyAnswers = []; // Para persistir detalladamente

    // 1. Init App
    async function init() {
        btnStart.textContent = "Cargando...";
        btnStart.disabled = true;

        envConfig = await window.API.getConfig();
        
        if (!envConfig || !envConfig.questions) {
            btnStart.textContent = "Error al cargar la encuesta";
            return;
        }

        window.Scoring.init(envConfig.scoring);
        
        btnStart.textContent = "Comenzar Evaluación";
        btnStart.disabled = false;
    }

    // 2. Transiciones de Pantallas
    function switchScreen(hideScreen, showScreen) {
        hideScreen.classList.remove('screen-active');
        hideScreen.classList.add('screen-hidden');
        
        setTimeout(() => {
            showScreen.classList.remove('screen-hidden');
            showScreen.classList.add('screen-active');
        }, 100);
    }

    // 3. Eventos Intro
    btnStart.addEventListener('click', () => {
        window.Analytics.startSurvey();
        switchScreen(screenIntro, screenSurvey);
        window.SurveyEngine.init(envConfig.questions, handleSurveyComplete);
    });

    // 4. Completar Encuesta
    function handleSurveyComplete(answers) {
        surveyAnswers = answers; // Guardamos las respuestas detalladas
        finalScore = window.Scoring.calculateScore(answers);
        finalProfileCode = window.Scoring.getProfile(finalScore);
        
        window.Analytics.surveyCompleted(finalScore, finalProfileCode);
        
        renderResults(finalScore, finalProfileCode);
        
        // Si ya tenemos Lead ID de una sesion previa, saltamos a resultados, sino a Intersticial
        if (currentLeadId) {
            switchScreen(screenSurvey, screenResult);
        } else {
            switchScreen(screenSurvey, screenInterstitial);
        }
    }

    // Eventos Intersticial
    formInterstitial.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = formInterstitial.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Generando informe...";

        const payload = {
            nombre: document.getElementById('int-name').value,
            email: document.getElementById('int-email').value,
            rubro: "Pendiente",
            empresa: "Pendiente",
            scoreData: {
                score: finalScore,
                profile: finalProfileCode,
                detailedAnswers: surveyAnswers.map((a, i) => ({
                    question: envConfig.questions[i].text,
                    answer: a.text,
                    points: a.points
                }))
            }
        };

        const result = await window.API.saveLead(payload);
        if (result.success) {
            currentLeadId = result.lead_id;
            sessionStorage.setItem('current_lead_id', currentLeadId);
            window.Analytics.leadSubmitted(result.lead_id);
            switchScreen(screenInterstitial, screenResult);
        } else {
            alert("Error guardando datos.");
            btnSubmit.disabled = false;
        }
    });

    btnSkipLead.addEventListener('click', () => {
        // Guardar respuestas de forma anónima/sesión antes de mostrar resultado
        window.API.trackEvent('survey_finished_anonymous', { 
            score: finalScore, 
            profile: finalProfileCode,
            detailedAnswers: surveyAnswers.map((a, i) => ({
                question: envConfig.questions[i].text,
                answer: a.text,
                points: a.points
            }))
        });
        switchScreen(screenInterstitial, screenResult);
    });

    // 5. Render de Resultados
    function renderResults(score, profileCode) {
        const profile = envConfig.profiles[profileCode];
        if (!profile) return;

        // Actualizar Body class para cambiar estilos/gradientes globales
        document.body.className = profile.scoreClass || `profile-${profileCode}`;

        document.getElementById('result-emoji').textContent = profile.emoji;
        document.getElementById('result-label').textContent = profile.label || "Tu perfil";
        document.getElementById('result-title').textContent = profile.title;
        
        // Puntuacion
        const maxScore = envConfig.scoring.max || 24;
        document.getElementById('score-text').textContent = `${score} / ${maxScore}`;
        
        document.getElementById('result-desc').textContent = profile.desc;

        // CTA Secundarios textuales del perfil
        document.getElementById('cta-title').textContent = profile.ctaTitle || "Siguiente paso";
        document.getElementById('cta-text').textContent = profile.ctaText || "";
        
        const btnCtaPrimary = document.getElementById('btn-cta-primary');
        btnCtaPrimary.textContent = profile.ctaBtn || "Agendar Reunión";
        
        // La URL viene de la constante del prompt o del JSON. Priority: JSON
        const agendaLink = profile.ctaLink || "https://calendar.app.google/MVb6cbu5iAAZ1SG1A";
        btnCtaPrimary.href = agendaLink;

        btnCtaPrimary.addEventListener('click', () => {
            window.Analytics.ctaClicked('primary', agendaLink, currentLeadId);
        });
    }

    // 6. Enviar Formulario de Lead
    formLead.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSubmit = formLead.querySelector('button[type="submit"]');
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Enviando...";

        const payload = {
            nombre: document.getElementById('lead-name').value,
            email: document.getElementById('lead-email').value,
            rubro: document.getElementById('lead-industry').value,
            empresa: document.getElementById('lead-company').value,
            scoreData: {
                score: finalScore,
                profile: finalProfileCode,
                detailedAnswers: surveyAnswers.map((a, i) => ({
                    question: envConfig.questions[i].text,
                    answer: a.text,
                    points: a.points
                }))
            }
        };

        const result = await window.API.saveLead(payload);
        
        if (result.success) {
            currentLeadId = result.lead_id;
            sessionStorage.setItem('current_lead_id', currentLeadId);
            
            formLead.classList.add('hidden');
            formSuccessMsg.classList.remove('hidden');
            window.Analytics.leadSubmitted(result.lead_id);
        } else {
            alert("Ocurrió un error guardando tus datos. Intentá de nuevo.");
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Recibir Reporte Detallado";
        }
    });

    // Boot
    init();
});
