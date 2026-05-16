# Roadmap

## Milestone 1: infrastructure and one bot ✅

- Initialize TypeScript workspace
- Connect one Mineflayer bot to a private PaperMC server
- Log structured events and periodic perception
- Support human-triggered deterministic commands

## Milestone 2: multiple bots ✅

- Run multiple named bots concurrently
- Per-agent configuration (name, role, archetype, persona, mission)
- Basic experiment presets and operational scripts

## Milestone 3: survival skills (in progress)

- Simple deterministic survival behaviours
- Navigation, regrouping, sheltering, and inventory management primitives
- All low-level skills testable and schema-validated

## Milestone 4: state machine and persistence

- Replace in-memory trust map with SQLite persistence
- Implement state machine as the behavioural spine (Idle, Exploring, Gathering, Building, Socialising, Resting, Planning)
- Guard conditions defined as declarative BDD-style specs — human-readable and independently testable
- Persist commitments, named places, and significant events
- See [agent-architecture.md](./agent-architecture.md) for the full design

## Milestone 5: mid-level LLM and agent mind

- Add a slower planning tick (Mid-Level LLM) that sets sub-goals for the existing autonomy loop
- Low-level tick becomes "execute the current sub-goal" rather than reasoning from scratch
- DNA initialisation: embed mission + archetype at spawn to create an initial personality vector
- DNA drift: significant events shift the personality vector over time
- Retrieved memories (nearest to current DNA) injected into Mid-Level context as style prior

## Milestone 6: high-level LLM and civilisation layer

- Cross-agent reasoning layer that observes all agents and injects group-level priorities
- Agents receive world context (what the group values right now) and may follow or resist it
- DNA affinity scoring: cosine similarity between agents surfaces cultural alignment and faction seeds
- Agents with converging DNA form natural groups — the embryo of culture, religion, or faction

## Milestone 7: emergence — economy, governance, religion, conflict, dialect, scientists

- **Economy**: exchange, scarcity, division of labour, debt
- **Governance**: norms, rules, offices, legitimacy, enforcement
- **Religion and ritual**: symbolic acts, myths, taboos, sacred places, seasonal practices
- **Conflict**: factions, feuds, deterrence, raids, peacemaking, ceasefires
- **Dialect**: local vocabularies, abbreviations, in-group speech drift
- **Scientists**: observation protocols, hypothesis formation, experiments, knowledge transmission
