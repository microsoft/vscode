/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IMcpWorkspaceInstallTargetService, McpWorkspaceInstallTargetService, McpWorkspaceInstallTarget } from '../../../../workbench/services/mcp/common/mcpWorkspaceInstallTargetService.js';

export class SessionsMcpWorkspaceInstallTargetService extends McpWorkspaceInstallTargetService {
	override getTargets(): readonly McpWorkspaceInstallTarget[] {
		// The synthetic workspace stores window settings, not project MCP configuration.
		return this.workspaceService.getWorkspace().folders;
	}
}

registerSingleton(IMcpWorkspaceInstallTargetService, SessionsMcpWorkspaceInstallTargetService, InstantiationType.Delayed);
