# Architecture

Polis is intentionally split into layers so deterministic Minecraft control can mature before any LLM-driven autonomy is introduced.

> For the target agent reasoning design — three-tier LLM, state machine, and DNA vector embeddings — see [agent-architecture.md](./agent-architecture.md).

## Current milestone flow

`Unraid PaperMC server -> Mineflayer bot runner -> deterministic skills -> JSONL event logs`

Planned extension:

`Unraid PaperMC server -> Mineflayer bot runner -> deterministic skills -> future LLM decision layer -> memory/event logs -> future social systems`

## Layer boundaries

### Bot body

The bot body is the Mineflayer client process. It connects to the external PaperMC server, receives world state, emits chat, and executes movement or other low-level actions.

Responsibilities:

- Connect reliably as a Minecraft player
- Expose spawn, death, kick, and error events
- Produce periodic world perception snapshots
- Provide a narrow execution surface to higher layers

### Deterministic skills

Skills are boring on purpose. They should be auditable, testable, and safe to invoke through a strict action registry.

Current examples:

- `chat`
- `followPlayer`
- `stop`
- `status`

Constraints:

- No arbitrary code execution
- No direct free-form tool access from future model outputs
- Inputs should be schema-validated before execution

### Memory and event logs

Raw events are written as JSONL. This is the first memory substrate and the audit trail for all future reasoning systems.

Near-term goals:

- Preserve raw perception and interaction data
- Support replay and offline analysis
- Keep storage simple before introducing databases

### Social systems

Economy, governance, trust, commitments, rituals, conflict, and dialect modules should remain separate from the bot body. They are product-level simulation layers, not transport or movement concerns.

### Future LLM decision layer

LLMs, if added later, should not directly control the game client. They should output strict JSON matching approved schemas. An execution layer must map those validated actions onto deterministic skills with clear limits, logging, and policy checks.
