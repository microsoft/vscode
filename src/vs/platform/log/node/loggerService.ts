/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService, ILoggerService, ILogger, ILoggerOptions, LogLevel } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { basename } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { FileLogger } from 'vs/platform/log/common/fileLog';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import { IFileService } from 'vs/platform/files/common/files';
import { generateUuid } from 'vs/base/common/uuid';

export class LoggerService extends Disposable implements ILoggerService {

	declare readonly _serviceBrand: undefined;

	private readonly loggers = new Map<string, ILogger>();
	private readonly logLevelChangeableLoggers: ILogger[] = [];

	constructor(
		@ILogService private logService: ILogService,
		@IFileService private fileService: IFileService
	) {
		super();
		this._register(logService.onDidChangeLogLevel(level => this.logLevelChangeableLoggers.forEach(logger => logger.setLevel(level))));
	}

	createLogger(resource: URI, options?: ILoggerOptions): ILogger {
		let logger = this.loggers.get(resource.toString());
		if (!logger) {
			if (resource.scheme === Schemas.file) {
				logger = new SpdLogLogger(options?.name || generateUuid(), resource.fsPath, !options?.donotRotate, this.logService.getLevel());
				if (options?.donotUseFormatters) {
					(<SpdLogLogger>logger).clearFormatters();
				}
			} else {
				logger = new FileLogger(options?.name ?? basename(resource), resource, this.logService.getLevel(), this.fileService);
			}
			this.loggers.set(resource.toString(), logger);
			if (options?.always) {
				logger.setLevel(LogLevel.Trace);
			} else {
				this.logLevelChangeableLoggers.push(logger);
			}
		}
		return logger;
	}

	dispose(): void {
		this.logLevelChangeableLoggers.splice(0, this.logLevelChangeableLoggers.length);
		this.loggers.forEach(logger => logger.dispose());
		this.loggers.clear();
		super.dispose();
	}
}

