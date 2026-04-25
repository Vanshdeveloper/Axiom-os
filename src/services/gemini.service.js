const { GoogleGenerativeAI } = require('@google/generative-ai');
const https = require('https');
const http = require('http');

/**
 * ============================================================
 * AXIOM OS — GEMINI AI SERVICE
 * ============================================================
 * Internal engine for multimodal content extraction, research
 * generation, and study note synthesis using Google Gemini.
 */
class GeminiService {
    constructor() {
        if (!process.env.GEMINI_API_KEY) {
            console.warn('[GeminiService] WARNING: GEMINI_API_KEY is not set.');
            this.genAI = null;
        } else {
            this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            // Switched to v1beta to support responseMimeType (JSON Mode)
            this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }, { apiVersion: 'v1beta' });
        }
        
        // Locked to 2.5-flash for maximum stability
        this.modelPriority = ['gemini-2.5-flash'];
    }

    /**
     * Technical Health Diagnostic for /status command.
     */
    async getHealthStatus() {
        return {
            apiKey: !!process.env.GEMINI_API_KEY,
            modelReady: !!this.model,
            version: 'Gemini 2.5 Flash (Ultra-Persistent Mode)'
        };
    }

    /**
     * Core AI Gateway.
     * Direct one-shot generation per user configuration.
     */
    async _generateResilientContent(contentParts, jsonMode = false) {
        if (!this.genAI) throw new Error('Gemini AI is not configured.');
        
        const config = {
            model: 'gemini-2.5-flash',
            generationConfig: jsonMode ? { responseMimeType: 'application/json' } : {}
        };

        const model = this.genAI.getGenerativeModel(config, { apiVersion: 'v1beta' });
        
        try {
            const result = await model.generateContent(contentParts);
            
            if (!result || !result.response) {
                throw new Error('Axiom AI safely blocked the response or returned empty content.');
            }
            
            return result;
        } catch (err) {
            console.error(`[GeminiService] AI Gateway Failure: ${err.message}`);
            throw err;
        }
    }

    /**
     * Safely extracts and parses JSON from potentially messy AI responses.
     */
    safeJsonParse(rawText) {
        try {
            let clean = rawText
                .replace(/```json/gi, '')
                .replace(/```/gi, '')
                .trim();
            
            // Basic cleaning for control characters
            clean = clean.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' '); 
            
            return JSON.parse(clean);
        } catch (err) {
            console.error('[GeminiService] JSON Parse Failure. Length:', rawText.length);
            console.error('Raw snippet:', rawText.slice(0, 200));
            throw new Error(`Axiom Intelligence is currently processing a high-depth topic. Please try a more specific query.`);
        }
    }

    /**
     * Synthesizes academic study notes in a structured JSON format.
     */
    async generateNotesJson(topic, persona = 'professor') {
        const personaInstruction = persona === 'student' 
            ? `ROLE: Act as an Elite 1% Academic Prodigy & Mental Model Specialist.
               STRATEGY: Use the "Feynman Technique" for synthesis. Deconstruct complex jargon into intuitive analogies.
               STRUCTURE: Focus on "Core Axioms", "Mental Hooks", and "Rapid Implementation".
               TONE: Efficient, high-clarity, and intellectually agile.`
            : `ROLE: Act as a Distinguished Senior Fellow & Academic Chair.
               STRATEGY: Use "First Principles" deconstruction. Explore the ontological and epistemological foundations of the topic.
               STRUCTURE: Focus on "Historical Context", "Theoretical Framework", "Technical Nuances", and "Paradigm Paradoxes".
               TONE: Authoritative, academically dense, and rigorously precise.`;

        const promptText = `
${personaInstruction}

TASK: Synthesize a "High-Resolution" academic briefing for the subject: "${topic}".

INSTRUCTIONAL CONSTRAINTS:
1. DEPTH: Provide an exhaustive breakdown. Do not surface-level summarize.
2. SYNTHESIS: Bridge the gap between historical origins and modern-day cutting-edge applications.
3. STRUCTURE: Every section must contain "The Core Insight" (a one-sentence distillation) and "Deep Analysis" (detailed bullet points).

SCHEMA:
{
  "title": "Axiom High-Res: [Topic Name]",
  "breadcrumbs": "Axiom / Intelligence / [Academic Branch]",
  "sections": [
    {
      "type": "text",
      "title": "[Strategic Concept Name]",
      "content": [
        "Core Insight: [One sentence distillation]",
        "Analysis: [Detailed point 1]",
        "Analysis: [Detailed point 2]",
        "Nuance: [Advanced technical detail]"
      ]
    }
  ]
}
`;
        const result = await this._generateResilientContent(promptText, true);
        const parsed = this.safeJsonParse(result.response.text());
        if (parsed.sections) {
            parsed.sections = parsed.sections.map(sec => {
                if (sec.type === 'text') sec.content = Array.isArray(sec.content) ? sec.content.map(p => this.cleanMarkdown(p)) : this.cleanMarkdown(sec.content);
                return sec;
            });
        }
        return parsed;
    }

    /**
     * Generates a creative ideation/brainstorming session document.
     */
    async generateBrainstormJson(topic) {
        const promptText = `
ROLE: Act as the Axiom Creative Catalyst & Strategic Innovation Consultant.
TASK: Facilitate a high-energy, multi-dimensional brainstorming session for: "${topic}".

METHODOLOGY: Use the SCAMPER framework (Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, Reverse) to generate non-obvious execution strategies.

INSTRUCTIONAL CONSTRAINTS:
1. CREATIVITY: Prioritize "Wildcard" ideas that disrupt standard thinking.
2. EXECUTION: Every "Idea" section must have a corresponding "Roadmap" bullet point.
3. OUTPUT FORMAT: JSON ONLY. No markdown fences.

SCHEMA:
{
  "title": "Axiom Catalyst: [Topic] Ideation",
  "sections": [
    { "type": "text", "title": "The Big Visionary Idea", "content": "..." },
    { "type": "text", "title": "Strategic SCAMPER Pivot", "content": "How we adapt or reverse standard thinking." },
    { "type": "text", "title": "Execution Roadmap", "content": "Step-by-step path to reality." },
    { "type": "text", "title": "Wildcard Expansion", "content": "Risk-heavy, high-reward expansion concepts." }
  ]
}
`;
        const result = await this._generateResilientContent(promptText, true);
        const parsed = this.safeJsonParse(result.response.text());
        if (parsed.sections) {
            parsed.sections = parsed.sections.map(sec => {
                if (sec.type === 'text') sec.content = Array.isArray(sec.content) ? sec.content.map(p => this.cleanMarkdown(p)) : this.cleanMarkdown(sec.content);
                return sec;
            });
        }
        return parsed;
    }

    cleanMarkdown(text) {
        if (typeof text !== 'string') return text;
        return text
            .replace(/\*\*/g, '')         // Remove bold
            .replace(/__/g, '')           // Remove underline
            .replace(/#{1,6}\s?/g, '')    // Remove headers
            .replace(/\*/g, '')           // Remove italics
            .replace(/`/g, '')            // Remove code ticks
            .replace(/>\s/g, '')          // Remove blockquotes
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert links to text
            .trim();
    }

    async summarizeArticle(articleTitle, rawText) {
        const promptText = `
ROLE: Act as a Senior Insight Analyst & Intelligence Liaison.
TASK: Extract deep strategic insights and core theses from the article: "${articleTitle}".
RAW TEXT: ${rawText.slice(0, 5000)}

INSTRUCTIONAL CONSTRAINTS:
1. USE THE 3x3 TECHNIQUE: Extract exactly 3 Core Theses, 3 Supporting Data Points, and 3 Actionable Takeaways.
2. OUTPUT FORMAT: JSON ONLY. 

SCHEMA:
{
  "title": "Axiom Intel: ${articleTitle}",
  "sections": [
    { "type": "text", "title": "The 3 Core Theses", "content": ["...", "...", "..."] },
    { "type": "text", "title": "Key Data Points", "content": ["...", "...", "..."] },
    { "type": "text", "title": "Strategic Takeaways", "content": ["...", "...", "..."] }
  ]
}
`;
        const result = await this._generateResilientContent(promptText, true);
        return this.safeJsonParse(result.response.text());
    }

    async processVoiceBrainDump(fileUrl, mimeType = 'audio/ogg') {
        const audioBuffer = await this._downloadAudio(fileUrl);
        const audioBase64 = audioBuffer.toString('base64');
        const now = new Date().toISOString();
        const promptText = `
ROLE: Act as the Axiom Digital Executive Secretary. 
CONTEXT: Current Time is ${now}.
TASK: Process the provided audio recording. Extract the amount and the item name mentioned.

INSTRUCTIONAL CONSTRAINTS:
1. NO PREDICTIONS: Do not infer category, payment method, or intent. Only extract the explicit Amount and Item.
2. NUMBERS: Be extremely precise with numbers (Amounts).
3. OUTPUT FORMAT: JSON ONLY.

SCHEMA:
{ 
  "amount": 0.0, 
  "item": "Exact item name",
  "transcript": "Raw transcript of the audio"
}
`;
        
        const result = await this._generateResilientContent([{ inlineData: { mimeType, data: audioBase64 } }, { text: promptText }]);
        const data = this.safeJsonParse(result.response.text());
        if (data.transcript) data.transcript = this.cleanMarkdown(data.transcript);
        if (data.item) data.item = this.cleanMarkdown(data.item);
        return data;
    }

    async generateFinanceAdvice(analytics) {
        if (!this.model) throw new Error('AI features disabled.');
        
        const promptText = `
ROLE: Act as a Senior Financial Strategist and Personal Wealth Advisor.
CONTEXT: Analyzing a user's expense data for the current month.
DATA: 
- Total Spent: ₹${analytics.total}
- Daily Average: ₹${analytics.dailyAverage.toFixed(2)}
- Forecasted End-of-Month: ₹${analytics.forecast.toFixed(2)}
- Largest Single Expense: "${analytics.largestExpense.item}" (₹${analytics.largestExpense.amount})
- Categories: ${JSON.stringify(analytics.categoryDistribution)}

TASK: Provide exactly 3 short, professional, and actionable financial insights or tips to help the user stay within their ₹30,000 budget and improve their fiscal health.

INSTRUCTIONAL CONSTRAINTS:
1. VOICE: Professional, strategic, and encouraging.
2. CONCISENESS: Each tip must be 1 sentence maximum.
3. OUTPUT FORMAT: JSON ONLY.

SCHEMA:
{
  "insights": ["Tip 1", "Tip 2", "Tip 3"]
}
`;
        const result = await this._generateResilientContent(promptText, true);
        return this.safeJsonParse(result.response.text());
    }

    async _downloadAudio(url) {
        return new Promise((resolve, reject) => {
            const lib = url.startsWith('https') ? https : http;
            lib.get(url, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            }).on('error', reject);
        });
    }
}

module.exports = new GeminiService();
