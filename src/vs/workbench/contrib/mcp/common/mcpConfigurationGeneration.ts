/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { localize } from '../../../../nls.js';
import { normalizeMcpServerConfiguration } from '../../../../platform/agentPlugins/common/pluginParsers.js';
import { fromCopilotMcpServerConfiguration } from '../../../../platform/mcp/common/mcpCopilotConfiguration.js';
import { IMcpRemoteServerConfiguration, IMcpServerConfiguration, IMcpServerVariable } from '../../../../platform/mcp/common/mcpPlatformTypes.js';
import { McpResourceFormat } from '../../../../platform/mcp/common/mcpWorkspaceConfiguration.js';
import { mcpRemoteServerSchema, mcpStdioServerSchema } from './mcpConfiguration.js';

/** Command contract with the Copilot extension's MCP setup commands. */
export type McpGeneratedConfiguration = {
	type: 'assisted';
	format: McpResourceFormat;
	name: string;
	server: Record<string, unknown>;
	inputs?: IMcpServerVariable[];
	inputValues?: Record<string, string>;
} | {
	type: 'mapped';
	name: string;
	server: IMcpServerConfiguration;
	inputs?: IMcpServerVariable[];
	inputValues?: never;
};

export function getMcpGenerationSchema(format: McpResourceFormat): IJSONSchema {
	const remote = mcpRemoteServerSchema;
	const localProperties = mcpStdioServerSchema.properties!;
	const remoteProperties = remote.properties!;
	const stdio: IJSONSchema = format !== McpResourceFormat.CopilotGlobal ? mcpStdioServerSchema : {
		type: 'object',
		additionalProperties: false,
		properties: {
			type: { enum: ['local'] },
			command: localProperties.command,
			args: localProperties.args,
			env: { type: 'object', additionalProperties: { type: 'string' } },
			cwd: localProperties.cwd,
			tools: { const: ['*'] },
		},
	};
	const http: IJSONSchema = format !== McpResourceFormat.CopilotGlobal ? remote : {
		type: 'object',
		additionalProperties: false,
		properties: {
			type: { enum: ['http', 'sse'] },
			url: remoteProperties.url,
			headers: remoteProperties.headers,
			oauthClientId: { type: 'string' },
			tools: { const: ['*'] },
		},
	};
	return {
		description: format === McpResourceFormat.WorkspaceRoot
			? 'Prefer portable command/args/env or HTTP url/headers. Preserve any required VS Code inputs, cwd, envFile, OAuth or SSE transport: these require explicit approval to use .vscode/mcp.json instead of .mcp.json.'
			: undefined,
		oneOf: [stdio, http].map((schema, index) => ({
			...schema,
			required: ['name', index === 0 ? 'command' : 'url'],
			properties: {
				...schema.properties,
				...(index === 0 ? { env: { ...schema.properties!.env, type: 'object' } } : {}),
				[index === 0 ? 'command' : 'url']: { ...schema.properties![index === 0 ? 'command' : 'url'], minLength: 1, pattern: index === 0 ? '\\S' : '^https?:\\/\\/.+' },
				name: { type: 'string', minLength: 1, pattern: '\\S', description: 'Suggested name of the server' },
			},
		})),
	};
}

export function normalizeMcpGeneratedConfiguration(result: McpGeneratedConfiguration, format: McpResourceFormat): IMcpServerConfiguration {
	if (result.type === 'mapped') {
		return result.server;
	}
	if (result.format !== format) {
		throw new Error(localize('mcp.generation.formatMismatch', "The MCP setup extension returned an unexpected configuration format. Update the Copilot extension and try again."));
	}
	const normalized = format === McpResourceFormat.CopilotGlobal
		? fromCopilotMcpServerConfiguration(result.server)
		: normalizeMcpServerConfiguration(result.server);
	if (!normalized) {
		throw new Error(localize('mcp.generation.invalid', "The generated MCP server configuration is invalid. Try again or add the server manually."));
	}
	// Preserve VS Code-only fields; the shared normalizer handles transport and OAuth dialects.
	return format === McpResourceFormat.CopilotGlobal ? normalized : {
		...result.server,
		...normalized,
		...(result.server.oauth ? { oauth: result.server.oauth as IMcpRemoteServerConfiguration['oauth'] } : {}),
	};
}
