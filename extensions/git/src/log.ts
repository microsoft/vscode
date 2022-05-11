/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { commands, Disposable, Event, EventEmitter, OutputChannel, window, workspace } from 'vscode';
import { dispose } from './util';

/**
 * The severity level of a log message
 */
export enum LogLevel {
	Trace = 1,
	Debug = 2,
	Info = 3,
	Warning = 4,
	Error = 5,
	Critical = 6,
	Off = 7
}

/**
 * Output channel logger
 */
export class OutputChannelLogger {

	private _onDidChangeLogLevel = new EventEmitter<LogLevel>();
	readonly onDidChangeLogLevel: Event<LogLevel> = this._onDidChangeLogLevel.event;

	private _currentLogLevel: LogLevel;
	get currentLogLevel(): LogLevel {
		return this._currentLogLevel;
	}

	private _defaultLogLevel: LogLevel;
	get defaultLogLevel(): LogLevel {
		return this._defaultLogLevel;
	}

	private _outputChannel: OutputChannel;
	private _disposables: Disposable[] = [];

	constructor() {
		// Output channel
		this._outputChannel = window.createOutputChannel('Git');
		commands.registerCommand('git.showOutput', () => this.showOutputChannel());
		this._disposables.push(this._outputChannel);

		// Initialize log level
		const config = workspace.getConfiguration('git');
		const logLevel: keyof typeof LogLevel = config.get('logLevel', 'Info');
		this._currentLogLevel = this._defaultLogLevel = LogLevel[logLevel] ?? LogLevel.Info;

		this.logInfo(localize('gitLogLevel', "Log level: {0}", LogLevel[this._currentLogLevel]));
	}

	private log(message: string, logLevel: LogLevel): void {
		if (logLevel < this._currentLogLevel) {
			return;
		}

		this._outputChannel.appendLine(`[${new Date().toISOString()}] [${LogLevel[logLevel].toLowerCase()}] ${message}`);
	}

	logCritical(message: string): void {
		this.log(message, LogLevel.Critical);
	}

	logDebug(message: string): void {
		this.log(message, LogLevel.Debug);
	}

	logError(message: string): void {
		this.log(message, LogLevel.Error);
	}

	logInfo(message: string): void {
		this.log(message, LogLevel.Info);
	}

	logTrace(message: string): void {
		this.log(message, LogLevel.Trace);
	}

	logWarning(message: string): void {
		this.log(message, LogLevel.Warning);
	}

	logGitCommand(command: string): void {
		this._outputChannel.appendLine(`[${new Date().toISOString()}] ${command}`);
	}

	setLogLevel(logLevel: LogLevel): void {
		if (this._currentLogLevel === logLevel) {
			return;
		}

		this._currentLogLevel = logLevel;
		this._onDidChangeLogLevel.fire(logLevel);

		this.logInfo(localize('changed', "Log level changed to: {0}", LogLevel[logLevel]));
	}

	showOutputChannel(): void {
		this._outputChannel.show();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}
}
