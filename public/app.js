const chatBox = document.getElementById("chat");
const input = document.getElementById("prompt");
const sendBtn = document.getElementById("send");

function appendMessage(role, text) {
  const msg = document.createElement("div");
  msg.className = "msg " + role;
  msg.textContent = text;
  chatBox.appendChild(msg);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  appendMessage("user", text);
  input.value = "";

  appendMessage("bot", "Thinking...");

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + btoa("admin:sp00ky-scari-5keltonS")
      },
      body: JSON.stringify({ prompt: text })
    });

    if (!res.ok) {
      appendMessage("bot", `Error: ${res.statusText}`);
      return;
    }

    const data = await res.json();
    const replies = document.querySelectorAll(".bot");
    const lastBot = replies[replies.length - 1];
    lastBot.textContent = data.reply || "(no response)";
  } catch (err) {
    appendMessage("bot", "Network error: " + err.message);
  }
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});
