/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { INotebookExecutionStateService } from '../../../common/notebookExecutionStateService.js';

export class NotebookExecutionRestartVeto extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookExecutionRestartVeto';

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@INotebookExecutionStateService private readonly notebookExecutionStateService: INotebookExecutionStateService
	) {
		super();

		this._register(extensionService.onWillStop(evt => {
			// Check if there are any running notebook cell executions
			const hasRunningExecutions = this.notebookExecutionStateService.hasRunningExecutions();
			if (hasRunningExecutions) {
				evt.veto(
					true,
					localize('notebookExecutionRunning', 'A notebook cell is still running that would terminate.')
				);
			}
		}));
	}
}
