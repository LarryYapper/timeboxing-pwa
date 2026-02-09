/**
 * routines.js - Pre-defined daily routine templates
 * Based on user's paper timeboxing template
 */

const Routines = (function () {

    // Default daily routines from the paper template
    const DEFAULT_ROUTINES = [
        {
            id: 'routine_sleep_morning',
            title: 'Spánek',
            startTime: '06:00',
            endTime: '07:00',
            category: 'sleep',
            isRoutine: true
        },

        {
            id: 'routine_morning_1',
            title: 'Ranní rutina',
            startTime: '07:00',
            endTime: '08:00',
            category: 'routine',
            isRoutine: true
        },
        {
            id: 'routine_breakfast',
            title: 'Snídaně',
            startTime: '08:00',
            endTime: '08:45',
            category: 'meal',
            isRoutine: true
        },

        {
            id: 'routine_anki',
            title: 'Anki',
            startTime: '08:45',
            endTime: '09:00',
            category: 'work',
            isRoutine: true
        },
        {
            id: 'routine_snack_morning',
            title: 'Svačina',
            startTime: '10:15',
            endTime: '10:30',
            category: 'meal',
            isRoutine: true
        },
        {
            id: 'routine_lunch',
            title: 'Oběd',
            startTime: '12:00',
            endTime: '12:45',
            category: 'meal',
            isRoutine: true
        },
        {
            id: 'routine_recharge',
            title: 'Recharge',
            startTime: '12:45',
            endTime: '13:30',
            category: 'recharge',
            isRoutine: true
        },
        {
            id: 'routine_snack_afternoon',
            title: 'Svačina',
            startTime: '15:00',
            endTime: '15:15',
            category: 'meal',
            isRoutine: true
        },
        {
            id: 'routine_dinner',
            title: 'Večeře',
            startTime: '18:00',
            endTime: '19:00',
            category: 'meal',
            isRoutine: true
        },
        {
            id: 'routine_evening',
            title: 'Večerní rutina',
            startTime: '20:00',
            endTime: '20:45',
            category: 'routine-evening',
            isRoutine: true
        },
        {
            id: 'routine_night',
            title: 'Noční rutina',
            startTime: '22:00',
            endTime: '22:30',
            category: 'routine-night',
            isRoutine: true
        },
        {
            id: 'routine_relax',
            title: 'Relax',
            startTime: '22:30',
            endTime: '23:00',
            category: 'relax',
            isRoutine: true
        },
        {
            id: 'routine_sleep_morning2',
            title: 'Spánek',
            startTime: '23:00',
            endTime: '24:00',
            category: 'sleep',
            isRoutine: true
        },

    ];

    /**
     * Get routines for a specific date
     * Each routine gets a unique ID based on date
     */
    function getRoutinesForDate(dateStr) {
        return DEFAULT_ROUTINES.map(routine => ({
            ...routine,
            id: `${routine.id}_${dateStr}`,
            date: dateStr,
            fromCalendar: false,
            isRoutine: true
        }));
    }

    /**
     * Check if a block is a routine
     */
    function isRoutine(block) {
        return block.isRoutine === true;
    }

    /**
     * Get all default routines (for editing/management)
     */
    function getDefaultRoutines() {
        return [...DEFAULT_ROUTINES];
    }

    /**
     * Update a routine (saves to storage for customization)
     * Future enhancement: allow users to customize their routines
     */
    async function updateRoutine(routineId, updates) {
        // For now, routines are hardcoded
        // Future: store custom routines in IndexedDB
        console.log('Routine customization coming soon:', routineId, updates);
    }

    // Public API
    return {
        getRoutinesForDate,
        isRoutine,
        getDefaultRoutines,
        updateRoutine,
        DEFAULT_ROUTINES
    };
})();
