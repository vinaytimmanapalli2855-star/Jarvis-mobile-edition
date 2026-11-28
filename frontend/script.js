
/* ==========================================
       J.A.R.V.I.S MOBILE EDITION
          STABLE AI ENGINE
========================================== */

// 1. CONFIGURATION
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CACHE_KEY = "jarvis_flash_models";
const CACHE_TIME = 6 * 60 * 60 * 1000;
const MAX_MODELS_TO_TRY = 3;

let API_KEY = localStorage.getItem("jarvis_key") || "";

if (!API_KEY) {
    API_KEY = (prompt("Enter your Gemini API Key:") || "").trim();
    if (API_KEY) localStorage.setItem("jarvis_key", API_KEY);
}

// 2. MEMORY
let history = [];

try {
    history = JSON.parse(localStorage.getItem("jarvis_memory") || "[]");
    if (!Array.isArray(history)) history = [];
} catch {
    history = [];
}

history = history
    .filter(m => ["user", "model"].includes(m.role) && Array.isArray(m.parts))
    .map(m => ({
        role: m.role,
        parts: m.parts
            .filter(p => typeof p.text === "string")
            .map(p => ({ text: p.text }))
    }))
    .filter(m => m.parts.length)
    .slice(-12);

function saveMemory() {
    try {
        localStorage.setItem("jarvis_memory", JSON.stringify(history.slice(-12)));
    } catch (error) {
        console.warn("Memory storage error:", error);
    }
}

// 3. MODEL DISCOVERY
let activeModel = null;
let availableModels = [];

function rankModels(models) {
    return models
        .filter(name => {
            const n = name.toLowerCase();
            return n.includes("gemini") &&
                n.includes("flash") &&
                !n.includes("embedding") &&
                !n.includes("tts") &&
                !n.includes("image");
        })
        .sort((a, b) => {
            const av = a.match(/gemini-(\d+(?:\.\d+)?)/i);
            const bv = b.match(/gemini-(\d+(?:\.\d+)?)/i);
            return (bv ? parseFloat(bv[1]) : 0) -
                   (av ? parseFloat(av[1]) : 0);
        });
}

function getCachedModels() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (cached && Array.isArray(cached.models) &&
            Date.now() - cached.time < CACHE_TIME) {
            return cached.models;
        }
    } catch {}
    return [];
}

function cacheModels(models) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            models,
            time: Date.now()
        }));
    } catch {}
}

async function discoverModels() {
    if (availableModels.length) return availableModels;

    const cached = getCachedModels();
    if (cached.length) {
        availableModels = cached;
        return availableModels;
    }

    if (!navigator.onLine) {
        throw new Error("You are offline. Check your internet connection.");
    }

    let response;

    try {
        response = await fetch(
            `${API_BASE}/models?key=${encodeURIComponent(API_KEY)}`,
            { signal: AbortSignal.timeout(15000) }
        );
    } catch {
        throw new Error("Could not connect to Google. Check your internet.");
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || `HTTP ${response.status}`);
    }

    const supported = (data.models || [])
        .filter(model =>
            (model.supportedGenerationMethods || []).includes("generateContent")
        )
        .map(model => model.name.replace(/^models\//, ""));

    availableModels = rankModels(supported).slice(0, MAX_MODELS_TO_TRY);

    if (!availableModels.length) {
        throw new Error("No supported Gemini Flash model found.");
    }

    cacheModels(availableModels);
    return availableModels;
}

// 4. UI ELEMENTS
const $ = (...selectors) => {
    for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) return element;
    }
    return null;
};

const chatBox = $("#chat", "#chatBox", "#chat-box", "#messages",
    ".chat-box", ".chat-messages");

const input = $("#msg", "#userInput", "#user-input",
    "#messageInput", "#message", "textarea", "input[type='text']");

const sendButton = $("#send", "#sendBtn", "#send-btn",
    "#sendButton", ".send-btn");

const micButton = $("#mic-btn", "#micBtn", "#micButton");
const cameraButton = $("#cam-btn", "#cameraBtn", "#camera-btn", "#cameraButton");
const clearButton = $("#clear-btn", "#clearBtn", "#clear-button", "#clearButton");
const imageInput = $("#img-input", "#imageInput", "#image-input");

// 5. STATUS
function setStatus(name, value) {
    console.log(name + ": " + value);

    document.querySelectorAll(".status .row").forEach(row => {
        const label = row.querySelector("span");

        if (label && label.textContent.toUpperCase().includes(name)) {
            const status = row.querySelector("b");

            if (status) {
                status.textContent =
                    (value === "ONLINE" || value === "READY")
                    ? "● " + value : "○ " + value;

                status.className =
                    (value === "ONLINE" || value === "READY") ? "on" : "off";
            }
        }
    });
}

// 6. CHAT DISPLAY
function addMessage(sender, message) {
    if (!chatBox) {
        console.error("JARVIS: Chat container not found.");
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "msg" + (sender === "YOU" ? " user" : "");

    const heading = document.createElement("strong");
    heading.textContent = sender + ": ";

    const content = document.createElement("span");
    content.textContent = String(message);

    wrapper.append(heading, content);
    chatBox.appendChild(wrapper);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// 7. VOICE OUTPUT
function speak(text) {
    if (!text) return;

    if (window.AndroidJarvis &&
        typeof window.AndroidJarvis.speak === "function") {
        try {
            window.AndroidJarvis.speak(String(text));
            return;
        } catch (error) {
            console.error("Android voice error:", error);
        }
    }

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const speech = new SpeechSynthesisUtterance(String(text));
        speech.lang = "en-IN";
        speech.rate = 1;
        speech.pitch = 0.9;
        window.speechSynthesis.speak(speech);
    }
}

// 8. GEMINI API
async function askGemini(promptText, imageData = null) {
    if (!API_KEY) throw new Error("Gemini API key is missing.");

    const models = await discoverModels();
    const parts = [{ text: promptText }];

    if (imageData) {
        parts.push({
            inline_data: {
                mime_type: imageData.type,
                data: imageData.data
            }
        });
    }

    const contents = [...history, { role: "user", parts }];
    let lastError;

    for (const model of models) {
        try {
            const response = await fetch(
                `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    signal: AbortSignal.timeout(30000),
                    body: JSON.stringify({
                        system_instruction: {
                            parts: [{
                                text: "You are J.A.R.V.I.S., an intelligent mobile AI assistant. Be helpful, professional, friendly and concise. Analyze images when provided. Never claim to perform actions you cannot perform."
                            }]
                        },
                        contents,
                        generationConfig: {
                            temperature: 0.7,
                            maxOutputTokens: 2048
                        }
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                const error = new Error(
                    result.error?.message || `HTTP ${response.status}`
                );
                error.status = response.status;
                throw error;
            }

            const answer = result.candidates?.[0]?.content?.parts
                ?.map(p => p.text || "")
                .join("")
                .trim();

            if (!answer) throw new Error("Gemini returned an empty response.");

            activeModel = model;

            history.push(
                { role: "user", parts: [{ text: imageData ?
                    promptText + " [Image attached]" : promptText }] },
                { role: "model", parts: [{ text: answer }] }
            );

            history = history.slice(-12);
            saveMemory();

            console.log("Active model:", activeModel);
            return answer;

        } catch (error) {
            console.error("Model failed:", model, error);
            lastError = error;

            if (error.status === 401 || error.status === 403 ||
                /API_KEY_INVALID|API key not valid/i.test(error.message)) {
                throw error;
            }
        }
    }

    throw lastError || new Error("All available models failed.");
}

// 9. COMMANDS
function handleCommand(text) {
    const command = text.toLowerCase().trim();

    if (command === "clear memory") {
        history = [];
        saveMemory();
        addMessage("JARVIS", "Memory cleared successfully.");
        return true;
    }

    if (command === "change api key") {
        const newKey = prompt("Enter your new Gemini API key:");

        if (newKey && newKey.trim()) {
            API_KEY = newKey.trim();
            localStorage.setItem("jarvis_key", API_KEY);
            activeModel = null;
            availableModels = [];
            localStorage.removeItem(CACHE_KEY);
            addMessage("JARVIS", "API key updated.");
        }
        return true;
    }

    if (command.startsWith("google ")) {
        window.open("https://www.google.com/search?q=" +
            encodeURIComponent(text.slice(7)), "_blank");
        addMessage("JARVIS", "Opening Google search.");
        return true;
    }

    if (command.startsWith("youtube ")) {
        window.open("https://www.youtube.com/results?search_query=" +
            encodeURIComponent(text.slice(8)), "_blank");
        addMessage("JARVIS", "Opening YouTube.");
        return true;
    }

    if (command === "time" || command === "what time is it") {
        const answer = new Date().toLocaleTimeString();
        addMessage("JARVIS", "Current time: " + answer);
        speak("The current time is " + answer);
        return true;
    }

    if (command === "date" || command === "today's date") {
        const answer = new Date().toLocaleDateString();
        addMessage("JARVIS", "Today's date: " + answer);
        speak("Today's date is " + answer);
        return true;
    }

    return false;
}

// 10. SEND MESSAGE
let busy = false;

async function sendMessage(customText = null, imageData = null) {
    if (busy) return;

    const message = (
        customText !== null ? customText : input?.value
    )?.trim() || "";

    if (!message && !imageData) return;

    if (!API_KEY) {
        addMessage("JARVIS", "Please enter your Gemini API key.");
        return;
    }

    if (!imageData && handleCommand(message)) {
        if (input && customText === null) input.value = "";
        return;
    }

    if (input && customText === null) input.value = "";

    addMessage("YOU", message || "Analyze this image.");

    busy = true;
    if (sendButton) sendButton.disabled = true;
    setStatus("AI", "PROCESSING");

    try {
        const answer = await askGemini(
            message || "Describe this image.", imageData
        );

        addMessage("JARVIS", answer);
        speak(answer);
        setStatus("AI", "ONLINE");

    } catch (error) {
        console.error("JARVIS ERROR:", error);
        addMessage("JARVIS", "ERROR: " + error.message);
        setStatus("AI", "ERROR");

    } finally {
        busy = false;
        if (sendButton) sendButton.disabled = false;
    }
}

// 11. SEND BUTTON
function connectControls() {
    console.log("JARVIS script loaded.");
    console.log("Send button:", sendButton);
    console.log("Chat box:", chatBox);

    if (!sendButton) {
        console.error("JARVIS ERROR: Send button not found.");
        return;
    }

    sendButton.addEventListener("click", () => {
        console.log("Send button clicked.");
        sendMessage();
    });

    if (input) {
        input.addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendMessage();
            }
        });
    }
}

// 12. SPEECH RECOGNITION
const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

let continuousVoiceMode = false;

function startJarvisListening() {
    if (!continuousVoiceMode || busy) return;

    if (window.AndroidJarvis &&
        typeof window.AndroidJarvis.startListening === "function") {
        setStatus("VOICE", "LISTENING");
        window.AndroidJarvis.startListening();
    }
}

window.onAndroidSpeechResult = function(spokenText) {
    if (!spokenText) return;

    const command = spokenText.toLowerCase().trim();

    if (command === "stop listening" ||
        command === "stop conversation") {
        continuousVoiceMode = false;
        setStatus("VOICE", "READY");
        addMessage("JARVIS", "Continuous listening stopped.");
        return;
    }

    if (input) input.value = spokenText;
    setStatus("VOICE", "PROCESSING");
    sendMessage(spokenText);
};

window.onAndroidSpeechError = function(message) {
    addMessage("JARVIS", "Voice error: " + message);
    setStatus("VOICE", "ERROR");
    continuousVoiceMode = false;
};

window.onAndroidSpeechFinished = function() {
    if (continuousVoiceMode) startJarvisListening();
};

if (micButton) {
    micButton.addEventListener("click", () => {
        continuousVoiceMode = !continuousVoiceMode;

        if (continuousVoiceMode) {
            addMessage("JARVIS", "Continuous voice mode activated.");
            startJarvisListening();
        } else {
            setStatus("VOICE", "READY");
            addMessage("JARVIS", "Continuous voice mode stopped.");
        }
    });
}

// 13. CAMERA
if (cameraButton && imageInput) {
    cameraButton.addEventListener("click", () => imageInput.click());
}

if (imageInput) {
    imageInput.addEventListener("change", async () => {
        const file = imageInput.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            addMessage("JARVIS", "Please select an image.");
            imageInput.value = "";
            return;
        }

        try {
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();

                reader.onload = () => resolve({
                    type: file.type,
                    data: reader.result.split(",")[1]
                });

                reader.onerror = () =>
                    reject(new Error("Could not read the image."));

                reader.readAsDataURL(file);
            });

            await sendMessage(
                "Analyze this image and describe what you see.", data
            );

        } catch (error) {
            addMessage("JARVIS", "Image error: " + error.message);
        }

        imageInput.value = "";
    });
}

// 14. CLEAR MEMORY
if (clearButton) {
    clearButton.addEventListener("click", () => {
        if (confirm("Clear all JARVIS conversation memory?")) {
            history = [];
            saveMemory();

            if (chatBox) chatBox.innerHTML = "";

            addMessage("JARVIS", "Memory cleared.");
        }
    });
}

// 15. WHATSAPP NOTIFICATION DISPLAY
window.onWhatsAppMessageReceived = function(sender, message) {
    addMessage(
        "JARVIS",
        "WhatsApp message from " + sender + ": " + message
    );
};

// 16. INITIALIZATION
function initializeJarvis() {
    setStatus("NETWORK", navigator.onLine ? "ONLINE" : "OFFLINE");
    setStatus("VOICE", "READY");
    setStatus("MEMORY", "ACTIVE");

    window.addEventListener("online", () => setStatus("NETWORK", "ONLINE"));
    window.addEventListener("offline", () => setStatus("NETWORK", "OFFLINE"));

    connectControls();

    if (!API_KEY) {
        addMessage("JARVIS",
            "API key missing. Reload and enter your Gemini API key.");
        return;
    }

    setStatus("AI", "ONLINE");
    addMessage("JARVIS", "J.A.R.V.I.S CORE ONLINE. Ready for your command.");
}

initializeJarvis();
