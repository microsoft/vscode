/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceTrustManagementService, IWorkspaceTrustTransitionParticipant } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { isWorkspaceTrustEnabled } from 'vs/workbench/services/workspaces/common/workspaceTrust';

export class ExtensionEnablementWorkspaceTrustTransitionParticipant extends Disposable implements IWorkbenchContribution {
	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IExtensionService extensionService: IExtensionService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		if (isWorkspaceTrustEnabled(configurationService)) {
			const workspaceTrustTransitionParticipant = new class implements IWorkspaceTrustTransitionParticipant {
				async participate(trusted: boolean): Promise<void> {
					if (trusted) {
						// Untrusted -> Trusted
						await extensionEnablementService.updateEnablementByWorkspaceTrustRequirement();
					} else {
						// Trusted -> Untrusted
						extensionService.stopExtensionHosts();
						await extensionEnablementService.updateEnablementByWorkspaceTrustRequirement();
						extensionService.startExtensionHosts();
					}
				}
			};

			// Execute BEFORE the workspace trust transition completes
			this._register(workspaceTrustManagementService.addWorkspaceTrustTransitionParticipant(workspaceTrustTransitionParticipant));
		}
	}
}
