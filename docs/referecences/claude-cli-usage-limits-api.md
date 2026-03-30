# Claude CLI Usage Limits API - Technical Documentation

> Reusable implementation guide for integrating Anthropic's OAuth Usage API across platforms.

## Overview

This document details how to implement Claude CLI's Usage Limit API integration, including:
- Fetching usage quotas from Anthropic's OAuth API
- Cross-platform credential retrieval (macOS, Windows, Linux)
- Caching and rate limiting strategies

---

## 1. Anthropic Usage API

### Endpoint
```
GET https://api.anthropic.com/api/oauth/usage
```

### Authentication
Requires OAuth Bearer token with proper scopes.

### Request Headers
```typescript
{
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`,
  'anthropic-beta': 'oauth-2025-04-20',
  'User-Agent': 'your-app/1.0'
}
```

### Response Format
```json
{
  "five_hour": {
    "utilization": 0.45,
    "resets_at": "2025-01-15T18:00:00Z"
  },
  "seven_day": {
    "utilization": 0.32,
    "resets_at": "2025-01-22T00:00:00Z"
  },
  "seven_day_opus": {
    "utilization": 0.15,
    "resets_at": "2025-01-22T00:00:00Z"
  },
  "seven_day_sonnet": {
    "utilization": 0.28,
    "resets_at": "2025-01-22T00:00:00Z"
  }
}
```

### Data Structures

```typescript
interface UsagePeriod {
  utilization: number    // Percentage 0-1 (multiply by 100 for display)
  resetsAt: string | null // ISO 8601 timestamp
}

interface UsageLimits {
  fiveHour: UsagePeriod       // 5-hour rolling window
  sevenDay: UsagePeriod       // 7-day rolling window
  sevenDayOpus: UsagePeriod | null   // Model-specific (Pro plans)
  sevenDaySonnet: UsagePeriod | null // Model-specific (Pro plans)
}
```

---

## 2. Cross-Platform Credential Retrieval

### Credential Storage Locations

| Platform | Storage Method | Location |
|----------|---------------|----------|
| macOS | Keychain | Service: `Claude Code-credentials` |
| Windows | File | `%USERPROFILE%\.claude\.credentials.json` |
| Linux | File | `~/.claude/.credentials.json` |

### Credential Structure

```typescript
interface ClaudeOAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt?: number      // Unix timestamp (ms)
  scopes?: string[]
  subscriptionType?: string
}
```

### Implementation: Platform-Specific Retrieval

```typescript
import { platform, homedir } from 'os'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { execSync } from 'child_process'

export async function getClaudeCredentials(): Promise<ClaudeOAuthCredentials | null> {
  const os = platform()

  try {
    if (os === 'darwin') {
      return await getCredentialsFromMacKeychain()
    } else {
      // Linux and Windows both use file-based storage
      return await getCredentialsFromFile()
    }
  } catch (error) {
    console.error('[credentials] Failed to retrieve:', error)
    return null
  }
}
```

### macOS Keychain Retrieval

```typescript
async function getCredentialsFromMacKeychain(): Promise<ClaudeOAuthCredentials | null> {
  try {
    // Execute security command with timeout
    const result = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { timeout: 5000, encoding: 'utf-8' }
    ).trim()

    const parsed = JSON.parse(result)

    // Extract OAuth credentials from the claudeAiOauth field
    if (parsed.claudeAiOauth) {
      return parsed.claudeAiOauth
    }

    return null
  } catch (error) {
    // Fallback to file-based storage if Keychain fails
    console.warn('[credentials] Keychain failed, trying file fallback')
    return getCredentialsFromFile()
  }
}
```

### File-Based Retrieval (Windows/Linux)

```typescript
async function getCredentialsFromFile(): Promise<ClaudeOAuthCredentials | null> {
  const credentialsPath = join(homedir(), '.claude', '.credentials.json')

  try {
    const content = await readFile(credentialsPath, 'utf-8')
    const parsed = JSON.parse(content)

    if (parsed.claudeAiOauth) {
      return parsed.claudeAiOauth
    }

    return null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[credentials] File not found:', credentialsPath)
    } else {
      console.error('[credentials] File read error:', error)
    }
    return null
  }
}
```

### Token Expiration Check

```typescript
export function isCredentialsExpired(credentials: ClaudeOAuthCredentials): boolean {
  if (!credentials.expiresAt) return false

  const bufferMs = 5 * 60 * 1000 // 5-minute buffer
  return Date.now() > credentials.expiresAt - bufferMs
}
```

---

## 3. Usage Limits Service

### Full Implementation

```typescript
import { getClaudeCredentials } from './claude-credentials-service'

export interface UsagePeriod {
  utilization: number
  resetsAt: string | null
}

export interface UsageLimits {
  fiveHour: UsagePeriod
  sevenDay: UsagePeriod
  sevenDayOpus: UsagePeriod | null
  sevenDaySonnet: UsagePeriod | null
}

export async function getUsageLimits(): Promise<UsageLimits | null> {
  // Priority: 1) Keychain/File credentials, 2) Environment variable
  const credentials = await getClaudeCredentials()
  const token = credentials?.accessToken || process.env.CLAUDE_CODE_OAUTH_TOKEN

  if (!token) {
    console.error('[usage-limits] No token available')
    return null
  }

  try {
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'your-app/1.0',
      },
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[usage-limits] HTTP ${response.status}: ${body}`)
      return null
    }

    const data = await response.json()

    // Map snake_case to camelCase
    return {
      fiveHour: {
        utilization: data.five_hour?.utilization ?? 0,
        resetsAt: data.five_hour?.resets_at ?? null,
      },
      sevenDay: {
        utilization: data.seven_day?.utilization ?? 0,
        resetsAt: data.seven_day?.resets_at ?? null,
      },
      sevenDayOpus: data.seven_day_opus ? {
        utilization: data.seven_day_opus.utilization ?? 0,
        resetsAt: data.seven_day_opus.resets_at ?? null,
      } : null,
      sevenDaySonnet: data.seven_day_sonnet ? {
        utilization: data.seven_day_sonnet.utilization ?? 0,
        resetsAt: data.seven_day_sonnet.resets_at ?? null,
      } : null,
    }
  } catch (error) {
    console.error('[usage-limits] Fetch failed:', error)
    return null
  }
}
```

---

## 4. API Route with Caching

### Express Route Implementation

```typescript
import { Router } from 'express'
import { requireAuth } from '../middleware/auth'
import { getUsageLimits, UsageLimits } from '../services/usage-limits-service'

const router = Router()

// Simple in-memory cache
const CACHE_TTL_MS = 60_000 // 60 seconds
let cache: { data: UsageLimits | null; timestamp: number } | null = null

router.get('/usage-limits', requireAuth, async (req, res) => {
  // Return cached response if fresh
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return res.json({
      success: true,
      data: cache.data,
      cached: true,
    })
  }

  const limits = await getUsageLimits()

  if (!limits) {
    return res.status(400).json({
      success: false,
      error: 'Failed to fetch usage limits',
      hint: 'Ensure Claude CLI is authenticated with `claude login` and token has proper scopes',
    })
  }

  // Update cache
  cache = { data: limits, timestamp: Date.now() }

  return res.json({
    success: true,
    data: limits,
    cached: false,
  })
})

export default router
```

---

## 5. Frontend Integration

### React Hook

```typescript
import { useState, useEffect, useCallback } from 'react'
import { UsageLimits } from '../lib/api'

const AUTO_REFRESH_MS = 5 * 60 * 1000 // 5 minutes

export function useUsageLimits(isOpen: boolean) {
  const [data, setData] = useState<UsageLimits | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLimits = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/usage-limits', {
        credentials: 'include',
      })
      const result = await response.json()

      if (result.success) {
        setData(result.data)
      } else {
        setError(result.error || 'Failed to fetch usage limits')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    if (isOpen) {
      fetchLimits()
    }
  }, [isOpen, fetchLimits])

  // Auto-refresh when panel is open
  useEffect(() => {
    if (!isOpen) return

    const interval = setInterval(fetchLimits, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [isOpen, fetchLimits])

  return { data, isLoading, error, refetch: fetchLimits }
}
```

### API Client Function

```typescript
export interface UsageLimits {
  fiveHour: { utilization: number; resetsAt: string | null }
  sevenDay: { utilization: number; resetsAt: string | null }
  sevenDayOpus: { utilization: number; resetsAt: string | null } | null
  sevenDaySonnet: { utilization: number; resetsAt: string | null } | null
}

export async function getUsageLimits(): Promise<{
  success: boolean
  data?: UsageLimits
  error?: string
  hint?: string
}> {
  const response = await fetch('/api/usage-limits', {
    credentials: 'include',
  })
  return response.json()
}
```

---

## 6. UI Display Component

### Usage Bar with Color Coding

```tsx
function UsageBar({ label, utilization, resetsAt }: {
  label: string
  utilization: number
  resetsAt: string | null
}) {
  const percentage = Math.round(utilization * 100)

  // Color coding: green → yellow → red
  const getColor = (pct: number) => {
    if (pct >= 95) return 'bg-red-500'
    if (pct >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const formatResetTime = (isoDate: string | null) => {
    if (!isoDate) return null
    const date = new Date(isoDate)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>{percentage}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${getColor(percentage)} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {resetsAt && (
        <div className="text-xs text-gray-500">
          Resets in {formatResetTime(resetsAt)}
        </div>
      )}
    </div>
  )
}
```

---

## 7. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | No | Override token (bypasses keychain/file) |
| `ANTHROPIC_API_KEY` | No | API key for subprocess spawning |

**Token Priority Order:**
1. System credentials (Keychain on macOS, file on Windows/Linux)
2. `CLAUDE_CODE_OAUTH_TOKEN` environment variable

---

## 8. Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Invalid/expired token | Re-authenticate with `claude login` |
| 403 Forbidden | Token lacks scopes | Request proper OAuth scopes |
| No token available | Not authenticated | Run `claude login` first |
| Keychain access denied | macOS permissions | Grant terminal keychain access |

### Error Response Format

```typescript
// Success
{ success: true, data: UsageLimits, cached?: boolean }

// Error
{
  success: false,
  error: string,
  hint?: string // User-friendly instructions
}
```

---

## 9. Security Considerations

1. **Token Storage**: Never log or expose access tokens
2. **Subprocess Isolation**: Strip sensitive env vars when spawning Claude CLI
3. **Cache TTL**: 60 seconds prevents excessive API calls
4. **Expiration Buffer**: 5-minute buffer before token expiry triggers refresh

---

## 10. Testing

### Mock Usage Response

```typescript
const mockUsageLimits: UsageLimits = {
  fiveHour: { utilization: 0.45, resetsAt: '2025-01-15T18:00:00Z' },
  sevenDay: { utilization: 0.32, resetsAt: '2025-01-22T00:00:00Z' },
  sevenDayOpus: null,
  sevenDaySonnet: null,
}
```

### Integration Test

```typescript
describe('Usage Limits API', () => {
  it('should return cached response within TTL', async () => {
    const res1 = await request(app).get('/api/usage-limits')
    const res2 = await request(app).get('/api/usage-limits')

    expect(res2.body.cached).toBe(true)
  })
})
```
