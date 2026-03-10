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

    // ─── Suggestion Builder ─────────────────────────────────────────────────────

    generateSuggestion(prompt, issues) {
        let s = prompt;
        if (!/^(you are|act as)/i.test(prompt)) {
            s = `You are a helpful expert assistant.\n\n${s}`;
        }
        if (!/\b(audience|beginner|expert|professional|executive)\b/i.test(s)) {
            s += `\n\nAudience: Intermediate-level professionals.`;
        }
        if (!/\b(format|JSON|list|bullet|markdown|table)\b/i.test(s)) {
            s += `\n\nFormat: Structured markdown with clear sections.`;
        }
        if (!/\b(\d+\s*(words|tokens|lines))\b/i.test(s)) {
            s += `\n\nLength: 200-300 words maximum.`;
        }
        if (!/example|instance|for example|sample/i.test(s)) {
            s += `\n\nInclude 1-2 concrete examples to illustrate key points.`;
        }
        return s;
    }

    // ─── Tips: per-prompt dynamic + static from JSON ───────────────────────────

    getModelTips(prompt) {
        const extra = [];
        const dims = patterns.scoring_dimensions;

        for (const [, dim] of Object.entries(dims)) {
            for (const pat of dim.patterns) {
                try {
                    if (!new RegExp(pat.regex, 'i').test(prompt)) {
                        extra.push(`\uD83D\uDCA1 ${pat.description}`);
                        break; // One tip per dimension max
                    }
                } catch (e) {}
            }
        }

        const staticTips = (patterns.tips || []).map(t => `\u2713 ${t}`);
        return [...extra, ...staticTips].slice(0, 5);
    }

    // ─── Prompt Improvement ─────────────────────────────────────────────────────

    improvePrompt(prompt, issues) {
        let improved = prompt;
        const vagueWords = ['good','nice','cool','interesting','big','small','really','very','kind of','sort of'];
        vagueWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            if (regex.test(improved)) improved = improved.replace(regex, `[BE SPECIFIC INSTEAD OF "${word}"]`);
        });

        if (issues.length > 2) {
            improved = `You are an expert assistant.\n\n${prompt}\n\nRequirements:\n- Audience: Intermediate professionals\n- Format: Markdown with subheadings\n- Length: 200-300 words\n- Tone: Professional and direct\n- Include: 1-2 concrete examples\n- Avoid: Jargon, repetition, filler\n\nThink step-by-step before responding.`;
        }
        return improved;
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
