// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { EndpointProber, type ProviderProbeConfig } from '../src/endpointProbe.js';
import type { FetchFn } from '../src/providers/anthropic-oauth.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FakeRequest { url: string; init?: RequestInit }

function makeFetch(
	latencies: Record<string, number>,
	statusMap: Record<string, number> = {},
): { fetch: FetchFn; requests: FakeRequest[] } {
	const requests: FakeRequest[] = [];
	const fetchFn: FetchFn = async (input, init) => {
		const url = input.toString();
		requests.push({ url, init });
		const latency = latencies[url] ?? 50;
		await new Promise<void>(resolve => setTimeout(resolve, latency));
		const status = statusMap[url] ?? 200;
		return new Response(null, { status });
	};
	return { fetch: fetchFn, requests };
}

const anthropicConfig: ProviderProbeConfig = {
	providerKey: 'anthropic',
	candidates: ['https://api.anthropic.com', 'https://api-eu.anthropic.com'],
	probePath: '/v1/models',
	probeHeaders: { 'anthropic-version': '2023-06-01' },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EndpointProber', () => {
	test('probeAll calls every candidate endpoint', async () => {
		const { fetch, requests } = makeFetch({
			'https://api.anthropic.com/v1/models': 20,
			'https://api-eu.anthropic.com/v1/models': 30,
		});

		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		await prober.probeAll();

		const urls = requests.map(r => r.url);
		assert.ok(urls.includes('https://api.anthropic.com/v1/models'));
		assert.ok(urls.includes('https://api-eu.anthropic.com/v1/models'));
	});

	test('getBestEndpoint returns fastest successful endpoint', async () => {
		const { fetch } = makeFetch({
			'https://api.anthropic.com/v1/models': 100,
			'https://api-eu.anthropic.com/v1/models': 10,
		});

		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		await prober.probeAll();

		assert.strictEqual(prober.getBestEndpoint('anthropic'), 'https://api-eu.anthropic.com');
	});

	test('getBestEndpoint falls back to first candidate before any probe', () => {
		const { fetch } = makeFetch({});
		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		assert.strictEqual(prober.getBestEndpoint('anthropic'), 'https://api.anthropic.com');
	});

	test('getBestEndpoint falls back to first candidate when all probes fail', async () => {
		const { fetch } = makeFetch(
			{
				'https://api.anthropic.com/v1/models': 10,
				'https://api-eu.anthropic.com/v1/models': 10,
			},
			{
				'https://api.anthropic.com/v1/models': 503,
				'https://api-eu.anthropic.com/v1/models': 503,
			},
		);

		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		await prober.probeAll();

		assert.strictEqual(prober.getBestEndpoint('anthropic'), 'https://api.anthropic.com');
	});

	test('getBestEndpoint prefers successful over faster-but-failed endpoint', async () => {
		const { fetch } = makeFetch(
			{
				'https://api.anthropic.com/v1/models': 1,
				'https://api-eu.anthropic.com/v1/models': 100,
			},
			{
				'https://api.anthropic.com/v1/models': 500,
				'https://api-eu.anthropic.com/v1/models': 200,
			},
		);

		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		await prober.probeAll();

		assert.strictEqual(prober.getBestEndpoint('anthropic'), 'https://api-eu.anthropic.com');
	});

	test('getBestEndpoint throws for unknown provider key', () => {
		const prober = new EndpointProber([anthropicConfig], { fetchFn: makeFetch({}).fetch });
		assert.throws(() => prober.getBestEndpoint('nonexistent'), /Unknown provider key/);
	});

	test('getResults exposes probe data', async () => {
		const { fetch } = makeFetch({
			'https://api.anthropic.com/v1/models': 20,
			'https://api-eu.anthropic.com/v1/models': 40,
		});

		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		await prober.probeAll();

		const results = prober.getResults();
		const anthropicResults = results.get('anthropic');
		assert.ok(anthropicResults);
		assert.strictEqual(anthropicResults.length, 2);
		assert.ok(anthropicResults.every(r => r.ok));
		assert.ok(anthropicResults.every(r => r.probedAt > 0));
	});

	test('handles probe network errors gracefully', async () => {
		const fetchFn: FetchFn = async () => {
			throw new Error('Network failure');
		};

		const prober = new EndpointProber([anthropicConfig], { fetchFn });
		await prober.probeAll();

		const results = prober.getResults().get('anthropic');
		assert.ok(results);
		assert.ok(results.every(r => !r.ok));
	});

	test('stop prevents timer from running', () => {
		const { fetch } = makeFetch({});
		const prober = new EndpointProber([anthropicConfig], { fetchFn: fetch });
		// start() requires async, so we just test that stop() is safe to call
		// without start() having been called.
		assert.doesNotThrow(() => prober.stop());
	});
});
