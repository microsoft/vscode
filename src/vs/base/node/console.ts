/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';

export interface IRemoteConsoleLog {
	type: string;
	severity: string;
	arguments: string;
}

interface IStackArgument {
	__$stack: string;
}

export interface IStackFrame {
	uri: URI;
	line: number;
	column: number;
}

export function isRemoteConsoleLog(obj: any): obj is IRemoteConsoleLog {
	const entry = obj as IRemoteConsoleLog;

	return entry && typeof entry.type === 'string' && typeof entry.severity === 'string';
}

export function parse(entry: IRemoteConsoleLog): { args: any[], stack?: string } {
	const args: any[] = [];
	let stack: string;

	// Parse Entry
	try {
		const parsedArguments: any[] = JSON.parse(entry.arguments);

		// Check for special stack entry as last entry
		const stackArgument = parsedArguments[parsedArguments.length - 1] as IStackArgument;
		if (stackArgument && stackArgument.__$stack) {
			parsedArguments.pop(); // stack is handled specially
			stack = stackArgument.__$stack;
		}

		args.push(...parsedArguments);
	} catch (error) {
		args.push('Unable to log remote console arguments', entry.arguments);
	}

	return { args, stack };
}

export function getFirstFrame(entry: IRemoteConsoleLog): IStackFrame;
export function getFirstFrame(stack: string): IStackFrame;
export function getFirstFrame(arg0: IRemoteConsoleLog | string): IStackFrame {
	if (typeof arg0 !== 'string') {
		return getFirstFrame(parse(arg0).stack);
	}

	// Parse a source information out of the stack if we have one. Format:
	// at vscode.commands.registerCommand (/Users/someone/Desktop/test-ts/out/src/extension.js:18:17)
	const stack = arg0;
	if (stack) {
		const matches = /.+\((.+):(\d+):(\d+)\)/.exec(stack);
		if (matches.length === 4) {
			return {
				uri: URI.file(matches[1]),
				line: Number(matches[2]),
				column: Number(matches[3])
			} as IStackFrame;
		}
	}

	return void 0;
}

export function log(entry: IRemoteConsoleLog, label: string): void {
	const { args, stack } = parse(entry);

	// Determine suffix based on severity of log entry if we have a stack
	let suffixColor = 'blue';
	let suffix = '';
	if (stack) {
		switch (entry.severity) {
			case 'warn':
				suffixColor = 'goldenrod';
				suffix = ' WARNING:';
				break;
			case 'error':
				suffixColor = 'darkred';
				suffix = ' ERROR:';
				break;
		}
	}

	let consoleArgs = [];

	// First arg is a string
	if (typeof args[0] === 'string') {
		consoleArgs = [`%c[${label}]%c${suffix} %c${args[0]}`, color('blue'), color(suffixColor), color('black'), ...args.slice(1)];
	}

	// First arg is something else, just apply all
	else {
		consoleArgs = [`%c[${label}]%c${suffix}`, color('blue'), color(suffixColor), ...args];
	}

	// Stack: use console group
	if (stack) {
		console.groupCollapsed.apply(console, consoleArgs);
		console.log(stack);
		console.groupEnd();
	}

	// No stack: just log message
	else {
		console[entry.severity].apply(console, consoleArgs);
	}
}

function color(color: string): string {
	return `color: ${color}; font-weight: normal;`;
}