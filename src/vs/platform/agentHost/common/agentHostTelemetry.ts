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
	readonly machineId?: string;
	readonly devDeviceId?: string;
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
const CLIENT_MACHINE_ID_META_KEY = 'vscode.clientMachineId';
const CLIENT_DEV_DEVICE_ID_META_KEY = 'vscode.clientDevDeviceId';

export function toClientTelemetryMeta(connectionKind: AgentHostClientConnectionKind | undefined, machineId: string | undefined, devDeviceId: string | undefined): Record<string, unknown> | undefined {
	const meta: Record<string, unknown> = {};
	if (connectionKind !== undefined && connectionKind !== AgentHostClientConnectionKind.Unknown) {
		meta[CLIENT_CONNECTION_KIND_META_KEY] = connectionKind;
	}
	if (machineId) {
		meta[CLIENT_MACHINE_ID_META_KEY] = machineId;
	}
	if (devDeviceId) {
		meta[CLIENT_DEV_DEVICE_ID_META_KEY] = devDeviceId;
	}
	return Object.keys(meta).length > 0 ? meta : undefined;
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

export function readClientMachineId(meta: Record<string, unknown> | undefined): string | undefined {
	return readClientTelemetryIdentity(meta, CLIENT_MACHINE_ID_META_KEY);
}

export function readClientDevDeviceId(meta: Record<string, unknown> | undefined): string | undefined {
	return readClientTelemetryIdentity(meta, CLIENT_DEV_DEVICE_ID_META_KEY);
}

function readClientTelemetryIdentity(meta: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = meta?.[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
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
