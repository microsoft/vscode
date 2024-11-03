/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustTransitionParticipant } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IHostService } from '../../../services/host/browser/host.js';

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
