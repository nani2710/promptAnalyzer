const express = require('express');
const cors = require('cors');
const path = require('path');
const { getAnalyzer } = require('./server-models/model-factory');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

/**
 * API Endpoint: Analyze Prompt
 * Routes to the correct model-specific analyzer based on `model` field.
 */
app.post('/api/analyze', (req, res) => {
    try {
        const { prompt, category, model, role } = req.body;

        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const analyzer = getAnalyzer(model || 'claude');
        const analysis = analyzer.analyzePrompt(prompt, category || 'auto', role || 'general');

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
    res.json({ status: 'Server is running!', models: ['claude', 'gpt4', 'gemini', 'grok'] });
});

/**
 * Word Suggestions API
 * Detects vague words and weak openers, returns replacement chip suggestions
 */
const wordSuggestions = require('./patterns/word_suggestions.json');

app.post('/api/word-suggestions', (req, res) => {
    try {
        const { prompt, issues } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt required' });

        const chips = [];
        const promptLower = prompt.toLowerCase();

        // Vague words found in the prompt
        for (const [word, replacements] of Object.entries(wordSuggestions.vague_word_replacements)) {
            const regex = new RegExp(`\\b${word}\\b`, 'i');
            if (regex.test(prompt)) {
                chips.push({ type: 'replace', word, replacements, label: `Replace "${word}"` });
            }
        }

        // Weak openers found at the start
        for (const [opener, replacements] of Object.entries(wordSuggestions.weak_openers)) {
            if (promptLower.startsWith(opener)) {
                chips.push({ type: 'opener', word: opener, replacements, label: `Stronger opener` });
            }
        }

        // Missing element phrase templates based on issue titles
        const missingPhrases = [];
        if (issues) {
            for (const issue of issues) {
                const title = issue.title.toLowerCase();
                if (title.includes('role')) missingPhrases.push({ element: 'role', phrases: wordSuggestions.missing_element_phrases.role });
                if (title.includes('audience') || title.includes('context')) missingPhrases.push({ element: 'audience', phrases: wordSuggestions.missing_element_phrases.audience });
                if (title.includes('format')) missingPhrases.push({ element: 'format', phrases: wordSuggestions.missing_element_phrases.format });
                if (title.includes('word limit') || title.includes('length')) missingPhrases.push({ element: 'length', phrases: wordSuggestions.missing_element_phrases.length });
                if (title.includes('constraint')) missingPhrases.push({ element: 'constraints', phrases: wordSuggestions.missing_element_phrases.constraints });
                if (title.includes('step') || title.includes('reasoning')) missingPhrases.push({ element: 'step_by_step', phrases: wordSuggestions.missing_element_phrases.step_by_step });
            }
        }

        res.json({ chips, missingPhrases });
    } catch (error) {
        console.error('Word suggestions error:', error);
        res.status(500).json({ error: 'Failed to generate suggestions' });
    }
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
    console.log(`\n🤖 Model-specific analyzers loaded: Claude, GPT-4, Gemini, Grok`);
    console.log(`\n💡 Using local pattern-based analysis engine (no API keys needed)`);
});

module.exports = app;
