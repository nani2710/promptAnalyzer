const path = require('path');
const patterns = require(path.join(__dirname, '../patterns/grok/patterns.json'));

class GrokAnalyzer {
    analyzePrompt(prompt, category) {
        const metrics = this.calculateMetrics(prompt);
        const issues = this.detectIssues(prompt);
        const score = this.calculateOverallScore(metrics);
        const suggestion = this.generateSuggestion(prompt, issues);
        const claudeTips = this.getModelTips(prompt); // key stays claudeTips for frontend compat
        const improvedPrompt = this.improvePrompt(prompt, issues);

        return {
            score,
            metrics,
            issues,
            suggestion,
            claudeTips,
            improvedPrompt,
            category: category === 'auto' ? this.detectCategory(prompt) : category,
            model: 'grok'
        };
    }

    calculateMetrics(prompt) {
        const words = prompt.split(/\s+/).filter(w => w.length > 0);
        const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const w = patterns.scoringWeights;

        return {
            clarity:      Math.min(100, this.calcClarity(prompt, words) * w.clarity),
            specificity:  Math.min(100, this.calcSpecificity(prompt, words) * w.specificity),
            context:      Math.min(100, this.calcContext(prompt, words) * w.context),
            constraints:  Math.min(100, this.calcConstraints(prompt) * w.constraints),
            structure:    Math.min(100, this.calcStructure(prompt, sentences) * w.structure),
            completeness: Math.min(100, this.calcCompleteness(prompt) * w.completeness)
        };
    }

    calcClarity(prompt, words) {
        let v = 50;
        if (/^(write|create|build|explain|analyze|summarize|list|tell|describe)/i.test(prompt)) v += 15;
        if (words.length > 3) v += 10;
        // Grok bonus: directness signals
        if (/brief|short|quick|tldr|TL;DR|in a sentence|one line/i.test(prompt)) v += 15;
        if (words.length > 80) v -= 10; // Penalize overly long prompts for Grok
        return v;
    }

    calcSpecificity(prompt, words) {
        const vague = ['good','nice','cool','interesting','big','small','thing','stuff','really','very'];
        const vagueCount = vague.filter(w => prompt.toLowerCase().includes(w)).length;
        let v = 70;
        v -= vagueCount * 8;
        if (/\d+/.test(prompt)) v += 10;
        if (/\b(function|API|JSON|SQL|algorithm|X|Twitter|real-time|current)\b/i.test(prompt)) v += 15;
        return v;
    }

    calcContext(prompt, words) {
        let v = 40;
        if (/\b(audience|user|reader|student|beginner|expert|professional)\b/i.test(prompt)) v += 15;
        if (/\b(current|latest|today|trend|now|real-time|X|Twitter)\b/i.test(prompt)) v += 20;
        if (/\b(for|to|in order|purpose|goal|objective)\b/i.test(prompt)) v += 10;
        return v;
    }

    calcConstraints(prompt) {
        let v = 30;
        if (/\b(\d+\s*(words|characters|lines|points|bullet|sentences))\b/i.test(prompt)) v += 30;
        if (/brief|short|tldr|TL;DR|concise|no fluff|direct/i.test(prompt)) v += 25;
        if (/\b(don't|avoid|exclude|limit|no more than|skip)\b/i.test(prompt)) v += 15;
        return v;
    }

    calcStructure(prompt, sentences) {
        let v = 50;
        // Grok prefers short, punchy prompts — reward brevity
        if (sentences.length <= 3) v += 15;
        if (/^\d+\.|^\s*-|^\s*\*/.test(prompt)) v += 10;
        return v;
    }

    calcCompleteness(prompt) {
        let v = 0;
        if (/^(write|create|build|explain|generate|analyze|summarize|list|describe)/i.test(prompt)) v += 20;
        if (/\b(for|to|audience|user|reader|given|real-time|current)\b/i.test(prompt)) v += 20;
        if (/\b(brief|short|tldr|\d+\s*(words|lines|bullet))\b/i.test(prompt)) v += 20;
        if (/\b(direct|concise|no fluff|blunt|honest|frank)\b/i.test(prompt)) v += 20;
        if (/specific|detail|include|mention|focus/i.test(prompt)) v += 20;
        return v;
    }

    detectIssues(prompt) {
        const issues = [];
        const vagueWords = {
            'good': 'Replace with "sharp", "accurate", "no-fluff"',
            'nice': 'Be specific about what you want',
            'cool': 'Use precise descriptors',
            'interesting': 'Replace with concrete details',
            'big': 'Quantify: "top 5", "in 3 sentences"',
            'small': 'Quantify instead',
            'thing': 'Use specific nouns',
            'stuff': 'Be concrete'
        };
        for (const [word, suggestion] of Object.entries(vagueWords)) {
            if (prompt.toLowerCase().includes(word)) {
                issues.push({ title: `Vague Word: "${word}"`, description: suggestion });
                break;
            }
        }
        if (!/brief|short|tldr|TL;DR|concise|direct|no fluff|\d+\s*(words|sentences|bullet)/i.test(prompt)) {
            issues.push({ title: 'No Brevity Signal', description: 'Grok favors terse responses — add "Be direct", "TL;DR:", or "in 3 bullet points" to match its style.' });
        }
        if (!/\b(honest|blunt|don't sugarcoat|frank|no fluff|direct)\b/i.test(prompt)) {
            issues.push({ title: 'No Directness Signal', description: 'Tell Grok "Be completely honest" or "Don\'t sugarcoat this" for its most natural response.' });
        }
        if (!/current|latest|today|trend|X|Twitter|real-time|news/i.test(prompt)) {
            issues.push({ title: 'Not Leveraging Real-Time Access', description: 'Grok has live X (Twitter) data — frame prompts around current events or real-time trends when relevant.' });
        }
        return issues;
    }

    generateSuggestion(prompt, issues) {
        let s = prompt;
        if (!/^(you are|act as)/i.test(prompt)) s = `You are a direct, no-fluff AI assistant.\n\n${s}`;
        if (!/brief|short|direct|concise|tldr/i.test(s)) s += `\n\nBe direct and concise. No fluff.`;
        if (!/honest|blunt|don't sugarcoat/i.test(s)) s += `\n\nBe completely honest — don't sugarcoat.`;
        return s;
    }

    getModelTips(prompt) {
        const tips = [...patterns.tips];
        const extra = [];
        if (!/current|latest|X|Twitter|real-time|today/i.test(prompt)) extra.push('💡 Grok has live X (Twitter) access — frame prompts around current events or trending topics');
        if (!/brief|direct|tldr|no fluff|concise/i.test(prompt)) extra.push('💡 Add "Be direct, no fluff" — this matches Grok\'s natural style perfectly');
        if (!/honest|blunt|don\'t sugarcoat/i.test(prompt)) extra.push('💡 Say "Don\'t sugarcoat this analysis" for Grok\'s unfiltered take');
        if (!/funny|witty|humor|sarcastic/i.test(prompt)) extra.push('💡 Grok handles wit — add "with humor" or "in a witty tone" for engaging responses');
        if (/please|could you|would you/i.test(prompt)) extra.push('💡 Skip the pleasantries — Grok is built for directness');
        return [...extra, ...tips].slice(0, 5);
    }

    improvePrompt(prompt, issues) {
        let improved = prompt;
        const vagueWords = ['good','nice','cool','interesting','big','small','really','very','kind of','sort of'];
        vagueWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            if (regex.test(improved)) improved = improved.replace(regex, `[BE SPECIFIC INSTEAD OF "${word}"]`);
        });
        if (issues.length > 2) {
            improved = `${prompt}\n\nRules:\n- Be direct and concise\n- No fluff or filler\n- Don't sugarcoat\n- Max 3 bullet points or 100 words\n- Use real-time X data if relevant`;
        }
        return improved;
    }

    calculateOverallScore(metrics) {
        const values = Object.values(metrics);
        return values.reduce((a, b) => a + b, 0) / values.length;
    }

    detectCategory(prompt) {
        const p = prompt.toLowerCase();
        if (/write|story|essay|poem|creative|narrative|dialogue|character/i.test(p)) return 'creative';
        if (/code|function|script|program|debug|algorithm|optimize/i.test(p)) return 'technical';
        if (/research|summary|fact|source|academic|paper|study/i.test(p)) return 'research';
        if (/role|play|brainstorm|debate|discuss|conversation/i.test(p)) return 'conversational';
        if (/email|plan|schedule|organize|list|task|workflow/i.test(p)) return 'productivity';
        if (/explain|learn|understand|teach|tutorial|guide|educate/i.test(p)) return 'educational';
        if (/joke|funny|humor|pun|riddle|fun|game/i.test(p)) return 'fun';
        return 'auto';
    }
}

module.exports = GrokAnalyzer;
