// DOM Elements
const chatBox = document.getElementById("chat");
const input = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const characterSelect = document.getElementById("character");
const musicToggle = document.getElementById("musicToggle");
const backgroundMusic = document.getElementById("backgroundMusic");
const permissionOverlay = document.getElementById("permissionOverlay");
// Button references will be set when DOM is ready
const cooldownDisplayEl = document.getElementById("cooldownDisplay");
const cooldownTimerEl = document.getElementById("cooldownTimer");

// Speech Toggle Elements
const speechToggle = document.getElementById("speechToggle");
const speechButton = document.getElementById("speechButton");

// State variables
let currentCharacter = "";
let characters = {};
let isMusicPlaying = false;
let cooldownActive = false;
let cooldownEndTime = 0;
let cooldownInterval = null;
let permissionShown = false;
let isWaitingForResponse = false;

// Speech State
let speechEnabled = true;
let speechCache = new Map();
let speechConfig = {};
let musicStateBeforeSpeech = false;
let isSpeaking = false;

// Audio Context for voice effects
let audioContext = null;
let voiceEffects = {};

function updateInputState() {
  if (!currentCharacter) {
    input.disabled = true;
    input.placeholder = "Select a spooky friend";
    sendBtn.disabled = true;
    sendBtn.textContent = "Select Character";
    // Hide speech toggle when no character is selected
    if (speechToggle) {
      speechToggle.style.display = "none";
    }
  } else {
    input.disabled = false;
    input.placeholder = "Ask something spooky...";
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
    // Show speech toggle when character is selected
    if (speechToggle) {
      speechToggle.style.display = "flex";
    }
  }
}

function disableInputWhileProcessing() {
  isWaitingForResponse = true;
  input.disabled = true;
  input.placeholder = "Processing your spooky request...";
  sendBtn.disabled = true;
  sendBtn.textContent = "Thinking...";
  characterSelect.disabled = true;
  speechToggle.disabled = true;
  // Music button stays enabled so user can toggle music while AI is thinking
}

function enableInputAfterProcessing() {
  isWaitingForResponse = false;
  input.disabled = false;
  input.placeholder = "Ask something spooky...";
  sendBtn.disabled = false;
  sendBtn.textContent = "Send";
  characterSelect.disabled = false;
  speechToggle.disabled = false;
  musicToggle.disabled = false;
  // Speech button state is managed separately
}

function disableAllControlsWhileSpeaking() {
  isSpeaking = true;
  input.disabled = true;
  sendBtn.disabled = true;
  characterSelect.disabled = true;
  speechButton.disabled = false; // Keep speech button enabled for stop functionality
  speechToggle.disabled = true;
  musicToggle.disabled = true;
  
  // Change speech button to stop button
  updateSpeechButtonForSpeaking();
}

function enableAllControlsAfterSpeaking() {
  isSpeaking = false;
  // Re-enable based on current state
  if (!isWaitingForResponse) {
    input.disabled = false;
    sendBtn.disabled = false;
    characterSelect.disabled = false;
    speechButton.disabled = false;
    speechToggle.disabled = false;
    musicToggle.disabled = false;
  }
  
  // Restore speech button to original state
  updateSpeechButtonAfterSpeaking();
}

function updateSpeechButtonForSpeaking() {
  if (speechButton) {
    speechButton.textContent = "⏹️ Stop";
    speechButton.classList.add("speaking");
  }
}

function updateSpeechButtonAfterSpeaking() {
  if (speechButton) {
    speechButton.classList.remove("speaking");
    
    // Restore original button text based on speech state
    if (speechEnabled) {
      speechButton.textContent = "🔊 Speech On";
      speechButton.classList.add("active");
    } else {
      speechButton.textContent = "🔇 Speech Off";
      speechButton.classList.remove("active");
    }
  }
}

function toggleSpeech() {
  // CRITICAL: Prevent speech toggle during cooldown
  if (cooldownActive) {
    return;
  }
  
  speechEnabled = !speechEnabled;
  
  if (speechEnabled) {
    speechButton.textContent = "🔊 Speech On";
    speechButton.classList.add("active");
  } else {
    speechButton.textContent = "🔇 Speech Off";
    speechButton.classList.remove("active");
    
    // Stop any ongoing speech
    stopAllSpeech();
  }
}

// Character cache system
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

// Cooldown system
function startCooldown() {
  cooldownActive = true;
  cooldownEndTime = Date.now() + 15000; // 15 seconds
  sessionStorage.setItem('spookygpt_cooldown_end', String(cooldownEndTime));
  
  cooldownDisplayEl.style.display = 'block';
  input.disabled = true;
  input.placeholder = "Cooldown active...";
  sendBtn.style.display = 'none';
  
  // CRITICAL: Disable ALL buttons during cooldown
  characterSelect.disabled = true;
  musicToggle.disabled = true;
  speechToggle.disabled = true;
  speechButton.disabled = true;
  
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
  sendBtn.style.display = 'block';
  
  // CRITICAL: Re-enable ALL buttons after cooldown
  characterSelect.disabled = false;
  musicToggle.disabled = false;
  speechToggle.disabled = false;
  speechButton.disabled = false;
  
  // Update input state based on character selection
  updateInputState();
  
  if (cooldownInterval) {
    clearInterval(cooldownInterval);
    cooldownInterval = null;
  }
}

// Message functions
function appendMessage(role, text) {
  // Bulletproof text handling - convert anything to string safely
  let textToDisplay = '';
  
  try {
    if (text === null || text === undefined) {
      textToDisplay = '';
    } else if (typeof text === 'string') {
      textToDisplay = text;
    } else if (typeof text === 'object') {
      // If it's an object (like PointerEvent), don't display it
      textToDisplay = '';
    } else {
      textToDisplay = String(text);
    }
  } catch (e) {
    textToDisplay = '';
  }
  
  const msg = document.createElement("div");
  msg.className = "msg " + role;
  
  msg.style.opacity = '0';
  msg.style.transform = 'translateY(20px) scale(0.9)';
  
  if (role === "bot") {
    msg.innerHTML = `<div class="msg-content">${textToDisplay}</div>`;
  } else {
    msg.textContent = textToDisplay;
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
  // Bulletproof text handling - convert anything to string safely
  let textToDisplay = '';
  
  try {
    if (text === null || text === undefined) {
      textToDisplay = '';
    } else if (typeof text === 'string') {
      textToDisplay = text;
    } else if (typeof text === 'object') {
      // If it's an object (like PointerEvent), don't display it
      textToDisplay = '';
    } else {
      textToDisplay = String(text);
    }
  } catch (e) {
    textToDisplay = '';
  }
  
  const content = msg.querySelector(".msg-content");
  if (content) {
    content.textContent = textToDisplay;
  } else {
    msg.textContent = textToDisplay;
  }
  chatBox.scrollTop = chatBox.scrollHeight;
}

// API functions
async function loadCharacters() {
  try {
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
    characterSelect.innerHTML = '<option value="">Select a character</option>';
    characters.forEach(char => {
      const option = document.createElement("option");
      option.value = char.id;
      option.textContent = char.name;
      characterSelect.appendChild(option);
    });
    
    // Initialize input state (no character selected by default)
    currentCharacter = "";
    characterSelect.value = "";
    updateInputState();
  } catch (err) {
    console.error("Failed to load characters:", err);
    appendMessage("bot", "👻 Boo! I'm SpookyGPT! What spooky topic can I help you with?");
  }
}

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

// Chat functions
async function sendMessage(text = null) {
  // Get text from parameter or input field
  let messageText;
  if (text && typeof text === 'string') {
    messageText = text;
  } else {
    messageText = input.value.trim();
  }
  
  if (!messageText || cooldownActive || !currentCharacter) {
    return;
  }

  addToMessageCache(currentCharacter, messageText);
  
  // Show user message
  appendMessage("user", messageText);
  input.value = "";
  
  // Disable input while processing
  disableInputWhileProcessing();

  // Check if cooldown should start (every 5 messages)
  const newSessionCount = Number(sessionStorage.getItem('spookygpt_session_queries') || '0') + 1;
  sessionStorage.setItem('spookygpt_session_queries', String(newSessionCount));
  
  if (newSessionCount % 5 === 0 && !cooldownActive) {
    startCooldown();
  }

  // Show thinking message
  let thinkingMsg = appendMessage("bot", "💭 Thinking...");

  try {
    const cachedMessages = getCachedMessages(currentCharacter);
    const cachedResponses = getCachedResponses(currentCharacter);
    
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        prompt: messageText,
        character: currentCharacter,
        cachedMessages: cachedMessages,
        cachedResponses: cachedResponses
      })
    });

    if (!res.ok) {
      const errorMsg = `Error: ${res.statusText}`;
      updateMessage(thinkingMsg, errorMsg);
      // Speak error if speech is enabled
      if (speechEnabled) {
        speakText(errorMsg, currentCharacter);
      }
      enableInputAfterProcessing();
      return;
    }

    // Handle streaming response
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = "";

    // Update message
    updateMessage(thinkingMsg, "");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      
      // Update text
      updateMessage(thinkingMsg, fullResponse);
      
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    // Ensure we have the complete response
    updateMessage(thinkingMsg, fullResponse);
    
    // Speak the response if speech is enabled
    if (speechEnabled) {
      speakText(fullResponse, currentCharacter);
    }
    
    addToResponseCache(currentCharacter, fullResponse);

  } catch (err) {
    const errorMsg = "Network error: " + err.message;
    updateMessage(thinkingMsg, errorMsg);
    // Speak error if speech is enabled
    if (speechEnabled) {
      speakText(errorMsg, currentCharacter);
    }
  } finally {
    // Re-enable input after processing is complete
    enableInputAfterProcessing();
  }
}


// Music functions
function requestAudioPermission() {
  const allowAudioBtn = document.getElementById("allowAudioBtn");
  
  if (permissionOverlay && !permissionShown) {
    permissionOverlay.style.display = 'flex';
  }
  
  if (allowAudioBtn) {
    allowAudioBtn.addEventListener('click', () => {
      enableAudioControls();
      hidePermissionOverlay();
    });
  }
}

function enableAudioControls() {
  console.log('🔊 Enabling audio controls...');
  
  // Enable music
  startMusic();
  
  // Enable speech by triggering user interaction
  if ('speechSynthesis' in window) {
    console.log('🎤 Speech synthesis enabled via user interaction');
    // Create a silent utterance to enable speech synthesis
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.cancel();
  }
  
  // Mark audio as enabled
  window.audioEnabled = true;
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

// Speech Synthesis Functions
function cleanTextForSpeech(text) {
  // Remove emojis and special characters that don't translate well to speech
  return text
    .replace(/[👻🎃🧙‍♀️🧛‍♂️🐺🧠⚗️✨🔮🌙💭]/g, '') // Remove emojis
    .replace(/\*([^*]+)\*/g, '$1') // Remove asterisk emphasis
    .replace(/\([^)]*\)/g, '') // Remove parenthetical asides
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Web Audio API Functions for Voice Effects
function initializeAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
      return false;
    }
  }
  return true;
}

function createVoiceEffects(characterId) {
  const characterVoice = speechConfig.characterVoices?.[characterId] || speechConfig.characterVoices?.default;
  const effects = characterVoice?.effects || {};
  
  // If no effects are needed, return null to bypass audio processing
  if (effects.reverb === 0 && effects.echo === 0 && effects.distortion === 0 && effects.lowpass >= 1.0) {
    return null;
  }
  
  if (!initializeAudioContext()) return null;
  
  // Create audio nodes with cleaner routing
  const source = audioContext.createGain();
  const outputGain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  
  // Always connect dry signal for clarity
  source.connect(dryGain);
  dryGain.connect(outputGain);
  
  // Configure subtle reverb
  if (effects.reverb > 0) {
    const reverbBuffer = createSubtleReverbBuffer(effects.reverb);
    const convolver = audioContext.createConvolver();
    convolver.buffer = reverbBuffer;
    
    source.connect(wetGain);
    wetGain.connect(convolver);
    convolver.connect(outputGain);
    
    // Balance dry and wet signals
    dryGain.gain.value = 0.8;
    wetGain.gain.value = effects.reverb * 0.3;
  } else {
    dryGain.gain.value = 1.0;
    wetGain.gain.value = 0;
  }
  
  // Configure subtle echo
  if (effects.echo > 0) {
    const delay = audioContext.createDelay(0.5);
    const feedback = audioContext.createGain();
    const echoGain = audioContext.createGain();
    
    delay.delayTime.value = 0.2; // Shorter delay for clarity
    feedback.gain.value = effects.echo * 0.2; // Less feedback
    echoGain.gain.value = effects.echo * 0.4;
    
    source.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(echoGain);
    echoGain.connect(outputGain);
  }
  
  // Configure subtle distortion
  if (effects.distortion > 0) {
    const distortion = audioContext.createWaveShaper();
    distortion.curve = createSubtleDistortionCurve(effects.distortion);
    distortion.oversample = '2x'; // Less oversampling for clarity
    
    const distortionGain = audioContext.createGain();
    distortionGain.gain.value = effects.distortion * 0.5; // Reduce distortion level
    
    source.connect(distortion);
    distortion.connect(distortionGain);
    distortionGain.connect(outputGain);
  }
  
  // Configure gentle lowpass filter
  if (effects.lowpass < 1.0) {
    const lowpassFilter = audioContext.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.value = 3000 + (effects.lowpass * 2000); // Higher frequency for clarity
    lowpassFilter.Q.value = 0.5; // Gentler filter
    
    source.connect(lowpassFilter);
    lowpassFilter.connect(outputGain);
  }
  
  outputGain.gain.value = 0.9; // Higher output volume
  
  return {
    source,
    output: outputGain,
    cleanup: () => {
      try {
        source.disconnect();
        outputGain.disconnect();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  };
}

function createSubtleReverbBuffer(amount) {
  const length = audioContext.sampleRate * 1; // Shorter reverb
  const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      // More subtle reverb with smoother decay
      channelData[i] = (Math.random() * 2 - 1) * amount * 0.3 * Math.pow(1 - i / length, 3);
    }
  }
  
  return buffer;
}

function createSubtleDistortionCurve(amount) {
  const samples = 44100;
  const curve = new Float32Array(samples);
  
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    // Much gentler distortion curve
    curve[i] = Math.tanh(x * (1 + amount * 2)) * 0.8;
  }
  
  return curve;
}

function initializeSpeechSynthesis() {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported');
    showSpeechNotSupportedMessage();
    return false;
  }
  
  // Check if we're on a mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    console.log('📱 Mobile device detected - using mobile-optimized speech synthesis');
  }
  
  return true;
}

function showSpeechNotSupportedMessage() {
  // Show a user-friendly message when speech synthesis isn't supported
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(255, 69, 0, 0.9);
    color: white;
    padding: 1rem 2rem;
    border-radius: 10px;
    z-index: 1000;
    font-weight: bold;
    text-align: center;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  `;
  message.innerHTML = '🔇 Speech not supported on this device. Text-only mode active.';
  
  document.body.appendChild(message);
  
  // Remove message after 5 seconds
  setTimeout(() => {
    if (message.parentNode) {
      message.parentNode.removeChild(message);
    }
  }, 5000);
}

// Load voices on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize speech button as ON by default
  if (speechButton) {
    speechButton.textContent = "🔊 Speech On";
    speechButton.classList.add("active");
  }
  
  setTimeout(() => {
    const voices = speechSynthesis.getVoices();
    console.log('🎤 Available voices:', voices.map(v => v.name));
    
    // Check for our specific voices
    const targetVoices = [
      "Daniel",
      "Moira", 
      "Ralph",
      "Grandpa"
    ];
    
    targetVoices.forEach(voiceName => {
      const found = voices.find(v => v.name === voiceName);
      if (found) {
        console.log(`✅ Found voice: ${voiceName}`);
      } else {
        console.log(`❌ Missing voice: ${voiceName}`);
      }
    });
  }, 1000);
});

// Wait for voices to load
function waitForVoices() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      console.log('🎤 Voices loaded:', voices.length, 'voices available');
      resolve(voices);
    } else {
      speechSynthesis.addEventListener('voiceschanged', () => {
        const loadedVoices = speechSynthesis.getVoices();
        console.log('🎤 Voices loaded:', loadedVoices.length, 'voices available');
        resolve(loadedVoices);
      }, { once: true });
    }
  });
}

function speakText(text, characterId) {
  console.log(`🎤 speakText called: characterId=${characterId}, text="${text.substring(0, 50)}..."`);
  
  // Check if audio controls are enabled
  if (!window.audioEnabled) {
    console.log('🔇 Audio controls not enabled - skipping speech');
    return;
  }
  
  // Mobile devices can use the full character voice system
  
  if (!initializeSpeechSynthesis()) {
    console.error('❌ Speech synthesis initialization failed');
    showMobileSpeechAlternative(text);
    return;
  }

  // Clean text for better speech synthesis
  const cleanText = cleanTextForSpeech(text);
  if (!cleanText) {
    console.warn('⚠️ Clean text is empty, skipping speech');
    return;
  }
  
  console.log(`🧹 Cleaned text: "${cleanText}"`);

  // Simple cache check
  const cacheKey = `${characterId}-${cleanText}`;
  if (speechCache.has(cacheKey)) {
    console.log('♻️ Speech already cached, skipping');
    return;
  }
  speechCache.set(cacheKey, true);
  if (speechCache.size > 50) speechCache.clear();

  // Check if we're on mobile and need user interaction
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile) {
    // For mobile browsers, ensure we have user interaction
    // This is often required for speech synthesis to work
    console.log('📱 Mobile device - ensuring user interaction for speech synthesis');
  }

  // Save current music state and pause music
  musicStateBeforeSpeech = isMusicPlaying;
  if (isMusicPlaying && backgroundMusic) {
    backgroundMusic.pause();
    isMusicPlaying = false;
    updateMusicButton();
  }

  // Disable all controls while speaking
  disableAllControlsWhileSpeaking();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  
  // Get character-specific voice settings
  const characterVoice = speechConfig.characterVoices?.[characterId] || speechConfig.characterVoices?.default;
  
  if (characterVoice) {
    utterance.rate = characterVoice.rate || 0.9;
    utterance.pitch = characterVoice.pitch || 1.0;
    utterance.volume = characterVoice.volume || 0.8;
    
    // Use the same voice everywhere - no mobile fallbacks
    const voices = window.speechSynthesis.getVoices();
    const targetVoiceName = characterVoice.voice;
    
    console.log(`🎯 Looking for voice: "${targetVoiceName}" for character: ${characterId}`);
    let selectedVoice = voices.find(voice => voice.name === targetVoiceName);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log(`🎭 Using voice: ${selectedVoice.name} for ${characterId}`);
    } else {
      console.warn(`⚠️ Voice "${targetVoiceName}" not found for ${characterId}, using fallback`);
      console.log('Available voices:', voices.map(v => v.name));
      
      // Use fallback voice selection
      selectedVoice = getBestFallbackVoice(characterId, voices);
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log(`🎭 Using FALLBACK voice: ${selectedVoice.name} for ${characterId}`);
      } else {
        console.warn(`⚠️ No suitable voice found for ${characterId}, using default`);
        // Let the browser use its default voice
      }
    }
  }

  // Create voice effects for this character
  const voiceEffects = createVoiceEffects(characterId);
  console.log('🎛️ Voice effects created:', voiceEffects ? 'Yes' : 'No');
  
  // Enhanced character-specific speech modifications
  applyCharacterVoiceModifications(utterance, characterId);

  utterance.onstart = () => {
    console.log('🎵 Speech STARTED - audio should be playing now');
  };

  utterance.onend = () => {
    console.log('🏁 Speech ENDED - audio finished');
    // Clean up voice effects
    if (voiceEffects) {
      voiceEffects.cleanup();
    }
    
    // Re-enable all controls after speaking
    enableAllControlsAfterSpeaking();
    
    // Restore music if it was playing before
    if (musicStateBeforeSpeech && backgroundMusic) {
      backgroundMusic.play().then(() => {
        isMusicPlaying = true;
        updateMusicButton();
      }).catch(err => {
        isMusicPlaying = false;
        updateMusicButton();
      });
    }
  };

  utterance.onerror = (event) => {
    console.error('Speech synthesis error:', event.error);
    
    // Clean up voice effects
    if (voiceEffects) {
      voiceEffects.cleanup();
    }
    
    // Provide user feedback for mobile-specific issues
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (isMobile) {
      console.warn('📱 Mobile speech synthesis failed - this may be due to browser limitations');
      // On mobile, we might want to show a subtle notification
      // but don't interrupt the user experience
    }
    
    // Re-enable all controls even if there's an error
    enableAllControlsAfterSpeaking();
    
    // Restore music if it was playing before
    if (musicStateBeforeSpeech && backgroundMusic) {
      backgroundMusic.play().then(() => {
        isMusicPlaying = true;
        updateMusicButton();
      }).catch(err => {
        isMusicPlaying = false;
        updateMusicButton();
      });
    }
  };

  console.log('🔊 About to call speechSynthesis.speak()...');
  console.log('📊 Utterance details:', {
    text: utterance.text,
    voice: utterance.voice?.name || 'default',
    rate: utterance.rate,
    pitch: utterance.pitch,
    volume: utterance.volume
  });
  
  window.speechSynthesis.speak(utterance);
  console.log('✅ speechSynthesis.speak() called');
}

function getBestFallbackVoice(characterId, voices) {
  if (!voices || voices.length === 0) {
    console.warn('No voices available for fallback');
    return null;
  }
  
  // Voice preferences for fallback (same everywhere)
  const voicePreferences = {
    vampire: ['male', 'man', 'masculine', 'deep', 'low'],
    witch: ['female', 'woman', 'feminine', 'high', 'soprano'],
    werewolf: ['male', 'man', 'masculine', 'deep', 'growl'],
    zombie: ['male', 'man', 'masculine', 'deep', 'slow'],
    default: ['female', 'woman', 'feminine', 'natural']
  };
  
  const preferences = voicePreferences[characterId] || voicePreferences.default;
  
  // Filter out robotic/synthetic voices for better quality
  const qualityVoices = voices.filter(v => 
    !v.name.toLowerCase().includes('robotic') &&
    !v.name.toLowerCase().includes('synthetic') &&
    !v.name.toLowerCase().includes('artificial')
  );
  
  // Use quality voices for fallback
  const voicesToUse = qualityVoices.length > 0 ? qualityVoices : voices;
  
  // Try to match character preferences
  for (const preference of preferences) {
    const voice = voicesToUse.find(v => 
      v.name.toLowerCase().includes(preference) ||
      v.lang.toLowerCase().includes(preference)
    );
    if (voice) return voice;
  }
  
  // Prefer voices that sound most natural
  const naturalVoices = voices.filter(v => 
    !v.name.toLowerCase().includes('robotic') &&
    !v.name.toLowerCase().includes('synthetic') &&
    !v.name.toLowerCase().includes('artificial') &&
    !v.name.toLowerCase().includes('system') &&
    (v.name.toLowerCase().includes('natural') ||
     v.name.toLowerCase().includes('human') ||
     v.name.toLowerCase().includes('neural') ||
     v.name.toLowerCase().includes('enhanced'))
  );
  
  if (naturalVoices.length > 0) {
    return naturalVoices[0];
  }
  
  // Fallback to first available voice
  console.log(`🔄 Using first available voice: ${voices[0].name}`);
  return voices[0] || null;
}

function applyCharacterVoiceModifications(utterance, characterId) {
  // No modifications - keep voices completely natural and human-like
  // All characters will sound like normal people with just different voice types
}

function stopAllSpeech() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  // Re-enable controls when speech is stopped
  enableAllControlsAfterSpeaking();
}

function loadSpeechConfig() {
  // Load speech configuration from server
  fetch('/api/speech-config')
    .then(res => res.json())
    .then(config => {
      speechConfig = config;
      console.log('Loaded speech config:', speechConfig);
      loadVoices();
    })
    .catch(err => {
      console.error('Could not load speech config from server:', err);
      console.error('Speech synthesis will be disabled until server configuration is available');
      speechConfig = {
        speechEnabled: false,
        characterVoices: {}
      };
    });
}

function loadVoices() {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // Mobile browsers often need a trigger to load voices
  if (isMobile) {
    console.log('📱 Mobile device - triggering voice loading');
    // Create a temporary utterance to trigger voice loading on mobile
    const tempUtterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(tempUtterance);
    window.speechSynthesis.cancel(); // Cancel immediately
  }
  
  // Ensure voices are loaded
  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('Voices loaded:', voices.length);
      console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
      
      // Log which voices we'll try to use for each character
      Object.keys(speechConfig.characterVoices || {}).forEach(characterId => {
        const config = speechConfig.characterVoices[characterId];
        const voice = voices.find(v => v.name === config.voice);
        if (voice) {
          console.log(`✅ ${characterId}: Using "${voice.name}"`);
        } else {
          console.log(`⚠️ ${characterId}: Voice "${config.voice}" not found, will use fallback`);
        }
      });
    });
  } else {
    const voices = window.speechSynthesis.getVoices();
    console.log('Voices already loaded:', voices.length);
    console.log('Available voices:', voices.map(v => `${v.name} (${v.lang})`));
  }
}

// Event listeners
sendBtn.addEventListener("click", () => sendMessage());
musicToggle.addEventListener("click", (e) => {
  // Prevent music toggle while speaking or during cooldown
  if (isSpeaking || cooldownActive) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  toggleMusic();
});

// Speech toggle event listener
if (speechButton) {
  speechButton.addEventListener("click", () => {
    if (isSpeaking) {
      stopAllSpeech();
    } else {
      toggleSpeech();
    }
  });
}

// Test speech button event listener
const testSpeechBtn = document.getElementById("testSpeechBtn");
console.log('🔍 Test speech button element:', testSpeechBtn);
if (testSpeechBtn) {
  console.log('✅ Test speech button found, adding event listener');
  testSpeechBtn.addEventListener("click", () => {
    console.log('🧪 Test button clicked - running speech test...');
    testSpeechSynthesis();
  });
} else {
  console.error('❌ Test speech button not found!');
}

// Simple test button event listener
const simpleTestBtn = document.getElementById("simpleTestBtn");
if (simpleTestBtn) {
  simpleTestBtn.addEventListener("click", () => {
    console.log('🔬 Simple test button clicked...');
    simpleSpeechTest();
  });
}

// Mobile test button event listener
const mobileTestBtn = document.getElementById("mobileTestBtn");
if (mobileTestBtn) {
  mobileTestBtn.addEventListener("click", () => {
    console.log('📱 Mobile test button clicked...');
    speakTextSimple('Hello, this is a mobile speech test. Can you hear me?');
  });
}

// Alternative test button event listener
const altTestBtn = document.getElementById("altTestBtn");
console.log('🔍 Alt test button element:', altTestBtn);
if (altTestBtn) {
  console.log('✅ Alt test button found, adding event listener');
  altTestBtn.addEventListener("click", () => {
    console.log('🔄 Alternative test button clicked...');
    console.log('🔊 About to try speech synthesis...');
    
    // Super simple test first
    try {
      const utterance = new SpeechSynthesisUtterance('Test');
      utterance.onstart = () => console.log('✅ Speech started!');
      utterance.onend = () => console.log('✅ Speech ended!');
      utterance.onerror = (e) => console.log('❌ Speech error:', e.error);
      window.speechSynthesis.speak(utterance);
      console.log('✅ speak() called successfully');
    } catch (error) {
      console.error('❌ Error calling speech synthesis:', error);
    }
  });
} else {
  console.error('❌ Alt test button not found!');
}

// Simple speech test that bypasses all app logic
function simpleSpeechTest() {
  console.log('🔬 Running SIMPLE speech test...');
  
  // Stop any existing speech first
  window.speechSynthesis.cancel();
  
  // Wait a moment for cancellation to complete
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance('Hello world');
    
    // Use default settings - no voice selection
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => {
      console.log('✅ SIMPLE test: Speech started!');
    };
    
    utterance.onend = () => {
      console.log('✅ SIMPLE test: Speech ended!');
    };
    
    utterance.onerror = (event) => {
      console.error('❌ SIMPLE test error:', event.error);
    };
    
    console.log('🔊 SIMPLE test: About to speak...');
    window.speechSynthesis.speak(utterance);
    console.log('✅ SIMPLE test: speak() called');
  }, 100);
}

// Make simple test available globally
window.simpleSpeechTest = simpleSpeechTest;

// Super simple mobile speech function
function speakTextSimple(text) {
  console.log('📱 Simple mobile speech:', text.substring(0, 50) + '...');
  
  // Stop any existing speech
  window.speechSynthesis.cancel();
  
  // Wait briefly then speak
  setTimeout(() => {
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Use default voice and settings
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    utterance.onstart = () => {
      console.log('✅ Mobile speech started');
    };
    
    utterance.onend = () => {
      console.log('✅ Mobile speech ended');
    };
    
    utterance.onerror = (event) => {
      console.error('❌ Mobile speech error:', event.error);
    };
    
    console.log('🔊 Speaking:', text);
    window.speechSynthesis.speak(utterance);
  }, 200);
}

// Alternative TTS using Web Speech API with different approach
function speakTextAlternative(text) {
  console.log('🔄 Trying alternative TTS approach...');
  
  // Clean the text
  const cleanText = text.replace(/[👻🎃🧙‍♀️🧛‍♂️🐺🧠⚗️✨🔮🌙💭]/g, '').trim();
  
  if (!cleanText) {
    console.log('⚠️ No text to speak after cleaning');
    return;
  }
  
  // Try multiple approaches
  tryApproach1(cleanText);
}

function tryApproach1(text) {
  console.log('🔄 Approach 1: Basic utterance with no voice selection');
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.8;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  
  utterance.onstart = () => {
    console.log('✅ Approach 1: Speech started!');
  };
  
  utterance.onend = () => {
    console.log('✅ Approach 1: Speech completed!');
  };
  
  utterance.onerror = (event) => {
    console.log('❌ Approach 1 failed:', event.error);
    tryApproach2(text);
  };
  
  window.speechSynthesis.speak(utterance);
  
  // If no response in 3 seconds, try next approach
  setTimeout(() => {
    if (!utterance.onstart) {
      console.log('⏰ Approach 1 timeout, trying approach 2');
      tryApproach2(text);
    }
  }, 3000);
}

function tryApproach2(text) {
  console.log('🔄 Approach 2: Using first available voice');
  
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    console.log('❌ No voices available for approach 2');
    tryApproach3(text);
    return;
  }
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voices[0];
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 0.9;
  
  utterance.onstart = () => {
    console.log('✅ Approach 2: Speech started!');
  };
  
  utterance.onend = () => {
    console.log('✅ Approach 2: Speech completed!');
  };
  
  utterance.onerror = (event) => {
    console.log('❌ Approach 2 failed:', event.error);
    tryApproach3(text);
  };
  
  window.speechSynthesis.speak(utterance);
}

function tryApproach3(text) {
  console.log('🔄 Approach 3: Audio element fallback');
  
  // Create a simple audio notification instead
  const audio = new Audio();
  audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
  audio.volume = 0.3;
  
  audio.onplay = () => {
    console.log('✅ Approach 3: Audio notification played');
  };
  
  audio.onerror = () => {
    console.log('❌ All approaches failed - speech not supported on this device');
    showSpeechNotSupportedMessage();
  };
  
  audio.play().catch(() => {
    console.log('❌ All approaches failed - speech not supported on this device');
    showSpeechNotSupportedMessage();
  });
}

// Mobile speech capability testing
function testMobileSpeechCapability() {
  console.log('📱 Testing mobile speech capability...');
  
  const utterance = new SpeechSynthesisUtterance('Test');
  let speechWorked = false;
  
  utterance.onstart = () => {
    console.log('✅ Mobile speech test: SUCCESS!');
    speechWorked = true;
  };
  
  utterance.onend = () => {
    console.log('✅ Mobile speech test: Completed');
  };
  
  utterance.onerror = (event) => {
    console.log('❌ Mobile speech test: Failed -', event.error);
  };
  
  // Set a timeout to detect if speech never starts
  setTimeout(() => {
    if (!speechWorked) {
      console.log('⚠️ Mobile speech test: No audio detected - mobile speech likely not working');
      showMobileSpeechInfo();
    }
  }, 2000);
  
  window.speechSynthesis.speak(utterance);
}

function showMobileSpeechInfo() {
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 2rem;
    border-radius: 15px;
    z-index: 2000;
    font-weight: bold;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    max-width: 300px;
    width: 90%;
  `;
  message.innerHTML = `
    <div style="font-size: 1.5rem; margin-bottom: 1rem;">📱 Mobile Speech Issue</div>
    <div style="font-size: 1rem; margin-bottom: 1.5rem; line-height: 1.4;">
      Speech synthesis doesn't work reliably on mobile browsers. This is a known limitation.
    </div>
    <div style="font-size: 0.9rem; margin-bottom: 1.5rem; opacity: 0.8;">
      Your app will work perfectly for text conversations!
    </div>
    <button onclick="this.parentElement.remove()" style="
      padding: 0.8rem 1.5rem;
      border: none;
      border-radius: 10px;
      background: #ff4500;
      color: white;
      font-weight: bold;
      cursor: pointer;
    ">Got it!</button>
  `;
  
  document.body.appendChild(message);
}

function showMobileSpeechAlternative(text) {
  // Show a subtle notification that speech isn't available
  const message = document.createElement('div');
  message.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(255, 69, 0, 0.9);
    color: white;
    padding: 0.8rem 1.2rem;
    border-radius: 8px;
    z-index: 1000;
    font-size: 0.9rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  `;
  message.innerHTML = '🔇 Speech not available on mobile';
  
  document.body.appendChild(message);
  
  setTimeout(() => {
    if (message.parentNode) {
      message.parentNode.removeChild(message);
    }
  }, 3000);
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !sendBtn.disabled && !input.disabled) {
    e.preventDefault();
    sendMessage();
  }
});

characterSelect.addEventListener("change", (e) => {
  // TRIPLE-CHECK: prevent character change while waiting for response, speaking, OR cooldown
  if (isWaitingForResponse || isSpeaking || cooldownActive) {
    e.preventDefault();
    e.stopPropagation();
    e.target.value = currentCharacter;
    return;
  }
  
  currentCharacter = e.target.value;
  updateInputState();
  
  // Stop any ongoing speech when changing characters
  stopAllSpeech();
  
  if (currentCharacter) {
    // Reset chat and show greeting for selected character
    chatBox.innerHTML = "";
    const greeting = characters.find(c => c.id === currentCharacter)?.greeting || "👻 Boo! I'm SpookyGPT!";
    appendMessage("bot", greeting);
    
    // Speak greeting if speech is enabled
    if (speechEnabled) {
      speakText(greeting, currentCharacter);
    }
  } else {
    // Reset chat when no character is selected
    chatBox.innerHTML = "";
  }
});

// Simple speech test function for debugging
function testSpeechSynthesis() {
  console.log('🧪 Testing speech synthesis...');
  
  // Check if speech synthesis is supported
  if (!('speechSynthesis' in window)) {
    console.error('❌ Speech synthesis not supported');
    return false;
  }
  
  console.log('✅ Speech synthesis is supported');
  
  // Get available voices
  const voices = window.speechSynthesis.getVoices();
  console.log(`📢 Found ${voices.length} voices:`, voices.map(v => v.name));
  
  if (voices.length === 0) {
    console.warn('⚠️ No voices found - trying to load voices...');
    // Try to trigger voice loading
    const tempUtterance = new SpeechSynthesisUtterance('');
    window.speechSynthesis.speak(tempUtterance);
    window.speechSynthesis.cancel();
    
    // Wait a bit and check again
    setTimeout(() => {
      const voicesAfter = window.speechSynthesis.getVoices();
      console.log(`📢 After loading attempt: ${voicesAfter.length} voices:`, voicesAfter.map(v => v.name));
      
      if (voicesAfter.length > 0) {
        testActualSpeech(voicesAfter[0]);
      } else {
        console.error('❌ Still no voices available');
      }
    }, 1000);
  } else {
    testActualSpeech(voices[0]);
  }
  
  return true;
}

function testActualSpeech(voice) {
  console.log(`🎤 Testing speech with voice: ${voice.name}`);
  
  const utterance = new SpeechSynthesisUtterance('Hello, this is a test of speech synthesis');
  utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 0.8;
  
  utterance.onstart = () => {
    console.log('✅ Speech started successfully!');
  };
  
  utterance.onend = () => {
    console.log('✅ Speech completed successfully!');
  };
  
  utterance.onerror = (event) => {
    console.error('❌ Speech error:', event.error);
  };
  
  console.log('🔊 Attempting to speak...');
  console.log('📊 Test utterance details:', {
    text: utterance.text,
    voice: utterance.voice?.name || 'default',
    rate: utterance.rate,
    pitch: utterance.pitch,
    volume: utterance.volume
  });
  
  window.speechSynthesis.speak(utterance);
  console.log('✅ Test speechSynthesis.speak() called');
}

// Make test function available globally for console testing
window.testSpeechSynthesis = testSpeechSynthesis;

// Initialize application
console.log('🚀 Initializing SpookyGPT application...');
console.log('📱 User agent:', navigator.userAgent);
console.log('🔍 Speech synthesis available:', 'speechSynthesis' in window);

try {
  console.log('📡 Loading characters...');
  loadCharacters();
} catch (error) {
  console.error('❌ Error loading characters:', error);
}

try {
  console.log('🎤 Loading speech config...');
  loadSpeechConfig();
} catch (error) {
  console.error('❌ Error loading speech config:', error);
}

try {
  console.log('🔊 Requesting audio permission...');
  requestAudioPermission();
} catch (error) {
  console.error('❌ Error requesting audio permission:', error);
}

try {
  console.log('🎵 Updating music button...');
  updateMusicButton();
} catch (error) {
  console.error('❌ Error updating music button:', error);
}

try {
  console.log('📝 Updating input state...');
  updateInputState();
} catch (error) {
  console.error('❌ Error updating input state:', error);
}

console.log('✅ Application initialization complete');