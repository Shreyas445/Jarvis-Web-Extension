// voice.js - Web Speech API Wrapper

export class VoiceAssistant {
    constructor() {
        if (!('webkitSpeechRecognition' in window)) {
            throw new Error("Web Speech API not supported in this browser.");
        }

        this.recognition = new webkitSpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true; // Changed to true for realtime feedback
        this.recognition.lang = 'en-US';

        this.isListening = false;

        // Event callbacks
        this.onResult = null;
        this.onError = null;
        this.onEnd = null;
        this.onStart = null;

        this._setupListeners();
    }

    _setupListeners() {
        this.recognition.onstart = () => {
            this.isListening = true;
            if (this.onStart) this.onStart();
        };

        this.recognition.onend = () => {
            this.isListening = false;
            // Auto-restart if needed, but for now specific command based
            if (this.onEnd) this.onEnd();
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            if (this.onResult) {
                this.onResult(finalTranscript, interimTranscript);
            }
        };

        this.recognition.onerror = (event) => {
            if (this.onError) this.onError(event.error);
        };
    }

    start() {
        if (this.isListening) return;
        try {
            this.recognition.start();
        } catch (e) {
            // Ignore "already started" errors
            if (e.message.includes('already started')) return;
            console.error("Speech recognition start failed:", e);
            if (this.onError) this.onError(e.message);
        }
    }

    stop() {
        if (!this.isListening) return;
        this.recognition.stop();
    }
}
