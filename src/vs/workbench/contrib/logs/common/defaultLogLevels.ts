/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService, ILoggerService, LogLevel, LogLevelToString, getLogLevel, parseLogLevel } from '../../../../platform/log/common/log.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IJSONEditingService } from '../../../services/configuration/common/jsonEditing.js';
import { isString, isUndefined } from '../../../../base/common/types.js';
import { EXTENSION_IDENTIFIER_WITH_LOG_REGEX } from '../../../../platform/environment/common/environmentService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { parse } from '../../../../base/common/json.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

interface ParsedArgvLogLevels {
	default?: LogLevel;
	extensions?: [string, LogLevel][];
}

export type DefaultLogLevels = Required<Readonly<ParsedArgvLogLevels>>;

export const IDefaultLogLevelsService = createDecorator<IDefaultLogLevelsService>('IDefaultLogLevelsService');

export interface IDefaultLogLevelsService {

	readonly _serviceBrand: undefined;

	/**
	 * An event which fires when default log levels are changed
	 */
	readonly onDidChangeDefaultLogLevels: Event<void>;

	getDefaultLogLevels(): Promise<DefaultLogLevels>;

	getDefaultLogLevel(extensionId?: string): Promise<LogLevel>;

	setDefaultLogLevel(logLevel: LogLevel, extensionId?: string): Promise<void>;
}

class DefaultLogLevelsService extends Disposable implements IDefaultLogLevelsService {

	_serviceBrand: undefined;

	private _onDidChangeDefaultLogLevels = this._register(new Emitter<void>);
	readonly onDidChangeDefaultLogLevels = this._onDidChangeDefaultLogLevels.event;

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IJSONEditingService private readonly jsonEditingService: IJSONEditingService,
		@ILogService private readonly logService: ILogService,
		@ILoggerService private readonly loggerService: ILoggerService,
	) {
		super();
	}

	async getDefaultLogLevels(): Promise<DefaultLogLevels> {
		const argvLogLevel = await this._parseLogLevelsFromArgv();
		return {
			default: argvLogLevel?.default ?? this._getDefaultLogLevelFromEnv(),
			extensions: argvLogLevel?.extensions ?? this._getExtensionsDefaultLogLevelsFromEnv()
		};
	}

	async getDefaultLogLevel(extensionId?: string): Promise<LogLevel> {
		const argvLogLevel = await this._parseLogLevelsFromArgv() ?? {};
		if (extensionId) {
			extensionId = extensionId.toLowerCase();
			return this._getDefaultLogLevel(argvLogLevel, extensionId);
		} else {
			return this._getDefaultLogLevel(argvLogLevel);
		}
	}

	async setDefaultLogLevel(defaultLogLevel: LogLevel, extensionId?: string): Promise<void> {
		const argvLogLevel = await this._parseLogLevelsFromArgv() ?? {};
		if (extensionId) {
			extensionId = extensionId.toLowerCase();
			const currentDefaultLogLevel = this._getDefaultLogLevel(argvLogLevel, extensionId);
			argvLogLevel.extensions = argvLogLevel.extensions ?? [];
			const extension = argvLogLevel.extensions.find(([extension]) => extension === extensionId);
			if (extension) {
				extension[1] = defaultLogLevel;
			} else {
				argvLogLevel.extensions.push([extensionId, defaultLogLevel]);
			}
			await this._writeLogLevelsToArgv(argvLogLevel);
			const extensionLoggers = [...this.loggerService.getRegisteredLoggers()].filter(logger => logger.extensionId && logger.extensionId.toLowerCase() === extensionId);
			for (const { resource } of extensionLoggers) {
				if (this.loggerService.getLogLevel(resource) === currentDefaultLogLevel) {
					this.loggerService.setLogLevel(resource, defaultLogLevel);
				}
			}
		} else {
			const currentLogLevel = this._getDefaultLogLevel(argvLogLevel);
			argvLogLevel.default = defaultLogLevel;
			await this._writeLogLevelsToArgv(argvLogLevel);
			if (this.loggerService.getLogLevel() === currentLogLevel) {
				this.loggerService.setLogLevel(defaultLogLevel);
			}
		}
		this._onDidChangeDefaultLogLevels.fire();
	}

	private _getDefaultLogLevel(argvLogLevels: ParsedArgvLogLevels, extension?: string): LogLevel {
		if (extension) {
			const extensionLogLevel = argvLogLevels.extensions?.find(([extensionId]) => extensionId === extension);
			if (extensionLogLevel) {
				return extensionLogLevel[1];
			}
		}
		return argvLogLevels.default ?? getLogLevel(this.environmentService);
	}

	private async _writeLogLevelsToArgv(logLevels: ParsedArgvLogLevels): Promise<void> {
		const logLevelsValue: string[] = [];
		if (!isUndefined(logLevels.default)) {
			logLevelsValue.push(LogLevelToString(logLevels.default));
		}
		for (const [extension, logLevel] of logLevels.extensions ?? []) {
			logLevelsValue.push(`${extension}=${LogLevelToString(logLevel)}`);
		}
		await this.jsonEditingService.write(this.environmentService.argvResource, [{ path: ['log-level'], value: logLevelsValue.length ? logLevelsValue : undefined }], true);
	}

	private async _parseLogLevelsFromArgv(): Promise<ParsedArgvLogLevels | undefined> {
		const result: ParsedArgvLogLevels = { extensions: [] };
		const logLevels = await this._readLogLevelsFromArgv();
		for (const extensionLogLevel of logLevels) {
			const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(extensionLogLevel);
			if (matches && matches[1] && matches[2]) {
				const logLevel = parseLogLevel(matches[2]);
				if (!isUndefined(logLevel)) {
					result.extensions?.push([matches[1].toLowerCase(), logLevel]);
				}
			} else {
				const logLevel = parseLogLevel(extensionLogLevel);
				if (!isUndefined(logLevel)) {
					result.default = logLevel;
				}
			}
		}
		return !isUndefined(result.default) || result.extensions?.length ? result : undefined;
	}

	private async _readLogLevelsFromArgv(): Promise<string[]> {
		try {
			const content = await this.fileService.readFile(this.environmentService.argvResource);
			const argv: { 'log-level'?: string | string[] } = parse(content.value.toString());
			return isString(argv['log-level']) ? [argv['log-level']] : Array.isArray(argv['log-level']) ? argv['log-level'] : [];
		} catch (error) {
			if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
				this.logService.error(error);
			}
		}
		return [];
	}

	private _getDefaultLogLevelFromEnv(): LogLevel {
		return getLogLevel(this.environmentService);
	}

	private _getExtensionsDefaultLogLevelsFromEnv(): [string, LogLevel][] {
		const result: [string, LogLevel][] = [];
		for (const [extension, logLevelValue] of this.environmentService.extensionLogLevel ?? []) {
			const logLevel = parseLogLevel(logLevelValue);
			if (!isUndefined(logLevel)) {
				result.push([extension, logLevel]);
			}
		}
		return result;
	}
}

registerSingleton(IDefaultLogLevelsService, DefaultLogLevelsService, InstantiationType.Delayed);
