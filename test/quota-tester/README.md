# Quota Tester

A local mock server + web UI for testing VS Code Copilot quota/billing scenarios (both PRU and TBB/usage-based billing).

## Prerequisites

- Node.js 22+

## Setup

```bash
cd test/quota-tester
npm install
npm run build
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Usage

### 1. Point VS Code at the mock server

Add or update this in your `product.overrides.json` under `defaultChatAgent`:

```json
{
  "defaultChatAgent": {
    "entitlementUrl": "http://localhost:4000/copilot_internal/user"
  }
}
```

### 2. Configure scenarios

Open `http://localhost:4000` in your browser. Use the preset buttons to quickly switch between plan/quota configurations (Free PRU, Free TBB, Pro, Pro+, Max, Business, Enterprise — each with various quota states).

### 3. Simulate chat requests (decrement quota)

Click the **▼ Decrement Quota** button in the web UI (or call the API directly) to simulate chat requests consuming quota. Each click decrements the primary quota by the configured amount:

- **Free users**: decrements the `chat` quota snapshot
- **Paid users**: decrements the `premium_interactions` quota snapshot

When quota reaches 0 and overage is not permitted, the `/api/decrement` endpoint returns a `403` with a `quota_exceeded` error matching the CAPI error shape:

```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "You have exceeded your included quota for this billing cycle."
  }
}
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/copilot_internal/user` | Mock entitlements response (what VS Code fetches) |
| `GET` | `/api/state` | Current tester state (for UI) |
| `PUT` | `/api/state` | Replace tester state |
| `POST` | `/api/reset` | Reset to defaults |
| `GET` | `/api/presets` | List available presets |
| `POST` | `/api/presets/:id` | Apply a preset |
| `GET` | `/api/preview/entitlements` | Preview the entitlements response |
| `POST` | `/api/decrement` | **Decrement quota** — simulates a chat request |
| `GET` | `/api/decrement-config` | Get decrement amount |
| `PUT` | `/api/decrement-config` | Set decrement amount |

### Decrement API

```bash
# Decrement by default amount (10)
curl -X POST http://localhost:4000/api/decrement

# Decrement by custom amount
curl -X POST http://localhost:4000/api/decrement \
  -H 'Content-Type: application/json' \
  -d '{"amount": 50}'

# Change default decrement amount
curl -X PUT http://localhost:4000/api/decrement-config \
  -H 'Content-Type: application/json' \
  -d '{"amount": 25}'
```

## Test Scenarios

### Quota Display & Tracking
1. Select a preset (e.g., "Free — TBB" or "Pro+ — TBB with quota")
2. Restart VS Code to pick up the new entitlements
3. Verify the status bar shows the correct quota percentage and fraction on hover

### Quota Threshold Notifications
1. Select a preset with quota (e.g., "EDU/Pro — TBB")
2. Use the decrement button to gradually reduce quota
3. Verify notifications appear at 50%, 75%, and 90% thresholds
4. Verify "Upgrade" or "Manage Budget" buttons appear appropriately

### Quota Exhaustion
1. Select a preset and decrement quota to 0
2. The decrement endpoint returns `quota_exceeded` error
3. Verify the sticky notification appears in VS Code
4. Verify chat no longer works
