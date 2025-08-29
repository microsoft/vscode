/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { AutoOpenTesting, getTestingConfiguration, TestingConfigKeys } from '../common/configuration.js';
import { Testing } from '../common/constants.js';
import { ITestCoverageService } from '../common/testCoverageService.js';
import { isFailedState } from '../common/testingStates.js';
import { LiveTestResult, TestResultItemChangeReason } from '../common/testResult.js';
import { ITestResultService } from '../common/testResultService.js';
import { ExplorerTestCoverageBars } from './testCoverageBars.js';

/** Workbench contribution that triggers updates in the TestingProgressUi service */
export class TestingProgressTrigger extends Disposable {
	public static readonly ID = 'workbench.contrib.testing.progressTrigger';

	constructor(
		@ITestResultService resultService: ITestResultService,
		@ITestCoverageService testCoverageService: ITestCoverageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IViewsService private readonly viewsService: IViewsService,
	) {
		super();

		this._register(resultService.onResultsChanged((e) => {
			if ('started' in e) {
				this.attachAutoOpenForNewResults(e.started);
			}
		}));

		const barContributionRegistration = autorun(reader => {
			const hasCoverage = !!testCoverageService.selected.read(reader);
			if (!hasCoverage) {
				return;
			}

			barContributionRegistration.dispose();
			ExplorerTestCoverageBars.register();
		});

		this._register(barContributionRegistration);
	}

	private attachAutoOpenForNewResults(result: LiveTestResult) {
		if (result.request.preserveFocus === true) {
			return;
		}

		const cfg = getTestingConfiguration(this.configurationService, TestingConfigKeys.OpenResults);
		if (cfg === AutoOpenTesting.NeverOpen) {
			return;
		}

		if (cfg === AutoOpenTesting.OpenExplorerOnTestStart) {
			return this.openExplorerView();
		}

		if (cfg === AutoOpenTesting.OpenOnTestStart) {
			return this.openResultsView();
		}

		// open on failure
		const disposable = new DisposableStore();
		disposable.add(result.onComplete(() => disposable.dispose()));
		disposable.add(result.onChange(e => {
			if (e.reason === TestResultItemChangeReason.OwnStateChange && isFailedState(e.item.ownComputedState)) {
				this.openResultsView();
				disposable.dispose();
			}
		}));
	}

	private openExplorerView() {
		this.viewsService.openView(Testing.ExplorerViewId, false);
	}

	private openResultsView() {
		this.viewsService.openView(Testing.ResultsViewId, false);
	}
}
