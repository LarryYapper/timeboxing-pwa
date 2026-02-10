/**
 * timeblocks.js - Interactive time blocks for table grid layout
 * Blocks are placed inside table cells, spanning multiple cells as needed
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
     * Create block content element
     */
    function createBlockContent(block, slotCount) {
        const el = document.createElement('div');
        let classes = `time-block-content ${block.category}`;
        if (block.fromCalendar) classes += ' from-calendar';
        if (block.isRoutine) classes += ' is-routine';
        el.className = classes;
        el.dataset.blockId = block.id;
        el.style.backgroundColor = getCategoryColor(block.category);

        // Show title and notes if available
        const notesHtml = block.notes ? `<span class="block-notes">${escapeHtml(block.notes)}</span>` : '';
        el.innerHTML = `
            <span class="block-title">${escapeHtml(block.title)}</span>
            ${notesHtml}
        `;

        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent bubbling
            handleBlockClick(block.id);
        });

        // Make user-created blocks (not routines, not calendar) draggable
        if (!block.isRoutine && !block.fromCalendar) {
            makeDraggable(el, block);
        }

        return el;
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

        // Sort blocks by start time
        const sortedBlocks = [...blocks].sort((a, b) => {
            return a.startTime.localeCompare(b.startTime);
        });

        // Place each block into its cells
        sortedBlocks.forEach(block => {
            placeBlockInCells(block);
        });
    }

    /**
     * Place a block into the appropriate grid cells
     */
    /**
     * Place a block into the appropriate grid cells
     */
    function placeBlockInCells(block) {
        const startPos = getTimePosition(block.startTime);
        const endPos = getTimePosition(block.endTime);

        let currentHour = startPos.hour;

        // Loop through each hour the block touches
        while (currentHour <= endPos.hour) {
            if (currentHour > GRID_END_HOUR) break;

            // Determine start and end slots for this specific hour row
            let startSlot = (currentHour === startPos.hour) ? startPos.slot : 0;
            let endSlot = (currentHour === endPos.hour) ? endPos.slot : SLOTS_PER_HOUR;

            // If block ends exactly at the start of an hour (e.g. 8:00), don't render on 8:00 row
            if (currentHour === endPos.hour && endPos.slot === 0) {
                break;
            }

            const durationInSlots = endSlot - startSlot;
            if (durationInSlots > 0) {
                const row = gridElement.querySelector(`[data-hour="${currentHour}"]`);
                if (row) {
                    const slotCells = row.querySelectorAll('.time-slot');
                    const firstCell = slotCells[startSlot];

                    if (firstCell) {
                        // Create content for this segment
                        const content = createBlockContent(block, durationInSlots);

                        // Calculate width: (100% * slots) + (pixels for borders)
                        // defined in CSS: --grid-time-width is for label, but slots are flex/percentage
                        // We use percentage width: 100% of a slot * number of slots
                        // But we need to account for the borders between slots if we want pixel perfection
                        // Simpler approach: style.width = (durationInSlots * 100) + '%'
                        // And we make the content position:absolute overlapping everything

                        content.style.width = `calc(${durationInSlots * 100}% + ${durationInSlots - 1}px)`;

                        // Mark the first cell and append content
                        firstCell.classList.add('has-block', 'block-start');
                        firstCell.appendChild(content);

                        // Mark subsequent cells in this row as occupied (for future drag/drop logic)
                        for (let i = startSlot; i < endSlot; i++) {
                            if (slotCells[i]) {
                                slotCells[i].classList.add('has-block');
                                slotCells[i].dataset.blockId = block.id;
                                slotCells[i].dataset.category = block.category;
                                // We DO NOT set background color on the cell anymore, 
                                // it's on the content element
                            }
                        }
                    }
                }
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
            'calendar': '#5C6BC0',
            // User task colors
            'focus': '#B22B3A',
            'admin': '#11326B',
            'creative': '#326663',
            'other': '#724431',
            'deepwork': '#090909',
            'energy': '#F39242'
        };
        return colors[category] || '#724431'; // Default to 'other' color
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

    let dragState = null; // { blockId, block, ghost, originSlot, startX, startY, slotCount }

    /**
     * Make a block element draggable (pointer events)
     */
    function makeDraggable(el, block) {
        el.classList.add('draggable');
        el.addEventListener('pointerdown', (e) => onDragStart(e, block, el));
    }

    function onDragStart(e, block, el) {
        // Only primary button (touch or left click)
        if (e.button !== 0) return;

        // Small threshold so clicks don't accidentally drag
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
                // Create ghost
                const ghost = document.createElement('div');
                ghost.className = 'drag-ghost';
                ghost.textContent = block.title;
                ghost.style.backgroundColor = getCategoryColor(block.category);
                ghost.style.color = getTextColorForCategory(block.category);
                ghost.style.width = el.offsetWidth + 'px';
                ghost.style.height = el.offsetHeight + 'px';
                document.body.appendChild(ghost);

                el.classList.add('dragging');

                dragState = {
                    blockId: block.id,
                    block: block,
                    ghost: ghost,
                    element: el,
                    slotCount: slotCount
                };
            }

            // Move ghost
            if (dragState && dragState.ghost) {
                dragState.ghost.style.left = moveEvent.clientX - 40 + 'px';
                dragState.ghost.style.top = moveEvent.clientY - 15 + 'px';
            }

            // Highlight target slot
            highlightDropTarget(moveEvent.clientX, moveEvent.clientY);
        };

        const onUp = (upEvent) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);

            if (hasMoved && dragState) {
                // Find drop target
                const targetSlot = getSlotAtPosition(upEvent.clientX, upEvent.clientY);
                if (targetSlot) {
                    const newTime = targetSlot.dataset.time;
                    if (newTime && newTime !== block.startTime) {
                        // Calculate new end time
                        const newStartIdx = timeToSlotIndex(newTime);
                        const newEndIdx = newStartIdx + dragState.slotCount;
                        const maxIdx = TOTAL_SLOTS;

                        if (newEndIdx <= maxIdx && newStartIdx >= 0) {
                            const newEndTime = slotIndexToTime(newEndIdx);

                            // Dispatch move event
                            const event = new CustomEvent('blockMoved', {
                                detail: {
                                    blockId: block.id,
                                    startTime: newTime,
                                    endTime: newEndTime
                                }
                            });
                            document.dispatchEvent(event);
                        }
                    }
                }

                // Cleanup
                dragState.element.classList.remove('dragging');
                if (dragState.ghost) dragState.ghost.remove();
                clearDragHighlights();
                dragState = null;
            }
        };

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);

        // Prevent default to avoid text selection on touch
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
        // Use elementsFromPoint to find the slot under the cursor
        const elements = document.elementsFromPoint(x, y);
        for (const el of elements) {
            if (el.classList.contains('time-slot')) {
                return el;
            }
            // If we hit a row, find the closest slot
            if (el.classList.contains('timegrid-row')) {
                const slots = el.querySelectorAll('.time-slot');
                if (slots.length > 0) {
                    // Find the slot closest to x
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

    /**
     * Get text color for a category (dark or light text)
     */
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
        return totalMinutes; // 1 pixel per minute = 60px per hour
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
