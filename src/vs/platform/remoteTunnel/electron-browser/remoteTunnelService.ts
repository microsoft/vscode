/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CONFIGURATION_KEY_HOST_NAME, ConnectionInfo, IRemoteTunnelAccount, IRemoteTunnelService, TunnelStates, TunnelStatus } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { dirname, join } from 'vs/base/common/path';
import { ChildProcess, spawn } from 'child_process';
import { IProductService } from 'vs/platform/product/common/productService';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { CancelablePromise, createCancelablePromise, Delayer } from 'vs/base/common/async';
import { ISharedProcessLifecycleService } from 'vs/platform/lifecycle/electron-browser/sharedProcessLifecycleService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { hostname, homedir } from 'os';

type RemoteTunnelEnablementClassification = {
	owner: 'aeschli';
	comment: 'Reporting when Remote Tunnel access is turned on or off';
	enabled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Flag indicating if Remote Tunnel Access is enabled or not' };
};

type RemoteTunnelEnablementEvent = {
	enabled: boolean;
};

/**
 * This service runs on the shared service. It is running the `code-tunnel` command
 * to make the current machine available for remote access.
 */
export class RemoteTunnelService extends Disposable implements IRemoteTunnelService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidTokenFailedEmitter = new Emitter<boolean>();
	public readonly onDidTokenFailed = this._onDidTokenFailedEmitter.event;

	private readonly _onDidChangeTunnelStatusEmitter = new Emitter<TunnelStatus>();
	public readonly onDidChangeTunnelStatus = this._onDidChangeTunnelStatusEmitter.event;

	private readonly _onDidChangeAccountEmitter = new Emitter<IRemoteTunnelAccount | undefined>();
	public readonly onDidChangeAccount = this._onDidChangeAccountEmitter.event;

	private readonly _logger: ILogger;

	private _account: IRemoteTunnelAccount | undefined;
	private _tunnelProcess: CancelablePromise<void> | undefined;

	private _tunnelStatus: TunnelStatus = TunnelStates.disconnected;
	private _startTunnelProcessDelayer: Delayer<void>;

	private _tunnelCommand: string | undefined;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILoggerService loggerService: ILoggerService,
		@ISharedProcessLifecycleService sharedProcessLifecycleService: ISharedProcessLifecycleService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this._logger = this._register(loggerService.createLogger(environmentService.remoteTunnelLogResource, { name: 'remoteTunnel' }));
		this._startTunnelProcessDelayer = new Delayer(100);

		this._register(sharedProcessLifecycleService.onWillShutdown(e => {
			if (this._tunnelProcess) {
				this._tunnelProcess.cancel();
				this._tunnelProcess = undefined;
			}
			this.dispose();
		}));

		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CONFIGURATION_KEY_HOST_NAME)) {
				this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
			}
		}));
	}

	async getAccount(): Promise<IRemoteTunnelAccount | undefined> {
		return this._account;
	}

	async updateAccount(account: IRemoteTunnelAccount | undefined): Promise<void> {
		if (account && this._account ? account.token !== this._account.token || account.authenticationProviderId !== this._account.authenticationProviderId : account !== this._account) {
			this._account = account;
			this._onDidChangeAccountEmitter.fire(account);

			this._logger.info(`Account updated: ${account ? account.authenticationProviderId : 'undefined'}`);

			this.telemetryService.publicLog2<RemoteTunnelEnablementEvent, RemoteTunnelEnablementClassification>('remoteTunnel.enablement', { enabled: !!account });

			try {
				await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
			} catch (e) {
				this._logger.error(e);
			}
		}
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

	private async updateTunnelProcess(): Promise<void> {
		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}
		if (!this._account) {
			this.setTunnelStatus(TunnelStates.disconnected);
			return;
		}
		this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.authorizing', 'Authorizing')));
		const loginProcess = this.runCodeTunneCommand('login', ['user', 'login', '--provider', this._account.authenticationProviderId, '--access-token', this._account.token]);
		this._tunnelProcess = loginProcess;
		try {
			await loginProcess;
			if (this._tunnelProcess !== loginProcess) {
				return;
			}
		} catch (e) {
			this._logger.error(e);
			this._tunnelProcess = undefined;
			this._onDidTokenFailedEmitter.fire(true);
			this.setTunnelStatus(TunnelStates.disconnected);
			return;
		}
		const args = ['--parent-process-id', String(process.pid), '--accept-server-license-terms'];
		const hostName = this.getHostName();
		if (hostName) {
			args.push('--name', hostName);
		} else {
			args.push('--random-name');
		}
		const serveCommand = this.runCodeTunneCommand('tunnel', args, (message: string) => {
			const m = message.match(/^\s*Open this link in your browser (https:[^\s]*)+/);
			if (m && m[1]) {
				const linkUri = URI.parse(m[1]);
				const pathMatch = linkUri.path.match(/\/+([^\/])+\/([^\/]+)\//);
				const info: ConnectionInfo = pathMatch ? { link: m[1], domain: linkUri.authority, extensionId: pathMatch[1], hostName: pathMatch[2] } : { link: m[1], domain: linkUri.authority, extensionId: '', hostName: '' };
				this.setTunnelStatus(TunnelStates.connected(info));
			}
		});
		this._tunnelProcess = serveCommand;
		serveCommand.finally(() => {
			if (serveCommand === this._tunnelProcess) {
				// process exited unexpectedly
				this._logger.info(`tunnel process terminated`);
				this._tunnelProcess = undefined;
				this._account = undefined;

				this.setTunnelStatus(TunnelStates.disconnected);
			}
		});
	}

	public async getTunnelStatus(): Promise<TunnelStatus> {
		return this._tunnelStatus;
	}

	private setTunnelStatus(tunnelStatus: TunnelStatus) {
		if (tunnelStatus !== this._tunnelStatus) {
			this._tunnelStatus = tunnelStatus;
			this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
		}
	}

	private runCodeTunneCommand(logLabel: string, commandArgs: string[], onOutput: (message: string, isError: boolean) => void = () => { }): CancelablePromise<void> {
		return createCancelablePromise<void>(token => {
			return new Promise((resolve, reject) => {
				if (token.isCancellationRequested) {
					resolve();
				}
				let tunnelProcess: ChildProcess | undefined;
				token.onCancellationRequested(() => {
					if (tunnelProcess) {
						this._logger.info(`${logLabel} terminating (${tunnelProcess.pid})`);
						tunnelProcess.kill();
					}
				});
				this._logger.info(`${logLabel} appRoot ${this.environmentService.appRoot}`);
				this._logger.info(`${logLabel} process.execPath ${process.execPath}`);

				if (process.env['VSCODE_DEV']) {
					onOutput('Compiling tunnel CLI from sources and run', false);
					this._logger.info(`${logLabel} Spawning: cargo run -- tunnel ${commandArgs.join(' ')}`);
					tunnelProcess = spawn('cargo', ['run', '--', 'tunnel', ...commandArgs], { cwd: join(this.environmentService.appRoot, 'cli') });
				} else {
					onOutput('Running tunnel CLI', false);
					const tunnelCommand = this.getTunnelCommandLocation();
					this._logger.info(`${logLabel} Spawning: ${tunnelCommand} tunnel ${commandArgs.join(' ')}`);
					tunnelProcess = spawn(tunnelCommand, ['tunnel', ...commandArgs], { cwd: homedir() });
				}

				tunnelProcess.stdout!.on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, false);
						this._logger.info(`${logLabel} stdout (${tunnelProcess.pid}):  + ${message}`);
					}
				});
				tunnelProcess.stderr!.on('data', data => {
					if (tunnelProcess) {
						const message = data.toString();
						onOutput(message, true);
						this._logger.info(`${logLabel} stderr (${tunnelProcess.pid}):  + ${message}`);
					}
				});
				tunnelProcess.on('exit', e => {
					if (tunnelProcess) {
						this._logger.info(`${logLabel} exit (${tunnelProcess.pid}):  + ${e}`);
						tunnelProcess = undefined;
						if (e === 0) {
							resolve();
						} else {
							reject();
						}
					}
				});
				tunnelProcess.on('error', e => {
					if (tunnelProcess) {
						this._logger.info(`${logLabel} error (${tunnelProcess.pid}):  + ${e}`);
						tunnelProcess = undefined;
						reject();
					}
				});
			});
		});
	}

	private getHostName() {
		const name = this.configurationService.getValue<string>(CONFIGURATION_KEY_HOST_NAME);
		if (name && name.match(/^([\w-]+)$/) && name.length <= 20) {
			return name;
		}
		const hostName = hostname();
		if (hostName && hostName.match(/^([\w-]+)$/)) {
			return hostName;
		}

		return undefined;
	}

}
