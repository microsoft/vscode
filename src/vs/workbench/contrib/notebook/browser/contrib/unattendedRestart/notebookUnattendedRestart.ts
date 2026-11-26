/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { IUnattendedRestartService } from '../../../../../services/lifecycle/common/unattendedRestart.js';
import { INotebookKernelService } from '../../../common/notebookKernelService.js';
import { INotebookService } from '../../../common/notebookService.js';

/**
 * Blocks an unattended restart while a notebook has a kernel, since restarting
 * would discard the in-memory state of that kernel.
 */
class NotebookUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.notebookUnattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@INotebookService private readonly notebookService: INotebookService,
		@INotebookKernelService private readonly notebookKernelService: INotebookKernelService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({
			check: () => this.hasSelectedKernel() ? 'notebook.kernelSelected' : undefined
		}));
	}

	private hasSelectedKernel(): boolean {
		for (const notebook of this.notebookService.getNotebookTextModels()) {
			if (this.notebookKernelService.getMatchingKernel(notebook).selected) {
				return true;
			}
		}

		return false;
	}
}

registerWorkbenchContribution2(NotebookUnattendedRestartParticipant.ID, NotebookUnattendedRestartParticipant, WorkbenchPhase.AfterRestored);
