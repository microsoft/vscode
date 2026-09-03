/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type WebSocket from 'ws';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { Duplex } from 'stream';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { FileAccess } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { findExecutable } from '../../../base/node/processes.js';
import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { vLiteral, vObj, vString } from '../../../base/common/validation.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { IDevContainerAgentHostConfig, IDevContainerAgentHostConnectResult, IDevContainerAgentHostMainService, VSCODE_REMOTE_CONTAINERS_SESSION_ENV } from '../common/devContainerAgentHost.js';
import { IRelayMessage } from '../common/relayTransport.js';
import { telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import type { AgentHostEndpointAddress } from '../common/agentHostEndpointRegistry.js';
import { getAppNodeModulesPath } from './appNodeModules.js';
import {
	buildAgentHostSpawnCommand,
	buildAgentRelayCommand,
	filterLiveAgentHostEndpoints,
	getNewAgentHostRegistrationTimeoutMs,
	getRemoteCLIDataDir,
	ISshExec,
	resolveRemotePlatform,
	runAgentEndpoints,
	shellEscape,
	waitForNewStandaloneEndpoint,
} from './sshRemoteAgentHostHelpers.js';
import { ensureRemoteAgentHostCliInstalled } from './remoteAgentHostCliInstaller.js';

const LOG_PREFIX = '[DevContainerAgentHost]';
const DETECT_MUSL_COMMAND = 'if [ -e /etc/alpine-release ]; then printf musl; elif command -v ldd >/dev/null 2>&1; then case "$(ldd --version 2>&1)" in *musl*) printf musl;; esac; fi';

interface IDevContainerUpResult {
	readonly containerId: string;
	readonly remoteWorkspaceFolder: string;
}

const devContainerUpResultValidator = vObj({
	outcome: vLiteral('success'),
	containerId: vString(),
	remoteWorkspaceFolder: vString(),
});

/** Testable relay abstraction owned by the shared-process launcher. */
export interface IDevContainerRelay extends IDisposable {
	send(message: string): void;
}

class DevContainerRelay extends Disposable implements IDevContainerRelay {
	constructor(
		readonly process: ChildProcessWithoutNullStreams,
		readonly webSocket: WebSocket,
	) {
		super();
		this._register(toDisposable(() => {
			webSocket.close();
			if (!process.killed) {
				process.kill();
			}
		}));
	}

	send(message: string): void {
		if (this.webSocket.readyState === this.webSocket.OPEN) {
			this.webSocket.send(message);
		}
	}
}

/** Launches Dev Containers and relays their Agent Host protocol through the shared process. */
export class DevContainerAgentHostMainService extends Disposable implements IDevContainerAgentHostMainService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidRelayMessage = this._register(new Emitter<IRelayMessage>());
	readonly onDidRelayMessage = this._onDidRelayMessage.event;

	private readonly _onDidRelayClose = this._register(new Emitter<string>());
	readonly onDidRelayClose = this._onDidRelayClose.event;

	private readonly _onDidCloseConnection = this._register(new Emitter<string>());
	readonly onDidCloseConnection = this._onDidCloseConnection.event;

	private readonly _onDidOutput = this._register(new Emitter<{ readonly connectionId: string; readonly data: string }>());
	readonly onDidOutput = this._onDidOutput.event;

	private readonly _connections = this._register(new DisposableMap<string, IDevContainerRelay>());
	private readonly _connectionStores = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _connectionTokenSources = new Map<string, CancellationTokenSource>();
	private readonly _connectionWorkspaces = new Map<string, string>();
	private readonly _containerIds = new Map<string, string>();
	private readonly _suspendedWorkspaces = new Set<string>();
	private readonly _containerOperations = new SequencerByKey<string>();
	private _nativeRequire: NodeJS.Require | undefined;
	private _shellEnvironment: Promise<typeof process.env> | undefined;
	private _dockerExecutable: Promise<string | undefined> | undefined;
	private _dockerAvailable: Promise<boolean> | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@INativeEnvironmentService private readonly _environmentService: INativeEnvironmentService,
	) {
		super();
	}

	connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult> {
		return this._containerOperations.queue(config.workspaceFolder, () => this._connect(config));
	}

	private async _connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult> {
		if (this._suspendedWorkspaces.has(config.workspaceFolder) && config.resume !== true) {
			throw new Error(localize('devContainerAgentHost.containerSuspended', "Dev Container for '{0}' is stopped.", config.workspaceFolder));
		}
		await this.disconnect(config.connectionId);
		const store = new DisposableStore();
		const tokenSource = store.add(new CancellationTokenSource());
		this._connectionTokenSources.set(config.connectionId, tokenSource);
		store.add(toDisposable(() => this._connectionTokenSources.delete(config.connectionId)));
		this._connectionStores.set(config.connectionId, store);

		try {
			this._logService.info(`${LOG_PREFIX} Starting Dev Container for ${config.workspaceFolder}`);
			const up = await this._runDevContainer(
				config.connectionId,
				['up', '--workspace-folder', config.workspaceFolder],
				tokenSource.token,
			);
			const upResult = parseDevContainerUpResult(up.stdout);
			if (!upResult) {
				throw new Error(localize('devContainerAgentHost.invalidUpResult', "Dev Container CLI returned an invalid result: {0}", up.stdout.trim() || up.stderr.trim()));
			}
			this._containerIds.set(config.workspaceFolder, upResult.containerId);
			this._connectionWorkspaces.set(config.connectionId, config.workspaceFolder);
			store.add(toDisposable(() => this._connectionWorkspaces.delete(config.connectionId)));

			const exec = this._createExec(config.connectionId, config.workspaceFolder, tokenSource.token);
			const [{ stdout: unameS }, { stdout: unameM }, { stdout: libc }] = await Promise.all([
				exec('uname -s'),
				exec('uname -m'),
				exec(DETECT_MUSL_COMMAND),
			]);
			const platform = resolveRemotePlatform(unameS, unameM, libc);
			if (!platform) {
				throw new Error(localize('devContainerAgentHost.unsupportedPlatform', "Unsupported Dev Container platform: {0} {1}", unameS.trim(), unameM.trim()));
			}

			const serverDataFolderName = this._productService.serverDataFolderName ?? '.vscode-server-oss';
			const quality = this._productService.quality || 'insider';
			const cliInstallation = await ensureRemoteAgentHostCliInstalled(exec, platform, {
				serverDataFolderName,
				quality,
				commit: this._productService.commit,
				reportInstalling: () => this._logService.info(`${LOG_PREFIX} Installing VS Code CLI in Dev Container...`),
				logService: this._logService,
				logPrefix: LOG_PREFIX,
			});
			const { cliBin } = cliInstallation;
			const cliDataDir = getRemoteCLIDataDir(serverDataFolderName);
			const initial = await runAgentEndpoints(exec, cliBin, cliDataDir);
			const live = await filterLiveAgentHostEndpoints(exec, initial.endpoints);
			const sessionId = this._telemetryService.sessionId;
			const ownedStandalones = await Promise.all(live
				.filter(candidate => candidate.type === 'standalone')
				.map(async candidate => ({
					candidate,
					sessionId: await this._readProcessSessionId(exec, candidate.pid),
				})));
			let endpoint = ownedStandalones
				.filter(candidate => candidate.sessionId === sessionId)
				.map(candidate => candidate.candidate)
				.sort((a, b) => a.instanceId.localeCompare(b.instanceId))[0];
			if (!endpoint) {
				const spawnCommand = `${VSCODE_REMOTE_CONTAINERS_SESSION_ENV}=${shellEscape(sessionId)} ${buildAgentHostSpawnCommand(
					cliBin,
					cliDataDir,
					initial.userDataPath,
					telemetryLevelToAgentHostValue(this._telemetryService.telemetryLevel),
				)}`;
				void exec(spawnCommand, { ignoreExitCode: true }).catch(error => {
					this._logService.warn(`${LOG_PREFIX} Agent Host spawn command failed`, error);
				});
				this._logService.info(`${LOG_PREFIX} Waiting for the new agent host to register...`);
				endpoint = await waitForNewStandaloneEndpoint(
					exec,
					cliBin,
					cliDataDir,
					initial.userDataPath,
					live,
					{
						timeoutMs: getNewAgentHostRegistrationTimeoutMs(cliInstallation.installed),
						token: tokenSource.token,
						progress: elapsedMs => this._logService.info(`${LOG_PREFIX} Waiting for the new agent host to register... (${Math.floor(elapsedMs / 1000)} seconds elapsed)`),
					},
				);
			}

			const relayCommand = buildAgentRelayCommand(cliBin, cliDataDir, endpoint.instanceId, initial.userDataPath);
			const relay = await this._createRelay(
				config.connectionId,
				config.workspaceFolder,
				relayCommand,
				endpoint.endpoint,
				endpoint.connectionToken,
				tokenSource.token,
			);
			this._connections.set(config.connectionId, relay);
			store.add(toDisposable(() => this._connections.deleteAndDispose(config.connectionId)));
			if (config.resume === true) {
				this._suspendedWorkspaces.delete(config.workspaceFolder);
			}

			return {
				connectionId: config.connectionId,
				address: `devcontainer:${upResult.containerId}`,
				name: config.name,
				remoteWorkspaceFolder: upResult.remoteWorkspaceFolder,
			};
		} catch (error) {
			this._connectionStores.deleteAndDispose(config.connectionId);
			throw error;
		}
	}

	protected _createExec(connectionId: string, workspaceFolder: string, token: CancellationToken): ISshExec {
		return async (command, options) => {
			const result = await this._runDevContainer(
				connectionId,
				['exec', '--workspace-folder', workspaceFolder, '/bin/sh', '-c', command],
				token,
			);
			if (result.code !== 0 && !options?.ignoreExitCode) {
				throw new Error(localize('devContainerAgentHost.commandFailed', "Dev Container command failed (exit {0}): {1}\nstderr: {2}", result.code, command, result.stderr));
			}
			return result;
		};
	}

	protected async _createRelay(
		connectionId: string,
		workspaceFolder: string,
		command: string,
		endpoint: AgentHostEndpointAddress,
		connectionToken: string | undefined,
		token: CancellationToken,
	): Promise<IDevContainerRelay> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const [environment, nativeRequire] = await Promise.all([
			this._resolveShellEnvironment(),
			this._getNativeRequire(),
		]);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		const child = this._spawnDevContainer([
			'exec',
			'--workspace-folder',
			workspaceFolder,
			'/bin/sh',
			'-c',
			command,
		], environment);
		const cancellationListener = token.onCancellationRequested(() => {
			if (!child.killed) {
				child.kill();
			}
		});
		child.stderr.on('data', data => {
			const text = data.toString();
			this._reportOutput(connectionId, text);
			this._logService.trace(`${LOG_PREFIX} relay stderr: ${text.trimEnd()}`);
		});
		const duplex = Duplex.from({ readable: child.stdout, writable: child.stdin });
		const WS = nativeRequire('ws') as typeof WebSocket;
		const urlHost = endpoint.type === 'tcp' ? endpoint.host : '127.0.0.1';
		const urlPort = endpoint.type === 'tcp' ? endpoint.port : 80;
		let url = `ws://${urlHost}:${urlPort}`;
		if (connectionToken) {
			url += `?tkn=${encodeURIComponent(connectionToken)}`;
		}
		const webSocket = new WS(url, { createConnection: () => duplex });

		try {
			await new Promise<void>((resolve, reject) => {
				const onOpen = () => {
					webSocket.off('error', onError);
					resolve();
				};
				const onError = (error: Error) => {
					webSocket.off('open', onOpen);
					reject(error);
				};
				webSocket.once('open', onOpen);
				webSocket.once('error', onError);
			});
		} catch (error) {
			webSocket.close();
			if (!child.killed) {
				child.kill();
			}
			throw error;
		} finally {
			cancellationListener.dispose();
		}

		const relay = new DevContainerRelay(child, webSocket);
		webSocket.on('error', error => this._logService.warn(`${LOG_PREFIX} relay WebSocket error`, error));
		webSocket.on('message', data => {
			const message = Array.isArray(data)
				? Buffer.concat(data).toString()
				: data instanceof ArrayBuffer
					? Buffer.from(new Uint8Array(data)).toString()
					: data.toString();
			this._onDidRelayMessage.fire({ connectionId, data: message });
		});
		const close = () => {
			if (this._connections.get(connectionId) === relay) {
				this._connections.deleteAndDispose(connectionId);
				this._connectionStores.deleteAndDispose(connectionId);
				this._onDidRelayClose.fire(connectionId);
				this._onDidCloseConnection.fire(connectionId);
			}
		};
		webSocket.once('close', close);
		child.once('close', close);
		return relay;
	}

	protected async _runDevContainer(connectionId: string, args: readonly string[], token: CancellationToken): Promise<{ stdout: string; stderr: string; code: number }> {
		const environment = await this._resolveShellEnvironment();
		return new Promise((resolve, reject) => {
			if (token.isCancellationRequested) {
				reject(new CancellationError());
				return;
			}
			this._reportOutput(connectionId, `$ devcontainer ${args.map(arg => JSON.stringify(arg)).join(' ')}\n`);
			const child = this._spawnDevContainer(args, environment);
			let stdout = '';
			let stderr = '';
			let settled = false;
			const finish = (error: Error | undefined, code: number | null) => {
				if (settled) {
					return;
				}
				settled = true;
				cancellationListener.dispose();
				if (error) {
					reject(error);
				} else if (token.isCancellationRequested) {
					reject(new CancellationError());
				} else {
					resolve({ stdout, stderr, code: code ?? -1 });
				}
			};
			const cancellationListener = token.onCancellationRequested(() => {
				if (!child.killed) {
					child.kill();
				}
			});
			child.stdout.on('data', data => {
				const text = data.toString();
				stdout += text;
				this._reportOutput(connectionId, text);
			});
			child.stderr.on('data', data => {
				const text = data.toString();
				stderr += text;
				this._reportOutput(connectionId, text);
			});
			child.once('error', error => {
				finish(error, null);
			});
			child.once('close', code => finish(undefined, code));
		});
	}

	private async _getNativeRequire(): Promise<NodeJS.Require> {
		if (!this._nativeRequire) {
			const nodeModule = await import('node:module');
			this._nativeRequire = nodeModule.createRequire(import.meta.url);
		}
		return this._nativeRequire;
	}

	protected _resolveUserShellEnvironment(): Promise<typeof process.env> {
		return getResolvedShellEnv(
			this._configurationService,
			this._logService,
			{ ...this._environmentService.args, 'force-user-env': true },
			process.env,
		);
	}

	protected _resolveShellEnvironment(): Promise<typeof process.env> {
		this._shellEnvironment ??= this._resolveUserShellEnvironment().catch(error => {
			this._logService.error(`${LOG_PREFIX} Unable to resolve shell environment; using inherited environment`, error);
			return process.env;
		});
		return this._shellEnvironment;
	}

	protected _reportOutput(connectionId: string, data: string): void {
		this._onDidOutput.fire({ connectionId, data });
	}

	isDockerAvailable(): Promise<boolean> {
		this._dockerAvailable ??= this._resolveDockerExecutable().then(executable => executable !== undefined);
		return this._dockerAvailable;
	}

	async stopContainer(workspaceFolder: string): Promise<boolean> {
		return this._containerOperations.queue(workspaceFolder, () => this._changeContainerState(workspaceFolder, 'stop'));
	}

	async removeContainer(workspaceFolder: string): Promise<boolean> {
		return this._containerOperations.queue(workspaceFolder, () => this._changeContainerState(workspaceFolder, 'rm'));
	}

	private async _changeContainerState(workspaceFolder: string, operation: 'stop' | 'rm'): Promise<boolean> {
		const containerId = this._containerIds.get(workspaceFolder);
		if (!containerId) {
			return true;
		}
		this._suspendedWorkspaces.add(workspaceFolder);
		const sessionIds = await this._findContainerSessionIds(containerId);
		const foreignSessionIds = sessionIds.filter(sessionId => sessionId !== this._telemetryService.sessionId);
		if (foreignSessionIds.length > 0) {
			this._logService.info(`${LOG_PREFIX} Skipping container ${operation === 'rm' ? 'removal' : 'stop'} for ${workspaceFolder}: ${foreignSessionIds.length} other VS Code session(s) are active.`);
			return false;
		}
		const connectionIds = [...this._connectionWorkspaces]
			.filter(([, workspace]) => workspace === workspaceFolder)
			.map(([connectionId]) => connectionId);
		await Promise.all(connectionIds.map(connectionId => this.disconnect(connectionId)));
		const args = operation === 'rm' ? ['rm', '--force', containerId] : ['stop', containerId];
		const result = await this._runDocker(args);
		if (result.code !== 0 && !/No such container/i.test(result.stderr)) {
			throw new Error(localize('devContainerAgentHost.containerLifecycleFailed', "Docker failed to {0} Dev Container '{1}' (exit {2}): {3}", operation === 'rm' ? 'remove' : 'stop', containerId, result.code, result.stderr.trim()));
		}
		if (operation === 'rm' || /No such container/i.test(result.stderr)) {
			this._containerIds.delete(workspaceFolder);
		}
		return true;
	}

	private async _findContainerSessionIds(containerId: string): Promise<readonly string[]> {
		const script = `for env in /proc/[0-9]*/environ; do [ -r "$env" ] || continue; tr '\\0' '\\n' < "$env" 2>/dev/null | sed -n 's/^${VSCODE_REMOTE_CONTAINERS_SESSION_ENV}=//p'; done`;
		const result = await this._runDocker(['exec', containerId, '/bin/sh', '-c', script]);
		if (result.code !== 0) {
			if (/is not running|No such container/i.test(result.stderr)) {
				return [];
			}
			throw new Error(localize('devContainerAgentHost.containerSessionCheckFailed', "Unable to check active VS Code sessions in Dev Container '{0}' (exit {1}): {2}", containerId, result.code, result.stderr.trim()));
		}
		return [...new Set(result.stdout.split('\n').map(value => value.trim()).filter(value => value.length > 0))];
	}

	private async _readProcessSessionId(exec: ISshExec, pid: number): Promise<string | undefined> {
		const result = await exec(`tr '\\0' '\\n' < /proc/${pid}/environ 2>/dev/null | sed -n 's/^${VSCODE_REMOTE_CONTAINERS_SESSION_ENV}=//p' | head -n 1`, { ignoreExitCode: true });
		return result.code === 0 ? result.stdout.trim() || undefined : undefined;
	}

	protected async _runDocker(args: readonly string[]): Promise<{ stdout: string; stderr: string; code: number }> {
		const executable = await this._resolveDockerExecutable();
		if (!executable) {
			throw new Error(localize('devContainerAgentHost.dockerUnavailable', "Docker is not available."));
		}
		const environment = await this._resolveShellEnvironment();
		return new Promise((resolve, reject) => {
			const child = spawn(executable, args, { env: environment });
			let stdout = '';
			let stderr = '';
			child.stdout.on('data', data => stdout += data.toString());
			child.stderr.on('data', data => stderr += data.toString());
			child.once('error', reject);
			child.once('close', code => resolve({ stdout, stderr, code: code ?? -1 }));
		});
	}

	private _resolveDockerExecutable(): Promise<string | undefined> {
		this._dockerExecutable ??= this._resolveShellEnvironment()
			.then(environment => findExecutable('docker', undefined, undefined, environment));
		return this._dockerExecutable;
	}

	protected _spawnDevContainer(
		args: readonly string[],
		environment: NodeJS.ProcessEnv,
	): ChildProcessWithoutNullStreams {
		return spawn(process.execPath, [getDevContainerCliPath(), ...args], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
		});
	}

	async relaySend(connectionId: string, message: string): Promise<void> {
		const relay = this._connections.get(connectionId);
		if (!relay) {
			throw new Error(`Dev Container Agent Host connection '${connectionId}' is not available.`);
		}
		relay.send(message);
	}

	async disconnect(connectionId: string): Promise<void> {
		this._connectionTokenSources.get(connectionId)?.cancel();
		this._connectionStores.deleteAndDispose(connectionId);
		this._connections.deleteAndDispose(connectionId);
	}
}

export function getDevContainerCliPath(): string {
	return join(FileAccess.asFileUri(getAppNodeModulesPath()).fsPath, '@devcontainers', 'cli', 'devcontainer.js');
}

export function parseDevContainerUpResult(output: string): IDevContainerUpResult | undefined {
	const lines = output.trim().split('\n').reverse();
	for (const line of lines) {
		try {
			const value: unknown = JSON.parse(line);
			const { content, error } = devContainerUpResultValidator.validate(value);
			if (!error) {
				return {
					containerId: content.containerId,
					remoteWorkspaceFolder: content.remoteWorkspaceFolder,
				};
			}
		} catch {
			// Continue scanning earlier output lines.
		}
	}
	return undefined;
}
