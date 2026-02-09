/**
 * calendar.js - Google Calendar API integration
 */

const Calendar = (function () {
    // Replace with your Google Cloud Console Client ID
    const CLIENT_ID = '152474497789-at2nvf7odl1f8p7bfd1k1p5si58s4ius.apps.googleusercontent.com';
    const API_KEY = ''; // Optional: API key for quota management
    const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';
    const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

    let tokenClient = null;
    let gapiInited = false;
    let gisInited = false;
    let isSignedIn = false;
    let onSignInChange = null;

    /**
     * Initialize the Google API client
     */
    async function init(signInCallback) {
        onSignInChange = signInCallback;

        // Load the Google API scripts
        await loadScript('https://apis.google.com/js/api.js');
        await loadScript('https://accounts.google.com/gsi/client');

        // Initialize GAPI
        await new Promise((resolve) => {
            gapi.load('client', resolve);
        });

        await gapi.client.init({
            apiKey: API_KEY,
            discoveryDocs: [DISCOVERY_DOC],
        });

        gapiInited = true;

        // Initialize Google Identity Services
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: handleTokenResponse,
        });

        gisInited = true;

        // Check if we have a stored token
        const storedToken = await Storage.getSetting('google_token');
        if (storedToken) {
            gapi.client.setToken(storedToken);
            isSignedIn = true;
            if (onSignInChange) onSignInChange(true);
        }

        return gapiInited && gisInited;
    }

    /**
     * Load external script
     */
    function loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Handle token response from Google
     */
    async function handleTokenResponse(response) {
        if (response.error) {
            console.error('Token error:', response.error);
            isSignedIn = false;
            if (onSignInChange) onSignInChange(false);
            return;
        }

        // Store the token
        const token = gapi.client.getToken();
        await Storage.setSetting('google_token', token);

        isSignedIn = true;
        if (onSignInChange) onSignInChange(true);
    }

    /**
     * Sign in to Google
     */
    function signIn() {
        if (!gisInited) {
            console.error('Google Identity Services not initialized');
            return;
        }

        if (gapi.client.getToken() === null) {
            // First time sign in - request consent
            tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
            // Already have token, just refresh
            tokenClient.requestAccessToken({ prompt: '' });
        }
    }

    /**
     * Sign out from Google
     */
    async function signOut() {
        const token = gapi.client.getToken();
        if (token !== null) {
            google.accounts.oauth2.revoke(token.access_token);
            gapi.client.setToken('');
            await Storage.setSetting('google_token', null);
        }

        isSignedIn = false;
        if (onSignInChange) onSignInChange(false);
    }

    /**
     * Get events for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     * @returns {Array} Array of calendar events
     */
    async function getEventsForDate(date) {
        if (!isSignedIn) {
            return [];
        }

        try {
            const timeMin = new Date(date + 'T00:00:00').toISOString();
            const timeMax = new Date(date + 'T23:59:59').toISOString();

            // 1. Get list of all calendars
            const calendarListResponse = await gapi.client.calendar.calendarList.list({
                minAccessRole: 'reader'
            });
            const calendars = calendarListResponse.result.items || [];

            // 2. Fetch events for each calendar in parallel
            const eventPromises = calendars.map(async (calendar) => {
                try {
                    const response = await gapi.client.calendar.events.list({
                        calendarId: calendar.id,
                        timeMin: timeMin,
                        timeMax: timeMax,
                        singleEvents: true,
                        orderBy: 'startTime',
                    });

                    if (!response.result.items) return [];

                    return response.result.items.map(event => ({
                        ...event,
                        calendarId: calendar.id,
                        calendarSummary: calendar.summary,
                        backgroundColor: calendar.backgroundColor
                    }));
                } catch (e) {
                    console.warn(`Could not fetch events for calendar ${calendar.summary}:`, e);
                    return [];
                }
            });

            const results = await Promise.all(eventPromises);
            const allEvents = results.flat();

            // 3. Convert to our block format
            return allEvents
                .filter(event => event.start && event.start.dateTime) // Only timed events
                .map(event => ({
                    id: `gcal_${event.id}`,
                    title: event.summary || 'Bez názvu',
                    startTime: formatEventTime(event.start.dateTime),
                    endTime: formatEventTime(event.end.dateTime),
                    category: 'calendar',
                    fromCalendar: true,
                    calendarEventId: event.id,
                    description: event.description || '',
                    location: event.location || '',
                    calendarName: event.calendarSummary
                    // We could use event.backgroundColor here if we wanted multi-colored calendar blocks
                }));

        } catch (error) {
            console.error('Error fetching calendar events:', error);

            // Token might be expired, try to refresh
            if (error.status === 401) {
                isSignedIn = false;
                if (onSignInChange) onSignInChange(false);
            }

            return [];
        }
    }

    /**
     * Format event time to HH:MM
     */
    function formatEventTime(dateTimeString) {
        const date = new Date(dateTimeString);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    /**
     * Check if user is signed in
     */
    function getSignedInStatus() {
        return isSignedIn;
    }

    /**
     * Get user info
     */
    async function getUserInfo() {
        if (!isSignedIn) return null;

        try {
            const response = await gapi.client.request({
                path: 'https://www.googleapis.com/oauth2/v2/userinfo'
            });
            return response.result;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }

    // Public API
    return {
        init,
        signIn,
        signOut,
        getEventsForDate,
        getSignedInStatus,
        getUserInfo
    };
})();
