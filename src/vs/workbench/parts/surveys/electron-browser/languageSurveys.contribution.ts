/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { language } from 'vs/base/common/platform';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import pkg from 'vs/platform/node/package';
import product, { ISurveyData } from 'vs/platform/node/product';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IChoiceService, Choice } from 'vs/platform/dialogs/common/dialogs';
import { Severity } from 'vs/platform/notification/common/notification';

class LanguageSurvey {

	constructor(
		data: ISurveyData,
		instantiationService: IInstantiationService,
		storageService: IStorageService,
		choiceService: IChoiceService,
		telemetryService: ITelemetryService,
		fileService: IFileService,
		modelService: IModelService
	) {
		const SESSION_COUNT_KEY = `${data.surveyId}.sessionCount`;
		const LAST_SESSION_DATE_KEY = `${data.surveyId}.lastSessionDate`;
		const SKIP_VERSION_KEY = `${data.surveyId}.skipVersion`;
		const IS_CANDIDATE_KEY = `${data.surveyId}.isCandidate`;
		const EDITED_LANGUAGE_COUNT_KEY = `${data.surveyId}.editedCount`;
		const EDITED_LANGUAGE_DATE_KEY = `${data.surveyId}.editedDate`;

		const skipVersion = storageService.get(SKIP_VERSION_KEY, StorageScope.GLOBAL, '');
		if (skipVersion) {
			return;
		}
		const date = new Date().toDateString();

		if (storageService.getInteger(EDITED_LANGUAGE_COUNT_KEY, StorageScope.GLOBAL, 0) < data.editCount) {
			fileService.onFileChanges(e => {
				e.getUpdated().forEach(event => {
					if (event.type === FileChangeType.UPDATED) {
						const model = modelService.getModel(event.resource);
						if (model && model.getModeId() === data.languageId && date !== storageService.get(EDITED_LANGUAGE_DATE_KEY, StorageScope.GLOBAL)) {
							const editedCount = storageService.getInteger(EDITED_LANGUAGE_COUNT_KEY, StorageScope.GLOBAL, 0) + 1;
							storageService.store(EDITED_LANGUAGE_COUNT_KEY, editedCount, StorageScope.GLOBAL);
							storageService.store(EDITED_LANGUAGE_DATE_KEY, date, StorageScope.GLOBAL);
						}
					}
				});
			});
		}

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
		if (storageService.getInteger(EDITED_LANGUAGE_COUNT_KEY, StorageScope.GLOBAL, 0) < data.editCount) {
			return;
		}

		const isCandidate = storageService.getBoolean(IS_CANDIDATE_KEY, StorageScope.GLOBAL, false)
			|| Math.random() < data.userProbability;

		storageService.store(IS_CANDIDATE_KEY, isCandidate, StorageScope.GLOBAL);

		if (!isCandidate) {
			storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			return;
		}

		// __GDPR__TODO__ Need to move away from dynamic event names as those cannot be registered statically
		telemetryService.publicLog(`${data.surveyId}.survey/userAsked`);

		const choices: Choice[] = [nls.localize('takeShortSurvey', "Take Short Survey"), nls.localize('remindLater', "Remind Me later"), { label: nls.localize('neverAgain', "Don't Show Again") }];
		choiceService.choose(Severity.Info, nls.localize('helpUs', "Help us improve our support for {0}", data.languageId), choices).then(choice => {
			switch (choice) {
				case 0 /* Take Survey */:
					telemetryService.publicLog(`${data.surveyId}.survey/takeShortSurvey`);
					telemetryService.getTelemetryInfo().then(info => {
						window.open(`${data.surveyUrl}?o=${encodeURIComponent(process.platform)}&v=${encodeURIComponent(pkg.version)}&m=${encodeURIComponent(info.machineId)}`);
						storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
						storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
					});
					break;
				case 1 /* Remind Later */:
					telemetryService.publicLog(`${data.surveyId}.survey/remindMeLater`);
					storageService.store(SESSION_COUNT_KEY, sessionCount - 3, StorageScope.GLOBAL);
					break;
				case 2 /* Never show again */:
					telemetryService.publicLog(`${data.surveyId}.survey/dontShowAgain`);
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
					storageService.store(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
					break;
			}
		});
	}

}

class LanguageSurveysContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@IChoiceService choiceService: IChoiceService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IFileService fileService: IFileService,
		@IModelService modelService: IModelService
	) {
		product.surveys.filter(surveyData => surveyData.surveyId && surveyData.editCount && surveyData.languageId && surveyData.surveyUrl && surveyData.userProbability).map(surveyData =>
			new LanguageSurvey(surveyData, instantiationService, storageService, choiceService, telemetryService, fileService, modelService));
	}
}

if (language === 'en' && product.surveys && product.surveys.length) {
	const workbenchRegistry = <IWorkbenchContributionsRegistry>Registry.as(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(LanguageSurveysContribution, LifecyclePhase.Running);
}