/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parse, ParseError } from '../../../base/common/json.js';
import { localize } from '../../../nls.js';
import { normalizeMcpServerConfiguration } from '../../agentPlugins/common/pluginParsers.js';
import { IInstallableMcpServer } from './mcpManagement.js';
import { IMcpServerConfiguration, McpServerType } from './mcpPlatformTypes.js';

export const enum McpResourceFormat {
	Vscode = 'vscode',
	WorkspaceRoot = 'workspaceRoot',
}

export const WORKSPACE_ROOT_MCP_CONFIG_FILE = '.mcp.json';
export const WORKSPACE_ROOT_MCP_COLLECTION_ID_PREFIX = 'workspace-dot-mcp.';

/** Validates new root-file installs without silently dropping unsupported configuration. */
export function getWorkspaceRootMcpConfigurationError(server: IInstallableMcpServer): string | undefined {
	const unsupported = (property: string) => localize('unsupportedWorkspaceRootMcpProperty', "'{0}' is not supported in .mcp.json. Use .vscode/mcp.json.", property);
	if (server.inputs !== undefined && (!Array.isArray(server.inputs) || server.inputs.length > 0)) {
		return unsupported('inputs');
	}

	const config: unknown = server.config;
	if (!isObject(config)) {
		return unsupported('configuration');
	}
	const type = config.type ?? (typeof config.command === 'string' ? McpServerType.LOCAL : McpServerType.REMOTE);
	if (type !== McpServerType.LOCAL && type !== McpServerType.REMOTE) {
		return unsupported('type');
	}
	const allowed = type === McpServerType.LOCAL
		? new Set(['type', 'command', 'args', 'env'])
		: new Set(['type', 'url', 'headers', 'transport']);
	for (const key of Object.keys(config)) {
		if (!allowed.has(key) && config[key] !== undefined) {
			return unsupported(key);
		}
	}
	if (type === McpServerType.LOCAL) {
		if (typeof config.command !== 'string' || !config.command.trim()) {
			return unsupported('command');
		}
		if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(arg => typeof arg !== 'string'))) {
			return unsupported('args');
		}
		if (config.env !== undefined && (!isObject(config.env) || Object.values(config.env).some(value => typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))))) {
			return unsupported('env');
		}
	} else {
		if (typeof config.url !== 'string' || !config.url.trim()) {
			return unsupported('url');
		}
		if (config.transport !== undefined && config.transport !== 'http') {
			return unsupported('transport');
		}
		if (config.headers !== undefined && (!isObject(config.headers) || Object.values(config.headers).some(value => typeof value !== 'string'))) {
			return unsupported('headers');
		}
	}
	if (hasInterpolation(config)) {
		return unsupported('${...}');
	}
	return undefined;
}

function hasInterpolation(value: unknown): boolean {
	if (typeof value === 'string') {
		return value.includes('${');
	}
	if (Array.isArray(value)) {
		return value.some(hasInterpolation);
	}
	return isObject(value) && Object.values(value).some(hasInterpolation);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Reads either root-file shape; malformed entries do not hide neighboring servers. */
export function parseWorkspaceRootMcpConfiguration(content: string): { readonly wrapped: boolean; readonly servers: Record<string, IMcpServerConfiguration> } {
	const errors: ParseError[] = [];
	const value: unknown = parse(content, errors, { allowTrailingComma: true, allowEmptyContent: false });
	if (errors.length || !isObject(value)) {
		throw new Error(localize('invalidWorkspaceRootMcpConfiguration', "The .mcp.json file must contain a valid JSON object. Fix the file before changing MCP servers."));
	}
	const wrapped = Object.hasOwn(value, 'mcpServers');
	const rawServers = wrapped ? value.mcpServers : value;
	if (!isObject(rawServers)) {
		throw new Error(localize('invalidWorkspaceRootMcpServers', "The 'mcpServers' property in .mcp.json must be an object. Fix the file before changing MCP servers."));
	}
	const servers: [string, IMcpServerConfiguration][] = [];
	for (const [name, raw] of Object.entries(rawServers)) {
		const configuration = isObject(raw) ? normalizeMcpServerConfiguration(raw) : undefined;
		if (configuration) {
			servers.push([name, configuration]);
		}
	}
	return { wrapped, servers: Object.fromEntries(servers) };
}
