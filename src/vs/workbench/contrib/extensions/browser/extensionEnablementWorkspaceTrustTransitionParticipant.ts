/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustTransitionParticipant } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export class ExtensionEnablementWorkspaceTrustTransitionParticipant extends Disposable implements IWorkbenchContribution {
	constructor(
		@IExtensionService extensionService: IExtensionService,
		@IHostService hostService: IHostService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkspaceTrustEnablementService workspaceTrustEnablementService: IWorkspaceTrustEnablementService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();

		if (workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
			// The extension enablement participant will be registered only after the
			// workspace trust state has been initialized. There is no need to execute
			// the participant as part of the initialization process, as the workspace
			// trust state is initialized before starting the extension host.
			workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
				const workspaceTrustTransitionParticipant = new class implements IWorkspaceTrustTransitionParticipant {
					async participate(trusted: boolean): Promise<void> {
						if (trusted) {
							// Untrusted -> Trusted
							await extensionEnablementService.updateExtensionsEnablementsWhenWorkspaceTrustChanges();
						} else {
							// Trusted -> Untrusted
							if (environmentService.remoteAuthority) {
								hostService.reload();
							} else {
								const stopped = await extensionService.stopExtensionHosts(localize('restartExtensionHost.reason', "Restarting extension host due to workspace trust change."));
								await extensionEnablementService.updateExtensionsEnablementsWhenWorkspaceTrustChanges();
								if (stopped) {
									extensionService.startExtensionHosts();
								}
							}
						}
					}
				};

				// Execute BEFORE the workspace trust transition completes
				this._register(workspaceTrustManagementService.addWorkspaceTrustTransitionParticipant(workspaceTrustTransitionParticipant));
			});
		}
	}
}
