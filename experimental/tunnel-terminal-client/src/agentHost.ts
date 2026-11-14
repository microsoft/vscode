/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { Duplex } from 'node:stream';
import WebSocket from 'ws';
import { deadline, maxBufferedBytes, MessageConnection, record, text, timeoutMs } from './wire.js';

// This module must not import the Dev Tunnels SDK: reusing a brokered connection skips loading it.

export const agentHostPort = 31546;

export interface Machine {
	id: string;
	cluster: string;
	name: string;
	protocolVersion: number;
	online: boolean;
}

export interface Host {
	instanceId: string;
	type: 'editor' | 'standalone';
	pid: number;
}

export type HostSelection = { instanceId: string } | { newDedicated: true };

export type ChooseHost = (hosts: Host[], canCreate: boolean) => Promise<HostSelection>;

export interface AgentHostConnection {
	connection: MessageConnection;
	dispose(): Promise<void>;
}

export async function openSocket(stream: Duplex, path: string, signal?: AbortSignal): Promise<MessageConnection> {
	const socket = new WebSocket(`ws://localhost:${agentHostPort}${path}`, {
		createConnection: () => stream,
		followRedirects: false,
		handshakeTimeout: timeoutMs,
		maxPayload: maxBufferedBytes,
		perMessageDeflate: false,
	});
	const connection = new MessageConnection(socket);
	let onOpen: (() => void) | undefined;
	let onError: (() => void) | undefined;
	let onClose: (() => void) | undefined;
	try {
		await deadline(new Promise<void>((resolve, reject) => {
			onOpen = resolve;
			onError = () => reject(new Error('Agent-host WebSocket upgrade failed. Check tunnel/host compatibility.'));
			onClose = () => reject(new Error('Agent-host connection closed during upgrade.'));
			socket.once('open', onOpen);
			socket.once('error', onError);
			socket.once('close', onClose);
		}), 'Agent-host WebSocket upgrade', signal);
		return connection;
	} catch (error) {
		connection.dispose();
		stream.destroy();
		throw error;
	} finally {
		if (onOpen) { socket.off('open', onOpen); }
		if (onError) { socket.off('error', onError); }
		if (onClose) { socket.off('close', onClose); }
	}
}

export async function selectHost(
	connection: MessageConnection,
	choose: ChooseHost,
	signal: AbortSignal,
): Promise<void> {
	const inventory = await deadline(connection.read(), 'Host inventory', signal);
	if (!Array.isArray(inventory.endpoints)) {
		throw new Error('Malformed gateway inventory: missing endpoints.');
	}
	const hosts = inventory.endpoints.map((value): Host => {
		const entry = record(value, 'host');
		if ((entry.type !== 'editor' && entry.type !== 'standalone') || typeof entry.pid !== 'number' || !Number.isInteger(entry.pid)) {
			throw new Error('Malformed gateway host.');
		}
		return { instanceId: text(entry.instanceId, 'host ID'), type: entry.type, pid: entry.pid };
	});
	const selection = await choose(hosts, inventory.delegatedInstanceId === undefined);
	if ('instanceId' in selection) {
		if (!hosts.some(host => host.instanceId === selection.instanceId)) {
			throw new Error('Selected host is not in the gateway inventory.');
		}
	} else if (inventory.delegatedInstanceId !== undefined) {
		throw new Error('This tunnel cannot create a dedicated host.');
	}
	connection.send(selection);
	const response = await deadline(connection.read(), 'Host selection/startup', signal, 120_000);
	if (response.ok !== true) {
		throw new Error(`Gateway rejected host selection: ${text(response.error, 'gateway error')}`);
	}
	const selected = record(response.selected, 'selected host');
	if ((selected.type !== 'editor' && selected.type !== 'standalone') || selected.role !== 'primary'
		|| (selected.lifecycle !== 'external' && selected.lifecycle !== 'managed') || typeof selected.instanceId !== 'string') {
		throw new Error('Malformed gateway selection acknowledgement.');
	}
	if (('instanceId' in selection && selected.instanceId !== selection.instanceId)
		|| ('newDedicated' in selection && selected.type !== 'standalone')) {
		throw new Error('Gateway selected a different host than requested.');
	}
}

/**
 * Upgrades a stream to the agent-host port into a protocol connection and, for launcher
 * protocol 6+, selects the remote host. The stream is destroyed if this fails.
 */
export async function openAgentHost(stream: Duplex, machine: Machine, choose: ChooseHost, signal: AbortSignal): Promise<MessageConnection> {
	if (machine.protocolVersion < 5) {
		stream.destroy();
		throw new Error('The tunnel no longer advertises agent-host support. Refresh the machine list.');
	}
	let path = '/agent-host/select';
	if (machine.protocolVersion < 6) {
		let connectionToken = createHash('sha256').update(machine.id).digest('base64url');
		if (connectionToken.startsWith('-')) {
			connectionToken = `a${connectionToken}`;
		}
		path = `/?tkn=${encodeURIComponent(connectionToken)}`;
	}
	const connection = await openSocket(stream, path, signal);
	if (machine.protocolVersion >= 6) {
		try {
			await selectHost(connection, choose, signal);
		} catch (error) {
			connection.dispose();
			stream.destroy();
			throw error;
		}
	}
	return connection;
}
