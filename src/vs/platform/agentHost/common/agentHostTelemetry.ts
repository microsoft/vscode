/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TelemetryConfiguration, TelemetryLevel } from '../../telemetry/common/telemetry.js';
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
const CLIENT_TELEMETRY_LEVEL_META_KEY = 'vscode.telemetryLevel';
const CLIENT_MACHINE_ID_META_KEY = 'vscode.clientMachineId';
const CLIENT_DEV_DEVICE_ID_META_KEY = 'vscode.clientDevDeviceId';

export function toAgentHostClientMeta(connectionKind: AgentHostClientConnectionKind | undefined, telemetryLevel: TelemetryLevel, machineId: string | undefined, devDeviceId: string | undefined): Record<string, unknown> {
	const meta: Record<string, unknown> = {
		[CLIENT_TELEMETRY_LEVEL_META_KEY]: telemetryLevelToAgentHostValue(telemetryLevel),
	};
	if (connectionKind !== undefined && connectionKind !== AgentHostClientConnectionKind.Unknown) {
		meta[CLIENT_CONNECTION_KIND_META_KEY] = connectionKind;
	}
	if (machineId) {
		meta[CLIENT_MACHINE_ID_META_KEY] = machineId;
	}
	if (devDeviceId) {
		meta[CLIENT_DEV_DEVICE_ID_META_KEY] = devDeviceId;
	}
	return meta;
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

export function readClientTelemetryLevel(meta: Record<string, unknown> | undefined): TelemetryLevel | undefined {
	const value = meta?.[CLIENT_TELEMETRY_LEVEL_META_KEY];
	switch (value) {
		case TelemetryConfiguration.OFF:
			return TelemetryLevel.NONE;
		case TelemetryConfiguration.CRASH:
			return TelemetryLevel.CRASH;
		case TelemetryConfiguration.ERROR:
			return TelemetryLevel.ERROR;
		case TelemetryConfiguration.ON:
			return TelemetryLevel.USAGE;
		default:
			return value === undefined ? undefined : TelemetryLevel.NONE;
	}
}

export function telemetryLevelToAgentHostValue(telemetryLevel: TelemetryLevel | undefined): TelemetryConfiguration {
	switch (telemetryLevel) {
		case TelemetryLevel.NONE:
			return TelemetryConfiguration.OFF;
		case TelemetryLevel.CRASH:
			return TelemetryConfiguration.CRASH;
		case TelemetryLevel.ERROR:
			return TelemetryConfiguration.ERROR;
		case TelemetryLevel.USAGE:
			return TelemetryConfiguration.ON;
		default:
			return TelemetryConfiguration.OFF;
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
