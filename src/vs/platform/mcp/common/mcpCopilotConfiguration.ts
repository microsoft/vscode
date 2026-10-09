/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { normalizeMcpServerConfiguration } from '../../agentPlugins/common/pluginParsers.js';
import { IMcpServerConfiguration, McpServerType } from './mcpPlatformTypes.js';

export interface ICopilotLocalMcpServerConfiguration {
	type: 'local';
	command: string;
	args: string[];
	tools: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface ICopilotRemoteMcpServerConfiguration {
	type: 'http' | 'sse';
	url: string;
	tools: string[];
	headers?: Record<string, string>;
	oauthClientId?: string;
}

/** The server format shared by Copilot CLI configuration and the SDK. */
export type ICopilotMcpServerConfiguration = ICopilotLocalMcpServerConfiguration | ICopilotRemoteMcpServerConfiguration;

export function toCopilotMcpServerConfiguration(config: IMcpServerConfiguration, cwd = config.type === McpServerType.LOCAL ? config.cwd : undefined): ICopilotMcpServerConfiguration {
	if (config.type === McpServerType.LOCAL) {
		return {
			type: 'local',
			command: config.command,
			args: config.args ? [...config.args] : [],
			tools: ['*'],
			...(config.env && { env: toStringEnv(config.env) }),
			...(cwd ? { cwd } : {}),
		};
	}
	return {
		type: config.transport === 'sse' ? 'sse' : 'http',
		url: config.url,
		tools: ['*'],
		...(config.headers && { headers: { ...config.headers } }),
		...(config.oauth?.clientId && { oauthClientId: config.oauth.clientId }),
	};
}

/** Reads supported servers without requiring CLI-owned fields to be known to VS Code. */
export function fromCopilotMcpServerConfiguration(value: unknown): IMcpServerConfiguration | undefined {
	if (value && typeof value === 'object' && (value as { type?: unknown }).type === 'local') {
		return normalizeMcpServerConfiguration({ ...value, type: McpServerType.LOCAL });
	}
	return normalizeMcpServerConfiguration(value);
}

function toStringEnv(env: Record<string, string | number | null>): Record<string, string> {
	return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== null).map(([key, value]) => [key, String(value)]));
}
