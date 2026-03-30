---
name: Quota Auto-Refresh
status: pending
priority: low
branch: addition
date: 2026-03-30
blockedBy: []
blocks: []
---

# Quota Auto-Refresh

> Periodically poll provider quota status and auto-reset exhausted accounts when their reset time passes

## Problem
Currently quota data only updates when:
1. An API call returns headers (passive)
2. A 429 error marks account exhausted

No active polling → stale quota data in dashboard, exhausted accounts stay marked even after reset time.

## Solution
Add a timer in `ProviderRotationServiceImpl` that:
1. Every N seconds (configurable, default 60s), checks all exhausted accounts
2. If `retryAt` timestamp has passed → reset account health
3. Fire `onDidUpdateQuota` event → dashboard UI refreshes

## Files to Modify
- `src/vs/workbench/contrib/multiAgent/common/providerRotationServiceImpl.ts`

## Implementation

```typescript
// In constructor:
this._startAutoRefresh();

// New method:
private _startAutoRefresh(): void {
    const intervalMs = this._configService.getValue<number>('multiAgent.quotaRefreshInterval') ?? 60_000;
    const timer = setInterval(() => this._refreshExhaustedAccounts(), intervalMs);
    this._register(toDisposable(() => clearInterval(timer)));
}

private _refreshExhaustedAccounts(): void {
    const now = Date.now();
    for (const [accountId, retryAt] of this._exhaustedAccounts) {
        if (retryAt <= now) {
            this._exhaustedAccounts.delete(accountId);
            this._providerService.resetAccountHealth(accountId);
            this._onDidUpdateQuota.fire(accountId);
        }
    }
}
```

## Config Addition
Add to `multiAgent.contribution.ts` configuration:
```typescript
'multiAgent.quotaRefreshInterval': {
    type: 'number',
    default: 60000,
    minimum: 10000,
    description: 'Quota refresh interval in milliseconds (default: 60 seconds)',
}
```

## Success Criteria
- Exhausted accounts auto-reset when their retry-after time passes
- Dashboard quota bars update automatically
- Refresh interval configurable via settings
- No performance impact (simple Map iteration, no API calls)
