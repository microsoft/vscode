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
