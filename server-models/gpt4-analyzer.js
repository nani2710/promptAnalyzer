const path = require('path');
const patterns = require(path.join(__dirname, '../patterns/gpt4/patterns.json'));

class GPT4Analyzer {
    analyzePrompt(prompt, category, role) {
        const metrics = this.calculateMetrics(prompt, category, role);
        const issues = this.detectIssues(prompt);
        const score = this.calculateOverallScore(metrics, prompt);
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
            model: 'gpt4',
            role: role || 'general'
        };
    }

    // ─── Merge base weights with category then role overrides ─────────────────

    getEffectiveWeights(category, role) {
        const base    = { ...patterns.scoringWeights };
        const catOvr  = patterns.category_weight_overrides?.[category] || {};
        const roleOvr = patterns.role_weight_overrides?.[role] || {};
        return { ...base, ...catOvr, ...roleOvr };
    }

    // ─── Normalize each dimension's earned points to 0-100 ────────────────────

    scoreDimension(prompt, dimension) {
        let earned = 0;
        let maxPossible = 0;
        for (const pattern of dimension.patterns) {
            maxPossible += pattern.points;
            try {
                if (new RegExp(pattern.regex, 'i').test(prompt)) earned += pattern.points;
            } catch (e) {}
        }
        return maxPossible > 0 ? Math.round((earned / maxPossible) * 100) : 0;
    }

    applyPenalties(prompt) {
        let penalty = 0;
        for (const p of patterns.penalty_patterns) {
            try {
                if (new RegExp(p.regex, 'i').test(prompt)) penalty += Math.abs(p.points);
            } catch (e) {}
        }
        return penalty;
    }

    applyBonuses(prompt) {
        let bonus = 0;
        for (const b of patterns.bonus_patterns) {
            try {
                if (new RegExp(b.regex, 'i').test(prompt)) bonus += b.points;
            } catch (e) {}
        }
        return bonus;
    }

    // ─── Map scoring_dimensions to the 6 frontend metric slots ────────────────

    calculateMetrics(prompt, category, role) {
        const dims = patterns.scoring_dimensions;
        const w = this.getEffectiveWeights(category, role);

        const reasoning  = this.scoreDimension(prompt, dims.explicit_reasoning_steps);
        const tokens     = this.scoreDimension(prompt, dims.token_efficiency);
        const context    = this.scoreDimension(prompt, dims.context_window_usage);
        const structured = this.scoreDimension(prompt, dims.structured_output);
        const intent     = this.scoreDimension(prompt, dims.clarity_of_intent);

        return {
            clarity:      Math.min(100, intent     * w.clarity),
            specificity:  Math.min(100, reasoning  * w.specificity),
            context:      Math.min(100, context    * w.context),
            constraints:  Math.min(100, tokens     * w.constraints),
            structure:    Math.min(100, structured * w.structure),
            completeness: Math.min(100, ((reasoning + intent) / 2) * w.completeness)
        };
    }

    calculateOverallScore(metrics, prompt) {
        const base = Object.values(metrics).reduce((a, b) => a + b, 0) / Object.values(metrics).length;
        return Math.max(0, Math.min(100, base + this.applyBonuses(prompt) - this.applyPenalties(prompt)));
    }

    // ─── Issue Detection using penalty_patterns + missing dimension hints ─────

    detectIssues(prompt) {
        const issues = [];

        // Penalty patterns → issues
        for (const p of patterns.penalty_patterns) {
            try {
                if (new RegExp(p.regex, 'i').test(prompt)) {
                    issues.push({ title: this._titleCase(p.name), description: p.description });
                }
            } catch (e) {}
        }

        // Missing critical dimension patterns → interrogation-based issues
        const dims = patterns.scoring_dimensions;
        const checks = [
            { dim: dims.explicit_reasoning_steps, key: 'few_shot_examples', qi: 'examples' },
            { dim: dims.token_efficiency,          key: 'word_limit_specified', qi: 'length' },
            { dim: dims.structured_output,         key: 'format_specified',     qi: 'format' },
            { dim: dims.clarity_of_intent,         key: 'audience_specified',   qi: 'audience' }
        ];

        for (const check of checks) {
            const pat = check.dim.patterns.find(p => p.name === check.key);
            if (pat) {
                try {
                    if (!new RegExp(pat.regex, 'i').test(prompt)) {
                        const q = patterns.interrogation_questions.find(q => q.missing_element === check.qi);
                        issues.push({
                            title: `Missing: ${this._titleCase(check.key)}`,
                            description: q ? q.question : pat.description
                        });
                    }
                } catch (e) {}
            }
        }

        return issues.slice(0, 6);
    }

    _titleCase(str) {
        return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // ─── Suggestion Builder — returns improved prompt directly ────────────────
    generateSuggestion(prompt, issues) {
        return this.improvePrompt(prompt, issues);
    }

    // ─── Prompt Improvement — GPT-4 optimised ≥90% rewrite ───────────────────
    improvePrompt(prompt, issues) {
        const p = prompt.trim();

        // ── 1. Role prefix ────────────────────────────────────────────────────
        let rolePrefix = '';
        if (!/^(you are|act as|assume you|take on the role|imagine you)/i.test(p)) {
            rolePrefix = 'You are an expert assistant with deep specialised knowledge.\n\n';
        }

        // ── 2. Strip vague words ──────────────────────────────────────────────
        const vagueMap = {
            'good': 'high-quality', 'nice': 'refined', 'cool': 'impressive',
            'interesting': 'noteworthy', 'big': 'significant', 'small': 'minimal',
            'really': '', 'very': 'highly', 'kind of': '', 'sort of': '',
            'things': 'elements', 'stuff': 'details'
        };
        let core = p;
        for (const [vague, precise] of Object.entries(vagueMap)) {
            core = core.replace(new RegExp(`\\b${vague}\\b`, 'gi'),
                precise ? precise : '').replace(/\s{2,}/g, ' ');
        }

        // ── 3. Detect what already exists ────────────────────────────────────
        const hasRole       = /^(you are|act as)/i.test(core);
        const hasFormat     = /\b(json|markdown|bullet|numbered|table|list|format:|output:)\b/i.test(core);
        const hasWordLimit  = /\d+[\s-]*(words|lines|tokens|characters)/i.test(core);
        const hasTone       = /\b(tone:|professional|formal|casual|concise|direct|clear)\b/i.test(core);
        const hasAudience   = /\b(audience|beginner|expert|professional|executive|intermediate)\b/i.test(core);
        const hasExample    = /\b(example:|for example|such as|sample:|e\.g\.|like this:)\b/i.test(core);
        const hasReasoning  = /\b(step.by.step|analyze|reason|break.?down|examine|evaluate|explain.*approach)\b/i.test(core);
        const hasFewShot    = /\b(example:|for example|sample output|like this:|e\.g\.|given this)\b/i.test(core);
        const hasAvoid      = /\b(avoid|do not|don't|exclude|without|no filler)\b/i.test(core);

        // ── 4. Build suffix — only add what's missing ────────────────────────
        const suffix = [];

        if (!hasFewShot) {
            suffix.push('Example output format: [Provide a 1-2 line sample showing the expected structure].');
        }
        if (!hasFormat) {
            suffix.push('Format: Structured markdown — numbered sections with sub-bullets.');
        }
        if (!hasWordLimit) {
            suffix.push('Length: 200–350 words.');
        }
        if (!hasTone) {
            suffix.push('Tone: Professional, precise, and direct.');
        }
        if (!hasAudience) {
            suffix.push('Target audience: Intermediate professionals familiar with the subject.');
        }
        if (!hasAvoid) {
            suffix.push('Avoid: Repetition, filler phrases, and unsupported generalisations.');
        }
        if (!hasReasoning) {
            suffix.push('Think through each point step-by-step before writing the final answer.');
        }
        // GPT-4 bonus: persona sharpening
        if (!hasRole) {
            suffix.push('Adopt the persona of a senior expert responding to a professional peer.');
        }

        const suffixBlock = suffix.length > 0
            ? '\n\n' + suffix.map(s => `- ${s}`).join('\n')
            : '';

        return `${rolePrefix}${core}${suffixBlock}`.trim();
    }


    // ─── Helpers ────────────────────────────────────────────────────────────────

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

module.exports = GPT4Analyzer;
