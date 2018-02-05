/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { ILogService, LogLevel, NullLogService, AbstractLogService } from 'vs/platform/log/common/log';
import { RotatingLogger, setAsyncMode } from 'spdlog';

export function createSpdLogService(processName: string, logLevel: LogLevel, logsFolder: string): ILogService {
	try {
		setAsyncMode(8192, 2000);
		const logfilePath = path.join(logsFolder, `${processName}.log`);
		const logger = new RotatingLogger(processName, logfilePath, 1024 * 1024 * 5, 6);
		logger.setLevel(0);

		return new SpdLogService(logger, logLevel);
	} catch (e) {
		console.error(e);
	}
	return new NullLogService();
}

class SpdLogService extends AbstractLogService implements ILogService {

	_serviceBrand: any;

	constructor(
		private readonly logger: RotatingLogger,
		level: LogLevel = LogLevel.Error
	) {
		super();
		this.setLevel(level);
	}

	trace(): void {
		if (this.getLevel() <= LogLevel.Trace) {
			this.logger.trace(this.format(arguments));
		}
	}

	debug(): void {
		if (this.getLevel() <= LogLevel.Debug) {
			this.logger.debug(this.format(arguments));
		}
	}

	info(): void {
		if (this.getLevel() <= LogLevel.Info) {
			this.logger.info(this.format(arguments));
		}
	}

	warn(): void {
		if (this.getLevel() <= LogLevel.Warning) {
			this.logger.warn(this.format(arguments));
		}
	}

	error(): void {
		if (this.getLevel() <= LogLevel.Error) {
			const arg = arguments[0];

			if (arg instanceof Error) {
				const array = Array.prototype.slice.call(arguments) as any[];
				array[0] = arg.stack;
				this.logger.error(this.format(array));
			} else {
				this.logger.error(this.format(arguments));
			}
		}
	}

	critical(): void {
		if (this.getLevel() <= LogLevel.Critical) {
			this.logger.critical(this.format(arguments));
		}
	}

	dispose(): void {
		this.logger.drop();
	}

	private format(args: any): string {
		let result = '';

		for (let i = 0; i < args.length; i++) {
			let a = args[i];

			if (typeof a === 'object') {
				try {
					a = JSON.stringify(a);
				} catch (e) { }
			}

			result += (i > 0 ? ' ' : '') + a;
		}

		return result;
	}
}