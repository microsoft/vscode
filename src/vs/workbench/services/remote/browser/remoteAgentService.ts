/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { IRemoteAgentService } from '../common/remoteAgentService';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from '../../../../platform/remote/common/remoteAuthorityResolver';
import { AbstractRemoteAgentService } from '../common/abstractRemoteAgentService';
import { IProductService } from '../../../../platform/product/common/productService';
import { ISignService } from '../../../../platform/sign/common/sign';
import { ILogService } from '../../../../platform/log/common/log';
import { Severity } from '../../../../platform/notification/common/notification';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { IHostService } from '../../host/browser/host';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile';
import { IRemoteSocketFactoryService } from '../../../../platform/remote/common/remoteSocketFactoryService';

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

	private async _presentConnectionError(err: any): Promise<void> {
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
