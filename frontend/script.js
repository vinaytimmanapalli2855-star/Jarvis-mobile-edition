// ===== 1. API KEY =====
let API_KEY = localStorage.getItem('jarvis_key');
if(!API_KEY){
  API_KEY = prompt('Enter your Gemini API Key:');
  if(API_KEY) localStorage.setItem('jarvis_key', API_KEY);
}

// ===== 2. DOM ELEMENTS =====
const chat = document.getElementById('chat');
const input = document.getElementById('msg');
const micBtn = document.getElementById('mic-btn');

// ===== 3. GEMINI BRAIN (REAL-TIME STREAMING) =====
async function callGemini(p){
  // Using the ultra-fast 8b model
  const m = "gemini-1.5-flash-8b"; 
  const url = "https://generativelanguage.googleapis.com/v1beta/models/"+m+":streamGenerateContent?alt=sse&key="+API_KEY;
  
  const res = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      contents: [{ parts: [{ text: p }] }],
      // This makes J.A.R.V.I.S answer quickly and briefly
      systemInstruction: { parts: [{ text: "You are J.A.R.V.I.S. Keep answers very short, smart, and under 2 sentences." }] }
    })
  });

  if(!res.ok) {
    const err = await res.json();
    throw new Error(err.error.message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.candidates && data.candidates[0].content) {
            const text = data.candidates[0].content.parts[0].text;
            fullText += text;
            // Types out in real-time!
            chat.lastChild.innerText = 'J.A.R.V.I.S: ' + fullText;
            chat.scrollTop = chat.scrollHeight;
          }
        } catch(e) {}
      }
    }
  }
  return fullText;
}

async function askGemini(p){
  add('J.A.R.V.I.S: Thinking...','ai');
  try{
    // callGemini now types the text automatically
    const reply = await callGemini(p);
    speak(reply); // Speaks the full reply when done
  }catch(e){
    chat.lastChild.innerText='J.A.R.V.I.S: ERROR - '+e.message;
  }
}

// ===== 4. SPEECH RECOGNITION =====
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  const rec = new SR(); 
  rec.lang = 'en-US'; 
  rec.onresult = (e) => {
    const t = e.results[0][0].transcript;
    add('YOU: '+t,'user');
    askGemini(t);
  };
  micBtn.onclick = () => { rec.start(); micBtn.innerText='LISTENING...'; };
  rec.onend = () => { micBtn.innerText='🎤'; };
}

// ===== 5. TEXT-TO-SPEECH =====
let voices = [];
function loadVoices(){ voices = speechSynthesis.getVoices(); }
loadVoices();
speechSynthesis.onvoiceschanged = loadVoices;

function speak(t){
  const u = new SpeechSynthesisUtterance(t);
  u.rate = 1.05; u.pitch = 0.85;
  const v = voices.find(v => v.lang.startsWith('en'));
  if(v) u.voice = v;
  speechSynthesis.speak(u);
}

// ===== 6. TEXT SEND BUTTON =====
document.getElementById('send').onclick = () => {
  const t = input.value.trim(); 
  if(!t) return;
  add('YOU: '+t, 'user'); 
  input.value = ''; 
  askGemini(t);
};

function add(t, w){
  const d = document.createElement('div');
  d.className = 'msg ' + w;
  d.innerText = t;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
}
