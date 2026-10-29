/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IUnattendedRestartService } from '../../../services/lifecycle/common/unattendedRestart.js';
import { ITestResult } from '../common/testResult.js';
import { ITestResultService } from '../common/testResultService.js';
import { ITestingContinuousRunService } from '../common/testingContinuousRunService.js';

/**
 * Blocks an unattended restart while tests run, which the restart would end, or while
 * continuous test mode is on, which is not turned back on after a restart.
 */
export class TestingUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.testingUnattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@ITestResultService testResultService: ITestResultService,
		@ITestingContinuousRunService testingContinuousRunService: ITestingContinuousRunService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({
			check: () => getTestingUnattendedRestartBlocker(testResultService.results, testingContinuousRunService.isEnabled())
		}));
	}
}

export function getTestingUnattendedRestartBlocker(results: readonly Pick<ITestResult, 'completedAt'>[], isContinuousRunEnabled: boolean): string | undefined {
	if (results.some(result => result.completedAt === undefined)) {
		return 'testing.runInProgress';
	}

	if (isContinuousRunEnabled) {
		return 'testing.continuousRun';
	}

	return undefined;
}
