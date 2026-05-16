# Docker setup

Run a complete local Polis environment — PaperMC server, Ollama (local LLM), and all five agents — with a single command. No API keys required.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)
- 3–4 GB free RAM for the Minecraft server and bots
- NVIDIA GPU recommended for Ollama (8 GB VRAM handles `qwen2.5:7b` comfortably — an RTX Ada 2000 or equivalent is ideal)

## Quick start

```bash
docker compose up --build
```

That's it. On first run, `ollama-init` automatically pulls `qwen2.5:7b` (~4.4 GB) before any agent starts. The model is cached in the `ollama-data` Docker volume so subsequent starts are instant.

The first run also downloads PaperMC and Geyser. Expect 2–5 minutes on first boot, then 60–90 seconds on subsequent starts.

You'll know it's working when you see:

```
bot-ada   | Ada awake.
bot-mira  | Mira awake.
```

## Enabling autonomous decisions

By default agents respond to commands only. To let them act on their own missions:

```bash
AUTONOMY_ENABLED=true docker compose up --build
```

Or create a `.env` file (it is gitignored):

```env
AUTONOMY_ENABLED=true
AUTONOMY_TICK_SECONDS=30
OLLAMA_MODEL=qwen2.5:7b
```

Each agent reasons about its mission every tick and picks the best available action.

## Connecting as a player

### Java Edition (PC/Mac)

1. Open Minecraft Java 1.21.4
2. Multiplayer → Add Server
3. Address: `localhost:25565`

### Bedrock Edition (Nintendo Switch, mobile, Windows Bedrock)

1. Open Minecraft
2. Servers tab → scroll past featured servers → **Add Server**
3. Address: your PC's local IP (e.g. `192.168.1.x`), port `19132`

To find your local IP:
- Windows: `ipconfig` → IPv4 under your active adapter
- macOS/Linux: `ip addr` or `ifconfig`

The Switch must be on the same local network as the machine running Docker.

> **Note:** The server runs in offline mode (`ONLINE_MODE=false`) so agents can connect without Minecraft accounts. No account verification applies to human players either — anyone on the same network can join.

## Issuing commands

From inside the game, type in chat:

```
Ada status
Ada collect wood
Turing follow me
Mira greet
```

See the [README](../README.md) for the full command list.

## Changing the model

Set `OLLAMA_MODEL` in your `.env` or pass it inline. The `ollama-init` container will pull the new model automatically on the next `docker compose up`:

```bash
OLLAMA_MODEL=llama3.2:3b docker compose up
```

Model comparison:

| Model | Size (q4) | Speed on 8 GB GPU | JSON quality | Notes |
|---|---|---|---|---|
| `qwen2.5:7b` | ~4.4 GB | Fast | Excellent | **Recommended default** |
| `llama3.2:3b` | ~2 GB | Very fast | OK | Good for high agent counts |
| `phi3:mini` | ~2.2 GB | Very fast | Good | Punches above weight |
| `llama3.1:8b` | ~4.7 GB | Moderate | Good | Better reasoning |

Smaller models are faster but may produce less coherent mission reasoning. `qwen2.5:7b` is the sweet spot for structured JSON output on an 8 GB GPU.

## Using OpenAI instead of Ollama

```bash
LLM_PROVIDER=openai OPENAI_API_KEY=sk-... docker compose up --build
```

## GPU passthrough

The compose file enables NVIDIA GPU passthrough for Ollama automatically. This requires:

- NVIDIA drivers installed on the host
- [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)
- Docker Desktop on Windows with WSL2 handles this automatically when NVIDIA drivers are present

If you don't have a compatible GPU, remove the `deploy` block from the `ollama` service in `docker-compose.yml` and Ollama will run on CPU (slower but functional for `3b` models).

## Logs

Structured events are written to `./logs/` on your host machine as JSONL. Agent decisions include the agent's `intention` (private reasoning), `action` taken, and `reason`.

## Stopping

```bash
docker compose down
```

To also wipe the Minecraft world:

```bash
docker compose down -v
```

## Running a single agent

```bash
docker compose up --build mc-server ollama bot-ada
```

## Rebuilding after code changes

```bash
docker compose build && docker compose up
```
