/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/workspaceTrustEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, workspaceTrustToString, WorkspaceTrustUriResponse } from 'vs/platform/workspace/common/workspaceTrust';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Codicon } from 'vs/base/common/codicons';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContextKeyExpr, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/browser/statusbar';
import { IEditorPaneRegistry, EditorPaneDescriptor } from 'vs/workbench/browser/editor';
import { shieldIcon, WorkspaceTrustEditor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustEditor';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WORKSPACE_TRUST_BANNER, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_UNTRUSTED_FILES } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IEditorSerializer, IEditorFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceContextService, IWorkspaceFoldersWillChangeEvent, toWorkspaceIdentifier, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { dirname, resolve } from 'vs/base/common/path';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IMarkdownString, MarkdownString } from 'vs/base/common/htmlContent';
import { STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { splitName } from 'vs/base/common/labels';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IBannerItem, IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { isVirtualWorkspace } from 'vs/platform/workspace/common/virtualWorkspace';
import { LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from 'vs/workbench/contrib/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { WORKSPACE_TRUST_SETTING_TAG } from 'vs/workbench/contrib/preferences/common/preferences';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { ILabelService } from 'vs/platform/label/common/label';
import { IProductService } from 'vs/platform/product/common/productService';
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from 'vs/workbench/contrib/workspace/common/workspace';
import { isWeb } from 'vs/base/common/platform';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

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

	private async registerListeners(): Promise<void> {
		await this.workspaceTrustManagementService.workspaceResolved;

		// Open files trust request
		this._register(this.workspaceTrustRequestService.onDidInitiateOpenFilesTrustRequest(async () => {
			// Details
			const markdownDetails = [
				this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ?
					localize('openLooseFileWorkspaceDetails', "You are trying to open untrusted files in a workspace which is trusted.") :
					localize('openLooseFileWindowDetails', "You are trying to open untrusted files in a window which is trusted."),
				localize('openLooseFileLearnMore', "If you don't trust the authors of these files, we recommend to open them in Restricted Mode in a new window as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")
			];

			// Dialog
			const result = await this.dialogService.show(
				Severity.Info,
				localize('openLooseFileMesssage', "Do you trust the authors of these files?"),
				[localize('open', "Open"), localize('newWindow', "Open in Restricted Mode"), localize('cancel', "Cancel")],
				{
					cancelId: 2,
					checkbox: {
						label: localize('openLooseFileWorkspaceCheckbox', "Remember my decision for all workspaces"),
						checked: false
					},
					custom: {
						icon: Codicon.shield,
						markdownDetails: markdownDetails.map(md => { return { markdown: new MarkdownString(md) }; })
					}
				});

			switch (result.choice) {
				case 0:
					await this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Open, !!result.checkboxChecked);
					break;
				case 1:
					await this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.OpenInNewWindow, !!result.checkboxChecked);
					break;
				default:
					await this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Cancel);
					break;
			}
		}));

		// Workspace trust request
		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(async requestOptions => {
			// Title
			const title = this.useWorkspaceLanguage ?
				localize('workspaceTrust', "Do you trust the authors of the files in this workspace?") :
				localize('folderTrust', "Do you trust the authors of the files in this folder?");

			// Message
			const defaultMessage = localize('immediateTrustRequestMessage', "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.");
			const message = requestOptions?.message ?? defaultMessage;

			// Buttons
			const buttons = requestOptions?.buttons ?? [
				{ label: this.useWorkspaceLanguage ? localize('grantWorkspaceTrustButton', "Trust Workspace & Continue") : localize('grantFolderTrustButton', "Trust Folder & Continue"), type: 'ContinueWithTrust' },
				{ label: localize('manageWorkspaceTrustButton', "Manage"), type: 'Manage' }
			];

			// Add Cancel button if not provided
			if (!buttons.some(b => b.type === 'Cancel')) {
				buttons.push({ label: localize('cancelWorkspaceTrustButton', "Cancel"), type: 'Cancel' });
			}

			// Dialog
			const result = await this.dialogService.show(
				Severity.Info,
				title,
				buttons.map(b => b.label),
				{
					cancelId: buttons.findIndex(b => b.type === 'Cancel'),
					custom: {
						icon: Codicon.shield,
						markdownDetails: [
							{ markdown: new MarkdownString(message) },
							{ markdown: new MarkdownString(localize('immediateTrustRequestLearnMore', "If you don't trust the authors of these files, we do not recommend continuing as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")) }
						]
					}
				}
			);


			// Dialog result
			switch (buttons[result.choice].type) {
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

	private readonly entryId = `status.workspaceTrust.${this.workspaceContextService.getWorkspace().id}`;

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
	) {
		super();

		this.statusbarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

		(async () => {

			await this.workspaceTrustManagementService.workspaceTrustInitialized;

			if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
				this.registerListeners();
				this.createStatusbarEntry();

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
						const result = await this.dialogService.show(
							Severity.Info,
							localize('addWorkspaceFolderMessage', "Do you trust the authors of the files in this folder?"),
							[localize('yes', 'Yes'), localize('no', 'No')],
							{
								detail: localize('addWorkspaceFolderDetail', "You are adding files that are not currently trusted to a trusted workspace. Do you trust the authors of these new files?"),
								cancelId: 1,
								custom: { icon: Codicon.shield }
							}
						);

						// Mark added/changed folders as trusted
						await this.workspaceTrustManagementService.setUrisTrust(addedFoldersTrustInfo.map(i => i.uri), result.choice === 0);
					}
				}
			};

			return e.join(addWorkspaceFolder(e));
		}));

		this._register(this.workspaceTrustManagementService.onDidChangeTrust(trusted => {
			this.updateWorkbenchIndicators(trusted);
		}));

		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequestOnStartup(() => {
			const title = this.useWorkspaceLanguage ?
				localize('workspaceTrust', "Do you trust the authors of the files in this workspace?") :
				localize('folderTrust', "Do you trust the authors of the files in this folder?");

			let checkboxText: string | undefined;
			const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace())!;
			const isSingleFolderWorkspace = isSingleFolderWorkspaceIdentifier(workspaceIdentifier);
			if (this.workspaceTrustManagementService.canSetParentFolderTrust()) {
				const { name } = splitName(splitName((workspaceIdentifier as ISingleFolderWorkspaceIdentifier).uri.fsPath).parentPath);
				checkboxText = localize('checkboxString', "Trust the authors of all files in the parent folder '{0}'", name);
			}

			// Show Workspace Trust Start Dialog
			this.doShowModal(
				title,
				{ label: localize('trustOption', "Yes, I trust the authors"), sublabel: isSingleFolderWorkspace ? localize('trustFolderOptionDescription', "Trust folder and enable all features") : localize('trustWorkspaceOptionDescription', "Trust workspace and enable all features") },
				{ label: localize('dontTrustOption', "No, I don't trust the authors"), sublabel: isSingleFolderWorkspace ? localize('dontTrustFolderOptionDescription', "Browse folder in restricted mode") : localize('dontTrustWorkspaceOptionDescription', "Browse workspace in restricted mode") },
				[
					!isSingleFolderWorkspace ?
						localize('workspaceStartupTrustDetails', "{0} provides features that may automatically execute files in this workspace.", this.productService.nameShort) :
						localize('folderStartupTrustDetails', "{0} provides features that may automatically execute files in this folder.", this.productService.nameShort),
					localize('startupTrustRequestLearnMore', "If you don't trust the authors of these files, we recommend to continue in restricted mode as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more."),
					`\`${this.labelService.getWorkspaceLabel(workspaceIdentifier, { verbose: true })}\``,
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
		const result = await this.dialogService.show(
			Severity.Info,
			question,
			[
				trustedOption.label,
				untrustedOption.label,
			],
			{
				checkbox: trustParentString ? {
					label: trustParentString
				} : undefined,
				custom: {
					buttonDetails: [
						trustedOption.sublabel,
						untrustedOption.sublabel
					],
					disableCloseAction: true,
					icon: Codicon.shield,
					markdownDetails: markdownStrings.map(md => { return { markdown: new MarkdownString(md) }; })
				},
			}
		);

		// Dialog result
		switch (result.choice) {
			case 0:
				if (result.checkboxChecked) {
					await this.workspaceTrustManagementService.setParentFolderTrust(true);
				} else {
					await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
				}
				break;
			case 1:
				this.updateWorkbenchIndicators(false);
				this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
				break;
		}

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

	private createStatusbarEntry(): void {
		const entry = this.getStatusbarEntry(this.workspaceTrustManagementService.isWorkspaceTrusted());
		this.statusbarEntryAccessor.value = this.statusbarService.addEntry(entry, this.entryId, StatusbarAlignment.LEFT, 0.99 * Number.MAX_VALUE /* Right of remote indicator */);
		this.statusbarService.updateEntryVisibility(this.entryId, false);
	}

	private getStatusbarEntry(trusted: boolean): IStatusbarEntry {
		const text = workspaceTrustToString(trusted);

		const backgroundColor = { id: STATUS_BAR_PROMINENT_ITEM_BACKGROUND };
		const color = { id: STATUS_BAR_PROMINENT_ITEM_FOREGROUND };

		let ariaLabel = '';
		let toolTip: IMarkdownString | string | undefined;
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY: {
				ariaLabel = trusted ? localize('status.ariaTrustedWindow', "This window is trusted.") :
					localize('status.ariaUntrustedWindow', "Restricted Mode: Some features are disabled because this window is not trusted.");
				toolTip = trusted ? ariaLabel : {
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
				ariaLabel = trusted ? localize('status.ariaTrustedFolder', "This folder is trusted.") :
					localize('status.ariaUntrustedFolder', "Restricted Mode: Some features are disabled because this folder is not trusted.");
				toolTip = trusted ? ariaLabel : {
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
				ariaLabel = trusted ? localize('status.ariaTrustedWorkspace', "This workspace is trusted.") :
					localize('status.ariaUntrustedWorkspace', "Restricted Mode: Some features are disabled because this workspace is not trusted.");
				toolTip = trusted ? ariaLabel : {
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
			text: trusted ? `$(shield)` : `$(shield) ${text}`,
			ariaLabel: ariaLabel,
			tooltip: toolTip,
			command: MANAGE_TRUST_COMMAND_ID,
			backgroundColor,
			color
		};
	}

	private updateStatusbarEntry(trusted: boolean): void {
		this.statusbarEntryAccessor.value?.update(this.getStatusbarEntry(trusted));
		this.statusbarService.updateEntryVisibility(this.entryId, !trusted);
	}

	//#endregion
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);
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

// Configure Workspace Trust

const CONFIGURE_TRUST_COMMAND_ID = 'workbench.trust.configure';
const WORKSPACES_CATEGORY = { value: localize('workspacesCategory', "Workspaces"), original: 'Workspaces' };

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: CONFIGURE_TRUST_COMMAND_ID,
			title: { original: 'Configure Workspace Trust', value: localize('configureWorkspaceTrust', "Configure Workspace Trust") },
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
			title: { original: 'Manage Workspace Trust', value: localize('manageWorkspaceTrust', "Manage Workspace Trust") },
			precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
			category: WORKSPACES_CATEGORY,
			f1: true,
			menu: {
				id: MenuId.GlobalActivity,
				group: '6_workspace_trust',
				order: 40,
				when: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true))
			},
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
		id: 'security',
		scope: ConfigurationScope.APPLICATION,
		title: localize('securityConfigurationTitle', "Security"),
		type: 'object',
		order: 7,
		properties: {
			[WORKSPACE_TRUST_ENABLED]: {
				type: 'boolean',
				default: true,
				description: localize('workspace.trust.description', "Controls whether or not workspace trust is enabled within VS Code."),
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
			trustedFoldersCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of trusted folders on the machine' };
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
			isTrusted: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'true if the workspace is trusted' };
		};

		this.telemetryService.publicLog2<WorkspaceTrustStateChangedEvent, WorkspaceTrustStateChangedEventClassification>('workspaceTrustStateChanged', {
			workspaceId: this.workspaceContextService.getWorkspace().id,
			isTrusted: isTrusted
		});

		if (isTrusted) {
			type WorkspaceTrustFolderInfoEventClassification = {
				owner: 'sbatten';
				comment: 'Some metrics on the trusted workspaces folder structure';
				trustedFolderDepth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of directories deep of the trusted path' };
				workspaceFolderDepth: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The number of directories deep of the workspace path' };
				delta: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'The difference between the trusted path and the workspace path directories depth' };
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
