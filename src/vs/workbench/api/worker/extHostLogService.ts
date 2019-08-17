/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService, LogLevel, AbstractLogService } from 'vs/platform/log/common/log';
import { ExtHostLogServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import * as vscode from 'vscode';

export class ExtHostLogService extends AbstractLogService implements ILogService, ExtHostLogServiceShape {

	_serviceBrand: any;

	private readonly _logChannel: vscode.OutputChannel;

	constructor(
		@IExtHostInitDataService initData: IExtHostInitDataService,
		@IExtHostOutputService extHostOutputService: IExtHostOutputService
	) {
		super();
		this.setLevel(initData.logLevel);
		this._logChannel = extHostOutputService.createOutputChannel('Log (Worker Extension Host)');
	}

	$setLevel(level: LogLevel): void {
		this.setLevel(level);
	}

	trace(_message: string, ..._args: any[]): void {
		if (this.getLevel() <= LogLevel.Trace) {
			this._logChannel.appendLine(this._format(arguments));
		}
	}

	debug(_message: string, ..._args: any[]): void {
		if (this.getLevel() <= LogLevel.Debug) {
			this._logChannel.appendLine(this._format(arguments));
		}
	}

	info(_message: string, ..._args: any[]): void {
		if (this.getLevel() <= LogLevel.Info) {
			this._logChannel.appendLine(this._format(arguments));
		}
	}

	warn(_message: string, ..._args: any[]): void {
		if (this.getLevel() <= LogLevel.Warning) {
			this._logChannel.appendLine(this._format(arguments));
		}
	}

	error(_message: string | Error, ..._args: any[]): void {
		if (this.getLevel() <= LogLevel.Error) {
			this._logChannel.appendLine(this._format(arguments));
		}
	}

	critical(_message: string | Error, ..._args: any[]): void {
		if (this.getLevel() <= LogLevel.Critical) {
			this._logChannel.appendLine(String(arguments));
		}
	}

	private _format(args: any): string {
		let result = '';

		for (let i = 0; i < args.length; i++) {
			let a = args[i];

			if (typeof a === 'object') {
				try {
					a = JSON.stringify(a);
				} catch (e) { }
			}

			result += (i > 0 ? ' ' : '') + a;
		}

		return result;
	}
}
