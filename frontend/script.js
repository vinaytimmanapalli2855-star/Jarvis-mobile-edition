
// ===== J.A.R.V.I.S MOBILE EDITION =====

// 1. API KEY
let API_KEY = localStorage.getItem('jarvis_key');

if (!API_KEY) {
  API_KEY = prompt('Enter your Gemini API Key:');
  if (API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}

// Use model IDs available to your Gemini API key.
const MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];

// 2. ELEMENTS
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const micBtn = document.getElementById('mic-btn');
const clearBtn = document.getElementById('clear-btn');
const camBtn = document.getElementById('cam-btn');
const imgInput = document.getElementById('img-input');

let MEMORY = JSON.parse(localStorage.getItem('jarvis_memory') || '[]');

function saveMemory() {
  localStorage.setItem('jarvis_memory', JSON.stringify(MEMORY));
}

function add(message, type) {
  const d = document.createElement('div');
  d.className = 'msg ' + type;
  d.innerText = message;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}

MEMORY.forEach(m => {
  add(
    (m.role === 'user' ? 'YOU: ' : 'J.A.R.V.I.S: ') + m.text,
    m.role === 'user' ? 'user' : 'ai'
  );
});

// 3. GEMINI AI
async function callGemini(promptText) {
  if (!API_KEY) throw new Error('Gemini API key missing.');

  const contents = MEMORY.slice(-12).map(m => ({
    role: m.role,
    parts: [{ text: m.text }]
  }));

  contents.push({
    role: 'user',
    parts: [{ text: promptText }]
  });

  let lastError;

  for (const model of MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        lastError = new Error(data.error?.message || 'Gemini API error');
        continue;
      }

      const reply = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('');

      if (!reply) throw new Error('No response from Gemini.');

      return reply;

    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All Gemini models failed.');
}

// 4. CHAT
async function askGemini(question) {
  const message = document.createElement('div');
  message.className = 'msg ai';
  message.innerText = 'J.A.R.V.I.S: Thinking...';
  chat.appendChild(message);

  try {
    const reply = await callGemini(question);

    MEMORY.push({ role: 'user', text: question });
    MEMORY.push({ role: 'model', text: reply });
    saveMemory();

    message.innerText = 'J.A.R.V.I.S: ' + reply;
    speak(reply);

  } catch (error) {
    message.innerText = 'J.A.R.V.I.S ERROR: ' + error.message;
  }

  chat.scrollTop = chat.scrollHeight;
}

// 5. SEND BUTTON
if (sendBtn) {
  sendBtn.onclick = () => {
    const question = input.value.trim();
    if (!question) return;

    add('YOU: ' + question, 'user');
    input.value = '';
    askGemini(question);
  };
}

if (input) {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendBtn.click();
  });
}

// 6. CLEAR MEMORY
if (clearBtn) {
  clearBtn.onclick = () => {
    MEMORY = [];
    saveMemory();
    chat.innerHTML = '';
    add('SYSTEM: Memory cleared.', 'ai');
  };
}

// 7. VOICE ENGINE
const SR = window.SpeechRecognition ||
           window.webkitSpeechRecognition;

let recognition;

if (SR && micBtn) {
  recognition = new SR();
  recognition.lang = 'en-US';

  recognition.onresult = event => {
    const text = event.results[0][0].transcript;
    add('YOU: ' + text, 'user');
    askGemini(text);
  };

  recognition.onend = () => {
    micBtn.innerText = '🎤';
  };

  recognition.onerror = () => {
    micBtn.innerText = '🎤';
  };

  micBtn.onclick = () => {
    try {
      recognition.start();
      micBtn.innerText = 'LISTENING...';
    } catch (error) {
      add('VOICE: ' + error.message, 'ai');
    }
  };

} else if (micBtn) {
  micBtn.onclick = () => {
    add('VOICE: Speech recognition is not supported.', 'ai');
  };
}

// 8. SPEECH OUTPUT
function speak(text) {
  if (!('speechSynthesis' in window)) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 0.85;

  speechSynthesis.speak(utterance);
}

// 9. CAMERA / IMAGE
if (camBtn && imgInput) {
  camBtn.onclick = () => imgInput.click();

  imgInput.onchange = () => {
    const file = imgInput.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      add('SYSTEM: Please select an image.', 'ai');
      return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
      const base64 = reader.result.split(',')[1];
      const question = input.value.trim() ||
        'What do you see in this image?';

      input.value = '';
      add('YOU: [IMAGE] ' + question, 'user');

      const message = document.createElement('div');
      message.className = 'msg ai';
      message.innerText = 'J.A.R.V.I.S: Analyzing image...';
      chat.appendChild(message);

      try {
        let reply;
        let lastError;

        for (const model of MODELS) {
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      { text: question },
                      {
                        inline_data: {
                          mime_type: file.type,
                          data: base64
                        }
                      }
                    ]
                  }]
                })
              }
            );

            const data = await response.json();

            if (!response.ok) {
              throw new Error(data.error?.message || 'Vision API error');
            }

            reply = data.candidates?.[0]?.content?.parts
              ?.map(part => part.text || '')
              .join('');

            if (!reply) throw new Error('No image response.');
            break;

          } catch (error) {
            lastError = error;
          }
        }

        if (!reply) throw lastError;

        message.innerText = 'J.A.R.V.I.S: ' + reply;
        speak(reply);

      } catch (error) {
        message.innerText = 'VISION ERROR: ' + error.message;
      }

      chat.scrollTop = chat.scrollHeight;
      imgInput.value = '';
    };

    reader.readAsDataURL(file);
  };
}

add('J.A.R.V.I.S SYSTEM READY.', 'ai');

