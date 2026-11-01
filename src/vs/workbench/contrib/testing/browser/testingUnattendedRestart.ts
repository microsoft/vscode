/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';
import { ITestResult } from '../common/testResult.js';
import { ITestResultService } from '../common/testResultService.js';

/**
 * Blocks an unattended restart while tests run, which the restart would end. Continuous
 * test mode blocks in `TestingContinuousRunService`, without creating it in every window.
 */
export class TestingUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.testingUnattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@ITestResultService testResultService: ITestResultService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({
			check: () => getTestingUnattendedRestartBlocker(testResultService.results)
		}));
	}
}

export function getTestingUnattendedRestartBlocker(results: readonly Pick<ITestResult, 'completedAt'>[]): string | undefined {
	return results.some(result => result.completedAt === undefined) ? 'testing.runInProgress' : undefined;
}
