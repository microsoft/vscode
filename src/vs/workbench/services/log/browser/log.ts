/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractLoggerService, ILogger, ILoggerOptions, ILoggerService, LogLevel } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { BufferLogger } from 'vs/platform/log/common/bufferLog';
import { IFileService, whenProviderRegistered } from 'vs/platform/files/common/files';
import { FileLogger } from 'vs/platform/log/common/fileLog';
import { Barrier } from 'vs/base/common/async';
import { assertIsDefined } from 'vs/base/common/types';

export class BrowserLoggerService extends AbstractLoggerService implements ILoggerService {

	private readonly barrier = new Barrier();
	private fileService: IFileService | undefined;

	constructor(
		logLevel: LogLevel,
		logsHome: URI,
	) {
		super(logLevel, logsHome);
	}

	acquireFileService(fileService: IFileService): void {
		this.fileService = fileService;
		this.barrier.open();
	}

	protected doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		const logger = new BufferLogger(logLevel);
		this.waitAndCreateLogger(logger, resource, logLevel, options);
		return logger;
	}

	private async waitAndCreateLogger(bufferLogger: BufferLogger, resource: URI, logLevel: LogLevel, options?: ILoggerOptions): Promise<void> {
		await this.barrier.wait();
		this.fileService = assertIsDefined(this.fileService);
		await whenProviderRegistered(resource, this.fileService);
		bufferLogger.logger = new FileLogger(resource, bufferLogger.getLevel(), !!options?.donotUseFormatters, this.fileService);
	}

}
