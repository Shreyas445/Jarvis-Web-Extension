import { VoiceAssistant } from './voice.js';

const ui = {
    history: document.getElementById('chat-history'),
    input: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    micBtn: document.getElementById('mic-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    saveSettingsBtn: document.getElementById('save-settings'),
    // Settings inputs
    useLlmCheckbox: document.getElementById('use-llm'),
    llmUrlInput: document.getElementById('llm-url'),
    geminiKeyInput: document.getElementById('gemini-key'),
    pName: document.getElementById('p-name'),
    pEmail: document.getElementById('p-email'),
    pPhone: document.getElementById('p-phone'),
    pAddr: document.getElementById('p-addr'),
};

let voice;

try {
    voice = new VoiceAssistant();
} catch (e) {
    addMessage("bot", "Voice not supported in this browser.", 'error');
}

// --- Helper Functions ---

function addMessage(role, text, type = 'normal') {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role} ${type}`;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerText = text;

    msgDiv.appendChild(bubble);
    ui.history.appendChild(msgDiv);

    // Auto scroll
    ui.history.scrollTop = ui.history.scrollHeight;

    // TTS Hook
    if (role === 'bot' && window.speakText && type !== 'error') {
        // Strip emoji for cleaner reading? Optional.
        // For now, read it as is.
        window.speakText(text);
    }
}

function processCommand(text) {
    addMessage('user', text);

    // Send to background
    chrome.runtime.sendMessage({
        type: 'PROCESS_COMMAND',
        payload: text
    }, (response) => {
        if (chrome.runtime.lastError) {
            addMessage('bot', "Error: " + chrome.runtime.lastError.message, 'error');
            return;
        }

        if (response) {
            if (response.status === 'success') {
                addMessage('bot', response.message);
            } else if (response.status === 'received') {
                addMessage('bot', "Processing...");
            } else if (response.status === 'error') {
                addMessage('bot', response.message, 'error');
                if (response.message.includes("establish a connection")) {
                    addMessage('bot', "Tip: Refresh the webpage you want to control.");
                }
            } else {
                addMessage('bot', response.message || "I'm not sure what happened.");
            }

            // DEBUG: Show JSON if present (Global check)
            if (response.plan) {
                const debugHtml = `<details><summary>Debug: AI Plan</summary><pre>${JSON.stringify(response.plan, null, 2)}</pre></details>`;
                const debugDiv = document.createElement('div');
                debugDiv.className = 'message bot debug';
                debugDiv.innerHTML = debugHtml;
                ui.history.appendChild(debugDiv);
                ui.history.scrollTop = ui.history.scrollHeight;
            }
        }
    });
}

// --- Event Listeners ---

// Send Button
ui.sendBtn.addEventListener('click', () => {
    const text = ui.input.value.trim();
    if (text) {
        processCommand(text);
        ui.input.value = '';
    }
});

ui.input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        ui.sendBtn.click();
    }
});

// Voice Logic
if (voice) {
    ui.micBtn.addEventListener('click', async () => {
        if (voice.isListening) {
            voice.stop();
        } else {
            // Visual feedback
            ui.micBtn.classList.add('listening');
            await voice.start();
        }
    });

    // Global State for Conversation Mode
    let isConversationMode = false;
    let isAgentSpeaking = false; // PREVENT LOOP
    const convoBtn = document.getElementById('convo-btn');

    // Toggle Conversation Mode
    convoBtn.addEventListener('click', () => {
        isConversationMode = !isConversationMode;
        if (isConversationMode) {
            convoBtn.classList.add('active');
            addMessage('bot', "Conversation Mode ON. I'm listening continuously.");
            if (voice && !voice.isListening && !isAgentSpeaking) voice.start();
        } else {
            convoBtn.classList.remove('active');
            addMessage('bot', "Conversation Mode OFF.");
            if (voice && voice.isListening) voice.stop();
        }
    });

    // TTS Logic
    const speakerBtn = document.getElementById('speaker-btn');
    let isSpeakerOn = false;

    // User-Defined Voice Logic
    function getJarvisVoice() {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return null;

        // 🔒 HARD LOCK: Microsoft Christopher Online (Natural)
        return voices.find(v =>
            v.name === "Microsoft Christopher Online (Natural) - English (United States)" &&
            v.lang === "en-US"
        ) || null;
    }

    // Pre-load voices (Chrome requires this)
    window.speechSynthesis.onvoiceschanged = () => {
        console.log("Voices loaded:", window.speechSynthesis.getVoices().length);
    };

    function speakText(text) {
        if (!isSpeakerOn) return;

        // STOP LISTENING IMMEDIATELY (Loop Prevention)
        isAgentSpeaking = true;
        if (voice && voice.isListening) {
            voice.stop();
        }

        // Stop any current speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        const voiceObj = getJarvisVoice();
        if (voiceObj) utterance.voice = voiceObj;

        // 🎛 Jarvis tuning (User Provided)
        utterance.rate = 1.3;   // calm & confident
        utterance.pitch = 0.85; // deeper, non-robotic
        utterance.volume = 0.9;

        // WHEN FINISHED SPEAKING
        utterance.onend = () => {
            isAgentSpeaking = false;
            // Resume only if Conversation Mode is ON
            setTimeout(() => {
                if (isConversationMode && voice && !voice.isListening) {
                    voice.start();
                }
            }, 500);
        };

        utterance.onerror = (e) => {
            console.error("TTS Error:", e);
            isAgentSpeaking = false;
        };

        window.speechSynthesis.speak(utterance);
    }
    window.speakText = speakText;

    speakerBtn.addEventListener('click', () => {
        isSpeakerOn = !isSpeakerOn;
        if (isSpeakerOn) {
            speakerBtn.classList.add('active');
            // If convo mode is also on, this synergizes well
        } else {
            speakerBtn.classList.remove('active');
            window.speechSynthesis.cancel();
            isAgentSpeaking = false;
        }
    });

    voice.onStart = () => {
        if (isAgentSpeaking) {
            voice.stop(); // Safety
            return;
        }
        ui.micBtn.classList.add('listening');
        ui.input.placeholder = "Listening...";
    };

    voice.onEnd = () => {
        ui.micBtn.classList.remove('listening');
        ui.input.placeholder = "Type a command...";

        // RESTART only if NOT Speaking
        if (isConversationMode && !isAgentSpeaking) {
            setTimeout(() => {
                if (isConversationMode && !voice.isListening && !isAgentSpeaking) voice.start();
            }, 500);
        }
    };

    voice.onResult = (finalText, interimText) => {
        if (interimText) {
            ui.input.value = interimText + "...";
        }
        if (finalText) {
            ui.input.value = finalText;
            processCommand(finalText);

            // If in conversation mode, temporarily stop listening to process, then logic in 'onEnd' or 'processCommand' callback will restart it?
            // Actually, voice.js typically stops on final result. onEnd will trigger.
            // But we don't want to listen WHILE speaking (if we had TTS).
            // For now, since we have no TTS, immediate restart in onEnd is fine.
        }
    };

    voice.onError = (err) => {
        ui.micBtn.classList.remove('listening');
        ui.input.placeholder = "Type a command...";

        // Don't loop efficiently on error to avoid spam
        if (isConversationMode) {
            console.warn("Voice error in convo mode:", err);
            // Maybe stop to prevent infinite error loops
            isConversationMode = false;
            convoBtn.classList.remove('active');
            addMessage('bot', "Voice error. Conversation Mode stopped.", 'error');
        }

        if (err === 'not-allowed' || err === 'service-not-allowed') {
            addMessage('bot', "Microphone blocked. Check permissions.", 'error');
        } else if (err === 'no-speech') {
            // Ignore no-speech in convo mode usually, but Web Speech API throws it.
        } else {
            addMessage('bot', "Error: " + err, 'error');
        }
    };
}

// --- Settings Logic ---

ui.settingsBtn.addEventListener('click', () => {
    ui.settingsPanel.classList.toggle('hidden');
});

// Load Settings
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
        addMessage('bot', "Settings saved!");
        ui.settingsPanel.classList.add('hidden');
    });
});
