/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Environment variables used to forward the host's resolved telemetry
 * identifiers into the agent host process.
 *
 * The agent host runs in its own utility process and would otherwise compute
 * its own `machineId`/`devDeviceId` live from the MAC address / device-id store
 * on every launch. That can diverge from the workbench's persisted, state-backed
 * identifiers (e.g. when `state.json` was seeded by imaging/migration, or when
 * the "first valid MAC" changes), breaking per-user joins across event sources.
 *
 * To keep the identifiers consistent, the local starter
 * (`ElectronAgentHostStarter`, which runs in the main process where these are
 * already resolved) forwards them via these env vars, and
 * `createAgentHostTelemetryService` prefers them over recomputing.
 */
export const AgentHostMachineIdEnvKey = 'VSCODE_AGENT_HOST_MACHINE_ID';
export const AgentHostSqmIdEnvKey = 'VSCODE_AGENT_HOST_SQM_ID';
export const AgentHostDevDeviceIdEnvKey = 'VSCODE_AGENT_HOST_DEV_DEVICE_ID';

export interface IAgentHostForwardedTelemetryIds {
	readonly machineId: string;
	readonly sqmId: string;
	readonly devDeviceId: string;
}

/**
 * Builds the env var bag that forwards the resolved telemetry identifiers to
 * the agent host process. Empty identifiers are omitted so the host falls back
 * to computing them itself.
 */
export function buildAgentHostTelemetryIdEnv(ids: IAgentHostForwardedTelemetryIds): Record<string, string> {
	const env: Record<string, string> = {};
	if (ids.machineId) {
		env[AgentHostMachineIdEnvKey] = ids.machineId;
	}
	if (ids.sqmId) {
		env[AgentHostSqmIdEnvKey] = ids.sqmId;
	}
	if (ids.devDeviceId) {
		env[AgentHostDevDeviceIdEnvKey] = ids.devDeviceId;
	}
	return env;
}
