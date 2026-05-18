/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import type * as https from 'https';
import { Queue } from '../../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URL } from 'url';
import { promises as fs } from 'fs';
import { ILogService } from '../../../log/common/log.js';
import { ICompletedSpanData } from '../../common/spanData.js';
import { IDecodeResult } from './otlpJsonDecode.js';

/**
 * Fan-out target for span data the loopback receiver collects. Each
 * implementation isolates failures so that the receiver's response to the SDK
 * is never blocked by an upstream problem.
 */
export interface IOutboundForwarder {
	/** Forward raw OTLP/HTTP request bytes unchanged (for OTLP exporters). */
	forwardRaw?(body: Buffer, contentType: string): void;
	/** Forward decoded spans (for console / file / structured sinks). */
	forwardSpans?(result: IDecodeResult): void;
	/**
	 * Drain any in-flight work. Best-effort; never throws. Callers should
	 * await this on shutdown so file/network writes have a chance to complete.
	 */
	flush(): Promise<void>;
	dispose(): void;
}

// ---------------------------------------------------------------------------
// OTLP/HTTP forwarder: re-POST the raw body to a remote OTLP collector.
// ---------------------------------------------------------------------------

export interface IOtlpHttpForwarderOptions {
	/**
	 * Target URL. May be either:
	 *
	 *  - A full signal-specific URL (`http://host:4318/v1/traces`) — used verbatim.
	 *  - A bare base URL (`http://host:4318` or `http://host:4318/`) — `/v1/traces`
	 *    is auto-appended, matching the `OTEL_EXPORTER_OTLP_ENDPOINT` convention
	 *    used by OTLP exporters in the official OpenTelemetry SDKs.
	 */
	readonly endpoint: string;
	/** Extra headers (e.g. authorization). */
	readonly headers?: Readonly<Record<string, string>>;
	/** Per-request timeout in ms. Defaults to 10s. */
	readonly timeoutMs?: number;
}

/**
 * Resolve an OTLP/HTTP traces endpoint, matching the path-handling rules used
 * by the OpenTelemetry SDKs: a bare base URL (no path or just `/`) gets
 * `/v1/traces` appended; any other path is used verbatim.
 *
 * Returns the input string when it cannot be parsed as a URL so the caller's
 * error path remains in charge.
 */
export function resolveOtlpTracesEndpoint(endpoint: string): string {
	try {
		const url = new URL(endpoint);
		if (url.pathname === '' || url.pathname === '/') {
			url.pathname = '/v1/traces';
			return url.toString();
		}
		return endpoint;
	} catch {
		return endpoint;
	}
}

/**
 * Forwards raw OTLP/HTTP request bytes to a user-configured remote endpoint.
 *
 * Re-POSTs the exact body and content-type the SDK sent, preserving wire-format
 * fidelity. This is the same passthrough pattern the OpenTelemetry Collector's
 * `otlphttpexporter` uses internally.
 */
export class OtlpHttpForwarder extends Disposable implements IOutboundForwarder {
	private readonly _queue = new Queue<void>();
	private _disposed = false;
	private readonly _resolvedEndpoint: string;

	constructor(
		private readonly _options: IOtlpHttpForwarderOptions,
		private readonly _logService: ILogService,
	) {
		super();
		this._resolvedEndpoint = resolveOtlpTracesEndpoint(_options.endpoint);
		this._register(toDisposable(() => { this._disposed = true; }));
	}

	forwardRaw(body: Buffer, contentType: string): void {
		if (this._disposed) {
			return;
		}
		void this._queue.queue(() => this._sendOnce(body, contentType));
	}

	async flush(): Promise<void> {
		try {
			await this._queue.queue(() => Promise.resolve());
		} catch { /* never throws */ }
	}

	private async _sendOnce(body: Buffer, contentType: string): Promise<void> {
		try {
			const url = new URL(this._resolvedEndpoint);
			const isHttps = url.protocol === 'https:';
			const mod = isHttps ? await import('https') : await import('http');
			const headers: Record<string, string> = {
				'content-type': contentType,
				'content-length': String(body.length),
				...(this._options.headers ?? {}),
			};
			await postOnce(mod, {
				host: url.hostname,
				port: url.port ? Number(url.port) : (isHttps ? 443 : 80),
				path: url.pathname + (url.search ?? ''),
				method: 'POST',
				headers,
				timeoutMs: this._options.timeoutMs ?? 10_000,
			}, body);
		} catch (err) {
			this._logService.warn(`[agentHost-otel] forward to ${this._resolvedEndpoint} failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

interface IPostOptions {
	readonly host: string;
	readonly port: number;
	readonly path: string;
	readonly method: 'POST';
	readonly headers: Record<string, string>;
	readonly timeoutMs: number;
}

function postOnce(mod: typeof http | typeof https, options: IPostOptions, body: Buffer): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const req = mod.request({
			host: options.host,
			port: options.port,
			path: options.path,
			method: options.method,
			headers: options.headers,
			timeout: options.timeoutMs,
		});
		const onError = (err: Error) => { req.destroy(); reject(err); };
		req.on('error', onError);
		req.on('timeout', () => onError(new Error(`request timeout after ${options.timeoutMs}ms`)));
		req.on('response', res => {
			// Drain the body so the connection can be reused.
			res.resume();
			res.on('end', () => {
				const status = res.statusCode ?? 0;
				if (status >= 200 && status < 300) {
					resolve();
				} else {
					reject(new Error(`upstream returned HTTP ${status}`));
				}
			});
			res.on('error', onError);
		});
		req.end(body);
	});
}

// ---------------------------------------------------------------------------
// File forwarder: append decoded spans as JSON-lines to a user-configured path.
// ---------------------------------------------------------------------------

export interface IFileForwarderOptions {
	readonly filePath: string;
}

/**
 * Appends decoded spans (one JSON object per line) to a user-configured file.
 * Mirrors the `github.copilot.chat.otel.outfile` behavior so users can collect
 * Agent Host traces with the same offline-friendly format.
 */
export class FileForwarder extends Disposable implements IOutboundForwarder {
	private readonly _queue = new Queue<void>();
	private _disposed = false;

	constructor(
		private readonly _options: IFileForwarderOptions,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => { this._disposed = true; }));
	}

	forwardSpans(result: IDecodeResult): void {
		if (this._disposed || result.spans.length === 0) {
			return;
		}
		const lines = result.spans.map(s => JSON.stringify(s)).join('\n') + '\n';
		void this._queue.queue(() => this._append(lines));
	}

	async flush(): Promise<void> {
		try {
			await this._queue.queue(() => Promise.resolve());
		} catch { /* never throws */ }
	}

	private async _append(lines: string): Promise<void> {
		try {
			await fs.appendFile(this._options.filePath, lines, { encoding: 'utf8' });
		} catch (err) {
			this._logService.warn(`[agentHost-otel] file forward to ${this._options.filePath} failed: ${err instanceof Error ? err.message : String(err)}`);
		}
	}
}

// ---------------------------------------------------------------------------
// Console forwarder: log a one-line summary per span to the log service.
// ---------------------------------------------------------------------------

/**
 * Pretty-prints one line per span to the log service. Intended for quick
 * debugging — not a structured sink.
 */
export class ConsoleForwarder extends Disposable implements IOutboundForwarder {
	private _disposed = false;

	constructor(private readonly _logService: ILogService) {
		super();
		this._register(toDisposable(() => { this._disposed = true; }));
	}

	forwardSpans(result: IDecodeResult): void {
		if (this._disposed) {
			return;
		}
		for (const span of result.spans) {
			this._logService.info(`[agentHost-otel] span ${formatSpan(span)}`);
		}
	}

	async flush(): Promise<void> {
		// Console writes are synchronous-enough; nothing to drain.
	}
}

function formatSpan(s: ICompletedSpanData): string {
	const duration = Math.max(0, s.endTime - s.startTime);
	const op = s.attributes['gen_ai.operation.name'];
	const model = s.attributes['gen_ai.request.model'] ?? s.attributes['gen_ai.response.model'];
	const tail = [op && `op=${op}`, model && `model=${model}`].filter(Boolean).join(' ');
	return `${s.name} (${duration}ms) trace=${s.traceId} span=${s.spanId}${tail ? ' ' + tail : ''}`;
}

// ---------------------------------------------------------------------------
// Composite: fan out to N forwarders.
// ---------------------------------------------------------------------------

/** Aggregates several forwarders behind a single `IOutboundForwarder` surface. */
export class CompositeForwarder extends Disposable implements IOutboundForwarder {
	private readonly _children: readonly IOutboundForwarder[];

	constructor(children: readonly IOutboundForwarder[]) {
		super();
		this._children = children;
		for (const c of children) {
			this._register(c);
		}
	}

	forwardRaw(body: Buffer, contentType: string): void {
		for (const c of this._children) {
			c.forwardRaw?.(body, contentType);
		}
	}

	forwardSpans(result: IDecodeResult): void {
		for (const c of this._children) {
			c.forwardSpans?.(result);
		}
	}

	async flush(): Promise<void> {
		await Promise.all(this._children.map(c => c.flush()));
	}
}
