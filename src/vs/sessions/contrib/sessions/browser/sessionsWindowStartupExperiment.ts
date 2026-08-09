/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IWorkbenchAssignmentService } from '../../../../workbench/services/assignment/common/assignmentService.js';

export const AGENTS_WINDOW_STARTUP_AA_EXPERIMENT = 'agentsWindowStartupAA';

export class SessionsWindowStartupExperiment implements IWorkbenchContribution {

	static readonly ID = 'sessions.windowStartupExperiment';

	constructor(
		@IWorkbenchAssignmentService assignmentService: IWorkbenchAssignmentService,
	) {
		void assignmentService.getTreatment<boolean>(AGENTS_WINDOW_STARTUP_AA_EXPERIMENT);
	}
}
