/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/extensionActions.css';
import { localize, localize2 } from '../../../../nls.js';
import { IAction, Action, Separator, SubmenuAction, IActionChangeEvent } from '../../../../base/common/actions.js';
import { Delayer, Promises, Throttler } from '../../../../base/common/async.js';
import * as DOM from '../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import * as json from '../../../../base/common/json.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { disposeIfDisposable } from '../../../../base/common/lifecycle.js';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, IExtensionContainer, TOGGLE_IGNORE_EXTENSION_ACTION_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, INSTALL_ACTIONS_GROUP, UPDATE_ACTIONS_GROUP, ExtensionEditorTab, ExtensionRuntimeActionType, IExtensionArg, AutoUpdateConfigurationKey } from '../common/extensions.js';
import { ExtensionsConfigurationInitialContent } from '../common/extensionsFileTemplate.js';
import { IGalleryExtension, IExtensionGalleryService, ILocalExtension, InstallOptions, InstallOperation, ExtensionManagementErrorCode, IAllowedExtensionsService, shouldRequireRepositorySignatureFor } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer, IWorkbenchExtensionManagementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from '../../../services/extensionRecommendations/common/extensionRecommendations.js';
import { areSameExtensions, getExtensionId } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionType, ExtensionIdentifier, IExtensionDescription, IExtensionManifest, isLanguagePackExtension, getWorkspaceSupportTypeMessage, TargetPlatform, isApplicationScopedExtension } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IFileService, IFileContent } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from '../../../../platform/workspace/common/workspace.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IExtensionService, toExtension, toExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { registerThemingParticipant, IColorTheme, ICssStyleCollector } from '../../../../platform/theme/common/themeService.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { buttonBackground, buttonForeground, buttonHoverBackground, registerColor, editorWarningForeground, editorInfoForeground, editorErrorForeground, buttonSeparator } from '../../../../platform/theme/common/colorRegistry.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { ITextEditorSelection } from '../../../../platform/editor/common/editor.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { MenuId, IMenuService, MenuItemAction, SubmenuItemAction } from '../../../../platform/actions/common/actions.js';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from '../../../browser/actions/workspaceCommands.js';
import { INotificationService, IPromptChoice, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IQuickPickItem, IQuickInputService, QuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { IWorkbenchThemeService, IWorkbenchTheme, IWorkbenchColorTheme, IWorkbenchFileIconTheme, IWorkbenchProductIconTheme } from '../../../services/themes/common/workbenchThemeService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { ITextFileService } from '../../../services/textfile/common/textfiles.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IDialogService, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IActionViewItemOptions, ActionViewItem } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { EXTENSIONS_CONFIG, IExtensionsConfigContent } from '../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { IUserDataSyncEnablementService } from '../../../../platform/userDataSync/common/userDataSync.js';
import { IContextMenuProvider } from '../../../../base/browser/contextmenu.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { errorIcon, infoIcon, manageExtensionIcon, syncEnabledIcon, syncIgnoredIcon, trustIcon, warningIcon } from './extensionsIcons.js';
import { isIOS, isWeb, language } from '../../../../base/common/platform.js';
import { IExtensionManifestPropertiesService } from '../../../services/extensions/common/extensionManifestPropertiesService.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { escapeMarkdownSyntaxTokens, IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { fromNow } from '../../../../base/common/date.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { getLocale } from '../../../../platform/languagePacks/common/languagePacks.js';
import { ILocaleService } from '../../../services/localization/common/locale.js';
import { isString } from '../../../../base/common/types.js';
import { showWindowLogActionId } from '../../../services/log/common/logConstants.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { Extensions, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { ActionWithDropdownActionViewItem, IActionWithDropdownActionViewItemOptions } from '../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAuthenticationUsageService } from '../../../services/authentication/browser/authenticationUsageService.js';
import { IExtensionGalleryManifestService } from '../../../../platform/extensionManagement/common/extensionGalleryManifest.js';
import { IWorkbenchIssueService } from '../../issue/common/issue.js';

export class PromptExtensionInstallFailureAction extends Action {

	constructor(
		private readonly extension: IExtension,
		private readonly options: InstallOptions | undefined,
		private readonly version: string,
		private readonly installOperation: InstallOperation,
		private readonly error: Error,
		@IProductService private readonly productService: IProductService,
		@IOpenerService private readonly openerService: IOpenerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWorkbenchIssueService private readonly workbenchIssueService: IWorkbenchIssueService,
	) {
		super('extension.promptExtensionInstallFailure');
	}

	override async run(): Promise<void> {
		if (isCancellationError(this.error)) {
			return;
		}

		this.logService.error(this.error);

		if (this.error.name === ExtensionManagementErrorCode.Unsupported) {
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

		if (ExtensionManagementErrorCode.ReleaseVersionNotFound === (<ExtensionManagementErrorCode>this.error.name)) {
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

		if ([ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleApi, ExtensionManagementErrorCode.IncompatibleTargetPlatform, ExtensionManagementErrorCode.Malicious, ExtensionManagementErrorCode.Deprecated].includes(<ExtensionManagementErrorCode>this.error.name)) {
			await this.dialogService.info(getErrorMessage(this.error));
			return;
		}

		if (ExtensionManagementErrorCode.PackageNotSigned === (<ExtensionManagementErrorCode>this.error.name)) {
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

		if (ExtensionManagementErrorCode.SignatureVerificationFailed === (<ExtensionManagementErrorCode>this.error.name)) {
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

		if (ExtensionManagementErrorCode.SignatureVerificationInternal === (<ExtensionManagementErrorCode>this.error.name)) {
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

		const operationMessage = this.installOperation === InstallOperation.Update ? localize('update operation', "Error while updating '{0}' extension.", this.extension.displayName || this.extension.identifier.id)
			: localize('install operation', "Error while installing '{0}' extension.", this.extension.displayName || this.extension.identifier.id);
		let additionalMessage;
		const promptChoices: IPromptChoice[] = [];

		const downloadUrl = await this.getDownloadUrl();
		if (downloadUrl) {
			additionalMessage = localize('check logs', "Please check the [log]({0}) for more details.", `command:${showWindowLogActionId}`);
			promptChoices.push({
				label: localize('download', "Try Downloading Manually..."),
				run: () => this.openerService.open(downloadUrl).then(() => {
					this.notificationService.prompt(
						Severity.Info,
						localize('install vsix', 'Once downloaded, please manually install the downloaded VSIX of \'{0}\'.', this.extension.identifier.id),
						[{
							label: localize('installVSIX', "Install from VSIX..."),
							run: () => this.commandService.executeCommand(SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID)
						}]
					);
				})
			});
		}

		const message = `${operationMessage}${additionalMessage ? ` ${additionalMessage}` : ''}`;
		this.notificationService.prompt(Severity.Error, message, promptChoices);
	}

	private async getDownloadUrl(): Promise<URI | undefined> {
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
		if (targetPlatform !== TargetPlatform.UNIVERSAL && targetPlatform !== TargetPlatform.UNDEFINED && this.extensionManagementServerService.remoteExtensionManagementServer) {
			try {
				const manifest = await this.galleryService.getManifest(this.extension.gallery, CancellationToken.None);
				if (manifest && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(manifest)) {
					targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
				}
			} catch (error) {
				this.logService.error(error);
				return undefined;
			}
		}
		if (targetPlatform === TargetPlatform.UNKNOWN) {
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

}

export interface IExtensionActionChangeEvent extends IActionChangeEvent {
	readonly hidden?: boolean;
	readonly menuActions?: IAction[];
}

export abstract class ExtensionAction extends Action implements IExtensionContainer {

	protected override _onDidChange = this._register(new Emitter<IExtensionActionChangeEvent>());
	override readonly onDidChange = this._onDidChange.event;

	static readonly EXTENSION_ACTION_CLASS = 'extension-action';
	static readonly TEXT_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} text`;
	static readonly LABEL_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} label`;
	static readonly PROMINENT_LABEL_ACTION_CLASS = `${ExtensionAction.LABEL_ACTION_CLASS} prominent`;
	static readonly ICON_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} icon`;

	private _extension: IExtension | null = null;
	get extension(): IExtension | null { return this._extension; }
	set extension(extension: IExtension | null) { this._extension = extension; this.update(); }

	private _hidden: boolean = false;
	get hidden(): boolean { return this._hidden; }
	set hidden(hidden: boolean) {
		if (this._hidden !== hidden) {
			this._hidden = hidden;
			this._onDidChange.fire({ hidden });
		}
	}

	protected override _setEnabled(value: boolean): void {
		super._setEnabled(value);
		if (this.hideOnDisabled) {
			this.hidden = !value;
		}
	}

	protected hideOnDisabled: boolean = true;

	abstract update(): void;
}

export class ButtonWithDropDownExtensionAction extends ExtensionAction {

	private primaryAction: IAction | undefined;

	readonly menuActionClassNames: string[] = [];
	private _menuActions: IAction[] = [];
	get menuActions(): IAction[] { return [...this._menuActions]; }

	override get extension(): IExtension | null {
		return super.extension;
	}

	override set extension(extension: IExtension | null) {
		this.extensionActions.forEach(a => a.extension = extension);
		super.extension = extension;
	}

	protected readonly extensionActions: ExtensionAction[];

	constructor(
		id: string,
		clazz: string,
		private readonly actionsGroups: ExtensionAction[][],
	) {
		clazz = `${clazz} action-dropdown`;
		super(id, undefined, clazz);
		this.menuActionClassNames = clazz.split(' ');
		this.hideOnDisabled = false;
		this.extensionActions = actionsGroups.flat();
		this.update();
		this._register(Event.any(...this.extensionActions.map(a => a.onDidChange))(() => this.update(true)));
		this.extensionActions.forEach(a => this._register(a));
	}

	update(donotUpdateActions?: boolean): void {
		if (!donotUpdateActions) {
			this.extensionActions.forEach(a => a.update());
		}

		const actionsGroups = this.actionsGroups.map(actionsGroup => actionsGroup.filter(a => !a.hidden));

		let actions: IAction[] = [];
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
			this.label = this.getLabel(this.primaryAction as ExtensionAction);
			this.tooltip = this.primaryAction.tooltip;
		} else {
			this.hidden = true;
			this.enabled = false;
		}
	}

	override async run(): Promise<void> {
		if (this.enabled) {
			await this.primaryAction?.run();
		}
	}

	protected getLabel(action: ExtensionAction): string {
		return action.label;
	}
}

export class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {

	constructor(
		action: ButtonWithDropDownExtensionAction,
		options: IActionViewItemOptions & IActionWithDropdownActionViewItemOptions,
		contextMenuProvider: IContextMenuProvider
	) {
		super(null, action, options, contextMenuProvider);
		this._register(action.onDidChange(e => {
			if (e.hidden !== undefined || e.menuActions !== undefined) {
				this.updateClass();
			}
		}));
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateClass();
	}

	protected override updateClass(): void {
		super.updateClass();
		if (this.element && this.dropdownMenuActionViewItem?.element) {
			this.element.classList.toggle('hide', (<ButtonWithDropDownExtensionAction>this._action).hidden);
			const isMenuEmpty = (<ButtonWithDropDownExtensionAction>this._action).menuActions.length === 0;
			this.element.classList.toggle('empty', isMenuEmpty);
			this.dropdownMenuActionViewItem.element.classList.toggle('hide', isMenuEmpty);
		}
	}

}

export class InstallAction extends ExtensionAction {

	static readonly CLASS = `${this.LABEL_ACTION_CLASS} prominent install`;
	private static readonly HIDE = `${this.CLASS} hide`;

	protected _manifest: IExtensionManifest | null = null;
	set manifest(manifest: IExtensionManifest | null) {
		this._manifest = manifest;
		this.updateLabel();
	}

	private readonly updateThrottler = new Throttler();
	public readonly options: InstallOptions;

	constructor(
		options: InstallOptions,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly runtimeExtensionService: IExtensionService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@ILabelService private readonly labelService: ILabelService,
		@IDialogService private readonly dialogService: IDialogService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
		@IExtensionGalleryManifestService private readonly extensionGalleryManifestService: IExtensionGalleryManifestService,
	) {
		super('extensions.install', localize('install', "Install"), InstallAction.CLASS, false);
		this.hideOnDisabled = false;
		this.options = { isMachineScoped: false, ...options };
		this.update();
		this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
		this._register(this.labelService.onDidChangeFormatters(() => this.updateLabel(), this));
	}

	update(): void {
		this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
	}

	protected async computeAndUpdateEnablement(): Promise<void> {
		this.enabled = false;
		this.class = InstallAction.HIDE;
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
		if (this.extension.state !== ExtensionState.Uninstalled) {
			return;
		}
		if (this.options.installPreReleaseVersion && (!this.extension.hasPreReleaseVersion || this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName, prerelease: true }) !== true)) {
			return;
		}
		if (!this.options.installPreReleaseVersion && !this.extension.hasReleaseVersion) {
			return;
		}
		this.hidden = false;
		this.class = InstallAction.CLASS;
		if (await this.extensionsWorkbenchService.canInstall(this.extension) === true) {
			this.enabled = true;
			this.updateLabel();
		}
	}

	override async run(): Promise<any> {
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
			let detail: string | MarkdownString = localize('deprecated message', "This extension is deprecated as it is no longer being maintained.");
			enum DeprecationChoice {
				InstallAnyway = 0,
				ShowAlternateExtension = 1,
				ConfigureSettings = 2,
				Cancel = 3
			}
			const buttons: IPromptButton<DeprecationChoice>[] = [
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
			} else if (this.extension.deprecationInfo.settings) {
				detail = localize('deprecated with alternate settings message', "This extension is deprecated as this functionality is now built-in to VS Code.");

				const settings = this.extension.deprecationInfo.settings;
				buttons.push({
					label: localize({ key: 'configure in settings', comment: ['&& denotes a mnemonic'] }, "&&Configure Settings"),
					run: async () => {
						await this.preferencesService.openSettings({ query: settings.map(setting => `@id:${setting}`).join(' ') });

						return DeprecationChoice.ConfigureSettings;
					}
				});
			} else if (this.extension.deprecationInfo.additionalInfo) {
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
					} finally {
						action.dispose();
					}
				}
			}
		}

	}

	private async getThemeAction(extension: IExtension): Promise<ExtensionAction | undefined> {
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

	private async install(extension: IExtension): Promise<IExtension | undefined> {
		try {
			return await this.extensionsWorkbenchService.install(extension, this.options);
		} catch (error) {
			await this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, this.options, extension.latestVersion, InstallOperation.Install, error).run();
			return undefined;
		}
	}

	private async getRunningExtension(extension: ILocalExtension): Promise<IExtensionDescription | null> {
		const runningExtension = await this.runtimeExtensionService.getExtension(extension.identifier.id);
		if (runningExtension) {
			return runningExtension;
		}
		if (this.runtimeExtensionService.canAddExtension(toExtensionDescription(extension))) {
			return new Promise<IExtensionDescription | null>((c, e) => {
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

	protected updateLabel(): void {
		this.label = this.getLabel();
	}

	getLabel(primary?: boolean): string {
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

}

export class InstallDropdownAction extends ButtonWithDropDownExtensionAction {

	set manifest(manifest: IExtensionManifest | null) {
		this.extensionActions.forEach(a => (<InstallAction>a).manifest = manifest);
		this.update();
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(`extensions.installActions`, InstallAction.CLASS, [
			[
				instantiationService.createInstance(InstallAction, { installPreReleaseVersion: extensionsWorkbenchService.preferPreReleases }),
				instantiationService.createInstance(InstallAction, { installPreReleaseVersion: !extensionsWorkbenchService.preferPreReleases }),
			]
		]);
	}

	protected override getLabel(action: InstallAction): string {
		return action.getLabel(true);
	}

}

export class InstallingLabelAction extends ExtensionAction {

	private static readonly LABEL = localize('installing', "Installing");
	private static readonly CLASS = `${ExtensionAction.LABEL_ACTION_CLASS} install installing`;

	constructor() {
		super('extension.installing', InstallingLabelAction.LABEL, InstallingLabelAction.CLASS, false);
	}

	update(): void {
		this.class = `${InstallingLabelAction.CLASS}${this.extension && this.extension.state === ExtensionState.Installing ? '' : ' hide'}`;
	}
}

export abstract class InstallInOtherServerAction extends ExtensionAction {

	protected static readonly INSTALL_LABEL = localize('install', "Install");
	protected static readonly INSTALLING_LABEL = localize('installing', "Installing");

	private static readonly Class = `${ExtensionAction.LABEL_ACTION_CLASS} prominent install-other-server`;
	private static readonly InstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} install-other-server installing`;

	updateWhenCounterExtensionChanges: boolean = true;

	constructor(
		id: string,
		private readonly server: IExtensionManagementServer | null,
		private readonly canInstallAnyWhere: boolean,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementServerService protected readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) {
		super(id, InstallInOtherServerAction.INSTALL_LABEL, InstallInOtherServerAction.Class, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = InstallInOtherServerAction.Class;

		if (this.canInstall()) {
			const extensionInOtherServer = this.extensionsWorkbenchService.installed.filter(e => areSameExtensions(e.identifier, this.extension!.identifier) && e.server === this.server)[0];
			if (extensionInOtherServer) {
				// Getting installed in other server
				if (extensionInOtherServer.state === ExtensionState.Installing && !extensionInOtherServer.local) {
					this.enabled = true;
					this.label = InstallInOtherServerAction.INSTALLING_LABEL;
					this.class = InstallInOtherServerAction.InstallingClass;
				}
			} else {
				// Not installed in other server
				this.enabled = true;
				this.label = this.getInstallLabel();
			}
		}
	}

	protected canInstall(): boolean {
		// Disable if extension is not installed or not an user extension
		if (
			!this.extension
			|| !this.server
			|| !this.extension.local
			|| this.extension.state !== ExtensionState.Installed
			|| this.extension.type !== ExtensionType.User
			|| this.extension.enablementState === EnablementState.DisabledByEnvironment || this.extension.enablementState === EnablementState.DisabledByTrustRequirement || this.extension.enablementState === EnablementState.DisabledByVirtualWorkspace
		) {
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

	override async run(): Promise<void> {
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

	protected abstract getInstallLabel(): string;
}

export class RemoteInstallAction extends InstallInOtherServerAction {

	constructor(
		canInstallAnyWhere: boolean,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) {
		super(`extensions.remoteinstall`, extensionManagementServerService.remoteExtensionManagementServer, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
	}

	protected getInstallLabel(): string {
		return this.extensionManagementServerService.remoteExtensionManagementServer
			? localize({ key: 'install in remote', comment: ['This is the name of the action to install an extension in remote server. Placeholder is for the name of remote server.'] }, "Install in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label)
			: InstallInOtherServerAction.INSTALL_LABEL;
	}

}

export class LocalInstallAction extends InstallInOtherServerAction {

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) {
		super(`extensions.localinstall`, extensionManagementServerService.localExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
	}

	protected getInstallLabel(): string {
		return localize('install locally', "Install Locally");
	}

}

export class WebInstallAction extends InstallInOtherServerAction {

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) {
		super(`extensions.webInstall`, extensionManagementServerService.webExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
	}

	protected getInstallLabel(): string {
		return localize('install browser', "Install in Browser");
	}

}

export class UninstallAction extends ExtensionAction {

	static readonly UninstallLabel = localize('uninstallAction', "Uninstall");
	private static readonly UninstallingLabel = localize('Uninstalling', "Uninstalling");

	static readonly UninstallClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall`;
	private static readonly UnInstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall uninstalling`;

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IDialogService private readonly dialogService: IDialogService
	) {
		super('extensions.uninstall', UninstallAction.UninstallLabel, UninstallAction.UninstallClass, false);
		this.update();
	}

	update(): void {
		if (!this.extension) {
			this.enabled = false;
			return;
		}

		const state = this.extension.state;

		if (state === ExtensionState.Uninstalling) {
			this.label = UninstallAction.UninstallingLabel;
			this.class = UninstallAction.UnInstallingClass;
			this.enabled = false;
			return;
		}

		this.label = UninstallAction.UninstallLabel;
		this.class = UninstallAction.UninstallClass;
		this.tooltip = UninstallAction.UninstallLabel;

		if (state !== ExtensionState.Installed) {
			this.enabled = false;
			return;
		}

		if (this.extension.isBuiltin) {
			this.enabled = false;
			return;
		}

		this.enabled = true;
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		alert(localize('uninstallExtensionStart', "Uninstalling extension {0} started.", this.extension.displayName));

		try {
			await this.extensionsWorkbenchService.uninstall(this.extension);
			alert(localize('uninstallExtensionComplete', "Please reload Visual Studio Code to complete the uninstallation of the extension {0}.", this.extension.displayName));
		} catch (error) {
			if (!isCancellationError(error)) {
				this.dialogService.error(getErrorMessage(error));
			}
		}
	}
}

export class UpdateAction extends ExtensionAction {

	private static readonly EnabledClass = `${this.LABEL_ACTION_CLASS} prominent update`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	private readonly updateThrottler = new Throttler();

	constructor(
		private readonly verbose: boolean,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(`extensions.update`, localize('update', "Update"), UpdateAction.DisabledClass, false);
		this.update();
	}

	update(): void {
		this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
		if (this.extension) {
			this.label = this.verbose ? localize('update to', "Update to v{0}", this.extension.latestVersion) : localize('update', "Update");
		}
	}

	private async computeAndUpdateEnablement(): Promise<void> {
		this.enabled = false;
		this.class = UpdateAction.DisabledClass;

		if (!this.extension) {
			return;
		}

		if (this.extension.deprecationInfo) {
			return;
		}

		const canInstall = await this.extensionsWorkbenchService.canInstall(this.extension);
		const isInstalled = this.extension.state === ExtensionState.Installed;

		this.enabled = canInstall === true && isInstalled && this.extension.outdated;
		this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}

		const consent = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
		if (consent) {
			const { result } = await this.dialogService.prompt<'update' | 'review' | 'cancel'>({
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
					return this.extensionsWorkbenchService.open(this.extension, { tab: ExtensionEditorTab.Changelog });
				}
				if (this.extension.repository) {
					return this.openerService.open(this.extension.repository);
				}
				return this.extensionsWorkbenchService.open(this.extension);
			}
		}

		const installOptions: InstallOptions = {};
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
		} catch (err) {
			this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, installOptions, this.extension.latestVersion, InstallOperation.Update, err).run();
		}
	}
}

export class ToggleAutoUpdateForExtensionAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.toggleAutoUpdateForExtension';
	static readonly LABEL = localize2('enableAutoUpdateLabel', "Auto Update");

	private static readonly EnabledClass = `${ExtensionAction.EXTENSION_ACTION_CLASS} auto-update`;
	private static readonly DisabledClass = `${this.EnabledClass} hide`;

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(ToggleAutoUpdateForExtensionAction.ID, ToggleAutoUpdateForExtensionAction.LABEL.value, ToggleAutoUpdateForExtensionAction.DisabledClass);
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
				this.update();
			}
		}));
		this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(e => this.update()));
		this.update();
	}

	override update() {
		this.enabled = false;
		this.class = ToggleAutoUpdateForExtensionAction.DisabledClass;
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
		this.class = ToggleAutoUpdateForExtensionAction.EnabledClass;
		this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}

		const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
		await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension, enableAutoUpdate);

		if (enableAutoUpdate) {
			alert(localize('enableAutoUpdate', "Enabled auto updates for", this.extension.displayName));
		} else {
			alert(localize('disableAutoUpdate', "Disabled auto updates for", this.extension.displayName));
		}
	}
}

export class ToggleAutoUpdatesForPublisherAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.toggleAutoUpdatesForPublisher';
	static readonly LABEL = localize('toggleAutoUpdatesForPublisherLabel', "Auto Update All (From Publisher)");

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(ToggleAutoUpdatesForPublisherAction.ID, ToggleAutoUpdatesForPublisherAction.LABEL);
	}

	override update() { }

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		alert(localize('ignoreExtensionUpdatePublisher', "Ignoring updates published by {0}.", this.extension.publisherDisplayName));
		const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
		await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension.publisher, enableAutoUpdate);
		if (enableAutoUpdate) {
			alert(localize('enableAutoUpdate', "Enabled auto updates for", this.extension.displayName));
		} else {
			alert(localize('disableAutoUpdate', "Disabled auto updates for", this.extension.displayName));
		}
	}
}

export class MigrateDeprecatedExtensionAction extends ExtensionAction {

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} migrate`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	constructor(
		private readonly small: boolean,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super('extensionsAction.migrateDeprecatedExtension', localize('migrateExtension', "Migrate"), MigrateDeprecatedExtensionAction.DisabledClass, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = MigrateDeprecatedExtensionAction.DisabledClass;
		if (!this.extension?.local) {
			return;
		}
		if (this.extension.state !== ExtensionState.Installed) {
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
		this.class = MigrateDeprecatedExtensionAction.EnabledClass;
		this.tooltip = localize('migrate to', "Migrate to {0}", this.extension.deprecationInfo.extension.displayName);
		this.label = this.small ? localize('migrate', "Migrate") : this.tooltip;
	}

	override async run(): Promise<any> {
		if (!this.extension?.deprecationInfo?.extension) {
			return;
		}
		const local = this.extension.local;
		await this.extensionsWorkbenchService.uninstall(this.extension);
		const [extension] = await this.extensionsWorkbenchService.getExtensions([{ id: this.extension.deprecationInfo.extension.id, preRelease: this.extension.deprecationInfo?.extension?.preRelease }], CancellationToken.None);
		await this.extensionsWorkbenchService.install(extension, { isMachineScoped: local?.isMachineScoped });
	}
}

export abstract class DropDownExtensionAction extends ExtensionAction {

	constructor(
		id: string,
		label: string,
		cssClass: string,
		enabled: boolean,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(id, label, cssClass, enabled);
	}

	private _actionViewItem: DropDownExtensionActionViewItem | null = null;
	createActionViewItem(options: IActionViewItemOptions): DropDownExtensionActionViewItem {
		this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
		return this._actionViewItem;
	}

	public override run(actionGroups: IAction[][]): Promise<any> {
		this._actionViewItem?.showMenu(actionGroups);
		return Promise.resolve();
	}
}

export class DropDownExtensionActionViewItem extends ActionViewItem {

	constructor(
		action: DropDownExtensionAction,
		options: IActionViewItemOptions,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super(null, action, { ...options, icon: true, label: true });
	}

	public showMenu(menuActionGroups: IAction[][]): void {
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

	private getActions(menuActionGroups: IAction[][]): IAction[] {
		let actions: IAction[] = [];
		for (const menuActions of menuActionGroups) {
			actions = [...actions, ...menuActions, new Separator()];
		}
		return actions.length ? actions.slice(0, actions.length - 1) : actions;
	}
}

async function getContextMenuActionsGroups(extension: IExtension | undefined | null, contextKeyService: IContextKeyService, instantiationService: IInstantiationService): Promise<[string, Array<MenuItemAction | SubmenuItemAction>][]> {
	return instantiationService.invokeFunction(async accessor => {
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
		const menuService = accessor.get(IMenuService);
		const extensionRecommendationsService = accessor.get(IExtensionRecommendationsService);
		const extensionIgnoredRecommendationsService = accessor.get(IExtensionIgnoredRecommendationsService);
		const workbenchThemeService = accessor.get(IWorkbenchThemeService);
		const authenticationUsageService = accessor.get(IAuthenticationUsageService);
		const allowedExtensionsService = accessor.get(IAllowedExtensionsService);
		const cksOverlay: [string, any][] = [];

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
			cksOverlay.push(['isExtensionWorkspaceRecommended', extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]?.reasonId === ExtensionRecommendationReason.Workspace]);
			cksOverlay.push(['isUserIgnoredRecommendation', extensionIgnoredRecommendationsService.globalIgnoredRecommendations.some(e => e === extension.identifier.id.toLowerCase())]);
			cksOverlay.push(['isExtensionPinned', extension.pinned]);
			cksOverlay.push(['isExtensionEnabled', extensionEnablementService.isEnabledEnablementState(extension.enablementState)]);
			switch (extension.state) {
				case ExtensionState.Installing:
					cksOverlay.push(['extensionStatus', 'installing']);
					break;
				case ExtensionState.Installed:
					cksOverlay.push(['extensionStatus', 'installed']);
					break;
				case ExtensionState.Uninstalling:
					cksOverlay.push(['extensionStatus', 'uninstalling']);
					break;
				case ExtensionState.Uninstalled:
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

function toActions(actionsGroups: [string, Array<MenuItemAction | SubmenuItemAction>][], instantiationService: IInstantiationService): IAction[][] {
	const result: IAction[][] = [];
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


export async function getContextMenuActions(extension: IExtension | undefined | null, contextKeyService: IContextKeyService, instantiationService: IInstantiationService): Promise<IAction[][]> {
	const actionsGroups = await getContextMenuActionsGroups(extension, contextKeyService, instantiationService);
	return toActions(actionsGroups, instantiationService);
}

export class ManageExtensionAction extends DropDownExtensionAction {

	static readonly ID = 'extensions.manage';

	private static readonly Class = `${ExtensionAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
	private static readonly HideManageExtensionClass = `${this.Class} hide`;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {

		super(ManageExtensionAction.ID, '', '', true, instantiationService);

		this.tooltip = localize('manage', "Manage");

		this.update();
	}

	async getActionGroups(): Promise<IAction[][]> {
		const groups: IAction[][] = [];
		const contextMenuActionsGroups = await getContextMenuActionsGroups(this.extension, this.contextKeyService, this.instantiationService);
		const themeActions: IAction[] = [], installActions: IAction[] = [], updateActions: IAction[] = [], otherActionGroups: IAction[][] = [];
		for (const [group, actions] of contextMenuActionsGroups) {
			if (group === INSTALL_ACTIONS_GROUP) {
				installActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
			} else if (group === UPDATE_ACTIONS_GROUP) {
				updateActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
			} else if (group === THEME_ACTIONS_GROUP) {
				themeActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
			} else {
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

	override async run(): Promise<any> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		return super.run(await this.getActionGroups());
	}

	update(): void {
		this.class = ManageExtensionAction.HideManageExtensionClass;
		this.enabled = false;
		if (this.extension) {
			const state = this.extension.state;
			this.enabled = state === ExtensionState.Installed;
			this.class = this.enabled || state === ExtensionState.Uninstalling ? ManageExtensionAction.Class : ManageExtensionAction.HideManageExtensionClass;
		}
	}
}

export class ExtensionEditorManageExtensionAction extends DropDownExtensionAction {

	constructor(
		private readonly contextKeyService: IContextKeyService,
		instantiationService: IInstantiationService
	) {
		super('extensionEditor.manageExtension', '', `${ExtensionAction.ICON_ACTION_CLASS} manage ${ThemeIcon.asClassName(manageExtensionIcon)}`, true, instantiationService);
		this.tooltip = localize('manage', "Manage");
	}

	update(): void { }

	override async run(): Promise<any> {
		const actionGroups: IAction[][] = [];
		(await getContextMenuActions(this.extension, this.contextKeyService, this.instantiationService)).forEach(actions => actionGroups.push(actions));
		actionGroups.forEach(group => group.forEach(extensionAction => {
			if (extensionAction instanceof ExtensionAction) {
				extensionAction.extension = this.extension;
			}
		}));
		return super.run(actionGroups);
	}

}

export class MenuItemExtensionAction extends ExtensionAction {

	constructor(
		private readonly action: IAction,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(action.id, action.label);
	}

	override get enabled(): boolean {
		return this.action.enabled;
	}

	override set enabled(value: boolean) {
		this.action.enabled = value;
	}

	update() {
		if (!this.extension) {
			return;
		}
		if (this.action.id === TOGGLE_IGNORE_EXTENSION_ACTION_ID) {
			this.checked = !this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
		} else if (this.action.id === ToggleAutoUpdateForExtensionAction.ID) {
			this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
		} else if (this.action.id === ToggleAutoUpdatesForPublisherAction.ID) {
			this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
		} else {
			this.checked = this.action.checked;
		}
	}

	override async run(): Promise<void> {
		if (this.extension) {
			const id = this.extension.local ? getExtensionId(this.extension.local.manifest.publisher, this.extension.local.manifest.name)
				: this.extension.gallery ? getExtensionId(this.extension.gallery.publisher, this.extension.gallery.name)
					: this.extension.identifier.id;
			const extensionArg: IExtensionArg = {
				id: this.extension.identifier.id,
				version: this.extension.version,
				location: this.extension.local?.location,
				galleryLink: this.extension.url
			};
			await this.action.run(id, extensionArg);
		}
	}
}

export class TogglePreReleaseExtensionAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.togglePreRlease';
	static readonly LABEL = localize('togglePreRleaseLabel', "Pre-Release");

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} pre-release`;
	private static readonly DisabledClass = `${this.EnabledClass} hide`;

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
	) {
		super(TogglePreReleaseExtensionAction.ID, TogglePreReleaseExtensionAction.LABEL, TogglePreReleaseExtensionAction.DisabledClass);
		this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
		this.update();
	}

	override update() {
		this.enabled = false;
		this.class = TogglePreReleaseExtensionAction.DisabledClass;
		if (!this.extension) {
			return;
		}
		if (this.extension.isBuiltin) {
			return;
		}
		if (this.extension.state !== ExtensionState.Installed) {
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
		this.class = TogglePreReleaseExtensionAction.EnabledClass;

		if (this.extension.preRelease) {
			this.label = localize('togglePreRleaseDisableLabel', "Switch to Release Version");
			this.tooltip = localize('togglePreRleaseDisableTooltip', "This will switch and enable updates to release versions");
		} else {
			this.label = localize('switchToPreReleaseLabel', "Switch to Pre-Release Version");
			this.tooltip = localize('switchToPreReleaseTooltip', "This will switch to pre-release version and enable updates to latest version always");
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: !this.extension.preRelease });
		await this.extensionsWorkbenchService.togglePreRelease(this.extension);
	}
}

export class InstallAnotherVersionAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.install.anotherVersion';
	static readonly LABEL = localize('install another version', "Install Specific Version...");

	constructor(
		extension: IExtension | null,
		private readonly whenInstalled: boolean,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
	) {
		super(InstallAnotherVersionAction.ID, InstallAnotherVersionAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
		this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
		this.extension = extension;
		this.update();
	}

	update(): void {
		this.enabled = !!this.extension && !this.extension.isBuiltin && !!this.extension.identifier.uuid && !this.extension.deprecationInfo
			&& this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) === true;
		if (this.enabled && this.whenInstalled) {
			this.enabled = !!this.extension?.local && !!this.extension.server && this.extension.state === ExtensionState.Installed;
		}
	}

	override async run(): Promise<any> {
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
		const pick = await this.quickInputService.pick(picks,
			{
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
			} catch (error) {
				this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, options, pick.id, InstallOperation.Install, error).run();
			}
		}
		return null;
	}

}

export class EnableForWorkspaceAction extends ExtensionAction {

	static readonly ID = 'extensions.enableForWorkspace';
	static readonly LABEL = localize('enableForWorkspaceAction', "Enable (Workspace)");

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService
	) {
		super(EnableForWorkspaceAction.ID, EnableForWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
		this.tooltip = localize('enableForWorkspaceActionToolTip', "Enable this extension only in this workspace");
		this.update();
	}

	update(): void {
		this.enabled = false;
		if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
			this.enabled = this.extension.state === ExtensionState.Installed
				&& !this.extensionEnablementService.isEnabled(this.extension.local)
				&& this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledWorkspace);
	}
}

export class EnableGloballyAction extends ExtensionAction {

	static readonly ID = 'extensions.enableGlobally';
	static readonly LABEL = localize('enableGloballyAction', "Enable");

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService
	) {
		super(EnableGloballyAction.ID, EnableGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
		this.tooltip = localize('enableGloballyActionToolTip', "Enable this extension");
		this.update();
	}

	update(): void {
		this.enabled = false;
		if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
			this.enabled = this.extension.state === ExtensionState.Installed
				&& this.extensionEnablementService.isDisabledGlobally(this.extension.local)
				&& this.extensionEnablementService.canChangeEnablement(this.extension.local);
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledGlobally);
	}
}

export class DisableForWorkspaceAction extends ExtensionAction {

	static readonly ID = 'extensions.disableForWorkspace';
	static readonly LABEL = localize('disableForWorkspaceAction', "Disable (Workspace)");

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super(DisableForWorkspaceAction.ID, DisableForWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
		this.tooltip = localize('disableForWorkspaceActionToolTip', "Disable this extension only in this workspace");
		this.update();
		this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
	}

	update(): void {
		this.enabled = false;
		if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier) && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY)) {
			this.enabled = this.extension.state === ExtensionState.Installed
				&& (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace)
				&& this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledWorkspace);
	}
}

export class DisableGloballyAction extends ExtensionAction {

	static readonly ID = 'extensions.disableGlobally';
	static readonly LABEL = localize('disableGloballyAction', "Disable");

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super(DisableGloballyAction.ID, DisableGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
		this.tooltip = localize('disableGloballyActionToolTip', "Disable this extension");
		this.update();
		this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
	}

	update(): void {
		this.enabled = false;
		if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier))) {
			this.enabled = this.extension.state === ExtensionState.Installed
				&& (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace)
				&& this.extensionEnablementService.canChangeEnablement(this.extension.local);
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledGlobally);
	}
}

export class EnableDropDownAction extends ButtonWithDropDownExtensionAction {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.enable', ExtensionAction.LABEL_ACTION_CLASS, [
			[
				instantiationService.createInstance(EnableGloballyAction),
				instantiationService.createInstance(EnableForWorkspaceAction)
			]
		]);
	}
}

export class DisableDropDownAction extends ButtonWithDropDownExtensionAction {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.disable', ExtensionAction.LABEL_ACTION_CLASS, [[
			instantiationService.createInstance(DisableGloballyAction),
			instantiationService.createInstance(DisableForWorkspaceAction)
		]]);
	}

}

export class ExtensionRuntimeStateAction extends ExtensionAction {

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} reload`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	updateWhenCounterExtensionChanges: boolean = true;

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IUpdateService private readonly updateService: IUpdateService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IProductService private readonly productService: IProductService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super('extensions.runtimeState', '', ExtensionRuntimeStateAction.DisabledClass, false);
		this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.tooltip = '';
		this.class = ExtensionRuntimeStateAction.DisabledClass;

		if (!this.extension) {
			return;
		}

		const state = this.extension.state;
		if (state === ExtensionState.Installing || state === ExtensionState.Uninstalling) {
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
		this.class = ExtensionRuntimeStateAction.EnabledClass;
		this.tooltip = runtimeState.reason;
		this.label = runtimeState.action === ExtensionRuntimeActionType.ReloadWindow ? localize('reload window', 'Reload Window')
			: runtimeState.action === ExtensionRuntimeActionType.RestartExtensions ? localize('restart extensions', 'Restart Extensions')
				: runtimeState.action === ExtensionRuntimeActionType.QuitAndInstall ? localize('restart product', 'Restart to Update')
					: runtimeState.action === ExtensionRuntimeActionType.ApplyUpdate || runtimeState.action === ExtensionRuntimeActionType.DownloadUpdate ? localize('update product', 'Update {0}', this.productService.nameShort) : '';
	}

	override async run(): Promise<any> {
		const runtimeState = this.extension?.runtimeState;
		if (!runtimeState?.action) {
			return;
		}

		type ExtensionRuntimeStateActionClassification = {
			owner: 'sandy081';
			comment: 'Extension runtime state action event';
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Executed action' };
		};
		type ExtensionRuntimeStateActionEvent = {
			action: string;
		};
		this.telemetryService.publicLog2<ExtensionRuntimeStateActionEvent, ExtensionRuntimeStateActionClassification>('extensions:runtimestate:action', {
			action: runtimeState.action
		});

		if (runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow) {
			return this.hostService.reload();
		}

		else if (runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions) {
			return this.extensionsWorkbenchService.updateRunningExtensions();
		}

		else if (runtimeState?.action === ExtensionRuntimeActionType.DownloadUpdate) {
			return this.updateService.downloadUpdate();
		}

		else if (runtimeState?.action === ExtensionRuntimeActionType.ApplyUpdate) {
			return this.updateService.applyUpdate();
		}

		else if (runtimeState?.action === ExtensionRuntimeActionType.QuitAndInstall) {
			return this.updateService.quitAndInstall();
		}

	}
}

function isThemeFromExtension(theme: IWorkbenchTheme, extension: IExtension | undefined | null): boolean {
	return !!(extension && theme.extensionData && ExtensionIdentifier.equals(theme.extensionData.extensionId, extension.identifier.id));
}

function getQuickPickEntries(themes: IWorkbenchTheme[], currentTheme: IWorkbenchTheme, extension: IExtension | null | undefined, showCurrentTheme: boolean): QuickPickItem[] {
	const picks: QuickPickItem[] = [];
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

export class SetColorThemeAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.setColorTheme';
	static readonly TITLE = localize2('workbench.extensions.action.setColorTheme', 'Set Color Theme');

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super(SetColorThemeAction.ID, SetColorThemeAction.TITLE.value, SetColorThemeAction.DisabledClass, false);
		this._register(Event.any<any>(extensionService.onDidChangeExtensions, workbenchThemeService.onDidColorThemeChange)(() => this.update(), this));
		this.update();
	}

	update(): void {
		this.workbenchThemeService.getColorThemes().then(colorThemes => {
			this.enabled = this.computeEnablement(colorThemes);
			this.class = this.enabled ? SetColorThemeAction.EnabledClass : SetColorThemeAction.DisabledClass;
		});
	}

	private computeEnablement(colorThemes: IWorkbenchColorTheme[]): boolean {
		return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemes.some(th => isThemeFromExtension(th, this.extension));
	}

	override async run({ showCurrentTheme, ignoreFocusLost }: { showCurrentTheme: boolean; ignoreFocusLost: boolean } = { showCurrentTheme: false, ignoreFocusLost: false }): Promise<any> {
		const colorThemes = await this.workbenchThemeService.getColorThemes();

		if (!this.computeEnablement(colorThemes)) {
			return;
		}
		const currentTheme = this.workbenchThemeService.getColorTheme();

		const delayer = new Delayer<any>(100);
		const picks = getQuickPickEntries(colorThemes, currentTheme, this.extension, showCurrentTheme);
		const pickedTheme = await this.quickInputService.pick(
			picks,
			{
				placeHolder: localize('select color theme', "Select Color Theme"),
				onDidFocus: item => delayer.trigger(() => this.workbenchThemeService.setColorTheme(item.id, undefined)),
				ignoreFocusLost
			});
		return this.workbenchThemeService.setColorTheme(pickedTheme ? pickedTheme.id : currentTheme.id, 'auto');
	}
}

export class SetFileIconThemeAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.setFileIconTheme';
	static readonly TITLE = localize2('workbench.extensions.action.setFileIconTheme', 'Set File Icon Theme');

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super(SetFileIconThemeAction.ID, SetFileIconThemeAction.TITLE.value, SetFileIconThemeAction.DisabledClass, false);
		this._register(Event.any<any>(extensionService.onDidChangeExtensions, workbenchThemeService.onDidFileIconThemeChange)(() => this.update(), this));
		this.update();
	}

	update(): void {
		this.workbenchThemeService.getFileIconThemes().then(fileIconThemes => {
			this.enabled = this.computeEnablement(fileIconThemes);
			this.class = this.enabled ? SetFileIconThemeAction.EnabledClass : SetFileIconThemeAction.DisabledClass;
		});
	}

	private computeEnablement(colorThemfileIconThemess: IWorkbenchFileIconTheme[]): boolean {
		return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemfileIconThemess.some(th => isThemeFromExtension(th, this.extension));
	}

	override async run({ showCurrentTheme, ignoreFocusLost }: { showCurrentTheme: boolean; ignoreFocusLost: boolean } = { showCurrentTheme: false, ignoreFocusLost: false }): Promise<any> {
		const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
		if (!this.computeEnablement(fileIconThemes)) {
			return;
		}
		const currentTheme = this.workbenchThemeService.getFileIconTheme();

		const delayer = new Delayer<any>(100);
		const picks = getQuickPickEntries(fileIconThemes, currentTheme, this.extension, showCurrentTheme);
		const pickedTheme = await this.quickInputService.pick(
			picks,
			{
				placeHolder: localize('select file icon theme', "Select File Icon Theme"),
				onDidFocus: item => delayer.trigger(() => this.workbenchThemeService.setFileIconTheme(item.id, undefined)),
				ignoreFocusLost
			});
		return this.workbenchThemeService.setFileIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, 'auto');
	}
}

export class SetProductIconThemeAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.setProductIconTheme';
	static readonly TITLE = localize2('workbench.extensions.action.setProductIconTheme', 'Set Product Icon Theme');

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IWorkbenchThemeService private readonly workbenchThemeService: IWorkbenchThemeService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super(SetProductIconThemeAction.ID, SetProductIconThemeAction.TITLE.value, SetProductIconThemeAction.DisabledClass, false);
		this._register(Event.any<any>(extensionService.onDidChangeExtensions, workbenchThemeService.onDidProductIconThemeChange)(() => this.update(), this));
		this.update();
	}

	update(): void {
		this.workbenchThemeService.getProductIconThemes().then(productIconThemes => {
			this.enabled = this.computeEnablement(productIconThemes);
			this.class = this.enabled ? SetProductIconThemeAction.EnabledClass : SetProductIconThemeAction.DisabledClass;
		});
	}

	private computeEnablement(productIconThemes: IWorkbenchProductIconTheme[]): boolean {
		return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && productIconThemes.some(th => isThemeFromExtension(th, this.extension));
	}

	override async run({ showCurrentTheme, ignoreFocusLost }: { showCurrentTheme: boolean; ignoreFocusLost: boolean } = { showCurrentTheme: false, ignoreFocusLost: false }): Promise<any> {
		const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
		if (!this.computeEnablement(productIconThemes)) {
			return;
		}

		const currentTheme = this.workbenchThemeService.getProductIconTheme();

		const delayer = new Delayer<any>(100);
		const picks = getQuickPickEntries(productIconThemes, currentTheme, this.extension, showCurrentTheme);
		const pickedTheme = await this.quickInputService.pick(
			picks,
			{
				placeHolder: localize('select product icon theme', "Select Product Icon Theme"),
				onDidFocus: item => delayer.trigger(() => this.workbenchThemeService.setProductIconTheme(item.id, undefined)),
				ignoreFocusLost
			});
		return this.workbenchThemeService.setProductIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, 'auto');
	}
}

export class SetLanguageAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.setDisplayLanguage';
	static readonly TITLE = localize2('workbench.extensions.action.setDisplayLanguage', 'Set Display Language');

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(SetLanguageAction.ID, SetLanguageAction.TITLE.value, SetLanguageAction.DisabledClass, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = SetLanguageAction.DisabledClass;
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
		this.class = SetLanguageAction.EnabledClass;
	}

	override async run(): Promise<any> {
		return this.extension && this.extensionsWorkbenchService.setLanguage(this.extension);
	}
}

export class ClearLanguageAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.clearLanguage';
	static readonly TITLE = localize2('workbench.extensions.action.clearLanguage', 'Clear Display Language');

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
	private static readonly DisabledClass = `${this.EnabledClass} disabled`;

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILocaleService private readonly localeService: ILocaleService,
	) {
		super(ClearLanguageAction.ID, ClearLanguageAction.TITLE.value, ClearLanguageAction.DisabledClass, false);
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.class = ClearLanguageAction.DisabledClass;
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
		this.class = ClearLanguageAction.EnabledClass;
	}

	override async run(): Promise<any> {
		return this.extension && this.localeService.clearLocalePreference();
	}
}

export class ShowRecommendedExtensionAction extends Action {

	static readonly ID = 'workbench.extensions.action.showRecommendedExtension';
	static readonly LABEL = localize('showRecommendedExtension', "Show Recommended Extension");

	private extensionId: string;

	constructor(
		extensionId: string,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(ShowRecommendedExtensionAction.ID, ShowRecommendedExtensionAction.LABEL, undefined, false);
		this.extensionId = extensionId;
	}

	override async run(): Promise<any> {
		await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
		const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: 'install-recommendation' }, CancellationToken.None);
		if (extension) {
			return this.extensionWorkbenchService.open(extension);
		}
		return null;
	}
}

export class InstallRecommendedExtensionAction extends Action {

	static readonly ID = 'workbench.extensions.action.installRecommendedExtension';
	static readonly LABEL = localize('installRecommendedExtension', "Install Recommended Extension");

	private extensionId: string;

	constructor(
		extensionId: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(InstallRecommendedExtensionAction.ID, InstallRecommendedExtensionAction.LABEL, undefined, false);
		this.extensionId = extensionId;
	}

	override async run(): Promise<any> {
		await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
		const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: 'install-recommendation' }, CancellationToken.None);
		if (extension) {
			await this.extensionWorkbenchService.open(extension);
			try {
				await this.extensionWorkbenchService.install(extension);
			} catch (err) {
				this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, undefined, extension.latestVersion, InstallOperation.Install, err).run();
			}
		}
	}
}

export class IgnoreExtensionRecommendationAction extends Action {

	static readonly ID = 'extensions.ignore';

	private static readonly Class = `${ExtensionAction.LABEL_ACTION_CLASS} ignore`;

	constructor(
		private readonly extension: IExtension,
		@IExtensionIgnoredRecommendationsService private readonly extensionRecommendationsManagementService: IExtensionIgnoredRecommendationsService,
	) {
		super(IgnoreExtensionRecommendationAction.ID, 'Ignore Recommendation');

		this.class = IgnoreExtensionRecommendationAction.Class;
		this.tooltip = localize('ignoreExtensionRecommendation', "Do not recommend this extension again");
		this.enabled = true;
	}

	public override run(): Promise<any> {
		this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, true);
		return Promise.resolve();
	}
}

export class UndoIgnoreExtensionRecommendationAction extends Action {

	static readonly ID = 'extensions.ignore';

	private static readonly Class = `${ExtensionAction.LABEL_ACTION_CLASS} undo-ignore`;

	constructor(
		private readonly extension: IExtension,
		@IExtensionIgnoredRecommendationsService private readonly extensionRecommendationsManagementService: IExtensionIgnoredRecommendationsService,
	) {
		super(UndoIgnoreExtensionRecommendationAction.ID, 'Undo');

		this.class = UndoIgnoreExtensionRecommendationAction.Class;
		this.tooltip = localize('undo', "Undo");
		this.enabled = true;
	}

	public override run(): Promise<any> {
		this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, false);
		return Promise.resolve();
	}
}

export abstract class AbstractConfigureRecommendedExtensionsAction extends Action {

	constructor(
		id: string,
		label: string,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IEditorService protected editorService: IEditorService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		super(id, label);
	}

	protected openExtensionsFile(extensionsFileResource: URI): Promise<any> {
		return this.getOrCreateExtensionsFile(extensionsFileResource)
			.then(({ created, content }) =>
				this.getSelectionPosition(content, extensionsFileResource, ['recommendations'])
					.then(selection => this.editorService.openEditor({
						resource: extensionsFileResource,
						options: {
							pinned: created,
							selection
						}
					})),
				error => Promise.reject(new Error(localize('OpenExtensionsFile.failed', "Unable to create 'extensions.json' file inside the '.vscode' folder ({0}).", error))));
	}

	protected openWorkspaceConfigurationFile(workspaceConfigurationFile: URI): Promise<any> {
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

	private getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile: URI): Promise<IFileContent> {
		return Promise.resolve(this.fileService.readFile(workspaceConfigurationFile))
			.then(content => {
				const workspaceRecommendations = <IExtensionsConfigContent>json.parse(content.value.toString())['extensions'];
				if (!workspaceRecommendations || !workspaceRecommendations.recommendations) {
					return this.jsonEditingService.write(workspaceConfigurationFile, [{ path: ['extensions'], value: { recommendations: [] } }], true)
						.then(() => this.fileService.readFile(workspaceConfigurationFile));
				}
				return content;
			});
	}

	private getSelectionPosition(content: string, resource: URI, path: json.JSONPath): Promise<ITextEditorSelection | undefined> {
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

	private getOrCreateExtensionsFile(extensionsFileResource: URI): Promise<{ created: boolean; extensionsFileResource: URI; content: string }> {
		return Promise.resolve(this.fileService.readFile(extensionsFileResource)).then(content => {
			return { created: false, extensionsFileResource, content: content.value.toString() };
		}, err => {
			return this.textFileService.write(extensionsFileResource, ExtensionsConfigurationInitialContent).then(() => {
				return { created: true, extensionsFileResource, content: ExtensionsConfigurationInitialContent };
			});
		});
	}
}

export class ConfigureWorkspaceRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {

	static readonly ID = 'workbench.extensions.action.configureWorkspaceRecommendedExtensions';
	static readonly LABEL = localize('configureWorkspaceRecommendedExtensions', "Configure Recommended Extensions (Workspace)");

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService
	) {
		super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.update(), this));
		this.update();
	}

	private update(): void {
		this.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
	}

	public override run(): Promise<void> {
		switch (this.contextService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				return this.openExtensionsFile(this.contextService.getWorkspace().folders[0].toResource(EXTENSIONS_CONFIG));
			case WorkbenchState.WORKSPACE:
				return this.openWorkspaceConfigurationFile(this.contextService.getWorkspace().configuration!);
		}
		return Promise.resolve();
	}
}

export class ConfigureWorkspaceFolderRecommendedExtensionsAction extends AbstractConfigureRecommendedExtensionsAction {

	static readonly ID = 'workbench.extensions.action.configureWorkspaceFolderRecommendedExtensions';
	static readonly LABEL = localize('configureWorkspaceFolderRecommendedExtensions', "Configure Recommended Extensions (Workspace Folder)");

	constructor(
		id: string,
		label: string,
		@IFileService fileService: IFileService,
		@ITextFileService textFileService: ITextFileService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEditorService editorService: IEditorService,
		@IJSONEditingService jsonEditingService: IJSONEditingService,
		@ITextModelService textModelResolverService: ITextModelService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
	}

	public override run(): Promise<any> {
		const folderCount = this.contextService.getWorkspace().folders.length;
		const pickFolderPromise = folderCount === 1 ? Promise.resolve(this.contextService.getWorkspace().folders[0]) : this.commandService.executeCommand<IWorkspaceFolder>(PICK_WORKSPACE_FOLDER_COMMAND_ID);
		return Promise.resolve(pickFolderPromise)
			.then(workspaceFolder => {
				if (workspaceFolder) {
					return this.openExtensionsFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
				}
				return null;
			});
	}
}

export class ExtensionStatusLabelAction extends Action implements IExtensionContainer {

	private static readonly ENABLED_CLASS = `${ExtensionAction.TEXT_ACTION_CLASS} extension-status-label`;
	private static readonly DISABLED_CLASS = `${this.ENABLED_CLASS} hide`;

	private initialStatus: ExtensionState | null = null;
	private status: ExtensionState | null = null;
	private version: string | null = null;
	private enablementState: EnablementState | null = null;

	private _extension: IExtension | null = null;
	get extension(): IExtension | null { return this._extension; }
	set extension(extension: IExtension | null) {
		if (!(this._extension && extension && areSameExtensions(this._extension.identifier, extension.identifier))) {
			// Different extension. Reset
			this.initialStatus = null;
			this.status = null;
			this.enablementState = null;
		}
		this._extension = extension;
		this.update();
	}

	constructor(
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService
	) {
		super('extensions.action.statusLabel', '', ExtensionStatusLabelAction.DISABLED_CLASS, false);
	}

	update(): void {
		const label = this.computeLabel();
		this.label = label || '';
		this.class = label ? ExtensionStatusLabelAction.ENABLED_CLASS : ExtensionStatusLabelAction.DISABLED_CLASS;
	}

	private computeLabel(): string | null {
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
			const runningExtension = this.extensionService.extensions.filter(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier))[0];
			if (this.extension!.local) {
				if (runningExtension && this.extension!.version === runningExtension.version) {
					return true;
				}
				return this.extensionService.canAddExtension(toExtensionDescription(this.extension!.local));
			}
			return false;
		};
		const canRemoveExtension = () => {
			if (this.extension!.local) {
				if (this.extensionService.extensions.every(e => !(areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier) && this.extension!.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(e))))) {
					return true;
				}
				return this.extensionService.canRemoveExtension(toExtensionDescription(this.extension!.local));
			}
			return false;
		};

		if (currentStatus !== null) {
			if (currentStatus === ExtensionState.Installing && this.status === ExtensionState.Installed) {
				if (this.initialStatus === ExtensionState.Uninstalled && canAddExtension()) {
					return localize('installed', "Installed");
				}
				if (this.initialStatus === ExtensionState.Installed && this.version !== currentVersion && canAddExtension()) {
					return localize('updated', "Updated");
				}
				return null;
			}
			if (currentStatus === ExtensionState.Uninstalling && this.status === ExtensionState.Uninstalled) {
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

	override run(): Promise<any> {
		return Promise.resolve();
	}

}

export class ToggleSyncExtensionAction extends DropDownExtensionAction {

	private static readonly IGNORED_SYNC_CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncIgnoredIcon)}`;
	private static readonly SYNC_CLASS = `${this.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncEnabledIcon)}`;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super('extensions.sync', '', ToggleSyncExtensionAction.SYNC_CLASS, false, instantiationService);
		this._register(Event.filter(this.configurationService.onDidChangeConfiguration, e => e.affectsConfiguration('settingsSync.ignoredExtensions'))(() => this.update()));
		this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
		this.update();
	}

	update(): void {
		this.enabled = !!this.extension && this.userDataSyncEnablementService.isEnabled() && this.extension.state === ExtensionState.Installed;
		if (this.extension) {
			const isIgnored = this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
			this.class = isIgnored ? ToggleSyncExtensionAction.IGNORED_SYNC_CLASS : ToggleSyncExtensionAction.SYNC_CLASS;
			this.tooltip = isIgnored ? localize('ignored', "This extension is ignored during sync") : localize('synced', "This extension is synced");
		}
	}

	override async run(): Promise<any> {
		return super.run([
			[
				new Action(
					'extensions.syncignore',
					this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension!) ? localize('sync', "Sync this extension") : localize('do not sync', "Do not sync this extension")
					, undefined, true, () => this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(this.extension!))
			]
		]);
	}
}

export type ExtensionStatus = { readonly message: IMarkdownString; readonly icon?: ThemeIcon };

export class ExtensionStatusAction extends ExtensionAction {

	private static readonly CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-status`;

	updateWhenCounterExtensionChanges: boolean = true;

	private _status: ExtensionStatus[] = [];
	get status(): ExtensionStatus[] { return this._status; }

	private readonly _onDidChangeStatus = this._register(new Emitter<void>());
	readonly onDidChangeStatus = this._onDidChangeStatus.event;

	private readonly updateThrottler = new Throttler();

	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@ILabelService private readonly labelService: ILabelService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustService: IWorkspaceTrustManagementService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IProductService private readonly productService: IProductService,
		@IAllowedExtensionsService private readonly allowedExtensionsService: IAllowedExtensionsService,
		@IWorkbenchExtensionEnablementService private readonly workbenchExtensionEnablementService: IWorkbenchExtensionEnablementService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IExtensionGalleryManifestService private readonly extensionGalleryManifestService: IExtensionGalleryManifestService,
	) {
		super('extensions.status', '', `${ExtensionStatusAction.CLASS} hide`, false);
		this._register(this.labelService.onDidChangeFormatters(() => this.update(), this));
		this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
		this._register(this.extensionFeaturesManagementService.onDidChangeAccessData(() => this.update()));
		this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
		this.update();
	}

	update(): void {
		this.updateThrottler.queue(() => this.computeAndUpdateStatus());
	}

	private async computeAndUpdateStatus(): Promise<void> {
		this.updateStatus(undefined, true);
		this.enabled = false;

		if (!this.extension) {
			return;
		}

		if (this.extension.isMalicious) {
			this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('malicious tooltip', "This extension was reported to be problematic.")) }, true);
			return;
		}

		if (this.extension.state === ExtensionState.Uninstalled && this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
			this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('not signed tooltip', "This extension is not signed by the Extension Marketplace.")) }, true);
			return;
		}

		if (this.extension.deprecationInfo) {
			if (this.extension.deprecationInfo.extension) {
				const link = `[${this.extension.deprecationInfo.extension.displayName}](${URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([this.extension.deprecationInfo.extension.id]))}`)})`;
				this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('deprecated with alternate extension tooltip', "This extension is deprecated. Use the {0} extension instead.", link)) }, true);
			} else if (this.extension.deprecationInfo.settings) {
				const link = `[${localize('settings', "settings")}](${URI.parse(`command:workbench.action.openSettings?${encodeURIComponent(JSON.stringify([this.extension.deprecationInfo.settings.map(setting => `@id:${setting}`).join(' ')]))}`)})`;
				this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('deprecated with alternate settings tooltip', "This extension is deprecated as this functionality is now built-in to VS Code. Configure these {0} to use this functionality.", link)) }, true);
			} else {
				const message = new MarkdownString(localize('deprecated tooltip', "This extension is deprecated as it is no longer being maintained."));
				if (this.extension.deprecationInfo.additionalInfo) {
					message.appendMarkdown(` ${this.extension.deprecationInfo.additionalInfo}`);
				}
				this.updateStatus({ icon: warningIcon, message }, true);
			}
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
				markdown.appendMarkdown(
					localize('auto update message', "Please [review the extension]({0}) and update it manually.",
						this.extension.hasChangelog()
							? URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([this.extension.identifier.id, ExtensionEditorTab.Changelog]))}`).toString()
							: this.extension.repository
								? this.extension.repository
								: URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([this.extension.identifier.id]))}`).toString()
					));
				this.updateStatus({ icon: warningIcon, message: markdown }, true);
			}
		}

		if (this.extension.gallery && this.extension.state === ExtensionState.Uninstalled) {
			const result = await this.extensionsWorkbenchService.canInstall(this.extension);
			if (result !== true) {
				this.updateStatus({ icon: warningIcon, message: result }, true);
				return;
			}
		}

		if (!this.extension.local ||
			!this.extension.server ||
			this.extension.state !== ExtensionState.Installed
		) {
			return;
		}

		// Extension is disabled by allowed list
		if (this.extension.enablementState === EnablementState.DisabledByAllowlist) {
			const result = this.allowedExtensionsService.isAllowed(this.extension.local);
			if (result !== true) {
				this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('disabled - not allowed', "This extension is disabled because {0}", result.value)) }, true);
				return;
			}
		}

		// Extension is disabled by environment
		if (this.extension.enablementState === EnablementState.DisabledByEnvironment) {
			this.updateStatus({ message: new MarkdownString(localize('disabled by environment', "This extension is disabled by the environment.")) }, true);
			return;
		}

		// Extension is enabled by environment
		if (this.extension.enablementState === EnablementState.EnabledByEnvironment) {
			this.updateStatus({ message: new MarkdownString(localize('enabled by environment', "This extension is enabled because it is required in the current environment.")) }, true);
			return;
		}

		// Extension is disabled by virtual workspace
		if (this.extension.enablementState === EnablementState.DisabledByVirtualWorkspace) {
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

		if (!this.workspaceTrustService.isWorkspaceTrusted() &&
			// Extension is disabled by untrusted workspace
			(this.extension.enablementState === EnablementState.DisabledByTrustRequirement ||
				// All disabled dependencies of the extension are disabled by untrusted workspace
				(this.extension.enablementState === EnablementState.DisabledByExtensionDependency && this.workbenchExtensionEnablementService.getDependenciesEnablementStates(this.extension.local).every(([, enablementState]) => this.workbenchExtensionEnablementService.isEnabledEnablementState(enablementState) || enablementState === EnablementState.DisabledByTrustRequirement)))) {
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
		if (this.extension.enablementState === EnablementState.DisabledByExtensionKind) {
			if (!this.extensionsWorkbenchService.installed.some(e => areSameExtensions(e.identifier, this.extension!.identifier) && e.server !== this.extension!.server)) {
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
						} else if (isWeb) {
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
		const features = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
		for (const feature of features) {
			const status = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id)?.current?.status;
			const manageAccessLink = `[${localize('manage access', 'Manage Access')}](${URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([this.extension.identifier.id, ExtensionEditorTab.Features, false, feature.id]))}`)})`;
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
				if (!this.extensionsWorkbenchService.installed.some(e => areSameExtensions(e.identifier, this.extension!.identifier) && e.server !== this.extension!.server)) {
					const message = this.extension.server === this.extensionManagementServerService.localExtensionManagementServer
						? new MarkdownString(localize('Install language pack also in remote server', "Install the language pack extension on '{0}' to enable it there also.", this.extensionManagementServerService.remoteExtensionManagementServer.label))
						: new MarkdownString(localize('Install language pack also locally', "Install the language pack extension locally to enable it there also."));
					this.updateStatus({ icon: infoIcon, message }, true);
				}
				return;
			}

			const runningExtension = this.extensionService.extensions.filter(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier))[0];
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
		if (this.extension.enablementState === EnablementState.DisabledByExtensionDependency) {
			this.updateStatus({
				icon: warningIcon,
				message: new MarkdownString(localize('extension disabled because of dependency', "This extension depends on an extension that is disabled."))
					.appendMarkdown(`&nbsp;[${localize('dependencies', "Show Dependencies")}](${URI.parse(`command:extension.open?${encodeURIComponent(JSON.stringify([this.extension.identifier.id, ExtensionEditorTab.Dependencies]))}`)})`)
			}, true);
			return;
		}

		if (!this.extension.local.isValid) {
			const errors = this.extension.local.validations.filter(([severity]) => severity === Severity.Error).map(([, message]) => message);
			this.updateStatus({ icon: warningIcon, message: new MarkdownString(errors.join(' ').trim()) }, true);
			return;
		}

		const isEnabled = this.workbenchExtensionEnablementService.isEnabled(this.extension.local);
		const isRunning = this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier));

		if (!this.extension.isWorkspaceScoped && isEnabled && isRunning) {
			if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
				this.updateStatus({ message: new MarkdownString(localize('workspace enabled', "This extension is enabled for this workspace by the user.")) }, true);
				return;
			}
			if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
				if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
					this.updateStatus({ message: new MarkdownString(localize('extension enabled on remote', "Extension is enabled on '{0}'", this.extension.server.label)) }, true);
					return;
				}
			}
			if (this.extension.enablementState === EnablementState.EnabledGlobally) {
				return;
			}
		}

		if (!isEnabled && !isRunning) {
			if (this.extension.enablementState === EnablementState.DisabledGlobally) {
				this.updateStatus({ message: new MarkdownString(localize('globally disabled', "This extension is disabled globally by the user.")) }, true);
				return;
			}
			if (this.extension.enablementState === EnablementState.DisabledWorkspace) {
				this.updateStatus({ message: new MarkdownString(localize('workspace disabled', "This extension is disabled for this workspace by the user.")) }, true);
				return;
			}
		}
	}

	private updateStatus(status: ExtensionStatus | undefined, updateClass: boolean): void {
		if (status) {
			if (this._status.some(s => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
				return;
			}
		} else {
			if (this._status.length === 0) {
				return;
			}
			this._status = [];
		}

		if (status) {
			this._status.push(status);
			this._status.sort((a, b) =>
				b.icon === trustIcon ? -1 :
					a.icon === trustIcon ? 1 :
						b.icon === errorIcon ? -1 :
							a.icon === errorIcon ? 1 :
								b.icon === warningIcon ? -1 :
									a.icon === warningIcon ? 1 :
										b.icon === infoIcon ? -1 :
											a.icon === infoIcon ? 1 :
												0
			);
		}

		if (updateClass) {
			if (status?.icon === errorIcon) {
				this.class = `${ExtensionStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
			}
			else if (status?.icon === warningIcon) {
				this.class = `${ExtensionStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
			}
			else if (status?.icon === infoIcon) {
				this.class = `${ExtensionStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
			}
			else if (status?.icon === trustIcon) {
				this.class = `${ExtensionStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
			}
			else {
				this.class = `${ExtensionStatusAction.CLASS} hide`;
			}
		}
		this._onDidChangeStatus.fire();
	}

	override async run(): Promise<any> {
		if (this._status[0]?.icon === trustIcon) {
			return this.commandService.executeCommand('workbench.trust.manage');
		}
	}
}

export class InstallSpecificVersionOfExtensionAction extends Action {

	static readonly ID = 'workbench.extensions.action.install.specificVersion';
	static readonly LABEL = localize('install previous version', "Install Specific Version of Extension...");

	constructor(
		id: string = InstallSpecificVersionOfExtensionAction.ID, label: string = InstallSpecificVersionOfExtensionAction.LABEL,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super(id, label);
	}

	override get enabled(): boolean {
		return this.extensionsWorkbenchService.local.some(l => this.isEnabled(l));
	}

	override async run(): Promise<any> {
		const extensionPick = await this.quickInputService.pick(this.getExtensionEntries(), { placeHolder: localize('selectExtension', "Select Extension"), matchOnDetail: true });
		if (extensionPick && extensionPick.extension) {
			const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extensionPick.extension, true);
			await action.run();
			await this.extensionsWorkbenchService.openSearch(extensionPick.extension.identifier.id);
		}
	}

	private isEnabled(extension: IExtension): boolean {
		const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extension, true);
		return action.enabled && !!extension.local && this.extensionEnablementService.isEnabled(extension.local);
	}

	private async getExtensionEntries(): Promise<IExtensionPickItem[]> {
		const installed = await this.extensionsWorkbenchService.queryLocal();
		const entries: IExtensionPickItem[] = [];
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
}

interface IExtensionPickItem extends IQuickPickItem {
	extension: IExtension;
}

export abstract class AbstractInstallExtensionsInServerAction extends Action {

	private extensions: IExtension[] | undefined = undefined;

	constructor(
		id: string,
		@IExtensionsWorkbenchService protected readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProgressService private readonly progressService: IProgressService,
	) {
		super(id);
		this.update();
		this.extensionsWorkbenchService.queryLocal().then(() => this.updateExtensions());
		this._register(this.extensionsWorkbenchService.onChange(() => {
			if (this.extensions) {
				this.updateExtensions();
			}
		}));
	}

	private updateExtensions(): void {
		this.extensions = this.extensionsWorkbenchService.local;
		this.update();
	}

	private update(): void {
		this.enabled = !!this.extensions && this.getExtensionsToInstall(this.extensions).length > 0;
		this.tooltip = this.label;
	}

	override async run(): Promise<void> {
		return this.selectAndInstallExtensions();
	}

	private async queryExtensionsToInstall(): Promise<IExtension[]> {
		const local = await this.extensionsWorkbenchService.queryLocal();
		return this.getExtensionsToInstall(local);
	}

	private async selectAndInstallExtensions(): Promise<void> {
		const quickPick = this.quickInputService.createQuickPick<IExtensionPickItem>();
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
			quickPick.items = localExtensionsToInstall.map<IExtensionPickItem>(extension => ({ extension, label: extension.displayName, description: extension.version }));
		} else {
			quickPick.hide();
			quickPick.dispose();
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('no local extensions', "There are no extensions to install.")
			});
		}
	}

	private async onDidAccept(selectedItems: ReadonlyArray<IExtensionPickItem>): Promise<void> {
		if (selectedItems.length) {
			const localExtensionsToInstall = selectedItems.filter(r => !!r.extension).map(r => r.extension);
			if (localExtensionsToInstall.length) {
				await this.progressService.withProgress(
					{
						location: ProgressLocation.Notification,
						title: localize('installing extensions', "Installing Extensions...")
					},
					() => this.installExtensions(localExtensionsToInstall));
				this.notificationService.info(localize('finished installing', "Successfully installed extensions."));
			}
		}
	}

	protected abstract getQuickPickTitle(): string;
	protected abstract getExtensionsToInstall(local: IExtension[]): IExtension[];
	protected abstract installExtensions(extensions: IExtension[]): Promise<void>;
}

export class InstallLocalExtensionsInRemoteAction extends AbstractInstallExtensionsInServerAction {

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IProgressService progressService: IProgressService,
		@INotificationService notificationService: INotificationService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super('workbench.extensions.actions.installLocalExtensionsInRemote', extensionsWorkbenchService, quickInputService, notificationService, progressService);
	}

	override get label(): string {
		if (this.extensionManagementServerService && this.extensionManagementServerService.remoteExtensionManagementServer) {
			return localize('select and install local extensions', "Install Local Extensions in '{0}'...", this.extensionManagementServerService.remoteExtensionManagementServer.label);
		}
		return '';
	}

	protected getQuickPickTitle(): string {
		return localize('install local extensions title', "Install Local Extensions in '{0}'", this.extensionManagementServerService.remoteExtensionManagementServer!.label);
	}

	protected getExtensionsToInstall(local: IExtension[]): IExtension[] {
		return local.filter(extension => {
			const action = this.instantiationService.createInstance(RemoteInstallAction, true);
			action.extension = extension;
			return action.enabled;
		});
	}

	protected async installExtensions(localExtensionsToInstall: IExtension[]): Promise<void> {
		const galleryExtensions: IGalleryExtension[] = [];
		const vsixs: URI[] = [];
		const targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.getTargetPlatform();
		await Promises.settled(localExtensionsToInstall.map(async extension => {
			if (this.extensionGalleryService.isEnabled()) {
				const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
				if (gallery) {
					galleryExtensions.push(gallery);
					return;
				}
			}
			const vsix = await this.extensionManagementServerService.localExtensionManagementServer!.extensionManagementService.zip(extension.local!);
			vsixs.push(vsix);
		}));

		await Promises.settled(galleryExtensions.map(gallery => this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.installFromGallery(gallery)));
		try {
			await Promises.settled(vsixs.map(vsix => this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.install(vsix)));
		} finally {
			try {
				await Promise.allSettled(vsixs.map(vsix => this.fileService.del(vsix)));
			} catch (error) {
				this.logService.error(error);
			}
		}
	}
}

export class InstallRemoteExtensionsInLocalAction extends AbstractInstallExtensionsInServerAction {

	constructor(
		id: string,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IQuickInputService quickInputService: IQuickInputService,
		@IProgressService progressService: IProgressService,
		@INotificationService notificationService: INotificationService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super(id, extensionsWorkbenchService, quickInputService, notificationService, progressService);
	}

	override get label(): string {
		return localize('select and install remote extensions', "Install Remote Extensions Locally...");
	}

	protected getQuickPickTitle(): string {
		return localize('install remote extensions', "Install Remote Extensions Locally");
	}

	protected getExtensionsToInstall(local: IExtension[]): IExtension[] {
		return local.filter(extension =>
			extension.type === ExtensionType.User && extension.server !== this.extensionManagementServerService.localExtensionManagementServer
			&& !this.extensionsWorkbenchService.installed.some(e => e.server === this.extensionManagementServerService.localExtensionManagementServer && areSameExtensions(e.identifier, extension.identifier)));
	}

	protected async installExtensions(extensions: IExtension[]): Promise<void> {
		const galleryExtensions: IGalleryExtension[] = [];
		const vsixs: URI[] = [];
		const targetPlatform = await this.extensionManagementServerService.localExtensionManagementServer!.extensionManagementService.getTargetPlatform();
		await Promises.settled(extensions.map(async extension => {
			if (this.extensionGalleryService.isEnabled()) {
				const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
				if (gallery) {
					galleryExtensions.push(gallery);
					return;
				}
			}
			const vsix = await this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.zip(extension.local!);
			vsixs.push(vsix);
		}));

		await Promises.settled(galleryExtensions.map(gallery => this.extensionManagementServerService.localExtensionManagementServer!.extensionManagementService.installFromGallery(gallery)));
		try {
			await Promises.settled(vsixs.map(vsix => this.extensionManagementServerService.localExtensionManagementServer!.extensionManagementService.install(vsix)));
		} finally {
			try {
				await Promise.allSettled(vsixs.map(vsix => this.fileService.del(vsix)));
			} catch (error) {
				this.logService.error(error);
			}
		}
	}
}

CommandsRegistry.registerCommand('workbench.extensions.action.showExtensionsForLanguage', function (accessor: ServicesAccessor, fileExtension: string) {
	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	return extensionsWorkbenchService.openSearch(`ext:${fileExtension.replace(/^\./, '')}`);
});

export const showExtensionsWithIdsCommandId = 'workbench.extensions.action.showExtensionsWithIds';
CommandsRegistry.registerCommand(showExtensionsWithIdsCommandId, function (accessor: ServicesAccessor, extensionIds: string[]) {
	const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
	return extensionsWorkbenchService.openSearch(extensionIds.map(id => `@id:${id}`).join(' '));
});

registerColor('extensionButton.background', {
	dark: buttonBackground,
	light: buttonBackground,
	hcDark: null,
	hcLight: null
}, localize('extensionButtonBackground', "Button background color for extension actions."));

registerColor('extensionButton.foreground', {
	dark: buttonForeground,
	light: buttonForeground,
	hcDark: null,
	hcLight: null
}, localize('extensionButtonForeground', "Button foreground color for extension actions."));

registerColor('extensionButton.hoverBackground', {
	dark: buttonHoverBackground,
	light: buttonHoverBackground,
	hcDark: null,
	hcLight: null
}, localize('extensionButtonHoverBackground', "Button background hover color for extension actions."));

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

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {

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
