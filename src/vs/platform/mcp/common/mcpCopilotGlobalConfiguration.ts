/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { getCopilotMcpConfigurationPath } from '../../environment/common/copilotHome.js';
import { fromCopilotMcpServerConfiguration } from './mcpCopilotConfiguration.js';
import { IInstallableMcpServer } from './mcpManagement.js';
import { IMcpServerConfiguration, McpServerType } from './mcpPlatformTypes.js';
import { INativeMcpDiscoveryData } from './nativeMcpDiscoveryHelper.js';

export function getCopilotGlobalMcpConfigurationResource({ copilotHome, homedir }: Pick<INativeMcpDiscoveryData, 'copilotHome' | 'homedir'>): URI {
	return URI.file(getCopilotMcpConfigurationPath(homedir.fsPath, copilotHome ? { COPILOT_HOME: copilotHome.fsPath } : {}));
}

const supportedLocalProperties = new Set(['type', 'command', 'args', 'env', 'cwd']);
const supportedRemoteProperties = new Set(['type', 'url', 'headers', 'transport', 'oauth']);

/** Rejects configuration that cannot be written without losing VS Code-only behavior. */
export function getCopilotGlobalMcpConfigurationError({ config, inputs }: IInstallableMcpServer): string | undefined {
	if (inputs !== undefined && (!Array.isArray(inputs) || inputs.length > 0)) {
		return localize('unsupportedCopilotGlobalMcpInputs', "Interactive inputs are not supported in Copilot Global MCP configuration. Use environment variable references instead.");
	}
	if (!isObject(config) || (config.type !== McpServerType.LOCAL && config.type !== McpServerType.REMOTE)) {
		return localize('invalidCopilotGlobalMcpServer', "The MCP server configuration is invalid.");
	}
	const supported = config.type === McpServerType.LOCAL ? supportedLocalProperties : supportedRemoteProperties;
	for (const [key, value] of Object.entries(config)) {
		if (value !== undefined && !supported.has(key)) {
			return localize('unsupportedCopilotGlobalMcpProperty', "'{0}' is not supported in Copilot Global MCP configuration.", key);
		}
	}
	const valid = config.type === McpServerType.LOCAL
		? typeof config.command === 'string' && !!config.command.trim()
		&& (config.args === undefined || (Array.isArray(config.args) && config.args.every(arg => typeof arg === 'string')))
		&& (config.cwd === undefined || typeof config.cwd === 'string')
		&& (config.env === undefined || (isObject(config.env) && Object.values(config.env).every(value => value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))))
		: typeof config.url === 'string' && !!config.url.trim()
		&& (config.transport === undefined || config.transport === 'http' || config.transport === 'sse')
		&& (config.headers === undefined || (isObject(config.headers) && Object.values(config.headers).every(value => typeof value === 'string')))
		&& (config.oauth === undefined || (isObject(config.oauth) && Object.entries(config.oauth).every(([key, value]) => key === 'clientId' && typeof value === 'string')));
	if (!valid) {
		return localize('invalidCopilotGlobalMcpServer', "The MCP server configuration is invalid.");
	}
	if (JSON.stringify(config).includes('${input:')) {
		return localize('unsupportedCopilotGlobalMcpInputVariable', "VS Code input variables are not supported in Copilot Global MCP configuration. Use environment variable references instead.");
	}
	return undefined;
}

/** Tolerates CLI-owned entries, but rejects documents that cannot be safely edited. */
export function parseCopilotGlobalMcpConfiguration(content: string): Record<string, IMcpServerConfiguration> {
	let document: unknown;
	try {
		document = JSON.parse(content);
	} catch (error) {
		throw new Error(localize('invalidCopilotGlobalMcpJson', "The Copilot Global MCP configuration must contain valid JSON: {0}", error instanceof Error ? error.message : String(error)));
	}
	const mcpServers = isObject(document) ? document.mcpServers : undefined;
	if (!isObject(document) || (mcpServers !== undefined && !isObject(mcpServers))) {
		throw new Error(localize('invalidCopilotGlobalMcpServers', "The Copilot Global MCP configuration must be a JSON object whose 'mcpServers' property is an object."));
	}
	const servers: [string, IMcpServerConfiguration][] = [];
	for (const [name, raw] of Object.entries(mcpServers ?? {})) {
		const configuration = fromCopilotMcpServerConfiguration(raw);
		if (configuration) {
			servers.push([name, configuration]);
		}
	}
	return Object.fromEntries(servers);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
