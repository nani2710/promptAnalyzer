const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/**
 * MOCK ANALYSIS ENGINE
 * This evaluates prompts without needing Claude API
 * Replace with real Claude API later
 */
class PromptAnalyzer {
    /**
     * Analyze a prompt and return scores
     */
    analyzePrompt(prompt, category) {
        const metrics = this.calculateMetrics(prompt);
        const issues = this.detectIssues(prompt);
        const score = this.calculateOverallScore(metrics);
        const suggestion = this.generateSuggestion(prompt, issues);
        const claudeTips = this.getClaudeTips(prompt);
        const improvedPrompt = this.improvePrompt(prompt, issues);

        return {
            score,
            metrics,
            issues,
            suggestion,
            claudeTips,
            improvedPrompt,
            category: category === 'auto' ? this.detectCategory(prompt) : category
        };
    }

    /**
     * Calculate individual metrics (0-100)
     */
    calculateMetrics(prompt) {
        const words = prompt.split(/\s+/).filter(w => w.length > 0);
        const sentences = prompt.split(/[.!?]+/).filter(s => s.trim().length > 0);

        // Clarity: Check for clear language
        const clarity = this.calculateClarity(prompt, words);

        // Specificity: Check for specific details vs. vague words
        const specificity = this.calculateSpecificity(prompt, words);

        // Context: Check if background info is provided
        const context = this.calculateContext(prompt, words);

        // Constraints: Check for limits and boundaries
        const constraints = this.calculateConstraints(prompt);

        // Structure: Check for organized format
        const structure = this.calculateStructure(prompt, sentences);

        // Completeness: Check if all 5 components present
        const completeness = this.calculateCompleteness(prompt);

        return {
            clarity: Math.min(100, clarity),
            specificity: Math.min(100, specificity),
            context: Math.min(100, context),
            constraints: Math.min(100, constraints),
            structure: Math.min(100, structure),
            completeness: Math.min(100, completeness)
        };
    }

    calculateClarity(prompt, words) {
        let clarity = 50;

        // Bonus for clear instructions
        if (/^(write|create|build|explain|analyze|summarize)/i.test(prompt)) clarity += 15;

        // Bonus for specific subjects
        if (words.length > 5) clarity += 10;

        // Penalty for vague opening
        if (/^(tell me|give me|what is)/i.test(prompt)) clarity -= 10;

        return clarity;
    }

    calculateSpecificity(prompt, words) {
        const vagueWords = ['good', 'nice', 'cool', 'interesting', 'big', 'small', 'thing', 'stuff', 'really', 'very'];
        const vagueCount = vagueWords.filter(w => prompt.toLowerCase().includes(w)).length;

        let specificity = 70;
        specificity -= vagueCount * 8;

        // Bonus for numbers, percentages
        if (/\d+/.test(prompt)) specificity += 10;

        // Bonus for technical terms
        if (/\b(function|API|JSON|SQL|algorithm|framework)\b/i.test(prompt)) specificity += 15;

        return specificity;
    }

    calculateContext(prompt, words) {
        let context = 40;

        // Check for audience mention
        if (/\b(audience|user|reader|student|beginner|expert|professional)\b/i.test(prompt)) context += 20;

        // Check for background info
        if (/\b(assuming|given|context|background|know|understand)\b/i.test(prompt)) context += 15;

        // Check for purpose
        if (/\b(for|to|in order|purpose|goal|objective)\b/i.test(prompt)) context += 10;

        // Bonus for longer context
        if (words.length > 30) context += 10;

        return context;
    }

    calculateConstraints(prompt) {
        let constraints = 30;

        // Check for length constraints
        if (/\b(\d+\s*(words|characters|lines|paragraphs|pages))\b/i.test(prompt)) constraints += 25;

        // Check for format constraints
        if (/\b(format|JSON|XML|list|bullet|outline|table)\b/i.test(prompt)) constraints += 20;

        // Check for style/tone constraints
        if (/\b(professional|casual|formal|simple|technical|beginner-friendly)\b/i.test(prompt)) constraints += 15;

        // Check for other constraints
        if (/\b(don't|avoid|exclude|limit|maximum|minimum|no more than)\b/i.test(prompt)) constraints += 10;

        return constraints;
    }

    calculateStructure(prompt, sentences) {
        let structure = 50;

        // Bonus for multiple sentences (organized)
        if (sentences.length > 2) structure += 15;

        // Bonus for numbered lists
        if (/^\d+\.|^\s*-|^\s*\*/.test(prompt)) structure += 20;

        // Bonus for clear sections
        if (/^#+\s|^(introduction|context|request|example)/im.test(prompt)) structure += 15;

        return structure;
    }

    calculateCompleteness(prompt) {
        let completeness = 0;

        // 5-component model
        if (/^(write|create|build|explain|generate|analyze|summarize|design)/i.test(prompt)) completeness += 20; // Objective
        if (/\b(for|to|audience|user|reader|given)\b/i.test(prompt)) completeness += 20; // Context
        if (/\b(\d+\s*(words|lines|chars)|format|as|bullet|list|JSON)\b/i.test(prompt)) completeness += 20; // Constraints
        if (/\b(format|structure|output|return|in the form of)\b/i.test(prompt)) completeness += 20; // Output Format
        if (/specific|detail|include|mention|focus/i.test(prompt)) completeness += 20; // Specificity

        return completeness;
    }

    /**
     * Detect issues
     */
    detectIssues(prompt) {
        const issues = [];

        // Check for vague words
        const vagueWords = {
            'good': 'Replace with specific adjectives (e.g., "concise", "detailed")',
            'nice': 'Be specific about what you want',
            'cool': 'Use precise descriptors instead',
            'interesting': 'Replace with concrete details',
            'big': 'Use numbers or specific measurements',
            'small': 'Be quantitative instead of qualitative',
            'thing': 'Use specific nouns',
            'stuff': 'Be concrete and specific'
        };

        for (const [word, suggestion] of Object.entries(vagueWords)) {
            if (prompt.toLowerCase().includes(word)) {
                issues.push({
                    title: `Vague Word: "${word}"`,
                    description: suggestion
                });
                break; // Only show one vague word issue
            }
        }

        // Check for missing context
        if (!/\b(audience|user|reader|student|beginner|expert|professional)\b/i.test(prompt)) {
            issues.push({
                title: 'Missing Audience Context',
                description: 'Consider specifying who this is for (beginner, expert, etc.)'
            });
        }

        // Check for missing output format
        if (!/\b(format|JSON|XML|list|bullet|outline|table|structure|return as)\b/i.test(prompt)) {
            issues.push({
                title: 'No Output Format Specified',
                description: 'Define how you want the response formatted (JSON, bullet points, etc.)'
            });
        }

        // Check for missing constraints
        if (!/\b(\d+\s*(words|lines|chars)|limit|maximum|minimum|don't|avoid)\b/i.test(prompt)) {
            issues.push({
                title: 'No Constraints Defined',
                description: 'Add length limits, style requirements, or things to avoid'
            });
        }

        // Check for complexity
        if (prompt.split('?').length > 3) {
            issues.push({
                title: 'Multiple Questions',
                description: 'Consider breaking into separate focused prompts'
            });
        }

        return issues;
    }

    /**
     * Generate improvement suggestion
     */
    generateSuggestion(prompt, issues) {
        let suggestion = prompt;

        // Add role if missing
        if (!/^(you are|act as)/i.test(prompt)) {
            suggestion = `You are a helpful expert.\n\n${suggestion}`;
        }

        // Add context if missing
        if (!/\b(audience|beginner|expert)\b/i.test(suggestion)) {
            suggestion += `\n\nTarget audience: Beginners with basic understanding.`;
        }

        // Add output format if missing
        if (!/\b(format|JSON|list|bullet)\b/i.test(suggestion)) {
            suggestion += `\n\nFormat the response as a structured list with clear explanations.`;
        }

        // Add constraints if missing
        if (!/\b(\d+\s*(words|lines))\b/i.test(suggestion)) {
            suggestion += `\n\nKeep the response concise (under 200 words).`;
        }

        return suggestion;
    }

    /**
     * Detect prompt category
     */
    detectCategory(prompt) {
        const prompts = prompt.toLowerCase();

        if (/write|story|essay|poem|creative|narrative|dialogue|character/i.test(prompts)) return 'creative';
        if (/code|function|script|program|debug|algorithm|optimize/i.test(prompts)) return 'technical';
        if (/research|summary|fact|source|academic|paper|study/i.test(prompts)) return 'research';
        if (/role|play|brainstorm|debate|discuss|conversation/i.test(prompts)) return 'conversational';
        if (/email|plan|schedule|organize|list|task|workflow/i.test(prompts)) return 'productivity';
        if (/explain|learn|understand|teach|tutorial|guide|educate/i.test(prompts)) return 'educational';
        if (/joke|funny|humor|pun|riddle|fun|game/i.test(prompts)) return 'fun';

        return 'auto';
    }

    /**
     * Get Claude-specific tips
     */
    getClaudeTips(prompt) {
        const tips = [];

        tips.push('✓ Claude excels at reasoning - use "think step-by-step" directives');
        tips.push('✓ Provide concrete examples to guide the response');

        if (!/step.by.step|reason|think|analyze/i.test(prompt)) {
            tips.push('💡 Add "Think step-by-step" to improve reasoning quality');
        }

        if (!/^(you are|act as)/i.test(prompt)) {
            tips.push('💡 Start with a role assignment like "You are a senior developer"');
        }

        if (!/example|format|JSON|structure/i.test(prompt)) {
            tips.push('💡 Provide a format example for better structured outputs');
        }

        if (/please|could you|would you/i.test(prompt)) {
            tips.push('💡 Remove conversational filler ("please", "would you") for clarity');
        }

        tips.push('✓ Claude handles long context well - feel free to provide detailed background');

        return tips.slice(0, 5); // Return top 5 tips
    }

    /**
     * Improve prompt by addressing issues
     */
    improvePrompt(prompt, issues) {
        let improved = prompt;

        // Remove vague words
        const vagueWords = ['good', 'nice', 'cool', 'interesting', 'big', 'small', 'really', 'very', 'kind of', 'sort of'];
        vagueWords.forEach(word => {
            const regex = new RegExp(`\\b${word}\\b`, 'gi');
            if (regex.test(improved)) {
                improved = improved.replace(regex, `[BE SPECIFIC INSTEAD OF "${word}"]`);
            }
        });

        // Build structured version if has issues
        if (issues.length > 2) {
            improved = `Act as an expert assistant.

${prompt}

Requirements:
- Target audience: Intermediate users
- Format: Structured with clear sections
- Length: Concise but comprehensive (200-400 words)
- Tone: Professional and helpful`;
        }

        return improved;
    }

    /**
     * Calculate overall score (average of all metrics)
     */
    calculateOverallScore(metrics) {
        const values = Object.values(metrics);
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
}

// Initialize analyzer
const analyzer = new PromptAnalyzer();

/**
 * API Endpoint: Analyze Prompt
 */
app.post('/api/analyze', (req, res) => {
    try {
        const { prompt, category, model } = req.body;

        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Perform analysis
        const analysis = analyzer.analyzePrompt(prompt, category || 'auto');

        res.json(analysis);
    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze prompt' });
    }
});

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'Server is running!' });
});

/**
 * Root endpoint
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Start server
 */
app.listen(PORT, () => {
    console.log(`\n✅ Prompt Analyzer Server Running!`);
    console.log(`📍 Open: http://localhost:${PORT}`);
    console.log(`\n💡 Using MOCK analysis engine (no API keys needed for testing)`);
    console.log(`\n🚀 To enable real Claude API:`);
    console.log(`   1. Get your Claude API key from https://console.anthropic.com`);
    console.log(`   2. Set CLAUDE_API_KEY environment variable`);
    console.log(`   3. Uncomment the Claude API code in server.js`);
});

module.exports = app;
