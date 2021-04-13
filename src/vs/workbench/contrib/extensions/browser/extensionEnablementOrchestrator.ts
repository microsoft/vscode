/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkspaceTrustManagementService, WorkspaceTrustState, WorkspaceTrustStateChangeEvent } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';


export class ExtensionEnablementOrchestrator extends Disposable implements IWorkbenchContribution {

	constructor(
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
	) {
		super();

		this._register(workspaceTrustManagementService.onDidChangeTrustState(e => this.onDidChangeTrustState(e)));
	}

	private async onDidChangeTrustState(event: WorkspaceTrustStateChangeEvent): Promise<void> {
		// Untrusted -> Trusted
		if (event.currentTrustState === WorkspaceTrustState.Trusted) {
			await this.extensionEnablementService.refreshEnablementByTrustRequirement();
		}

		// Trusted -> Untrusted
		if (event.currentTrustState === WorkspaceTrustState.Untrusted) {
			this.extensionService.stopExtensionHosts();
			await this.extensionEnablementService.refreshEnablementByTrustRequirement();
			this.extensionService.startExtensionHosts();
		}
	}
}
