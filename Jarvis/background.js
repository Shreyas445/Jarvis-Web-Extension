// background.js - Service Worker

console.log('Jarvis Background Service Worker Loaded');

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
    console.log('Jarvis Extension Installed');
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    chrome.storage.local.set({
        userProfile: {},
        settings: {
            useLLM: false,
            llmUrl: "http://localhost:11434"
        }
    });
});

// Message handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Received message:', request);

    if (request.type === 'PING') {
        sendResponse({ status: 'PONG' });
    }

    // Future command handling logic will go here
    if (request.type === 'PROCESS_COMMAND') {
        handleCommand(request.payload)
            .then(response => sendResponse(response))
            .catch(err => sendResponse({ error: err.message }));
        return true; // Keep channel open for async response
    }
});

import { Agent } from './agent.js';

const agent = new Agent();

async function handleCommand(commandText) {
    console.log("Processing command via Agent:", commandText);

    // Get settings
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || { useLLM: false };

    try {
        const result = await agent.process(commandText, settings);
        return result;
    } catch (error) {
        console.error("Agent error:", error);
        return { status: "error", message: error.message };
    }
}
