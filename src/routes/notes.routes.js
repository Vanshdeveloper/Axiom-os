const express = require('express');
const router = express.Router();
const geminiService = require('../services/gemini.service');
const notionService = require('../services/notion.service');
const pdfService = require('../services/pdf.service');

/**
 * ============================================================
 * AXIOM OS — NOTES & PDF API ROUTES
 * ============================================================
 * Internal endpoints for the web-based frontend.
 * Facilitates note generation, PDF rendering, and Notion sync.
 */

/**
 * POST /api/generate-notes
 * Triggers Gemini brain to synthesize academic notes.
 */
router.post('/api/generate-notes', async (req, res) => {
    const { topic, persona } = req.body;
    console.log(`[Routes] Request: Generate notes for topic "${topic}" [Persona: ${persona || 'professor'}]`);

    try {
        const jsonData = await geminiService.generateNotesJson(topic, persona);
        res.json(jsonData);
        console.log('[Routes] Success: Notes delivered.');
    } catch (error) {
        console.error('[Routes] Gemini Error:', error.message);
        res.status(500).json({ error: error.message || 'Failed to generate notes.' });
    }
});

/**
 * POST /api/generate-pdf
 * Triggers Puppeteer to render a high-fidelity PDF buffer.
 */
router.post('/api/generate-pdf', async (req, res) => {
    const { title, breadcrumbs, sections } = req.body;

    if (!sections || !Array.isArray(sections)) {
        return res.status(400).json({ error: 'Invalid notes data. Please generate notes first.' });
    }

    console.log(`[Routes] Request: Render PDF for "${title}"`);

    try {
        const pdfBuffer = await pdfService.generatePdf({ title, breadcrumbs, sections });

        // Generate a URL-safe filename
        const safeName = (title || 'axiom-notes')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 60);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });

        res.send(pdfBuffer);
        console.log(`[Routes] Success: PDF delivered (${Math.round(pdfBuffer.length / 1024)} KB)`);
    } catch (error) {
        console.error('[Routes] PDF Error:', error.message);
        res.status(500).json({ error: 'Failed to generate PDF. Please try again.' });
    }
});

/**
 * POST /api/save-to-notion
 * Persists locally generated notes to the Notion Note Vault.
 */
router.post('/api/save-to-notion', async (req, res) => {
    try {
        const { title, sections } = req.body;
        console.log(`[Routes] Request: Saving "${title}" to Notion vault...`);

        const response = await notionService.saveNotesToVault(title, sections);

        console.log(`[Routes] Success: Saved to Notion -> ${response.url}`);
        res.status(200).json({ message: 'Saved successfully!', url: response.url, pageId: response.id });

    } catch (error) {
        console.error('[Routes] Notion Sync Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/sync-timezone
 * Updates the global system timezone from a device sensor (Web Dashboard).
 */
router.post('/api/sync-timezone', async (req, res) => {
    try {
        const { timezone } = req.body;
        if (!timezone) return res.status(400).json({ error: 'Timezone required' });

        console.log(`[Routes] Request: Syncing system timezone to "${timezone}"`);
        await notionService.saveSystemConfig('TIMEZONE', timezone);
        
        res.status(200).json({ message: 'Timezone synchronized successfully!', timezone });
    } catch (error) {
        console.error('[Routes] Sync Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
