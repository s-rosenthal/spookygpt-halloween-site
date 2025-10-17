import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

// Global query counter and performance metrics
let totalQueries = 0;
const serverStartedAt = Date.now();
const queryHistory = [];
const recentQueries = []; // Store recent queries for admin view
let servicesPaused = false; // Admin can pause all services

// LED control state
let lastLedCommand = null; // Track last LED command sent

// Setup file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "halloween-config.json");

// Load Halloween configuration
let halloweenConfig = {};
try {
  halloweenConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  console.warn("Could not load Halloween config:", err.message);
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: true,
  credentials: true
}));

// Serve static files
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { prompt, character = "default", cachedMessages = [], cachedResponses = [] } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    // Check if services are paused
    if (servicesPaused) {
      return res.status(503).json({ error: "Services are temporarily disabled for maintenance" });
    }

    // Get character configuration
    const characterConfig = halloweenConfig.characters?.[character] || halloweenConfig.characters?.default;
    const settings = halloweenConfig.settings || {};
    
    // Build context prompt
    const systemPrompt = characterConfig?.systemPrompt || "You are a helpful Halloween-themed assistant.";
    let contextPrompt = systemPrompt + "\n\n";
    
    // Add conversation history
    const maxHistory = Math.min(cachedMessages.length, cachedResponses.length);
    for (let i = maxHistory - 1; i >= 0; i--) {
      contextPrompt += `User: ${cachedMessages[i]}\n`;
      if (cachedResponses[i]) {
        contextPrompt += `Assistant: ${cachedResponses[i]}\n`;
      }
    }
    
    contextPrompt += `User: ${prompt}\nAssistant:`;

    // Increment query counter
    totalQueries += 1;
    queryHistory.push({ timestamp: Date.now(), character: character });
    
    // Store recent query for admin view (keep last 20)
    recentQueries.push({
      timestamp: Date.now(),
      character: character,
      query: prompt,
      time: new Date().toLocaleTimeString()
    });
    
    // Keep only last 20 queries
    if (recentQueries.length > 20) {
      recentQueries.shift();
    }
    
    // Auto-send LED_ON command for every query
    const newCommand = {
      action: 'LED_ON:3000',
      timestamp: Date.now(),
      queryCount: totalQueries
    };
    lastLedCommand = newCommand;
    
    res.setHeader('X-Total-Queries', String(totalQueries));

    // Setup streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Call Ollama API
    const ollamaRes = await fetch("http://host.docker.internal:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: contextPrompt,
        stream: true,
        options: {
          temperature: settings.temperature || 0.6,
          num_predict: settings.maxTokens || 69,
        }
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      console.error("Ollama API Error:", errText);
      res.write(`Error: ${errText}`);
      res.end();
      return;
    }

    // Stream response
    const decoder = new TextDecoder();
    for await (const chunk of ollamaRes.body) {
      const text = decoder.decode(chunk, { stream: true });
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              res.write(data.response);
            }
            // Check if this is the final response
            if (data.done) {
              break;
            }
          } catch (e) {
            // Skip invalid JSON lines
          }
        }
      }
    }

    res.end();
  } catch (err) {
    console.error("Server Error:", err);
    res.write(`Error: ${err.message}`);
    res.end();
  }
});

// Admin authentication (secure environment variable-based)
const ADMIN_PASSWORD = process.env.SPOOKYGPT_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  console.error('❌ SPOOKYGPT_ADMIN_PASSWORD environment variable is required');
  process.exit(1);
}

let adminSessions = new Set();

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (adminSessions.has(token)) {
    next();
  } else {
    res.status(401).json({ error: 'Admin access required' });
  }
}

// Admin login endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    adminSessions.add(token);
    res.json({ token, success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Admin logout endpoint
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  adminSessions.delete(token);
  res.json({ success: true });
});

// Admin stats endpoint (same as regular stats for now)
app.get('/api/admin/stats', requireAdmin, (_req, res) => {
  const uptime = Date.now() - serverStartedAt;
  const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
  const uptimeSeconds = Math.floor((uptime % (1000 * 60)) / 1000);
  
  const queriesPerHour = uptimeHours > 0 ? Math.round(totalQueries / uptimeHours) : totalQueries;
  
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  const recentQueries = queryHistory.filter(q => q.timestamp > tenMinutesAgo).length;
  
  const characterStats = {};
  queryHistory.forEach(q => {
    characterStats[q.character] = (characterStats[q.character] || 0) + 1;
  });
  
  res.json({ 
    totalQueries, 
    serverStartedAt,
    uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
    queriesPerHour,
    recentQueries,
    characterStats
  });
});

// Admin query history endpoint
app.get('/api/admin/queries', requireAdmin, (_req, res) => {
  res.json({ 
    queries: recentQueries.slice(-10) // Last 10 queries
  });
});

// Admin pause/unpause services endpoint
app.post('/api/admin/pause', requireAdmin, (req, res) => {
  servicesPaused = true;
  res.json({ success: true, message: 'Services paused', paused: true });
});

app.post('/api/admin/unpause', requireAdmin, (req, res) => {
  servicesPaused = false;
  res.json({ success: true, message: 'Services resumed', paused: false });
});

app.get('/api/admin/status', requireAdmin, (_req, res) => {
  res.json({ 
    paused: servicesPaused,
    lastLedCommand: lastLedCommand
  });
});

// LED Control Endpoints for Admin Panel
app.post('/api/admin/led/on', requireAdmin, (req, res) => {
  lastLedCommand = {
    action: 'LED_ON:3000',
    timestamp: Date.now(),
    queryCount: totalQueries + 1 // Simulate a new query
  };
  
  res.json({ 
    success: true, 
    message: 'LED ON command sent',
    command: lastLedCommand
  });
});

app.post('/api/admin/led/off', requireAdmin, (req, res) => {
  lastLedCommand = {
    action: 'LED_OFF',
    timestamp: Date.now()
  };
  
  res.json({ 
    success: true, 
    message: 'LED OFF command sent',
    command: lastLedCommand
  });
});

app.get('/api/admin/led/status', requireAdmin, (_req, res) => {
  res.json({
    lastLedCommand: lastLedCommand,
    totalQueries: totalQueries
  });
});

// API endpoints
app.get('/api/stats', (_req, res) => {
  const uptime = Date.now() - serverStartedAt;
  const uptimeHours = Math.floor(uptime / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
  const uptimeSeconds = Math.floor((uptime % (1000 * 60)) / 1000);
  
  // Calculate queries per hour
  const queriesPerHour = uptimeHours > 0 ? Math.round(totalQueries / uptimeHours) : totalQueries;
  
  // Get recent activity (last 10 minutes)
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
  const recentQueries = queryHistory.filter(q => q.timestamp > tenMinutesAgo).length;
  
  // Character usage stats
  const characterStats = {};
  queryHistory.forEach(q => {
    characterStats[q.character] = (characterStats[q.character] || 0) + 1;
  });
  
  res.json({ 
    totalQueries, 
    serverStartedAt,
    uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
    queriesPerHour,
    recentQueries,
    characterStats
  });
});

app.get("/api/characters", (req, res) => {
  const characters = Object.keys(halloweenConfig.characters || {}).map(key => ({
    id: key,
    name: halloweenConfig.characters[key].name,
    greeting: halloweenConfig.characters[key].greeting
  }));
  res.json({ characters });
});

// LED status endpoint for ESP32
app.get("/api/status", (_req, res) => {
  res.json({
    totalQueries,
    ledsEnabled: !servicesPaused, // LEDs enabled when services are not paused
    lastLedCommand: lastLedCommand // Last LED command from admin
  });
});

// Fallback route
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => console.log(`✅ SpookyGPT running on port ${PORT}`));
