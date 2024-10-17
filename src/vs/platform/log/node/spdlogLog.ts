/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as spdlog from '@vscode/spdlog';
import { ByteSize } from '../../files/common/files.js';
import { AbstractMessageLogger, ILogger, LogLevel } from '../common/log.js';

enum SpdLogLevel {
	Trace,
	Debug,
	Info,
	Warning,
	Error,
	Critical,
	Off
}

async function createSpdLogLogger(name: string, logfilePath: string, filesize: number, filecount: number, donotUseFormatters: boolean): Promise<spdlog.Logger | null> {
	// Do not crash if spdlog cannot be loaded
	try {
		const _spdlog = await import('@vscode/spdlog');
		_spdlog.setFlushOn(SpdLogLevel.Trace);
		const logger = await _spdlog.createAsyncRotatingLogger(name, logfilePath, filesize, filecount);
		if (donotUseFormatters) {
			logger.clearFormatters();
		} else {
			logger.setPattern('%Y-%m-%d %H:%M:%S.%e [%l] %v');
		}
		return logger;
	} catch (e) {
		console.error(e);
	}
	return null;
}

interface ILog {
	level: LogLevel;
	message: string;
}

function log(logger: spdlog.Logger, level: LogLevel, message: string): void {
	switch (level) {
		case LogLevel.Trace: logger.trace(message); break;
		case LogLevel.Debug: logger.debug(message); break;
		case LogLevel.Info: logger.info(message); break;
		case LogLevel.Warning: logger.warn(message); break;
		case LogLevel.Error: logger.error(message); break;
		case LogLevel.Off: /* do nothing */ break;
		default: throw new Error(`Invalid log level ${level}`);
	}
}

function setLogLevel(logger: spdlog.Logger, level: LogLevel): void {
	switch (level) {
		case LogLevel.Trace: logger.setLevel(SpdLogLevel.Trace); break;
		case LogLevel.Debug: logger.setLevel(SpdLogLevel.Debug); break;
		case LogLevel.Info: logger.setLevel(SpdLogLevel.Info); break;
		case LogLevel.Warning: logger.setLevel(SpdLogLevel.Warning); break;
		case LogLevel.Error: logger.setLevel(SpdLogLevel.Error); break;
		case LogLevel.Off: logger.setLevel(SpdLogLevel.Off); break;
		default: throw new Error(`Invalid log level ${level}`);
	}
}

export class SpdLogLogger extends AbstractMessageLogger implements ILogger {

	private buffer: ILog[] = [];
	private readonly _loggerCreationPromise: Promise<void>;
	private _logger: spdlog.Logger | undefined;

	constructor(
		name: string,
		filepath: string,
		rotating: boolean,
		donotUseFormatters: boolean,
		level: LogLevel,
	) {
		super();
		this.setLevel(level);
		this._loggerCreationPromise = this._createSpdLogLogger(name, filepath, rotating, donotUseFormatters);
		this._register(this.onDidChangeLogLevel(level => {
			if (this._logger) {
				setLogLevel(this._logger, level);
			}
		}));
	}

	private async _createSpdLogLogger(name: string, filepath: string, rotating: boolean, donotUseFormatters: boolean): Promise<void> {
		const filecount = rotating ? 6 : 1;
		const filesize = (30 / filecount) * ByteSize.MB;
		const logger = await createSpdLogLogger(name, filepath, filesize, filecount, donotUseFormatters);
		if (logger) {
			this._logger = logger;
			setLogLevel(this._logger, this.getLevel());
			for (const { level, message } of this.buffer) {
				log(this._logger, level, message);
			}
			this.buffer = [];
		}
	}

	protected log(level: LogLevel, message: string): void {
		if (this._logger) {
			log(this._logger, level, message);
		} else if (this.getLevel() <= level) {
			this.buffer.push({ level, message });
		}
	}

	override flush(): void {
		if (this._logger) {
			this._logger.flush();
		} else {
			this._loggerCreationPromise.then(() => this.flush());
		}
	}

	override dispose(): void {
		if (this._logger) {
			this.disposeLogger();
		} else {
			this._loggerCreationPromise.then(() => this.disposeLogger());
		}
		super.dispose();
	}

	private disposeLogger(): void {
		if (this._logger) {
			this._logger.drop();
			this._logger = undefined;
		}
	}
}
