# PalettePilot Vision Proxy: Deployment Prerequisites & Security Review

This guide details the security model, architectural decisions, and manual verification steps the project owner must follow **before** deploying the backend proxy or enabling real AI.

---

## 1. Critical Disclaimers & Privacy Warnings

> [!WARNING]
> **Free Tiers Are NOT Unlimited & Hosting Is NOT Guaranteed Free**
> Neither Google Cloud/AI Studio nor Cloudflare provides infinite zero-cost tiers. PalettePilot’s architecture enforces strict server-side budget hard caps (`MAX_DAILY_REQUESTS: 20`, `MAX_LIFETIME_REQUESTS: 100`) and fails closed to prevent accidental billing. You must manually monitor your Cloudflare and Google Cloud billing consoles.

> [!CAUTION]
> **Gemini Free-Tier Data Logging & User Privacy Warning**
> Under Google AI Studio's standard free-tier terms of service:
> - User input data (including uploaded clothing images and prompts) **may be logged, reviewed by human reviewers, and used to train Google models**.
> - **DO NOT** deploy or connect the free tier with real user private wardrobe photos without explicitly reviewing Google's Terms of Service and securing informed consent from beta users.
> - For production privacy protection, a paid Google Cloud Project with data logging explicitly disabled (or a zero-data-retention enterprise tier) is typically required.

---

## 2. Infrastructure Architecture & Budget Synchronization

### Why Cloudflare KV was Rejected for Atomic Budgets
Initial prototypes often consider Cloudflare KV for counter storage. However, **Cloudflare KV is an eventually consistent key-value store with read-modify-write race conditions and up to 60-second propagation delays**. Concurrent requests hitting different edge nodes can simultaneously read stale counters, permitting requests to bypass daily/lifetime quotas.

### Authoritative Solution: Cloudflare Durable Objects (Optional Architecture)
PalettePilot's server directory includes an implementation of a **Cloudflare Durable Object** (`BudgetCoordinatorDO`) as an authoritative coordinator:
* **Global Singleton**: Only ONE coordinator instance exists globally (`idFromName("global-spend-budget")`).
* **Single-Threaded Actor Model**: All edge Worker instances serialize quota reservations through this coordinator. No two requests can evaluate quota concurrently.
* **Transactional Persistence**: Counters are stored directly in the Durable Object's strongly consistent embedded storage.
* **Fail-Closed Protection**: If the Durable Object is unreachable, unconfigured, or throws, the proxy rejects requests with HTTP 503 (`BUDGET_COORDINATOR_UNAVAILABLE`).

> [!CAUTION]
> **Cloudflare Pricing & Workers Paid Dependency Warning**
> - **DO NOT assume Durable Objects are unconditionally free for your Cloudflare account.**
> - Historically, Durable Objects required a **Workers Paid plan ($5/month minimum base charge)**.
> - While Cloudflare introduced a free tier for SQLite-backed Durable Objects, availability varies by account status, onboarding date, and beta flags.
> - If your account does not qualify for free Durable Objects, deploying `server/` with `wrangler.jsonc` will require a paid subscription.
> - **Zero-Unapproved-Spend Rule**: Do NOT enter credit card information, subscribe to Workers Paid, or enable billable resources.
> - **The local application requires ZERO cloud services**: The local deterministic engine and local prototype persistence continue to operate 100% locally with zero fees. Deploying `server/` is strictly optional and not required.

---

## 3. Abuse Protection Limitations

> [!IMPORTANT]
> **Worker-Level IP Rate Limiting Limitations**
> The proxy includes an in-memory IP rate limiter (max 5 requests/minute per IP) in [`server/src/abuseGuard.ts`](./src/abuseGuard.ts).
> - This operates **per Worker isolate instance**, not as an atomic edge-wide limiter.
> - It protects against simple automated loops hitting the same edge isolate, but does **not** protect against distributed botnets or requests routed across different Cloudflare edge data centers.
> - For production-grade edge-wide IP throttling, configure **Cloudflare Rate Limiting Rules** in the Cloudflare Zone Dashboard.

---

## 4. Manual Owner Verification Checklist (Before Deployment)

### Step 1: Verify Cloudflare Account Free-Tier Settings
1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Confirm your account is on the **Workers Free** plan.
3. Ensure no payment methods with auto-upgrade are enabled for unmetered usage.
4. Verify local Wrangler CLI:
   ```bash
   npx wrangler --version
   npx wrangler login
   ```

### Step 2: Google AI Studio API Key & Billing Restrictions
1. Open [Google AI Studio](https://aistudio.google.com/) or Google Cloud Console.
2. Create an API key specifically restricted to the **Gemini 2.5 Flash** model.
3. In Google Cloud Console:
   - Ensure credit card billing alerts are enabled at **\$0.01**.
   - Ensure auto-upgrade is **OFF** so requests are rejected with HTTP 429 rather than billed if the free tier is exceeded.
4. Set the secret in Cloudflare Workers using Wrangler (do **not** put it in `wrangler.jsonc` or `.env`):
   ```bash
   cd server
   npx wrangler secret put GEMINI_API_KEY
   ```
   *(When prompted, paste your API key).*

### Step 3: Operational Configuration in `server/wrangler.jsonc`
Verify the operational environment variables in [`server/wrangler.jsonc`](./wrangler.jsonc):
- `ENABLE_EXTERNAL_AI`: Set to `"true"` ONLY when ready to begin private beta testing.
- `GLOBAL_KILL_SWITCH`: Leave `"false"`. Set to `"true"` to instantly cut 100% of outbound AI calls.
- `MAX_DAILY_REQUESTS`: Default `"20"`. Keep conservative to prevent sudden bursts.
- `MAX_LIFETIME_REQUESTS`: Default `"100"`. Hard ceiling for prototype lifecycle.
- `ALLOWED_ORIGINS`: Set to your exact frontend domain (e.g. `https://palettepilot.pages.dev`).

### Step 4: Deploying the Worker (Owner Only)
When all prerequisites are met:
```bash
cd server
npx wrangler deploy
```
Wrangler will upload the worker and initialize the `BudgetCoordinatorDO` Durable Object migration.

### Step 5: Connecting the Frontend
1. Once deployed and verified via `GET /api/v1/health`, set the frontend environment variable:
   ```bash
   VITE_VISION_API_URL=https://palettepilot-vision-proxy.<your-subdomain>.workers.dev/api/v1/vision/extract-garment
   VITE_APPROVED_FREE_TIER=true
   ```
2. Build and deploy the frontend static files.

---

## 5. Emergency Kill Switch Procedure

If unexpected traffic, billing alerts, or abuse occur:
1. Run:
   ```bash
   cd server
   npx wrangler secret put GLOBAL_KILL_SWITCH
   # Enter: true
   ```
   Or edit `GLOBAL_KILL_SWITCH: "true"` in `wrangler.jsonc` and run `npx wrangler deploy`.
2. All calls to `/api/v1/vision/extract-garment` will immediately return HTTP 503 (`KILL_SWITCH_ACTIVE`), terminating all upstream requests before any provider call is attempted.
