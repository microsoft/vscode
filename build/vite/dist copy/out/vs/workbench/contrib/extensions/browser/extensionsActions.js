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
var InstallAction_1, InstallInOtherServerAction_1, UninstallAction_1, UpdateAction_1, ToggleAutoUpdateForExtensionAction_1, ToggleAutoUpdatesForPublisherAction_1, MigrateDeprecatedExtensionAction_1, ManageExtensionAction_1, TogglePreReleaseExtensionAction_1, InstallAnotherVersionAction_1, EnableForWorkspaceAction_1, EnableGloballyAction_1, DisableForWorkspaceAction_1, DisableGloballyAction_1, ExtensionRuntimeStateAction_1, SetColorThemeAction_1, SetFileIconThemeAction_1, SetProductIconThemeAction_1, SetLanguageAction_1, ClearLanguageAction_1, ShowRecommendedExtensionAction_1, InstallRecommendedExtensionAction_1, IgnoreExtensionRecommendationAction_1, UndoIgnoreExtensionRecommendationAction_1, ExtensionStatusLabelAction_1, ToggleSyncExtensionAction_1, ExtensionStatusAction_1, InstallSpecificVersionOfExtensionAction_1;
import './media/extensionActions.css';
import { localize, localize2 } from '../../../../nls.js';
import { Action, Separator, SubmenuAction } from '../../../../base/common/actions.js';
import { Delayer, Promises, Throttler } from '../../../../base/common/async.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import * as json from '../../../../base/common/json.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { disposeIfDisposable } from '../../../../base/common/lifecycle.js';
import { IExtensionsWorkbenchService, TOGGLE_IGNORE_EXTENSION_ACTION_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, INSTALL_ACTIONS_GROUP, UPDATE_ACTIONS_GROUP, AutoUpdateConfigurationKey } from '../common/extensions.js';
import { ExtensionsConfigurationInitialContent } from '../common/extensionsFileTemplate.js';
import { IExtensionGalleryService, IAllowedExtensionsService, shouldRequireRepositorySignatureFor } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { areSameExtensions, getExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionIdentifier, isLanguagePackExtension, getWorkspaceSupportTypeMessage, isApplicationScopedExtension } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IExtensionService, toExtension, toExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerThemingParticipant } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground, registerColor, editorWarningForeground, editorInfoForeground, editorErrorForeground, buttonSeparator, buttonBorder, contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId, IMenuService } from '../../../../platform/actions/common/actions.js';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from '../../../browser/actions/workspaceCommands.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { IWorkbenchThemeService } from '../../../services/themes/common/workbenchThemeService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IProgressService } from '../../../../platform/progress/common/progress.js';
import { ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { EXTENSIONS_CONFIG } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { errorIcon, infoIcon, manageExtensionIcon, syncEnabledIcon, syncIgnoredIcon, trustIcon, warningIcon } from './extensionsIcons.js';
import { isIOS, isWeb, language } from '../../../../base/common/platform.js';
import { IExtensionManifestPropertiesService } from '../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { createCommandUri, escapeMarkdownSyntaxTokens, MarkdownString } from '../../../../base/common/htmlContent.js';
import { fromNow } from '../../../../base/common/date.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { getLocale } from '../../../../platform/languagePacks/common/languagePacks.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { isString } from '../../../../base/common/types.js';
import { showWindowLogActionId } from '../../../services/log/common/logConstants.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Extensions, IExtensionFeaturesManagementService } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { ActionWithDropdownActionViewItem } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
let PromptExtensionInstallFailureAction = class PromptExtensionInstallFailureAction extends Action {
    constructor(extension, options, version, installOperation, error, productService, openerService, notificationService, dialogService, commandService, logService, extensionManagementServerService, instantiationService, galleryService, extensionManifestPropertiesService, workbenchIssueService) {
        super('extension.promptExtensionInstallFailure');
        this.extension = extension;
        this.options = options;
        this.version = version;
        this.installOperation = installOperation;
        this.error = error;
        this.productService = productService;
        this.openerService = openerService;
        this.notificationService = notificationService;
        this.dialogService = dialogService;
        this.commandService = commandService;
        this.logService = logService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.instantiationService = instantiationService;
        this.galleryService = galleryService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.workbenchIssueService = workbenchIssueService;
    }
    async run() {
        if (isCancellationError(this.error)) {
            return;
        }
        this.logService.error(this.error);
        if (this.error.name === "Unsupported" /* ExtensionManagementErrorCode.Unsupported */) {
            const productName = isWeb ? localize('VS Code for Web', "{0} for the Web", this.productService.nameLong) : this.productService.nameLong;
            const message = localize('cannot be installed', "The '{0}' extension is not available in {1}. Click 'More Information' to learn more.", this.extension.displayName || this.extension.identifier.id, productName);
            const { confirmed } = await this.dialogService.confirm({
                type: Severity.Info,
                message,
                primaryButton: localize({ key: 'more information', comment: ['&& denotes a mnemonic'] }, "&&More Information"),
                cancelButton: localize('close', "Close")
            });
            if (confirmed) {
                this.openerService.open(isWeb ? URI.parse('https://aka.ms/vscode-web-extensions-guide') : URI.parse('https://aka.ms/vscode-remote'));
            }
            return;
        }
        if ("ReleaseVersionNotFound" /* ExtensionManagementErrorCode.ReleaseVersionNotFound */ === this.error.name) {
            await this.dialogService.prompt({
                type: 'error',
                message: getErrorMessage(this.error),
                buttons: [{
                        label: localize('install prerelease', "Install Pre-Release"),
                        run: () => {
                            const installAction = this.instantiationService.createInstance(InstallAction, { installPreReleaseVersion: true });
                            installAction.extension = this.extension;
                            return installAction.run();
                        }
                    }],
                cancelButton: localize('cancel', "Cancel")
            });
            return;
        }
        if (["Incompatible" /* ExtensionManagementErrorCode.Incompatible */, "IncompatibleApi" /* ExtensionManagementErrorCode.IncompatibleApi */, "IncompatibleTargetPlatform" /* ExtensionManagementErrorCode.IncompatibleTargetPlatform */, "Malicious" /* ExtensionManagementErrorCode.Malicious */, "Deprecated" /* ExtensionManagementErrorCode.Deprecated */].includes(this.error.name)) {
            await this.dialogService.info(getErrorMessage(this.error));
            return;
        }
        if ("PackageNotSigned" /* ExtensionManagementErrorCode.PackageNotSigned */ === this.error.name) {
            await this.dialogService.prompt({
                type: 'error',
                message: localize('not signed', "'{0}' is an extension from an unknown source. Are you sure you want to install?", this.extension.displayName),
                detail: getErrorMessage(this.error),
                buttons: [{
                        label: localize('install anyway', "Install Anyway"),
                        run: () => {
                            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true, });
                            installAction.extension = this.extension;
                            return installAction.run();
                        }
                    }],
                cancelButton: true
            });
            return;
        }
        if ("SignatureVerificationFailed" /* ExtensionManagementErrorCode.SignatureVerificationFailed */ === this.error.name) {
            await this.dialogService.prompt({
                type: 'error',
                message: localize('verification failed', "Cannot install '{0}' extension because {1} cannot verify the extension signature", this.extension.displayName, this.productService.nameLong),
                detail: getErrorMessage(this.error),
                buttons: [{
                        label: localize('learn more', "Learn More"),
                        run: () => this.openerService.open('https://code.visualstudio.com/docs/editor/extension-marketplace#_the-extension-signature-cannot-be-verified-by-vs-code')
                    }, {
                        label: localize('install donot verify', "Install Anyway (Don't Verify Signature)"),
                        run: () => {
                            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true, });
                            installAction.extension = this.extension;
                            return installAction.run();
                        }
                    }],
                cancelButton: true
            });
            return;
        }
        if ("SignatureVerificationInternal" /* ExtensionManagementErrorCode.SignatureVerificationInternal */ === this.error.name) {
            await this.dialogService.prompt({
                type: 'error',
                message: localize('verification failed', "Cannot install '{0}' extension because {1} cannot verify the extension signature", this.extension.displayName, this.productService.nameLong),
                detail: getErrorMessage(this.error),
                buttons: [{
                        label: localize('learn more', "Learn More"),
                        run: () => this.openerService.open('https://code.visualstudio.com/docs/editor/extension-marketplace#_the-extension-signature-cannot-be-verified-by-vs-code')
                    }, {
                        label: localize('report issue', "Report Issue"),
                        run: () => this.workbenchIssueService.openReporter({
                            issueTitle: localize('report issue title', "Extension Signature Verification Failed: {0}", this.extension.displayName),
                            issueBody: localize('report issue body', "Please include following log `F1 > Open View... > Shared` below.\n\n")
                        })
                    }, {
                        label: localize('install donot verify', "Install Anyway (Don't Verify Signature)"),
                        run: () => {
                            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true, });
                            installAction.extension = this.extension;
                            return installAction.run();
                        }
                    }],
                cancelButton: true
            });
            return;
        }
        const operationMessage = this.installOperation === 3 /* InstallOperation.Update */ ? localize('update operation', "Error while updating '{0}' extension.", this.extension.displayName || this.extension.identifier.id)
            : localize('install operation', "Error while installing '{0}' extension.", this.extension.displayName || this.extension.identifier.id);
        let additionalMessage;
        const promptChoices = [];
        const downloadUrl = await this.getDownloadUrl();
        if (downloadUrl) {
            additionalMessage = localize('check logs', "Please check the [log]({0}) for more details.", createCommandUri(showWindowLogActionId).toString());
            promptChoices.push({
                label: localize('download', "Try Downloading Manually..."),
                run: () => this.openerService.open(downloadUrl).then(() => {
                    this.notificationService.prompt(Severity.Info, localize('install vsix', 'Once downloaded, please manually install the downloaded VSIX of \'{0}\'.', this.extension.identifier.id), [{
                            label: localize('installVSIX', "Install from VSIX..."),
                            run: () => this.commandService.executeCommand(SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID)
                        }]);
                })
            });
        }
        const message = `${operationMessage}${additionalMessage ? ` ${additionalMessage}` : ''}`;
        this.notificationService.prompt(Severity.Error, message, promptChoices);
    }
    async getDownloadUrl() {
        if (isIOS) {
            return undefined;
        }
        if (!this.extension.gallery) {
            return undefined;
        }
        if (!this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer) {
            return undefined;
        }
        let targetPlatform = this.extension.gallery.properties.targetPlatform;
        if (targetPlatform !== "universal" /* TargetPlatform.UNIVERSAL */ && targetPlatform !== "undefined" /* TargetPlatform.UNDEFINED */ && this.extensionManagementServerService.remoteExtensionManagementServer) {
            try {
                const manifest = await this.galleryService.getManifest(this.extension.gallery, CancellationToken.None);
                if (manifest && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(manifest)) {
                    targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
                }
            }
            catch (error) {
                this.logService.error(error);
                return undefined;
            }
        }
        if (targetPlatform === "unknown" /* TargetPlatform.UNKNOWN */) {
            return undefined;
        }
        const [extension] = await this.galleryService.getExtensions([{
                ...this.extension.identifier,
                version: this.version
            }], {
            targetPlatform
        }, CancellationToken.None);
        if (!extension) {
            return undefined;
        }
        return URI.parse(extension.assets.download.uri);
    }
};
PromptExtensionInstallFailureAction = __decorate([
    __param(5, IProductService),
    __param(6, IOpenerService),
    __param(7, INotificationService),
    __param(8, IDialogService),
    __param(9, ICommandService),
    __param(10, ILogService),
    __param(11, IExtensionManagementServerService),
    __param(12, IInstantiationService),
    __param(13, IExtensionGalleryService),
    __param(14, IExtensionManifestPropertiesService),
    __param(15, IWorkbenchIssueService)
], PromptExtensionInstallFailureAction);
export { PromptExtensionInstallFailureAction };
export class ExtensionAction extends Action {
    constructor() {
        super(...arguments);
        this._onDidChange = this._register(new Emitter());
        this._extension = null;
        this._hidden = false;
        this.hideOnDisabled = true;
    }
    get onDidChange() { return this._onDidChange.event; }
    static { this.EXTENSION_ACTION_CLASS = 'extension-action'; }
    static { this.TEXT_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} text`; }
    static { this.LABEL_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} label`; }
    static { this.ICON_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} icon`; }
    get extension() { return this._extension; }
    set extension(extension) { this._extension = extension; this.update(); }
    get hidden() { return this._hidden; }
    set hidden(hidden) {
        if (this._hidden !== hidden) {
            this._hidden = hidden;
            this._onDidChange.fire({ hidden });
        }
    }
    _setEnabled(value) {
        super._setEnabled(value);
        if (this.hideOnDisabled) {
            this.hidden = !value;
        }
    }
}
export class ButtonWithDropDownExtensionAction extends ExtensionAction {
    get menuActions() { return [...this._menuActions]; }
    get extension() {
        return super.extension;
    }
    set extension(extension) {
        this.extensionActions.forEach(a => a.extension = extension);
        super.extension = extension;
    }
    constructor(id, clazz, actionsGroups) {
        clazz = `${clazz} action-dropdown`;
        super(id, undefined, clazz);
        this.actionsGroups = actionsGroups;
        this.menuActionClassNames = [];
        this._menuActions = [];
        this.menuActionClassNames = clazz.split(' ');
        this.hideOnDisabled = false;
        this.extensionActions = actionsGroups.flat();
        this.update();
        this._register(Event.any(...this.extensionActions.map(a => a.onDidChange))(() => this.update(true)));
        this.extensionActions.forEach(a => this._register(a));
    }
    update(donotUpdateActions) {
        if (!donotUpdateActions) {
            this.extensionActions.forEach(a => a.update());
        }
        const actionsGroups = this.actionsGroups.map(actionsGroup => actionsGroup.filter(a => !a.hidden));
        let actions = [];
        for (const visibleActions of actionsGroups) {
            if (visibleActions.length) {
                actions = [...actions, ...visibleActions, new Separator()];
            }
        }
        actions = actions.length ? actions.slice(0, actions.length - 1) : actions;
        this.primaryAction = actions[0];
        this._menuActions = actions.length > 1 ? actions : [];
        this._onDidChange.fire({ menuActions: this._menuActions });
        if (this.primaryAction) {
            this.hidden = false;
            this.enabled = this.primaryAction.enabled;
            this.label = this.getLabel(this.primaryAction);
            this.tooltip = this.primaryAction.tooltip;
        }
        else {
            this.hidden = true;
            this.enabled = false;
        }
    }
    async run() {
        if (this.enabled) {
            await this.primaryAction?.run();
        }
    }
    getLabel(action) {
        return action.label;
    }
}
export class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {
    constructor(action, options, contextMenuProvider) {
        super(null, action, options, contextMenuProvider);
        this._register(action.onDidChange(e => {
            if (e.hidden !== undefined || e.menuActions !== undefined) {
                this.updateClass();
            }
        }));
    }
    render(container) {
        super.render(container);
        this.updateClass();
    }
    updateClass() {
        super.updateClass();
        if (this.element && this.dropdownMenuActionViewItem?.element) {
            this.element.classList.toggle('hide', this._action.hidden);
            const isMenuEmpty = this._action.menuActions.length === 0;
            this.element.classList.toggle('empty', isMenuEmpty);
            this.dropdownMenuActionViewItem.element.classList.toggle('hide', isMenuEmpty);
        }
    }
}
let InstallAction = class InstallAction extends ExtensionAction {
    static { InstallAction_1 = this; }
    static { this.CLASS = `${this.LABEL_ACTION_CLASS} prominent install`; }
    static { this.HIDE = `${this.CLASS} hide`; }
    set manifest(manifest) {
        this._manifest = manifest;
        this.updateLabel();
    }
    constructor(options, extensionsWorkbenchService, instantiationService, runtimeExtensionService, workbenchThemeService, labelService, dialogService, preferencesService, telemetryService, contextService, allowedExtensionsService, extensionGalleryManifestService) {
        super('extensions.install', localize('install', "Install"), InstallAction_1.CLASS, false);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.instantiationService = instantiationService;
        this.runtimeExtensionService = runtimeExtensionService;
        this.workbenchThemeService = workbenchThemeService;
        this.labelService = labelService;
        this.dialogService = dialogService;
        this.preferencesService = preferencesService;
        this.telemetryService = telemetryService;
        this.contextService = contextService;
        this.allowedExtensionsService = allowedExtensionsService;
        this.extensionGalleryManifestService = extensionGalleryManifestService;
        this._manifest = null;
        this.updateThrottler = this._register(new Throttler());
        this.hideOnDisabled = false;
        this.options = { isMachineScoped: false, ...options };
        this.update();
        this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
        this._register(this.labelService.onDidChangeFormatters(() => this.updateLabel(), this));
    }
    update() {
        this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
    }
    async computeAndUpdateEnablement() {
        this.enabled = false;
        this.class = InstallAction_1.HIDE;
        this.hidden = true;
        if (!this.extension) {
            return;
        }
        if (this.extension.isBuiltin) {
            return;
        }
        if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
            return;
        }
        if (this.extension.state !== 3 /* ExtensionState.Uninstalled */) {
            return;
        }
        if (this.options.installPreReleaseVersion && (!this.extension.hasPreReleaseVersion || this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName, prerelease: true }) !== true)) {
            return;
        }
        if (!this.options.installPreReleaseVersion && !this.extension.hasReleaseVersion) {
            return;
        }
        this.hidden = false;
        this.class = InstallAction_1.CLASS;
        if (await this.extensionsWorkbenchService.canInstall(this.extension) === true) {
            this.enabled = true;
            this.updateLabel();
        }
    }
    async run() {
        if (!this.extension) {
            return;
        }
        if (this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
            const { result } = await this.dialogService.prompt({
                type: Severity.Warning,
                message: localize('not signed', "'{0}' is an extension from an unknown source. Are you sure you want to install?", this.extension.displayName),
                detail: localize('not signed detail', "Extension is not signed."),
                buttons: [
                    {
                        label: localize('install anyway', "Install Anyway"),
                        run: () => {
                            this.options.donotVerifySignature = true;
                            return true;
                        }
                    }
                ],
                cancelButton: {
                    run: () => false
                }
            });
            if (!result) {
                return;
            }
        }
        if (this.extension.deprecationInfo) {
            let detail = localize('deprecated message', "This extension is deprecated as it is no longer being maintained.");
            let DeprecationChoice;
            (function (DeprecationChoice) {
                DeprecationChoice[DeprecationChoice["InstallAnyway"] = 0] = "InstallAnyway";
                DeprecationChoice[DeprecationChoice["ShowAlternateExtension"] = 1] = "ShowAlternateExtension";
                DeprecationChoice[DeprecationChoice["ConfigureSettings"] = 2] = "ConfigureSettings";
                DeprecationChoice[DeprecationChoice["Cancel"] = 3] = "Cancel";
            })(DeprecationChoice || (DeprecationChoice = {}));
            const buttons = [
                {
                    label: localize('install anyway', "Install Anyway"),
                    run: () => DeprecationChoice.InstallAnyway
                }
            ];
            if (this.extension.deprecationInfo.extension) {
                detail = localize('deprecated with alternate extension message', "This extension is deprecated. Use the {0} extension instead.", this.extension.deprecationInfo.extension.displayName);
                const alternateExtension = this.extension.deprecationInfo.extension;
                buttons.push({
                    label: localize({ key: 'Show alternate extension', comment: ['&& denotes a mnemonic'] }, "&&Open {0}", this.extension.deprecationInfo.extension.displayName),
                    run: async () => {
                        const [extension] = await this.extensionsWorkbenchService.getExtensions([{ id: alternateExtension.id, preRelease: alternateExtension.preRelease }], CancellationToken.None);
                        await this.extensionsWorkbenchService.open(extension);
                        return DeprecationChoice.ShowAlternateExtension;
                    }
                });
            }
            else if (this.extension.deprecationInfo.settings) {
                detail = localize('deprecated with alternate settings message', "This extension is deprecated as this functionality is now built-in to VS Code.");
                const settings = this.extension.deprecationInfo.settings;
                buttons.push({
                    label: localize({ key: 'configure in settings', comment: ['&& denotes a mnemonic'] }, "&&Configure Settings"),
                    run: async () => {
                        await this.preferencesService.openSettings({ query: settings.map(setting => `@id:${setting}`).join(' ') });
                        return DeprecationChoice.ConfigureSettings;
                    }
                });
            }
            else if (this.extension.deprecationInfo.additionalInfo) {
                detail = new MarkdownString(`${detail} ${this.extension.deprecationInfo.additionalInfo}`);
            }
            const { result } = await this.dialogService.prompt({
                type: Severity.Warning,
                message: localize('install confirmation', "Are you sure you want to install '{0}'?", this.extension.displayName),
                detail: isString(detail) ? detail : undefined,
                custom: isString(detail) ? undefined : {
                    markdownDetails: [{
                            markdown: detail
                        }]
                },
                buttons,
                cancelButton: {
                    run: () => DeprecationChoice.Cancel
                }
            });
            if (result !== DeprecationChoice.InstallAnyway) {
                return;
            }
        }
        this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: this.options.installPreReleaseVersion });
        alert(localize('installExtensionStart', "Installing extension {0} started. An editor is now open with more details on this extension", this.extension.displayName));
        /* __GDPR__
            "extensions:action:install" : {
                "owner": "sandy081",
                "actionId" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
                "${include}": [
                    "${GalleryExtensionTelemetryData}"
                ]
            }
        */
        this.telemetryService.publicLog('extensions:action:install', { ...this.extension.telemetryData, actionId: this.id });
        const extension = await this.install(this.extension);
        if (extension?.local) {
            alert(localize('installExtensionComplete', "Installing extension {0} is completed.", this.extension.displayName));
            const runningExtension = await this.getRunningExtension(extension.local);
            if (runningExtension && !(runningExtension.activationEvents && runningExtension.activationEvents.some(activationEent => activationEent.startsWith('onLanguage')))) {
                const action = await this.getThemeAction(extension);
                if (action) {
                    action.extension = extension;
                    try {
                        return action.run({ showCurrentTheme: true, ignoreFocusLost: true });
                    }
                    finally {
                        action.dispose();
                    }
                }
            }
        }
    }
    async getThemeAction(extension) {
        const colorThemes = await this.workbenchThemeService.getColorThemes();
        if (colorThemes.some(theme => isThemeFromExtension(theme, extension))) {
            return this.instantiationService.createInstance(SetColorThemeAction);
        }
        const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
        if (fileIconThemes.some(theme => isThemeFromExtension(theme, extension))) {
            return this.instantiationService.createInstance(SetFileIconThemeAction);
        }
        const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
        if (productIconThemes.some(theme => isThemeFromExtension(theme, extension))) {
            return this.instantiationService.createInstance(SetProductIconThemeAction);
        }
        return undefined;
    }
    async install(extension) {
        try {
            return await this.extensionsWorkbenchService.install(extension, this.options);
        }
        catch (error) {
            await this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, this.options, extension.latestVersion, 2 /* InstallOperation.Install */, error).run();
            return undefined;
        }
    }
    async getRunningExtension(extension) {
        const runningExtension = await this.runtimeExtensionService.getExtension(extension.identifier.id);
        if (runningExtension) {
            return runningExtension;
        }
        if (this.runtimeExtensionService.canAddExtension(toExtensionDescription(extension))) {
            return new Promise((c, e) => {
                const disposable = this.runtimeExtensionService.onDidChangeExtensions(async () => {
                    const runningExtension = await this.runtimeExtensionService.getExtension(extension.identifier.id);
                    if (runningExtension) {
                        disposable.dispose();
                        c(runningExtension);
                    }
                });
            });
        }
        return null;
    }
    updateLabel() {
        this.label = this.getLabel();
    }
    getLabel(primary) {
        if (this.extension?.isWorkspaceScoped && this.extension.resourceExtension && this.contextService.isInsideWorkspace(this.extension.resourceExtension.location)) {
            return localize('install workspace version', "Install Workspace Extension");
        }
        /* install pre-release version */
        if (this.options.installPreReleaseVersion && this.extension?.hasPreReleaseVersion) {
            return primary ? localize('install pre-release', "Install Pre-Release") : localize('install pre-release version', "Install Pre-Release Version");
        }
        /* install released version that has a pre release version */
        if (this.extension?.hasPreReleaseVersion) {
            return primary ? localize('install', "Install") : localize('install release version', "Install Release Version");
        }
        return localize('install', "Install");
    }
};
InstallAction = InstallAction_1 = __decorate([
    __param(1, IExtensionsWorkbenchService),
    __param(2, IInstantiationService),
    __param(3, IExtensionService),
    __param(4, IWorkbenchThemeService),
    __param(5, ILabelService),
    __param(6, IDialogService),
    __param(7, IPreferencesService),
    __param(8, ITelemetryService),
    __param(9, IWorkspaceContextService),
    __param(10, IAllowedExtensionsService),
    __param(11, IExtensionGalleryManifestService)
], InstallAction);
export { InstallAction };
let InstallDropdownAction = class InstallDropdownAction extends ButtonWithDropDownExtensionAction {
    set manifest(manifest) {
        this.extensionActions.forEach(a => a.manifest = manifest);
        this.update();
    }
    constructor(instantiationService, extensionManagementService) {
        super(`extensions.installActions`, InstallAction.CLASS, [
            [
                instantiationService.createInstance(InstallAction, { installPreReleaseVersion: extensionManagementService.preferPreReleases }),
                instantiationService.createInstance(InstallAction, { installPreReleaseVersion: !extensionManagementService.preferPreReleases }),
            ]
        ]);
    }
    getLabel(action) {
        return action.getLabel(true);
    }
};
InstallDropdownAction = __decorate([
    __param(0, IInstantiationService),
    __param(1, IWorkbenchExtensionManagementService)
], InstallDropdownAction);
export { InstallDropdownAction };
export class InstallingLabelAction extends ExtensionAction {
    static { this.LABEL = localize('installing', "Installing"); }
    static { this.CLASS = `${ExtensionAction.LABEL_ACTION_CLASS} install installing`; }
    constructor() {
        super('extension.installing', InstallingLabelAction.LABEL, InstallingLabelAction.CLASS, false);
    }
    update() {
        this.class = `${InstallingLabelAction.CLASS}${this.extension && this.extension.state === 0 /* ExtensionState.Installing */ ? '' : ' hide'}`;
    }
}
let InstallInOtherServerAction = class InstallInOtherServerAction extends ExtensionAction {
    static { InstallInOtherServerAction_1 = this; }
    static { this.INSTALL_LABEL = localize('install', "Install"); }
    static { this.INSTALLING_LABEL = localize('installing', "Installing"); }
    static { this.Class = `${ExtensionAction.LABEL_ACTION_CLASS} prominent install-other-server`; }
    static { this.InstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} install-other-server installing`; }
    constructor(id, server, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
        super(id, InstallInOtherServerAction_1.INSTALL_LABEL, InstallInOtherServerAction_1.Class, false);
        this.server = server;
        this.canInstallAnyWhere = canInstallAnyWhere;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.updateWhenCounterExtensionChanges = true;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = InstallInOtherServerAction_1.Class;
        if (this.canInstall()) {
            const extensionInOtherServer = this.extensionsWorkbenchService.installed.filter(e => areSameExtensions(e.identifier, this.extension.identifier) && e.server === this.server)[0];
            if (extensionInOtherServer) {
                // Getting installed in other server
                if (extensionInOtherServer.state === 0 /* ExtensionState.Installing */ && !extensionInOtherServer.local) {
                    this.enabled = true;
                    this.label = InstallInOtherServerAction_1.INSTALLING_LABEL;
                    this.class = InstallInOtherServerAction_1.InstallingClass;
                }
            }
            else {
                // Not installed in other server
                this.enabled = true;
                this.label = this.getInstallLabel();
            }
        }
    }
    canInstall() {
        // Disable if extension is not installed or not an user extension
        if (!this.extension
            || !this.server
            || !this.extension.local
            || this.extension.state !== 1 /* ExtensionState.Installed */
            || this.extension.type !== 1 /* ExtensionType.User */
            || this.extension.enablementState === 2 /* EnablementState.DisabledByEnvironment */ || this.extension.enablementState === 0 /* EnablementState.DisabledByTrustRequirement */ || this.extension.enablementState === 5 /* EnablementState.DisabledByVirtualWorkspace */) {
            return false;
        }
        if (isLanguagePackExtension(this.extension.local.manifest)) {
            return true;
        }
        // Prefers to run on UI
        if (this.server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
            return true;
        }
        // Prefers to run on Workspace
        if (this.server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
            return true;
        }
        // Prefers to run on Web
        if (this.server === this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWeb(this.extension.local.manifest)) {
            return true;
        }
        if (this.canInstallAnyWhere) {
            // Can run on UI
            if (this.server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnUI(this.extension.local.manifest)) {
                return true;
            }
            // Can run on Workspace
            if (this.server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(this.extension.local.manifest)) {
                return true;
            }
        }
        return false;
    }
    async run() {
        if (!this.extension?.local) {
            return;
        }
        if (!this.extension?.server) {
            return;
        }
        if (!this.server) {
            return;
        }
        this.extensionsWorkbenchService.open(this.extension);
        alert(localize('installExtensionStart', "Installing extension {0} started. An editor is now open with more details on this extension", this.extension.displayName));
        return this.extensionsWorkbenchService.installInServer(this.extension, this.server);
    }
};
InstallInOtherServerAction = InstallInOtherServerAction_1 = __decorate([
    __param(3, IExtensionsWorkbenchService),
    __param(4, IExtensionManagementServerService),
    __param(5, IExtensionManifestPropertiesService)
], InstallInOtherServerAction);
export { InstallInOtherServerAction };
let RemoteInstallAction = class RemoteInstallAction extends InstallInOtherServerAction {
    constructor(canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
        super(`extensions.remoteinstall`, extensionManagementServerService.remoteExtensionManagementServer, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
    }
    getInstallLabel() {
        return this.extensionManagementServerService.remoteExtensionManagementServer
            ? localize({ key: 'install in remote', comment: ['This is the name of the action to install an extension in remote server. Placeholder is for the name of remote server.'] }, "Install in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label)
            : InstallInOtherServerAction.INSTALL_LABEL;
    }
};
RemoteInstallAction = __decorate([
    __param(1, IExtensionsWorkbenchService),
    __param(2, IExtensionManagementServerService),
    __param(3, IExtensionManifestPropertiesService)
], RemoteInstallAction);
export { RemoteInstallAction };
let LocalInstallAction = class LocalInstallAction extends InstallInOtherServerAction {
    constructor(extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
        super(`extensions.localinstall`, extensionManagementServerService.localExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
    }
    getInstallLabel() {
        return localize('install locally', "Install Locally");
    }
};
LocalInstallAction = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IExtensionManagementServerService),
    __param(2, IExtensionManifestPropertiesService)
], LocalInstallAction);
export { LocalInstallAction };
let WebInstallAction = class WebInstallAction extends InstallInOtherServerAction {
    constructor(extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
        super(`extensions.webInstall`, extensionManagementServerService.webExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
    }
    getInstallLabel() {
        return localize('install browser', "Install in Browser");
    }
};
WebInstallAction = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IExtensionManagementServerService),
    __param(2, IExtensionManifestPropertiesService)
], WebInstallAction);
export { WebInstallAction };
let UninstallAction = class UninstallAction extends ExtensionAction {
    static { UninstallAction_1 = this; }
    static { this.UninstallLabel = localize('uninstallAction', "Uninstall"); }
    static { this.UninstallingLabel = localize('Uninstalling', "Uninstalling"); }
    static { this.UninstallClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall`; }
    static { this.UnInstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall uninstalling`; }
    constructor(extensionsWorkbenchService, userDataProfilesService, dialogService) {
        super('extensions.uninstall', UninstallAction_1.UninstallLabel, UninstallAction_1.UninstallClass, false);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.userDataProfilesService = userDataProfilesService;
        this.dialogService = dialogService;
        this.update();
    }
    update() {
        if (!this.extension) {
            this.enabled = false;
            return;
        }
        const state = this.extension.state;
        if (state === 2 /* ExtensionState.Uninstalling */) {
            this.label = UninstallAction_1.UninstallingLabel;
            this.class = UninstallAction_1.UnInstallingClass;
            this.enabled = false;
            return;
        }
        this.label = this.extension.local?.isApplicationScoped && this.userDataProfilesService.profiles.length > 1 ? localize('uninstallAll', "Uninstall (All Profiles)") : UninstallAction_1.UninstallLabel;
        this.class = UninstallAction_1.UninstallClass;
        this.tooltip = UninstallAction_1.UninstallLabel;
        if (state !== 1 /* ExtensionState.Installed */) {
            this.enabled = false;
            return;
        }
        if (this.extension.isBuiltin) {
            this.enabled = false;
            return;
        }
        this.enabled = true;
    }
    async run() {
        if (!this.extension) {
            return;
        }
        alert(localize('uninstallExtensionStart', "Uninstalling extension {0} started.", this.extension.displayName));
        try {
            await this.extensionsWorkbenchService.uninstall(this.extension);
            alert(localize('uninstallExtensionComplete', "Please reload Visual Studio Code to complete the uninstallation of the extension {0}.", this.extension.displayName));
        }
        catch (error) {
            if (!isCancellationError(error)) {
                this.dialogService.error(getErrorMessage(error));
            }
        }
    }
};
UninstallAction = UninstallAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IUserDataProfilesService),
    __param(2, IDialogService)
], UninstallAction);
export { UninstallAction };
let UpdateAction = class UpdateAction extends ExtensionAction {
    static { UpdateAction_1 = this; }
    static { this.EnabledClass = `${this.LABEL_ACTION_CLASS} update`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(verbose, extensionsWorkbenchService, dialogService, openerService, instantiationService) {
        super(`extensions.update`, localize('update', "Update"), UpdateAction_1.DisabledClass, false);
        this.verbose = verbose;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.dialogService = dialogService;
        this.openerService = openerService;
        this.instantiationService = instantiationService;
        this.updateThrottler = this._register(new Throttler());
        this.update();
    }
    update() {
        this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
        if (this.extension) {
            this.label = this.verbose ? localize('update to', "Update to v{0}", this.extension.latestVersion) : localize('update', "Update");
        }
    }
    async computeAndUpdateEnablement() {
        this.enabled = false;
        this.class = UpdateAction_1.DisabledClass;
        if (!this.extension) {
            return;
        }
        if (this.extension.deprecationInfo) {
            return;
        }
        const canInstall = await this.extensionsWorkbenchService.canInstall(this.extension);
        const isInstalled = this.extension.state === 1 /* ExtensionState.Installed */;
        this.enabled = canInstall === true && isInstalled && this.extension.outdated;
        this.class = this.enabled ? UpdateAction_1.EnabledClass : UpdateAction_1.DisabledClass;
    }
    async run() {
        if (!this.extension) {
            return;
        }
        const consent = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
        if (consent) {
            const { result } = await this.dialogService.prompt({
                type: 'warning',
                title: localize('updateExtensionConsentTitle', "Update {0} Extension", this.extension.displayName),
                message: localize('updateExtensionConsent', "{0}\n\nWould you like to update the extension?", consent),
                buttons: [{
                        label: localize('update', "Update"),
                        run: () => 'update'
                    }, {
                        label: localize('review', "Review"),
                        run: () => 'review'
                    }, {
                        label: localize('cancel', "Cancel"),
                        run: () => 'cancel'
                    }]
            });
            if (result === 'cancel') {
                return;
            }
            if (result === 'review') {
                if (this.extension.hasChangelog()) {
                    return this.extensionsWorkbenchService.open(this.extension, { tab: "changelog" /* ExtensionEditorTab.Changelog */ });
                }
                if (this.extension.repository) {
                    return this.openerService.open(this.extension.repository);
                }
                return this.extensionsWorkbenchService.open(this.extension);
            }
        }
        const installOptions = {};
        if (this.extension.local?.source === 'vsix' && this.extension.local.pinned) {
            installOptions.pinned = false;
        }
        if (this.extension.local?.preRelease) {
            installOptions.installPreReleaseVersion = true;
        }
        try {
            alert(localize('updateExtensionStart', "Updating extension {0} to version {1} started.", this.extension.displayName, this.extension.latestVersion));
            await this.extensionsWorkbenchService.install(this.extension, installOptions);
            alert(localize('updateExtensionComplete', "Updating extension {0} to version {1} completed.", this.extension.displayName, this.extension.latestVersion));
        }
        catch (err) {
            this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, installOptions, this.extension.latestVersion, 3 /* InstallOperation.Update */, err).run();
        }
    }
};
UpdateAction = UpdateAction_1 = __decorate([
    __param(1, IExtensionsWorkbenchService),
    __param(2, IDialogService),
    __param(3, IOpenerService),
    __param(4, IInstantiationService)
], UpdateAction);
export { UpdateAction };
let ToggleAutoUpdateForExtensionAction = class ToggleAutoUpdateForExtensionAction extends ExtensionAction {
    static { ToggleAutoUpdateForExtensionAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.toggleAutoUpdateForExtension'; }
    static { this.LABEL = localize2('enableAutoUpdateLabel', "Auto Update"); }
    static { this.EnabledClass = `${ExtensionAction.EXTENSION_ACTION_CLASS} auto-update`; }
    static { this.DisabledClass = `${this.EnabledClass} hide`; }
    constructor(extensionsWorkbenchService, extensionEnablementService, allowedExtensionsService, configurationService) {
        super(ToggleAutoUpdateForExtensionAction_1.ID, ToggleAutoUpdateForExtensionAction_1.LABEL.value, ToggleAutoUpdateForExtensionAction_1.DisabledClass);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.allowedExtensionsService = allowedExtensionsService;
        this._register(configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
                this.update();
            }
        }));
        this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(e => this.update()));
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ToggleAutoUpdateForExtensionAction_1.DisabledClass;
        if (!this.extension) {
            return;
        }
        if (this.extension.isBuiltin) {
            return;
        }
        if (this.extension.deprecationInfo?.disallowInstall) {
            return;
        }
        const extension = this.extension.local ?? this.extension.gallery;
        if (extension && this.allowedExtensionsService.isAllowed(extension) !== true) {
            return;
        }
        if (this.extensionsWorkbenchService.getAutoUpdateValue() === 'onlyEnabledExtensions' && !this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState)) {
            return;
        }
        this.enabled = true;
        this.class = ToggleAutoUpdateForExtensionAction_1.EnabledClass;
        this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
    }
    async run() {
        if (!this.extension) {
            return;
        }
        const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
        await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension, enableAutoUpdate);
        if (enableAutoUpdate) {
            alert(localize('enableAutoUpdate', "Enabled auto updates for", this.extension.displayName));
        }
        else {
            alert(localize('disableAutoUpdate', "Disabled auto updates for", this.extension.displayName));
        }
    }
};
ToggleAutoUpdateForExtensionAction = ToggleAutoUpdateForExtensionAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IWorkbenchExtensionEnablementService),
    __param(2, IAllowedExtensionsService),
    __param(3, IConfigurationService)
], ToggleAutoUpdateForExtensionAction);
export { ToggleAutoUpdateForExtensionAction };
let ToggleAutoUpdatesForPublisherAction = class ToggleAutoUpdatesForPublisherAction extends ExtensionAction {
    static { ToggleAutoUpdatesForPublisherAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.toggleAutoUpdatesForPublisher'; }
    static { this.LABEL = localize('toggleAutoUpdatesForPublisherLabel', "Auto Update All (From Publisher)"); }
    constructor(extensionsWorkbenchService) {
        super(ToggleAutoUpdatesForPublisherAction_1.ID, ToggleAutoUpdatesForPublisherAction_1.LABEL);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
    }
    update() { }
    async run() {
        if (!this.extension) {
            return;
        }
        alert(localize('ignoreExtensionUpdatePublisher', "Ignoring updates published by {0}.", this.extension.publisherDisplayName));
        const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
        await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension.publisher, enableAutoUpdate);
        if (enableAutoUpdate) {
            alert(localize('enableAutoUpdate', "Enabled auto updates for", this.extension.displayName));
        }
        else {
            alert(localize('disableAutoUpdate', "Disabled auto updates for", this.extension.displayName));
        }
    }
};
ToggleAutoUpdatesForPublisherAction = ToggleAutoUpdatesForPublisherAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService)
], ToggleAutoUpdatesForPublisherAction);
export { ToggleAutoUpdatesForPublisherAction };
let MigrateDeprecatedExtensionAction = class MigrateDeprecatedExtensionAction extends ExtensionAction {
    static { MigrateDeprecatedExtensionAction_1 = this; }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} migrate`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(small, extensionsWorkbenchService) {
        super('extensionsAction.migrateDeprecatedExtension', localize('migrateExtension', "Migrate"), MigrateDeprecatedExtensionAction_1.DisabledClass, false);
        this.small = small;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = MigrateDeprecatedExtensionAction_1.DisabledClass;
        if (!this.extension?.local) {
            return;
        }
        if (this.extension.state !== 1 /* ExtensionState.Installed */) {
            return;
        }
        if (!this.extension.deprecationInfo?.extension) {
            return;
        }
        const id = this.extension.deprecationInfo.extension.id;
        if (this.extensionsWorkbenchService.local.some(e => areSameExtensions(e.identifier, { id }))) {
            return;
        }
        this.enabled = true;
        this.class = MigrateDeprecatedExtensionAction_1.EnabledClass;
        this.tooltip = localize('migrate to', "Migrate to {0}", this.extension.deprecationInfo.extension.displayName);
        this.label = this.small ? localize('migrate', "Migrate") : this.tooltip;
    }
    async run() {
        if (!this.extension?.deprecationInfo?.extension) {
            return;
        }
        const local = this.extension.local;
        await this.extensionsWorkbenchService.uninstall(this.extension);
        const [extension] = await this.extensionsWorkbenchService.getExtensions([{ id: this.extension.deprecationInfo.extension.id, preRelease: this.extension.deprecationInfo?.extension?.preRelease }], CancellationToken.None);
        await this.extensionsWorkbenchService.install(extension, { isMachineScoped: local?.isMachineScoped });
    }
};
MigrateDeprecatedExtensionAction = MigrateDeprecatedExtensionAction_1 = __decorate([
    __param(1, IExtensionsWorkbenchService)
], MigrateDeprecatedExtensionAction);
export { MigrateDeprecatedExtensionAction };
let DropDownExtensionAction = class DropDownExtensionAction extends ExtensionAction {
    constructor(id, label, cssClass, enabled, instantiationService) {
        super(id, label, cssClass, enabled);
        this.instantiationService = instantiationService;
        this._actionViewItem = null;
    }
    createActionViewItem(options) {
        this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
        return this._actionViewItem;
    }
    run(actionGroups) {
        this._actionViewItem?.showMenu(actionGroups);
        return Promise.resolve();
    }
};
DropDownExtensionAction = __decorate([
    __param(4, IInstantiationService)
], DropDownExtensionAction);
export { DropDownExtensionAction };
let DropDownExtensionActionViewItem = class DropDownExtensionActionViewItem extends ActionViewItem {
    constructor(action, options, contextMenuService) {
        super(null, action, { ...options, icon: true, label: true });
        this.contextMenuService = contextMenuService;
    }
    showMenu(menuActionGroups) {
        if (this.element) {
            const actions = this.getActions(menuActionGroups);
            const elementPosition = DOM.getDomNodePagePosition(this.element);
            const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
            this.contextMenuService.showContextMenu({
                getAnchor: () => anchor,
                getActions: () => actions,
                actionRunner: this.actionRunner,
                onHide: () => disposeIfDisposable(actions)
            });
        }
    }
    getActions(menuActionGroups) {
        let actions = [];
        for (const menuActions of menuActionGroups) {
            actions = [...actions, ...menuActions, new Separator()];
        }
        return actions.length ? actions.slice(0, actions.length - 1) : actions;
    }
};
DropDownExtensionActionViewItem = __decorate([
    __param(2, IContextMenuService)
], DropDownExtensionActionViewItem);
export { DropDownExtensionActionViewItem };
async function getContextMenuActionsGroups(extension, contextKeyService, instantiationService) {
    return instantiationService.invokeFunction(async (accessor) => {
        const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
        const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
        const menuService = accessor.get(IMenuService);
        const extensionRecommendationsService = accessor.get(IExtensionRecommendationsService);
        const extensionIgnoredRecommendationsService = accessor.get(IExtensionIgnoredRecommendationsService);
        const workbenchThemeService = accessor.get(IWorkbenchThemeService);
        const authenticationUsageService = accessor.get(IAuthenticationUsageService);
        const allowedExtensionsService = accessor.get(IAllowedExtensionsService);
        const cksOverlay = [];
        if (extension) {
            cksOverlay.push(['extension', extension.identifier.id]);
            cksOverlay.push(['isBuiltinExtension', extension.isBuiltin]);
            cksOverlay.push(['isDefaultApplicationScopedExtension', extension.local && isApplicationScopedExtension(extension.local.manifest)]);
            cksOverlay.push(['isApplicationScopedExtension', extension.local && extension.local.isApplicationScoped]);
            cksOverlay.push(['isWorkspaceScopedExtension', extension.isWorkspaceScoped]);
            cksOverlay.push(['isGalleryExtension', !!extension.identifier.uuid]);
            if (extension.local) {
                cksOverlay.push(['extensionSource', extension.local.source]);
            }
            cksOverlay.push(['extensionHasConfiguration', extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.configuration]);
            cksOverlay.push(['extensionHasKeybindings', extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.keybindings]);
            cksOverlay.push(['extensionHasCommands', extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes?.commands]);
            cksOverlay.push(['isExtensionRecommended', !!extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]]);
            cksOverlay.push(['isExtensionWorkspaceRecommended', extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]?.reasonId === 0 /* ExtensionRecommendationReason.Workspace */]);
            cksOverlay.push(['isUserIgnoredRecommendation', extensionIgnoredRecommendationsService.globalIgnoredRecommendations.some(e => e === extension.identifier.id.toLowerCase())]);
            cksOverlay.push(['isExtensionPinned', extension.pinned]);
            cksOverlay.push(['isExtensionEnabled', extensionEnablementService.isEnabledEnablementState(extension.enablementState)]);
            switch (extension.state) {
                case 0 /* ExtensionState.Installing */:
                    cksOverlay.push(['extensionStatus', 'installing']);
                    break;
                case 1 /* ExtensionState.Installed */:
                    cksOverlay.push(['extensionStatus', 'installed']);
                    break;
                case 2 /* ExtensionState.Uninstalling */:
                    cksOverlay.push(['extensionStatus', 'uninstalling']);
                    break;
                case 3 /* ExtensionState.Uninstalled */:
                    cksOverlay.push(['extensionStatus', 'uninstalled']);
                    break;
            }
            cksOverlay.push(['installedExtensionIsPreReleaseVersion', !!extension.local?.isPreReleaseVersion]);
            cksOverlay.push(['installedExtensionIsOptedToPreRelease', !!extension.local?.preRelease]);
            cksOverlay.push(['galleryExtensionIsPreReleaseVersion', !!extension.gallery?.properties.isPreReleaseVersion]);
            cksOverlay.push(['galleryExtensionHasPreReleaseVersion', extension.gallery?.hasPreReleaseVersion]);
            cksOverlay.push(['extensionHasPreReleaseVersion', extension.hasPreReleaseVersion]);
            cksOverlay.push(['extensionHasReleaseVersion', extension.hasReleaseVersion]);
            cksOverlay.push(['extensionDisallowInstall', extension.isMalicious || extension.deprecationInfo?.disallowInstall]);
            cksOverlay.push(['isExtensionAllowed', allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) === true]);
            cksOverlay.push(['isPreReleaseExtensionAllowed', allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName, prerelease: true }) === true]);
            cksOverlay.push(['extensionIsUnsigned', extension.gallery && !extension.gallery.isSigned]);
            cksOverlay.push(['extensionIsPrivate', extension.gallery?.private]);
            const [colorThemes, fileIconThemes, productIconThemes, extensionUsesAuth] = await Promise.all([workbenchThemeService.getColorThemes(), workbenchThemeService.getFileIconThemes(), workbenchThemeService.getProductIconThemes(), authenticationUsageService.extensionUsesAuth(extension.identifier.id.toLowerCase())]);
            cksOverlay.push(['extensionHasColorThemes', colorThemes.some(theme => isThemeFromExtension(theme, extension))]);
            cksOverlay.push(['extensionHasFileIconThemes', fileIconThemes.some(theme => isThemeFromExtension(theme, extension))]);
            cksOverlay.push(['extensionHasProductIconThemes', productIconThemes.some(theme => isThemeFromExtension(theme, extension))]);
            cksOverlay.push(['extensionHasAccountPreferences', extensionUsesAuth]);
            cksOverlay.push(['canSetLanguage', extensionsWorkbenchService.canSetLanguage(extension)]);
            cksOverlay.push(['isActiveLanguagePackExtension', extension.gallery && language === getLocale(extension.gallery)]);
        }
        const actionsGroups = menuService.getMenuActions(MenuId.ExtensionContext, contextKeyService.createOverlay(cksOverlay), { shouldForwardArgs: true });
        return actionsGroups;
    });
}
function toActions(actionsGroups, instantiationService) {
    const result = [];
    for (const [, actions] of actionsGroups) {
        result.push(actions.map(action => {
            if (action instanceof SubmenuAction) {
                return action;
            }
            return instantiationService.createInstance(MenuItemExtensionAction, action);
        }));
    }
    return result;
}
export async function getContextMenuActions(extension, contextKeyService, instantiationService) {
    const actionsGroups = await getContextMenuActionsGroups(extension, contextKeyService, instantiationService);
    return toActions(actionsGroups, instantiationService);
}
let ManageExtensionAction = class ManageExtensionAction extends DropDownExtensionAction {
    static { ManageExtensionAction_1 = this; }
    static { this.ID = 'extensions.manage'; }
    static { this.Class = `${ExtensionAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon); }
    static { this.HideManageExtensionClass = `${this.Class} hide`; }
    constructor(instantiationService, extensionService, contextKeyService) {
        super(ManageExtensionAction_1.ID, '', '', true, instantiationService);
        this.extensionService = extensionService;
        this.contextKeyService = contextKeyService;
        this.tooltip = localize('manage', "Manage");
        this.update();
    }
    async getActionGroups() {
        const groups = [];
        const contextMenuActionsGroups = await getContextMenuActionsGroups(this.extension, this.contextKeyService, this.instantiationService);
        const themeActions = [], installActions = [], updateActions = [], otherActionGroups = [];
        for (const [group, actions] of contextMenuActionsGroups) {
            if (group === INSTALL_ACTIONS_GROUP) {
                installActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
            }
            else if (group === UPDATE_ACTIONS_GROUP) {
                updateActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
            }
            else if (group === THEME_ACTIONS_GROUP) {
                themeActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
            }
            else {
                otherActionGroups.push(...toActions([[group, actions]], this.instantiationService));
            }
        }
        if (themeActions.length) {
            groups.push(themeActions);
        }
        groups.push([
            this.instantiationService.createInstance(EnableGloballyAction),
            this.instantiationService.createInstance(EnableForWorkspaceAction)
        ]);
        groups.push([
            this.instantiationService.createInstance(DisableGloballyAction),
            this.instantiationService.createInstance(DisableForWorkspaceAction)
        ]);
        if (updateActions.length) {
            groups.push(updateActions);
        }
        groups.push([
            ...(installActions.length ? installActions : []),
            this.instantiationService.createInstance(InstallAnotherVersionAction, this.extension, false),
            this.instantiationService.createInstance(UninstallAction),
        ]);
        otherActionGroups.forEach(actions => groups.push(actions));
        groups.forEach(group => group.forEach(extensionAction => {
            if (extensionAction instanceof ExtensionAction) {
                extensionAction.extension = this.extension;
            }
        }));
        return groups;
    }
    async run() {
        await this.extensionService.whenInstalledExtensionsRegistered();
        return super.run(await this.getActionGroups());
    }
    update() {
        this.class = ManageExtensionAction_1.HideManageExtensionClass;
        this.enabled = false;
        if (this.extension) {
            const state = this.extension.state;
            this.enabled = state === 1 /* ExtensionState.Installed */;
            this.class = this.enabled || state === 2 /* ExtensionState.Uninstalling */ ? ManageExtensionAction_1.Class : ManageExtensionAction_1.HideManageExtensionClass;
        }
    }
};
ManageExtensionAction = ManageExtensionAction_1 = __decorate([
    __param(0, IInstantiationService),
    __param(1, IExtensionService),
    __param(2, IContextKeyService)
], ManageExtensionAction);
export { ManageExtensionAction };
export class ExtensionEditorManageExtensionAction extends DropDownExtensionAction {
    constructor(contextKeyService, instantiationService) {
        super('extensionEditor.manageExtension', '', `${ExtensionAction.ICON_ACTION_CLASS} manage ${ThemeIcon.asClassName(manageExtensionIcon)}`, true, instantiationService);
        this.contextKeyService = contextKeyService;
        this.tooltip = localize('manage', "Manage");
    }
    update() { }
    async run() {
        const actionGroups = [];
        (await getContextMenuActions(this.extension, this.contextKeyService, this.instantiationService)).forEach(actions => actionGroups.push(actions));
        actionGroups.forEach(group => group.forEach(extensionAction => {
            if (extensionAction instanceof ExtensionAction) {
                extensionAction.extension = this.extension;
            }
        }));
        return super.run(actionGroups);
    }
}
let MenuItemExtensionAction = class MenuItemExtensionAction extends ExtensionAction {
    constructor(action, extensionsWorkbenchService) {
        super(action.id, action.label);
        this.action = action;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
    }
    get enabled() {
        return this.action.enabled;
    }
    set enabled(value) {
        this.action.enabled = value;
    }
    update() {
        if (!this.extension) {
            return;
        }
        if (this.action.id === TOGGLE_IGNORE_EXTENSION_ACTION_ID) {
            this.checked = !this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
        }
        else if (this.action.id === ToggleAutoUpdateForExtensionAction.ID) {
            this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
        }
        else if (this.action.id === ToggleAutoUpdatesForPublisherAction.ID) {
            this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
        }
        else {
            this.checked = this.action.checked;
        }
    }
    async run() {
        if (this.extension) {
            const id = this.extension.local ? getExtensionId(this.extension.local.manifest.publisher, this.extension.local.manifest.name)
                : this.extension.gallery ? getExtensionId(this.extension.gallery.publisher, this.extension.gallery.name)
                    : this.extension.identifier.id;
            const extensionArg = {
                id: this.extension.identifier.id,
                version: this.extension.version,
                location: this.extension.local?.location,
                galleryLink: this.extension.url
            };
            await this.action.run(id, extensionArg);
        }
    }
};
MenuItemExtensionAction = __decorate([
    __param(1, IExtensionsWorkbenchService)
], MenuItemExtensionAction);
export { MenuItemExtensionAction };
let TogglePreReleaseExtensionAction = class TogglePreReleaseExtensionAction extends ExtensionAction {
    static { TogglePreReleaseExtensionAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.togglePreRlease'; }
    static { this.LABEL = localize('togglePreRleaseLabel', "Pre-Release"); }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent pre-release`; }
    static { this.DisabledClass = `${this.EnabledClass} hide`; }
    constructor(extensionsWorkbenchService, allowedExtensionsService) {
        super(TogglePreReleaseExtensionAction_1.ID, TogglePreReleaseExtensionAction_1.LABEL, TogglePreReleaseExtensionAction_1.DisabledClass);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.allowedExtensionsService = allowedExtensionsService;
        this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = TogglePreReleaseExtensionAction_1.DisabledClass;
        if (!this.extension) {
            return;
        }
        if (this.extension.isBuiltin) {
            return;
        }
        if (this.extension.state !== 1 /* ExtensionState.Installed */) {
            return;
        }
        if (!this.extension.hasPreReleaseVersion) {
            return;
        }
        if (!this.extension.gallery) {
            return;
        }
        if (this.extension.preRelease) {
            if (!this.extension.isPreReleaseVersion) {
                return;
            }
            if (this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) !== true) {
                return;
            }
        }
        if (!this.extension.preRelease) {
            if (!this.extension.gallery.hasPreReleaseVersion) {
                return;
            }
            if (this.allowedExtensionsService.isAllowed(this.extension.gallery) !== true) {
                return;
            }
        }
        this.enabled = true;
        this.class = TogglePreReleaseExtensionAction_1.EnabledClass;
        if (this.extension.preRelease) {
            this.label = localize('togglePreRleaseDisableLabel', "Switch to Release Version");
            this.tooltip = localize('togglePreRleaseDisableTooltip', "This will switch and enable updates to release versions");
        }
        else {
            this.label = localize('switchToPreReleaseLabel', "Switch to Pre-Release Version");
            this.tooltip = localize('switchToPreReleaseTooltip', "This will switch to pre-release version and enable updates to latest version always");
        }
    }
    async run() {
        if (!this.extension) {
            return;
        }
        this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: !this.extension.preRelease });
        await this.extensionsWorkbenchService.togglePreRelease(this.extension);
    }
};
TogglePreReleaseExtensionAction = TogglePreReleaseExtensionAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IAllowedExtensionsService)
], TogglePreReleaseExtensionAction);
export { TogglePreReleaseExtensionAction };
let InstallAnotherVersionAction = class InstallAnotherVersionAction extends ExtensionAction {
    static { InstallAnotherVersionAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.install.anotherVersion'; }
    static { this.LABEL = localize('install another version', "Install Specific Version..."); }
    constructor(extension, whenInstalled, extensionsWorkbenchService, extensionManagementService, extensionGalleryService, quickInputService, instantiationService, dialogService, allowedExtensionsService) {
        super(InstallAnotherVersionAction_1.ID, InstallAnotherVersionAction_1.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
        this.whenInstalled = whenInstalled;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionManagementService = extensionManagementService;
        this.extensionGalleryService = extensionGalleryService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.dialogService = dialogService;
        this.allowedExtensionsService = allowedExtensionsService;
        this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
        this.extension = extension;
        this.update();
    }
    update() {
        this.enabled = !!this.extension && !this.extension.isBuiltin && !!this.extension.identifier.uuid && !this.extension.deprecationInfo
            && this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) === true;
        if (this.enabled && this.whenInstalled) {
            this.enabled = !!this.extension?.local && !!this.extension.server && this.extension.state === 1 /* ExtensionState.Installed */;
        }
    }
    async run() {
        if (!this.enabled) {
            return;
        }
        if (!this.extension) {
            return;
        }
        const targetPlatform = this.extension.server ? await this.extension.server.extensionManagementService.getTargetPlatform() : await this.extensionManagementService.getTargetPlatform();
        const allVersions = await this.extensionGalleryService.getAllCompatibleVersions(this.extension.identifier, this.extension.local?.preRelease ?? this.extension.gallery?.properties.isPreReleaseVersion ?? false, targetPlatform);
        if (!allVersions.length) {
            await this.dialogService.info(localize('no versions', "This extension has no other versions."));
            return;
        }
        const picks = allVersions.map((v, i) => {
            return {
                id: v.version,
                label: v.version,
                description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${localize('pre-release', "pre-release")})` : ''}${v.version === this.extension?.local?.manifest.version ? ` (${localize('current', "current")})` : ''}`,
                ariaLabel: `${v.isPreReleaseVersion ? 'Pre-Release version' : 'Release version'} ${v.version}`,
                isPreReleaseVersion: v.isPreReleaseVersion
            };
        });
        const pick = await this.quickInputService.pick(picks, {
            placeHolder: localize('selectVersion', "Select Version to Install"),
            matchOnDetail: true
        });
        if (pick) {
            if (this.extension.local?.manifest.version === pick.id) {
                return;
            }
            const options = { installPreReleaseVersion: pick.isPreReleaseVersion, version: pick.id };
            try {
                await this.extensionsWorkbenchService.install(this.extension, options);
            }
            catch (error) {
                this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, options, pick.id, 2 /* InstallOperation.Install */, error).run();
            }
        }
        return null;
    }
};
InstallAnotherVersionAction = InstallAnotherVersionAction_1 = __decorate([
    __param(2, IExtensionsWorkbenchService),
    __param(3, IWorkbenchExtensionManagementService),
    __param(4, IExtensionGalleryService),
    __param(5, IQuickInputService),
    __param(6, IInstantiationService),
    __param(7, IDialogService),
    __param(8, IAllowedExtensionsService)
], InstallAnotherVersionAction);
export { InstallAnotherVersionAction };
let EnableForWorkspaceAction = class EnableForWorkspaceAction extends ExtensionAction {
    static { EnableForWorkspaceAction_1 = this; }
    static { this.ID = 'extensions.enableForWorkspace'; }
    static { this.LABEL = localize('enableForWorkspaceAction', "Enable (Workspace)"); }
    constructor(extensionsWorkbenchService, extensionEnablementService) {
        super(EnableForWorkspaceAction_1.ID, EnableForWorkspaceAction_1.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.tooltip = localize('enableForWorkspaceActionToolTip', "Enable this extension only in this workspace");
        this.update();
    }
    update() {
        this.enabled = false;
        if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
            this.enabled = this.extension.state === 1 /* ExtensionState.Installed */
                && !this.extensionEnablementService.isEnabled(this.extension.local)
                && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
        }
    }
    async run() {
        if (!this.extension) {
            return;
        }
        return this.extensionsWorkbenchService.setEnablement(this.extension, 13 /* EnablementState.EnabledWorkspace */);
    }
};
EnableForWorkspaceAction = EnableForWorkspaceAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IWorkbenchExtensionEnablementService)
], EnableForWorkspaceAction);
export { EnableForWorkspaceAction };
let EnableGloballyAction = class EnableGloballyAction extends ExtensionAction {
    static { EnableGloballyAction_1 = this; }
    static { this.ID = 'extensions.enableGlobally'; }
    static { this.LABEL = localize('enableGloballyAction', "Enable"); }
    constructor(extensionsWorkbenchService, extensionEnablementService) {
        super(EnableGloballyAction_1.ID, EnableGloballyAction_1.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.tooltip = localize('enableGloballyActionToolTip', "Enable this extension");
        this.update();
    }
    update() {
        this.enabled = false;
        if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
            this.enabled = this.extension.state === 1 /* ExtensionState.Installed */
                && this.extensionEnablementService.isDisabledGlobally(this.extension.local)
                && this.extensionEnablementService.canChangeEnablement(this.extension.local);
        }
    }
    async run() {
        if (!this.extension) {
            return;
        }
        return this.extensionsWorkbenchService.setEnablement(this.extension, 12 /* EnablementState.EnabledGlobally */);
    }
};
EnableGloballyAction = EnableGloballyAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IWorkbenchExtensionEnablementService)
], EnableGloballyAction);
export { EnableGloballyAction };
let DisableForWorkspaceAction = class DisableForWorkspaceAction extends ExtensionAction {
    static { DisableForWorkspaceAction_1 = this; }
    static { this.ID = 'extensions.disableForWorkspace'; }
    static { this.LABEL = localize('disableForWorkspaceAction', "Disable (Workspace)"); }
    constructor(workspaceContextService, extensionsWorkbenchService, extensionEnablementService, extensionService) {
        super(DisableForWorkspaceAction_1.ID, DisableForWorkspaceAction_1.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
        this.workspaceContextService = workspaceContextService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.extensionService = extensionService;
        this.tooltip = localize('disableForWorkspaceActionToolTip', "Disable this extension only in this workspace");
        this.update();
        this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
    }
    update() {
        this.enabled = false;
        if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier) && this.workspaceContextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */)) {
            this.enabled = this.extension.state === 1 /* ExtensionState.Installed */
                && (this.extension.enablementState === 12 /* EnablementState.EnabledGlobally */ || this.extension.enablementState === 13 /* EnablementState.EnabledWorkspace */)
                && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
        }
    }
    async run() {
        if (!this.extension) {
            return;
        }
        return this.extensionsWorkbenchService.setEnablement(this.extension, 11 /* EnablementState.DisabledWorkspace */);
    }
};
DisableForWorkspaceAction = DisableForWorkspaceAction_1 = __decorate([
    __param(0, IWorkspaceContextService),
    __param(1, IExtensionsWorkbenchService),
    __param(2, IWorkbenchExtensionEnablementService),
    __param(3, IExtensionService)
], DisableForWorkspaceAction);
export { DisableForWorkspaceAction };
let DisableGloballyAction = class DisableGloballyAction extends ExtensionAction {
    static { DisableGloballyAction_1 = this; }
    static { this.ID = 'extensions.disableGlobally'; }
    static { this.LABEL = localize('disableGloballyAction', "Disable"); }
    constructor(extensionsWorkbenchService, extensionEnablementService, extensionService) {
        super(DisableGloballyAction_1.ID, DisableGloballyAction_1.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionEnablementService = extensionEnablementService;
        this.extensionService = extensionService;
        this.tooltip = localize('disableGloballyActionToolTip', "Disable this extension");
        this.update();
        this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
    }
    update() {
        this.enabled = false;
        if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))) {
            this.enabled = this.extension.state === 1 /* ExtensionState.Installed */
                && (this.extension.enablementState === 12 /* EnablementState.EnabledGlobally */ || this.extension.enablementState === 13 /* EnablementState.EnabledWorkspace */)
                && this.extensionEnablementService.canChangeEnablement(this.extension.local);
        }
    }
    async run() {
        if (!this.extension) {
            return;
        }
        return this.extensionsWorkbenchService.setEnablement(this.extension, 10 /* EnablementState.DisabledGlobally */);
    }
};
DisableGloballyAction = DisableGloballyAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IWorkbenchExtensionEnablementService),
    __param(2, IExtensionService)
], DisableGloballyAction);
export { DisableGloballyAction };
let EnableDropDownAction = class EnableDropDownAction extends ButtonWithDropDownExtensionAction {
    constructor(instantiationService) {
        super('extensions.enable', ExtensionAction.LABEL_ACTION_CLASS, [
            [
                instantiationService.createInstance(EnableGloballyAction),
                instantiationService.createInstance(EnableForWorkspaceAction)
            ]
        ]);
    }
};
EnableDropDownAction = __decorate([
    __param(0, IInstantiationService)
], EnableDropDownAction);
export { EnableDropDownAction };
let DisableDropDownAction = class DisableDropDownAction extends ButtonWithDropDownExtensionAction {
    constructor(instantiationService) {
        super('extensions.disable', ExtensionAction.LABEL_ACTION_CLASS, [[
                instantiationService.createInstance(DisableGloballyAction),
                instantiationService.createInstance(DisableForWorkspaceAction)
            ]]);
    }
};
DisableDropDownAction = __decorate([
    __param(0, IInstantiationService)
], DisableDropDownAction);
export { DisableDropDownAction };
let ExtensionRuntimeStateAction = class ExtensionRuntimeStateAction extends ExtensionAction {
    static { ExtensionRuntimeStateAction_1 = this; }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent reload`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(hostService, extensionsWorkbenchService, updateService, extensionService, productService, telemetryService) {
        super('extensions.runtimeState', '', ExtensionRuntimeStateAction_1.DisabledClass, false);
        this.hostService = hostService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.updateService = updateService;
        this.extensionService = extensionService;
        this.productService = productService;
        this.telemetryService = telemetryService;
        this.updateWhenCounterExtensionChanges = true;
        this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
        this.update();
    }
    update() {
        this.enabled = false;
        this.tooltip = '';
        this.class = ExtensionRuntimeStateAction_1.DisabledClass;
        if (!this.extension) {
            return;
        }
        const state = this.extension.state;
        if (state === 0 /* ExtensionState.Installing */ || state === 2 /* ExtensionState.Uninstalling */) {
            return;
        }
        if (this.extension.local && this.extension.local.manifest && this.extension.local.manifest.contributes && this.extension.local.manifest.contributes.localizations && this.extension.local.manifest.contributes.localizations.length > 0) {
            return;
        }
        const runtimeState = this.extension.runtimeState;
        if (!runtimeState) {
            return;
        }
        this.enabled = true;
        this.class = ExtensionRuntimeStateAction_1.EnabledClass;
        this.tooltip = runtimeState.reason;
        this.label = runtimeState.action === "reloadWindow" /* ExtensionRuntimeActionType.ReloadWindow */ ? localize('reload window', 'Reload Window')
            : runtimeState.action === "restartExtensions" /* ExtensionRuntimeActionType.RestartExtensions */ ? localize('restart extensions', 'Restart Extensions')
                : runtimeState.action === "quitAndInstall" /* ExtensionRuntimeActionType.QuitAndInstall */ ? localize('restart product', 'Restart to Update')
                    : runtimeState.action === "applyUpdate" /* ExtensionRuntimeActionType.ApplyUpdate */ || runtimeState.action === "downloadUpdate" /* ExtensionRuntimeActionType.DownloadUpdate */ ? localize('update product', 'Update {0}', this.productService.nameShort) : '';
    }
    async run() {
        const runtimeState = this.extension?.runtimeState;
        if (!runtimeState?.action) {
            return;
        }
        this.telemetryService.publicLog2('extensions:runtimestate:action', {
            action: runtimeState.action
        });
        if (runtimeState?.action === "reloadWindow" /* ExtensionRuntimeActionType.ReloadWindow */) {
            return this.hostService.reload();
        }
        else if (runtimeState?.action === "restartExtensions" /* ExtensionRuntimeActionType.RestartExtensions */) {
            return this.extensionsWorkbenchService.updateRunningExtensions();
        }
        else if (runtimeState?.action === "downloadUpdate" /* ExtensionRuntimeActionType.DownloadUpdate */) {
            return this.updateService.downloadUpdate(true);
        }
        else if (runtimeState?.action === "applyUpdate" /* ExtensionRuntimeActionType.ApplyUpdate */) {
            return this.updateService.applyUpdate();
        }
        else if (runtimeState?.action === "quitAndInstall" /* ExtensionRuntimeActionType.QuitAndInstall */) {
            return this.updateService.quitAndInstall();
        }
    }
};
ExtensionRuntimeStateAction = ExtensionRuntimeStateAction_1 = __decorate([
    __param(0, IHostService),
    __param(1, IExtensionsWorkbenchService),
    __param(2, IUpdateService),
    __param(3, IExtensionService),
    __param(4, IProductService),
    __param(5, ITelemetryService)
], ExtensionRuntimeStateAction);
export { ExtensionRuntimeStateAction };
function isThemeFromExtension(theme, extension) {
    return !!(extension && theme.extensionData && ExtensionIdentifier.equals(theme.extensionData.extensionId, extension.identifier.id));
}
function getQuickPickEntries(themes, currentTheme, extension, showCurrentTheme) {
    const picks = [];
    for (const theme of themes) {
        if (isThemeFromExtension(theme, extension) && !(showCurrentTheme && theme === currentTheme)) {
            picks.push({ label: theme.label, id: theme.id });
        }
    }
    if (showCurrentTheme) {
        picks.push({ type: 'separator', label: localize('current', "current") });
        picks.push({ label: currentTheme.label, id: currentTheme.id });
    }
    return picks;
}
let SetColorThemeAction = class SetColorThemeAction extends ExtensionAction {
    static { SetColorThemeAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.setColorTheme'; }
    static { this.TITLE = localize2('workbench.extensions.action.setColorTheme', 'Set Color Theme'); }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
        super(SetColorThemeAction_1.ID, SetColorThemeAction_1.TITLE.value, SetColorThemeAction_1.DisabledClass, false);
        this.workbenchThemeService = workbenchThemeService;
        this.quickInputService = quickInputService;
        this.extensionEnablementService = extensionEnablementService;
        this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidColorThemeChange)(() => this.update(), this));
        this.update();
    }
    update() {
        this.workbenchThemeService.getColorThemes().then(colorThemes => {
            this.enabled = this.computeEnablement(colorThemes);
            this.class = this.enabled ? SetColorThemeAction_1.EnabledClass : SetColorThemeAction_1.DisabledClass;
        });
    }
    computeEnablement(colorThemes) {
        return !!this.extension && this.extension.state === 1 /* ExtensionState.Installed */ && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemes.some(th => isThemeFromExtension(th, this.extension));
    }
    async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
        const colorThemes = await this.workbenchThemeService.getColorThemes();
        if (!this.computeEnablement(colorThemes)) {
            return;
        }
        const currentTheme = this.workbenchThemeService.getColorTheme();
        const delayer = new Delayer(100);
        const picks = getQuickPickEntries(colorThemes, currentTheme, this.extension, showCurrentTheme);
        const pickedTheme = await this.quickInputService.pick(picks, {
            placeHolder: localize('select color theme', "Select Color Theme"),
            onDidFocus: item => delayer.trigger(() => this.workbenchThemeService.setColorTheme(item.id, undefined)),
            ignoreFocusLost
        });
        return this.workbenchThemeService.setColorTheme(pickedTheme ? pickedTheme.id : currentTheme.id, 'auto');
    }
};
SetColorThemeAction = SetColorThemeAction_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IWorkbenchThemeService),
    __param(2, IQuickInputService),
    __param(3, IWorkbenchExtensionEnablementService)
], SetColorThemeAction);
export { SetColorThemeAction };
let SetFileIconThemeAction = class SetFileIconThemeAction extends ExtensionAction {
    static { SetFileIconThemeAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.setFileIconTheme'; }
    static { this.TITLE = localize2('workbench.extensions.action.setFileIconTheme', 'Set File Icon Theme'); }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
        super(SetFileIconThemeAction_1.ID, SetFileIconThemeAction_1.TITLE.value, SetFileIconThemeAction_1.DisabledClass, false);
        this.workbenchThemeService = workbenchThemeService;
        this.quickInputService = quickInputService;
        this.extensionEnablementService = extensionEnablementService;
        this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidFileIconThemeChange)(() => this.update(), this));
        this.update();
    }
    update() {
        this.workbenchThemeService.getFileIconThemes().then(fileIconThemes => {
            this.enabled = this.computeEnablement(fileIconThemes);
            this.class = this.enabled ? SetFileIconThemeAction_1.EnabledClass : SetFileIconThemeAction_1.DisabledClass;
        });
    }
    computeEnablement(colorThemfileIconThemess) {
        return !!this.extension && this.extension.state === 1 /* ExtensionState.Installed */ && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemfileIconThemess.some(th => isThemeFromExtension(th, this.extension));
    }
    async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
        const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
        if (!this.computeEnablement(fileIconThemes)) {
            return;
        }
        const currentTheme = this.workbenchThemeService.getFileIconTheme();
        const delayer = new Delayer(100);
        const picks = getQuickPickEntries(fileIconThemes, currentTheme, this.extension, showCurrentTheme);
        const pickedTheme = await this.quickInputService.pick(picks, {
            placeHolder: localize('select file icon theme', "Select File Icon Theme"),
            onDidFocus: item => delayer.trigger(() => this.workbenchThemeService.setFileIconTheme(item.id, undefined)),
            ignoreFocusLost
        });
        return this.workbenchThemeService.setFileIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, 'auto');
    }
};
SetFileIconThemeAction = SetFileIconThemeAction_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IWorkbenchThemeService),
    __param(2, IQuickInputService),
    __param(3, IWorkbenchExtensionEnablementService)
], SetFileIconThemeAction);
export { SetFileIconThemeAction };
let SetProductIconThemeAction = class SetProductIconThemeAction extends ExtensionAction {
    static { SetProductIconThemeAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.setProductIconTheme'; }
    static { this.TITLE = localize2('workbench.extensions.action.setProductIconTheme', 'Set Product Icon Theme'); }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
        super(SetProductIconThemeAction_1.ID, SetProductIconThemeAction_1.TITLE.value, SetProductIconThemeAction_1.DisabledClass, false);
        this.workbenchThemeService = workbenchThemeService;
        this.quickInputService = quickInputService;
        this.extensionEnablementService = extensionEnablementService;
        this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidProductIconThemeChange)(() => this.update(), this));
        this.update();
    }
    update() {
        this.workbenchThemeService.getProductIconThemes().then(productIconThemes => {
            this.enabled = this.computeEnablement(productIconThemes);
            this.class = this.enabled ? SetProductIconThemeAction_1.EnabledClass : SetProductIconThemeAction_1.DisabledClass;
        });
    }
    computeEnablement(productIconThemes) {
        return !!this.extension && this.extension.state === 1 /* ExtensionState.Installed */ && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && productIconThemes.some(th => isThemeFromExtension(th, this.extension));
    }
    async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
        const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
        if (!this.computeEnablement(productIconThemes)) {
            return;
        }
        const currentTheme = this.workbenchThemeService.getProductIconTheme();
        const delayer = new Delayer(100);
        const picks = getQuickPickEntries(productIconThemes, currentTheme, this.extension, showCurrentTheme);
        const pickedTheme = await this.quickInputService.pick(picks, {
            placeHolder: localize('select product icon theme', "Select Product Icon Theme"),
            onDidFocus: item => delayer.trigger(() => this.workbenchThemeService.setProductIconTheme(item.id, undefined)),
            ignoreFocusLost
        });
        return this.workbenchThemeService.setProductIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, 'auto');
    }
};
SetProductIconThemeAction = SetProductIconThemeAction_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IWorkbenchThemeService),
    __param(2, IQuickInputService),
    __param(3, IWorkbenchExtensionEnablementService)
], SetProductIconThemeAction);
export { SetProductIconThemeAction };
let SetLanguageAction = class SetLanguageAction extends ExtensionAction {
    static { SetLanguageAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.setDisplayLanguage'; }
    static { this.TITLE = localize2('workbench.extensions.action.setDisplayLanguage', 'Set Display Language'); }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(extensionsWorkbenchService) {
        super(SetLanguageAction_1.ID, SetLanguageAction_1.TITLE.value, SetLanguageAction_1.DisabledClass, false);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = SetLanguageAction_1.DisabledClass;
        if (!this.extension) {
            return;
        }
        if (!this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
            return;
        }
        if (this.extension.gallery && language === getLocale(this.extension.gallery)) {
            return;
        }
        this.enabled = true;
        this.class = SetLanguageAction_1.EnabledClass;
    }
    async run() {
        return this.extension && this.extensionsWorkbenchService.setLanguage(this.extension);
    }
};
SetLanguageAction = SetLanguageAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService)
], SetLanguageAction);
export { SetLanguageAction };
let ClearLanguageAction = class ClearLanguageAction extends ExtensionAction {
    static { ClearLanguageAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.clearLanguage'; }
    static { this.TITLE = localize2('workbench.extensions.action.clearLanguage', 'Clear Display Language'); }
    static { this.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`; }
    static { this.DisabledClass = `${this.EnabledClass} disabled`; }
    constructor(extensionsWorkbenchService, localeService) {
        super(ClearLanguageAction_1.ID, ClearLanguageAction_1.TITLE.value, ClearLanguageAction_1.DisabledClass, false);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.localeService = localeService;
        this.update();
    }
    update() {
        this.enabled = false;
        this.class = ClearLanguageAction_1.DisabledClass;
        if (!this.extension) {
            return;
        }
        if (!this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
            return;
        }
        if (this.extension.gallery && language !== getLocale(this.extension.gallery)) {
            return;
        }
        this.enabled = true;
        this.class = ClearLanguageAction_1.EnabledClass;
    }
    async run() {
        return this.extension && this.localeService.clearLocalePreference();
    }
};
ClearLanguageAction = ClearLanguageAction_1 = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, ILocaleService)
], ClearLanguageAction);
export { ClearLanguageAction };
let ShowRecommendedExtensionAction = class ShowRecommendedExtensionAction extends Action {
    static { ShowRecommendedExtensionAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.showRecommendedExtension'; }
    static { this.LABEL = localize('showRecommendedExtension', "Show Recommended Extension"); }
    constructor(extensionId, extensionWorkbenchService) {
        super(ShowRecommendedExtensionAction_1.ID, ShowRecommendedExtensionAction_1.LABEL, undefined, false);
        this.extensionWorkbenchService = extensionWorkbenchService;
        this.extensionId = extensionId;
    }
    async run() {
        await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
        const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: 'install-recommendation' }, CancellationToken.None);
        if (extension) {
            return this.extensionWorkbenchService.open(extension);
        }
        return null;
    }
};
ShowRecommendedExtensionAction = ShowRecommendedExtensionAction_1 = __decorate([
    __param(1, IExtensionsWorkbenchService)
], ShowRecommendedExtensionAction);
export { ShowRecommendedExtensionAction };
let InstallRecommendedExtensionAction = class InstallRecommendedExtensionAction extends Action {
    static { InstallRecommendedExtensionAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.installRecommendedExtension'; }
    static { this.LABEL = localize('installRecommendedExtension', "Install Recommended Extension"); }
    constructor(extensionId, instantiationService, extensionWorkbenchService) {
        super(InstallRecommendedExtensionAction_1.ID, InstallRecommendedExtensionAction_1.LABEL, undefined, false);
        this.instantiationService = instantiationService;
        this.extensionWorkbenchService = extensionWorkbenchService;
        this.extensionId = extensionId;
    }
    async run() {
        await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
        const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: 'install-recommendation' }, CancellationToken.None);
        if (extension) {
            await this.extensionWorkbenchService.open(extension);
            try {
                await this.extensionWorkbenchService.install(extension);
            }
            catch (err) {
                this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, undefined, extension.latestVersion, 2 /* InstallOperation.Install */, err).run();
            }
        }
    }
};
InstallRecommendedExtensionAction = InstallRecommendedExtensionAction_1 = __decorate([
    __param(1, IInstantiationService),
    __param(2, IExtensionsWorkbenchService)
], InstallRecommendedExtensionAction);
export { InstallRecommendedExtensionAction };
let IgnoreExtensionRecommendationAction = class IgnoreExtensionRecommendationAction extends Action {
    static { IgnoreExtensionRecommendationAction_1 = this; }
    static { this.ID = 'extensions.ignore'; }
    static { this.Class = `${ExtensionAction.LABEL_ACTION_CLASS} ignore`; }
    constructor(extension, extensionRecommendationsManagementService) {
        super(IgnoreExtensionRecommendationAction_1.ID, 'Ignore Recommendation');
        this.extension = extension;
        this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
        this.class = IgnoreExtensionRecommendationAction_1.Class;
        this.tooltip = localize('ignoreExtensionRecommendation', "Do not recommend this extension again");
        this.enabled = true;
    }
    run() {
        this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, true);
        return Promise.resolve();
    }
};
IgnoreExtensionRecommendationAction = IgnoreExtensionRecommendationAction_1 = __decorate([
    __param(1, IExtensionIgnoredRecommendationsService)
], IgnoreExtensionRecommendationAction);
export { IgnoreExtensionRecommendationAction };
let UndoIgnoreExtensionRecommendationAction = class UndoIgnoreExtensionRecommendationAction extends Action {
    static { UndoIgnoreExtensionRecommendationAction_1 = this; }
    static { this.ID = 'extensions.ignore'; }
    static { this.Class = `${ExtensionAction.LABEL_ACTION_CLASS} undo-ignore`; }
    constructor(extension, extensionRecommendationsManagementService) {
        super(UndoIgnoreExtensionRecommendationAction_1.ID, 'Undo');
        this.extension = extension;
        this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
        this.class = UndoIgnoreExtensionRecommendationAction_1.Class;
        this.tooltip = localize('undo', "Undo");
        this.enabled = true;
    }
    run() {
        this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, false);
        return Promise.resolve();
    }
};
UndoIgnoreExtensionRecommendationAction = UndoIgnoreExtensionRecommendationAction_1 = __decorate([
    __param(1, IExtensionIgnoredRecommendationsService)
], UndoIgnoreExtensionRecommendationAction);
export { UndoIgnoreExtensionRecommendationAction };
let AbstractConfigureRecommendedExtensionsAction = class AbstractConfigureRecommendedExtensionsAction extends Action {
    constructor(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService) {
        super(id, label);
        this.contextService = contextService;
        this.fileService = fileService;
        this.textFileService = textFileService;
        this.editorService = editorService;
        this.jsonEditingService = jsonEditingService;
        this.textModelResolverService = textModelResolverService;
    }
    openExtensionsFile(extensionsFileResource) {
        return this.getOrCreateExtensionsFile(extensionsFileResource)
            .then(({ created, content }) => this.getSelectionPosition(content, extensionsFileResource, ['recommendations'])
            .then(selection => this.editorService.openEditor({
            resource: extensionsFileResource,
            options: {
                pinned: created,
                selection
            }
        })), error => Promise.reject(new Error(localize('OpenExtensionsFile.failed', "Unable to create 'extensions.json' file inside the '.vscode' folder ({0}).", error))));
    }
    openWorkspaceConfigurationFile(workspaceConfigurationFile) {
        return this.getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile)
            .then(content => this.getSelectionPosition(content.value.toString(), content.resource, ['extensions', 'recommendations']))
            .then(selection => this.editorService.openEditor({
            resource: workspaceConfigurationFile,
            options: {
                selection,
                forceReload: true // because content has changed
            }
        }));
    }
    getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile) {
        return Promise.resolve(this.fileService.readFile(workspaceConfigurationFile))
            .then(content => {
            const workspaceRecommendations = json.parse(content.value.toString())['extensions'];
            if (!workspaceRecommendations || !workspaceRecommendations.recommendations) {
                return this.jsonEditingService.write(workspaceConfigurationFile, [{ path: ['extensions'], value: { recommendations: [] } }], true)
                    .then(() => this.fileService.readFile(workspaceConfigurationFile));
            }
            return content;
        });
    }
    getSelectionPosition(content, resource, path) {
        const tree = json.parseTree(content);
        const node = json.findNodeAtLocation(tree, path);
        if (node && node.parent && node.parent.children) {
            const recommendationsValueNode = node.parent.children[1];
            const lastExtensionNode = recommendationsValueNode.children && recommendationsValueNode.children.length ? recommendationsValueNode.children[recommendationsValueNode.children.length - 1] : null;
            const offset = lastExtensionNode ? lastExtensionNode.offset + lastExtensionNode.length : recommendationsValueNode.offset + 1;
            return Promise.resolve(this.textModelResolverService.createModelReference(resource))
                .then(reference => {
                const position = reference.object.textEditorModel.getPositionAt(offset);
                reference.dispose();
                return {
                    startLineNumber: position.lineNumber,
                    startColumn: position.column,
                    endLineNumber: position.lineNumber,
                    endColumn: position.column,
                };
            });
        }
        return Promise.resolve(undefined);
    }
    getOrCreateExtensionsFile(extensionsFileResource) {
        return Promise.resolve(this.fileService.readFile(extensionsFileResource)).then(content => {
            return { created: false, extensionsFileResource, content: content.value.toString() };
        }, err => {
            return this.textFileService.write(extensionsFileResource, ExtensionsConfigurationInitialContent).then(() => {
                return { created: true, extensionsFileResource, content: ExtensionsConfigurationInitialContent };
            });
        });
    }
};
AbstractConfigureRecommendedExtensionsAction = __decorate([
    __param(2, IWorkspaceContextService),
    __param(3, IFileService),
    __param(4, ITextFileService),
    __param(5, IEditorService),
    __param(6, IJSONEditingService),
    __param(7, ITextModelService)
], AbstractConfigureRecommendedExtensionsAction);
export { AbstractConfigureRecommendedExtensionsAction };
let ConfigureWorkspaceRecommendedExtensionsAction = class ConfigureWorkspaceRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {
    static { this.ID = 'workbench.extensions.action.configureWorkspaceRecommendedExtensions'; }
    static { this.LABEL = localize('configureWorkspaceRecommendedExtensions', "Configure Recommended Extensions (Workspace)"); }
    constructor(id, label, fileService, textFileService, contextService, editorService, jsonEditingService, textModelResolverService) {
        super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
        this._register(this.contextService.onDidChangeWorkbenchState(() => this.update(), this));
        this.update();
    }
    update() {
        this.enabled = this.contextService.getWorkbenchState() !== 1 /* WorkbenchState.EMPTY */;
    }
    run() {
        switch (this.contextService.getWorkbenchState()) {
            case 2 /* WorkbenchState.FOLDER */:
                return this.openExtensionsFile(this.contextService.getWorkspace().folders[0].toResource(EXTENSIONS_CONFIG));
            case 3 /* WorkbenchState.WORKSPACE */:
                return this.openWorkspaceConfigurationFile(this.contextService.getWorkspace().configuration);
        }
        return Promise.resolve();
    }
};
ConfigureWorkspaceRecommendedExtensionsAction = __decorate([
    __param(2, IFileService),
    __param(3, ITextFileService),
    __param(4, IWorkspaceContextService),
    __param(5, IEditorService),
    __param(6, IJSONEditingService),
    __param(7, ITextModelService)
], ConfigureWorkspaceRecommendedExtensionsAction);
export { ConfigureWorkspaceRecommendedExtensionsAction };
let ConfigureWorkspaceFolderRecommendedExtensionsAction = class ConfigureWorkspaceFolderRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {
    static { this.ID = 'workbench.extensions.action.configureWorkspaceFolderRecommendedExtensions'; }
    static { this.LABEL = localize('configureWorkspaceFolderRecommendedExtensions', "Configure Recommended Extensions (Workspace Folder)"); }
    constructor(id, label, fileService, textFileService, contextService, editorService, jsonEditingService, textModelResolverService, commandService) {
        super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
        this.commandService = commandService;
    }
    run() {
        const folderCount = this.contextService.getWorkspace().folders.length;
        const pickFolderPromise = folderCount === 1 ? Promise.resolve(this.contextService.getWorkspace().folders[0]) : this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
        return Promise.resolve(pickFolderPromise)
            .then(workspaceFolder => {
            if (workspaceFolder) {
                return this.openExtensionsFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
            }
            return null;
        });
    }
};
ConfigureWorkspaceFolderRecommendedExtensionsAction = __decorate([
    __param(2, IFileService),
    __param(3, ITextFileService),
    __param(4, IWorkspaceContextService),
    __param(5, IEditorService),
    __param(6, IJSONEditingService),
    __param(7, ITextModelService),
    __param(8, ICommandService)
], ConfigureWorkspaceFolderRecommendedExtensionsAction);
export { ConfigureWorkspaceFolderRecommendedExtensionsAction };
let ExtensionStatusLabelAction = class ExtensionStatusLabelAction extends Action {
    static { ExtensionStatusLabelAction_1 = this; }
    static { this.ENABLED_CLASS = `${ExtensionAction.TEXT_ACTION_CLASS} extension-status-label`; }
    static { this.DISABLED_CLASS = `${this.ENABLED_CLASS} hide`; }
    get extension() { return this._extension; }
    set extension(extension) {
        if (!(this._extension && extension && areSameExtensions(this._extension.identifier, extension.identifier))) {
            // Different extension. Reset
            this.initialStatus = null;
            this.status = null;
            this.enablementState = null;
        }
        this._extension = extension;
        this.update();
    }
    constructor(extensionService, extensionManagementServerService, extensionEnablementService) {
        super('extensions.action.statusLabel', '', ExtensionStatusLabelAction_1.DISABLED_CLASS, false);
        this.extensionService = extensionService;
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionEnablementService = extensionEnablementService;
        this.initialStatus = null;
        this.status = null;
        this.version = null;
        this.enablementState = null;
        this._extension = null;
    }
    update() {
        const label = this.computeLabel();
        this.label = label || '';
        this.class = label ? ExtensionStatusLabelAction_1.ENABLED_CLASS : ExtensionStatusLabelAction_1.DISABLED_CLASS;
    }
    computeLabel() {
        if (!this.extension) {
            return null;
        }
        const currentStatus = this.status;
        const currentVersion = this.version;
        const currentEnablementState = this.enablementState;
        this.status = this.extension.state;
        this.version = this.extension.version;
        if (this.initialStatus === null) {
            this.initialStatus = this.status;
        }
        this.enablementState = this.extension.enablementState;
        const canAddExtension = () => {
            const runningExtension = this.extensionService.extensions.filter(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))[0];
            if (this.extension.local) {
                if (runningExtension && this.extension.version === runningExtension.version) {
                    return true;
                }
                return this.extensionService.canAddExtension(toExtensionDescription(this.extension.local));
            }
            return false;
        };
        const canRemoveExtension = () => {
            if (this.extension.local) {
                if (this.extensionService.extensions.every(e => !(areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier) && this.extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(e))))) {
                    return true;
                }
                return this.extensionService.canRemoveExtension(toExtensionDescription(this.extension.local));
            }
            return false;
        };
        if (currentStatus !== null) {
            if (currentStatus === 0 /* ExtensionState.Installing */ && this.status === 1 /* ExtensionState.Installed */) {
                if (this.initialStatus === 3 /* ExtensionState.Uninstalled */ && canAddExtension()) {
                    return localize('installed', "Installed");
                }
                if (this.initialStatus === 1 /* ExtensionState.Installed */ && this.version !== currentVersion && canAddExtension()) {
                    return localize('updated', "Updated");
                }
                return null;
            }
            if (currentStatus === 2 /* ExtensionState.Uninstalling */ && this.status === 3 /* ExtensionState.Uninstalled */) {
                this.initialStatus = this.status;
                return canRemoveExtension() ? localize('uninstalled', "Uninstalled") : null;
            }
        }
        if (currentEnablementState !== null) {
            const currentlyEnabled = this.extensionEnablementService.isEnabledEnablementState(currentEnablementState);
            const enabled = this.extensionEnablementService.isEnabledEnablementState(this.enablementState);
            if (!currentlyEnabled && enabled) {
                return canAddExtension() ? localize('enabled', "Enabled") : null;
            }
            if (currentlyEnabled && !enabled) {
                return canRemoveExtension() ? localize('disabled', "Disabled") : null;
            }
        }
        return null;
    }
    run() {
        return Promise.resolve();
    }
};
ExtensionStatusLabelAction = ExtensionStatusLabelAction_1 = __decorate([
    __param(0, IExtensionService),
    __param(1, IExtensionManagementServerService),
    __param(2, IWorkbenchExtensionEnablementService)
], ExtensionStatusLabelAction);
export { ExtensionStatusLabelAction };
let ToggleSyncExtensionAction = class ToggleSyncExtensionAction extends DropDownExtensionAction {
    static { ToggleSyncExtensionAction_1 = this; }
    static { this.IGNORED_SYNC_CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncIgnoredIcon)}`; }
    static { this.SYNC_CLASS = `${this.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncEnabledIcon)}`; }
    constructor(configurationService, extensionsWorkbenchService, userDataSyncEnablementService, instantiationService) {
        super('extensions.sync', '', ToggleSyncExtensionAction_1.SYNC_CLASS, false, instantiationService);
        this.configurationService = configurationService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.userDataSyncEnablementService = userDataSyncEnablementService;
        this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('settingsSync.ignoredExtensions'))(() => this.update()));
        this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
        this.update();
    }
    update() {
        this.enabled = !!this.extension && this.userDataSyncEnablementService.isEnabled() && this.extension.state === 1 /* ExtensionState.Installed */;
        if (this.extension) {
            const isIgnored = this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
            this.class = isIgnored ? ToggleSyncExtensionAction_1.IGNORED_SYNC_CLASS : ToggleSyncExtensionAction_1.SYNC_CLASS;
            this.tooltip = isIgnored ? localize('ignored', "This extension is ignored during sync") : localize('synced', "This extension is synced");
        }
    }
    async run() {
        return super.run([
            [
                new Action('extensions.syncignore', this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension) ? localize('sync', "Sync this extension") : localize('do not sync', "Do not sync this extension"), undefined, true, () => this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(this.extension))
            ]
        ]);
    }
};
ToggleSyncExtensionAction = ToggleSyncExtensionAction_1 = __decorate([
    __param(0, IConfigurationService),
    __param(1, IExtensionsWorkbenchService),
    __param(2, IUserDataSyncEnablementService),
    __param(3, IInstantiationService)
], ToggleSyncExtensionAction);
export { ToggleSyncExtensionAction };
let ExtensionStatusAction = class ExtensionStatusAction extends ExtensionAction {
    static { ExtensionStatusAction_1 = this; }
    static { this.CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-status`; }
    get status() { return this._status; }
    constructor(extensionManagementServerService, labelService, commandService, workspaceTrustEnablementService, workspaceTrustService, extensionsWorkbenchService, extensionService, extensionManifestPropertiesService, contextService, productService, allowedExtensionsService, workbenchExtensionEnablementService, extensionFeaturesManagementService, extensionGalleryManifestService) {
        super('extensions.status', '', `${ExtensionStatusAction_1.CLASS} hide`, false);
        this.extensionManagementServerService = extensionManagementServerService;
        this.labelService = labelService;
        this.commandService = commandService;
        this.workspaceTrustEnablementService = workspaceTrustEnablementService;
        this.workspaceTrustService = workspaceTrustService;
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.extensionService = extensionService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.contextService = contextService;
        this.productService = productService;
        this.allowedExtensionsService = allowedExtensionsService;
        this.workbenchExtensionEnablementService = workbenchExtensionEnablementService;
        this.extensionFeaturesManagementService = extensionFeaturesManagementService;
        this.extensionGalleryManifestService = extensionGalleryManifestService;
        this.updateWhenCounterExtensionChanges = true;
        this._status = [];
        this._onDidChangeStatus = this._register(new Emitter());
        this.onDidChangeStatus = this._onDidChangeStatus.event;
        this.updateThrottler = this._register(new Throttler());
        this._register(this.labelService.onDidChangeFormatters(() => this.update(), this));
        this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
        this._register(this.extensionFeaturesManagementService.onDidChangeAccessData(() => this.update()));
        this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
        this.update();
    }
    update() {
        this.updateThrottler.queue(() => this.computeAndUpdateStatus());
    }
    async computeAndUpdateStatus() {
        this.updateStatus(undefined, true);
        this.enabled = false;
        if (!this.extension) {
            return;
        }
        if (this.extension.isMalicious) {
            this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('malicious tooltip', "This extension was reported to be problematic.")) }, true);
            return;
        }
        if (this.extension.state === 3 /* ExtensionState.Uninstalled */ && this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
            this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('not signed tooltip', "This extension is not signed by the Extension Marketplace.")) }, true);
            return;
        }
        if (this.extension.deprecationInfo) {
            if (this.extension.deprecationInfo.extension) {
                const link = `[${this.extension.deprecationInfo.extension.displayName}](${createCommandUri('extension.open', this.extension.deprecationInfo.extension.id)})`;
                this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('deprecated with alternate extension tooltip', "This extension is deprecated. Use the {0} extension instead.", link)) }, true);
            }
            else if (this.extension.deprecationInfo.settings) {
                const link = `[${localize('settings', "settings")}](${createCommandUri('workbench.action.openSettings', this.extension.deprecationInfo.settings.map(setting => `@id:${setting}`).join(' '))}})`;
                this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('deprecated with alternate settings tooltip', "This extension is deprecated as this functionality is now built-in to VS Code. Configure these {0} to use this functionality.", link)) }, true);
            }
            else {
                const message = new MarkdownString(localize('deprecated tooltip', "This extension is deprecated as it is no longer being maintained."));
                if (this.extension.deprecationInfo.additionalInfo) {
                    message.appendMarkdown(` ${this.extension.deprecationInfo.additionalInfo}`);
                }
                this.updateStatus({ icon: warningIcon, message }, true);
            }
            return;
        }
        if (this.extension.missingFromGallery) {
            this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('missing from gallery tooltip', "This extension is no longer available on the Extension Marketplace.")) }, true);
            return;
        }
        if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
            return;
        }
        if (this.extension.outdated) {
            const message = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
            if (message) {
                const markdown = new MarkdownString();
                markdown.appendMarkdown(`${message} `);
                markdown.appendMarkdown(localize('auto update message', "Please [review the extension]({0}) and update it manually.", this.extension.hasChangelog()
                    ? createCommandUri('extension.open', this.extension.identifier.id, "changelog" /* ExtensionEditorTab.Changelog */).toString()
                    : this.extension.repository
                        ? this.extension.repository
                        : createCommandUri('extension.open', this.extension.identifier.id).toString()));
                this.updateStatus({ icon: warningIcon, message: markdown }, true);
            }
        }
        if (this.extension.gallery && this.extension.state === 3 /* ExtensionState.Uninstalled */) {
            const result = await this.extensionsWorkbenchService.canInstall(this.extension);
            if (result !== true) {
                this.updateStatus({ icon: warningIcon, message: result }, true);
                return;
            }
        }
        if (!this.extension.local ||
            !this.extension.server ||
            this.extension.state !== 1 /* ExtensionState.Installed */) {
            return;
        }
        // Extension is disabled by allowed list
        if (this.extension.enablementState === 7 /* EnablementState.DisabledByAllowlist */) {
            const result = this.allowedExtensionsService.isAllowed(this.extension.local);
            if (result !== true) {
                this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('disabled - not allowed', "This extension is disabled because {0}", result.value)) }, true);
                return;
            }
        }
        // Extension is disabled by environment
        if (this.extension.enablementState === 2 /* EnablementState.DisabledByEnvironment */) {
            this.updateStatus({ message: new MarkdownString(localize('disabled by environment', "This extension is disabled by the environment.")) }, true);
            return;
        }
        // Extension is enabled by environment
        if (this.extension.enablementState === 3 /* EnablementState.EnabledByEnvironment */) {
            this.updateStatus({ message: new MarkdownString(localize('enabled by environment', "This extension is enabled because it is required in the current environment.")) }, true);
            return;
        }
        // Extension is disabled by virtual workspace
        if (this.extension.enablementState === 5 /* EnablementState.DisabledByVirtualWorkspace */) {
            const details = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.virtualWorkspaces);
            this.updateStatus({ icon: infoIcon, message: new MarkdownString(details ? escapeMarkdownSyntaxTokens(details) : localize('disabled because of virtual workspace', "This extension has been disabled because it does not support virtual workspaces.")) }, true);
            return;
        }
        // Limited support in Virtual Workspace
        if (isVirtualWorkspace(this.contextService.getWorkspace())) {
            const virtualSupportType = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(this.extension.local.manifest);
            const details = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.virtualWorkspaces);
            if (virtualSupportType === 'limited' || details) {
                this.updateStatus({ icon: warningIcon, message: new MarkdownString(details ? escapeMarkdownSyntaxTokens(details) : localize('extension limited because of virtual workspace', "This extension has limited features because the current workspace is virtual.")) }, true);
                return;
            }
        }
        // Unification
        if (this.extension.enablementState === 9 /* EnablementState.DisabledByUnification */) {
            this.updateStatus({ icon: infoIcon, message: new MarkdownString(localize('extension disabled because of unification', "All GitHub Copilot functionality is now being served from the GitHub Copilot Chat extension. To temporarily opt out of this extension unification, toggle the {0} setting.", '`chat.extensionUnification.enabled`')) }, true);
            return;
        }
        if (!this.workspaceTrustService.isWorkspaceTrusted() &&
            // Extension is disabled by untrusted workspace
            (this.extension.enablementState === 0 /* EnablementState.DisabledByTrustRequirement */ ||
                // All disabled dependencies of the extension are disabled by untrusted workspace
                (this.extension.enablementState === 8 /* EnablementState.DisabledByExtensionDependency */ && this.workbenchExtensionEnablementService.getDependenciesEnablementStates(this.extension.local).every(([, enablementState]) => this.workbenchExtensionEnablementService.isEnabledEnablementState(enablementState) || enablementState === 0 /* EnablementState.DisabledByTrustRequirement */)))) {
            this.enabled = true;
            const untrustedDetails = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.untrustedWorkspaces);
            this.updateStatus({ icon: trustIcon, message: new MarkdownString(untrustedDetails ? escapeMarkdownSyntaxTokens(untrustedDetails) : localize('extension disabled because of trust requirement', "This extension has been disabled because the current workspace is not trusted.")) }, true);
            return;
        }
        // Limited support in Untrusted Workspace
        if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() && !this.workspaceTrustService.isWorkspaceTrusted()) {
            const untrustedSupportType = this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(this.extension.local.manifest);
            const untrustedDetails = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.untrustedWorkspaces);
            if (untrustedSupportType === 'limited' || untrustedDetails) {
                this.enabled = true;
                this.updateStatus({ icon: trustIcon, message: new MarkdownString(untrustedDetails ? escapeMarkdownSyntaxTokens(untrustedDetails) : localize('extension limited because of trust requirement', "This extension has limited features because the current workspace is not trusted.")) }, true);
                return;
            }
        }
        // Extension is disabled by extension kind
        if (this.extension.enablementState === 1 /* EnablementState.DisabledByExtensionKind */) {
            if (!this.extensionsWorkbenchService.installed.some(e => areSameExtensions(e.identifier, this.extension.identifier) && e.server !== this.extension.server)) {
                let message;
                // Extension on Local Server
                if (this.extensionManagementServerService.localExtensionManagementServer === this.extension.server) {
                    if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
                        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
                            message = new MarkdownString(`${localize('Install in remote server to enable', "This extension is disabled in this workspace because it is defined to run in the Remote Extension Host. Please install the extension in '{0}' to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
                        }
                    }
                }
                // Extension on Remote Server
                else if (this.extensionManagementServerService.remoteExtensionManagementServer === this.extension.server) {
                    if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
                        if (this.extensionManagementServerService.localExtensionManagementServer) {
                            message = new MarkdownString(`${localize('Install in local server to enable', "This extension is disabled in this workspace because it is defined to run in the Local Extension Host. Please install the extension locally to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
                        }
                        else if (isWeb) {
                            message = new MarkdownString(`${localize('Defined to run in desktop', "This extension is disabled because it is defined to run only in {0} for the Desktop.", this.productService.nameLong)} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
                        }
                    }
                }
                // Extension on Web Server
                else if (this.extensionManagementServerService.webExtensionManagementServer === this.extension.server) {
                    message = new MarkdownString(`${localize('Cannot be enabled', "This extension is disabled because it is not supported in {0} for the Web.", this.productService.nameLong)} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
                }
                if (message) {
                    this.updateStatus({ icon: warningIcon, message }, true);
                }
                return;
            }
        }
        const extensionId = new ExtensionIdentifier(this.extension.identifier.id);
        const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
        for (const feature of features) {
            const status = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id)?.current?.status;
            const manageAccessLink = `[${localize('manage access', 'Manage Access')}](${createCommandUri('extension.open', this.extension.identifier.id, "features" /* ExtensionEditorTab.Features */, false, feature.id)})`;
            if (status?.severity === Severity.Error) {
                this.updateStatus({ icon: errorIcon, message: new MarkdownString().appendText(status.message).appendMarkdown(` ${manageAccessLink}`) }, true);
                return;
            }
            if (status?.severity === Severity.Warning) {
                this.updateStatus({ icon: warningIcon, message: new MarkdownString().appendText(status.message).appendMarkdown(` ${manageAccessLink}`) }, true);
                return;
            }
        }
        // Remote Workspace
        if (this.extensionManagementServerService.remoteExtensionManagementServer) {
            if (isLanguagePackExtension(this.extension.local.manifest)) {
                if (!this.extensionsWorkbenchService.installed.some(e => areSameExtensions(e.identifier, this.extension.identifier) && e.server !== this.extension.server)) {
                    const message = this.extension.server === this.extensionManagementServerService.localExtensionManagementServer
                        ? new MarkdownString(localize('Install language pack also in remote server', "Install the language pack extension on '{0}' to enable it there also.", this.extensionManagementServerService.remoteExtensionManagementServer.label))
                        : new MarkdownString(localize('Install language pack also locally', "Install the language pack extension locally to enable it there also."));
                    this.updateStatus({ icon: infoIcon, message }, true);
                }
                return;
            }
            const runningExtension = this.extensionService.extensions.filter(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))[0];
            const runningExtensionServer = runningExtension ? this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension)) : null;
            if (this.extension.server === this.extensionManagementServerService.localExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer) {
                if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
                    this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize('enabled remotely', "This extension is enabled in the Remote Extension Host because it prefers to run there.")} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
                }
                return;
            }
            if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
                if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
                    this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize('enabled locally', "This extension is enabled in the Local Extension Host because it prefers to run there.")} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
                }
                return;
            }
            if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.webExtensionManagementServer) {
                if (this.extensionManifestPropertiesService.canExecuteOnWeb(this.extension.local.manifest)) {
                    this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize('enabled in web worker', "This extension is enabled in the Web Worker Extension Host because it prefers to run there.")} [${localize('learn more', "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
                }
                return;
            }
        }
        // Extension is disabled by its dependency
        if (this.extension.enablementState === 8 /* EnablementState.DisabledByExtensionDependency */) {
            this.updateStatus({
                icon: warningIcon,
                message: new MarkdownString(localize('extension disabled because of dependency', "This extension depends on an extension that is disabled."))
                    .appendMarkdown(`&nbsp;[${localize('dependencies', "Show Dependencies")}](${createCommandUri('extension.open', this.extension.identifier.id, "dependencies" /* ExtensionEditorTab.Dependencies */)})`)
            }, true);
            return;
        }
        if (!this.extension.local.isValid) {
            const errors = this.extension.local.validations.filter(([severity]) => severity === Severity.Error).map(([, message]) => message);
            this.updateStatus({ icon: warningIcon, message: new MarkdownString(errors.join(' ').trim()) }, true);
            return;
        }
        const isEnabled = this.workbenchExtensionEnablementService.isEnabled(this.extension.local);
        const isRunning = this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier));
        if (!this.extension.isWorkspaceScoped && isEnabled && isRunning) {
            if (this.extension.enablementState === 13 /* EnablementState.EnabledWorkspace */) {
                this.updateStatus({ message: new MarkdownString(localize('workspace enabled', "This extension is enabled for this workspace by the user.")) }, true);
                return;
            }
            if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
                if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
                    this.updateStatus({ message: new MarkdownString(localize('extension enabled on remote', "Extension is enabled on '{0}'", this.extension.server.label)) }, true);
                    return;
                }
            }
            if (this.extension.enablementState === 12 /* EnablementState.EnabledGlobally */) {
                return;
            }
        }
        if (!isEnabled && !isRunning) {
            if (this.extension.enablementState === 10 /* EnablementState.DisabledGlobally */) {
                this.updateStatus({ message: new MarkdownString(localize('globally disabled', "This extension is disabled globally by the user.")) }, true);
                return;
            }
            if (this.extension.enablementState === 11 /* EnablementState.DisabledWorkspace */) {
                this.updateStatus({ message: new MarkdownString(localize('workspace disabled', "This extension is disabled for this workspace by the user.")) }, true);
                return;
            }
        }
    }
    updateStatus(status, updateClass) {
        if (status) {
            if (this._status.some(s => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
                return;
            }
        }
        else {
            if (this._status.length === 0) {
                return;
            }
            this._status = [];
        }
        if (status) {
            this._status.push(status);
            this._status.sort((a, b) => b.icon === trustIcon ? -1 :
                a.icon === trustIcon ? 1 :
                    b.icon === errorIcon ? -1 :
                        a.icon === errorIcon ? 1 :
                            b.icon === warningIcon ? -1 :
                                a.icon === warningIcon ? 1 :
                                    b.icon === infoIcon ? -1 :
                                        a.icon === infoIcon ? 1 :
                                            0);
        }
        if (updateClass) {
            if (status?.icon === errorIcon) {
                this.class = `${ExtensionStatusAction_1.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
            }
            else if (status?.icon === warningIcon) {
                this.class = `${ExtensionStatusAction_1.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
            }
            else if (status?.icon === infoIcon) {
                this.class = `${ExtensionStatusAction_1.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
            }
            else if (status?.icon === trustIcon) {
                this.class = `${ExtensionStatusAction_1.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
            }
            else {
                this.class = `${ExtensionStatusAction_1.CLASS} hide`;
            }
        }
        this._onDidChangeStatus.fire();
    }
    async run() {
        if (this._status[0]?.icon === trustIcon) {
            return this.commandService.executeCommand('workbench.trust.manage');
        }
    }
};
ExtensionStatusAction = ExtensionStatusAction_1 = __decorate([
    __param(0, IExtensionManagementServerService),
    __param(1, ILabelService),
    __param(2, ICommandService),
    __param(3, IWorkspaceTrustEnablementService),
    __param(4, IWorkspaceTrustManagementService),
    __param(5, IExtensionsWorkbenchService),
    __param(6, IExtensionService),
    __param(7, IExtensionManifestPropertiesService),
    __param(8, IWorkspaceContextService),
    __param(9, IProductService),
    __param(10, IAllowedExtensionsService),
    __param(11, IWorkbenchExtensionEnablementService),
    __param(12, IExtensionFeaturesManagementService),
    __param(13, IExtensionGalleryManifestService)
], ExtensionStatusAction);
export { ExtensionStatusAction };
let InstallSpecificVersionOfExtensionAction = class InstallSpecificVersionOfExtensionAction extends Action {
    static { InstallSpecificVersionOfExtensionAction_1 = this; }
    static { this.ID = 'workbench.extensions.action.install.specificVersion'; }
    static { this.LABEL = localize('install previous version', "Install Specific Version of Extension..."); }
    constructor(id = InstallSpecificVersionOfExtensionAction_1.ID, label = InstallSpecificVersionOfExtensionAction_1.LABEL, extensionsWorkbenchService, quickInputService, instantiationService, extensionEnablementService) {
        super(id, label);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.quickInputService = quickInputService;
        this.instantiationService = instantiationService;
        this.extensionEnablementService = extensionEnablementService;
    }
    get enabled() {
        return this.extensionsWorkbenchService.local.some(l => this.isEnabled(l));
    }
    async run() {
        const extensionPick = await this.quickInputService.pick(this.getExtensionEntries(), { placeHolder: localize('selectExtension', "Select Extension"), matchOnDetail: true });
        if (extensionPick && extensionPick.extension) {
            const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extensionPick.extension, true);
            await action.run();
            await this.extensionsWorkbenchService.openSearch(extensionPick.extension.identifier.id);
        }
    }
    isEnabled(extension) {
        const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extension, true);
        return action.enabled && !!extension.local && this.extensionEnablementService.isEnabled(extension.local);
    }
    async getExtensionEntries() {
        const installed = await this.extensionsWorkbenchService.queryLocal();
        const entries = [];
        for (const extension of installed) {
            if (this.isEnabled(extension)) {
                entries.push({
                    id: extension.identifier.id,
                    label: extension.displayName || extension.identifier.id,
                    description: extension.identifier.id,
                    extension,
                });
            }
        }
        return entries.sort((e1, e2) => e1.extension.displayName.localeCompare(e2.extension.displayName));
    }
};
InstallSpecificVersionOfExtensionAction = InstallSpecificVersionOfExtensionAction_1 = __decorate([
    __param(2, IExtensionsWorkbenchService),
    __param(3, IQuickInputService),
    __param(4, IInstantiationService),
    __param(5, IWorkbenchExtensionEnablementService)
], InstallSpecificVersionOfExtensionAction);
export { InstallSpecificVersionOfExtensionAction };
let AbstractInstallExtensionsInServerAction = class AbstractInstallExtensionsInServerAction extends Action {
    constructor(id, extensionsWorkbenchService, quickInputService, notificationService, progressService) {
        super(id);
        this.extensionsWorkbenchService = extensionsWorkbenchService;
        this.quickInputService = quickInputService;
        this.notificationService = notificationService;
        this.progressService = progressService;
        this.extensions = undefined;
        this.update();
        this.extensionsWorkbenchService.queryLocal().then(() => this.updateExtensions());
        this._register(this.extensionsWorkbenchService.onChange(() => {
            if (this.extensions) {
                this.updateExtensions();
            }
        }));
    }
    updateExtensions() {
        this.extensions = this.extensionsWorkbenchService.local;
        this.update();
    }
    update() {
        this.enabled = !!this.extensions && this.getExtensionsToInstall(this.extensions).length > 0;
        this.tooltip = this.label;
    }
    async run() {
        return this.selectAndInstallExtensions();
    }
    async queryExtensionsToInstall() {
        const local = await this.extensionsWorkbenchService.queryLocal();
        return this.getExtensionsToInstall(local);
    }
    async selectAndInstallExtensions() {
        const quickPick = this.quickInputService.createQuickPick();
        quickPick.busy = true;
        const disposable = quickPick.onDidAccept(() => {
            disposable.dispose();
            quickPick.hide();
            quickPick.dispose();
            this.onDidAccept(quickPick.selectedItems);
        });
        quickPick.show();
        const localExtensionsToInstall = await this.queryExtensionsToInstall();
        quickPick.busy = false;
        if (localExtensionsToInstall.length) {
            quickPick.title = this.getQuickPickTitle();
            quickPick.placeholder = localize('select extensions to install', "Select extensions to install");
            quickPick.canSelectMany = true;
            localExtensionsToInstall.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
            quickPick.items = localExtensionsToInstall.map(extension => ({ extension, label: extension.displayName, description: extension.version }));
        }
        else {
            quickPick.hide();
            quickPick.dispose();
            this.notificationService.notify({
                severity: Severity.Info,
                message: localize('no local extensions', "There are no extensions to install.")
            });
        }
    }
    async onDidAccept(selectedItems) {
        if (selectedItems.length) {
            const localExtensionsToInstall = selectedItems.filter(r => !!r.extension).map(r => r.extension);
            if (localExtensionsToInstall.length) {
                await this.progressService.withProgress({
                    location: 15 /* ProgressLocation.Notification */,
                    title: localize('installing extensions', "Installing Extensions...")
                }, () => this.installExtensions(localExtensionsToInstall));
                this.notificationService.info(localize('finished installing', "Successfully installed extensions."));
            }
        }
    }
};
AbstractInstallExtensionsInServerAction = __decorate([
    __param(1, IExtensionsWorkbenchService),
    __param(2, IQuickInputService),
    __param(3, INotificationService),
    __param(4, IProgressService)
], AbstractInstallExtensionsInServerAction);
export { AbstractInstallExtensionsInServerAction };
let InstallLocalExtensionsInRemoteAction = class InstallLocalExtensionsInRemoteAction extends AbstractInstallExtensionsInServerAction {
    constructor(extensionsWorkbenchService, quickInputService, progressService, notificationService, extensionManagementServerService, extensionGalleryService, instantiationService, fileService, logService) {
        super('workbench.extensions.actions.installLocalExtensionsInRemote', extensionsWorkbenchService, quickInputService, notificationService, progressService);
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionGalleryService = extensionGalleryService;
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.logService = logService;
    }
    get label() {
        if (this.extensionManagementServerService && this.extensionManagementServerService.remoteExtensionManagementServer) {
            return localize('select and install local extensions', "Install Local Extensions in '{0}'...", this.extensionManagementServerService.remoteExtensionManagementServer.label);
        }
        return '';
    }
    getQuickPickTitle() {
        return localize('install local extensions title', "Install Local Extensions in '{0}'", this.extensionManagementServerService.remoteExtensionManagementServer.label);
    }
    getExtensionsToInstall(local) {
        return local.filter(extension => {
            const action = this.instantiationService.createInstance(RemoteInstallAction, true);
            action.extension = extension;
            return action.enabled;
        });
    }
    async installExtensions(localExtensionsToInstall) {
        const galleryExtensions = [];
        const vsixs = [];
        const targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
        await Promises.settled(localExtensionsToInstall.map(async (extension) => {
            if (this.extensionGalleryService.isEnabled()) {
                const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
                if (gallery) {
                    galleryExtensions.push(gallery);
                    return;
                }
            }
            const vsix = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.zip(extension.local);
            vsixs.push(vsix);
        }));
        await Promises.settled(galleryExtensions.map(gallery => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(gallery)));
        try {
            await Promises.settled(vsixs.map(vsix => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.install(vsix)));
        }
        finally {
            try {
                await Promise.allSettled(vsixs.map(vsix => this.fileService.del(vsix)));
            }
            catch (error) {
                this.logService.error(error);
            }
        }
    }
};
InstallLocalExtensionsInRemoteAction = __decorate([
    __param(0, IExtensionsWorkbenchService),
    __param(1, IQuickInputService),
    __param(2, IProgressService),
    __param(3, INotificationService),
    __param(4, IExtensionManagementServerService),
    __param(5, IExtensionGalleryService),
    __param(6, IInstantiationService),
    __param(7, IFileService),
    __param(8, ILogService)
], InstallLocalExtensionsInRemoteAction);
export { InstallLocalExtensionsInRemoteAction };
let InstallRemoteExtensionsInLocalAction = class InstallRemoteExtensionsInLocalAction extends AbstractInstallExtensionsInServerAction {
    constructor(id, extensionsWorkbenchService, quickInputService, progressService, notificationService, extensionManagementServerService, extensionGalleryService, fileService, logService) {
        super(id, extensionsWorkbenchService, quickInputService, notificationService, progressService);
        this.extensionManagementServerService = extensionManagementServerService;
        this.extensionGalleryService = extensionGalleryService;
        this.fileService = fileService;
        this.logService = logService;
    }
    get label() {
        return localize('select and install remote extensions', "Install Remote Extensions Locally...");
    }
    getQuickPickTitle() {
        return localize('install remote extensions', "Install Remote Extensions Locally");
    }
    getExtensionsToInstall(local) {
        return local.filter(extension => extension.type === 1 /* ExtensionType.User */ && extension.server !== this.extensionManagementServerService.localExtensionManagementServer
            && !this.extensionsWorkbenchService.installed.some(e => e.server === this.extensionManagementServerService.localExtensionManagementServer && areSameExtensions(e.identifier, extension.identifier)));
    }
    async installExtensions(extensions) {
        const galleryExtensions = [];
        const vsixs = [];
        const targetPlatform = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getTargetPlatform();
        await Promises.settled(extensions.map(async (extension) => {
            if (this.extensionGalleryService.isEnabled()) {
                const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
                if (gallery) {
                    galleryExtensions.push(gallery);
                    return;
                }
            }
            const vsix = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.zip(extension.local);
            vsixs.push(vsix);
        }));
        await Promises.settled(galleryExtensions.map(gallery => this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery)));
        try {
            await Promises.settled(vsixs.map(vsix => this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix)));
        }
        finally {
            try {
                await Promise.allSettled(vsixs.map(vsix => this.fileService.del(vsix)));
            }
            catch (error) {
                this.logService.error(error);
            }
        }
    }
};
InstallRemoteExtensionsInLocalAction = __decorate([
    __param(1, IExtensionsWorkbenchService),
    __param(2, IQuickInputService),
    __param(3, IProgressService),
    __param(4, INotificationService),
    __param(5, IExtensionManagementServerService),
    __param(6, IExtensionGalleryService),
    __param(7, IFileService),
    __param(8, ILogService)
], InstallRemoteExtensionsInLocalAction);
export { InstallRemoteExtensionsInLocalAction };
CommandsRegistry.registerCommand('workbench.extensions.action.showExtensionsForLanguage', function (accessor, fileExtension) {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    return extensionsWorkbenchService.openSearch(`ext:${fileExtension.replace(/^\./, '')}`);
});
export const showExtensionsWithIdsCommandId = 'workbench.extensions.action.showExtensionsWithIds';
CommandsRegistry.registerCommand(showExtensionsWithIdsCommandId, function (accessor, extensionIds) {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    return extensionsWorkbenchService.openSearch(extensionIds.map(id => `@id:${id}`).join(' '));
});
registerColor('extensionButton.background', {
    dark: buttonSecondaryBackground,
    light: buttonSecondaryBackground,
    hcDark: null,
    hcLight: null
}, localize('extensionButtonBackground', "Button background color for extension actions."));
registerColor('extensionButton.foreground', {
    dark: buttonSecondaryForeground,
    light: buttonSecondaryForeground,
    hcDark: null,
    hcLight: null
}, localize('extensionButtonForeground', "Button foreground color for extension actions."));
registerColor('extensionButton.hoverBackground', {
    dark: buttonSecondaryHoverBackground,
    light: buttonSecondaryHoverBackground,
    hcDark: null,
    hcLight: null
}, localize('extensionButtonHoverBackground', "Button background hover color for extension actions."));
registerColor('extensionButton.border', {
    dark: buttonBorder,
    light: buttonBorder,
    hcDark: contrastBorder,
    hcLight: contrastBorder
}, localize('extensionButtonBorder', "Button border color for extension actions."));
registerColor('extensionButton.separator', buttonSeparator, localize('extensionButtonSeparator', "Button separator color for extension actions"));
export const extensionButtonProminentBackground = registerColor('extensionButton.prominentBackground', {
    dark: buttonBackground,
    light: buttonBackground,
    hcDark: null,
    hcLight: null
}, localize('extensionButtonProminentBackground', "Button background color for extension actions that stand out (e.g. install button)."));
registerColor('extensionButton.prominentForeground', {
    dark: buttonForeground,
    light: buttonForeground,
    hcDark: null,
    hcLight: null
}, localize('extensionButtonProminentForeground', "Button foreground color for extension actions that stand out (e.g. install button)."));
registerColor('extensionButton.prominentHoverBackground', {
    dark: buttonHoverBackground,
    light: buttonHoverBackground,
    hcDark: null,
    hcLight: null
}, localize('extensionButtonProminentHoverBackground', "Button background hover color for extension actions that stand out (e.g. install button)."));
registerThemingParticipant((theme, collector) => {
    const errorColor = theme.getColor(editorErrorForeground);
    if (errorColor) {
        collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
        collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
        collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
    }
    const warningColor = theme.getColor(editorWarningForeground);
    if (warningColor) {
        collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
        collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
        collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
    }
    const infoColor = theme.getColor(editorInfoForeground);
    if (infoColor) {
        collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
        collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
        collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc0FjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uc0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sOEJBQThCLENBQUM7QUFDdEMsT0FBTyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsTUFBTSxvQkFBb0IsQ0FBQztBQUN6RCxPQUFPLEVBQVcsTUFBTSxFQUFFLFNBQVMsRUFBRSxhQUFhLEVBQXNCLE1BQU0sb0NBQW9DLENBQUM7QUFDbkgsT0FBTyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDaEYsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQ0FBaUMsQ0FBQztBQUN2RCxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xFLE9BQU8sS0FBSyxJQUFJLE1BQU0saUNBQWlDLENBQUM7QUFDeEQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDOUYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDM0UsT0FBTyxFQUE4QiwyQkFBMkIsRUFBdUIsaUNBQWlDLEVBQUUsd0NBQXdDLEVBQUUsbUJBQW1CLEVBQUUscUJBQXFCLEVBQUUsb0JBQW9CLEVBQWlFLDBCQUEwQixFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDalcsT0FBTyxFQUFFLHFDQUFxQyxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDNUYsT0FBTyxFQUFxQix3QkFBd0IsRUFBbUYseUJBQXlCLEVBQUUsbUNBQW1DLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUN0UixPQUFPLEVBQUUsb0NBQW9D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