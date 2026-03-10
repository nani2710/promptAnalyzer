// DOM Elements
const promptInput = document.getElementById('promptInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('resultsSection');
const loadingState = document.getElementById('loadingState');
const resetBtn = document.getElementById('resetBtn');
const useImprovedBtn = document.getElementById('useImprovedBtn');
const copySuggestionBtn = document.getElementById('copySuggestionBtn');
const categorySelect = document.getElementById('categorySelect');
const modelSelect = document.getElementById('modelSelect');
const roleSelect = document.getElementById('roleSelect');

// Event Listeners
analyzeBtn.addEventListener('click', analyzePrompt);
resetBtn.addEventListener('click', resetAnalysis);
useImprovedBtn.addEventListener('click', useImprovedPrompt);
copySuggestionBtn.addEventListener('click', copySuggestionToClipboard);

/**
 * Main Analysis Function
 */
async function analyzePrompt() {
    const prompt = promptInput.value.trim();

    if (!prompt) {
        alert('Please paste a prompt to analyze!');
        return;
    }

    // Show loading state
    loadingState.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    try {
        // Send to backend for analysis
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt,
                category: categorySelect.value,
                model: modelSelect.value,
                role: roleSelect.value
            })
        });

        const data = await response.json();

        if (response.ok) {
            // All Models mode
            if (modelSelect.value === 'all') {
                loadingState.classList.add('hidden');
                await analyzeAllModels(prompt);
                return;
            }
            displayResults(data);
        } else {
            alert('Error: ' + (data.error || 'Failed to analyze prompt'));
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to connect to server. Make sure it\'s running!');
        } finally {
        loadingState.classList.add('hidden');
    }
}

/**
 * Analyze All Models in parallel and render side-by-side comparison
 */
async function analyzeAllModels(prompt) {
    const models = [
        { id: 'claude',  label: 'Claude',  emoji: '🟣', subtitle: 'Anthropic' },
        { id: 'gpt4',    label: 'GPT-4',   emoji: '🟢', subtitle: 'OpenAI'    },
        { id: 'gemini',  label: 'Gemini',  emoji: '🔵', subtitle: 'Google'    },
        { id: 'grok',    label: 'Grok',    emoji: '⚪', subtitle: 'xAI'       }
    ];
    const category = categorySelect.value;
    const role     = roleSelect.value;

    loadingState.classList.remove('hidden');
    resultsSection.classList.add('hidden');

    const results = await Promise.all(models.map(m =>
        fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, category, model: m.id, role })
        })
        .then(r => r.json())
        .then(d => ({ ...d, modelDef: m }))
        .catch(() => ({ score: 0, metrics: {}, modelDef: m, error: true }))
    ));

    loadingState.classList.add('hidden');
    renderAllModelsResults(results);
}

/**
 * Render the all-models comparison cards
 */
function renderAllModelsResults(results) {
    let section = document.getElementById('allModelsSection');
    if (section) section.remove();

    section = document.createElement('section');
    section.id = 'allModelsSection';

    const heading = document.createElement('h2');
    heading.textContent = '\u26a1 All Models — Score Comparison';
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'all-models-grid';

    const metricKeys = ['clarity','specificity','context','constraints','structure','completeness'];
    const CIRCUMFERENCE = 283;

    results.forEach((data, idx) => {
        const m = data.modelDef;
        const score = Math.round(data.score || 0);
        const metrics = data.metrics || {};
        const sc = getScoreClass(score);

        const card = document.createElement('div');
        card.className = 'model-card glass-card ' + sc;

        card.innerHTML =
            '<div class="model-card-name">' + m.emoji + ' ' + m.label + ' <span style="opacity:.45;font-weight:400">/ ' + m.subtitle + '</span></div>' +
            '<div class="model-score-wrap">' +
                '<svg class="model-score-ring" viewBox="0 0 100 100">' +
                    '<circle class="model-ring-bg" cx="50" cy="50" r="45"/>' +
                    '<circle class="model-ring-fill" cx="50" cy="50" r="45" style="stroke-dasharray:' + CIRCUMFERENCE + ';stroke-dashoffset:' + CIRCUMFERENCE + '"/>' +
                '</svg>' +
                '<div class="model-score-text">' + score + '</div>' +
            '</div>' +
            '<div class="model-score-label">' + getScoreLabel(score) + '</div>' +
            '<div class="model-mini-metrics"></div>';

        grid.appendChild(card);

        // Animate ring after DOM inserts
        setTimeout(() => {
            const ringEl = card.querySelector('.model-ring-fill');
            const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
            if (ringEl) ringEl.style.strokeDashoffset = offset;

            const miniContainer = card.querySelector('.model-mini-metrics');
            metricKeys.forEach(k => {
                const val = Math.round(metrics[k] || 0);
                const barColor = val >= 70 ? '#34d399' : val >= 45 ? '#60a5fa' : val >= 20 ? '#fbbf24' : '#f87171';
                const row = document.createElement('div');
                row.className = 'model-mini-row';
                row.innerHTML =
                    '<span class="model-mini-label">' + k.slice(0,5) + '</span>' +
                    '<div class="model-mini-bar-wrap"><div class="model-mini-bar-fill" style="width:0%;background:' + barColor + '"></div></div>' +
                    '<span class="model-mini-val">' + val + '</span>';
                miniContainer.appendChild(row);
                setTimeout(() => {
                    row.querySelector('.model-mini-bar-fill').style.width = val + '%';
                }, 200);
            });
        }, 150 + idx * 120);
    });

    section.appendChild(grid);
    document.querySelector('.main').appendChild(section);
    setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
}

/**
 * Display Results
 */
function displayResults(data) {
    const { score, metrics, issues, suggestion, category, claudeTips, improvedPrompt } = data;

    // Update overall score
    const roundedScore = Math.round(score);
    document.getElementById('overallScore').textContent = roundedScore;
    document.getElementById('scoreBar').style.width = score + '%';

    // Apply color class to score card
    const scoreCard = document.querySelector('.score-card');
    scoreCard.classList.remove('score-excellent', 'score-good', 'score-average', 'score-poor');
    scoreCard.classList.add(getScoreClass(score));

    // Update score badge
    const badge = document.getElementById('scoreBadge');
    const badgeClass = getScoreClass(score).replace('score-', 'badge-');
    badge.className = 'score-badge ' + badgeClass;
    badge.textContent = getScoreLabel(score);

    // Update detected info
    document.getElementById('detectedCategory').textContent = formatCategory(category);
    document.getElementById('detectedModel').textContent = data.model
        ? data.model.toUpperCase()
        : modelSelect.value.toUpperCase();
    const roleLabels = {
        general: 'General User', learner: '📚 Learner', researcher: '🔬 Researcher',
        builder: '🔧 Builder', creator: '🎨 Creator', analyst: '📊 Analyst'
    };
    document.getElementById('detectedRole').textContent =
        roleLabels[data.role] || roleLabels[roleSelect.value] || 'General';

    // Update metric scores
    updateMetric('clarity',      metrics.clarity);
    updateMetric('specificity',  metrics.specificity);
    updateMetric('context',      metrics.context);
    updateMetric('constraints',  metrics.constraints);
    updateMetric('structure',    metrics.structure);
    updateMetric('completeness', metrics.completeness);

    // Display issues
    displayIssues(issues);

    // Display suggestion
    const suggestionText = document.getElementById('suggestionText');
    suggestionText.textContent = suggestion;
    suggestionText.dataset.suggestion = suggestion;

    // Store improved prompt for later use
    useImprovedBtn.dataset.improvedPrompt = improvedPrompt;

    // Display model-specific tips
    displayClaudeTips(claudeTips);

    // Fetch and render word suggestion chips
    fetchAndRenderChips(data.improvedPrompt ? promptInput.value : suggestion, issues);

    // Show results
    resultsSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Map score to CSS class and label
 */
function getScoreClass(score) {
    if (score >= 70) return 'score-excellent';
    if (score >= 45) return 'score-good';
    if (score >= 20) return 'score-average';
    return 'score-poor';
}

function getScoreLabel(score) {
    if (score >= 70) return '✦ Excellent';
    if (score >= 45) return '◆ Good';
    if (score >= 20) return '▲ Needs Work';
    return '✕ Poor';
}

/**
 * Update individual metric
 */
function updateMetric(metricName, value) {
    const card = document.getElementById(metricName + 'Score').closest('.metric-card');
    card.classList.remove('metric-excellent', 'metric-good', 'metric-average', 'metric-poor');
    card.classList.add('metric-' + getScoreClass(value).replace('score-', ''));
    document.getElementById(metricName + 'Score').textContent = Math.round(value) + '%';

    // Animate SVG ring  (circumference = 2*pi*32 ≈ 201)
    const ring = document.getElementById(metricName + 'Ring');
    if (ring) {
        const circumference = 201;
        const offset = circumference - (value / 100) * circumference;
        ring.style.strokeDashoffset = offset;
    }
}

/**
 * Display issues as list — red items for problems, green when clean
 */
function displayIssues(issues) {
    const issuesList = document.getElementById('issuesList');
    const issuesBox  = issuesList.closest('.issues-box');
    const issuesTitle = issuesBox.querySelector('h3');
    issuesList.innerHTML = '';

    if (issues.length === 0) {
        issuesBox.classList.add('no-issues');
        issuesTitle.textContent = '✅ Issues Detected';
        const li = document.createElement('li');
        li.className = 'issue-item issue-ok';
        li.innerHTML = '<span class="issue-icon">✅</span><span><strong>No issues found!</strong> Your prompt looks well-structured.</span>';
        issuesList.appendChild(li);
        return;
    }

    issuesBox.classList.remove('no-issues');
    issuesTitle.textContent = '🔴 Issues Detected';

    issues.forEach(issue => {
        const li = document.createElement('li');
        li.className = 'issue-item';
        li.innerHTML = `<span class="issue-icon">❌</span><span><strong>${issue.title}:</strong> ${issue.description}</span>`;
        issuesList.appendChild(li);
    });
}

/**
 * Display Claude-specific tips
 */
function displayClaudeTips(tips) {
    const tipsList = document.getElementById('claudeTips');
    tipsList.innerHTML = '';

    tips.forEach(tip => {
        const li = document.createElement('li');
        li.textContent = tip;
        tipsList.appendChild(li);
    });
}

/**
 * Copy suggestion to clipboard
 */
function copySuggestionToClipboard() {
    const suggestion = document.getElementById('suggestionText').dataset.suggestion;
    navigator.clipboard.writeText(suggestion).then(() => {
        const originalText = copySuggestionBtn.textContent;
        copySuggestionBtn.textContent = '✓ Copied!';
        setTimeout(() => {
            copySuggestionBtn.textContent = originalText;
        }, 2000);
    });
}

/**
 * Use improved prompt
 */
function useImprovedPrompt() {
    const improvedPrompt = useImprovedBtn.dataset.improvedPrompt;
    promptInput.value = improvedPrompt;
    resetBtn.click(); // Reset to re-analyze
}

/**
 * Reset analysis
 */
function resetAnalysis() {
    promptInput.value = '';
    resultsSection.classList.add('hidden');
    promptInput.focus();
}

/**
 * Format category name
 */
function formatCategory(category) {
    const categoryMap = {
        'auto': 'Auto-Detected',
        'creative': 'Creative Tasks',
        'technical': 'Technical/Analytical',
        'research': 'Research/Informational',
        'conversational': 'Conversational/Role-Play',
        'productivity': 'Productivity',
        'educational': 'Educational',
        'fun': 'Fun/Experimental'
    };
    return categoryMap[category] || 'Unknown';
}

/**
 * Fetch word suggestions from server and render chips
 */
async function fetchAndRenderChips(prompt, issues) {
    const body = document.getElementById('wordChipsBody');
    body.innerHTML = '<p class="no-chips-msg">Scanning for improvements...</p>';

    try {
        const response = await fetch('/api/word-suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, issues })
        });
        const data = await response.json();
        renderChips(data.chips || [], data.missingPhrases || [], prompt);
    } catch (e) {
        body.innerHTML = '<p class="no-chips-msg">Suggestions unavailable.</p>';
    }
}

function renderChips(chips, missingPhrases, prompt) {
    const body = document.getElementById('wordChipsBody');
    body.innerHTML = '';
    let hasContent = false;

    // --- Replace vague words ---
    if (chips.filter(c => c.type === 'replace').length > 0) {
        hasContent = true;
        const group = document.createElement('div');
        group.className = 'chip-group';
        group.innerHTML = '<div class="chip-group-label">🔴 Replace vague words</div><div class="chips-row" id="replaceRow"></div>';
        body.appendChild(group);
        const row = group.querySelector('#replaceRow');
        chips.filter(c => c.type === 'replace').forEach(chip => {
            chip.replacements.forEach(rep => {
                const el = document.createElement('span');
                el.className = 'chip chip-replace';
                el.textContent = `"${chip.word}" → ${rep}`;
                el.title = `Click to replace "${chip.word}" with "${rep}" in your prompt`;
                el.addEventListener('click', () => {
                    const regex = new RegExp(`\\b${chip.word}\\b`, 'gi');
                    promptInput.value = promptInput.value.replace(regex, rep);
                    el.style.opacity = '0.4';
                    el.style.cursor = 'default';
                });
                row.appendChild(el);
            });
        });
    }

    // --- Stronger opener alternatives ---
    if (chips.filter(c => c.type === 'opener').length > 0) {
        hasContent = true;
        const group = document.createElement('div');
        group.className = 'chip-group';
        group.innerHTML = '<div class="chip-group-label">🔵 Stronger openers</div><div class="chips-row" id="openerRow"></div>';
        body.appendChild(group);
        const row = group.querySelector('#openerRow');
        chips.filter(c => c.type === 'opener').forEach(chip => {
            chip.replacements.forEach(rep => {
                const el = document.createElement('span');
                el.className = 'chip chip-opener';
                el.textContent = rep;
                el.title = `Click to replace "${chip.word}" with "${rep}"`;
                el.addEventListener('click', () => {
                    const regex = new RegExp(`^${chip.word}`, 'i');
                    promptInput.value = promptInput.value.replace(regex, rep);
                    el.style.opacity = '0.4';
                });
                row.appendChild(el);
            });
        });
    }

    // --- Missing element phrases ---
    const seen = new Set();
    missingPhrases.forEach(mp => {
        if (seen.has(mp.element)) return;
        seen.add(mp.element);
        hasContent = true;
        const labels = {
            role: '👤 Add role', audience: '🎯 Add audience', format: '📋 Add format',
            length: '📏 Add length', constraints: '⚡ Add constraint', step_by_step: '🧠 Add reasoning'
        };
        const group = document.createElement('div');
        group.className = 'chip-group';
        const rowId = `phraseRow_${mp.element}`;
        group.innerHTML = `<div class="chip-group-label">${labels[mp.element] || '➕ Add phrase'}</div><div class="chips-row" id="${rowId}"></div>`;
        body.appendChild(group);
        const row = group.querySelector(`#${rowId}`);
        mp.phrases.slice(0, 4).forEach(phrase => {
            const el = document.createElement('span');
            el.className = 'chip chip-phrase';
            el.textContent = phrase.length > 45 ? phrase.slice(0, 43) + '…' : phrase;
            el.title = `Click to append: ${phrase}`;
            el.addEventListener('click', () => {
                promptInput.value = promptInput.value.trimEnd() + '\n\n' + phrase;
                el.style.opacity = '0.4';
            });
            row.appendChild(el);
        });
    });

    if (!hasContent) {
        body.innerHTML = '<p class="no-chips-msg">✅ No vague words or weak openers detected!</p>';
    }
}

/**
 * Word chips collapsible toggle
 */
document.getElementById('wordChipsHeader').addEventListener('click', () => {
    document.getElementById('wordChipsSection').classList.toggle('collapsed');
});

// Initial focus
promptInput.focus();
