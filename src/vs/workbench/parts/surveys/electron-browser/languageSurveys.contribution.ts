/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { language } from 'vs/base/common/platform';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INextStorage2Service, StorageScope } from 'vs/platform/storage2/common/storage2';
import pkg from 'vs/platform/node/package';
import product, { ISurveyData } from 'vs/platform/node/product';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { Severity, INotificationService } from 'vs/platform/notification/common/notification';
import { ITextFileService, StateChange } from 'vs/workbench/services/textfile/common/textfiles';

class LanguageSurvey {

	constructor(
		data: ISurveyData,
		nextStorage2Service: INextStorage2Service,
		notificationService: INotificationService,
		telemetryService: ITelemetryService,
		modelService: IModelService,
		textFileService: ITextFileService
	) {
		const SESSION_COUNT_KEY = `${data.surveyId}.sessionCount`;
		const LAST_SESSION_DATE_KEY = `${data.surveyId}.lastSessionDate`;
		const SKIP_VERSION_KEY = `${data.surveyId}.skipVersion`;
		const IS_CANDIDATE_KEY = `${data.surveyId}.isCandidate`;
		const EDITED_LANGUAGE_COUNT_KEY = `${data.surveyId}.editedCount`;
		const EDITED_LANGUAGE_DATE_KEY = `${data.surveyId}.editedDate`;

		const skipVersion = nextStorage2Service.get(SKIP_VERSION_KEY, StorageScope.GLOBAL, '');
		if (skipVersion) {
			return;
		}

		const date = new Date().toDateString();

		if (nextStorage2Service.getInteger(EDITED_LANGUAGE_COUNT_KEY, StorageScope.GLOBAL, 0) < data.editCount) {
			textFileService.models.onModelsSaved(e => {
				e.forEach(event => {
					if (event.kind === StateChange.SAVED) {
						const model = modelService.getModel(event.resource);
						if (model && model.getModeId() === data.languageId && date !== nextStorage2Service.get(EDITED_LANGUAGE_DATE_KEY, StorageScope.GLOBAL)) {
							const editedCount = nextStorage2Service.getInteger(EDITED_LANGUAGE_COUNT_KEY, StorageScope.GLOBAL, 0) + 1;
							nextStorage2Service.set(EDITED_LANGUAGE_COUNT_KEY, editedCount, StorageScope.GLOBAL);
							nextStorage2Service.set(EDITED_LANGUAGE_DATE_KEY, date, StorageScope.GLOBAL);
						}
					}
				});
			});
		}

		const lastSessionDate = nextStorage2Service.get(LAST_SESSION_DATE_KEY, StorageScope.GLOBAL, new Date(0).toDateString());
		if (date === lastSessionDate) {
			return;
		}

		const sessionCount = nextStorage2Service.getInteger(SESSION_COUNT_KEY, StorageScope.GLOBAL, 0) + 1;
		nextStorage2Service.set(LAST_SESSION_DATE_KEY, date, StorageScope.GLOBAL);
		nextStorage2Service.set(SESSION_COUNT_KEY, sessionCount, StorageScope.GLOBAL);

		if (sessionCount < 9) {
			return;
		}

		if (nextStorage2Service.getInteger(EDITED_LANGUAGE_COUNT_KEY, StorageScope.GLOBAL, 0) < data.editCount) {
			return;
		}

		const isCandidate = nextStorage2Service.getBoolean(IS_CANDIDATE_KEY, StorageScope.GLOBAL, false)
			|| Math.random() < data.userProbability;

		nextStorage2Service.set(IS_CANDIDATE_KEY, isCandidate, StorageScope.GLOBAL);

		if (!isCandidate) {
			nextStorage2Service.set(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
			return;
		}

		// __GDPR__TODO__ Need to move away from dynamic event names as those cannot be registered statically
		telemetryService.publicLog(`${data.surveyId}.survey/userAsked`);

		notificationService.prompt(
			Severity.Info,
			nls.localize('helpUs', "Help us improve our support for {0}", data.languageId),
			[{
				label: nls.localize('takeShortSurvey', "Take Short Survey"),
				run: () => {
					telemetryService.publicLog(`${data.surveyId}.survey/takeShortSurvey`);
					telemetryService.getTelemetryInfo().then(info => {
						window.open(`${data.surveyUrl}?o=${encodeURIComponent(process.platform)}&v=${encodeURIComponent(pkg.version)}&m=${encodeURIComponent(info.machineId)}`);
						nextStorage2Service.set(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
						nextStorage2Service.set(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
					});
				}
			}, {
				label: nls.localize('remindLater', "Remind Me later"),
				run: () => {
					telemetryService.publicLog(`${data.surveyId}.survey/remindMeLater`);
					nextStorage2Service.set(SESSION_COUNT_KEY, sessionCount - 3, StorageScope.GLOBAL);
				}
			}, {
				label: nls.localize('neverAgain', "Don't Show Again"),
				isSecondary: true,
				run: () => {
					telemetryService.publicLog(`${data.surveyId}.survey/dontShowAgain`);
					nextStorage2Service.set(IS_CANDIDATE_KEY, false, StorageScope.GLOBAL);
					nextStorage2Service.set(SKIP_VERSION_KEY, pkg.version, StorageScope.GLOBAL);
				}
			}]
		);
	}
}

class LanguageSurveysContribution implements IWorkbenchContribution {

	constructor(
		@INextStorage2Service nextStorage2Service: INextStorage2Service,
		@INotificationService notificationService: INotificationService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IModelService modelService: IModelService,
		@ITextFileService textFileService: ITextFileService
	) {
		product.surveys
			.filter(surveyData => surveyData.surveyId && surveyData.editCount && surveyData.languageId && surveyData.surveyUrl && surveyData.userProbability)
			.map(surveyData => new LanguageSurvey(surveyData, nextStorage2Service, notificationService, telemetryService, modelService, textFileService));
	}
}

if (language === 'en' && product.surveys && product.surveys.length) {
	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(LanguageSurveysContribution, LifecyclePhase.Running);
}
