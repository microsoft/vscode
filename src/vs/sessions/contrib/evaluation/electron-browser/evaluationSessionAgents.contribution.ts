/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Disposable, DisposableStore, thenRegisterOrDispose } from '../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { INativeWorkbenchEnvironmentService } from '../../../../workbench/services/environment/electron-browser/environmentService.js';

class EvaluationSessionAgentsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.evaluationSessionAgents';
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
			import('./evaluationSessionAgents.js').then(({ EvaluationSessionAgentsRunner }) =>
				instantiationService.createInstance(EvaluationSessionAgentsRunner, path)
			),
			this.runnerStore,
		).catch(onUnexpectedError);
	}
}

registerWorkbenchContribution2(EvaluationSessionAgentsContribution.ID, EvaluationSessionAgentsContribution, WorkbenchPhase.AfterRestored);
