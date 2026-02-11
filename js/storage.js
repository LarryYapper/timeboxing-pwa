/**
 * storage.js - IndexedDB wrapper for local persistence
 */

const Storage = (function () {
    const DB_NAME = 'timeboxing-db';
    const DB_VERSION = 1;
    const STORE_BLOCKS = 'blocks';
    const STORE_SETTINGS = 'settings';

    let db = null;

    /**
     * Initialize the database
     */
    async function init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                db = request.result;
                resolve(db);
            };

            request.onupgradeneeded = (event) => {
                const database = event.target.result;

                // Create blocks store
                if (!database.objectStoreNames.contains(STORE_BLOCKS)) {
                    const blocksStore = database.createObjectStore(STORE_BLOCKS, { keyPath: 'id' });
                    blocksStore.createIndex('date', 'date', { unique: false });
                    blocksStore.createIndex('startTime', 'startTime', { unique: false });
                }

                // Create settings store
                if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
                    database.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                }
            };
        });
    }

    /**
     * Generate unique ID
     */
    function generateId() {
        return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get all blocks for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     */
    async function getBlocksByDate(date) {
        if (!db) await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_BLOCKS, 'readonly');
            const store = transaction.objectStore(STORE_BLOCKS);
            const index = store.index('date');
            const request = index.getAll(date);

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save a block
     * @param {Object} block - Block data
     */
    async function saveBlock(block) {
        if (!db) await init();

        if (!block.id) {
            block.id = generateId();
        }

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_BLOCKS, 'readwrite');
            const store = transaction.objectStore(STORE_BLOCKS);
            const request = store.put(block);

            request.onsuccess = () => resolve(block);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete a block
     * @param {string} id - Block ID
     */
    async function deleteBlock(id) {
        if (!db) await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_BLOCKS, 'readwrite');
            const store = transaction.objectStore(STORE_BLOCKS);
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a setting value
     * @param {string} key - Setting key
     * @param {*} defaultValue - Default value if not found
     */
    async function getSetting(key, defaultValue = null) {
        if (!db) await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_SETTINGS, 'readonly');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.value);
                } else {
                    resolve(defaultValue);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save a setting
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    async function setSetting(key, value) {
        if (!db) await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_SETTINGS, 'readwrite');
            const store = transaction.objectStore(STORE_SETTINGS);
            const request = store.put({ key, value });

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all blocks for a specific date
     * @param {string} date - Date in YYYY-MM-DD format
     */
    async function clearBlocksByDate(date) {
        if (!db) await init();

        const blocks = await getBlocksByDate(date);
        const localBlocks = blocks.filter(b => !b.fromCalendar);

        return Promise.all(localBlocks.map(b => deleteBlock(b.id)));
    }

    /**
     * Export all data for backup/sync
     */
    async function exportBackup() {
        if (!db) await init();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_BLOCKS, STORE_SETTINGS], 'readonly');
            const blocksStore = transaction.objectStore(STORE_BLOCKS);
            const settingsStore = transaction.objectStore(STORE_SETTINGS);

            const backup = {
                blocks: [],
                settings: [],
                hiddenRoutines: {}, // NEW: Store hidden routines map
                timestamp: Date.now()
            };

            blocksStore.getAll().onsuccess = (e) => {
                backup.blocks = e.target.result;
            };

            settingsStore.getAll().onsuccess = (e) => {
                backup.settings = e.target.result;
            };

            // Export hidden routines from localStorage
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('hiddenRoutines_')) {
                    backup.hiddenRoutines[key] = localStorage.getItem(key);
                }
            });

            transaction.oncomplete = () => resolve(backup);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Import backup data (merges or overwrites)
     * @param {Object} data - Backup data
     * @param {boolean} overwrite - Whether to overwrite existing data
     */
    async function importBackup(data, overwrite = true) {
        if (!db) await init();
        if (!data || !data.blocks) return false;

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_BLOCKS, STORE_SETTINGS], 'readwrite');
            const blocksStore = transaction.objectStore(STORE_BLOCKS);
            const settingsStore = transaction.objectStore(STORE_SETTINGS);

            if (overwrite) {
                blocksStore.clear();
                settingsStore.clear();
            }

            data.blocks.forEach(block => blocksStore.put(block));
            if (data.settings) {
                data.settings.forEach(setting => settingsStore.put(setting));
            }

            // Restore hidden routines to localStorage
            if (data.hiddenRoutines) {
                Object.entries(data.hiddenRoutines).forEach(([key, value]) => {
                    localStorage.setItem(key, value);
                });
            }

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Public API
    return {
        init,
        generateId,
        getBlocksByDate,
        saveBlock,
        deleteBlock,
        getSetting,
        setSetting,
        clearBlocksByDate,
        exportBackup,
        importBackup
    };
})();
