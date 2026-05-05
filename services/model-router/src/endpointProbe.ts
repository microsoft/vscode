// Copyright (c) Son-Of-Anton. All rights reserved.
// Licensed under the MIT License.

import type { FetchFn } from './providers/anthropic-oauth.js';

/** Probe configuration for a single provider. */
export interface ProviderProbeConfig {
	/** Logical key identifying the provider (e.g. `'anthropic'`). */
	readonly providerKey: string;
	/** Ordered candidate base URLs to probe.  First is the default. */
	readonly candidates: readonly string[];
	/** Path appended to each candidate when probing (e.g. `'/v1/models'`). */
	readonly probePath: string;
	/** HTTP headers to send with each probe request. */
	readonly probeHeaders?: Record<string, string>;
}

/** Latency measurement for one endpoint probe attempt. */
export interface ProbeResult {
	readonly url: string;
	readonly latencyMs: number;
	readonly ok: boolean;
	readonly probedAt: number;
}

/**
 * Probes provider endpoints on startup and every 30 minutes (§8.4).
 * Records per-URL latency and exposes the fastest available URL for each provider.
 */
export class EndpointProber {
	private readonly latestResults = new Map<string, ProbeResult[]>();
	private timer: ReturnType<typeof setInterval> | undefined;
	private readonly fetchFn: FetchFn;

	/** Interval between automated probe sweeps (ms). */
	static readonly PROBE_INTERVAL_MS = 30 * 60 * 1_000;

	constructor(
		private readonly configs: readonly ProviderProbeConfig[],
		options?: { fetchFn?: FetchFn; probeIntervalMs?: number },
	) {
		this.fetchFn = options?.fetchFn ?? (globalThis.fetch as FetchFn);
	}

	/**
	 * Probes all configured providers immediately and starts the periodic timer.
	 * Safe to call multiple times — subsequent calls restart the timer.
	 */
	async start(): Promise<void> {
		this.stop();
		await this.probeAll();
		const interval = EndpointProber.PROBE_INTERVAL_MS;
		this.timer = setInterval(() => { void this.probeAll(); }, interval);
	}

	/** Stops the periodic timer without closing connections. */
	stop(): void {
		if (this.timer !== undefined) {
			clearInterval(this.timer);
			this.timer = undefined;
		}
	}

	/**
	 * Returns the base URL with the lowest observed latency for `providerKey`.
	 * Falls back to the first candidate if no probes have succeeded.
	 */
	getBestEndpoint(providerKey: string): string {
		const config = this.configs.find(c => c.providerKey === providerKey);
		if (!config) {
			throw new Error(`Unknown provider key: ${providerKey}`);
		}

		const results = this.latestResults.get(providerKey);
		if (!results || results.length === 0) {
			return config.candidates[0];
		}

		const successful = results.filter(r => r.ok);
		if (successful.length === 0) {
			return config.candidates[0];
		}

		return successful.reduce((best, r) => r.latencyMs < best.latencyMs ? r : best).url;
	}

	/** Returns all probe results for inspection (e.g. exposing via /metrics). */
	getResults(): ReadonlyMap<string, readonly ProbeResult[]> {
		return this.latestResults;
	}

	/** Probes all configured providers in parallel. */
	async probeAll(): Promise<void> {
		await Promise.all(this.configs.map(c => this.probeProvider(c)));
	}

	private async probeProvider(config: ProviderProbeConfig): Promise<void> {
		const results = await Promise.all(
			config.candidates.map(candidate => this.probeOne(candidate, config)),
		);
		this.latestResults.set(config.providerKey, results);
	}

	private async probeOne(baseUrl: string, config: ProviderProbeConfig): Promise<ProbeResult> {
		const url = `${baseUrl}${config.probePath}`;
		const start = Date.now();
		try {
			const response = await this.fetchFn(url, {
				method: 'GET',
				headers: config.probeHeaders,
				signal: AbortSignal.timeout(5_000),
			});
			return {
				url: baseUrl,
				latencyMs: Date.now() - start,
				ok: response.status < 500,
				probedAt: start,
			};
		} catch {
			return {
				url: baseUrl,
				latencyMs: Date.now() - start,
				ok: false,
				probedAt: start,
			};
		}
	}
}
