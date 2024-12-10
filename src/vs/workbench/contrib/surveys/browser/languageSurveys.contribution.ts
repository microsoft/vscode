/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { language } from '../../../../base/common/platform.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ISurveyData } from '../../../../base/common/product.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Severity, INotificationService } from '../../../../platform/notification/common/notification.js';
import { ITextFileService, ITextFileEditorModel } from '../../../services/textfile/common/textfiles.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { platform } from '../../../../base/common/process.js';
import { RunOnceWorker } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';

class LanguageSurvey extends Disposable {

	constructor(
		data: ISurveyData,
		storageService: IStorageService,
		notificationService: INotificationService,
		telemetryService: ITelemetryService,
		languageService: ILanguageService,
		textFileService: ITextFileService,
		openerService: IOpenerService,
		productService: IProductService
	) {
		super();

		const SESSION_COUNT_KEY = `${data.surveyId}.sessionCount`;
		const LAST_SESSION_DATE_KEY = `${data.surveyId}.lastSessionDate`;
		const SKIP_VERSION_KEY = `${data.surveyId}.skipVersion`;
		const IS_CANDIDATE_KEY = `${data.surveyId}.isCandidate`;
		const EDITED_LANGUAGE_COUNT_KEY = `${data.surveyId}.editedCount`;
		const EDITED_LANGUAGE_DATE_KEY = `${data.surveyId}.editedDate`;

		const skipVersion = storageService.get(SKIP_VERSION_KEY, StorageScope.APPLICATION, '');
		if (skipVersion) {
			return;
		}

		const date = new Date().toDateString();

		if (storageService.getNumber(EDITED_LANGUAGE_COUNT_KEY, StorageScope.APPLICATION, 0) < data.editCount) {

			// Process model-save event every 250ms to reduce load
			const onModelsSavedWorker = this._register(new RunOnceWorker<ITextFileEditorModel>(models => {
				models.forEach(m => {
					if (m.getLanguageId() === data.languageId && date !== storageService.get(EDITED_LANGUAGE_DATE_KEY, StorageScope.APPLICATION)) {
						const editedCount = storageService.getNumber(EDITED_LANGUAGE_COUNT_KEY, StorageScope.APPLICATION, 0) + 1;
						storageService.store(EDITED_LANGUAGE_COUNT_KEY, editedCount, StorageScope.APPLICATION, StorageTarget.USER);
						storageService.store(EDITED_LANGUAGE_DATE_KEY, date, StorageScope.APPLICATION, StorageTarget.USER);
					}
				});
			}, 250));

			this._register(textFileService.files.onDidSave(e => onModelsSavedWorker.work(e.model)));
		}

		const lastSessionDate = storageService.get(LAST_SESSION_DATE_KEY, StorageScope.APPLICATION, new Date(0).toDateString());
		if (date === lastSessionDate) {
			return;
		}

		const sessionCount = storageService.getNumber(SESSION_COUNT_KEY, StorageScope.APPLICATION, 0) + 1;
		storageService.store(LAST_SESSION_DATE_KEY, date, StorageScope.APPLICATION, StorageTarget.USER);
		storageService.store(SESSION_COUNT_KEY, sessionCount, StorageScope.APPLICATION, StorageTarget.USER);

		if (sessionCount < 9) {
			return;
		}

		if (storageService.getNumber(EDITED_LANGUAGE_COUNT_KEY, StorageScope.APPLICATION, 0) < data.editCount) {
			return;
		}

		const isCandidate = storageService.getBoolean(IS_CANDIDATE_KEY, StorageScope.APPLICATION, false)
			|| Math.random() < data.userProbability;

		storageService.store(IS_CANDIDATE_KEY, isCandidate, StorageScope.APPLICATION, StorageTarget.USER);

		if (!isCandidate) {
			storageService.store(SKIP_VERSION_KEY, productService.version, StorageScope.APPLICATION, StorageTarget.USER);
			return;
		}

		notificationService.prompt(
			Severity.Info,
			localize('helpUs', "Help us improve our support for {0}", languageService.getLanguageName(data.languageId) ?? data.languageId),
			[{
				label: localize('takeShortSurvey', "Take Short Survey"),
				run: () => {
					telemetryService.publicLog(`${data.surveyId}.survey/takeShortSurvey`);
					openerService.open(URI.parse(`${data.surveyUrl}?o=${encodeURIComponent(platform)}&v=${encodeURIComponent(productService.version)}&m=${encodeURIComponent(telemetryService.machineId)}`));
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.APPLICATION, StorageTarget.USER);
					storageService.store(SKIP_VERSION_KEY, productService.version, StorageScope.APPLICATION, StorageTarget.USER);
				}
			}, {
				label: localize('remindLater', "Remind Me Later"),
				run: () => {
					telemetryService.publicLog(`${data.surveyId}.survey/remindMeLater`);
					storageService.store(SESSION_COUNT_KEY, sessionCount - 3, StorageScope.APPLICATION, StorageTarget.USER);
				}
			}, {
				label: localize('neverAgain', "Don't Show Again"),
				isSecondary: true,
				run: () => {
					telemetryService.publicLog(`${data.surveyId}.survey/dontShowAgain`);
					storageService.store(IS_CANDIDATE_KEY, false, StorageScope.APPLICATION, StorageTarget.USER);
					storageService.store(SKIP_VERSION_KEY, productService.version, StorageScope.APPLICATION, StorageTarget.USER);
				}
			}],
			{ sticky: true }
		);
	}
}

class LanguageSurveysContribution implements IWorkbenchContribution {

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IProductService private readonly productService: IProductService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		this.handleSurveys();
	}

	private async handleSurveys() {
		if (!this.productService.surveys) {
			return;
		}

		// Make sure to wait for installed extensions
		// being registered to show notifications
		// properly (https://github.com/microsoft/vscode/issues/121216)
		await this.extensionService.whenInstalledExtensionsRegistered();

		// Handle surveys
		this.productService.surveys
			.filter(surveyData => surveyData.surveyId && surveyData.editCount && surveyData.languageId && surveyData.surveyUrl && surveyData.userProbability)
			.map(surveyData => new LanguageSurvey(surveyData, this.storageService, this.notificationService, this.telemetryService, this.languageService, this.textFileService, this.openerService, this.productService));
	}
}

if (language === 'en') {
	const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
	workbenchRegistry.registerWorkbenchContribution(LanguageSurveysContribution, LifecyclePhase.Restored);
}
