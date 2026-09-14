/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { OPEN_SESSION_COMPARISON_COMMAND_ID } from '../common/sessionComparison.js';
import { SessionComparisonToolContribution } from './sessionComparisonTool.js';
import { ISessionComparisonViewService, SessionComparisonViewService } from './sessionComparisonViewService.js';

registerSingleton(ISessionComparisonViewService, SessionComparisonViewService, InstantiationType.Delayed);

registerWorkbenchContribution2(SessionComparisonToolContribution.ID, SessionComparisonToolContribution, WorkbenchPhase.Eventually);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: OPEN_SESSION_COMPARISON_COMMAND_ID,
			title: localize2('openSessionComparison', "Open Attempt Comparison"),
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, comparisonId: string): Promise<void> {
		await accessor.get(ISessionComparisonViewService).open(comparisonId);
	}
});
