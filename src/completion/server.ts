/**
 * Logos Completion Server
 * D3N-powered code completions with Flash App acceleration
 */

import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 8082;

// Middleware
app.use(cors());
app.use(express.json());

// Environment
const D3N_ENDPOINT = process.env.D3N_ENDPOINT || 'http://d3n-gateway:9090';
const FLASH_APPS_ENABLED = process.env.FLASH_APPS_ENABLED === 'true';

// Metrics
let totalRequests = 0;
let tier1Requests = 0;
let tier2Requests = 0;
let tier3Requests = 0;
let cacheHits = 0;
let avgLatency = 0;

// Simple LSH cache for similar queries
const completionCache = new Map<string, { result: string; timestamp: number }>();
const CACHE_TTL = 300000; // 5 minutes

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'logos-completion',
    flashAppsEnabled: FLASH_APPS_ENABLED,
    timestamp: new Date().toISOString(),
  });
});

// Ready check
app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

// Metrics endpoint
app.get('/metrics', (_req: Request, res: Response) => {
  res.json({
    totalRequests,
    tierDistribution: {
      tier1: tier1Requests,
      tier2: tier2Requests,
      tier3: tier3Requests,
    },
    cacheHitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
    avgLatencyMs: avgLatency,
  });
});

// Determine tier based on query complexity
function determineTier(prefix: string, suffix: string, language: string): number {
  const contextLength = (prefix?.length || 0) + (suffix?.length || 0);

  // Simple heuristics for tier selection
  // Tier 1: Flash Apps - simple completions
  if (contextLength < 100) {
    return 1;
  }

  // Tier 3: Full reasoning - complex code
  if (contextLength > 2000 || language === 'rust' || language === 'haskell') {
    return 3;
  }

  // Tier 2: Default
  return 2;
}

// Generate cache key
function getCacheKey(prefix: string, language: string): string {
  // Simplified LSH - just use last 50 chars
  const key = `${language}:${prefix.slice(-50)}`;
  return key;
}

// Completion endpoint
app.post('/api/completion', async (req: Request, res: Response) => {
  const startTime = Date.now();
  totalRequests++;

  const { prefix, suffix, language, file, position, options } = req.body;

  // Check cache
  const cacheKey = getCacheKey(prefix || '', language || 'plaintext');
  const cached = completionCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    cacheHits++;
    tier1Requests++;

    const latency = Date.now() - startTime;
    avgLatency = (avgLatency * (totalRequests - 1) + latency) / totalRequests;

    return res.json({
      completions: [cached.result],
      tier: 1,
      cached: true,
      latencyMs: latency,
    });
  }

  // Determine tier
  const tier = determineTier(prefix || '', suffix || '', language || 'plaintext');

  if (tier === 1) tier1Requests++;
  else if (tier === 2) tier2Requests++;
  else tier3Requests++;

  try {
    // Call D3N for completion
    const response = await fetch(`${D3N_ENDPOINT}/api/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier,
        context: {
          prefix,
          suffix,
          language,
          file,
          position,
        },
        options: {
          maxTokens: options?.maxTokens || 50,
          temperature: tier === 1 ? 0 : 0.2,
          flashApp: tier === 1 && FLASH_APPS_ENABLED ? 'code_completion' : undefined,
        },
      }),
    });

    const d3nResponse = await response.json();
    const completions = d3nResponse.completions || [''];

    // Cache result
    if (completions[0]) {
      completionCache.set(cacheKey, {
        result: completions[0],
        timestamp: Date.now(),
      });
    }

    const latency = Date.now() - startTime;
    avgLatency = (avgLatency * (totalRequests - 1) + latency) / totalRequests;

    res.json({
      completions,
      tier,
      cached: false,
      latencyMs: latency,
      model: d3nResponse.model,
    });
  } catch (error) {
    console.error('D3N completion failed:', error);

    const latency = Date.now() - startTime;
    avgLatency = (avgLatency * (totalRequests - 1) + latency) / totalRequests;

    // Return empty completion on error
    res.json({
      completions: [],
      tier,
      error: 'Completion service temporarily unavailable',
      latencyMs: latency,
    });
  }
});

// Inline completion (for editor integration)
app.post('/api/inline-completion', async (req: Request, res: Response) => {
  const { document, position, context } = req.body;

  // Extract prefix and suffix from document
  const lines = document.split('\n');
  const prefix = lines.slice(0, position.line).join('\n') +
                 '\n' + lines[position.line].slice(0, position.character);
  const suffix = lines[position.line].slice(position.character) +
                 '\n' + lines.slice(position.line + 1).join('\n');

  // Forward to main completion endpoint
  const response = await fetch(`http://localhost:${PORT}/api/completion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prefix,
      suffix,
      language: context?.languageId || 'plaintext',
      file: context?.uri,
      position,
    }),
  });

  const result = await response.json();
  res.json(result);
});

// Clear cache
app.post('/api/cache/clear', (_req: Request, res: Response) => {
  completionCache.clear();
  res.json({ status: 'ok', message: 'Cache cleared' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Logos Completion Server running on port ${PORT}`);
  console.log(`D3N Endpoint: ${D3N_ENDPOINT}`);
  console.log(`Flash Apps Enabled: ${FLASH_APPS_ENABLED}`);
});


