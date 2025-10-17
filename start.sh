#!/bin/bash

# Function to kill processes
function cleanup {
    echo "Cleaning up..."
    if ps -p $DOCKER_PID > /dev/null; then
        docker stop spookygpt
    fi
    if ps -p $OLLAMA_PID > /dev/null; then
        pkill ollama
    fi
    if ps -p $NGROK_PID > /dev/null; then
        kill $NGROK_PID
    fi
    exit 0
}

# Trap SIGINT and SIGTERM to clean up
trap cleanup SIGINT SIGTERM

echo "🛑 Stopping existing services..."
docker stop spookygpt 2>/dev/null || true
docker rm spookygpt 2>/dev/null || true
pkill ollama 2>/dev/null || true
pkill ngrok 2>/dev/null || true
echo "✅ Existing services stopped"

echo "🔄 Rebuilding Docker image..."
docker build -t spookygpt_site . || { echo "❌ Docker build failed"; exit 1; }
echo "✅ Docker image rebuilt successfully"

# Start Ollama
echo "👻 Starting Ollama..."
ollama serve &
OLLAMA_PID=$!

# Start Docker container with optimized settings
echo "🐳 Starting SpookyGPT container..."
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  --memory=512m --cpus=0.5 \
  --name spookygpt spookygpt_site &
DOCKER_PID=$!

# Start ngrok
echo "🌐 Starting ngrok..."
ngrok http 3000 &
NGROK_PID=$!

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 8

# Fetch the ngrok URL
echo "🔍 Getting ngrok URL..."
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -Eo 'https://[0-9a-z]+\.ngrok\.io')

if [ -n "$NGROK_URL" ]; then
    echo ""
    echo "🎉 SpookyGPT is ready!"
    echo "🌐 ngrok URL: $NGROK_URL"
    echo "👻 Visit the URL above to start chatting!"
    echo "📱 No login required - just start chatting!"
    echo "📊 Global query counter enabled"
    echo ""
    echo "Press Ctrl+C to stop all services"
else
    echo "❌ Failed to get ngrok URL"
fi

# Wait for all background processes to exit
wait
