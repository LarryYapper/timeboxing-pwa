/**
 * smartinput.js - Natural language parsing for Czech task input
 */

const SmartInput = (function () {

    // Category keywords in Czech
    const CATEGORY_KEYWORDS = {
        routine: ['rutina', 'ranní', 'večerní', 'noční', 'hygiena', 'sprcha', 'zuby'],
        meal: ['snídaně', 'oběd', 'večeře', 'svačina', 'jídlo', 'strava', 'kafe', 'káva'],
        work: ['práce', 'meeting', 'schůzka', 'call', 'projekt', 'úkol', 'email', 'mail', 'anki'],
        recharge: ['recharge', 'odpočinek', 'pauza', 'přestávka'],
        relax: ['relax', 'relaxace', 'volno', 'zábava', 'film', 'seriál', 'hra', 'četba', 'kniha'],
        sleep: ['spánek', 'spaní', 'postel', 'usínání']
    };

    // Time pattern regexes
    const TIME_PATTERNS = {
        // "v 14:00", "ve 14:00", "v 14"
        atTime: /(?:v|ve)\s*(\d{1,2})(?::(\d{2}))?/i,
        // "14:00", "14.00"
        simpleTime: /\b(\d{1,2})[:.](\d{2})\b/,
        // "1445", "830", "2000" (Colon-less time - must be 3-4 digits to be safe, e.g. not "20" which could be duration)
        // STRICTER: 3-4 digits.
        noColon: /\b((?:[01]?\d|2[0-3]))([0-5]\d)\b/,
        // "od 7 do 8", "od 7:00 do 8:30"
        fromTo: /od\s*(\d{1,2})(?::(\d{2}))?\s*do\s*(\d{1,2})(?::(\d{2}))?/i,
        // "20:45 until 22:00", "7 until 8:30", "until 2000"
        // Supporting "until X" with or without colon
        until: /(?:until|do)\s*(\d{1,2})(?:[:.]?(\d{2}))?/i,
        // "7-8", "7:00-8:30"
        range: /(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?/,
    };

    // Duration patterns
    const DURATION_PATTERNS = {
        // "na 1 hodinu", "na 2 hodiny", "na 30 minut"
        naTime: /na\s*(\d+(?:[.,]\d+)?)\s*(hodin[uya]?|h|minut[uya]?|min|m)/i,
        // "1 hodinu", "30 minut", "1.5h"
        simpleTime: /(\d+(?:[.,]\d+)?)\s*(hodin[uya]?|h|minut[uya]?|min|m)\b/i,
        // "Task 15", "Task 30" (Implicit minutes at end of string)
        // Matches whitespace + number (1-3 digits) + end of string
        // We limit to 3 digits (999 min max) to avoid confusion with years/dates if any
        implicitMinutes: /\s+(\d{1,3})\s*$/
    };

    /**
     * Parse time string to hours and minutes
     */
    function parseTime(hours, minutes = '0') {
        const h = parseInt(hours, 10);
        const m = parseInt(minutes || '0', 10);

        if (h < 0 || h > 23 || m < 0 || m > 59) {
            return null;
        }

        return { hours: h, minutes: m };
    }

    /**
     * Format time object to HH:MM string
     */
    function formatTime(timeObj) {
        if (!timeObj) return null;
        const h = String(timeObj.hours).padStart(2, '0');
        const m = String(timeObj.minutes).padStart(2, '0');
        return `${h}:${m}`;
    }

    /**
     * Parse duration string to minutes
     */
    function parseDuration(input) {
        // Try "na X hodin/minut"
        let match = input.match(DURATION_PATTERNS.naTime);
        if (match) {
            return convertToMinutes(match[1], match[2]);
        }

        // Try simple "X hodin/minut"
        match = input.match(DURATION_PATTERNS.simpleTime);
        if (match) {
            return convertToMinutes(match[1], match[2]);
        }

        // Try Implict Minutes at End (e.g. "Task 15")
        // Be careful not to match years like "2023" as duration if they are huge, 
        // but 2023 min is 33 hours, unlikely. 
        // User asked for 15/30/45/60.
        match = input.match(DURATION_PATTERNS.implicitMinutes);
        if (match) {
            const val = parseInt(match[1], 10);
            if (val > 0 && val < 1000) { // Reasonable sanity check
                return val;
            }
        }

        return null;
    }

    /**
     * Convert value and unit to minutes
     */
    function convertToMinutes(value, unit) {
        if (!value) return null;
        const num = parseFloat(value.replace(',', '.'));
        const unitLower = unit.toLowerCase();

        if (unitLower.startsWith('hodin') || unitLower === 'h') {
            return Math.round(num * 60);
        } else if (unitLower.startsWith('minut') || unitLower === 'min' || unitLower === 'm') {
            return Math.round(num);
        }

        return null;
    }

    /**
     * Parse time range or single time from input
     */
    function parseTimeFromInput(input) {
        let startTime = null;
        let endTime = null;

        // Try "od X do Y" pattern
        let match = input.match(TIME_PATTERNS.fromTo);
        if (match) {
            startTime = parseTime(match[1], match[2]);
            endTime = parseTime(match[3], match[4]);
            if (startTime && endTime) {
                return { startTime, endTime };
            }
        }

        // Try "X-Y" range pattern
        match = input.match(TIME_PATTERNS.range);
        if (match) {
            startTime = parseTime(match[1], match[2]);
            endTime = parseTime(match[3], match[4]);
            if (startTime && endTime) {
                return { startTime, endTime };
            }
        }

        // Try "v X" pattern (Pre-filled start time)
        match = input.match(TIME_PATTERNS.atTime);
        if (match) {
            startTime = parseTime(match[1], match[2]);
            // Note: We don't return here yet, we look for "until" or duration
        }

        // Try simple time pattern (if not found via "v X")
        if (!startTime) {
            match = input.match(TIME_PATTERNS.simpleTime);
            if (match) {
                startTime = parseTime(match[1], match[2]);
            }
        }

        // Try no-colon time pattern (e.g. 1430) (if not found)
        if (!startTime) {
            match = input.match(TIME_PATTERNS.noColon);
            if (match) {
                startTime = parseTime(match[1], match[2]);
            }
        }

        // --- END TIME DETECTION ---

        // Try "until X" (e.g. "until 2000" or "until 20:00")
        // We only look for this if we have a start time (context)
        if (startTime) {
            match = input.match(TIME_PATTERNS.until);
            if (match) {
                // If the until string looks like a duration ("until 30"?), we might be careful,
                // but regex looks for time-like digits.
                // However, "until 20" could mean 20:00.
                let uH = match[1];
                let uM = match[2];

                // If uM is undefined, and uH is 3-4 digits, it might be no-colon format embedded
                if (!uM && uH.length >= 3) {
                    // e.g. "2000"
                    const parsedNoColon = uH.match(/(\d{1,2})(\d{2})/);
                    if (parsedNoColon) {
                        uH = parsedNoColon[1];
                        uM = parsedNoColon[2];
                    }
                }

                endTime = parseTime(uH, uM);
            }
        }

        // If we have start time but no end time, try to get duration
        if (startTime && !endTime) {
            const durationMinutes = parseDuration(input);
            if (durationMinutes) {
                const startMinutes = startTime.hours * 60 + startTime.minutes;
                const endMinutes = startMinutes + durationMinutes;

                endTime = {
                    hours: Math.floor(endMinutes / 60) % 24,
                    minutes: endMinutes % 60
                };
            } else {
                // Default to 15 minutes is implicit ONLY if "v 14:00" style was used with no other info?
                // The original code drifted to 15m default.
                // But we should be careful. 
                // Let's keep the fallback if absolutely nothing else matches.
                const startMinutes = startTime.hours * 60 + startTime.minutes;
                const endMinutes = startMinutes + 15;
                endTime = {
                    hours: Math.floor(endMinutes / 60) % 24,
                    minutes: endMinutes % 60
                };
            }
        }

        return { startTime, endTime };
    }

    /**
     * Detect category from input text
     */
    function detectCategory(input) {
        const lowerInput = input.toLowerCase();

        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            for (const keyword of keywords) {
                if (lowerInput.includes(keyword)) {
                    return category;
                }
            }
        }

        return 'work'; // Default category
    }

    /**
     * Extract title from input (remove time/duration patterns)
     */
    function extractTitle(input) {
        let title = input
            // Remove time patterns
            .replace(TIME_PATTERNS.fromTo, '')
            .replace(TIME_PATTERNS.until, '') // Updated regex will match here
            .replace(TIME_PATTERNS.range, '')
            .replace(TIME_PATTERNS.atTime, '')
            .replace(TIME_PATTERNS.simpleTime, '')
            .replace(TIME_PATTERNS.noColon, '') // Remove 1430
            // Remove duration patterns
            .replace(DURATION_PATTERNS.naTime, '')
            .replace(DURATION_PATTERNS.simpleTime, '')
            .replace(DURATION_PATTERNS.implicitMinutes, '') // Remove trailing number
            // Clean up
            .replace(/\s+/g, ' ')
            .trim();

        // Capitalize first letter
        if (title) {
            title = title.charAt(0).toUpperCase() + title.slice(1);
        }

        return title || 'Bez názvu';
    }

    /**
     * Snap time to 15-minute grid
     */
    function snapToGrid(timeObj) {
        if (!timeObj) return null;

        const snappedMinutes = Math.round(timeObj.minutes / 15) * 15;
        const extraHours = Math.floor(snappedMinutes / 60);

        return {
            hours: (timeObj.hours + extraHours) % 24,
            minutes: snappedMinutes % 60
        };
    }

    /**
     * Main parse function
     * @param {string} input - Natural language input
     * @returns {Object|null} Parsed block data or null if invalid
     */
    function parse(input) {
        if (!input || !input.trim()) {
            return null;
        }

        const { startTime, endTime } = parseTimeFromInput(input);

        if (!startTime) {
            return null;
        }

        const snappedStart = snapToGrid(startTime);
        const snappedEnd = snapToGrid(endTime);

        // Ensure end is after start
        if (snappedStart && snappedEnd) {
            const startMinutes = snappedStart.hours * 60 + snappedStart.minutes;
            const endMinutes = snappedEnd.hours * 60 + snappedEnd.minutes;

            if (endMinutes <= startMinutes) {
                // Add duration to make it valid
                const newEndMinutes = startMinutes + 15;
                snappedEnd.hours = Math.floor(newEndMinutes / 60) % 24;
                snappedEnd.minutes = newEndMinutes % 60;
            }
        }

        return {
            title: extractTitle(input),
            startTime: formatTime(snappedStart),
            endTime: formatTime(snappedEnd),
            category: detectCategory(input)
        };
    }

    /**
     * Get preview text for input
     */
    function getPreview(input) {
        const result = parse(input);

        if (!result) {
            if (input && input.trim()) {
                return { text: 'Nerozpoznán čas. Zkuste např. "Meeting v 14:00 na 1 hodinu"', isError: true };
            }
            return { text: '', isError: false };
        }

        return {
            text: `${result.title} • ${result.startTime}–${result.endTime} (${getCategoryLabel(result.category)})`,
            isError: false
        };
    }

    /**
     * Get Czech label for category
     */
    function getCategoryLabel(category) {
        const labels = {
            routine: 'Rutina',
            meal: 'Jídlo',
            work: 'Práce',
            recharge: 'Recharge',
            relax: 'Relax',
            sleep: 'Spánek',
            calendar: 'Kalendář'
        };
        return labels[category] || category;
    }

    // Public API
    return {
        parse,
        getPreview,
        getCategoryLabel,
        formatTime,
        snapToGrid
    };
})();
