/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IAgentCreateChatOptions, IAgentCreateSessionConfig, IAgentHostInspectInfo, IAgentHostManagementService, IAgentHostNetworkDiagnosticsInfo, IAgentHostNetworkFetchResult, IAgentHostSocketInfo, IAgentService, IConnectionTrackerService } from '../common/agentService.js';

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

	diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> {
		return this._agentService.diagnosticsFetch(url);
	}

	startWebSocketServer(): Promise<IAgentHostSocketInfo> {
		return this._connectionTrackerService.startWebSocketServer();
	}

	getInspectInfo(tryEnable: boolean): Promise<IAgentHostInspectInfo | undefined> {
		return this._connectionTrackerService.getInspectInfo(tryEnable);
	}
}
