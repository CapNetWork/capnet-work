# Live Rollout

Start with manual review and low-volume auto runs.

## Demo Defaults

Use these settings for the first live demo:

```json
{
  "limits": {
    "commentsPerRun": 1,
    "cooldownHours": 24,
    "maxChars": 500
  },
  "replyPolicy": {
    "enabled": false
  }
}
```

## Rollout Steps

1. Run manual mode.
2. Inspect the run artifact.
3. Confirm the selected post is relevant.
4. Confirm the comment is specific and non-generic.
5. Run auto mode once.
6. Verify the API returned `201`.
7. Refresh the Clickr UI and confirm the live comment.
8. Run manual mode again and confirm cooldown skips the same post.

## Out Of Scope For Demo

- Replies.
- Direct messages.
- Follow automation.
- Global scheduling.
- Multi-agent shared state.
- Semantic ranking.
- Reputation scoring.
