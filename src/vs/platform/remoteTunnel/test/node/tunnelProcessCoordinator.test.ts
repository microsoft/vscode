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
import { IAgentHostSharingRequest, resolveTunnelProcessMode, TunnelProcessCoordinator } from '../../node/tunnelProcessCoordinator.js';
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

function agentRequest(): IAgentHostSharingRequest {
	return { token: 'agent-token', authProvider: 'github', logLevel: LogLevel.Info };
}

function createCoordinator(exitOnKill = true, ordering?: string[], installExitCode = 0) {
	const processes: TestChildProcess[] = [];
	const spawn: CodeTunnelSpawn = (_command: string, args: readonly string[], options: SpawnOptions) => {
		const complete = args.includes('login') || args.includes('status') || args.includes('install') || args.includes('kill') || args.includes('uninstall');
		const isTunnelProcess = args[0] === 'tunnel' && !args.includes('status') && !args.includes('login') && !args.includes('install') && !args.includes('kill') && !args.includes('uninstall');
		if (isTunnelProcess) {
			ordering?.push(args.includes('--agent-host-only') ? 'spawn-agent-host' : 'spawn-remote-access');
		}
		const process = createProcess(args, complete, args.includes('status') ? '{"service_installed":false,"tunnel":null}\n' : undefined, exitOnKill || complete, options.env, args.includes('install') ? installExitCode : 0);
		if (isTunnelProcess && ordering) {
			process.child.on('exit', () => ordering.push(args.includes('--agent-host-only') ? 'exit-agent-host' : 'exit-remote-access'));
			const kill = process.child.kill;
			process.child.kill = () => {
				ordering.push(args.includes('--agent-host-only') ? 'kill-agent-host' : 'kill-remote-access');
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

	test('resolves the combined intent modes', () => {
		assert.deepStrictEqual([
			resolveTunnelProcessMode(false, INACTIVE_TUNNEL_MODE),
			resolveTunnelProcessMode(true, INACTIVE_TUNNEL_MODE),
			resolveTunnelProcessMode(false, activeMode()),
			resolveTunnelProcessMode(true, activeMode()),
			resolveTunnelProcessMode(false, activeMode(true)),
			resolveTunnelProcessMode(true, activeMode(true)),
		], ['none', 'agentHost', 'remoteAccess', 'remoteAccess', 'service', 'service']);
	});

	test('stops agent-host-only before starting a full tunnel with the same name', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setAgentHostSharing(agentRequest());
			const agentHost = processes.find(process => process.args.includes('--agent-host-only'))!;
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const fullTunnel = processes.filter(process => process.args[0] === 'tunnel' && !process.args.includes('--agent-host-only')).at(-1)!;

			assert.deepStrictEqual({
				agentHostKilledBeforeFullTunnel: processes.indexOf(agentHost) < processes.indexOf(fullTunnel),
				agentHostWasStopped: agentHost.wasKilled(),
				names: [agentHost.args[agentHost.args.indexOf('--name') + 1], fullTunnel.args[fullTunnel.args.indexOf('--name') + 1]],
			}, {
				agentHostKilledBeforeFullTunnel: true,
				agentHostWasStopped: true,
				names: ['test_host', 'test_host'],
			});

		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('leaves a healthy tunnel running when the resolved target is unchanged', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			const tunnel = processes.find(process => process.args.includes('--accept-server-license-terms'))!;

			// Remote Tunnel Access stays the winning target, so toggling agent
			// host sharing must not disturb the running tunnel.
			await coordinator.setAgentHostSharing(agentRequest());

			assert.deepStrictEqual({
				wasKilled: tunnel.wasKilled(),
				tunnelProcessCount: processes.filter(process => process.args[0] === 'tunnel'
					&& !process.args.includes('status')
					&& !process.args.includes('login')
					&& !process.args.includes('install')
					&& !process.args.includes('kill')
					&& !process.args.includes('uninstall')).length,
			}, {
				wasKilled: false,
				tunnelProcessCount: 1,
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
			await coordinator.setAgentHostSharing(agentRequest());
			const agentHost = processes.find(process => process.args.includes('--agent-host-only'))!;
			const transition = coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.deepStrictEqual(ordering, ['spawn-agent-host', 'kill-agent-host']);

			agentHost.emitExit();
			await transition;
			assert.deepStrictEqual(ordering, ['spawn-agent-host', 'kill-agent-host', 'exit-agent-host', 'spawn-remote-access']);
		} finally {
			for (const process of processes) {
				process.emitExit();
			}
			await new Promise<void>(resolve => setImmediate(resolve));
			coordinator.dispose();
		}
	});

	test('resumes agent-host-only when remote access stops', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setAgentHostSharing(agentRequest());
			await coordinator.setRemoteAccess(activeMode(), LogLevel.Info);
			await coordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, LogLevel.Info);

			assert.deepStrictEqual(processes.filter(process => process.args.includes('--agent-host-only')).map(process => process.args), [
				['tunnel', '--agent-host-only', '--name', 'test_host', '--user-data-dir', 'custom-user-data', '--delegate-to-editor', '--parent-process-id', String(process.pid)],
				['tunnel', '--agent-host-only', '--name', 'test_host', '--user-data-dir', 'custom-user-data', '--delegate-to-editor', '--parent-process-id', String(process.pid)],
			]);
		} finally {
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

	test('uninstalls the service even when a sharing update preempts the reconcile', async () => {
		const { coordinator, processes } = createCoordinator();
		try {
			await coordinator.setRemoteAccess(activeMode(true), LogLevel.Info);
			// Turning the service off owes an uninstall. Starting agent host
			// sharing in the same tick bumps the generation and preempts the
			// reconcile that would have run it, so the requirement has to
			// survive into the replacement generation.
			const stopService = coordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, LogLevel.Info);
			const share = coordinator.setAgentHostSharing(agentRequest());
			await Promise.all([stopService, share]);

			assert.deepStrictEqual({
				uninstalled: processes.some(process => process.args.includes('uninstall')),
				agentHostStarted: processes.some(process => process.args.includes('--agent-host-only')),
			}, {
				uninstalled: true,
				agentHostStarted: true,
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
			await coordinator.setAgentHostSharing(agentRequest());
			const agentHost = processes.find(process => process.args.includes('--agent-host-only'))!;
			agentHost.stdout.write('__VSCODE_CLI_STATUS__{"type":"connected","tunnelName":"test_host","isAttached":false}\n');
			await new Promise<void>(resolve => setImmediate(resolve));
			assert.deepStrictEqual({
				first,
				second,
				status: coordinator.getStatus().connectionState,
				machineStatusEnvironment: agentHost.env?.VSCODE_CLI_MACHINE_STATUS,
			}, {
				first: ['connected'],
				second: ['connected'],
				status: 'connected',
				machineStatusEnvironment: '1',
			});
		} finally {
			firstListener.dispose();
			secondListener.dispose();
			coordinator.dispose();
		}
	});
});
