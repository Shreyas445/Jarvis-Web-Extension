// storage.js - Profile Management

export const Storage = {
    async getProfile() {
        const data = await chrome.storage.local.get(['userProfile']);
        return data.userProfile || {};
    },

    async saveProfile(profile) {
        await chrome.storage.local.set({ userProfile: profile });
    },

    async getHistory() {
        const data = await chrome.storage.local.get(['commandHistory']);
        return data.commandHistory || [];
    },

    async addToHistory(command) {
        const history = await this.getHistory();
        history.push({ timestamp: Date.now(), command });
        // Keep last 50
        if (history.length > 50) history.shift();
        await chrome.storage.local.set({ commandHistory: history });
    }
};
