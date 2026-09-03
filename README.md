# Yours AI — Ollama Chat Assistant

A ChatGPT-style local AI assistant starter project built with:
- FastAPI
- Ollama
- MySQL
- HTML/CSS/JavaScript
- Docker Compose

## Architecture

Browser / Mobile wrapper
        ↓
     FastAPI
   ↙    ↓     ↘
Ollama  MySQL  Tools
          ↓
     Chat history

## Run locally

### Option A — Docker Compose
1. Install Docker Desktop.
2. Open this folder in a terminal.
3. Run:
   docker compose up --build
4. Open:
   http://localhost:8080

Ollama runs at:
http://localhost:11434

The first time, pull a model:
docker exec -it yours_ai-ollama ollama pull qwen3:4b

You can replace the model in backend/.env.

### Option B — Run FastAPI directly
Install Python dependencies:
pip install -r backend/requirements.txt

Make sure Ollama is running locally and MySQL is available.
Then:
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

Open frontend/index.html through a local web server.

## Important production note

Do not expose Ollama directly to the public internet. Put FastAPI behind HTTPS and keep Ollama private.

For production, use:
- HTTPS
- a managed MySQL database
- background jobs for long AI/file tasks
- authentication/JWT
- rate limiting
- object storage for uploads
- monitoring/logging

## Roadmap included

1. Ollama connection
2. FastAPI API
3. Chat UI
4. Streaming-ready chat endpoint
5. MySQL conversations/messages
6. Login/register foundation
7. Model selection
8. File upload and document extraction
9. RAG foundation
10. Web-search tool foundation
11. Agent/tool architecture
12. Voice/image/mobile expansion plan

This ZIP is a working foundation, not a finished production service.
