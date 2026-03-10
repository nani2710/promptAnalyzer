const path = require('path');
const patterns = require(path.join(__dirname, '../patterns/gemini/patterns.json'));

class GeminiAnalyzer {
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
            model: 'gemini',
            role: role || 'general'
        };
    }

    getEffectiveWeights(category, role) {
        const base    = { ...patterns.scoringWeights };
        const catOvr  = patterns.category_weight_overrides?.[category] || {};
        const roleOvr = patterns.role_weight_overrides?.[role] || {};
        return { ...base, ...catOvr, ...roleOvr };
    }

    calculateMetrics(prompt, category, role) {
        const words = prompt.split(/\s+/).filter(w => w.length > 0);
        const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);
        const w = this.getEffectiveWeights(category, role);

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
        if (/^(write|create|build|explain|analyze|summarize|describe|generate)/i.test(prompt)) v += 15;
        if (words.length > 5) v += 10;
        if (/^(tell me|give me|what is)/i.test(prompt)) v -= 10;
        return v;
    }

    calcSpecificity(prompt, words) {
        const vague = ['good','nice','cool','interesting','big','small','thing','stuff','really','very'];
        const vagueCount = vague.filter(w => prompt.toLowerCase().includes(w)).length;
        let v = 70;
        v -= vagueCount * 8;
        if (/\d+/.test(prompt)) v += 10;
        if (/\b(function|API|JSON|SQL|algorithm|framework|schema|multimodal)\b/i.test(prompt)) v += 15;
        return v;
    }

    calcContext(prompt, words) {
        let v = 40;
        if (/\b(audience|user|reader|student|beginner|expert|professional)\b/i.test(prompt)) v += 20;
        if (/\b(assuming|given|context|background|know|understand)\b/i.test(prompt)) v += 15;
        if (/\b(for|to|in order|purpose|goal|objective)\b/i.test(prompt)) v += 10;
        if (words.length > 30) v += 10;
        // Gemini bonus: grounding / multimodal context
        if (/image|photo|video|audio|current|latest|search|grounding/i.test(prompt)) v += 10;
        return v;
    }

    calcConstraints(prompt) {
        let v = 30;
        if (/\b(\d+\s*(words|characters|lines|paragraphs|pages))\b/i.test(prompt)) v += 25;
        if (/\b(format|JSON|XML|list|bullet|outline|table|schema)\b/i.test(prompt)) v += 20;
        if (/\b(professional|casual|formal|simple|technical|beginner-friendly)\b/i.test(prompt)) v += 15;
        if (/\b(don't|avoid|exclude|limit|maximum|minimum|no more than)\b/i.test(prompt)) v += 10;
        return v;
    }

    calcStructure(prompt, sentences) {
        let v = 50;
        if (sentences.length > 2) v += 15;
        if (/^\d+\.|^\s*-|^\s*\*/.test(prompt)) v += 20;
        if (/^#+\s|^(introduction|context|request|example)/im.test(prompt)) v += 15;
        return v;
    }

    calcCompleteness(prompt) {
        let v = 0;
        if (/^(write|create|build|explain|generate|analyze|summarize|design|describe)/i.test(prompt)) v += 20;
        if (/\b(for|to|audience|user|reader|given)\b/i.test(prompt)) v += 20;
        if (/\b(\d+\s*(words|lines|chars)|format|as|bullet|list|JSON|schema)\b/i.test(prompt)) v += 20;
        if (/\b(format|structure|output|return|in the form of)\b/i.test(prompt)) v += 20;
        if (/specific|detail|include|mention|focus/i.test(prompt)) v += 20;
        return v;
    }

    detectIssues(prompt) {
        const issues = [];
        const vagueWords = {
            'good': 'Replace with "accurate", "grounded", "comprehensive"',
            'nice': 'Use specific descriptors',
            'cool': 'Be precise about what quality you want',
            'interesting': 'Replace with concrete, measurable details',
            'big': 'Use numbers or measurements',
            'small': 'Be quantitative',
            'thing': 'Use specific nouns',
            'stuff': 'Be concrete'
        };
        for (const [word, suggestion] of Object.entries(vagueWords)) {
            if (prompt.toLowerCase().includes(word)) {
                issues.push({ title: `Vague Word: "${word}"`, description: suggestion });
                break;
            }
        }
        if (!/\b(audience|user|reader|student|beginner|expert|professional)\b/i.test(prompt)) {
            issues.push({ title: 'Missing Audience Context', description: 'Specify who this is for to help Gemini calibrate its response depth.' });
        }
        if (!/\b(format|JSON|XML|list|bullet|outline|table|structure|schema)\b/i.test(prompt)) {
            issues.push({ title: 'No Output Format Specified', description: 'Gemini supports JSON schema output — specify the exact schema for reliable structured data.' });
        }
        if (!/\b(\d+\s*(words|lines|chars)|limit|maximum|minimum|don't|avoid)\b/i.test(prompt)) {
            issues.push({ title: 'No Constraints Defined', description: 'Add length limits or style requirements.' });
        }
        if (/image|photo|video|audio/i.test(prompt) && !/describe|analyze|identify|what is in|caption/i.test(prompt)) {
            issues.push({ title: 'Unclear Multimodal Instruction', description: 'When referencing media, be explicit: "Describe this image", "Transcribe this audio", "Identify objects in this video".' });
        }
        return issues;
    }

    generateSuggestion(prompt, issues) {
        return this.improvePrompt(prompt, issues);
    }

    getModelTips(prompt) {
        const tips = [...(patterns.tips || [])];
        const extra = [];
        if (!/image|photo|video|audio/i.test(prompt)) extra.push('💡 Gemini is natively multimodal — you can attach images, audio, or video alongside your text prompt');
        if (!/search|current|latest|grounding/i.test(prompt)) extra.push('💡 Enable Google Search grounding for real-time, factual answers');
        if (!/JSON|schema|structured/i.test(prompt)) extra.push('💡 Specify a JSON schema for reliable structured output from Gemini');
        if (!/you are|act as/i.test(prompt)) extra.push('💡 Set a clear role: "You are a Google Cloud architect with expertise in AI"');
        if (/please|could you/i.test(prompt)) extra.push('💡 Remove conversational filler for cleaner instructions');
        return [...extra, ...tips].slice(0, 5);
    }

    improvePrompt(prompt, issues) {
        const p = prompt.trim();

        // ── 1. Role prefix ────────────────────────────────────────────────────
        let rolePrefix = '';
        if (!/^(you are|act as|assume you|take on the role)/i.test(p)) {
            rolePrefix = 'You are a knowledgeable and accurate AI assistant.\n\n';
        }

        // ── 2. Strip vague words ──────────────────────────────────────────────
        const vagueMap = {
            'good': 'accurate', 'nice': 'well-structured', 'cool': 'effective',
            'interesting': 'significant', 'big': 'extensive', 'small': 'concise',
            'really': '', 'very': 'highly', 'kind of': '', 'sort of': '',
            'things': 'elements', 'stuff': 'details', 'thing': 'element'
        };
        let core = p;
        for (const [vague, precise] of Object.entries(vagueMap)) {
            core = core.replace(new RegExp(`\\b${vague}\\b`, 'gi'),
                precise ? precise : '').replace(/\s{2,}/g, ' ');
        }

        // ── 3. Detect what already exists ────────────────────────────────────
        const hasFormat     = /\b(json|xml|markdown|schema|bullet|numbered|table|list|format:|output:)\b/i.test(core);
        const hasWordLimit  = /\d+[\s-]*(words|lines|sentences|characters|paragraphs)/i.test(core);
        const hasTone       = /\b(tone:|professional|formal|casual|technical|beginner-friendly|simple)\b/i.test(core);
        const hasAudience   = /\b(audience|beginner|expert|student|professional|user|reader)\b/i.test(core);
        const hasAvoid      = /\b(avoid|don't|exclude|limit|no more than|maximum|minimum)\b/i.test(core);
        const hasStructure  = /\b(structure:|sections:|1\.|2\.|outline|introduction|context)\b/i.test(core);
        const hasSpecific   = /\b(specific|detail|include|mention|focus|function|api|json|sql|algorithm)\b/i.test(core);
        const hasGrounding  = /\b(search|current|latest|grounding|real-time|factual)\b/i.test(core);

        // ── 4. Build suffix ───────────────────────────────────────────────────
        const suffix = [];

        if (!hasFormat) {
            suffix.push('Format: Return a structured markdown response with clearly labeled sections.');
        }
        if (!hasWordLimit) {
            suffix.push('Length: 250–400 words.');
        }
        if (!hasTone) {
            suffix.push('Tone: Accurate, grounded, and informative.');
        }
        if (!hasAudience) {
            suffix.push('Target audience: Professionals with intermediate domain knowledge.');
        }
        if (!hasAvoid) {
            suffix.push('Avoid: Unverified claims, vague generalisations, and filler content.');
        }
        if (!hasStructure) {
            suffix.push('Structure each section clearly with headers and sub-points.');
        }
        if (!hasSpecific) {
            suffix.push('Include specific, concrete examples with measurable details.');
        }
        if (!hasGrounding) {
            suffix.push('Base your response on factual, verifiable information.');
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

module.exports = GeminiAnalyzer;
