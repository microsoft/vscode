/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { language } from '../../../../base/common/platform.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Severity, INotificationService, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { platform } from '../../../../base/common/process.js';
import { RunOnceWorker } from '../../../../base/common/async.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
class LanguageSurvey extends Disposable {
    constructor(data, storageService, notificationService, telemetryService, languageService, textFileService, openerService, productService) {
        super();
        const SESSION_COUNT_KEY = `${data.surveyId}.sessionCount`;
        const LAST_SESSION_DATE_KEY = `${data.surveyId}.lastSessionDate`;
        const SKIP_VERSION_KEY = `${data.surveyId}.skipVersion`;
        const IS_CANDIDATE_KEY = `${data.surveyId}.isCandidate`;
        const EDITED_LANGUAGE_COUNT_KEY = `${data.surveyId}.editedCount`;
        const EDITED_LANGUAGE_DATE_KEY = `${data.surveyId}.editedDate`;
        const skipVersion = storageService.get(SKIP_VERSION_KEY, -1 /* StorageScope.APPLICATION */, '');
        if (skipVersion) {
            return;
        }
        const date = new Date().toDateString();
        if (storageService.getNumber(EDITED_LANGUAGE_COUNT_KEY, -1 /* StorageScope.APPLICATION */, 0) < data.editCount) {
            // Process model-save event every 250ms to reduce load
            const onModelsSavedWorker = this._register(new RunOnceWorker(models => {
                models.forEach(m => {
                    if (m.getLanguageId() === data.languageId && date !== storageService.get(EDITED_LANGUAGE_DATE_KEY, -1 /* StorageScope.APPLICATION */)) {
                        const editedCount = storageService.getNumber(EDITED_LANGUAGE_COUNT_KEY, -1 /* StorageScope.APPLICATION */, 0) + 1;
                        storageService.store(EDITED_LANGUAGE_COUNT_KEY, editedCount, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                        storageService.store(EDITED_LANGUAGE_DATE_KEY, date, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                    }
                });
            }, 250));
            this._register(textFileService.files.onDidSave(e => onModelsSavedWorker.work(e.model)));
        }
        const lastSessionDate = storageService.get(LAST_SESSION_DATE_KEY, -1 /* StorageScope.APPLICATION */, new Date(0).toDateString());
        if (date === lastSessionDate) {
            return;
        }
        const sessionCount = storageService.getNumber(SESSION_COUNT_KEY, -1 /* StorageScope.APPLICATION */, 0) + 1;
        storageService.store(LAST_SESSION_DATE_KEY, date, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        storageService.store(SESSION_COUNT_KEY, sessionCount, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        if (sessionCount < 9) {
            return;
        }
        if (storageService.getNumber(EDITED_LANGUAGE_COUNT_KEY, -1 /* StorageScope.APPLICATION */, 0) < data.editCount) {
            return;
        }
        const isCandidate = storageService.getBoolean(IS_CANDIDATE_KEY, -1 /* StorageScope.APPLICATION */, false)
            || Math.random() < data.userProbability;
        storageService.store(IS_CANDIDATE_KEY, isCandidate, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        if (!isCandidate) {
            storageService.store(SKIP_VERSION_KEY, productService.version, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
            return;
        }
        notificationService.prompt(Severity.Info, localize('helpUs', "Help us improve our support for {0}", languageService.getLanguageName(data.languageId) ?? data.languageId), [{
                label: localize('takeShortSurvey', "Take Short Survey"),
                run: () => {
                    telemetryService.publicLog(`${data.surveyId}.survey/takeShortSurvey`);
                    openerService.open(URI.parse(`${data.surveyUrl}?o=${encodeURIComponent(platform)}&v=${encodeURIComponent(productService.version)}&m=${encodeURIComponent(telemetryService.machineId)}`));
                    storageService.store(IS_CANDIDATE_KEY, false, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                    storageService.store(SKIP_VERSION_KEY, productService.version, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                }
            }, {
                label: localize('remindLater', "Remind Me Later"),
                run: () => {
                    telemetryService.publicLog(`${data.surveyId}.survey/remindMeLater`);
                    storageService.store(SESSION_COUNT_KEY, sessionCount - 3, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                }
            }, {
                label: localize('neverAgain', "Don't Show Again"),
                isSecondary: true,
                run: () => {
                    telemetryService.publicLog(`${data.surveyId}.survey/dontShowAgain`);
                    storageService.store(IS_CANDIDATE_KEY, false, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                    storageService.store(SKIP_VERSION_KEY, productService.version, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
                }
            }], { priority: NotificationPriority.OPTIONAL });
    }
}
let LanguageSurveysContribution = class LanguageSurveysContribution {
    constructor(storageService, notificationService, telemetryService, textFileService, openerService, productService, languageService, extensionService) {
        this.storageService = storageService;
        this.notificationService = notificationService;
        this.telemetryService = telemetryService;
        this.textFileService = textFileService;
        this.openerService = openerService;
        this.productService = productService;
        this.languageService = languageService;
        this.extensionService = extensionService;
        this.handleSurveys();
    }
    async handleSurveys() {
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
};
LanguageSurveysContribution = __decorate([
    __param(0, IStorageService),
    __param(1, INotificationService),
    __param(2, ITelemetryService),
    __param(3, ITextFileService),
    __param(4, IOpenerService),
    __param(5, IProductService),
    __param(6, ILanguageService),
    __param(7, IExtensionService)
], LanguageSurveysContribution);
if (language === 'en') {
    const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
    workbenchRegistry.registerWorkbenchContribution(LanguageSurveysContribution, 3 /* LifecyclePhase.Restored */);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VTdXJ2ZXlzLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL3N1cnZleXMvYnJvd3Nlci9sYW5ndWFnZVN1cnZleXMuY29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM5QyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDL0QsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkYsT0FBTyxFQUEyRCxVQUFVLElBQUksbUJBQW1CLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5SSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDdkYsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFHeEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxnQkFBZ0IsRUFBd0IsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDOUUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3JELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDakUsT0FBTyxFQUFF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