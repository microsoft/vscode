/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { readFile, stat } from 'fs/promises';
import { connect as netConnect, NetConnectOpts, Socket } from 'net';
import { homedir } from 'os';
import { join } from '../../../base/common/path.js';

/** Default OpenSSH agent pipe on Windows, used like Dev Containers when `SSH_AUTH_SOCK` is not set. */
export const windowsOpenSshAgentPipe = '\\\\.\\pipe\\openssh-ssh-agent';

export interface IClientForwardingHostCommandResult {
	readonly stdout: Buffer;
	readonly stderr: Buffer;
	readonly code: number;
}

export interface IClientForwardingHostConnection {
	readonly socket: Socket;
	/** Bytes that precede the agent's first reply, e.g., the reply to a Cygwin socket handshake. */
	readonly skip: number;
}

/** The machine whose agents, credentials and Git configuration are forwarded, e.g., the one running a client. */
export interface IClientForwardingHost {
	readonly platform: NodeJS.Platform;
	readonly environment: NodeJS.ProcessEnv;
	readonly homedir: string;
	/** Returns `undefined` when the file does not exist. */
	readFile(path: string): Promise<Buffer | undefined>;
	exists(path: string): Promise<boolean>;
	/** Returns `undefined` when the command is not installed. */
	run(command: string, args: readonly string[], options?: { readonly stdin?: string | Uint8Array; readonly environment?: NodeJS.ProcessEnv }): Promise<IClientForwardingHostCommandResult | undefined>;
	/** Connects to a socket or named pipe, or on Windows to a Cygwin or Gpg4win socket file. */
	connect(path: string): Promise<IClientForwardingHostConnection>;
}

export class NodeClientForwardingHost implements IClientForwardingHost {
	readonly homedir = homedir();

	constructor(
		readonly environment: NodeJS.ProcessEnv,
		readonly platform: NodeJS.Platform = process.platform,
	) { }

	async readFile(path: string): Promise<Buffer | undefined> {
		try {
			return await readFile(path);
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') {
				return undefined;
			}
			throw error;
		}
	}

	async exists(path: string): Promise<boolean> {
		try {
			await stat(path);
			return true;
		} catch (error) {
			// Stat fails with EBUSY for existing named pipes.
			return this.platform === 'win32' && (error as NodeJS.ErrnoException).code === 'EBUSY' && path.startsWith('\\\\.\\pipe\\');
		}
	}

	run(command: string, args: readonly string[], options?: { readonly stdin?: string | Uint8Array; readonly environment?: NodeJS.ProcessEnv }): Promise<IClientForwardingHostCommandResult | undefined> {
		return new Promise((resolve, reject) => {
			const child = spawn(command, args, {
				env: { ...this.environment, ...options?.environment },
				stdio: ['pipe', 'pipe', 'pipe'],
				windowsHide: true,
			});
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			child.stdout.on('data', (data: Buffer) => stdout.push(data));
			child.stderr.on('data', (data: Buffer) => stderr.push(data));
			// Writing fails with EPIPE when the command exits early or is missing.
			child.stdin.on('error', () => { });
			child.once('error', error => (error as NodeJS.ErrnoException).code === 'ENOENT' ? resolve(undefined) : reject(error));
			child.once('close', code => resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), code: code ?? -1 }));
			child.stdin.end(options?.stdin);
		});
	}

	async connect(path: string): Promise<IClientForwardingHostConnection> {
		if (this.platform === 'win32' && !path.startsWith('\\\\.\\pipe\\')) {
			const handshake = parseWindowsSocketFile(await readFile(path));
			const socket = await connectSocket({ host: '127.0.0.1', port: handshake.port });
			socket.write(handshake.data);
			return { socket, skip: handshake.skip };
		}
		return { socket: await connectSocket({ path }), skip: 0 };
	}
}

function connectSocket(options: NetConnectOpts): Promise<Socket> {
	return new Promise((resolve, reject) => {
		const socket = netConnect(options);
		socket.once('error', reject);
		socket.once('connect', () => {
			socket.off('error', reject);
			resolve(socket);
		});
	});
}

/**
 * Parses a Cygwin or MSYS (e.g., Git Bash) socket file, which emulates a Unix socket with a local TCP port and a cookie,
 * or a Gpg4win socket file, which holds a local TCP port and a nonce. Like Dev Containers.
 */
export function parseWindowsSocketFile(content: Buffer, pid = process.pid): { readonly port: number; readonly data: Buffer; readonly skip: number } {
	const cygwin = /!<socket >(?<port>\d+)(?: s)? (?<cookie>(?:(?:[A-Fa-f0-9]{2}){4}-?){4})/.exec(content.toString());
	if (cygwin?.groups) {
		const cookie = Buffer.from(cygwin.groups.cookie.split('-').flatMap(part => (part.match(/.{2}/g) ?? []).reverse().map(byte => parseInt(byte, 16))));
		const identifiers = Buffer.alloc(12);
		identifiers.writeUInt32LE(pid, 0);
		// The agent replies with the cookie and its identifiers before forwarding data.
		return { port: parseInt(cygwin.groups.port, 10), data: Buffer.concat([cookie, identifiers]), skip: 16 + 12 };
	}
	const newline = content.indexOf(0x0a);
	const port = newline === -1 ? NaN : parseInt(content.subarray(0, newline).toString(), 10);
	if (!Number.isSafeInteger(port)) {
		throw new Error('Unsupported socket file');
	}
	return { port, data: content.subarray(newline + 1), skip: 0 };
}

/** The host's SSH agent: `SSH_AUTH_SOCK`, else the Windows OpenSSH agent's pipe when it exists. */
export async function findHostSshAgent(host: IClientForwardingHost): Promise<string | undefined> {
	const socket = host.environment.SSH_AUTH_SOCK;
	if (socket) {
		return socket;
	}
	if (host.platform === 'win32' && await host.exists(windowsOpenSshAgentPipe)) {
		return windowsOpenSshAgentPipe;
	}
	return undefined;
}

/** Parses `gpgconf --list-dirs`, whose values are percent-encoded. */
export function parseGpgDirs(output: string, windows: boolean): Record<string, string | undefined> {
	const dirs: Record<string, string | undefined> = {};
	for (const line of output.trim().split(/\r?\n/)) {
		const colon = line.indexOf(':');
		if (colon !== -1) {
			let value = decodeURIComponent(line.substring(colon + 1));
			// MSYS GnuPG reports paths like /c/Users/...
			if (windows && /^\/.\//.test(value)) {
				value = `${value.charAt(1)}:${value.substring(2).replace(/\//g, '\\')}`;
			}
			dirs[line.substring(0, colon)] = value;
		}
	}
	return dirs;
}

export const useKeyboxdPattern = /^\s*use-keyboxd\s*$/m;

export interface IHostGpgAgent {
	/** The agent's socket for remote use, which restricts what remote processes can do. */
	readonly extraSocket: string;
	readonly keyboxdSocket: string | undefined;
	readonly usesKeyboxd: boolean;
}

/** The host's GPG agent, like Dev Containers finds it; `undefined` without GnuPG. */
export async function findHostGpgAgent(host: IClientForwardingHost): Promise<IHostGpgAgent | undefined> {
	const result = await host.run('gpgconf', ['--list-dirs']).catch(() => undefined);
	const dirs = result?.code === 0 ? parseGpgDirs(result.stdout.toString(), host.platform === 'win32') : {};
	const extraSocket = dirs['agent-extra-socket'];
	const gnupgHome = dirs.homedir;
	if (!extraSocket || !gnupgHome) {
		return undefined;
	}
	const keyboxdSocket = dirs['keyboxd-socket'];
	const usesKeyboxd = !!keyboxdSocket && useKeyboxdPattern.test((await host.readFile(join(gnupgHome, 'common.conf')))?.toString() ?? '');
	return { extraSocket, keyboxdSocket, usesKeyboxd };
}
