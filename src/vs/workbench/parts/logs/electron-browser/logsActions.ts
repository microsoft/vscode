/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import * as paths from 'vs/base/common/paths';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { TPromise } from 'vs/base/common/winjs.base';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { ILogService, LogLevel, DEFAULT_LOG_LEVEL } from 'vs/platform/log/common/log';
import { IOutputService, COMMAND_OPEN_LOG_VIEWER } from 'vs/workbench/parts/output/common/output';
import * as Constants from 'vs/workbench/parts/logs/common/logConstants';
import { ICommandService } from 'vs/platform/commands/common/commands';
import URI from 'vs/base/common/uri';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export class OpenLogsFolderAction extends Action {

	static ID = 'workbench.action.openLogsFolder';
	static LABEL = nls.localize('openLogsFolder', "Open Logs Folder");

	constructor(id: string, label: string,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowsService private windowsService: IWindowsService,
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		return this.windowsService.showItemInFolder(paths.join(this.environmentService.logsPath, 'main.log'));
	}
}

export class ShowLogsAction extends Action {

	static ID = 'workbench.action.showLogs';
	static LABEL = nls.localize('showLogs', "Show Logs...");

	constructor(id: string, label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IOutputService private outputService: IOutputService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		const entries: IPickOpenEntry[] = [
			{ id: Constants.rendererLogChannelId, label: this.contextService.getWorkspace().name ? nls.localize('rendererProcess', "Window ({0})", this.contextService.getWorkspace().name) : nls.localize('emptyWindow', "Window") },
			{ id: Constants.extHostLogChannelId, label: nls.localize('extensionHost', "Extension Host") },
			{ id: Constants.sharedLogChannelId, label: nls.localize('sharedProcess', "Shared") },
			{ id: Constants.mainLogChannelId, label: nls.localize('mainProcess', "Main") }
		];

		return this.quickOpenService.pick(entries, { placeHolder: nls.localize('selectProcess', "Select Log for Process") })
			.then(entry => {
				if (entry) {
					return this.outputService.showChannel(entry.id);
				}
				return null;
			});
	}
}

export class OpenLogFileAction extends Action {

	static ID = 'workbench.action.openLogFile';
	static LABEL = nls.localize('openLogFile', "Open Log File...");

	constructor(id: string, label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ICommandService private commandService: ICommandService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		const entries: IPickOpenEntry[] = [
			{ id: URI.file(paths.join(this.environmentService.logsPath, `renderer${this.windowService.getCurrentWindowId()}.log`)).fsPath, label: this.contextService.getWorkspace().name ? nls.localize('rendererProcess', "Window ({0})", this.contextService.getWorkspace().name) : nls.localize('emptyWindow', "Window") },
			{ id: URI.file(paths.join(this.environmentService.logsPath, `extHost${this.windowService.getCurrentWindowId()}.log`)).fsPath, label: nls.localize('extensionHost', "Extension Host") },
			{ id: URI.file(paths.join(this.environmentService.logsPath, `sharedprocess.log`)).fsPath, label: nls.localize('sharedProcess', "Shared") },
			{ id: URI.file(paths.join(this.environmentService.logsPath, `main.log`)).fsPath, label: nls.localize('mainProcess', "Main") }
		];

		return this.quickOpenService.pick(entries, { placeHolder: nls.localize('selectProcess', "Select Log for Process") })
			.then(entry => {
				if (entry) {
					return this.commandService.executeCommand(COMMAND_OPEN_LOG_VIEWER, URI.file(entry.id));
				}
				return null;
			});
	}
}

export class SetLogLevelAction extends Action {

	static ID = 'workbench.action.setLogLevel';
	static LABEL = nls.localize('setLogLevel', "Set Log Level...");

	constructor(id: string, label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@ILogService private logService: ILogService
	) {
		super(id, label);
	}

	run(): TPromise<void> {
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

		return this.quickOpenService.pick(entries, { placeHolder: nls.localize('selectLogLevel', "Select log level"), autoFocus: { autoFocusIndex: this.logService.getLevel() } }).then(entry => {
			if (entry) {
				this.logService.setLevel(entry.level);
			}
		});
	}

	private getDescription(level: LogLevel, current: LogLevel): string {
		if (DEFAULT_LOG_LEVEL === level && current === level) {
			return nls.localize('default and current', "Default & Current");
		}
		if (DEFAULT_LOG_LEVEL === level) {
			return nls.localize('default', "Default");
		}
		if (current === level) {
			return nls.localize('current', "Current");
		}
		return void 0;
	}
}