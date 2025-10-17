import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import fs from "fs";

const app = express();

// Global query counter (since process start)
let totalQueries = 0;
const serverStartedAt = Date.now();

// Performance optimizations
app.use(express.json({ limit: '1mb' }));
app.use(cors({
  origin: true,
  credentials: true
}));

// Load Halloween config
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.join(__dirname, "halloween-config.json");
let halloweenConfig = {};
try {
  halloweenConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  console.warn("Could not load Halloween config:", err.message);
}

// Remove session limits; no middleware blocking access

// Serve static frontend files with caching
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1d', // Cache static files for 1 day
  etag: true,
  lastModified: true
}));

// Chat endpoint with streaming
app.post("/api/chat", async (req, res) => {
  try {
    const { prompt, character = "default", cachedMessages = [], cachedResponses = [] } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    // Get character config
    const characterConfig = halloweenConfig.characters?.[character] || halloweenConfig.characters?.default;
    const settings = halloweenConfig.settings || {};
    
    // Create system prompt with Halloween character
    const systemPrompt = characterConfig?.systemPrompt || "You are a helpful Halloween-themed assistant.";
    
    // Build context from cache
    let contextPrompt = systemPrompt + "\n\n";
    
    // Add recent conversation history (most recent messages first)
    const maxHistory = Math.min(cachedMessages.length, cachedResponses.length);
    
    for (let i = maxHistory - 1; i >= 0; i--) {
      contextPrompt += `User: ${cachedMessages[i]}\n`;
      if (cachedResponses[i]) {
        contextPrompt += `Assistant: ${cachedResponses[i]}\n`;
      }
    }
    
    // Add current prompt
    contextPrompt += `User: ${prompt}\nAssistant:`;

    // Increment global query counter and expose as header
    totalQueries += 1;
    res.setHeader('X-Total-Queries', String(totalQueries));

    // Set up streaming response
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Call Ollama with streaming
    const ollamaRes = await fetch("http://host.docker.internal:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt: contextPrompt,
        stream: true,
        options: {
          temperature: settings.temperature || 0.6,
          num_predict: settings.maxTokens || 30,
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

    // Handle streaming response from Ollama
    const decoder = new TextDecoder();
    
    // Read the response in chunks
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

// Optional: simple stats endpoint
app.get('/api/stats', (_req, res) => {
  res.json({ totalQueries, serverStartedAt });
});

// Get available characters
app.get("/api/characters", (req, res) => {
  const characters = Object.keys(halloweenConfig.characters || {}).map(key => ({
    id: key,
    name: halloweenConfig.characters[key].name,
    greeting: halloweenConfig.characters[key].greeting
  }));
  res.json({ characters });
});

// Fallback: serve index.html for any other route
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ SpookyGPT running on port ${PORT}`));
