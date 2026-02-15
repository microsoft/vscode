/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IRemoteAgentService } from '../common/remoteAgentService.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { AbstractRemoteAgentService } from '../common/abstractRemoteAgentService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ISignService } from '../../../../platform/sign/common/sign.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Severity } from '../../../../platform/notification/common/notification.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IHostService } from '../../host/browser/host.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IRemoteSocketFactoryService } from '../../../../platform/remote/common/remoteSocketFactoryService.js';

export class RemoteAgentService extends AbstractRemoteAgentService implements IRemoteAgentService {

	constructor(
		@IRemoteSocketFactoryService remoteSocketFactoryService: IRemoteSocketFactoryService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService signService: ISignService,
		@ILogService logService: ILogService
	) {
		super(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService);
	}
}

class RemoteConnectionFailureNotificationContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.browserRemoteConnectionFailureNotification';

	constructor(
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IHostService private readonly _hostService: IHostService,
	) {
		// Let's cover the case where connecting to fetch the remote extension info fails
		remoteAgentService.getRawEnvironment()
			.then(undefined, (err) => {
				if (!RemoteAuthorityResolverError.isHandled(err)) {
					this._presentConnectionError(err);
				}
			});
	}

	private async _presentConnectionError(err: Error): Promise<void> {
		await this._dialogService.prompt({
			type: Severity.Error,
			message: nls.localize('connectionError', "An unexpected error occurred that requires a reload of this page."),
			detail: nls.localize('connectionErrorDetail', "The workbench failed to connect to the server (Error: {0})", err ? err.message : ''),
			buttons: [
				{
					label: nls.localize({ key: 'reload', comment: ['&& denotes a mnemonic'] }, "&&Reload"),
					run: () => this._hostService.reload()
				}
			]
		});
	}

}

registerWorkbenchContribution2(RemoteConnectionFailureNotificationContribution.ID, RemoteConnectionFailureNotificationContribution, WorkbenchPhase.BlockRestore);
