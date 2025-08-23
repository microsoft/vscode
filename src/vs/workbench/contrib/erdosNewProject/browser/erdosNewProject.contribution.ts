/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ILifecycleService, LifecyclePhase, StartupKind } from '../../../services/lifecycle/common/lifecycle.js';
import { IErdosNewFolderService } from '../../../services/erdosNewFolder/common/erdosNewFolder.js';
import { ErdosNewFolderService } from '../../../services/erdosNewFolder/common/erdosNewFolderService.js';

// Register the Erdos New Folder service
registerSingleton(IErdosNewFolderService, ErdosNewFolderService, InstantiationType.Delayed);

/**
 * Erdos New Project Contribution.
 * Handles new project/folder creation workflows and initialization.
 */
class ErdosNewProjectContribution extends Disposable implements IWorkbenchContribution {
	
	static readonly ID = 'workbench.contrib.erdosNewProject';

	/**
	 * Create a new instance of the ErdosNewProjectContribution.
	 * @param _lifecycleService The lifecycle service.
	 * @param _erdosNewFolderService The Erdos New Folder service.
	 */
	constructor(
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IErdosNewFolderService private readonly _erdosNewFolderService: IErdosNewFolderService,
	) {
		super();

		// Initialize new folder workflow if this is a new window or reopened window
		// This handles cases where the user creates a new project or opens an existing one
		if (
			this._lifecycleService.startupKind === StartupKind.NewWindow ||
			this._lifecycleService.startupKind === StartupKind.ReopenedWindow
		) {
			this.run().then(undefined, onUnexpectedError);
		}
	}

	/**
	 * Run the Erdos New Project contribution, which initializes the new folder if applicable.
	 */
	private async run() {
		// Wait until after the workbench has been restored
		await this._lifecycleService.when(LifecyclePhase.Restored);
		
		// Initialize new folder workflow
		await this._erdosNewFolderService.initNewFolder();
	}
}

// Register the ErdosNewProjectContribution
registerWorkbenchContribution2(ErdosNewProjectContribution.ID, ErdosNewProjectContribution, WorkbenchPhase.BlockRestore);
