/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contains all MCP command IDs used in the workbench.
 */
export const enum McpCommandIds {
	ListServer = 'workbench.mcp.listServer',
	ServerOptions = 'workbench.mcp.serverOptions',
	ResetTrust = 'workbench.mcp.resetTrust',
	ResetCachedTools = 'workbench.mcp.resetCachedTools',
	AddConfiguration = 'workbench.mcp.addConfiguration',
	RemoveStoredInput = 'workbench.mcp.removeStoredInput',
	EditStoredInput = 'workbench.mcp.editStoredInput',
	BrowseResources = 'workbench.mcp.browseResources',
	ShowConfiguration = 'workbench.mcp.showConfiguration',
	ShowOutput = 'workbench.mcp.showOutput',
	RestartServer = 'workbench.mcp.restartServer',
	StartServer = 'workbench.mcp.startServer',
	StopServer = 'workbench.mcp.stopServer',
	InstallFromActivation = 'workbench.mcp.installFromActivation',
	Browse = 'workbench.mcp.browseServers'
}
