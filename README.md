# Polis

Polis is an experimental Minecraft multi-agent society lab. The long-term aim is to study how LLM-guided agents might form commitments, norms, trust networks, communities, economies, governance structures, rituals, conflicts, dialects, and scientist subcultures inside a shared survival world.

The current milestone is intentionally narrower: prove out a deterministic bot body. A PaperMC server runs elsewhere, while local Mineflayer clients connect as real players, perceive the world, log structured events, and respond to a few auditable human-issued commands.

An optional constrained autonomy mode now exists as a thin intent layer. When enabled, an LLM may only choose from a fixed allowlist and the existing deterministic skills still perform the work.

## Current milestone

- Connect one or more named bots to a private Minecraft Java server
- Log spawn, chat, death, kick, error, and periodic perception events as JSONL
- Support deterministic commands:
  - `<BotName> status`
  - `<BotName> collect wood`
  - `<BotName> create chest`
  - `<BotName> follow me`
  - `<BotName> stop`
- Support optional constrained autonomy with allowlisted intents:
  - `chat`
  - `status`
  - `collect_wood`
  - `create_chest`
  - `idle`

No arbitrary Minecraft commands, arbitrary movement, combat, trading, governance, or broader autonomous planning are implemented.

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
BASE_X=
BASE_Y=
BASE_Z=
AUTONOMY_ENABLED=false
LLM_PROVIDER=openai
AUTONOMY_TICK_SECONDS=30
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

- `MC_HOST` and `MC_PORT` should point at the external PaperMC server.
- `MC_VERSION` is optional. Leave it blank to let Mineflayer negotiate when possible.
- `LOG_DIR` defaults to `logs`, where raw event data is written to `events.jsonl`.
- `BASE_X`, `BASE_Y`, and `BASE_Z` are optional and let chest placement prefer a shared base area when configured.
- `AUTONOMY_ENABLED` enables the constrained LLM intent loop when set to `true`.
- `LLM_PROVIDER` currently supports `openai`.
- `AUTONOMY_TICK_SECONDS` sets the minimum delay between LLM decisions.
- `OPENAI_API_KEY` is required only when autonomy is enabled with the OpenAI provider.

Agent identities live in [`configs/agents`](./configs/agents) as simple JSON files. The runner loads one with `--agent`.

## Run a bot

Ada:

```bash
pnpm bot:ada
```

Equivalent direct invocation:

```bash
pnpm --filter @polis/bot-runner dev -- --agent Ada
```

With constrained autonomy enabled:

```bash
AUTONOMY_ENABLED=true LLM_PROVIDER=openai AUTONOMY_TICK_SECONDS=30 pnpm bot:ada
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
- `Ada collect wood`
- `Ada create chest`
- `Ada follow me`
- `Ada stop`

Replace `Ada` with any configured bot name.

## Constrained autonomy

When autonomy is enabled, the bot runner:

- builds a small prompt from recent perception, inventory, nearby players, recent chat, and recent skill results
- requests one JSON decision per autonomy tick
- validates the response with Zod
- treats invalid output as `idle`
- executes only existing deterministic skills

The model is not allowed to emit arbitrary Minecraft commands, movement goals, combat actions, withdrawals, trading, governance actions, religion, or conflict behavior.

## Safety notes

- Keep the Minecraft server private: LAN, VPN, or another non-public network boundary.
- Use whitelist-only access.
- Do not expose RCON publicly. If RCON is enabled, keep it LAN-only and separately secured.
- Start with PVP off while validating bot behavior.
- Logs may contain player chat and world observations, so treat `logs/events.jsonl` as local runtime data, not committed source.
