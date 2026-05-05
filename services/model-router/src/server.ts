// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import express from 'express';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { ModelRoutesConfig, ProviderConfig, RoutingContext } from './types.js';
import { ModelRouter } from './router.js';
import { MetricsCollector, calculateCost } from './metrics.js';
import { toAnthropicFormat, toOpenAIFormat, fromAnthropicResponse, fromOpenAIResponse } from './translators.js';
import type { FailoverConfig } from './failover/types.js';

function loadConfig(): ModelRoutesConfig {
	const configPath = process.env.MODEL_ROUTES_CONFIG
		?? (process.env.NODE_ENV === 'production' ? '/app/config/routes.json' : './config/model-routes.json');

	const raw = readFileSync(configPath, 'utf-8');
	return JSON.parse(raw) as ModelRoutesConfig;
}

function loadFailoverConfig(): FailoverConfig {
	const explicitPath = process.env.MODEL_FAILOVER_CONFIG;
	const candidates = [
		explicitPath,
		join(process.cwd(), '.son-of-anton', 'routing.json'),
		join(process.cwd(), '..', '..', '.son-of-anton', 'routing.json'),
	].filter((p): p is string => typeof p === 'string');

	for (const path of candidates) {
		if (existsSync(path)) {
			try {
				return JSON.parse(readFileSync(path, 'utf-8')) as FailoverConfig;
			} catch (err) {
				if (path === explicitPath) {
					// Explicit path must be readable — surface this loudly.
					console.error(`[failover] Failed to parse explicit failover config at ${path}:`, (err as Error).message);
				} else {
					console.warn(`[failover] Skipping unreadable failover config at ${path}:`, (err as Error).message);
				}
			}
		}
	}
	return {};
}

interface ResolvedProvider {
	provider: string;
	model: string;
	config: ProviderConfig;
}

/**
 * Builds the ordered list of providers to try for a given agent role.
 *
 * Primary source: `routing.json` failover chain for the role (or "*" catch-all).
 * Fallback: the single route resolved by ModelRouter (legacy API-key path).
 *
 * Entries in routing.json that reference providers not present in
 * model-routes.json are silently skipped — this allows routing.json to
 * include future OAuth provider IDs before the adapter registry is wired in.
 */
function resolveProvidersForRole(
	agentRole: string,
	context: RoutingContext,
	router: ModelRouter,
	failoverConfig: FailoverConfig,
): ResolvedProvider[] {
	const roleConfig = failoverConfig[agentRole] ?? failoverConfig['*'];

	if (roleConfig?.primary) {
		const fallbackList = Array.isArray(roleConfig.fallback) ? roleConfig.fallback : [];
		const entries = [roleConfig.primary, ...fallbackList];
		const resolved: ResolvedProvider[] = [];
		for (const entry of entries) {
			if (!entry?.provider || !entry?.model) {
				continue;
			}
			try {
				const config = router.resolveProvider(entry.provider);
				resolved.push({ provider: entry.provider, model: entry.model, config });
			} catch {
				// Provider not yet registered in model-routes.json — skip gracefully.
			}
		}
		if (resolved.length > 0) {
			return resolved;
		}
	}

	// Legacy fallback: use ModelRouter to resolve the primary route.
	const route = router.resolveRoute(context);
	return [{ provider: route.provider, model: route.model, config: route.providerConfig }];
}

function buildRequestHeaders(config: ProviderConfig): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (config.apiKey) {
		if (config.format === 'anthropic') {
			headers['x-api-key'] = config.apiKey;
			headers['anthropic-version'] = '2023-06-01';
		} else {
			headers['Authorization'] = `Bearer ${config.apiKey}`;
		}
	}
	return headers;
}

function buildEndpoint(config: ProviderConfig): string {
	return config.format === 'anthropic'
		? `${config.baseUrl}/v1/messages`
		: `${config.baseUrl}/v1/chat/completions`;
}

export function createServer() {
	const config = loadConfig();
	let failoverConfig = loadFailoverConfig();
	const router = new ModelRouter(config);
	const metrics = new MetricsCollector();
	const app = express();

	app.use(express.json({ limit: '10mb' }));

	// Health endpoint
	app.get('/health', (_req, res) => {
		res.json({ status: 'ok', service: 'model-router' });
	});

	// Main routing endpoint
	app.post('/v1/messages', async (req, res) => {
		const context: RoutingContext = {
			agentRole: (req.headers['x-agent-role'] as string) ?? 'default',
			taskType: req.headers['x-task-type'] as string | undefined,
			taskId: req.headers['x-task-id'] as string | undefined,
		};

		const isStreaming = req.body.stream === true;
		const startTime = Date.now();
		const messages = req.body.messages ?? [];
		const systemPrompt = req.body.system;
		const maxTokens = req.body.max_tokens ?? 4096;

		const providers = resolveProvidersForRole(context.agentRole, context, router, failoverConfig);

		let lastError: Error | null = null;
		let lastProvider = providers[0]?.provider ?? 'unknown';
		let lastModel = providers[0]?.model ?? 'unknown';

		for (const { provider, model, config: providerConfig } of providers) {
			lastProvider = provider;
			lastModel = model;

			try {
				const translatedBody = providerConfig.format === 'anthropic'
					? toAnthropicFormat(messages, systemPrompt, maxTokens, model, isStreaming)
					: toOpenAIFormat(messages, systemPrompt, maxTokens, model, isStreaming);

				const headers = buildRequestHeaders(providerConfig);
				const endpoint = buildEndpoint(providerConfig);

				const fetchResponse = await fetch(endpoint, {
					method: 'POST',
					headers,
					body: JSON.stringify(translatedBody),
				});

				if (!fetchResponse.ok) {
					const errorBody = await fetchResponse.text();
					// 5xx = server error; 429 = rate-limited — both warrant trying the next provider.
					const retryable = fetchResponse.status >= 500 || fetchResponse.status === 429;
					lastError = new Error(`Provider ${provider} returned ${fetchResponse.status}: ${errorBody}`);
					if (!retryable) {
						// Client error — do not try fallbacks
						break;
					}
					// Server error or rate-limit — try next provider
					continue;
				}

				if (isStreaming) {
					if (!res.headersSent) {
						res.setHeader('Content-Type', 'text/event-stream');
						res.setHeader('Cache-Control', 'no-cache');
						res.setHeader('Connection', 'keep-alive');
					}

					try {
						const body = fetchResponse.body as unknown as AsyncIterable<Buffer> | null;
						if (body) {
							for await (const chunk of body) {
								res.write(chunk);
							}
						}
						res.end();
						return;
					} catch (streamErr) {
						lastError = streamErr as Error;
						console.error(`Stream from ${provider} failed mid-flight:`, lastError.message);
						// Continue to next provider if headers have not been sent yet,
						// or if the connection is still writable.
						if (res.headersSent && !res.writableEnded) {
							continue;
						}
						// Response already ended — cannot recover.
						return;
					}
				}

				// Non-streaming response
				const responseBody = await fetchResponse.json() as Record<string, unknown>;
				const unified = providerConfig.format === 'anthropic'
					? fromAnthropicResponse(responseBody)
					: fromOpenAIResponse(responseBody);

				const latencyMs = Date.now() - startTime;
				const cost = calculateCost(model, unified.inputTokens, unified.outputTokens, unified.cachedTokens);

				metrics.record({
					id: randomUUID(),
					timestamp: Date.now(),
					provider,
					model,
					agentRole: context.agentRole,
					taskType: context.taskType ?? '',
					taskId: context.taskId ?? '',
					inputTokens: unified.inputTokens,
					outputTokens: unified.outputTokens,
					cachedTokens: unified.cachedTokens,
					latencyMs,
					cost,
					success: true,
				});

				res.json(unified);
				return;

			} catch (err) {
				lastError = err as Error;
				console.error(`Provider ${provider} failed:`, lastError.message);
				metrics.record({
					id: randomUUID(),
					timestamp: Date.now(),
					provider,
					model,
					agentRole: context.agentRole,
					taskType: context.taskType ?? '',
					taskId: context.taskId ?? '',
					inputTokens: 0,
					outputTokens: 0,
					cachedTokens: 0,
					latencyMs: Date.now() - startTime,
					cost: 0,
					success: false,
					error: lastError.message,
				});
				// Network / connection error — try next provider
			}
		}

		// All providers exhausted — attribute the failure to the last attempted provider.
		const latencyMs = Date.now() - startTime;
		console.error('All providers failed. Last error:', lastError?.message);

		metrics.record({
			id: randomUUID(),
			timestamp: Date.now(),
			provider: lastProvider,
			model: lastModel,
			agentRole: context.agentRole,
			taskType: context.taskType ?? '',
			taskId: context.taskId ?? '',
			inputTokens: 0,
			outputTokens: 0,
			cachedTokens: 0,
			latencyMs,
			cost: 0,
			success: false,
			error: lastError?.message,
		});

		res.status(502).json({ error: lastError?.message ?? 'All providers failed' });
	});

	// Metrics endpoints
	app.get('/metrics', (_req, res) => {
		res.json(metrics.getAggregated());
	});

	app.get('/metrics/recent', (req, res) => {
		const count = parseInt(req.query.count as string, 10) || 10;
		res.json(metrics.getRecent(count));
	});

	// Config reload
	app.post('/config/reload', (_req, res) => {
		try {
			const newConfig = loadConfig();
			router.reloadConfig(newConfig);
			failoverConfig = loadFailoverConfig();
			res.json({ status: 'reloaded' });
		} catch (err) {
			res.status(500).json({ error: (err as Error).message });
		}
	});

	return app;
}
