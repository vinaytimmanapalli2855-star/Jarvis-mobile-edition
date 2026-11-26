// ===== JARVIS FIXED SCRIPT =====

window.onerror = function(message, source, lineno) {
  alert("JARVIS CRASH: " + message + " | Line: " + lineno);
};

document.addEventListener('DOMContentLoaded', () => {

  const chat = document.getElementById('chat');
  const input = document.getElementById('msg');
  const send = document.getElementById('send');
  const micBtn = document.getElementById('mic-btn');

  if (!chat || !input || !send) {
    alert("JARVIS ERROR: Chat, input, or send button missing!");
    return;
  }

  // ===== API KEY =====
  let API_KEY = localStorage.getItem('jarvis_key');

  if (!API_KEY) {
    API_KEY = prompt("Enter your Gemini API Key:");

    if (!API_KEY) {
      alert("API key missing! JARVIS cannot start.");
      return;
    }

    API_KEY = API_KEY.trim();
    localStorage.setItem('jarvis_key', API_KEY);
    // ===== CHANGE API KEY BUTTON =====
const keyBtn = document.createElement('button');
keyBtn.innerText = '🔑 CHANGE API KEY';
keyBtn.id = 'change-key-btn';

keyBtn.style.cssText = `
  display:block;
  margin:10px auto;
  padding:12px 18px;
  color:#ffd700;
  background:#080808;
  border:1px solid #ffd700;
  border-radius:8px;
  font-weight:bold;
  cursor:pointer;
`;

document.body.appendChild(keyBtn);

keyBtn.onclick = () => {
  const newKey = prompt('Enter your new Gemini API Key:');

  if (!newKey || !newKey.trim()) return;

  API_KEY = newKey.trim();
  localStorage.setItem('jarvis_key', API_KEY);

  alert('JARVIS: API KEY UPDATED SUCCESSFULLY');
};
  }

  // ===== CHAT MESSAGE =====
  function add(text, who) {
    const div = document.createElement('div');
    div.className = 'msg ' + who;
    div.innerText = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  // ===== GEMINI AI =====
  async function callGemini(prompt) {

    const model = "gemini-3.5-flash-lite";
    
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message || "Gemini API request failed"
      );
    }

    const reply =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("");

    if (!reply) {
      throw new Error("Gemini returned an empty response");
    }

    return reply;
  }

  // ===== ASK JARVIS =====
  async function askGemini(prompt) {

    const thinking = add("J.A.R.V.I.S: Thinking...", "ai");

    send.disabled = true;

    try {
      const reply = await callGemini(prompt);

      thinking.innerText = "J.A.R.V.I.S: " + reply;

      speak(reply);

    } catch (error) {

      thinking.innerText = "J.A.R.V.I.S ERROR: " + error.message;

      alert("API ERROR:\n" + error.message);

      console.error(error);

    } finally {
      send.disabled = false;
      chat.scrollTop = chat.scrollHeight;
    }
  }

  // ===== SEND BUTTON =====
  send.onclick = () => {

    const text = input.value.trim();

    if (!text) return;

    add("YOU: " + text, "user");

    input.value = "";

    askGemini(text);
  };

  // ===== ENTER KEY SEND =====
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      send.click();
    }
  });

  // ===== VOICE OUTPUT =====
  function speak(text) {

    if (!('speechSynthesis' in window)) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = 1.0;
    utterance.pitch = 0.8;
    utterance.volume = 1;

    speechSynthesis.speak(utterance);
  }

  // ===== MICROPHONE =====
  const SR = window.SpeechRecognition ||
            window.webkitSpeechRecognition;

  if (SR && micBtn) {

    const recognition = new SR();

    recognition.lang = 'en-US';
    recognition.continuous = false;

    recognition.onresult = (event) => {

      const text = event.results[0][0].transcript;

      add("YOU: " + text, "user");

      askGemini(text);
    };

    recognition.onerror = (event) => {
      alert("MIC ERROR: " + event.error);
    };

    recognition.onend = () => {
      micBtn.innerText = "🎤";
    };

    micBtn.onclick = () => {
      micBtn.innerText = "LISTENING...";
      recognition.start();
    };
  }

  // ===== START MESSAGE =====
  add("J.A.R.V.I.S: SYSTEM ONLINE. AWAITING COMMAND.", "ai");

});
