/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, ConnectionInfo, IRemoteTunnelSession, IRemoteTunnelService, LOGGER_NAME, LOG_ID, TunnelStates, TunnelStatus, TunnelMode, INACTIVE_TUNNEL_MODE, ActiveTunnelMode } from '../common/remoteTunnel.js';
import { Emitter } from '../../../base/common/event.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ILogger, ILoggerService, LogLevelToString } from '../../log/common/log.js';
import { dirname, join } from '../../../base/common/path.js';
import { ChildProcess, StdioOptions, spawn } from 'child_process';
import { IProductService } from '../../product/common/productService.js';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { CancelablePromise, createCancelablePromise, Delayer } from '../../../base/common/async.js';
import { ISharedProcessLifecycleService } from '../../lifecycle/node/sharedProcessLifecycleService.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { localize } from '../../../nls.js';
import { hostname, homedir } from 'os';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { isString } from '../../../base/common/types.js';
import { StreamSplitter } from '../../../base/node/nodeStreams.js';
import { joinPath } from '../../../base/common/resources.js';

type RemoteTunnelEnablementClassification = {
	owner: 'aeschli';
	comment: 'Reporting when Remote Tunnel access is turned on or off';
	enabled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if Remote Tunnel Access is enabled or not' };
	service?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if Remote Tunnel Access is installed as a service' };
};

type RemoteTunnelEnablementEvent = {
	enabled: boolean;
	service: boolean;
};

const restartTunnelOnConfigurationChanges: readonly string[] = [
	CONFIGURATION_KEY_HOST_NAME,
	CONFIGURATION_KEY_PREVENT_SLEEP,
];

// This is the session used run the tunnel access.
// if set, the remote tunnel access is currently enabled.
// if not set, the remote tunnel access is currently disabled.
const TUNNEL_ACCESS_SESSION = 'remoteTunnelSession';
// Boolean indicating whether the tunnel should be installed as a service.
const TUNNEL_ACCESS_IS_SERVICE = 'remoteTunnelIsService';

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

	private readonly _onDidChangeModeEmitter = new Emitter<TunnelMode>();
	public readonly onDidChangeMode = this._onDidChangeModeEmitter.event;

	private readonly _logger: ILogger;

	/**
	 * "Mode" in the terminal state we want to get to -- started, stopped, and
	 * the attributes associated with each.
	 *
	 * At any given time, work may be ongoing to get `_tunnelStatus` into a
	 * state that reflects the desired `mode`.
	 */
	private _mode: TunnelMode = INACTIVE_TUNNEL_MODE;

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
		this._logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
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

		this._mode = this._restoreMode();
		this._tunnelStatus = TunnelStates.uninitialized;
	}

	public async getTunnelStatus(): Promise<TunnelStatus> {
		return this._tunnelStatus;
	}

	private setTunnelStatus(tunnelStatus: TunnelStatus) {
		this._tunnelStatus = tunnelStatus;
		this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
	}

	private setMode(mode: TunnelMode) {
		if (isSameMode(this._mode, mode)) {
			return;
		}

		this._mode = mode;
		this._storeMode(mode);
		this._onDidChangeModeEmitter.fire(this._mode);
		if (mode.active) {
			this._logger.info(`Session updated: ${mode.session.accountLabel} (${mode.session.providerId}) (service=${mode.asService})`);
			if (mode.session.token) {
				this._logger.info(`Session token updated: ${mode.session.accountLabel} (${mode.session.providerId})`);
			}
		} else {
			this._logger.info(`Session reset`);
		}
	}

	getMode(): Promise<TunnelMode> {
		return Promise.resolve(this._mode);
	}

	async initialize(mode: TunnelMode): Promise<TunnelStatus> {
		if (this._initialized) {
			return this._tunnelStatus;
		}
		this._initialized = true;
		this.setMode(mode);
		try {
			await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
		} catch (e) {
			this._logger.error(e);
		}
		return this._tunnelStatus;
	}

	private readonly defaultOnOutput = (a: string, isErr: boolean) => {
		if (isErr) {
			this._logger.error(a);
		} else {
			this._logger.info(a);
		}
	};

	private getTunnelCommandLocation() {
		if (!this._tunnelCommand) {
			let binParentLocation;
			if (isMacintosh) {
				// appRoot = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app
				// bin = /Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/bin
				binParentLocation = this.environmentService.appRoot;
			} else if (isWindows) {
				if (this.productService.quality === 'insider') {
					// appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\<version>\resources\app
					// bin = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bin
					binParentLocation = dirname(dirname(dirname(this.environmentService.appRoot)));
				} else {
					// appRoot = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\resources\app
					// bin = C:\Users\<name>\AppData\Local\Programs\Microsoft VS Code Insiders\bin
					binParentLocation = dirname(dirname(this.environmentService.appRoot));
				}
			} else {
				// appRoot = /usr/share/code-insiders/resources/app
				// bin = /usr/share/code-insiders/bin
				binParentLocation = dirname(dirname(this.environmentService.appRoot));
			}
			this._tunnelCommand = join(binParentLocation, 'bin', `${this.productService.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
		}
		return this._tunnelCommand;
	}

	async startTunnel(mode: ActiveTunnelMode): Promise<TunnelStatus> {
		if (isSameMode(this._mode, mode) && this._tunnelStatus.type !== 'disconnected') {
			return this._tunnelStatus;
		}

		this.setMode(mode);

		try {
			await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
		} catch (e) {
			this._logger.error(e);
		}
		return this._tunnelStatus;
	}


	async stopTunnel(): Promise<void> {
		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}

		if (this._mode.active) {
			// Be careful to only uninstall the service if we're the ones who installed it:
			const needsServiceUninstall = this._mode.asService;
			this.setMode(INACTIVE_TUNNEL_MODE);

			try {
				if (needsServiceUninstall) {
					this.runCodeTunnelCommand('uninstallService', ['service', 'uninstall']);
				}
			} catch (e) {
				this._logger.error(e);
			}
		}

		try {
			await this.runCodeTunnelCommand('stop', ['kill']);
		} catch (e) {
			this._logger.error(e);
		}

		this.setTunnelStatus(TunnelStates.disconnected());
	}

	private async updateTunnelProcess(): Promise<void> {
		this.telemetryService.publicLog2<RemoteTunnelEnablementEvent, RemoteTunnelEnablementClassification>('remoteTunnel.enablement', {
			enabled: this._mode.active,
			service: this._mode.active && this._mode.asService,
		});

		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}

		let output = '';
		let isServiceInstalled = false;
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
			let status: {
				service_installed: boolean;
				tunnel: object | null;
			};

			try {
				status = JSON.parse(output.trim().split('\n').find(l => l.startsWith('{'))!);
			} catch (e) {
				this._logger.error(`Could not parse status output: ${JSON.stringify(output.trim())}`);
				this.setTunnelStatus(TunnelStates.disconnected());
				return;
			}

			isServiceInstalled = status.service_installed;
			this._logger.info(status.tunnel ? 'Other tunnel running, attaching...' : 'No other tunnel running');

			// If a tunnel is running but the mode isn't "active", we'll still attach
			// to the tunnel to show its state in the UI. If neither are true, disconnect
			if (!status.tunnel && !this._mode.active) {
				this.setTunnelStatus(TunnelStates.disconnected());
				return;
			}
		} catch (e) {
			this._logger.error(e);
			this.setTunnelStatus(TunnelStates.disconnected());
			return;
		} finally {
			if (this._tunnelProcess === statusProcess) {
				this._tunnelProcess = undefined;
			}
		}

		const session = this._mode.active ? this._mode.session : undefined;
		if (session && session.token) {
			const token = session.token;
			this.setTunnelStatus(TunnelStates.connecting(localize({ key: 'remoteTunnelService.authorizing', comment: ['{0} is a user account name, {1} a provider name (e.g. Github)'] }, 'Connecting as {0} ({1})', session.accountLabel, session.providerId)));
			const onLoginOutput = (a: string, isErr: boolean) => {
				a = a.replaceAll(token, '*'.repeat(4));
				onOutput(a, isErr);
			};
			const loginProcess = this.runCodeTunnelCommand('login', ['user', 'login', '--provider', session.providerId, '--log', LogLevelToString(this._logger.getLevel())], onLoginOutput, { VSCODE_CLI_ACCESS_TOKEN: token });
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
		const args = ['--accept-server-license-terms', '--log', LogLevelToString(this._logger.getLevel())];
		if (hostName) {
			args.push('--name', hostName);
		} else {
			args.push('--random-name');
		}

		let serviceInstallFailed = false;
		if (this._mode.active && this._mode.asService && !isServiceInstalled) {
			// I thought about calling `code tunnel kill` here, but having multiple
			// tunnel processes running is pretty much idempotent. If there's
			// another tunnel process running, the service process will
			// take over when it exits, no hard feelings.
			serviceInstallFailed = await this.installTunnelService(args) === false;
		}

		return this.serverOrAttachTunnel(session, args, serviceInstallFailed);
	}

	private async installTunnelService(args: readonly string[]) {
		let status: number;
		try {
			status = await this.runCodeTunnelCommand('serviceInstall', ['service', 'install', ...args]);
		} catch (e) {
			this._logger.error(e);
			status = 1;
		}

		if (status !== 0) {
			const msg = localize('remoteTunnelService.serviceInstallFailed', 'Failed to install tunnel as a service, starting in session...');
			this._logger.warn(msg);
			this.setTunnelStatus(TunnelStates.connecting(msg));
			return false;
		}

		return true;
	}

	private async serverOrAttachTunnel(session: IRemoteTunnelSession | undefined, args: string[], serviceInstallFailed: boolean) {
		args.push('--parent-process-id', String(process.pid));

		if (this._preventSleep()) {
			args.push('--no-sleep');
		}

		let isAttached = false;
		const serveCommand = this.runCodeTunnelCommand('tunnel', args, (message: string, isErr: boolean) => {
			if (isErr) {
				this._logger.error(message);
			} else {
				this._logger.info(message);
			}

			if (message.includes('Connected to an existing tunnel process')) {
				isAttached = true;
			}

			const m = message.match(/Open this link in your browser (https:\/\/([^\/\s]+)\/([^\/\s]+)\/([^\/\s]+))/);
			if (m) {
				const info: ConnectionInfo = { link: m[1], domain: m[2], tunnelName: m[4], isAttached };
				this.setTunnelStatus(TunnelStates.connected(info, serviceInstallFailed));
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
				this._mode = INACTIVE_TUNNEL_MODE;

				this.setTunnelStatus(TunnelStates.disconnected());
			}
		});
	}

	private runCodeTunnelCommand(logLabel: string, commandArgs: string[], onOutput: (message: string, isError: boolean) => void = this.defaultOnOutput, env?: Record<string, string>): CancelablePromise<number> {
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
					onOutput('Building tunnel CLI from sources and run\n', false);
					onOutput(`${logLabel} Spawning: cargo run -- tunnel ${commandArgs.join(' ')}\n`, false);
					tunnelProcess = spawn('cargo', ['run', '--', 'tunnel', ...commandArgs], { cwd: join(this.environmentService.appRoot, 'cli'), stdio, env: { ...process.env, RUST_BACKTRACE: '1', ...env } });
				} else {
					onOutput('Running tunnel CLI\n', false);
					const tunnelCommand = this.getTunnelCommandLocation();
					onOutput(`${logLabel} Spawning: ${tunnelCommand} tunnel ${commandArgs.join(' ')}\n`, false);
					tunnelProcess = spawn(tunnelCommand, ['tunnel', ...commandArgs], { cwd: homedir(), stdio, env: { ...process.env, ...env } });
				}

				tunnelProcess.stdout!.pipe(new StreamSplitter('\n')).on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, false);
					}
				});
				tunnelProcess.stderr!.pipe(new StreamSplitter('\n')).on('data', data => {
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

	private _restoreMode(): TunnelMode {
		try {
			const tunnelAccessSession = this.storageService.get(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
			const asService = this.storageService.getBoolean(TUNNEL_ACCESS_IS_SERVICE, StorageScope.APPLICATION, false);
			if (tunnelAccessSession) {
				const session = JSON.parse(tunnelAccessSession) as IRemoteTunnelSession;
				if (session && isString(session.accountLabel) && isString(session.sessionId) && isString(session.providerId)) {
					return { active: true, session, asService };
				}
				this._logger.error('Problems restoring session from storage, invalid format', session);
			}
		} catch (e) {
			this._logger.error('Problems restoring session from storage', e);
		}
		return INACTIVE_TUNNEL_MODE;
	}

	private _storeMode(mode: TunnelMode): void {
		if (mode.active) {
			const sessionWithoutToken = {
				providerId: mode.session.providerId, sessionId: mode.session.sessionId, accountLabel: mode.session.accountLabel
			};
			this.storageService.store(TUNNEL_ACCESS_SESSION, JSON.stringify(sessionWithoutToken), StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.storageService.store(TUNNEL_ACCESS_IS_SERVICE, mode.asService, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
			this.storageService.remove(TUNNEL_ACCESS_IS_SERVICE, StorageScope.APPLICATION);
		}
	}
}

function isSameSession(a1: IRemoteTunnelSession | undefined, a2: IRemoteTunnelSession | undefined): boolean {
	if (a1 && a2) {
		return a1.sessionId === a2.sessionId && a1.providerId === a2.providerId && a1.token === a2.token;
	}
	return a1 === a2;
}

const isSameMode = (a: TunnelMode, b: TunnelMode) => {
	if (a.active !== b.active) {
		return false;
	} else if (a.active && b.active) {
		return a.asService === b.asService && isSameSession(a.session, b.session);
	} else {
		return true;
	}
};
