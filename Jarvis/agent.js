// agent.js - The Brain
console.log("Agent processing module loaded.");

const OLLAMA_DEFAULT_URL = "http://localhost:11434/api/generate";

export class Agent {
    constructor() {
        this.history = [];
    }

    async process(command, settings) {
        console.log(`Agent processing: "${command}" with settings:`, settings);
        this.history.push({ role: 'user', content: command });
        this.settings = settings; // Store for use in _executePlan
        this.lastCommand = command; // Store for context


        // 1. Rule-Based Quick Actions (Fast & Cheap)
        const ruleAction = this._tryRuleBased(command);
        if (ruleAction) {
            console.log("Rule-based match found:", ruleAction);
            return await this._executeAction(ruleAction);
        }

        // 2. AI Processing (Local LLM Only)
        if (settings.useLLM) {
            console.log("Attempting AI processing (Ollama)...");
            try {
                // Determine Provider
                const plan = await this._callLocalLLM(command, settings.llmUrl || OLLAMA_DEFAULT_URL);
                return await this._executePlan(plan, settings);
            } catch (error) {
                console.error("AI failed:", error);
                return { status: "error", message: "AI unavailable. " + error.message };
            }
        }

        return { status: "unknown_intent", message: "I didn't understand that command." };
    }

    _tryRuleBased(text) {
        const lower = text.toLowerCase();

        // Scrolling
        if (lower.includes("scroll down")) return { type: "SCROLL", direction: "down" };
        if (lower.includes("scroll up")) return { type: "SCROLL", direction: "up" };
        if (lower.includes("scroll to top")) return { type: "SCROLL", direction: "top" };
        if (lower.includes("scroll to bottom")) return { type: "SCROLL", direction: "bottom" };

        // Navigation
        if (lower.includes("go back")) return { type: "NAVIGATE", direction: "back" };
        if (lower.includes("go forward")) return { type: "NAVIGATE", direction: "forward" };
        if (lower.includes("refresh") || lower.includes("reload")) return { type: "NAVIGATE", direction: "reload" };

        // Tabs
        if (lower.includes("new tab")) return { type: "TAB", action: "new" };
        if (lower.includes("close tab")) return { type: "TAB", action: "close" };

        // Simple Search (only if explicitly "search for X")
        if (lower.startsWith("search for ")) {
            const query = lower.replace("search for ", "");
            return { type: "SEARCH", query: query };
        }

        // Autofill logic remains useful as a quick shortcut
        if (lower.includes("fill this form") || lower.includes("autofill") || lower.includes("fill form")) {
            return { type: "FILL_FORM" };
        }

        // ⚡ FALLBACK: Direct Click Action (Bypasses LLM for speed & reliability)
        // If the user says "click X" or "play X", we just try to click it.
        if (lower.startsWith("click ") || lower.startsWith("play ") || lower.startsWith("select ")) {
            const target = lower.replace(/^(click|play|select)\s+(on\s+)?/, "").trim();
            if (target.length > 0) {
                return { type: "CLICK", target: target };
            }
        }

        return null;
    }

    async _executeAction(action) {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return { status: "error", message: "No active tab" };

        switch (action.type) {
            case "SCROLL":
                try {
                    await chrome.tabs.sendMessage(tab.id, { action: "scroll", direction: action.direction });
                    return { status: "success", message: `Scrolled ${action.direction}` };
                } catch (e) {
                    return { status: "error", message: "Page not ready. Refresh the tab." };
                }

            case "NAVIGATE":
                if (action.direction === "back") await chrome.tabs.goBack(tab.id);
                if (action.direction === "forward") await chrome.tabs.goForward(tab.id);
                if (action.direction === "reload") await chrome.tabs.reload(tab.id);
                return { status: "success", message: "Navigated" };

            case "TAB":
                if (action.action === "new") await chrome.tabs.create({});
                if (action.action === "close") await chrome.tabs.remove(tab.id);
                return { status: "success", message: "Tab action executed" };

            case "SEARCH":
                await chrome.tabs.update(tab.id, { url: `https://www.google.com/search?q=${encodeURIComponent(action.query)}` });
                return { status: "success", message: `Searching for ${action.query}` };

            case "open_url":
                await chrome.tabs.create({ url: action.url });
                return { status: "success", message: `Opening ${action.url}` };

            case "FILL_FORM":
                const data = await chrome.storage.local.get(['userProfile']);
                const profile = data.userProfile || {};

                if (Object.keys(profile).length === 0) {
                    return { status: "warning", message: "No profile found. Please save one in settings." };
                }

                try {
                    const response = await chrome.tabs.sendMessage(tab.id, { action: "fillForm", profile: profile });
                    return { status: "success", message: `Filled ${response.filled} fields.` };
                } catch (e) {
                    return { status: "error", message: "Page not ready. Refresh the tab." };
                }

            case "CLICK":
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, { action: "click", target: action.target });
                    if (response.status === "error") return { status: "error", message: `Could not find "${action.target}".` };
                    return { status: "success", message: `Clicked "${action.target}".` };
                } catch (e) {
                    return { status: "error", message: "Page not ready. Refresh tab." };
                }

            case "READ":
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, { action: "getText" });
                    return { status: "success", text: response.text };
                } catch (e) { return { status: "error", message: "Page not ready." }; }

            case "type":
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, {
                        action: "type",
                        target: action.target,
                        text: action.text
                    });
                    if (response.status === "error") return { status: "warning", message: response.message };
                    return { status: "success", message: `Typed "${action.text}"` };
                } catch (e) { return { status: "error", message: "Page not ready." }; }

            case "WAIT":
                await new Promise(r => setTimeout(r, action.ms || 2000));
                return { status: "success", message: "Waited." };
        }
    }

    async _callLocalLLM(command, baseUrl) {
        // Ensure URL points to the generate endpoint
        let url = baseUrl || OLLAMA_DEFAULT_URL;
        if (!url.endsWith('/api/generate') && !url.endsWith('/api/chat')) {
            url = url.replace(/\/$/, "") + "/api/generate";
        }

        console.log("Calling Ollama at:", url);

        const schema = `{
            "intent": "SEARCH | CLICK | SCROLL | CHAT | UNKNOWN",
            "response": "string (only for CHAT)",
            "steps": [
                {"action": "OPEN_URL", "url": "string"},
                {"action": "WAIT", "ms": number},
                {"action": "CLICK", "selector": "string"},
                {"action": "SEARCH", "query": "string"},
                {"action": "READ"},
                {"action": "TYPE", "selector": "string", "text": "string"}
            ]
        }`;

        const prompt = `You are Jarvis, a browser automation assistant. User: "${command}".
        
        STRICT DECISION RULES:
        1. CHAT / GREETING -> {"intent": "CHAT", "response": "..."}
        2. GOOGLE SEARCH ("Search for X", "Who is...") -> {"intent": "SEARCH", "steps": [{"action": "SEARCH", "query": "..."}]}
        3. OPEN SITE ("Open YouTube", "Go to Google") -> {"intent": "CLICK", "steps": [{"action": "OPEN_URL", "url": "..."}]}
        
        4. PAGE INTERACTION ("Click X", "Play X", "Select X", "Next Page"):
           - Use this when the user wants to interact with the CURRENT page.
           - Return {"intent": "CLICK", "steps": [{"action": "CLICK", "selector": "X"}]}
           
        5. COMPLEX ACTIONS (The "Beast" Mode):
           - "Search for X on YouTube/Amazon/etc"
           - PATTERN: OPEN_URL -> WAIT -> TYPE -> CLICK (or ENTER)
           
           EXAMPLE: "Play Shape of You on YouTube"
           {
             "intent": "CLICK",
             "steps": [
               {"action": "OPEN_URL", "url": "youtube.com"},
               {"action": "WAIT", "ms": 5000},
               {"action": "TYPE", "selector": "Search", "text": "Shape of You"},
               {"action": "WAIT", "ms": 500},
               {"action": "CLICK", "selector": "Search"}, 
               {"action": "WAIT", "ms": 3000},
               {"action": "CLICK", "selector": "Shape of You"}
             ]
           }

        6. SUMMARIZE / READ
           - Return {"intent": "READ", "steps": [{"action": "READ"}]}
        
        IMPORTANT:
        - "selector" for TYPE/CLICK should be the placeholder text, aria-label, or visual text of the element.
        - ALWAYS start with OPEN_URL if the user is not already on that site.
        - JSON ONLY. NO MARKDOWN. NO EXPLANATION.
        
        Return JSON using this schema: ${schema}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "mistral",
                prompt: prompt,
                stream: false,
                format: "json"
            })
        });

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error("Ollama CORS Blocked. Run: set OLLAMA_ORIGINS=\"*\"");
            }
            throw new Error(`Ollama API Error (${response.status})`);
        }

        const rawText = await response.text();
        console.log("Ollama Raw Response:", rawText);

        const data = JSON.parse(rawText);

        try {
            return JSON.parse(data.response);
        } catch (e) {
            console.warn("Could not parse inner JSON:", data.response);
            return { intent: "CHAT", response: data.response };
        }
    }

    async _executePlan(plan) {
        if (plan.intent === "CHAT") {
            return { status: 'success', message: plan.response || "I heard you." };
        }
        if (plan.intent === "UNKNOWN" || !plan.steps || plan.steps.length === 0) return { status: "unknown_intent", message: "I'm not sure how to do that yet." };

        console.log("Executing Plan:", plan);

        for (const step of plan.steps) {
            // Map JSON actions to Internal Actions
            if (step.action === "SEARCH") {
                const query = step.query || step.text || "";
                await this._executeAction({ type: "SEARCH", query: query });
            }
            else if (step.action === "OPEN_URL") {
                let url = step.url || "";
                if (url && !url.startsWith("http")) url = "https://" + url;
                if (url) await this._executeAction({ type: "open_url", url: url });
            }
            else if (step.action === "CLICK") {
                const target = step.selector || step.text;
                if (target) await this._executeAction({ type: "CLICK", target: target });
            }
            else if (step.action === "TYPE") {
                // FIXED: Explicitly handle TYPE from LLM
                // LLM sends "selector" (heuristic target) and "text"
                const target = step.selector || "input";
                const text = step.text || "";

                await this._executeAction({
                    type: "type", // maps to 'type' case in _executeAction
                    target: target,
                    text: text
                });
            }
            else if (step.action === "WAIT") {
                await new Promise(r => setTimeout(r, step.ms || 2000));
            }
            else if (step.action === "READ") {
                const result = await this._executeAction({ type: "READ" });
                const pageText = result.text || "";

                if (pageText.length < 50) {
                    return { status: "warning", message: "Page content seems empty. \n\n⚠️ TIP: Did you reload the extension? You MUST also reload the Wikipedia/Webpage tab for the new code to work!" };
                }

                console.log("Read page. Summarizing...");

                // Call LLM specifically for summary using the stored settings
                const llmUrl = this.settings?.llmUrl || OLLAMA_DEFAULT_URL;
                const cleanUrl = llmUrl.endsWith('/api/generate') ? llmUrl : llmUrl.replace(/\/$/, "") + '/api/generate';

                const summaryPrompt = `Task: Summarize the following text in 3 concise sentences for the user.\n\nTEXT: "${pageText.substring(0, 4000)}"\n\nJSON Response: {"response": "YOUR_SUMMARY_HERE"}`;

                try {
                    const response = await fetch(cleanUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            model: "mistral",
                            prompt: summaryPrompt,
                            stream: false,
                            format: "json"
                        })
                    });
                    const data = await response.json();
                    let summary = "";
                    try {
                        const searchRes = JSON.parse(data.response);
                        summary = searchRes.response || data.response;
                    } catch (e) {
                        summary = JSON.parse(data.response)?.response || data.response;
                    }
                    if (!summary) summary = data.response;

                    return { status: "success", message: "📝 Summary: " + summary };
                } catch (e) {
                    console.error("Summary failed", e);
                    return { status: "warning", message: "I read the page but couldn't get the summary from AI. \nRaw Text: " + pageText.substring(0, 200) + "..." };
                }
            }
            else if (step.action === "fill_form" || (step.action === "TYPE" && plan.intent === "AUTOFILL_FORM")) {
                if (plan.intent === "AUTOFILL_FORM") {
                    await this._executeAction({ type: "FILL_FORM" });
                    break;
                }
            }

            // Add slight usage delay
            await new Promise(r => setTimeout(r, 500));
        }

        return { status: "success", message: "I've completed the task.", plan: plan };
    }
}
