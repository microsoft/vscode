/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { localize } from '../../../../nls.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';

export type { IMcpConfigurationServer, IMcpConfiguration } from '../../../../platform/mcp/common/mcpPlatformTypes.js';

const mcpSchemaExampleServer = {
	command: 'node',
	args: ['my-mcp-server.js'],
	env: {},
};

export const mcpConfigurationSection = 'mcp';
export const mcpDiscoverySection = 'chat.mpc.discovery.enabled';

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
