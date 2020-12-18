/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { ITrustedWorkspaceService, TrustState } from 'vs/platform/workspace/common/trustedWorkspace';
import { Extensions as WorkbenchExtensions, IWorkbenchContribution, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class WorkspaceTrustRequestHandler extends Disposable implements IWorkbenchContribution {
	private readonly requestModel = this.trustedWorkspaceService.requestModel;

	constructor(
		@IDialogService private readonly dialogService: IDialogService,
		@INotificationService private readonly notificationService: INotificationService,
		@ITrustedWorkspaceService private readonly trustedWorkspaceService: ITrustedWorkspaceService
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.requestModel.onDidInitiateRequest(async () => {
			if (this.requestModel.trustRequest) {
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
				} else {
					const handle = this.notificationService.prompt(
						Severity.Info,
						'This workspace wants trust at some point.',
						[
							{
								label: 'Trust',
								run: () => { this.requestModel.completeRequest(TrustState.Trusted); }
							},
							{
								label: `Don't Trust`,
								run: () => { this.requestModel.completeRequest(TrustState.Untrusted); }
							}
						]
					);

					this._register(handle.onDidClose(() => {
						this.requestModel.completeRequest(TrustState.Unknown);
					}));
				}
			}
		}));
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustRequestHandler, LifecyclePhase.Ready);
