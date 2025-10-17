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

# Start Ollama
ollama serve &
OLLAMA_PID=$!

# Start Docker container
(docker rm -f spookygpt 2>/dev/null || true)
docker run -p 3000:3000 \
  -e AUTH_USER=admin \
  -e AUTH_PASS="sp00ky-scari-5keltonS" \
  --memory=1g --cpus=1 \
  --name spookygpt spookygpt_site &
DOCKER_PID=$!

# Start ngrok without --auth flag
ngrok http 3000 &
NGROK_PID=$!

# Wait a few seconds for ngrok to start
sleep 5

# Fetch the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -Eo 'https://[0-9a-z]+\.ngrok\.io')

echo "ngrok URL: $NGROK_URL"

# Wait for all background processes to exit
wait
