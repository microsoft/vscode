/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { PlanningModeController } from '../browser/planningModeController.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Disposable } from '../../../../base/common/lifecycle.js';

class PlanningModeWorkbenchContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.planningMode';

	private readonly planningModeController: PlanningModeController;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		// Create the main planning mode controller which wires up all sub-components
		this.planningModeController = this._register(instantiationService.createInstance(PlanningModeController));
	}
}

// Register the contribution to be instantiated when the workbench starts
registerWorkbenchContribution2(
	PlanningModeWorkbenchContribution.ID,
	PlanningModeWorkbenchContribution,
	WorkbenchPhase.BlockRestore // Initialize early to catch file operations
);
