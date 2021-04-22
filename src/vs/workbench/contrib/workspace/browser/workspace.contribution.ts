/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./workspaceTrustEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustRequestOptions, workspaceTrustToString } from 'vs/platform/workspace/common/workspaceTrust';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IActivityService, IconBadge } from 'vs/workbench/services/activity/common/activity';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeColor } from 'vs/workbench/api/common/extHostTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { IEditorRegistry, EditorDescriptor } from 'vs/workbench/browser/editor';
import { WorkspaceTrustEditor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustEditor';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { isWorkspaceTrustEnabled, WorkspaceTrustContext, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_EXTENSION_UNTRUSTED_SUPPORT } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { EditorInput, Extensions as EditorInputExtensions, IEditorInputSerializer, IEditorInputFactoryRegistry, EditorExtensions } from 'vs/workbench/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { isWeb } from 'vs/base/common/platform';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { dirname, resolve } from 'vs/base/common/path';
import product from 'vs/platform/product/common/product';
import { FileAccess } from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { MarkdownString } from 'vs/base/common/htmlContent';

const workspaceTrustIcon = registerIcon('workspace-trust-icon', Codicon.shield, localize('workspaceTrustIcon', "Icon for workspace trust badge."));

/*
 * Trust Request UX Handler
 */
export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {
	private readonly badgeDisposable = this._register(new MutableDisposable());
	private shouldShowIntroduction = true;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService,
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IStorageService private readonly storageService: IStorageService,
	) {
		super();

		if (isWorkspaceTrustEnabled(configurationService)) {
			this.registerListeners();
			this.showIntroductionModal();
		}
	}

	private toggleRequestBadge(visible: boolean): void {
		this.badgeDisposable.clear();

		if (visible) {
			this.badgeDisposable.value = this.activityService.showGlobalActivity({
				badge: new IconBadge(workspaceTrustIcon, () => localize('requestTrustIconText', "Some features require workspace trust.")),
				priority: 10
			});
		}
	}

	private showIntroductionModal(): void {
		const workspaceTrustIntroDialogDoNotShowAgainKey = 'workspace.trust.introduction.doNotShowAgain';
		const doNotShowAgain = this.storageService.getBoolean(workspaceTrustIntroDialogDoNotShowAgainKey, StorageScope.GLOBAL, false);
		if (!doNotShowAgain && this.shouldShowIntroduction) {
			// Show welcome dialog
			(async () => {

				const result = await this.dialogService.show(
					Severity.Info,
					localize('workspaceTrust', "Introducing Workspace Trust"),
					[
						localize('manageTrust', "Manage"),
						localize('close', "Close")
					],
					{
						custom: {
							icon: Codicon.shield,
							classes: ['workspace-trust-intro-dialog'],
							markdownDetails: [
								{
									markdown: new MarkdownString(localize('workspaceTrustDescription', "{0} provides many powerful features that rely on the files that are open in the current workspace. This can mean unintended code execution from the workspace and should only happen if you trust the source of the files you have open.", 'VS Code' || product.nameShort)),
								},
								{
									markdown: new MarkdownString(`![${localize('altTextTrustedBadge', "Shield Badge on Activity Bar")}](${FileAccess.asBrowserUri('vs/workbench/contrib/workspace/browser/media/trusted-badge.png', require).toString(false)})\n*${localize('workspaceTrustBadgeDescription', "When features are disabled in an untrusted workspace, you will see this shield icon in the Activity Bar.")}*`),
									classes: ['workspace-trust-dialog-image-row', 'badge-row']
								},
								{
									markdown: new MarkdownString(`![${localize('altTextUntrustedStatus', "Workspace Trust Status Bar Entry")}](${FileAccess.asBrowserUri('vs/workbench/contrib/workspace/browser/media/untrusted-status.png', require).toString(false)})\n*${localize('workspaceTrustUntrustedDescription', "When the workspace is untrusted, you will see this status bar entry. It is hidden when the workspace is trusted.")}*`),
									classes: ['workspace-trust-dialog-image-row', 'status-bar']
								},
								{
									markdown: new MarkdownString(localize('seeTheDocs', "Manage your Workspace Trust configuration now to learn more or [see our docs for additional information](https://aka.ms/vscode-workspace-trust).")),
								}
							],
						},
						cancelId: 1, // Close
						checkbox: {
							label: localize('dontShowAgain', "Don't show this message again"),
							checked: false,
						}
					}
				);

				// Dialog result
				switch (result.choice) {
					case 0:
						this.workspaceTrustRequestService.cancelRequest();
						await this.commandService.executeCommand('workbench.trust.manage');
						break;
					case 1:
						this.workspaceTrustRequestService.completeRequest(undefined);
						break;
				}

				if (result.checkboxChecked) {
					this.storageService.store(workspaceTrustIntroDialogDoNotShowAgainKey, true, StorageScope.GLOBAL, StorageTarget.USER);
				}
			})();
		}
	}

	private registerListeners(): void {
		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(async requestOptions => {
			this.toggleRequestBadge(true);

			if (requestOptions.modal) {
				// Message
				const defaultMessage = localize('immediateTrustRequestMessage', "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.");
				const message = requestOptions.message ?? defaultMessage;

				// Buttons
				const buttons = requestOptions.buttons ?? [
					{ label: localize('grantWorkspaceTrustButton', "Trust Workspace & Continue"), type: 'ContinueWithTrust' },
					{ label: localize('manageWorkspaceTrustButton', "Learn More"), type: 'Manage' }
				];
				// Add Cancel button if not provided
				if (!buttons.some(b => b.type === 'Cancel')) {
					buttons.push({ label: localize('cancelWorkspaceTrustButton', "Cancel"), type: 'Cancel' });
				}

				// Dialog
				const result = await this.dialogService.show(
					Severity.Info,
					localize('immediateTrustRequestTitle', "Do you trust the files in this folder?"),
					buttons.map(b => b.label),
					{
						cancelId: buttons.findIndex(b => b.type === 'Cancel'),
						detail: localize('immediateTrustRequestDetail', "{0}\n\nYou should only trust this workspace if you trust its source. Using an untrusted workspace may compromise your device or personal information.", message),
						custom: { icon: Codicon.shield }
					}
				);

				// Dialog result
				switch (buttons[result.choice].type) {
					case 'ContinueWithTrust':
						this.workspaceTrustRequestService.completeRequest(true);
						break;
					case 'ContinueWithoutTrust':
						this.workspaceTrustRequestService.completeRequest(undefined);
						break;
					case 'Manage':
						this.workspaceTrustRequestService.cancelRequest();
						await this.commandService.executeCommand('workbench.trust.manage');
						break;
					case 'Cancel':
						this.workspaceTrustRequestService.cancelRequest();
						break;
				}
			}
		}));

		this._register(this.workspaceTrustRequestService.onDidCompleteWorkspaceTrustRequest(trusted => {
			if (trusted) {
				this.toggleRequestBadge(false);
			}
		}));

		this._register(this.workspaceTrustManagementService.onDidChangeTrust(async (trusted) => {
			// Hide soft request badge
			if (trusted) {
				this.toggleRequestBadge(false);
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
					const addedFoldersTrustInfo = e.changes.added.map(folder => this.workspaceTrustManagementService.getFolderTrustInfo(folder.uri));
					if (!addedFoldersTrustInfo.map(i => i.trusted).every(trusted => trusted)) {
						const result = await this.dialogService.show(
							Severity.Info,
							localize('addWorkspaceFolderMessage', "Do you trust the files in this folder?"),
							[localize('yes', 'Yes'), localize('no', 'No')],
							{
								detail: localize('addWorkspaceFolderDetail', "You are adding files to a trusted workspace that are not currently trusted. Do you want to trust the new files?"),
								cancelId: 1,
								custom: { icon: Codicon.shield }
							}
						);

						// Mark added/changed folders as trusted
						this.workspaceTrustManagementService.setFoldersTrust(addedFoldersTrustInfo.map(i => i.uri), result.choice === 0);

						resolve();
					}
				}

				resolve();
			}));
		}));

		// Don't auto-show the UX editor if the request is 5 seconds after startup
		setTimeout(() => { this.shouldShowIntroduction = false; }, 5000);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);

/*
 * Status Bar Entry
 */
class WorkspaceTrustStatusbarItem extends Disposable implements IWorkbenchContribution {
	private static readonly ID = 'status.workspaceTrust';
	private readonly statusBarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor>;
	private pendingRequestContextKey = WorkspaceTrustContext.PendingRequest.key;
	private contextKeys = new Set([this.pendingRequestContextKey]);

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

		this.statusBarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

		if (isWorkspaceTrustEnabled(configurationService)) {
			const entry = this.getStatusbarEntry(this.workspaceTrustManagementService.isWorkpaceTrusted());
			this.statusBarEntryAccessor.value = this.statusbarService.addEntry(entry, WorkspaceTrustStatusbarItem.ID, localize('status.WorkspaceTrust', "Workspace Trust"), StatusbarAlignment.LEFT, 0.99 * Number.MAX_VALUE /* Right of remote indicator */);
			this._register(this.workspaceTrustManagementService.onDidChangeTrust(trusted => this.updateStatusbarEntry(trusted)));
			this._register(this.contextKeyService.onDidChangeContext((contextChange) => {
				if (contextChange.affectsSome(this.contextKeys)) {
					this.updateVisibility(this.workspaceTrustManagementService.isWorkpaceTrusted());
				}
			}));

			this.updateVisibility(this.workspaceTrustManagementService.isWorkpaceTrusted());
		}
	}

	private getStatusbarEntry(trusted: boolean): IStatusbarEntry {
		const text = workspaceTrustToString(trusted);
		const backgroundColor = trusted ?
			'transparent' : new ThemeColor('statusBarItem.prominentBackground');
		const color = trusted ? '#00dd3b' : '#ff5462';

		return {
			text: trusted ? `$(shield)` : `$(shield) ${text}`,
			ariaLabel: localize('status.WorkspaceTrust', "Workspace Trust"),
			tooltip: localize('status.WorkspaceTrust', "Workspace Trust"),
			command: 'workbench.trust.manage',
			backgroundColor,
			color
		};
	}

	private updateVisibility(trusted: boolean): void {
		const pendingRequest = this.contextKeyService.getContextKeyValue(this.pendingRequestContextKey) === true;
		this.statusbarService.updateEntryVisibility(WorkspaceTrustStatusbarItem.ID, !trusted || pendingRequest);
	}

	private updateStatusbarEntry(trusted: boolean): void {
		this.statusBarEntryAccessor.value?.update(this.getStatusbarEntry(trusted));
		this.updateVisibility(trusted);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkspaceTrustStatusbarItem,
	LifecyclePhase.Starting
);

/**
 * Trusted Workspace GUI Editor
 */
class WorkspaceTrustEditorInputSerializer implements IEditorInputSerializer {

	canSerialize(editorInput: EditorInput): boolean {
		return true;
	}

	serialize(input: WorkspaceTrustEditorInput): string {
		return '{}';
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): WorkspaceTrustEditorInput {
		return instantiationService.createInstance(WorkspaceTrustEditorInput);
	}
}

Registry.as<IEditorInputFactoryRegistry>(EditorInputExtensions.EditorInputFactories)
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
				when: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true), WorkspaceTrustContext.PendingRequest.negate())
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

MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
	command: {
		id: 'workbench.trust.manage',
		title: localize('manageWorkspaceTrustPending', "Manage Workspace Trust (1)"),
	},
	group: '6_workspace_trust',
	order: 40,
	when: ContextKeyExpr.and(IsWebContext.negate(), ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true), WorkspaceTrustContext.PendingRequest)
});

/*
 * Configuration
 */
Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		id: 'security',
		order: 7,
		title: localize('securityConfigurationTitle', "Security"),
		type: 'object',
		properties: {
			[WORKSPACE_TRUST_ENABLED]: {
				type: 'boolean',
				default: false,
				included: !isWeb,
				description: localize('workspace.trust.description', "Controls whether or not workspace trust is enabled within VS Code."),
			},
			[WORKSPACE_TRUST_EXTENSION_UNTRUSTED_SUPPORT]: {
				type: 'object',
				markdownDescription: localize('security.workspace.trust.extensionUntrustedSupport', "Override the untrusted workpace support of an extension. Extensions using `true` will always be enabled. Extensions using `limited` will always be enabled, and the extension will hide functionality that requires trust. Extensions using `false` will only be enabled only when the workspace is trusted."),
				patternProperties: {
					'([a-z0-9A-Z][a-z0-9\-A-Z]*)\\.([a-z0-9A-Z][a-z0-9\-A-Z]*)$': {
						type: 'object',
						properties: {
							'request': {
								type: 'string',
								enum: ['never', 'onDemand', 'onStart'],
								enumDescriptions: [
									localize('security.workspace.trust.extensionUntrustedSupport.supported.true', "Extension will always be enabled."),
									localize('security.workspace.trust.extensionUntrustedSupport.supported.limited', "Extension will always be enabled, and the extension will hide functionality requiring trust."),
									localize('security.workspace.trust.extensionUntrustedSupport.supported.false', "Extension will only be enabled only when the workspace is trusted."),
								],
								description: localize('security.workspace.trust.extensionUntrustedSupport.supported', "Defines the untrusted workspace support setting for the extension."),
							},
							'version': {
								type: 'string',
								description: localize('security.workspace.trust.extensionUntrustedSupport.version', "Defines the version of the extension for which the override should be applied. If not specified, the override will be applied independent of the extension version."),
							}
						}
					}
				}
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
		this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(options => this.logWorkspaceTrustRequest(options)));

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
			trustedFoldersCount: this.workspaceTrustManagementService.getTrustedFolders().length,
		});
	}

	private logWorkspaceTrustChangeEvent(isTrusted: boolean): void {
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
				const { trusted, uri } = this.workspaceTrustManagementService.getFolderTrustInfo(folder.uri);
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

	private async logWorkspaceTrustRequest(options: WorkspaceTrustRequestOptions): Promise<void> {
		if (!isWorkspaceTrustEnabled(this.configurationService)) {
			return;
		}

		type WorkspaceTrustRequestedEventClassification = {
			modal: { classification: 'SystemMetaData', purpose: 'FeatureInsight', isMeasurement: true };
			workspaceId: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
			extensions: { classification: 'SystemMetaData', purpose: 'FeatureInsight' };
		};

		type WorkspaceTrustRequestedEvent = {
			modal: boolean,
			workspaceId: string,
			extensions: string[]
		};

		this.telemetryService.publicLog2<WorkspaceTrustRequestedEvent, WorkspaceTrustRequestedEventClassification>('workspaceTrustRequested', {
			modal: options.modal,
			workspaceId: this.workspaceContextService.getWorkspace().id,
			extensions: (await this.extensionService.getExtensions()).filter(ext => !!ext.capabilities?.untrustedWorkspaces).map(ext => ext.identifier.value)
		});
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WorkspaceTrustTelemetryContribution, LifecyclePhase.Restored);
