/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import * as paths from 'vs/base/common/paths';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ILogService, LogLevel, DEFAULT_LOG_LEVEL } from 'vs/platform/log/common/log';
import { IQuickInputService } from 'vs/platform/quickinput/common/quickInput';

export class OpenLogsFolderAction extends Action {

	static ID = 'workbench.action.openLogsFolder';
	static LABEL = nls.localize('openLogsFolder', "Open Logs Folder");

	constructor(id: string, label: string,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IWindowsService private readonly windowsService: IWindowsService,
	) {
		super(id, label);
	}

	run(): Promise<void> {
		return this.windowsService.showItemInFolder(paths.join(this.environmentService.logsPath, 'main.log'));
	}
}

export class SetLogLevelAction extends Action {

	static ID = 'workbench.action.setLogLevel';
	static LABEL = nls.localize('setLogLevel', "Set Log Level...");

	constructor(id: string, label: string,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@ILogService private readonly logService: ILogService
	) {
		super(id, label);
	}

	run(): Promise<void> {
		const current = this.logService.getLevel();
		const entries = [
			{ label: nls.localize('trace', "Trace"), level: LogLevel.Trace, description: this.getDescription(LogLevel.Trace, current) },
			{ label: nls.localize('debug', "Debug"), level: LogLevel.Debug, description: this.getDescription(LogLevel.Debug, current) },
			{ label: nls.localize('info', "Info"), level: LogLevel.Info, description: this.getDescription(LogLevel.Info, current) },
			{ label: nls.localize('warn', "Warning"), level: LogLevel.Warning, description: this.getDescription(LogLevel.Warning, current) },
			{ label: nls.localize('err', "Error"), level: LogLevel.Error, description: this.getDescription(LogLevel.Error, current) },
			{ label: nls.localize('critical', "Critical"), level: LogLevel.Critical, description: this.getDescription(LogLevel.Critical, current) },
			{ label: nls.localize('off', "Off"), level: LogLevel.Off, description: this.getDescription(LogLevel.Off, current) },
		];

		return this.quickInputService.pick(entries, { placeHolder: nls.localize('selectLogLevel', "Select log level"), activeItem: entries[this.logService.getLevel()] }).then(entry => {
			if (entry) {
				this.logService.setLevel(entry.level);
			}
		});
	}

	private getDescription(level: LogLevel, current: LogLevel): string | undefined {
		if (DEFAULT_LOG_LEVEL === level && current === level) {
			return nls.localize('default and current', "Default & Current");
		}
		if (DEFAULT_LOG_LEVEL === level) {
			return nls.localize('default', "Default");
		}
		if (current === level) {
			return nls.localize('current', "Current");
		}
		return undefined;
	}
}
