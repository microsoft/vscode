/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../base/browser/window.js';
import { relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { AdapterLogger, DEFAULT_LOG_LEVEL, ILogger, LogLevel } from '../common/log.js';

export interface IAutomatedWindow {
	codeAutomationLog(type: string, args: any[]): void;
	codeAutomationExit(code: number, logs: Array<ILogFile>): void;
}

export interface ILogFile {
	readonly relativePath: string;
	readonly contents: string;
}

/**
 * Only used in browser contexts where the log files are not stored on disk
 * but in IndexedDB. A method to get all logs with their contents so that
 * CI automation can persist them.
 */
export async function getLogs(fileService: IFileService, environmentService: IEnvironmentService): Promise<ILogFile[]> {
	const result: ILogFile[] = [];

	await doGetLogs(fileService, result, environmentService.logsHome, environmentService.logsHome);

	return result;
}

async function doGetLogs(fileService: IFileService, logs: ILogFile[], curFolder: URI, logsHome: URI): Promise<void> {
	const stat = await fileService.resolve(curFolder);

	for (const { resource, isDirectory } of stat.children || []) {
		if (isDirectory) {
			await doGetLogs(fileService, logs, resource, logsHome);
		} else {
			const contents = (await fileService.readFile(resource)).value.toString();
			if (contents) {
				const path = relativePath(logsHome, resource);
				if (path) {
					logs.push({ relativePath: path, contents });
				}
			}
		}
	}
}

function logLevelToString(level: LogLevel): string {
	switch (level) {
		case LogLevel.Trace: return 'trace';
		case LogLevel.Debug: return 'debug';
		case LogLevel.Info: return 'info';
		case LogLevel.Warning: return 'warn';
		case LogLevel.Error: return 'error';
	}
	return 'info';
}

/**
 * A logger that is used when VSCode is running in the web with
 * an automation such as playwright. We expect a global codeAutomationLog
 * to be defined that we can use to log to.
 */
export class ConsoleLogInAutomationLogger extends AdapterLogger implements ILogger {

	declare codeAutomationLog: any;

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super({ log: (level, args) => this.consoleLog(logLevelToString(level), args) }, logLevel);
	}

	private consoleLog(type: string, args: any[]): void {
		const automatedWindow = mainWindow as unknown as IAutomatedWindow;
		if (typeof automatedWindow.codeAutomationLog === 'function') {
			try {
				automatedWindow.codeAutomationLog(type, args);
			} catch (err) {
				// see https://github.com/microsoft/vscode-test-web/issues/69
				console.error('Problems writing to codeAutomationLog', err);
			}
		}
	}
}
