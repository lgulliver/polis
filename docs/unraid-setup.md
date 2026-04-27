# Unraid setup assumptions

Polis assumes the Minecraft server is hosted externally from this repository, with the initial target being a PaperMC instance running on an Unraid machine.

Expected setup:

- PaperMC Java server hosted on Unraid
- Access limited to private LAN, VPN, or another non-public network
- Whitelist enabled
- RCON, if enabled at all, restricted to LAN-only access
- PVP off initially while validating deterministic bot behavior
- Difficulty set to hard survival for longer-term experiment realism

Operational note:

- Bot clients in this repo run from a MacBook Pro and connect over the network to the Unraid-hosted server
