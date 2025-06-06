/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { IRemoteAgentService } from '../common/remoteAgentService.js';
import { IRemoteAuthorityResolverService, RemoteConnectionType, RemoteAuthorityResolverError } from '../../../../platform/remote/common/remoteAuthorityResolver.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { AbstractRemoteAgentService } from '../common/abstractRemoteAgentService.js';
import { ISignService } from '../../../../platform/sign/common/sign.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { INotificationService, IPromptChoice, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkbenchContribution, WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
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
		@ILogService logService: ILogService,
	) {
		super(remoteSocketFactoryService, userDataProfileService, environmentService, productService, remoteAuthorityResolverService, signService, logService);
	}
}

class RemoteConnectionFailureNotificationContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.nativeRemoteConnectionFailureNotification';

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@INotificationService notificationService: INotificationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService,
		@INativeHostService nativeHostService: INativeHostService,
		@IRemoteAuthorityResolverService private readonly _remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@IOpenerService openerService: IOpenerService,
	) {
		// Let's cover the case where connecting to fetch the remote extension info fails
		this._remoteAgentService.getRawEnvironment()
			.then(undefined, err => {

				if (!RemoteAuthorityResolverError.isHandled(err)) {
					const choices: IPromptChoice[] = [
						{
							label: nls.localize('devTools', "Open Developer Tools"),
							run: () => nativeHostService.openDevTools()
						}
					];
					const troubleshootingURL = this._getTroubleshootingURL();
					if (troubleshootingURL) {
						choices.push({
							label: nls.localize('directUrl', "Open in browser"),
							run: () => openerService.open(troubleshootingURL, { openExternal: true })
						});
					}
					notificationService.prompt(
						Severity.Error,
						nls.localize('connectionError', "Failed to connect to the remote extension host server (Error: {0})", err ? err.message : ''),
						choices
					);
				}
			});
	}

	private _getTroubleshootingURL(): URI | null {
		const remoteAgentConnection = this._remoteAgentService.getConnection();
		if (!remoteAgentConnection) {
			return null;
		}
		const connectionData = this._remoteAuthorityResolverService.getConnectionData(remoteAgentConnection.remoteAuthority);
		if (!connectionData || connectionData.connectTo.type !== RemoteConnectionType.WebSocket) {
			return null;
		}
		return URI.from({
			scheme: 'http',
			authority: `${connectionData.connectTo.host}:${connectionData.connectTo.port}`,
			path: `/version`
		});
	}

}

registerWorkbenchContribution2(RemoteConnectionFailureNotificationContribution.ID, RemoteConnectionFailureNotificationContribution, WorkbenchPhase.BlockRestore);
