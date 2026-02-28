/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';

export const mcpServerIcon = registerIcon('mcp-server', Codicon.mcp, localize('mcpServer', 'Icon used for the MCP server.'));
export const mcpServerRemoteIcon = registerIcon('mcp-server-remote', Codicon.remote, localize('mcpServerRemoteIcon', 'Icon to indicate that an MCP server is for the remote user scope.'));
export const mcpServerWorkspaceIcon = registerIcon('mcp-server-workspace', Codicon.rootFolder, localize('mcpServerWorkspaceIcon', 'Icon to indicate that an MCP server is for the workspace scope.'));
export const mcpStarredIcon = registerIcon('mcp-server-starred', Codicon.starFull, localize('starredIcon', 'Icon shown along with the starred status.'));
export const mcpLicenseIcon = registerIcon('mcp-server-license', Codicon.law, localize('licenseIcon', 'Icon shown along with the license status.'));
