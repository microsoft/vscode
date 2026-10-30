/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { Machine } from './agentHost.js';
import { deadline } from './wire.js';

// This module must not import the Dev Tunnels SDK: only the broker daemon loads it.

/**
 * A connection broker is a detached local process that keeps one authenticated tunnel relay
 * open and hands out new agent-host streams over it, so later `tunnel` invocations (for
 * example split panes) skip discovery, authentication, and the relay handshake.
 *
 * Clients find a broker through a descriptor file in a per-user state directory. The
 * descriptor holds a random secret that every request must present; the endpoint is only
 * a byte relay, and the agent-host protocol (including host selection) stays end-to-end in
 * each client.
 */

export const brokerIdleMs = 60 * 60 * 1000;
const descriptorVersion = 1;
const maxHandshakeBytes = 4096;
const handshakeTimeoutMs = 10_000;
const startTimeoutMs = 90_000;

export type Provider = 'github' | 'microsoft';

export interface BrokerDescriptor {
	version: typeof descriptorVersion;
	pid: number;
	endpoint: string;
	secret: string;
	provider: Provider;
	machine: Machine;
}

export interface BrokerRelay {
	readonly machine: Machine;
	readonly connected: boolean;
	openStream(signal: AbortSignal): Promise<Duplex>;
	dispose(): Promise<void>;
}

/** The broker answered but could not provide a stream, for example because the relay failed. */
export class BrokerError extends Error { }

export function brokerDirectory(env: Readonly<Record<string, string | undefined>> = process.env, platform = process.platform): string {
	const base = platform === 'win32'
		? env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
		: env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
	return join(base, 'tunnel-terminal-client', 'brokers');
}

export function brokerKey(provider: Provider, machine: Pick<Machine, 'id' | 'cluster'>): string {
	return createHash('sha256').update(`${provider}\n${machine.cluster}\n${machine.id}`).digest('hex').slice(0, 24);
}

async function ensureDirectory(directory: string): Promise<void> {
	await mkdir(directory, { recursive: true, mode: 0o700 });
	if (process.platform !== 'win32') {
		await chmod(directory, 0o700);
	}
}

function isMachine(value: unknown): value is Machine {
	const machine = value as Machine;
	return typeof machine === 'object' && machine !== null
		&& typeof machine.id === 'string' && typeof machine.cluster === 'string' && typeof machine.name === 'string'
		&& Number.isInteger(machine.protocolVersion) && typeof machine.online === 'boolean';
}

function parseDescriptor(value: unknown): BrokerDescriptor | undefined {
	const descriptor = value as BrokerDescriptor;
	if (typeof descriptor !== 'object' || descriptor === null || descriptor.version !== descriptorVersion
		|| !Number.isInteger(descriptor.pid) || typeof descriptor.endpoint !== 'string' || typeof descriptor.secret !== 'string'
		|| (descriptor.provider !== 'github' && descriptor.provider !== 'microsoft') || !isMachine(descriptor.machine)) {
		return undefined;
	}
	return descriptor;
}

export async function readBrokers(provider: Provider, directory = brokerDirectory()): Promise<BrokerDescriptor[]> {
	let names: string[];
	try {
		names = await readdir(directory);
	} catch {
		return [];
	}
	const descriptors: BrokerDescriptor[] = [];
	for (const name of names.filter(name => name.endsWith('.json')).sort()) {
		try {
			const descriptor = parseDescriptor(JSON.parse(await readFile(join(directory, name), 'utf8')));
			if (descriptor?.provider === provider) {
				descriptors.push(descriptor);
			}
		} catch {
			// Ignore unreadable or partially written descriptors.
		}
	}
	return descriptors;
}

export async function writeDescriptor(descriptor: BrokerDescriptor, directory = brokerDirectory()): Promise<string> {
	await ensureDirectory(directory);
	const path = join(directory, `${brokerKey(descriptor.provider, descriptor.machine)}.json`);
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, JSON.stringify(descriptor), { mode: 0o600 });
	await rename(temporary, path);
	return path;
}

/** Removes the descriptor only if it still describes the given broker. */
export async function removeDescriptor(descriptor: BrokerDescriptor, directory = brokerDirectory()): Promise<void> {
	const path = join(directory, `${brokerKey(descriptor.provider, descriptor.machine)}.json`);
	try {
		const current = parseDescriptor(JSON.parse(await readFile(path, 'utf8')));
		if (current?.endpoint === descriptor.endpoint && current.pid === descriptor.pid) {
			await rm(path, { force: true });
		}
	} catch {
		// Already removed or replaced.
	}
}

function sameSecret(expected: string, actual: unknown): boolean {
	if (typeof actual !== 'string') {
		return false;
	}
	const digest = (value: string) => createHash('sha256').update(value).digest();
	return timingSafeEqual(digest(expected), digest(actual));
}

/** Reads one newline-terminated JSON line and returns any bytes that followed it to the stream. */
async function readLine(socket: Socket, signal?: AbortSignal, milliseconds = handshakeTimeoutMs): Promise<Record<string, unknown>> {
	let onData: ((chunk: Buffer) => void) | undefined;
	let onEnd: (() => void) | undefined;
	try {
		return await deadline(new Promise<Record<string, unknown>>((resolve, reject) => {
			let buffer = Buffer.alloc(0);
			onData = chunk => {
				buffer = Buffer.concat([buffer, chunk]);
				const newline = buffer.indexOf(0x0a);
				if (newline < 0) {
					if (buffer.byteLength > maxHandshakeBytes) {
						reject(new Error('Connection broker handshake is too large.'));
					}
					return;
				}
				socket.pause();
				const rest = buffer.subarray(newline + 1);
				if (rest.byteLength) {
					socket.unshift(rest);
				}
				try {
					const value: unknown = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
					if (typeof value !== 'object' || value === null || Array.isArray(value)) {
						throw new Error();
					}
					resolve(value as Record<string, unknown>);
				} catch {
					reject(new Error('Malformed connection broker handshake.'));
				}
			};
			onEnd = () => reject(new Error('Connection broker closed the connection.'));
			socket.on('data', onData);
			socket.once('end', onEnd);
			socket.once('close', onEnd);
		}), 'Connection broker handshake', signal, milliseconds);
	} finally {
		if (onData) { socket.off('data', onData); }
		if (onEnd) {
			socket.off('end', onEnd);
			socket.off('close', onEnd);
		}
	}
}

async function request(descriptor: BrokerDescriptor, op: 'stream' | 'stop', signal?: AbortSignal): Promise<Socket> {
	const socket = connect(descriptor.endpoint);
	try {
		await deadline(once(socket, 'connect'), 'Connection broker', signal, handshakeTimeoutMs);
		socket.write(`${JSON.stringify({ secret: descriptor.secret, op })}\n`);
		// Opening a forwarded stream can require reconnecting the relay.
		const response = await readLine(socket, signal, op === 'stream' ? startTimeoutMs : handshakeTimeoutMs);
		if (response.ok !== true) {
			throw new BrokerError(typeof response.error === 'string' ? response.error : 'The connection broker rejected the request.');
		}
		// readLine paused the socket; the HTTP upgrade does not resume an explicitly paused stream.
		// Nothing can be lost: the broker sends no stream bytes before the client's upgrade request.
		socket.resume();
		return socket;
	} catch (error) {
		socket.destroy();
		throw error;
	}
}

/**
 * Requests a new agent-host stream from a running broker. Throws BrokerError when the broker
 * answered with a failure; any other error means the broker is gone or unreachable.
 */
export function connectBroker(descriptor: BrokerDescriptor, signal?: AbortSignal): Promise<Socket> {
	return request(descriptor, 'stream', signal);
}

export async function stopBroker(descriptor: BrokerDescriptor, directory = brokerDirectory()): Promise<boolean> {
	try {
		(await request(descriptor, 'stop')).destroy();
		return true;
	} catch {
		return false;
	} finally {
		await removeDescriptor(descriptor, directory);
	}
}

function brokerEndpoint(directory: string, key: string): string {
	return process.platform === 'win32'
		? `\\\\.\\pipe\\tunnel-terminal-${randomBytes(16).toString('hex')}`
		: join(directory, `${key.slice(0, 16)}.sock`);
}

export interface BrokerOptions {
	provider: Provider;
	relay: BrokerRelay;
	reconnect(signal: AbortSignal): Promise<BrokerRelay>;
	idleMs?: number;
	directory?: string;
}

/** Serves agent-host streams over one relay until it has been idle for `idleMs` or is stopped. */
export class Broker {
	private readonly server: Server;
	private readonly sockets = new Set<Socket>();
	private readonly lifetime = new AbortController();
	private relay: BrokerRelay;
	private reconnecting: Promise<BrokerRelay> | undefined;
	private active = 0;
	private idleTimer: NodeJS.Timeout | undefined;
	private stopping: Promise<void> | undefined;
	private descriptorValue: BrokerDescriptor | undefined;
	private readonly directory: string;
	readonly closed: Promise<void>;
	private resolveClosed!: () => void;

	constructor(private readonly options: BrokerOptions) {
		this.relay = options.relay;
		this.directory = options.directory ?? brokerDirectory();
		this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
		this.server = createServer(socket => void this.handle(socket));
	}

	get descriptor(): BrokerDescriptor | undefined {
		return this.descriptorValue;
	}

	async listen(): Promise<BrokerDescriptor> {
		await ensureDirectory(this.directory);
		const endpoint = brokerEndpoint(this.directory, brokerKey(this.options.provider, this.relay.machine));
		if (process.platform !== 'win32') {
			await rm(endpoint, { force: true });
		}
		this.server.listen(endpoint);
		await once(this.server, 'listening');
		if (process.platform !== 'win32') {
			await chmod(endpoint, 0o600);
		}
		this.descriptorValue = {
			version: descriptorVersion,
			pid: process.pid,
			endpoint,
			secret: randomBytes(32).toString('base64url'),
			provider: this.options.provider,
			machine: this.relay.machine,
		};
		await writeDescriptor(this.descriptorValue, this.directory);
		this.scheduleIdle();
		return this.descriptorValue;
	}

	private scheduleIdle(): void {
		clearTimeout(this.idleTimer);
		this.idleTimer = undefined;
		if (this.active === 0 && !this.stopping) {
			this.idleTimer = setTimeout(() => void this.stop(), this.options.idleMs ?? brokerIdleMs);
		}
	}

	private async currentRelay(): Promise<BrokerRelay> {
		if (this.relay.connected) {
			return this.relay;
		}
		return this.reconnect();
	}

	private reconnect(): Promise<BrokerRelay> {
		this.reconnecting ??= (async () => {
			const previous = this.relay;
			try {
				await previous.dispose();
			} catch {
				// The relay is being replaced; a failed disposal must not block reconnection.
			}
			this.relay = await this.options.reconnect(this.lifetime.signal);
			return this.relay;
		})().finally(() => { this.reconnecting = undefined; });
		return this.reconnecting;
	}

	private async openStream(): Promise<Duplex> {
		const relay = await this.currentRelay();
		try {
			return await relay.openStream(this.lifetime.signal);
		} catch {
			// The relay may have dropped without reporting it yet; retry once on a fresh relay.
			return (await this.reconnect()).openStream(this.lifetime.signal);
		}
	}

	private async handle(socket: Socket): Promise<void> {
		this.sockets.add(socket);
		socket.on('error', () => socket.destroy());
		socket.once('close', () => this.sockets.delete(socket));
		const reply = (value: object): void => { socket.write(`${JSON.stringify(value)}\n`); };
		let counted = false;
		try {
			const hello = await readLine(socket);
			if (!this.descriptorValue || !sameSecret(this.descriptorValue.secret, hello.secret)) {
				socket.destroy();
				return;
			}
			if (hello.op === 'stop') {
				reply({ ok: true });
				socket.end(() => void this.stop());
				return;
			}
			if (hello.op !== 'stream' || this.stopping) {
				reply({ ok: false, error: 'Unsupported connection broker request.' });
				socket.end();
				return;
			}
			counted = true;
			this.active++;
			this.scheduleIdle();
			let stream: Duplex;
			try {
				stream = await this.openStream();
			} catch (error) {
				reply({ ok: false, error: error instanceof Error ? error.message : 'Unable to open a tunnel stream.' });
				socket.end();
				return;
			}
			if (socket.destroyed) {
				stream.destroy();
				return;
			}
			reply({ ok: true });
			const release = (): void => {
				stream.destroy();
				socket.destroy();
			};
			stream.once('close', release);
			stream.once('error', release);
			socket.once('close', release);
			stream.pipe(socket);
			socket.pipe(stream);
			socket.resume();
			await once(socket, 'close');
		} catch {
			socket.destroy();
		} finally {
			if (counted) {
				this.active--;
				this.scheduleIdle();
			}
		}
	}

	stop(): Promise<void> {
		this.stopping ??= (async () => {
			clearTimeout(this.idleTimer);
			this.lifetime.abort();
			const closing = new Promise<void>(resolve => this.server.close(() => resolve()));
			for (const socket of this.sockets) {
				socket.destroy();
			}
			if (this.descriptorValue) {
				await removeDescriptor(this.descriptorValue, this.directory);
			}
			try {
				await this.relay.dispose();
			} catch {
				// Best effort: the process is exiting.
			}
			await closing;
			this.resolveClosed();
		})();
		return this.stopping;
	}
}

export interface StartBrokerOptions {
	token: string;
	provider: Provider;
	machine: Machine;
	signal: AbortSignal;
	idleMs?: number;
}

/**
 * Starts a detached broker that outlives this process. The token is passed over stdin, never
 * on the command line. Resolves once the broker has connected the relay and is listening.
 */
export async function startBroker(options: StartBrokerOptions): Promise<BrokerDescriptor> {
	const env = { ...process.env };
	delete env.TUNNEL_ACCESS_TOKEN;
	const directory = brokerDirectory();
	await ensureDirectory(directory);
	const child = spawn(process.execPath, [fileURLToPath(new URL('./brokerDaemon.js', import.meta.url))], {
		cwd: directory,
		detached: true,
		env,
		stdio: ['pipe', 'pipe', 'ignore'],
		windowsHide: true,
	});
	const onAbort = (): void => { child.kill(); };
	options.signal.addEventListener('abort', onAbort, { once: true });
	try {
		child.stdin.on('error', () => { });
		child.stdin.end(`${JSON.stringify({ token: options.token, provider: options.provider, machine: options.machine, idleMs: options.idleMs ?? brokerIdleMs })}\n`);
		const exited = new Promise<never>((_, reject) => child.once('exit', () => reject(new Error('The connection broker exited during startup.'))));
		// The broker normally outlives this process; a later exit must not surface as an unhandled rejection.
		exited.catch(() => { });
		const line = new Promise<Record<string, unknown>>((resolve, reject) => {
			let output = '';
			child.stdout.setEncoding('utf8');
			child.stdout.on('data', (chunk: string) => {
				output += chunk;
				const newline = output.indexOf('\n');
				if (newline >= 0) {
					try {
						resolve(JSON.parse(output.slice(0, newline)));
					} catch {
						reject(new Error('The connection broker returned a malformed startup response.'));
					}
				} else if (output.length > maxHandshakeBytes) {
					reject(new Error('The connection broker startup response is too large.'));
				}
			});
		});
		const result = await deadline(Promise.race([line, exited]), 'Connection broker startup', options.signal, startTimeoutMs);
		if (result.ok !== true) {
			throw new BrokerError(typeof result.error === 'string' ? result.error : 'The connection broker failed to start.');
		}
		const descriptor = parseDescriptor(result.descriptor);
		if (!descriptor) {
			throw new Error('The connection broker returned a malformed descriptor.');
		}
		return descriptor;
	} catch (error) {
		child.kill();
		throw error;
	} finally {
		options.signal.removeEventListener('abort', onAbort);
		child.stdout.destroy();
		child.unref();
	}
}
