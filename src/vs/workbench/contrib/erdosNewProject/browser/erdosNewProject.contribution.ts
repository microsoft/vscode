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

registerSingleton(IErdosNewFolderService, ErdosNewFolderService, InstantiationType.Delayed);

class ErdosNewFolderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.erdosNewFolder';

	constructor(
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IErdosNewFolderService private readonly _erdosNewFolderService: IErdosNewFolderService,
	) {
		super();

		if (
			this._lifecycleService.startupKind === StartupKind.NewWindow ||
			this._lifecycleService.startupKind === StartupKind.ReopenedWindow
		) {
			this.run().then(undefined, onUnexpectedError);
		}
	}

	private async run() {
		await this._lifecycleService.when(LifecyclePhase.Restored);
		await this._erdosNewFolderService.initNewFolder();
	}
}

registerWorkbenchContribution2(ErdosNewFolderContribution.ID, ErdosNewFolderContribution, WorkbenchPhase.AfterRestored);
