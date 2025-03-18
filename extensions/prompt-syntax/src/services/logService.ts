/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vscode-jsonrpc';
import { ExtensionContext, LogLevel, type LogOutputChannel, window } from 'vscode';

import { ILogService } from './types';
import { ObservableDisposable } from '../utils/vscode';

/**
 * TODO: @legomushroom
 */
export class LogService extends ObservableDisposable implements ILogService {
	private readonly channel: LogOutputChannel;

	constructor(context: ExtensionContext) {
		super();
		context.subscriptions.push(this);

		this.channel = this._register(window.createOutputChannel('Prompt Syntax', { log: true }));
	}

	public get onDidChangeLogLevel(): Event<LogLevel> {
		return this.channel.onDidChangeLogLevel;
	}

	/**
	 * TODO: @legomushroom
	 */
	getLevel(): LogLevel {
		return this.channel.logLevel;
	}

	trace(message: string, ...args: any[]): void {
		this.channel.trace(message, ...args);
	}
	debug(message: string, ...args: any[]): void {
		this.channel.debug(message, ...args);
	}
	info(message: string, ...args: any[]): void {
		this.channel.info(message, ...args);
	}
	warn(message: string, ...args: any[]): void {
		this.channel.warn(message, ...args);
	}
	error(message: string | Error, ...args: any[]): void {
		this.channel.error(message, ...args);
	}
}
