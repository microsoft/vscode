/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { LogLevel, ILoggerService, ILogger, AbstractMessageLogger, ILoggerOptions } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/mainProcessService';

export class LoggerService implements ILoggerService {

	declare readonly _serviceBrand: undefined;
	private readonly channel: IChannel;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		this.channel = mainProcessService.getChannel('logger');
	}

	createConsoleMainLogger(): ILogger {
		return new Logger(this.channel);
	}

	createLogger(file: URI, options?: ILoggerOptions): ILogger {
		return new Logger(this.channel, file, options);
	}

}

class Logger extends AbstractMessageLogger {

	private isLoggerCreated: boolean = false;
	private buffer: [LogLevel, string][] = [];

	constructor(
		private readonly channel: IChannel,
		private readonly file?: URI,
		loggerOptions?: ILoggerOptions,
	) {
		super(loggerOptions?.always);
		(this.file ? this.channel.call('createLogger', [file, loggerOptions]) : this.channel.call('createConsoleMainLogger', [file, loggerOptions]))
			.then(() => {
				this._log(this.buffer);
				this.isLoggerCreated = true;
			});
	}

	protected log(level: LogLevel, message: string) {
		this._log([[level, message]]);
	}

	private _log(messages: [LogLevel, string][]) {
		if (this.isLoggerCreated) {
			this.channel.call('log', [this.file, messages]);
		} else {
			this.buffer.push(...messages);
		}
	}
}
