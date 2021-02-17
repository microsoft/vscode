/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./workspaceTrustEditor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, MenuRegistry, registerAction2 } from 'vs/platform/actions/common/actions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustService, WorkspaceTrustState, WorkspaceTrustStateChangeEvent, workspaceTrustStateToString } from 'vs/platform/workspace/common/workspaceTrust';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IActivityService, IconBadge } from 'vs/workbench/services/activity/common/activity';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeColor } from 'vs/workbench/api/common/extHostTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { WorkspaceTrustFileSystemProvider } from 'vs/workbench/contrib/workspace/common/workspaceTrustFileSystemProvider';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { IEditorRegistry, Extensions as EditorExtensions, EditorDescriptor } from 'vs/workbench/browser/editor';
import { WorkspaceTrustEditor } from 'vs/workbench/contrib/workspace/browser/workspaceTrustEditor';
import { WorkspaceTrustEditorInput } from 'vs/workbench/services/workspaces/browser/workspaceTrustEditorInput';
import { WorkspaceTrustContext, WORKSPACE_TRUST_ENABLED } from 'vs/workbench/services/workspaces/common/workspaceTrust';

const workspaceTrustIcon = registerIcon('workspace-trust-icon', Codicon.shield, localize('workspaceTrustIcon', "Icon for workspace trust badge."));

/*
 * Trust Request UX Handler
 */
export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {
	private readonly requestModel = this.workspaceTrustService.requestModel;
	private readonly badgeDisposable = this._register(new MutableDisposable());

	constructor(
		@IHostService private readonly hostService: IHostService,
		@IDialogService private readonly dialogService: IDialogService,
		@IActivityService private readonly activityService: IActivityService,
		@ICommandService private readonly commandService: ICommandService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceTrustService private readonly workspaceTrustService: IWorkspaceTrustService
	) {
		super();

		this.registerListeners();
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

	private registerListeners(): void {
		this._register(this.requestModel.onDidInitiateRequest(async () => {
			if (this.requestModel.trustRequest) {
				this.toggleRequestBadge(true);

				if (this.requestModel.trustRequest.immediate) {
					const result = await this.dialogService.show(
						Severity.Warning,
						localize('immediateTrustRequestTitle', "Do you trust the files in this folder?"),
						[
							localize('grantWorkspaceTrustButton', "Trust"),
							localize('denyWorkspaceTrustButton', "Don't Trust"),
							localize('manageWorkspaceTrustButton', "Manage"),
							localize('cancelWorkspaceTrustButton', "Cancel"),
						],
						{
							cancelId: 3,
							detail: localize('immediateTrustRequestDetail', "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.\n\nYou should only trust this workspace if you trust its source. Otherwise, features will be enabled that may compromise your device or personal information."),
						}
					);

					switch (result.choice) {
						case 0: // Trust
							this.requestModel.completeRequest(WorkspaceTrustState.Trusted);
							break;
						case 1: // Don't Trust
							this.requestModel.completeRequest(WorkspaceTrustState.Untrusted);
							break;
						case 2: // Manage
							this.requestModel.completeRequest(undefined);
							await this.commandService.executeCommand('workbench.trust.manage');
							break;
						default: // Cancel
							this.requestModel.completeRequest(undefined);
							break;
					}
				}
			}
		}));

		this._register(this.requestModel.onDidCompleteRequest(trustState => {
			if (trustState !== undefined && trustState !== WorkspaceTrustState.Unknown) {
				this.toggleRequestBadge(false);
			}
		}));

		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(WORKSPACE_TRUST_ENABLED)) {
				const isEnabled = this.configurationService.getValue<boolean>(WORKSPACE_TRUST_ENABLED);
				if (!isEnabled || typeof isEnabled === 'boolean') {
					this.dialogService.confirm({
						message: localize('trustConfigurationChangeMessage', "In order for this change to take effect, the window needs to be reloaded. Do you want to reload the window now?")
					}).then(result => {
						if (result.confirmed) {
							this.hostService.reload();
						}
					});
				}
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);

/*
 * Status Bar Entry
 */
class WorkspaceTrustStatusbarItem extends Disposable implements IWorkbenchContribution {
	private static readonly ID = 'status.workspaceTrust';
	private readonly statusBarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor>;

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IWorkspaceTrustService private readonly workspaceTrustService: IWorkspaceTrustService
	) {
		super();

		this.statusBarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());

		if (this.workspaceTrustService.isWorkspaceTrustEnabled()) {
			const entry = this.getStatusbarEntry(this.workspaceTrustService.getWorkspaceTrustState());
			this.statusBarEntryAccessor.value = this.statusbarService.addEntry(entry, WorkspaceTrustStatusbarItem.ID, localize('status.WorkspaceTrust', "Workspace Trust"), StatusbarAlignment.LEFT, 0.99 * Number.MAX_VALUE /* Right of remote indicator */);
			this._register(this.workspaceTrustService.onDidChangeTrustState(trustState => this.updateStatusbarEntry(trustState)));
		}
	}

	private getStatusbarEntry(state: WorkspaceTrustState): IStatusbarEntry {
		const text = workspaceTrustStateToString(state);
		const backgroundColor = state === WorkspaceTrustState.Trusted ?
			'transparent' : new ThemeColor('statusBarItem.prominentBackground');
		const color = state === WorkspaceTrustState.Trusted ? '#00dd3b' : '#ff5462';

		return {
			text: state === WorkspaceTrustState.Trusted ? `$(shield)` : `$(shield) ${text}`,
			ariaLabel: localize('status.WorkspaceTrust', "Workspace Trust"),
			tooltip: localize('status.WorkspaceTrust', "Workspace Trust"),
			command: 'workbench.trust.manage',
			backgroundColor,
			color
		};
	}

	private updateStatusbarEntry(trustState: WorkspaceTrustStateChangeEvent): void {
		this.statusBarEntryAccessor.value?.update(this.getStatusbarEntry(trustState.currentTrustState));
		this.statusbarService.updateEntryVisibility(WorkspaceTrustStatusbarItem.ID, trustState.currentTrustState !== WorkspaceTrustState.Unknown);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkspaceTrustStatusbarItem,
	LifecyclePhase.Starting
);

/*
 * Trusted Workspace JSON Editor
 */
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	WorkspaceTrustFileSystemProvider,
	LifecyclePhase.Ready
);

/**
 * Trusted Workspace GUI Editor
 */
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

// Grant Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.grant',
			title: {
				original: 'Grant Workspace Trust',
				value: localize('grantWorkspaceTrust', "Grant Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: WorkspaceTrustContext.TrustState.isEqualTo(WorkspaceTrustState.Trusted).negate(),
			menu: {
				id: MenuId.GlobalActivity,
				when: WorkspaceTrustContext.PendingRequest,
				group: '6_workspace_trust',
				order: 10
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(IWorkspaceTrustService);

		const result = await dialogService.confirm({
			message: localize('grantWorkspaceTrust', "Grant Workspace Trust"),
			detail: localize('confirmGrantWorkspaceTrust', "Granting trust to the workspace will enable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to trust this workspace?"),
			primaryButton: localize('yes', 'Yes'),
			secondaryButton: localize('no', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.requestModel.completeRequest(WorkspaceTrustState.Trusted);
		}

		return;
	}
});

// Deny Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.deny',
			title: {
				original: 'Deny Workspace Trust',
				value: localize('denyWorkspaceTrust', "Deny Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: WorkspaceTrustContext.TrustState.isEqualTo(WorkspaceTrustState.Untrusted).negate(),
			menu: {
				id: MenuId.GlobalActivity,
				when: WorkspaceTrustContext.PendingRequest,
				group: '6_workspace_trust',
				order: 20
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(IWorkspaceTrustService);

		const result = await dialogService.confirm({
			message: localize('denyWorkspaceTrust', "Deny Workspace Trust"),
			detail: localize('confirmDenyWorkspaceTrust', "Denying trust to the workspace will disable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to deny trust to this workspace?"),
			primaryButton: localize('yes', 'Yes'),
			secondaryButton: localize('no', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.requestModel.completeRequest(WorkspaceTrustState.Untrusted);
		}
		return;
	}
});

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
				when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true), WorkspaceTrustContext.PendingRequest.negate())
			},
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		const instantiationService = accessor.get(IInstantiationService);

		const input = instantiationService.createInstance(WorkspaceTrustEditorInput);

		editorService.openEditor(input);
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
	when: ContextKeyExpr.and(ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true), WorkspaceTrustContext.PendingRequest)
});
