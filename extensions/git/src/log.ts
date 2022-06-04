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

	private _currentLogLevel!: LogLevel;
	get currentLogLevel(): LogLevel {
		return this._currentLogLevel;
	}
	set currentLogLevel(value: LogLevel) {
		if (this._currentLogLevel === value) {
			return;
		}

		this._currentLogLevel = value;
		this._onDidChangeLogLevel.fire(value);

		this.log(localize('gitLogLevel', "Log level: {0}", LogLevel[value]));
	}

	private _defaultLogLevel!: LogLevel;
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

		this._disposables.push(workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('git.logLevel')) {
				this.onLogLevelChange();
			}
		}));
		this.onLogLevelChange();
	}

	private onLogLevelChange(): void {
		const config = workspace.getConfiguration('git');
		const logLevel: keyof typeof LogLevel = config.get('logLevel', 'Info');
		this.currentLogLevel = this._defaultLogLevel = LogLevel[logLevel] ?? LogLevel.Info;
	}

	log(message: string, logLevel?: LogLevel): void {
		if (logLevel && logLevel < this._currentLogLevel) {
			return;
		}

		this._outputChannel.appendLine(`[${new Date().toISOString()}]${logLevel ? ` [${LogLevel[logLevel].toLowerCase()}]` : ''} ${message}`);
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

	showOutputChannel(): void {
		this._outputChannel.show();
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}
}
