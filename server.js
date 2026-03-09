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
        const { prompt, category, model } = req.body;

        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const analyzer = getAnalyzer(model || 'claude');
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
    res.json({ status: 'Server is running!', models: ['claude', 'gpt4', 'gemini', 'grok'] });
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
