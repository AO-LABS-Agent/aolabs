# AOLABS — AO | On-Chain Wallet Memory AI

**AO by AOLABS** is an open-source AI agent that builds persistent memory for any
EVM wallet on Robinhood Chain (Chain ID 4663): recurring trading strategies,
transaction mistakes, trading habits, and behavioral shifts — then chats with
you about them with live market context.

Website: **https://aolabs.xyz**
X: **https://x.com/aolabsxyz**
Repository: **https://github.com/AO-LABS-Agent/aolabs**

![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)
![Stack: Vite + React + TypeScript](https://img.shields.io/badge/Stack-Vite%20%2B%20React%20%2B%20TypeScript-white.svg)

> **Bring your own model, bring your own RPC.** AOLABS runs 100% locally in
> your browser. There is no server, no database, and no account. You paste
> your own LLM endpoint + model and your own RPC endpoint in Settings, and
> everything — wallet memory, chat history, API keys — stays in your
> browser's localStorage.

---

## What AO does

- **Scan any wallet** — paste a `0x` address (or type it straight into chat)
  and AO indexes its on-chain history: swaps, transfers, approvals, reverted
  transactions, and token balances.
- **Wallet memory** — from that history AO derives:
  - *Strategies* — e.g. which token you rotate most, average hold time
  - *Mistakes* — reverted transactions, and every token approval still
    unrevoked (with revoke detection)
  - *Habits* — active hours, trades per week, preferred tokens, risk profile
  - *Behavior shifts* — how your recent activity compares to your earlier window
- **Chat with memory** — ask AO about your own history
  ("What are my biggest mistakes?", "Am I over-trading lately?") and it
  answers from your actual transactions, citing real tx hashes — never
  fabricated ones.
- **Live markets** — type `$TOKEN` in chat (or just ask about a token AO
  already knows from your wallet) and AO pulls live GeckoTerminal +
  DEX Screener snapshots: price, 24h change, liquidity, volume.
- **Prompt-injection defense** — untrusted text (chat input, token names,
  tx metadata) is firewalled and sanitized before it ever reaches the model.

## Quick start

### Requirements

- Node.js 18 or newer, and npm.

### 1. Clone and install

```bash
git clone https://github.com/AO-LABS-Agent/aolabs.git
cd aolabs
npm install
```

### 2. Run it

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. That's it — no build step,
no env file, no deployment.

For a production build:

```bash
npm run build
npm run preview
```

### 3. Configure AO (first run)

Click the **gear icon** (top right of the chat page) to open Settings.

**AI Model**

| Field | What to enter |
|---|---|
| Provider | `OpenAI-compatible` or `Anthropic` |
| Base URL | Your LLM endpoint's base URL (see examples below) |
| API key | Your provider's API key (stored only in your browser) |
| Model name | Any model your endpoint serves, typed exactly as listed |

Base URL examples:

| Provider | Base URL | Model example |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-5` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` |
| Ollama (local) | `http://localhost:11434/v1` | `llama3.1` |
| LM Studio (local) | `http://localhost:1234/v1` | `local-model` |

> **CORS note:** AO calls your LLM endpoint directly from the browser.
> Most OpenAI-compatible providers allow this. Anthropic's API requires the
> `anthropic-dangerous-direct-browser-access` header, which AO sends — but
> if your provider blocks browser calls, point AO at a local proxy or an
> OpenAI-compatible gateway instead.

Use **Test connection** in Settings to verify your endpoint before chatting.

**Chain & RPC**

| Field | What to enter |
|---|---|
| Chain name / Chain ID | Defaults: `Robinhood Chain` / `4663` |
| RPC endpoint | Your own JSON-RPC endpoint for the chain |
| Explorer API | Blockscout-compatible explorer API (default provided) |

The RPC field is **empty by default on purpose** — AO reads on-chain history
through it, so you choose the endpoint. Any archive-capable JSON-RPC works:

- A keyed RPC (e.g. [Alchemy](https://www.alchemy.com/) free tier) is faster
  and more reliable, and its indexed Transfers API gives AO full-history
  transfers in seconds.
- The public Robinhood Chain RPC also works from browsers:
  `https://rpc.mainnet.chain.robinhood.com`

> Note: some keyed RPCs cap `eth_getLogs` ranges (Alchemy Free: 10 blocks).
> AO handles that — transfers come from the indexed Transfers API when
> available, the approval scan is time-boxed, and your stored memory is
> never shrunk by a partial scan.

Use **Test RPC** in Settings to verify the endpoint (it reads the latest
block number).

### 4. Scan a wallet and chat

1. Paste a wallet `0x` address in the sidebar and press **Scan Address**
   (or just type the address in chat — AO detects it automatically).
2. AO builds the wallet memory and shows it in the sidebar:
   **Strategies · Mistakes · Habits · Shifts · Insights**.
3. Ask anything about it. Type `$SYMBOL` to force a live market lookup for
   a specific token (e.g. `$NVDA`, `$GME`).

Your memory and chat history are saved in your browser's localStorage, so
the next visit loads them instantly. **Scan Address** is the refresh path
when new on-chain activity appears.

---

## How it works

```
Browser only — no backend
┌────────────────────────────────────────────────────────────┐
│  React UI (Vite)                                           │
│    ChatPage / MemorySidebar / ChatThread / SettingsPanel     │
├────────────────────────────────────────────────────────────┤
│  src/lib/                                                  │
│    settings.ts   your LLM + RPC config (localStorage)       │
│    llm.ts        generic client: OpenAI-compatible +        │
│                  Anthropic Messages API                     │
│    explorer.ts   wallet scan: RPC eth_getLogs / Transfers   │
│                  API + explorer API fallback                │
│    memory.ts     strategy / mistake / habit analysis        │
│    market.ts     GeckoTerminal + DEX Screener lookups       │
│    security.ts   prompt-injection firewall + sanitizer      │
│    store.ts      localStorage persistence                   │
│    apiClient.ts  chat orchestration (memory + market + LLM) │
└────────────────────────────────────────────────────────────┘
        │                │                 │
   your LLM          your RPC        public market /
   endpoint          endpoint        explorer APIs
```

- **No server.** `npm run dev` serves the Vite app; every data call goes
  straight from your browser to the endpoints you configured.
- **No database.** Wallet memory and chat sessions live in localStorage.
  Clearing browser data erases them.
- **No keys in code.** API keys and RPC URLs are entered in the UI and never
  committed. Optional build-time defaults can be set with `VITE_*` variables
  (see `.env.example`).
- **Your model, your rules.** AO never claims a specific vendor — it runs
  on the model you configured, and the system prompt says exactly that.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:5173) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Typecheck without emitting |

## Configuration reference

All settings live in **Settings** in the UI and are stored under the
`ao_settings_v1` key in localStorage. Optional build-time defaults:

```bash
cp .env.example .env
# VITE_LLM_PROVIDER=openai
# VITE_LLM_BASE_URL=https://api.openai.com/v1
# VITE_LLM_API_KEY=
# VITE_LLM_MODEL=gpt-4o-mini
# VITE_RPC_URL=
```

These only pre-fill the Settings form at build time — the UI always wins.

## Customization

This is open source under the MIT license — modify freely:

- **Change the chain:** Settings → Chain name / Chain ID / RPC endpoint /
  Explorer API. Market lookups target the `robinhood` network slugs in
  `src/lib/market.ts` and the token lists in `src/lib/explorer.ts`.
- **Change AO's behavior:** the system prompt lives in
  `src/lib/security.ts` (`AO_SYSTEM_PROMPT`); the analysis rules in
  `src/lib/memory.ts`.
- **Change the look:** Tailwind theme in `tailwind.config.js`, styles in
  `src/index.css`, landing page in `src/pages/HomePage.tsx`.

## Privacy

- Your LLM API key and RPC URL are stored **only in your browser**.
- Wallet addresses you scan are sent only to your configured RPC, the
  explorer API, and the public market APIs — never to AOLABS.
- AO's replies are analytical reflections of your own on-chain history,
  not financial advice.

## License

MIT — see [LICENSE](LICENSE). Built by **AOLABS** — https://aolabs.xyz
