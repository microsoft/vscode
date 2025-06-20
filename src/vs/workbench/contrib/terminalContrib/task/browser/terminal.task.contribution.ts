/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ITerminalCompletionService } from '../../suggest/browser/terminalCompletionService.js';
import { TaskCompletionProvider } from './taskCompletionProvider.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../../common/contributions.js';
import { LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';

class TaskCompletionContribution extends Disposable {
	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService
	) {
		super();
		
		// Register the task completion provider
		const taskCompletionProvider = this._instantiationService.createInstance(TaskCompletionProvider);
		this.add(this._terminalCompletionService.registerTerminalCompletionProvider(
			'tasks',
			taskCompletionProvider.id,
			taskCompletionProvider
		));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(TaskCompletionContribution, LifecyclePhase.Restored);