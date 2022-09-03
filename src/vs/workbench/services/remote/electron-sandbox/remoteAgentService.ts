/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IProductService } from 'vs/platform/product/common/productService';
import { BrowserSocketFactory } from 'vs/platform/remote/browser/browserSocketFactory';
import { AbstractRemoteAgentService } from 'vs/workbench/services/remote/common/abstractRemoteAgentService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { INotificationService, IPromptChoice, Severity } from 'vs/platform/notification/common/notification';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { URI } from 'vs/base/common/uri';
import { IOpenerService } from 'vs/platform/opener/common/opener';

export class RemoteAgentService extends AbstractRemoteAgentService implements IRemoteAgentService {
	constructor(
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IRemoteAuthorityResolverService remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ISignService signService: ISignService,
		@ILogService logService: ILogService,
	) {
		super(new BrowserSocketFactory(null), environmentService, productService, remoteAuthorityResolverService, signService, logService);
	}
}

class RemoteConnectionFailureNotificationContribution implements IWorkbenchContribution {

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
		if (!connectionData) {
			return null;
		}
		return URI.from({
			scheme: 'http',
			authority: `${connectionData.host}:${connectionData.port}`,
			path: `/version`
		});
	}

}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RemoteConnectionFailureNotificationContribution, 'RemoteConnectionFailureNotificationContribution', LifecyclePhase.Ready);
