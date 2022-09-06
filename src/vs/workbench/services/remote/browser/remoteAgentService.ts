/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { AbstractRemoteAgentService } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWebSocketFactory, BrowserSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { ISignService } from 'vs/platform/sign/common/sign';
import { ILogService } from 'vs/platform/log/common/log';
import { Severity } from 'vs/platform/notification/common/notification';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';

export class RemoteAgentService extends AbstractRemoteAgentService implements IRemoteAgentService {

	constructor(
		webSocketFactory: IWebSocketFactory | null | undefined,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService signService: ISignService,
		@ILogService logService: ILogService
	) {
		super(new BrowserSocketFactory(webSocketFactory), environmentService, productService, remoteAuthorityResolverService, signService, logService);
	}
}

class RemoteConnectionFailureNotificationContribution implements IWorkbenchContribution {

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
		const res = await this._dialogService.show(
			Severity.Error,
			nls.localize('connectionError', "An unexpected error occurred that requires a reload of this page."),
			[
				nls.localize('reload', "Reload")
			],
			{
				detail: nls.localize('connectionErrorDetail', "The workbench failed to connect to the server (Error: {0})", err ? err.message : '')
			}
		);

		if (res.choice === 0) {
			this._hostService.reload();
		}
	}

}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteConnectionFailureNotificationContribution, 'RemoteConnectionFailureNotificationContribution', LifecyclePhase.Ready);
