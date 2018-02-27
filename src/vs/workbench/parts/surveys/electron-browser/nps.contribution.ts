/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { language } from 'vs/base/common/platform';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import pkg from 'vs/platform/node/package';
import product from 'vs/platform/node/product';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IChoiceService, Choice } from 'vs/platform/dialogs/common/dialogs';
import { Severity } from 'vs/platform/notification/common/notification';

const PROBABILITY = 0.15;
const SESSION_COUNT_KEY = 'nps/sessionCount';
const LAST_SESSION_DATE_KEY = 'nps/lastSessionDate';
const SKIP_VERSION_KEY = 'nps/skipVersion';
const IS_CANDIDATE_KEY = 'nps/isCandidate';

class NPSContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IChoiceService choiceService: IChoiceService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		const skipVersion = storageService.get(SKIP_VERSION_KEY, StorageScope.GLOBAL, '');

		if (skipVersion) {
			return;
		}

		const date = new Date().toDateString();
		const lastSessionDate = storageService.get(LAST_SESSION_DATE_KEY, StorageScope.GLOBAL, new Date(0).toDateString());

		if (date === lastSessionDate) {
			return;
		}

		const sessionCount = storageService.getInteger(SESSION_COUNT_KEY, StorageScope.GLOBAL, 0) + 1;
		storageService.store(LAST_SESSION_DATE_KEY, date, StorageScope.GLOBAL);
		storageService.store(SESSION_COUNT_KEY, sessionCount, StorageScope.GLOBAL);

		if (sessionCount < 9) {
			return;
		}

		const isCandidate = storageService.getBoolean(IS_CANDIDATE_KEY, StorageScope.GLOBAL, false)
			|| Math.random() < PROBABILITY;

		storageService.store(IS_CANDIDATE_KEY, isCandidate, StorageScope.GLOBAL);

		if (!isCandidate) {
			storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			return;
		}

		const choices: Choice[] = [nls.localize('takeSurvey', "Take Survey"), nls.localize('remindLater', "Remind Me later"), { label: nls.localize('neverAgain', "Don't Show Again") }];
		choiceService.choose(Severity.Info, nls.localize('surveyQuestion', "Do you mind taking a quick feedback survey?"), choices).then(choice => {
			switch (choice) {
				case 0 /* Take Survey */:
					telemetryService.getTelemetryInfo().then(info => {
						window.open(`${product.npsSurveyUrl}?o=${encodeURIComponent(process.platform)}&v=${encodeURIComponent(pkg.version)}&m=${encodeURIComponent(info.machineId)}`);
						storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
						storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
					});
					break;
				case 1 /* Remind Later */:
					storageService.store(SESSION_COUNT_KEY, sessionCount - 3, StorageScope.GLOBAL);
					break;
				case 2 /* Never show again */:
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
					storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
					break;
			}
		});
	}
}

if (language === 'en' && product.npsSurveyUrl) {
	const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(NPSContribution, LifecyclePhase.Running);
}