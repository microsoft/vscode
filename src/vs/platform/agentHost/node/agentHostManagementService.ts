/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IAgentCreateChatOptions, IAgentCreateSessionConfig } from '../common/agent.js';
import { IAgentHostInspectInfo, IAgentHostManagedSettingsDiagnostics, IAgentHostManagementService, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentHostSocketInfo, IAgentService, IConnectionTrackerService, type AgentHostDebugLogsArtifactKind, type IAgentHostDebugLogsArtifact, type IAgentHostDebugLogsChunk } from '../common/agentService.js';

export class AgentHostManagementService implements IAgentHostManagementService {
	declare readonly _serviceBrand: undefined;

	constructor(
		private readonly _agentService: IAgentService,
		private readonly _connectionTrackerService: IConnectionTrackerService,
	) { }

	createSessionWithExtensions(config: IAgentCreateSessionConfig): Promise<URI> {
		return this._agentService.createSession(config);
	}

	createChatWithExtensions(session: URI, chat: URI, options: IAgentCreateChatOptions): Promise<void> {
		return this._agentService.createChat(session, chat, options);
	}

	shutdown(): Promise<void> {
		return this._agentService.shutdown();
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
