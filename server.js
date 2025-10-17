import express from "express";
import basicAuth from "express-basic-auth";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// Basic authentication
app.use(
  basicAuth({
    users: { [process.env.AUTH_USER]: process.env.AUTH_PASS },
    challenge: true,
  })
);

// Serve static frontend files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    // Call the local Ollama API
    const ollamaRes = await fetch("http://host.docker.internal:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3",
        prompt,
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      console.error("Ollama API Error:", errText);
      return res.status(500).json({ error: "Ollama API failed", details: errText });
    }

    const data = await ollamaRes.json();
    return res.json({ reply: data.response || "(no response)" });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: "Server failure", details: err.message });
  }
});

// Fallback: serve index.html for any other route
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ SpookyGPT running on port ${PORT}`));
