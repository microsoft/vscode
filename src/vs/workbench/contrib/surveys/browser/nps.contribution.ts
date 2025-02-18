/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { language } from '../../../../base/common/platform.js';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Severity, INotificationService, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { platform } from '../../../../base/common/process.js';

const PROBABILITY = 0.15;
const SESSION_COUNT_KEY = 'nps/sessionCount';
const LAST_SESSION_DATE_KEY = 'nps/lastSessionDate';
const SKIP_VERSION_KEY = 'nps/skipVersion';
const IS_CANDIDATE_KEY = 'nps/isCandidate';

class NPSContribution implements IWorkbenchContribution {

	constructor(
		@IStorageService storageService: IStorageService,
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService openerService: IOpenerService,
		@IProductService productService: IProductService
	) {
		if (!productService.npsSurveyUrl) {
			return;
		}

		const skipVersion = storageService.get(SKIP_VERSION_KEY, StorageScope.APPLICATION, '');
		if (skipVersion) {
			return;
		}

		const date = new Date().toDateString();
		const lastSessionDate = storageService.get(LAST_SESSION_DATE_KEY, StorageScope.APPLICATION, new Date(0).toDateString());

		if (date === lastSessionDate) {
			return;
		}

		const sessionCount = (storageService.getNumber(SESSION_COUNT_KEY, StorageScope.APPLICATION, 0) || 0) + 1;
		storageService.store(LAST_SESSION_DATE_KEY, date, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store(SESSION_COUNT_KEY, sessionCount, StorageScope.APPLICATION, StorageTarget.USER);

		if (sessionCount < 9) {
			return;
		}

		const isCandidate = storageService.getBoolean(IS_CANDIDATE_KEY, StorageScope.APPLICATION, false)
			|| Math.random() < PROBABILITY;

		storageService.store(IS_CANDIDATE_KEY, isCandidate, StorageScope.APPLICATION, StorageTarget.USER);

		if (!isCandidate) {
			storageService.store(SKIP_VERSION_KEY, productService.version, StorageScope.APPLICATION, StorageTarget.USER);
			return;
		}

		notificationService.prompt(
			Severity.Info,
			nls.localize('surveyQuestion', "Do you mind taking a quick feedback survey?"),
			[{
				label: nls.localize('takeSurvey', "Take Survey"),
				run: () => {
					openerService.open(URI.parse(`${productService.npsSurveyUrl}?o=${encodeURIComponent(platform)}&v=${encodeURIComponent(productService.version)}&m=${encodeURIComponent(telemetryService.machineId)}`));
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.APPLICATION, StorageTarget.USER);
					storageService.store(SKIP_VERSION_KEY, productService.version, StorageScope.APPLICATION, StorageTarget.USER);
				}
			}, {
				label: nls.localize('remindLater', "Remind Me Later"),
				run: () => storageService.store(SESSION_COUNT_KEY, sessionCount - 3, StorageScope.APPLICATION, StorageTarget.USER)
			}, {
				label: nls.localize('neverAgain', "Don't Show Again"),
				run: () => {
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.APPLICATION, StorageTarget.USER);
					storageService.store(SKIP_VERSION_KEY, productService.version, StorageScope.APPLICATION, StorageTarget.USER);
				}
			}],
			{ sticky: true, priority: NotificationPriority.URGENT }
		);
	}
}

if (language === 'en') {
	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(NPSContribution, LifecyclePhase.Restored);
}
