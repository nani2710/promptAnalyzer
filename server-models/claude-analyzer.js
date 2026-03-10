const path = require('path');
const patterns = require(path.join(__dirname, '../patterns/claude/patterns.json'));

class ClaudeAnalyzer {
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
            model: 'claude',
            role: role || 'general'
        };
    }

    // ─── Merge base weights with category then role overrides ─────────────────

    getEffectiveWeights(category, role) {
        const base   = { ...patterns.scoringWeights };
        const catOvr = patterns.category_weight_overrides?.[category] || {};
        const roleOvr = patterns.role_weight_overrides?.[role] || {};
        return { ...base, ...catOvr, ...roleOvr };
    }

    // ─── Scoring via scoring_dimensions ────────────────────────────────────────

    scoreDimension(prompt, dimension) {
        let earned = 0;
        let maxPossible = 0;
        for (const pattern of dimension.patterns) {
            maxPossible += pattern.points;
            try {
                const regex = new RegExp(pattern.regex, 'i');
                if (regex.test(prompt)) earned += pattern.points;
            } catch (e) { /* skip bad regex */ }
        }
        // Normalize to 0-100
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

    calculateMetrics(prompt, category, role) {
        const dims = patterns.scoring_dimensions;
        const w = this.getEffectiveWeights(category, role);

        // Map scoring_dimensions to the 6 metric slots
        const structureScore  = this.scoreDimension(prompt, dims.system_level_structuring);
        const formatScore     = this.scoreDimension(prompt, dims.format_blueprints);
        const cotScore        = this.scoreDimension(prompt, dims.chain_of_thought);
        const constraintScore = this.scoreDimension(prompt, dims.constraint_clarity);
        const directScore     = this.scoreDimension(prompt, dims.directiveness);
        const multimodScore   = this.scoreDimension(prompt, dims.multimodal_grounding);

        return {
            clarity:      Math.min(100, directScore     * w.clarity),
            specificity:  Math.min(100, formatScore     * w.specificity),
            context:      Math.min(100, structureScore  * w.context),
            constraints:  Math.min(100, constraintScore * w.constraints),
            structure:    Math.min(100, cotScore        * w.structure),
            completeness: Math.min(100, (multimodScore + formatScore) / 2 * w.completeness)
        };
    }

    calculateOverallScore(metrics, prompt) {
        const base = Object.values(metrics).reduce((a, b) => a + b, 0) / Object.values(metrics).length;
        const bonuses  = this.applyBonuses(prompt);
        const penalties = this.applyPenalties(prompt);
        return Math.max(0, Math.min(100, base + bonuses - penalties));
    }

    // ─── Issue Detection using patterns ────────────────────────────────────────

    detectIssues(prompt) {
        const issues = [];

        // Penalties become issues with guidance
        for (const p of patterns.penalty_patterns) {
            try {
                if (new RegExp(p.regex, 'i').test(prompt)) {
                    issues.push({ title: this._titleCase(p.name), description: p.description });
                }
            } catch (e) {}
        }

        // Missing key dimensions become issues using interrogation_questions
        const dims = patterns.scoring_dimensions;
        const checks = [
            { dim: dims.system_level_structuring, key: 'role_assignment',    qi: 'role_assignment' },
            { dim: dims.chain_of_thought,          key: 'step_by_step',       qi: 'chain_of_thought' },
            { dim: dims.format_blueprints,          key: 'format_spec',        qi: 'format' },
            { dim: dims.constraint_clarity,         key: 'word_limit',         qi: 'constraints' }
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

        return issues.slice(0, 6); // Cap at 6 issues
    }

    _titleCase(str) {
        return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // ─── Suggestion Builder ─────────────────────────────────────────────────────

    generateSuggestion(prompt, issues) {
        let s = prompt;
        if (!/^(you are|act as|assume you|take on the role)/i.test(prompt)) {
            s = `You are a helpful expert.\n\n${s}`;
        }
        if (!/\b(audience|beginner|expert|student|professional)\b/i.test(s)) {
            s += `\n\nTarget audience: Beginners with basic understanding.`;
        }
        if (!/\b(format|JSON|list|bullet|markdown|numbered)\b/i.test(s)) {
            s += `\n\nFormat: Structured numbered list with clear explanations.`;
        }
        if (!/\b(\d+\s*(words|lines|sentences))\b/i.test(s)) {
            s += `\n\nLength: Under 200 words.`;
        }
        if (!/step.by.step|reason|think|analyze/i.test(s)) {
            s += `\n\nThink step-by-step before responding.`;
        }
        return s;
    }

    // ─── Tips from patterns.tips + dynamic additions ────────────────────────────

    getModelTips(prompt) {
        const extra = [];

        // Dynamic per-prompt tips from scoring_dimensions
        const dims = patterns.scoring_dimensions;
        for (const [, dim] of Object.entries(dims)) {
            for (const pat of dim.patterns) {
                try {
                    if (!new RegExp(pat.regex, 'i').test(prompt)) {
                        extra.push(`\uD83D\uDCA1 ${pat.description}`);
                        break; // One tip per dimension
                    }
                } catch (e) {}
            }
        }

        // Static tips from JSON
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
            // Use the excellent example structure from patterns as template
            improved = `You are an expert assistant.\n\n${prompt}\n\nStructure:\n1. Key points (2-3 sentences)\n2. Supporting details (specific examples)\n3. Actionable takeaway\n\nTone: Professional and clear\nLength: 150-250 words\nFormat: Numbered sections\nAvoid: Jargon without explanation, vague generalities\n\nThink step-by-step before responding.`;
        }
        return improved;
    }

    // ─── Overall Score ──────────────────────────────────────────────────────────

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

module.exports = ClaudeAnalyzer;
