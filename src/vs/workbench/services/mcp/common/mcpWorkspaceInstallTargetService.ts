/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationTarget } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';

export type McpWorkspaceInstallTarget = ConfigurationTarget.WORKSPACE | IWorkspaceFolder;

export const IMcpWorkspaceInstallTargetService = createDecorator<IMcpWorkspaceInstallTargetService>('mcpWorkspaceInstallTargetService');

export interface IMcpWorkspaceInstallTargetService {
	readonly _serviceBrand: undefined;

	/** Returns supported workspace destinations for MCP installation, independent of configuration format. */
	getTargets(): readonly McpWorkspaceInstallTarget[];
}

export class McpWorkspaceInstallTargetService implements IMcpWorkspaceInstallTargetService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkspaceContextService protected readonly workspaceService: IWorkspaceContextService,
	) { }

	getTargets(): readonly McpWorkspaceInstallTarget[] {
		const state = this.workspaceService.getWorkbenchState();
		if (state === WorkbenchState.EMPTY) {
			return [];
		}
		const workspace = this.workspaceService.getWorkspace();
		return state === WorkbenchState.WORKSPACE && workspace.configuration
			? [...workspace.folders, ConfigurationTarget.WORKSPACE]
			: workspace.folders;
	}
}

registerSingleton(IMcpWorkspaceInstallTargetService, McpWorkspaceInstallTargetService, InstantiationType.Delayed);
