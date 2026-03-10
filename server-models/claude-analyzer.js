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


    // ─── Suggestion Builder — returns the improved prompt directly ────────────
    generateSuggestion(prompt, issues) {
        return this.improvePrompt(prompt, issues);
    }

    // ─── Tips from patterns.tips + dynamic additions ──────────────────────────
    getModelTips(prompt) {
        const extra = [];
        const dims = patterns.scoring_dimensions;
        for (const [, dim] of Object.entries(dims)) {
            for (const pat of dim.patterns) {
                try {
                    if (!new RegExp(pat.regex, 'i').test(prompt)) {
                        extra.push(`\uD83D\uDCA1 ${pat.description}`);
                        break;
                    }
                } catch (e) {}
            }
        }
        const staticTips = (patterns.tips || []).map(t => `\u2713 ${t}`);
        return [...extra, ...staticTips].slice(0, 5);
    }

    // ─── Prompt Improvement — Claude-optimised ≥90% rewrite ───────────────────
    improvePrompt(prompt, issues) {
        const p = prompt.trim();

        // ── 1. Extract or build the role line ─────────────────────────────────
        let rolePrefix = '';
        if (/^(you are|act as|assume you|take on the role)/i.test(p)) {
            rolePrefix = '';           // already has role — keep as-is at top
        } else {
            rolePrefix = 'You are an expert professional with deep domain knowledge.\n\n';
        }

        // ── 2. Strip vague words ──────────────────────────────────────────────
        const vagueMap = {
            'good': 'effective', 'nice': 'precise', 'cool': 'innovative',
            'interesting': 'significant', 'big': 'large-scale', 'small': 'concise',
            'really': '', 'very': 'exceptionally', 'kind of': '', 'sort of': '',
            'things': 'elements', 'stuff': 'components'
        };
        let core = p;
        for (const [vague, precise] of Object.entries(vagueMap)) {
            core = core.replace(new RegExp(`\\b${vague}\\b`, 'gi'),
                precise ? precise : '').replace(/\s{2,}/g, ' ');
        }

        // ── 3. Detect what the prompt already has ────────────────────────────
        const hasFormat     = /\b(json|xml|markdown|bullet|numbered list|table|format:|output:)\b/i.test(core);
        const hasWordLimit  = /\d+[\s-]*(words|lines|sentences|characters|tokens)/i.test(core);
        const hasTone       = /\b(tone:|style:|professional|formal|casual|concise|technical|scholarly)\b/i.test(core);
        const hasAudience   = /\b(audience|beginner|expert|student|professional|executive|target)\b/i.test(core);
        const hasAvoid      = /\b(avoid|do not|don't|exclude|without)\b/i.test(core);
        const hasStepByStep = /step.by.step|reason|think through|analyze|conduct|evaluate|examine/i.test(core);
        const hasConstraint = /\b(constraint|limit|boundary|must|should|cannot|rule)\b/i.test(core);
        const hasStructure  = /\b(structure:|sections:|1\.|2\.|components:|parts:)\b/i.test(core);

        // ── 4. Build the suffix block — only add what's missing ──────────────
        const suffix = [];

        if (!hasStructure && !hasFormat) {
            suffix.push('Structure your response with clearly labeled sections.');
        }
        if (!hasFormat) {
            suffix.push('Format: Markdown with numbered sections and sub-bullets.');
        }
        if (!hasWordLimit) {
            suffix.push('Length: 250–400 words.');
        }
        if (!hasTone) {
            suffix.push('Tone: Professional, clear, and evidence-based.');
        }
        if (!hasAudience) {
            suffix.push('Target audience: Professionals with intermediate background knowledge.');
        }
        if (!hasAvoid) {
            suffix.push('Avoid: Jargon without explanation, generic filler, vague claims.');
        }
        if (!hasConstraint) {
            suffix.push('Constraint: Focus only on what is directly asked — do not over-expand.');
        }
        if (!hasStepByStep) {
            suffix.push('Reasoning: Analyze each point step-by-step before presenting your findings.');
        }

        // Bonus: impact signal for Claude constitutional AI scoring
        if (!/\b(impact|consider|implication|ethical|value)\b/i.test(core)) {
            suffix.push('Highlight the practical impact and key implications of each point.');
        }

        // ── 5. Assemble the final improved prompt ─────────────────────────────
        const suffixBlock = suffix.length > 0
            ? '\n\n' + suffix.map(s => `- ${s}`).join('\n')
            : '';

        return `${rolePrefix}${core}${suffixBlock}`.trim();
    }

    // ─── Category Detection ───────────────────────────────────────────────────
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

