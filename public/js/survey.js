const SurveyEngine = {
    questions: [],
    currentIndex: 0,
    answers: [], // Array. Agregará objetos: { points, text }
    
    // DOM Elements
    elQuestionText: document.getElementById('question-text'),
    elOptionsContainer: document.getElementById('options-container'),
    elProgressBar: document.getElementById('progress-bar'),
    elProgressText: document.getElementById('progress-text'),
    btnNext: document.getElementById('btn-next'),
    btnPrev: document.getElementById('btn-prev'),
    container: document.querySelector('.question-container'),

    onComplete: null,

    init(questions, onCompleteCb) {
        this.questions = questions;
        this.onComplete = onCompleteCb;
        this.currentIndex = 0;
        this.answers = new Array(questions.length).fill(null);
        
        this.bindEvents();
        this.renderQuestion();
    },

    bindEvents() {
        this.btnNext.addEventListener('click', () => {
            if (this.answers[this.currentIndex] !== null) {
                this.nextQuestion();
            }
        });

        this.btnPrev.addEventListener('click', () => {
            if (this.currentIndex > 0) {
                this.prevQuestion();
            }
        });
    },

    renderQuestion() {
        const q = this.questions[this.currentIndex];
        
        // Reset animation
        this.container.classList.remove('slide-in', 'slide-up');
        void this.container.offsetWidth; // trigger reflow
        this.container.classList.add('slide-in');

        // Render UI
        this.elQuestionText.textContent = q.text;
        this.elOptionsContainer.innerHTML = '';
        
        q.options.forEach((opt, index) => {
            const card = document.createElement('div');
            card.className = 'option-card';
            if (this.answers[this.currentIndex] && this.answers[this.currentIndex].text === opt.text) {
                card.classList.add('selected');
            }
            card.textContent = opt.text;
            card.addEventListener('click', () => this.selectOption(opt, index, card));
            this.elOptionsContainer.appendChild(card);
        });

        // Update Progress
        const progressPct = ((this.currentIndex + 1) / this.questions.length) * 100;
        this.elProgressBar.style.width = `${progressPct}%`;
        this.elProgressText.textContent = `Pregunta ${this.currentIndex + 1} de ${this.questions.length}`;

        this.updateButtons();
    },

    selectOption(option, index, cardElement) {
        // Tracker Visual
        const cards = this.elOptionsContainer.querySelectorAll('.option-card');
        cards.forEach(c => c.classList.remove('selected'));
        cardElement.classList.add('selected');

        // Store Answer
        this.answers[this.currentIndex] = { text: option.text, points: option.points };
        this.updateButtons();

        // Track interact
        window.Analytics.questionAnswered(this.currentIndex + 1, this.questions[this.currentIndex].text, option.text, option.points);

        // Opcional: Auto-avanzar despues de un delay corto
        setTimeout(() => {
           if(this.currentIndex < this.questions.length - 1) {
               this.btnNext.click();
           } else {
               // Si es la última, habilitamos boton siguiente que dirá "Ver Resultados"
               this.updateButtons();
           }
        }, 400); 
    },

    nextQuestion() {
        if (this.currentIndex < this.questions.length - 1) {
            this.currentIndex++;
            this.renderQuestion();
        } else {
            // Finish
            if (this.onComplete) this.onComplete(this.answers);
        }
    },

    prevQuestion() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.renderQuestion();
        }
    },

    updateButtons() {
        this.btnPrev.disabled = this.currentIndex === 0;
        this.btnNext.disabled = this.answers[this.currentIndex] === null;

        if (this.currentIndex === this.questions.length - 1) {
            this.btnNext.textContent = "Ver Resultado ⭐";
        } else {
            this.btnNext.textContent = "Siguiente ⟶";
        }
    }
};

window.SurveyEngine = SurveyEngine;
