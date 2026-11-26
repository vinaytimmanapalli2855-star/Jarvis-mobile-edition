
// ==========================================
//       J.A.R.V.I.S MOBILE EDITION
//          COMPLETE AI ENGINE
// ==========================================

// 1. API KEY
let API_KEY = localStorage.getItem("jarvis_key");

if (!API_KEY) {
  API_KEY = prompt("Enter your Gemini API Key:");
  if (API_KEY) {
    localStorage.setItem("jarvis_key", API_KEY.trim());
  }
}

const API_URL = "https://generativelanguage.googleapis.com/v1beta";

// 2. ELEMENTS
const chat = document.getElementById("chat");
const msg = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic-btn");
const clearBtn = document.getElementById("clear-btn");
const camBtn = document.getElementById("cam-btn");
const imgInput = document.getElementById("img-input");

let conversation = JSON.parse(
  localStorage.getItem("jarvis_memory") || "[]"
);

let availableModels = [];
let selectedModel = null;
let busy = false;

// 3. SYSTEM STATUS
function setStatus(index, online, label) {
  const rows = document.querySelectorAll(".status .row b");
  if (!rows[index]) return;

  rows[index].className = online ? "on" : "off";
  rows[index].textContent = online
    ? "● " + label
    : "○ " + label;
}

setStatus(0, true, "ONLINE");
setStatus(1, navigator.onLine, navigator.onLine ? "ONLINE" : "OFFLINE");
setStatus(2, "speechSynthesis" in window, "VOICE");
setStatus(3, true, "MEMORY");

// 4. CHAT DISPLAY
function addMessage(sender, text) {
  const item = document.createElement("div");
  item.className = "msg " + sender;

  const title = document.createElement("b");
  title.textContent = sender === "user" ? "YOU: " : "JARVIS: ";

  const content = document.createElement("span");
  content.textContent = text;

  item.appendChild(title);
  item.appendChild(content);
  chat.appendChild(item);

  chat.scrollTop = chat.scrollHeight;
}

function saveMemory() {
  localStorage.setItem(
    "jarvis_memory",
    JSON.stringify(conversation.slice(-20))
  );
}

function remember(role, text) {
  conversation.push({
    role,
    parts: [{ text }]
  });

  conversation = conversation.slice(-20);
  saveMemory();
}

// 5. FIND AVAILABLE GEMINI MODELS
async function loadModels() {
  if (!API_KEY) throw new Error("Gemini API key is missing.");

  const response = await fetch(
    `${API_URL}/models?key=${encodeURIComponent(API_KEY)}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Could not load Gemini models.");
  }

  availableModels = (data.models || [])
    .filter(model =>
      model.supportedGenerationMethods?.includes("generateContent")
    )
    .map(model => model.name.replace("models/", ""));

  const preferences = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-flash-latest"
  ];

  selectedModel =
    preferences.find(name => availableModels.includes(name)) ||
    availableModels.find(name => name.toLowerCase().includes("flash")) ||
    availableModels[0];

  if (!selectedModel) {
    throw new Error("No supported Gemini model was found for this API key.");
  }

  console.log("JARVIS model:", selectedModel);
}

// 6. GEMINI AI ENGINE
async function askGemini(text, imageData = null) {
  if (!selectedModel) {
    await loadModels();
  }

  const parts = [{ text }];

  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: imageData.mimeType,
        data: imageData.data
      }
    });
  }

  const history = conversation.slice(-12);

  const contents = [
    ...history,
    { role: "user", parts }
  ];

  const body = {
    systemInstruction: {
      parts: [{
        text:
          "You are J.A.R.V.I.S, a helpful, intelligent mobile AI assistant. " +
          "Be friendly, clear, concise, and practical. " +
          "You are not actually connected to the user's device systems. " +
          "Never claim to perform actions you cannot perform."
      }]
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048
    }
  };

  let response = await fetch(
    `${API_URL}/models/${selectedModel}:generateContent?key=${encodeURIComponent(API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  let data = await response.json();

  if (!response.ok) {
    const error = data.error?.message || "Gemini request failed.";

    // Try another model if the selected one is unavailable.
    if (availableModels.length > 1) {
      const nextModel = availableModels.find(m => m !== selectedModel);

      if (nextModel) {
        selectedModel = nextModel;

        response = await fetch(
          `${API_URL}/models/${selectedModel}:generateContent?key=${encodeURIComponent(API_KEY)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }
        );

        data = await response.json();
      }
    }

    if (!response.ok) {
      throw new Error(data.error?.message || error);
    }
  }

  const answer = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty response.");
  }

  return answer;
}

// 7. SPECIAL COMMANDS
async function handleCommand(text) {
  const command = text.toLowerCase().trim();

  if (
    command.startsWith("open youtube") ||
    command === "youtube"
  ) {
    window.open("https://www.youtube.com", "_blank");
    return "Opening YouTube.";
  }

  if (
    command.startsWith("open google") ||
    command === "google"
  ) {
    window.open("https://www.google.com", "_blank");
    return "Opening Google.";
  }

  if (command.startsWith("search ")) {
    const query = text.substring(7).trim();
    window.open(
      "https://www.google.com/search?q=" + encodeURIComponent(query),
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

  if (command === "clear chat") {
    conversation = [];
    saveMemory();
    chat.innerHTML = "";
    return "Chat memory cleared.";
  }

  if (command === "forget memory") {
    conversation = [];
    saveMemory();
    return "My saved conversation memory has been cleared.";
  }

  if (command === "change api key") {
    const key = prompt("Enter your new Gemini API key:");

    if (key && key.trim()) {
      API_KEY = key.trim();
      localStorage.setItem("jarvis_key", API_KEY);
      selectedModel = null;
      availableModels = [];
      return "API key updated. I will reconnect.";
    }

    return "API key was not changed.";
  }

  if (command === "what time is it") {
    return "The time is " +
      new Date().toLocaleTimeString();
  }

  if (command === "what is today's date") {
    return "Today's date is " +
      new Date().toLocaleDateString();
  }

  return null;
}

// 8. SEND MESSAGE
async function sendMessage() {
  const text = msg.value.trim();

  if (!text || busy) return;

  if (!API_KEY) {
    addMessage("jarvis", "Please enter a valid Gemini API key.");
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
    console.error(error);
    addMessage("jarvis", "ERROR: " + error.message);
  } finally {
    busy = false;
    sendBtn.disabled = false;
    sendBtn.textContent = "SEND";
  }
}

// 9. VOICE OUTPUT
function speak(text) {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();

  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = "en-US";
  speech.rate = 1;
  speech.pitch = 1;

  window.speechSynthesis.speak(speech);
}

// 10. VOICE INPUT
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
    addMessage("jarvis", "Voice error: " + event.error);
  };
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    addMessage("jarvis", "Voice recognition is not supported in this browser.");
    return;
  }

  try {
    recognition.start();
  } catch (error) {
    console.log(error);
  }
});

// 11. CAMERA / IMAGE UNDERSTANDING
camBtn.addEventListener("click", () => {
  imgInput.click();
});

imgInput.addEventListener("change", async () => {
  const file = imgInput.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    addMessage("jarvis", "Please select an image.");
    return;
  }

  if (file.size > 4 * 1024 * 1024) {
    addMessage("jarvis", "Please choose an image smaller than 4 MB.");
    imgInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async () => {
    const base64 = String(reader.result).split(",")[1];

    addMessage("user", "📷 Image sent for analysis.");

    busy = true;
    sendBtn.disabled = true;

    try {
      const answer = await askGemini(
        "Describe and analyze this image. Answer clearly.",
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
      addMessage("jarvis", "IMAGE ERROR: " + error.message);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      imgInput.value = "";
    }
  };

  reader.readAsDataURL(file);
});

// 12. CLEAR BUTTON
clearBtn.addEventListener("click", () => {
  if (!confirm("Clear all saved chat memory?")) return;

  conversation = [];
  saveMemory();
  chat.innerHTML = "";

  addMessage("jarvis", "Memory cleared. Ready for a new conversation.");
});

// 13. BUTTON EVENTS
sendBtn.addEventListener("click", sendMessage);

msg.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

// 14. INTERNET STATUS
window.addEventListener("online", () => {
  setStatus(1, true, "ONLINE");
});

window.addEventListener("offline", () => {
  setStatus(1, false, "OFFLINE");
});

// 15. START JARVIS
addMessage(
  "jarvis",
  "J.A.R.V.I.S online. Initializing AI systems..."
);

if (API_KEY) {
  loadModels()
    .then(() => {
      addMessage(
        "jarvis",
        "AI connection established. Model: " + selectedModel
      );
    })
    .catch(error => {
      addMessage("jarvis", "Connection error: " + error.message);
    });
}
