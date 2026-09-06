/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type OTelExporterType = 'otlp-grpc' | 'otlp-http' | 'console' | 'file';

export type OTelEnabledVia = 'policy' | 'envVar' | 'setting' | 'otlpEndpointEnvVar' | 'dbSpanExporterOnly' | 'disabled';

/** Default OTLP endpoint used when no env var or setting overrides it. */
export const DEFAULT_OTLP_ENDPOINT = 'http://localhost:4318';

export interface OTelConfig {
	readonly enabled: boolean;
	/** True when OTel was enabled via setting/env var, not just implied by dbSpanExporter. */
	readonly enabledExplicitly: boolean;
	/** How OTel was enabled — used for telemetry to track adoption channels. */
	readonly enabledVia: OTelEnabledVia;
	readonly exporterType: OTelExporterType;
	readonly otlpEndpoint: string;
	readonly otlpProtocol: 'grpc' | 'http/json' | 'http/protobuf';
	readonly captureContent: boolean;
	/**
	 * Maximum size (in characters) for free-form content attributes (prompts,
	 * tool args, etc.). A value of `0` disables truncation entirely (the
	 * default), matching the OTel spec's `AttributeValueLengthLimit` default of
	 * `Infinity`. Set to a positive value when targeting backends that cap
	 * per-attribute size to keep OTLP batches under the backend limit; consult
	 * the backend's documentation for the appropriate value.
	 */
	readonly maxAttributeSizeChars: number;
	readonly fileExporterPath?: string;
	readonly dbSpanExporter: boolean;
	readonly logLevel: 'trace' | 'debug' | 'info' | 'warn' | 'error';
	readonly httpInstrumentation: boolean;
	readonly serviceName: string;
	readonly serviceVersion: string;
	readonly sessionId: string;
	readonly resourceAttributes: Record<string, string>;
	/**
	 * Extra OTLP request headers (e.g. auth tokens) applied directly to the exporter. Carried
	 * out-of-band from process env so secrets never leak into spawned tool subprocesses.
	 */
	readonly headers: Record<string, string>;
}

/**
 * Parse `OTEL_RESOURCE_ATTRIBUTES` format: "key1=val1,key2=val2"
 */
function parseResourceAttributes(raw: string | undefined): Record<string, string> {
	if (!raw) {
		return {};
	}
	const result: Record<string, string> = {};
	for (const pair of raw.split(',')) {
		const eqIdx = pair.indexOf('=');
		if (eqIdx > 0) {
			const key = pair.substring(0, eqIdx).trim();
			const value = pair.substring(eqIdx + 1).trim();
			if (key) {
				result[key] = value;
			}
		}
	}
	return result;
}

/**
 * Parse and validate an OTLP endpoint URL.
 * For gRPC: returns origin (scheme://host:port).
 * For HTTP: returns full href.
 */
function parseOtlpEndpoint(raw: string | undefined, protocol: 'grpc' | 'http'): string | undefined {
	if (!raw) {
		return undefined;
	}
	const trimmed = raw.replace(/^["']|["']$/g, '');
	try {
		const url = new URL(trimmed);
		return protocol === 'grpc' ? url.origin : url.href;
	} catch {
		return undefined;
	}
}

export interface OTelConfigInput {
	env: Record<string, string | undefined>;
	settingEnabled?: boolean;
	settingExporterType?: OTelExporterType;
	settingOtlpEndpoint?: string;
	settingCaptureContent?: boolean;
	settingMaxAttributeSizeChars?: number;
	settingOutfile?: string;
	settingDbSpanExporter?: boolean;
	/** OTLP wire protocol mirroring `OTEL_EXPORTER_OTLP_PROTOCOL` (`http/json`, `http/protobuf`, `grpc`). */
	settingProtocol?: string;
	policyEnabled?: boolean;
	policyExporterType?: OTelExporterType;
	policyOtlpEndpoint?: string;
	policyCaptureContent?: boolean;
	policyOutfile?: string;
	/** Enterprise-managed OTLP wire protocol (raw `telemetry.protocol`). */
	policyProtocol?: string;
	/** Service name from VS Code setting (`github.copilot.chat.otel.serviceName`). */
	settingServiceName?: string;
	/** Enterprise-managed `service.name` (raw `telemetry.serviceName`). */
	policyServiceName?: string;
	/** Resource attributes from VS Code setting (`github.copilot.chat.otel.resourceAttributes`). */
	settingResourceAttributes?: Record<string, string>;
	/** Enterprise-managed resource attributes (raw `telemetry.resourceAttributes`). */
	policyResourceAttributes?: Record<string, string>;
	/** OTLP headers from VS Code setting (`github.copilot.chat.otel.headers`). */
	settingHeaders?: Record<string, string>;
	/** Enterprise-managed OTLP headers (raw `telemetry.headers`). */
	policyHeaders?: Record<string, string>;
	extensionVersion: string;
	sessionId: string;
	vscodeTelemetryLevel?: string;
}

/**
 * Resolve OTel configuration with layered precedence:
 * 1. Enterprise policy values from managed settings (highest)
 * 2. COPILOT_OTEL_* env vars
 * 3. OTEL_EXPORTER_OTLP_* standard env vars
 * 4. VS Code settings
 * 5. Defaults (lowest)
 */
export function resolveOTelConfig(input: OTelConfigInput): OTelConfig {
	const { env } = input;

	// Kill switch: respect VS Code telemetry level
	if (input.vscodeTelemetryLevel === 'off') {
		return createDisabledConfig(input);
	}

	// SQLite DB span exporter: setting > default(false)
	const dbSpanExporter = input.settingDbSpanExporter ?? false;

	const policyMandatesOtlp = input.policyOtlpEndpoint !== undefined || input.policyExporterType !== undefined;
	const policyEndpointEnables = input.policyOtlpEndpoint !== undefined ? true : undefined;

	// Determine if enabled: policy > env > setting > policy endpoint > dbSpanExporter > default(false)
	// When dbSpanExporter is on, OTel must be enabled for the SDK pipeline to work.
	const enabledSignal = input.policyEnabled
		?? envBool(env['COPILOT_OTEL_ENABLED'])
		?? input.settingEnabled
		?? policyEndpointEnables
		?? (!!env['OTEL_EXPORTER_OTLP_ENDPOINT']);
	const enabled = input.policyEnabled === false ? false : enabledSignal || dbSpanExporter;

	// OTel was explicitly enabled if policy/user/env turned it on, not just dbSpanExporter
	const enabledExplicitly = enabled && enabledSignal === true;

	if (!enabled) {
		return createDisabledConfig(input);
	}

	// Determine how OTel was enabled for telemetry tracking
	let enabledVia: OTelEnabledVia;
	if (input.policyEnabled === true || (input.policyEnabled === undefined && input.policyOtlpEndpoint !== undefined)) {
		enabledVia = 'policy';
	} else if (envBool(env['COPILOT_OTEL_ENABLED']) === true) {
		enabledVia = 'envVar';
	} else if (input.settingEnabled === true) {
		enabledVia = 'setting';
	} else if (!!env['OTEL_EXPORTER_OTLP_ENDPOINT']) {
		enabledVia = 'otlpEndpointEnvVar';
	} else {
		enabledVia = 'dbSpanExporterOnly';
	}

	// Protocol (transport): policy > env > setting exporter type > default
	const rawProtocol = input.policyExporterType === 'otlp-grpc'
		? 'grpc'
		: input.policyExporterType === 'otlp-http'
			? 'http'
			: (env['OTEL_EXPORTER_OTLP_PROTOCOL'] ?? env['COPILOT_OTEL_PROTOCOL']
				?? (input.settingExporterType === 'otlp-grpc' ? 'grpc' : input.settingExporterType === 'otlp-http' ? 'http' : undefined));
	const protocol: 'grpc' | 'http' = rawProtocol === 'grpc' ? 'grpc' : 'http';

	// Wire protocol (json vs protobuf within http): policy > env > setting > default(http/json).
	// grpc transport always reports 'grpc'.
	const rawWireProtocol = input.policyProtocol
		?? env['OTEL_EXPORTER_OTLP_PROTOCOL']
		?? env['COPILOT_OTEL_PROTOCOL']
		?? input.settingProtocol;
	const otlpProtocol: OTelConfig['otlpProtocol'] = protocol === 'grpc'
		? 'grpc'
		: rawWireProtocol === 'http/protobuf'
			? 'http/protobuf'
			: 'http/json';

	// Endpoint: policy > COPILOT_OTEL env > OTEL env > setting > default
	const rawEndpoint = input.policyOtlpEndpoint
		?? env['COPILOT_OTEL_ENDPOINT']
		?? env['OTEL_EXPORTER_OTLP_ENDPOINT']
		?? input.settingOtlpEndpoint
		?? DEFAULT_OTLP_ENDPOINT;
	const otlpEndpoint = parseOtlpEndpoint(rawEndpoint, protocol) ?? DEFAULT_OTLP_ENDPOINT;

	// File exporter path. Enterprise OTLP policy suppresses file export diversion.
	const fileExporterPath = input.policyOutfile !== undefined
		? input.policyOutfile || undefined
		: policyMandatesOtlp
			? undefined
			: env['COPILOT_OTEL_FILE_EXPORTER_PATH'] ?? input.settingOutfile;

	// Exporter type
	let exporterType: OTelExporterType;
	if (input.policyExporterType) {
		exporterType = input.policyExporterType;
	} else if (policyMandatesOtlp) {
		exporterType = 'otlp-http';
	} else if (fileExporterPath) {
		exporterType = 'file';
	} else if (input.settingExporterType) {
		exporterType = input.settingExporterType;
	} else {
		exporterType = protocol === 'grpc' ? 'otlp-grpc' : 'otlp-http';
	}

	// Content capture: policy > env > setting > default(false)
	const captureContent = input.policyCaptureContent
		?? envBool(env['COPILOT_OTEL_CAPTURE_CONTENT'])
		?? input.settingCaptureContent
		?? false;

	// Max attribute size in characters: env > setting > default(0 = unlimited).
	const maxAttributeSizeChars = parseMaxAttributeSizeChars(env['COPILOT_OTEL_MAX_ATTRIBUTE_SIZE_CHARS'])
		?? input.settingMaxAttributeSizeChars
		?? 0;

	// Log level
	const validLogLevels = new Set<OTelConfig['logLevel']>(['trace', 'debug', 'info', 'warn', 'error']);
	const rawLogLevel = env['COPILOT_OTEL_LOG_LEVEL'];
	const logLevel: OTelConfig['logLevel'] = rawLogLevel && validLogLevels.has(rawLogLevel as OTelConfig['logLevel'])
		? rawLogLevel as OTelConfig['logLevel']
		: 'info';

	// HTTP instrumentation
	const httpInstrumentation = envBool(env['COPILOT_OTEL_HTTP_INSTRUMENTATION']) ?? false;

	// Service name: policy > env > setting > default. Empty values fall through.
	const serviceName = (input.policyServiceName || undefined)
		?? env['OTEL_SERVICE_NAME']
		?? (input.settingServiceName || undefined)
		?? 'copilot-chat';

	// Resource attributes: merged per-key with precedence policy > env > setting.
	const resourceAttributes = {
		...(input.settingResourceAttributes ?? {}),
		...parseResourceAttributes(env['OTEL_RESOURCE_ATTRIBUTES']),
		...(input.policyResourceAttributes ?? {}),
	};

	// OTLP headers: merged per-key with precedence policy > env > setting. Same `k=v,k2=v2` format
	// as resource attributes (`OTEL_EXPORTER_OTLP_HEADERS`).
	const headers = {
		...(input.settingHeaders ?? {}),
		...parseResourceAttributes(env['OTEL_EXPORTER_OTLP_HEADERS']),
		...(input.policyHeaders ?? {}),
	};

	return Object.freeze({
		enabled: true,
		enabledExplicitly,
		enabledVia,
		exporterType,
		otlpEndpoint,
		otlpProtocol,
		captureContent,
		maxAttributeSizeChars: maxAttributeSizeChars < 0 ? 0 : maxAttributeSizeChars,
		fileExporterPath,
		dbSpanExporter,
		logLevel,
		httpInstrumentation,
		serviceName,
		serviceVersion: input.extensionVersion,
		sessionId: input.sessionId,
		resourceAttributes,
		headers,
	});
}

function createDisabledConfig(input: OTelConfigInput): OTelConfig {
	return Object.freeze({
		enabled: false,
		enabledExplicitly: false,
		enabledVia: 'disabled' as const,
		exporterType: 'otlp-http' as const,
		otlpEndpoint: '',
		otlpProtocol: 'http/json' as const,
		captureContent: false,
		maxAttributeSizeChars: 0,
		dbSpanExporter: false,
		logLevel: 'info' as const,
		httpInstrumentation: false,
		serviceName: 'copilot-chat',
		serviceVersion: input.extensionVersion,
		sessionId: input.sessionId,
		resourceAttributes: {},
		headers: {},
	});
}

function envBool(val: string | undefined): boolean | undefined {
	if (val === undefined) {
		return undefined;
	}
	return val === 'true' || val === '1';
}

/**
 * Parse a numeric env var representing the max attribute size in characters.
 * Accepts non-negative safe integers; fractional, unsafe, or non-numeric input
 * returns `undefined` so the caller can fall back to the next config layer.
 * Negative values are clamped to `0` (no truncation) by the caller.
 */
function parseMaxAttributeSizeChars(val: string | undefined): number | undefined {
	if (val === undefined || val === '') {
		return undefined;
	}
	const n = Number(val);
	if (!Number.isSafeInteger(n)) {
		return undefined;
	}
	return n;
}
