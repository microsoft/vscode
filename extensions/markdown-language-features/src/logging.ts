/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Disposable } from './util/dispose';

enum Trace {
	Off,
	Verbose
}

namespace Trace {
	export function fromString(value: string): Trace {
		value = value.toLowerCase();
		switch (value) {
			case 'off':
				return Trace.Off;
			case 'verbose':
				return Trace.Verbose;
			default:
				return Trace.Off;
		}
	}
}

export interface ILogger {
	verbose(title: string, message: string, data?: any): void;
}

export class VsCodeOutputLogger extends Disposable implements ILogger {
	private trace?: Trace;

	private _outputChannel?: vscode.OutputChannel;

	private get outputChannel() {
		this._outputChannel ??= this._register(vscode.window.createOutputChannel('Markdown'));
		return this._outputChannel;
	}

	constructor() {
		super();

		this._register(vscode.workspace.onDidChangeConfiguration(() => {
			this.updateConfiguration();
		}));

		this.updateConfiguration();
	}

	public verbose(title: string, message: string, data?: any): void {
		if (this.trace === Trace.Verbose) {
			this.appendLine(`[Verbose ${this.now()}] ${title}: ${message}`);
			if (data) {
				this.appendLine(VsCodeOutputLogger.data2String(data));
			}
		}
	}

	private now(): string {
		const now = new Date();
		return String(now.getUTCHours()).padStart(2, '0')
			+ ':' + String(now.getMinutes()).padStart(2, '0')
			+ ':' + String(now.getUTCSeconds()).padStart(2, '0') + '.' + String(now.getMilliseconds()).padStart(3, '0');
	}

	private updateConfiguration(): void {
		this.trace = this.readTrace();
	}

	private appendLine(value: string): void {
		this.outputChannel.appendLine(value);
	}

	private readTrace(): Trace {
		return Trace.fromString(vscode.workspace.getConfiguration().get<string>('markdown.trace.extension', 'off'));
	}

	private static data2String(data: any): string {
		if (data instanceof Error) {
			if (typeof data.stack === 'string') {
				return data.stack;
			}
			return data.message;
		}
		if (typeof data === 'string') {
			return data;
		}
		return JSON.stringify(data, undefined, 2);
	}
}
