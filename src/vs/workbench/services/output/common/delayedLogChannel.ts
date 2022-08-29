/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILoggerService, ILogService, log, LogLevel } from 'vs/platform/log/common/log';
import { registerLogChannel } from 'vs/workbench/services/output/common/output';
import { URI } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';

export class DelayedLogChannel {

	private readonly logger: ILogger;

	constructor(
		private readonly id: string, private readonly name: string, private readonly file: URI,
		@ILoggerService loggerService: ILoggerService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		this.logger = loggerService.createLogger(file, { name });
	}

	private registerLogChannelPromise: Promise<void> | undefined;
	log(level: LogLevel, message: string): void {
		if (!this.registerLogChannelPromise) {
			// Register log channel only when logging is actually attempted
			this.registerLogChannelPromise = registerLogChannel(this.id, this.name, this.file, this.fileService, this.logService);
		}
		log(this.logger, level, message);
	}

}
