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
     * Compute overlap lanes at the time level.
     * Routines/calendar get lane 0 (top), user tasks get lane 1 (bottom).
     */
    function computeOverlapLanes(blocks) {
        const lanes = {};
        for (const block of blocks) {
            const overlapping = blocks.filter(b =>
                b.id !== block.id &&
                b.startTime < block.endTime &&
                b.endTime > block.startTime
            );
            if (overlapping.length === 0) {
                lanes[block.id] = { lane: 0, totalLanes: 1 };
            } else {
                const isBackground = block.isRoutine || block.fromCalendar;
                lanes[block.id] = {
                    lane: isBackground ? 0 : 1,
                    totalLanes: 2
                };
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
                fill.style.backgroundColor = getCategoryColor(block.category);
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
                    isFirstCell = false;
                }

                // Click handler
                fill.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleBlockClick(block.id);
                });

                // Draggable for user tasks only
                if (!block.isRoutine && !block.fromCalendar) {
                    makeDraggable(fill, block);
                }

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
    }

    function onDragStart(e, block, el) {
        if (e.button !== 0) return;

        const startX = e.clientX;
        const startY = e.clientY;
        let hasMoved = false;
        const slotCount = getBlockSlotCount(block);

        const onMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (!hasMoved && Math.abs(dx) + Math.abs(dy) < 10) return;

            if (!hasMoved) {
                hasMoved = true;
                const ghost = document.createElement('div');
                ghost.className = 'drag-ghost';
                ghost.textContent = block.title;
                ghost.style.backgroundColor = getCategoryColor(block.category);
                ghost.style.color = getTextColorForCategory(block.category);
                ghost.style.width = el.offsetWidth + 'px';
                ghost.style.height = el.offsetHeight + 'px';
                document.body.appendChild(ghost);

                // Mark ALL fills for this block as dragging
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

        const onUp = (upEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);

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

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        e.preventDefault();
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

    function getTextColorForCategory(category) {
        const darkTextCategories = ['meal', 'recharge', 'relax', 'work', 'sleep', 'energy'];
        return darkTextCategories.includes(category) ? '#333' : '#fff';
    }

    /**
     * Legacy compatibility - timeToPosition for current time indicator
     */
    function timeToPosition(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = (hours - GRID_START_HOUR) * 60 + minutes;
        return totalMinutes;
    }

    // Public API
    return {
        init,
        render,
        timeToPosition,
        timeToSlotIndex,
        slotIndexToTime,
        getBlockSlotCount,
        GRID_START_HOUR,
        GRID_END_HOUR,
        HOUR_HEIGHT: 60,
        SLOT_HEIGHT: 15
    };
})();
