const { GoogleGenerativeAI } = require('@google/generative-ai');
const PlatformSettings = require('../models/PlatformSettings');

class LLMError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.status = status;
  }
}

// Fast models always tried after GEMINI_MODEL's list. Google's overload (503) hits individual models
// for short spells, and overloaded models reject within ~2s, so a longer chain is cheap and much more reliable.
const BACKUP_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.7-flash'];

// Busy/overloaded/timeout errors are worth retrying; quota, auth and missing-model errors are not
const isTransient = (err) => !/\b(400|401|403|404|429)\b|quota|API key|not found|no longer available/i.test(err?.message || '');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Sends a prompt to Gemini and returns { text, model }.
 * Tries GEMINI_MODEL's comma-separated list, then the backup models; if every model is busy,
 * waits briefly and makes a second pass. Everything fits in one overall time budget
 * (default 50s, inside Vercel's 60s function limit).
 */
async function generate(prompt, { json = true, temperature = 0.2, timeoutMs = 20000 } = {}) {
  const settings = await PlatformSettings.get();
  if (!settings.aiEnabled) throw new LLMError('AI features have been turned off by the platform administrator.');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    throw new LLMError('AI service is not configured. Please set GEMINI_API_KEY in backend .env file.');
  }

  const configured = (process.env.GEMINI_MODEL || '').split(',').map(m => m.trim()).filter(Boolean);
  let models = [...new Set([...configured, ...BACKUP_MODELS])];
  const genAI = new GoogleGenerativeAI(apiKey);

  const deadline = Date.now() + Number(process.env.AI_TOTAL_BUDGET_MS || 50000);
  let lastErr;
  for (let round = 1; round <= 2 && models.length; round++) {
    if (round === 2) await sleep(Math.min(2500, Math.max(0, deadline - Date.now() - 5000)));
    const retry = [];
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
        console.warn(`[AI] round ${round} ${modelName} failed: ${err.message}`);
        if (isTransient(err)) retry.push(modelName);
      }
    }
    models = retry;
  }
  throw new LLMError('Google’s AI service is overloaded right now, so the analysis could not run. Nothing was saved — please try again in a minute or two.');
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
