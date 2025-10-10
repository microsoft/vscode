/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/workspaceTrustEditor.css';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from '../../../../platform/workspace/common/workspaceTrust.js';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ContextKeyExpr, IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { IEditorPaneRegistry, EditorPaneDescriptor } from '../../../browser/editor.js';
import { shieldIcon, WorkspaceTrustEditor } from './workspaceTrustEditor.js';
import { WorkspaceTrustEditorInput } from '../../../services/workspaces/browser/workspaceTrustEditorInput.js';
import { WORKSPACE_TRUST_BANNER, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_UNTRUSTED_FILES } from '../../../services/workspaces/common/workspaceTrust.js';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { isEmptyWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceContextService, IWorkspaceFoldersWillChangeEvent, toWorkspaceIdentifier, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { dirname, resolve } from '../../../../base/common/path.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IBannerItem, IBannerService } from '../../../services/banner/browser/bannerService.js';
import { isVirtualWorkspace } from '../../../../platform/workspace/common/virtualWorkspace.js';
import { LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from '../../extensions/common/extensions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { WORKSPACE_TRUST_SETTING_TAG } from '../../preferences/common/preferences.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { ILabelService, Verbosity } from '../../../../platform/label/common/label.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from '../common/workspace.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IRemoteAgentService } from '../../../services/remote/common/remoteAgentService.js';
import { securityConfigurationNodeBase } from '../../../common/configuration.js';
import { basename, dirname as uriDirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';

const BANNER_RESTRICTED_MODE = 'workbench.banner.restrictedMode';
const STARTUP_PROMPT_SHOWN_KEY = 'workspace.trust.startupPrompt.shown';
const BANNER_RESTRICTED_MODE_DISMISSED_KEY = 'workbench.banner.restrictedMode.dismissed';

export class WorkspaceTrustContextKeys extends Disposable implements IWorkbenchContribution {

	private readonly _ctxWorkspaceTrustEnabled: IContextKey<boolean>;
	private readonly _ctxWorkspaceTrustState: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkspaceTrustEnablementService workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService
	) {
		super();

		this._ctxWorkspaceTrustEnabled = WorkspaceTrustContext.IsEnabled.bindTo(contextKeyService);
		this._ctxWorkspaceTrustEnabled.set(workspaceTrustEnablementService.isWorkspaceTrustEnabled());

		this._ctxWorkspaceTrustState = WorkspaceTrustContext.IsTrusted.bindTo(contextKeyService);
		this._ctxWorkspaceTrustState.set(workspaceTrustManagementService.isWorkspaceTrusted());

		this._register(workspaceTrustManagementService.onDidChangeTrust(trusted => this._ctxWorkspaceTrustState.set(trusted)));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustContextKeys, LifecyclePhase.Restored);


/*
 * Trust Request via Service UX handler
 */

export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.workspaceTrustRequestHandler';

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService) {
		super();

		this.registerListeners();
	}

	private get useWorkspaceLanguage(): boolean {
		return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
	}

	private registerListeners(): void {

		// Open files trust request
		this._register(this.workspaceTrustRequestService.onDidInitiateOpenFilesTrustRequest(async () => {
			await this.workspaceTrustManagementService.workspaceResolved;

			// Details
			const markdownDetails = [
				this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ?
					localize('openLooseFileWorkspaceDetails', "You are trying to open untrusted files in a workspace which is trusted.") :
					localize('openLooseFileWindowDetails', "You are trying to open untrusted files in a window which is trusted."),
				localize('openLooseFileLearnMore', "If you don't want to open untrusted files, we recommend to open them in Restricted Mode in a new window as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")
			];

			// Dialog
			await this.dialogService.prompt<void>({
				type: Severity.Info,
				message: this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ?
					localize('openLooseFileWorkspaceMesssage', "Do you want to allow untrusted files in this workspace?") :
					localize('openLooseFileWindowMesssage', "Do you want to allow untrusted files in this window?"),
				buttons: [
					{
						label: localize({ key: 'open', comment: ['&& denotes a mnemonic'] }, "&&Open"),
						run: ({ checkboxChecked }) => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Open, !!checkboxChecked)
					},
					{
						label: localize({ key: 'newWindow', comment: ['&& denotes a mnemonic'] }, "Open in &&Restricted Mode"),
						run: ({ checkboxChecked }) => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.OpenInNewWindow, !!checkboxChecked)
					}
				],
				cancelButton: {
					run: () => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Cancel)
				},
				checkbox: {
					label: localize('openLooseFileWorkspaceCheckbox', "Remember my decision for all workspaces"),
					checked: false
				},
				custom: {
					icon: Codicon.shield,
					markdownDetails: markdownDetails.map(md => { return { markdown: new MarkdownString(md) }; })
				}
			});
		}));

		// Workspace trust request
		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(async requestOptions => {
			await this.workspaceTrustManagementService.workspaceResolved;

			// Title
			const message = this.useWorkspaceLanguage ?
				localize('workspaceTrust', "Do you trust the authors of the files in this workspace?") :
				localize('folderTrust', "Do you trust the authors of the files in this folder?");

			// Message
			const defaultDetails = localize('immediateTrustRequestMessage', "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.");
			const details = requestOptions?.message ?? defaultDetails;

			// Buttons
			const buttons = requestOptions?.buttons ?? [
				{ label: this.useWorkspaceLanguage ? localize({ key: 'grantWorkspaceTrustButton', comment: ['&& denotes a mnemonic'] }, "&&Trust Workspace & Continue") : localize({ key: 'grantFolderTrustButton', comment: ['&& denotes a mnemonic'] }, "&&Trust Folder & Continue"), type: 'ContinueWithTrust' },
				{ label: localize({ key: 'manageWorkspaceTrustButton', comment: ['&& denotes a mnemonic'] }, "&&Manage"), type: 'Manage' }
			];

			// Add Cancel button if not provided
			if (!buttons.some(b => b.type === 'Cancel')) {
				buttons.push({ label: localize('cancelWorkspaceTrustButton', "Cancel"), type: 'Cancel' });
			}

			// Dialog
			const { result } = await this.dialogService.prompt({
				type: Severity.Info,
				message,
				custom: {
					icon: Codicon.shield,
					markdownDetails: [
						{ markdown: new MarkdownString(details) },
						{ markdown: new MarkdownString(localize('immediateTrustRequestLearnMore', "If you don't trust the authors of these files, we do not recommend continuing as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")) }
					]
				},
				buttons: buttons.filter(b => b.type !== 'Cancel').map(button => {
					return {
						label: button.label,
						run: () => button.type
					};
				}),
				cancelButton: (() => {
					const cancelButton = buttons.find(b => b.type === 'Cancel');
					if (!cancelButton) {
						return undefined;
					}

					return {
						label: cancelButton.label,
						run: () => cancelButton.type
					};
				})()
			});


			// Dialog result
			switch (result) {
				case 'ContinueWithTrust':
					await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
					break;
				case 'ContinueWithoutTrust':
					await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(undefined);
					break;
				case 'Manage':
					this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
					await this.commandService.executeCommand(MANAGE_TRUST_COMMAND_ID);
					break;
				case 'Cancel':
					this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
					break;
			}
		}));
	}
}


/*
 * Trust UX and Startup Handler
 */
export class WorkspaceTrustUXHandler extends Disposable implements IWorkbenchContribution {

	private readonly entryId = `status.workspaceTrust`;

	private readonly statusbarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor>;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IBannerService private readonly bannerService: IBannerService,
		@ILabelService private readonly labelService: ILabelService,
		@IHostService private readonly hostService: IHostService,
		@IProductService private readonly productService: IProductService,
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();

		this.statusbarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

		(async () => {

			await this.workspaceTrustManagementService.workspaceTrustInitialized;

			if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
				this.registerListeners();
				this.updateStatusbarEntry(this.workspaceTrustManagementService.isWorkspaceTrusted());

				// Show modal dialog
				if (this.hostService.hasFocus) {
					this.showModalOnStart();
				} else {
					const focusDisposable = this.hostService.onDidChangeFocus(focused => {
						if (focused) {
							focusDisposable.dispose();
							this.showModalOnStart();
						}
					});
				}
			}
		})();
	}

	private registerListeners(): void {
		this._register(this.workspaceContextService.onWillChangeWorkspaceFolders(e => {
			if (e.fromCache) {
				return;
			}
			if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
				return;
			}

			const addWorkspaceFolder = async (e: IWorkspaceFoldersWillChangeEvent): Promise<void> => {
				const trusted = this.workspaceTrustManagementService.isWorkspaceTrusted();

				// Workspace is trusted and there are added/changed folders
				if (trusted && (e.changes.added.length || e.changes.changed.length)) {
					const addedFoldersTrustInfo = await Promise.all(e.changes.added.map(folder => this.workspaceTrustManagementService.getUriTrustInfo(folder.uri)));

					if (!addedFoldersTrustInfo.map(info => info.trusted).every(trusted => trusted)) {
						const { confirmed } = await this.dialogService.confirm({
							type: Severity.Info,
							message: localize('addWorkspaceFolderMessage', "Do you trust the authors of the files in this folder?"),
							detail: localize('addWorkspaceFolderDetail', "You are adding files that are not currently trusted to a trusted workspace. Do you trust the authors of these new files?"),
							cancelButton: localize('no', 'No'),
							custom: { icon: Codicon.shield }
						});

						// Mark added/changed folders as trusted
						await this.workspaceTrustManagementService.setUrisTrust(addedFoldersTrustInfo.map(i => i.uri), confirmed);
					}
				}
			};

			return e.join(addWorkspaceFolder(e));
		}));

		this._register(this.workspaceTrustManagementService.onDidChangeTrust(trusted => {
			this.updateWorkbenchIndicators(trusted);
		}));

		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequestOnStartup(async () => {

			let titleString: string | undefined;
			let learnMoreString: string | undefined;
			let trustOption: string | undefined;
			let dontTrustOption: string | undefined;
			const isAiGeneratedWorkspace = await this.isAiGeneratedWorkspace();
			if (isAiGeneratedWorkspace && this.productService.aiGeneratedWorkspaceTrust) {
				titleString = this.productService.aiGeneratedWorkspaceTrust.title;
				learnMoreString = this.productService.aiGeneratedWorkspaceTrust.startupTrustRequestLearnMore;
				trustOption = this.productService.aiGeneratedWorkspaceTrust.trustOption;
				dontTrustOption = this.productService.aiGeneratedWorkspaceTrust.dontTrustOption;
			} else {
				console.warn('AI generated workspace trust dialog contents not available.');
			}

			const title = titleString ?? (this.useWorkspaceLanguage ?
				localize('workspaceTrust', "Do you trust the authors of the files in this workspace?") :
				localize('folderTrust', "Do you trust the authors of the files in this folder?"));

			let checkboxText: string | undefined;
			const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace());
			const isSingleFolderWorkspace = isSingleFolderWorkspaceIdentifier(workspaceIdentifier);
			const isEmptyWindow = isEmptyWorkspaceIdentifier(workspaceIdentifier);
			if (!isAiGeneratedWorkspace && this.workspaceTrustManagementService.canSetParentFolderTrust()) {
				const name = basename(uriDirname((workspaceIdentifier as ISingleFolderWorkspaceIdentifier).uri));
				checkboxText = localize('checkboxString', "Trust the authors of all files in the parent folder '{0}'", name);
			}

			// Show Workspace Trust Start Dialog
			this.doShowModal(
				title,
				{ label: trustOption ?? localize({ key: 'trustOption', comment: ['&& denotes a mnemonic'] }, "&&Yes, I trust the authors"), sublabel: isSingleFolderWorkspace ? localize('trustFolderOptionDescription', "Trust folder and enable all features") : localize('trustWorkspaceOptionDescription', "Trust workspace and enable all features") },
				{ label: dontTrustOption ?? localize({ key: 'dontTrustOption', comment: ['&& denotes a mnemonic'] }, "&&No, I don't trust the authors"), sublabel: isSingleFolderWorkspace ? localize('dontTrustFolderOptionDescription', "Browse folder in restricted mode") : localize('dontTrustWorkspaceOptionDescription', "Browse workspace in restricted mode") },
				[
					!isSingleFolderWorkspace ?
						localize('workspaceStartupTrustDetails', "{0} provides features that may automatically execute files in this workspace.", this.productService.nameShort) :
						localize('folderStartupTrustDetails', "{0} provides features that may automatically execute files in this folder.", this.productService.nameShort),
					learnMoreString ?? localize('startupTrustRequestLearnMore', "If you don't trust the authors of these files, we recommend to continue in restricted mode as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more."),
					!isEmptyWindow ?
						`\`${this.labelService.getWorkspaceLabel(workspaceIdentifier, { verbose: Verbosity.LONG })}\`` : '',
				],
				checkboxText
			);
		}));
	}

	private updateWorkbenchIndicators(trusted: boolean): void {
		const bannerItem = this.getBannerItem(!trusted);

		this.updateStatusbarEntry(trusted);

		if (bannerItem) {
			if (!trusted) {
				this.bannerService.show(bannerItem);
			} else {
				this.bannerService.hide(BANNER_RESTRICTED_MODE);
			}
		}
	}

	//#region Dialog

	private async doShowModal(question: string, trustedOption: { label: string; sublabel: string }, untrustedOption: { label: string; sublabel: string }, markdownStrings: string[], trustParentString?: string): Promise<void> {
		await this.dialogService.prompt({
			type: Severity.Info,
			message: question,
			checkbox: trustParentString ? {
				label: trustParentString
			} : undefined,
			buttons: [
				{
					label: trustedOption.label,
					run: async ({ checkboxChecked }) => {
						if (checkboxChecked) {
							await this.workspaceTrustManagementService.setParentFolderTrust(true);
						} else {
							await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
						}
					}
				},
				{
					label: untrustedOption.label,
					run: () => {
						this.updateWorkbenchIndicators(false);
						this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
					}
				}
			],
			custom: {
				buttonDetails: [
					trustedOption.sublabel,
					untrustedOption.sublabel
				],
				disableCloseAction: true,
				icon: Codicon.shield,
				markdownDetails: markdownStrings.map(md => { return { markdown: new MarkdownString(md) }; })
			}
		});

		this.storageService.store(STARTUP_PROMPT_SHOWN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async showModalOnStart(): Promise<void> {
		if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
			this.updateWorkbenchIndicators(true);
			return;
		}

		// Don't show modal prompt if workspace trust cannot be changed
		if (!(this.workspaceTrustManagementService.canSetWorkspaceTrust())) {
			return;
		}

		// Don't show modal prompt for virtual workspaces by default
		if (isVirtualWorkspace(this.workspaceContextService.getWorkspace())) {
			this.updateWorkbenchIndicators(false);
			return;
		}

		// Don't show modal prompt for empty workspaces by default
		if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			this.updateWorkbenchIndicators(false);
			return;
		}

		if (this.startupPromptSetting === 'never') {
			this.updateWorkbenchIndicators(false);
			return;
		}

		if (this.startupPromptSetting === 'once' && this.storageService.getBoolean(STARTUP_PROMPT_SHOWN_KEY, StorageScope.WORKSPACE, false)) {
			this.updateWorkbenchIndicators(false);
			return;
		}

		// Use the workspace trust request service to show modal dialog
		this.workspaceTrustRequestService.requestWorkspaceTrustOnStartup();
	}

	private get startupPromptSetting(): 'always' | 'once' | 'never' {
		return this.configurationService.getValue(WORKSPACE_TRUST_STARTUP_PROMPT);
	}

	private get useWorkspaceLanguage(): boolean {
		return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
	}

	private async isAiGeneratedWorkspace(): Promise<boolean> {
		const aiGeneratedWorkspaces = URI.joinPath(this.environmentService.workspaceStorageHome, 'aiGeneratedWorkspaces.json');
		return await this.fileService.exists(aiGeneratedWorkspaces).then(async result => {
			if (result) {
				try {
					const content = await this.fileService.readFile(aiGeneratedWorkspaces);
					const workspaces = JSON.parse(content.value.toString()) as string[];
					if (workspaces.indexOf(this.workspaceContextService.getWorkspace().folders[0].uri.toString()) > -1) {
						return true;
					}
				} catch (e) {
					// Ignore errors when resolving file contents
				}
			}
			return false;
		});
	}

	//#endregion

	//#region Banner

	private getBannerItem(restrictedMode: boolean): IBannerItem | undefined {
		const dismissedRestricted = this.storageService.getBoolean(BANNER_RESTRICTED_MODE_DISMISSED_KEY, StorageScope.WORKSPACE, false);

		// never show the banner
		if (this.bannerSetting === 'never') {
			return undefined;
		}

		// info has been dismissed
		if (this.bannerSetting === 'untilDismissed' && dismissedRestricted) {
			return undefined;
		}

		const actions =
			[
				{
					label: localize('restrictedModeBannerManage', "Manage"),
					href: 'command:' + MANAGE_TRUST_COMMAND_ID
				},
				{
					label: localize('restrictedModeBannerLearnMore', "Learn More"),
					href: 'https://aka.ms/vscode-workspace-trust'
				}
			];

		return {
			id: BANNER_RESTRICTED_MODE,
			icon: shieldIcon,
			ariaLabel: this.getBannerItemAriaLabels(),
			message: this.getBannerItemMessages(),
			actions,
			onClose: () => {
				if (restrictedMode) {
					this.storageService.store(BANNER_RESTRICTED_MODE_DISMISSED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
			}
		};
	}

	private getBannerItemAriaLabels(): string {
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY:
				return localize('restrictedModeBannerAriaLabelWindow', "Restricted Mode is intended for safe code browsing. Trust this window to enable all features. Use navigation keys to access banner actions.");
			case WorkbenchState.FOLDER:
				return localize('restrictedModeBannerAriaLabelFolder', "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features. Use navigation keys to access banner actions.");
			case WorkbenchState.WORKSPACE:
				return localize('restrictedModeBannerAriaLabelWorkspace', "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features. Use navigation keys to access banner actions.");
		}
	}

	private getBannerItemMessages(): string {
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY:
				return localize('restrictedModeBannerMessageWindow', "Restricted Mode is intended for safe code browsing. Trust this window to enable all features.");
			case WorkbenchState.FOLDER:
				return localize('restrictedModeBannerMessageFolder', "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features.");
			case WorkbenchState.WORKSPACE:
				return localize('restrictedModeBannerMessageWorkspace', "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features.");
		}
	}


	private get bannerSetting(): 'always' | 'untilDismissed' | 'never' {
		const result = this.configurationService.getValue<'always' | 'untilDismissed' | 'never'>(WORKSPACE_TRUST_BANNER);

		// In serverless environments, we don't need to aggressively show the banner
		if (result !== 'always' && isWeb && !this.remoteAgentService.getConnection()?.remoteAuthority) {
			return 'never';
		}

		return result;
	}

	//#endregion

	//#region Statusbar

	private getRestrictedModeStatusbarEntry(): IStatusbarEntry {
		let ariaLabel = '';
		let toolTip: IMarkdownString | string | undefined;
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY: {
				ariaLabel = localize('status.ariaUntrustedWindow', "Restricted Mode: Some features are disabled because this window is not trusted.");
				toolTip = {
					value: localize(
						{ key: 'status.tooltipUntrustedWindow2', comment: ['[abc]({n}) are links.  Only translate `features are disabled` and `window is not trusted`. Do not change brackets and parentheses or {n}'] },
						"Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [window is not trusted]({1}).",
						`command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
						`command:${MANAGE_TRUST_COMMAND_ID}`
					),
					isTrusted: true,
					supportThemeIcons: true
				};
				break;
			}
			case WorkbenchState.FOLDER: {
				ariaLabel = localize('status.ariaUntrustedFolder', "Restricted Mode: Some features are disabled because this folder is not trusted.");
				toolTip = {
					value: localize(
						{ key: 'status.tooltipUntrustedFolder2', comment: ['[abc]({n}) are links.  Only translate `features are disabled` and `folder is not trusted`. Do not change brackets and parentheses or {n}'] },
						"Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [folder is not trusted]({1}).",
						`command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
						`command:${MANAGE_TRUST_COMMAND_ID}`
					),
					isTrusted: true,
					supportThemeIcons: true
				};
				break;
			}
			case WorkbenchState.WORKSPACE: {
				ariaLabel = localize('status.ariaUntrustedWorkspace', "Restricted Mode: Some features are disabled because this workspace is not trusted.");
				toolTip = {
					value: localize(
						{ key: 'status.tooltipUntrustedWorkspace2', comment: ['[abc]({n}) are links. Only translate `features are disabled` and `workspace is not trusted`. Do not change brackets and parentheses or {n}'] },
						"Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [workspace is not trusted]({1}).",
						`command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
						`command:${MANAGE_TRUST_COMMAND_ID}`
					),
					isTrusted: true,
					supportThemeIcons: true
				};
				break;
			}
		}

		return {
			name: localize('status.WorkspaceTrust', "Workspace Trust"),
			text: `$(shield) ${localize('untrusted', "Restricted Mode")}`,
			ariaLabel: ariaLabel,
			tooltip: toolTip,
			command: MANAGE_TRUST_COMMAND_ID,
			kind: 'prominent'
		};
	}

	private updateStatusbarEntry(trusted: boolean): void {
		if (trusted && this.statusbarEntryAccessor.value) {
			this.statusbarEntryAccessor.clear();
			return;
		}

		if (!trusted && !this.statusbarEntryAccessor.value) {
			const entry = this.getRestrictedModeStatusbarEntry();
			this.statusbarEntryAccessor.value = this.statusbarService.addEntry(entry, this.entryId, StatusbarAlignment.LEFT, { location: { id: 'status.host', priority: Number.POSITIVE_INFINITY }, alignment: StatusbarAlignment.RIGHT });
		}
	}

	//#endregion
}

registerWorkbenchContribution2(WorkspaceTrustRequestHandler.ID, WorkspaceTrustRequestHandler, WorkbenchPhase.BlockRestore);
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustUXHandler, LifecyclePhase.Restored);


/**
 * Trusted Workspace GUI Editor
 */
class WorkspaceTrustEditorInputSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: WorkspaceTrustEditorInput): string {
		return '';
	}

	deserialize(instantiationService: IInstantiationService): WorkspaceTrustEditorInput {
		return instantiationService.createInstance(WorkspaceTrustEditorInput);
	}
}

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(WorkspaceTrustEditorInput.ID, WorkspaceTrustEditorInputSerializer);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		WorkspaceTrustEditor,
		WorkspaceTrustEditor.ID,
		localize('workspaceTrustEditor', "Workspace Trust Editor")
	),
	[
		new SyncDescriptor(WorkspaceTrustEditorInput)
	]
);


/*
 * Actions
 */

// Configure Workspace Trust Settings

const CONFIGURE_TRUST_COMMAND_ID = 'workbench.trust.configure';
const WORKSPACES_CATEGORY = localize2('workspacesCategory', 'Workspaces');

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_TRUST_COMMAND_ID,
			title: localize2('configureWorkspaceTrustSettings', "Configure Workspace Trust Settings"),
			precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
			category: WORKSPACES_CATEGORY,
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: `@tag:${WORKSPACE_TRUST_SETTING_TAG}` });
	}
});

// Manage Workspace Trust

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: MANAGE_TRUST_COMMAND_ID,
			title: localize2('manageWorkspaceTrust', "Manage Workspace Trust"),
			precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
			category: WORKSPACES_CATEGORY,
			f1: true,
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const input = instantiationService.createInstance(WorkspaceTrustEditorInput);

		editorService.openEditor(input, { pinned: true });
		return;
	}
});


/*
 * Configuration
 */
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		...securityConfigurationNodeBase,
		properties: {
			[WORKSPACE_TRUST_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize('workspace.trust.description', "Controls whether or not Workspace Trust is enabled within VS Code."),
				tags: [WORKSPACE_TRUST_SETTING_TAG],
				scope: ConfigurationScope.APPLICATION,
			},
			[WORKSPACE_TRUST_STARTUP_PROMPT]: {
				type: 'string',
				default: 'once',
				description: localize('workspace.trust.startupPrompt.description', "Controls when the startup prompt to trust a workspace is shown."),
				tags: [WORKSPACE_TRUST_SETTING_TAG],
				scope: ConfigurationScope.APPLICATION,
				enum: ['always', 'once', 'never'],
				enumDescriptions: [
					localize('workspace.trust.startupPrompt.always', "Ask for trust every time an untrusted workspace is opened."),
					localize('workspace.trust.startupPrompt.once', "Ask for trust the first time an untrusted workspace is opened."),
					localize('workspace.trust.startupPrompt.never', "Do not ask for trust when an untrusted workspace is opened."),
				]
			},
			[WORKSPACE_TRUST_BANNER]: {
				type: 'string',
				default: 'untilDismissed',
				description: localize('workspace.trust.banner.description', "Controls when the restricted mode banner is shown."),
				tags: [WORKSPACE_TRUST_SETTING_TAG],
				scope: ConfigurationScope.APPLICATION,
				enum: ['always', 'untilDismissed', 'never'],
				enumDescriptions: [
					localize('workspace.trust.banner.always', "Show the banner every time an untrusted workspace is open."),
					localize('workspace.trust.banner.untilDismissed', "Show the banner when an untrusted workspace is opened until dismissed."),
					localize('workspace.trust.banner.never', "Do not show the banner when an untrusted workspace is open."),
				]
			},
			[WORKSPACE_TRUST_UNTRUSTED_FILES]: {
				type: 'string',
				default: 'prompt',
				markdownDescription: localize('workspace.trust.untrustedFiles.description', "Controls how to handle opening untrusted files in a trusted workspace. This setting also applies to opening files in an empty window which is trusted via `#{0}#`.", WORKSPACE_TRUST_EMPTY_WINDOW),
				tags: [WORKSPACE_TRUST_SETTING_TAG],
				scope: ConfigurationScope.APPLICATION,
				enum: ['prompt', 'open', 'newWindow'],
				enumDescriptions: [
					localize('workspace.trust.untrustedFiles.prompt', "Ask how to handle untrusted files for each workspace. Once untrusted files are introduced to a trusted workspace, you will not be prompted again."),
					localize('workspace.trust.untrustedFiles.open', "Always allow untrusted files to be introduced to a trusted workspace without prompting."),
					localize('workspace.trust.untrustedFiles.newWindow', "Always open untrusted files in a separate window in restricted mode without prompting."),
				]
			},
			[WORKSPACE_TRUST_EMPTY_WINDOW]: {
				type: 'boolean',
				default: true,
				markdownDescription: localize('workspace.trust.emptyWindow.description', "Controls whether or not the empty window is trusted by default within VS Code. When used with `#{0}#`, you can enable the full functionality of VS Code without prompting in an empty window.", WORKSPACE_TRUST_UNTRUSTED_FILES),
				tags: [WORKSPACE_TRUST_SETTING_TAG],
				scope: ConfigurationScope.APPLICATION
			}
		}
	});

class WorkspaceTrustTelemetryContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustEnablementService private readonly workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		this.workspaceTrustManagementService.workspaceTrustInitialized
			.then(() => {
				this.logInitialWorkspaceTrustInfo();
				this.logWorkspaceTrust(this.workspaceTrustManagementService.isWorkspaceTrusted());

				this._register(this.workspaceTrustManagementService.onDidChangeTrust(isTrusted => this.logWorkspaceTrust(isTrusted)));
			});
	}

	private logInitialWorkspaceTrustInfo(): void {
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			const disabledByCliFlag = this.environmentService.disableWorkspaceTrust;

			type WorkspaceTrustDisabledEventClassification = {
				owner: 'sbatten';
				comment: 'Logged when workspace trust is disabled';
				reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The reason workspace trust is disabled. e.g. cli or setting' };
			};

			type WorkspaceTrustDisabledEvent = {
				reason: 'setting' | 'cli';
			};

			this.telemetryService.publicLog2<WorkspaceTrustDisabledEvent, WorkspaceTrustDisabledEventClassification>('workspaceTrustDisabled', {
				reason: disabledByCliFlag ? 'cli' : 'setting'
			});
			return;
		}

		type WorkspaceTrustInfoEventClassification = {
			owner: 'sbatten';
			comment: 'Information about the workspaces trusted on the machine';
			trustedFoldersCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of trusted folders on the machine' };
		};

		type WorkspaceTrustInfoEvent = {
			trustedFoldersCount: number;
		};

		this.telemetryService.publicLog2<WorkspaceTrustInfoEvent, WorkspaceTrustInfoEventClassification>('workspaceTrustFolderCounts', {
			trustedFoldersCount: this.workspaceTrustManagementService.getTrustedUris().length,
		});
	}

	private async logWorkspaceTrust(isTrusted: boolean): Promise<void> {
		if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			return;
		}

		type WorkspaceTrustStateChangedEvent = {
			workspaceId: string;
			isTrusted: boolean;
		};

		type WorkspaceTrustStateChangedEventClassification = {
			owner: 'sbatten';
			comment: 'Logged when the workspace transitions between trusted and restricted modes';
			workspaceId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'An id of the workspace' };
			isTrusted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'true if the workspace is trusted' };
		};

		this.telemetryService.publicLog2<WorkspaceTrustStateChangedEvent, WorkspaceTrustStateChangedEventClassification>('workspaceTrustStateChanged', {
			workspaceId: this.workspaceContextService.getWorkspace().id,
			isTrusted: isTrusted
		});

		if (isTrusted) {
			type WorkspaceTrustFolderInfoEventClassification = {
				owner: 'sbatten';
				comment: 'Some metrics on the trusted workspaces folder structure';
				trustedFolderDepth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of directories deep of the trusted path' };
				workspaceFolderDepth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The number of directories deep of the workspace path' };
				delta: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The difference between the trusted path and the workspace path directories depth' };
			};

			type WorkspaceTrustFolderInfoEvent = {
				trustedFolderDepth: number;
				workspaceFolderDepth: number;
				delta: number;
			};

			const getDepth = (folder: string): number => {
				let resolvedPath = resolve(folder);

				let depth = 0;
				while (dirname(resolvedPath) !== resolvedPath && depth < 100) {
					resolvedPath = dirname(resolvedPath);
					depth++;
				}

				return depth;
			};

			for (const folder of this.workspaceContextService.getWorkspace().folders) {
				const { trusted, uri } = await this.workspaceTrustManagementService.getUriTrustInfo(folder.uri);
				if (!trusted) {
					continue;
				}

				const workspaceFolderDepth = getDepth(folder.uri.fsPath);
				const trustedFolderDepth = getDepth(uri.fsPath);
				const delta = workspaceFolderDepth - trustedFolderDepth;

				this.telemetryService.publicLog2<WorkspaceTrustFolderInfoEvent, WorkspaceTrustFolderInfoEventClassification>('workspaceFolderDepthBelowTrustedFolder', { workspaceFolderDepth, trustedFolderDepth, delta });
			}
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkspaceTrustTelemetryContribution, LifecyclePhase.Restored);
