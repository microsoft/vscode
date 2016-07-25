/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as semver from 'semver';
import { shell } from 'electron';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import pkg from 'vs/platform/package';
import product from 'vs/platform/product';

class NPSContribution implements IWorkbenchContribution {

	private static PROBABILITY = 0.15;
	private static SESSION_COUNT_KEY = 'nps/sessionCount';
	private static LAST_SESSION_DATE_KEY = 'nps/lastSessionDate';
	private static SKIP_VERSION_KEY = 'nps/skipVersion';
	private static IS_CANDIDATE_KEY = 'nps/isCandidate';

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		const skipVersion = storageService.get(NPSContribution.SKIP_VERSION_KEY, StorageScope.GLOBAL, '0.0.0');

		if (semver.gte(pkg.version, skipVersion)) {
			storageService.store(NPSContribution.IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
			return;
		}

		const date = new Date().toDateString();
		const lastSessionDate = storageService.get(NPSContribution.LAST_SESSION_DATE_KEY, StorageScope.GLOBAL, new Date(0).toDateString());

		if (date === lastSessionDate) {
			return;
		}

		const sessionCount = storageService.getInteger(NPSContribution.SESSION_COUNT_KEY, StorageScope.GLOBAL, 0) + 1;
		storageService.store(NPSContribution.LAST_SESSION_DATE_KEY, date, StorageScope.GLOBAL);
		storageService.store(NPSContribution.SESSION_COUNT_KEY, sessionCount, StorageScope.GLOBAL);

		if (sessionCount < 9) {
			return;
		}

		const isCandidate = storageService.getBoolean(NPSContribution.IS_CANDIDATE_KEY, StorageScope.GLOBAL, false)
			|| Math.random() < NPSContribution.PROBABILITY;

		storageService.store(NPSContribution.IS_CANDIDATE_KEY, true, StorageScope.GLOBAL);

		if (!isCandidate) {
			storageService.store(NPSContribution.SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			return;
		}

		const message = nls.localize('surveyQuestion', "Do you mind taking a quick feedback survey?");

		const takeSurveyAction = new Action('nps.takeSurvey', nls.localize('takeSurvey', "Take Survey"), '', true, () => {
			return telemetryService.getTelemetryInfo().then(info => {
				shell.openExternal(`${ product.npsSurveyUrl }?o=${ encodeURIComponent(process.platform) }&v=${ encodeURIComponent(pkg.version) }&m=${ encodeURIComponent(info.machineId) }`);
				storageService.store(NPSContribution.SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			});
		});

		const remindMeLaterAction = new Action('nps.later', nls.localize('remindLater', "Remind Me later"), '', true, () => {
			storageService.store(NPSContribution.SESSION_COUNT_KEY, sessionCount - 3, StorageScope.GLOBAL);
			return TPromise.as(null);
		});

		const neverAgainAction = new Action('nps.never', nls.localize('neverAgain', "Never Show Again"), '', true, () => {
			storageService.store(NPSContribution.SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			return TPromise.as(null);
		});

		const actions = [takeSurveyAction, remindMeLaterAction, neverAgainAction];
		messageService.show(Severity.Info, { message, actions });
	}

	getId(): string {
		return 'nps';
	}
}

if (product.npsSurveyUrl) {
	const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(NPSContribution);
}