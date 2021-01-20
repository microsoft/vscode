/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITrustedWorkspaceChangeModel, ITrustedWorkspaceService, TrustedWorkspaceContext, TRUSTED_WORKSPACES_URI, TrustState } from 'vs/platform/workspace/common/trustedWorkspace';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IActivityService, IconBadge } from 'vs/workbench/services/activity/common/activity';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';
import { ThemeColor } from 'vs/workbench/api/common/extHostTypes';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TrustedWorkspacesFileSystemProvider } from 'vs/workbench/contrib/workspace/common/trustedWorkspaceFileSystemProvider';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { WorkbenchStateContext } from 'vs/workbench/browser/contextkeys';

const workspaceTrustIcon = registerIcon('workspace-trust-icon', Codicon.shield, localize('workspaceTrustIcon', "Icon for workspace trust badge."));

/*
 * Trust Request UX Handler
 */
export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {
	private readonly requestModel = this.trustedWorkspaceService.requestModel;
	private readonly badgeDisposable = this._register(new MutableDisposable());

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@IActivityService private readonly activityService: IActivityService,
		@ITrustedWorkspaceService private readonly trustedWorkspaceService: ITrustedWorkspaceService
	) {
		super();

		this.registerListeners();
	}

	private toggleRequestBadge(visible: boolean): void {
		this.badgeDisposable.clear();

		if (visible) {
			this.badgeDisposable.value = this.activityService.showGlobalActivity({
				badge: new IconBadge(workspaceTrustIcon, () => localize('requestTrustIconText', "Some features require workspace trust.")),
				priority: 0
			});
		}
	}

	private registerListeners(): void {
		this._register(this.requestModel.onDidInitiateRequest(async () => {
			if (this.requestModel.trustRequest) {
				this.toggleRequestBadge(true);

				if (this.requestModel.trustRequest.immediate) {
					const result = await this.dialogService.show(
						Severity.Info,
						this.requestModel.trustRequest.message ?? 'This workspace wants trust right now!',
						['Trust', `Don't Trust`, 'Cancel'],
						{
							cancelId: 2
						}
					);

					if (result.choice === 0) {
						this.requestModel.completeRequest(TrustState.Trusted);
					} else if (result.choice === 1) {
						this.requestModel.completeRequest(TrustState.Untrusted);
					} else {
						this.requestModel.completeRequest(undefined);
					}
				}
			}
		}));

		this._register(this.requestModel.onDidCompleteRequest(trustState => {
			if (trustState !== undefined && trustState !== TrustState.Unknown) {
				this.toggleRequestBadge(false);
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);

/*
 * Status Bar Entry
 */
class TrustedWorkspaceStatusbarItem extends Disposable implements IWorkbenchContribution {
	private static readonly ID = 'status.trustedWorkspace';
	private readonly statusBarEntryAccessor: MutableDisposable<IStatusbarEntryAccessor>;

	constructor(
		@IStatusbarService private statusbarService: IStatusbarService,
		@ITrustedWorkspaceService private trustedWorkspaceService: ITrustedWorkspaceService
	) {
		super();

		const entry = this.getStatusbarEntry(this.trustedWorkspaceService.getWorkspaceTrustState());
		this.statusBarEntryAccessor = this._register(new MutableDisposable<IStatusbarEntryAccessor>());
		this.statusBarEntryAccessor.value = this.statusbarService.addEntry(entry, TrustedWorkspaceStatusbarItem.ID, localize('status.trrustedWorkspace', "Workspace Trust"), StatusbarAlignment.RIGHT, 1);

		this._register(this.trustedWorkspaceService.onDidChangeTrust(state => this.updateStatusbarEntry(state)));
	}

	private getStatusbarEntry(state: TrustState): IStatusbarEntry {
		const text = (state === TrustState.Untrusted)
			? 'UNTRUSTED' : (state === TrustState.Trusted ? 'TRUSTED' : 'UNKNOWN');

		return {
			text: `$(shield) ${text}`,
			ariaLabel: localize('status.trustedWorkspace', "Workspace Trust"),
			tooltip: localize('status.trustedWorkspace', "Workspace Trust"),
			backgroundColor: state === TrustState.Untrusted ? new ThemeColor('statusBarItem.errorBackground') : 'transparent',
			command: 'workbench.trust.require'
		};
	}

	private updateStatusbarEntry(state: ITrustedWorkspaceChangeModel): void {
		this.statusBarEntryAccessor.value?.update(this.getStatusbarEntry(state.currentState));
		this.statusbarService.updateEntryVisibility(TrustedWorkspaceStatusbarItem.ID, state.currentState === TrustState.Untrusted);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	TrustedWorkspaceStatusbarItem,
	LifecyclePhase.Starting
);

/*
 * Trusted Workspace JSON Editor
 */
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(
	TrustedWorkspacesFileSystemProvider,
	LifecyclePhase.Ready
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
				value: localize('grantTrustWorkspace', "Grant Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: TrustedWorkspaceContext.TrustState.isEqualTo(TrustState.Trusted).negate(),
			menu: {
				id: MenuId.GlobalActivity,
				when: TrustedWorkspaceContext.IsPendingRequest,
				group: '7_trust',
				order: 10
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(ITrustedWorkspaceService);

		const result = await dialogService.confirm({
			message: localize('grantTrustWorkspace', "Grant Workspace Trust"),
			detail: localize('confirmGrantWorkspaceTrust', "Granting trust to the workspace will enable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to trust this workspace?"),
			primaryButton: localize('yes', 'Yes'),
			secondaryButton: localize('no', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.requestModel.completeRequest(TrustState.Trusted);
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
				value: localize('denyTrustWorkspace', "Deny Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: TrustedWorkspaceContext.TrustState.isEqualTo(TrustState.Untrusted).negate(),
			menu: {
				id: MenuId.GlobalActivity,
				when: TrustedWorkspaceContext.IsPendingRequest,
				group: '7_trust',
				order: 20
			},
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(ITrustedWorkspaceService);

		const result = await dialogService.confirm({
			message: localize('denyTrustWorkspace', "Deny Workspace Trust"),
			detail: localize('confirmDenyWorkspaceTrust', "Denying trust to the workspace will disable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to deny trust to this workspace?"),
			primaryButton: localize('yes', 'Yes'),
			secondaryButton: localize('no', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.requestModel.completeRequest(TrustState.Untrusted);
		}
		return;
	}
});

// Reset Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.reset',
			title: {
				original: 'Reset Workspace Trust',
				value: localize('reset', "Reset Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			f1: true,
			precondition: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo('empty').negate(), TrustedWorkspaceContext.TrustState.isEqualTo(TrustState.Unknown).negate())
		});
	}

	async run(accessor: ServicesAccessor) {
		const dialogService = accessor.get(IDialogService);
		const workspaceTrustService = accessor.get(ITrustedWorkspaceService);

		const result = await dialogService.confirm({
			message: localize('reset', "Reset Workspace Trust"),
			detail: localize('confirmResetWorkspaceTrust', "Resetting workspace trust to the workspace will disable features that may pose a security risk if the contents of the workspace cannot be trusted. Are you sure you want to reset trust this workspace?"),
			primaryButton: localize('yesGrant', 'Yes'),
			secondaryButton: localize('noGrant', 'No')
		});

		if (result.confirmed) {
			workspaceTrustService.resetWorkspaceTrust();
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
				original: 'Manage Trusted Workspaces',
				value: localize('manageTrustWorkspace', "Manage Trusted Workspaces")
			},
			category: localize('workspacesCategory', "Workspaces"),
			menu: {
				id: MenuId.GlobalActivity,
				group: '7_trust',
				order: 40
			},
		});
	}

	run(accessor: ServicesAccessor) {
		const editorService = accessor.get(IEditorService);
		editorService.openEditor({ resource: TRUSTED_WORKSPACES_URI, mode: 'jsonc', options: { pinned: true } });
		return;
	}
});

// Require Workspace Trust
registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.require',
			title: 'Require Workspace Trust',
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const workspaceTrustService = accessor.get(ITrustedWorkspaceService);
		workspaceTrustService.requireWorkspaceTrust(
			{
				immediate: true,
				message: 'Do you want to trust the contents of this workspace?'
			});
		return;
	}
});
