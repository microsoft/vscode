#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseArgs } from 'node:util';
import { openAgentHost, type AgentHostConnection, type ChooseHost, type Host, type HostSelection, type Machine } from './agentHost.js';
import { getAccessToken } from './auth.js';
import { BrokerError, connectBroker, readBrokers, removeDescriptor, startBroker, stopBroker, type BrokerDescriptor } from './broker.js';
import { choose, chooseRemoteHost, safeLabel } from './picker.js';
import { ensureSupportedRuntime } from './runtime.js';
import { requireTerminal, runTerminal } from './terminal.js';
import { ProtocolClient } from './wire.js';

const help = `Standalone Tunnel Terminal (Experimental)

Usage: tunnel [--tunnel NAME_OR_ID] [options]

A sole tunnel or existing remote host is selected automatically and announced.
With multiple choices, choose interactively. Use --new-host to request a new host.

  --list                    List machines without opening a shell
  --force-select            Show pickers even when only one choice exists
  --tunnel NAME_OR_ID        Select a tunnel without the machine picker
  --cluster ID              Disambiguate matching tunnels
  --instance ID             Select an existing gateway agent host
  --new-host                Explicitly request a dedicated agent host
  --no-prompt-prefix        Skip session-only PowerShell/Bash prompt initialization
  --cwd FILE_URI            Remote directory, e.g. file:///C:/work or file:///home/me
  --provider github|microsoft  Tunnel account provider (default: github)
  --client-id ID            Your GitHub OAuth app ID for device sign-in
  --no-reuse                Connect directly; do not use or start a shared connection
  --disconnect              Close shared connections (all, or the --tunnel one) and exit
  --help                    Show this help without authentication

Shared connections: the first connection to a machine starts a hidden local
broker that keeps the tunnel connected. Later "tunnel" runs, such as split
panes, reuse it and skip sign-in and discovery. With one shared connection
open, a plain "tunnel" reuses it. Each pane has its own shell; the broker
exits after 60 idle minutes or with --disconnect.

Authentication: reuse "gh auth login" by default, or use --client-id for
GitHub device sign-in. TUNNEL_ACCESS_TOKEN supplies an in-memory account
token for either provider. No VS Code extensions or local VS Code are needed.

Requires Node.js 22.x or 24.x and an agent-host-capable remote tunnel (launcher v5+, AHP 0.9.0).
Opens a NEW default shell, not an existing integrated terminal.
PowerShell and Bash prompts are prefixed with [machine-name]. The PowerShell
session's wsl wrapper preserves that prefix in interactive WSL Bash sessions.
Ctrl+C is sent to the remote shell. Ctrl+] exits locally and requests shell
disposal. No automatic reconnect or input replay; after a network failure
the remote shell may still be running. See README.md for host setup.
`;

/** Opens an agent-host connection through a running broker; the stream outlives nothing else. */
async function connectThroughBroker(descriptor: BrokerDescriptor, chooseHost: ChooseHost, signal: AbortSignal): Promise<AgentHostConnection> {
	const socket = await connectBroker(descriptor, signal);
	const connection = await openAgentHost(socket, descriptor.machine, chooseHost, signal);
	return {
		connection,
		dispose: async () => {
			connection.dispose();
			socket.destroy();
		},
	};
}

/** Returns undefined, after removing its descriptor, when the broker is no longer running. */
async function reuseBroker(descriptor: BrokerDescriptor, chooseHost: ChooseHost, signal: AbortSignal): Promise<AgentHostConnection | undefined> {
	try {
		return await connectThroughBroker(descriptor, chooseHost, signal);
	} catch (error) {
		if (error instanceof BrokerError) {
			throw new Error(`${error.message} The shared connection could not open a shell; run "tunnel --disconnect" to reset it, or use --no-reuse.`);
		}
		if (signal.aborted || !/ENOENT|ECONNREFUSED|EPIPE|ECONNRESET|Connection broker/.test(error instanceof Error ? error.message : '')) {
			throw error;
		}
		await removeDescriptor(descriptor);
		return undefined;
	}
}

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			help: { type: 'boolean' },
			list: { type: 'boolean' },
			'force-select': { type: 'boolean' },
			tunnel: { type: 'string' },
			cluster: { type: 'string' },
			instance: { type: 'string' },
			'new-host': { type: 'boolean' },
			'no-prompt-prefix': { type: 'boolean' },
			cwd: { type: 'string' },
			provider: { type: 'string', default: 'github' },
			'client-id': { type: 'string' },
			'no-reuse': { type: 'boolean' },
			disconnect: { type: 'boolean' },
		},
	});
	if (values.help) {
		process.stdout.write(help);
		return 0;
	}
	ensureSupportedRuntime();
	for (const [name, value] of Object.entries(values)) {
		if (typeof value === 'string' && !value.trim()) {
			throw new Error(`--${name} requires a non-empty value.`);
		}
	}
	if (values.provider !== 'github' && values.provider !== 'microsoft') {
		throw new Error('--provider must be github or microsoft.');
	}
	const provider = values.provider;
	if (values.instance && values['new-host']) {
		throw new Error('--instance and --new-host are mutually exclusive.');
	}
	if (values.cluster && !values.tunnel) {
		throw new Error('--cluster requires --tunnel.');
	}
	if (values.cwd) {
		const cwd = new URL(values.cwd);
		if (cwd.protocol !== 'file:' || cwd.username || cwd.password || cwd.search || cwd.hash) {
			throw new Error('--cwd must be a remote file URI without credentials, query, or fragment.');
		}
	}
	const matchesTunnel = (machine: Machine): boolean => !values.tunnel
		|| ((machine.name === values.tunnel || machine.id === values.tunnel) && (!values.cluster || machine.cluster === values.cluster));
	if (values.disconnect) {
		let closed = 0;
		for (const descriptor of (await readBrokers(provider)).filter(descriptor => matchesTunnel(descriptor.machine))) {
			if (await stopBroker(descriptor)) {
				closed++;
				console.error(`Closed the shared connection to ${safeLabel(descriptor.machine.name)}.`);
			}
		}
		if (!closed) {
			console.error('No shared tunnel connections are open.');
		}
		return 0;
	}
	if (!values.list) {
		requireTerminal(process.stdin, process.stdout);
	}
	const reuse = !values['no-reuse'];
	const abort = new AbortController();
	const onCancel = (): void => abort.abort();
	process.on('SIGINT', onCancel);
	process.on('SIGTERM', onCancel);
	process.on('SIGHUP', onCancel);
	const stopSetupSignals = (): void => {
		process.off('SIGINT', onCancel);
		process.off('SIGTERM', onCancel);
		process.off('SIGHUP', onCancel);
	};
	const chooseHost = async (hosts: Host[], canCreate: boolean): Promise<HostSelection> => {
		if (values.instance) { return { instanceId: values.instance }; }
		if (values['new-host']) { return { newDedicated: true }; }
		return chooseRemoteHost(hosts, canCreate, abort.signal, undefined, !values['force-select']);
	};
	const checkHostOptions = (machine: Machine): void => {
		if (machine.protocolVersion < 6 && (values.instance || values['new-host'])) {
			throw new Error('Host selection requires launcher protocol 6. This tunnel only supports the legacy default host.');
		}
	};
	try {
		let machine: Machine | undefined;
		let tunnel: AgentHostConnection | undefined;
		if (reuse && !values.list && !values['force-select']) {
			// A plain `tunnel` (for example a new split pane) reuses the only open shared connection.
			const candidates = (await readBrokers(provider)).filter(descriptor => matchesTunnel(descriptor.machine));
			if (candidates.length === 1) {
				const [descriptor] = candidates;
				checkHostOptions(descriptor.machine);
				console.error(`Reusing the shared connection to ${safeLabel(descriptor.machine.name)}...`);
				tunnel = await reuseBroker(descriptor, chooseHost, abort.signal);
				machine = tunnel && descriptor.machine;
			}
		}
		if (!tunnel || !machine) {
			// The Dev Tunnels SDK is only loaded when a new connection is needed.
			const { connectMachine, discoverMachines } = await import('./tunnel.js');
			const token = await getAccessToken({
				provider,
				clientId: values['client-id'],
				signal: abort.signal,
				log: message => console.error(safeLabel(message)),
			});
			const machines = await discoverMachines(token, provider, abort.signal);
			const describe = (machine: Machine): string =>
				`${machine.name} [${machine.id}, ${machine.cluster}] - ${machine.online ? 'online' : 'offline'}, launcher v${machine.protocolVersion}${machine.protocolVersion < 5 ? ' (incompatible)' : ''}`;
			if (!machines.length) {
				throw new Error('No VS Code tunnels found for this account. Start a tunnel on the remote machine and check the account/provider.');
			}
			if (values.list) {
				for (const machine of machines) {
					console.log(safeLabel(describe(machine)));
				}
				return 0;
			}
			const matching = values.tunnel ? machines.filter(matchesTunnel) : undefined;
			if (matching && matching.length !== 1) {
				throw new Error(matching.length ? 'Tunnel name is ambiguous. Use --tunnel ID and --cluster ID from --list.' : 'Tunnel not found. Run --list and check the account/provider.');
			}
			const selected = matching?.[0] ?? await choose('Your Machines', machines.map(machine => ({ label: describe(machine), value: machine })), abort.signal, undefined, !values['force-select']);
			machine = selected;
			if (!selected.online) {
				throw new Error('Selected machine is offline. Start its remote tunnel and try again.');
			}
			checkHostOptions(selected);
			console.error(`Connecting to ${safeLabel(selected.name)}...`);
			if (reuse) {
				const existing = (await readBrokers(provider)).find(descriptor =>
					descriptor.machine.id === selected.id && descriptor.machine.cluster === selected.cluster);
				tunnel = existing && await reuseBroker(existing, chooseHost, abort.signal);
				if (!tunnel) {
					let descriptor: BrokerDescriptor | undefined;
					try {
						descriptor = await startBroker({ token, provider, machine: selected, signal: abort.signal });
					} catch (error) {
						if (error instanceof BrokerError || abort.signal.aborted) {
							throw error;
						}
						console.error(`Unable to start a shared connection (${safeLabel(error instanceof Error ? error.message : 'unknown error')}); connecting directly.`);
					}
					if (descriptor) {
						tunnel = await connectThroughBroker(descriptor, chooseHost, abort.signal);
					}
				}
			}
			tunnel ??= await connectMachine(selected, token, provider, chooseHost, abort.signal);
		}
		try {
			stopSetupSignals();
			console.error('Opening a new default shell as the remote host user. Ctrl+] closes it; Ctrl+C goes to the shell.');
			const client = new ProtocolClient(tunnel.connection);
			try {
				return await runTerminal(client, {
					cwd: values.cwd,
					tunnelName: values['no-prompt-prefix'] ? undefined : machine.name,
				});
			} finally {
				client.dispose();
			}
		} finally {
			await tunnel.dispose();
		}
	} finally {
		stopSetupSignals();
	}
}

void main().then(code => { process.exitCode = code; }, error => {
	console.error(`\n${safeLabel(error instanceof Error ? error.message : 'Terminal client failed.')}`);
	process.exitCode = 1;
});

