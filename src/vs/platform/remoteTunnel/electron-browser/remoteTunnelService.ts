/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteTunnelAccount, IRemoteTunnelService, TunnelStatus } from 'vs/platform/remoteTunnel/common/remoteTunnel';
import { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILogger, ILoggerService } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { dirname, join } from 'vs/base/common/path';
import { ChildProcess, spawn } from 'child_process';
import { IProductService } from 'vs/platform/product/common/productService';
import { isWindows } from 'vs/base/common/platform';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { ISharedProcessLifecycleService } from 'vs/platform/lifecycle/electron-browser/sharedProcessLifecycleService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';


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

	private _tunnelStatus: TunnelStatus = TunnelStatus.Disconnected;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILoggerService loggerService: ILoggerService,
		@ISharedProcessLifecycleService sharedProcessLifecycleService: ISharedProcessLifecycleService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super();
		const logFileUri = URI.file(join(dirname(environmentService.logsPath), 'remoteTunnel.log'));
		this._logger = this._register(loggerService.createLogger(logFileUri, { name: 'remoteTunnel' }));

		this._register(sharedProcessLifecycleService.onWillShutdown(e => {
			if (this._tunnelProcess) {
				this._tunnelProcess.cancel();
				this._tunnelProcess = undefined;
			}
			this.dispose();
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
				this.updateTunnelProcess();
			} catch (e) {
				this._logger.error(e);
			}
		}

	}

	private async updateTunnelProcess(): Promise<void> {
		if (this._tunnelProcess) {
			this._tunnelProcess.cancel();
			this._tunnelProcess = undefined;
		}
		if (!this._account) {
			this.setTunnelStatus(TunnelStatus.Disconnected);
			return;
		}
		this.setTunnelStatus(TunnelStatus.Connecting);
		const loginProcess = this.runCodeTunneCommand('login', ['user', 'login', '--provider', this._account.authenticationProviderId, '--access-token', this._account.token]);
		this._tunnelProcess = loginProcess;
		try {
			await loginProcess;
		} catch (e) {
			this._logger.error(e);
			this._tunnelProcess = undefined;
			this._onDidTokenFailedEmitter.fire(true);
			this.setTunnelStatus(TunnelStatus.Disconnected);
		}
		if (this._tunnelProcess === loginProcess) {
			const serveCommand = this.runCodeTunneCommand('tunnel', ['--random-name'], (message: string) => {
			});
			this._tunnelProcess = serveCommand;
			serveCommand.finally(() => {
				if (serveCommand === this._tunnelProcess) {
					// process exited unexpectedly
					this._logger.info(`tunnel process terminated`);
					this._tunnelProcess = undefined;
					this._account = undefined;

					this.setTunnelStatus(TunnelStatus.Disconnected);
				}
			});

		}
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
				if (process.env['VSCODE_DEV']) {
					this._logger.info(`${logLabel} Spawning: cargo run --bin code-tunnel -- ${commandArgs.join(' ')}`);
					tunnelProcess = spawn('cargo', ['run', '--bin', 'code-tunnel', '--', ...commandArgs], { cwd: join(this.environmentService.appRoot, 'cli') });
				} else {
					const tunnelCommand = join(dirname(process.execPath), 'bin', `${this.productService.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
					this._logger.info(`${logLabel} Spawning: ${tunnelCommand} ${commandArgs.join(' ')}`);
					tunnelProcess = spawn(tunnelCommand, commandArgs);
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
						resolve();
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

}
