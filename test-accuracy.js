// Direct analyzer test — bypasses HTTP server, no caching issues
const ClaudeAnalyzer = require('./server-models/claude-analyzer');
const GPT4Analyzer  = require('./server-models/gpt4-analyzer');
const GeminiAnalyzer = require('./server-models/gemini-analyzer');
const GrokAnalyzer  = require('./server-models/grok-analyzer');

const claude = new ClaudeAnalyzer();
const gpt4   = new GPT4Analyzer();
const gemini = new GeminiAnalyzer();
const grok   = new GrokAnalyzer();

const PROMPTS = {
  research: {
    role: 'researcher',
    prompt: `You are a domain expert in computational neuroscience.

Conduct a structured literature analysis on the role of the default mode network (DMN) in creative cognition.

Scope:
- Cover peer-reviewed studies from 2018-2024
- Include methodology, key findings, and conflicting evidence
- Highlight open questions for future research

Format: Structured summary with sections: Background, Key Findings, Methodology, Contradictions, Future Directions
Length: 400-600 words
Tone: Scholarly, precise, evidence-based
Audience: Graduate-level neuroscience students`
  },
  technical: {
    role: 'builder',
    prompt: `You are a senior distributed systems architect.

Design a fault-tolerant microservices architecture for a high-traffic e-commerce platform.

Requirements:
- Handle 50,000 concurrent users
- 99.99% uptime SLA
- Event-driven with Kafka
- Circuit breaker pattern with Resilience4j

Format: Return as structured JSON schema
Constraints: Production-ready, no pseudocode, include error handling strategies
Audience: Senior engineers reviewing the system design`
  },
  creative: {
    role: 'creator',
    prompt: `You are a literary author specializing in speculative fiction.

Write the opening scene of a short story set in a near-future city where memories can be traded as currency.

Requirements:
- Establish the world through character action, not exposition
- Introduce the protagonist in a morally ambiguous situation
- Use sensory details to build atmosphere

Tone: Noir with philosophical undertones
Length: 350-450 words
POV: Third-person limited
Audience: Adult literary fiction readers`
  },
  educational: {
    role: 'learner',
    prompt: `Explain how CRISPR-Cas9 gene editing works.

I am a biology student who understands basic DNA replication but has not studied gene editing yet.

Break it down step by step:
1. What problem it solves
2. How it finds the target DNA
3. How the editing actually happens
4. Real-world applications with examples

Use a simple analogy each step. Avoid jargon without explanation.
Length: Under 300 words
Tone: Patient, clear, encouraging`
  },
  conversational: {
    role: 'creator',
    prompt: `You are a Socratic debate coach.

Engage me in a structured Socratic dialogue about the ethics of AI-generated art.

Rules:
- Ask probing questions rather than stating positions
- Challenge assumptions in my responses
- Guide toward deeper reasoning
- Conclude each exchange with one follow-up question

Tone: Intellectually rigorous but accessible
Audience: Philosophy enthusiasts`
  },
  productivity: {
    role: 'analyst',
    prompt: `You are a management consultant with expertise in organizational design.

Analyze this quarterly performance data and produce an executive briefing:
- Revenue: 4.2M (target: 5M, miss: -16%)
- Customer churn: 12% (target: under 8%)
- NPS score: 34 (industry average: 42)
- Engineer velocity: 78 points/sprint (target: 90)

Format:
1. Executive Summary (3 sentences max)
2. Root Cause Analysis (bullet points, prioritized by impact)
3. Recommended Actions (with owner, timeline, KPI impact)
4. Risk Assessment

Length: 250-350 words
Tone: Direct, data-driven, actionable
Audience: C-suite non-technical executives`
  },
  fun: {
    role: 'creator',
    prompt: `You are a stand-up comedian with expertise in tech satire.

Write a 5-minute comedy bit about the absurdity of modern tech job titles.

Requirements:
- Include 3 joke structures: observation, callback, and misdirect
- Each joke should land in under 30 seconds when spoken aloud
- Reference at least one real tech company trope
- End with a self-aware meta-joke about AI writing comedy

Tone: Dry wit, no mean-spirited humor
Format: Script with stage directions in brackets
Length: 400 words
Audience: Mixed tech and non-tech crowd`
  }
};

// Grok-specific overrides (Grok favors directness, real-time)
const GROK_PROMPTS = {
  research: {
    role: 'researcher',
    prompt: `You are a technology analyst focused on AI industry trends.

Analyze the competitive landscape in the LLM space based on latest X (Twitter) signals and tech news.

Cover:
- Key players: OpenAI, Anthropic, Google DeepMind, Meta AI, xAI
- Recent model releases and benchmark claims in the last 30 days
- Market positioning and developer adoption signals

Format: Bullet-point briefing, max 3 bullets per company
Tone: Direct, no hype, show contradictions where they exist
Length: Under 400 words
Audience: Venture capitalists evaluating AI investments`
  },
  conversational: {
    role: 'analyst',
    prompt: `You are a brutally honest tech critic.

Give your unfiltered take on whether the current AI hype will bust like the dot-com crash.

Structure:
1. The strongest case FOR a bust (3 points)
2. The strongest case AGAINST (3 points)
3. Your actual prediction with confidence level

Rules: Be direct. No sugarcoating. Do not soften your stance.
Tone: Blunt, evidence-based, no corporate language
Length: Under 300 words
Audience: Sophisticated tech investors`
  },
  fun: {
    role: 'creator',
    prompt: `Write a brutally honest company all-hands transcript where the CEO is transparent for the first time.

Include:
- The real reason for the recent layoffs
- What the product roadmap actually looks like vs what was announced
- Q&A where employees ask uncomfortable questions and get real answers

Tone: Darkly comedic, sharp, no corporate speak
Format: Transcript style with speaker labels
Length: 400 words
Audience: Tech workers who have survived multiple all-hands
Do not sugarcoat anything.`
  }
};

function printModelResults(modelName, results) {
  const header = `\n${'═'.repeat(95)}\n  🤖 MODEL: ${modelName.toUpperCase()}\n${'═'.repeat(95)}`;
  console.log(header);
  console.log(
    'CATEGORY'.padEnd(16) + 'ROLE'.padEnd(13) +
    'SCORE'.padEnd(10) + 'Clarity'.padEnd(9) + 'Specif.'.padEnd(9) +
    'Context'.padEnd(9) + 'Constr.'.padEnd(9) + 'Struct.'.padEnd(9) + 'Complete'
  );
  console.log('─'.repeat(95));

  let total = 0;
  for (const r of results) {
    const badge = r.score >= 75 ? '🟢' : r.score >= 55 ? '🟡' : r.score >= 35 ? '🟠' : '🔴';
    total += r.score;
    console.log(
      r.category.padEnd(16) + r.role.padEnd(13) +
      (badge + ' ' + r.score + '/100').padEnd(12) +
      String(r.clarity).padEnd(9) + String(r.specificity).padEnd(9) +
      String(r.context).padEnd(9) + String(r.constraints).padEnd(9) +
      String(r.structure).padEnd(9) + String(r.completeness)
    );
  }
  const avg = Math.round(total / results.length);
  const avgBadge = avg >= 75?'🟢 EXCELLENT': avg >= 55?'🟡 GOOD': avg >= 35?'🟠 AVERAGE':'🔴 NEEDS CALIBRATION';
  console.log('─'.repeat(95));
  console.log(`  AVERAGE: ${avg}/100  ${avgBadge}`);
}

function testModel(analyzer, modelName, promptsOverride) {
  const prompts = promptsOverride || PROMPTS;
  const results = [];
  for (const [cat, data] of Object.entries(prompts)) {
    const r = analyzer.analyzePrompt(data.prompt, cat, data.role);
    const m = r.metrics || {};
    results.push({
      category: cat, role: data.role, score: Math.round(r.score),
      clarity: Math.round(m.clarity||0), specificity: Math.round(m.specificity||0),
      context: Math.round(m.context||0), constraints: Math.round(m.constraints||0),
      structure: Math.round(m.structure||0), completeness: Math.round(m.completeness||0)
    });
  }
  printModelResults(modelName, results);
  return results;
}

console.log('\n🧪  PROMPT ANALYZER — FULL ACCURACY MATRIX TEST');
console.log('   Best-practice prompts tested across all categories, roles, and models\n');

testModel(claude,  'Claude (Anthropic)');
testModel(gpt4,   'GPT-4 (OpenAI)');
testModel(gemini, 'Gemini (Google)');

// Grok uses its own prompt variants for some categories since it favors directness
const grokPrompts = { ...PROMPTS,
  research: GROK_PROMPTS.research,
  conversational: GROK_PROMPTS.conversational,
  fun: GROK_PROMPTS.fun
};
testModel(grok, 'Grok (xAI)', grokPrompts);

console.log('\n✅ All model tests complete.\n');
