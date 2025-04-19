/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { localize } from '../../../../nls.js';
import { IMcpCollectionContribution } from '../../../../platform/extensions/common/extensions.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';
import { IExtensionPointDescriptor } from '../../../services/extensions/common/extensionsRegistry.js';

export type { McpConfigurationServer, IMcpConfigurationStdio, IMcpConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';

const mcpActivationEventPrefix = 'onMcpCollection:';

export const mcpActivationEvent = (collectionId: string) => mcpActivationEventPrefix + collectionId;

export const enum DiscoverySource {
	ClaudeDesktop = 'claude-desktop',
	Windsurf = 'windsurf',
	CursorGlobal = 'cursor-global',
	CursorWorkspace = 'cursor-workspace',
}

export const allDiscoverySources = Object.keys({
	[DiscoverySource.ClaudeDesktop]: true,
	[DiscoverySource.Windsurf]: true,
	[DiscoverySource.CursorGlobal]: true,
	[DiscoverySource.CursorWorkspace]: true,
} satisfies Record<DiscoverySource, true>) as DiscoverySource[];

export const discoverySourceLabel: Record<DiscoverySource, string> = {
	[DiscoverySource.ClaudeDesktop]: localize('mcp.discovery.source.claude-desktop', "Claude Desktop"),
	[DiscoverySource.Windsurf]: localize('mcp.discovery.source.windsurf', "Windsurf"),
	[DiscoverySource.CursorGlobal]: localize('mcp.discovery.source.cursor-global', "Cursor (Global)"),
	[DiscoverySource.CursorWorkspace]: localize('mcp.discovery.source.cursor-workspace', "Cursor (Workspace)"),
};

export const mcpConfigurationSection = 'mcp';
export const mcpDiscoverySection = 'chat.mcp.discovery.enabled';
export const mcpEnabledSection = 'chat.mcp.enabled';

export const mcpSchemaExampleServers = {
	'mcp-server-time': {
		command: 'python',
		args: ['-m', 'mcp_server_time', '--local-timezone=America/Los_Angeles'],
		env: {},
	}
};

const httpSchemaExamples = {
	'my-mcp-server': {
		url: 'http://localhost:3001/mcp',
		headers: {},
	}
};

export const mcpStdioServerSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	examples: [mcpSchemaExampleServers['mcp-server-time']],
	properties: {
		type: {
			type: 'string',
			enum: ['stdio'],
			description: localize('app.mcp.json.type', "The type of the server.")
		},
		command: {
			type: 'string',
			description: localize('app.mcp.json.command', "The command to run the server.")
		},
		args: {
			type: 'array',
			description: localize('app.mcp.args.command', "Arguments passed to the server."),
			items: {
				type: 'string'
			},
		},
		envFile: {
			type: 'string',
			description: localize('app.mcp.envFile.command', "Path to a file containing environment variables for the server."),
			examples: ['${workspaceFolder}/.env'],
		},
		env: {
			description: localize('app.mcp.env.command', "Environment variables passed to the server."),
			additionalProperties: {
				anyOf: [
					{ type: 'null' },
					{ type: 'string' },
					{ type: 'number' },
				]
			}
		},
	}
};

export const mcpServerSchema: IJSONSchema = {
	id: mcpSchemaId,
	type: 'object',
	title: localize('app.mcp.json.title', "Model Context Protocol Servers"),
	allowTrailingCommas: true,
	allowComments: true,
	additionalProperties: false,
	properties: {
		servers: {
			examples: [
				mcpSchemaExampleServers,
				httpSchemaExamples,
			],
			additionalProperties: {
				oneOf: [mcpStdioServerSchema, {
					type: 'object',
					additionalProperties: false,
					required: ['url'],
					examples: [httpSchemaExamples['my-mcp-server']],
					properties: {
						type: {
							type: 'string',
							enum: ['http', 'sse'],
							description: localize('app.mcp.json.type', "The type of the server.")
						},
						url: {
							type: 'string',
							format: 'uri',
							description: localize('app.mcp.json.url', "The URL of the Streamable HTTP or SSE endpoint.")
						},
						headers: {
							type: 'object',
							description: localize('app.mcp.json.headers', "Additional headers sent to the server."),
							additionalProperties: { type: 'string' },
						},
					}
				}]
			}
		},
		inputs: inputsSchema.definitions!.inputs
	}
};

export const mcpContributionPoint: IExtensionPointDescriptor<IMcpCollectionContribution[]> = {
	extensionPoint: 'modelContextServerCollections',
	activationEventsGenerator(contribs, result) {
		for (const contrib of contribs) {
			if (contrib.id) {
				result.push(mcpActivationEvent(contrib.id));
			}
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.mcp', 'Contributes Model Context Protocol servers. Users of this should also use `vscode.lm.registerMcpConfigurationProvider`.'),
		type: 'array',
		defaultSnippets: [{ body: [{ id: '', label: '' }] }],
		items: {
			additionalProperties: false,
			type: 'object',
			defaultSnippets: [{ body: { id: '', label: '' } }],
			properties: {
				id: {
					description: localize('vscode.extension.contributes.mcp.id', "Unique ID for the collection."),
					type: 'string'
				},
				label: {
					description: localize('vscode.extension.contributes.mcp.label', "Display name for the collection."),
					type: 'string'
				}
			}
		}
	}
};
