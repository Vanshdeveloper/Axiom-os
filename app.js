// app.js - Axiom's Core Engine (FULL ULTIMATE VERSION)

window.currentNotesData = null;

// ==========================================
// 1️⃣ THE RENDERER: JSON to HTML CONVERTER
// ==========================================
function renderDocumentToUI(jsonData) {
    const previewDiv = document.getElementById('pdf-preview-div');
    if (!previewDiv) return;

    let html = `
    <section class="document-preview">
        <div class="document-header">
            <div class="breadcrumbs">
                ${jsonData.breadcrumbs ? jsonData.breadcrumbs.split('/').map(item => item.trim()).join(' <span>/</span> ') : 'Drafts / Notes'}
            </div>
            <h1 class="document-title">${jsonData.title}</h1>
        </div>
        <div class="document-content">
            <div class="content-grid">
    `;

    jsonData.sections.forEach(section => {
        if (section.type === 'text') {
            html += `
            <div class="full-width section-block">
                <div class="section-header">
                    <div class="section-icon"></div>
                    <h2 class="section-title">${section.title}</h2>
                </div>
                <div class="section-text">
                    ${Array.isArray(section.content) ? section.content.map(p => `<p>${p}</p>`).join('') : `<p>${section.content}</p>`}
                </div>
            </div>`;
        } else if (section.type === 'table') {
            html += `
            <div class="full-width section-block">
                <div class="section-header">
                    <div class="section-icon"></div>
                    <h2 class="section-title">${section.title}</h2>
                </div>
                <div class="table-wrapper">
                    <table class="conditions-table">
                        <thead>
                            <tr>${section.headers.map(h => `<th>${h}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${section.rows.map(row => `
                                <tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        } else if (section.type === 'protip') {
            html += `
            <div class="full-width section-block">
                <div class="protip-callout">
                    <div class="protip-label">💡 Pro Tip</div>
                    <p class="protip-text">${section.content}</p>
                </div>
            </div>`;
        }
    });

    html += `</div></div></section>`;
    previewDiv.innerHTML = html;
}

// ==========================================
// 2️⃣ THE GENERATOR (With Loader & AI Proxy)
// ==========================================
async function generateNotesFromUI(topic, persona = 'professor') {
    const previewDiv = document.getElementById('pdf-preview-div');
    const footerBar = document.getElementById('footer-action-bar');
    const downloadBtn = document.getElementById('download-btn');
    const notionBtn = document.getElementById('notion-btn');

    if (footerBar) footerBar.style.display = 'flex';
    if (downloadBtn) downloadBtn.style.display = 'inline-block';
    if (notionBtn) notionBtn.style.display = 'inline-block';

    // 🛑 START LOADING STATE
    previewDiv.innerHTML = `
    <div class="loader-container">
        <div class="progress-ring-container">
            <svg class="progress-ring" viewBox="0 0 140 140">
                <circle class="progress-ring__circle" stroke-width="8" fill="transparent" r="60" cx="70" cy="70"/>
                <circle class="progress-ring__progress" id="progress-ring" stroke-width="8" fill="transparent" r="60" cx="70" cy="70" stroke-dasharray="377" stroke-dashoffset="377"/>
            </svg>
            <div class="progress-percentage" id="progress-percent">0%</div>
        </div>
        <div class="loader-stage-container">
            <div class="loader-stage" id="loader-stage">Preparing magic...</div>
            <div class="loader-substage" id="loader-substage">Please wait</div>
        </div>
    </div>`;

    const progressRing = document.getElementById('progress-ring');
    const progressPercent = document.getElementById('progress-percent');
    const loaderStage = document.getElementById('loader-stage');
    const loaderSubstage = document.getElementById('loader-substage');

    const stageMessages = [
        { stage: "Analyzing topic...", substage: "Understanding requirements" },
        { stage: "Researching concepts...", substage: "Gathering information" },
        { stage: "Generating content...", substage: "Creating notes" },
        { stage: "Formatting...", substage: "Structuring for learning" }
    ];

    const shuffledStages = [...stageMessages].sort(() => Math.random() - 0.5);
    const selectedStages = shuffledStages.slice(0, 4);
    let currentIndex = 0;
    const circumference = 377;

    function updateProgress(percent, stage, substage) {
        if (progressPercent) progressPercent.textContent = percent + '%';
        const offset = circumference - (percent / 100) * circumference;
        if (progressRing) progressRing.style.strokeDashoffset = offset;
        if (loaderStage) loaderStage.textContent = stage;
        if (loaderSubstage) loaderSubstage.textContent = substage;
    }

    // Fake progress simulation
    let currentPercent = 0;
    const interval = setInterval(() => {
        if (currentPercent < 90) {
            currentPercent += Math.floor(Math.random() * 10) + 1;
            const stageIdx = Math.floor((currentPercent / 100) * selectedStages.length);
            updateProgress(
                currentPercent, 
                selectedStages[stageIdx]?.stage || "Finalizing...", 
                selectedStages[stageIdx]?.substage || "Almost there"
            );
        }
    }, 800);

    try {
        // 🚀 SECURE PROXY CALL TO SERVER.JS
        const response = await fetch('/api/generate-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: topic, persona: persona })
        });

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);

        const jsonData = await response.json();
        
        // Stop loader and finish progress
        clearInterval(interval);
        updateProgress(100, "Success!", "Notes ready");
        
        window.currentNotesData = jsonData;
        setTimeout(() => renderDocumentToUI(jsonData), 500);

    } catch (error) {
        clearInterval(interval);
        previewDiv.innerHTML = `<div style="color: red; padding: 20px;">🚨 Oops! Something went wrong: ${error.message}</div>`;
        console.error("AI Error:", error);
    }
}

// ==========================================
// 3️⃣ SERVER-SIDE PDF DOWNLOADER (Puppeteer)
// ==========================================
async function downloadPDF() {
    if (!window.currentNotesData) return alert("Please generate notes first!");

    const btn = document.getElementById('download-btn');
    const originalLabel = btn.innerText;

    btn.innerText = "⏳ Generating PDF...";
    btn.disabled = true;

    try {
        const response = await fetch('/api/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(window.currentNotesData)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Server error ${response.status}`);
        }

        // Convert the response to a Blob and trigger browser download
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Use the filename from Content-Disposition if available
        const disposition = response.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/);
        a.download = match ? match[1] : 'axiom-notes.pdf';

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        btn.innerText = "✅ PDF Downloaded!";
        setTimeout(() => {
            btn.innerText = originalLabel;
            btn.disabled = false;
        }, 3000);

    } catch (error) {
        console.error("PDF Error:", error);
        showNotification('error', 'PDF Failed ❌', error.message || 'Could not generate PDF.');
        btn.innerText = originalLabel;
        btn.disabled = false;
    }
}

// ==========================================
// 4️⃣ NOTIFICATION SYSTEM
// ==========================================
function showNotification(type, title, message, duration = 5000) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification-card ${type}`;
    const icon = type === 'success' ? '✓' : '✕';

    notification.innerHTML = `
        <div class="notification-icon">${icon}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('removing');
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

// ==========================================
// 5️⃣ ☁️ SAVE TO NOTION (BULLETPROOF)
// ==========================================
window.saveToNotion = async function () {
    const btn = document.getElementById('notion-btn');
    if (!window.currentNotesData) return showNotification(
        "error",
        "Error! ❌",
        `Please generate notes first!`,
        8000
    );

    btn.innerText = "Saving... ⏳";

    try {
        const response = await fetch('/api/save-to-notion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(window.currentNotesData)
        });

        if (response.ok) {
            const data = await response.json();
            btn.innerText = "Saved to Shared DB! ✅";
            
            showNotification(
                "success", 
                "Saved to Vault! 🚀", 
                `Added to your Notion database. <a href="${data.url}" target="_blank">View</a>`, 
                8000
            );
        } else {
            throw new Error("Backend failed");
        }
    } catch (error) {
        btn.innerText = "Save Failed ❌";
        showNotification('error', 'Upload Failed', 'Is node server.js running?');
    }
};
// ========================================== 
// 6?? ??? ZERO-TOUCH SENSOR: TIMEZONE SYNC 
// ========================================== 
(async function autoSyncTimezone() { 
    try { 
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; 
        console.log([Sensor] Detecting regional clock: ); 
        
        const response = await fetch(" /api/sync-timezone\, { 
 method: \POST\, 
 headers: { \Content-Type\: \application/json\ }, 
 body: JSON.stringify({ timezone: tz }) 
 }); 
 
 if (response.ok) { 
 console.log(\[Sensor] Timezone synchronized with Axiom Core ?\); 
 } 
 } catch (err) { 
 console.warn(\[Sensor] Timezone sync failed. Using system default.\, err.message); 
 } 
})();
