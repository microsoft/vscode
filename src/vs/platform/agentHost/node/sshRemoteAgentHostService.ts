/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type WebSocket from 'ws';
import type { AnyAuthMethod, AuthenticationType, ConnectConfig } from 'ssh2';
import { promises as fsp } from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import { dirname, join, isAbsolute, basename } from '../../../base/common/path.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, toDisposable } from '../../../base/common/lifecycle.js';
import { raceTimeout } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService, TelemetryConfiguration } from '../../telemetry/common/telemetry.js';
import {
	ISSHRemoteAgentHostMainService,
	SSHAuthMethod,
	computeSSHConnectionKey,
	type ISSHAgentHostConfig,
	type ISSHAgentHostConfigSanitized,
	type ISSHConnectProgress,
	type ISSHConnectResult,
	type ISSHEndpointCandidate,
	type ISSHEndpointSelection,
	type ISSHEndpointSelectionRequest,
	type ISSHHostKeyVerificationRequest,
	type ISSHHostKeysAnnouncement,
	type ISSHKeyboardInteractivePrompt,
	type ISSHKeyboardInteractiveRequest,
	type ISSHResolvedConfig,
	type SSHAgentHostLifecycle,
	type SSHStrictHostKeyChecking,
	SSHHostKeyDeniedError,
} from '../common/sshRemoteAgentHost.js';
import {
	computeHostKeyFingerprint,
	matchKnownHosts,
	parseKnownHosts,
	readHostKeyType,
	type IKnownHostsEntry,
} from './sshKnownHosts.js';
import type { RemoteAgentHostLocationPreference } from '../common/remoteAgentHostLocationPreference.js';
import type { IRelayMessage } from '../common/relayTransport.js';
import { AgentHostTelemetryLevelEnvKey } from '../common/agentHostTelemetryEnv.js';
import { telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import {
	type AgentHostEndpointAddress,
	type AgentHostServerType,
	type IAgentHostEndpointMetadata,
	isSameAgentHostEndpointIdentity,
} from '../common/agentHostEndpointRegistry.js';
import {
	buildAgentHostBaseCommand,
	buildAgentHostSpawnCommand,
	buildAgentRelayCommand,
	extractAgentHostWebSocketURL,
	filterLiveAgentHostEndpoints,
	getNewAgentHostRegistrationTimeoutMs,
	getRemoteCLIDataDir,
	redactToken,
	resolveRemotePlatform,
	runAgentEndpoints,
	shellEscape,
	validateAgentHostTelemetryLevel,
	waitForNewStandaloneEndpoint,
} from './sshRemoteAgentHostHelpers.js';
import { ensureRemoteAgentHostCliInstalled, type IRemoteAgentHostCliInstallResult } from './remoteAgentHostCliInstaller.js';
import { parseSSHConfigHostEntries, parseSSHGOutput, stripSSHComment } from '../common/sshConfigParsing.js';
import { removeAnsiEscapeCodes } from '../../../base/common/strings.js';

/** Minimal subset of ssh2.ClientChannel used by this module (duplex stream). */
interface SSHChannel extends NodeJS.ReadWriteStream {
	on(event: 'data', listener: (data: Buffer) => void): this;
	on(event: 'close', listener: (code: number) => void): this;
	on(event: 'error', listener: (err: Error) => void): this;
	on(event: string, listener: (...args: unknown[]) => void): this;
	stderr: { on(event: 'data', listener: (data: Buffer) => void): void };
	close(): void;
}

/** Minimal subset of ssh2.Client used by this module. */
interface SSHClient {
	on(event: 'ready', listener: () => void): SSHClient;
	on(event: 'error', listener: (err: Error) => void): SSHClient;
	on(event: 'close', listener: () => void): SSHClient;
	/**
	 * OpenSSH's `UpdateHostKeys` announcement. ssh2 verifies the
	 * `hostkeys-prove-00@openssh.com` signatures before emitting, so these keys
	 * are proven to belong to the connected server.
	 */
	on(event: 'hostkeys', listener: (keys: readonly { getPublicSSH(): Buffer; type: string }[]) => void): SSHClient;
	removeListener(event: 'close', listener: () => void): SSHClient;
	removeListener(event: 'error', listener: (err: Error) => void): SSHClient;
	connect(config: ConnectConfig): void;
	exec(command: string, callback: (err: Error | undefined, stream: SSHChannel) => void): SSHClient;
	forwardOut(srcIP: string, srcPort: number, dstIP: string, dstPort: number, callback: (err: Error | undefined, channel: SSHChannel) => void): SSHClient;
	end(): void;
}

const LOG_PREFIX = '[SSHRemoteAgentHost]';

/**
 * Maximum time to wait for {@link SSHRemoteAgentHostMainService._createWebSocketRelay}
 * to settle on the `replaceRelay` reconnect path before giving up. A silently
 * dead SSH client (TCP half-open, ssh2 keepalive hasn't fired yet) can leave
 * `forwardOut`'s callback unfired, hanging the whole `connect()` call. Bounding
 * this surfaces a clean failure so the renderer can clear its pending-reconnect
 * flag and retry, and so the dead SSH client gets ended (purging it from the
 * shared-process `_connections` map).
 *
 * The value is just slightly larger than ssh2's default keepalive failure
 * window (`keepaliveInterval * keepaliveCountMax` ~= 15s * 3 = 45s) so that in
 * practice the SSH client itself will surface its own `'close'` first when
 * the network is hard-down. Tests override this to a much smaller value.
 */
const RECONNECT_RELAY_TIMEOUT_MS = 60_000;

/** Opaque handle for the handshake deadline timer; see `_armHandshakeDeadline`. */
type IHandshakeDeadlineHandle = ReturnType<typeof setTimeout>;

/**
 * Deadline for the parts of the handshake that involve no human: TCP connect,
 * key exchange, and authentication. Kept short so an unreachable or stalled
 * server fails promptly.
 */
const HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Deadline that applies only while we are waiting on a person — a host key
 * confirmation or a keyboard-interactive prompt.
 *
 * We manage the handshake deadline ourselves (ssh2's `readyTimeout` is
 * disabled) because ssh2's timer covers the whole handshake and keeps running
 * while `hostVerifier` awaits a verdict. Leaving it armed would abort the
 * connection out from under a user doing exactly what the host key dialog asks
 * — going to compare a fingerprint against another source — while simply
 * raising it for the whole handshake would make an unreachable host take
 * minutes to fail. So the deadline is short by default and only stretched for
 * the interval a prompt is actually outstanding.
 */
const INTERACTIVE_TIMEOUT_MS = 300_000;

/**
 * One entry in the queue of authentication attempts handed to ssh2's
 * `authHandler`. Each attempt corresponds to one of the auth method shapes
 * documented at https://www.npmjs.com/package/ssh2#client-methods.
 *
 * `keyPath` is internal-only metadata for logging — it is stripped before the
 * attempt is returned to ssh2.
 */
export type SSHAuthAttempt =
	| { readonly type: 'publickey'; readonly username: string; readonly key: Buffer; readonly keyPath: string; readonly encrypted?: boolean }
	| { readonly type: 'agent'; readonly username: string; readonly agent: string }
	| { readonly type: 'password'; readonly username: string; readonly password: string }
	| { readonly type: 'keyboard-interactive'; readonly username: string };

function describeAuthAttempt(attempt: SSHAuthAttempt): string {
	switch (attempt.type) {
		case 'publickey': return `publickey ${attempt.keyPath}`;
		case 'agent': return 'agent';
		case 'password': return 'password';
		case 'keyboard-interactive': return 'keyboard-interactive';
	}
}

/**
 * Callback invoked when the SSH server requests keyboard-interactive
 * authentication. The handler must eventually call `finish` with the
 * user's responses (or an empty array to fail this attempt).
 */
export type SSHKeyboardInteractivePromptHandler = (
	name: string,
	instructions: string,
	prompts: readonly ISSHKeyboardInteractivePrompt[],
	finish: (responses: readonly string[]) => void,
) => void;

export type SSHKeyPassphrasePromptHandler = (
	keyPath: string,
	finish: (passphrase: string | undefined) => void,
) => void;

/**
 * Translate a {@link SSHAuthAttempt} into the payload shape ssh2 expects in
 * its `authHandler` callback. Returns `undefined` when the attempt cannot be
 * realized (currently only `keyboard-interactive` without a prompt handler).
 *
 * The kbi case is the one place where we still need a callback-bridge: ssh2
 * calls our `prompt` with a `finish(string[])` and we hand the responses to
 * `kbiHandler`. Isolating that here keeps it out of the iteration loop below.
 */
function toAuthMethod(
	attempt: SSHAuthAttempt,
	kbiHandler: SSHKeyboardInteractivePromptHandler | undefined,
	keyPassphraseHandler: SSHKeyPassphrasePromptHandler | undefined,
	callback: (next: AnyAuthMethod | false) => void,
): AnyAuthMethod | undefined {
	switch (attempt.type) {
		case 'publickey': {
			// Strip our internal `keyPath` metadata before handing to ssh2.
			const { keyPath: _kp, encrypted: _encrypted, ...payload } = attempt;
			if (attempt.encrypted) {
				if (!keyPassphraseHandler) {
					return undefined;
				}
				keyPassphraseHandler(attempt.keyPath, passphrase => {
					if (passphrase === undefined) {
						callback(false);
						return;
					}
					callback({ ...payload, passphrase });
				});
				return undefined;
			}
			return payload;
		}
		case 'agent':
		case 'password':
			return attempt;
		case 'keyboard-interactive': {
			if (!kbiHandler) {
				return undefined;
			}
			return {
				type: 'keyboard-interactive',
				username: attempt.username,
				prompt: (name, instructions, _lang, prompts, finish) => {
					const normalized = prompts.map(p => ({ prompt: p.prompt, echo: p.echo ?? true }));
					kbiHandler(name, instructions, normalized, responses => finish([...responses]));
				},
			};
		}
	}
}

/**
 * `agent` is a publickey-flavored method at the SSH protocol level — servers
 * advertise `publickey`, not `agent`, in `methodsLeft`. Returns true when the
 * server still has the underlying protocol method on offer.
 */
function isMethodAllowedByServer(attempt: SSHAuthAttempt, methodsLeft: AuthenticationType[] | null): boolean {
	if (!methodsLeft) {
		return true;
	}
	const protocolMethod: AuthenticationType = attempt.type === 'agent' ? 'publickey' : attempt.type;
	return methodsLeft.includes(protocolMethod);
}

/**
 * Build an ssh2 `authHandler` callback that walks the given attempts in order,
 * filtering by the server-advertised `methodsLeft` when ssh2 provides one.
 * Returns `false` when the queue is exhausted, which causes ssh2 to surface
 * an authentication failure to the caller.
 *
 * `kbiHandler` (when provided) is invoked by ssh2 if the server picks the
 * `keyboard-interactive` attempt, and is responsible for collecting
 * responses (e.g. by prompting the user).
 */
export function makeAuthHandler(
	attempts: readonly SSHAuthAttempt[],
	logService: ILogService,
	kbiHandler?: SSHKeyboardInteractivePromptHandler,
	keyPassphraseHandler?: SSHKeyPassphrasePromptHandler,
): (methodsLeft: AuthenticationType[] | null, partialSuccess: boolean, callback: (next: AnyAuthMethod | false) => void) => void {
	let index = 0;
	return (methodsLeft, _partialSuccess, callback) => {
		while (index < attempts.length) {
			const attempt = attempts[index++];
			if (!isMethodAllowedByServer(attempt, methodsLeft)) {
				logService.info(`${LOG_PREFIX} Skipping ${describeAuthAttempt(attempt)} — server only allows ${methodsLeft!.join(', ')}`);
				continue;
			}
			const method = toAuthMethod(attempt, kbiHandler, keyPassphraseHandler, callback);
			if (!method) {
				if (attempt.type === 'publickey' && attempt.encrypted && keyPassphraseHandler) {
					logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
					return;
				}
				logService.warn(`${LOG_PREFIX} ${describeAuthAttempt(attempt)} skipped: no prompt handler available`);
				continue;
			}
			logService.info(`${LOG_PREFIX} Trying auth: ${describeAuthAttempt(attempt)}`);
			callback(method);
			return;
		}
		logService.info(`${LOG_PREFIX} No more auth methods to try; giving up`);
		callback(false);
	};
}

function readSSHString(buffer: Buffer, offset: number): { value: string; offset: number } | undefined {
	if (offset + 4 > buffer.length) {
		return undefined;
	}
	const length = buffer.readUInt32BE(offset);
	const valueOffset = offset + 4;
	const nextOffset = valueOffset + length;
	if (nextOffset > buffer.length) {
		return undefined;
	}
	return { value: buffer.toString('utf8', valueOffset, nextOffset), offset: nextOffset };
}

function isEncryptedPrivateKey(key: Buffer): boolean {
	const text = key.toString('utf8');
	if (/-----BEGIN ENCRYPTED PRIVATE KEY-----/.test(text) || /Proc-Type:\s*4,ENCRYPTED/i.test(text)) {
		return true;
	}
	const openSSHKey = /-----BEGIN OPENSSH PRIVATE KEY-----([\s\S]+?)-----END OPENSSH PRIVATE KEY-----/.exec(text);
	if (!openSSHKey) {
		return false;
	}
	const data = Buffer.from(openSSHKey[1].replace(/\s+/g, ''), 'base64');
	const magic = Buffer.from('openssh-key-v1\0', 'utf8');
	if (data.length < magic.length || !data.subarray(0, magic.length).equals(magic)) {
		return false;
	}
	const cipher = readSSHString(data, magic.length);
	return !!cipher && cipher.value !== 'none';
}

function sshExec(client: SSHClient, command: string, opts?: { ignoreExitCode?: boolean }): Promise<{ stdout: string; stderr: string; code: number }> {
	return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
		client.exec(command, (err: Error | undefined, stream: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}

			let stdout = '';
			let stderr = '';
			let settled = false;

			const finish = (error: Error | undefined, code: number | undefined) => {
				if (settled) {
					return;
				}
				settled = true;
				if (error) {
					reject(error);
					return;
				}
				if (code !== 0 && !opts?.ignoreExitCode) {
					reject(new Error(`SSH command failed (exit ${code}): ${command}\nstderr: ${stderr}`));
				} else {
					resolve({ stdout, stderr, code: code ?? 0 });
				}
			};

			stream.on('data', (data: Buffer) => { stdout += data.toString(); });
			stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
			stream.on('error', (streamErr: Error) => finish(streamErr, undefined));
			stream.on('close', (code: number) => finish(undefined, code));
		});
	});
}

/** Create a bound exec function for the given SSH client. */
function bindSshExec(client: SSHClient): (command: string, opts?: { ignoreExitCode?: boolean }) => Promise<{ stdout: string; stderr: string; code: number }> {
	return (command, opts) => sshExec(client, command, opts);
}

function startRemoteAgentHost(
	client: SSHClient,
	logService: ILogService,
	cliBin: string | undefined,
	cliDataDir: string | undefined,
	commandOverride?: string,
	telemetryLevel = TelemetryConfiguration.OFF,
): Promise<{ port: number; connectionToken: string | undefined; pid: number | undefined; stream: SSHChannel }> {
	return new Promise((resolve, reject) => {
		if (!commandOverride && (!cliBin || !cliDataDir)) {
			reject(new Error(`${LOG_PREFIX} startRemoteAgentHost requires either a cliBin+cliDataDir pair or a commandOverride`));
			return;
		}
		const validatedTelemetryLevel = validateAgentHostTelemetryLevel(telemetryLevel);
		const baseCmd = commandOverride ?? buildAgentHostBaseCommand(cliBin!, cliDataDir!, validatedTelemetryLevel);
		// Wrap in a login shell so the agent host process inherits the
		// user's PATH and environment from ~/.bash_profile / ~/.bashrc
		// (ssh2 exec runs a non-interactive non-login shell by default).
		// Echo the PID so we can record it for process reuse detection.
		const cmd = `bash -l -c ${shellEscape(`echo VSCODE_PID=$$ && export ${AgentHostTelemetryLevelEnvKey}=${validatedTelemetryLevel} && exec ${baseCmd}`)}`;
		logService.info(`${LOG_PREFIX} Starting remote agent host: ${cmd}`);

		client.exec(cmd, (err: Error | undefined, stream: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}

			let resolved = false;
			let outputBuf = '';
			let pid: number | undefined;

			const timeout = setTimeout(() => {
				if (!resolved) {
					resolved = true;
					reject(new Error(`${LOG_PREFIX} Timed out waiting for agent host to start.\noutput so far: ${redactToken(outputBuf)}`));
				}
			}, 60_000);

			const checkForOutput = () => {
				const clean = removeAnsiEscapeCodes(outputBuf);
				if (pid === undefined) {
					const pidMatch = clean.match(/VSCODE_PID=(\d+)/);
					if (pidMatch) {
						pid = parseInt(pidMatch[1], 10);
						logService.info(`${LOG_PREFIX} Remote agent host PID: ${pid}`);
					}
				}

				if (!resolved) {
					const match = extractAgentHostWebSocketURL(clean);
					if (match) {
						resolved = true;
						clearTimeout(timeout);
						logService.info(`${LOG_PREFIX} Remote agent host listening on port ${match.port}`);
						resolve({ port: match.port, connectionToken: match.token, pid, stream });
					}
				}
			};

			stream.stderr.on('data', (data: Buffer) => {
				const text = data.toString();
				outputBuf += text;
				logService.trace(`${LOG_PREFIX} remote stderr: ${redactToken(text.trimEnd())}`);
				checkForOutput();
			});

			stream.on('data', (data: Buffer) => {
				const text = data.toString();
				outputBuf += text;
				logService.trace(`${LOG_PREFIX} remote stdout: ${redactToken(text.trimEnd())}`);
				checkForOutput();
			});

			stream.on('error', (streamErr: Error) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					reject(streamErr);
				}
			});

			stream.on('close', (code: number) => {
				if (!resolved) {
					resolved = true;
					clearTimeout(timeout);
					reject(new Error(`${LOG_PREFIX} Agent host process exited with code ${code} before becoming ready.\noutput: ${redactToken(outputBuf)}`));
				}
			});
		});
	});
}

/**
 * Open an SSH forwarded-out (`direct-tcpip`) channel to a TCP endpoint on the
 * remote host — used for `tcp`-typed agent host endpoints.
 */
function openForwardOutChannel(client: SSHClient, dstHost: string, dstPort: number): Promise<SSHChannel> {
	return new Promise((resolve, reject) => {
		client.forwardOut('127.0.0.1', 0, dstHost, dstPort, (err: Error | undefined, channel: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(channel);
		});
	});
}

/**
 * Open a raw byte-relay channel to a `socket`-typed agent host endpoint by
 * executing the remote CLI's `agent relay <instance-id>` command. Per the
 * CLI contract, the process relays raw bytes between its stdin/stdout and
 * the exact endpoint's listening socket, so the exec stream itself is the
 * duplex channel WebSocket framing runs over.
 */
function openRelayExecChannel(client: SSHClient, command: string, logService: ILogService): Promise<SSHChannel> {
	return new Promise((resolve, reject) => {
		client.exec(command, (err: Error | undefined, stream: SSHChannel) => {
			if (err) {
				reject(err);
				return;
			}
			stream.stderr.on('data', (data: Buffer) => {
				logService.trace(`${LOG_PREFIX} agent relay stderr: ${redactToken(data.toString().trimEnd())}`);
			});
			resolve(stream);
		});
	});
}

/**
 * Run WebSocket framing (via the `ws` library) over an already-open duplex
 * SSH channel. Shared by both `tcp` (forwardOut) and `socket` (relay exec)
 * endpoint kinds so there is exactly one place that speaks the agent host's
 * WebSocket protocol.
 */
function createWebSocketOverChannel(
	nativeRequire: NodeJS.Require,
	channel: SSHChannel,
	urlHost: string,
	urlPort: number,
	connectionToken: string | undefined,
	logService: ILogService,
	onMessage: (data: string) => void,
	onClose: () => void,
): Promise<{ send: (data: string) => void; close: () => void }> {
	return new Promise((resolve, reject) => {
		const WS = nativeRequire('ws') as typeof WebSocket;
		let url = `ws://${urlHost}:${urlPort}`;
		if (connectionToken) {
			url += `?tkn=${encodeURIComponent(connectionToken)}`;
		}

		// The SSH channel (or relay exec stream) is a duplex stream compatible
		// with ws's createConnection, but our minimal SSHChannel interface
		// doesn't carry the full Node Duplex shape.
		const ws = new WS(url, { createConnection: (() => channel) as unknown as WebSocket.ClientOptions['createConnection'] });

		ws.on('open', () => {
			logService.info(`${LOG_PREFIX} WebSocket relay connected to remote agent host`);
			resolve({
				send: (data: string) => {
					if (ws.readyState === ws.OPEN) {
						ws.send(data);
					}
				},
				close: () => ws.close(),
			});
		});

		ws.on('message', (data: WebSocket.RawData) => {
			if (Array.isArray(data)) {
				onMessage(Buffer.concat(data).toString());
			} else if (data instanceof ArrayBuffer) {
				onMessage(Buffer.from(new Uint8Array(data)).toString());
			} else {
				onMessage(data.toString());
			}
		});

		ws.on('close', onClose);

		ws.on('error', (wsErr: unknown) => {
			logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
			reject(wsErr);
		});
	});
}

/**
 * Create a WebSocket relay to an exact agent host endpoint. Supports both
 * `tcp` endpoints (via SSH `forwardOut`) and `socket` endpoints (via the
 * remote CLI's `agent relay` raw byte relay); the WebSocket framing itself
 * runs identically over either channel kind. Keeps a single SSH client for
 * both discovery and the data channel.
 */
async function createWebSocketRelayForEndpoint(
	nativeRequire: NodeJS.Require,
	client: SSHClient,
	endpoint: AgentHostEndpointAddress,
	relayCliBin: string,
	relayCliDataDir: string,
	relayInstanceId: string,
	relayUserDataPath: string,
	connectionToken: string | undefined,
	logService: ILogService,
	onMessage: (data: string) => void,
	onClose: () => void,
): Promise<{ send: (data: string) => void; close: () => void }> {
	let channel: SSHChannel;
	let urlHost: string;
	let urlPort: number;
	if (endpoint.type === 'tcp') {
		channel = await openForwardOutChannel(client, endpoint.host, endpoint.port);
		urlHost = endpoint.host;
		urlPort = endpoint.port;
	} else {
		const command = buildAgentRelayCommand(relayCliBin, relayCliDataDir, relayInstanceId, relayUserDataPath);
		logService.info(`${LOG_PREFIX} Opening agent relay channel: ${command}`);
		channel = await openRelayExecChannel(client, command, logService);
		// The relay exec stream bypasses real TCP dialing entirely (the
		// `createConnection` override above), so this host/port pair is never
		// actually dialed — it only needs to form a syntactically valid
		// `ws://` URL for the `ws` library to parse.
		urlHost = '127.0.0.1';
		urlPort = 1;
	}
	return createWebSocketOverChannel(nativeRequire, channel, urlHost, urlPort, connectionToken, logService, onMessage, onClose);
}

function sanitizeConfig(config: ISSHAgentHostConfig): ISSHAgentHostConfigSanitized {
	const { password: _p, privateKeyPath: _k, ...sanitized } = config;
	return sanitized;
}

/**
 * State for a single active SSH relay connection.
 * Immutable and dispose-once — follows the same pattern as TunnelConnection.
 * On reconnect, the old SSHConnection is disposed and a fresh one is created;
 * the SSH client can be detached first so only the WebSocket relay is torn down.
 */
class SSHConnection extends Disposable {
	private readonly _onDidClose = new Emitter<void>();
	readonly onDidClose = this._onDidClose.event;

	readonly config: ISSHAgentHostConfigSanitized;
	private _closed = false;
	private _sshClientDetached = false;
	private readonly _sshCloseListener = () => {
		this._logService.info(`${LOG_PREFIX} SSH client closed for connection ${this.connectionId} (address ${this.address}); disposing connection`);
		this.dispose();
	};
	private readonly _sshErrorListener = (err?: Error) => {
		this._logService.info(`${LOG_PREFIX} SSH client error for connection ${this.connectionId} (address ${this.address}): ${err instanceof Error ? err.message : String(err)}; disposing connection`);
		this.dispose();
	};

	constructor(
		fullConfig: ISSHAgentHostConfig,
		readonly connectionId: string,
		readonly address: string,
		readonly name: string,
		readonly connectionToken: string | undefined,
		/** Exact endpoint address (TCP host/port or remote socket path) this connection is attached to. */
		readonly endpoint: AgentHostEndpointAddress,
		/** Registry-discovered server type, when known (unset for the `remoteAgentHostCommand` override path). */
		readonly serverType: AgentHostServerType | undefined,
		/** Registry `instanceId`, when known (`'override'` sentinel for the `remoteAgentHostCommand` override path). */
		readonly instanceId: string,
		/** Whether this desktop spawned the backing process (`managed`) or attached to one already running (`external`). */
		readonly lifecycle: SSHAgentHostLifecycle,
		/** Resolved remote CLI binary path; empty for the `remoteAgentHostCommand` override path (not applicable). */
		readonly cliBin: string,
		/** Resolved remote CLI data dir; empty for the `remoteAgentHostCommand` override path (not applicable). */
		readonly cliDataDir: string,
		/** Remote user-data path the endpoint registry was resolved against; empty for the `remoteAgentHostCommand` override path (not applicable). */
		readonly userDataPath: string,
		readonly sshClient: SSHClient,
		private readonly _relay: { send: (data: string) => void; close: () => void },
		private readonly _remoteStream: SSHChannel | undefined,
		private readonly _logService: ILogService,
	) {
		super();

		this.config = sanitizeConfig(fullConfig);

		// Register cleanup first so it fires _onDidClose *before* the Emitter is disposed.
		this._register(toDisposable(() => {
			if (this._closed) {
				return;
			}
			this._closed = true;
			this._relay.close();
			if (!this._sshClientDetached) {
				this._remoteStream?.close();
				sshClient.end();
			}
			this._onDidClose.fire();
		}));

		this._register(this._onDidClose);

		sshClient.on('close', this._sshCloseListener);
		sshClient.on('error', this._sshErrorListener);
	}

	/**
	 * Detach the SSH client from this connection so that `dispose()`
	 * only closes the WebSocket relay without ending the SSH session.
	 * Also removes event listeners from the SSH client so the old
	 * connection object is not retained by the shared client.
	 */
	detachSshClient(): void {
		this._sshClientDetached = true;
		this.sshClient.removeListener('close', this._sshCloseListener);
		this.sshClient.removeListener('error', this._sshErrorListener);
	}

	relaySend(data: string): void {
		this._relay.send(data);
	}
}

export class SSHRemoteAgentHostMainService extends Disposable implements ISSHRemoteAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeConnections = this._register(new Emitter<void>());
	readonly onDidChangeConnections: Event<void> = this._onDidChangeConnections.event;

	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection: Event<string> = this._onDidCloseConnection.event;

	private readonly _onDidReportConnectProgress = this._register(new Emitter<ISSHConnectProgress>());
	readonly onDidReportConnectProgress: Event<ISSHConnectProgress> = this._onDidReportConnectProgress.event;

	private readonly _onDidRelayMessage = this._register(new Emitter<IRelayMessage>());
	readonly onDidRelayMessage: Event<IRelayMessage> = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose: Event<string> = this._onDidRelayClose.event;

	private readonly _onDidRequestKeyboardInteractive = this._register(new Emitter<ISSHKeyboardInteractiveRequest>());
	readonly onDidRequestKeyboardInteractive: Event<ISSHKeyboardInteractiveRequest> = this._onDidRequestKeyboardInteractive.event;

	private readonly _onDidCancelKeyboardInteractive = this._register(new Emitter<string>());
	readonly onDidCancelKeyboardInteractive: Event<string> = this._onDidCancelKeyboardInteractive.event;

	private readonly _onDidRequestEndpointSelection = this._register(new Emitter<ISSHEndpointSelectionRequest>());
	readonly onDidRequestEndpointSelection: Event<ISSHEndpointSelectionRequest> = this._onDidRequestEndpointSelection.event;

	private readonly _onDidCancelEndpointSelection = this._register(new Emitter<string>());
	readonly onDidCancelEndpointSelection: Event<string> = this._onDidCancelEndpointSelection.event;

	private readonly _onDidRequestHostKeyVerification = this._register(new Emitter<ISSHHostKeyVerificationRequest>());
	readonly onDidRequestHostKeyVerification: Event<ISSHHostKeyVerificationRequest> = this._onDidRequestHostKeyVerification.event;

	private readonly _onDidCancelHostKeyVerification = this._register(new Emitter<string>());
	readonly onDidCancelHostKeyVerification: Event<string> = this._onDidCancelHostKeyVerification.event;

	private readonly _onDidAnnounceHostKeys = this._register(new Emitter<ISSHHostKeysAnnouncement>());
	readonly onDidAnnounceHostKeys: Event<ISSHHostKeysAnnouncement> = this._onDidAnnounceHostKeys.event;

	/**
	 * Pending keyboard-interactive prompts awaiting a response from the renderer.
	 * Keyed by `requestId`. Each entry can either finish the ssh2 prompt with
	 * responses or cancel the owning connect attempt when the user dismisses it.
	 */
	private readonly _pendingKbiRequests = new Map<string, { finish: (responses: readonly string[]) => void; cancelConnect: () => void }>();
	private _kbiRequestCounter = 0;

	/**
	 * Pending endpoint-selection prompts awaiting a response from the
	 * renderer. Keyed by `requestId`; resolved with the user's choice, or
	 * `undefined` on cancellation (rejects the owning connect attempt).
	 */
	private readonly _pendingEndpointSelections = new Map<string, (selection: ISSHEndpointSelection | undefined) => void>();
	private _endpointSelectionCounter = 0;

	/**
	 * Pending host key verifications awaiting a verdict from the renderer,
	 * keyed by `requestId`. Every entry must eventually be settled — leaving
	 * one unanswered suspends the SSH handshake until the deadline elapses.
	 *
	 * `onUserDenied` lets the owning connect attempt distinguish "the renderer
	 * refused this key" from any other handshake failure, so it can surface a
	 * clean error instead of ssh2's internal wording.
	 */
	private readonly _pendingHostKeyRequests = new Map<string, { verify: (trusted: boolean) => void; onUserDenied?: () => void }>();
	private _hostKeyRequestCounter = 0;

	private readonly _connections = this._register(new DisposableMap<string, SSHConnection>());

	private _nativeRequire: NodeJS.Require | undefined;

	/**
	 * Override hook for tests to shorten the relay-creation timeout used on
	 * the `replaceRelay` reconnect path. See {@link RECONNECT_RELAY_TIMEOUT_MS}.
	 */
	protected relayCreationTimeoutMs: number = RECONNECT_RELAY_TIMEOUT_MS;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
	}

	/**
	 * Lazily load a `require` function for native modules (`ssh2`, `ws`).
	 * Uses a dynamic `import('node:module')` so the module is only resolved
	 * when actually needed at runtime — not at file-load time. This matters
	 * because tests override the methods that call this and never trigger
	 * the import, avoiding issues with Electron's ESM loader which cannot
	 * resolve `node:` specifiers.
	 */
	private async _getNativeRequire(): Promise<NodeJS.Require> {
		if (!this._nativeRequire) {
			const nodeModule = await import('node:module');
			this._nativeRequire = nodeModule.createRequire(import.meta.url);
		}
		return this._nativeRequire;
	}

	async connect(config: ISSHAgentHostConfig, replaceRelay?: boolean): Promise<ISSHConnectResult> {
		const connectionKey = computeSSHConnectionKey(config);

		const existing = this._connections.get(connectionKey);
		if (existing) {
			if (replaceRelay) {
				// Tear down the old relay and create a fresh one, following
				// the same dispose-and-recreate pattern as TunnelAgentHostMainService.
				// The SSH client is detached so only the WebSocket relay is closed.
				// This reconnect path deliberately does NOT rerun endpoint
				// discovery/selection: it reattaches to the exact same endpoint
				// this connection was already using, so a dropped SSH tunnel can
				// never silently promote a different candidate or spawn a
				// duplicate standalone (requirement 7).
				this._logService.info(`${LOG_PREFIX} Reconnecting relay for existing SSH tunnel ${connectionKey}`);
				const { sshClient, endpoint, connectionToken, serverType, instanceId, lifecycle, cliBin, cliDataDir, userDataPath } = existing;

				// Remove from map and detach SSH client before disposing so
				// the old relay's close handler (conn?.dispose()) is a no-op.
				this._connections.deleteAndLeak(connectionKey);
				existing.detachSshClient();
				existing.dispose();

				// Create fresh relay and connection. If relay creation fails,
				// clean up the detached SSH client so it doesn't leak.
				const connectionId = connectionKey;
				try {
					let conn: SSHConnection | undefined; // eslint-disable-line prefer-const
					// Bound the relay creation: a silently dead SSH client
					// (TCP half-open, ssh2 keepalive hasn't fired yet) can
					// leave forwardOut's callback unfired, hanging the whole
					// promise chain. raceTimeout returns undefined on timeout.
					const timeoutMs = this.relayCreationTimeoutMs;
					const relay = await raceTimeout(
						this._createWebSocketRelay(
							sshClient, endpoint, cliBin, cliDataDir, instanceId, userDataPath, connectionToken,
							(data: string) => this._onDidRelayMessage.fire({ connectionId, data }),
							() => { conn?.dispose(); },
						),
						timeoutMs,
					);
					if (!relay) {
						throw new Error(`SSH relay creation timed out after ${timeoutMs}ms (SSH client appears unresponsive)`);
					}

					conn = new SSHConnection(
						config, connectionId, connectionKey, config.name,
						connectionToken, endpoint, serverType, instanceId, lifecycle, cliBin, cliDataDir, userDataPath,
						sshClient, relay, undefined,
						this._logService,
					);

					Event.once(conn.onDidClose)(() => {
						if (this._connections.get(connectionKey) === conn) {
							this._connections.deleteAndDispose(connectionKey);
							this._onDidRelayClose.fire(connectionId);
							this._onDidCloseConnection.fire(connectionId);
							this._onDidChangeConnections.fire();
						}
					});

					this._connections.set(connectionKey, conn);

					return {
						connectionId: conn.connectionId,
						address: conn.address,
						name: conn.name,
						connectionToken: conn.connectionToken,
						config: conn.config,
						sshConfigHost: config.sshConfigHost,
						serverType: conn.serverType,
						instanceId: conn.instanceId,
						primary: true,
						lifecycle: conn.lifecycle,
					};
				} catch (err) {
					sshClient.end();
					this._onDidRelayClose.fire(connectionId);
					this._onDidCloseConnection.fire(connectionId);
					this._onDidChangeConnections.fire();
					throw err;
				}
			}

			return {
				connectionId: existing.connectionId,
				address: existing.address,
				name: existing.name,
				connectionToken: existing.connectionToken,
				config: existing.config,
				sshConfigHost: config.sshConfigHost,
				serverType: existing.serverType,
				instanceId: existing.instanceId,
				primary: true,
				lifecycle: existing.lifecycle,
			};
		}

		this._logService.info(`${LOG_PREFIX} ${replaceRelay ? 'Reconnecting' : 'Connecting'} to ${connectionKey}`);
		const displayHost = config.sshConfigHost ?? `${config.username}@${config.host}`;
		let sshClient: SSHClient | undefined;

		try {
			const reportProgress = (message: string) => {
				this._onDidReportConnectProgress.fire({ connectionKey, message });
			};

			// 1. Establish SSH connection
			reportProgress(localize('sshProgressConnecting', "Establishing SSH connection..."));
			sshClient = await this._connectSSH(config, connectionKey);

			let endpoint: AgentHostEndpointAddress;
			let connectionToken: string | undefined;
			let serverType: AgentHostServerType | undefined;
			let instanceId: string;
			let lifecycle: SSHAgentHostLifecycle;
			let cliBin = '';
			let cliDataDir = '';
			let userDataPath = '';
			let agentStream: SSHChannel | undefined;

			if (config.remoteAgentHostCommand) {
				// Dev override: a custom command bypasses the shared endpoint
				// registry entirely — there is no resolved CLI binary to run
				// `agent endpoints` with, and the override command need not
				// even be our CLI. The command is executed verbatim with no
				// arguments appended; launch restrictions such as telemetry
				// level are supplied through its environment. Always start a
				// fresh process (requirement 6).
				this._logService.info(`${LOG_PREFIX} Using custom agent host command: ${config.remoteAgentHostCommand}; skipping endpoint discovery/selection`);
				reportProgress(localize('sshProgressStartingAgent', "Starting remote agent host..."));
				const result = await this._startRemoteAgentHost(sshClient, undefined, undefined, config.remoteAgentHostCommand, this._effectiveTelemetryLevel);
				endpoint = { type: 'tcp', host: '127.0.0.1', port: result.port };
				connectionToken = result.connectionToken;
				agentStream = result.stream;
				serverType = undefined;
				instanceId = 'override';
				lifecycle = 'managed';
			} else {
				// 2. Resolve the remote CLI first — every registry command
				// (`agent endpoints`/`agent host`/`agent relay`) needs it.
				const { stdout: unameS } = await sshExec(sshClient, 'uname -s');
				const { stdout: unameM } = await sshExec(sshClient, 'uname -m');
				const platform = resolveRemotePlatform(unameS, unameM);
				if (!platform) {
					throw new Error(`${LOG_PREFIX} Unsupported remote platform: ${unameS.trim()} ${unameM.trim()}`);
				}
				this._logService.info(`${LOG_PREFIX} Remote platform: ${platform.os}-${platform.arch}`);
				reportProgress(localize('sshProgressInstallingCLI', "Checking remote CLI installation..."));
				const cliInstallation = await this._ensureCLIInstalled(sshClient, platform, reportProgress);
				cliBin = cliInstallation.cliBin;
				cliDataDir = getRemoteCLIDataDir(this._serverDataFolderName);

				// 3. Discover every live endpoint on the remote via the shared registry.
				reportProgress(localize('sshProgressCheckingAgent', "Checking for existing agent hosts..."));
				const exec = bindSshExec(sshClient);
				const initial = await runAgentEndpoints(exec, cliBin, cliDataDir);
				userDataPath = initial.userDataPath;
				const live = await filterLiveAgentHostEndpoints(exec, initial.endpoints);
				const editors = live.filter(e => e.type === 'editor');
				const standalones = live.filter(e => e.type === 'standalone');

				const spawnDedicated = async (): Promise<IAgentHostEndpointMetadata> => {
					const spawnCommand = buildAgentHostSpawnCommand(cliBin, cliDataDir, userDataPath, this._effectiveTelemetryLevel);
					reportProgress(localize('sshProgressStartingAgent', "Starting remote agent host..."));
					this._logService.info(`${LOG_PREFIX} Spawning dedicated standalone agent host: ${spawnCommand}`);
					// Fire-and-forget: the spawned process is self-managed via
					// --idle-timeout and outlives this exec channel, so we must
					// not await its stream closing — only poll the registry for
					// the new entry it publishes.
					exec(spawnCommand, { ignoreExitCode: true }).catch(err => {
						this._logService.warn(`${LOG_PREFIX} Spawn command for dedicated agent host reported an error: ${err instanceof Error ? err.message : String(err)}`);
					});
					reportProgress(localize('sshProgressAwaitingAgent', "Waiting for the new agent host to register..."));
					return waitForNewStandaloneEndpoint(exec, cliBin, cliDataDir, userDataPath, live, {
						timeoutMs: getNewAgentHostRegistrationTimeoutMs(cliInstallation.installed),
						progress: elapsedMs => reportProgress(localize('sshProgressStillAwaitingAgent', "Waiting for the new agent host to register... ({0} seconds elapsed)", Math.floor(elapsedMs / 1000))),
					});
				};

				// Deterministic dedicated (standalone) selection: reuse a live
				// standalone (lowest `instanceId` first, so repeated silent
				// attempts are stable) when one exists, or spawn a new
				// dedicated one otherwise. Shared by the stored-preference
				// paths below and the silent/background reconnect policy —
				// neither ever opens the picker.
				const selectDedicated = async (): Promise<{ chosen: IAgentHostEndpointMetadata; lifecycle: SSHAgentHostLifecycle }> => {
					if (standalones.length === 0) {
						return { chosen: await spawnDedicated(), lifecycle: 'managed' };
					}
					const [deterministic] = [...standalones].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
					return { chosen: deterministic, lifecycle: 'external' };
				};

				// Selection policy (requirement 2): with no editor entries,
				// reuse a live standalone deterministically when exactly one
				// exists, otherwise spawn (zero) or prompt (multiple). With
				// any editor entry present, always prompt among every live
				// endpoint plus "spawn", since silent reuse could otherwise
				// steal a session out from under another open editor window.
				//
				// A renderer-supplied `config.preferredAgentLocation` (the
				// stored `IRemoteAgentHostLocationPreferenceService` choice
				// for this host, threaded in from the renderer before this
				// connect/reconnect call) is explicit consent and takes
				// priority over everything below, including
				// `userInitiated`: a stored `editor` preference lets even a
				// silent/background reconnect land on a live `editor`-owned
				// endpoint (falling back to dedicated selection — without
				// mutating the stored preference — if none is live), and a
				// stored `dedicated` preference always selects dedicated.
				// Neither ever emits an endpoint-selection request, since
				// the choice is already known.
				//
				// Without a stored preference, the previous behavior is
				// unchanged: a silent/background reconnect (`config.userInitiated
				// === false`, e.g. the startup/auto-reconnect path) must
				// never open the picker and must never silently attach to
				// an `editor`-owned endpoint — it deterministically reuses a
				// live `standalone` when one exists, or spawns a new
				// dedicated one otherwise. A user-initiated connect with no
				// stored preference still shows the picker when an editor
				// entry exists, giving the renderer's preference-resolution
				// flow (see `_resolveEndpointSelection`) a chance to prompt
				// and persist a fresh choice.
				const selectEndpoint = async (): Promise<{ chosen: IAgentHostEndpointMetadata; lifecycle: SSHAgentHostLifecycle }> => {
					if (config.preferredAgentLocation === 'editor') {
						if (editors.length > 0) {
							const [deterministic] = [...editors].sort((a, b) => a.instanceId.localeCompare(b.instanceId));
							return { chosen: deterministic, lifecycle: 'external' };
						}
						return selectDedicated();
					}
					if (config.preferredAgentLocation === 'dedicated') {
						return selectDedicated();
					}
					if (config.userInitiated === false) {
						return selectDedicated();
					}
					if (editors.length === 0) {
						if (standalones.length === 0) {
							return { chosen: await spawnDedicated(), lifecycle: 'managed' };
						}
						if (standalones.length === 1) {
							return { chosen: standalones[0], lifecycle: 'external' };
						}
						reportProgress(localize('sshProgressAwaitingSelection', "Waiting for endpoint selection..."));
						const selection = await this._requestEndpointSelection(sshClient!, connectionKey, displayHost, standalones);
						if (selection.kind === 'spawn') {
							return { chosen: await spawnDedicated(), lifecycle: 'managed' };
						}
						const found = standalones.find(e => isSameAgentHostEndpointIdentity(e, selection));
						if (!found) {
							throw new Error(`${LOG_PREFIX} Selected agent host endpoint is no longer available`);
						}
						return { chosen: found, lifecycle: 'external' };
					}
					reportProgress(localize('sshProgressAwaitingSelection', "Waiting for endpoint selection..."));
					const selection = await this._requestEndpointSelection(sshClient!, connectionKey, displayHost, live);
					if (selection.kind === 'spawn') {
						return { chosen: await spawnDedicated(), lifecycle: 'managed' };
					}
					const found = live.find(e => isSameAgentHostEndpointIdentity(e, selection));
					if (!found) {
						throw new Error(`${LOG_PREFIX} Selected agent host endpoint is no longer available`);
					}
					// Both a chosen editor and a chosen (reused) standalone
					// become this desktop's primary, externally-owned
					// connection — neither is killed or replaced (requirement 5).
					return { chosen: found, lifecycle: 'external' };
				};

				const selected = await selectEndpoint();
				endpoint = selected.chosen.endpoint;
				connectionToken = selected.chosen.connectionToken;
				serverType = selected.chosen.type;
				instanceId = selected.chosen.instanceId;
				lifecycle = selected.lifecycle;
			}

			// 4. Connect to the exact selected/spawned endpoint via WebSocket relay.
			reportProgress(localize('sshProgressForwarding', "Connecting to remote agent host..."));
			const connectionId = connectionKey;
			let conn: SSHConnection | undefined; // eslint-disable-line prefer-const
			let relay: { send: (data: string) => void; close: () => void };
			try {
				relay = await this._createWebSocketRelay(
					sshClient, endpoint, cliBin, cliDataDir, instanceId, userDataPath, connectionToken,
					(data: string) => this._onDidRelayMessage.fire({ connectionId, data }),
					() => { conn?.dispose(); },
				);
			} catch (relayErr) {
				// Never silently promote a different candidate, nor kill/replace
				// an editor or reused standalone, on failure — reread the
				// registry once (purely diagnostic) and surface a clear error
				// so the user can retry connecting against a fresh picker
				// (requirement 7).
				const relayErrorMessage = relayErr instanceof Error ? relayErr.message : String(relayErr);
				this._logService.warn(`${LOG_PREFIX} Failed to connect to selected agent host endpoint: ${relayErrorMessage}`);
				if (!config.remoteAgentHostCommand && cliBin && cliDataDir) {
					try {
						await runAgentEndpoints(bindSshExec(sshClient), cliBin, cliDataDir, userDataPath);
					} catch (rereadErr) {
						this._logService.warn(`${LOG_PREFIX} Failed to reread agent host endpoints after relay failure: ${rereadErr instanceof Error ? rereadErr.message : String(rereadErr)}`);
					}
				}
				throw new Error(`${LOG_PREFIX} Failed to connect to the selected remote agent host: ${relayErrorMessage}. Please retry connecting.`);
			}

			// 5. Create connection object
			const address = connectionKey;
			conn = new SSHConnection(
				config,
				connectionId,
				address,
				config.name,
				connectionToken,
				endpoint,
				serverType,
				instanceId,
				lifecycle,
				cliBin,
				cliDataDir,
				userDataPath,
				sshClient,
				relay,
				agentStream,
				this._logService,
			);

			Event.once(conn.onDidClose)(() => {
				if (this._connections.get(connectionKey) === conn) {
					this._connections.deleteAndDispose(connectionKey);
					this._onDidRelayClose.fire(connectionId);
					this._onDidCloseConnection.fire(connectionId);
					this._onDidChangeConnections.fire();
				}
			});

			this._connections.set(connectionKey, conn);
			sshClient = undefined; // ownership transferred to SSHConnection

			this._onDidChangeConnections.fire();

			return {
				connectionId,
				address,
				name: config.name,
				connectionToken,
				config: conn.config,
				sshConfigHost: config.sshConfigHost,
				serverType,
				instanceId,
				primary: true,
				lifecycle,
			};

		} catch (err) {
			sshClient?.end();
			if (!(err instanceof CancellationError)) {
				this._logService.error(`${LOG_PREFIX} Failed to connect to ${displayHost}`, err);
			}
			throw err;
		}
	}


	async disconnect(host: string): Promise<void> {
		for (const [key, conn] of this._connections) {
			if (key === host || conn.connectionId === host) {
				conn.dispose();
				return;
			}
		}
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		for (const conn of this._connections.values()) {
			if (conn.connectionId === connectionId) {
				conn.relaySend(message);
				return;
			}
		}
	}

	async reconnect(sshConfigHost: string, name: string, remoteAgentHostCommand?: string, agentForward?: boolean, userInitiated?: boolean, preferredAgentLocation?: RemoteAgentHostLocationPreference): Promise<ISSHConnectResult> {
		this._logService.info(`${LOG_PREFIX} Reconnecting via SSH config host: ${sshConfigHost} (userInitiated=${userInitiated ?? true})`);
		const resolved = await this.resolveSSHConfig(sshConfigHost);

		// Always use Agent auth — the auth handler will walk through the SSH
		// agent and any default identities. If the user pinned a non-default
		// `IdentityFile` in their ssh config, surface it as the explicit key
		// so it gets tried first.
		let privateKeyPath: string | undefined;
		if (resolved.identityFile.length > 0 && !SSHRemoteAgentHostMainService._isDefaultKeyPath(resolved.identityFile[0])) {
			privateKeyPath = resolved.identityFile[0];
		}
		this._logService.info(`${LOG_PREFIX} reconnect: identityFiles=${JSON.stringify(resolved.identityFile)}, explicit key=${privateKeyPath ?? '(none)'}`);

		return this.connect({
			host: resolved.hostname,
			port: resolved.port !== 22 ? resolved.port : undefined,
			username: resolved.user ?? sshConfigHost,
			authMethod: SSHAuthMethod.Agent,
			privateKeyPath,
			identityAgent: resolved.identityAgent,
			name,
			sshConfigHost,
			remoteAgentHostCommand,
			agentForward: agentForward && resolved.forwardAgent ? true : undefined,
			userInitiated,
			preferredAgentLocation,
		}, /* replaceRelay */ true);
	}

	async listSSHConfigHosts(): Promise<string[]> {
		const configPath = join(os.homedir(), '.ssh', 'config');
		try {
			const content = await fsp.readFile(configPath, 'utf-8');
			return this._parseSSHConfigHosts(content, dirname(configPath));
		} catch {
			this._logService.info(`${LOG_PREFIX} Could not read SSH config at ${configPath}`);
			return [];
		}
	}

	async ensureUserSSHConfig(): Promise<URI> {
		const sshDir = join(os.homedir(), '.ssh');
		const configPath = join(sshDir, 'config');
		const isPosix = process.platform !== 'win32';
		try {
			await fsp.mkdir(sshDir, { recursive: true, mode: isPosix ? 0o700 : undefined });
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} Failed to ensure ~/.ssh directory: ${err}`);
			throw err;
		}
		try {
			await fsp.access(configPath);
		} catch {
			try {
				const handle = await fsp.open(configPath, 'a', isPosix ? 0o600 : undefined);
				await handle.close();
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Failed to create ${configPath}: ${err}`);
				throw err;
			}
		}
		return URI.file(configPath);
	}

	async listSSHConfigFiles(): Promise<URI[]> {
		const isWindows = process.platform === 'win32';
		const userConfigPath = join(os.homedir(), '.ssh', 'config');
		const systemConfigPath = isWindows
			? join(process.env['ProgramData'] ?? 'C:\\ProgramData', 'ssh', 'ssh_config')
			: '/etc/ssh/ssh_config';

		const result: URI[] = [URI.file(userConfigPath)];
		try {
			await fsp.access(systemConfigPath);
			result.push(URI.file(systemConfigPath));
		} catch {
			// system config file does not exist — skip
		}
		return result;
	}

	async resolveSSHConfig(host: string): Promise<ISSHResolvedConfig> {
		return new Promise<ISSHResolvedConfig>((resolve, reject) => {
			cp.execFile('ssh', ['-G', host], { timeout: 5000 }, (err, stdout) => {
				if (err) {
					reject(new Error(`${LOG_PREFIX} ssh -G failed for ${host}: ${err.message}`));
					return;
				}
				const config = this._parseSSHGOutput(stdout);
				resolve(config);
			});
		});
	}

	private async _parseSSHConfigHosts(content: string, configDir: string, visited?: Set<string>): Promise<string[]> {
		const seen = visited ?? new Set<string>();
		const hosts: string[] = [];

		// Extract hosts from this file directly
		hosts.push(...parseSSHConfigHostEntries(content));

		// Follow Include directives
		for (const line of content.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) {
				continue;
			}
			const includeMatch = trimmed.match(/^Include\s+(.+)$/i);
			if (!includeMatch) {
				continue;
			}

			const rawValue = stripSSHComment(includeMatch[1]);
			const patterns = rawValue.split(/\s+/).filter(Boolean);

			for (const rawPattern of patterns) {
				const pattern = rawPattern.replace(/^~/, os.homedir());
				const resolvedPattern = isAbsolute(pattern) ? pattern : join(configDir, pattern);

				if (seen.has(resolvedPattern)) {
					continue;
				}
				seen.add(resolvedPattern);

				try {
					const stat = await fsp.stat(resolvedPattern);
					if (stat.isDirectory()) {
						const files = await fsp.readdir(resolvedPattern);
						for (const file of files) {
							try {
								const sub = await fsp.readFile(join(resolvedPattern, file), 'utf-8');
								hosts.push(...await this._parseSSHConfigHosts(sub, resolvedPattern, seen));
							} catch { /* skip unreadable files */ }
						}
					} else {
						const sub = await fsp.readFile(resolvedPattern, 'utf-8');
						hosts.push(...await this._parseSSHConfigHosts(sub, dirname(resolvedPattern), seen));
					}
				} catch {
					const dir = dirname(resolvedPattern);
					const base = basename(resolvedPattern);
					if (base.includes('*')) {
						try {
							const files = await fsp.readdir(dir);
							for (const file of files) {
								const regex = new RegExp('^' + base.replace(/\*/g, '.*') + '$');
								if (regex.test(file)) {
									try {
										const sub = await fsp.readFile(join(dir, file), 'utf-8');
										hosts.push(...await this._parseSSHConfigHosts(sub, dir, seen));
									} catch { /* skip */ }
								}
							}
						} catch { /* skip unreadable dirs */ }
					}
				}
			}
		}
		return hosts;
	}

	private _parseSSHGOutput(stdout: string): ISSHResolvedConfig {
		return parseSSHGOutput(stdout);
	}

	protected async _connectSSH(
		config: ISSHAgentHostConfig,
		connectionKey?: string,
	): Promise<SSHClient> {
		const port = config.port ?? 22;
		const connectConfig: ConnectConfig = {
			host: config.host,
			port,
			username: config.username,
			// We enforce the handshake deadline ourselves so it can be stretched
			// while a prompt is outstanding; see INTERACTIVE_TIMEOUT_MS.
			readyTimeout: 0,
			keepaliveInterval: 15_000,
		};

		const attempts = await this._buildAuthAttempts(config);
		this._logService.info(`${LOG_PREFIX} Built ${attempts.length} auth attempt(s): ${attempts.map(a => describeAuthAttempt(a)).join(', ')}`);
		const displayHost = config.sshConfigHost ?? `${config.username}@${config.host}`;
		// Track requestIds we created during this connect so we can fire
		// onDidCancelKeyboardInteractive for any still-pending prompts when
		// the connect attempt fails or completes.
		const liveKbiRequests = new Set<string>();
		let cancelConnectFromKbi: (() => void) | undefined;
		// Forward reference into the connect promise below. Declared up here so
		// every human-facing prompt can widen the handshake deadline while it
		// is outstanding.
		let armDeadline: ((ms: number) => void) | undefined;
		// Once the user has answered, the human is out of the loop again, so
		// the rest of the handshake goes back to the network-sized deadline.
		const wrapPromptFinish = <T>(finish: (value: T) => void) => (value: T) => {
			armDeadline?.(HANDSHAKE_TIMEOUT_MS);
			finish(value);
		};
		const kbiHandler: SSHKeyboardInteractivePromptHandler | undefined = attempts.some(a => a.type === 'keyboard-interactive')
			? (name, instructions, prompts, finish) => {
				// A human is now in the loop; don't hold them to the
				// network-sized deadline while they find their password.
				armDeadline?.(INTERACTIVE_TIMEOUT_MS);
				const requestId = this._handleKeyboardInteractive(connectionKey ?? displayHost, displayHost, config.username, name, instructions, prompts, wrapPromptFinish(finish), () => cancelConnectFromKbi?.());
				liveKbiRequests.add(requestId);
			}
			: undefined;
		const keyPassphraseHandler: SSHKeyPassphrasePromptHandler | undefined = attempts.some(a => a.type === 'publickey' && a.encrypted)
			? (keyPath, finish) => {
				armDeadline?.(INTERACTIVE_TIMEOUT_MS);
				const requestId = this._handleKeyboardInteractive(
					connectionKey ?? displayHost,
					displayHost,
					config.username,
					localize('sshKeyPassphraseName', "SSH Key Passphrase"),
					'',
					[{ prompt: localize('sshKeyPassphrasePrompt', "Enter passphrase for SSH key {0}.", keyPath), echo: false }],
					wrapPromptFinish((responses: readonly string[]) => finish(responses[0])),
					() => cancelConnectFromKbi?.(),
				);
				liveKbiRequests.add(requestId);
			}
			: undefined;
		// Cast: the ssh2 @types don't model `false` (give-up) for the
		// callback nor `null` for the first invocation's `methodsLeft`,
		// even though the runtime supports both per the ssh2 docs.
		connectConfig.authHandler = makeAuthHandler(attempts, this._logService, kbiHandler, keyPassphraseHandler) as unknown as ConnectConfig['authHandler'];

		const cancelLiveKbiRequests = () => {
			for (const requestId of liveKbiRequests) {
				// Pull the pending finish callback (if any) and invoke it with
				// empty responses so ssh2 stops waiting on this attempt — without
				// this, ssh2 hangs until the handshake deadline elapses when a
				// connect attempt is aborted mid-prompt. The renderer also gets
				// notified so it can dismiss any open quick-input UI.
				const pending = this._pendingKbiRequests.get(requestId);
				this._pendingKbiRequests.delete(requestId);
				this._onDidCancelKeyboardInteractive.fire(requestId);
				pending?.finish([]);
			}
			liveKbiRequests.clear();
		};

		if (config.agentForward) {
			const agentSock = this._getAgentSocket(config);
			if (agentSock) {
				// ssh2 needs `connectConfig.agent` set so it knows which local
				// agent socket to forward to. Without it, agent forwarding is a
				// no-op even if `agentForward: true` is set.
				connectConfig.agent = agentSock;
				connectConfig.agentForward = true;
				this._logService.info(`${LOG_PREFIX} SSH agent forwarding enabled`);
			} else {
				this._logService.warn(`${LOG_PREFIX} SSH agent forwarding requested, but no SSH agent endpoint is available; agent forwarding disabled`);
			}
		}

		// Verify the server's host key during key exchange. Without this, ssh2
		// accepts any key from any server ("Host accepted by default"), which
		// would let an on-path attacker impersonate the remote and collect the
		// password typed into our own keyboard-interactive prompt. hostVerifier
		// runs before authentication, so declining guarantees no credential or
		// forwarded agent access ever reaches an unverified server.
		//
		// Note we deliberately do not set `hostHash`: that would make ssh2
		// pre-hash the key and hand us a hex digest, discarding the raw blob we
		// need to compare against `known_hosts` entries.
		const liveHostKeyRequests = new Set<string>();
		// Set once the connect attempt settles, so a verification that is still
		// gathering evidence at that moment can bail out instead of registering
		// itself after cancellation has already swept the set.
		let hostKeyVerificationAborted = false;
		// Set when the renderer refuses a host key for this attempt, so the
		// resulting handshake failure can be reported as what it actually is.
		let hostKeyDenied = false;
		const cancelLiveHostKeyRequests = () => {
			hostKeyVerificationAborted = true;
			for (const requestId of liveHostKeyRequests) {
				const pending = this._pendingHostKeyRequests.get(requestId);
				this._pendingHostKeyRequests.delete(requestId);
				this._onDidCancelHostKeyVerification.fire(requestId);
				// Fail closed: an aborted connect must never leave ssh2 waiting
				// on a verdict until the deadline elapses.
				pending?.verify(false);
			}
			liveHostKeyRequests.clear();
		};
		connectConfig.hostVerifier = (key: Buffer, verify: (permitted: boolean) => void) => {
			void this._verifyHostKey(
				connectionKey ?? displayHost,
				displayHost,
				config,
				port,
				key,
				verify,
				requestId => {
					liveHostKeyRequests.add(requestId);
					// A human is now in the loop; stop holding them to the
					// network-sized deadline.
					armDeadline?.(INTERACTIVE_TIMEOUT_MS);
					return () => { hostKeyDenied = true; };
				},
				() => hostKeyVerificationAborted,
				() => armDeadline?.(HANDSHAKE_TIMEOUT_MS),
			);
		};

		const client = await this._createSSHClient();
		return new Promise<SSHClient>((resolve, reject) => {
			let settled = false;
			let deadlineTimer: IHandshakeDeadlineHandle | undefined;

			const clearDeadline = () => {
				this._clearHandshakeDeadline(deadlineTimer);
				deadlineTimer = undefined;
			};

			// Replaces ssh2's `readyTimeout` (disabled above) so the window can
			// be widened only for the interval a prompt is actually outstanding.
			armDeadline = (ms: number) => {
				if (settled) {
					return;
				}
				clearDeadline();
				deadlineTimer = this._armHandshakeDeadline(ms, () => {
					rejectConnect(new Error(`SSH handshake to ${config.host} timed out`), true);
				});
			};

			const resolveConnect = () => {
				if (settled) {
					return;
				}
				settled = true;
				clearDeadline();
				this._logService.info(`${LOG_PREFIX} SSH connection established to ${config.host}`);
				cancelLiveKbiRequests();
				cancelLiveHostKeyRequests();
				resolve(client);
			};

			const rejectConnect = (err: Error, endClient: boolean) => {
				if (settled) {
					return;
				}
				settled = true;
				clearDeadline();
				cancelLiveKbiRequests();
				cancelLiveHostKeyRequests();
				if (endClient) {
					client.end();
				}
				reject(err);
			};

			cancelConnectFromKbi = () => {
				this._logService.info(`${LOG_PREFIX} SSH keyboard-interactive prompt cancelled by user for ${displayHost}`);
				rejectConnect(new CancellationError(), true);
			};

			client.on('ready', () => {
				resolveConnect();
			});

			client.on('error', (err: Error) => {
				this._logService.error(`${LOG_PREFIX} SSH connection error: ${err.message}`);
				// ssh2 reports a refused host key as "Host denied (verification
				// failed)", which is both jargon and redundant — the host key
				// UI has already told the user what happened.
				rejectConnect(hostKeyDenied ? new SSHHostKeyDeniedError(displayHost) : err, false);
			});

			// A server can drop the connection cleanly mid-handshake (for
			// example sshd refusing a session under MaxStartups), in which case
			// ssh2 emits only 'end'/'close' with no 'error'. Without this the
			// connect promise would never settle and any outstanding host key
			// prompt would be left on screen forever.
			client.on('close', () => {
				rejectConnect(
					hostKeyDenied
						? new SSHHostKeyDeniedError(displayHost)
						: new Error(`SSH connection to ${config.host} closed before the handshake completed`),
					false);
			});

			// A server may announce its full host key set over the
			// already-authenticated channel (OpenSSH's UpdateHostKeys). ssh2
			// completes the `hostkeys-prove` challenge and verifies the
			// signatures before emitting, so these are safe to persist without
			// prompting — this is what lets a legitimate key rotation be
			// learned silently instead of surfacing as a scary mismatch later.
			client.on('hostkeys', (keys: readonly { getPublicSSH(): Buffer; type: string }[]) => {
				this._handleAnnouncedHostKeys(connectionKey ?? displayHost, config.host, port, keys);
			});

			armDeadline(HANDSHAKE_TIMEOUT_MS);
			client.connect(connectConfig);
		});
	}

	/**
	 * Arm the handshake deadline. Overridable so tests can observe how the
	 * window changes as prompts come and go without waiting on real timers.
	 */
	protected _armHandshakeDeadline(ms: number, onExpired: () => void): IHandshakeDeadlineHandle {
		return setTimeout(onExpired, ms);
	}

	protected _clearHandshakeDeadline(timer: IHandshakeDeadlineHandle | undefined): void {
		if (timer) {
			clearTimeout(timer);
		}
	}

	protected async _createSSHClient(): Promise<SSHClient> {
		const nativeRequire = await this._getNativeRequire();
		const ssh2Module = nativeRequire('ssh2') as { Client: new () => unknown };
		return new ssh2Module.Client() as SSHClient;
	}

	/**
	 * Build the ordered list of authentication attempts to feed to ssh2's
	 * `authHandler`. In `Agent` mode we try the configured agent first (so a
	 * loaded identity short-circuits before we ever touch an encrypted key
	 * file), then any non-default explicit `IdentityFile`, then each readable
	 * default identity in turn. A host that accepts `~/.ssh/id_rsa` still
	 * works even if the agent doesn't have it loaded — without needing an
	 * explicit `IdentityFile` entry in `~/.ssh/config`.
	 */
	protected async _buildAuthAttempts(config: ISSHAgentHostConfig): Promise<SSHAuthAttempt[]> {
		const attempts: SSHAuthAttempt[] = [];
		const username = config.username;

		switch (config.authMethod) {
			case SSHAuthMethod.Agent: {
				// Try the agent first: if it has any of the configured identities
				// loaded, auth succeeds without ever touching on-disk keys. This
				// matches OpenSSH's IdentityAgent semantics and avoids an
				// unnecessary passphrase prompt when an encrypted key file is
				// configured but the agent already holds its unlocked copy.
				const agentSock = this._getAgentSocket(config);
				if (agentSock) {
					attempts.push({ type: 'agent', username, agent: agentSock });
				}
				const explicitKeyPath = config.privateKeyPath;
				const explicitIsDefault = explicitKeyPath !== undefined && SSHRemoteAgentHostMainService._isDefaultKeyPath(explicitKeyPath);
				if (explicitKeyPath && !explicitIsDefault) {
					const explicit = await this._readKeyFileIfExists(explicitKeyPath);
					if (explicit) {
						attempts.push({ type: 'publickey', username, key: explicit, keyPath: explicitKeyPath, ...(isEncryptedPrivateKey(explicit) ? { encrypted: true } : undefined) });
					}
				}
				for (const keyPath of SSHRemoteAgentHostMainService._defaultKeyPaths) {
					const contents = await this._readKeyFileIfExists(keyPath);
					if (contents) {
						attempts.push({ type: 'publickey', username, key: contents, keyPath, ...(isEncryptedPrivateKey(contents) ? { encrypted: true } : undefined) });
					}
				}
				// Final fallback: keyboard-interactive (typically a password prompt).
				// Only meaningful if the server advertises it; the auth handler
				// will skip it otherwise. The prompt is forwarded to the renderer
				// via {@link onDidRequestKeyboardInteractive}.
				attempts.push({ type: 'keyboard-interactive', username });
				break;
			}
			case SSHAuthMethod.KeyFile: {
				// KeyFile mode has no fallbacks — fail fast with a clear error if
				// the key is missing or unreadable, rather than letting it surface
				// downstream as a generic auth failure.
				if (!config.privateKeyPath) {
					throw new Error(localize('ssh.keyFileAuthRequiresPath', "Key file authentication requires a private key path."));
				}
				const explicit = await this._readKeyFileIfExists(config.privateKeyPath);
				if (!explicit) {
					throw new Error(localize('ssh.failedToReadPrivateKey', "Failed to read private key file: {0}", config.privateKeyPath));
				}
				attempts.push({ type: 'publickey', username, key: explicit, keyPath: config.privateKeyPath, ...(isEncryptedPrivateKey(explicit) ? { encrypted: true } : undefined) });
				break;
			}
			case SSHAuthMethod.Password: {
				if (config.password !== undefined) {
					attempts.push({ type: 'password', username, password: config.password });
				}
				break;
			}
		}

		return attempts;
	}

	private static readonly _defaultKeyPaths = [
		'~/.ssh/id_ed25519',
		'~/.ssh/id_rsa',
		'~/.ssh/id_ecdsa',
		'~/.ssh/id_dsa',
		'~/.ssh/id_xmss',
	];

	/**
	 * Expand a leading `~` to the current user's home directory so that paths
	 * coming back from `ssh -G` (always absolute) compare equal to our
	 * `~`-prefixed defaults.
	 */
	private static _normalizeKeyPath(keyPath: string): string {
		return keyPath.replace(/^~/, os.homedir());
	}

	private static _isDefaultKeyPath(keyPath: string): boolean {
		const normalized = SSHRemoteAgentHostMainService._normalizeKeyPath(keyPath);
		return SSHRemoteAgentHostMainService._defaultKeyPaths.some(p => SSHRemoteAgentHostMainService._normalizeKeyPath(p) === normalized);
	}

	/** Test seam: returns the SSH agent socket path, or undefined when no agent is available. */
	protected _isAgentAvailable(): string | undefined {
		return process.env['SSH_AUTH_SOCK'];
	}

	protected _getAgentSocket(config: ISSHAgentHostConfig): string | undefined {
		if (config.identityAgent !== undefined) {
			return this._resolveIdentityAgent(config.identityAgent);
		}
		return this._isAgentAvailable();
	}

	private _resolveIdentityAgent(identityAgent: string): string | undefined {
		const trimmed = identityAgent.trim();
		if (!trimmed || trimmed.toLowerCase() === 'none') {
			return undefined;
		}
		if (trimmed === 'SSH_AUTH_SOCK') {
			return this._isAgentAvailable();
		}
		if (trimmed.startsWith('$')) {
			const envMatch = /^\$\{(?<braced>[A-Za-z_][A-Za-z0-9_]*)\}$|^\$(?<plain>[A-Za-z_][A-Za-z0-9_]*)$/.exec(trimmed);
			return envMatch?.groups ? process.env[envMatch.groups.braced ?? envMatch.groups.plain] || undefined : undefined;
		}
		return trimmed.replace(/^~/, os.homedir());
	}

	/**
	 * Forward a keyboard-interactive challenge from ssh2 to the renderer and
	 * register the `finish` callback so {@link respondKeyboardInteractive} can
	 * supply the user's responses when they arrive. Returns the generated
	 * `requestId` so the caller can track in-flight prompts.
	 */
	protected _handleKeyboardInteractive(
		connectionKey: string,
		displayHost: string,
		username: string,
		name: string,
		instructions: string,
		prompts: readonly ISSHKeyboardInteractivePrompt[],
		finish: (responses: readonly string[]) => void,
		cancelConnect: () => void,
	): string {
		const requestId = `kbi-${++this._kbiRequestCounter}`;
		// Wrap finish so it can only fire once — ssh2 ignores duplicate calls,
		// but we also want to ensure we drop the pending entry exactly once.
		let settled = false;
		const finishOnce = (responses: readonly string[]) => {
			if (settled) {
				return;
			}
			settled = true;
			this._pendingKbiRequests.delete(requestId);
			finish(responses);
		};
		this._pendingKbiRequests.set(requestId, { finish: finishOnce, cancelConnect });
		this._logService.info(`${LOG_PREFIX} keyboard-interactive challenge from ${displayHost}: ${prompts.length} prompt(s)`);
		this._onDidRequestKeyboardInteractive.fire({
			requestId,
			connectionKey,
			displayHost,
			username,
			name,
			instructions,
			prompts: prompts.map(p => ({ prompt: p.prompt, echo: p.echo })),
		});
		return requestId;
	}

	async respondKeyboardInteractive(requestId: string, responses: readonly string[] | undefined): Promise<void> {
		const pending = this._pendingKbiRequests.get(requestId);
		if (!pending) {
			this._logService.warn(`${LOG_PREFIX} respondKeyboardInteractive: no pending request for ${requestId}`);
			return;
		}
		if (responses === undefined) {
			pending.cancelConnect();
			pending.finish([]);
			return;
		}
		pending.finish(responses);
	}

	/**
	 * Read every `known_hosts` file that applies to `host` and return the
	 * parsed entries. Overridable so tests can supply entries without touching
	 * the developer's real SSH setup.
	 *
	 * Resolution deliberately goes through `ssh -G` rather than assuming
	 * `~/.ssh/known_hosts`, so a user who has redirected `UserKnownHostsFile`
	 * gets the files they actually configured. A failure here is not fatal: we
	 * fall back to no entries, which downgrades to a trust prompt rather than
	 * silently accepting an unverified key.
	 */
	protected async _readKnownHostsEntries(host: string): Promise<{ entries: IKnownHostsEntry[]; strictHostKeyChecking: SSHStrictHostKeyChecking | undefined }> {
		let resolved: ISSHResolvedConfig | undefined;
		try {
			resolved = await this.resolveSSHConfig(host);
		} catch (err) {
			this._logService.warn(`${LOG_PREFIX} Could not resolve SSH config for known_hosts lookup of ${host}: ${err}`);
		}

		const paths = [
			...(resolved?.userKnownHostsFiles ?? ['~/.ssh/known_hosts']),
			...(resolved?.globalKnownHostsFiles ?? []),
		];

		const entries: IKnownHostsEntry[] = [];
		for (const path of paths) {
			const expanded = path.replace(/^~/, os.homedir());
			try {
				entries.push(...parseKnownHosts(await fsp.readFile(expanded, 'utf-8')));
			} catch {
				// Missing or unreadable known_hosts files are normal (most
				// systems have no known_hosts2 and no global file).
			}
		}
		return { entries, strictHostKeyChecking: resolved?.strictHostKeyChecking };
	}

	/**
	 * Decide whether a presented host key should be trusted, by gathering the
	 * evidence the renderer needs and asking it to apply policy.
	 *
	 * This process only collects facts — the fingerprint and what the user's
	 * `known_hosts` files say. The renderer owns the decision because it holds
	 * the trust store and the UI.
	 */
	private async _verifyHostKey(
		connectionKey: string,
		displayHost: string,
		config: ISSHAgentHostConfig,
		port: number,
		key: Buffer,
		verify: (permitted: boolean) => void,
		onRequest: (requestId: string) => (() => void) | void,
		isAborted: () => boolean,
		onPromptSettled: () => void,
	): Promise<void> {
		let settled = false;
		let prompted = false;
		const verifyOnce = (permitted: boolean) => {
			if (settled) {
				return;
			}
			settled = true;
			if (prompted) {
				// The human is out of the loop; restore the network deadline so
				// the rest of the handshake is not held to the long window.
				onPromptSettled();
			}
			verify(permitted);
		};

		try {
			const keyType = readHostKeyType(key);
			if (!keyType) {
				// A blob whose self-declared algorithm we cannot read is not
				// something we can meaningfully show the user or compare, so
				// refuse rather than prompting about an unidentifiable key.
				this._logService.error(`${LOG_PREFIX} Rejecting malformed host key from ${displayHost}`);
				verifyOnce(false);
				return;
			}

			const fingerprint = computeHostKeyFingerprint(key);
			const { entries, strictHostKeyChecking } = await this._readKnownHostsEntries(config.sshConfigHost ?? config.host);

			// Gathering evidence is asynchronous, so the connect attempt may
			// have failed while we were reading known_hosts. Registering now
			// would leak a pending entry that nothing will ever settle, and
			// would prompt the user about a connection that is already gone.
			if (isAborted()) {
				this._logService.info(`${LOG_PREFIX} Abandoning host key verification for ${displayHost}: connect attempt already settled`);
				verifyOnce(false);
				return;
			}

			const knownHostsMatch = matchKnownHosts(entries, config.host, port, keyType, key);
			this._logService.info(`${LOG_PREFIX} Host key for ${displayHost}: ${keyType} ${fingerprint} (known_hosts: ${knownHostsMatch})`);

			const requestId = `hostkey-${++this._hostKeyRequestCounter}`;
			prompted = true;
			const onUserDenied = onRequest(requestId) ?? undefined;
			this._pendingHostKeyRequests.set(requestId, { verify: verifyOnce, onUserDenied });
			this._onDidRequestHostKeyVerification.fire({
				requestId,
				connectionKey,
				displayHost,
				host: config.host,
				port,
				keyType,
				fingerprint,
				knownHostsMatch,
				...(strictHostKeyChecking ? { strictHostKeyChecking } : undefined),
				userInitiated: config.userInitiated ?? true,
			});
		} catch (err) {
			// Fail closed. Anything unexpected while gathering evidence must
			// deny rather than accept, or a transient error becomes a way to
			// bypass verification entirely.
			this._logService.error(`${LOG_PREFIX} Host key verification failed for ${displayHost}`, err);
			verifyOnce(false);
		}
	}

	async respondHostKeyVerification(requestId: string, trusted: boolean): Promise<void> {
		const pending = this._pendingHostKeyRequests.get(requestId);
		if (!pending) {
			this._logService.warn(`${LOG_PREFIX} respondHostKeyVerification: no pending request for ${requestId}`);
			return;
		}
		this._pendingHostKeyRequests.delete(requestId);
		this._logService.info(`${LOG_PREFIX} Host key ${trusted ? 'accepted' : 'rejected'} for request ${requestId}`);
		if (!trusted) {
			// Let the connect attempt report this as a host key refusal rather
			// than surfacing ssh2's "Host denied (verification failed)".
			pending.onUserDenied?.();
		}
		pending.verify(trusted);
	}

	/**
	 * Surface host keys announced over an authenticated connection. ssh2 has
	 * already proven each key belongs to this server (it runs the
	 * `hostkeys-prove-00@openssh.com` challenge and verifies the signatures
	 * before emitting), so consumers may persist them without prompting.
	 */
	private _handleAnnouncedHostKeys(
		connectionKey: string,
		host: string,
		port: number,
		keys: readonly { getPublicSSH(): Buffer; type: string }[],
	): void {
		const announced: { keyType: string; fingerprint: string }[] = [];
		for (const key of keys) {
			try {
				const blob = key.getPublicSSH();
				const keyType = readHostKeyType(blob);
				// Skip anything whose blob disagrees with its declared type
				// (notably certificates, which ssh2 misparses) rather than
				// persisting trust in a key we did not correctly understand.
				if (keyType && keyType === key.type) {
					announced.push({ keyType, fingerprint: computeHostKeyFingerprint(blob) });
				}
			} catch (err) {
				this._logService.warn(`${LOG_PREFIX} Skipping unreadable announced host key for ${host}: ${err}`);
			}
		}
		if (!announced.length) {
			return;
		}
		this._logService.info(`${LOG_PREFIX} Server ${host} announced ${announced.length} proven host key(s)`);
		this._onDidAnnounceHostKeys.fire({ connectionKey, host, port, keys: announced });
	}

	/**
	 * Ask the renderer to choose among live remote agent host endpoints (or
	 * to spawn a new dedicated one), mirroring the keyboard-interactive
	 * bridge in {@link _handleKeyboardInteractive}. Also settles (rejects)
	 * with a {@link CancellationError} if `client` closes or errors while
	 * the picker is still open, so a dropped SSH connection doesn't leave
	 * the renderer's picker UI stuck waiting forever.
	 */
	private _requestEndpointSelection(
		client: SSHClient,
		connectionKey: string,
		displayHost: string,
		candidates: readonly IAgentHostEndpointMetadata[],
	): Promise<ISSHEndpointSelection> {
		const requestId = `endpoint-${++this._endpointSelectionCounter}`;
		return new Promise<ISSHEndpointSelection>((resolve, reject) => {
			let settled = false;
			const onClientUnavailable = () => {
				if (settled) {
					return;
				}
				settled = true;
				this._pendingEndpointSelections.delete(requestId);
				client.removeListener('close', onClientUnavailable);
				client.removeListener('error', onClientUnavailable);
				this._onDidCancelEndpointSelection.fire(requestId);
				reject(new CancellationError());
			};
			client.on('close', onClientUnavailable);
			client.on('error', onClientUnavailable);

			this._pendingEndpointSelections.set(requestId, selection => {
				if (settled) {
					return;
				}
				settled = true;
				client.removeListener('close', onClientUnavailable);
				client.removeListener('error', onClientUnavailable);
				if (selection === undefined) {
					reject(new CancellationError());
				} else {
					resolve(selection);
				}
			});

			this._logService.info(`${LOG_PREFIX} Requesting endpoint selection for ${displayHost}: ${candidates.length} candidate(s)`);
			this._onDidRequestEndpointSelection.fire({
				requestId,
				connectionKey,
				displayHost,
				candidates: candidates.map((c): ISSHEndpointCandidate => ({ type: c.type, pid: c.pid, instanceId: c.instanceId, quality: c.quality, endpoint: c.endpoint })),
			});
		});
	}

	async respondEndpointSelection(requestId: string, selection: ISSHEndpointSelection | undefined): Promise<void> {
		const pending = this._pendingEndpointSelections.get(requestId);
		if (!pending) {
			this._logService.warn(`${LOG_PREFIX} respondEndpointSelection: no pending request for ${requestId}`);
			return;
		}
		this._pendingEndpointSelections.delete(requestId);
		pending(selection);
	}

	/**
	 * Test seam: read a private key file from disk. Returns `undefined` if the
	 * file doesn't exist; logs and returns `undefined` for any other read error
	 * so a single broken key doesn't abort the whole auth flow.
	 */
	protected async _readKeyFileIfExists(keyPath: string): Promise<Buffer | undefined> {
		const resolved = keyPath.replace(/^~/, os.homedir());
		try {
			return await fsp.readFile(resolved);
		} catch (error) {
			const errorCode = (error as NodeJS.ErrnoException).code;
			if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
				return undefined;
			}
			this._logService.warn(`${LOG_PREFIX} Failed to read SSH key file ${resolved}`, error);
			return undefined;
		}
	}

	private get _quality(): string {
		return this._productService.quality || 'insider';
	}

	private get _serverDataFolderName(): string {
		return this._productService.serverDataFolderName ?? '.vscode-server-oss';
	}

	private get _commit(): string | undefined {
		return this._productService.commit;
	}

	private get _effectiveTelemetryLevel(): TelemetryConfiguration {
		return telemetryLevelToAgentHostValue(this._telemetryService.telemetryLevel);
	}

	protected _startRemoteAgentHost(
		client: SSHClient, cliBin: string | undefined, cliDataDir: string | undefined, commandOverride?: string, telemetryLevel?: TelemetryConfiguration,
	): Promise<{ port: number; connectionToken: string | undefined; pid: number | undefined; stream: SSHChannel }> {
		return startRemoteAgentHost(client, this._logService, cliBin, cliDataDir, commandOverride, telemetryLevel);
	}

	protected async _createWebSocketRelay(
		client: SSHClient,
		endpoint: AgentHostEndpointAddress,
		relayCliBin: string,
		relayCliDataDir: string,
		relayInstanceId: string,
		relayUserDataPath: string,
		connectionToken: string | undefined,
		onMessage: (data: string) => void, onClose: () => void,
	): Promise<{ send: (data: string) => void; close: () => void }> {
		const nativeRequire = await this._getNativeRequire();
		return createWebSocketRelayForEndpoint(nativeRequire, client, endpoint, relayCliBin, relayCliDataDir, relayInstanceId, relayUserDataPath, connectionToken, this._logService, onMessage, onClose);
	}


	/**
	 * Resolve which CLI binary to run on the remote.
	 *
	 * When the desktop has a `productService.commit` (release builds), we
	 * pin to that commit: install at `~/<serverDataFolderName>/<archive>-<commit>`
	 * (sharing the install root with Remote-SSH), reuse on file existence,
	 * download from the commit-pinned URL on miss, and clean up older
	 * commit-keyed CLIs (keep last 5). The agent host CLI does not
	 * self-update on this path, so the desktop pushes freshness on every
	 * fresh start — but tolerantly: if the download fails and any other
	 * usable CLI is present (other commit-keyed or the legacy
	 * `~/.vscode-cli{,-<quality>}/<archive>`), we fall back to the newest
	 * one rather than refusing to connect.
	 *
	 * In dev/OSS builds with no commit, we keep a loose, non-pinned install
	 * at `~/<serverDataFolderName>/<archive>`. Existing CLIs self-update
	 * against the latest release before reuse.
	 *
	 * Returns the resolved CLI binary path and its install outcome.
	 */
	private async _ensureCLIInstalled(client: SSHClient, platform: { os: string; arch: string }, reportProgress: (message: string) => void): Promise<IRemoteAgentHostCliInstallResult> {
		return ensureRemoteAgentHostCliInstalled(bindSshExec(client), platform, {
			serverDataFolderName: this._serverDataFolderName,
			quality: this._quality,
			commit: this._commit,
			reportInstalling: () => reportProgress(localize('sshProgressDownloadingCLI', "Installing VS Code CLI on remote...")),
			logService: this._logService,
			logPrefix: LOG_PREFIX,
		});
	}
}
