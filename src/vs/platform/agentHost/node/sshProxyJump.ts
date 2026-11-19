/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import { constants, promises as fs } from 'fs';
import { homedir } from 'os';
import { Duplex } from 'stream';
import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { posix, win32 } from '../../../base/common/path.js';
import { killTree } from '../../../base/node/processes.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import type { ISSHResolvedConfig } from '../common/sshRemoteAgentHost.js';

const proxyJumps = new WeakMap<ISSHResolvedConfig, string>();

interface ISSHProxyJumpTarget {
	readonly host: string;
	readonly originalHost: string;
	readonly port: number;
	readonly username: string;
}

interface ISSHJumpHost {
	readonly host: string;
	readonly user?: string;
	readonly port?: number;
}

export interface ISSHProxyJumpOptions {
	readonly environment?: NodeJS.ProcessEnv;
	readonly spawn?: (executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
	readonly terminate?: (pid: number) => Promise<void>;
	readonly resolveExecutable?: () => Promise<string>;
}

/** Retains executable routing data only on the node-resolved object, never in its IPC representation. */
export function rememberSSHProxyJump(config: ISSHResolvedConfig, stdout: string): ISSHResolvedConfig {
	const jump = /^proxyjump (.+)$/mi.exec(stdout)?.[1].trim();
	if (jump && jump.toLowerCase() !== 'none') {
		proxyJumps.set(config, jump);
	}
	return config;
}

/** Only an object resolved inside this node process can authorize a jump helper. */
export async function createSSHProxyJump(
	resolved: ISSHResolvedConfig | undefined,
	target: ISSHProxyJumpTarget,
	logService: ILogService,
	options: ISSHProxyJumpOptions = {},
): Promise<SSHProxyJump | undefined> {
	const jump = resolved && proxyJumps.get(resolved);
	if (!jump || resolved?.proxyCommand) {
		return undefined;
	}
	const args = buildSSHProxyJumpArguments(jump, target);
	const inheritedEnvironment = options.environment ?? process.env;
	const executable = await (options.resolveExecutable?.() ?? resolveSSHExecutable(inheritedEnvironment, logService));
	const { DISPLAY: _display, WAYLAND_DISPLAY: _waylandDisplay, ...environment } = inheritedEnvironment;
	const spawnOptions: SpawnOptionsWithoutStdio = {
		stdio: 'pipe',
		windowsHide: true,
		cwd: homedir(),
		shell: false,
		detached: process.platform !== 'win32',
		env: { ...environment, SSH_ASKPASS_REQUIRE: 'never' },
	};
	let child: ChildProcessWithoutNullStreams;
	try {
		child = options.spawn
			? options.spawn(executable, args, spawnOptions)
			: spawn(executable, args, spawnOptions);
	} catch {
		throw new Error(localize('sshJumpSpawnFailed', "The SSH jump process could not be started."));
	}
	return new SSHProxyJump(child, logService, options.terminate);
}

/**
 * Intermediate Windows jump aliases need BatchMode yes in SSH config to avoid native console prompts.
 * Use Host aliases for intermediate IPv6 addresses when the login shell expands unquoted brackets.
 */
export function buildSSHProxyJumpArguments(value: string, target: ISSHProxyJumpTarget): string[] {
	validateHost(target.host);
	validatePort(String(target.port));
	const tokens = new Map([
		['%', '%'], ['h', target.host], ['n', target.originalHost], ['p', String(target.port)], ['r', target.username],
	]);
	const expand = (component: string) => component.replace(/%(.)|%$/g, (_match, token: string | undefined) => {
		const replacement = token === undefined ? undefined : tokens.get(token);
		if (replacement === undefined) {
			throw new Error(localize('sshJumpUnsupportedToken', "The SSH ProxyJump configuration contains an unsupported percent token."));
		}
		return replacement;
	});
	const jumps = value.split(',').map(jump => parseJumpHost(jump, expand));
	const last = jumps[jumps.length - 1];
	const args = ['-o', 'BatchMode=yes'];
	if (jumps.length > 1) {
		if (jumps.slice(0, -1).some(jump => jump.user?.includes('\\'))) {
			throw new Error(localize('sshJumpDomainUserInChain', "For intermediate jump hosts, configure domain usernames in SSH Host entries instead of inline in ProxyJump."));
		}
		args.push('-J', jumps.slice(0, -1).map((jump, index) =>
			`${jump.user ? `${jump.user}@` : ''}${escapeIntermediateHost(jump.host, jumps.length - 1 - index)}${jump.port === undefined ? '' : `:${jump.port}`}`,
		).join(','));
	}
	if (last.port !== undefined) {
		args.push('-p', String(last.port));
	}
	args.push('-W', `${bracketHost(target.host)}:${target.port}`, '--', `${last.user ? `${last.user}@` : ''}${last.host}`);
	return args;
}

function parseJumpHost(value: string, expand: (value: string) => string): ISSHJumpHost {
	const jump = value.replace(/^ssh:\/\//i, '');
	const match = /^(?:(?<user>.+)@)?(?<host>\[[^\[\]]+\]|[^:@\[\]]+)(?::(?<port>[^:]+))?$/.exec(jump);
	if (!match?.groups) {
		throw new Error(localize('sshJumpInvalidHost', "The SSH ProxyJump configuration contains an invalid host."));
	}
	const host = expand(match.groups.host.replace(/^\[|\]$/g, ''));
	const user = match.groups.user === undefined ? undefined : expand(match.groups.user);
	const port = match.groups.port === undefined ? undefined : validatePort(expand(match.groups.port));
	validateHost(host);
	if (user !== undefined && (!/^[A-Za-z0-9._@+\\-]+$/.test(user) || user.startsWith('-'))) {
		throw new Error(localize('sshJumpInvalidUser', "The SSH ProxyJump configuration contains an invalid username."));
	}
	return { host, user, port };
}

function validateHost(host: string): void {
	if (!/^[A-Za-z0-9._:%-]+$/.test(host) || host.startsWith('-')) {
		throw new Error(localize('sshJumpInvalidHost', "The SSH ProxyJump configuration contains an invalid host."));
	}
}

function validatePort(port: string): number {
	const number = Number(port);
	if (!/^\d+$/.test(port) || !Number.isInteger(number) || number < 1 || number > 65535) {
		throw new Error(localize('sshJumpInvalidPort', "The SSH ProxyJump configuration contains an invalid port."));
	}
	return number;
}

function bracketHost(host: string): string {
	return host.includes(':') ? `[${host}]` : host;
}

function escapeIntermediateHost(host: string, expansionPasses: number): string {
	const percentCount = host.split('%').length - 1;
	if (percentCount === 0) {
		return bracketHost(host);
	}
	// Each enclosing OpenSSH ProxyCommand performs another percent-expansion pass.
	const percentLength = 2 ** expansionPasses;
	if (!Number.isSafeInteger(percentLength) || host.length + percentCount * (percentLength - 1) > 32767) {
		throw new Error(localize('sshJumpEscapedHostTooLong', "The SSH ProxyJump chain requires an excessively long escaped hostname."));
	}
	return bracketHost(host.replace(/%/g, '%'.repeat(percentLength)));
}

export function getSSHExecutableCandidates(platform: NodeJS.Platform, pathValue: string, windowsDirectory = 'C:\\Windows'): string[] {
	const paths = platform === 'win32' ? win32 : posix;
	const executable = platform === 'win32' ? 'ssh.exe' : 'ssh';
	const candidates: string[] = [];
	const isFullyQualified = (value: string) => platform === 'win32'
		? /^(?:[A-Za-z]:[\\/]|[\\/]{2}(?![?.](?:[\\/]|$))[^\\/?"]+[\\/](?!\.{1,2}(?:[\\/]|$))[^\\/?"]+(?:[\\/]|$))/.test(value) && !value.includes('"')
		: paths.isAbsolute(value);
	for (const rawEntry of pathValue.split(paths.delimiter)) {
		const entry = platform === 'win32' ? rawEntry.replace(/^"(.*)"$/, '$1') : rawEntry;
		if (isFullyQualified(entry)) {
			candidates.push(paths.join(entry, executable));
		}
	}
	if (platform === 'win32' && isFullyQualified(windowsDirectory)) {
		candidates.push(paths.join(windowsDirectory, 'System32', 'OpenSSH', executable));
	}
	return [...new Set(candidates)];
}

async function resolveSSHExecutable(environment: NodeJS.ProcessEnv, logService: ILogService): Promise<string> {
	for (const candidate of getSSHExecutableCandidates(process.platform, environment.PATH ?? '', environment.WINDIR)) {
		try {
			if ((await fs.stat(candidate)).isFile()) {
				await fs.access(candidate, constants.X_OK);
				return candidate;
			}
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (!code || !['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP', 'EINVAL', 'ENAMETOOLONG'].includes(code)) {
				throw error;
			}
			if (code !== 'ENOENT' && code !== 'ENOTDIR') {
				logService.warn(`[SSHRemoteAgentHost] Skipping unusable OpenSSH executable candidate (${code})`);
			}
		}
	}
	throw new Error(localize('sshJumpClientMissing', "The OpenSSH client needed for ProxyJump could not be found."));
}

/** Owns a native OpenSSH forwarding process for the lifetime of the physical SSH connection. */
export class SSHProxyJump extends Disposable {
	readonly stream: Duplex;
	private readonly _closed = new DeferredPromise<void>();
	private _stderr = '';
	private _stopped = false;

	constructor(child: ChildProcessWithoutNullStreams, logService: ILogService, terminate: (pid: number) => Promise<void> = pid => killTree(pid, true, message => logService.debug(`[SSHRemoteAgentHost] ${message}`))) {
		super();
		this.stream = Duplex.from({ readable: child.stdout, writable: child.stdin });
		this.stream.on('error', () => { });
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (data: string) => {
			this._stderr = (this._stderr + data).slice(-4096);
		});
		child.once('error', () => this.stream.destroy(new Error(localize('sshJumpSpawnFailed', "The SSH jump process could not be started."))));
		child.once('close', (code, signal) => {
			void this._closed.complete();
			if (!this._stopped && (code !== 0 || signal)) {
				this.stream.destroy(new Error(localize('sshJumpExited', "The SSH jump process exited (code {0}, signal {1}).", code ?? 'none', signal ?? 'none')));
			}
		});
		this._register(toDisposable(() => {
			this._stopped = true;
			this.stream.destroy();
			child.stderr.destroy();
			if (child.pid !== undefined && child.exitCode === null && child.signalCode === null) {
				void terminate(child.pid).catch(() => {
					logService.warn('[SSHRemoteAgentHost] Failed to terminate SSH jump process tree');
					if (child.exitCode === null && child.signalCode === null) {
						child.kill();
					}
				});
			}
		}));
	}

	async describeFailure(): Promise<string | undefined> {
		await raceTimeout(this._closed.p, 250);
		if (/open failed|stdio forwarding failed/i.test(this._stderr)) {
			return localize('sshJumpForwardingFailed', "A jump host could not connect to the next host or the target.");
		}
		if (/host key verification failed|identification has changed/i.test(this._stderr)) {
			return localize('sshJumpHostKeyFailed', "Jump host key verification failed. Connect with OpenSSH to verify the jump host.");
		}
		if (/permission denied|authentication failed/i.test(this._stderr)) {
			return localize('sshJumpAuthenticationFailed', "Jump host authentication failed. Configure noninteractive OpenSSH authentication.");
		}
		if (/could not resolve|name or service not known/i.test(this._stderr)) {
			return localize('sshJumpNameFailed', "The jump host name could not be resolved.");
		}
		if (/connection refused|connection timed out|operation timed out|no route to host/i.test(this._stderr)) {
			return localize('sshJumpConnectionFailed', "The jump host could not be reached.");
		}
		return undefined;
	}
}
