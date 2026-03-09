const path = require('path');
const patterns = require(path.join(__dirname, '../patterns/gemini/patterns.json'));

class GeminiAnalyzer {
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
            model: 'gemini'
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
        let s = prompt;
        if (!/^(you are|act as)/i.test(prompt)) s = `You are a helpful Google AI expert.\n\n${s}`;
        if (!/\b(audience|beginner|expert)\b/i.test(s)) s += `\n\nTarget audience: Intermediate users.`;
        if (!/\b(format|JSON|list|bullet|schema)\b/i.test(s)) s += `\n\nReturn a structured JSON response with schema: { "summary": string, "details": string[], "confidence": string }`;
        if (!/\b(\d+\s*(words|lines))\b/i.test(s)) s += `\n\nLimit to 200 words.`;
        return s;
    }

    getModelTips(prompt) {
        const tips = [...patterns.tips];
        const extra = [];
        if (!/image|photo|video|audio/i.test(prompt)) extra.push('💡 Gemini is natively multimodal — you can attach images, audio, or video alongside your text prompt');
        if (!/search|current|latest|grounding/i.test(prompt)) extra.push('💡 Enable Google Search grounding for real-time, factual answers');
        if (!/JSON|schema|structured/i.test(prompt)) extra.push('💡 Specify a JSON schema for reliable structured output from Gemini');
        if (!/you are|act as/i.test(prompt)) extra.push('💡 Set a clear role: "You are a Google Cloud architect with expertise in Kubernetes"');
        if (/please|could you/i.test(prompt)) extra.push('💡 Remove conversational filler for cleaner instructions');
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
            improved = `You are a helpful AI expert.\n\n${prompt}\n\nRequirements:\n- Target audience: Intermediate users\n- Format: JSON schema { "answer": string, "steps": string[], "sources": string[] }\n- Tone: Accurate and grounded\n- Length: Concise (200-400 words)\n\nUse Google Search grounding for factual accuracy.`;
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

module.exports = GeminiAnalyzer;
