/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { McpServerStatus } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { isAgentHostTarget } from '../../chat/common/chatSessionsService.js';
import { getChatSessionType } from '../../chat/common/model/chatUri.js';

export interface IMcpEditorAgentHostServer {
	readonly name: string;
	readonly enabled: boolean;
	readonly status: McpServerStatus;
}

export interface IMcpEditorAgentHostSessionServers {
	readonly resource: URI;
	readonly servers: readonly IMcpEditorAgentHostServer[];
}

export function getActiveAgentHostMcpSessionResource(sessionResource: URI | undefined): URI | undefined {
	return sessionResource && isAgentHostTarget(getChatSessionType(sessionResource))
		? sessionResource
		: undefined;
}

export function countRunningMcpServersInOtherSessions(currentSession: URI, sessions: readonly IMcpEditorAgentHostSessionServers[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const session of sessions) {
		if (isEqual(session.resource, currentSession)) {
			continue;
		}
		const running = new Set<string>();
		for (const server of session.servers) {
			if (server.enabled && server.status === McpServerStatus.Ready) {
				running.add(server.name);
			}
		}
		for (const name of running) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
	}
	return counts;
}
