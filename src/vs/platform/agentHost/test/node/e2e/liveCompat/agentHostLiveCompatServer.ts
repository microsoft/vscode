/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Launching an Agent Host build for a live-compatibility scenario.
 *
 * This is a separate launcher from `startRealServer` on purpose. That helper
 * exists to stand up a *bundled provider* against the record/replay proxy, and
 * carries the whole apparatus that goes with it: a mock CAPI upstream, minted
 * Copilot tokens, SDK-root overrides, coverage plumbing. A restart baseline
 * needs none of it — it must not contact a model at all — and inheriting that
 * apparatus would make the baseline's result depend on fixture state that has
 * nothing to do with whether a build can reopen its own profile.
 *
 * What it keeps is the part that matters for compatibility: the build's server
 * entry is forked as a real process, isolated onto the supplied home and
 * user-data directories, and reached only over the socket it advertises. The
 * scripted mock provider is enabled through the same `--enable-mock-agent`
 * flag every checkpoint in the matrix already supports.
 */

import { fork, type ChildProcess } from 'child_process';
import { join } from '../../../../../../base/common/path.js';

/** A launched build: the forked process and the port it advertised. */
export interface ILiveCompatServerHandle {
	readonly process: ChildProcess;
	readonly port: number;
}

export interface ILiveCompatLaunchOptions {
	/** Absolute path of the compiled `agentHostServerMain.js` to fork. */
	readonly serverEntry: string;
	/** Home directory the build must confine provider configuration to. */
	readonly homeDir: string;
	/** User-data directory the build must confine its own state to. */
	readonly userDataDir: string;
	/** Extra environment for the child process. */
	readonly env?: Readonly<Record<string, string>>;
}

const STARTUP_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 30_000;

/**
 * Fork a build's server and resolve once it advertises its port.
 *
 * The child is started on an ephemeral port (`--port 0`) so several builds can
 * be exercised without coordinating a port range, and without a connection
 * token because the socket never leaves the loopback interface.
 */
export function startLiveCompatServer(options: ILiveCompatLaunchOptions): Promise<ILiveCompatServerHandle> {
	return new Promise<ILiveCompatServerHandle>((resolve, reject) => {
		let child: ChildProcess;
		try {
			child = fork(options.serverEntry, [
				'--port', '0',
				'--without-connection-token',
				'--enable-mock-agent',
				'--user-data-dir', options.userDataDir,
				// The host's own logs are the primary diagnostic when a baseline
				// fails, and they are written under the retained user-data dir.
				'--log', 'trace',
			], {
				stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
				env: isolatedEnvironment(options),
			});
		} catch (error) {
			reject(error);
			return;
		}

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`[agent-host-live-compat] ${options.serverEntry} did not become ready within ${STARTUP_TIMEOUT_MS}ms`));
		}, STARTUP_TIMEOUT_MS);

		const settleWith = (outcome: () => void): void => {
			clearTimeout(timer);
			child.stdout?.removeAllListeners('data');
			outcome();
		};

		child.stdout?.on('data', (data: Buffer) => {
			const match = /READY:(\d+)/.exec(data.toString());
			if (match) {
				settleWith(() => resolve({ process: child, port: Number(match[1]) }));
			}
		});
		// Swallowed deliberately: the child's diagnostics belong in its log file
		// under the retained user-data directory, and the integration runner
		// fails a test on unexpected console output.
		child.stderr?.on('data', () => { });
		child.on('error', error => settleWith(() => reject(error)));
		child.on('exit', code => settleWith(() => reject(new Error(`[agent-host-live-compat] ${options.serverEntry} exited with code ${code} before becoming ready`))));
	});
}

/**
 * Confine the build to the scenario's directories.
 *
 * Ambient provider configuration is cleared rather than merely overridden: a
 * developer's real `CLAUDE_CONFIG_DIR` or `CODEX_HOME` would otherwise leak
 * local sessions into a run whose entire subject is which sessions survive.
 */
function isolatedEnvironment(options: ILiveCompatLaunchOptions): NodeJS.ProcessEnv {
	return {
		...process.env,
		HOME: options.homeDir,
		USERPROFILE: options.homeDir,
		XDG_CONFIG_HOME: join(options.homeDir, '.config'),
		XDG_DATA_HOME: join(options.homeDir, '.local', 'share'),
		CLAUDE_CONFIG_DIR: join(options.homeDir, '.claude'),
		CODEX_HOME: join(options.homeDir, '.codex'),
		COPILOT_HOME: join(options.homeDir, '.copilot'),
		...options.env,
	};
}

/**
 * Stop a launched build and wait for the process to actually exit.
 *
 * Awaiting the exit is the load-bearing part: the next phase reuses the same
 * user-data directory, and a still-running predecessor would hold the state it
 * is supposed to have handed over — turning a persistence result into a race.
 * Shutdown is requested by closing stdin (the host's own signal), and escalated
 * to a kill only if the process overstays, so a build that hangs on shutdown
 * still yields a result rather than stalling the matrix.
 */
export async function stopLiveCompatServer(server: ILiveCompatServerHandle | undefined): Promise<void> {
	const child = server?.process;
	if (!child || child.exitCode !== null || child.signalCode !== null) {
		return;
	}
	const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
	child.stdin?.end();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timedOut = new Promise<'timeout'>(resolve => {
		timer = setTimeout(() => resolve('timeout'), SHUTDOWN_TIMEOUT_MS);
	});
	try {
		if (await Promise.race([exited.then(() => 'exited' as const), timedOut]) === 'timeout') {
			child.kill('SIGKILL');
			await exited;
		}
	} finally {
		clearTimeout(timer);
	}
}
