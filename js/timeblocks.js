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
            'meal': '#ffe599',
            'recharge': '#feceb9',
            'relax': '#cce4e1',
            'work': '#FFF3CD',
            'calendar': '#CE93D8'
        };
        return colors[category] || '#9E9E9E';
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
