// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import express from 'express';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { ModelRoutesConfig, RoutingContext } from './types.js';
import { ModelRouter } from './router.js';
import { MetricsCollector, calculateCost } from './metrics.js';
import { toAnthropicFormat, toOpenAIFormat, fromAnthropicResponse, fromOpenAIResponse } from './translators.js';

function loadConfig(): ModelRoutesConfig {
	const configPath = process.env.MODEL_ROUTES_CONFIG
		?? (process.env.NODE_ENV === 'production' ? '/app/config/routes.json' : './config/model-routes.json');

	const raw = readFileSync(configPath, 'utf-8');
	return JSON.parse(raw) as ModelRoutesConfig;
}

export function createServer() {
	const config = loadConfig();
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

		let resolvedProvider: string;
		let resolvedModel: string;

		try {
			const route = router.resolveRoute(context);
			resolvedProvider = route.provider;
			resolvedModel = route.model;

			const providerConfig = route.providerConfig;
			const messages = req.body.messages ?? [];
			const systemPrompt = req.body.system;
			const maxTokens = req.body.max_tokens ?? 4096;

			// Translate request to provider format
			let translatedBody: unknown;
			if (providerConfig.format === 'anthropic') {
				translatedBody = toAnthropicFormat(messages, systemPrompt, maxTokens, resolvedModel, isStreaming);
			} else {
				translatedBody = toOpenAIFormat(messages, systemPrompt, maxTokens, resolvedModel, isStreaming);
			}

			// Build fetch options
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};

			if (providerConfig.apiKey) {
				if (providerConfig.format === 'anthropic') {
					headers['x-api-key'] = providerConfig.apiKey;
					headers['anthropic-version'] = '2023-06-01';
				} else {
					headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
				}
			}

			const endpoint = providerConfig.format === 'anthropic'
				? `${providerConfig.baseUrl}/v1/messages`
				: `${providerConfig.baseUrl}/v1/chat/completions`;

			const fetchResponse = await fetch(endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(translatedBody),
			});

			if (!fetchResponse.ok) {
				const errorBody = await fetchResponse.text();
				throw new Error(`Provider ${resolvedProvider} returned ${fetchResponse.status}: ${errorBody}`);
			}

			// Handle streaming
			if (isStreaming) {
				res.setHeader('Content-Type', 'text/event-stream');
				res.setHeader('Cache-Control', 'no-cache');
				res.setHeader('Connection', 'keep-alive');

				const body = fetchResponse.body as unknown as IncomingMessage | null;
				if (body) {
					body.on('data', (chunk: Buffer) => {
						res.write(chunk);
					});
					body.on('end', () => {
						res.end();
					});
					body.on('error', (err: Error) => {
						console.error('Stream error:', err);
						res.end();
					});
				} else {
					res.end();
				}
				return;
			}

			// Handle non-streaming response
			const responseBody = await fetchResponse.json() as Record<string, unknown>;
			const unified = providerConfig.format === 'anthropic'
				? fromAnthropicResponse(responseBody)
				: fromOpenAIResponse(responseBody);

			const latencyMs = Date.now() - startTime;
			const cost = calculateCost(resolvedModel, unified.inputTokens, unified.outputTokens, unified.cachedTokens);

			metrics.record({
				id: randomUUID(),
				timestamp: Date.now(),
				provider: resolvedProvider,
				model: resolvedModel,
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
		} catch (err) {
			const error = err as Error;
			console.error('Request failed:', error.message);

			// Attempt fallback
			try {
				const matchedRoute = router.getConfig().routes
					.sort((a, b) => a.priority - b.priority)
					.find(r => {
						const matchRole = r.match.agentRole === '*' || r.match.agentRole === context.agentRole;
						const matchTask = !r.match.taskType || r.match.taskType === context.taskType;
						return matchRole && matchTask;
					});

				if (matchedRoute?.fallback) {
					const fallbackConfig = router.resolveProvider(matchedRoute.fallback.provider);
					const fallbackModel = matchedRoute.fallback.model;
					const messages = req.body.messages ?? [];
					const systemPrompt = req.body.system;
					const maxTokens = req.body.max_tokens ?? 4096;

					let translatedBody: unknown;
					if (fallbackConfig.format === 'anthropic') {
						translatedBody = toAnthropicFormat(messages, systemPrompt, maxTokens, fallbackModel);
					} else {
						translatedBody = toOpenAIFormat(messages, systemPrompt, maxTokens, fallbackModel);
					}

					const headers: Record<string, string> = {
						'Content-Type': 'application/json',
					};

					if (fallbackConfig.apiKey) {
						if (fallbackConfig.format === 'anthropic') {
							headers['x-api-key'] = fallbackConfig.apiKey;
							headers['anthropic-version'] = '2023-06-01';
						} else {
							headers['Authorization'] = `Bearer ${fallbackConfig.apiKey}`;
						}
					}

					const endpoint = fallbackConfig.format === 'anthropic'
						? `${fallbackConfig.baseUrl}/v1/messages`
						: `${fallbackConfig.baseUrl}/v1/chat/completions`;

					const fallbackResponse = await fetch(endpoint, {
						method: 'POST',
						headers,
						body: JSON.stringify(translatedBody),
					});

					if (fallbackResponse.ok) {
						const responseBody = await fallbackResponse.json() as Record<string, unknown>;
						const unified = fallbackConfig.format === 'anthropic'
							? fromAnthropicResponse(responseBody)
							: fromOpenAIResponse(responseBody);

						const latencyMs = Date.now() - startTime;
						const cost = calculateCost(fallbackModel, unified.inputTokens, unified.outputTokens, unified.cachedTokens);

						metrics.record({
							id: randomUUID(),
							timestamp: Date.now(),
							provider: matchedRoute.fallback.provider,
							model: fallbackModel,
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
					}
				}
			} catch (fallbackErr) {
				console.error('Fallback also failed:', (fallbackErr as Error).message);
			}

			const latencyMs = Date.now() - startTime;
			metrics.record({
				id: randomUUID(),
				timestamp: Date.now(),
				provider: resolvedProvider! ?? 'unknown',
				model: resolvedModel! ?? 'unknown',
				agentRole: context.agentRole,
				taskType: context.taskType ?? '',
				taskId: context.taskId ?? '',
				inputTokens: 0,
				outputTokens: 0,
				cachedTokens: 0,
				latencyMs,
				cost: 0,
				success: false,
				error: error.message,
			});

			res.status(502).json({ error: error.message });
		}
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
			res.json({ status: 'reloaded' });
		} catch (err) {
			res.status(500).json({ error: (err as Error).message });
		}
	});

	return app;
}
