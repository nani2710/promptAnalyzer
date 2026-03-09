// DOM Elements
const promptInput = document.getElementById('promptInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('resultsSection');
const loadingState = document.getElementById('loadingState');
const resetBtn = document.getElementById('resetBtn');
const useImprovedBtn = document.getElementById('useImprovedBtn');
const copySuggestionBtn = document.getElementById('copySuggestionBtn');
const categorySelect = document.getElementById('categorySelect');

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
                model: 'claude'
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
    document.getElementById('overallScore').textContent = Math.round(score);
    document.getElementById('scoreBar').style.width = score + '%';

    // Update detected info
    document.getElementById('detectedCategory').textContent = formatCategory(category);
    document.getElementById('detectedModel').textContent = 'Claude';

    // Update metric scores
    updateMetric('clarity', metrics.clarity);
    updateMetric('specificity', metrics.specificity);
    updateMetric('context', metrics.context);
    updateMetric('constraints', metrics.constraints);
    updateMetric('structure', metrics.structure);
    updateMetric('completeness', metrics.completeness);

    // Display issues
    displayIssues(issues);

    // Display suggestion
    const suggestionText = document.getElementById('suggestionText');
    suggestionText.textContent = suggestion;
    suggestionText.dataset.suggestion = suggestion;

    // Store improved prompt for later use
    useImprovedBtn.dataset.improvedPrompt = improvedPrompt;

    // Display Claude-specific tips
    displayClaudeTips(claudeTips);

    // Show results
    resultsSection.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Update individual metric
 */
function updateMetric(metricName, value) {
    document.getElementById(metricName + 'Score').textContent = Math.round(value) + '%';
    document.getElementById(metricName + 'Bar').style.width = value + '%';
}

/**
 * Display issues as list
 */
function displayIssues(issues) {
    const issuesList = document.getElementById('issuesList');
    issuesList.innerHTML = '';

    if (issues.length === 0) {
        issuesList.innerHTML = '<li class="issue-item text-success">✓ No major issues detected!</li>';
        return;
    }

    issues.forEach(issue => {
        const li = document.createElement('li');
        li.className = 'issue-item';
        li.innerHTML = `<strong>❌ ${issue.title}:</strong> ${issue.description}`;
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
