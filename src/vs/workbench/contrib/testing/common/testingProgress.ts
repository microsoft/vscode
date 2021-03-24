/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { TestResult } from 'vs/workbench/api/common/extHostTypes';
import { TestStateCount } from 'vs/workbench/contrib/testing/common/testResultService';

type CountSummary = ReturnType<typeof collectTestStateCounts>;

export const collectTestStateCounts = (...counts: ReadonlyArray<TestStateCount>) => {
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let running = 0;
	let queued = 0;

	for (const count of counts) {
		failed += count[TestResult.Errored] + count[TestResult.Failed];
		passed += count[TestResult.Passed];
		skipped += count[TestResult.Skipped];
		running += count[TestResult.Running];
		queued += count[TestResult.Queued];
	}

	return {
		passed,
		failed,
		runSoFar: passed + failed,
		totalWillBeRun: passed + failed + queued + running,
		skipped,
	};
};

export const getTestProgressText = (running: boolean, { passed, runSoFar, skipped, failed, totalWillBeRun }: CountSummary) => {
	let percent = passed / runSoFar * 100;
	if (failed > 0) {
		// fix: prevent from rounding to 100 if there's any failed test
		percent = Math.min(percent, 99.9);
	} else if (runSoFar === 0) {
		percent = 0;
	}

	if (running) {
		if (skipped === 0) {
			return localize('testProgress.running', 'Running {0} tests, {1}/{2} passed ({3}%)', totalWillBeRun, passed, runSoFar, percent.toPrecision(3));
		} else {
			return localize('testProgressWithSkip.running', 'Running {0} tests, {1}/{2} tests passed ({3}%, {4} skipped)', totalWillBeRun, passed, runSoFar, percent.toPrecision(3), skipped);
		}
	} else {
		if (skipped === 0) {
			return localize('testProgress.completed', '{0}/{1} tests passed ({2}%)', passed, runSoFar, percent.toPrecision(3));
		} else {
			return localize('testProgressWithSkip.completed', '{0}/{1} tests passed ({2}%, {3} skipped)', passed, runSoFar, percent.toPrecision(3), skipped);
		}
	}
};
