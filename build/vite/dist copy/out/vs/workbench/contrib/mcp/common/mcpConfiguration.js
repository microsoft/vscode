/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { mcpSchemaId } from '../../../services/configuration/common/configuration.js';
import { inputsSchema } from '../../../services/configurationResolver/common/configurationResolverSchema.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
const mcpActivationEventPrefix = 'onMcpCollection:';
/**
 * note: `contributedCollectionId` is _not_ the collection ID. The collection
 * ID is formed by passing the contributed ID through `extensionPrefixedIdentifier`
 */
export const mcpActivationEvent = (contributedCollectionId) => mcpActivationEventPrefix + contributedCollectionId;
export var DiscoverySource;
(function (DiscoverySource) {
    DiscoverySource["ClaudeDesktop"] = "claude-desktop";
    DiscoverySource["Windsurf"] = "windsurf";
    DiscoverySource["CursorGlobal"] = "cursor-global";
    DiscoverySource["CursorWorkspace"] = "cursor-workspace";
})(DiscoverySource || (DiscoverySource = {}));
export const allDiscoverySources = Object.keys({
    ["claude-desktop" /* DiscoverySource.ClaudeDesktop */]: true,
    ["windsurf" /* DiscoverySource.Windsurf */]: true,
    ["cursor-global" /* DiscoverySource.CursorGlobal */]: true,
    ["cursor-workspace" /* DiscoverySource.CursorWorkspace */]: true,
});
export const discoverySourceLabel = {
    ["claude-desktop" /* DiscoverySource.ClaudeDesktop */]: localize('mcp.discovery.source.claude-desktop', "Claude Desktop"),
    ["windsurf" /* DiscoverySource.Windsurf */]: localize('mcp.discovery.source.windsurf', "Windsurf"),
    ["cursor-global" /* DiscoverySource.CursorGlobal */]: localize('mcp.discovery.source.cursor-global', "Cursor (Global)"),
    ["cursor-workspace" /* DiscoverySource.CursorWorkspace */]: localize('mcp.discovery.source.cursor-workspace', "Cursor (Workspace)"),
};
export const discoverySourceSettingsLabel = {
    ["claude-desktop" /* DiscoverySource.ClaudeDesktop */]: localize('mcp.discovery.source.claude-desktop.config', "Claude Desktop configuration (`claude_desktop_config.json`)"),
    ["windsurf" /* DiscoverySource.Windsurf */]: localize('mcp.discovery.source.windsurf.config', "Windsurf configurations (`~/.codeium/windsurf/mcp_config.json`)"),
    ["cursor-global" /* DiscoverySource.CursorGlobal */]: localize('mcp.discovery.source.cursor-global.config', "Cursor global configuration (`~/.cursor/mcp.json`)"),
    ["cursor-workspace" /* DiscoverySource.CursorWorkspace */]: localize('mcp.discovery.source.cursor-workspace.config', "Cursor workspace configuration (`.cursor/mcp.json`)"),
};
export const mcpConfigurationSection = 'mcp';
export const mcpDiscoverySection = 'chat.mcp.discovery.enabled';
export const mcpServerSamplingSection = 'chat.mcp.serverSampling';
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
const mcpDevModeProps = (stdio) => ({
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
export const mcpStdioServerSchema = {
    type: 'object',
    additionalProperties: false,
    examples: [mcpSchemaExampleServers['mcp-server-time']],
    properties: {
        type: {
            type: 'string',
            enum: ['stdio'],
            description: localize('app.mcp.json.type', "The type of the server.")
        },
        sandboxEnabled: {
            type: 'boolean',
            default: false,
            description: localize('app.mcp.json.sandboxEnabled', "Whether to run the server in a sandboxed environment.")
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
export const mcpServerSchema = {
    id: mcpSchemaId,
    type: 'object',
    title: localize('app.mcp.json.title', "Model Context Protocol Servers"),
    allowTrailingCommas: true,
    allowComments: true,
    additionalProperties: false,
    properties: {
        sandbox: {
            description: localize('app.mcp.json.sandbox', "Sandbox config that determines file system and network access. Sandboxing is enabled when sandboxEnabled property is set at the server level on Mac OS and Linux only."),
            type: 'object',
            additionalProperties: false,
            properties: {
                network: {
                    description: localize('app.mcp.json.sandbox.network', "Network access settings for the sandboxed server."),
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        allowedDomains: {
                            description: localize('app.mcp.json.sandbox.network.allowedDomains', "List of domains that the server is allowed to access. Wildcards are supported, e.g. `*.example.com`."),
                            type: 'array',
                            items: { type: 'string' },
                            default: []
                        },
                        deniedDomains: {
                            description: localize('app.mcp.json.sandbox.network.deniedDomains', "List of domains that the server is not allowed to access. e.g. `invalid.example.com`."),
                            type: 'array',
                            items: { type: 'string' },
                            default: []
                        }
                    }
                },
                filesystem: {
                    description: localize('app.mcp.json.sandbox.filesystem', "Filesystem access settings for the sandboxed server. Glob patterns are supported for Mac OS only."),
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        denyRead: {
                            description: localize('app.mcp.json.sandbox.filesystem.denyRead', "List of file paths that the server is not allowed to read. By default, all files are allowed to be read. e.g. `~/src/secrets`."),
                            type: 'array',
                            items: { type: 'string' },
                            default: []
                        },
                        allowWrite: {
                            description: localize('app.mcp.json.sandbox.filesystem.allowWrite', "List of file paths that the server is allowed to write to. e.g. `~/src/`."),
                            type: 'array',
                            items: { type: 'string' },
                            default: []
                        },
                        denyWrite: {
                            description: localize('app.mcp.json.sandbox.filesystem.denyWrite', "List of file paths that the server is not allowed to write to. e.g. `~/src/auth/`."),
                            type: 'array',
                            items: { type: 'string' },
                            default: []
                        }
                    }
                }
            }
        },
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
        inputs: inputsSchema.definitions.inputs
    }
};
export const mcpContributionPoint = {
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
class McpServerDefinitionsProviderRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.mcpServerDefinitionProviders && Array.isArray(manifest.contributes.mcpServerDefinitionProviders) && manifest.contributes.mcpServerDefinitionProviders.length > 0;
    }
    render(manifest) {
        const mcpServerDefinitionProviders = manifest.contributes?.mcpServerDefinitionProviders ?? [];
        const headers = [localize('id', "ID"), localize('name', "Name")];
        const rows = mcpServerDefinitionProviders
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
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: mcpConfigurationSection,
    label: localize('mcpServerDefinitionProviders', "MCP Servers"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(McpServerDefinitionsProviderRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwQ29uZmlndXJhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwQ29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFFeEUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUU5QyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsWUFBWSxFQUFFLE1BQU0sK0VBQStFLENBQUM7QUFDN0csT0FBTyxFQUFFLFVBQVUsRUFBbUcsTUFBTSxtRUFBbUUsQ0FBQztBQUdoTSxNQUFNLHdCQUF3QixHQUFHLGtCQUFrQixDQUFDO0FBRXBEOzs7R0FHRztBQUNILE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLENBQUMsdUJBQStCLEVBQUUsRUFBRSxDQUNyRSx3QkFBd0IsR0FBRyx1QkFBdUIsQ0FBQztBQUVwRCxNQUFNLENBQU4sSUFBa0IsZUFLakI7QUFMRCxXQUFrQixlQUFlO0lBQ2hDLG1EQUFnQyxDQUFBO0lBQ2hDLHdDQUFxQixDQUFBO0lBQ3JCLGlEQUE4QixDQUFBO0lBQzlCLHVEQUFvQyxDQUFBO0FBQ3JDLENBQUMsRUFMaUIsZUFBZSxLQUFmLGVBQWUsUUFLaEM7QUFFRCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDO0lBQzlDLHNEQUErQixFQUFFLElBQUk7SUFDckMsMkNBQTBCLEVBQUUsSUFBSTtJQUNoQyxvREFBOEIsRUFBRSxJQUFJO0lBQ3BDLDBEQUFpQyxFQUFFLElBQUk7Q0FDQyxDQUFzQixDQUFDO0FBRWhFLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUFvQztJQUNwRSxzREFBK0IsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsZ0JBQWdCLENBQUM7SUFDbEcsMkNBQTBCLEVBQUUsUUFBUSxDQUFDLCtCQUErQixFQUFFLFVBQVUsQ0FBQztJQUNqRixvREFBOEIsRUFBRSxRQUFRLENBQUMsb0NBQW9DLEVBQUUsaUJBQWlCLENBQUM7SUFDakcsMERBQWlDLEVBQUUsUUFBUSxDQUFDLHVDQUF1QyxFQUFFLG9CQUFvQixDQUFDO0NBQzFHLENBQUM7QUFDRixNQUFNLENBQUMsTUFBTSw0QkFBNEIsR0FBb0M7SUFDNUUsc0RBQStCLEVBQUUsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLDZEQUE2RCxDQUFDO0lBQ3RKLDJDQUEwQixFQUFFLFFBQVEsQ0FBQyxzQ0FBc0MsRUFBRSxpRUFBaUUsQ0FBQztJQUMvSSxvREFBOEIsRUFBRSxRQUFRLENBQUMsMkNBQTJDLEVBQUUsb0RBQW9ELENBQUM7SUFDM0ksMERBQWlDLEVBQUUsUUFBUSxDQUFDLDhDQUE4QyxFQUFFLHFEQUFxRCxDQUFDO0NBQ2xKLENBQUM7QUFFRixNQUFNLENBQUMsTUFBTSx1QkFBdUIsR0FBRyxLQUFLLENBQUM7QUFDN0MsTUFBTSxDQUFDLE1BQU0sbUJBQW1CLEdBQUcsNEJBQTRCLENBQUM7QUFDaEUsTUFBTSxDQUFDLE1BQU0sd0JBQXdCLEdBQUcseUJBQXlCLENBQUM7QUFRbEUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUc7SUFDdEMsaUJBQWlCLEVBQUU7UUFDbEIsT0FBTyxFQUFFLFFBQVE7UUFDakIsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFLHNDQUFzQyxDQUFDO1FBQ3ZFLEdBQUcsRUFBRSxFQUFFO0tBQ1A7Q0FDRCxDQUFDO0FBRUYsTUFBTSxrQkFBa0IsR0FBRztJQUMxQixlQUFlLEVBQUU7UUFDaEIsR0FBRyxFQUFFLDJCQUEyQjtRQUNoQyxPQUFPLEVBQUUsRUFBRTtLQUNYO0NBQ0QsQ0FBQztBQUVGLE1BQU0sZUFBZSxHQUFHLENBQUMsS0FBYyxFQUFrQixFQUFFLENBQUMsQ0FBQztJQUM1RCxHQUFHLEVBQUU7UUFDSixJQUFJLEVBQUUsUUFBUTtRQUNkLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxhQUFhLEVBQUUsNE1BQTRNLENBQUM7UUFDMVAsUUFBUSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsYUFBYSxFQUFFLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsRUFBRSxDQUFDO1FBQzdELFVBQVUsRUFBRTtZQUNYLEtBQUssRUFBRTtnQkFDTixXQUFXLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLDhJQUE4SSxDQUFDO2dCQUMxTCxRQUFRLEVBQUUsQ0FBQyxhQUFhLENBQUM7Z0JBQ3pCLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFLEVBQUUsQ0FBQzthQUN6RTtZQUNELEdBQUcsQ0FBQyxLQUFLLElBQUk7Z0JBQ1osS0FBSyxFQUFFO29CQUNOLG1CQUFtQixFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSx5RUFBeUUsQ0FBQztvQkFDN0gsS0FBSyxFQUFFO3dCQUNOOzRCQUNDLElBQUksRUFBRSxRQUFROzRCQUNkLFFBQVEsRUFBRSxDQUFDLE1BQU0sQ0FBQzs0QkFDbEIsVUFBVSxFQUFFO2dDQUNYLElBQUksRUFBRTtvQ0FDTCxJQUFJLEVBQUUsUUFBUTtvQ0FDZCxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUM7b0NBQ2QsV0FBVyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSxxQ0FBcUMsQ0FBQztpQ0FDM0Y7NkJBQ0Q7NEJBQ0Qsb0JBQW9CLEVBQUUsS0FBSzt5QkFDM0I7d0JBQ0Q7NEJBQ0MsSUFBSSxFQUFFLFFBQVE7NEJBQ2QsUUFBUSxFQUFFLENBQUMsTUFBTSxDQUFDOzRCQUNsQixVQUFVLEVBQUU7Z0NBQ1gsSUFBSSxFQUFFO29DQUNMLElBQUksRUFBRSxRQUFRO29DQUNkLElBQUksRUFBRSxDQUFDLFNBQVMsQ0FBQztvQ0FDakIsV0FBVyxFQUFFLFFBQVEsQ0FBQywrQkFBK0IsRUFBRSxnREFBZ0QsQ0FBQztpQ0FDeEc7Z0NBQ0QsV0FBVyxFQUFFO29DQUNaLElBQUksRUFBRSxRQUFRO29DQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsaUNBQWlDLENBQUM7aUNBQ3pGOzZCQUNEOzRCQUNELG9CQUFvQixFQUFFLEtBQUs7eUJBQzNCO3FCQUNEO2lCQUNEO2FBQ0QsQ0FBQztTQUNGO0tBQ0Q7Q0FDRCxDQUFDLENBQUM7QUFFSCxNQUFNLENBQUMsTUFBTSxvQkFBb0IsR0FBZ0I7SUFDaEQsSUFBSSxFQUFFLFFBQVE7SUFDZCxvQkFBb0IsRUFBRSxLQUFLO0lBQzNCLFFBQVEsRUFBRSxDQUFDLHVCQUF1QixDQUFDLGlCQUFpQixDQUFDLENBQUM7SUFDdEQsVUFBVSxFQUFFO1FBQ1gsSUFBSSxFQUFFO1lBQ0wsSUFBSSxFQUFFLFFBQVE7WUFDZCxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUM7WUFDZixXQUFXLEVBQUUsUUFBUSxDQUFDLG1CQUFtQixFQUFFLHlCQUF5QixDQUFDO1NBQ3JFO1FBQ0QsY0FBYyxFQUFFO1lBQ2YsSUFBSSxFQUFFLFNBQVM7WUFDZixPQUFPLEVBQUUsS0FBSztZQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsNkJBQTZCLEVBQUUsdURBQXVELENBQUM7U0FDN0c7UUFDRCxPQUFPLEVBQUU7WUFDUixJQUFJLEVBQUUsUUFBUTtZQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsZ0NBQWdDLENBQUM7U0FDL0U7UUFDRCxHQUFHLEVBQUU7WUFDSixJQUFJLEVBQUUsUUFBUTtZQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsa0JBQWtCLEVBQUUseUdBQXlHLENBQUM7WUFDcEosUUFBUSxFQUFFLENBQUMsb0JBQW9CLENBQUM7U0FDaEM7UUFDRCxJQUFJLEVBQUU7WUFDTCxJQUFJLEVBQUUsT0FBTztZQUNiLFdBQVcsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsaUNBQWlDLENBQUM7WUFDaEYsS0FBSyxFQUFFO2dCQUNOLElBQUksRUFBRSxRQUFRO2FBQ2Q7U0FDRDtRQUNELE9BQU8sRUFBRTtZQUNSLElBQUksRUFBRSxRQUFRO1lBQ2QsV0FBVyxFQUFFLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSxpRUFBaUUsQ0FBQztZQUNuSCxRQUFRLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQztTQUNyQztRQUNELEdBQUcsRUFBRTtZQUNKLFdBQVcsRUFBRSxRQUFRLENBQUMscUJBQXFCLEVBQUUsNkNBQTZDLENBQUM7WUFDM0Ysb0JBQW9CLEVBQUU7Z0JBQ3JCLEtBQUssRUFBRTtvQkFDTixFQUFFLElBQUksRUFBRSxNQUFNLEVBQUU7b0JBQ2hCLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTtvQkFDbEIsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO2lCQUNsQjthQUNEO1NBQ0Q7UUFDRCxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUM7S0FDeEI7Q0FDRCxDQUFDO0FBRUYsTUFBTSxDQUFDLE1BQU0sZUFBZSxHQUFnQjtJQUMzQyxFQUFFLEVBQUUsV0FBVztJQUNmLElBQUksRUFBRSxRQUFRO0lBQ2QsS0FBSyxFQUFFLFFBQVEsQ0FBQyxvQkFBb0IsRUFBRSxnQ0FBZ0MsQ0FBQztJQUN2RSxtQkFBbUIsRUFBRSxJQUFJO0lBQ3pCLGFBQWEsRUFBRSxJQUFJO0lBQ25CLG9CQUFvQixFQUFFLEtBQUs7SUFDM0IsVUFBVSxFQUFFO1FBQ1gsT0FBTyxFQUFFO1lBQ1IsV0FBVyxFQUFFLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSx3S0FBd0ssQ0FBQztZQUN2TixJQUFJLEVBQUUsUUFBUTtZQUNkLG9CQUFvQixFQUFFLEtBQUs7WUFDM0IsVUFBVSxFQUFFO2dCQUNYLE9BQU8sRUFBRTtvQkFDUixXQUFXLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLG1EQUFtRCxDQUFDO29CQUMxRyxJQUFJLEVBQUUsUUFBUTtvQkFDZCxvQkFBb0IsRUFBRSxLQUFLO29CQUMzQixVQUFVLEVBQUU7d0JBQ1gsY0FBYyxFQUFFOzRCQUNmLFdBQVcsRUFBRSxRQUFRLENBQUMsNkNBQTZDLEVBQUUsc0dBQXNHLENBQUM7NEJBQzVLLElBQUksRUFBRSxPQUFPOzRCQUNiLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7NEJBQ3pCLE9BQU8sRUFBRSxFQUFFO3lCQUNYO3dCQUNELGFBQWEsRUFBRTs0QkFDZCxXQUFXLEVBQUUsUUFBUSxDQUFDLDRDQUE0QyxFQUFFLHVGQUF1RixDQUFDOzRCQUM1SixJQUFJLEVBQUUsT0FBTzs0QkFDYixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFOzRCQUN6QixPQUFPLEVBQUUsRUFBRTt5QkFDWDtxQkFDRDtpQkFDRDtnQkFDRCxVQUFVLEVBQUU7b0JBQ1gsV0FBVyxFQUFFLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxtR0FBbUcsQ0FBQztvQkFDN0osSUFBSSxFQUFFLFFBQVE7b0JBQ2Qsb0JBQW9CLEVBQUUsS0FBSztvQkFDM0IsVUFBVSxFQUFFO3dCQUNYLFFBQVEsRUFBRTs0QkFDVCxXQUFXLEVBQUUsUUFBUSxDQUFDLDBDQUEwQyxFQUFFLGdJQUFnSSxDQUFDOzRCQUNuTSxJQUFJLEVBQUUsT0FBTzs0QkFDYixLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFOzRCQUN6QixPQUFPLEVBQUUsRUFBRTt5QkFDWDt3QkFDRCxVQUFVLEVBQUU7NEJBQ1gsV0FBVyxFQUFFLFFBQVEsQ0FBQyw0Q0FBNEMsRUFBRSwyRUFBMkUsQ0FBQzs0QkFDaEosSUFBSSxFQUFFLE9BQU87NEJBQ2IsS0FBSyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTs0QkFDekIsT0FBTyxFQUFFLEVBQUU7eUJBQ1g7d0JBQ0QsU0FBUyxFQUFFOzRCQUNWLFdBQVcsRUFBRSxRQUFRLENBQUMsMkNBQTJDLEVBQUUsb0ZBQW9GLENBQUM7NEJBQ3hKLElBQUksRUFBRSxPQUFPOzRCQUNiLEtBQUssRUFBRSxFQUFFLElBQUksRUFBRSxRQUFRLEVBQUU7NEJBQ3pCLE9BQU8sRUFBRSxFQUFFO3lCQUNYO3FCQUNEO2lCQUNEO2FBQ0Q7U0FDRDtRQUNELE9BQU8sRUFBRTtZQUNSLFFBQVEsRUFBRTtnQkFDVCx1QkFBdUI7Z0JBQ3ZCLGtCQUFrQjthQUNsQjtZQUNELG9CQUFvQixFQUFFO2dCQUNyQixLQUFLLEVBQUU7b0JBQ04sb0JBQW9CLEVBQUU7d0JBQ3JCLElBQUksRUFBRSxRQUFRO3dCQUNkLG9CQUFvQixFQUFFLEtBQUs7d0JBQzNCLFFBQVEsRUFBRSxDQUFDLEtBQUssQ0FBQzt3QkFDakIsUUFBUSxFQUFFLENBQUMsa0JBQWtCLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQy9DLFVBQVUsRUFBRTs0QkFDWCxJQUFJLEVBQUU7Z0NBQ0wsSUFBSSxFQUFFLFFBQVE7Z0NBQ2QsSUFBSSxFQUFFLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQztnQ0FDckIsV0FBVyxFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSx5QkFBeUIsQ0FBQzs2QkFDckU7NEJBQ0QsR0FBRyxFQUFFO2dDQUNKLElBQUksRUFBRSxRQUFRO2dDQUNkLE1BQU0sRUFBRSxLQUFLO2dDQUNiLE9BQU8sRUFBRSxrQkFBa0I7Z0NBQzNCLG1CQUFtQixFQUFFLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxrREFBa0QsQ0FBQztnQ0FDN0csV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxpREFBaUQsQ0FBQzs2QkFDNUY7NEJBQ0QsT0FBTyxFQUFFO2dDQUNSLElBQUksRUFBRSxRQUFRO2dDQUNkLFdBQVcsRUFBRSxRQUFRLENBQUMsc0JBQXNCLEVBQUUsd0NBQXdDLENBQUM7Z0NBQ3ZGLG9CQUFvQixFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRTs2QkFDeEM7NEJBQ0QsR0FBRyxlQUFlLENBQUMsS0FBSyxDQUFDO3lCQUN6QjtxQkFDRDtpQkFDRDthQUNEO1NBQ0Q7UUFDRCxNQUFNLEVBQUUsWUFBWSxDQUFDLFdBQVksQ0FBQyxNQUFNO0tBQ3hDO0NBQ0QsQ0FBQztBQUVGLE1BQU0sQ0FBQyxNQUFNLG9CQUFvQixHQUE0RDtJQUM1RixjQUFjLEVBQUUsOEJBQThCO0lBQzlDLHlCQUF5QixFQUFFLFFBQVEsQ0FBQyxFQUFFLFFBQVE7UUFDN0MsS0FBSyxNQUFNLE9BQU8sSUFBSSxRQUFRLEVBQUUsQ0FBQztZQUNoQyxJQUFJLE9BQU8sQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFDaEIsTUFBTSxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEMsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBQ0QsVUFBVSxFQUFFO1FBQ1gsV0FBVyxFQUFFLFFBQVEsQ0FBQyxrQ0FBa0MsRUFBRSw0SEFBNEgsQ0FBQztRQUN2TCxJQUFJLEVBQUUsT0FBTztRQUNiLGVBQWUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDcEQsS0FBSyxFQUFFO1lBQ04sb0JBQW9CLEVBQUUsS0FBSztZQUMzQixJQUFJLEVBQUUsUUFBUTtZQUNkLGVBQWUsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztZQUNsRCxVQUFVLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFO29CQUNILFdBQVcsRUFBRSxRQUFRLENBQUMscUNBQXFDLEVBQUUsK0JBQStCLENBQUM7b0JBQzdGLElBQUksRUFBRSxRQUFRO2lCQUNkO2dCQUNELEtBQUssRUFBRTtvQkFDTixXQUFXLEVBQUUsUUFBUSxDQUFDLHdDQUF3QyxFQUFFLGtDQUFrQyxDQUFDO29CQUNuRyxJQUFJLEVBQUUsUUFBUTtpQkFDZDtnQkFDRCxJQUFJLEVBQUU7b0JBQ0wsV0FBVyxFQUFFLFFBQVEsQ0FBQyx1Q0FBdUMsRUFBRSx5REFBeUQsQ0FBQztvQkFDekgsSUFBSSxFQUFFLFFBQVE7aUJBQ2Q7YUFDRDtTQUNEO0tBQ0Q7Q0FDRCxDQUFDO0FBRUYsTUFBTSxvQ0FBcUMsU0FBUSxVQUFVO0lBQTdEOztRQUVVLFNBQUksR0FBRyxPQUFPLENBQUM7SUF5QnpCLENBQUM7SUF2QkEsWUFBWSxDQUFDLFFBQTRCO1FBQ3hDLE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxXQUFXLEVBQUUsNEJBQTRCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLDRCQUE0QixDQUFDLElBQUksUUFBUSxDQUFDLFdBQVcsQ0FBQyw0QkFBNEIsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO0lBQ2pNLENBQUM7SUFFRCxNQUFNLENBQUMsUUFBNEI7UUFDbEMsTUFBTSw0QkFBNEIsR0FBRyxRQUFRLENBQUMsV0FBVyxFQUFFLDRCQUE0QixJQUFJLEVBQUUsQ0FBQztRQUM5RixNQUFNLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sRUFBRSxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sSUFBSSxHQUFpQiw0QkFBNEI7YUFDckQsR0FBRyxDQUFDLDJCQUEyQixDQUFDLEVBQUU7WUFDbEMsT0FBTztnQkFDTixJQUFJLGNBQWMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxLQUFLLDJCQUEyQixDQUFDLEVBQUUsSUFBSSxDQUFDO2dCQUM1RSwyQkFBMkIsQ0FBQyxLQUFLO2FBQ2pDLENBQUM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVKLE9BQU87WUFDTixJQUFJLEVBQUU7Z0JBQ0wsT0FBTztnQkFDUCxJQUFJO2FBQ0o7WUFDRCxPQUFPLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQztTQUNsQixDQUFDO0lBQ0gsQ0FBQztDQUNEO0FBRUQsUUFBUSxDQUFDLEVBQUUsQ0FBNkIsVUFBVSxDQUFDLHlCQUF5QixDQUFDLENBQUMsd0JBQXdCLENBQUM7SUFDdEcsRUFBRSxFQUFFLHVCQUF1QjtJQUMzQixLQUFLLEVBQUUsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGFBQWEsQ0FBQztJQUM5RCxNQUFNLEVBQUU7UUFDUCxTQUFTLEVBQUUsS0FBSztLQUNoQjtJQUNELFFBQVEsRUFBRSxJQUFJLGNBQWMsQ0FBQyxvQ0FBb0MsQ0FBQztDQUNsRSxDQUFDLENBQUMifQ==