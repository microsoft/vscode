/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { IJSONSchema, IJSONSchemaMap } from '../../../../base/common/jsonSchema.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IExtensionManifest, IMcpCollectionContribution } from '../../../../platform/extensions/common/extensions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';
import { Extensions, IExtensionFeaturesRegistry, IExtensionFeatureTableRenderer, IRenderedData, IRowData, ITableData } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { IExtensionPointDescriptor } from '../../../services/extensions/common/extensionsRegistry.js';

const mcpActivationEventPrefix = 'onMcpCollection:';

/**
 * note: `contributedCollectionId` is _not_ the collection ID. The collection
 * ID is formed by passing the contributed ID through `extensionPrefixedIdentifier`
 */
export const mcpActivationEvent = (contributedCollectionId: string) =>
	mcpActivationEventPrefix + contributedCollectionId;

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
export const discoverySourceSettingsLabel: Record<DiscoverySource, string> = {
	[DiscoverySource.ClaudeDesktop]: localize('mcp.discovery.source.claude-desktop.config', "Claude Desktop configuration (`claude_desktop_config.json`)"),
	[DiscoverySource.Windsurf]: localize('mcp.discovery.source.windsurf.config', "Windsurf configurations (`~/.codeium/windsurf/mcp_config.json`)"),
	[DiscoverySource.CursorGlobal]: localize('mcp.discovery.source.cursor-global.config', "Cursor global configuration (`~/.cursor/mcp.json`)"),
	[DiscoverySource.CursorWorkspace]: localize('mcp.discovery.source.cursor-workspace.config', "Cursor workspace configuration (`.cursor/mcp.json`)"),
};

export const mcpConfigurationSection = 'mcp';
export const mcpDiscoverySection = 'chat.mcp.discovery.enabled';
export const mcpServerSamplingSection = 'chat.mcp.serverSampling';

export interface IMcpServerSamplingConfiguration {
	allowedDuringChat?: boolean;
	allowedOutsideChat?: boolean;
	allowedModels?: string[];
}

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

const mcpDevModeProps = (stdio: boolean): IJSONSchemaMap => ({
	dev: {
		type: 'object',
		markdownDescription: localize('app.mcp.dev', 'Enabled development mode for the server. When present, the server will be started eagerly and output will be included in its output. Properties inside the `dev` object can configure additional behavior.'),
		examples: [{ watch: 'src/**/*.ts', debug: { type: 'node' } }],
		properties: {
			watch: {
				description: localize('app.mcp.dev.watch', 'A glob pattern or list of glob patterns relative to the workspace folder to watch. The MCP server will be restarted when these files change.'),
				examples: ['src/**/*.ts'],
				oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
			},
			...(stdio && {
				debug: {
					markdownDescription: localize('app.mcp.dev.debug', 'If set, debugs the MCP server using the given runtime as it\'s started.'),
					oneOf: [
						{
							type: 'object',
							required: ['type'],
							properties: {
								type: {
									type: 'string',
									enum: ['node'],
									description: localize('app.mcp.dev.debug.type.node', "Debug the MCP server using Node.js.")
								}
							},
							additionalProperties: false
						},
						{
							type: 'object',
							required: ['type'],
							properties: {
								type: {
									type: 'string',
									enum: ['debugpy'],
									description: localize('app.mcp.dev.debug.type.python', "Debug the MCP server using Python and debugpy.")
								},
								debugpyPath: {
									type: 'string',
									description: localize('app.mcp.dev.debug.debugpyPath', "Path to the debugpy executable.")
								},
							},
							additionalProperties: false
						}
					]
				}
			})
		}
	}
});

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
		cwd: {
			type: 'string',
			description: localize('app.mcp.json.cwd', "The working directory for the server command. Defaults to the workspace folder when run in a workspace."),
			examples: ['${workspaceFolder}'],
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
		...mcpDevModeProps(true),
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
				oneOf: [
					mcpStdioServerSchema, {
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
								pattern: '^https?:\\/\\/.+',
								patternErrorMessage: localize('app.mcp.json.url.pattern', "The URL must start with 'http://' or 'https://'."),
								description: localize('app.mcp.json.url', "The URL of the Streamable HTTP or SSE endpoint.")
							},
							headers: {
								type: 'object',
								description: localize('app.mcp.json.headers', "Additional headers sent to the server."),
								additionalProperties: { type: 'string' },
							},
							...mcpDevModeProps(false),
						}
					},
				]
			}
		},
		inputs: inputsSchema.definitions!.inputs
	}
};

export const mcpContributionPoint: IExtensionPointDescriptor<IMcpCollectionContribution[]> = {
	extensionPoint: 'mcpServerDefinitionProviders',
	activationEventsGenerator: function* (contribs) {
		for (const contrib of contribs) {
			if (contrib.id) {
				yield mcpActivationEvent(contrib.id);
			}
		}
	},
	jsonSchema: {
		description: localize('vscode.extension.contributes.mcp', 'Contributes Model Context Protocol servers. Users of this should also use `vscode.lm.registerMcpServerDefinitionProvider`.'),
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
				},
				when: {
					description: localize('vscode.extension.contributes.mcp.when', "Condition which must be true to enable this collection."),
					type: 'string'
				}
			}
		}
	}
};

class McpServerDefinitionsProviderRenderer extends Disposable implements IExtensionFeatureTableRenderer {

	readonly type = 'table';

	shouldRender(manifest: IExtensionManifest): boolean {
		return !!manifest.contributes?.mcpServerDefinitionProviders && Array.isArray(manifest.contributes.mcpServerDefinitionProviders) && manifest.contributes.mcpServerDefinitionProviders.length > 0;
	}

	render(manifest: IExtensionManifest): IRenderedData<ITableData> {
		const mcpServerDefinitionProviders = manifest.contributes?.mcpServerDefinitionProviders ?? [];
		const headers = [localize('id', "ID"), localize('name', "Name")];
		const rows: IRowData[][] = mcpServerDefinitionProviders
			.map(mcpServerDefinitionProvider => {
				return [
					new MarkdownString().appendMarkdown(`\`${mcpServerDefinitionProvider.id}\``),
					mcpServerDefinitionProvider.label
				];
			});

		return {
			data: {
				headers,
				rows
			},
			dispose: () => { }
		};
	}
}

Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: mcpConfigurationSection,
	label: localize('mcpServerDefinitionProviders', "MCP Servers"),
	access: {
		canToggle: false
	},
	renderer: new SyncDescriptor(McpServerDefinitionsProviderRenderer),
});

