const chatBox = document.getElementById("chat");
const input = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const characterSelect = document.getElementById("character");
const clearBtn = document.getElementById("clear");
const musicToggle = document.getElementById("musicToggle");
const backgroundMusic = document.getElementById("backgroundMusic");
const permissionOverlay = document.getElementById("permissionOverlay");
const allowMusicBtn = document.getElementById("allowMusicBtn");
const queryCounterEl = document.getElementById("queryCounter");
const queryCountEl = document.getElementById("queryCount");
const sessionCountEl = document.getElementById("sessionCount");

let currentCharacter = "default";
let characters = {};
let isMusicPlaying = false; // Start as "off" until permission granted
// Sessions removed; no per-user tracking
let sessionId = null;
let sessionStartTime = Date.now();

// Cache system for each character
let characterCache = {};

// Initialize cache for a character
function initializeCharacterCache(characterId) {
  if (!characterCache[characterId]) {
    characterCache[characterId] = {
      messages: [],
      responses: [],
      maxSize: 5 // Only 5 messages and 5 responses (10 total)
    };
  }
}

// Add message to cache
function addToMessageCache(characterId, message) {
  initializeCharacterCache(characterId);
  const cache = characterCache[characterId];
  
  cache.messages.push(message);
  
  // Remove oldest if over limit
  if (cache.messages.length > cache.maxSize) {
    cache.messages.shift();
  }
}

// Add response to cache
function addToResponseCache(characterId, response) {
  initializeCharacterCache(characterId);
  const cache = characterCache[characterId];
  
  cache.responses.push(response);
  
  // Remove oldest if over limit
  if (cache.responses.length > cache.maxSize) {
    cache.responses.shift();
  }
}

// Get cached messages for context
function getCachedMessages(characterId) {
  initializeCharacterCache(characterId);
  return characterCache[characterId].messages;
}

// Get cached responses for context
function getCachedResponses(characterId) {
  initializeCharacterCache(characterId);
  return characterCache[characterId].responses;
}

// Clear cache when switching characters (optional - you can remove this if you want persistent cache)
function clearCharacterCache(characterId) {
  if (characterCache[characterId]) {
    characterCache[characterId].messages = [];
    characterCache[characterId].responses = [];
  }
}

// Load available characters
async function loadCharacters() {
  try {
    // Load initial stats
    try {
      const statsRes = await fetch('/api/stats');
      if (statsRes.ok) {
        const stats = await statsRes.json();
        if (queryCountEl && typeof stats.totalQueries === 'number') {
          queryCountEl.textContent = String(stats.totalQueries);
        }
        // Initialize session counter from sessionStorage
        const existingSessionCount = Number(sessionStorage.getItem('spookygpt_session_queries') || '0');
        if (sessionCountEl) sessionCountEl.textContent = String(existingSessionCount);
      }
    } catch (_) {}

    const res = await fetch("/api/characters");
    
    // Check if server is full
    if (res.status === 503) {
      const data = await res.json();
      showServerFullMessage(data.error);
      return;
    }
    
    // No session header expected
    
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

// Generate a unique session ID
// Session IDs no longer used
function generateSessionId() { return ''; }

// Show server full message
function showServerFullMessage(message) {
  // Hide all other content
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

function appendMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = "msg " + role;
  
  if (role === "bot") {
    msg.innerHTML = `<div class="msg-content">${text}</div>`;
  } else {
    msg.textContent = text;
  }
  
  // Append normally - newest messages at bottom
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll to bottom to see newest messages
  return msg;
}

function updateMessage(msg, text) {
  const content = msg.querySelector(".msg-content");
  if (content) {
    content.textContent = text;
  } else {
    msg.textContent = text;
  }
  chatBox.scrollTop = chatBox.scrollHeight; // Auto scroll to bottom to see newest messages
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // Add user message to cache
  addToMessageCache(currentCharacter, text);
  
  appendMessage("user", text);
  input.value = "";
  sendBtn.disabled = true;
  sendBtn.textContent = "Thinking...";

  const thinkingMsg = appendMessage("bot", "💭 Thinking...");

  try {
    // Get cached context for this character
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
      return;
    }

    // Update query counter from header if present
    const totalQueriesHeader = res.headers.get('X-Total-Queries');
    if (totalQueriesHeader && queryCountEl) {
      queryCountEl.textContent = totalQueriesHeader;
    }

    // Increment session counter and persist
    const newSessionCount = Number(sessionStorage.getItem('spookygpt_session_queries') || '0') + 1;
    sessionStorage.setItem('spookygpt_session_queries', String(newSessionCount));
    if (sessionCountEl) sessionCountEl.textContent = String(newSessionCount);

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
      updateMessage(thinkingMsg, fullResponse + "▋");
      
      // Minimal delay for typing effect
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    // Remove cursor and add response to cache
    updateMessage(thinkingMsg, fullResponse);
    addToResponseCache(currentCharacter, fullResponse);

  } catch (err) {
    updateMessage(thinkingMsg, "Network error: " + err.message);
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

// Permission and music functions
function requestMusicPermission() {
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

// Auto-refresh after 5 minutes to clear session
setTimeout(() => {
  console.log("Session timeout reached (5 minutes). Refreshing page to clear session.");
  location.reload();
}, .5 * 60 * 1000); // 5 minutes

// Notify server when user closes the page
window.addEventListener('beforeunload', () => {
  if (sessionId) {
    // Send a request to notify server that user is leaving
    navigator.sendBeacon('/api/session-end', JSON.stringify({ sessionId: sessionId }));
    console.log(`Notifying server that session ${sessionId} is ending`);
  }
});

// Also handle page visibility changes (tab switching, minimizing, etc.)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && sessionId) {
    // User switched tabs or minimized window
    console.log(`User became inactive for session ${sessionId}`);
  }
});

