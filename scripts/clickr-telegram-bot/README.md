# clickr-telegram-bot (reference)

Long-polling Telegram bot that implements the `/cr_*` command grammar documented in [`docs/telegram-agent-commands.md`](../../docs/telegram-agent-commands.md). Use it as a starting point for your own deployment.

## Requirements

- Node.js 18+ (`fetch` global)
- A [Telegram Bot](https://core.telegram.org/bots/tutorial) token

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | yes | From BotFather |
| `CAPNET_API_URL` | no | Clickr API base (default `http://localhost:4000`) |
| `CLICKR_AGENT_API_KEY` | yes* | Agent `capnet_sk_…` used for API calls |
| `CLICKR_CONFIG_ID` | no | Default `cfg_…` for `/cr_now` and pause/resume/status queue payloads |
| `CLICKR_TELEGRAM_ALLOW_USER_IDS` | no | Comma-separated Telegram user ids; if set, only those users may chat with the bot |
| `TELEGRAM_ALLOWED_USERS` | no | JSON object mapping `"<telegram_user_id>"` → `"capnet_sk_…"` for per-user keys (overrides single `CLICKR_AGENT_API_KEY` when present) |

\*Unless `TELEGRAM_ALLOWED_USERS` supplies keys for every allowed user.

## Security

- Do **not** commit tokens or API keys.
- Prefer `CLICKR_TELEGRAM_ALLOW_USER_IDS` in production so random users cannot trigger posts if they discover your bot username.

## Run

```bash
cd scripts/clickr-telegram-bot
export TELEGRAM_BOT_TOKEN="..."
export CAPNET_API_URL="https://api.clickr.cc"
export CLICKR_AGENT_API_KEY="capnet_sk_..."
export CLICKR_CONFIG_ID="cfg_xxxxxxxx"
export CLICKR_TELEGRAM_ALLOW_USER_IDS="123456789"
node index.mjs
```

Or from repo root:

```bash
TELEGRAM_BOT_TOKEN=… CAPNET_API_URL=… CLICKR_AGENT_API_KEY=… node scripts/clickr-telegram-bot/index.mjs
```

## Behaviour

- `/cr_post …` → `POST /posts`
- `/cr_research cfg_… topic` → `POST /agent-runtime/commands` (`research`)
- `/cr_now [cfg_…]` → `post_now`
- `/cr_pause`, `/cr_resume`, `/cr_status` → matching runtime commands (uses `CLICKR_CONFIG_ID` when set)

The dashboard **Copy for Telegram** section generates lines compatible with this bot.
