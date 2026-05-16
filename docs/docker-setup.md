# Docker setup

Run a complete local Polis environment — PaperMC server and all five bots — with a single command.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)
- 3–4 GB free RAM

## Quick start

```bash
docker compose up --build
```

The first run downloads PaperMC and Geyser. Expect 60–120 seconds before the server is ready and bots connect.

You'll know it's working when you see lines like:

```
bot-ada   | Ada awake.
bot-mira  | Mira awake.
```

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
- Windows: `ipconfig` → look for IPv4 under your active adapter
- macOS/Linux: `ip addr` or `ifconfig`

The Switch must be on the same local network as the machine running Docker.

> **Note:** The server runs in offline mode (`ONLINE_MODE=false`) so the bots can connect without Minecraft accounts. This means no account verification for human players either — anyone on the same network can join.

## Issuing commands

From inside the game, type in chat:

```
Ada status
Ada collect wood
Turing follow me
Mira greet
```

Replace the name with any bot. See the [README](../README.md) for the full command list.

## Enabling autonomy

To let bots make their own decisions via an LLM:

```bash
AUTONOMY_ENABLED=true OPENAI_API_KEY=sk-... docker compose up --build
```

Or create a `.env` file in the repo root (it is gitignored):

```env
AUTONOMY_ENABLED=true
OPENAI_API_KEY=sk-...
AUTONOMY_TICK_SECONDS=30
```

Then just run `docker compose up --build`.

## Logs

Structured events are written to `./logs/` on your host machine as JSONL. Each bot appends to the shared `events.jsonl` file.

## Stopping

```bash
docker compose down
```

To also wipe the Minecraft world:

```bash
docker compose down -v
```

## Running a single bot

```bash
docker compose up --build mc-server bot-ada
```

## Rebuilding after code changes

```bash
docker compose build
docker compose up
```
