/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { AdapterLogger, DEFAULT_LOG_LEVEL, ILogger, LogLevel } from 'vs/platform/log/common/log';

export interface IAutomatedWindow {
	codeAutomationLog(type: string, args: any[]): void;
	codeAutomationExit(logs: Array<ILogFile>, code: number): void;
}

export interface ILogFile {
	readonly name: string;
	readonly contents: string;
}

/**
 * Only used in browser contexts where the log files are not stored on disk
 * but in IndexedDB. A method to get all logs with their contents so that
 * CI automation can persist them.
 */
export async function getLogs(fileService: IFileService, environmentService: IEnvironmentService): Promise<ILogFile[]> {
	const result: ILogFile[] = [];

	const logs = await fileService.resolve(environmentService.logsHome);

	for (const { name, isDirectory, resource } of logs.children || []) {
		if (isDirectory) {
			continue;
		}

		const contents = (await fileService.readFile(resource)).value.toString();
		if (contents) {
			result.push({ name, contents });
		}
	}

	return result;
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
		const automatedWindow = window as unknown as IAutomatedWindow;
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
