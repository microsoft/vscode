/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter } from '../../../../base/common/event.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/**
 * Manages Erdos workspace state and provides coordination between different components.
 * This is a different approach from traditional view containers - it focuses on 
 * workspace-level coordination rather than UI container management.
 */
export class ErdosWorkspaceManager extends Disposable {
	
	private readonly _onDidChangeWorkspaceState = this._register(new Emitter<WorkspaceState>());
	public readonly onDidChangeWorkspaceState = this._onDidChangeWorkspaceState.event;

	private _currentState: WorkspaceState = WorkspaceState.Initializing;

	constructor(
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.initializeWorkspace();
	}

	private async initializeWorkspace(): Promise<void> {
		this.logService.info('ErdosWorkspaceManager: Initializing workspace coordination');
		
		// Monitor workspace changes
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(() => {
			this.updateWorkspaceState();
		}));

		this.updateWorkspaceState();
	}

	private updateWorkspaceState(): void {
		const workspace = this.workspaceService.getWorkspace();
		const newState = workspace.folders.length > 0 ? WorkspaceState.Active : WorkspaceState.Empty;
		
		if (newState !== this._currentState) {
			this._currentState = newState;
			this._onDidChangeWorkspaceState.fire(newState);
			this.logService.debug(`ErdosWorkspaceManager: State changed to ${WorkspaceState[newState]}`);
		}
	}

	public get currentState(): WorkspaceState {
		return this._currentState;
	}

	public isWorkspaceReady(): boolean {
		return this._currentState === WorkspaceState.Active;
	}
}

export enum WorkspaceState {
	Initializing = 0,
	Empty = 1,
	Active = 2
}
