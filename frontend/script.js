
/* ==========================================
       J.A.R.V.I.S MOBILE EDITION
          COMPLETE AI ENGINE
========================================== */

// 1. CONFIGURATION
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
];

let API_KEY = localStorage.getItem("jarvis_key") || "";

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");
  if (API_KEY) {
    API_KEY = API_KEY.trim();
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

history = history.filter(
  m => ["user", "model"].includes(m.role) &&
       Array.isArray(m.parts)
).slice(-12);

function saveMemory() {
  localStorage.setItem(
    "jarvis_memory",
    JSON.stringify(history.slice(-12))
  );
}

// 3. MODEL DISCOVERY
let activeModel = null;

async function discoverModels() {
  try {
    const response = await fetch(
      `${API_BASE}/models?key=${encodeURIComponent(API_KEY)}`
    );

    if (!response.ok) {
      throw new Error("API key or model access error");
    }

    const data = await response.json();

    const available = (data.models || [])
      .filter(m =>
        (m.supportedGenerationMethods || [])
          .includes("generateContent")
      )
      .map(m => m.name.replace("models/", ""));

    activeModel =
      MODELS.find(m => available.includes(m)) ||
      available.find(m => m.includes("flash")) ||
      null;

    if (!activeModel) {
      throw new Error("No compatible Gemini Flash model found");
    }

    console.log("JARVIS model:", activeModel);
    setStatus("AI", "ONLINE");

    return activeModel;

  } catch (error) {
    console.error("Model discovery:", error);
    setStatus("AI", "ERROR");
    throw error;
  }
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
  "#chatBox", "#chat-box", "#messages",
  ".chat-box", ".chat-messages"
);

const input = $(
  "#userInput", "#user-input", "#messageInput",
  "#message", "textarea", "input[type='text']"
);

const sendButton = $(
  "#sendBtn", "#send-btn", "#sendButton",
  ".send-btn", "button[type='submit']"
);

const micButton = $(
  "#micBtn", "#mic-btn", "#micButton"
);

const cameraButton = $(
  "#cameraBtn", "#camera-btn", "#cameraButton"
);

const clearButton = $(
  "#clearBtn", "#clear-btn", "#clearButton"
);

// 5. SYSTEM STATUS
function setStatus(name, value) {
  console.log(name + ": " + value);

  const rows = document.querySelectorAll(
    ".status-row, .status-item"
  );

  rows.forEach(row => {
    if (row.textContent.toUpperCase().includes(name)) {
      const status = row.querySelector(
        ".status-value, .status-text"
      );

      if (status) status.textContent = value;
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

  wrapper.style.cssText = `
    padding:10px;
    margin:8px 0;
    border-left:3px solid #00ffff;
    background:rgba(0,255,255,0.06);
    color:#70ffff;
    white-space:pre-wrap;
    overflow-wrap:anywhere;
    font-family:inherit;
  `;

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
async function askGemini(prompt, imageData = null) {
  if (!API_KEY) {
    throw new Error("Gemini API key is missing");
  }

  if (!activeModel) {
    await discoverModels();
  }

  const parts = [{ text: prompt }];

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

  const modelsToTry = [
    activeModel,
    ...MODELS.filter(m => m !== activeModel)
  ];

  let lastError;

  for (const model of modelsToTry) {
    try {
      const response = await fetch(
        `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [{
                text: `You are J.A.R.V.I.S., an intelligent mobile AI assistant.
You are helpful, professional, friendly and concise.
Your name is JARVIS.
Respond naturally and clearly.
You can analyze images when provided.
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
        throw new Error(
          result.error?.message || `HTTP ${response.status}`
        );
      }

      const answer =
        result.candidates?.[0]?.content?.parts
          ?.map(p => p.text || "")
          .join("")
          .trim();

      if (!answer) {
        throw new Error("Gemini returned an empty response");
      }

      activeModel = model;

      history.push(
        { role: "user", parts },
        { role: "model", parts: [{ text: answer }] }
      );

      history = history.slice(-12);
      saveMemory();

      return answer;

    } catch (error) {
      console.error(model, error);
      lastError = error;

      // Don't retry authentication or permission errors.
      if (/API_KEY_INVALID|PERMISSION_DENIED|API key/i.test(error.message)) {
        throw error;
      }
    }
  }

  throw lastError || new Error("All Gemini models failed");
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
  )?.trim();

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
    const answer = await askGemini(message || "Describe this image.", imageData);

    addMessage("JARVIS", answer);
    speak(answer);

    setStatus("AI", "ONLINE");

  } catch (error) {
    console.error("JARVIS ERROR:", error);

    addMessage(
      "JARVIS",
      "ERROR: " + error.message
    );

    setStatus("AI", "ERROR");

  } finally {
    busy = false;
    if (sendButton) sendButton.disabled = false;
  }
}

// 11. SEND BUTTON
if (sendButton) {
  sendButton.addEventListener("click", () => sendMessage());
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
      addMessage("JARVIS", "Speech recognition is not supported in this browser.");
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
const imageInput = document.createElement("input");

imageInput.type = "file";
imageInput.accept = "image/*";
imageInput.capture = "environment";
imageInput.hidden = true;

document.body.appendChild(imageInput);

if (cameraButton) {
  cameraButton.addEventListener("click", () => {
    imageInput.click();
  });
}

imageInput.addEventListener("change", async () => {
  const file = imageInput.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addMessage("JARVIS", "Please select an image.");
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

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    await sendMessage("Analyze this image and describe what you see.", data);

  } catch (error) {
    addMessage("JARVIS", "Image error: " + error.message);
  }

  imageInput.value = "";
});

// 14. CLEAR MEMORY BUTTON
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

// 15. INITIALIZATION
async function initializeJarvis() {
  addMessage("JARVIS", "J.A.R.V.I.S. SYSTEM INITIALIZING...");

  setStatus("NETWORK", navigator.onLine ? "ONLINE" : "OFFLINE");
  setStatus("VOICE", SpeechRecognition ? "READY" : "UNAVAILABLE");
  setStatus("MEMORY", "ACTIVE");

  window.addEventListener("online", () => {
    setStatus("NETWORK", "ONLINE");
  });

  window.addEventListener("offline", () => {
    setStatus("NETWORK", "OFFLINE");
  });

  if (!API_KEY) {
    addMessage("JARVIS", "API key missing. Reload and enter your Gemini API key.");
    return;
  }

  try {
    await discoverModels();

    addMessage(
      "JARVIS",
      "All systems initialized. " +
      "Model: " + activeModel +
      ". At your service."
    );

  } catch (error) {
    addMessage("JARVIS", "INITIALIZATION ERROR: " + error.message);
  }
}

initializeJarvis();
  
