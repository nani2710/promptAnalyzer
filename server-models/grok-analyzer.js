const path = require('path');
const patterns = require(path.join(__dirname, '../patterns/grok/patterns.json'));

class GrokAnalyzer {
    analyzePrompt(prompt, category, role) {
        const metrics = this.calculateMetrics(prompt, category, role);
        const issues = this.detectIssues(prompt);
        const score = this.calculateOverallScore(metrics);
        const suggestion = this.generateSuggestion(prompt, issues);
        const claudeTips = this.getModelTips(prompt);
        const improvedPrompt = this.improvePrompt(prompt, issues);

        return {
            score,
            metrics,
            issues,
            suggestion,
            claudeTips,
            improvedPrompt,
            category: category === 'auto' ? this.detectCategory(prompt) : category,
            model: 'grok',
            role: role || 'general'
        };
    }

    getEffectiveWeights(category, role) {
        const base = { ...patterns.scoringWeights };
        const catOvr = patterns.category_weight_overrides?.[category] || {};
        const roleOvr = patterns.role_weight_overrides?.[role] || {};
        return { ...base, ...catOvr, ...roleOvr };
    }

    calculateMetrics(prompt, category, role) {
        const words = prompt.split(/\s+/).filter(w => w.length > 0);
        const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const w = this.getEffectiveWeights(category, role);

        return {
            clarity: Math.min(100, this.calcClarity(prompt, words) * w.clarity),
            specificity: Math.min(100, this.calcSpecificity(prompt, words) * w.specificity),
            context: Math.min(100, this.calcContext(prompt, words) * w.context),
            constraints: Math.min(100, this.calcConstraints(prompt) * w.constraints),
            structure: Math.min(100, this.calcStructure(prompt, sentences) * w.structure),
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
        const vague = ['good', 'nice', 'cool', 'interesting', 'big', 'small', 'thing', 'stuff', 'really', 'very'];
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
        return this.improvePrompt(prompt, issues);
    }

    getModelTips(prompt) {
        const tips = [...(patterns.tips || [])];
        const extra = [];
        if (!/current|latest|X|Twitter|real-time|today/i.test(prompt)) extra.push('💡 Grok has live X (Twitter) access — frame prompts around current events or trending topics');
        if (!/brief|direct|tldr|no fluff|concise/i.test(prompt)) extra.push('💡 Add "Be direct, no fluff" — this matches Grok\'s natural style perfectly');
        if (!/honest|blunt|don\'t sugarcoat/i.test(prompt)) extra.push('💡 Say "Don\'t sugarcoat this" for Grok\'s unfiltered take');
        if (!/funny|witty|humor|sarcastic/i.test(prompt)) extra.push('💡 Grok handles wit — add "with humor" or "in a witty tone" for engaging responses');
        if (/please|could you|would you/i.test(prompt)) extra.push('💡 Skip the pleasantries — Grok is built for directness');
        return [...extra, ...tips].slice(0, 5);
    }

    improvePrompt(prompt, issues) {
        const p = prompt.trim();

        // ── 1. Role prefix (only if missing) ───────────────────────────
        let rolePrefix = '';
        if (!/^(you are|act as|assume you|take on the role)/i.test(p)) {
            rolePrefix = 'You are a direct, no-nonsense expert assistant.\n\n';
        }

        // ── 2. Strip vague words ─────────────────────────────────────────
        const vagueMap = {
            'good': 'sharp', 'nice': 'clean', 'cool': 'solid', 'really': '',
            'interesting': 'notable', 'big': 'significant', 'small': 'tight',
            'very': '', 'kind of': '', 'sort of': '', 'things': 'points',
            'stuff': 'details', 'thing': 'point'
        };
        let core = p;
        for (const [vague, precise] of Object.entries(vagueMap)) {
            core = core.replace(new RegExp(`\\b${vague}\\b`, 'gi'),
                precise ? precise : '').replace(/\s{2,}/g, ' ');
        }
        // Remove politeness — Grok penalises it
        core = core.replace(/\b(please|could you|would you|kindly|if possible)\b[,]?/gi, '').replace(/\s{2,}/g, ' ').trim();

        // ── 3. Detect what already exists ─────────────────────────────────
        const hasBrevity = /\b(brief|short|concise|direct|tldr|no fluff|\d+\s*(words|sentences|bullets|points))\b/i.test(core);
        const hasHonesty = /\b(honest|blunt|don't sugarcoat|frank|no fluff|straight)\b/i.test(core);
        const hasConstraint = /\b(\d+\s*(words|lines|points|bullets|sentences)|limit|max|under \d+)\b/i.test(core);
        const hasAvoid = /\b(avoid|don't|no filler|skip|exclude|no more than)\b/i.test(core);
        const hasFocus = /\b(focus|specific|only|just|narrow|exactly)\b/i.test(core);
        const hasFormat = /\b(bullet|numbered|list|markdown|table|format:|output:)\b/i.test(core);
        const hasTone = /\b(tone:|professional|casual|direct|blunt|witty|sarcastic)\b/i.test(core);

        // ── 4. Build suffix ───────────────────────────────────────────────────
        const suffix = [];

        if (!hasBrevity) {
            suffix.push('Be concise and direct — no filler, no fluff.');
        }
        if (!hasHonesty) {
            suffix.push("Be completely honest — don't sugarcoat or hedge unnecessarily.");
        }
        if (!hasConstraint) {
            suffix.push('Limit your response to 150–250 words or fewer.');
        }
        if (!hasAvoid) {
            suffix.push('Avoid: generic advice, filler phrases, excessive caveats.');
        }
        if (!hasFocus) {
            suffix.push('Focus only on what is directly asked — do not over-explain.');
        }
        if (!hasFormat) {
            suffix.push('Format: Use bullet points for clarity where applicable.');
        }
        if (!hasTone) {
            suffix.push('Tone: Direct and professional.');
        }

        const suffixBlock = suffix.length > 0
            ? '\n\n' + suffix.map(s => `- ${s}`).join('\n')
            : '';

        return `${rolePrefix}${core}${suffixBlock}`.trim();
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
