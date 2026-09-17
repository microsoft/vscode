/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir } from 'fs/promises';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { dirname, join } from '../../../../base/common/path.js';
import type { TelemetryConfig } from '@github/copilot-sdk';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
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
import { GenAiAttr } from '../../../otel/common/genAiAttributes.js';
import { ICompletedSpanData, SpanStatusCode } from '../../../otel/common/spanData.js';
import { OTelSqliteStore } from '../../../otel/node/sqlite/otelSqliteStore.js';
import { AgentHostOTelSpansDbSubPath } from '../../common/agentService.js';
import { AgentHostOTelServiceName, AgentHostOTelServiceNamespace, AgentHostSessionSpanName, AgentHostSessionTitleAttribute, AgentHostSessionTitleSpanName, AgentHostSessionUriAttribute, IAgentHostNativeOTelConfig, IAgentHostOTelService, IAgentHostTraceContext } from '../../common/otel/agentHostOTelService.js';

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
	/** Effective OTLP protocol configured for the SDK runtime. */
	readonly otlpProtocol: string;
	/** Resource attributes applied to host-produced metadata spans. */
	readonly resourceAttributes: Record<string, string>;
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
		const rawKey = pair.slice(0, eq).trim();
		const rawValue = pair.slice(eq + 1).trim();
		if (rawKey) {
			try {
				out[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
			} catch {
				out[rawKey] = rawValue;
			}
		}
	}
	return Object.keys(out).length ? out : undefined;
}

function parseResourceAttributes(raw: string | undefined, serviceName: string | undefined): Record<string, string> {
	const attributes: Record<string, string> = {};
	for (const pair of raw?.split(',') ?? []) {
		const eq = pair.indexOf('=');
		if (eq <= 0) {
			continue;
		}
		const key = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (key) {
			try {
				attributes[key] = decodeURIComponent(value);
			} catch {
				attributes[key] = value;
			}
		}
	}
	attributes['service.namespace'] = AgentHostOTelServiceNamespace;
	attributes['service.name'] = serviceName ?? attributes['service.name'] ?? AgentHostOTelServiceName;
	return attributes;
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
		otlpProtocol: protocol,
		resourceAttributes: parseResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES, env.OTEL_SERVICE_NAME),
	};
}

interface IOtlpAttribute {
	key?: string;
	value?: { stringValue?: string };
}

interface IOtlpSpan {
	name?: string;
	attributes?: IOtlpAttribute[];
}

interface IOtlpScopeSpans {
	spans?: IOtlpSpan[];
}

interface IOtlpResourceSpans {
	resource?: { attributes?: IOtlpAttribute[] };
	scopeSpans?: IOtlpScopeSpans[];
}

interface IOtlpTracePayload {
	resourceSpans?: IOtlpResourceSpans[];
}

export interface INormalizedAgentHostOtlpBody {
	readonly body: Buffer;
	readonly filteredSpanCount: number;
}

const CodexAuthPollingServiceName = 'codex-app-server';
const CodexAuthPollingSpanName = 'auth';
const CodexAuthPollingModuleName = 'codex_login::auth::manager';

function attributeValue(attributes: readonly IOtlpAttribute[] | undefined, key: string): string | undefined {
	return attributes?.find(attribute => attribute.key === key)?.value?.stringValue;
}

function upsertResourceAttribute(attributes: IOtlpAttribute[], key: string, value: string): void {
	const existing = attributes.find(attribute => attribute.key === key);
	if (existing) {
		existing.value = { stringValue: value };
	} else {
		attributes.push({ key, value: { stringValue: value } });
	}
}

/** Normalize Agent Host resource identity and suppress the Codex 0.142 auth polling span. */
export function normalizeAgentHostOtlpBody(body: Buffer): INormalizedAgentHostOtlpBody {
	const payload = JSON.parse(body.toString('utf8')) as IOtlpTracePayload;
	let filteredSpanCount = 0;
	for (const resourceSpan of payload.resourceSpans ?? []) {
		const resource = resourceSpan.resource ??= {};
		const resourceAttributes = resource.attributes ??= [];
		const isCodex = attributeValue(resourceAttributes, 'service.name') === CodexAuthPollingServiceName;
		upsertResourceAttribute(resourceAttributes, 'service.namespace', AgentHostOTelServiceNamespace);
		for (const scopeSpans of resourceSpan.scopeSpans ?? []) {
			const spans = scopeSpans.spans ?? [];
			scopeSpans.spans = spans.filter(span => {
				const shouldFilter = isCodex
					&& span.name === CodexAuthPollingSpanName
					&& attributeValue(span.attributes, 'code.module.name') === CodexAuthPollingModuleName;
				if (shouldFilter) {
					filteredSpanCount++;
				}
				return !shouldFilter;
			});
		}
	}
	return { body: Buffer.from(JSON.stringify(payload)), filteredSpanCount };
}

export class AgentHostOTelService extends Disposable implements IAgentHostOTelService {

	declare readonly _serviceBrand: undefined;

	private readonly _config: ResolvedConfig;
	private readonly _spansDbPath: string;

	private _receiver: ILocalOtlpHttpReceiver | undefined;
	private _spanStore: OTelSqliteStore | undefined;
	private _forwarder: IOutboundForwarder | undefined;
	private _startPromise: Promise<void> | undefined;
	private _metadataExportQueue = Promise.resolve();
	private readonly _sessionContexts = new Map<string, IAgentHostTraceContext>();
	private _currentTraceContext: IAgentHostTraceContext | undefined;
	private _pendingFilteredCodexAuthSpans = 0;
	private _totalFilteredCodexAuthSpans = 0;
	private readonly _filteredSpanLogScheduler: RunOnceScheduler;

	constructor(
		private readonly _fetchFn: typeof globalThis.fetch | undefined,
		@ILogService private readonly _logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
	) {
		super();
		this._filteredSpanLogScheduler = this._register(new RunOnceScheduler(() => this._logFilteredCodexAuthSpans(), 60_000));
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

	async getNativeSdkTelemetryConfig(): Promise<IAgentHostNativeOTelConfig | undefined> {
		if (!this._config.enabled) {
			return undefined;
		}
		const protocol = this._config.otlpProtocol === 'grpc' || this._config.otlpProtocol === 'http/grpc'
			? 'grpc'
			: this._config.otlpProtocol === 'http/protobuf' ? 'http/protobuf' : 'http/json';
		const external = this._config.otlpEndpoint ? {
			endpoint: this._config.otlpEndpoint,
			protocol,
			...(this._config.headers ? { headers: this._config.headers } : {}),
		} as const : undefined;
		const resourceAttributes = { ...this._config.resourceAttributes };
		delete resourceAttributes['service.name'];
		resourceAttributes['service.namespace'] = AgentHostOTelServiceNamespace;
		if (!this._config.dbSpanExporter) {
			return { traces: external, external, captureContent: this._config.captureContent === true, resourceAttributes };
		}
		await this._ensureStarted();
		return {
			traces: this._receiver ? { endpoint: `${this._receiver.baseUrl}/v1/traces`, protocol: 'http/json' } : external,
			external,
			captureContent: this._config.captureContent === true,
			resourceAttributes,
		};
	}

	getSessionTraceContext(conversationId: string, sessionUri: string): IAgentHostTraceContext | undefined {
		if (!this._config.enabled || !conversationId || !sessionUri || (!this._config.dbSpanExporter && !this._canForwardSyntheticSpan())) {
			return undefined;
		}
		const existing = this._sessionContexts.get(sessionUri);
		if (existing) {
			return existing;
		}
		const traceId = generateUuid().replaceAll('-', '');
		const spanId = generateUuid().replaceAll('-', '').slice(0, 16);
		const context: IAgentHostTraceContext = { traceId, spanId, traceparent: `00-${traceId}-${spanId}-01` };
		this._sessionContexts.set(sessionUri, context);
		const now = Date.now();
		this._queueSyntheticSpan({
			name: AgentHostSessionSpanName,
			traceId,
			spanId,
			startTime: now,
			endTime: now,
			status: { code: SpanStatusCode.OK },
			attributes: {
				...this._config.resourceAttributes,
				[GenAiAttr.CONVERSATION_ID]: conversationId,
				[AgentHostSessionUriAttribute]: sessionUri,
			},
			events: [],
		});
		return context;
	}

	releaseSessionTraceContext(sessionUri: string): void {
		this._sessionContexts.delete(sessionUri);
	}

	withTraceContext<T>(context: IAgentHostTraceContext | undefined, fn: () => T): T {
		const previous = this._currentTraceContext;
		this._currentTraceContext = context;
		try {
			// Provider SDKs read their callback-based trace carrier synchronously
			// while constructing the RPC promise. Do not retain context for the
			// lifetime of that promise: concurrent turns must not inherit it.
			return fn();
		} finally {
			this._currentTraceContext = previous;
		}
	}

	getCurrentTraceContext(): IAgentHostTraceContext | undefined {
		return this._currentTraceContext;
	}

	getSpansDbPath(): URI | undefined {
		return this._config.dbSpanExporter ? URI.file(this._spansDbPath) : undefined;
	}

	emitSessionTitleChanged(conversationId: string, sessionUri: string, title: string): void {
		if (!this._config.enabled || this._config.captureContent !== true || !conversationId || !title) {
			return;
		}
		if (!this._config.dbSpanExporter && !this._canForwardSyntheticSpan()) {
			return;
		}

		const boundedTitle = title.slice(0, 200);
		const context = this.getSessionTraceContext(conversationId, sessionUri);
		const now = Date.now();
		this._queueSyntheticSpan({
			name: AgentHostSessionTitleSpanName,
			traceId: context?.traceId ?? generateUuid().replaceAll('-', ''),
			spanId: generateUuid().replaceAll('-', '').slice(0, 16),
			parentSpanId: context?.spanId,
			startTime: now,
			endTime: now,
			status: { code: SpanStatusCode.OK },
			attributes: {
				...this._config.resourceAttributes,
				[GenAiAttr.CONVERSATION_ID]: conversationId,
				[AgentHostSessionTitleAttribute]: boundedTitle,
				[AgentHostSessionUriAttribute]: sessionUri,
			},
			events: [],
		});
	}

	async flush(): Promise<void> {
		this._filteredSpanLogScheduler.flush();
		await this._metadataExportQueue;
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
		this._spanStore = store;
		this._register(toDisposable(() => {
			store.close();
			this._spanStore = undefined;
		}));

		// 2. Optional outbound forwarder when the user *also* wants an external sink.
		this._forwarder = this._buildOutboundForwarder();

		// 3. Loopback OTLP/HTTP receiver.
		const receiver = await startLocalOtlpHttpReceiver(
			{
				transformBody: body => {
					const normalized = normalizeAgentHostOtlpBody(body);
					this._recordFilteredCodexAuthSpans(normalized.filteredSpanCount);
					return normalized.body;
				},
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

	private _queueSyntheticSpan(span: ICompletedSpanData): void {
		this._metadataExportQueue = this._metadataExportQueue
			.then(() => this._emitSyntheticSpan(span))
			.catch(err => this._logService.warn('[agentHost.otel] failed to emit metadata span', err));
	}

	private async _emitSyntheticSpan(span: ICompletedSpanData): Promise<void> {
		if (this._config.dbSpanExporter) {
			await this._ensureStarted();
		} else if (!this._forwarder) {
			this._forwarder = this._buildOutboundForwarder();
			if (this._forwarder) {
				this._register(this._forwarder);
			}
		}

		try {
			this._spanStore?.insertSpan(span);
		} catch (err) {
			this._logService.warn('[agentHost.otel] failed to persist session title span', err);
		}
		const result = { spans: [span], rejected: 0, errors: [] };
		this._forwarder?.forwardSpans?.(result);
		if (this._canForwardSyntheticSpan()) {
			this._forwarder?.forwardRaw?.(this._encodeOtlpSpan(span), 'application/json');
		}
	}

	private _recordFilteredCodexAuthSpans(count: number): void {
		if (count <= 0) {
			return;
		}
		this._pendingFilteredCodexAuthSpans = Math.min(Number.MAX_SAFE_INTEGER, this._pendingFilteredCodexAuthSpans + count);
		this._totalFilteredCodexAuthSpans = Math.min(Number.MAX_SAFE_INTEGER, this._totalFilteredCodexAuthSpans + count);
		if (!this._filteredSpanLogScheduler.isScheduled()) {
			this._filteredSpanLogScheduler.schedule();
		}
	}

	private _logFilteredCodexAuthSpans(): void {
		if (this._pendingFilteredCodexAuthSpans === 0) {
			return;
		}
		this._logService.info(`[agentHost.otel] filtered ${this._pendingFilteredCodexAuthSpans} Codex 0.142 auth polling span(s); total=${this._totalFilteredCodexAuthSpans}`);
		this._pendingFilteredCodexAuthSpans = 0;
	}

	private _canForwardSyntheticSpan(): boolean {
		return this._config.exporterType === 'file'
			|| this._config.exporterType === 'console'
			|| (this._config.exporterType === 'otlp-http' && this._config.otlpProtocol !== 'http/protobuf');
	}

	private _encodeOtlpSpan(span: ICompletedSpanData): Buffer {
		const resourceAttributeKeys = new Set(Object.keys(this._config.resourceAttributes));
		const attributes = Object.entries(span.attributes)
			.filter(([key]) => !resourceAttributeKeys.has(key) || key === GenAiAttr.CONVERSATION_ID || key.startsWith('vscode.agent_host.'))
			.map(([key, value]) => ({
				key,
				value: typeof value === 'string' ? { stringValue: value }
					: typeof value === 'number' ? { doubleValue: value }
						: typeof value === 'boolean' ? { boolValue: value }
							: { arrayValue: { values: value.map(item => ({ stringValue: item })) } },
			}));
		const resourceAttributes = Object.entries(this._config.resourceAttributes).map(([key, value]) => ({ key, value: { stringValue: value } }));
		return Buffer.from(JSON.stringify({
			resourceSpans: [{
				...(resourceAttributes.length ? { resource: { attributes: resourceAttributes } } : {}),
				scopeSpans: [{
					scope: { name: this._config.sourceName ?? 'vscode.agent-host' },
					spans: [{
						traceId: span.traceId,
						spanId: span.spanId,
						...(span.parentSpanId ? { parentSpanId: span.parentSpanId } : {}),
						name: span.name,
						kind: 1,
						startTimeUnixNano: `${span.startTime}000000`,
						endTimeUnixNano: `${span.endTime}000000`,
						attributes,
						status: { code: 1 },
					}],
				}],
			}],
		}), 'utf8');
	}

	private _buildOutboundForwarder(): IOutboundForwarder | undefined {
		const children: IOutboundForwarder[] = [];
		switch (this._config.exporterType) {
			case 'otlp-http':
				if (this._config.otlpEndpoint && this._config.otlpProtocol !== 'http/protobuf') {
					children.push(new OtlpHttpForwarder(
						{
							endpoint: this._config.otlpEndpoint,
							headers: this._config.headers,
						},
						this._logService,
						this._fetchFn,
					));
				} else if (this._config.otlpEndpoint) {
					this._logService.warn('[agentHost.otel] DB trace fan-out is unavailable for OTLP/HTTP protobuf; traces remain in the local DB while provider logs and metrics export directly');
				}
				break;
			case 'otlp-grpc':
				if (this._config.otlpEndpoint) {
					this._logService.warn('[agentHost.otel] DB trace fan-out is unavailable for OTLP/gRPC; traces remain in the local DB while provider logs and metrics export directly');
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
