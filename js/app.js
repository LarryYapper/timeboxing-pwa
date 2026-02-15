/**
 * app.js - Main application logic
 * Version: 1.60
 */
console.log('Timeboxing App v1.60 loaded');

(function () {
    // State
    const APP_VERSION = 'v1.60';
    let currentDate = new Date();
    let blocks = []; // Combined routines + local + calendar blocks
    let routineBlocks = [];
    let localBlocks = [];
    let calendarBlocks = [];
    let editingBlockId = null;

    // User Task Palette
    const TASK_PALETTE = [
        '#B22B3A', // Focus (Red)
        '#11326B', // Admin (Blue)
        '#326663', // Creative (Teal)
        '#724431', // Other (Brown)
        '#e37400'  // Energy (Darker Orange)
    ];

    // DOM Elements
    const elements = {
        currentDate: document.getElementById('current-date'),
        currentYear: document.getElementById('current-year'),
        prevDay: document.getElementById('prev-day'),
        nextDay: document.getElementById('next-day'),
        // todayBtn removed
        googleSigninBtn: document.getElementById('google-signin-btn'),
        smartInput: document.getElementById('smart-input'),
        addBlockBtn: document.getElementById('add-block-btn'),
        headerAddBlockBtn: document.getElementById('add-block-btn-header'),
        inputFeedback: document.getElementById('input-feedback'),
        timegrid: document.getElementById('timegrid'),
        blockModal: document.getElementById('block-modal'),
        blockForm: document.getElementById('block-form'),
        blockTitle: document.getElementById('block-title'),
        blockStart: document.getElementById('block-start'),
        blockEnd: document.getElementById('block-end'),
        categoryPicker: document.getElementById('category-picker'),
        blockNotes: document.getElementById('block-notes'),
        deleteBlockBtn: document.getElementById('delete-block-btn'),
        cancelModalBtn: document.getElementById('cancel-modal-btn'),
        syncCalendarBtn: document.getElementById('sync-calendar-btn'),
        reloadAppBtn: document.getElementById('reload-app-btn'),
        themeModeBtn: document.getElementById('theme-mode-btn'),
        quickSyncBtn: document.getElementById('quick-sync-btn'),
    };

    /**
     * Initialize the application
     */
    async function init() {
        console.log(`Initializing Timeboxing App ${APP_VERSION}...`);

        // Inject version into UI
        document.title = `Timeboxing ${APP_VERSION}`;
        const logo = document.querySelector('.logo');
        if (logo) logo.textContent = `Timeboxing ${APP_VERSION}`;

        // Initialize storage
        await Storage.init();

        // Build the time grid
        buildTimeGrid();

        // Initialize time blocks system - pass the grid element directly
        TimeBlocks.init(elements.timegrid);

        // Initialize Theme (Default to Dark)
        initTheme();

        // Set up event listeners
        setupEventListeners();

        // Initialize Google Calendar (don't wait for it)
        initCalendar();

        // Load today's data
        await loadDate(currentDate);

        // Update current time indicator
        updateCurrentTimeIndicator();
        setInterval(updateCurrentTimeIndicator, 60000); // Update every minute

        // Quick Sync Listener
        if (elements.quickSyncBtn) {
            elements.quickSyncBtn.addEventListener('click', syncFromDrive);
        }

        // Initialize Smart Input Toggle
        // document.addEventListener('keydown', (e) => {
        //     // Shortcut: 'Q' to open smart input
        //     if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        //         e.preventDefault();
        //         toggleSmartInput();
        //     }
        //     // Shortcut: 'Esc' to close input or modal
        //     if (e.key === 'Escape') {
        //         // If modal is open, close it
        //         if (!elements.blockModal.hidden) {
        //             closeModal();
        //         } else {
        //             // Else close smart input
        //             elements.smartInputContainer.style.display = 'none';
        //         }
        //     }
        // });

        // Re-implementing with cleaner logic
        document.addEventListener('keydown', (e) => {
            // Q: Open Smart Input (if not typing)
            if (e.key.toLowerCase() === 'q' &&
                !e.ctrlKey && !e.metaKey && !e.altKey &&
                e.target.tagName !== 'INPUT' &&
                e.target.tagName !== 'TEXTAREA' &&
                !e.target.isContentEditable) {

                e.preventDefault();
                elements.smartInputContainer.style.display = 'block';
                elements.smartInput.focus();
            }

            // ESC: Close everything
            if (e.key === 'Escape') {
                if (!elements.blockModal.hidden) {
                    closeModal();
                } else if (elements.smartInputContainer.style.display !== 'none') {
                    elements.smartInputContainer.style.display = 'none';
                }
            }
        });

        // Grid Click Listener (Empty Slot -> Add Block)
        if (elements.timegrid) {
            elements.timegrid.addEventListener('click', handleGridClick);
            // Add touchend for devices that don't fire click well on divs
            elements.timegrid.addEventListener('touchend', (e) => {
                // Prevent ghost clicks if this fires handled
                // But we need to distinguish scroll/drag from tap.
                // Simple hack: check if it's a quick tap? 
                // For now, let's just try relying on click first, but if user says "not tappable",
                // maybe z-index or other overlays are blocking it.
                // Let's explicitly try to handle it if it was a direct tap on a slot.
                if (e.target.classList.contains('time-slot')) {
                    // e.preventDefault(); // Might block scrolling?
                    handleGridClick(e);
                }
            });
        }

        // Reload App Listener - Hard Reset
        if (elements.reloadAppBtn) {
            elements.reloadAppBtn.addEventListener('click', async () => {
                const btn = elements.reloadAppBtn;
                btn.disabled = true;
                const originalIcon = btn.innerHTML;
                btn.innerHTML = '...'; // Spinner/Wait

                try {
                    // console.log('Hyper Reload: Starting...');
                    // alert('Aktualizace...'); // Feedback for e-reader

                    // 1. Send SKIP_WAITING to any waiting worker
                    if ('serviceWorker' in navigator) {
                        const reg = await navigator.serviceWorker.getRegistration();
                        if (reg && reg.waiting) {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                    }

                    // 2. Unregister ALL Service Workers
                    if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (const registration of registrations) {
                            await registration.unregister();
                        }
                    }

                    // 3. Clear ALL Caches
                    if ('caches' in window) {
                        const keys = await caches.keys();
                        await Promise.all(keys.map(key => caches.delete(key)));
                    }

                    // 4. Force Reload with Search Param to bust browser cache
                    // alert('Hotovo. Restartuji...');
                    window.location.href = 'index.html?v=' + new Date().getTime();

                } catch (err) {
                    alert('Chyba aktualizace: ' + err.message);
                    window.location.reload();
                }
            });
        }
    }

    /**
     * Initialize dark/light mode
     */
    function initTheme() {
        // Default is dark mode (classes on body/html not needed for dark as it's default in CSS)
        // Check local storage for override
        const storedTheme = localStorage.getItem('theme');

        if (storedTheme === 'light') {
            document.body.classList.add('light-mode');
            document.body.classList.remove('dark-mode');
            if (elements.themeModeBtn) {
                elements.themeModeBtn.querySelector('.icon').textContent = '☀️';
            }
        } else {
            // Ensure dark mode
            document.body.classList.remove('light-mode');
            document.body.classList.add('dark-mode');
            if (elements.themeModeBtn) {
                elements.themeModeBtn.querySelector('.icon').textContent = '🌙';
            }
        }

        // Toggle Listener
        if (elements.themeModeBtn) {
            elements.themeModeBtn.addEventListener('click', () => {
                document.body.classList.toggle('light-mode');

                if (document.body.classList.contains('light-mode')) {
                    document.body.classList.remove('dark-mode');
                    localStorage.setItem('theme', 'light');
                    elements.themeModeBtn.querySelector('.icon').textContent = '☀️';
                } else {
                    document.body.classList.add('dark-mode');
                    localStorage.setItem('theme', 'dark');
                    elements.themeModeBtn.querySelector('.icon').textContent = '🌙';
                }
            });
        }
    }

    /**
     * Build the time grid HTML - Paper template style with table layout
     */
    function buildTimeGrid() {
        const grid = elements.timegrid;
        grid.innerHTML = '';

        // Create header row with time markers
        const header = document.createElement('div');
        header.className = 'timegrid-header';

        const headerLabel = document.createElement('div');
        headerLabel.className = 'timegrid-header-cell';
        headerLabel.textContent = '';
        header.appendChild(headerLabel);

        // Add :00, :15, :30, :45 headers
        [':00', ':15', ':30', ':45'].forEach(time => {
            const cell = document.createElement('div');
            cell.className = 'timegrid-header-cell';
            cell.textContent = time;
            header.appendChild(cell);
        });

        grid.appendChild(header);

        // Create rows for each hour
        for (let hour = TimeBlocks.GRID_START_HOUR; hour <= TimeBlocks.GRID_END_HOUR; hour++) {
            const row = document.createElement('div');
            row.className = 'timegrid-row';
            if (hour === 23) {
                row.classList.add('short-row');
            }
            row.dataset.hour = hour;

            // Time label cell
            const label = document.createElement('div');
            label.className = 'time-label';
            label.textContent = `${hour}`;
            row.appendChild(label);

            // Add 4 cells for each 15-minute slot
            for (let i = 0; i < 4; i++) {
                const slot = document.createElement('div');
                slot.className = 'time-slot';
                slot.dataset.time = `${String(hour).padStart(2, '0')}:${String(i * 15).padStart(2, '0')}`;
                row.appendChild(slot);
            }

            grid.appendChild(row);
        }
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Date navigation
        elements.prevDay.addEventListener('click', () => changeDate(-1));
        elements.nextDay.addEventListener('click', () => changeDate(1));
        // elements.todayBtn.addEventListener('click', goToToday); // Removed

        // Google sign in
        elements.googleSigninBtn.addEventListener('click', handleGoogleSignIn);
        elements.syncCalendarBtn.addEventListener('click', handleSyncCalendar);

        // Smart input
        elements.smartInput.addEventListener('input', handleSmartInputChange);
        elements.smartInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                addBlockFromInput();
            }
        });
        elements.addBlockBtn.addEventListener('click', addBlockFromInput);
        if (elements.headerAddBlockBtn) {
            elements.headerAddBlockBtn.addEventListener('click', toggleSmartInput);
        }

        // Block events
        document.addEventListener('blockMoved', handleBlockMoved);
        document.addEventListener('blockClicked', handleBlockClicked);

        // Modal events
        elements.blockForm.addEventListener('submit', handleBlockFormSubmit);
        elements.cancelModalBtn.addEventListener('click', closeModal);
        elements.deleteBlockBtn.addEventListener('click', handleDeleteBlock);
        elements.blockModal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

        // Category picker
        elements.categoryPicker.querySelectorAll('.category-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                elements.categoryPicker.querySelectorAll('.category-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !elements.blockModal.hidden) {
                closeModal();
            }
        });

        // Quick Sync
        const quickSyncBtn = document.getElementById('quick-sync-btn');
        if (quickSyncBtn) {
            quickSyncBtn.addEventListener('click', async () => {
                console.log('Quick Sync clicked');
                const icon = quickSyncBtn.querySelector('svg');
                if (icon) icon.classList.add('rotating');

                try {
                    await syncFromDrive();
                } catch (e) {
                    console.error('Quick sync failed:', e);
                } finally {
                    if (icon) icon.classList.remove('rotating');
                }
            });
        } else {
            console.error('Quick sync button not found in DOM');
        }

        // CLICK-TO-TIME: Handle clicks on empty slots
        if (elements.timegrid) {
            elements.timegrid.addEventListener('click', (e) => {
                // Ignore if clicked on a block (handled by block click listener)
                if (e.target.closest('.time-block-fill')) return;

                const slot = e.target.closest('.time-slot');
                if (slot) {
                    const time = slot.dataset.time;
                    if (time) {
                        // Open smart input
                        const container = document.querySelector('.smart-input-container');
                        if (container.style.display === 'none') {
                            container.style.display = 'block';
                        }

                        // Set value to time + space
                        elements.smartInput.value = `${time} `;
                        elements.smartInput.focus();

                        // Provide visual feedback (optional)
                        console.log(`Slot clicked: ${time}`);
                    }
                }
            });
        }

        // SYNC FIX: Auto-sync when app comes into foreground
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && Calendar.getSignedInStatus()) {
                console.log('App visible, checking for updates...');
                syncFromDrive();
            }
        });

        window.addEventListener('focus', () => {
            if (Calendar.getSignedInStatus()) {
                console.log('Window focused, checking for updates...');
                syncFromDrive();
            }
        });

        // Periodic Background Sync (Every 5 minutes)
        setInterval(() => {
            if (Calendar.getSignedInStatus() && document.visibilityState === 'visible') {
                console.log('Periodic sync check...');
                syncFromDrive();
            }
        }, 5 * 60 * 1000);

        // Force Grid Layout Calculation (The "Hammer" Fix)
        window.addEventListener('resize', adjustGridHeight);
        // Run slightly after load to ensure DOM is ready
        setTimeout(adjustGridHeight, 100);
        setTimeout(adjustGridHeight, 500);
        setTimeout(adjustGridHeight, 1000);
    }

    /**
     * Manually calculate and set row heights to fit screen exactly
     */
    function adjustGridHeight() {
        const header = document.querySelector('header');
        const inputContainer = document.querySelector('.smart-input-container'); // Might be hidden
        const gridHeader = document.querySelector('.timegrid-header');
        const appContainer = document.querySelector('.app-container');

        if (!header || !gridHeader || !appContainer) return;

        // Get available height
        // We use window.innerHeight to be sure, minus padding
        const totalHeight = window.innerHeight;

        // Measure fixed elements
        const headerHeight = header.offsetHeight;
        const gridHeaderHeight = gridHeader.offsetHeight;

        // Calculate style padding
        const style = window.getComputedStyle(appContainer);
        const paddingVertical = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);

        // Available space for 17 rows
        const availableSpace = totalHeight - headerHeight - gridHeaderHeight - paddingVertical - 2; // -2 for safety/borders

        // Calculate exact pixel height per row
        const rowHeight = availableSpace / 17;

        // Apply to CSS variable
        document.documentElement.style.setProperty('--js-row-height', `${rowHeight}px`);

        console.log(`Grid Height Adjusted: Total=${totalHeight}, Avail=${availableSpace}, Row=${rowHeight}`);
    }

    // Sync state
    let isSyncing = false;
    let saveTimeout = null;

    /**
     * Initialize Google Calendar / Drive
     */
    async function initCalendar() {
        try {
            await Calendar.init(async (isSignedIn) => {
                handleSignInChange(isSignedIn);
                if (isSignedIn) {
                    await syncFromDrive();
                }
            });
        } catch (error) {
            console.log('Google Calendar not available:', error.message);
        }
    }

    /**
     * Sync data from Drive
     */
    // Sync data from Drive
    // (removed invalid code block)


    async function syncFromDrive() {
        if (isSyncing) return null;
        isSyncing = true;
        showSyncStatus('Syncing...', 'normal');

        try {
            const remoteData = await Calendar.loadData();
            if (remoteData) {
                await Storage.importBackup(remoteData, false);
                console.log('Synced from Drive (Merged)');
                await loadDate(currentDate);
                showSyncStatus(`Synced`, 'success');
                return remoteData; // RETURN DATA
            } else {
                console.log('No remote data found');
                triggerAutoSave();
                return null;
            }
        } catch (e) {
            console.error('Sync failed', e);
            showSyncStatus('Sync Error', 'error');
            throw e; // RETHROW for handleSyncCalendar to catch
        } finally {
            isSyncing = false;
            setTimeout(hideSyncStatus, 3000);
        }
    }

    // ...

    /**
     * Handle manual calendar sync
     */
    async function handleSyncCalendar() {
        if (!Calendar.getSignedInStatus()) return;

        const btn = elements.syncCalendarBtn;
        btn.classList.add('rotating');

        try {

            // STEP 1: Pull AppData (tasks) - Merge remote changes
            const remoteData = await syncFromDrive();

            // STEP 1.5: Fetch Calendar Events for next 5 days (Offline Support)
            const daysToSync = 5;
            const today = new Date();
            let eventsSyncedCount = 0;

            for (let i = 0; i < daysToSync; i++) {
                const syncDate = new Date(today);
                syncDate.setDate(today.getDate() + i);
                const dateStr = formatDateStr(syncDate);

                // Fetch events
                const events = await Calendar.getEventsForDate(dateStr);

                // Save them to local storage as cached blocks
                // First, remove existing cached calendar blocks for this day to avoid stale data
                // We can't easily do that without clearing all... 
                // Instead, we just save these over.
                // Actually, duplicate gcal_ ids will just overwrite. 
                // But what about DELETED events? 
                // We should clear old gcal_ blocks for this date.

                const existingBlocks = await Storage.getBlocksByDate(dateStr);
                const staleCalendarBlocks = existingBlocks.filter(b => b.fromCalendar);
                for (const b of staleCalendarBlocks) {
                    await Storage.deleteBlock(b.id);
                }

                // Save new ones
                for (const event of events) {
                    await Storage.saveBlock(event);
                }
                eventsSyncedCount += events.length;
            }

            // STEP 2: Force Push Local Data - Ensure our changes are uploaded
            await triggerAutoSave(true);

            // STEP 3: Load events/local data for UI
            await loadDate(currentDate);

            // Get total local blocks for debug
            const exportData = await Storage.exportBackup();
            const localCount = exportData.blocks.length;

            // Check if we found any events
            const eventCount = calendarBlocks.length;

            // Debug info
            const remoteDebugInfo = remoteData && remoteData._debugFileId
                ? `\nFile: ...${remoteData._debugFileId.slice(-4)}`
                : '';
            const remoteBlockCount = remoteData && remoteData.blocks ? remoteData.blocks.length : 'N/A';

            alert(`Synchronizace OK!\n\n` +
                `Místní úkoly: ${localCount} (Remote: ${remoteBlockCount})\n` +
                `Kalendář: ${eventCount} dnes, ${eventsSyncedCount} na 5 dní\n` +
                remoteDebugInfo);
        } catch (error) {
            console.error('Sync failed:', error);

            // Extract detailed error message if available
            let errorMsg = 'Synchronizace selhala.';
            if (error.result && error.result.error && error.result.error.message) {
                errorMsg += '\nDetails: ' + error.result.error.message;
            } else if (error.message) {
                errorMsg += '\nError: ' + error.message;
            }

            alert(errorMsg + '\nZkuste se odhlásit a znovu přihlásit.');
        } finally {
            // Keep spinning a bit longer for visual feedback
            setTimeout(() => {
                btn.classList.remove('rotating');
            }, 500);
        }
    }

    /**
     * Trigger auto-save to Drive
     * @param {boolean} force - If true, skip debounce and save immediately
     */
    async function triggerAutoSave(force = false) {
        if (!Calendar.getSignedInStatus()) return;

        if (saveTimeout) clearTimeout(saveTimeout);
        showSyncStatus('Saving...', 'normal');

        const saveOperation = async () => {
            try {
                const data = await Storage.exportBackup();
                // Debug log
                console.log(`Saving ${data.blocks.length} blocks to Drive...`);

                await Calendar.saveData(data);
                showSyncStatus('Saved', 'success');
            } catch (e) {
                console.error('Save failed', e);
                // Handle auth errors gracefully
                if (e.status === 401 || e.status === 403) {
                    showSyncStatus('Sync Paused', 'warning');
                } else if (!navigator.onLine) {
                    showSyncStatus('Offline', 'warning');
                } else {
                    showSyncStatus('Save Error', 'error');
                }

                if (force) throw e; // RETHROW if forced so UI knows
            } finally {
                setTimeout(hideSyncStatus, 3000);
            }
        };

        if (force) {
            return saveOperation();
        } else {
            saveTimeout = setTimeout(saveOperation, 2000);
            return Promise.resolve();
        }
    }

    // Helper for visual feedback
    function showSyncStatus(msg, type) {
        let badge = document.getElementById('sync-status-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'sync-status-badge';
            badge.style.position = 'fixed';
            badge.style.bottom = '20px';
            badge.style.right = '20px';
            badge.style.padding = '8px 12px';
            badge.style.borderRadius = '20px';
            badge.style.fontSize = '12px';
            badge.style.fontWeight = '500';
            badge.style.zIndex = '1000';
            badge.style.transition = 'opacity 0.3s';
            document.body.appendChild(badge);
        }

        badge.textContent = msg;
        badge.style.opacity = '1';

        if (type === 'error') {
            badge.style.backgroundColor = 'var(--color-danger)';
            badge.style.color = '#fff';
        } else if (type === 'success') {
            badge.style.backgroundColor = 'var(--color-success)';
            badge.style.color = '#fff';
        } else {
            badge.style.backgroundColor = 'var(--color-surface)';
            badge.style.color = 'var(--color-text)';
            badge.style.border = '1px solid var(--color-border)';
        }
    }

    function hideSyncStatus() {
        const badge = document.getElementById('sync-status-badge');
        if (badge) badge.style.opacity = '0';
    }

    /**
     * Sync data FROM Drive (Manual Pull)
     */
    async function syncFromDrive() {
        if (!Calendar.getSignedInStatus()) {
            alert('Pro synchronizaci se musíte přihlásit.');
            return;
        }

        const btn = elements.quickSyncBtn;
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="icon">⇄</span>'; // Two-way arrow
        showSyncStatus('Syncing...', 'normal');

        try {
            // 1. Load data from Drive (Remote)
            const remoteData = await Calendar.loadData();

            // 2. Load data from Local
            const localData = await Storage.exportBackup();

            // 3. Merge Strategies
            // Rule: Union of IDs. If ID exists in both, prefer LOCAL (assuming user is active here).
            // This prevents overwriting local work with old remote data, 
            // BUT it also brings in missing remote items (from other device).
            // Trade-off: Deletions on other device might "re-appear" if they still exist locally.

            let mergedBlocks = [];
            let mergedSettings = [];
            let mergedHidden = {};

            if (!remoteData) {
                // Nothing on Drive? Just push Local.
                mergedBlocks = localData.blocks;
                mergedSettings = localData.settings;
                mergedHidden = localData.hiddenRoutines;
            } else {
                // Blocks Merge
                const blockMap = new Map();
                // Add Remote first
                if (remoteData.blocks) remoteData.blocks.forEach(b => blockMap.set(b.id, b));
                // Overlay Local (Local Wins on conflict)
                if (localData.blocks) localData.blocks.forEach(b => blockMap.set(b.id, b));
                mergedBlocks = Array.from(blockMap.values());

                // Settings Merge (Local Wins)
                const settingMap = new Map();
                if (remoteData.settings) remoteData.settings.forEach(s => settingMap.set(s.key, s));
                if (localData.settings) localData.settings.forEach(s => settingMap.set(s.key, s));
                mergedSettings = Array.from(settingMap.values());

                // Hidden Routines Merge
                mergedHidden = { ...remoteData.hiddenRoutines, ...localData.hiddenRoutines };
            }

            const mergedData = {
                blocks: mergedBlocks,
                settings: mergedSettings,
                hiddenRoutines: mergedHidden,
                timestamp: Date.now()
            };

            // 4. Push MERGED data back to Drive (so other device gets my changes + I keep theirs)
            await Calendar.saveData(mergedData);

            // 5. Update Local Storage with MERGED data
            await Storage.importBackup(mergedData, true); // Overwrite local with the Union

            // 6. Reload UI
            await loadDate(currentDate);
            updateCurrentTimeIndicator();

            showSyncStatus('Synced (Merged)', 'success');
        } catch (e) {
            console.error('Sync failed', e);
            showSyncStatus('Sync Failed', 'error');
            alert('Chyba synchronizace: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            setTimeout(hideSyncStatus, 2000);
        }
    }

    /**
     * Handle Google sign in/out state change
     */
    function handleSignInChange(signedIn) {
        const btn = elements.googleSigninBtn;
        // ... (rest of logic same as before but ensured here)
        if (signedIn) {
            btn.innerHTML = `
                <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#34A853" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                </svg>
                <span>Připojeno</span>
            `;
            btn.classList.add('connected');
            loadDate(currentDate);
            elements.syncCalendarBtn.hidden = false;
        } else {
            btn.innerHTML = `
                <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Přihlásit se</span>
            `;
            btn.classList.remove('connected');
            elements.syncCalendarBtn.hidden = true;
        }
    }

    /**
     * Handle Google sign in button click
     */
    function handleGoogleSignIn() {
        if (Calendar.getSignedInStatus()) {
            Calendar.signOut();
        } else {
            Calendar.signIn();
        }
    }

    // DEBUG BUTTON LISTENER
    // DEBUG BUTTON LISTENER
    // DEBUG BUTTON LISTENER
    const debugBtn = document.getElementById('debug-btn-fixed') || document.getElementById('debug-btn');
    if (debugBtn) {
        debugBtn.addEventListener('click', async () => {
            if (!Calendar.getSignedInStatus()) {
                alert('Not signed in (Calendar.getSignedInStatus() is false)');
                return;
            }

            try {
                // 1. Check GAPI
                if (!gapi || !gapi.client || !gapi.client.calendar) {
                    throw new Error('GAPI Calendar client not loaded');
                }

                alert(`DEBUG V67: Starting Fetch...`);

                // 2. Try to List Calendars
                let calendars = [];
                try {
                    const calList = await gapi.client.calendar.calendarList.list({ minAccessRole: 'reader' });
                    calendars = calList.result.items || [];
                    let msg = `Found ${calendars.length} calendars:\n`;
                    calendars.forEach(c => msg += `- ${c.summary}\n`);
                    alert(msg);
                } catch (calListErr) {
                    const errStr = typeof calListErr === 'object' ? JSON.stringify(calListErr) : String(calListErr);
                    alert(`List Calendars Failed: ${errStr}\n\nTrying 'primary' fallback...`);
                    calendars = [{ id: 'primary', summary: 'Primary' }];
                }

                // 3. Fetch Events for Tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                // Force full day range
                const timeMin = new Date(tomorrow); timeMin.setHours(0, 0, 0, 0);
                const timeMax = new Date(tomorrow); timeMax.setHours(23, 59, 59, 999);

                alert(`Fetching events for ${timeMin.toISOString()}...`);

                let allEvents = [];
                for (const cal of calendars) {
                    try {
                        const res = await gapi.client.calendar.events.list({
                            calendarId: cal.id,
                            timeMin: timeMin.toISOString(),
                            timeMax: timeMax.toISOString(),
                            singleEvents: true,
                            orderBy: 'startTime'
                        });
                        const items = res.result.items || [];
                        if (items.length > 0) {
                            alert(`Found ${items.length} in ${cal.summary}`);
                            allEvents.push(...items);
                        }
                    } catch (evErr) {
                        console.error(evErr);
                    }
                }

                if (allEvents.length === 0) {
                    alert('Zero events found across all calendars.');
                } else {
                    alert(`Total Events Tomorrow: ${allEvents.length}\nFirst: ${allEvents[0].summary}`);
                }

            } catch (e) {
                const msg = e.message || JSON.stringify(e);
                alert(`CRITICAL ERROR:\n${msg}`);
                console.error(e);
            }
        });
    }

    /**
     * Handle manual calendar sync
     */
    async function handleSyncCalendar() {
        if (!Calendar.getSignedInStatus()) return;

        const btn = elements.syncCalendarBtn;
        btn.classList.add('rotating');

        try {
            // STEP 1: Pull AppData (tasks) - Merge remote changes
            const remoteData = await syncFromDrive();

            // STEP 2: Force Push Local Data - Ensure our changes are uploaded
            await triggerAutoSave(true);

            // STEP 3: Load events/local data for UI
            await loadDate(currentDate);

            // Get total local blocks for debug
            const exportData = await Storage.exportBackup();
            const localCount = exportData.blocks.length;

            // Check if we found any events
            const eventCount = calendarBlocks.length;

            // Debug info
            const remoteDebugInfo = remoteData && remoteData._debugFileId
                ? `\nFile: ...${remoteData._debugFileId.slice(-4)}`
                : '';
            const remoteBlockCount = remoteData && remoteData.blocks ? remoteData.blocks.length : 'N/A';

            alert(`Synchronizace OK!\n\n` +
                `Místní úkoly: ${localCount} (Remote: ${remoteBlockCount})\n` +
                `Kalendář: ${eventCount} událostí` +
                remoteDebugInfo);
        } catch (error) {
            console.error('Sync failed:', error);

            // Extract detailed error message if available
            let errorMsg = 'Synchronizace selhala.';
            if (error.result && error.result.error && error.result.error.message) {
                errorMsg += '\nDetails: ' + error.result.error.message;
            } else if (error.message) {
                errorMsg += '\nError: ' + error.message;
            }

            alert(errorMsg + '\nZkuste se odhlásit a znovu přihlásit.');
        } finally {
            // Keep spinning a bit longer for visual feedback
            setTimeout(() => {
                btn.classList.remove('rotating');
            }, 500);
        }
    }

    /**
     * Load data for a specific date
     */
    async function loadDate(date) {
        currentDate = date;
        updateDateDisplay();

        const dateStr = formatDateStr(date);

        // Load routine blocks (appear every day)
        routineBlocks = Routines.getRoutinesForDate(dateStr);

        // Load local blocks (user-created + cached calendar)
        const allLocalBlocks = await Storage.getBlocksByDate(dateStr);

        // Load live calendar events
        calendarBlocks = await Calendar.getEventsForDate(dateStr);

        // Deduplication Logic:
        // If we successfully fetched live events (calendarBlocks is not empty), use them.
        // If live fetch failed or returned nothing (but we might be offline), we want to show cached.
        // Problem: If user has 0 events today, calendarBlocks is empty -> we might show stale cache.
        // Solution: If we are SIGNED IN and ONLINE, we trust live data (even if empty).
        // But getEventsForDate returns [] on error too.
        // Let's rely on IDs.

        const liveIds = new Set(calendarBlocks.map(b => b.id));

        // Filter local blocks:
        // 1. Keep all user blocks (!fromCalendar)
        // 2. Keep cached calendar blocks ONLY if they are NOT in live list AND we suspect we are offline.
        // Actually, simplest robust approach:
        // - Always show User Blocks
        // - Always show Live Calendar Blocks
        // - Show Cached Calendar Blocks ONLY if they are not in Live list.

        localBlocks = allLocalBlocks.filter(b => {
            if (!b.fromCalendar) return true; // Keep user blocks

            // It's a cached calendar block.
            // If we display it, we might duplicate it if live list has it too (but IDs match).
            // If IDs match, `blocks` array merge later might handle it?
            // `blocks` is just an array. If we have two objects with same ID, TimeBlocks.render might get confused or render both.
            // TimeBlocks.render doesn't deduplicate by ID.
            return !liveIds.has(b.id);
        });

        // Combine all blocks (filtering routines that overlap calendar/are hidden)
        blocks = [...getFilteredRoutines(), ...localBlocks, ...calendarBlocks];
        renderBlocks();
    }

    /**
     * Filter routines: remove those overlapping calendar events or hidden by user
     */
    function getFilteredRoutines() {
        const dateStr = formatDateStr(currentDate);
        const hiddenRoutineIds = getHiddenRoutines(dateStr);
        return routineBlocks.filter(routine => {
            if (hiddenRoutineIds.includes(routine.id)) return false;
            const overlapsCalendar = calendarBlocks.some(cal => {
                return cal.startTime < routine.endTime && cal.endTime > routine.startTime;
            });
            return !overlapsCalendar;
        });
    }

    /**
     * Render all blocks
     */
    function renderBlocks() {
        // Render main grid
        TimeBlocks.render(blocks);

        // Render all-day events
        // calendarBlocks is a global variable updated in loadDate
        if (calendarBlocks && calendarBlocks.allDayEvents) {
            TimeBlocks.renderAllDay(calendarBlocks.allDayEvents);
        } else {
            TimeBlocks.renderAllDay([]);
        }
    }

    /**
     * Update the date display
     */
    function updateDateDisplay() {
        // Simple compact date: "Po 12. 1."
        const options = { weekday: 'short', day: 'numeric', month: 'numeric' };
        // Year is optional in compact view
        elements.currentDate.textContent = currentDate.toLocaleDateString('cs-CZ', options);
        if (elements.currentYear) {
            elements.currentYear.textContent = currentDate.getFullYear();
        }
    }

    /**
     * Toggle smart input visibility
     */
    function toggleSmartInput() {
        const container = document.querySelector('.smart-input-container');
        if (getComputedStyle(container).display === 'none') {
            container.style.display = 'block';
            elements.smartInput.focus();
        } else {
            container.style.display = 'none';
        }
    }

    /**
     * Change date by delta days
     */
    function changeDate(delta) {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + delta);
        loadDate(newDate);
    }

    /**
     * Go to today
     */
    function goToToday() {
        loadDate(new Date());
    }

    /**
     * Format date to YYYY-MM-DD
     */
    function formatDateStr(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Handle smart input changes
     */
    function handleSmartInputChange() {
        const input = elements.smartInput.value;

        if (!input.trim()) {
            elements.inputFeedback.textContent = '';
            elements.inputFeedback.className = 'input-feedback'; // remove active
            return;
        }

        const preview = SmartInput.getPreview(input);

        elements.inputFeedback.textContent = preview.text;
        elements.inputFeedback.className = 'input-feedback active' + (preview.isError ? ' error' : ' success');
    }

    /**
     * Add block from smart input
     */
    async function addBlockFromInput() {
        const input = elements.smartInput.value;
        const parsed = SmartInput.parse(input);

        if (!parsed) {
            elements.inputFeedback.textContent = 'Nerozpoznán čas. Zkuste např. "Meeting v 14:00 na 1 hodinu"';
            elements.inputFeedback.className = 'input-feedback active error';
            return;
        }

        const block = {
            id: Storage.generateId(),
            date: formatDateStr(currentDate),
            title: parsed.title,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            category: parsed.category,
            fromCalendar: false,
            // Assign random color for tasks (work category)
            customColor: parsed.category === 'work' ? TASK_PALETTE[Math.floor(Math.random() * TASK_PALETTE.length)] : null
        };

        await Storage.saveBlock(block);
        localBlocks.push(block);
        blocks = [...getFilteredRoutines(), ...localBlocks, ...calendarBlocks];
        renderBlocks();

        // Clear input
        elements.smartInput.value = '';
        elements.inputFeedback.textContent = `✓ Přidáno: ${block.title}`;
        elements.inputFeedback.className = 'input-feedback active success';

        // Clear feedback after 2 seconds
        setTimeout(() => {
            elements.inputFeedback.textContent = '';
        }, 2000);
    }

    /**
     * Handle block moved event
     */
    async function handleBlockMoved(e) {
        const { blockId, startTime, endTime } = e.detail;

        // Find the block
        const block = blocks.find(b => b.id === blockId);
        if (!block || block.fromCalendar) return;

        if (block.isRoutine) {
            // Hide original routine, create local copy at new time
            hideRoutine(formatDateStr(currentDate), block.id);

            const newBlock = {
                id: Storage.generateId(),
                date: formatDateStr(currentDate),
                title: block.title,
                startTime: startTime,
                endTime: endTime,
                category: block.category,
                notes: block.notes || '',
                fromCalendar: false
            };
            await Storage.saveBlock(newBlock);
            localBlocks.push(newBlock);
            await loadDate(currentDate);
            triggerAutoSave();
            return;
        }

        // Regular block - just update
        block.startTime = startTime;
        block.endTime = endTime;

        await Storage.saveBlock(block);
        await loadDate(currentDate);
        triggerAutoSave();
    }

    /**
     * Handle block clicked event
     */
    function handleBlockClicked(e) {
        const { blockId } = e.detail;
        const block = blocks.find(b => b.id === blockId);

        if (block) {
            openModal(block);
        }
    }

    /**
     * Handle click on empty time slot -> Open Add Modal
     */
    function handleGridClick(e) {
        // Find the closest time-slot
        const slot = e.target.closest('.time-slot');
        if (!slot) return;

        // Ignore if it has a block (handled by block click)
        if (slot.classList.contains('has-block') || slot.querySelector('.time-block-fill')) {
            // Check if we actually clicked the FILL element (block) vs just the slot background
            // If we clicked the slot background (e.g. padding?), we might want to create? 
            // But usually fill covers most. 
            // Let's assume if it has a block, we don't create new.
            return;
        }

        // Get time from row and slot index
        const row = slot.closest('.time-grid-row');
        if (!row) return;

        const hour = parseInt(row.dataset.hour);
        const allSlots = Array.from(row.querySelectorAll('.time-slot'));
        const slotIndex = allSlots.indexOf(slot);

        if (isNaN(hour) || slotIndex === -1) return;

        // Calculate Start Time (HH:mm)
        const minutes = slotIndex * 15;
        const startString = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

        // Calculate End Time (Start + 15m)
        const endData = new Date();
        endData.setHours(hour, minutes + 15, 0, 0);
        const endString = `${String(endData.getHours()).padStart(2, '0')}:${String(endData.getMinutes()).padStart(2, '0')}`;

        // Create dummy block for Modal
        const newBlock = {
            id: null, // New block
            title: '',
            startTime: startString,
            endTime: endString,
            category: 'work', // Default
            notes: '',
            fromCalendar: false
        };

        openModal(newBlock);
    }

    /**
     * Open the block edit modal
     */
    function openModal(block) {
        editingBlockId = block.id;

        elements.blockTitle.value = block.title;
        // Ensure strictly HH:mm (24h) for input type="time"
        elements.blockStart.value = block.startTime;
        elements.blockEnd.value = block.endTime;
        elements.blockNotes.value = block.notes || '';

        // Set category (Hidden in UI now, but we keep logic to avoid errors)
        const buttons = elements.categoryPicker.querySelectorAll('.category-btn');
        if (buttons.length > 0) {
            buttons.forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.category === block.category);
            });
        }

        // Hide delete button for calendar events only
        elements.deleteBlockBtn.style.display = block.fromCalendar ? 'none' : 'block';

        // Disable form for calendar events only
        const isCalendarEvent = block.fromCalendar;
        elements.blockTitle.disabled = isCalendarEvent;
        elements.blockStart.disabled = isCalendarEvent;
        elements.blockEnd.disabled = isCalendarEvent;
        // Elements disabled for category picker unnecessary if hidden
        elements.categoryPicker.querySelectorAll('.category-btn').forEach(btn => {
            btn.disabled = isCalendarEvent;
        });

        elements.blockModal.hidden = false;
    }

    /**
     * Close the modal
     */
    function closeModal() {
        elements.blockModal.hidden = true;
        editingBlockId = null;
    }

    /**
     * Handle block form submit
     */
    async function handleBlockFormSubmit(e) {
        e.preventDefault();

        const block = blocks.find(b => b.id === editingBlockId);
        if (!block || block.fromCalendar) {
            closeModal();
            return;
        }

        if (block.isRoutine) {
            // For routines: hide the original, create a new local block with changes
            hideRoutine(formatDateStr(currentDate), block.id);

            const newBlock = {
                id: Storage.generateId(),
                date: formatDateStr(currentDate),
                title: elements.blockTitle.value,
                startTime: elements.blockStart.value,
                endTime: elements.blockEnd.value,
                notes: elements.blockNotes.value,
                category: block.category,
                fromCalendar: false
            };
            const selectedCategory = elements.categoryPicker.querySelector('.category-btn.selected');
            if (selectedCategory) newBlock.category = selectedCategory.dataset.category;

            await Storage.saveBlock(newBlock);
            localBlocks.push(newBlock);
            await loadDate(currentDate);
            triggerAutoSave();
            closeModal();
            return;
        }

        // Update regular block
        block.title = elements.blockTitle.value;
        block.startTime = elements.blockStart.value;
        block.endTime = elements.blockEnd.value;
        block.notes = elements.blockNotes.value;

        const selectedCategory = elements.categoryPicker.querySelector('.category-btn.selected');
        if (selectedCategory) {
            block.category = selectedCategory.dataset.category;
        }

        await Storage.saveBlock(block);
        renderBlocks();
        triggerAutoSave();
        closeModal();
    }

    /**
     * Handle delete block
     */
    async function handleDeleteBlock() {
        const block = blocks.find(b => b.id === editingBlockId);
        if (!block || block.fromCalendar) {
            closeModal();
            return;
        }

        if (block.isRoutine) {
            // Hide routine for this day
            hideRoutine(formatDateStr(currentDate), block.id);
            await loadDate(currentDate);
            closeModal();
            return;
        }

        await Storage.deleteBlock(block.id);
        localBlocks = localBlocks.filter(b => b.id !== block.id);
        await loadDate(currentDate);
        triggerAutoSave();
        closeModal();
    }

    /**
     * Get hidden routine IDs for a date
     */
    function getHiddenRoutines(dateStr) {
        try {
            return JSON.parse(localStorage.getItem('hiddenRoutines_' + dateStr) || '[]');
        } catch {
            return [];
        }
    }

    /**
     * Hide a routine for a specific date
     */
    function hideRoutine(dateStr, routineId) {
        const hidden = getHiddenRoutines(dateStr);
        if (!hidden.includes(routineId)) {
            hidden.push(routineId);
            localStorage.setItem('hiddenRoutines_' + dateStr, JSON.stringify(hidden));
            triggerAutoSave(); // Trigger sync
        }
    }

    /**
     * Update current time indicator - VERTICAL line based on current time
     */
    function updateCurrentTimeIndicator() {
        // Remove existing indicator
        const existing = document.querySelector('.current-time-indicator');
        if (existing) existing.remove();

        // Only show for today
        const today = new Date();
        if (formatDateStr(today) !== formatDateStr(currentDate)) return;

        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Only show during grid hours
        if (hours < TimeBlocks.GRID_START_HOUR || hours > TimeBlocks.GRID_END_HOUR) return;

        // Find the current hour row
        const currentRow = elements.timegrid.querySelector(`[data-hour="${hours}"]`);
        if (!currentRow) return;

        const slotCells = currentRow.querySelectorAll('.time-slot');
        if (slotCells.length === 0) return;

        const cellWidth = slotCells[0].offsetWidth;

        // Clean up previous highlights
        elements.timegrid.querySelectorAll('.time-label.current-hour-label')
            .forEach(el => el.classList.remove('current-hour-label'));

        // Highlight current label
        const currentLabel = currentRow.querySelector('.time-label');
        if (currentLabel) currentLabel.classList.add('current-hour-label');

        // Calculate position within the row
        const slotIndex = Math.floor(minutes / 15); // 0-3
        const minutesInSlot = minutes % 15;
        const percentInSlot = minutesInSlot / 15;

        // Left position relative to the time label = (slot index + percent in slot) * cell width
        const leftPosition = (slotIndex + percentInSlot) * cellWidth;

        const indicator = document.createElement('div');
        indicator.className = 'current-time-indicator';
        indicator.style.left = `${leftPosition}px`;

        // Format time for badge (e.g. "14:25")
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        indicator.setAttribute('data-time', timeString);

        // Check for underlying block to switch contrast
        // Blocks are typically .time-block-fill inside the slot
        const currentSlot = slotCells[slotIndex];
        const hasBlock = currentSlot.querySelector('.time-block-fill') || currentSlot.classList.contains('has-block');

        if (hasBlock) {
            indicator.classList.add('contrast-mode');
        }

        // Logic to flip block title if time is "above" (obscuring) it
        // The title is only in the first cell of the block.
        // If currentSlot HAS a .block-title, we are in the first cell.
        const blockFill = currentSlot.querySelector('.time-block-fill');
        if (blockFill) {
            const titleEl = blockFill.querySelector('.block-title');
            if (titleEl) {
                // If we are in the first 0-10 minutes of the slot (Left side), move title to Right
                // If we are past 10 minutes (Right side), keep/move title to Left
                if (minutesInSlot < 11) {
                    blockFill.style.justifyContent = 'flex-end';
                    blockFill.style.textAlign = 'right'; // For text alignment
                    // Remove right margin, add left margin
                    titleEl.style.marginRight = '0';
                    titleEl.style.marginLeft = 'var(--spacing-xs)';
                } else {
                    // Reset to default
                    blockFill.style.justifyContent = 'flex-start';
                    blockFill.style.textAlign = 'left';
                    titleEl.style.marginRight = 'var(--spacing-xs)';
                    titleEl.style.marginLeft = '0';
                }
            }
        }

        // Append to the row's slot area (after the time label)
        currentRow.style.position = 'relative';
        currentRow.appendChild(indicator);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
