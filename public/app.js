// DOM Elements
const chatBox = document.getElementById("chat");
const input = document.getElementById("prompt");
const sendBtn = document.getElementById("send");
const characterSelect = document.getElementById("character");
const musicToggle = document.getElementById("musicToggle");
const backgroundMusic = document.getElementById("backgroundMusic");
const permissionOverlay = document.getElementById("permissionOverlay");
const allowMusicBtn = document.getElementById("allowMusicBtn");
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
let speechEnabled = false;
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
function requestMusicPermission() {
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
  if (!initializeAudioContext()) return null;
  
  const characterVoice = speechConfig.characterVoices?.[characterId] || speechConfig.characterVoices?.default;
  const effects = characterVoice?.effects || {};
  
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
    return false;
  }
  return true;
}

function speakText(text, characterId) {
  if (!initializeSpeechSynthesis()) {
    return;
  }

  // Clean text for better speech synthesis
  const cleanText = cleanTextForSpeech(text);
  if (!cleanText) {
    return;
  }

  // Simple cache check
  const cacheKey = `${characterId}-${cleanText}`;
  if (speechCache.has(cacheKey)) {
    return;
  }
  speechCache.set(cacheKey, true);
  if (speechCache.size > 50) speechCache.clear();

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
    
    // Try to set the voice if available
    const voices = window.speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => voice.name === characterVoice.voice);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    } else {
      // Fallback to best available voice for character type
      const fallbackVoice = getBestFallbackVoice(characterId, voices);
      if (fallbackVoice) {
        utterance.voice = fallbackVoice;
      }
    }
  }

  // Create voice effects for this character
  const voiceEffects = createVoiceEffects(characterId);
  
  // Enhanced character-specific speech modifications
  applyCharacterVoiceModifications(utterance, characterId);

  utterance.onend = () => {
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

  utterance.onerror = () => {
    // Clean up voice effects
    if (voiceEffects) {
      voiceEffects.cleanup();
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

  window.speechSynthesis.speak(utterance);
}

function getBestFallbackVoice(characterId, voices) {
  // Prioritize clearer, more natural voices
  const voicePreferences = {
    vampire: ['google', 'male', 'british', 'english', 'us'],
    witch: ['google', 'female', 'british', 'english', 'us'],
    werewolf: ['google', 'male', 'british', 'english', 'us'],
    zombie: ['google', 'male', 'british', 'english', 'us'],
    default: ['google', 'female', 'british', 'english', 'us']
  };
  
  const preferences = voicePreferences[characterId] || voicePreferences.default;
  
  // First try to find Google voices (usually clearest)
  for (const preference of preferences) {
    const voice = voices.find(v => 
      v.name.toLowerCase().includes(preference) && 
      v.name.toLowerCase().includes('google')
    );
    if (voice) return voice;
  }
  
  // Then try any voice with preferences
  for (const preference of preferences) {
    const voice = voices.find(v => 
      v.name.toLowerCase().includes(preference) || 
      v.lang.toLowerCase().includes(preference)
    );
    if (voice) return voice;
  }
  
  // Prefer voices that aren't obviously robotic
  const naturalVoices = voices.filter(v => 
    !v.name.toLowerCase().includes('robotic') &&
    !v.name.toLowerCase().includes('synthetic') &&
    !v.name.toLowerCase().includes('artificial')
  );
  
  if (naturalVoices.length > 0) {
    return naturalVoices[0];
  }
  
  // Fallback to first available voice
  return voices[0] || null;
}

function applyCharacterVoiceModifications(utterance, characterId) {
  // More natural character-specific modifications
  switch (characterId) {
    case 'vampire':
      utterance.rate = Math.max(0.7, utterance.rate - 0.1);
      utterance.pitch = Math.max(0.8, utterance.pitch - 0.15);
      utterance.volume = Math.min(1.0, utterance.volume + 0.05);
      break;
      
    case 'zombie':
      utterance.rate = Math.max(0.6, utterance.rate - 0.2);
      utterance.pitch = Math.max(0.7, utterance.pitch - 0.2);
      utterance.volume = Math.max(0.8, utterance.volume - 0.05);
      break;
      
    case 'witch':
      utterance.rate = Math.min(1.2, utterance.rate + 0.1);
      utterance.pitch = Math.min(1.3, utterance.pitch + 0.15);
      utterance.volume = Math.min(1.0, utterance.volume + 0.05);
      break;
      
    case 'werewolf':
      utterance.rate = Math.max(0.8, utterance.rate - 0.05);
      utterance.pitch = Math.max(0.9, utterance.pitch - 0.05);
      utterance.volume = Math.min(1.0, utterance.volume + 0.05);
      break;
      
    case 'default':
      // SpookyGPT - clear and friendly
      utterance.rate = Math.max(0.9, utterance.rate - 0.05);
      utterance.pitch = Math.max(0.95, utterance.pitch - 0.05);
      utterance.volume = Math.min(1.0, utterance.volume + 0.05);
      break;
  }
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
      console.warn('Could not load speech config:', err);
      // Use enhanced default config with subtle effects
      speechConfig = {
        speechEnabled: true,
        characterVoices: {
          default: { 
            rate: 0.95, 
            pitch: 1.0, 
            volume: 0.9,
            voice: "Google UK English Female",
            effects: {
              reverb: 0.05,
              echo: 0.0,
              distortion: 0.0,
              lowpass: 1.0
            }
          },
          vampire: { 
            rate: 0.8, 
            pitch: 0.85, 
            volume: 0.9,
            voice: "Google UK English Male",
            effects: {
              reverb: 0.1,
              echo: 0.05,
              distortion: 0.0,
              lowpass: 0.95
            }
          },
          witch: { 
            rate: 1.05, 
            pitch: 1.15, 
            volume: 0.9,
            voice: "Google UK English Female",
            effects: {
              reverb: 0.08,
              echo: 0.03,
              distortion: 0.0,
              lowpass: 1.0
            }
          },
          werewolf: { 
            rate: 0.9, 
            pitch: 0.95, 
            volume: 0.9,
            voice: "Google UK English Male",
            effects: {
              reverb: 0.06,
              echo: 0.02,
              distortion: 0.05,
              lowpass: 0.98
            }
          },
          zombie: { 
            rate: 0.7, 
            pitch: 0.8, 
            volume: 0.85,
            voice: "Google UK English Male",
            effects: {
              reverb: 0.15,
              echo: 0.08,
              distortion: 0.1,
              lowpass: 0.85
            }
          }
        }
      };
      loadVoices();
    });
}

function loadVoices() {
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

// Initialize application
loadCharacters();
loadSpeechConfig();
requestMusicPermission();
updateMusicButton();
updateInputState();