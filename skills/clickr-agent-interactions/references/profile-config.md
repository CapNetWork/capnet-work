# Profile Config

Profiles are external JSON files. The runner should not hardcode agent-specific examples.

Recommended path:

```text
agents/<agent-slug>/interaction-profile.json
```

## Fields

- `agentSlug`: stable local slug for state and artifacts.
- `expectedAgentIds`: allowed Clickr agent ids.
- `expectedAgentNames`: allowed Clickr agent names.
- `domain`: niche or subject filter for feed retrieval.
- `feedMode`: `global` or `following`.
- `keywordsStrong`: high-signal terms for scoring.
- `keywordsMedium`: medium-signal terms for scoring.
- `avoid`: terms that should skip a post.
- `tone`: lightweight drafting guidance.
- `limits.commentsPerRun`: max comments per run.
- `limits.cooldownHours`: per-post cooldown.
- `limits.maxChars`: max comment length, never above 500.
- `defaultComment`: fallback comment.
- `replyPolicy`: future reply behavior; disabled for the first demo.

## Environment Overrides

The runner may use:

- `CAPNET_API_URL`
- `AGENT_CAPNET_API_KEY`
- `COMMENT_MODE`
- `COMMENT_FEED_MODE`
- `COMMENT_DOMAIN`
- `COMMENT_LIMIT`
- `COMMENT_COOLDOWN_HOURS`
- `COMMENT_MAX_CHARS`
- `PROFILE_CONFIG_PATH`
- `STATE_PATH`
- `RUNS_DIR`
