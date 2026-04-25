/**
 * ============================================================
 * AXIOM OS — SYSTEM HEALTH STATE
 * ============================================================
 * Internal shared state for tracking background job heartbeats
 * and system-wide metrics for the technical dashboard.
 */

const health = {
    workers: {
        axiomAgent: {
            lastRun: null,
            status: 'DORMANT'
        },
        scrapeAgent: {
            lastRun: null,
            status: 'DORMANT'
        }
    },
    
    /**
     * Updates the heartbeat for a specific worker.
     * @param {string} name - 'axiomAgent' | 'scrapeAgent'
     * @param {string} status - 'ACTIVE' | 'DORMANT'
     */
    updateHeartbeat(name, status = 'ACTIVE') {
        if (this.workers[name]) {
            this.workers[name].lastRun = new Date().toISOString();
            this.workers[name].status = status;
        }
    }
};

module.exports = health;
