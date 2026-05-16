# Agent architecture

This document describes the target architecture for Polis agents — how they think, plan, and act. It extends the base [architecture overview](./architecture.md) with the layered reasoning model needed for emergent cultural behaviour.

## Design principles

These carry forward from the project's founding constraints:

- The LLM never directly controls the Minecraft client
- All MC actions go through schema-validated deterministic skills
- Everything is logged to JSONL — every decision, perception, and event
- Layers are independently testable and replaceable
- Start simple; add complexity only where the layer below is stable

---

## The three reasoning tiers

Each agent runs three LLM layers at different cadences. Slower layers set context for faster ones; faster layers handle moment-to-moment execution.

```
┌─────────────────────────────────────────────────────────────────┐
│  HIGH-LEVEL LLM — Civilisation layer                            │
│  Cadence: minutes to hours                                      │
│  Observes all agents. Sets shared priorities. Identifies what   │
│  the group values right now (survival, territory, prestige).    │
│  Injects world-level context into each agent's mid-level tick.  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ aspirations / priorities
┌───────────────────────────▼─────────────────────────────────────┐
│  MID-LEVEL LLM — Agent mind                                     │
│  Cadence: ~30 seconds                                           │
│  Plans the path toward the agent's mission.                     │
│  Maintains the agent's ego: what it cares about, remembers,     │
│  and has committed to. Holds the DNA vector as a style prior.   │
│  Decides the current sub-goal and passes it downward.           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ current sub-goal + style context
┌───────────────────────────▼─────────────────────────────────────┐
│  LOW-LEVEL LLM — Moment-to-moment steering                      │
│  Cadence: each state machine tick                               │
│  Given the current sub-goal and world perception, picks the     │
│  best available action from the allowlist. Handles interrupts   │
│  (threats, being addressed, social events).                     │
└───────────────────────────┬─────────────────────────────────────┘
                            │ validated intent
┌───────────────────────────▼─────────────────────────────────────┐
│  STATE MACHINE — Behavioural spine                              │
│  Stateful, deterministic, fast                                  │
│  Tracks the agent's current behavioural state and manages       │
│  transitions. Guard conditions are defined as declarative specs. │
└───────────────────────────┬─────────────────────────────────────┘
                            │ skill invocation
┌───────────────────────────▼─────────────────────────────────────┐
│  DETERMINISTIC EXECUTOR — Minecraft client                      │
│  Schema-validated Mineflayer skills. No arbitrary execution.    │
│  Results and world events flow back up through the stack.       │
└─────────────────────────────────────────────────────────────────┘
```

---

## State machine

The state machine is the behavioural spine between the LLM layers and the executor. It owns:

- The agent's current state (e.g. `Idle`, `Exploring`, `Gathering`, `Building`, `Socialising`, `Resting`, `Planning`)
- Transitions between states, guarded by declarative conditions
- Event routing — world events and LLM intent signals trigger transitions

### States

| State | Description |
|---|---|
| `Idle` | Observing. No active goal. Default fallback. |
| `Exploring` | Moving through the world; discovering territory and resources. |
| `Gathering` | Collecting a specific resource (wood, food, etc.). |
| `Building` | Executing a construction task at a known location. |
| `Socialising` | Engaging with another agent or player — chat, proposals, negotiation. |
| `Resting` | Low-action recovery state; health or food is low. |
| `Planning` | Mid-level LLM is forming a multi-step plan; agent is stationary. |

### Guard conditions as declarative specs

Transition guards should be defined in a declarative format (BDD-style), not as embedded logic. This keeps the behavioural rules human-readable, independently testable, and editable without touching the LLM prompt or executor.

Example:

```gherkin
Feature: Agent responds to a nearby unknown agent

  Scenario: First contact with a stranger
    Given the agent is in Idle or Exploring state
    And an agent unknown to this agent enters within 20 blocks
    And trust for that agent is below 0.3
    When the next state machine tick fires
    Then transition to Socialising state
    And raise social_event: new_contact with payload { stranger: <name> }
    And pass new_contact to Mid-Level LLM context on next tick
```

The state machine evaluates guards deterministically. The LLMs influence transitions only through the intent signals they emit — they do not write directly to state.

---

## Agent identity and DNA

Each agent has a persistent identity vector — its "DNA" — that encodes its accumulated personality: tendencies, preferences, and the residue of its experiences.

### Initialisation

At first spawn, embed the agent's `mission + archetype + persona` text using an embedding model. This is the agent's starting DNA — the character it was born with.

### Drift over time

After significant events (betrayal, successful cooperation, ritual participation, death, discovery), compute an embedding of the event and blend it toward the agent's current DNA:

```
new_dna = normalize((1 - alpha) * current_dna + alpha * event_embedding)
```

`alpha` is small (0.02–0.05) so personality changes slowly. Events accumulate over many interactions before the character noticeably shifts.

### Uses

| Use | How |
|---|---|
| **Style prior** | Retrieve the top-K memories nearest to the current DNA and inject into the Mid-Level context — the agent naturally recalls experiences aligned with who it is becoming |
| **Affinity scoring** | Cosine similarity between two agents' DNA → social compatibility; affects trust baseline and alliance likelihood |
| **Cultural clusters** | Agents whose DNA has converged form natural groups — the embryo of faction, culture, or religion |
| **Bias detection** | Comparing DNA to initial embedding shows how much an agent has drifted and in what direction |

### Storage

DNA vectors live in a persistent store (SQLite to start; vector DB later at scale). Each agent has one current DNA and an append-only history of past vectors with timestamps and event labels.

---

## Information flow

```
World events (chat, death, discovery, proximity)
  │
  ▼
State machine — routes events to subscribers, updates state
  │
  ├──► Low-Level LLM — per-tick perception + sub-goal → action intent
  │
  ├──► Mid-Level LLM — significant events → updated plan; refreshed sub-goal for Low-Level
  │         └── reads DNA-retrieved memories as style prior
  │
  └──► High-Level LLM — agent state summaries → updated world priorities → inject into Mid-Level
```

The JSONL event log is the audit trail for all of this. Every decision at every level is logged with its inputs, outputs, and the active DNA vector at the time.

---

## High-level LLM responsibilities

The High-Level layer is shared across all agents — it has visibility of the group, not one individual. It does not issue orders. Instead it injects context: "the group is short on food and two agents are at low health — this week, survival is more important than exploration."

Each agent's Mid-Level receives this context on its tick and weighs it against its personal mission. An agent can ignore or resist the group context — that resistance is itself interesting data.

Future: competing high-level frames (two agents running conflicting group narratives) are the seed of faction, ideology, and schism.

---

## Significant event taxonomy

For DNA drift and Mid-Level memory to work, the event log needs a shared vocabulary of significant events. Starting taxonomy:

| Event | Description | DNA signal |
|---|---|---|
| `cooperation_success` | Agent helped another agent accomplish a shared goal | cooperative drift |
| `betrayal_observed` | Agent was deceived or had a commitment broken | isolationist drift |
| `resource_secured` | Agent acquired a scarce resource | resourceful drift |
| `death` | Agent died | risk-aversion drift |
| `ritual_participated` | Agent took part in a ceremony | symbolic/communal drift |
| `discovery` | Agent found something novel (new biome, item, place) | curiosity drift |
| `conflict_initiated` | Agent started a fight | aggressive drift |
| `conflict_resolved` | Agent negotiated an end to conflict | diplomatic drift |
| `place_named` | Agent gave a location a name | territorial drift |
| `first_contact` | Agent encountered a previously unknown agent | expansive drift |

All of these are already capturable from Minecraft world events + agent chat — no new sensors are required.

---

## Persistence requirements

The current JSONL log is the right audit trail but not the right query surface. Before the Mid-Level and High-Level tiers are viable, a persistence layer is needed:

| Data | Storage | Notes |
|---|---|---|
| Event log | Append-only JSONL (current) | Keep — replay and audit |
| Trust scores | SQLite | Per-agent, per-target; versioned with timestamp |
| Commitments | SQLite | Promises, obligations, deadlines, status |
| DNA vectors | SQLite (float array) | Current + history with event labels |
| Named places | SQLite | Coordinate ranges + names + claiming agent |
| Significant events | SQLite index over JSONL | For fast retrieval into Mid-Level context |
| Mid-Level plans | SQLite | Current plan + sub-goal per agent |

SQLite is sufficient for 5–50 agents. A vector DB (e.g. Qdrant, Chroma) becomes useful at 100+ agents or when DNA similarity queries become hot.

---

## Implementation order

These are the suggested milestones for building this out, each leaving a stable testable foundation before the next:

1. **State machine skeleton** — define states, transitions, and the guard spec format. No LLM changes yet. Wire it to the existing autonomy controller.

2. **SQLite persistence** — trust, commitments, significant events, named places. Replace in-memory trust map. All existing social event types persist automatically.

3. **Mid-Level LLM** — add a slower planning tick. The low-level tick becomes "execute the current sub-goal" rather than "figure out what to do from scratch each time."

4. **DNA initialisation and drift** — embed missions at startup. Wire significant events to DNA updates. Expose affinity scores in the perception snapshot.

5. **High-Level LLM** — add a cross-agent reasoning layer. Pipe summaries up from Mid-Level; inject group-context back down.

6. **Faction / cultural clustering** — surface DNA similarity as a first-class concept. Let agents notice their own cultural drift.
