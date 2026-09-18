#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseArgs } from 'node:util';
import { getAccessToken } from './auth.js';
import { choose, safeLabel } from './picker.js';
import { ensureSupportedRuntime } from './runtime.js';
import { connectMachine, discoverMachines, type Host, type HostSelection } from './tunnel.js';
import { requireTerminal, runTerminal } from './terminal.js';
import { ProtocolClient } from './wire.js';

const help = `Standalone Tunnel Terminal (Experimental)

Usage: tunnel [--tunnel NAME_OR_ID] [options]

With no arguments, choose a remote tunnel interactively.

  --list                    List machines without opening a shell
  --tunnel NAME_OR_ID        Select a tunnel without the machine picker
  --cluster ID              Disambiguate matching tunnels
  --instance ID             Select an existing gateway agent host
  --new-host                Explicitly request a dedicated agent host
  --cwd FILE_URI            Remote directory, e.g. file:///C:/work or file:///home/me
  --provider github|microsoft  Tunnel account provider (default: github)
  --client-id ID            Your GitHub OAuth app ID for device sign-in
  --help                    Show this help without authentication

Authentication: reuse "gh auth login" by default, or use --client-id for
GitHub device sign-in. TUNNEL_ACCESS_TOKEN supplies an in-memory account
token for either provider. No VS Code extensions or local VS Code are needed.

Requires Node.js 22.x or 24.x and an agent-host-capable remote tunnel (launcher v5+, AHP 0.9.0).
Opens a NEW default shell, not an existing integrated terminal.
Ctrl+C is sent to the remote shell. Ctrl+] exits locally and requests shell
disposal. No automatic reconnect or input replay; after a network failure
the remote shell may still be running. See README.md for host setup.
`;

async function main(): Promise<number> {
	const { values } = parseArgs({
		options: {
			help: { type: 'boolean' },
			list: { type: 'boolean' },
			tunnel: { type: 'string' },
			cluster: { type: 'string' },
			instance: { type: 'string' },
			'new-host': { type: 'boolean' },
			cwd: { type: 'string' },
			provider: { type: 'string', default: 'github' },
			'client-id': { type: 'string' },
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
	if (!values.list) {
		requireTerminal(process.stdin, process.stdout);
	}
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
	try {
		const token = await getAccessToken({
			provider: values.provider,
			clientId: values['client-id'],
			signal: abort.signal,
			log: message => console.error(safeLabel(message)),
		});
		const machines = await discoverMachines(token, values.provider, abort.signal);
		const describe = (machine: typeof machines[number]): string =>
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
		const matching = values.tunnel ? machines.filter(machine =>
			(machine.name === values.tunnel || machine.id === values.tunnel) && (!values.cluster || machine.cluster === values.cluster)
		) : undefined;
		if (matching && matching.length !== 1) {
			throw new Error(matching.length ? 'Tunnel name is ambiguous. Use --tunnel ID and --cluster ID from --list.' : 'Tunnel not found. Run --list and check the account/provider.');
		}
		const machine = matching?.[0] ?? await choose('Your Machines', machines.map(machine => ({ label: describe(machine), value: machine })), abort.signal);
		if (!machine.online) {
			throw new Error('Selected machine is offline. Start its remote tunnel and try again.');
		}
		if (machine.protocolVersion < 6 && (values.instance || values['new-host'])) {
			throw new Error('Host selection requires launcher protocol 6. This tunnel only supports the legacy default host.');
		}
		const chooseHost = async (hosts: Host[], canCreate: boolean): Promise<HostSelection> => {
			if (values.instance) { return { instanceId: values.instance }; }
			if (values['new-host']) { return { newDedicated: true }; }
			const items: { label: string; value: HostSelection }[] = hosts.map(host => ({
				label: `${host.type} host, PID ${host.pid}, instance ${host.instanceId}`,
				value: { instanceId: host.instanceId },
			}));
			if (canCreate) {
				items.push({ label: 'Start a dedicated agent host (may download/start server components)', value: { newDedicated: true } });
			}
			return choose('Select Remote Host', items, abort.signal);
		};
		console.error(`Connecting to ${safeLabel(machine.name)}...`);
		const tunnel = await connectMachine(machine, token, values.provider, chooseHost, abort.signal);
		try {
			stopSetupSignals();
			console.error('Opening a new default shell as the remote host user. Ctrl+] closes it; Ctrl+C goes to the shell.');
			const client = new ProtocolClient(tunnel.connection);
			try {
				return await runTerminal(client, { cwd: values.cwd });
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
