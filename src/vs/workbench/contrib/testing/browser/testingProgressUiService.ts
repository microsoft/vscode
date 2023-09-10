/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewsService } from 'vs/workbench/common/views';
import { AutoOpenTesting, getTestingConfiguration, TestingConfigKeys } from 'vs/workbench/contrib/testing/common/configuration';
import { Testing } from 'vs/workbench/contrib/testing/common/constants';
import { isFailedState } from 'vs/workbench/contrib/testing/common/testingStates';
import { ITestResult, LiveTestResult, TestResultItemChangeReason } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';
import { TestResultState } from 'vs/workbench/contrib/testing/common/testTypes';

/** Workbench contribution that triggers updates in the TestingProgressUi service */
export class TestingProgressTrigger extends Disposable {
	constructor(
		@ITestResultService resultService: ITestResultService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		this._register(resultService.onResultsChanged((e) => {
			if ('started' in e) {
				this.attachAutoOpenForNewResults(e.started);
			}
		}));
	}

	private attachAutoOpenForNewResults(result: LiveTestResult) {
		if (result.request.isUiTriggered === false) {
			return;
		}

		const cfg = getTestingConfiguration(this.configurationService, TestingConfigKeys.OpenTesting);
		if (cfg === AutoOpenTesting.NeverOpen) {
			return;
		}

		if (cfg === AutoOpenTesting.OpenOnTestStart) {
			return this.openTestView();
		}

		// open on failure
		const disposable = new DisposableStore();
		disposable.add(result.onComplete(() => disposable.dispose()));
		disposable.add(result.onChange(e => {
			if (e.reason === TestResultItemChangeReason.OwnStateChange && isFailedState(e.item.ownComputedState)) {
				this.openTestView();
				disposable.dispose();
			}
		}));
	}

	private openTestView() {
		this.viewsService.openView(Testing.ResultsViewId, false);
	}
}

export type CountSummary = ReturnType<typeof collectTestStateCounts>;

export const collectTestStateCounts = (isRunning: boolean, results: ReadonlyArray<ITestResult>) => {
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let running = 0;
	let queued = 0;

	for (const result of results) {
		const count = result.counts;
		failed += count[TestResultState.Errored] + count[TestResultState.Failed];
		passed += count[TestResultState.Passed];
		skipped += count[TestResultState.Skipped];
		running += count[TestResultState.Running];
		queued += count[TestResultState.Queued];
	}

	return {
		isRunning,
		passed,
		failed,
		runSoFar: passed + failed,
		totalWillBeRun: passed + failed + queued + running,
		skipped,
	};
};

export const getTestProgressText = ({ isRunning, passed, runSoFar, totalWillBeRun, skipped, failed }: CountSummary) => {
	let percent = passed / runSoFar * 100;
	if (failed > 0) {
		// fix: prevent from rounding to 100 if there's any failed test
		percent = Math.min(percent, 99.9);
	} else if (runSoFar === 0) {
		percent = 0;
	}

	if (isRunning) {
		if (runSoFar === 0) {
			return localize('testProgress.runningInitial', 'Running tests...');
		} else if (skipped === 0) {
			return localize('testProgress.running', 'Running tests, {0}/{1} passed ({2}%)', passed, totalWillBeRun, percent.toPrecision(3));
		} else {
			return localize('testProgressWithSkip.running', 'Running tests, {0}/{1} tests passed ({2}%, {3} skipped)', passed, totalWillBeRun, percent.toPrecision(3), skipped);
		}
	} else {
		if (skipped === 0) {
			return localize('testProgress.completed', '{0}/{1} tests passed ({2}%)', passed, runSoFar, percent.toPrecision(3));
		} else {
			return localize('testProgressWithSkip.completed', '{0}/{1} tests passed ({2}%, {3} skipped)', passed, runSoFar, percent.toPrecision(3), skipped);
		}
	}
};
