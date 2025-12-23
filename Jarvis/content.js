// content.js - DOM Manipulator
console.log("Jarvis Content Script Injected");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Content script received:", request);

    if (request.action === "getPageInfo") {
        sendResponse({
            title: document.title,
            url: window.location.href,
            visibleText: document.body.innerText.substring(0, 5000) // Snapshot
        });
    }

    if (request.action === "scroll") {
        window.scrollBy({
            top: request.direction === "up" ? -500 : 500,
            behavior: "smooth"
        });
        sendResponse({ status: "scrolled" });
    }

    if (request.action === "getText") {
        const bodyText = document.body.innerText || "";
        // Clean up text: remove excessive whitespace
        const cleanText = bodyText.replace(/\s+/g, ' ').trim().substring(0, 5000);
        sendResponse({ status: "success", text: cleanText });
    }

    if (request.action === "click") {
        const targetText = (request.target || "").toLowerCase();

        // Helper: visible and actionable
        const isVisible = (elem) => {
            const rect = elem.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
        };

        // Expanded selector for clickables
        // Included spans and divs that might be buttons
        const elements = Array.from(document.querySelectorAll('a, button, input[type="submit"], [role="button"], [tabindex], span, div, h3'));
        let bestMatch = null;

        for (const el of elements) {
            // Optimization: Skip non-interactive divs/spans unless they look clickable
            const style = window.getComputedStyle(el);
            if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && style.cursor !== 'pointer') continue;

            if (!isVisible(el)) continue;

            // Prioritize aria-label for icon buttons
            const text = (el.innerText || el.getAttribute('aria-label') || el.value || "").toLowerCase();

            // Skip empty elements
            if (!text.trim()) continue;

            // Exact match priority
            if (text === targetText) {
                bestMatch = el;
                break;
            }
            // Partial match
            if (text.includes(targetText)) {
                if (!bestMatch || text.length < (bestMatch.innerText || "").length) {
                    bestMatch = el;
                }
            }
        }

        if (bestMatch) {
            console.log("Jarvis Click Target:", bestMatch);
            bestMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Dispatch full event sequence for React/Vue apps
            const eventOpts = { bubbles: true, cancelable: true, view: window };
            bestMatch.dispatchEvent(new MouseEvent('mouseover', eventOpts));
            bestMatch.dispatchEvent(new MouseEvent('mousedown', eventOpts));
            bestMatch.dispatchEvent(new MouseEvent('mouseup', eventOpts));
            bestMatch.dispatchEvent(new MouseEvent('click', eventOpts));

            // Fallback native click (sometimes needed for links)
            if (bestMatch.tagName === 'A' || bestMatch.tagName === 'BUTTON' || bestMatch.tagName === 'INPUT') {
                bestMatch.click();
            }

            sendResponse({ status: "success", message: `Clicked "${targetText}"` });
        } else {
            console.warn("Jarvis could not find:", targetText);
            sendResponse({ status: "error", message: `Could not find element with text "${targetText}"` });
        }
    }

    if (request.action === "type") {
        const targetText = (request.target || "").toLowerCase();
        const typeValue = request.text || "";

        // Find best match (inputs/textareas)
        const elements = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
        let bestMatch = null;

        const isVisible = (elem) => {
            const rect = elem.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        };

        for (const el of elements) {
            if (!isVisible(el)) continue;
            // Match against placeholder, aria-label, name, or id
            const placeholder = (el.placeholder || "").toLowerCase();
            const label = (el.getAttribute('aria-label') || "").toLowerCase();
            const name = (el.name || "").toLowerCase();

            // Priority to exact placeholder match (common for "Search")
            if (placeholder === targetText || label === targetText) {
                bestMatch = el;
                break;
            }
            if (placeholder.includes(targetText) || label.includes(targetText) || name.includes(targetText)) {
                bestMatch = el;
            }
        }

        if (bestMatch) {
            bestMatch.focus();
            bestMatch.value = typeValue;
            // Dispatch events to trigger listeners (React/Vue often need these)
            bestMatch.dispatchEvent(new Event('input', { bubbles: true }));
            bestMatch.dispatchEvent(new Event('change', { bubbles: true }));

            // Try Enter key if it's a search
            // bestMatch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));

            sendResponse({ status: "success", message: `Typed "${typeValue}"` });
        } else {
            // Fallback: If no target found but only one visible input? 
            // For now, return error.
            sendResponse({ status: "error", message: `Input "${targetText}" not found` });
        }
    }

    if (request.action === "fillForm") {
        const profile = request.profile;
        let filledCount = 0;

        const inputs = document.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            const type = input.type || 'text';
            const name = (input.name || '').toLowerCase();
            const id = (input.id || '').toLowerCase();
            const placeholder = (input.placeholder || '').toLowerCase();
            const label = input.labels?.[0]?.innerText?.toLowerCase() || '';

            const context = `${name} ${id} ${placeholder} ${label}`;

            if (context.includes('name') || context.includes('user')) {
                if (profile.name) { input.value = profile.name; filledCount++; }
            } else if (context.includes('email') || context.includes('mail')) {
                if (profile.email) { input.value = profile.email; filledCount++; }
            } else if (context.includes('phone') || context.includes('tel')) {
                if (profile.phone) { input.value = profile.phone; filledCount++; }
            } else if (context.includes('address')) {
                if (profile.address) { input.value = profile.address; filledCount++; }
            }
        });

        sendResponse({ status: "success", filled: filledCount });
    }
});
