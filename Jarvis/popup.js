// popup.js - UI Logic
import { VoiceAssistant } from './voice.js';

const ui = {
    micBtn: document.getElementById('mic-btn'),
    statusText: document.getElementById('status-text'),
    transcript: document.getElementById('transcript'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    saveSettingsBtn: document.getElementById('save-settings'),
    useLlmCheckbox: document.getElementById('use-llm'),
    llmUrlInput: document.getElementById('llm-url'),
    // Profile Inputs
    pName: document.getElementById('p-name'),
    pEmail: document.getElementById('p-email'),
    pPhone: document.getElementById('p-phone'),
    pAddr: document.getElementById('p-addr'),
    // Manual Input
    manualInput: document.getElementById('manual-input'),
    sendBtn: document.getElementById('send-btn'),
    // Fix Mic
    fixMicBtn: document.getElementById('fix-mic-btn')
};

let voice;
let hasResult = false; // Track if we got a result

try {
    voice = new VoiceAssistant();
} catch (e) {
    ui.statusText.textContent = "Voice API not supported.";
    ui.micBtn.disabled = true;
}

// Fix Mic Handler
if (ui.fixMicBtn) {
    ui.fixMicBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: 'popup.html' });
    });
}

// Load settings & Profile
chrome.storage.local.get(['settings', 'userProfile'], (result) => {
    if (result.settings) {
        ui.useLlmCheckbox.checked = result.settings.useLLM;
        ui.llmUrlInput.value = result.settings.llmUrl || "http://localhost:11434";
    }
    if (result.userProfile) {
        ui.pName.value = result.userProfile.name || '';
        ui.pEmail.value = result.userProfile.email || '';
        ui.pPhone.value = result.userProfile.phone || '';
        ui.pAddr.value = result.userProfile.address || '';
    }
});

// Settings Toggle
ui.settingsBtn.addEventListener('click', () => {
    ui.settingsPanel.classList.toggle('hidden');
});

// Save Settings & Profile
ui.saveSettingsBtn.addEventListener('click', () => {
    const newSettings = {
        useLLM: ui.useLlmCheckbox.checked,
        llmUrl: ui.llmUrlInput.value
    };

    const newProfile = {
        name: ui.pName.value,
        email: ui.pEmail.value,
        phone: ui.pPhone.value,
        address: ui.pAddr.value
    };

    chrome.storage.local.set({
        settings: newSettings,
        userProfile: newProfile
    }, () => {
        ui.statusText.textContent = "Saved.";
        ui.settingsPanel.classList.add('hidden');
        setTimeout(() => ui.statusText.textContent = "Ready.", 1500);
    });
});

// Voice Handlers
if (voice) {
    ui.micBtn.addEventListener('click', async () => {
        if (voice.isListening) {
            voice.stop();
        } else {
            ui.statusText.textContent = "Requesting mic...";
            await voice.start();
        }
    });

    voice.onStart = () => {
        hasResult = false;
        ui.micBtn.classList.add('listening');
        ui.statusText.textContent = "Listening...";
        ui.transcript.textContent = "";
    };

    voice.onEnd = () => {
        ui.micBtn.classList.remove('listening');
        if (!hasResult) {
            ui.statusText.textContent = "Ready.";
        } else {
            ui.statusText.textContent = "Processing...";
        }
    };

    voice.onError = (error) => {
        if (error === 'not-allowed' || error === 'service-not-allowed') {
            ui.statusText.textContent = "Mic blocked.";
            ui.fixMicBtn.classList.remove('hidden');
        } else {
            ui.statusText.textContent = "Error: " + error;
        }
        ui.micBtn.classList.remove('listening');
    };

    voice.onResult = (text) => {
        hasResult = true;
        ui.transcript.textContent = `"${text}"`;
        processCommand(text);
    };
}

// Manual Input Handler
ui.sendBtn.addEventListener('click', () => {
    const text = ui.manualInput.value.trim();
    if (text) {
        ui.transcript.textContent = `"${text}"`;
        processCommand(text);
        ui.manualInput.value = '';
    }
});

ui.manualInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        ui.sendBtn.click();
    }
});

function processCommand(text) {
    // Send to background script for processing
    chrome.runtime.sendMessage({
        type: 'PROCESS_COMMAND',
        payload: text
    }, (response) => {
        if (chrome.runtime.lastError) {
            ui.statusText.textContent = "Error: " + chrome.runtime.lastError.message;
            return;
        }

        if (response) {
            if (response.status === 'success') {
                ui.statusText.textContent = "Done: " + response.message;
            } else if (response.status === 'error') {
                ui.statusText.textContent = "Failed: " + response.message;
                // Suggest refresh if connection failed
                if (response.message.includes("establish a connection")) {
                    ui.transcript.textContent += " (Try refreshing the page)";
                }
            } else if (response.status === 'unknown_intent') {
                ui.statusText.textContent = "Unsure what to do.";
            } else {
                ui.statusText.textContent = response.message || "Unknown State";
            }
        }
    });
}
