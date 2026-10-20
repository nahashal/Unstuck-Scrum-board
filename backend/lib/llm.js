const { GoogleGenerativeAI } = require('@google/generative-ai');
const PlatformSettings = require('../models/PlatformSettings');

class LLMError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

/**
 * Sends a prompt to Gemini and returns { text, model }.
 * GEMINI_MODEL may be a comma-separated list; each model is tried in turn so a single
 * overloaded (503), rate-limited (429), retired (404) or slow model doesn't fail the request.
 */
async function generate(prompt, { json = true, temperature = 0.2, timeoutMs = 30000 } = {}) {
  const settings = await PlatformSettings.get();
  if (!settings.aiEnabled) throw new LLMError('AI features have been turned off by the platform administrator.');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new LLMError('AI service is not configured. Please set GEMINI_API_KEY in backend .env file.');
  }

  const models = (process.env.GEMINI_MODEL || 'gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite')
    .split(',').map(m => m.trim()).filter(Boolean);
  const genAI = new GoogleGenerativeAI(apiKey);

  // Overall budget so the request finishes inside a 60s serverless limit, even when falling back
  const deadline = Date.now() + Number(process.env.AI_TOTAL_BUDGET_MS || 50000);
  let lastErr;
  for (const modelName of models) {
    const remaining = deadline - Date.now();
    if (remaining < 3000) break;
    try {
      const generationConfig = { temperature };
      if (json) generationConfig.responseMimeType = 'application/json';
      const model = genAI.getGenerativeModel({ model: modelName, generationConfig }, { timeout: Math.min(timeoutMs, remaining) });
      const result = await model.generateContent(prompt);
      return { text: result.response.text().trim(), model: modelName };
    } catch (err) {
      lastErr = err;
      console.warn(`[AI] ${modelName} failed: ${err.message}`);
    }
  }
  throw new LLMError(`The AI provider is unavailable right now (tried ${models.join(', ')}). Please try again in a minute. Last error: ${lastErr?.message}`);
}

// Parses a JSON reply, tolerating stray markdown fences; throws LLMError(502) if it isn't valid JSON
function parseJson(rawText) {
  try {
    const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(cleaned);
  } catch {
    throw new LLMError('AI returned an unstructured response. Please try again.', 502);
  }
}

module.exports = { generate, parseJson, LLMError };
