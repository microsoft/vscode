/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';

export const MCP_WORKSPACE_CONFIGURATION_FILE = '.mcp.json';
export const MCP_GLOBAL_CONFIGURATION_FILE = 'mcp-config.json';

export function getWorkspaceMcpConfigurationResource(workspaceFolder: URI): URI {
	return joinPath(workspaceFolder, MCP_WORKSPACE_CONFIGURATION_FILE);
}

export function getGlobalMcpConfigurationResource(userHome: URI, copilotHome?: URI): URI {
	return joinPath(copilotHome ?? joinPath(userHome, '.copilot'), MCP_GLOBAL_CONFIGURATION_FILE);
}

export function isMcpServersConfigurationResource(resource: URI): boolean {
	const resourceBasename = basename(resource);
	return resourceBasename === MCP_WORKSPACE_CONFIGURATION_FILE || resourceBasename === MCP_GLOBAL_CONFIGURATION_FILE;
}
