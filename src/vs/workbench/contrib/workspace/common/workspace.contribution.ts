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
import { ITrustedWorkspaceService, TrustState } from 'vs/platform/workspace/common/trustedWorkspace';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { IActivityService, IconBadge } from 'vs/workbench/services/activity/common/activity';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { registerIcon } from 'vs/platform/theme/common/iconRegistry';
import { Codicon } from 'vs/base/common/codicons';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from 'vs/workbench/services/statusbar/common/statusbar';

const workspaceTrustIcon = registerIcon('workspace-trust-icon', Codicon.shield, localize('workspaceTrustIcon', "Icon for workspace trust badge."));

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
						'This workspace wants trust right now!',
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
						this.requestModel.completeRequest(TrustState.Unknown);
					}
				}
			}
		}));

		this._register(this.requestModel.onDidCompleteRequest(trustState => {
			if (trustState !== TrustState.Unknown) {
				this.toggleRequestBadge(false);
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.trust.manage',
			title: {
				original: 'Manage Trust Workspace',
				value: localize('manageTrustWorkspace', "Manage Workspace Trust")
			},
			category: localize('workspacesCategory', "Workspaces"),
			menu: {
				id: MenuId.GlobalActivity
			}
		});
	}

	run(accessor: ServicesAccessor) {
		const trustedWorkspaceService = accessor.get(ITrustedWorkspaceService);
		trustedWorkspaceService.requireWorkspaceTrust(true);
	}
});

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
		};
	}

	private updateStatusbarEntry(state: TrustState): void {
		this.statusBarEntryAccessor.value?.update(this.getStatusbarEntry(state));
		this.statusbarService.updateEntryVisibility(TrustedWorkspaceStatusbarItem.ID, state === TrustState.Untrusted);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(TrustedWorkspaceStatusbarItem, LifecyclePhase.Starting);
