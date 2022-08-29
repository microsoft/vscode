/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILoggerOptions, AbstractMessageLogger, LogLevel, AbstractLoggerService } from 'vs/platform/log/common/log';
import { MainThreadLoggerShape, MainContext, ExtHostLogLevelServiceShape as ExtHostLogLevelServiceShape } from 'vs/workbench/api/common/extHost.protocol';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { URI } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';

export class ExtHostLoggerService extends AbstractLoggerService implements ExtHostLogLevelServiceShape {

	declare readonly _serviceBrand: undefined;
	private readonly _onDidChangeLogLevel: Emitter<LogLevel>;
	private readonly _proxy: MainThreadLoggerShape;

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService,
	) {
		const emitter = new Emitter<LogLevel>();
		super(initData.logLevel, emitter.event);
		this._proxy = rpc.getProxy(MainContext.MainThreadLogger);
		this._onDidChangeLogLevel = this._register(emitter);
	}

	$setLevel(level: LogLevel): void {
		this._onDidChangeLogLevel.fire(level);
	}

	protected doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		return new Logger(this._proxy, resource, logLevel, options);
	}
}

class Logger extends AbstractMessageLogger {

	private isLoggerCreated: boolean = false;
	private buffer: [LogLevel, string][] = [];

	constructor(
		private readonly proxy: MainThreadLoggerShape,
		private readonly file: URI,
		logLevel: LogLevel,
		loggerOptions?: ILoggerOptions,
	) {
		super(loggerOptions?.always);
		this.setLevel(logLevel);
		this.proxy.$createLogger(file, loggerOptions)
			.then(() => {
				this.doLog(this.buffer);
				this.isLoggerCreated = true;
			});
	}

	protected log(level: LogLevel, message: string) {
		const messages: [LogLevel, string][] = [[level, message]];
		if (this.isLoggerCreated) {
			this.doLog(messages);
		} else {
			this.buffer.push(...messages);
		}
	}

	private doLog(messages: [LogLevel, string][]) {
		this.proxy.$log(this.file, messages);
	}
}
