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
                model: modelSelect.value
            })
        });

        const data = await response.json();

        if (response.ok) {
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

    // Update or create the score badge label
    let badge = scoreCard.querySelector('.score-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'score-badge';
        scoreCard.querySelector('.score-display').after(badge);
    }
    badge.textContent = getScoreLabel(score);

    // Update detected info
    document.getElementById('detectedCategory').textContent = formatCategory(category);
    document.getElementById('detectedModel').textContent = data.model
        ? data.model.toUpperCase()
        : modelSelect.value.toUpperCase();

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
    if (score >= 70) return '✅ Excellent';
    if (score >= 45) return '👍 Good';
    if (score >= 20) return '⚠️ Needs Work';
    return '🔴 Poor';
}

/**
 * Update individual metric
 */
function updateMetric(metricName, value) {
    const card = document.getElementById(metricName + 'Score').closest('.metric-card');
    card.classList.remove('metric-excellent', 'metric-good', 'metric-average', 'metric-poor');
    card.classList.add('metric-' + getScoreClass(value).replace('score-', ''));
    document.getElementById(metricName + 'Score').textContent = Math.round(value) + '%';
    document.getElementById(metricName + 'Bar').style.width = value + '%';
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

// Initial focus
promptInput.focus();
