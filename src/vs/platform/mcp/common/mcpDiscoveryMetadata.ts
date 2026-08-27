/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const enum McpDiscoverySource {
	VSCodeUserConfig = 'vscodeUserConfig',
	VSCodeRemoteUserConfig = 'vscodeRemoteUserConfig',
	VSCodeWorkspaceConfig = 'vscodeWorkspaceConfig',
	VSCodeWorkspaceFolderConfig = 'vscodeWorkspaceFolderConfig',
	WorkspaceDotMcp = 'workspaceDotMcp',
	ClaudeDesktop = 'claudeDesktop',
	CursorGlobal = 'cursorGlobal',
	CursorWorkspace = 'cursorWorkspace',
	Windsurf = 'windsurf',
	Extension = 'extension',
	Plugin = 'plugin',
}

export const enum McpDiscoveryFormat {
	VSCodeServers = 'vscodeServers',
	ClaudeMcpServers = 'claudeMcpServers',
	ExtensionProvider = 'extensionProvider',
	PluginMap = 'pluginMap',
}

export const enum McpDiscoveryHost {
	Local = 'local',
	Remote = 'remote',
	Unknown = 'unknown',
}

export const enum McpDiscoveryScope {
	Profile = 'profile',
	Workspace = 'workspace',
	WorkspaceFolder = 'workspaceFolder',
	Extension = 'extension',
	Plugin = 'plugin',
}

export const enum McpInstallProvenance {
	Gallery = 'gallery',
	Local = 'local',
	NotApplicable = 'notApplicable',
}

export interface IMcpDiscoveryMetadata {
	readonly source: McpDiscoverySource;
	readonly format: McpDiscoveryFormat;
	readonly host: McpDiscoveryHost;
	readonly scope: McpDiscoveryScope;
}

export const mcpConfigurationFoundEventName = 'mcp/configurationFound';

export interface IMcpConfigurationFoundEvent {
	source: McpDiscoverySource | 'all';
	format: McpDiscoveryFormat | 'all';
	scope: McpDiscoveryScope | 'all';
	host: McpDiscoveryHost | 'all';
	configurationPresent: number;
	configuredEntryCount: number;
	parseErrorCount: number;
	unreadableCount: number;
}

export type McpConfigurationFoundClassification = {
	source: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration source.' };
	format: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration format.' };
	scope: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Fixed MCP configuration scope.' };
	host: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the configuration belongs to the local or remote host.' };
	configurationPresent: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of explicit configuration files or sections found.' };
	configuredEntryCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of configured MCP entries without reporting identities or values.' };
	parseErrorCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of malformed MCP configurations.' };
	unreadableCount: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Number of unreadable MCP configurations.' };
	owner: 'digitarald';
	comment: 'Reports privacy-safe MCP configuration-file presence and outcomes.';
};
