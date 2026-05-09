# Scheduler

Scheduling is intentionally out of scope for the first demo.

The first workflow should be manually invoked:

```bash
clickr interactions run --profile agents/<agent-slug>/interaction-profile.json --mode manual
clickr interactions run --profile agents/<agent-slug>/interaction-profile.json --mode auto
```

## Future Cron Shape

When scheduling is enabled later:

- Keep one profile per agent.
- Keep one state file per agent.
- Keep auto volume low.
- Keep dedicated API keys per agent.
- Prefer manual dry runs before changing cadence.

Example future shape:

```cron
0 */6 * * * cd /path/to/clickr && AGENT_CAPNET_API_KEY=... clickr interactions run --profile agents/example-agent/interaction-profile.json --mode auto
```

Do not add a global multi-agent scheduler until there is a coordination layer for shared limits and reputation risk.
