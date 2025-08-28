/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ErdosWorkspaceManager } from './erdosWorkspaceManager.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/**
 * Erdos Workspace Contribution - provides workspace-level coordination.
 * This replaces the traditional session container approach with a more flexible
 * workspace management system.
 */
class ErdosWorkspaceContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosWorkspace';

	private workspaceManager: ErdosWorkspaceManager;

	constructor(
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@ILogService logService: ILogService
	) {
		super();
		
		// Create workspace manager for coordination
		this.workspaceManager = this._register(new ErdosWorkspaceManager(workspaceService, logService));
		
		// Set up workspace state monitoring
		this._register(this.workspaceManager.onDidChangeWorkspaceState((state) => {
			logService.info(`ErdosWorkspace: Workspace state changed to ${state}`);
		}));
	}

	public getWorkspaceManager(): ErdosWorkspaceManager {
		return this.workspaceManager;
	}
}

// Register the Erdos Workspace contribution
registerWorkbenchContribution2(ErdosWorkspaceContribution.ID, ErdosWorkspaceContribution, WorkbenchPhase.BlockRestore);
