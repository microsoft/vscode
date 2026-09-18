/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const relayVersion = 2;
export const maxTerminalSessions = 10;
export const relayApprovalPendingMessage = 'Another terminal is awaiting approval. Approve or dismiss it before connecting again.';
export const relayCapacityMessage = `The terminal bridge already has ${maxTerminalSessions} sessions. Close one before connecting again.`;
export const relayMaxBatchBytes = 256 * 1024;
export const relayMaxBatchMessages = 128;
export const relayPollMs = 10_000;
export const relayLeaseMs = 45_000;

export const relayCommands = {
	localVersion: '_experimentalTunnelTerminalLocal.version',
	localCreate: '_experimentalTunnelTerminalLocal.create',
	localStop: '_experimentalTunnelTerminalLocal.stop',
	remoteOpen: '_experimentalTunnelTerminal.open',
	remoteRead: '_experimentalTunnelTerminal.read',
	remoteWrite: '_experimentalTunnelTerminal.write',
	remoteClose: '_experimentalTunnelTerminal.close',
	remoteStop: '_experimentalTunnelTerminal.stopBridge',
} as const;

export interface RelayDescriptor {
	version: number;
	bridgeId: string;
}

export interface RelayEndpoint {
	version: number;
	url: string;
}

export interface RelayBatch {
	messages: string[];
	closeCode?: number;
}

export interface RemoteRelayTransport {
	open(): Promise<void>;
	read(): Promise<RelayBatch>;
	write(messages: string[]): Promise<void>;
	close(): Promise<void>;
}

export function validateSessionId(value: unknown): asserts value is string {
	if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
		throw new Error('Invalid terminal relay session identifier.');
	}
}

export function validateRelayMessages(value: unknown): asserts value is string[] {
	if (!Array.isArray(value) || value.length > relayMaxBatchMessages) {
		throw new Error('Invalid terminal relay batch.');
	}
	let bytes = 0;
	for (const message of value) {
		if (typeof message !== 'string') {
			throw new Error('Invalid terminal relay message.');
		}
		bytes += Buffer.byteLength(message);
	}
	if (bytes > relayMaxBatchBytes) {
		throw new Error('Terminal relay batch exceeds its size limit.');
	}
}

export function validateRelayBatch(value: unknown): asserts value is RelayBatch {
	if (typeof value !== 'object' || value === null || !('messages' in value)) {
		throw new Error('Invalid terminal relay response.');
	}
	validateRelayMessages(value.messages);
	if ('closeCode' in value && value.closeCode !== undefined &&
		(typeof value.closeCode !== 'number' || !Number.isInteger(value.closeCode) || value.closeCode < 1000 || value.closeCode > 4999)) {
		throw new Error('Invalid terminal relay close code.');
	}
}
