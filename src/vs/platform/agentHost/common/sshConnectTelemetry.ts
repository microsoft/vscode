/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError } from '../../../base/common/errors.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { RemoteAgentHostConnectionStatus } from './remoteAgentHostService.js';
import { getSSHConnectFailureCode, isSSHAuthenticationFailedError, isSSHHostKeyDeniedError, SSHConnectFailureCode } from './sshRemoteAgentHost.js';
import { PROTOCOL_VERSION } from './state/protocol/version/registry.js';

export type SSHConnectErrorCategory =
	| 'authentication'
	| 'cancelled'
	| 'handshake'
	| 'hostKeyDenied'
	| 'hostKeyFormat'
	| 'incompatible'
	| 'kexAlgorithm'
	| 'network'
	| 'other';

/** The stage a failed SSH connect attempt reached. `protocol` is the Agent Host protocol handshake over the relay. */
export type SSHConnectStage = 'config' | 'ssh' | 'cliInstall' | 'agentHost' | 'relay' | 'protocol' | 'unknown';

const failureCodes: Record<SSHConnectFailureCode, { readonly stage: SSHConnectStage; readonly category: SSHConnectErrorCategory }> = {
	[SSHConnectFailureCode.Configuration]: { stage: 'config', category: 'other' },
	[SSHConnectFailureCode.Connection]: { stage: 'ssh', category: 'other' },
	[SSHConnectFailureCode.Network]: { stage: 'ssh', category: 'network' },
	[SSHConnectFailureCode.HostKeyFormat]: { stage: 'ssh', category: 'hostKeyFormat' },
	[SSHConnectFailureCode.KexAlgorithm]: { stage: 'ssh', category: 'kexAlgorithm' },
	[SSHConnectFailureCode.Handshake]: { stage: 'ssh', category: 'handshake' },
	[SSHConnectFailureCode.CliInstall]: { stage: 'cliInstall', category: 'other' },
	[SSHConnectFailureCode.AgentHost]: { stage: 'agentHost', category: 'other' },
	[SSHConnectFailureCode.Relay]: { stage: 'relay', category: 'other' },
};

/**
 * Classifies a failed SSH connect attempt from the error's name and the
 * shared process's {@link SSHConnectFailureCode} only, since messages are
 * localized, wrapped or contain remote command output.
 */
export function classifySSHConnectError(error: unknown, duringHandshake: boolean): { readonly errorCategory: SSHConnectErrorCategory; readonly stage: SSHConnectStage } {
	const code = getSSHConnectFailureCode(error);
	const failure = code && failureCodes[code];
	const hostKeyDenied = isSSHHostKeyDeniedError(error);
	const authentication = isSSHAuthenticationFailedError(error);

	let errorCategory: SSHConnectErrorCategory;
	if (isCancellationError(error)) {
		errorCategory = 'cancelled';
	} else if (hostKeyDenied) {
		errorCategory = 'hostKeyDenied';
	} else if (authentication) {
		errorCategory = 'authentication';
	} else if (RemoteAgentHostConnectionStatus.fromConnectError(error, [PROTOCOL_VERSION])) {
		errorCategory = 'incompatible';
	} else {
		errorCategory = failure?.category ?? 'other';
	}

	// Errors identified by name, which carries no failure code across IPC, come from the SSH connection.
	const stage = duringHandshake ? 'protocol' : failure?.stage ?? (hostKeyDenied || authentication ? 'ssh' : 'unknown');
	return { errorCategory, stage };
}

type SSHConnectAttemptEvent = {
	operation: string;
	userInitiated: boolean;
	attempt: number;
	durationMs: number;
	success: boolean;
	willRetry: boolean;
	errorCategory: string;
	stage: string;
};

type SSHConnectAttemptClassification = {
	owner: 'roblourens';
	comment: 'Tracks SSH agent-host connection attempts, user-initiated and automatic, so connection and reconnection reliability can be measured.';
	operation: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether this was an explicit connection (connect) or a connection to a saved SSH host, including automatic ones (reconnect).' };
	userInitiated: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the attempt was initiated by an explicit user action rather than automatic connection or reconnection.' };
	attempt: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Attempt number within the current connection cycle, starting at one and counting automatic retries.' };
	durationMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration of the complete SSH and Agent Host protocol connection attempt in milliseconds.' };
	success: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the connection completed through Agent Host protocol initialization.' };
	willRetry: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether another automatic attempt was scheduled, or the connection is restoring itself, after this failed attempt.' };
	errorCategory: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Bounded failure category (authentication, cancelled, handshake, hostKeyDenied, hostKeyFormat, incompatible, kexAlgorithm, network, or other); empty on success.' };
	stage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Stage the failed attempt reached (config, ssh, cliInstall, agentHost, relay, protocol, or unknown); empty on success.' };
};

export function logSSHConnectAttempt(telemetryService: ITelemetryService, data: {
	operation: 'connect' | 'reconnect';
	userInitiated: boolean;
	attempt: number;
	durationMs: number;
	success: boolean;
	willRetry: boolean;
	errorCategory?: SSHConnectErrorCategory;
	stage?: SSHConnectStage;
}): void {
	telemetryService.publicLog2<SSHConnectAttemptEvent, SSHConnectAttemptClassification>('vscodeAgents.sshConnect/attempt', {
		...data,
		errorCategory: data.errorCategory ?? '',
		stage: data.stage ?? '',
	});
}
