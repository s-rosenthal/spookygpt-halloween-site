import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

// Global query counter
let totalQueries = 0;
const serverStartedAt = Date.now();

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

// API endpoints
app.get('/api/stats', (_req, res) => {
  res.json({ totalQueries, serverStartedAt });
});

app.get("/api/characters", (req, res) => {
  const characters = Object.keys(halloweenConfig.characters || {}).map(key => ({
    id: key,
    name: halloweenConfig.characters[key].name,
    greeting: halloweenConfig.characters[key].greeting
  }));
  res.json({ characters });
});

// Fallback route
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => console.log(`✅ SpookyGPT running on port ${PORT}`));
