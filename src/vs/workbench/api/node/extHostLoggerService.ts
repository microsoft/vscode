/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILoggerOptions, LogLevel } from 'vs/platform/log/common/log';
import { URI } from 'vs/base/common/uri';
import { ExtHostLoggerService as BaseExtHostLoggerService } from 'vs/workbench/api/common/extHostLoggerService';
import { Schemas } from 'vs/base/common/network';
import { SpdLogLogger } from 'vs/platform/log/node/spdlogLog';
import { generateUuid } from 'vs/base/common/uuid';

export class ExtHostLoggerService extends BaseExtHostLoggerService {

	protected override doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		if (resource.scheme === Schemas.file) {
			const logger = new SpdLogLogger(options?.name || generateUuid(), resource.fsPath, !options?.donotRotate, logLevel);
			if (options?.donotUseFormatters) {
				(<SpdLogLogger>logger).clearFormatters();
			}
			return logger;
		}
		return super.doCreateLogger(resource, logLevel, options);
	}

}
