/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { basename } from '../../../../../base/common/resources.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { localize } from '../../../../../nls.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { agentsWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { AhpJsonlLogger } from '../../../../../platform/agentHost/common/ahpJsonlLogger.js';
import { DEV_CONTAINER_AGENT_HOST_CHANNEL, IDevContainerAgentHostMainService } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { RelayTransport } from '../../../../../platform/agentHost/common/relayTransport.js';
import { RemoteAgentHostProtocolClient } from '../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ISharedProcessService } from '../../../../../platform/ipc/electron-browser/services.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../../platform/environment/common/environment.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { IDevContainerAgentHostConnection, IDevContainerAgentHostConnector, IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';

class DevContainerAgentHostConnector implements IDevContainerAgentHostConnector {
	private readonly _mainService: IDevContainerAgentHostMainService;

	constructor(
		@ISharedProcessService sharedProcessService: ISharedProcessService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
	) {
		this._mainService = ProxyChannel.toService<IDevContainerAgentHostMainService>(
			sharedProcessService.getChannel(DEV_CONTAINER_AGENT_HOST_CHANNEL),
		);
	}

	async connect(workspaceUri: URI, token: CancellationToken): Promise<IDevContainerAgentHostConnection> {
		if (workspaceUri.scheme !== Schemas.file) {
			throw new Error(localize('devContainerAgentHost.localWorkspaceRequired', "Dev Container Agent Hosts require a local file workspace."));
		}
		const connectionId = generateUuid();
		const cancellationListener = token.onCancellationRequested(() => {
			void this._mainService.disconnect(connectionId).catch(error => {
				this._logService.warn('[DevContainerAgentHostConnector] Failed to cancel connection', error);
			});
		});
		let protocolClient: RemoteAgentHostProtocolClient | undefined;
		try {
			const result = await this._mainService.connect({
				connectionId,
				workspaceFolder: workspaceUri.fsPath,
				name: `${basename(workspaceUri)} Dev Container`,
			});
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			const logger = this._configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId)
				? this._instantiationService.createInstance(AhpJsonlLogger, {
					logsHome: this._environmentService.logsHome,
					connectionId,
					transport: 'devcontainer',
				})
				: undefined;
			const transport = this._instantiationService.createInstance(
				RelayTransport,
				connectionId,
				this._mainService,
				logger,
				this._logService,
				'[DevContainerRelayTransport]',
				AgentHostClientConnectionKind.DevContainer,
			);
			protocolClient = this._instantiationService.createInstance(
				RemoteAgentHostProtocolClient,
				result.address,
				transport,
				undefined,
				undefined,
				agentsWindowAgentHostClientInfo,
			);
			await protocolClient.connect();
			if (token.isCancellationRequested) {
				throw new CancellationError();
			}

			return {
				address: result.address,
				name: result.name,
				connection: protocolClient,
				transportDisposable: toDisposable(() => {
					void this._mainService.disconnect(connectionId).catch(error => {
						this._logService.warn('[DevContainerAgentHostConnector] Failed to disconnect transport', error);
					});
				}),
				workspaceUri: workspaceUri.with({
					scheme: AGENT_HOST_SCHEME,
					authority: agentHostAuthority(result.address),
					path: result.remoteWorkspaceFolder,
				}),
				defaultDirectory: result.remoteWorkspaceFolder,
			};
		} catch (error) {
			protocolClient?.dispose();
			await this._mainService.disconnect(connectionId);
			throw error;
		} finally {
			cancellationListener.dispose();
		}
	}
}

class DevContainerAgentHostConnectorContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.contrib.devContainerAgentHostConnector';

	constructor(
		@IDevContainerAgentHostService service: IDevContainerAgentHostService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._register(service.registerConnector(instantiationService.createInstance(DevContainerAgentHostConnector)));
	}
}

registerWorkbenchContribution2(
	DevContainerAgentHostConnectorContribution.ID,
	DevContainerAgentHostConnectorContribution,
	WorkbenchPhase.AfterRestored,
);
