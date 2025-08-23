/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ErdosDialogService } from './erdosDialogService.js';
import { IErdosDialogService } from '../../../services/erdosDialogs/common/erdosDialogs.js';

// Register the erdosDialog service
registerSingleton(IErdosDialogService, ErdosDialogService, InstantiationType.Delayed);

/**
 * Erdos Dialogs Contribution.
 * Ensures the dialog service is available throughout the workbench.
 */
class ErdosDialogsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.erdosDialogs';

	constructor(
		@IErdosDialogService _erdosDialogService: IErdosDialogService
	) {
		super();
		// Service is ready and available
		// The service parameter ensures it's instantiated when this contribution loads
	}
}

// Register the contribution
registerWorkbenchContribution2(ErdosDialogsContribution.ID, ErdosDialogsContribution, WorkbenchPhase.BlockRestore);
