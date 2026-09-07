/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AiAgentEnvValue, AiAgentEnvVar } from '../../../chat/common/aiAgentEnv.js';
import type { IAgentHostNativeOTelConfig } from '../../common/otel/agentHostOTelService.js';
import type { ThreadResumeParams } from './protocol/generated/v2/ThreadResumeParams.js';
import type { JsonValue } from './protocol/generated/serde_json/JsonValue.js';

export interface ICodexLaunchProxy {
	readonly baseUrl: string;
	readonly nonce: string;
}

export interface ICodexLaunchConfig {
	readonly env: NodeJS.ProcessEnv;
	readonly args: readonly string[];
}

export function buildCodexResumeParams(
	modelProvider: string,
	threadId: string,
	mcpServers: Readonly<Record<string, unknown>>,
	workingDirectories?: readonly string[],
	configOverrides: Readonly<Record<string, JsonValue>> = {},
	developerInstructions?: string,
	imageGenerationEnabled = false,
): ThreadResumeParams {
	const config = {
		...configOverrides,
		'features.image_generation': imageGenerationEnabled,
		...(Object.keys(mcpServers).length > 0 ? { mcp_servers: mcpServers as JsonValue } : {}),
	};
	return {
		threadId,
		modelProvider,
		...(workingDirectories?.length ? {
			cwd: workingDirectories[0],
			runtimeWorkspaceRoots: [...workingDirectories],
		} : {}),
		...(Object.keys(config).length > 0 ? { config } : {}),
		...(developerInstructions ? { developerInstructions } : {}),
	};
}

export function buildCodexLaunchConfig(
	inheritedEnv: NodeJS.ProcessEnv,
	proxy: ICodexLaunchProxy,
	extraArgs: readonly string[],
	telemetry?: IAgentHostNativeOTelConfig,
): ICodexLaunchConfig {
	const env: NodeJS.ProcessEnv = { ...inheritedEnv, [AiAgentEnvVar]: AiAgentEnvValue };
	if (telemetry) {
		delete env.OTEL_SERVICE_NAME;
		env.OTEL_RESOURCE_ATTRIBUTES = serializeResourceAttributes(telemetry.resourceAttributes);
	}
	env.OPENAI_API_KEY = proxy.nonce;
	const overrides = [
		`model_providers.vscode-proxy.name="VS Code Proxy"`,
		`model_providers.vscode-proxy.base_url="${proxy.baseUrl}/v1"`,
		`model_providers.vscode-proxy.wire_api="responses"`,
		`model_providers.vscode-proxy.env_key="OPENAI_API_KEY"`,
		`model_providers.vscode-proxy.requires_openai_auth=false`,
		`model_providers.vscode-proxy.supports_websockets=false`,
		// Codex filters its shell tool's env through `shell_environment_policy`,
		// so pin the marker there too — a user policy (e.g. `inherit = "core"`)
		// would otherwise drop it.
		`shell_environment_policy.set.${AiAgentEnvVar}="${AiAgentEnvValue}"`,
		`features.tool_call_mcp_elicitation=false`,
		// Keep image generation disabled for the Copilot/CAPI proxy by default.
		// ChatGPT subscription threads opt in with a per-thread override.
		`features.image_generation=false`,
	];
	const telemetryOverrides = codexTelemetryOverrides(telemetry);
	return {
		env,
		args: ['app-server', ...overrides.flatMap(value => ['-c', value]), ...extraArgs, ...telemetryOverrides.flatMap(value => ['-c', value])],
	};
}

export function codexTelemetryOverrides(config: IAgentHostNativeOTelConfig | undefined): string[] {
	return [
		// Codex analytics are independent from its OTel exporters and post to an
		// OpenAI-owned endpoint. Keep them disabled even when the user configures
		// Agent Host OTel, whose destinations are supplied explicitly below. Codex
		// currently uses this same flag to gate its metrics exporter, so preventing
		// product analytics also suppresses its otherwise user-directed metrics.
		'analytics.enabled=false',
		// Agent Host does not expose Codex's feedback flow. Disable its Sentry
		// upload path rather than leaving an unused outbound channel available.
		'feedback.enabled=false',
		`otel.log_user_prompt=${config?.captureContent ?? false}`,
		config?.traces ? `otel.trace_exporter=${codexExporter(config.traces)}` : 'otel.trace_exporter="none"',
		config?.external ? `otel.exporter=${codexExporter({ ...config.external, endpoint: resolveSignalEndpoint(config.external.endpoint, 'logs', config.external.protocol) })}` : 'otel.exporter="none"',
		config?.external ? `otel.metrics_exporter=${codexExporter({ ...config.external, endpoint: resolveSignalEndpoint(config.external.endpoint, 'metrics', config.external.protocol) })}` : 'otel.metrics_exporter="none"',
	];
}

function codexExporter(config: { endpoint: string; protocol: 'http/json' | 'http/protobuf' | 'grpc'; headers?: Readonly<Record<string, string>> }): string {
	const headers = config.headers && Object.keys(config.headers).length > 0
		? `, headers = { ${Object.entries(config.headers).map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`).join(', ')} }`
		: '';
	if (config.protocol === 'grpc') {
		return `{ otlp-grpc = { endpoint = ${JSON.stringify(config.endpoint)}${headers} } }`;
	}
	const protocol = config.protocol === 'http/json' ? 'json' : 'binary';
	return `{ otlp-http = { endpoint = ${JSON.stringify(config.endpoint)}, protocol = ${JSON.stringify(protocol)}${headers} } }`;
}

function serializeResourceAttributes(attributes: Readonly<Record<string, string>>): string {
	return Object.entries(attributes).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join(',');
}

function resolveSignalEndpoint(endpoint: string, signal: 'logs' | 'metrics', protocol: 'http/json' | 'http/protobuf' | 'grpc'): string {
	if (protocol === 'grpc') {
		return endpoint;
	}
	try {
		const url = new URL(endpoint);
		if (url.pathname === '' || url.pathname === '/') {
			url.pathname = `/v1/${signal}`;
		} else if (url.pathname.endsWith('/v1/traces')) {
			url.pathname = `${url.pathname.slice(0, -'/v1/traces'.length)}/v1/${signal}`;
		}
		return url.toString().replace(/\/$/, '');
	} catch {
		return endpoint;
	}
}
