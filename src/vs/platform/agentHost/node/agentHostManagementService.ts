/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, raceTimeout } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentCreateChatOptions, IAgentCreateSessionConfig } from '../common/agent.js';
import { IAgentHostInspectInfo, IAgentHostManagedSettingsDiagnostics, IAgentHostManagementService, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentHostSocketInfo, IAgentService, IConnectionTrackerService, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../common/agentService.js';
import { ISessionDataService } from '../common/sessionDataService.js';

const SHUTDOWN_DRAIN_TIMEOUT_MS = 1000;
const PROVIDER_SHUTDOWN_TIMEOUT_MS = 1500;
const SHUTDOWN_FLUSH_TIMEOUT_MS = 2500;

export class AgentHostManagementService implements IAgentHostManagementService {
	declare readonly _serviceBrand: undefined;

	private _shutdownPromise: Promise<void> | undefined;
	private _shuttingDown = false;
	private readonly _inflightMutations = new Set<Promise<unknown>>();

	constructor(
		private readonly _agentService: IAgentService,
		private readonly _connectionTrackerService: IConnectionTrackerService,
		private readonly _shutdownProtocolIngress: () => Promise<void>,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) { }

	createSessionWithExtensions(config: IAgentCreateSessionConfig): Promise<URI> {
		return this._runMutation(() => this._agentService.createSession(config));
	}

	createChatWithExtensions(session: URI, chat: URI, options: IAgentCreateChatOptions): Promise<void> {
		return this._runMutation(() => this._agentService.createChat(session, chat, options));
	}

	shutdown(): Promise<void> {
		if (!this._shutdownPromise) {
			this._shuttingDown = true;
			this._shutdownPromise = this._doShutdown();
		}
		return this._shutdownPromise;
	}

	private async _doShutdown(): Promise<void> {
		const protocolDrain = raceTimeout(this._shutdownProtocolIngress(), SHUTDOWN_DRAIN_TIMEOUT_MS, () => {
			this._logService.warn(`Agent Host protocol requests did not finish within ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms during shutdown.`);
		}).catch(error => this._logService.error('Agent Host protocol shutdown failed.', error));
		const managementDrain = raceTimeout(Promises.settled([...this._inflightMutations]), SHUTDOWN_DRAIN_TIMEOUT_MS, () => {
			this._logService.warn(`Agent Host management operations did not finish within ${SHUTDOWN_DRAIN_TIMEOUT_MS}ms during shutdown.`);
		}).catch(error => this._logService.error('An in-flight Agent Host management operation failed during shutdown.', error));
		await Promise.all([protocolDrain, managementDrain]);
		try {
			await raceTimeout(this._agentService.shutdown(), PROVIDER_SHUTDOWN_TIMEOUT_MS, () => {
				this._logService.warn(`Agent Host providers did not finish shutting down within ${PROVIDER_SHUTDOWN_TIMEOUT_MS}ms.`);
			});
		} catch (error) {
			this._logService.error('Agent Host provider shutdown failed.', error);
		}
		await raceTimeout(this._sessionDataService.whenIdle(), SHUTDOWN_FLUSH_TIMEOUT_MS, () => {
			this._logService.warn(`Agent Host session data did not finish flushing within ${SHUTDOWN_FLUSH_TIMEOUT_MS}ms during shutdown.`);
		});
	}

	private _runMutation<T>(operation: () => Promise<T>): Promise<T> {
		if (this._shuttingDown) {
			return Promise.reject(new Error('Agent Host is shutting down.'));
		}
		const promise = operation();
		this._inflightMutations.add(promise);
		const remove = () => this._inflightMutations.delete(promise);
		void promise.then(remove, remove);
		return promise;
	}

	getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> {
		return this._agentService.getNetworkDiagnosticsInfo();
	}

	getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> {
		return this._agentService.getManagedSettingsDiagnostics();
	}

	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._agentService.diagnosticsFetch(url);
	}

	collectDebugLogs(session: URI | undefined, kind: AgentHostDebugLogsArtifactKind): Promise<IAgentHostDebugLogsArtifact> {
		if (!this._agentService.collectDebugLogs) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._agentService.collectDebugLogs(session, kind);
	}

	readDebugLogsChunk(resource: URI, position: number): Promise<IAgentHostDebugLogsChunk> {
		if (!this._agentService.readDebugLogsChunk) {
			throw new Error('Agent Host debug log collection is unavailable');
		}
		return this._agentService.readDebugLogsChunk(resource, position);
	}

	startWebSocketServer(): Promise<IAgentHostSocketInfo> {
		return this._connectionTrackerService.startWebSocketServer();
	}

	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
		return this._connectionTrackerService.getInspectInfo(tryEnable);
	}
}
