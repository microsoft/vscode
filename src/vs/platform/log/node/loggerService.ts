/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService, ILoggerService, ILogger } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { basename, extname, dirname } from 'vs/base/common/resources';
import { Schemas } from 'vs/base/common/network';
import { FileLogger } from 'vs/platform/log/common/fileLog';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import { IFileService } from 'vs/platform/files/common/files';

export class LoggerService extends Disposable implements ILoggerService {

	declare readonly _serviceBrand: undefined;

	private readonly loggers = new Map<string, ILogger>();

	constructor(
		@ILogService private logService: ILogService,
		@IFileService private fileService: IFileService
	) {
		super();
		this._register(logService.onDidChangeLogLevel(level => this.loggers.forEach(logger => logger.setLevel(level))));
	}

	getLogger(resource: URI): ILogger {
		let logger = this.loggers.get(resource.toString());
		if (!logger) {
			if (resource.scheme === Schemas.file) {
				const baseName = basename(resource);
				const ext = extname(resource);
				logger = new SpdLogLogger(baseName.substring(0, baseName.length - ext.length), dirname(resource).fsPath, this.logService.getLevel());
			} else {
				logger = new FileLogger(basename(resource), resource, this.logService.getLevel(), this.fileService);
			}
			this.loggers.set(resource.toString(), logger);
		}
		return logger;
	}

	dispose(): void {
		this.loggers.forEach(logger => logger.dispose());
		this.loggers.clear();
		super.dispose();
	}
}

