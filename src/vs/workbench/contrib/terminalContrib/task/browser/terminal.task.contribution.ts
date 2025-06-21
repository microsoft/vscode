/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ITerminalCompletionService } from '../../suggest/browser/terminalCompletionService.js';
import { TaskCompletionProvider } from './taskCompletionProvider.js';

class TaskCompletionContribution extends Disposable {

	static ID = 'workbench.contrib.terminal.taskCompletion';

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalCompletionService private readonly _terminalCompletionService: ITerminalCompletionService
	) {
		super();

		// Register the task completion provider
		const taskCompletionProvider = this._instantiationService.createInstance(TaskCompletionProvider);
		this._register(this._terminalCompletionService.registerTerminalCompletionProvider(
			'tasks',
			taskCompletionProvider.id,
			taskCompletionProvider
		));
	}
}

registerWorkbenchContribution2(TaskCompletionContribution.ID, TaskCompletionContribution, WorkbenchPhase.AfterRestored);
