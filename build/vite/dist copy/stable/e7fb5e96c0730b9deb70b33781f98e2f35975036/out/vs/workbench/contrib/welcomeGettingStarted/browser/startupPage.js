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
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import * as arrays from '../../../../base/common/arrays.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { IWorkspaceContextService, UNKNOWN_EMPTY_WINDOW_WORKSPACE } from '../../../../platform/workspace/common/workspace.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILifecycleService } from '../../../services/lifecycle/common/lifecycle.js';
import { Disposable, } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { GettingStartedInput, gettingStartedInputTypeId } from './gettingStartedInput.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { getTelemetryLevel } from '../../../../platform/telemetry/common/telemetryUtils.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { localize } from '../../../../nls.js';
import { IEditorResolverService, RegisteredEditorPriority } from '../../../services/editor/common/editorResolverService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { AuxiliaryBarMaximizedContext } from '../../../common/contextkeys.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { getActiveElement } from '../../../../base/browser/dom.js';
export const restoreWalkthroughsConfigurationKey = 'workbench.welcomePage.restorableWalkthroughs';
const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryOptOutStorageKey = 'workbench.telemetryOptOutShown';
let StartupPageEditorResolverContribution = class StartupPageEditorResolverContribution extends Disposable {
    static { this.ID = 'workbench.contrib.startupPageEditorResolver'; }
    constructor(instantiationService, editorResolverService) {
        super();
        this.instantiationService = instantiationService;
        this._register(editorResolverService.registerEditor(`${GettingStartedInput.RESOURCE.scheme}:/**`, {
            id: GettingStartedInput.ID,
            label: localize('welcome.displayName', "Welcome Page"),
            priority: RegisteredEditorPriority.builtin,
        }, {
            singlePerResource: true,
            canSupportResource: uri => uri.scheme === GettingStartedInput.RESOURCE.scheme,
        }, {
            createEditorInput: ({ options }) => {
                return {
                    editor: this.instantiationService.createInstance(GettingStartedInput, options),
                    options: {
                        ...options,
                        pinned: false
                    }
                };
            }
        }));
    }
};
StartupPageEditorResolverContribution = __decorate([
    __param(0, IInstantiationService),
    __param(1, IEditorResolverService)
], StartupPageEditorResolverContribution);
export { StartupPageEditorResolverContribution };
let StartupPageRunnerContribution = class StartupPageRunnerContribution extends Disposable {
    static { this.ID = 'workbench.contrib.startupPageRunner'; }
    constructor(configurationService, editorService, fileService, contextService, lifecycleService, layoutService, productService, commandService, environmentService, storageService, notificationService, contextKeyService) {
        super();
        this.configurationService = configurationService;
        this.editorService = editorService;
        this.fileService = fileService;
        this.contextService = contextService;
        this.lifecycleService = lifecycleService;
        this.layoutService = layoutService;
        this.productService = productService;
        this.commandService = commandService;
        this.environmentService = environmentService;
        this.storageService = storageService;
        this.notificationService = notificationService;
        this.contextKeyService = contextKeyService;
        this.run().then(undefined, onUnexpectedError);
        this._register(this.editorService.onDidCloseEditor((e) => {
            if (e.editor instanceof GettingStartedInput) {
                e.editor.selectedCategory = undefined;
                e.editor.selectedStep = undefined;
            }
        }));
    }
    async run() {
        // Wait for resolving startup editor until we are restored to reduce startup pressure
        await this.lifecycleService.when(3 /* LifecyclePhase.Restored */);
        if (AuxiliaryBarMaximizedContext.getValue(this.contextKeyService)) {
            // If the auxiliary bar is maximized, we do not show the welcome page.
            return;
        }
        // Always open Welcome page for first-launch, no matter what is open or which startupEditor is set.
        if (this.productService.enableTelemetry
            && this.productService.showTelemetryOptOut
            && getTelemetryLevel(this.configurationService) !== 0 /* TelemetryLevel.NONE */
            && !this.environmentService.skipWelcome
            && !this.storageService.get(telemetryOptOutStorageKey, 0 /* StorageScope.PROFILE */)) {
            this.storageService.store(telemetryOptOutStorageKey, true, 0 /* StorageScope.PROFILE */, 0 /* StorageTarget.USER */);
        }
        if (this.tryOpenWalkthroughForFolder()) {
            return;
        }
        const enabled = isStartupPageEnabled(this.configurationService, this.contextService, this.environmentService);
        if (enabled && this.lifecycleService.startupKind !== 3 /* StartupKind.ReloadedWindow */) {
            // Open the welcome even if we opened a set of default editors
            if (!this.editorService.activeEditor || this.layoutService.openedDefaultEditors) {
                const startupEditorSetting = this.configurationService.inspect(configurationKey);
                if (startupEditorSetting.value === 'readme') {
                    await this.openReadme();
                }
                else if (startupEditorSetting.value === 'welcomePage' || startupEditorSetting.value === 'welcomePageInEmptyWorkbench') {
                    await this.openGettingStarted(true);
                }
                else if (startupEditorSetting.value === 'terminal') {
                    this.commandService.executeCommand("workbench.action.createTerminalEditor" /* TerminalCommandId.CreateTerminalEditor */);
                }
            }
        }
    }
    tryOpenWalkthroughForFolder() {
        const toRestore = this.storageService.get(restoreWalkthroughsConfigurationKey, 0 /* StorageScope.PROFILE */);
        if (!toRestore) {
            return false;
        }
        else {
            const restoreData = JSON.parse(toRestore);
            const currentWorkspace = this.contextService.getWorkspace();
            if (restoreData.folder === UNKNOWN_EMPTY_WINDOW_WORKSPACE.id || restoreData.folder === currentWorkspace.folders[0].uri.toString()) {
                const options = { selectedCategory: restoreData.category, selectedStep: restoreData.step, pinned: false, preserveFocus: this.shouldPreserveFocus() };
                this.editorService.openEditor({
                    resource: GettingStartedInput.RESOURCE,
                    options
                });
                this.storageService.remove(restoreWalkthroughsConfigurationKey, 0 /* StorageScope.PROFILE */);
                return true;
            }
        }
        return false;
    }
    async openReadme() {
        const readmes = arrays.coalesce(await Promise.all(this.contextService.getWorkspace().folders.map(async (folder) => {
            const folderUri = folder.uri;
            const folderStat = await this.fileService.resolve(folderUri).catch(onUnexpectedError);
            const files = folderStat?.children ? folderStat.children.map(child => child.name).sort() : [];
            const file = files.find(file => file.toLowerCase() === 'readme.md') || files.find(file => file.toLowerCase().startsWith('readme'));
            if (file) {
                return joinPath(folderUri, file);
            }
            else {
                return undefined;
            }
        })));
        if (!this.editorService.activeEditor) {
            if (readmes.length) {
                const isMarkDown = (readme) => readme.path.toLowerCase().endsWith('.md');
                await Promise.all([
                    this.commandService.executeCommand('markdown.showPreview', null, readmes.filter(isMarkDown), { locked: true }).catch(error => {
                        this.notificationService.error(localize('startupPage.markdownPreviewError', 'Could not open markdown preview: {0}.\n\nPlease make sure the markdown extension is enabled.', error.message));
                    }),
                    this.editorService.openEditors(readmes.filter(readme => !isMarkDown(readme)).map(readme => ({ resource: readme, options: { preserveFocus: this.shouldPreserveFocus() } }))),
                ]);
            }
            else {
                // If no readme is found, default to showing the welcome page.
                await this.openGettingStarted();
            }
        }
    }
    async openGettingStarted(showTelemetryNotice) {
        const startupEditorTypeID = gettingStartedInputTypeId;
        const editor = this.editorService.activeEditor;
        // Ensure that the welcome editor won't get opened more than once
        if (editor?.typeId === startupEditorTypeID || this.editorService.editors.some(e => e.typeId === startupEditorTypeID)) {
            return;
        }
        if (startupEditorTypeID === gettingStartedInputTypeId) {
            this.editorService.openEditor({
                resource: GettingStartedInput.RESOURCE,
                options: {
                    index: editor ? 0 : undefined,
                    pinned: false,
                    preserveFocus: this.shouldPreserveFocus(),
                    ...{ showTelemetryNotice }
                },
            });
        }
    }
    shouldPreserveFocus() {
        const activeElement = getActiveElement();
        if (!activeElement || activeElement === mainWindow.document.body || this.layoutService.hasFocus("workbench.parts.editor" /* Parts.EDITOR_PART */)) {
            return false; // steal focus if nothing meaningful is focused or editor area has focus
        }
        return true; // do not steal focus
    }
};
StartupPageRunnerContribution = __decorate([
    __param(0, IConfigurationService),
    __param(1, IEditorService),
    __param(2, IFileService),
    __param(3, IWorkspaceContextService),
    __param(4, ILifecycleService),
    __param(5, IWorkbenchLayoutService),
    __param(6, IProductService),
    __param(7, ICommandService),
    __param(8, IWorkbenchEnvironmentService),
    __param(9, IStorageService),
    __param(10, INotificationService),
    __param(11, IContextKeyService)
], StartupPageRunnerContribution);
export { StartupPageRunnerContribution };
function isStartupPageEnabled(configurationService, contextService, environmentService) {
    if (environmentService.skipWelcome) {
        return false;
    }
    const startupEditor = configurationService.inspect(configurationKey);
    if (!startupEditor.userValue && !startupEditor.workspaceValue) {
        const welcomeEnabled = configurationService.inspect(oldConfigurationKey);
        if (welcomeEnabled.value !== undefined && welcomeEnabled.value !== null) {
            return welcomeEnabled.value;
        }
    }
    return startupEditor.value === 'welcomePage'
        || startupEditor.value === 'readme'
        || (contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */ && startupEditor.value === 'welcomePageInEmptyWorkbench')
        || startupEditor.value === 'terminal';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RhcnR1cFBhZ2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvYnJvd3Nlci9zdGFydHVwUGFnZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbkYsT0FBTyxLQUFLLE1BQU0sTUFBTSxtQ0FBbUMsQ0FBQztBQUU1RCxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw0REFBNEQsQ0FBQztBQUNuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDdEUsT0FBTyxFQUFFLHdCQUF3QixFQUFFLDhCQUE4QixFQUFrQixNQUFNLG9EQUFvRCxDQUFDO0FBQzlJLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxpQkFBaUIsRUFBK0IsTUFBTSxpREFBaUQsQ0FBQztBQUNqSCxPQUFPLEVBQUUsVUFBVSxHQUFHLE1BQU0sc0NBQXNDLENBQUM7QUFDbkUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNoRSxPQUFPLEVBQUUsdUJBQXVCLEVBQVMsTUFBTSxtREFBbUQsQ0FBQztBQUNuRyxPQUFPLEVBQStCLG1CQUFtQixFQUFFLHlCQUF5QixFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFDdkgsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDMUcsT0FBTyxFQUFFLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FB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