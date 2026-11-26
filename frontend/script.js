
// ==========================================
//       J.A.R.V.I.S MOBILE EDITION
//            COMPLETE AI ENGINE
// ==========================================

// 1. API KEY
let API_KEY = localStorage.getItem("jarvis_key");

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");

  if (API_KEY && API_KEY.trim()) {
    API_KEY = API_KEY.trim();
    localStorage.setItem("jarvis_key", API_KEY);
  } else {
    API_KEY = "";
  }
}

const API_URL =
  "https://generativelanguage.googleapis.com/v1beta";

// 2. HTML ELEMENTS
const chat = document.getElementById("chat");
const msg = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

if (
  !chat || !msg || !sendBtn ||
  !micBtn || !clearBtn || !camBtn || !imgInput
) {
  console.error("JARVIS: Required HTML elements are missing.");
}

// 3. MEMORY
let conversation = [];

try {
  conversation = JSON.parse(
    localStorage.getItem("jarvis_memory") || "[]"
  );

  if (!Array.isArray(conversation)) {
    conversation = [];
  }
} catch {
  conversation = [];
}

let availableModels = [];
let selectedModel = null;
let busy = false;

// 4. SYSTEM STATUS
function setStatus(index, online, label) {
  const rows = document.querySelectorAll(".status .row b");

  if (!rows[index]) return;

  rows[index].className = online ? "on" : "off";
  rows[index].textContent = online
    ? "● " + label
    : "○ " + label;
}

setStatus(0, true, "ONLINE");
setStatus(1, navigator.onLine, "ONLINE");
setStatus(2, "speechSynthesis" in window, "VOICE");
setStatus(3, true, "MEMORY");

// 5. CHAT DISPLAY
function addMessage(sender, text) {
  const item = document.createElement("div");
  item.className = "msg " + sender;

  const title = document.createElement("b");
  title.textContent =
    sender === "user" ? "YOU: " : "JARVIS: ";

  const content = document.createElement("span");
  content.textContent = text;

  item.appendChild(title);
  item.appendChild(content);

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
}

// 6. SAVE MEMORY
function saveMemory() {
  try {
    localStorage.setItem(
      "jarvis_memory",
      JSON.stringify(conversation.slice(-20))
    );
  } catch (error) {
    console.error("Memory error:", error);
  }
}

function remember(role, text) {
  conversation.push({
    role: role,
    parts: [{ text: text }]
  });

  conversation = conversation.slice(-20);
  saveMemory();
}

// 7. FIND AVAILABLE GEMINI MODELS
async function loadModels() {
  if (!API_KEY) {
    throw new Error("Gemini API key is missing.");
  }

  const response = await fetch(
    `${API_URL}/models?key=${encodeURIComponent(API_KEY)}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "Unable to load Gemini models."
    );
  }

  const models = (data.models || [])
    .filter(model =>
      model.supportedGenerationMethods?.includes(
        "generateContent"
      )
    )
    .map(model => model.name.replace("models/", ""));

  // Exclude the retired model causing your error.
  const usableModels = models.filter(model =>
    !model.includes("gemini-2.5-pro")
  );

  // Prefer Flash models for speed.
  const flashModels = usableModels.filter(model =>
    model.toLowerCase().includes("flash")
  );

  availableModels = [
    ...flashModels,
    ...usableModels.filter(model =>
      !flashModels.includes(model)
    )
  ];

  if (!availableModels.length) {
    throw new Error(
      "No usable Gemini models found. Check your API key and model access."
    );
  }

  selectedModel = availableModels[0];

  console.log("JARVIS available models:", availableModels);
  console.log("JARVIS selected model:", selectedModel);
}

// 8. CLEAN CHAT HISTORY
function getCleanHistory() {
  return conversation
    .filter(item =>
      item &&
      (item.role === "user" || item.role === "model") &&
      Array.isArray(item.parts)
    )
    .map(item => ({
      role: item.role,
      parts: item.parts
        .filter(part =>
          part && typeof part.text === "string"
        )
        .map(part => ({
          text: part.text
        }))
    }))
    .filter(item => item.parts.length > 0)
    .slice(-12);
}

// 9. GEMINI AI ENGINE
async function askGemini(text, imageData = null) {
  if (!availableModels.length) {
    await loadModels();
  }

  const parts = [{ text: text }];

  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType,
        data: imageData.data
      }
    });
  }

  const history = getCleanHistory();

  const contents = [
    ...history,
    {
      role: "user",
      parts: parts
    }
  ];

  const body = {
    systemInstruction: {
      parts: [{
        text:
          "You are J.A.R.V.I.S, a helpful and intelligent AI assistant. " +
          "Be friendly, smart, clear and concise. " +
          "Help with questions, explanations, calculations and planning. " +
          "Never claim to control a device or perform an action you cannot perform."
      }]
    },

    contents: contents,

    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  let lastError = "No Gemini model responded.";

  // Try available models one by one.
  for (const model of availableModels) {
    try {
      const response = await fetch(
        `${API_URL}/models/${model}:generateContent?key=${encodeURIComponent(API_KEY)}`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(body)
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError =
          data.error?.message || "Gemini request failed.";

        console.warn("Model failed:", model, lastError);
        continue;
      }

      const answer = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("")
        .trim();

      if (answer) {
        selectedModel = model;
        return answer;
      }

      lastError = "Gemini returned an empty response.";

    } catch (error) {
      lastError = error.message;
    }
  }

  throw new Error(lastError);
}

// 10. SPECIAL COMMANDS
async function handleCommand(text) {
  const command = text.toLowerCase().trim();

  if (
    command === "youtube" ||
    command.startsWith("open youtube")
  ) {
    window.open("https://www.youtube.com", "_blank");
    return "Opening YouTube.";
  }

  if (
    command === "google" ||
    command.startsWith("open google")
  ) {
    window.open("https://www.google.com", "_blank");
    return "Opening Google.";
  }

  if (command.startsWith("search ")) {
    const query = text.substring(7).trim();

    window.open(
      "https://www.google.com/search?q=" +
      encodeURIComponent(query),
      "_blank"
    );

    return "Searching Google for " + query;
  }

  if (command.startsWith("play ")) {
    const query = text.substring(5).trim();

    window.open(
      "https://www.youtube.com/results?search_query=" +
      encodeURIComponent(query),
      "_blank"
    );

    return "Searching YouTube for " + query;
  }

  if (command === "clear chat" || command === "forget memory") {
    conversation = [];
    saveMemory();
    chat.innerHTML = "";

    return "Conversation memory cleared.";
  }

  if (command === "change api key") {
    const key = prompt("Enter your new Gemini API key:");

    if (key && key.trim()) {
      API_KEY = key.trim();

      localStorage.setItem("jarvis_key", API_KEY);

      availableModels = [];
      selectedModel = null;

      return "API key updated. Reconnecting to Gemini.";
    }

    return "API key was not changed.";
  }

  if (command === "what time is it") {
    return "The current time is " +
      new Date().toLocaleTimeString();
  }

  if (
    command === "what is today's date" ||
    command === "what is the date"
  ) {
    return "Today's date is " +
      new Date().toLocaleDateString();
  }

  return null;
}

// 11. SEND MESSAGE
async function sendMessage() {
  const text = msg.value.trim();

  if (!text || busy) return;

  if (!API_KEY) {
    addMessage(
      "jarvis",
      "Please enter your Gemini API key."
    );
    return;
  }

  msg.value = "";

  addMessage("user", text);

  busy = true;
  sendBtn.disabled = true;
  sendBtn.textContent = "...";

  try {
    const commandResult = await handleCommand(text);

    if (commandResult !== null) {
      addMessage("jarvis", commandResult);
      speak(commandResult);

    } else {
      const answer = await askGemini(text);

      remember("user", text);
      remember("model", answer);

      addMessage("jarvis", answer);
      speak(answer);
    }

  } catch (error) {
    console.error("JARVIS ERROR:", error);

    addMessage(
      "jarvis",
      "ERROR: " + error.message
    );

  } finally {
    busy = false;
    sendBtn.disabled = false;
    sendBtn.textContent = "SEND";
  }
}

// 12. VOICE OUTPUT
function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);

  speech.lang = "en-US";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
}

// 13. VOICE INPUT
let recognition = null;

const SpeechRecognition =
  window.SpeechRecognition ||
  window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    micBtn.textContent = "🔴";
  };

  recognition.onend = () => {
    micBtn.textContent = "🎤";
  };

  recognition.onresult = event => {
    msg.value = event.results[0][0].transcript;
    sendMessage();
  };

  recognition.onerror = event => {
    addMessage(
      "jarvis",
      "Voice error: " + event.error
    );
  };
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    addMessage(
      "jarvis",
      "Voice recognition is not supported in this browser."
    );
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    console.log(error);
  }
});

// 14. CAMERA AND IMAGE ANALYSIS
camBtn.addEventListener("click", () => {
  imgInput.click();
});

imgInput.addEventListener("change", () => {
  const file = imgInput.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addMessage("jarvis", "Please select an image.");
    imgInput.value = "";
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    addMessage(
      "jarvis",
      "Please choose an image smaller than 4 MB."
    );

    imgInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    const base64 = String(reader.result).split(",")[1];

    if (!base64) {
      addMessage("jarvis", "Unable to read this image.");
      imgInput.value = "";
      return;
    }

    if (busy) {
      imgInput.value = "";
      return;
    }

    addMessage("user", "📷 Image sent for analysis.");

    busy = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "...";

    try {
      const answer = await askGemini(
        "Please analyze this image and describe what you see.",
        {
          mimeType: file.type,
          data: base64
        }
      );

      remember("user", "Analyze the image I uploaded.");
      remember("model", answer);

      addMessage("jarvis", answer);
      speak(answer);

    } catch (error) {
      addMessage(
        "jarvis",
        "IMAGE ERROR: " + error.message
      );

    } finally {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "SEND";
      imgInput.value = "";
    }
  };

  reader.onerror = () => {
    addMessage("jarvis", "Unable to read the image.");
    imgInput.value = "";
  };

  reader.readAsDataURL(file);
});

// 15. CLEAR MEMORY BUTTON
clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all saved chat memory?")) return;

  conversation = [];
  saveMemory();

  chat.innerHTML = "";

  addMessage(
    "jarvis",
    "Memory cleared. Ready for a new conversation."
  );
});

// 16. BUTTON EVENTS
sendBtn.addEventListener("click", sendMessage);

msg.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

// 17. INTERNET STATUS
window.addEventListener("online", () => {
  setStatus(1, true, "ONLINE");
});

window.addEventListener("offline", () => {
  setStatus(1, false, "OFFLINE");
});

// 18. START JARVIS
addMessage(
  "jarvis",
  "J.A.R.V.I.S online. Initializing AI systems..."
);

if (API_KEY) {
  loadModels()
    .then(() => {
      addMessage(
        "jarvis",
        "AI connection established. Selected model: " +
        selectedModel
      );
    })
    .catch(error => {
      addMessage(
        "jarvis",
        "CONNECTION ERROR: " + error.message
      );
    });
}
