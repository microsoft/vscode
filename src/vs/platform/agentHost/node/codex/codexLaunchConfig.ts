/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CodexUsageSource } from '../../common/agentHostCustomizationConfig.js';
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

export function isCodexThreadProviderCompatible(usageSource: CodexUsageSource, modelProvider: string): boolean {
	return usageSource === 'copilot' ? modelProvider === 'vscode-proxy' : modelProvider !== 'vscode-proxy';
}

/** Explicitly bind a compatible resumed thread to the current global usage source. */
export function buildCodexResumeParams(usageSource: CodexUsageSource, threadId: string, mcpServers: Readonly<Record<string, unknown>>): ThreadResumeParams {
	return {
		threadId,
		modelProvider: usageSource === 'copilot' ? 'vscode-proxy' : 'openai',
		...(Object.keys(mcpServers).length > 0 ? { config: { mcp_servers: mcpServers as JsonValue } } : {}),
	};
}

export function buildCodexLaunchConfig(
	usageSource: CodexUsageSource,
	inheritedEnv: NodeJS.ProcessEnv,
	proxy: ICodexLaunchProxy | undefined,
	extraArgs: readonly string[],
): ICodexLaunchConfig {
	if ((usageSource === 'copilot') !== (proxy !== undefined)) {
		throw new Error(`Codex ${usageSource} launch received an invalid proxy configuration`);
	}
	const env: NodeJS.ProcessEnv = { ...inheritedEnv };
	if (proxy) {
		env.OPENAI_API_KEY = proxy.nonce;
	}
	const overrides = [
		...(proxy ? [
			`model_provider="vscode-proxy"`,
			`model_providers.vscode-proxy.name="VS Code Proxy"`,
			`model_providers.vscode-proxy.base_url="${proxy.baseUrl}/v1"`,
			`model_providers.vscode-proxy.wire_api="responses"`,
			`model_providers.vscode-proxy.env_key="OPENAI_API_KEY"`,
			`model_providers.vscode-proxy.requires_openai_auth=false`,
			`model_providers.vscode-proxy.supports_websockets=false`,
		] : []),
		`features.tool_call_mcp_elicitation=false`,
		...(proxy ? [`features.image_generation=false`] : []),
	];
	return {
		env,
		args: ['app-server', ...overrides.flatMap(value => ['-c', value]), ...extraArgs],
	};
}
