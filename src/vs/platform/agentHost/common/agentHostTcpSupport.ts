/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../base/common/observable.js';
import { AgentHostClientConnectionKind } from './agentHostTelemetry.js';
import type { IAgentConnection } from './agentService.js';

export const enum AgentHostTcpSupport {
	/** The connection is absent or has not completed its handshake. */
	Unknown = 'unknown',
	Supported = 'supported',
	Unsupported = 'unsupported',
}

/**
 * Whether {@link IAgentConnection.openTcpConnection} can succeed on a
 * connection: the host advertises TCP and the transport preserves the message
 * sizes windowed delivery relies on (relay transports do not).
 */
export function getAgentHostTcpSupport(connection: IAgentConnection | undefined, reader: IReader | undefined): AgentHostTcpSupport {
	if (!connection) {
		return AgentHostTcpSupport.Unknown;
	}
	if (!connection.openTcpConnection
		|| connection.clientConnectionKind === AgentHostClientConnectionKind.WebPubSub
		|| connection.clientConnectionKind === AgentHostClientConnectionKind.MissionControl) {
		return AgentHostTcpSupport.Unsupported;
	}
	const initializeResult = connection.initializeResult.read(reader);
	if (!initializeResult) {
		return AgentHostTcpSupport.Unknown;
	}
	return initializeResult.tcpConnections ? AgentHostTcpSupport.Supported : AgentHostTcpSupport.Unsupported;
}
