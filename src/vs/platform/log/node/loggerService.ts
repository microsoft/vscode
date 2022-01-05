/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { IFileService } from 'vs/platform/files/common/files';
import { FileLogger } from 'vs/platform/log/common/fileLog';
import { AbstractLoggerService, ILogger, ILoggerOptions, ILoggerService, ILogService, LogLevel } from 'vs/platform/log/common/log';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';

export class LoggerService extends AbstractLoggerService implements ILoggerService {

	constructor(
		@ILogService logService: ILogService,
		@IFileService private readonly fileService: IFileService
	) {
		super(logService.getLevel(), logService.onDidChangeLogLevel);
	}

	protected doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		if (resource.scheme === Schemas.file) {
			return new SpdLogLogger(options?.name || generateUuid(), resource.fsPath, !options?.donotRotate, !!options?.donotUseFormatters, logLevel);
		} else {
			return new FileLogger(options?.name ?? basename(resource), resource, logLevel, !!options?.donotUseFormatters, this.fileService);
		}
	}
}

