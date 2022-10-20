/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { basename, dirname, joinPath } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { ByteSize, FileOperationError, FileOperationResult, IFileService, whenProviderRegistered } from 'vs/platform/files/common/files';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { AbstractLogger, AbstractLoggerService, format, ILogger, ILoggerOptions, ILoggerService, ILogService, LogLevel } from 'vs/platform/log/common/log';

const MAX_FILE_SIZE = 5 * ByteSize.MB;

export class FileLogger extends AbstractLogger implements ILogger {

	private readonly initializePromise: Promise<void>;
	private readonly queue: Queue<void>;
	private backupIndex: number = 1;

	constructor(
		name: string,
		private readonly resource: URI,
		level: LogLevel,
		private readonly donotUseFormatters: boolean,
		@IFileService private readonly fileService: IFileService
	) {
		super();
		this.setLevel(level);
		this.queue = this._register(new Queue<void>());
		this.initializePromise = this.initialize();
	}

	trace(): void {
		if (this.getLevel() <= LogLevel.Trace) {
			this._log(LogLevel.Trace, format(arguments));
		}
	}

	debug(): void {
		if (this.getLevel() <= LogLevel.Debug) {
			this._log(LogLevel.Debug, format(arguments));
		}
	}

	info(): void {
		if (this.getLevel() <= LogLevel.Info) {
			this._log(LogLevel.Info, format(arguments));
		}
	}

	warn(): void {
		if (this.getLevel() <= LogLevel.Warning) {
			this._log(LogLevel.Warning, format(arguments));
		}
	}

	error(): void {
		if (this.getLevel() <= LogLevel.Error) {
			const arg = arguments[0];

			if (arg instanceof Error) {
				const array = Array.prototype.slice.call(arguments) as any[];
				array[0] = arg.stack;
				this._log(LogLevel.Error, format(array));
			} else {
				this._log(LogLevel.Error, format(arguments));
			}
		}
	}

	critical(): void {
		if (this.getLevel() <= LogLevel.Critical) {
			this._log(LogLevel.Critical, format(arguments));
		}
	}

	flush(): void {
	}

	private async initialize(): Promise<void> {
		try {
			await this.fileService.createFile(this.resource);
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_MODIFIED_SINCE) {
				throw error;
			}
		}
	}

	private _log(level: LogLevel, message: string): void {
		this.queue.queue(async () => {
			await this.initializePromise;
			let content = await this.loadContent();
			if (content.length > MAX_FILE_SIZE) {
				await this.fileService.writeFile(this.getBackupResource(), VSBuffer.fromString(content));
				content = '';
			}
			if (this.donotUseFormatters) {
				content += message;
			} else {
				content += `${this.getCurrentTimestamp()} [${this.stringifyLogLevel(level)}] ${message}\n`;
			}
			await this.fileService.writeFile(this.resource, VSBuffer.fromString(content));
		});
	}

	private getCurrentTimestamp(): string {
		const toTwoDigits = (v: number) => v < 10 ? `0${v}` : v;
		const toThreeDigits = (v: number) => v < 10 ? `00${v}` : v < 100 ? `0${v}` : v;
		const currentTime = new Date();
		return `${currentTime.getFullYear()}-${toTwoDigits(currentTime.getMonth() + 1)}-${toTwoDigits(currentTime.getDate())} ${toTwoDigits(currentTime.getHours())}:${toTwoDigits(currentTime.getMinutes())}:${toTwoDigits(currentTime.getSeconds())}.${toThreeDigits(currentTime.getMilliseconds())}`;
	}

	private getBackupResource(): URI {
		this.backupIndex = this.backupIndex > 5 ? 1 : this.backupIndex;
		return joinPath(dirname(this.resource), `${basename(this.resource)}_${this.backupIndex++}`);
	}

	private async loadContent(): Promise<string> {
		try {
			const content = await this.fileService.readFile(this.resource);
			return content.value.toString();
		} catch (e) {
			return '';
		}
	}

	private stringifyLogLevel(level: LogLevel): string {
		switch (level) {
			case LogLevel.Critical: return 'critical';
			case LogLevel.Debug: return 'debug';
			case LogLevel.Error: return 'error';
			case LogLevel.Info: return 'info';
			case LogLevel.Trace: return 'trace';
			case LogLevel.Warning: return 'warning';
		}
		return '';
	}

}

export class FileLoggerService extends AbstractLoggerService implements ILoggerService {

	constructor(
		@ILogService logService: ILogService,
		@IFileService private readonly fileService: IFileService,
	) {
		super(logService.getLevel(), logService.onDidChangeLogLevel);
	}

	protected doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		const logger = new BufferLogService(logLevel);
		whenProviderRegistered(resource, this.fileService).then(() => (<BufferLogService>logger).logger = new FileLogger(options?.name || basename(resource), resource, logger.getLevel(), !!options?.donotUseFormatters, this.fileService));
		return logger;
	}
}
