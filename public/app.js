const chatBox = document.getElementById("chat");
const input = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const characterSelect = document.getElementById("character");
const clearBtn = document.getElementById("clear");
const musicToggle = document.getElementById("musicToggle");
const backgroundMusic = document.getElementById("backgroundMusic");
const permissionOverlay = document.getElementById("permissionOverlay");
const allowMusicBtn = document.getElementById("allowMusicBtn");
const sessionCountEl = document.getElementById("sessionCount");
const cooldownDisplayEl = document.getElementById("cooldownDisplay");
const cooldownTimerEl = document.getElementById("cooldownTimer");

let currentCharacter = "default";
let characters = {};
let isMusicPlaying = false;
let cooldownActive = false;
let cooldownEndTime = 0;
let cooldownInterval = null;

// Cooldown system
function startCooldown() {
  cooldownActive = true;
  cooldownEndTime = Date.now() + 15000; // 15 seconds
  sessionStorage.setItem('spookygpt_cooldown_end', String(cooldownEndTime));
  
  cooldownDisplayEl.style.display = 'block';
  input.disabled = true;
  input.placeholder = "Cooldown active...";
  
  // Hide the send button during cooldown
  sendBtn.style.display = 'none';
  
  cooldownInterval = setInterval(() => {
    const remaining = Math.ceil((cooldownEndTime - Date.now()) / 1000);
    if (remaining <= 0) {
      endCooldown();
    } else {
      cooldownTimerEl.textContent = remaining;
    }
  }, 1000);
}

function endCooldown() {
  cooldownActive = false;
  sessionStorage.removeItem('spookygpt_cooldown_end');
  
  cooldownDisplayEl.style.display = 'none';
  input.disabled = false;
  input.placeholder = "Ask something spooky...";
  
  // Show the send button again after cooldown
  sendBtn.style.display = 'block';
  
  if (cooldownInterval) {
    clearInterval(cooldownInterval);
    cooldownInterval = null;
  }
}

// Cache system for each character
let characterCache = {};

function initializeCharacterCache(characterId) {
  if (!characterCache[characterId]) {
    characterCache[characterId] = {
      messages: [],
      responses: [],
      maxSize: 5
    };
  }
}

function addToMessageCache(characterId, message) {
  initializeCharacterCache(characterId);
  const cache = characterCache[characterId];
  cache.messages.push(message);
  if (cache.messages.length > cache.maxSize) {
    cache.messages.shift();
  }
}

function addToResponseCache(characterId, response) {
  initializeCharacterCache(characterId);
  const cache = characterCache[characterId];
  cache.responses.push(response);
  if (cache.responses.length > cache.maxSize) {
    cache.responses.shift();
  }
}

function getCachedMessages(characterId) {
  initializeCharacterCache(characterId);
  return characterCache[characterId].messages;
}

function getCachedResponses(characterId) {
  initializeCharacterCache(characterId);
  return characterCache[characterId].responses;
}

// Load available characters
async function loadCharacters() {
  try {
    // Initialize session counter from sessionStorage
    const existingSessionCount = Number(sessionStorage.getItem('spookygpt_session_queries') || '0');
    if (sessionCountEl) sessionCountEl.textContent = String(existingSessionCount);
    
    // Check if cooldown is still active
    const cooldownEnd = Number(sessionStorage.getItem('spookygpt_cooldown_end') || '0');
    if (cooldownEnd > Date.now()) {
      cooldownEndTime = cooldownEnd;
      startCooldown();
    }

    const res = await fetch("/api/characters");
    
    if (res.status === 503) {
      const data = await res.json();
      showServerFullMessage(data.error);
      return;
    }
    
    const data = await res.json();
    characters = data.characters;
    
    // Populate character selector
    characterSelect.innerHTML = "";
    characters.forEach(char => {
      const option = document.createElement("option");
      option.value = char.id;
      option.textContent = char.name;
      characterSelect.appendChild(option);
    });
    
    // Set default character
    currentCharacter = characters[0]?.id || "default";
    characterSelect.value = currentCharacter;
    
    // Show greeting
    const greeting = characters.find(c => c.id === currentCharacter)?.greeting || "👻 Boo! I'm SpookyGPT!";
    appendMessage("bot", greeting);
  } catch (err) {
    console.error("Failed to load characters:", err);
    appendMessage("bot", "👻 Boo! I'm SpookyGPT! What spooky topic can I help you with?");
  }
}

// Show server full message
function showServerFullMessage(message) {
  document.querySelector('.container').style.display = 'none';
  document.querySelector('.permission-overlay').style.display = 'none';
  
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(26, 10, 10, 0.95);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
    backdrop-filter: blur(10px);
  `;
  
  const content = document.createElement('div');
  content.style.cssText = `
    background: rgba(139, 0, 139, 0.2);
    border-radius: 20px;
    padding: 2rem;
    text-align: center;
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 140, 0, 0.3);
    box-shadow: 0 8px 32px rgba(139, 0, 139, 0.4);
    max-width: 400px;
    width: 90%;
  `;
  
  content.innerHTML = `
    <div style="font-size: 1.5rem; font-weight: bold; margin-bottom: 1rem; background: linear-gradient(45deg, #ff4500, #ff8c00, #dc143c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
      👻 Server Full! 👻
    </div>
    <div style="margin-bottom: 1.5rem; line-height: 1.6;">
      ${message}
    </div>
    <button onclick="location.reload()" style="padding: 0.75rem 1.5rem; border: none; border-radius: 15px; background: linear-gradient(45deg, #ff4500, #dc143c); color: #f0e6d2; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(255, 69, 0, 0.3);">
      🔄 Try Again
    </button>
  `;
  
  overlay.appendChild(content);
  document.body.appendChild(overlay);
}

// Sound system - disabled on mobile
let soundEnabled = true;
let audioContext;
let soundEffects = {};

function initSoundSystem() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    soundEnabled = false;
    return;
  }
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    soundEffects = {
      click: createTone(800, 0.1, 'sine'),
      hover: createTone(600, 0.05, 'sine'),
      send: createTone(1000, 0.2, 'square'),
      receive: createTone(400, 0.3, 'triangle'),
      error: createTone(200, 0.5, 'sawtooth')
    };
  } catch (e) {
    soundEnabled = false;
  }
}

function createTone(frequency, duration, type = 'sine') {
  return () => {
    if (!soundEnabled || !audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  };
}

function playSound(soundName) {
  if (soundEffects[soundName]) {
    soundEffects[soundName]();
  }
}

// Message functions
function appendMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = "msg " + role;
  
  msg.style.opacity = '0';
  msg.style.transform = 'translateY(20px) scale(0.9)';
  
  if (role === "bot") {
    msg.innerHTML = `<div class="msg-content">${text}</div>`;
    playSound('receive');
  } else {
    msg.textContent = text;
    playSound('send');
  }
  
  chatBox.appendChild(msg);
  
  requestAnimationFrame(() => {
    msg.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
    msg.style.opacity = '1';
    msg.style.transform = 'translateY(0) scale(1)';
  });
  
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

function updateMessage(msg, text) {
  const content = msg.querySelector(".msg-content");
  if (content) {
    content.textContent = text;
  } else {
    msg.textContent = text;
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Button effects
function addButtonEffects() {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.addEventListener('click', () => playSound('click'));
    button.addEventListener('mouseenter', () => playSound('hover'));
  });
  
  const selects = document.querySelectorAll('select');
  selects.forEach(select => {
    select.addEventListener('change', () => playSound('click'));
    select.addEventListener('mouseenter', () => playSound('hover'));
  });
  
  input.addEventListener('focus', () => playSound('hover'));
}

// Send message
async function sendMessage() {
  const text = input.value.trim();
  if (!text || cooldownActive) return;

  addToMessageCache(currentCharacter, text);
  
  appendMessage("user", text);
  input.value = "";
  sendBtn.disabled = true;
  sendBtn.textContent = "Thinking...";

  // Increment session counter
  const newSessionCount = Number(sessionStorage.getItem('spookygpt_session_queries') || '0') + 1;
  sessionStorage.setItem('spookygpt_session_queries', String(newSessionCount));
  if (sessionCountEl) sessionCountEl.textContent = String(newSessionCount);

  // Check if cooldown should start (every 5 messages: 5, 10, 15, 20, etc.)
  if (newSessionCount % 5 === 0 && !cooldownActive) {
    startCooldown();
  }

  const thinkingMsg = appendMessage("bot", "💭 Thinking...");

  try {
    const cachedMessages = getCachedMessages(currentCharacter);
    const cachedResponses = getCachedResponses(currentCharacter);
    
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        prompt: text,
        character: currentCharacter,
        cachedMessages: cachedMessages,
        cachedResponses: cachedResponses
      })
    });

    if (!res.ok) {
      updateMessage(thinkingMsg, `Error: ${res.statusText}`);
      playSound('error');
      return;
    }

    // Handle streaming response
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    updateMessage(thinkingMsg, "");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullResponse += chunk;
      updateMessage(thinkingMsg, fullResponse);
      
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    updateMessage(thinkingMsg, fullResponse);
    addToResponseCache(currentCharacter, fullResponse);

  } catch (err) {
    updateMessage(thinkingMsg, "Network error: " + err.message);
    playSound('error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
  }
}

function clearChat() {
  chatBox.innerHTML = "";
  const greeting = characters.find(c => c.id === currentCharacter)?.greeting || "👻 Boo! I'm SpookyGPT!";
  appendMessage("bot", greeting);
}

// Music functions
let permissionShown = false;

function requestMusicPermission() {
  // Show permission overlay by default on all devices
  if (permissionOverlay && !permissionShown) {
    permissionOverlay.style.display = 'flex';
  }
  
  if (allowMusicBtn) {
    allowMusicBtn.addEventListener('click', () => {
      startMusic();
      hidePermissionOverlay();
    });
  }
}

function startMusic() {
  if (backgroundMusic) {
    backgroundMusic.volume = 0.3;
    backgroundMusic.play().then(() => {
      isMusicPlaying = true;
      updateMusicButton();
    }).catch(err => {
      isMusicPlaying = false;
      updateMusicButton();
    });
  }
}

function hidePermissionOverlay() {
  if (permissionOverlay) {
    permissionOverlay.style.display = 'none';
    permissionShown = true;
  }
}

function toggleMusic() {
  if (!backgroundMusic) return;
  
  if (isMusicPlaying) {
    backgroundMusic.pause();
    isMusicPlaying = false;
    updateMusicButton();
  } else {
    backgroundMusic.play().then(() => {
      isMusicPlaying = true;
      updateMusicButton();
    }).catch(err => {
      isMusicPlaying = false;
      updateMusicButton();
    });
  }
}

function updateMusicButton() {
  if (musicToggle) {
    if (isMusicPlaying) {
      musicToggle.textContent = "🎵 Music On";
      musicToggle.classList.remove("muted");
    } else {
      musicToggle.textContent = "🔇 Music Off";
      musicToggle.classList.add("muted");
    }
  }
}

// Event listeners
sendBtn.addEventListener("click", sendMessage);
clearBtn.addEventListener("click", clearChat);
musicToggle.addEventListener("click", toggleMusic);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !sendBtn.disabled) {
    sendMessage();
  }
});

characterSelect.addEventListener("change", (e) => {
  currentCharacter = e.target.value;
  clearChat();
});

// Initialize
loadCharacters();
requestMusicPermission();
updateMusicButton();
initSoundSystem();
addButtonEffects();