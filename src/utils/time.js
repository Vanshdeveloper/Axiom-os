/**
 * Time Utility for Axiom OS
 * Handles durations, absolute time parsing, and robust timezone formatting.
 */

/**
 * Formats a Date object into a readable time string in a specific timezone.
 * @param {Date} date - The date to format.
 * @param {string} timezone - The target timezone (e.g., 'Asia/Kolkata').
 * @returns {string} - Formatted time (e.g., "12:30 PM").
 */
function formatInTimezone(date, timezone = 'UTC') {
    try {
        return date.toLocaleTimeString('en-US', {
            timeZone: timezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
}

/**
 * Robustly extracts the numeric parts of a date in a specific timezone.
 * Necessary because new Date(string) is unreliable across different OSs (Windows/Linux).
 */
function getDateParts(date, timezone) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
            hour12: false
        });
        
        const parts = formatter.formatToParts(date);
        const p = {};
        parts.forEach(part => p[part.type] = part.value);
        
        return {
            year: parseInt(p.year, 10),
            month: parseInt(p.month, 10) - 1, // 0-indexed
            day: parseInt(p.day, 10),
            hour: parseInt(p.hour, 10),
            minute: parseInt(p.minute, 10),
            second: parseInt(p.second, 10)
        };
    } catch (err) {
        console.warn(`[TimeUtil] Invalid timezone "${timezone}". Falling back to UTC.`);
        return getDateParts(date, 'UTC'); // Recursive safety
    }
}

/**
 * Parse a duration string (e.g., "2m", "1h") or an absolute time string (e.g., "at 5pm")
 * into a Date object representing the future reminder time.
 * 
 * @param {string} timeStr - The time or duration string.
 * @param {string} timezone - The user's timezone for absolute time calculation.
 * @returns {Date|null} - The calculated Date object (in UTC) or null if invalid.
 */
function parseReminderTime(timeStr, timezone = 'UTC') {
    if (!timeStr) return null;

    const now = new Date();
    
    // 1. Duration Parsing (e.g., 2m, 1h, 1d, 5s)
    const durationRegex = /^(\d+)([smhd])$/i;
    const durationMatch = timeStr.match(durationRegex);
    
    if (durationMatch) {
        const value = parseInt(durationMatch[1], 10);
        const unit = durationMatch[2].toLowerCase();
        
        const date = new Date(now);
        switch (unit) {
        case 's': date.setSeconds(date.getSeconds() + value); break;
        case 'm': date.setMinutes(date.getMinutes() + value); break;
        case 'h': date.setHours(date.getHours() + value); break;
        case 'd': date.setDate(date.getDate() + value); break;
        }
        return date;
    }

    // 2. Absolute Time Parsing (e.g., "at 5pm", "17:30")
    // This MUST be relative to the user's local day
    const timeRegex = /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
    const timeMatch = timeStr.match(timeRegex);

    if (timeMatch) {
        let hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2] || '0', 10);
        const ampm = timeMatch[3]?.toLowerCase();

        if (ampm === 'pm' && hours < 12) hours += 12;
        if (ampm === 'am' && hours === 12) hours = 0;

        // Get the current date parts in the target timezone
        const p = getDateParts(now, timezone);
        
        // Reconstruct the "Local Now" and "Target Date" without unreliable string parsing
        const localNowEpoch = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
        const targetDateEpoch = Date.UTC(p.year, p.month, p.day, hours, minutes, 0);

        let finalTargetEpoch = targetDateEpoch;

        // If the time is in the past for that timezone today, assume tomorrow
        if (finalTargetEpoch < localNowEpoch) {
            const tomorrow = new Date(targetDateEpoch);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            finalTargetEpoch = tomorrow.getTime();
        }

        // Calculate the absolute distance from "Local Now" to "Target"
        const diff = finalTargetEpoch - localNowEpoch;
        
        // Apply that same distance to the actual UTC "now"
        return new Date(now.getTime() + diff);
    }

    return null;
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for a date in a specific timezone.
 */
function getISODateInTimezone(date, timezone = 'UTC') {
    const p = getDateParts(date, timezone);
    return `${p.year}-${String(p.month + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

module.exports = { parseReminderTime, formatInTimezone, getDateParts, getISODateInTimezone };
