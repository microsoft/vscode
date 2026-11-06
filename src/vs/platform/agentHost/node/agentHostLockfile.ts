/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import { join } from '../../../base/common/path.js';
import { ILogService } from '../../log/common/log.js';
import { IRemoteAgentHostState, parseRemoteAgentHostState } from '../common/remoteAgentHostMetadata.js';
import { dialAgentHostHost, validateShellToken } from './sshRemoteAgentHostHelpers.js';

const LOG_PREFIX = '[AgentHostLockfile]';

/**
 * Local-filesystem variant of {@link getAgentHostLockfile}. Returns an
 * absolute path resolved against the current user's home directory rather
 * than the shell-style `~/<...>` path used over SSH. Anchored on
 * `serverDataFolderName` so it stays in sync with the Rust CLI (see
 * `cli/src/state.rs::agent_host_root`). Both inputs are validated for
 * safe characters as defense-in-depth.
 */
export function getLocalAgentHostLockfilePath(serverDataFolderName: string, quality: string): string {
	const d = validateShellToken(serverDataFolderName, 'server data folder name');
	const q = validateShellToken(quality, 'quality');
	return join(os.homedir(), d, 'cli', `agent-host-${q}.lock`);
}

/**
 * Read and parse the canonical agent-host lockfile from a local path.
 * Returns `undefined` if the file does not exist, cannot be read, or
 * does not contain a valid {@link IRemoteAgentHostState}.
 */
export async function readLocalAgentHostLockfile(lockfilePath: string, logService?: ILogService): Promise<IRemoteAgentHostState | undefined> {
	let raw: string;
	try {
		raw = await fs.promises.readFile(lockfilePath, 'utf8');
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		if (code !== 'ENOENT') {
			logService?.warn(`${LOG_PREFIX} Failed to read agent host lockfile ${lockfilePath}: ${err}`);
		}
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		logService?.info(`${LOG_PREFIX} Agent host lockfile ${lockfilePath} contains invalid JSON`);
		return undefined;
	}

	const state = parseRemoteAgentHostState(parsed);
	if (!state) {
		logService?.info(`${LOG_PREFIX} Agent host lockfile ${lockfilePath} does not match expected schema`);
		return undefined;
	}
	return state;
}

/**
 * Mirrors the SSH-side {@link FindRunningAgentHostResult}, applied to a local
 * lockfile path. PID liveness is tested via `process.kill(pid, 0)`, which
 * sends no signal but reports whether the OS has a process with that PID.
 */
export type LocalAgentHostLookupResult =
	| { readonly kind: 'notFound' }
	| { readonly kind: 'stale'; readonly pid: number }
	| { readonly kind: 'compatible'; readonly pid: number; readonly host: string; readonly port: number; readonly connectionToken: string | undefined };

/**
 * Read the lockfile and verify the recorded PID is still alive. Returns
 * `notFound` on missing/corrupt files, `stale` on dead PIDs, and
 * `compatible` for any live process.
 *
 * The recorded protocol version is intentionally NOT checked here: the
 * agent host server is downloaded on demand and may speak a newer
 * protocol than the consumer was built with. The renderer↔AH handshake
 * surfaces any genuine incompatibility.
 */
export async function readActiveAgentHostFromLockfile(lockfilePath: string, logService: ILogService): Promise<LocalAgentHostLookupResult> {
	const state = await readLocalAgentHostLockfile(lockfilePath, logService);
	if (!state) {
		return { kind: 'notFound' };
	}

	if (!isPidAlive(state.pid)) {
		logService.info(`${LOG_PREFIX} Stale agent host lockfile ${lockfilePath} (PID ${state.pid} not running)`);
		return { kind: 'stale', pid: state.pid };
	}

	logService.info(`${LOG_PREFIX} Found running agent host via ${lockfilePath}: PID ${state.pid}, port ${state.port}`);
	return {
		kind: 'compatible',
		pid: state.pid,
		host: dialAgentHostHost(state.host),
		port: state.port,
		connectionToken: state.connectionToken ?? undefined,
	};
}

/**
 * Returns `true` if a process with the given PID exists. Uses signal 0
 * which never delivers a signal but performs the existence/permission
 * check. EPERM means the process exists but we cannot signal it (still
 * counts as alive).
 */
export function isPidAlive(pid: number): boolean {
	if (!Number.isSafeInteger(pid) || pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: unknown) {
		const code = (err as NodeJS.ErrnoException | undefined)?.code;
		// EPERM: process exists but we lack permission to signal it (still alive).
		// ESRCH: no such process.
		// On Windows, `process.kill` with signal 0 throws ESRCH for missing PIDs.
		return code === 'EPERM';
	}
}
