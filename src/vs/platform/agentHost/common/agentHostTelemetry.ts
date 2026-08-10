/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AgentHostClientType } from './agentHostClientInfo.js';

export const enum AgentHostLaunchKind {
	VSCodeMainProcess = 'vscode_main_process',
	VSCodeCLI = 'vscode_cli',
	Unknown = 'unknown',
}

export const AgentHostLaunchKindEnvVar = 'VSCODE_AGENT_HOST_LAUNCH_KIND';

export const enum AgentHostClientConnectionKind {
	Local = 'local',
	DirectWebSocket = 'direct_websocket',
	DevTunnel = 'dev_tunnel',
	SSH = 'ssh',
	WSL = 'wsl',
	RemoteExtensionHost = 'remote_extension_host',
	WebPubSub = 'web_pub_sub',
	Unknown = 'unknown',
}

export const enum AgentHostTransportKind {
	MessagePort = 'message_port',
	WebSocket = 'websocket',
	Unknown = 'unknown',
}

export interface IAgentHostClientTelemetryContext {
	readonly clientType: AgentHostClientType;
	readonly connectionKind: AgentHostClientConnectionKind;
	readonly transportKind: AgentHostTransportKind;
	readonly hostLaunchKind: AgentHostLaunchKind;
}

export function createUnknownAgentHostClientTelemetryContext(clientType: AgentHostClientType): IAgentHostClientTelemetryContext {
	return {
		clientType,
		connectionKind: AgentHostClientConnectionKind.Unknown,
		transportKind: AgentHostTransportKind.Unknown,
		hostLaunchKind: AgentHostLaunchKind.Unknown,
	};
}

const CLIENT_CONNECTION_KIND_META_KEY = 'vscode.clientConnectionKind';

export function toClientConnectionTelemetryMeta(connectionKind: AgentHostClientConnectionKind | undefined): Record<string, unknown> | undefined {
	return connectionKind === undefined || connectionKind === AgentHostClientConnectionKind.Unknown
		? undefined
		: { [CLIENT_CONNECTION_KIND_META_KEY]: connectionKind };
}

export function readClientConnectionKind(meta: Record<string, unknown> | undefined): AgentHostClientConnectionKind {
	const value = meta?.[CLIENT_CONNECTION_KIND_META_KEY];
	switch (value) {
		case AgentHostClientConnectionKind.Local:
		case AgentHostClientConnectionKind.DirectWebSocket:
		case AgentHostClientConnectionKind.DevTunnel:
		case AgentHostClientConnectionKind.SSH:
		case AgentHostClientConnectionKind.WSL:
		case AgentHostClientConnectionKind.RemoteExtensionHost:
		case AgentHostClientConnectionKind.WebPubSub:
			return value;
		default:
			return AgentHostClientConnectionKind.Unknown;
	}
}

export function readAgentHostLaunchKind(value: string | undefined): AgentHostLaunchKind {
	switch (value) {
		case AgentHostLaunchKind.VSCodeMainProcess:
		case AgentHostLaunchKind.VSCodeCLI:
			return value;
		default:
			return AgentHostLaunchKind.Unknown;
	}
}
