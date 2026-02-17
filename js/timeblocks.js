/**
 * timeblocks.js - Interactive time blocks for table grid layout
 * Blocks are placed inside table cells using per-cell fills (no cross-cell overflow)
 */

const TimeBlocks = (function () {
    const GRID_START_HOUR = 7;
    const GRID_END_HOUR = 23;
    const SLOTS_PER_HOUR = 4; // 15-minute slots
    const TOTAL_SLOTS = (GRID_END_HOUR - GRID_START_HOUR + 1) * SLOTS_PER_HOUR;

    let gridElement = null;
    let currentBlocks = [];

    // Google Calendar logo colors (Darker for e-ink contrast)
    const CALENDAR_COLORS = ['#1558b0', '#c5221f', '#f9ab00', '#137333'];

    // User Task Palette (Optimized for E-ink)
    const TASK_PALETTE = [
        '#B22B3A', // Focus (Red - Dark)
        '#11326B', // Admin (Dark Blue)
        '#326663', // Creative (Dark Teal)
        '#724431', // Other (Dark Brown)
        '#090909', // Deep Work (Black)
        '#e37400'  // Energy (Darker Orange for white paper contrast)
    ];

    /**
     * Initialize the time blocks system
     */
    function init(grid) {
        gridElement = grid;
    }

    /**
     * Convert time string to slot index (0-based from GRID_START_HOUR)
     */
    function timeToSlotIndex(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const hourOffset = hours - GRID_START_HOUR;
        const slotInHour = Math.floor(minutes / 15);
        return hourOffset * SLOTS_PER_HOUR + slotInHour;
    }

    /**
     * Convert slot index to time string
     */
    function slotIndexToTime(index) {
        const hourOffset = Math.floor(index / SLOTS_PER_HOUR);
        const slotInHour = index % SLOTS_PER_HOUR;
        const hours = GRID_START_HOUR + hourOffset;
        const minutes = slotInHour * 15;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }

    /**
     * Calculate number of 15-minute slots a block spans
     */
    function getBlockSlotCount(block) {
        const startSlot = timeToSlotIndex(block.startTime);
        const endSlot = timeToSlotIndex(block.endTime);
        return Math.max(1, endSlot - startSlot);
    }

    /**
     * Get hour and slot-in-hour from time string
     */
    function getTimePosition(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return {
            hour: hours,
            slot: Math.floor(minutes / 15) // 0-3
        };
    }

    /**
     * Render all blocks into the grid cells
     */
    function render(blocks) {
        if (!gridElement) return;
        currentBlocks = blocks;

        // Clear all existing block content from cells
        const allSlots = gridElement.querySelectorAll('.time-slot');
        allSlots.forEach(slot => {
            slot.innerHTML = '';
            slot.classList.remove('has-block', 'block-start', 'block-middle', 'block-end');
            slot.removeAttribute('data-block-id');
            slot.removeAttribute('data-category');
            slot.style.backgroundColor = '';
        });

        // Assign Google Calendar colors to calendar events
        assignCalendarColors(blocks);

        // Compute overlap lanes before rendering
        const lanes = computeOverlapLanes(blocks);

        // Sort: routines/calendar first, then user tasks
        const sortedBlocks = [...blocks].sort((a, b) => {
            const aWeight = (a.isRoutine || a.fromCalendar) ? 0 : 1;
            const bWeight = (b.isRoutine || b.fromCalendar) ? 0 : 1;
            if (aWeight !== bWeight) return aWeight - bWeight;
            return a.startTime.localeCompare(b.startTime);
        });

        // Place each block with lane info
        sortedBlocks.forEach(block => {
            placeBlockInCells(block, lanes[block.id]);
        });
    }

    /**
     * Assign Google Calendar colors to calendar events.
     * Uses graph-coloring: each event gets a color different from all touching/overlapping events.
     */
    function assignCalendarColors(blocks) {
        const calEvents = blocks
            .filter(b => b.fromCalendar)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        // Assign colors one by one, checking all already-colored neighbors
        calEvents.forEach((block, idx) => {
            // Find all calendar events that touch or overlap this one
            // (touch = endTime of one equals startTime of another)
            const neighborColors = [];
            for (let j = 0; j < idx; j++) {
                const other = calEvents[j];
                if (other._calColor && other.endTime >= block.startTime && other.startTime <= block.endTime) {
                    neighborColors.push(other._calColor);
                }
            }

            // Pick a color not used by any neighbor
            const available = CALENDAR_COLORS.filter(c => !neighborColors.includes(c));
            if (available.length > 0) {
                block._calColor = available[idx % available.length];
            } else {
                // All colors taken by neighbors, pick least used
                block._calColor = CALENDAR_COLORS[idx % CALENDAR_COLORS.length];
            }
        });
    }

    /**
     * Compute overlap lanes at the time level.
     * Routines/calendar get lane 0 (top), user tasks get lane 1 (bottom).
     */
    function computeOverlapLanes(blocks) {
        const lanes = {};

        // Group blocks into overlap clusters
        const sorted = [...blocks].sort((a, b) => a.startTime.localeCompare(b.startTime));

        for (const block of sorted) {
            const isBackground = block.isRoutine || block.fromCalendar;

            // Find all blocks that overlap with this one
            const overlapping = blocks.filter(b => {
                if (b.id === block.id) return false;
                return b.startTime < block.endTime && b.endTime > block.startTime;
            });

            if (overlapping.length === 0) {
                lanes[block.id] = { lane: 0, totalLanes: 1 };
                continue;
            }

            // Check what types overlap
            const hasUserTaskOverlap = overlapping.some(b => !b.isRoutine && !b.fromCalendar);
            const hasCalendarOverlap = overlapping.some(b => b.fromCalendar);
            const hasRoutineOverlap = overlapping.some(b => b.isRoutine);

            if (isBackground && !hasUserTaskOverlap && !hasCalendarOverlap) {
                // Background block only overlaps with other routines - show full
                lanes[block.id] = { lane: 0, totalLanes: 1 };
            } else if (block.isRoutine && hasUserTaskOverlap) {
                // Routine overlapping with user task: routine top, user bottom
                lanes[block.id] = { lane: 0, totalLanes: 2 };
            } else if (!isBackground && (hasRoutineOverlap || hasCalendarOverlap)) {
                // User task overlapping with routine or calendar: user bottom
                lanes[block.id] = { lane: 1, totalLanes: 2 };
            } else if (block.fromCalendar && hasCalendarOverlap) {
                // Calendar overlapping with other calendar: assign lanes by order
                const calOverlaps = overlapping.filter(b => b.fromCalendar);
                const allCals = [block, ...calOverlaps].sort((a, b) =>
                    a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)
                );
                const myIndex = allCals.findIndex(b => b.id === block.id);
                lanes[block.id] = { lane: myIndex, totalLanes: allCals.length };
            } else {
                lanes[block.id] = { lane: 0, totalLanes: 1 };
            }
        }
        return lanes;
    }

    /**
     * Place a block into grid cells using per-cell fills.
     * Each cell gets its own fill div - NO cross-cell overflow.
     */
    function placeBlockInCells(block, laneInfo) {
        const startPos = getTimePosition(block.startTime);
        const endPos = getTimePosition(block.endTime);
        let currentHour = startPos.hour;
        let isFirstCell = true;

        while (currentHour <= endPos.hour) {
            if (currentHour > GRID_END_HOUR) break;

            let startSlot = (currentHour === startPos.hour) ? startPos.slot : 0;
            let endSlot = (currentHour === endPos.hour) ? endPos.slot : SLOTS_PER_HOUR;

            if (currentHour === endPos.hour && endPos.slot === 0) break;

            const row = gridElement.querySelector(`[data-hour="${currentHour}"]`);
            if (!row) { currentHour++; continue; }

            const slotCells = row.querySelectorAll('.time-slot');

            for (let i = startSlot; i < endSlot; i++) {
                const cell = slotCells[i];
                if (!cell) continue;

                cell.classList.add('has-block');
                cell.dataset.blockId = block.id;
                cell.dataset.category = block.category;

                // Create a fill element for THIS cell
                const fill = document.createElement('div');
                fill.className = 'time-block-fill';
                if (block.fromCalendar) fill.classList.add('from-calendar');
                if (block.isRoutine) fill.classList.add('is-routine');
                // Set colors
                let bgColor;
                if (block.fromCalendar) {
                    bgColor = block.backgroundColor || block._calColor || '#588AEE';
                } else {
                    bgColor = getBlockBackgroundColor(block);
                }

                fill.style.backgroundColor = bgColor;
                const textColor = block.fromCalendar ? '#fff' : getTextColorForCategory(block.category, bgColor);
                fill.style.color = textColor;

                // For routines, add .light-bg if text is dark (implies light background)
                if (block.isRoutine && textColor === '#1a1a1a') {
                    fill.classList.add('light-bg');
                }

                if (block.fromCalendar) {
                    fill.style.fontFamily = "'Space Grotesk', sans-serif";
                    fill.style.fontWeight = '700';
                }
                fill.dataset.blockId = block.id;

                // Lane positioning for overlaps
                if (laneInfo && laneInfo.totalLanes > 1) {
                    const heightPer = 100 / laneInfo.totalLanes;
                    fill.style.height = heightPer + '%';
                    fill.style.top = (laneInfo.lane * heightPer) + '%';
                }

                // Show title only on the first cell
                if (isFirstCell) {
                    const notesHtml = block.notes ? `<span class="block-notes">${escapeHtml(block.notes)}</span>` : '';
                    fill.innerHTML = `<span class="block-title">${escapeHtml(block.title)}</span>${notesHtml}`;
                    fill.style.zIndex = '10'; // Above neighboring fills so title overflows visibly
                    isFirstCell = false;
                }

                // Click handler
                fill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleBlockClick(block.id);
                });

                // Draggable for user tasks and routines (not calendar events)
                if (!block.fromCalendar) {
                    makeDraggable(fill, block);

                    // RESIZE HANDLES
                    // 1. Start Handle (Left)
                    if (currentHour === startPos.hour && i === startPos.slot) {
                        makeResizable(fill, block, 'start');
                    }

                    // 2. End Handle (Right)
                    if (currentHour === endPos.hour && i === endSlot - 1) {
                        makeResizable(fill, block, 'end');
                    }
                    // Also if we break early (endPos.slot == 0) - wait, looping logic handles i < endSlot.
                    // If block ends at 14:15, startSlot=0, endSlot=1. i=0. i === endSlot-1 (0 === 0) -> TRUE.
                    // If block ends at 14:30, endSlot=2. i=0, i=1. i==1 -> TRUE.
                    // Correct.
                }

                // Double Click handler
                fill.addEventListener('dblclick', (e) => {
                    e.stopPropagation();
                    e.preventDefault(); // Prevent text selection
                    handleBlockDoubleClick(block.id);
                });

                cell.appendChild(fill);
            }

            currentHour++;
        }
    }

    /**
     * Get category color (matches CSS variables)
     */
    function getCategoryColor(category) {
        const colors = {
            'sleep': '#fec93d',
            'routine': '#e44033',
            'routine-evening': '#59875e',
            'routine-night': '#316feb',
            'meal': '#fec93d',
            'recharge': '#feceb9',
            'relax': '#cce4e1',
            'work': '#FFF3CD',
            'calendar': '#588AEE',
            // User task colors
            'focus': '#B22B3A',
            'admin': '#11326B',
            'creative': '#326663',
            'other': '#724431',
            'deepwork': '#090909',
            'energy': '#F39242'
        };
        return colors[category] || '#724431';
    }

    /**
     * Handle block click
     */
    function handleBlockClick(blockId) {
        const event = new CustomEvent('blockClicked', {
            detail: { blockId }
        });
        document.dispatchEvent(event);
    }

    /**
     * Handle block double click
     */
    function handleBlockDoubleClick(blockId) {
        const event = new CustomEvent('blockDoubleClicked', {
            detail: { blockId }
        });
        document.dispatchEvent(event);
    }

    /**
     * Escape HTML for safe display
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ====================================
    // DRAG AND DROP
    // ====================================

    let dragState = null;

    function makeDraggable(el, block) {
        el.classList.add('draggable');
        el.addEventListener('pointerdown', (e) => onDragStart(e, block, el));

        // Prevent context menu on long press (E-reader fix)
        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
    }

    function onDragStart(e, block, el) {
        if (e.button !== 0) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let holdActivated = false;
        let hasMoved = false;
        const slotCount = getBlockSlotCount(block);

        // Dynamic delay: Short for Mouse (PC), Long for Touch (E-reader compatibility)
        const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
        const HOLD_DELAY = isTouch ? 400 : 150;

        // Cancel hold if pointer moves too much before activation
        const onMoveBeforeHold = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (Math.abs(dx) + Math.abs(dy) > 8) {
                cancelHold();
            }
        };

        const onUpBeforeHold = () => {
            cancelHold();
        };

        const cancelHold = () => {
            clearTimeout(holdTimer);
            document.removeEventListener('pointermove', onMoveBeforeHold);
            document.removeEventListener('pointerup', onUpBeforeHold);
        };

        // After hold delay, activate drag mode
        const holdTimer = setTimeout(() => {
            holdActivated = true;
            document.removeEventListener('pointermove', onMoveBeforeHold);
            document.removeEventListener('pointerup', onUpBeforeHold);

            // Visual feedback that drag is active
            el.style.opacity = '0.6';

            // Vibration feedback for touch devices
            if (navigator.vibrate) navigator.vibrate(50);

            document.addEventListener('pointermove', onDragMove);
            document.addEventListener('pointerup', onDragUp);
        }, HOLD_DELAY);

        document.addEventListener('pointermove', onMoveBeforeHold);
        document.addEventListener('pointerup', onUpBeforeHold);

        const onDragMove = (moveEvent) => {
            // ... (rest of function logic)
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            if (!hasMoved && Math.abs(dx) + Math.abs(dy) >= 5) {
                hasMoved = true;
                const ghost = document.createElement('div');
                ghost.className = 'drag-ghost';
                ghost.textContent = block.title;
                ghost.style.backgroundColor = getCategoryColor(block.category);
                ghost.style.color = getTextColorForCategory(block.category, ghost.style.backgroundColor);
                ghost.style.width = el.offsetWidth + 'px';
                ghost.style.height = el.offsetHeight + 'px';
                document.body.appendChild(ghost);

                document.querySelectorAll(`.time-block-fill[data-block-id="${block.id}"]`).forEach(f => {
                    f.classList.add('dragging');
                });

                dragState = {
                    blockId: block.id,
                    block: block,
                    ghost: ghost,
                    element: el,
                    slotCount: slotCount
                };
            }

            if (dragState && dragState.ghost) {
                dragState.ghost.style.left = moveEvent.clientX - 40 + 'px';
                dragState.ghost.style.top = moveEvent.clientY - 15 + 'px';
            }

            highlightDropTarget(moveEvent.clientX, moveEvent.clientY);
        };

        const onDragUp = (upEvent) => {
            document.removeEventListener('pointermove', onDragMove);
            document.removeEventListener('pointerup', onDragUp);
            el.style.opacity = '';

            if (hasMoved && dragState) {
                const targetSlot = getSlotAtPosition(upEvent.clientX, upEvent.clientY);
                if (targetSlot) {
                    const newTime = targetSlot.dataset.time;
                    if (newTime && newTime !== block.startTime) {
                        const newStartIdx = timeToSlotIndex(newTime);
                        const newEndIdx = newStartIdx + dragState.slotCount;

                        if (newEndIdx <= TOTAL_SLOTS && newStartIdx >= 0) {
                            const newEndTime = slotIndexToTime(newEndIdx);
                            document.dispatchEvent(new CustomEvent('blockMoved', {
                                detail: {
                                    blockId: block.id,
                                    startTime: newTime,
                                    endTime: newEndTime
                                }
                            }));
                        }
                    }
                }

                // Cleanup
                document.querySelectorAll(`.time-block-fill[data-block-id="${block.id}"]`).forEach(f => {
                    f.classList.remove('dragging');
                });
                if (dragState.ghost) dragState.ghost.remove();
                clearDragHighlights();
                dragState = null;
            }
        };

        // Do NOT preventDefault here on pointerdown, it breaks scrolling/click?
        // Actually we need it to stop text selection?
        // Let's rely on CSS touch-action and user-select for that.
    }

    function highlightDropTarget(x, y) {
        clearDragHighlights();
        const slot = getSlotAtPosition(x, y);
        if (slot) {
            slot.classList.add('drag-over');
        }
    }

    function clearDragHighlights() {
        if (!gridElement) return;
        gridElement.querySelectorAll('.drag-over').forEach(s => s.classList.remove('drag-over'));
    }

    function getSlotAtPosition(x, y) {
        const elements = document.elementsFromPoint(x, y);
        for (const el of elements) {
            if (el.classList.contains('time-slot')) {
                return el;
            }
            if (el.classList.contains('time-block-fill')) {
                const slot = el.closest('.time-slot');
                if (slot) return slot;
            }
            if (el.classList.contains('timegrid-row')) {
                const slots = el.querySelectorAll('.time-slot');
                if (slots.length > 0) {
                    let closest = slots[0];
                    let closestDist = Infinity;
                    slots.forEach(s => {
                        const rect = s.getBoundingClientRect();
                        const dist = Math.abs(rect.left + rect.width / 2 - x);
                        if (dist < closestDist) {
                            closestDist = dist;
                            closest = s;
                        }
                    });
                    return closest;
                }
            }
        }
        return null;
    }

    function getBlockBackgroundColor(block) {
        // If explicit custom color is set, use it
        if (block.customColor) {
            return block.customColor;
        }

        // For 'work' category (default tasks), assign a deterministic random color
        // based on the ID if no custom color is set
        if (block.category === 'work') {
            const hash = block.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
            return TASK_PALETTE[hash % TASK_PALETTE.length];
        }

        // Otherwise use standard category color
        return getCategoryColor(block.category);
    }

    function getTextColorForCategory(category, bgColor) {
        // Energy (Orange) needs dark text for readability
        if (bgColor === '#e37400' || bgColor === '#F39242' || category === 'energy') return '#1a1a1a';

        // Other palette colors (Red, Blue, Teal, Brown, Black) are dark -> use white text
        if (TASK_PALETTE.includes(bgColor)) return '#ffffff';

        // Standard categories
        const darkTextCategories = ['meal', 'recharge', 'relax', 'work', 'energy', 'sleep'];
        return darkTextCategories.includes(category) ? '#1a1a1a' : '#ffffff';
    }

    /**
     * Legacy compatibility - timeToPosition for current time indicator
     */
    function timeToPosition(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = (hours - GRID_START_HOUR) * 60 + minutes;
        return totalMinutes;
    }

    /**
     * Render all-day events into their dedicated popover list
     */
    function renderAllDay(events) {
        const list = document.getElementById('all-day-list');
        const btn = document.getElementById('all-day-btn');
        const count = document.getElementById('all-day-count');

        if (!list || !btn) return;

        list.innerHTML = '';

        // Hide btn if no events
        if (!events || events.length === 0) {
            btn.style.display = 'none';
            if (count) count.textContent = '0';
            return;
        }

        // Show btn
        btn.style.display = 'inline-flex';
        // Force flex to ensure it shows up (since style.display = 'none' was set in HTML)
        if (count) count.textContent = events.length.toString();

        events.forEach(event => {
            const item = document.createElement('div');
            item.className = 'allday-item';
            item.textContent = event.title;

            // Optional: Colored border or dot
            const color = event.backgroundColor || '#588AEE';
            item.style.borderLeft = `4px solid ${color}`;

            list.appendChild(item);
        });
    }


    // ====================================
    // RESIZE LOGIC (New)
    // ====================================

    let resizeState = null;

    function makeResizable(el, block, type) {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${type}`; // 'start' or 'end'
        el.appendChild(handle);

        handle.addEventListener('pointerdown', (e) => onResizeStart(e, block, el, type));
        // Stop propagation to prevent drag start
        handle.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    function onResizeStart(e, block, el, type) {
        e.preventDefault();
        e.stopPropagation();

        if (e.button !== 0) return;

        console.log(`Resize Start: ${type}, Block: ${block.title}`);

        const startX = e.clientX;

        // Visual feedback
        el.classList.add('resizing');
        document.body.style.cursor = 'ew-resize';

        const onResizeMove = (moveEvent) => {
            // Optional: Visual feedback during move?
            // For now, we just rely on cursor and final drop.
            // Maybe add a class to the hovered slot?
        };

        const onResizeUp = (upEvent) => {
            document.removeEventListener('pointermove', onResizeMove);
            document.removeEventListener('pointerup', onResizeUp);
            document.body.style.cursor = '';
            el.classList.remove('resizing');

            // Find slot under cursor
            const targetSlot = getSlotAtPosition(upEvent.clientX, upEvent.clientY);

            if (targetSlot && targetSlot.dataset.time) {
                const slotTime = targetSlot.dataset.time;
                const slotIdx = timeToSlotIndex(slotTime);

                // Snap to 15m intervals (which is what slots are)

                if (type === 'end') {
                    // Dragging END handle
                    // If we drop on 14:00 slot, we want end time to be 14:15 (end of that slot)
                    const newEndIdx = slotIdx + 1;
                    const newEndTime = slotIndexToTime(newEndIdx);

                    // Logic: EndTime must be > StartTime
                    if (newEndTime > block.startTime) {
                        // Also check if we are not hitting the very max
                        document.dispatchEvent(new CustomEvent('blockMoved', {
                            detail: {
                                blockId: block.id,
                                startTime: block.startTime,
                                endTime: newEndTime
                            }
                        }));
                    }
                } else if (type === 'start') {
                    // Dragging START handle
                    // If we drop on 14:00 slot, start time is 14:00 (start of that slot)
                    const newStartTime = slotTime;

                    // Logic: StartTime must be < EndTime
                    if (newStartTime < block.endTime) {
                        document.dispatchEvent(new CustomEvent('blockMoved', {
                            detail: {
                                blockId: block.id,
                                startTime: newStartTime,
                                endTime: block.endTime
                            }
                        }));
                    }
                }
            }
        };

        document.addEventListener('pointermove', onResizeMove);
        document.addEventListener('pointerup', onResizeUp);
    }


    // Public API
    return {
        init,
        render,
        renderAllDay,
        timeToPosition,
        timeToSlotIndex,
        slotIndexToTime,
        getBlockSlotCount,
        GRID_START_HOUR,
        GRID_END_HOUR,
        HOUR_HEIGHT: 60,
        SLOT_HEIGHT: 15,
        makeResizable // Export for testing if needed, though used internally primarily
    };
})();
