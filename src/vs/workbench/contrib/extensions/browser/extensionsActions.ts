/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionActions';
import { localize } from 'vs/nls';
import { IAction, Action, Separator, SubmenuAction } from 'vs/base/common/actions';
import { Delayer, Promises, Throttler } from 'vs/base/common/async';
import * as DOM from 'vs/base/browser/dom';
import { Emitter, Event } from 'vs/base/common/event';
import * as json from 'vs/base/common/json';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { disposeIfDisposable } from 'vs/base/common/lifecycle';
import { IExtension, ExtensionState, IExtensionsWorkbenchService, VIEWLET_ID, IExtensionsViewPaneContainer, IExtensionContainer, TOGGLE_IGNORE_EXTENSION_ACTION_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, INSTALL_ACTIONS_GROUP } from 'vs/workbench/contrib/extensions/common/extensions';
import { ExtensionsConfigurationInitialContent } from 'vs/workbench/contrib/extensions/common/extensionsFileTemplate';
import { IGalleryExtension, IExtensionGalleryService, ILocalExtension, InstallOptions, InstallOperation, TargetPlatformToString, ExtensionManagementErrorCode } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IExtensionManagementServer } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { areSameExtensions, getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, ExtensionIdentifier, IExtensionDescription, IExtensionManifest, isLanguagePackExtension, getWorkspaceSupportTypeMessage, TargetPlatform, isApplicationScopedExtension } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IFileService, IFileContent } from 'vs/platform/files/common/files';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IExtensionService, toExtension, toExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerThemingParticipant, IColorTheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { ThemeIcon } from 'vs/base/common/themables';
import { buttonBackground, buttonForeground, buttonHoverBackground, registerColor, editorWarningForeground, editorInfoForeground, editorErrorForeground, buttonSeparator } from 'vs/platform/theme/common/colorRegistry';
import { IJSONEditingService } from 'vs/workbench/services/configuration/common/jsonEditing';
import { ITextEditorSelection } from 'vs/platform/editor/common/editor';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { MenuId, IMenuService, MenuItemAction, SubmenuItemAction } from 'vs/platform/actions/common/actions';
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from 'vs/workbench/browser/actions/workspaceCommands';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickPickItem, IQuickInputService, IQuickPickSeparator, QuickPickItem } from 'vs/platform/quickinput/common/quickInput';
import { CancellationToken } from 'vs/base/common/cancellation';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IWorkbenchThemeService, IWorkbenchTheme, IWorkbenchColorTheme, IWorkbenchFileIconTheme, IWorkbenchProductIconTheme } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { ILabelService } from 'vs/platform/label/common/label';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IProductService } from 'vs/platform/product/common/productService';
import { IDialogService, IPromptButton } from 'vs/platform/dialogs/common/dialogs';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IActionViewItemOptions, ActionViewItem } from 'vs/base/browser/ui/actionbar/actionViewItems';
import { EXTENSIONS_CONFIG, IExtensionsConfigContent } from 'vs/workbench/services/extensionRecommendations/common/workspaceExtensionsConfig';
import { getErrorMessage, isCancellationError } from 'vs/base/common/errors';
import { IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
import { ActionWithDropdownActionViewItem, IActionWithDropdownActionViewItemOptions } from 'vs/base/browser/ui/dropdown/dropdownActionViewItem';
import { IContextMenuProvider } from 'vs/base/browser/contextmenu';
import { ILogService } from 'vs/platform/log/common/log';
import { errorIcon, infoIcon, manageExtensionIcon, preReleaseIcon, syncEnabledIcon, syncIgnoredIcon, trustIcon, warningIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { isIOS, isWeb, language } from 'vs/base/common/platform';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { isVirtualWorkspace } from 'vs/platform/workspace/common/virtualWorkspace';
import { escapeMarkdownSyntaxTokens, IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';
import { flatten } from 'vs/base/common/arrays';
import { fromNow } from 'vs/base/common/date';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { getLocale } from 'vs/platform/languagePacks/common/languagePacks';
import { ILocaleService } from 'vs/workbench/services/localization/common/locale';
import { isString } from 'vs/base/common/types';
import { showWindowLogActionId } from 'vs/workbench/services/log/common/logConstants';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class PromptExtensionInstallFailureAction extends Action {

	constructor(
		private readonly extension: IExtension,
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

		if ([ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleTargetPlatform, ExtensionManagementErrorCode.Malicious, ExtensionManagementErrorCode.ReleaseVersionNotFound, ExtensionManagementErrorCode.Deprecated].includes(<ExtensionManagementErrorCode>this.error.name)) {
			await this.dialogService.info(getErrorMessage(this.error));
			return;
		}

		if (ExtensionManagementErrorCode.Signature === (<ExtensionManagementErrorCode>this.error.name)) {
			await this.dialogService.prompt({
				type: 'error',
				message: localize('signature verification failed', "{0} cannot verify the '{1}' extension. Are you sure you want to install it?", this.productService.nameLong, this.extension.displayName || this.extension.identifier.id),
				buttons: [{
					label: localize('install anyway', "Install Anyway"),
					run: () => {
						const installAction = this.instantiationService.createInstance(InstallAction, { donotVerifySignature: true });
						installAction.extension = this.extension;
						return installAction.run();
					}
				}],
				cancelButton: localize('cancel', "Cancel")
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
		if (!this.productService.extensionsGallery) {
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
		return URI.parse(`${this.productService.extensionsGallery.serviceUrl}/publishers/${this.extension.publisher}/vsextensions/${this.extension.name}/${this.version}/vspackage${targetPlatform !== TargetPlatform.UNDEFINED ? `?targetPlatform=${targetPlatform}` : ''}`);
	}

}

export abstract class ExtensionAction extends Action implements IExtensionContainer {
	static readonly EXTENSION_ACTION_CLASS = 'extension-action';
	static readonly TEXT_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} text`;
	static readonly LABEL_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} label`;
	static readonly ICON_ACTION_CLASS = `${ExtensionAction.EXTENSION_ACTION_CLASS} icon`;
	private _extension: IExtension | null = null;
	get extension(): IExtension | null { return this._extension; }
	set extension(extension: IExtension | null) { this._extension = extension; this.update(); }
	abstract update(): void;
}

export class ActionWithDropDownAction extends ExtensionAction {

	private action: IAction | undefined;

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
		id: string, label: string,
		private readonly actionsGroups: ExtensionAction[][],
	) {
		super(id, label);
		this.extensionActions = flatten(actionsGroups);
		this.update();
		this._register(Event.any(...this.extensionActions.map(a => a.onDidChange))(() => this.update(true)));
		this.extensionActions.forEach(a => this._register(a));
	}

	update(donotUpdateActions?: boolean): void {
		if (!donotUpdateActions) {
			this.extensionActions.forEach(a => a.update());
		}

		const enabledActionsGroups = this.actionsGroups.map(actionsGroup => actionsGroup.filter(a => a.enabled));

		let actions: IAction[] = [];
		for (const enabledActions of enabledActionsGroups) {
			if (enabledActions.length) {
				actions = [...actions, ...enabledActions, new Separator()];
			}
		}
		actions = actions.length ? actions.slice(0, actions.length - 1) : actions;

		this.action = actions[0];
		this._menuActions = actions.length > 1 ? actions : [];

		this.enabled = !!this.action;
		if (this.action) {
			this.label = this.getLabel(this.action as ExtensionAction);
			this.tooltip = this.action.tooltip;
		}

		let clazz = (this.action || this.extensionActions[0])?.class || '';
		clazz = clazz ? `${clazz} action-dropdown` : 'action-dropdown';
		if (this._menuActions.length === 0) {
			clazz += ' action-dropdown';
		}
		this.class = clazz;
	}

	override run(): Promise<void> {
		const enabledActions = this.extensionActions.filter(a => a.enabled);
		return enabledActions[0].run();
	}

	protected getLabel(action: ExtensionAction): string {
		return action.label;
	}
}

export class InstallAction extends ExtensionAction {

	static readonly Class = `${ExtensionAction.LABEL_ACTION_CLASS} prominent install`;

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
	) {
		super('extensions.install', localize('install', "Install"), InstallAction.Class, false);
		this.options = { ...options, isMachineScoped: false };
		this.update();
		this._register(this.labelService.onDidChangeFormatters(() => this.updateLabel(), this));
	}

	update(): void {
		this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
	}

	protected async computeAndUpdateEnablement(): Promise<void> {
		this.enabled = false;
		if (!this.extension) {
			return;
		}
		if (this.extension.isBuiltin) {
			return;
		}
		if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
			return;
		}
		if (this.extension.state === ExtensionState.Uninstalled && await this.extensionsWorkbenchService.canInstall(this.extension)) {
			this.enabled = this.options.installPreReleaseVersion ? this.extension.hasPreReleaseVersion : this.extension.hasReleaseVersion;
			this.updateLabel();
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
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
			await this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, extension.latestVersion, InstallOperation.Install, error).run();
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

export class InstallDropdownAction extends ActionWithDropDownAction {

	set manifest(manifest: IExtensionManifest | null) {
		this.extensionActions.forEach(a => (<InstallAction>a).manifest = manifest);
		this.update();
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(`extensions.installActions`, '', [
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

	private static readonly Class = `${ExtensionAction.LABEL_ACTION_CLASS} prominent install`;
	private static readonly InstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} install installing`;

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

	private static readonly UninstallClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall`;
	private static readonly UnInstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall uninstalling`;

	constructor(
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
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

		return this.extensionsWorkbenchService.uninstall(this.extension).then(() => {
			alert(localize('uninstallExtensionComplete', "Please reload Visual Studio Code to complete the uninstallation of the extension {0}.", this.extension!.displayName));
		});
	}
}

abstract class AbstractUpdateAction extends ExtensionAction {

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent update`;
	private static readonly DisabledClass = `${AbstractUpdateAction.EnabledClass} disabled`;

	private readonly updateThrottler = new Throttler();

	constructor(
		id: string, label: string | undefined,
		protected readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(id, label, AbstractUpdateAction.DisabledClass, false);
		this.update();
	}

	update(): void {
		this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
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

		this.enabled = canInstall && isInstalled && this.extension.outdated;
		this.class = this.enabled ? AbstractUpdateAction.EnabledClass : AbstractUpdateAction.DisabledClass;
	}
}

export class UpdateAction extends AbstractUpdateAction {

	constructor(
		private readonly verbose: boolean,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IInstantiationService protected readonly instantiationService: IInstantiationService,
	) {
		super(`extensions.update`, localize('update', "Update"), extensionsWorkbenchService);
	}

	override update(): void {
		super.update();
		if (this.extension) {
			this.label = this.verbose ? localize('update to', "Update to v{0}", this.extension.latestVersion) : localize('update', "Update");
		}
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		alert(localize('updateExtensionStart', "Updating extension {0} to version {1} started.", this.extension.displayName, this.extension.latestVersion));
		return this.install(this.extension);
	}

	private async install(extension: IExtension): Promise<void> {
		try {
			await this.extensionsWorkbenchService.install(extension, extension.local?.preRelease ? { installPreReleaseVersion: true } : undefined);
			alert(localize('updateExtensionComplete', "Updating extension {0} to version {1} completed.", extension.displayName, extension.latestVersion));
		} catch (err) {
			this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, extension.latestVersion, InstallOperation.Update, err).run();
		}
	}
}

export class SkipUpdateAction extends AbstractUpdateAction {

	constructor(
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(`extensions.ignoreUpdates`, localize('ignoreUpdates', "Ignore Updates"), extensionsWorkbenchService);
	}

	override update() {
		if (!this.extension) {
			return;
		}
		if (this.extension.isBuiltin) {
			this.enabled = false;
			return;
		}
		super.update();
		this._checked = this.extension.pinned;
	}

	override async run(): Promise<any> {
		if (!this.extension) {
			return;
		}
		alert(localize('ignoreExtensionUpdate', "Ignoring {0} updates", this.extension.displayName));
		const newIgnoresAutoUpdates = !this.extension.pinned;
		await this.extensionsWorkbenchService.pinExtension(this.extension, newIgnoresAutoUpdates);
	}
}

export class MigrateDeprecatedExtensionAction extends ExtensionAction {

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} migrate`;
	private static readonly DisabledClass = `${MigrateDeprecatedExtensionAction.EnabledClass} disabled`;

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

export class ExtensionActionWithDropdownActionViewItem extends ActionWithDropdownActionViewItem {

	constructor(
		action: ActionWithDropDownAction,
		options: IActionViewItemOptions & IActionWithDropdownActionViewItemOptions,
		contextMenuProvider: IContextMenuProvider
	) {
		super(null, action, options, contextMenuProvider);
	}

	override render(container: HTMLElement): void {
		super.render(container);
		this.updateClass();
	}

	protected override updateClass(): void {
		super.updateClass();
		if (this.element && this.dropdownMenuActionViewItem && this.dropdownMenuActionViewItem.element) {
			this.element.classList.toggle('empty', (<ActionWithDropDownAction>this._action).menuActions.length === 0);
			this.dropdownMenuActionViewItem.element.classList.toggle('hide', (<ActionWithDropDownAction>this._action).menuActions.length === 0);
		}
	}

}

export abstract class ExtensionDropDownAction extends ExtensionAction {

	constructor(
		id: string,
		label: string,
		cssClass: string,
		enabled: boolean,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(id, label, cssClass, enabled);
	}

	private _actionViewItem: DropDownMenuActionViewItem | null = null;
	createActionViewItem(): DropDownMenuActionViewItem {
		this._actionViewItem = this.instantiationService.createInstance(DropDownMenuActionViewItem, this);
		return this._actionViewItem;
	}

	public override run({ actionGroups, disposeActionsOnHide }: { actionGroups: IAction[][]; disposeActionsOnHide: boolean }): Promise<any> {
		this._actionViewItem?.showMenu(actionGroups, disposeActionsOnHide);
		return Promise.resolve();
	}
}

export class DropDownMenuActionViewItem extends ActionViewItem {

	constructor(action: ExtensionDropDownAction,
		@IContextMenuService private readonly contextMenuService: IContextMenuService
	) {
		super(null, action, { icon: true, label: true });
	}

	public showMenu(menuActionGroups: IAction[][], disposeActionsOnHide: boolean): void {
		if (this.element) {
			const actions = this.getActions(menuActionGroups);
			const elementPosition = DOM.getDomNodePagePosition(this.element);
			const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
			this.contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => actions,
				actionRunner: this.actionRunner,
				onHide: () => { if (disposeActionsOnHide) { disposeIfDisposable(actions); } }
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
		const menuService = accessor.get(IMenuService);
		const extensionRecommendationsService = accessor.get(IExtensionRecommendationsService);
		const extensionIgnoredRecommendationsService = accessor.get(IExtensionIgnoredRecommendationsService);
		const workbenchThemeService = accessor.get(IWorkbenchThemeService);
		const cksOverlay: [string, any][] = [];

		if (extension) {
			cksOverlay.push(['extension', extension.identifier.id]);
			cksOverlay.push(['isBuiltinExtension', extension.isBuiltin]);
			cksOverlay.push(['isDefaultApplicationScopedExtension', extension.local && isApplicationScopedExtension(extension.local.manifest)]);
			cksOverlay.push(['isApplicationScopedExtension', extension.local && extension.local.isApplicationScoped]);
			cksOverlay.push(['extensionHasConfiguration', extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.configuration]);
			cksOverlay.push(['extensionHasKeybindings', extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.keybindings]);
			cksOverlay.push(['extensionHasCommands', extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes?.commands]);
			cksOverlay.push(['isExtensionRecommended', !!extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]]);
			cksOverlay.push(['isExtensionWorkspaceRecommended', extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]?.reasonId === ExtensionRecommendationReason.Workspace]);
			cksOverlay.push(['isUserIgnoredRecommendation', extensionIgnoredRecommendationsService.globalIgnoredRecommendations.some(e => e === extension.identifier.id.toLowerCase())]);
			if (extension.state === ExtensionState.Installed) {
				cksOverlay.push(['extensionStatus', 'installed']);
			}
			cksOverlay.push(['installedExtensionIsPreReleaseVersion', !!extension.local?.isPreReleaseVersion]);
			cksOverlay.push(['installedExtensionIsOptedTpPreRelease', !!extension.local?.preRelease]);
			cksOverlay.push(['galleryExtensionIsPreReleaseVersion', !!extension.gallery?.properties.isPreReleaseVersion]);
			cksOverlay.push(['extensionHasPreReleaseVersion', extension.hasPreReleaseVersion]);
			cksOverlay.push(['extensionHasReleaseVersion', extension.hasReleaseVersion]);

			const [colorThemes, fileIconThemes, productIconThemes] = await Promise.all([workbenchThemeService.getColorThemes(), workbenchThemeService.getFileIconThemes(), workbenchThemeService.getProductIconThemes()]);
			cksOverlay.push(['extensionHasColorThemes', colorThemes.some(theme => isThemeFromExtension(theme, extension))]);
			cksOverlay.push(['extensionHasFileIconThemes', fileIconThemes.some(theme => isThemeFromExtension(theme, extension))]);
			cksOverlay.push(['extensionHasProductIconThemes', productIconThemes.some(theme => isThemeFromExtension(theme, extension))]);

			cksOverlay.push(['canSetLanguage', extensionsWorkbenchService.canSetLanguage(extension)]);
			cksOverlay.push(['isActiveLanguagePackExtension', extension.gallery && language === getLocale(extension.gallery)]);
		}

		const menu = menuService.createMenu(MenuId.ExtensionContext, contextKeyService.createOverlay(cksOverlay));
		const actionsGroups = menu.getActions({ shouldForwardArgs: true });
		menu.dispose();
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

export class ManageExtensionAction extends ExtensionDropDownAction {

	static readonly ID = 'extensions.manage';

	private static readonly Class = `${ExtensionAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
	private static readonly HideManageExtensionClass = `${ManageExtensionAction.Class} hide`;

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
		const themeActions: IAction[] = [], installActions: IAction[] = [], otherActionGroups: IAction[][] = [];
		for (const [group, actions] of contextMenuActionsGroups) {
			if (group === INSTALL_ACTIONS_GROUP) {
				installActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
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
		groups.push([
			...(installActions.length ? installActions : []),
			this.instantiationService.createInstance(InstallAnotherVersionAction),
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
		return super.run({ actionGroups: await this.getActionGroups(), disposeActionsOnHide: true });
	}

	update(): void {
		this.class = ManageExtensionAction.HideManageExtensionClass;
		this.enabled = false;
		if (this.extension) {
			const state = this.extension.state;
			this.enabled = state === ExtensionState.Installed;
			this.class = this.enabled || state === ExtensionState.Uninstalling ? ManageExtensionAction.Class : ManageExtensionAction.HideManageExtensionClass;
			this.tooltip = state === ExtensionState.Uninstalling ? localize('ManageExtensionAction.uninstallingTooltip', "Uninstalling") : '';
		}
	}
}

export class ExtensionEditorManageExtensionAction extends ExtensionDropDownAction {

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
		return super.run({ actionGroups, disposeActionsOnHide: true });
	}

}

export class MenuItemExtensionAction extends ExtensionAction {

	constructor(
		private readonly action: IAction,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(action.id, action.label);
	}

	update() {
		if (!this.extension) {
			return;
		}
		if (this.action.id === TOGGLE_IGNORE_EXTENSION_ACTION_ID) {
			this.checked = !this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
		} else {
			this.checked = this.action.checked;
		}
	}

	override async run(): Promise<void> {
		if (this.extension) {
			await this.action.run(this.extension.local ? getExtensionId(this.extension.local.manifest.publisher, this.extension.local.manifest.name)
				: this.extension.gallery ? getExtensionId(this.extension.gallery.publisher, this.extension.gallery.name)
					: this.extension.identifier.id);
		}
	}
}

export class SwitchToPreReleaseVersionAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.switchToPreReleaseVersion';
	static readonly TITLE = { value: localize('switch to pre-release version', "Switch to Pre-Release Version"), original: 'Switch to  Pre-Release Version' };

	constructor(
		icon: boolean,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(SwitchToPreReleaseVersionAction.ID, icon ? '' : SwitchToPreReleaseVersionAction.TITLE.value, `${icon ? ExtensionAction.ICON_ACTION_CLASS + ' ' + ThemeIcon.asClassName(preReleaseIcon) : ExtensionAction.LABEL_ACTION_CLASS} hide-when-disabled switch-to-prerelease`, true);
		this.tooltip = localize('switch to pre-release version tooltip', "Switch to Pre-Release version of this extension");
		this.update();
	}

	update(): void {
		this.enabled = !!this.extension && !this.extension.isBuiltin && !this.extension.local?.isPreReleaseVersion && !this.extension.local?.preRelease && this.extension.hasPreReleaseVersion && this.extension.state === ExtensionState.Installed;
	}

	override async run(): Promise<any> {
		if (!this.enabled) {
			return;
		}
		return this.commandService.executeCommand(SwitchToPreReleaseVersionAction.ID, this.extension?.identifier.id);
	}
}

export class SwitchToReleasedVersionAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.switchToReleaseVersion';
	static readonly TITLE = { value: localize('switch to release version', "Switch to Release Version"), original: 'Switch to Release Version' };

	constructor(
		icon: boolean,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(SwitchToReleasedVersionAction.ID, icon ? '' : SwitchToReleasedVersionAction.TITLE.value, `${icon ? ExtensionAction.ICON_ACTION_CLASS + ' ' + ThemeIcon.asClassName(preReleaseIcon) : ExtensionAction.LABEL_ACTION_CLASS} hide-when-disabled switch-to-released`);
		this.tooltip = localize('switch to release version tooltip', "Switch to Release version of this extension");
		this.update();
	}

	update(): void {
		this.enabled = !!this.extension && !this.extension.isBuiltin && this.extension.state === ExtensionState.Installed && !!this.extension.local?.isPreReleaseVersion && !!this.extension.hasReleaseVersion;
	}

	override async run(): Promise<any> {
		if (!this.enabled) {
			return;
		}
		return this.commandService.executeCommand(SwitchToReleasedVersionAction.ID, this.extension?.identifier.id);
	}
}

export class InstallAnotherVersionAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.install.anotherVersion';
	static readonly LABEL = localize('install another version', "Install Another Version...");

	constructor(
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IDialogService private readonly dialogService: IDialogService,
	) {
		super(InstallAnotherVersionAction.ID, InstallAnotherVersionAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
		this.update();
	}

	update(): void {
		this.enabled = !!this.extension && !this.extension.isBuiltin && !!this.extension.gallery && !!this.extension.local && !!this.extension.server && this.extension.state === ExtensionState.Installed && !this.extension.deprecationInfo;
	}

	override async run(): Promise<any> {
		if (!this.enabled) {
			return;
		}
		const targetPlatform = await this.extension!.server!.extensionManagementService.getTargetPlatform();
		const allVersions = await this.extensionGalleryService.getAllCompatibleVersions(this.extension!.gallery!, this.extension!.local!.preRelease, targetPlatform);
		if (!allVersions.length) {
			await this.dialogService.info(localize('no versions', "This extension has no other versions."));
			return;
		}

		const picks = allVersions.map((v, i) => {
			return {
				id: v.version,
				label: v.version,
				description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${localize('pre-release', "pre-release")})` : ''}${v.version === this.extension!.version ? ` (${localize('current', "current")})` : ''}`,
				latest: i === 0,
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
			if (this.extension!.version === pick.id) {
				return;
			}
			try {
				if (pick.latest) {
					await this.extensionsWorkbenchService.install(this.extension!, { installPreReleaseVersion: pick.isPreReleaseVersion });
				} else {
					await this.extensionsWorkbenchService.installVersion(this.extension!, pick.id, { installPreReleaseVersion: pick.isPreReleaseVersion });
				}
			} catch (error) {
				this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension!, pick.latest ? this.extension!.latestVersion : pick.id, InstallOperation.Install, error).run();
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
		if (this.extension && this.extension.local) {
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
		if (this.extension && this.extension.local) {
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
		if (this.extension && this.extension.local && this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier) && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY)) {
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
		if (this.extension && this.extension.local && this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier))) {
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

export class EnableDropDownAction extends ActionWithDropDownAction {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.enable', localize('enableAction', "Enable"), [
			[
				instantiationService.createInstance(EnableGloballyAction),
				instantiationService.createInstance(EnableForWorkspaceAction)
			]
		]);
	}
}

export class DisableDropDownAction extends ActionWithDropDownAction {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('extensions.disable', localize('disableAction', "Disable"), [[
			instantiationService.createInstance(DisableGloballyAction),
			instantiationService.createInstance(DisableForWorkspaceAction)
		]]);
	}

}

export class ReloadAction extends ExtensionAction {

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} reload`;
	private static readonly DisabledClass = `${ReloadAction.EnabledClass} disabled`;

	updateWhenCounterExtensionChanges: boolean = true;

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IExtensionService private readonly extensionService: IExtensionService,
	) {
		super('extensions.reload', localize('reloadAction', "Reload"), ReloadAction.DisabledClass, false);
		this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
		this.update();
	}

	update(): void {
		this.enabled = false;
		this.tooltip = '';
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

		const reloadTooltip = this.extension.reloadRequiredStatus;
		this.enabled = reloadTooltip !== undefined;
		this.label = reloadTooltip !== undefined ? localize('reload required', 'Reload Required') : '';
		this.tooltip = reloadTooltip !== undefined ? reloadTooltip : '';

		this.class = this.enabled ? ReloadAction.EnabledClass : ReloadAction.DisabledClass;
	}

	override run(): Promise<any> {
		return Promise.resolve(this.hostService.reload());
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
		picks.push(<IQuickPickSeparator>{ type: 'separator', label: localize('current', "current") });
		picks.push(<IQuickPickItem>{ label: currentTheme.label, id: currentTheme.id });
	}
	return picks;
}

export class SetColorThemeAction extends ExtensionAction {

	static readonly ID = 'workbench.extensions.action.setColorTheme';
	static readonly TITLE = { value: localize('workbench.extensions.action.setColorTheme', "Set Color Theme"), original: 'Set Color Theme' };

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
	private static readonly DisabledClass = `${SetColorThemeAction.EnabledClass} disabled`;

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
	static readonly TITLE = { value: localize('workbench.extensions.action.setFileIconTheme', "Set File Icon Theme"), original: 'Set File Icon Theme' };

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
	private static readonly DisabledClass = `${SetFileIconThemeAction.EnabledClass} disabled`;

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
	static readonly TITLE = { value: localize('workbench.extensions.action.setProductIconTheme', "Set Product Icon Theme"), original: 'Set Product Icon Theme' };

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
	private static readonly DisabledClass = `${SetProductIconThemeAction.EnabledClass} disabled`;

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
	static readonly TITLE = { value: localize('workbench.extensions.action.setDisplayLanguage', "Set Display Language"), original: 'Set Display Language' };

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
	private static readonly DisabledClass = `${SetLanguageAction.EnabledClass} disabled`;

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
	static readonly TITLE = { value: localize('workbench.extensions.action.clearLanguage', "Clear Display Language"), original: 'Clear Display Language' };

	private static readonly EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
	private static readonly DisabledClass = `${ClearLanguageAction.EnabledClass} disabled`;

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
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(ShowRecommendedExtensionAction.ID, ShowRecommendedExtensionAction.LABEL, undefined, false);
		this.extensionId = extensionId;
	}

	override async run(): Promise<any> {
		const paneComposite = await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
		const paneContainer = paneComposite?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		paneContainer.search(`@id:${this.extensionId}`);
		paneContainer.focus();
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
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsWorkbenchService private readonly extensionWorkbenchService: IExtensionsWorkbenchService,
	) {
		super(InstallRecommendedExtensionAction.ID, InstallRecommendedExtensionAction.LABEL, undefined, false);
		this.extensionId = extensionId;
	}

	override async run(): Promise<any> {
		const viewlet = await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true);
		const viewPaneContainer = viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		viewPaneContainer.search(`@id:${this.extensionId}`);
		viewPaneContainer.focus();
		const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: 'install-recommendation' }, CancellationToken.None);
		if (extension) {
			await this.extensionWorkbenchService.open(extension);
			try {
				await this.extensionWorkbenchService.install(extension);
			} catch (err) {
				this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, extension.latestVersion, InstallOperation.Install, err).run();
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

export class SearchExtensionsAction extends Action {

	constructor(
		private readonly searchValue: string,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService
	) {
		super('extensions.searchExtensions', localize('search recommendations', "Search Extensions"), undefined, true);
	}

	override async run(): Promise<void> {
		const viewPaneContainer = (await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true))?.getViewPaneContainer() as IExtensionsViewPaneContainer;
		viewPaneContainer.search(this.searchValue);
		viewPaneContainer.focus();
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
					return <ITextEditorSelection>{
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
	private static readonly DISABLED_CLASS = `${ExtensionStatusLabelAction.ENABLED_CLASS} hide`;

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
				return canAddExtension() ? this.initialStatus === ExtensionState.Installed && this.version !== currentVersion ? localize('updated', "Updated") : localize('installed', "Installed") : null;
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

export class ToggleSyncExtensionAction extends ExtensionDropDownAction {

	private static readonly IGNORED_SYNC_CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncIgnoredIcon)}`;
	private static readonly SYNC_CLASS = `${ToggleSyncExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncEnabledIcon)}`;

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
		return super.run({
			actionGroups: [
				[
					new Action(
						'extensions.syncignore',
						this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension!) ? localize('sync', "Sync this extension") : localize('do not sync', "Do not sync this extension")
						, undefined, true, () => this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(this.extension!))
				]
			], disposeActionsOnHide: true
		});
	}
}

export type ExtensionStatus = { readonly message: IMarkdownString; readonly icon?: ThemeIcon };

export class ExtensionStatusAction extends ExtensionAction {

	private static readonly CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-status`;

	updateWhenCounterExtensionChanges: boolean = true;

	private _status: ExtensionStatus | undefined;
	get status(): ExtensionStatus | undefined { return this._status; }

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
		@IWorkbenchExtensionEnablementService private readonly workbenchExtensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super('extensions.status', '', `${ExtensionStatusAction.CLASS} hide`, false);
		this._register(this.labelService.onDidChangeFormatters(() => this.update(), this));
		this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
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

		if (this.extension.gallery && this.extension.state === ExtensionState.Uninstalled && !await this.extensionsWorkbenchService.canInstall(this.extension)) {
			if (this.extensionManagementServerService.localExtensionManagementServer || this.extensionManagementServerService.remoteExtensionManagementServer) {
				const targetPlatform = await (this.extensionManagementServerService.localExtensionManagementServer ? this.extensionManagementServerService.localExtensionManagementServer!.extensionManagementService.getTargetPlatform() : this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.getTargetPlatform());
				const message = new MarkdownString(`${localize('incompatible platform', "The '{0}' extension is not available in {1} for {2}.", this.extension.displayName || this.extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform))} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-platform-specific-extensions)`);
				this.updateStatus({ icon: warningIcon, message }, true);
				return;
			}

			if (this.extensionManagementServerService.webExtensionManagementServer) {
				const productName = localize('VS Code for Web', "{0} for the Web", this.productService.nameLong);
				const message = new MarkdownString(`${localize('not web tooltip', "The '{0}' extension is not available in {1}.", this.extension.displayName || this.extension.identifier.id, productName)} [${localize('learn why', "Learn Why")}](https://aka.ms/vscode-web-extensions-guide)`);
				this.updateStatus({ icon: warningIcon, message }, true);
				return;
			}
		}

		if (!this.extension.local ||
			!this.extension.server ||
			this.extension.state !== ExtensionState.Installed
		) {
			return;
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

		// Extension is disabled by untrusted workspace
		if (this.extension.enablementState === EnablementState.DisabledByTrustRequirement ||
			// All disabled dependencies of the extension are disabled by untrusted workspace
			(this.extension.enablementState === EnablementState.DisabledByExtensionDependency && this.workbenchExtensionEnablementService.getDependenciesEnablementStates(this.extension.local).every(([, enablementState]) => this.workbenchExtensionEnablementService.isEnabledEnablementState(enablementState) || enablementState === EnablementState.DisabledByTrustRequirement))) {
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
							message = new MarkdownString(`${localize('Install in remote server to enable', "This extension is disabled in this workspace because it is defined to run in the Remote Extension Host. Please install the extension in '{0}' to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`);
						}
					}
				}
				// Extension on Remote Server
				else if (this.extensionManagementServerService.remoteExtensionManagementServer === this.extension.server) {
					if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
						if (this.extensionManagementServerService.localExtensionManagementServer) {
							message = new MarkdownString(`${localize('Install in local server to enable', "This extension is disabled in this workspace because it is defined to run in the Local Extension Host. Please install the extension locally to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`);
						} else if (isWeb) {
							message = new MarkdownString(`${localize('Defined to run in desktop', "This extension is disabled because it is defined to run only in {0} for the Desktop.", this.productService.nameLong)} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`);
						}
					}
				}
				// Extension on Web Server
				else if (this.extensionManagementServerService.webExtensionManagementServer === this.extension.server) {
					message = new MarkdownString(`${localize('Cannot be enabled', "This extension is disabled because it is not supported in {0} for the Web.", this.productService.nameLong)} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`);
				}
				if (message) {
					this.updateStatus({ icon: warningIcon, message }, true);
				}
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
				if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local!.manifest)) {
					this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize('enabled remotely', "This extension is enabled in the Remote Extension Host because it prefers to run there.")} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`) }, true);
				}
				return;
			}

			if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
				if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local!.manifest)) {
					this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize('enabled locally', "This extension is enabled in the Local Extension Host because it prefers to run there.")} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`) }, true);
				}
				return;
			}

			if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.webExtensionManagementServer) {
				if (this.extensionManifestPropertiesService.canExecuteOnWeb(this.extension.local!.manifest)) {
					this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize('enabled in web worker', "This extension is enabled in the Web Worker Extension Host because it prefers to run there.")} [${localize('learn more', "Learn More")}](https://aka.ms/vscode-remote/developing-extensions/architecture)`) }, true);
				}
				return;
			}
		}

		// Extension is disabled by its dependency
		if (this.extension.enablementState === EnablementState.DisabledByExtensionDependency) {
			this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize('extension disabled because of dependency', "This extension has been disabled because it depends on an extension that is disabled.")) }, true);
			return;
		}

		const isEnabled = this.workbenchExtensionEnablementService.isEnabled(this.extension.local);
		const isRunning = this.extensionService.extensions.some(e => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension!.identifier));

		if (isEnabled && isRunning) {
			if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
				if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
					this.updateStatus({ message: new MarkdownString(localize('extension enabled on remote', "Extension is enabled on '{0}'", this.extension.server.label)) }, true);
					return;
				}
			}
			if (this.extension.enablementState === EnablementState.EnabledGlobally) {
				this.updateStatus({ message: new MarkdownString(localize('globally enabled', "This extension is enabled globally.")) }, true);
				return;
			}
			if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
				this.updateStatus({ message: new MarkdownString(localize('workspace enabled', "This extension is enabled for this workspace by the user.")) }, true);
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

		if (isEnabled && !isRunning && !this.extension.local.isValid) {
			const errors = this.extension.local.validations.filter(([severity]) => severity === Severity.Error).map(([, message]) => message);
			this.updateStatus({ icon: errorIcon, message: new MarkdownString(errors.join(' ').trim()) }, true);
		}

	}

	private updateStatus(status: ExtensionStatus | undefined, updateClass: boolean): void {
		if (this._status === status) {
			return;
		}
		if (this._status && status && this._status.message === status.message && this._status.icon?.id === status.icon?.id) {
			return;
		}
		this._status = status;
		if (updateClass) {
			if (this._status?.icon === errorIcon) {
				this.class = `${ExtensionStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
			}
			else if (this._status?.icon === warningIcon) {
				this.class = `${ExtensionStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
			}
			else if (this._status?.icon === infoIcon) {
				this.class = `${ExtensionStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
			}
			else if (this._status?.icon === trustIcon) {
				this.class = `${ExtensionStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
			}
			else {
				this.class = `${ExtensionStatusAction.CLASS} hide`;
			}
		}
		this._onDidChangeStatus.fire();
	}

	override async run(): Promise<any> {
		if (this._status?.icon === trustIcon) {
			return this.commandService.executeCommand('workbench.trust.manage');
		}
	}
}

export class ReinstallAction extends Action {

	static readonly ID = 'workbench.extensions.action.reinstall';
	static readonly LABEL = localize('reinstall', "Reinstall Extension...");

	constructor(
		id: string = ReinstallAction.ID, label: string = ReinstallAction.LABEL,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@INotificationService private readonly notificationService: INotificationService,
		@IHostService private readonly hostService: IHostService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionService private readonly extensionService: IExtensionService
	) {
		super(id, label);
	}

	override get enabled(): boolean {
		return this.extensionsWorkbenchService.local.filter(l => !l.isBuiltin && l.local).length > 0;
	}

	override run(): Promise<any> {
		return this.quickInputService.pick(this.getEntries(), { placeHolder: localize('selectExtensionToReinstall', "Select Extension to Reinstall") })
			.then(pick => pick && this.reinstallExtension(pick.extension));
	}

	private getEntries(): Promise<(IQuickPickItem & { extension: IExtension })[]> {
		return this.extensionsWorkbenchService.queryLocal()
			.then(local => {
				const entries = local
					.filter(extension => !extension.isBuiltin && extension.server !== this.extensionManagementServerService.webExtensionManagementServer)
					.map(extension => {
						return {
							id: extension.identifier.id,
							label: extension.displayName,
							description: extension.identifier.id,
							extension,
						} as (IQuickPickItem & { extension: IExtension });
					});
				return entries;
			});
	}

	private reinstallExtension(extension: IExtension): Promise<void> {
		return this.instantiationService.createInstance(SearchExtensionsAction, '@installed ').run()
			.then(() => {
				return this.extensionsWorkbenchService.reinstall(extension)
					.then(extension => {
						const requireReload = !(extension.local && this.extensionService.canAddExtension(toExtensionDescription(extension.local)));
						const message = requireReload ? localize('ReinstallAction.successReload', "Please reload Visual Studio Code to complete reinstalling the extension {0}.", extension.identifier.id)
							: localize('ReinstallAction.success', "Reinstalling the extension {0} is completed.", extension.identifier.id);
						const actions = requireReload ? [{
							label: localize('InstallVSIXAction.reloadNow', "Reload Now"),
							run: () => this.hostService.reload()
						}] : [];
						this.notificationService.prompt(
							Severity.Info,
							message,
							actions,
							{ sticky: true }
						);
					}, error => this.notificationService.error(error));
			});
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
			const action = this.instantiationService.createInstance(InstallAnotherVersionAction);
			action.extension = extensionPick.extension;
			await action.run();
			await this.instantiationService.createInstance(SearchExtensionsAction, extensionPick.extension.identifier.id).run();
		}
	}

	private isEnabled(extension: IExtension): boolean {
		const action = this.instantiationService.createInstance(InstallAnotherVersionAction);
		action.extension = extension;
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
			const localExtensionsToInstall = selectedItems.filter(r => !!r.extension).map(r => r.extension!);
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
	const paneCompositeService = accessor.get(IPaneCompositePartService);

	return paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true)
		.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
		.then(viewlet => {
			viewlet.search(`ext:${fileExtension.replace(/^\./, '')}`);
			viewlet.focus();
		});
});

CommandsRegistry.registerCommand('workbench.extensions.action.showExtensionsWithIds', function (accessor: ServicesAccessor, extensionIds: string[]) {
	const paneCompositeService = accessor.get(IPaneCompositePartService);

	return paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar, true)
		.then(viewlet => viewlet?.getViewPaneContainer() as IExtensionsViewPaneContainer)
		.then(viewlet => {
			const query = extensionIds
				.map(id => `@id:${id}`)
				.join(' ');
			viewlet.search(query);
			viewlet.focus();
		});
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

registerColor('extensionButton.separator', {
	dark: buttonSeparator,
	light: buttonSeparator,
	hcDark: buttonSeparator,
	hcLight: buttonSeparator
}, localize('extensionButtonSeparator', "Button separator color for extension actions"));

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
