# Agent Architecture

This document describes the target architecture for Polis agents — how they think, plan, remember, and act. It covers both the cognitive tiers and the full information flow that feeds into each decision.

---

## Design principles

- The LLM never directly controls the Minecraft client
- All MC actions go through schema-validated deterministic skills
- Everything is logged to JSONL — every decision, perception, and event
- Layers are independently testable and replaceable
- Start simple; add complexity only where the layer below is stable

---

## The three cognitive tiers

Each agent runs three reasoning layers at different cadences. Slower layers set context for faster ones. Each tier is informed by its own slice of memory, trust, and experience.

```
┌─────────────────────────────────────────────────────────────────┐
│  HIGH-LEVEL LLM — Civilisation layer                            │
│  Cadence: minutes to hours                                      │
│  Observes all agents. Sets shared priorities. Identifies what   │
│  the group values right now (survival, territory, prestige).    │
│  Injects world-level context into each agent's mid-level tick.  │
│                                                                 │
│  Input: agent state summaries, DNA affinity map, event log      │
│  Output: group_context — injected into mid-level as background  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ group_context
┌───────────────────────────▼─────────────────────────────────────┐
│  MID-LEVEL LLM — Agent mind                                     │
│  Cadence: ~30 seconds                                           │
│  Plans the path toward the agent's mission. Maintains the ego:  │
│  what this agent cares about, remembers, and has committed to.  │
│  Outputs a sub-goal that the state machine will execute.        │
│                                                                 │
│  Input: see "Mid-level context" below                           │
│  Output: sub_goal — a BDD-style declarative goal statement      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ sub_goal
┌───────────────────────────▼─────────────────────────────────────┐
│  STATE MACHINE + GOAL RESOLVER — Behavioural spine              │
│  Stateful, deterministic, fast                                  │
│  Parses the sub_goal into a sequence of registered step         │
│  patterns. Owns state transitions. Handles interrupts.          │
│  Does NOT consult the LLM — the LLM set the goal, not the path. │
│                                                                 │
│  Input: sub_goal, current perception, registered step library   │
│  Output: skill invocations                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │ skill calls
┌───────────────────────────▼─────────────────────────────────────┐
│  DETERMINISTIC EXECUTOR — Minecraft client                      │
│  Schema-validated Mineflayer skills. No arbitrary execution.    │
│  Results and world events flow back up through the stack.       │
└─────────────────────────────────────────────────────────────────┘
```

---

## The goal resolver (SpecFlow contract)

The interface between the Mid-level LLM and the state machine is a **declarative goal language** — not a list of named skill enums. The LLM expresses *what it wants to achieve*; the resolver decides *how*.

### Why not enumerated actions?

Enumerating skills (`collect_wood`, `build_chest`, etc.) creates a 1:1 coupling between LLM vocabulary and skill implementations. Every new capability requires a new action name in the prompt. It also forces the LLM to think in implementation terms rather than goals.

### Goal language

Goals are expressed as declarative outcome statements, optionally with constraints:

```
Goal: I have at least 20 oak logs in my inventory
Constraint: stay within 100 blocks of base

Goal: There is a shelter at base with a bed and chest
Constraint: walls must be at least 4 blocks high

Goal: I am not hungry (food > 14)
Goal: The stranger within 30 blocks has been greeted
```

### Step resolvers

The state machine maintains a **library of step resolvers** — pattern-matched handlers that know how to progress toward a goal given the current world state:

```
resolver: "I have N <item> in my inventory"
  → check inventory count
  → if insufficient: find nearest source, navigate, collect, loop
  → emits: inventory_secured or inventory_unresolvable

resolver: "There is a <structure> at <location>"
  → check if structure exists at location
  → if not: plan construction sequence from available resources
  → decomposes recursively into resource goals

resolver: "I have greeted <agent>"
  → check social history
  → if not greeted: move within range, emit social_event:greeting
```

New capabilities are added by registering new resolvers, not by changing the LLM prompt. The LLM's goal vocabulary is open-ended; the resolver library is the bounded implementation surface.

### Goal stack

Goals decompose recursively. "Build a shelter" → needs walls, a roof, a door → needs wood → needs trees → navigate and chop. The state machine maintains a goal stack and surfaces failure reasons back up to the Mid-level LLM so it can replan.

---

## Mid-level context (what feeds into each decision)

When the Mid-level LLM ticks, it receives a rich snapshot assembled from memory, trust, and group context:

### 1. Identity
- Agent name, archetype, persona, mission
- Current DNA vector expressed as top-K retrieved memories (see DNA section)
  - "You have previously: cooperated successfully with Ada, discovered a river to the north, witnessed Hopper break a promise"
  - These are the experiences that have shaped this agent most recently

### 2. Current state
- Position, health, food, inventory
- Current behavioural state (Idle / Exploring / Gathering / Building / Socialising / Resting)
- Active sub-goal (if any) — the one the state machine is currently executing
- Recent sub-goal outcomes (succeeded / failed / abandoned + reason)

### 3. Nearby world
- Visible agents with distances and trust scores
  - "Ada: 12 blocks away, trust 0.78"
  - "Unknown wanderer: 25 blocks away, trust 0.10 (never met)"
- Notable nearby entities (threats, animals, resources) with distances
- Named places the agent knows about (e.g. "Base Camp: 45 blocks north-east")

### 4. Recent significant events
- Last N significant events involving this agent (indexed from SQLite)
  - Cooperation successes and betrayals
  - Resources secured or lost
  - Deaths, rituals, discoveries, conflicts
  - Place namings and territorial claims
- This gives the agent short-to-medium term narrative context ("Hopper stole from the chest two days ago")

### 5. Commitments
- Active promises this agent has made (target, content, deadline)
- Active obligations owed to this agent
- Fulfilled or broken commitments from known agents (informs trust)

### 6. Group context (from High-level LLM)
- What the group values right now: "Survival is critical — food stocks are low, two agents are injured"
- The agent may align with or resist this context — that tension is the seed of faction

### 7. Constraints
- Hard limits: health/food thresholds, forbidden zones, committed-to locations

---

## Trust

Trust is a per-agent, per-target numeric score (0.0 – 1.0). It is not a vague sentiment — it is an accumulated ledger of interactions.

### Initialisation
- Known agents (in config): start at `0.5` (neutral, known)
- Wanderers/strangers: start at `0.2` (unknown, caution)
- Agents whose DNA is similar to mine: small positive bias at first contact

### Updates
Trust scores change in response to significant events:

| Event | Effect |
|---|---|
| `cooperation_success` with agent | +0.05–0.15 |
| `betrayal_observed` (they broke a commitment) | −0.2–0.4 |
| `resource_shared` (they gave something) | +0.05 |
| `resource_taken` (they took without consent) | −0.1–0.2 |
| `conflict_initiated` against me | −0.3 |
| `conflict_resolved` diplomatically | +0.1 |
| `ritual_participated` together | +0.05 |
| `death` of trusted agent | recalculate from events |

Trust changes slowly and can never be set directly by the LLM — only by verifiable world events.

### Uses in decision-making
Trust is surfaced to the Mid-level LLM as context, not a decision. The LLM sees "Ada: trust 0.78" and reasons about what that means for its current goal. It might decide to share a resource with Ada but not with the wanderer at 0.1. Trust is also an input to the High-level affinity map (cultural alignment).

---

## DNA and personality

Each agent has a persistent identity vector — its "DNA" — that encodes accumulated personality as a semantic embedding.

### Initialisation
At first spawn, embed the agent's `mission + archetype + persona` text. This is the starting DNA — the character they were born with.

### Drift
After significant events, blend the event embedding toward the current DNA:

```
new_dna = normalize((1 - α) * current_dna + α * event_embedding)
```

`α` is small (0.02–0.05). Personality shifts slowly across many interactions before it noticeably changes. Dramatic events (death, betrayal, first ritual) carry higher `α`.

### Memory retrieval via DNA
The DNA vector is used to retrieve relevant memories for the Mid-level prompt. Rather than injecting a raw event list, the system retrieves the top-K events whose embeddings are most similar to the current DNA — these are the experiences that have shaped this agent most recently and are most "on-brand" for who they are now.

This is why an agent with high `ritual_tendency` will recall ceremonies more readily than resource-securing events, even if both happened recently.

### Social affinity
Cosine similarity between two agents' DNA gives a compatibility score. Agents whose DNA has converged through shared experiences naturally form groups — the embryo of culture, faction, or religion.

### Agent genesis (planned)
When two agents with high mutual trust and DNA affinity decide to "found a lineage", a new wanderer spawns with a DNA vector that is a blended child of their two vectors, plus a small random mutation:

```
child_dna = normalize(blend(parent_a_dna, parent_b_dna, ratio=0.5) + noise(σ=0.02))
```

The child's mission is synthesised by the Mid-level LLM from the two parents' missions. This is not reproduction in a biological sense — it is cultural and ideological transmission.

---

## Significant event taxonomy

Events that trigger DNA drift, trust updates, and memory storage:

| Event | Description | DNA signal | Trust signal |
|---|---|---|---|
| `cooperation_success` | Shared goal accomplished together | cooperative | trust target +0.1 |
| `betrayal_observed` | Commitment broken | isolationist | trust target −0.3 |
| `resource_secured` | Acquired scarce resource | resourceful | — |
| `resource_shared` | Gave resource to another | generous | trust target +0.05 |
| `death` | Agent died | risk-averse | — |
| `ritual_participated` | Took part in a ceremony | symbolic/communal | trust participants +0.05 |
| `discovery` | Found novel place, item, or creature | curious | — |
| `conflict_initiated` | Started a fight | aggressive | trust target −0.2 |
| `conflict_resolved` | Negotiated end to conflict | diplomatic | trust target +0.1 |
| `place_named` | Gave a location a name | territorial | — |
| `first_contact` | Encountered previously unknown agent | expansive | — |
| `commitment_made` | Made a promise | — | — |
| `commitment_kept` | Delivered on a promise | reliable | trust target +0.05 |
| `commitment_broken` | Failed or refused a promise | unreliable | trust target −0.2 |

---

## Persistence requirements

| Data | Storage | Notes |
|---|---|---|
| Event log | Append-only JSONL | Audit trail — keep everything |
| Trust scores | SQLite | Per-agent, per-target; timestamped history |
| Commitments | SQLite | Content, target, deadline, status |
| DNA vectors | SQLite (float array) | Current + history with event labels |
| Named places | SQLite | Coordinate range, name, claiming agent |
| Significant events | SQLite index over JSONL | Fast retrieval into Mid-level context |
| Mid-level plans | SQLite | Current sub-goal + goal stack per agent |
| Step resolver library | Code (TypeScript) | Pattern registry, not persisted |

SQLite is sufficient for 5–50 agents. A vector DB (Qdrant, Chroma) becomes useful at 100+ agents or when DNA similarity queries are hot.

---

## State machine states and transitions

| State | Description |
|---|---|
| `Idle` | Observing. No active sub-goal. |
| `Exploring` | Moving through the world; discovering territory and resources. |
| `Gathering` | Executing a resource-collection goal. |
| `Building` | Executing a construction goal at a known location. |
| `Socialising` | Engaged with another agent or player — greeting, proposal, negotiation. |
| `Resting` | Low-action recovery; health or food critically low. |
| `Planning` | Mid-level LLM is forming a new sub-goal; agent is stationary. |

Transitions are guarded by declarative BDD-style specs (human-readable, independently testable). Example:

```gherkin
Scenario: First contact with a stranger
  Given the agent is in Idle or Exploring state
  And an agent unknown to this agent enters within 20 blocks
  And trust for that agent is below 0.3
  When the next state machine tick fires
  Then transition to Socialising state
  And raise social_event: first_contact with payload { stranger: <name> }
  And pass first_contact to Mid-level LLM context on next tick
```

---

## Full information flow

```
World events (chat, death, discovery, proximity, inventory change)
  │
  ▼
State machine
  │   routes events to subscribers
  │   updates behavioural state
  │   evaluates guard conditions
  │
  ├──► Goal resolver (each state machine tick)
  │     receives: current sub_goal from Mid-level
  │     matches: step resolvers against current perception
  │     invokes: Mineflayer skills
  │     emits: significant events when they occur
  │
  ├──► Mid-level LLM (~30s cadence)
  │     receives: current perception, DNA-retrieved memories,
  │               trust map, recent events, commitments,
  │               group_context from High-level, active sub-goal outcome
  │     outputs:  new sub_goal → state machine
  │               commitment_updates → SQLite
  │               place_naming → SQLite
  │
  └──► High-level LLM (minutes/hours)
        receives: all agents' state summaries, DNA affinity matrix
        outputs:  group_context → injected into every Mid-level tick

JSONL event log ← audit trail for everything above
SQLite ← trust, DNA, events, plans, places, commitments (queryable)
```

---

## Implementation order

1. **State machine skeleton** — states, transitions, guard specs. Wire to existing autonomy controller. No LLM changes yet.

2. **SQLite persistence** — replace in-memory trust map. Persist significant events, commitments, named places.

3. **Goal resolver + step library** — replace enumerated action names with pattern-matched resolvers. `collect_wood` becomes a resolver pattern, not a hardcoded skill name.

4. **Mid-level LLM** — add slower planning tick that outputs a sub_goal. Low-level becomes "execute current sub-goal" via the resolver.

5. **DNA initialisation and drift** — embed missions at spawn. Wire significant events to DNA updates. Memory retrieval via similarity.

6. **Trust wiring** — feed trust scores into Mid-level context. Update trust from significant events.

7. **High-level LLM** — cross-agent layer. Group context injected downward.

8. **Agent genesis** — DNA blending to produce new wanderers from high-affinity pairs.
