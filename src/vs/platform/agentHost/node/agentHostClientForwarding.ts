/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { appendFile, lstat, mkdir, mkdtemp, readdir, readFile, rm, stat, unlink, writeFile } from 'fs/promises';
import type { IncomingMessage, ServerResponse } from 'http';
import { connect as netConnect, createServer, Server, Socket } from 'net';
import { homedir, tmpdir } from 'os';
import { Sequencer } from '../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { dirname, join } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { vObj, vString } from '../../../base/common/validation.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { clientGitCredentialOperationValidator, type ClientForwardingDescription, type ClientForwardingSocket, type ClientGitConfig, type ClientGitCredentialOperation, type ClientGpgKeys } from '../common/clientForwardingProtocol.js';
import { parseGpgDirs, useKeyboxdPattern } from './clientForwardingHost.js';
import { applyClientGitConfig, IClientGitConfigTarget } from './clientGitConfig.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { readChatSandboxStates, readSessionSandboxState } from '../common/meta/agentSandboxStateMeta.js';
import { SessionConfigKey } from '../common/sessionConfigKeys.js';
import { shellEscape } from './sshRemoteAgentHostHelpers.js';

/** Set to `1` by a launcher, e.g., for Dev Containers, to have the agent host forward what its clients offer. */
export const AGENT_HOST_CLIENT_FORWARDING_ENV = 'VSCODE_AGENT_HOST_CLIENT_FORWARDING';

export const IAgentHostClientForwardingService = createDecorator<IAgentHostClientForwardingService>('agentHostClientForwardingService');

/**
 * Forwards the Git configuration and identity, Git credentials, and SSH and GPG agents of clients advertising
 * `vscode.clientForwarding` to the processes this agent host starts, like the Dev Containers extension forwards them
 * into a container.
 */
export interface IAgentHostClientForwardingService {
	readonly _serviceBrand: undefined;
	/** Whether the agent host was started to forward its clients', see {@link AGENT_HOST_CLIENT_FORWARDING_ENV}. */
	readonly enabled: boolean;
	/** Serves the client's forwarding until disposed; the newest client offering something serves it. */
	registerClient(client: IAgentHostForwardingClient): IDisposable;
	/** Resolves once the environment the processes this agent host starts inherit is in place, which needs no client. */
	whenEnvironmentReady(): Promise<void>;
	/** Resolves once forwarding, the Git configuration and the identity reflect the clients registered so far. */
	settled(): Promise<void>;
}

/** For agent hosts that do not forward their clients'. */
export const NullAgentHostClientForwardingService: IAgentHostClientForwardingService = {
	_serviceBrand: undefined,
	enabled: false,
	registerClient: () => Disposable.None,
	whenEnvironmentReady: () => Promise.resolve(),
	settled: () => Promise.resolve(),
};

/** The agent host's side of a client's connection: reverse requests and notifications. */
export interface IAgentHostForwardingClient {
	readonly onDidReceiveData: Event<{ readonly connection: number; readonly data: VSBuffer }>;
	readonly onDidReceiveClose: Event<number>;
	describe(): Promise<ClientForwardingDescription>;
	open(connection: number, socket: ClientForwardingSocket): Promise<void>;
	sendData(connection: number, data: VSBuffer): void;
	sendClose(connection: number): void;
	gitCredential(operation: ClientGitCredentialOperation, input: string): Promise<string>;
	gpgKeys(): Promise<ClientGpgKeys>;
	gitConfig(): Promise<ClientGitConfig>;
}

interface IRegisteredClient {
	readonly client: IAgentHostForwardingClient;
	description: ClientForwardingDescription | undefined;
}

interface IForwardedConnection {
	readonly socket: Socket;
	readonly client: IRegisteredClient;
	open: boolean;
	readonly pending: VSBuffer[];
}

interface IGpgPlan {
	readonly agentSocket: string;
	readonly keyboxdSocket: string | undefined;
	readonly importKeys: boolean;
	readonly importOwnertrust: boolean;
}

const gitCredentialRequestValidator = vObj({ operation: clientGitCredentialOperationValidator, input: vString() });

const noForwarding: ClientForwardingDescription = { gitConfig: false, gitCredentials: false, sshAgent: false, gpgAgent: false, keyboxd: false };

/**
 * Appends to the configuration Git reads from the environment after its configuration files, which only this process
 * and its children see.
 * @param legacy For Git before 2.31, which reads only the variable `git -c` passes to subprocesses, in its older format.
 */
export function appendGitEnvironmentConfig(environment: NodeJS.ProcessEnv, key: string, value: string, legacy = false): void {
	if (legacy) {
		const entry = `'${`${key}=${value}`.replace(/'/g, `'\\''`)}'`;
		environment.GIT_CONFIG_PARAMETERS = environment.GIT_CONFIG_PARAMETERS ? `${environment.GIT_CONFIG_PARAMETERS} ${entry}` : entry;
		return;
	}
	const count = Number(environment.GIT_CONFIG_COUNT);
	const index = Number.isSafeInteger(count) && count > 0 ? count : 0;
	environment[`GIT_CONFIG_KEY_${index}`] = key;
	environment[`GIT_CONFIG_VALUE_${index}`] = value;
	environment.GIT_CONFIG_COUNT = String(index + 1);
}

/** Answers like an SSH agent without keys, so SSH works as without an agent and `ssh-add -l` reports no identities. */
function serveEmptySshAgent(socket: Socket): void {
	let buffer = Buffer.alloc(0);
	socket.on('data', (data: Buffer) => {
		buffer = Buffer.concat([buffer, data]);
		while (buffer.length >= 4) {
			const length = buffer.readUInt32BE(0);
			if (length > 256 * 1024) {
				socket.destroy();
				return;
			}
			if (buffer.length < 4 + length) {
				return;
			}
			const type = length ? buffer[4] : undefined;
			buffer = buffer.subarray(4 + length);
			// SSH_AGENTC_REQUEST_IDENTITIES gets SSH_AGENT_IDENTITIES_ANSWER without keys, any other request SSH_AGENT_FAILURE.
			socket.write(type === 11 ? Buffer.from([0, 0, 0, 5, 12, 0, 0, 0, 0]) : Buffer.from([0, 0, 0, 1, 5]));
		}
	});
}

export class AgentHostClientForwardingService extends Disposable implements IAgentHostClientForwardingService {
	declare readonly _serviceBrand: undefined;

	readonly enabled: boolean;
	private readonly _clients: IRegisteredClient[] = [];
	private readonly _connections = new Map<number, IForwardedConnection>();
	private readonly _servers = new Map<string, Server>();
	private readonly _updates = new Sequencer();
	private readonly _failedSockets = new Set<string>();
	private readonly _pipePrefix = `\\\\.\\pipe\\vscode-ah-fwd-${generateUuid()}`;
	private readonly _originalSshAgentSocket: string | undefined;
	private readonly _environmentReady: Promise<void>;
	private _nextConnection = 0;
	private _folder: Promise<string> | undefined;
	private _gpgPlan: Promise<IGpgPlan | undefined> | undefined;
	/** Until it fails, so the next client can retry. */
	private _gpgImport: Promise<void> | undefined;

	/**
	 * @param _environment The environment processes inherit, this process's in production.
	 * @param _execPath The Node.js that runs the credential helper.
	 */
	constructor(
		private readonly _environment: NodeJS.ProcessEnv = process.env,
		private readonly _execPath: string = process.execPath,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
	) {
		super();
		this.enabled = _environment[AGENT_HOST_CLIENT_FORWARDING_ENV] === '1';
		// Not for the processes this agent host starts.
		delete _environment[AGENT_HOST_CLIENT_FORWARDING_ENV];
		this._originalSshAgentSocket = _environment.SSH_AUTH_SOCK;
		this._register(toDisposable(() => {
			for (const connection of this._connections.values()) {
				connection.socket.destroy();
			}
			this._connections.clear();
			for (const server of this._servers.values()) {
				server.close();
			}
			this._servers.clear();
			const folder = this._folder;
			void folder?.then(path => rm(path, { recursive: true, force: true })).catch(() => { });
		}));
		// Before any client connects, so every process this agent host starts uses what clients forward.
		this._environmentReady = this.enabled ? this._updates.queue(() => this._startEnvironment()).catch(error => this._logService.error('[AgentHostClientForwarding] Failed to start forwarding', error)) : Promise.resolve();
		if (this.enabled) {
			const closeIfSandboxed = () => {
				if (this._hasSandboxedSession()) {
					for (const connection of this._connections.values()) {
						connection.socket.destroy();
					}
				}
			};
			this._register(_configurationService.onDidSessionConfigChange(closeIfSandboxed));
			this._register(_configurationService.onDidChatConfigChange(closeIfSandboxed));
		}
	}

	registerClient(client: IAgentHostForwardingClient): IDisposable {
		if (!this.enabled) {
			return Disposable.None;
		}
		const registered: IRegisteredClient = { client, description: undefined };
		this._clients.push(registered);
		const store = new DisposableStore();
		store.add(client.onDidReceiveData(({ connection, data }) => {
			const forwarded = this._connections.get(connection);
			if (forwarded?.client === registered) {
				forwarded.socket.write(data.buffer);
			}
		}));
		store.add(client.onDidReceiveClose(connection => {
			const forwarded = this._connections.get(connection);
			if (forwarded?.client === registered) {
				this._connections.delete(connection);
				forwarded.socket.end();
			}
		}));
		const isRegistered = () => this._clients.includes(registered) && !this._store.isDisposed;
		void this._updates.queue(async () => {
			if (!isRegistered()) {
				return;
			}
			try {
				registered.description = await client.describe();
			} catch (error) {
				this._logService.warn('[AgentHostClientForwarding] The client did not describe its forwarding', error);
				registered.description = noForwarding;
			}
			if (!isRegistered()) {
				return;
			}
			// GnuPG on Windows uses its own socket emulation, which forwarding would have to emulate as well. Before the Git
			// configuration, so signing it enables finds the agent.
			if (registered.description.gpgAgent && !isWindows) {
				try {
					await this._startGpgAgent(registered.description.keyboxd);
				} catch (error) {
					this._logService.warn('[AgentHostClientForwarding] Failed to forward the GPG agent', error);
				}
			}
			await this._applyGitConfig(registered, registered.description);
		}).catch(error => this._logService.error('[AgentHostClientForwarding] Failed to start forwarding', error));
		return toDisposable(() => {
			store.dispose();
			const index = this._clients.indexOf(registered);
			if (index !== -1) {
				this._clients.splice(index, 1);
			}
			for (const [id, connection] of this._connections) {
				if (connection.client === registered) {
					this._connections.delete(id);
					connection.socket.destroy();
				}
			}
			void this._updates.queue(async () => {
				// Lets the agent host's own GPG agent take its socket back.
				if (!this._findClient(description => description.gpgAgent)) {
					for (const name of ['gpg-agent', 'keyboxd']) {
						this._servers.get(name)?.close();
						this._servers.delete(name);
					}
				}
			});
		});
	}

	whenEnvironmentReady(): Promise<void> {
		return this._environmentReady;
	}

	settled(): Promise<void> {
		return this._updates.queue(async () => { });
	}

	/**
	 * Whether a session of this agent host is sandboxed. Its processes share the environment of the others, so nothing
	 * clients offer is forwarded then.
	 */
	private _hasSandboxedSession(): boolean {
		for (const session of this._stateManager.getSessionUris()) {
			const state = this._stateManager.getSessionState(session);
			if (this._configurationService.getSessionSandboxEnabled(session)
				|| this._configurationService.getSessionConfigValues(session)?.[SessionConfigKey.SandboxEnabled] === 'on'
				|| readSessionSandboxState(state)?.enabled
				|| [...readChatSandboxStates(state).values()].some(chat => chat.enabled)) {
				return true;
			}
		}
		return false;
	}

	/** The newest client offering something to forward, unless a session is sandboxed. */
	private _findForwardingClient(offers: (description: ClientForwardingDescription) => boolean): IRegisteredClient | undefined {
		return this._hasSandboxedSession() ? undefined : this._findClient(offers);
	}

	private async _startEnvironment(): Promise<void> {
		const folder = await this._getFolder();
		try {
			await this._startGitCredentials(folder);
		} catch (error) {
			this._logService.warn('[AgentHostClientForwarding] Failed to forward Git credentials', error);
		}
		try {
			await this._startSshAgent(folder);
		} catch (error) {
			this._logService.warn('[AgentHostClientForwarding] Failed to forward the SSH agent', error);
		}
	}

	private _getFolder(): Promise<string> {
		// /tmp keeps Unix socket paths short, a long TMPDIR could exceed their limit. The folder is owner-only.
		this._folder ??= mkdtemp(join(isWindows ? tmpdir() : '/tmp', 'vscode-ah-fwd-'));
		return this._folder;
	}

	private _socketPath(folder: string, name: string): string {
		return isWindows ? `${this._pipePrefix}-${name}` : join(folder, `${name}.sock`);
	}

	private async _startGitCredentials(folder: string): Promise<void> {
		const ipcPath = this._socketPath(folder, 'git');
		const { createServer: createHttpServer } = await import('http');
		await this._listen('git', ipcPath, createHttpServer((request, response) => void this._answerGitCredential(request, response)));
		const helper = join(folder, 'git-credential-helper.js');
		await writeFile(helper, getGitCredentialHelperScript());
		const version = /(\d+)\.(\d+)/.exec((await this._run('git', ['--version']))?.stdout.toString() ?? '');
		const legacy = !!version && Number(version[1]) * 1000 + Number(version[2]) < 2031;
		// Appended after the configured helpers, it serves what they cannot, also after a URL resets the helper list.
		appendGitEnvironmentConfig(this._environment, 'credential.helper', `!f() { ELECTRON_RUN_AS_NODE=1 ${shellEscape(this._execPath)} ${shellEscape(helper)} ${shellEscape(ipcPath)} "$@"; }; f`, legacy);
		this._logService.info(`[AgentHostClientForwarding] Forwarding Git credentials${legacy ? ' with the configuration format of Git before 2.31' : ''}`);
	}

	private async _answerGitCredential(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(chunk as Buffer);
		}
		const { content } = gitCredentialRequestValidator.validate(safeParseJson(Buffer.concat(chunks).toString()));
		if (!content) {
			response.writeHead(400).end();
			return;
		}
		const client = this._findForwardingClient(description => description.gitCredentials);
		try {
			// Without a client, Git asks its other helpers or the user.
			const output = client ? await client.client.gitCredential(content.operation, content.input) : '';
			response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ output }));
		} catch (error) {
			this._logService.warn('[AgentHostClientForwarding] Git credential request failed', error);
			response.writeHead(502).end();
		}
	}

	private async _startSshAgent(folder: string): Promise<void> {
		const path = this._socketPath(folder, 'ssh-agent');
		await this._listen('ssh-agent', path, createServer(socket => this._forwardSshAgent(socket)));
		this._environment.SSH_AUTH_SOCK = path;
		this._logService.info('[AgentHostClientForwarding] Forwarding the SSH agent');
	}

	/** Forwards to the newest client's SSH agent, else to the agent this agent host had, else answers without keys. */
	private _forwardSshAgent(socket: Socket): void {
		socket.on('error', () => { });
		const client = this._findForwardingClient(description => description.sshAgent);
		if (client) {
			this._forward(socket, 'ssh-agent', client);
			return;
		}
		if (this._originalSshAgentSocket) {
			const upstream = netConnect(this._originalSshAgentSocket);
			upstream.on('error', () => socket.destroy());
			upstream.on('close', () => socket.destroy());
			socket.on('close', () => upstream.destroy());
			socket.pipe(upstream).pipe(socket);
			return;
		}
		serveEmptySshAgent(socket);
	}

	private async _applyGitConfig(registered: IRegisteredClient, description: ClientForwardingDescription): Promise<void> {
		try {
			// A sandboxed session gets only the identity, also where it shares the agent host with others.
			const offersConfig = description.gitConfig && !this._hasSandboxedSession();
			const agents = { sshAgent: description.sshAgent, gpgAgent: description.gpgAgent && !isWindows };
			await applyClientGitConfig(this._getGitConfigTarget(), offersConfig, agents, () => registered.client.gitConfig(), message => this._logService.info(`[AgentHostClientForwarding] ${message}`));
		} catch (error) {
			this._logService.warn('[AgentHostClientForwarding] Failed to apply the client\'s Git configuration', error);
		}
	}

	private _getGitConfigTarget(): IClientGitConfigTarget {
		// Git prefers HOME, also on Windows.
		const home = this._environment.HOME || homedir();
		return {
			home,
			xdgConfigHome: this._environment.XDG_CONFIG_HOME || join(home, '.config'),
			environment: this._environment,
			run: async (command, args) => {
				const result = await this._run(command, args, { cwd: home });
				return result && { stdout: result.stdout.toString(), code: result.code };
			},
		};
	}

	private async _startGpgAgent(clientUsesKeyboxd: boolean): Promise<void> {
		this._gpgPlan ??= this._prepareGpg(clientUsesKeyboxd);
		const plan = await this._gpgPlan;
		if (!plan) {
			return;
		}
		// The agent host's GnuPG uses its standard sockets, so they are replaced, like Dev Containers does.
		await this._listen('gpg-agent', plan.agentSocket, createServer(socket => this._forwardAgent(socket, 'gpg-agent')));
		if (plan.keyboxdSocket) {
			await this._listen('keyboxd', plan.keyboxdSocket, createServer(socket => this._forwardAgent(socket, 'keyboxd')));
		}
		// Only now, as importing would otherwise start an agent of its own. Not awaited, as only signing needs the keys.
		if ((plan.importKeys || plan.importOwnertrust) && !this._gpgImport) {
			const gpgImport = this._gpgImport = this._importGpgKeys(plan).catch(error => {
				this._logService.warn('[AgentHostClientForwarding] Failed to import GPG keys', error);
				// The next client tries again.
				if (this._gpgImport === gpgImport) {
					this._gpgImport = undefined;
				}
			});
		}
	}

	/** Port of the Dev Containers GPG forwarding; `undefined` when GnuPG is missing or has its own private keys. */
	private async _prepareGpg(clientUsesKeyboxd: boolean): Promise<IGpgPlan | undefined> {
		const dirs = parseGpgDirs((await this._run('gpgconf', ['--list-dirs']))?.stdout.toString() ?? '', false);
		const agentSocket = dirs['agent-socket'];
		const homedir = dirs.homedir;
		if (!agentSocket || !homedir) {
			this._logService.info('[AgentHostClientForwarding] No GnuPG agent socket, not forwarding the GPG agent');
			return undefined;
		}
		// Keys of its own need its own agent (microsoft/vscode-remote-release#3221).
		if ((await readdir(join(homedir, 'private-keys-v1.d')).catch(() => [])).length) {
			this._logService.info('[AgentHostClientForwarding] GnuPG has private keys, not forwarding the GPG agent');
			return undefined;
		}
		const keyboxdSocket = dirs['keyboxd-socket'];
		const commonConf = join(homedir, 'common.conf');
		const usesKeyboxd = !!keyboxdSocket && useKeyboxdPattern.test(await readFile(commonConf, 'utf8').catch(() => ''));
		const isFile = (name: string) => stat(join(homedir, name)).then(stats => stats.isFile(), () => false);
		const [pubring, legacyPubring, trustdb] = await Promise.all(['pubring.kbx', 'pubring.gpg', 'trustdb.gpg'].map(isFile));
		const enableKeyboxd = clientUsesKeyboxd && !!keyboxdSocket && !usesKeyboxd && !pubring && !legacyPubring;
		const forwardKeyboxd = clientUsesKeyboxd && (usesKeyboxd || enableKeyboxd);
		await mkdir(dirname(agentSocket), { recursive: true, mode: 0o700 });
		if (enableKeyboxd) {
			await mkdir(homedir, { recursive: true, mode: 0o700 });
			await appendFile(commonConf, '\nuse-keyboxd\n');
		}
		this._logService.info(`[AgentHostClientForwarding] Forwarding the GPG agent${forwardKeyboxd ? ' and keyboxd' : ''}`);
		return {
			agentSocket,
			keyboxdSocket: forwardKeyboxd ? keyboxdSocket : undefined,
			importKeys: !forwardKeyboxd && !pubring && !legacyPubring,
			importOwnertrust: !trustdb,
		};
	}

	/** Throws when the keys could not be imported, so another client can try again. */
	private async _importGpgKeys(plan: IGpgPlan): Promise<void> {
		const client = this._findClient(description => description.gpgAgent);
		if (!client) {
			throw new Error('No client offers its GPG agent');
		}
		const keys = await client.client.gpgKeys();
		const imports: [string, string[], string | undefined][] = [
			['gpg', ['--import', '--import-options', 'restore'], plan.importKeys ? keys.publicKeys : undefined],
			['gpgsm', ['--import'], plan.importKeys ? keys.certificates : undefined],
			['gpg', ['--import-ownertrust'], plan.importOwnertrust ? keys.ownertrust : undefined],
		];
		const failures: string[] = [];
		for (const [command, args, content] of imports) {
			if (content) {
				const result = await this._run(command, args, { stdin: decodeBase64(content).buffer });
				if (!result) {
					this._logService.info(`[AgentHostClientForwarding] ${command} is not installed, not running ${command} ${args[0]}`);
				} else if (result.code !== 0) {
					failures.push(`${command} ${args[0]}: ${result.stderr.toString().trim()}`);
				}
			}
		}
		if (failures.length) {
			throw new Error(failures.join('\n'));
		}
	}

	private async _listen(name: string, path: string, server: Server): Promise<void> {
		if (this._servers.has(name)) {
			return;
		}
		if (!isWindows) {
			// Replaces the socket of an earlier agent host or agent.
			try {
				if ((await lstat(path)).isSocket()) {
					await unlink(path);
				}
			} catch {
				// Missing.
			}
		}
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(path, () => {
				server.off('error', reject);
				resolve();
			});
		});
		this._servers.set(name, server);
	}

	/** The newest client offering something. */
	private _findClient(offers: (description: ClientForwardingDescription) => boolean): IRegisteredClient | undefined {
		for (let i = this._clients.length - 1; i >= 0; i--) {
			const description = this._clients[i].description;
			if (description && offers(description)) {
				return this._clients[i];
			}
		}
		return undefined;
	}

	private _forwardAgent(socket: Socket, name: 'gpg-agent' | 'keyboxd'): void {
		socket.on('error', () => { });
		const client = this._findForwardingClient(description => name === 'gpg-agent' ? description.gpgAgent : description.keyboxd);
		if (client) {
			this._forward(socket, name, client);
		} else {
			socket.destroy();
		}
	}

	private _forward(socket: Socket, name: ClientForwardingSocket, client: IRegisteredClient): void {
		const id = ++this._nextConnection;
		const connection: IForwardedConnection = { socket, client, open: false, pending: [] };
		this._connections.set(id, connection);
		socket.on('data', (data: Buffer) => {
			if (connection.open) {
				client.client.sendData(id, VSBuffer.wrap(data));
			} else {
				connection.pending.push(VSBuffer.wrap(data));
			}
		});
		socket.on('close', () => {
			if (this._connections.get(id) === connection) {
				this._connections.delete(id);
				if (connection.open) {
					client.client.sendClose(id);
				}
			}
		});
		client.client.open(id, name).then(() => {
			if (this._connections.get(id) !== connection) {
				client.client.sendClose(id);
				return;
			}
			connection.open = true;
			for (const data of connection.pending.splice(0)) {
				client.client.sendData(id, data);
			}
		}, error => {
			// Every use of a missing agent fails the same way.
			if (!this._failedSockets.has(name)) {
				this._failedSockets.add(name);
				this._logService.warn(`[AgentHostClientForwarding] The client could not connect to its ${name}`, error);
			}
			if (this._connections.get(id) === connection) {
				this._connections.delete(id);
				socket.destroy();
			}
		});
	}

	/** Runs a command in this agent host's environment; `undefined` when it is not installed. */
	private _run(command: string, args: readonly string[], options?: { readonly stdin?: Uint8Array; readonly cwd?: string }): Promise<{ readonly stdout: Buffer; readonly stderr: Buffer; readonly code: number } | undefined> {
		return new Promise(resolve => {
			const child = spawn(command, args, { env: this._environment, cwd: options?.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
			const stdout: Buffer[] = [];
			const stderr: Buffer[] = [];
			child.stdout.on('data', (data: Buffer) => stdout.push(data));
			child.stderr.on('data', (data: Buffer) => stderr.push(data));
			child.stdin.on('error', () => { });
			child.once('error', () => resolve(undefined));
			child.once('close', code => resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), code: code ?? -1 }));
			child.stdin.end(options?.stdin);
		});
	}
}

function safeParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * Git credential helper that the agent host's processes run with its Node.js: `<helper> <socket> <operation>` sends the
 * request to the agent host and prints the client's answer. Without an answer it prints nothing, so Git asks its other
 * helpers or the user.
 */
export function getGitCredentialHelperScript(): string {
	return `'use strict';
const http = require('http');
const [socketPath, operation] = process.argv.slice(2);
if (operation !== 'get' && operation !== 'store' && operation !== 'erase') {
	process.exit(0);
}
let input = '';
let sent = false;
function send() {
	if (sent) {
		return;
	}
	sent = true;
	const req = http.request({ socketPath, path: '/', method: 'POST' }, res => {
		const chunks = [];
		res.on('data', chunk => chunks.push(chunk));
		res.on('end', () => {
			if (res.statusCode === 200) {
				try {
					process.stdout.write(JSON.parse(Buffer.concat(chunks).toString()).output);
				} catch {
					// No answer.
				}
			}
		});
	});
	req.on('error', () => { });
	req.end(JSON.stringify({ operation, input }));
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
	input += chunk;
	// Git ends a request with an empty line.
	if (input === '\\n' || input.endsWith('\\n\\n')) {
		send();
	}
});
process.stdin.on('end', send);
`;
}
