/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { language } from 'vs/base/common/platform';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/productService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Severity, INotificationService } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ITASExperimentService } from 'vs/workbench/services/experiment/common/experimentService';
import { URI } from 'vs/base/common/uri';
import { platform } from 'vs/base/common/process';

const WAIT_TIME_TO_SHOW_SURVEY = 1000 * 60 * 60; // 1 hours
const MAX_INSTALL_AGE = 1000 * 60 * 60 * 8; // 8 hours
const REMIND_LATER_DELAY = 1000 * 60 * 60 * 8; // 8 hours
const SKIP_VERSION_KEY = 'ces/skipVersion';
const REMIND_LATER_DATE_KEY = 'ces/remindLaterDate';
const IS_CANDIDATE_KEY = 'ces/isCandidate';

class CESContribution implements IWorkbenchContribution {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@optional(ITASExperimentService) private readonly tasExperimentService: ITASExperimentService,
	) {
		console.log(this);
		if (!productService.cesSurveyUrl) {
			return;
		}

		const skipVersion = storageService.get(SKIP_VERSION_KEY, StorageScope.GLOBAL, '');
		if (skipVersion) {
			return;
		}
		this.scheduleSurvey();
	}

	private async scheduleSurvey(): Promise<void> {
		const isExperimentCandidate = await this.tasExperimentService?.getTreatment<boolean>('CESSurvey');
		const isCandidate = this.storageService.getBoolean(IS_CANDIDATE_KEY, StorageScope.GLOBAL, isExperimentCandidate);

		this.storageService.store(IS_CANDIDATE_KEY, isCandidate, StorageScope.GLOBAL, StorageTarget.USER);

		if (!isCandidate) {
			this.skipVersion();
			return;
		}

		let waitTimeToShowSurvey = 0;
		const remindLaterDate = this.storageService.get(REMIND_LATER_DATE_KEY, StorageScope.GLOBAL, '');
		if (remindLaterDate) {
			const timeToRemind = new Date(remindLaterDate).getTime() + REMIND_LATER_DELAY - Date.now();
			if (timeToRemind > 0) {
				waitTimeToShowSurvey = timeToRemind;
			}
		} else {
			const info = await this.telemetryService.getTelemetryInfo();
			const timeFromInstall = Date.now() - new Date(info.firstSessionDate).getTime();
			const isNewInstall = !isNaN(timeFromInstall) && timeFromInstall < MAX_INSTALL_AGE;

			if (!isNewInstall) {
				return;
			}
			waitTimeToShowSurvey = Math.max(WAIT_TIME_TO_SHOW_SURVEY - timeFromInstall, WAIT_TIME_TO_SHOW_SURVEY);
		}

		setTimeout(() => {
			// TODO: Telemetry
			this.notificationService.prompt(
				Severity.Info,
				nls.localize('surveyQuestion', "Please help us to improve VS Code."),
				// Take a short break from code and help us improve VS Code.
				// Got a moment? Tell us about your experience with VS Code so far.
				// Your feedback can help us make VS Code better for everybody.
				// Got feedback for us? Signed, the VS Code team ❤️
				// How is VS Code working for you so far? ❤️, the VS Code team!
				[{
					label: nls.localize('takeSurvey', "Take Short Survey"),
					run: () => {
						// TODO: Telemetry for yes
						this.telemetryService.getTelemetryInfo().then(info => {
							this.openerService.open(URI.parse(`${this.productService.cesSurveyUrl}?o=${encodeURIComponent(platform)}&v=${encodeURIComponent(this.productService.version)}&m=${encodeURIComponent(info.machineId)}}`));
							this.skipVersion();
						});
					}
				}, {
					label: nls.localize('remindLater', "Remind Me later"),
					// TODO: Telemetry for later
					run: () => this.storageService.store(REMIND_LATER_DATE_KEY, new Date().toUTCString(), StorageScope.GLOBAL, StorageTarget.USER)
				}, {
					label: nls.localize('neverAgain', "Don't Show Again"),
					// TODO: Telemetry for no
					run: () => this.skipVersion()
				}],
				{ sticky: true }
			);
		}, waitTimeToShowSurvey);
	}

	skipVersion(): void {
		this.storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL, StorageTarget.USER);
		this.storageService.store(SKIP_VERSION_KEY, this.productService.version, StorageScope.GLOBAL, StorageTarget.USER);
	}


}

if (language === 'en') {
	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(CESContribution, LifecyclePhase.Restored);
}
