/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ChildProcess, SpawnOptions } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { LogLevel } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ActiveTunnelMode, INACTIVE_TUNNEL_MODE } from '../../common/remoteTunnel.js';
import { CodeTunnelCli, CodeTunnelSpawn } from '../../node/codeTunnelCliProcess.js';
import { resolveTunnelProcessMode, TunnelProcessCoordinator } from '../../node/tunnelProcessCoordinator.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

interface TestChildProcess {
	readonly child: ChildProcess;
	readonly stdout: PassThrough;
	readonly stderr: PassThrough;
	readonly args: readonly string[];
	readonly env: NodeJS.ProcessEnv | undefined;
	readonly kill: () => boolean;
	readonly wasKilled: () => boolean;
	emitExit(): void;
}

function createProcess(args: readonly string[], complete: boolean, statusOutput?: string, exitOnKill = true, env?: NodeJS.ProcessEnv, exitCode = 0): TestChildProcess {
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	let killed = false;
	const child = Object.assign(new EventEmitter(), {
		pid: 123,
		stdout,
		stderr,
		kill: () => {
			killed = true;
			if (exitOnKill) {
				queueMicrotask(() => child.emit('exit', null));
			}
			return true;
		},
	}) as unknown as ChildProcess;
	if (complete) {
		queueMicrotask(() => {
			if (statusOutput) {
				stdout.write(statusOutput);
			}
			child.emit('exit', exitCode);
		});
	}
	return { child, stdout, stderr, args, env, kill: child.kill.bind(child), wasKilled: () => killed, emitExit: () => child.emit('exit', null) };
}

function activeMode(asService = false): ActiveTunnelMode {
	return { active: true, asService, session: { providerId: 'github', sessionId: 'session', accountLabel: 'account', token: 'token' } };
}

function createCoordinator(exitOnKill = true, ordering?: string[], installExitCode = 0) {
	const processes: TestChildProcess[] = [];
	const spawn: CodeTunnelSpawn = (_command: string, args: readonly string[], options: SpawnOptions) => {
		const complete = args.includes('login') || args.includes('status') || args.includes('install') || args.includes('kill') || args.includes('uninstall');
		const isTunnelProcess = args[0] === 'tunnel' && !args.includes('status') && !args.includes('login') && !args.includes('install') && !args.includes('kill') && !args.includes('uninstall');
		if (isTunnelProcess) {
			ordering?.push('spawn-remote-access');
		}
		const process = createProcess(args, complete, args.includes('status') ? '{"service_installed":false,"tunnel":null}\n' : undefined, exitOnKill || complete, options.env, args.includes('install') ? installExitCode : 0);
		if (isTunnelProcess && ordering) {
			process.child.on('exit', () => ordering.push('exit-remote-access'));
			const kill = process.child.kill;
			process.child.kill = () => {
				ordering.push('kill-remote-access');
				return kill.call(process.child);
			};
		}
		processes.push(process);
		return process.child;
	};
	const environmentService = {
		appRoot: 'installation',
		isBuilt: true,
		userDataPath: 'custom-user-data',
	} as INativeEnvironmentService;
	const coordinator = new TunnelProcessCoordinator(
		onLog => new CodeTunnelCli({ appRoot: environmentService.appRoot, isBuilt: true, tunnelApplicationName: 'code-tunnel', win32VersionedUpdate: false, spawn, onLog }),
		new TestConfigurationService({ 'remote.tunnels.access.hostNameOverride': 'Test_Host' }),
		environmentService,
		{ tunnelApplicationName: 'code-tunnel' } as IProductService,
	);
	return { coordinator, processes };
}

suite('TunnelProcessCoordinator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves Remote Tunnel Access modes', () => {
		assert.deepStrictEqual([
			resolveTunnelProcessMode(INACTIVE_TUNNEL_MODE),
			resolveTunnelProcessMode(activeMode()),
			resolveTunnelProcessMode(activeMode(true)),
		], ['none', 'remoteAccess', 'service']);
	});

	test('stops the tunnel instead of resuming a narrower mode when Remote Tunnel Access is disabled', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const tunnel = processes.find(process => process.args.includes('--accept-server-license-terms'))!;
			await coordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, LogLevel.Info);

			assert.deepStrictEqual({
				tunnelWasStopped: tunnel.wasKilled(),
				status: coordinator.getStatus(),
				agentHostProcessStarted: processes.some(process => process.args.includes('--agent-host-only')),
			}, {
				tunnelWasStopped: true,
				status: { mode: 'none', tunnelName: undefined, tunnelId: undefined, connectionState: 'disconnected', serviceInstallFailed: false },
				agentHostProcessStarted: false,
			});

		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('restarts when the session token changes even though mode and name do not', async () => {
		const { coordinator, processes } = createCoordinator();
		const countTunnels = () => processes.filter(p => p.args[0] === 'tunnel'
			&& !p.args.includes('status') && !p.args.includes('login')
			&& !p.args.includes('install') && !p.args.includes('kill') && !p.args.includes('uninstall')).length;
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const before = countTunnels();

			// A refreshed token has to reach a new process; skipping the
			// reconcile would leave the tunnel running on the stale one.
			const refreshed: ActiveTunnelMode = {
				active: true,
				asService: false,
				session: { providerId: 'github', sessionId: 'session', accountLabel: 'account', token: 'refreshed-token' },
			};
			await coordinator.setRemoteAccess(refreshed, LogLevel.Info);

			assert.deepStrictEqual({ before, after: countTunnels() }, { before: 1, after: 2 });
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('restarts a run that already reported disconnected', async () => {
		const { coordinator, processes } = createCoordinator();
		const countTunnels = () => processes.filter(p => p.args[0] === 'tunnel'
			&& !p.args.includes('status') && !p.args.includes('login')
			&& !p.args.includes('install') && !p.args.includes('kill') && !p.args.includes('uninstall')).length;
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const before = countTunnels();

			// A token error cancels the child and reports disconnected before it
			// exits. Treating that run as healthy would skip the reconcile and
			// leave nothing running once the cancelled child goes away.
			coordinator.setRemoteAccessStatus({ type: 'disconnected' });
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);

			assert.deepStrictEqual({ before, after: countTunnels() }, { before: 1, after: 2 });
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('restart() still replaces a healthy tunnel', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const tunnel = processes.find(process => process.args.includes('--accept-server-license-terms'))!;
			await coordinator.restart();

			assert.strictEqual(tunnel.wasKilled(), true);
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('starts a session tunnel alongside the installed service so readiness can advance', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
			const sessionTunnel = processes.find(process => process.args.includes('--accept-server-license-terms')
				&& !process.args.includes('install'));

			// Without a session process nothing ever reports connected, so the
			// UI stays stuck on "connecting" after the service is installed.
			assert.deepStrictEqual({
				installed: processes.some(process => process.args.includes('install')),
				startedSessionTunnel: !!sessionTunnel,
				mode: coordinator.getStatus().mode,
			}, {
				installed: true,
				startedSessionTunnel: true,
				mode: 'service',
			});
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('falls back to hosting in-session when the service install fails', async () => {
		const { coordinator, processes } = createCoordinator(true, undefined, 1);
		try {
			await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);

			assert.deepStrictEqual({
				serviceInstallFailed: coordinator.getStatus().serviceInstallFailed,
				startedSessionTunnel: processes.some(process => process.args.includes('--accept-server-license-terms')
					&& !process.args.includes('install')),
			}, {
				serviceInstallFailed: true,
				startedSessionTunnel: true,
			});
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('waits for the prior tunnel process to exit before spawning its replacement', async () => {
		const ordering: string[] = [];
		const { coordinator, processes } = createCoordinator(false, ordering);
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const tunnel = processes.find(process => process.args.includes('--accept-server-license-terms'))!;
			const transition = coordinator.setRemoteAccess({
				active: true,
				asService: false,
				session: { providerId: 'github', sessionId: 'session', accountLabel: 'account', token: 'refreshed-token' },
			}, LogLevel.Info);
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.deepStrictEqual(ordering, ['spawn-remote-access', 'kill-remote-access']);

			tunnel.emitExit();
			await transition;
			assert.deepStrictEqual(ordering, ['spawn-remote-access', 'kill-remote-access', 'exit-remote-access', 'spawn-remote-access']);
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('preserves remote access session and service CLI arguments', async () => {
		const session = createCoordinator();
		const service = createCoordinator();
		try {
			await session.coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			await service.coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
			assert.deepStrictEqual({
				session: session.processes.find(process => process.args.includes('--accept-server-license-terms'))!.args,
				service: service.processes.find(process => process.args.includes('install'))!.args,
			}, {
				session: ['tunnel', '--accept-server-license-terms', '--log', 'info', '--user-data-dir', 'custom-user-data', '--delegate-to-editor', '--name', 'test_host', '--parent-process-id', String(process.pid)],
				service: ['tunnel', 'service', 'install', '--accept-server-license-terms', '--log', 'info', '--user-data-dir', 'custom-user-data', '--name', 'test_host'],
			});
		} finally {
			for (const process of [...session.processes, ...service.processes]) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			session.coordinator.dispose();
			service.coordinator.dispose();
		}
	});

	test('uninstalls the service when a restart preempts the reconcile', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
			// Turning the service off owes an uninstall. A restart in the same
			// tick preempts that reconcile, so the requirement must survive.
			const stopService = coordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, LogLevel.Info);
			const restart = coordinator.restart();
			await Promise.all([stopService, restart]);

			assert.deepStrictEqual({
				uninstalled: processes.some(process => process.args.includes('uninstall')),
				status: coordinator.getStatus().mode,
			}, {
				uninstalled: true,
				status: 'none',
			});
		} finally {
			coordinator.dispose();
		}
	});

	test('parses and fans machine-status events to every registered consumer', async () => {
		const { coordinator, processes } = createCoordinator();
		const first: string[] = [];
		const second: string[] = [];
		const firstListener = coordinator.onDidMachineStatus(event => first.push(event.status.type));
		const secondListener = coordinator.onDidMachineStatus(event => second.push(event.status.type));
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const tunnel = processes.find(process => process.args.includes('--accept-server-license-terms'))!;
			tunnel.stdout.write('__VSCODE_CLI_STATUS__{"type":"connected","tunnelName":"test_host","tunnelId":"tunnel-id","isAttached":false}\n');
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.deepStrictEqual({
				first,
				second,
				status: coordinator.getStatus().connectionState,
				tunnelId: coordinator.getStatus().tunnelId,
				machineStatusEnvironment: tunnel.env?.VSCODE_CLI_MACHINE_STATUS,
			}, {
				first: ['connected'],
				second: ['connected'],
				status: 'connected',
				tunnelId: 'tunnel-id',
				machineStatusEnvironment: '1',
			});
		} finally {
			firstListener.dispose();
			secondListener.dispose();
			coordinator.dispose();
		}
	});
});
