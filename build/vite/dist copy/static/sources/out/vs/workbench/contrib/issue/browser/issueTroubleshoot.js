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
var TroubleshootIssueService_1, IssueTroubleshootUi_1;
import { localize, localize2 } from '../../../../nls.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkbenchIssueService } from '../common/issue.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from '../../../services/userDataProfile/common/userDataProfile.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IExtensionBisectService } from '../../../services/extensionManagement/browser/extensionBisect.js';
import { INotificationService, NotificationPriority, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ContextKeyExpr, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions } from '../../../common/contributions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { URI } from '../../../../base/common/uri.js';
import { RemoteNameContext } from '../../../common/contextkeys.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
const ITroubleshootIssueService = createDecorator('ITroubleshootIssueService');
var TroubleshootStage;
(function (TroubleshootStage) {
    TroubleshootStage[TroubleshootStage["EXTENSIONS"] = 1] = "EXTENSIONS";
    TroubleshootStage[TroubleshootStage["WORKBENCH"] = 2] = "WORKBENCH";
})(TroubleshootStage || (TroubleshootStage = {}));
class TroubleShootState {
    static fromJSON(raw) {
        if (!raw) {
            return undefined;
        }
        try {
            const data = JSON.parse(raw);
            if ((data.stage === TroubleshootStage.EXTENSIONS || data.stage === TroubleshootStage.WORKBENCH)
                && typeof data.profile === 'string') {
                return new TroubleShootState(data.stage, data.profile);
            }
        }
        catch { /* ignore */ }
        return undefined;
    }
    constructor(stage, profile) {
        this.stage = stage;
        this.profile = profile;
    }
}
let TroubleshootIssueService = class TroubleshootIssueService extends Disposable {
    static { TroubleshootIssueService_1 = this; }
    static { this.storageKey = 'issueTroubleshootState'; }
    constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, userDataProfileImportExportService, dialogService, extensionBisectService, notificationService, extensionManagementService, extensionEnablementService, issueService, productService, hostService, storageService, openerService) {
        super();
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.userDataProfileManagementService = userDataProfileManagementService;
        this.userDataProfileImportExportService = userDataProfileImportExportService;
        this.dialogService = dialogService;
        this.extensionBisectService = extensionBisectService;
        this.notificationService = notificationService;
        this.extensionManagementService = extensionManagementService;
        this.extensionEnablementService = extensionEnablementService;
        this.issueService = issueService;
        this.productService = productService;
        this.hostService = hostService;
        this.storageService = storageService;
        this.openerService = openerService;
    }
    isActive() {
        return this.state !== undefined;
    }
    async start() {
        if (this.isActive()) {
            throw new Error('invalid state');
        }
        const res = await this.dialogService.confirm({
            message: localize('troubleshoot issue', "Troubleshoot Issue"),
            detail: localize('detail.start', "Issue troubleshooting is a process to help you identify the cause for an issue. The cause for an issue can be a misconfiguration, due to an extension, or be {0} itself.\n\nDuring the process the window reloads repeatedly. Each time you must confirm if you are still seeing the issue.", this.productService.nameLong),
            primaryButton: localize({ key: 'msg', comment: ['&& denotes a mnemonic'] }, "&&Troubleshoot Issue"),
            custom: true
        });
        if (!res.confirmed) {
            return;
        }
        const originalProfile = this.userDataProfileService.currentProfile;
        await this.userDataProfileImportExportService.createTroubleshootProfile();
        this.state = new TroubleShootState(TroubleshootStage.EXTENSIONS, originalProfile.id);
        await this.resume();
    }
    async resume() {
        if (!this.isActive()) {
            return;
        }
        if (this.state?.stage === TroubleshootStage.EXTENSIONS && !this.extensionBisectService.isActive) {
            await this.reproduceIssueWithExtensionsDisabled();
        }
        if (this.state?.stage === TroubleshootStage.WORKBENCH) {
            await this.reproduceIssueWithEmptyProfile();
        }
        await this.stop();
    }
    async stop() {
        if (!this.isActive()) {
            return;
        }
        if (this.notificationHandle) {
            this.notificationHandle.close();
            this.notificationHandle = undefined;
        }
        if (this.extensionBisectService.isActive) {
            await this.extensionBisectService.reset();
        }
        const profile = this.userDataProfilesService.profiles.find(p => p.id === this.state?.profile) ?? this.userDataProfilesService.defaultProfile;
        this.state = undefined;
        await this.userDataProfileManagementService.switchProfile(profile);
    }
    async reproduceIssueWithExtensionsDisabled() {
        if (!(await this.extensionManagementService.getInstalled(1 /* ExtensionType.User */)).length) {
            this.state = new TroubleShootState(TroubleshootStage.WORKBENCH, this.state.profile);
            return;
        }
        const result = await this.askToReproduceIssue(localize('profile.extensions.disabled', "Issue troubleshooting is active and has temporarily disabled all installed extensions. Check if you can still reproduce the problem and proceed by selecting from these options."));
        if (result === 'good') {
            const profile = this.userDataProfilesService.profiles.find(p => p.id === this.state.profile) ?? this.userDataProfilesService.defaultProfile;
            await this.reproduceIssueWithExtensionsBisect(profile);
        }
        if (result === 'bad') {
            this.state = new TroubleShootState(TroubleshootStage.WORKBENCH, this.state.profile);
        }
        if (result === 'stop') {
            await this.stop();
        }
    }
    async reproduceIssueWithEmptyProfile() {
        await this.userDataProfileManagementService.createAndEnterTransientProfile();
        this.updateState(this.state);
        const result = await this.askToReproduceIssue(localize('empty.profile', "Issue troubleshooting is active and has temporarily reset your configurations to defaults. Check if you can still reproduce the problem and proceed by selecting from these options."));
        if (result === 'stop') {
            await this.stop();
        }
        if (result === 'good') {
            await this.askToReportIssue(localize('issue is with configuration', "Issue troubleshooting has identified that the issue is caused by your configurations. Please report the issue by exporting your configurations using \"Export Profile\" command and share the file in the issue report."));
        }
        if (result === 'bad') {
            await this.askToReportIssue(localize('issue is in core', "Issue troubleshooting has identified that the issue is with {0}.", this.productService.nameLong));
        }
    }
    async reproduceIssueWithExtensionsBisect(profile) {
        await this.userDataProfileManagementService.switchProfile(profile);
        const extensions = (await this.extensionManagementService.getInstalled(1 /* ExtensionType.User */)).filter(ext => this.extensionEnablementService.isEnabled(ext));
        await this.extensionBisectService.start(extensions);
        await this.hostService.reload();
    }
    askToReproduceIssue(message) {
        return new Promise((c, e) => {
            const goodPrompt = {
                label: localize('I cannot reproduce', "I Can't Reproduce"),
                run: () => c('good')
            };
            const badPrompt = {
                label: localize('This is Bad', "I Can Reproduce"),
                run: () => c('bad')
            };
            const stop = {
                label: localize('Stop', "Stop"),
                run: () => c('stop')
            };
            this.notificationHandle = this.notificationService.prompt(Severity.Info, message, [goodPrompt, badPrompt, stop], { sticky: true, priority: NotificationPriority.URGENT });
        });
    }
    async askToReportIssue(message) {
        let isCheckedInInsiders = false;
        if (this.productService.quality === 'stable') {
            const res = await this.askToReproduceIssueWithInsiders();
            if (res === 'good') {
                await this.dialogService.prompt({
                    type: Severity.Info,
                    message: localize('troubleshoot issue', "Troubleshoot Issue"),
                    detail: localize('use insiders', "This likely means that the issue has been addressed already and will be available in an upcoming release. You can safely use {0} insiders until the new stable version is available.", this.productService.nameLong),
                    custom: true
                });
                return;
            }
            if (res === 'stop') {
                await this.stop();
                return;
            }
            if (res === 'bad') {
                isCheckedInInsiders = true;
            }
        }
        await this.issueService.openReporter({
            issueBody: `> ${message} ${isCheckedInInsiders ? `It is confirmed that the issue exists in ${this.productService.nameLong} Insiders` : ''}`,
        });
    }
    async askToReproduceIssueWithInsiders() {
        const confirmRes = await this.dialogService.confirm({
            type: 'info',
            message: localize('troubleshoot issue', "Troubleshoot Issue"),
            primaryButton: localize('download insiders', "Download {0} Insiders", this.productService.nameLong),
            cancelButton: localize('report anyway', "Report Issue Anyway"),
            detail: localize('ask to download insiders', "Please try to download and reproduce the issue in {0} insiders.", this.productService.nameLong),
            custom: {
                disableCloseAction: true,
            }
        });
        if (!confirmRes.confirmed) {
            return undefined;
        }
        const opened = await this.openerService.open(URI.parse('https://aka.ms/vscode-insiders'));
        if (!opened) {
            return undefined;
        }
        const res = await this.dialogService.prompt({
            type: 'info',
            message: localize('troubleshoot issue', "Troubleshoot Issue"),
            buttons: [{
                    label: localize('good', "I can't reproduce"),
                    run: () => 'good'
                }, {
                    label: localize('bad', "I can reproduce"),
                    run: () => 'bad'
                }],
            cancelButton: {
                label: localize('stop', "Stop"),
                run: () => 'stop'
            },
            detail: localize('ask to reproduce issue', "Please try to reproduce the issue in {0} insiders and confirm if the issue exists there.", this.productService.nameLong),
            custom: {
                disableCloseAction: true,
            }
        });
        return res.result;
    }
    get state() {
        if (this._state === undefined) {
            const raw = this.storageService.get(TroubleshootIssueService_1.storageKey, 0 /* StorageScope.PROFILE */);
            this._state = TroubleShootState.fromJSON(raw);
        }
        return this._state || undefined;
    }
    set state(state) {
        this._state = state ?? null;
        this.updateState(state);
    }
    updateState(state) {
        if (state) {
            this.storageService.store(TroubleshootIssueService_1.storageKey, JSON.stringify(state), 0 /* StorageScope.PROFILE */, 1 /* StorageTarget.MACHINE */);
        }
        else {
            this.storageService.remove(TroubleshootIssueService_1.storageKey, 0 /* StorageScope.PROFILE */);
        }
    }
};
TroubleshootIssueService = TroubleshootIssueService_1 = __decorate([
    __param(0, IUserDataProfileService),
    __param(1, IUserDataProfilesService),
    __param(2, IUserDataProfileManagementService),
    __param(3, IUserDataProfileImportExportService),
    __param(4, IDialogService),
    __param(5, IExtensionBisectService),
    __param(6, INotificationService),
    __param(7, IExtensionManagementService),
    __param(8, IWorkbenchExtensionEnablementService),
    __param(9, IWorkbenchIssueService),
    __param(10, IProductService),
    __param(11, IHostService),
    __param(12, IStorageService),
    __param(13, IOpenerService)
], TroubleshootIssueService);
let IssueTroubleshootUi = class IssueTroubleshootUi extends Disposable {
    static { IssueTroubleshootUi_1 = this; }
    static { this.ctxIsTroubleshootActive = new RawContextKey('isIssueTroubleshootActive', false); }
    constructor(contextKeyService, troubleshootIssueService, storageService) {
        super();
        this.contextKeyService = contextKeyService;
        this.troubleshootIssueService = troubleshootIssueService;
        this.updateContext();
        if (troubleshootIssueService.isActive()) {
            troubleshootIssueService.resume();
        }
        this._register(storageService.onDidChangeValue(0 /* StorageScope.PROFILE */, TroubleshootIssueService.storageKey, this._store)(() => {
            this.updateContext();
        }));
    }
    updateContext() {
        IssueTroubleshootUi_1.ctxIsTroubleshootActive.bindTo(this.contextKeyService).set(this.troubleshootIssueService.isActive());
    }
};
IssueTroubleshootUi = IssueTroubleshootUi_1 = __decorate([
    __param(0, IContextKeyService),
    __param(1, ITroubleshootIssueService),
    __param(2, IStorageService)
], IssueTroubleshootUi);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(IssueTroubleshootUi, 3 /* LifecyclePhase.Restored */);
registerAction2(class TroubleshootIssueAction extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.troubleshootIssue.start',
            title: localize2('troubleshootIssue', 'Troubleshoot Issue...'),
            category: Categories.Help,
            f1: true,
            precondition: ContextKeyExpr.and(IssueTroubleshootUi.ctxIsTroubleshootActive.negate(), RemoteNameContext.isEqualTo(''), IsWebContext.negate()),
        });
    }
    run(accessor) {
        return accessor.get(ITroubleshootIssueService).start();
    }
});
registerAction2(class extends Action2 {
    constructor() {
        super({
            id: 'workbench.action.troubleshootIssue.stop',
            title: localize2('title.stop', 'Stop Troubleshoot Issue'),
            category: Categories.Help,
            f1: true,
            precondition: IssueTroubleshootUi.ctxIsTroubleshootActive
        });
    }
    async run(accessor) {
        return accessor.get(ITroubleshootIssueService).stop();
    }
});
registerSingleton(ITroubleshootIssueService, TroubleshootIssueService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXNzdWVUcm91Ymxlc2hvb3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pc3N1ZS9icm93c2VyL2lzc3VlVHJvdWJsZXNob290LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQ3pELE9BQU8sRUFBRSwyQkFBMkIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBRXJILE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsbUNBQW1DLEVBQUUsaUNBQWlDLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM5SyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDaEYsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDM0csT0FBTyxFQUF1QixvQkFBb0IsRUFBaUIsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDcEssT0FBTyxFQUFFLG9DQUFvQyxFQUFFLE1BQU0scUVBQXFFLENBQUM7QUFDM0gsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3RFLE9BQU8sRUFBb0Isd0JBQXdCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUM1SCxPQUFPLEVBQW9CLGVBQWUsRUFBRSxNQUFNLDREQUE0RCxDQUFD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