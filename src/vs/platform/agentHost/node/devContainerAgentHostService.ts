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
import { Disposable, DisposableMap, DisposableStore, IDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { vLiteral, vObj, vString } from '../../../base/common/validation.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { getResolvedShellEnv } from '../../shell/node/shellEnv.js';
import { IDevContainerAgentHostConfig, IDevContainerAgentHostConnectResult, IDevContainerAgentHostMainService } from '../common/devContainerAgentHost.js';
import { IRelayMessage } from '../common/relayTransport.js';
import { telemetryLevelToAgentHostValue } from '../common/agentHostTelemetry.js';
import type { AgentHostEndpointAddress } from '../common/agentHostEndpointRegistry.js';
import { getAppNodeModulesPath } from './appNodeModules.js';
import {
	buildAgentHostSpawnCommand,
	buildAgentRelayCommand,
	filterLiveAgentHostEndpoints,
	getRemoteCLIDataDir,
	ISshExec,
	resolveRemotePlatform,
	runAgentEndpoints,
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
	private _nativeRequire: NodeJS.Require | undefined;
	private _shellEnvironment: Promise<typeof process.env> | undefined;
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

	async connect(config: IDevContainerAgentHostConfig): Promise<IDevContainerAgentHostConnectResult> {
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
			const cliBin = await ensureRemoteAgentHostCliInstalled(exec, platform, {
				serverDataFolderName,
				quality,
				commit: this._productService.commit,
				reportInstalling: () => this._logService.info(`${LOG_PREFIX} Installing VS Code CLI in Dev Container...`),
				logService: this._logService,
				logPrefix: LOG_PREFIX,
			});
			const cliDataDir = getRemoteCLIDataDir(serverDataFolderName);
			const initial = await runAgentEndpoints(exec, cliBin, cliDataDir);
			const live = await filterLiveAgentHostEndpoints(exec, initial.endpoints);
			let endpoint = live
				.filter(candidate => candidate.type === 'standalone')
				.sort((a, b) => a.instanceId.localeCompare(b.instanceId))[0];
			if (!endpoint) {
				const spawnCommand = buildAgentHostSpawnCommand(
					cliBin,
					cliDataDir,
					initial.userDataPath,
					telemetryLevelToAgentHostValue(this._telemetryService.telemetryLevel),
				);
				void exec(spawnCommand, { ignoreExitCode: true }).catch(error => {
					this._logService.warn(`${LOG_PREFIX} Agent Host spawn command failed`, error);
				});
				endpoint = await waitForNewStandaloneEndpoint(
					exec,
					cliBin,
					cliDataDir,
					initial.userDataPath,
					live,
					{ token: tokenSource.token },
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

	protected _resolveShellEnvironment(): Promise<typeof process.env> {
		this._shellEnvironment ??= getResolvedShellEnv(
			this._configurationService,
			this._logService,
			{ ...this._environmentService.args, 'force-user-env': true },
			process.env,
		);
		return this._shellEnvironment;
	}

	protected _reportOutput(connectionId: string, data: string): void {
		this._onDidOutput.fire({ connectionId, data });
	}

	isDockerAvailable(): Promise<boolean> {
		this._dockerAvailable ??= this._resolveShellEnvironment()
			.then(environment => findExecutable('docker', undefined, undefined, environment))
			.then(executable => executable !== undefined);
		return this._dockerAvailable;
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
