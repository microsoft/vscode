/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir } from 'fs/promises';
import { dirname, join } from '../../../../base/common/path.js';
import type { TelemetryConfig } from '@github/copilot-sdk';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ILogService } from '../../../log/common/log.js';
import { startLocalOtlpHttpReceiver, type ILocalOtlpHttpReceiver } from '../../../otel/node/otlp/localOtlpReceiver.js';
import {
	CompositeForwarder,
	ConsoleForwarder,
	FileForwarder,
	OtlpHttpForwarder,
	type IOutboundForwarder,
} from '../../../otel/node/otlp/outboundForwarder.js';
import { OTelSqliteStore } from '../../../otel/node/sqlite/otelSqliteStore.js';
import { AgentHostOTelSpansDbSubPath } from '../../common/agentService.js';
import { IAgentHostOTelService } from '../../common/otel/agentHostOTelService.js';

/** Sub-path under the user data directory where the span DB lives. */
const SPANS_DB_SUBPATH = AgentHostOTelSpansDbSubPath;

/**
 * Effective OTel configuration resolved from `process.env`. Settings → env conversion
 * happens in the workbench-side agent-host starter (see `nodeAgentHostStarter.ts`);
 * this service only consumes env so it can stay decoupled from configuration plumbing.
 */
interface ResolvedConfig {
	/** Telemetry enabled at all? */
	readonly enabled: boolean;
	/** DB mode (loopback + SQLite) requested? */
	readonly dbSpanExporter: boolean;
	/** Pass-through exporter type. */
	readonly exporterType: 'otlp-http' | 'otlp-grpc' | 'console' | 'file';
	/** Pass-through OTLP endpoint. */
	readonly otlpEndpoint: string | undefined;
	/** Pass-through file path (file exporter). */
	readonly filePath: string | undefined;
	/** Instrumentation source/service name. */
	readonly sourceName: string | undefined;
	/** Capture prompt/response content in spans. */
	readonly captureContent: boolean | undefined;
	/** Parsed OTEL_EXPORTER_OTLP_HEADERS for outbound forwarding. */
	readonly headers: Record<string, string> | undefined;
}

function isTruthy(v: string | undefined): boolean {
	if (!v) {
		return false;
	}
	const s = v.trim().toLowerCase();
	return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function parseOtlpHeaders(raw: string | undefined): Record<string, string> | undefined {
	if (!raw) {
		return undefined;
	}
	const out: Record<string, string> = {};
	for (const pair of raw.split(',')) {
		const eq = pair.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		const key = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (key) {
			out[key] = value;
		}
	}
	return Object.keys(out).length ? out : undefined;
}

export function readAgentHostOTelEnv(env: NodeJS.ProcessEnv): ResolvedConfig {
	const dbSpanExporter = isTruthy(env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED);
	const otlpEndpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT ?? env.COPILOT_OTEL_ENDPOINT;
	const filePath = env.COPILOT_OTEL_FILE_EXPORTER_PATH;
	const explicitlyEnabled = isTruthy(env.COPILOT_OTEL_ENABLED);
	const enabled = explicitlyEnabled || dbSpanExporter || !!otlpEndpoint || !!filePath;

	// Map the OTLP protocol env var onto our four user-visible exporter types.
	const rawType = (env.COPILOT_OTEL_EXPORTER_TYPE ?? '').trim().toLowerCase();
	const protocol = (env.OTEL_EXPORTER_OTLP_PROTOCOL ?? env.COPILOT_OTEL_PROTOCOL ?? '').trim().toLowerCase();
	let exporterType: ResolvedConfig['exporterType'] = 'otlp-http';
	if (rawType === 'console' || rawType === 'file' || rawType === 'otlp-grpc' || rawType === 'otlp-http') {
		exporterType = rawType;
	} else if (filePath) {
		exporterType = 'file';
	}
	if (protocol === 'grpc' || protocol === 'http/grpc') {
		exporterType = 'otlp-grpc';
	}

	return {
		enabled,
		dbSpanExporter,
		exporterType,
		otlpEndpoint,
		filePath,
		sourceName: env.COPILOT_OTEL_SOURCE_NAME,
		captureContent: env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT === undefined
			? undefined
			: isTruthy(env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT),
		headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_HEADERS),
	};
}

export class AgentHostOTelService extends Disposable implements IAgentHostOTelService {

	declare readonly _serviceBrand: undefined;

	private readonly _config: ResolvedConfig;
	private readonly _spansDbPath: string;

	private _receiver: ILocalOtlpHttpReceiver | undefined;
	private _forwarder: IOutboundForwarder | undefined;
	private _startPromise: Promise<void> | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
	) {
		super();
		this._config = readAgentHostOTelEnv(process.env);
		this._spansDbPath = join(environmentService.userDataPath, SPANS_DB_SUBPATH);
	}

	async getSdkTelemetryConfig(): Promise<TelemetryConfig | undefined> {
		if (!this._config.enabled) {
			return undefined;
		}

		if (this._config.dbSpanExporter) {
			await this._ensureStarted();
			if (!this._receiver) {
				// Start failed; we already logged. Fall through to pass-through if
				// the user also has an external endpoint configured.
				if (!this._config.otlpEndpoint && this._config.exporterType !== 'console' && !this._config.filePath) {
					return undefined;
				}
			} else {
				return this._buildLoopbackConfig();
			}
		}

		return this._buildPassthroughConfig();
	}

	getSpansDbPath(): URI | undefined {
		return this._config.dbSpanExporter ? URI.file(this._spansDbPath) : undefined;
	}

	async flush(): Promise<void> {
		await this._startPromise;
		if (this._forwarder) {
			await this._forwarder.flush();
		}
	}

	private _buildLoopbackConfig(): TelemetryConfig {
		// In DB mode we always point the SDK at our loopback OTLP/HTTP endpoint
		// regardless of what the user configured externally — the user's external
		// sink is fed by our outbound forwarder instead. This guarantees we get a
		// SQLite mirror of every span the agent emits.
		return {
			exporterType: 'otlp-http',
			otlpEndpoint: this._receiver!.baseUrl,
			sourceName: this._config.sourceName,
			captureContent: this._config.captureContent,
		};
	}

	private _buildPassthroughConfig(): TelemetryConfig {
		return {
			exporterType: this._config.exporterType,
			otlpEndpoint: this._config.otlpEndpoint,
			filePath: this._config.filePath,
			sourceName: this._config.sourceName,
			captureContent: this._config.captureContent,
		};
	}

	private _ensureStarted(): Promise<void> {
		if (!this._startPromise) {
			this._startPromise = this._start().catch(err => {
				this._logService.error('[agentHost.otel] failed to start loopback OTel pipeline', err);
				// Drop the receiver/store/forwarder so getSdkTelemetryConfig falls back
				// to pass-through (or undefined) on subsequent calls.
				this._receiver = undefined;
				this._forwarder = undefined;
			});
		}
		return this._startPromise;
	}

	private async _start(): Promise<void> {
		// 1. Persistent SQLite store.
		await mkdir(dirname(this._spansDbPath), { recursive: true });
		const store = new OTelSqliteStore(this._spansDbPath);
		this._register(toDisposable(() => store.close()));

		// 2. Optional outbound forwarder when the user *also* wants an external sink.
		this._forwarder = this._buildOutboundForwarder();

		// 3. Loopback OTLP/HTTP receiver.
		const receiver = await startLocalOtlpHttpReceiver(
			{
				onSpans: result => {
					for (const span of result.spans) {
						try {
							store.insertSpan(span);
						} catch (err) {
							this._logService.warn('[agentHost.otel] failed to insert span', err);
						}
					}
					// Also feed decoded spans to forwarders that consume IDecodeResult
					// (FileForwarder / ConsoleForwarder). OTLP-style forwarders consume
					// the raw body via onForward below.
					this._forwarder?.forwardSpans?.(result);
				},
				onForward: this._forwarder ? (body, contentType) => {
					this._forwarder!.forwardRaw?.(body, contentType);
				} : undefined,
			},
			this._logService,
		);
		this._receiver = receiver;
		this._register(receiver);
		if (this._forwarder) {
			this._register(this._forwarder);
		}

		this._logService.info(`[agentHost.otel] loopback receiver at ${receiver.baseUrl}, db ${this._spansDbPath}`);
	}

	private _buildOutboundForwarder(): IOutboundForwarder | undefined {
		const children: IOutboundForwarder[] = [];
		switch (this._config.exporterType) {
			case 'otlp-http':
			case 'otlp-grpc':
				if (this._config.otlpEndpoint) {
					children.push(new OtlpHttpForwarder(
						{
							endpoint: this._config.otlpEndpoint,
							headers: this._config.headers,
						},
						this._logService,
					));
				}
				break;
			case 'file':
				if (this._config.filePath) {
					children.push(new FileForwarder({ filePath: this._config.filePath }, this._logService));
				}
				break;
			case 'console':
				children.push(new ConsoleForwarder(this._logService));
				break;
		}
		if (!children.length) {
			return undefined;
		}
		return children.length === 1 ? children[0] : new CompositeForwarder(children);
	}
}
