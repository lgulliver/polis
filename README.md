# Polis

Polis is an experimental Minecraft multi-agent society lab. The long-term aim is to study how LLM-guided agents might form commitments, norms, trust networks, communities, economies, governance structures, rituals, conflicts, dialects, and scientist subcultures inside a shared survival world.

The current milestone is intentionally narrower: prove out a deterministic bot body. A PaperMC server runs elsewhere, while local Mineflayer clients connect as real players, perceive the world, log structured events, and respond to a few auditable human-issued commands.

## Current milestone

- Connect one or more named bots to a private Minecraft Java server
- Log spawn, chat, death, kick, error, and periodic perception events as JSONL
- Support deterministic commands:
  - `<BotName> status`
  - `<BotName> follow me`
  - `<BotName> stop`

No LLM calls, agent memory stores, economies, governance, or autonomous planning are implemented yet.

## Requirements

- Node.js `20+` or `22+`
- `pnpm`
- A private PaperMC Java server reachable from this machine

## Setup

```bash
cp .env.example .env
pnpm install
pnpm typecheck
pnpm test
```

## Configuration

Edit `.env`:

```env
MC_HOST=192.168.1.50
MC_PORT=25565
MC_VERSION=
LOG_DIR=logs
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

- `MC_HOST` and `MC_PORT` should point at the external PaperMC server.
- `MC_VERSION` is optional. Leave it blank to let Mineflayer negotiate when possible.
- `LOG_DIR` defaults to `logs`, where raw event data is written to `events.jsonl`.

Agent identities live in [`configs/agents`](./configs/agents) as simple JSON files. The runner loads one with `--agent`.

## Run a bot

Ada:

```bash
pnpm dev:ada
```

Equivalent direct invocation:

```bash
pnpm --filter @polis/bot-runner dev -- --agent Ada
```

## Autonomous smoke run

If you want to verify the deterministic command loop without typing in chat, run a second Mineflayer client as an operator:

```bash
pnpm smoke:ada
```

Equivalent direct invocation:

```bash
pnpm --filter @polis/bot-runner smoke -- --agent Ada --operator Operator
```

The harness:

- starts `Ada`
- starts an `Operator` client
- waits for `Ada awake.`
- sends `Ada status`, `Ada follow me`, and `Ada stop`
- verifies the corresponding chat responses and structured events

This is still a real server integration, not a mock. It assumes your server setup permits both client connections.

## Minecraft chat commands

From a human player on the server:

- `Ada status`
- `Ada follow me`
- `Ada stop`

Replace `Ada` with any configured bot name.

## Safety notes

- Keep the Minecraft server private: LAN, VPN, or another non-public network boundary.
- Use whitelist-only access.
- Do not expose RCON publicly. If RCON is enabled, keep it LAN-only and separately secured.
- Start with PVP off while validating bot behavior.
- Logs may contain player chat and world observations, so treat `logs/events.jsonl` as local runtime data, not committed source.
