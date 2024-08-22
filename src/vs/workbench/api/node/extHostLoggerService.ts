/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogger, ILoggerOptions, ILoggerResource, LogLevel } from '../../../platform/log/common/log';
import { URI } from '../../../base/common/uri';
import { ExtHostLoggerService as BaseExtHostLoggerService } from '../common/extHostLoggerService';
import { Schemas } from '../../../base/common/network';
import { SpdLogLogger } from '../../../platform/log/node/spdlogLog';
import { generateUuid } from '../../../base/common/uuid';

export class ExtHostLoggerService extends BaseExtHostLoggerService {

	protected override doCreateLogger(resource: URI, logLevel: LogLevel, options?: ILoggerOptions): ILogger {
		if (resource.scheme === Schemas.file) {
			/* Create the logger in the Extension Host process to prevent loggers (log, output channels...) traffic  over IPC */
			return new SpdLogLogger(options?.name || generateUuid(), resource.fsPath, !options?.donotRotate, !!options?.donotUseFormatters, logLevel);
		}
		return super.doCreateLogger(resource, logLevel, options);
	}

	override registerLogger(resource: ILoggerResource): void {
		super.registerLogger(resource);
		this._proxy.$registerLogger(resource);
	}

	override deregisterLogger(resource: URI): void {
		super.deregisterLogger(resource);
		this._proxy.$deregisterLogger(resource);
	}

}
