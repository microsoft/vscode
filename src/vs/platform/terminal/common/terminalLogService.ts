/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { localize } from '../../../nls.js';
import { ILogger, ILoggerService, LogLevel } from '../../log/common/log.js';
import { ITerminalLogService } from './terminal.js';
import { IWorkspaceContextService } from '../../workspace/common/workspace.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { joinPath } from '../../../base/common/resources.js';

export class TerminalLogService extends Disposable implements ITerminalLogService {
	declare _serviceBrand: undefined;
	declare _logBrand: undefined;

	private readonly _logger: ILogger;

	private _workspaceId!: string;

	get onDidChangeLogLevel(): Event<LogLevel> { return this._logger.onDidChangeLogLevel; }

	constructor(
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
	) {
		super();
		this._logger = this._loggerService.createLogger(joinPath(environmentService.logsHome, 'terminal.log'), { id: 'terminal', name: localize('terminalLoggerName', 'Terminal') });
		this._register(Event.runAndSubscribe(workspaceContextService.onDidChangeWorkspaceFolders, () => {
			this._workspaceId = workspaceContextService.getWorkspace().id.substring(0, 7);
		}));
	}

	getLevel(): LogLevel { return this._logger.getLevel(); }
	setLevel(level: LogLevel): void { this._logger.setLevel(level); }
	flush(): void { this._logger.flush(); }

	trace(message: string, ...args: unknown[]): void { this._logger.trace(this._formatMessage(message), args); }
	debug(message: string, ...args: unknown[]): void { this._logger.debug(this._formatMessage(message), args); }
	info(message: string, ...args: unknown[]): void { this._logger.info(this._formatMessage(message), args); }
	warn(message: string, ...args: unknown[]): void { this._logger.warn(this._formatMessage(message), args); }
	error(message: string | Error, ...args: unknown[]): void {
		if (message instanceof Error) {
			this._logger.error(this._formatMessage(''), message, args);
			return;
		}
		this._logger.error(this._formatMessage(message), args);
	}

	private _formatMessage(message: string): string {
		if (this._logger.getLevel() === LogLevel.Trace) {
			return `[${this._workspaceId}] ${message}`;
		}
		return message;
	}
}
