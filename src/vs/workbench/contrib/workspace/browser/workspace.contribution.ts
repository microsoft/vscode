/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./workspaceTrustEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, workspaceTrustToString } from 'vs/platform/workspace/common/workspaceTrust';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Codicon, registerCodicon } from 'vs/base/common/codicons';
import { ThemeColor } from 'vs/workbench/api/common/extHostTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { IEditorRegistry, EditorDescriptor } from 'vs/workbench/browser/editor';
import { shieldIcon, WorkspaceTrustEditor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustEditor';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { isWorkspaceTrustEnabled, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_UNTRUSTED_FILES } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IEditorInputSerializer, IEditorInputFactoryRegistry, EditorExtensions, EditorResourceAccessor } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { isWeb } from 'vs/base/common/platform';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { dirname, resolve } from 'vs/base/common/path';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import product from 'vs/platform/product/common/product';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';
import { STATUS_BAR_PROMINENT_ITEM_BACKGROUND, STATUS_BAR_PROMINENT_ITEM_FOREGROUND } from 'vs/workbench/common/theme';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { splitName } from 'vs/base/common/labels';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IBannerItem, IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { isVirtualWorkspace } from 'vs/platform/remote/common/remoteHosts';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

const BANNER_RESTRICTED_MODE = 'workbench.banner.restrictedMode';
const BANNER_VIRTUAL_WORKSPACE = 'workbench.banner.virtualWorkspace';
const BANNER_VIRTUAL_AND_RESTRICTED = 'workbench.banner.virtualAndRestricted';
const STARTUP_PROMPT_SHOWN_KEY = 'workspace.trust.startupPrompt.shown';
const BANNER_RESTRICTED_MODE_DISMISSED_KEY = 'workbench.banner.restrictedMode.dismissed';
const BANNER_VIRTUAL_WORKSPACE_DISMISSED_KEY = 'workbench.banner.virtualWorkspace.dismissed';

const infoIcon = registerCodicon('workspace-banner-warning-icon', Codicon.info);

/*
 * Trust Request UX Handler
 */
export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {

	private readonly entryId = `status.workspaceTrust.${this.workspaceContextService.getWorkspace().id}`;

	private readonly statusbarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor>;

	// try showing the banner only after some files have been opened
	private showBannerInEmptyWindow = false;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@ICommandService private readonly commandService: ICommandService,
		@IEditorService private readonly editorService: IEditorService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IBannerService private readonly bannerService: IBannerService,
		@IHostService private readonly hostService: IHostService,
	) {
		super();

		this.statusbarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

		(async () => {

			await this.workspaceTrustManagementService.workspaceTrustInitialized;

			if (isWorkspaceTrustEnabled(configurationService)) {
				this.registerListeners();
				this.createStatusbarEntry();

				// Set empty workspace trust state
				await this.setEmptyWorkspaceTrustState();

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

	private get startupPromptSetting(): 'always' | 'once' | 'never' {
		return this.configurationService.getValue(WORKSPACE_TRUST_STARTUP_PROMPT);
	}

	private get useWorkspaceLanguage(): boolean {
		return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
	}

	private get modalTitle(): string {
		return this.useWorkspaceLanguage ?
			localize('workspaceTrust', "Do you trust the authors of the files in this workspace?") :
			localize('folderTrust', "Do you trust the authors of the files in this folder?");
	}

	private async doShowModal(question: string, trustedOption: { label: string, sublabel: string }, untrustedOption: { label: string, sublabel: string }, markdownStrings: string[], trustParentString?: string): Promise<void> {
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
					await this.workspaceTrustRequestService.completeRequest(true);
				}
				break;
			case 1:
				this.updateWorkbenchIndicators(false);
				this.workspaceTrustRequestService.cancelRequest();
				break;
		}

		this.storageService.store(STARTUP_PROMPT_SHOWN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private async showModalOnStart(): Promise<void> {
		if (this.workspaceTrustManagementService.isWorkpaceTrusted()) {
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

		let checkboxText: string | undefined;
		const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace())!;
		const isSingleFolderWorkspace = isSingleFolderWorkspaceIdentifier(workspaceIdentifier);
		if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier) && workspaceIdentifier.uri.scheme === Schemas.file) {
			const { parentPath } = splitName(workspaceIdentifier.uri.fsPath);
			const { name } = splitName(parentPath);
			checkboxText = localize('checkboxString', "Trust the authors of all files in the parent folder '{0}'", name);
		}

		// Show Workspace Trust Start Dialog
		this.doShowModal(
			this.modalTitle,
			{ label: localize('trustOption', "Yes, I trust the authors"), sublabel: isSingleFolderWorkspace ? localize('trustFolderOptionDescription', "Trust folder and enable all features") : localize('trustWorkspaceOptionDescription', "Trust workspace and enable all features") },
			{ label: localize('dontTrustOption', "No, I don't trust the authors"), sublabel: isSingleFolderWorkspace ? localize('dontTrustFolderOptionDescription', "Browse folder in restricted mode") : localize('dontTrustWorkspaceOptionDescription', "Browse workspace in restricted mode") },
			[
				!isSingleFolderWorkspace ?
					localize('workspaceStartupTrustDetails', "{0} provides features that may automatically execute files in this workspace.", product.nameShort) :
					localize('folderStartupTrustDetails', "{0} provides features that may automatically execute files in this folder.", product.nameShort),
				localize('startupTrustRequestLearnMore', "If you don't trust the authors of these files, we recommend to continue in restricted mode as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")
			],
			checkboxText
		);
	}

	private createStatusbarEntry(): void {
		const entry = this.getStatusbarEntry(this.workspaceTrustManagementService.isWorkpaceTrusted());
		this.statusbarEntryAccessor.value = this.statusbarService.addEntry(entry, this.entryId, StatusbarAlignment.LEFT, 0.99 * Number.MAX_VALUE /* Right of remote indicator */);
		this.statusbarService.updateEntryVisibility(this.entryId, false);
	}

	private getBannerItem(isInVirtualWorkspace: boolean, restrictedMode: boolean): IBannerItem | undefined {

		const dismissedVirtual = this.storageService.getBoolean(BANNER_VIRTUAL_WORKSPACE_DISMISSED_KEY, StorageScope.WORKSPACE, false);
		const dismissedRestricted = this.storageService.getBoolean(BANNER_RESTRICTED_MODE_DISMISSED_KEY, StorageScope.WORKSPACE, false);

		// all important info has been dismissed
		if (dismissedVirtual && dismissedRestricted) {
			return undefined;
		}

		// don't show restricted mode only banner
		if (dismissedRestricted && !isInVirtualWorkspace) {
			return undefined;
		}

		// don't show virtual workspace only banner
		if (dismissedVirtual && !restrictedMode) {
			return undefined;
		}

		const choose = (virtual: any, restricted: any, virtualAndRestricted: any) => {
			return (isInVirtualWorkspace && !dismissedVirtual) && (restrictedMode && !dismissedRestricted) ? virtualAndRestricted : ((isInVirtualWorkspace && !dismissedVirtual) ? virtual : restricted);
		};

		const id = choose(BANNER_VIRTUAL_WORKSPACE, BANNER_RESTRICTED_MODE, BANNER_VIRTUAL_AND_RESTRICTED);
		const icon = choose(infoIcon, shieldIcon, infoIcon);


		const [virtualAriaLabel, restrictedModeAriaLabel, virtualAndRestrictedModeAriaLabel] = this.getBannerItemAriaLabels();
		const ariaLabel = choose(virtualAriaLabel, restrictedModeAriaLabel, virtualAndRestrictedModeAriaLabel);

		const [virtualMessage, restrictedModeMessage, virtualAndRestrictedModeMessage] = this.getBannerItemMessages();
		const message = choose(virtualMessage, restrictedModeMessage, virtualAndRestrictedModeMessage);

		const actions = choose(
			[
				{
					label: localize('virtualBannerLearnMore', "Learn More"),
					href: 'https://aka.ms/vscode-virtual-workspaces'
				}
			],
			[
				{
					label: localize('restrictedModeBannerManage', "Manage"),
					href: 'command:workbench.trust.manage'
				},
				{
					label: localize('restrictedModeBannerLearnMore', "Learn More"),
					href: 'https://aka.ms/vscode-workspace-trust'
				}
			],
			[
				{
					label: localize('virtualAndRestrictedModeBannerManage', "Manage Trust"),
					href: 'command:workbench.trust.manage'
				},
				{
					label: localize('virtualBannerLearnMore', "Learn More"),
					href: 'https://aka.ms/vscode-virtual-workspaces'
				}
			]
		);

		return {
			id,
			icon,
			ariaLabel,
			message,
			actions,
			onClose: () => {
				if (isInVirtualWorkspace) {
					this.storageService.store(BANNER_VIRTUAL_WORKSPACE_DISMISSED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}

				if (restrictedMode) {
					this.storageService.store(BANNER_RESTRICTED_MODE_DISMISSED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
				}
			}
		};
	}

	private getBannerItemAriaLabels(): [string, string, string] {
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY:
				return [
					localize('virtualBannerAriaLabelWindow', "Some features are not available because the current window is backed by a virtual file system. Use navigation keys to access banner actions."),
					localize('restrictedModeBannerAriaLabelWindow', "Restricted Mode is intended for safe code browsing. Trust this window to enable all features. Use navigation keys to access banner actions."),
					localize('virtualAndRestrictedModeBannerAriaLabelWindow', "Some features are not available because the current window is backed by a virtual file system and is not trusted. You can trust this window to enable some of these features. Use navigation keys to access banner actions.")
				];
			case WorkbenchState.FOLDER:
				return [
					localize('virtualBannerAriaLabelFolder', "Some features are not available because the current folder is backed by a virtual file system. Use navigation keys to access banner actions."),
					localize('restrictedModeBannerAriaLabelFolder', "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features. Use navigation keys to access banner actions."),
					localize('virtualAndRestrictedModeBannerAriaLabelFolder', "Some features are not available because the current folder is backed by a virtual file system and is not trusted. You can trust this folder to enable some of these features. Use navigation keys to access banner actions.")
				];
			case WorkbenchState.WORKSPACE:
				return [
					localize('virtualBannerAriaLabelWorkspace', "Some features are not available because the current workspace is backed by a virtual file system. Use navigation keys to access banner actions."),
					localize('restrictedModeBannerAriaLabelWorkspace', "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features. Use navigation keys to access banner actions."),
					localize('virtualAndRestrictedModeBannerAriaLabelWorkspace', "Some features are not available because the current workspace is backed by a virtual file system and is not trusted. You can trust this workspace to enable some of these features. Use navigation keys to access banner actions.")
				];
		}
	}

	private getBannerItemMessages(): [string, string, string] {
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY:
				return [
					localize('virtualBannerMessageWindow', "Some features are not available because the current workspace is backed by a virtual file system."),
					localize('restrictedModeBannerMessageWindow', "Restricted Mode is intended for safe code browsing. Trust this window to enable all features."),
					localize('virtualAndRestrictedModeBannerMessageWindow', "Some features are not available because the current window is backed by a virtual file system and is not trusted. You can trust this window to enable some of these features.")
				];
			case WorkbenchState.FOLDER:
				return [
					localize('virtualBannerMessageFolder', "Some features are not available because the current folder is backed by a virtual file system."),
					localize('restrictedModeBannerMessageFolder', "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features."),
					localize('virtualAndRestrictedModeBannerMessageFolder', "Some features are not available because the current folder is backed by a virtual file system and is not trusted. You can trust this folder to enable some of these features.")
				];
			case WorkbenchState.WORKSPACE:
				return [
					localize('virtualBannerMessageWorkspace', "Some features are not available because the current workspace is backed by a virtual file system."),
					localize('restrictedModeBannerMessageWorkspace', "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features."),
					localize('virtualAndRestrictedModeBannerMessageWorkspace', "Some features are not available because the current workspace is backed by a virtual file system and is not trusted. You can trust this workspace to enable some of these features.")
				];
		}
	}

	private getStatusbarEntry(trusted: boolean): IStatusbarEntry {
		const text = workspaceTrustToString(trusted);
		const backgroundColor = new ThemeColor(STATUS_BAR_PROMINENT_ITEM_BACKGROUND);
		const color = new ThemeColor(STATUS_BAR_PROMINENT_ITEM_FOREGROUND);

		let ariaLabel = '';
		switch (this.workspaceContextService.getWorkbenchState()) {
			case WorkbenchState.EMPTY: {
				ariaLabel = trusted ? localize('status.ariaTrustedWindow', "This window is trusted.") :
					localize('status.ariaUntrustedWindow', "Restricted Mode: Some features are disabled because this window is not trusted.");
				break;
			}
			case WorkbenchState.FOLDER: {
				ariaLabel = trusted ? localize('status.ariaTrustedFolder', "This folder is trusted.") :
					localize('status.ariaUntrustedFolder', "Restricted Mode: Some features are disabled because this folder is not trusted.");
				break;
			}
			case WorkbenchState.WORKSPACE: {
				ariaLabel = trusted ? localize('status.ariaTrustedWorkspace', "This workspace is trusted.") :
					localize('status.ariaUntrustedWorkspace', "Restricted Mode: Some features are disabled because this workspace is not trusted.");
				break;
			}
		}

		return {
			name: localize('status.WorkspaceTrust', "Workspace Trust"),
			text: trusted ? `$(shield)` : `$(shield) ${text}`,
			ariaLabel: ariaLabel,
			tooltip: ariaLabel,
			command: 'workbench.trust.manage',
			backgroundColor,
			color
		};
	}

	private async setEmptyWorkspaceTrustState(): Promise<void> {
		if (this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			return;
		}

		// Open files
		const openFiles = this.editorService.editors.map(editor => EditorResourceAccessor.getCanonicalUri(editor, { filterByScheme: Schemas.file })).filter(uri => !!uri);

		if (openFiles.length) {
			this.showBannerInEmptyWindow = true;

			// If all open files are trusted, transition to a trusted workspace
			const openFilesTrustInfo = await Promise.all(openFiles.map(uri => this.workspaceTrustManagementService.getUriTrustInfo(uri!)));

			if (openFilesTrustInfo.map(info => info.trusted).every(trusted => trusted)) {
				this.workspaceTrustManagementService.setWorkspaceTrust(true);
			}
		} else {
			// No open files, use the setting to set workspace trust state
			const disposable = this._register(this.editorService.onDidActiveEditorChange(() => {
				const editor = this.editorService.activeEditor;
				if (editor && !!EditorResourceAccessor.getCanonicalUri(editor, { filterByScheme: Schemas.file })) {
					this.showBannerInEmptyWindow = true;
					this.updateWorkbenchIndicators(this.workspaceTrustManagementService.isWorkpaceTrusted());
					disposable.dispose();
				}
			}));
			this.workspaceTrustManagementService.setWorkspaceTrust(this.configurationService.getValue<boolean>(WORKSPACE_TRUST_EMPTY_WINDOW) ?? false);
		}
	}

	private updateStatusbarEntry(trusted: boolean): void {
		this.statusbarEntryAccessor.value?.update(this.getStatusbarEntry(trusted));
		this.updateStatusbarEntryVisibility(trusted);
	}

	private updateStatusbarEntryVisibility(trusted: boolean): void {
		this.statusbarService.updateEntryVisibility(this.entryId, !trusted);
	}

	private updateWorkbenchIndicators(trusted: boolean): void {
		this.updateStatusbarEntry(trusted);

		const isInVirtualWorkspace = isVirtualWorkspace(this.workspaceContextService.getWorkspace());
		const isEmptyWorkspace = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
		const bannerItem = this.getBannerItem(isInVirtualWorkspace, !trusted);

		if (bannerItem && (!isEmptyWorkspace || this.showBannerInEmptyWindow)) {
			if (!isInVirtualWorkspace) {
				if (!trusted) {
					this.bannerService.show(bannerItem);
				} else {
					this.bannerService.hide(BANNER_RESTRICTED_MODE);
				}
			} else {
				this.bannerService.show(bannerItem);
			}
		}
	}

	private registerListeners(): void {

		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(async requestOptions => {
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
				this.modalTitle,
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
					await this.workspaceTrustRequestService.completeRequest(true);
					break;
				case 'ContinueWithoutTrust':
					await this.workspaceTrustRequestService.completeRequest(undefined);
					break;
				case 'Manage':
					this.workspaceTrustRequestService.cancelRequest();
					await this.commandService.executeCommand('workbench.trust.manage');
					break;
				case 'Cancel':
					this.workspaceTrustRequestService.cancelRequest();
					break;
			}
		}));

		this._register(this.workspaceContextService.onWillChangeWorkspaceFolders(e => {
			if (e.fromCache) {
				return;
			}
			if (!isWorkspaceTrustEnabled(this.configurationService)) {
				return;
			}
			const trusted = this.workspaceTrustManagementService.isWorkpaceTrusted();

			return e.join(new Promise(async resolve => {
				// Workspace is trusted and there are added/changed folders
				if (trusted && (e.changes.added.length || e.changes.changed.length)) {
					const addedFoldersTrustInfo = await Promise.all(e.changes.added.map(folder => this.workspaceTrustManagementService.getUriTrustInfo(folder.uri)));

					if (!addedFoldersTrustInfo.map(info => info.trusted).every(trusted => trusted)) {
						const result = await this.dialogService.show(
							Severity.Info,
							localize('addWorkspaceFolderMessage', "Do you trust the authors of the files in this folder?"),
							[localize('yes', 'Yes'), localize('no', 'No')],
							{
								detail: localize('addWorkspaceFolderDetail', "You are adding files to a trusted workspace that are not currently trusted. Do you trust the authors of these new files?"),
								cancelId: 1,
								custom: { icon: Codicon.shield }
							}
						);

						// Mark added/changed folders as trusted
						await this.workspaceTrustManagementService.setUrisTrust(addedFoldersTrustInfo.map(i => i.uri), result.choice === 0);

						resolve();
					}
				}

				resolve();
			}));
		}));

		this._register(this.workspaceTrustManagementService.onDidChangeTrust(trusted => {
			this.updateWorkbenchIndicators(trusted);
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Restored);

/**
 * Trusted Workspace GUI Editor
 */
class WorkspaceTrustEditorInputSerializer implements IEditorInputSerializer {

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

Registry.as<IEditorInputFactoryRegistry>(EditorExtensions.EditorInputFactories)
	.registerEditorInputSerializer(WorkspaceTrustEditorInput.ID, WorkspaceTrustEditorInputSerializer);

Registry.as<IEditorRegistry>(EditorExtensions.Editors).registerEditor(
	EditorDescriptor.create(
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

// Manage Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.manage',
			title: {
				original: 'Manage Workspace Trust',
				value: localize('manageWorkspaceTrust', "Manage Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			menu: {
				id: MenuId.GlobalActivity,
				group: '6_workspace_trust',
				order: 40,
				when: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true))
			},
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const input = instantiationService.createInstance(WorkspaceTrustEditorInput);

		editorService.openEditor(input, { pinned: true, revealIfOpened: true });
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
				included: !isWeb,
				description: localize('workspace.trust.description', "Controls whether or not workspace trust is enabled within VS Code."),
				scope: ConfigurationScope.APPLICATION,
			},
			[WORKSPACE_TRUST_STARTUP_PROMPT]: {
				type: 'string',
				default: 'once',
				included: !isWeb,
				description: localize('workspace.trust.startupPrompt.description', "Controls when the startup prompt to trust a workspace is shown."),
				scope: ConfigurationScope.APPLICATION,
				enum: ['always', 'once', 'never'],
				enumDescriptions: [
					localize('workspace.trust.startupPrompt.always', "Ask for trust every time an untrusted workspace is opened."),
					localize('workspace.trust.startupPrompt.once', "Ask for trust the first time an untrusted workspace is opened."),
					localize('workspace.trust.startupPrompt.never', "Do not ask for trust when an untrusted workspace is opened."),
				]
			},
			[WORKSPACE_TRUST_UNTRUSTED_FILES]: {
				type: 'string',
				default: 'prompt',
				included: !isWeb,
				description: localize('workspace.trust.untrustedFiles.description', "Controls how to handle opening untrusted files in a trusted workspace."),
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
				default: false,
				included: !isWeb,
				description: localize('workspace.trust.emptyWindow.description', "Controls whether or not the empty window is trusted by default within VS Code."),
				scope: ConfigurationScope.APPLICATION
			}
		}
	});

/**
 * Telemetry
 */
class WorkspaceTrustTelemetryContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService
	) {
		super();

		this._register(this.workspaceTrustManagementService.onDidChangeTrust(isTrusted => this.logWorkspaceTrustChangeEvent(isTrusted)));
		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(_ => this.logWorkspaceTrustRequest()));

		this.logInitialWorkspaceTrustInfo();
	}

	private logInitialWorkspaceTrustInfo(): void {
		if (!isWorkspaceTrustEnabled(this.configurationService)) {
			return;
		}

		type WorkspaceTrustInfoEventClassification = {
			trustedFoldersCount: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};

		type WorkspaceTrustInfoEvent = {
			trustedFoldersCount: number,
		};

		this.telemetryService.publicLog2<WorkspaceTrustInfoEvent, WorkspaceTrustInfoEventClassification>('workspaceTrustFolderCounts', {
			trustedFoldersCount: this.workspaceTrustManagementService.getTrustedUris().length,
		});
	}

	private async logWorkspaceTrustChangeEvent(isTrusted: boolean): Promise<void> {
		if (!isWorkspaceTrustEnabled(this.configurationService)) {
			return;
		}

		type WorkspaceTrustStateChangedEvent = {
			workspaceId: string,
			isTrusted: boolean
		};

		type WorkspaceTrustStateChangedEventClassification = {
			workspaceId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			isTrusted: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
		};

		this.telemetryService.publicLog2<WorkspaceTrustStateChangedEvent, WorkspaceTrustStateChangedEventClassification>('workspaceTrustStateChanged', {
			workspaceId: this.workspaceContextService.getWorkspace().id,
			isTrusted: isTrusted
		});

		if (isTrusted) {
			type WorkspaceTrustFolderInfoEventClassification = {
				trustedFolderDepth: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
				workspaceFolderDepth: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
				delta: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			};

			type WorkspaceTrustFolderInfoEvent = {
				trustedFolderDepth: number,
				workspaceFolderDepth: number,
				delta: number
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

	private async logWorkspaceTrustRequest(): Promise<void> {
		if (!isWorkspaceTrustEnabled(this.configurationService)) {
			return;
		}

		type WorkspaceTrustRequestedEventClassification = {
			workspaceId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			extensions: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};

		type WorkspaceTrustRequestedEvent = {
			workspaceId: string,
			extensions: string[]
		};

		this.telemetryService.publicLog2<WorkspaceTrustRequestedEvent, WorkspaceTrustRequestedEventClassification>('workspaceTrustRequested', {
			workspaceId: this.workspaceContextService.getWorkspace().id,
			extensions: (await this.extensionService.getExtensions()).filter(ext => !!ext.capabilities?.untrustedWorkspaces).map(ext => ext.identifier.value)
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkspaceTrustTelemetryContribution, LifecyclePhase.Restored);
