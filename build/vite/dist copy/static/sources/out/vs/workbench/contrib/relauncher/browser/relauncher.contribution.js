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
var SettingsChangeRelauncher_1;
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, dispose, toDisposable } from '../../../../base/common/lifecycle.js';
import { isLinux, isMacintosh, isNative } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IUserDataSyncEnablementService, IUserDataSyncService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IUserDataSyncWorkbenchService } from '../../../services/userDataSync/common/userDataSync.js';
let SettingsChangeRelauncher = class SettingsChangeRelauncher extends Disposable {
    static { SettingsChangeRelauncher_1 = this; }
    static { this.SETTINGS = [
        "window.titleBarStyle" /* TitleBarSetting.TITLE_BAR_STYLE */,
        "window.menuStyle" /* MenuSettings.MenuStyle */,
        'window.nativeTabs',
        'window.nativeFullScreen',
        'window.clickThroughInactive',
        'window.controlsStyle',
        'update.mode',
        'editor.accessibilitySupport',
        'security.workspace.trust.enabled',
        'workbench.enableExperiments',
        '_extensionsGallery.enablePPE',
        'security.restrictUNCAccess',
        'accessibility.verbosity.debug',
        'telemetry.feedback.enabled',
        'chat.extensionUnification.enabled'
    ]; }
    constructor(hostService, configurationService, userDataSyncService, userDataSyncEnablementService, userDataSyncWorkbenchService, productService, dialogService) {
        super();
        this.hostService = hostService;
        this.configurationService = configurationService;
        this.userDataSyncService = userDataSyncService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this.productService = productService;
        this.dialogService = dialogService;
        this.titleBarStyle = new ChangeObserver('string');
        this.menuStyle = new ChangeObserver('string');
        this.nativeTabs = new ChangeObserver('boolean');
        this.nativeFullScreen = new ChangeObserver('boolean');
        this.clickThroughInactive = new ChangeObserver('boolean');
        this.controlsStyle = new ChangeObserver('string');
        this.updateMode = new ChangeObserver('string');
        this.workspaceTrustEnabled = new ChangeObserver('boolean');
        this.experimentsEnabled = new ChangeObserver('boolean');
        this.enablePPEExtensionsGallery = new ChangeObserver('boolean');
        this.restrictUNCAccess = new ChangeObserver('boolean');
        this.accessibilityVerbosityDebug = new ChangeObserver('boolean');
        this.telemetryFeedbackEnabled = new ChangeObserver('boolean');
        this.extensionUnificationEnabled = new ChangeObserver('boolean');
        this.update(false);
        this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationChange(e)));
        this._register(userDataSyncWorkbenchService.onDidTurnOnSync(e => this.update(true)));
    }
    onConfigurationChange(e) {
        if (e && !SettingsChangeRelauncher_1.SETTINGS.some(key => e.affectsConfiguration(key))) {
            return;
        }
        // Skip if turning on sync is in progress
        if (this.isTurningOnSyncInProgress()) {
            return;
        }
        this.update(e.source !== 7 /* ConfigurationTarget.DEFAULT */ /* do not ask to relaunch if defaults changed */);
    }
    isTurningOnSyncInProgress() {
        return !this.userDataSyncEnablementService.isEnabled() && this.userDataSyncService.status === "syncing" /* SyncStatus.Syncing */;
    }
    update(askToRelaunch) {
        let changed = false;
        function processChanged(didChange) {
            changed = changed || didChange;
        }
        const config = this.configurationService.getValue();
        if (isNative) {
            // Titlebar style
            processChanged((config.window.titleBarStyle === "native" /* TitlebarStyle.NATIVE */ || config.window.titleBarStyle === "custom" /* TitlebarStyle.CUSTOM */) && this.titleBarStyle.handleChange(config.window?.titleBarStyle));
            // Windows/Linux: Menu style
            processChanged(!isMacintosh && this.menuStyle.handleChange(config.window?.menuStyle));
            // macOS: Native tabs
            processChanged(isMacintosh && this.nativeTabs.handleChange(config.window?.nativeTabs));
            // macOS: Native fullscreen
            processChanged(isMacintosh && this.nativeFullScreen.handleChange(config.window?.nativeFullScreen));
            // macOS: Click through (accept first mouse)
            processChanged(isMacintosh && this.clickThroughInactive.handleChange(config.window?.clickThroughInactive));
            // Windows/Linux: Window controls style
            processChanged(!isMacintosh && this.controlsStyle.handleChange(config.window?.controlsStyle));
            // Update mode
            processChanged(this.updateMode.handleChange(config.update?.mode));
            // On linux turning on accessibility support will also pass this flag to the chrome renderer, thus a restart is required
            if (isLinux && typeof config.editor?.accessibilitySupport === 'string' && config.editor.accessibilitySupport !== this.accessibilitySupport) {
                this.accessibilitySupport = config.editor.accessibilitySupport;
                if (this.accessibilitySupport === 'on') {
                    changed = true;
                }
            }
            // Workspace trust
            processChanged(this.workspaceTrustEnabled.handleChange(config?.security?.workspace?.trust?.enabled));
            // UNC host access restrictions
            processChanged(this.restrictUNCAccess.handleChange(config?.security?.restrictUNCAccess));
            // Debug accessibility verbosity
            processChanged(this.accessibilityVerbosityDebug.handleChange(config?.accessibility?.verbosity?.debug));
        }
        // Experiments
        processChanged(this.experimentsEnabled.handleChange(config.workbench?.enableExperiments));
        // Profiles
        processChanged(this.productService.quality !== 'stable' && this.enablePPEExtensionsGallery.handleChange(config._extensionsGallery?.enablePPE));
        // Enable Feedback
        processChanged(this.telemetryFeedbackEnabled.handleChange(config.telemetry?.feedback?.enabled));
        // Extension Unification (only when turning on)
        processChanged(this.extensionUnificationEnabled.handleChange(config.chat?.extensionUnification?.enabled) && config.chat?.extensionUnification?.enabled === true);
        if (askToRelaunch && changed && this.hostService.hasFocus) {
            this.doConfirm(isNative ?
                localize('relaunchSettingMessage', "A setting has changed that requires a restart to take effect.") :
                localize('relaunchSettingMessageWeb', "A setting has changed that requires a reload to take effect."), isNative ?
                localize('relaunchSettingDetail', "Press the restart button to restart {0} and enable the setting.", this.productService.nameLong) :
                localize('relaunchSettingDetailWeb', "Press the reload button to reload {0} and enable the setting.", this.productService.nameLong), isNative ?
                localize({ key: 'restart', comment: ['&& denotes a mnemonic'] }, "&&Restart") :
                localize({ key: 'restartWeb', comment: ['&& denotes a mnemonic'] }, "&&Reload"), () => this.hostService.restart());
        }
    }
    async doConfirm(message, detail, primaryButton, confirmedFn) {
        const { confirmed } = await this.dialogService.confirm({ message, detail, primaryButton });
        if (confirmed) {
            confirmedFn();
        }
    }
};
SettingsChangeRelauncher = SettingsChangeRelauncher_1 = __decorate([
    __param(0, IHostService),
    __param(1, IConfigurationService),
    __param(2, IUserDataSyncService),
    __param(3, IUserDataSyncEnablementService),
    __param(4, IUserDataSyncWorkbenchService),
    __param(5, IProductService),
    __param(6, IDialogService)
], SettingsChangeRelauncher);
export { SettingsChangeRelauncher };
class ChangeObserver {
    static create(typeName) {
        return new ChangeObserver(typeName);
    }
    constructor(typeName) {
        this.typeName = typeName;
        this.lastValue = undefined;
    }
    /**
     * Returns if there was a change compared to the last value
     */
    handleChange(value) {
        if (typeof value === this.typeName && value !== this.lastValue) {
            this.lastValue = value;
            return true;
        }
        return false;
    }
}
let WorkspaceChangeExtHostRelauncher = class WorkspaceChangeExtHostRelauncher extends Disposable {
    constructor(contextService, extensionService, hostService, environmentService) {
        super();
        this.contextService = contextService;
        this.extensionHostRestarter = this._register(new RunOnceScheduler(async () => {
            if (!!environmentService.extensionTestsLocationURI) {
                return; // no restart when in tests: see https://github.com/microsoft/vscode/issues/66936
            }
            if (environmentService.isSessionsWindow) {
                return; // no restart for sessions window
            }
            if (environmentService.remoteAuthority) {
                hostService.reload(); // TODO@aeschli, workaround
            }
            else if (isNative) {
                const stopped = await extensionService.stopExtensionHosts(localize('restartExtensionHost.reason', "Changing workspace folders"));
                if (stopped) {
                    extensionService.startExtensionHosts();
                }
            }
        }, 10));
        this.contextService.getCompleteWorkspace()
            .then(workspace => {
            this.firstFolderResource = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;
            this.handleWorkbenchState();
            this._register(this.contextService.onDidChangeWorkbenchState(() => setTimeout(() => this.handleWorkbenchState())));
        });
        this._register(toDisposable(() => {
            this.onDidChangeWorkspaceFoldersUnbind?.dispose();
        }));
    }
    handleWorkbenchState() {
        // React to folder changes when we are in workspace state
        if (this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            // Update our known first folder path if we entered workspace
            const workspace = this.contextService.getWorkspace();
            this.firstFolderResource = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;
            // Install workspace folder listener
            if (!this.onDidChangeWorkspaceFoldersUnbind) {
                this.onDidChangeWorkspaceFoldersUnbind = this.contextService.onDidChangeWorkspaceFolders(() => this.onDidChangeWorkspaceFolders());
            }
        }
        // Ignore the workspace folder changes in EMPTY or FOLDER state
        else {
            dispose(this.onDidChangeWorkspaceFoldersUnbind);
            this.onDidChangeWorkspaceFoldersUnbind = undefined;
        }
    }
    onDidChangeWorkspaceFolders() {
        const workspace = this.contextService.getWorkspace();
        // Restart extension host if first root folder changed (impact on deprecated workspace.rootPath API)
        const newFirstFolderResource = workspace.folders.length > 0 ? workspace.folders[0].uri : undefined;
        if (!isEqual(this.firstFolderResource, newFirstFolderResource)) {
            this.firstFolderResource = newFirstFolderResource;
            this.extensionHostRestarter.schedule(); // buffer calls to extension host restart
        }
    }
};
WorkspaceChangeExtHostRelauncher = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IExtensionService),
    __param(2, IHostService),
    __param(3, IWorkbenchEnvironmentService)
], WorkspaceChangeExtHostRelauncher);
export { WorkspaceChangeExtHostRelauncher };
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SettingsChangeRelauncher, 3 /* LifecyclePhase.Restored */);
workbenchRegistry.registerWorkbenchContribution(WorkspaceChangeExtHostRelauncher, 3 /* LifecyclePhase.Restored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVsYXVuY2hlci5jb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9yZWxhdW5jaGVyL2Jyb3dzZXIvcmVsYXVuY2hlci5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxVQUFVLEVBQUUsT0FBTyxFQUFlLFlBQVksRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUUvRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDOUMsT0FBTyxFQUFrRCxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25KLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDeEYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSw4QkFBOEIsRUFBRSxvQkFBb0IsRUFBYyxNQUFNLDBEQUEwRCxDQUFDO0FBRTVJLE9BQU8sRUFBRSx3QkFBd0IsRUFBa0IsTUFBTSxvREFBb0QsQ0FBQztBQUM5RyxPQUFPLEVBQTJELFVBQVUsSUFBSSxtQkFBbUIsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzlJLE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQzFHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFN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