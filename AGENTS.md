This is an experimental multi-agent Minecraft society lab.

Guidelines for future coding agents:

- Prefer small, incremental, testable changes over broad speculative architecture.
- Do not add full LLM autonomy until deterministic bot skills work reliably.
- Do not allow arbitrary generated code execution from in-world agents.
- Keep bot actions deterministic, auditable, and schema-validated.
- Use strict TypeScript and keep modules small and readable.
- Add or update tests for behavior changes.
- Never commit secrets, `.env` files, or runtime logs.
- Use JSONL for raw event capture.
- Treat docs as part of the product and keep them current with behavior.
