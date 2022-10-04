/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRemoteTunnelAccount, IRemoteTunnelService } from 'vs/platform/remoteTunnel/common/remoteTunnel';
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


type RemoteTunnelEnablementClassification = {
	owner: 'aeschli';
	comment: 'Reporting when Machine Sharing is turned on or off';
	enabled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Flag indicating if machine sharing is enabled or not' };
};

type RemoteTunnelEnablementEvent = {
	enabled: boolean;
};


export class RemoteTunnelService extends Disposable implements IRemoteTunnelService {

	declare readonly _serviceBrand: undefined;

	private readonly _onTokenFailedEmitter = new Emitter<boolean>();
	public readonly onTokenFailed = this._onTokenFailedEmitter.event;

	private readonly _onDidChangeAccountEmitter = new Emitter<IRemoteTunnelAccount | undefined>();
	public readonly onDidChangeAccount = this._onDidChangeAccountEmitter.event;

	private readonly logger: ILogger;

	private _account: IRemoteTunnelAccount | undefined;

	private _tunnelProcess: ChildProcess | undefined;

	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILoggerService loggerService: ILoggerService,
	) {
		super();
		this.logger = this._register(loggerService.createLogger(URI.file(join(environmentService.logsPath, 'remoteTunnel.log')), { name: 'remoteTunnel' }));
	}


	async getAccount(): Promise<IRemoteTunnelAccount | undefined> {
		return this._account;
	}

	async updateAccount(account: IRemoteTunnelAccount | undefined): Promise<void> {
		if (account && this._account ? account.token !== this._account.token || account.authenticationProviderId !== this._account.authenticationProviderId : account !== this._account) {
			this._account = account;
			this._onDidChangeAccountEmitter.fire(account);

			this.logger.info(`Account updated: ${account ? account.authenticationProviderId : 'undefined'}`);

			this.telemetryService.publicLog2<RemoteTunnelEnablementEvent, RemoteTunnelEnablementClassification>('remoteTunnel.enablement', { enabled: !!account });

			this.updateTunnelProcess();
		}

	}

	private updateTunnelProcess(): void {
		if (this._tunnelProcess) {
			this.logger.info(`Stopping tunnel process ${this._tunnelProcess.pid}`);
			this._tunnelProcess.kill();
			this._tunnelProcess = undefined;
		}
		if (!this._account) {
			return;
		}
		let tunnelProcess: ChildProcess;
		if (process.env['VSCODE_DEV']) {
			tunnelProcess = spawn('cargo', ['run', 'tunnel'], { cwd: join(this.environmentService.appRoot, 'cli') });
		} else {
			const tunnelCommand = join(dirname(process.execPath), 'bin', `${this.productService.tunnelApplicationName}${isWindows ? '.exe' : ''}`);
			const tunnelArgs = ['tunnel'];
			tunnelProcess = spawn(tunnelCommand, tunnelArgs);
		}
		tunnelProcess.stdout!.on('data', data => {
			this.logger.info(`stdout (${tunnelProcess.pid}):  + ${data.toString()}`);
		});
		tunnelProcess.stderr!.on('data', data => {
			this.logger.info(`stderr (${tunnelProcess.pid}):  + ${data.toString()}`);
		});
		tunnelProcess.on('exit', e => {
			this.logger.info(`exit (${tunnelProcess.pid}):  + ${e}`);
		});
		tunnelProcess.on('error', e => {
			this.logger.info(`error (${tunnelProcess.pid}):  + ${e}`);
		});
		this._tunnelProcess = tunnelProcess;


	}

}
