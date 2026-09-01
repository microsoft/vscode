/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, thenRegisterOrDispose } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../services/environment/electron-browser/environmentService.js';

class EvaluationSessionEditorContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.evaluationSessionEditor';
	private readonly runnerStore = this._register(new DisposableStore());

	constructor(
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const path = environmentService.evaluationSessionRequest;
		if (!path) {
			return;
		}
		void thenRegisterOrDispose(
			import('./evaluationSessionEditor.js').then(({ EvaluationSessionEditorRunner }) =>
				instantiationService.createInstance(EvaluationSessionEditorRunner, path)
			),
			this.runnerStore,
		).catch(onUnexpectedError);
	}
}

registerWorkbenchContribution2(EvaluationSessionEditorContribution.ID, EvaluationSessionEditorContribution, WorkbenchPhase.AfterRestored);
