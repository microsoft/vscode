/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OutputChannel, window, workspace } from 'vscode';

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


function isString(value: any): value is string {
	return Object.prototype.toString.call(value) === '[object String]';
}

export class Logger {
	private trace: Trace;
	private _output: OutputChannel;

	constructor() {
		this.updateConfiguration();
	}

	public log(message: string, data?: any): void {
		if (this.trace === Trace.Verbose) {
			this.output.appendLine(`[Log - ${(new Date().toLocaleTimeString())}] ${message}`);
			if (data) {
				this.output.appendLine(this.data2String(data));
			}
		}
	}

	public updateConfiguration() {
		this.trace = this.readTrace();
	}

	private get output(): OutputChannel {
		if (!this._output) {
			this._output = window.createOutputChannel('Markdown');
		}
		return this._output;
	}

	private readTrace(): Trace {
		return Trace.fromString(workspace.getConfiguration().get<string>('markdown.trace', 'off'));
	}

	private data2String(data: any): string {
		if (data instanceof Error) {
			if (isString(data.stack)) {
				return data.stack;
			}
			return (data as Error).message;
		}
		if (isString(data)) {
			return data;
		}
		return JSON.stringify(data, undefined, 2);
	}
}