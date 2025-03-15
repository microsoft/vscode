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

export type { IMcpConfigurationServer, IMcpConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';

const mcpActivationEventPrefix = 'onMcpCollection:';

export const mcpActivationEvent = (collectionId: string) => mcpActivationEventPrefix + collectionId;

const mcpSchemaExampleServer = {
	command: 'node',
	args: ['my-mcp-server.js'],
	env: {},
};

export const mcpConfigurationSection = 'mcp';
export const mcpDiscoverySection = 'chat.mcp.discovery.enabled';

export const mcpSchemaExampleServers = {
	'mcp-server-time': {
		command: 'python',
		args: ['-m', 'mcp_server_time', '--local-timezone=America/Los_Angeles'],
		env: {},
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
			examples: [mcpSchemaExampleServers],
			additionalProperties: {
				type: 'object',
				additionalProperties: false,
				examples: [mcpSchemaExampleServer],
				properties: {
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
