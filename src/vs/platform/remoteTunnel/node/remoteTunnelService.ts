/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, ConnectionInfo, IRemoteTunnelSession, IRemoteTunnelService, LOGGER_NAME, LOG_ID, TunnelStates, TunnelStatus } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogger, ILoggerService, LogLevelToString } from 'vs/platform/log/common/log';
import { dirname, join } from 'vs/base/common/path';
import { ChildProcess, StdioOptions, spawn } from 'child_process';
import { IProductService } from 'vs/platform/product/common/productService';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { ISharedProcessLifecycleService } from 'vs/platform/lifecycle/node/sharedProcessLifecycleService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { hostname, homedir } from 'os';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { isString } from 'vs/base/common/types';

type RemoteTunnelEnablementClassification = {
	owner: 'aeschli';
	comment: 'Reporting when Remote Tunnel access is turned on or off';
	enabled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Flag indicating if Remote Tunnel Access is enabled or not' };
};

type RemoteTunnelEnablementEvent = {
	enabled: boolean;
};

const restartTunnelOnConfigurationChanges: readonly string[] = [
	CONFIGURATION_KEY_HOST_NAME,
	CONFIGURATION_KEY_PREVENT_SLEEP,
];

// This is the session used run the tunnel access.
// if set, the remote tunnel access is currently enabled.
// if not set, the remote tunnel access is currently disabled.
const TUNNEL_ACCESS_SESSION = 'remoteTunnelSession';

/**
 * This service runs on the shared service. It is running the `code-tunnel` command
 * to make the current machine available for remote access.
 */
export class RemoteTunnelService extends Disposable implements IRemoteTunnelService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidTokenFailedEmitter = new Emitter<IRemoteTunnelSession | undefined>();
	public readonly onDidTokenFailed = this._onDidTokenFailedEmitter.event;

	private readonly _onDidChangeTunnelStatusEmitter = new Emitter<TunnelStatus>();
	public readonly onDidChangeTunnelStatus = this._onDidChangeTunnelStatusEmitter.event;

	private readonly _onDidChangeSessionEmitter = new Emitter<IRemoteTunnelSession | undefined>();
	public readonly onDidChangeSession = this._onDidChangeSessionEmitter.event;

	private readonly _logger: ILogger;

	private _session: IRemoteTunnelSession | undefined;

	private _tunnelProcess: CancelablePromise<any> | undefined;

	private _tunnelStatus: TunnelStatus;
	private _startTunnelProcessDelayer: Delayer<void>;

	private _tunnelCommand: string | undefined;

	private _initialized = false;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILoggerService loggerService: ILoggerService,
		@ISharedProcessLifecycleService sharedProcessLifecycleService: ISharedProcessLifecycleService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		this._logger = this._register(loggerService.createLogger(LOG_ID, { name: LOGGER_NAME }));
		this._startTunnelProcessDelayer = new Delayer(100);

		this._register(this._logger.onDidChangeLogLevel(l => this._logger.info('Log level changed to ' + LogLevelToString(l))));

		this._register(sharedProcessLifecycleService.onWillShutdown(() => {
			this._tunnelProcess?.cancel();
			this._tunnelProcess = undefined;
			this.dispose();
		}));

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (restartTunnelOnConfigurationChanges.some(c => e.affectsConfiguration(c))) {
				this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
			}
		}));

		this._session = this._restoreSession();
		this._tunnelStatus = TunnelStates.uninitialized;
	}

	public async getTunnelStatus(): Promise<TunnelStatus> {
		return this._tunnelStatus;
	}

	private setTunnelStatus(tunnelStatus: TunnelStatus) {
		this._tunnelStatus = tunnelStatus;
		this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
	}

	private setSession(session: IRemoteTunnelSession | undefined) {
		if (!isSameSession(session, this._session)) {
			this._session = session;
			this._onDidChangeSessionEmitter.fire(session);
			this._storeSession(session);
			if (session) {
				this._logger.info(`Session updated: ${session.accountLabel} (${session.providerId})`);
				if (session.token) {
					this._logger.info(`Session token updated: ${session.accountLabel} (${session.providerId})`);
				}
			} else {
				this._logger.info(`Session reset`);
			}
		}
	}

	async getSession(): Promise<IRemoteTunnelSession | undefined> {
		return this._session;
	}

	async initialize(session: IRemoteTunnelSession | undefined): Promise<TunnelStatus> {
		if (this._initialized) {
			return this._tunnelStatus;
		}
		this._initialized = true;
		this.setSession(session);
		try {
			await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
		} catch (e) {
			this._logger.error(e);
		}
		return this._tunnelStatus;
	}

	private getTunnelCommandLocation() {
		if (!this._tunnelCommand) {
			let binParentLocation;
			if (isMacintosh) {
				// appRoot = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app
				// bin = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin
				binParentLocation = this.environmentService.appRoot;
			} else {
				// appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
				// bin = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bin
				// appRoot = /usr/share/code-insiders/resources/app
				// bin = /usr/share/code-insiders/bin
				binParentLocation = dirname(dirname(this.environmentService.appRoot));
			}
			this._tunnelCommand = join(binParentLocation, 'bin', `${this.productService.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
		}
		return this._tunnelCommand;
	}

	async startTunnel(session: IRemoteTunnelSession): Promise<TunnelStatus> {
		if (isSameSession(session, this._session) && this._tunnelStatus.type !== 'disconnected') {
			return this._tunnelStatus;
		}
		this.setSession(session);

		try {
			await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
		} catch (e) {
			this._logger.error(e);
		}
		return this._tunnelStatus;
	}


	async stopTunnel(): Promise<void> {
		this.setSession(undefined);

		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}

		const onOutput = (a: string, isErr: boolean) => {
			if (isErr) {
				this._logger.error(a);
			} else {
				this._logger.info(a);
			}
		};
		try {
			await this.runCodeTunnelCommand('stop', ['kill'], onOutput);
		} catch (e) {
			this._logger.error(e);
		}
		this.setTunnelStatus(TunnelStates.disconnected());

	}

	private async updateTunnelProcess(): Promise<void> {
		this.telemetryService.publicLog2<RemoteTunnelEnablementEvent, RemoteTunnelEnablementClassification>('remoteTunnel.enablement', { enabled: !!this._session });


		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}

		let isAttached = false;
		let output = '';

		const onOutput = (a: string, isErr: boolean) => {
			if (isErr) {
				this._logger.error(a);
			} else {
				output += a;
			}
			if (!this.environmentService.isBuilt && a.startsWith('   Compiling')) {
				this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.building', 'Building CLI from sources')));
			}
		};

		const statusProcess = this.runCodeTunnelCommand('status', ['status'], onOutput);
		this._tunnelProcess = statusProcess;
		try {
			await statusProcess;
			if (this._tunnelProcess !== statusProcess) {
				return;
			}

			// split and find the line, since in dev builds additional noise is
			// added by cargo to the output.
			const status: {
				service_installed: boolean;
				tunnel: object | null;
			} = JSON.parse(output.trim().split('\n').find(l => l.startsWith('{'))!);

			isAttached = !!status.tunnel;
			this._logger.info(isAttached ? 'Other tunnel running, attaching...' : 'No other tunnel running');
			if (!isAttached && !this._session) {
				this._tunnelProcess = undefined;
				this.setTunnelStatus(TunnelStates.disconnected());
				return;
			}
		} catch (e) {
			this._logger.error(e);
			this._tunnelProcess = undefined;
			this.setTunnelStatus(TunnelStates.disconnected());
			return;
		}

		const session = this._session;

		if (session && session.token) {
			const token = session.token;
			this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.authorizing', comment: ['{0} is a user account name, {1} a provider name (e.g. Github)'] }, 'Connecting as {0} ({1})', session.accountLabel, session.providerId)));
			const onLoginOutput = (a: string, isErr: boolean) => {
				a = a.replaceAll(token, '*'.repeat(4));
				onOutput(a, isErr);
			};
			const loginProcess = this.runCodeTunnelCommand('login', ['user', 'login', '--provider', session.providerId, '--access-token', token, '--log', LogLevelToString(this._logger.getLevel())], onLoginOutput);
			this._tunnelProcess = loginProcess;
			try {
				await loginProcess;
				if (this._tunnelProcess !== loginProcess) {
					return;
				}
			} catch (e) {
				this._logger.error(e);
				this._tunnelProcess = undefined;
				this._onDidTokenFailedEmitter.fire(session);
				this.setTunnelStatus(TunnelStates.disconnected(session));
				return;
			}
		}

		const hostName = this._getTunnelName();
		if (hostName) {
			this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.openTunnelWithName', comment: ['{0} is a tunnel name'] }, 'Opening tunnel {0}', hostName)));
		} else {
			this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.openTunnel', 'Opening tunnel')));
		}
		const args = ['--parent-process-id', String(process.pid), '--accept-server-license-terms', '--log', LogLevelToString(this._logger.getLevel())];
		if (hostName) {
			args.push('--name', hostName);
		} else {
			args.push('--random-name');
		}
		if (this._preventSleep()) {
			args.push('--no-sleep');
		}
		const serveCommand = this.runCodeTunnelCommand('tunnel', args, (message: string, isErr: boolean) => {
			if (isErr) {
				this._logger.error(message);
			} else {
				this._logger.info(message);
			}
			const m = message.match(/Open this link in your browser (https:\/\/([^\/\s]+)\/([^\/\s]+)\/([^\/\s]+))/);
			if (m) {
				const info: ConnectionInfo = { link: m[1], domain: m[2], tunnelName: m[4], isAttached };
				this.setTunnelStatus(TunnelStates.connected(info));
			} else if (message.match(/error refreshing token/)) {
				serveCommand.cancel();
				this._onDidTokenFailedEmitter.fire(session);
				this.setTunnelStatus(TunnelStates.disconnected(session));
			}
		});
		this._tunnelProcess = serveCommand;
		serveCommand.finally(() => {
			if (serveCommand === this._tunnelProcess) {
				// process exited unexpectedly
				this._logger.info(`tunnel process terminated`);
				this._tunnelProcess = undefined;
				this._session = undefined;

				this.setTunnelStatus(TunnelStates.disconnected());
			}
		});
	}

	private runCodeTunnelCommand(logLabel: string, commandArgs: string[], onOutput: (message: string, isError: boolean) => void = () => { }): CancelablePromise<number> {
		return createCancelablePromise<number>(token => {
			return new Promise((resolve, reject) => {
				if (token.isCancellationRequested) {
					resolve(-1);
				}
				let tunnelProcess: ChildProcess | undefined;
				const stdio: StdioOptions = ['ignore', 'pipe', 'pipe'];

				token.onCancellationRequested(() => {
					if (tunnelProcess) {
						this._logger.info(`${logLabel} terminating(${tunnelProcess.pid})`);
						tunnelProcess.kill();
					}
				});
				if (!this.environmentService.isBuilt) {
					onOutput('Building tunnel CLI from sources and run', false);
					onOutput(`${logLabel} Spawning: cargo run -- tunnel ${commandArgs.join(' ')}`, false);
					tunnelProcess = spawn('cargo', ['run', '--', 'tunnel', ...commandArgs], { cwd: join(this.environmentService.appRoot, 'cli'), stdio });
				} else {
					onOutput('Running tunnel CLI', false);
					const tunnelCommand = this.getTunnelCommandLocation();
					onOutput(`${logLabel} Spawning: ${tunnelCommand} tunnel ${commandArgs.join(' ')}`, false);
					tunnelProcess = spawn(tunnelCommand, ['tunnel', ...commandArgs], { cwd: homedir(), stdio });
				}

				tunnelProcess.stdout!.on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, false);
					}
				});
				tunnelProcess.stderr!.on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, true);
					}
				});
				tunnelProcess.on('exit', e => {
					if (tunnelProcess) {
						onOutput(`${logLabel} exit(${tunnelProcess.pid}): + ${e} `, false);
						tunnelProcess = undefined;
						resolve(e || 0);
					}
				});
				tunnelProcess.on('error', e => {
					if (tunnelProcess) {
						onOutput(`${logLabel} error(${tunnelProcess.pid}): + ${e} `, true);
						tunnelProcess = undefined;
						reject();
					}
				});
			});
		});
	}

	public async getTunnelName(): Promise<string | undefined> {
		return this._getTunnelName();
	}

	private _preventSleep() {
		return !!this.configurationService.getValue<boolean>(CONFIGURATION_KEY_PREVENT_SLEEP);
	}

	private _getTunnelName(): string | undefined {
		let name = this.configurationService.getValue<string>(CONFIGURATION_KEY_HOST_NAME) || hostname();
		name = name.replace(/^-+/g, '').replace(/[^\w-]/g, '').substring(0, 20);
		return name || undefined;
	}

	private _restoreSession(): IRemoteTunnelSession | undefined {
		try {
			const tunnelAccessSession = this.storageService.get(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
			if (tunnelAccessSession) {
				const session = JSON.parse(tunnelAccessSession) as IRemoteTunnelSession;
				if (session && isString(session.accountLabel) && isString(session.sessionId) && isString(session.providerId)) {
					return session;
				}
				this._logger.error('Problems restoring session from storage, invalid format', session);
			}
		} catch (e) {
			this._logger.error('Problems restoring session from storage', e);
		}
		return undefined;
	}

	private _storeSession(session: IRemoteTunnelSession | undefined): void {
		if (session) {
			const sessionWithoutToken = {
				providerId: session.providerId, sessionId: session.sessionId, accountLabel: session.accountLabel
			};
			this.storageService.store(TUNNEL_ACCESS_SESSION, JSON.stringify(sessionWithoutToken), StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
		}
	}
}

function isSameSession(a1: IRemoteTunnelSession | undefined, a2: IRemoteTunnelSession | undefined): boolean {
	if (a1 && a2) {
		return a1.sessionId === a2.sessionId && a1.providerId === a2.providerId && a1.token === a2.token;
	}
	return a1 === a2;
}

