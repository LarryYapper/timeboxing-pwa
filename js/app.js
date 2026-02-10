/**
 * app.js - Main application logic
 */

(function () {
    // State
    let currentDate = new Date();
    let blocks = []; // Combined routines + local + calendar blocks
    let routineBlocks = [];
    let localBlocks = [];
    let calendarBlocks = [];
    let editingBlockId = null;

    // DOM Elements
    const elements = {
        currentDate: document.getElementById('current-date'),
        currentYear: document.getElementById('current-year'),
        prevDay: document.getElementById('prev-day'),
        nextDay: document.getElementById('next-day'),
        todayBtn: document.getElementById('today-btn'),
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
        themeToggle: document.getElementById('theme-toggle'),
    };

    /**
     * Initialize the application
     */
    async function init() {
        // Initialize storage
        await Storage.init();

        // Build the time grid
        buildTimeGrid();

        // Initialize time blocks system - pass the grid element directly
        TimeBlocks.init(elements.timegrid);

        // Initialize theme
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
    }

    /**
     * Initialize dark/light theme toggle
     */
    function initTheme() {
        const saved = localStorage.getItem('theme');
        if (saved === 'light') {
            document.body.classList.add('light-mode');
            document.body.classList.remove('dark-mode');
            if (elements.themeToggle) elements.themeToggle.textContent = '☀️';
        } else if (saved === 'dark') {
            document.body.classList.add('dark-mode');
            document.body.classList.remove('light-mode');
            if (elements.themeToggle) elements.themeToggle.textContent = '🌙';
        }

        if (elements.themeToggle) {
            elements.themeToggle.addEventListener('click', () => {
                const isLight = document.body.classList.contains('light-mode');
                if (isLight) {
                    document.body.classList.remove('light-mode');
                    document.body.classList.add('dark-mode');
                    localStorage.setItem('theme', 'dark');
                    elements.themeToggle.textContent = '🌙';
                } else {
                    document.body.classList.add('light-mode');
                    document.body.classList.remove('dark-mode');
                    localStorage.setItem('theme', 'light');
                    elements.themeToggle.textContent = '☀️';
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
        elements.todayBtn.addEventListener('click', goToToday);

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
    async function syncFromDrive() {
        if (isSyncing) return;
        isSyncing = true;
        showSyncStatus('Syncing...', 'normal');

        try {
            const remoteData = await Calendar.loadData();
            if (remoteData) {
                await Storage.importBackup(remoteData, true);
                console.log('Synced from Drive');
                await loadDate(currentDate); // Reload UI
                showSyncStatus('Synced', 'success');
            } else {
                console.log('No remote data found, first sync?');
                triggerAutoSave();
            }
        } catch (e) {
            console.error('Sync failed', e);
            showSyncStatus('Sync Error', 'error');
        } finally {
            isSyncing = false;
            setTimeout(hideSyncStatus, 3000);
        }
    }

    /**
     * Trigger auto-save to Drive
     */
    function triggerAutoSave() {
        if (!Calendar.getSignedInStatus()) return;

        if (saveTimeout) clearTimeout(saveTimeout);
        showSyncStatus('Saving...', 'normal');

        saveTimeout = setTimeout(async () => {
            try {
                const data = await Storage.exportBackup();
                await Calendar.saveData(data);
                showSyncStatus('Saved', 'success');
            } catch (e) {
                console.error('Save failed', e);
                showSyncStatus('Save Error', 'error');
            } finally {
                setTimeout(hideSyncStatus, 3000);
            }
        }, 2000);
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

    /**
     * Handle manual calendar sync
     */
    async function handleSyncCalendar() {
        if (!Calendar.getSignedInStatus()) return;

        const btn = elements.syncCalendarBtn;
        btn.classList.add('rotating');

        try {
            await loadDate(currentDate);
            // Check if we found any events
            const eventCount = calendarBlocks.length;
            if (eventCount > 0) {
                alert(`Synchronizace dokončena. Nalezeno ${eventCount} událostí.`);
            } else {
                alert('Synchronizace dokončena, ale pro tento den nebyly nalezeny žádné události.');
            }
        } catch (error) {
            console.error('Sync failed:', error);
            alert('Synchronizace selhala. Zkuste se odhlásit a znovu přihlásit.');
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

        // Load local blocks (user-created)
        localBlocks = await Storage.getBlocksByDate(dateStr);

        // Load calendar events
        calendarBlocks = await Calendar.getEventsForDate(dateStr);

        // Filter out routines that overlap with calendar events (calendar takes priority)
        // Also filter out routines hidden by user for this day
        const hiddenRoutineIds = getHiddenRoutines(dateStr);
        const filteredRoutines = routineBlocks.filter(routine => {
            if (hiddenRoutineIds.includes(routine.id)) return false;
            const overlapsCalendar = calendarBlocks.some(cal => {
                return cal.startTime < routine.endTime && cal.endTime > routine.startTime;
            });
            return !overlapsCalendar;
        });

        // Combine all blocks
        blocks = [...filteredRoutines, ...localBlocks, ...calendarBlocks];
        renderBlocks();
    }

    /**
     * Render all blocks
     */
    function renderBlocks() {
        const container = elements.timegrid.querySelector('.blocks-container');
        TimeBlocks.render(blocks);
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
        const preview = SmartInput.getPreview(input);

        elements.inputFeedback.textContent = preview.text;
        elements.inputFeedback.className = 'input-feedback' + (preview.isError ? ' error' : ' success');
    }

    /**
     * Add block from smart input
     */
    async function addBlockFromInput() {
        const input = elements.smartInput.value;
        const parsed = SmartInput.parse(input);

        if (!parsed) {
            elements.inputFeedback.textContent = 'Nerozpoznán čas. Zkuste např. "Meeting v 14:00 na 1 hodinu"';
            elements.inputFeedback.className = 'input-feedback error';
            return;
        }

        const block = {
            id: Storage.generateId(),
            date: formatDateStr(currentDate),
            title: parsed.title,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            category: parsed.category,
            fromCalendar: false
        };

        await Storage.saveBlock(block);
        localBlocks.push(block);
        blocks = [...routineBlocks, ...localBlocks, ...calendarBlocks];
        renderBlocks();

        // Clear input
        elements.smartInput.value = '';
        elements.inputFeedback.textContent = `✓ Přidáno: ${block.title}`;
        elements.inputFeedback.className = 'input-feedback success';

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
     * Open the block edit modal
     */
    function openModal(block) {
        editingBlockId = block.id;

        elements.blockTitle.value = block.title;
        elements.blockStart.value = block.startTime;
        elements.blockEnd.value = block.endTime;
        elements.blockNotes.value = block.notes || '';

        // Set category
        elements.categoryPicker.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.category === block.category);
        });

        // Hide delete button for calendar events only
        elements.deleteBlockBtn.style.display = block.fromCalendar ? 'none' : 'block';

        // Disable form for calendar events only
        const isCalendarEvent = block.fromCalendar;
        elements.blockTitle.disabled = isCalendarEvent;
        elements.blockStart.disabled = isCalendarEvent;
        elements.blockEnd.disabled = isCalendarEvent;
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

        // Calculate position within the row
        const slotIndex = Math.floor(minutes / 15); // 0-3
        const minutesInSlot = minutes % 15;
        const percentInSlot = minutesInSlot / 15;

        // Left position relative to the time label = (slot index + percent in slot) * cell width
        const leftPosition = (slotIndex + percentInSlot) * cellWidth;

        const indicator = document.createElement('div');
        indicator.className = 'current-time-indicator';
        indicator.style.left = `${leftPosition}px`;

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
