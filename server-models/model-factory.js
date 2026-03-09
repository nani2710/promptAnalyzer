const ClaudeAnalyzer = require('./claude-analyzer');
const GPT4Analyzer   = require('./gpt4-analyzer');
const GeminiAnalyzer = require('./gemini-analyzer');
const GrokAnalyzer   = require('./grok-analyzer');

const analyzers = {
    claude: new ClaudeAnalyzer(),
    gpt4:   new GPT4Analyzer(),
    gemini: new GeminiAnalyzer(),
    grok:   new GrokAnalyzer()
};

/**
 * Returns the analyzer instance for the given model key.
 * Falls back to Claude if the model is unknown.
 */
function getAnalyzer(model) {
    return analyzers[model] || analyzers['claude'];
}

module.exports = { getAnalyzer };
