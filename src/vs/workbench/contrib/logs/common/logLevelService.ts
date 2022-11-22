/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILoggerService, LogLevel } from 'vs/platform/log/common/log';
import { Emitter, Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Disposable } from 'vs/base/common/lifecycle';
import { IOutputService } from 'vs/workbench/services/output/common/output';

export const ILogLevelService = createDecorator<ILogLevelService>('ILogLevelService');
export interface ILogLevelService {
	readonly _serviceBrand: undefined;
	readonly onDidChangeLogLevel: Event<{ readonly id: string; logLevel: LogLevel }>;
	setLogLevel(id: string, logLevel: LogLevel): void;
	getLogLevel(id: string): LogLevel | undefined;
}

export class LogLevelService extends Disposable implements ILogLevelService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeLogLevel = this._register(new Emitter<{ readonly id: string; logLevel: LogLevel }>());
	readonly onDidChangeLogLevel = this._onDidChangeLogLevel.event;

	private readonly logLevels = new Map<string, LogLevel>();

	constructor(
		@IOutputService protected readonly outputService: IOutputService,
		@ILoggerService private readonly loggerService: ILoggerService
	) {
		super();
	}

	getLogLevel(id: string): LogLevel | undefined {
		return this.logLevels.get(id);
	}

	setLogLevel(id: string, logLevel: LogLevel): boolean {
		if (this.getLogLevel(id) === logLevel) {
			return false;
		}

		this.logLevels.set(id, logLevel);
		const channel = this.outputService.getChannelDescriptor(id);
		const resource = channel?.log ? channel.file : undefined;
		if (resource) {
			this.loggerService.setLevel(resource, logLevel);
		}
		this._onDidChangeLogLevel.fire({ id, logLevel });
		return true;
	}

}

