const Scoring = {
    config: null,

    init(scoringConfig) {
        this.config = scoringConfig;
    },

    calculateScore(answers) {
        return answers.reduce((acc, curr) => acc + (curr.points || 0), 0);
    },

    getProfile(score) {
        if (!this.config || !this.config.ranges) return null;
        
        const matchingRange = this.config.ranges.find(r => score >= r.min && score <= r.max);
        return matchingRange ? matchingRange.profile : 'red'; // default a red si no encuentra
    }
};

window.Scoring = Scoring;
