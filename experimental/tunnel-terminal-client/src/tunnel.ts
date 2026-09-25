/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'node:crypto';
import { Duplex } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { RelayConnectionError, TunnelRelayTunnelClient } from '@microsoft/dev-tunnels-connections';
import type { Tunnel } from '@microsoft/dev-tunnels-contracts';
import { ManagementApiVersions, TunnelAccessTokenProperties, TunnelManagementHttpClient } from '@microsoft/dev-tunnels-management';
import { CancellationTokenSource } from '@microsoft/dev-tunnels-ssh';
import WebSocket from 'ws';
import { deadline, maxBufferedBytes, MessageConnection, record, text, timeoutMs } from './wire.js';

const agentHostPort = 31546;
const launcherLabel = 'vscode-server-launcher';

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

export function hasAgentHostPort(tunnel: Tunnel): boolean {
	return tunnel.ports?.some(port => port.portNumber === agentHostPort) ?? false;
}

function redactRelayDiagnostic(message: string, secrets: readonly string[]): string {
	let result = message;
	for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length)) {
		result = result.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]');
	}
	return stripVTControlCharacters(result)
		.replace(/\b(?:authorization|proxy-authorization)\s*[:=][^\r\n]*/gi, '[authorization redacted]')
		.replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '[URL redacted]')
		.replace(/\b(?:access_token|refresh_token|connectionToken|device_code|tkn|sig|password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '[credential redacted]')
		.replace(/\b(?:gh[opusr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, '[token redacted]')
		.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
		.slice(0, 1200);
}

export function relayConnectionFailure(error: unknown, secrets: readonly string[] = []): string {
	const detail = error instanceof Error ? error.message : '';
	if (detail.includes('No hosts are currently accepting connections')) {
		return 'The tunnel has no active remote host. Restart the remote tunnel/agent-host command and keep it running.';
	}
	if (detail.includes('multiple hosts for the tunnel')) {
		return 'The tunnel has multiple active relay hosts, which this prototype cannot disambiguate yet. Stop stale tunnel processes and leave only the intended remote host running.';
	}
	if (detail.includes('not currently accepting Tunnel relay connections') || detail.includes('endpoint URI is missing')) {
		return 'The active remote host does not offer a supported Dev Tunnels relay endpoint. Update and restart its VS Code CLI/build.';
	}
	const sdkStatus = error instanceof RelayConnectionError ? error.errorContext.statusCode : undefined;
	const matchedStatus = /\b(?:HTTP|status(?: code)?|Not authorized|Forbidden)[\s:(]*(?<status>[45]\d\d)\b/i.exec(detail)?.groups?.status;
	const status = sdkStatus ?? (matchedStatus ? Number(matchedStatus) : undefined);
	if (status === 401 || status === 403) {
		return `The tunnel relay rejected the connection (HTTP ${status}). Discovery succeeded, but relay authorization did not. Check tunnel connect permissions and organization access policies; this does not by itself establish an account mismatch.`;
	}
	const diagnostic = redactRelayDiagnostic(detail || 'The SDK did not provide an error message.', secrets);
	let summary = 'Unable to connect to the tunnel relay.';
	if (status) {
		summary += ` HTTP ${status}.`;
	} else if (/certificate|self.signed|CERT_|UNABLE_TO_VERIFY/i.test(detail)) {
		summary += ' TLS certificate validation failed. Check the local trust store and any corporate proxy; do not disable certificate verification.';
	} else if (/ENOTFOUND|EAI_AGAIN/.test(detail)) {
		summary += ' DNS lookup failed on this machine.';
	} else if (/timed? ?out|ETIMEDOUT/i.test(detail)) {
		summary += ' The connection timed out; check the local network/proxy and remote host availability.';
	}
	return `${summary} SDK reason: ${diagnostic} (Node ${process.version}).`;
}

function managementClient(token: string, provider: 'github' | 'microsoft'): TunnelManagementHttpClient {
	return new TunnelManagementHttpClient(
		'experimental-tunnel-terminal-client/0.0.1',
		ManagementApiVersions.Version20230927preview,
		async () => `${provider === 'github' ? 'github' : 'Bearer'} ${token}`,
	);
}

export function parseMachine(tunnel: Tunnel): Machine {
	if (!tunnel.tunnelId || !tunnel.clusterId) {
		throw new Error('Tunnel service returned a machine without an ID or cluster.');
	}
	const labels = tunnel.labels ?? [];
	const protocolVersions = labels.filter(label => /^protocolv\d+$/.test(label)).map(label => Number(label.slice(9)));
	const hostCount = tunnel.status?.hostConnectionCount;
	return {
		id: tunnel.tunnelId,
		cluster: tunnel.clusterId,
		name: labels.find(label => label !== launcherLabel && !label.startsWith('_') && !label.startsWith('protocolv')) ?? tunnel.name ?? tunnel.tunnelId,
		protocolVersion: protocolVersions.length ? Math.max(...protocolVersions) : 2,
		online: (typeof hostCount === 'number' ? hostCount : hostCount?.current ?? 0) > 0,
	};
}

export async function discoverMachines(token: string, provider: 'github' | 'microsoft', signal: AbortSignal): Promise<Machine[]> {
	const cancellation = new CancellationTokenSource();
	try {
		const tunnels = await deadline(managementClient(token, provider).listTunnels(undefined, undefined, {
			labels: [launcherLabel],
			requireAllLabels: true,
		}, cancellation.token), 'Tunnel discovery', signal);
		return tunnels.map(parseMachine).sort((a, b) => a.name.localeCompare(b.name));
	} catch {
		throw new Error(signal.aborted
			? 'Tunnel discovery cancelled.'
			: 'Tunnel discovery failed. Check network access and that your account/token has access to VS Code Remote Tunnels.');
	} finally {
		cancellation.cancel();
		cancellation.dispose();
	}
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
	choose: (hosts: Host[], canCreate: boolean) => Promise<HostSelection>,
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

export async function connectMachine(
	machine: Machine,
	token: string,
	provider: 'github' | 'microsoft',
	choose: (hosts: Host[], canCreate: boolean) => Promise<HostSelection>,
	signal: AbortSignal,
): Promise<{ connection: MessageConnection; dispose(): Promise<void> }> {
	if (machine.protocolVersion < 5) {
		throw new Error('This tunnel predates agent-host support (launcher protocol 5 required). Update the remote tunnel CLI/build.');
	}
	const management = managementClient(token, provider);
	const relay = new TunnelRelayTunnelClient(management);
	const cancellation = new CancellationTokenSource();
	relay.acceptLocalConnectionsForForwardedPorts = false;
	let connection: MessageConnection | undefined;
	let stream: Duplex | undefined;
	let disposed = false;
	const onAbort = (): void => {
		cancellation.cancel();
		connection?.dispose();
		stream?.destroy();
	};
	signal.addEventListener('abort', onAbort, { once: true });
	const dispose = async (): Promise<void> => {
		if (disposed) { return; }
		disposed = true;
		signal.removeEventListener('abort', onAbort);
		cancellation.cancel();
		connection?.dispose();
		stream?.destroy();
		try {
			await relay.dispose();
		} finally {
			cancellation.dispose();
		}
	};
	try {
		let tunnel: Tunnel | null;
		try {
			tunnel = await deadline(management.getTunnel({ tunnelId: machine.id, clusterId: machine.cluster }, {
				includePorts: true,
				tokenScopes: ['connect'],
			}, cancellation.token), 'Tunnel lookup', signal);
		} catch {
			throw new Error(signal.aborted
				? 'Tunnel lookup cancelled.'
				: 'Unable to retrieve tunnel connection metadata. Check network access and that the local account owns or can connect to this tunnel.');
		}
		if (!tunnel) {
			throw new Error('The selected tunnel no longer exists. Run --list again.');
		}
		if (!hasAgentHostPort(tunnel)) {
			throw new Error(
				'The selected tunnel does not publish agent-host port 31546. '
				+ 'On the remote machine, use a current CLI and run: '
				+ 'code agent host --new-instance --foreground --tunnel --name terminal-client',
			);
		}
		const connectToken = TunnelAccessTokenProperties.getTunnelAccessToken(tunnel, 'connect');
		if (!connectToken) {
			throw new Error(
				'The tunnel service did not issue a connect token for this account. '
				+ 'Confirm the local GitHub identity owns or has connect access to this tunnel and matches the account shown by "code tunnel user show" remotely.',
			);
		}
		try {
			TunnelAccessTokenProperties.validateTokenExpiration(connectToken);
		} catch {
			throw new Error('The tunnel service issued an expired connect token. Check the local clock, restart the remote tunnel, and try discovery again.');
		}
		try {
			await deadline(relay.connect(tunnel, { enableRetry: false, enableReconnect: false }, cancellation.token), 'Tunnel relay connection', signal);
		} catch (error) {
			const secrets = [token, ...[tunnel, relay.tunnel].flatMap(value => [
				...Object.values(value?.accessTokens ?? {}),
				...(value?.ports ?? []).flatMap(port => Object.values(port.accessTokens ?? {})),
			])];
			throw new Error(signal.aborted ? 'Tunnel relay connection cancelled.' : relayConnectionFailure(error, secrets));
		}
		try {
			await deadline(relay.waitForForwardedPort(agentHostPort, cancellation.token), 'Agent-host port availability', signal);
		} catch {
			throw new Error(signal.aborted
				? 'Agent-host port wait cancelled.'
				: 'The tunnel advertises port 31546, but its remote host is not accepting it. Restart the remote tunnel/agent-host command and keep that process running.');
		}
		try {
			stream = await deadline(relay.connectToForwardedPort(agentHostPort, cancellation.token), 'Agent-host port connection', signal);
		} catch {
			throw new Error(signal.aborted
				? 'Agent-host port connection cancelled.'
				: 'The tunnel publishes port 31546, but opening its forwarded stream failed. Restart the remote tunnel/agent-host command and check its logs.');
		}
		// The SDK carries this WebSocket over its authenticated relay stream, not local TCP.
		const version = parseMachine(tunnel).protocolVersion;
		if (version < 5) {
			throw new Error('The tunnel no longer advertises agent-host support. Refresh the machine list.');
		}
		let path = '/agent-host/select';
		if (version < 6) {
			let connectionToken = createHash('sha256').update(machine.id).digest('base64url');
			if (connectionToken.startsWith('-')) {
				connectionToken = `a${connectionToken}`;
			}
			path = `/?tkn=${encodeURIComponent(connectionToken)}`;
		}
		connection = await openSocket(stream, path, signal);
		if (version >= 6) {
			await selectHost(connection, choose, signal);
		}
		return { connection, dispose };
	} catch (error) {
		try {
			await dispose();
		} catch {
			throw new Error('Tunnel connection failed and the relay could not be cleanly disposed.');
		}
		throw error;
	}
}
