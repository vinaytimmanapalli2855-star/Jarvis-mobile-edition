
/* ==========================================
       J.A.R.V.I.S MOBILE EDITION
          OPTIMIZED AI ENGINE
========================================== */

// 1. CONFIGURATION
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const CACHE_KEY = "jarvis_flash_models";
const CACHE_TIME = 6 * 60 * 60 * 1000; // 6 hours
const MAX_MODELS_TO_TRY = 3;

let API_KEY = localStorage.getItem("jarvis_key") || "";

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:") || "";
  API_KEY = API_KEY.trim();

  if (API_KEY) {
    localStorage.setItem("jarvis_key", API_KEY);
  }
}

// 2. MEMORY
let history = [];

try {
  history = JSON.parse(
    localStorage.getItem("jarvis_memory") || "[]"
  );

  if (!Array.isArray(history)) history = [];
} catch {
  history = [];
}

// Keep only text history.
// Old saved image data is discarded to reduce storage and lag.
history = history
  .filter(m =>
    ["user", "model"].includes(m.role) &&
    Array.isArray(m.parts)
  )
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
    localStorage.setItem(
      "jarvis_memory",
      JSON.stringify(history.slice(-12))
    );
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
      const lower = name.toLowerCase();

      return (
        lower.includes("gemini") &&
        lower.includes("flash") &&
        !lower.includes("2.0") &&
        !lower.includes("embedding") &&
        !lower.includes("tts") &&
        !lower.includes("image")
      );
    })
    .sort((a, b) => {
      // Prefer Flash Lite for speed.
      const aLite = a.toLowerCase().includes("flash-lite");
      const bLite = b.toLowerCase().includes("flash-lite");

      if (aLite !== bLite) {
        return aLite ? -1 : 1;
      }

      // Prefer newer numbered versions.
      const getVersion = name => {
        const match = name.match(/gemini-(\d+(?:\.\d+)?)/i);
        return match ? parseFloat(match[1]) : 0;
      };

      return getVersion(b) - getVersion(a);
    });
}

function getCachedModels() {
  try {
    const cached = JSON.parse(
      localStorage.getItem(CACHE_KEY) || "null"
    );

    if (
      cached &&
      Array.isArray(cached.models) &&
      Date.now() - cached.time < CACHE_TIME
    ) {
      return cached.models;
    }
  } catch {}

  return [];
}

function cacheModels(models) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        models,
        time: Date.now()
      })
    );
  } catch {}
}

async function discoverModels() {
  if (availableModels.length) {
    return availableModels;
  }

  // Use cached models when available.
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
      {
        signal: AbortSignal.timeout(15000)
      }
    );
  } catch (error) {
    throw new Error(
      "Could not connect to Google. Check your internet connection and try again."
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || `Model discovery failed: ${response.status}`
    );
  }

  const supported = (data.models || [])
    .filter(model =>
      (model.supportedGenerationMethods || [])
        .includes("generateContent")
    )
    .map(model => model.name.replace(/^models\//, ""));

  availableModels = rankModels(supported).slice(
    0,
    MAX_MODELS_TO_TRY
  );

  if (!availableModels.length) {
    throw new Error(
      "No supported Gemini Flash model found. Check your API access."
    );
  }

  cacheModels(availableModels);

  console.log("Available JARVIS models:", availableModels);

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

const chatBox = $(
  "#chat", "#chatBox", "#chat-box",
  "#messages", ".chat-box", ".chat-messages"
);

const input = $(
  "#msg", "#userInput", "#user-input",
  "#messageInput", "#message",
  "textarea", "input[type='text']"
);

const sendButton = $(
  "#send", "#sendBtn", "#send-btn",
  "#sendButton", ".send-btn"
);

const micButton = $(
  "#mic-btn", "#micBtn", "#micButton"
);

const cameraButton = $(
  "#cam-btn", "#cameraBtn",
  "#camera-btn", "#cameraButton"
);

const clearButton = $(
  "#clear-btn", "#clearBtn",
  "#clear-button", "#clearButton"
);

const imageInput = $(
  "#img-input", "#imageInput", "#image-input"
);

// 5. SYSTEM STATUS
function setStatus(name, value) {
  console.log(name + ": " + value);

  document.querySelectorAll(".status .row").forEach(row => {
    const label = row.querySelector("span");

    if (
      label &&
      label.textContent.toUpperCase().includes(name)
    ) {
      const status = row.querySelector("b");

      if (status) {
        status.textContent =
          (value === "ONLINE" || value === "READY")
            ? "● " + value
            : "○ " + value;

        status.className =
          (value === "ONLINE" || value === "READY")
            ? "on"
            : "off";
      }
    }
  });
}

// 6. CHAT DISPLAY
function addMessage(sender, message) {
  if (!chatBox) {
    console.error("Chat container not found");
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "msg" +
    (sender === "YOU" ? " user" : "");

  const heading = document.createElement("strong");
  heading.textContent = sender + ": ";

  const content = document.createElement("span");
  content.textContent = message;

  wrapper.append(heading, content);
  chatBox.appendChild(wrapper);

  chatBox.scrollTop = chatBox.scrollHeight;
}

// 7. VOICE OUTPUT
function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-IN";
  speech.rate = 1;
  speech.pitch = 0.9;
  speech.volume = 1;

  window.speechSynthesis.speak(speech);
}

// 8. GEMINI API
async function askGemini(promptText, imageData = null) {
  if (!API_KEY) {
    throw new Error("Gemini API key is missing.");
  }

  // Discover models only when the first message is sent.
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

  const contents = [
    ...history,
    {
      role: "user",
      parts
    }
  ];

  let lastError;

  for (const model of models) {
    try {
      const response = await fetch(
        `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            system_instruction: {
              parts: [{
                text: `You are J.A.R.V.I.S., an intelligent mobile AI assistant.
Your name is JARVIS.
Be helpful, professional, friendly and concise.
Respond naturally and clearly.
Analyze images when provided.
Never claim to perform actions you cannot actually perform.`
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

      if (!answer) {
        throw new Error("Gemini returned an empty response.");
      }

      activeModel = model;

      // Never store image base64 in browser memory.
      history.push(
        {
          role: "user",
          parts: [{
            text: imageData
              ? promptText + " [Image attached]"
              : promptText
          }]
        },
        {
          role: "model",
          parts: [{ text: answer }]
        }
      );

      history = history.slice(-12);
      saveMemory();

      console.log("JARVIS active model:", activeModel);

      return answer;

    } catch (error) {
      console.error("Model failed:", model, error);
      lastError = error;

      // Don't retry invalid keys or permission errors.
      if (
        error.status === 401 ||
        error.status === 403 ||
        /API_KEY_INVALID|API key not valid/i.test(error.message)
      ) {
        throw error;
      }

      // Try the next supported Flash model.
    }
  }

  throw lastError || new Error("All available Flash models failed.");
}

// 9. COMMAND SYSTEM
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
    window.open(
      "https://www.google.com/search?q=" +
      encodeURIComponent(text.slice(7)),
      "_blank"
    );

    addMessage("JARVIS", "Opening Google search.");
    return true;
  }

  if (command.startsWith("youtube ")) {
    window.open(
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(text.slice(8)),
      "_blank"
    );

    addMessage("JARVIS", "Opening YouTube.");
    return true;
  }

  if (
    command === "time" ||
    command === "what time is it"
  ) {
    const answer = new Date().toLocaleTimeString();

    addMessage("JARVIS", "Current time: " + answer);
    speak("The current time is " + answer);

    return true;
  }

  if (
    command === "date" ||
    command === "today's date"
  ) {
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
    if (input && customText === null) {
      input.value = "";
    }
    return;
  }

  if (input && customText === null) {
    input.value = "";
  }

  addMessage("YOU", message || "Analyze this image.");

  busy = true;

  if (sendButton) sendButton.disabled = true;

  setStatus("AI", "PROCESSING");

  try {
    const answer = await askGemini(
      message || "Describe this image.",
      imageData
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

    if (sendButton) {
      sendButton.disabled = false;
    }
  }
}

// 11. SEND BUTTON
if (sendButton) {
  sendButton.addEventListener("click", () => {
    sendMessage();
  });
}

if (input) {
  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
}

// 12. MICROPHONE
const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (micButton) {
  micButton.addEventListener("click", () => {
    if (!SpeechRecognition) {
      addMessage(
        "JARVIS",
        "Speech recognition is not supported in this browser."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      addMessage("JARVIS", "Listening...");
      setStatus("VOICE", "LISTENING");
    };

    recognition.onresult = event => {
      const spokenText =
        event.results[0][0].transcript;

      if (input) input.value = spokenText;

      sendMessage(spokenText);
    };

    recognition.onerror = event => {
      addMessage("JARVIS", "Voice error: " + event.error);
    };

    recognition.onend = () => {
      setStatus("VOICE", "READY");
    };

    recognition.start();
  });
}

// 13. CAMERA / IMAGE ANALYSIS
if (cameraButton && imageInput) {
  cameraButton.addEventListener("click", () => {
    imageInput.click();
  });
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

        reader.onload = () => {
          const base64 = reader.result.split(",")[1];

          resolve({
            type: file.type,
            data: base64
          });
        };

        reader.onerror = () => {
          reject(new Error("Could not read the image."));
        };

        reader.readAsDataURL(file);
      });

      await sendMessage(
        "Analyze this image and describe what you see.",
        data
      );

    } catch (error) {
      addMessage("JARVIS", "Image error: " + error.message);
    }

    imageInput.value = "";
  });
}

// 14. CLEAR MEMORY BUTTON
if (clearButton) {
  clearButton.addEventListener("click", () => {
    if (confirm("Clear all JARVIS conversation memory?")) {
      history = [];
      saveMemory();

      if (chatBox) {
        chatBox.innerHTML = "";
      }

      addMessage("JARVIS", "Memory cleared.");
    }
  });
}

// 15. FAST INITIALIZATION
function initializeJarvis() {
  setStatus(
    "NETWORK",
    navigator.onLine ? "ONLINE" : "OFFLINE"
  );

  setStatus(
    "VOICE",
    SpeechRecognition ? "READY" : "UNAVAILABLE"
  );

  setStatus("MEMORY", "ACTIVE");

  window.addEventListener("online", () => {
    setStatus("NETWORK", "ONLINE");
  });

  window.addEventListener("offline", () => {
    setStatus("NETWORK", "OFFLINE");
  });

  if (!API_KEY) {
    addMessage(
      "JARVIS",
      "API key missing. Reload and enter your Gemini API key."
    );
    return;
  }

  // No model discovery or Google API request at startup.
  setStatus("AI", "ONLINE");

  addMessage(
    "JARVIS",
    "J.A.R.V.I.S CORE ONLINE. Ready for your command."
  );
}

initializeJarvis();
