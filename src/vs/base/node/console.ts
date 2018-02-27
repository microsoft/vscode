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

	// Parse a source information out of the stack if we have one. Format can be:
	// at vscode.commands.registerCommand (/Users/someone/Desktop/test-ts/out/src/extension.js:18:17)
	// or
	// at /Users/someone/Desktop/test-ts/out/src/extension.js:18:17
	// or
	// at c:\Users\someone\Desktop\end-js\extension.js:19:17
	// or
	// at e.$executeContributedCommand(c:\Users\someone\Desktop\end-js\extension.js:19:17)
	const stack = arg0;
	if (stack) {
		const topFrame = findFirstFrame(stack);

		// at [^\/]* => line starts with "at" followed by any character except '/' (to not capture unix paths too late)
		// (?:(?:[a-zA-Z]+:)|(?:[\/])|(?:\\\\) => windows drive letter OR unix root OR unc root
		// (?:.+) => simple pattern for the path, only works because of the line/col pattern after
		// :(?:\d+):(?:\d+) => :line:column data
		const matches = /at [^\/]*((?:(?:[a-zA-Z]+:)|(?:[\/])|(?:\\\\))(?:.+)):(\d+):(\d+)/.exec(topFrame);
		if (matches && matches.length === 4) {
			return {
				uri: URI.file(matches[1]),
				line: Number(matches[2]),
				column: Number(matches[3])
			} as IStackFrame;
		}
	}

	return void 0;
}

const IGNORED_FRAMES = [

	// this module patches console.log aggressively, (e.g. at Console.originalConsole.(anonymous function)
	// [as log] (/Users/bpasero/Development/Microsoft/monaco/extensions/git/node_modules/diagnostic-channel-publishers/dist/src/console.pub.js:42:39))
	'diagnostic-channel-publishers'
];

function findFirstFrame(stack: string): string {
	if (!stack) {
		return stack;
	}

	let newlineIndex = stack.indexOf('\n');
	if (newlineIndex === -1) {
		return stack;
	}

	let candidate = stack.substring(0, newlineIndex);
	if (IGNORED_FRAMES.some(frame => candidate.indexOf(frame) >= 0)) {
		return findFirstFrame(stack.substr(newlineIndex + 1));
	}

	return candidate;
}

export function log(entry: IRemoteConsoleLog, label: string): void {
	const { args, stack } = parse(entry);

	const isOneStringArg = typeof args[0] === 'string' && args.length === 1;

	let topFrame = findFirstFrame(stack);
	if (topFrame) {
		topFrame = `(${topFrame.trim()})`;
	}

	let consoleArgs = [];

	// First arg is a string
	if (typeof args[0] === 'string') {
		if (topFrame && isOneStringArg) {
			consoleArgs = [`%c[${label}] %c${args[0]} %c${topFrame}`, color('blue'), color('black'), color('grey')];
		} else {
			consoleArgs = [`%c[${label}] %c${args[0]}`, color('blue'), color('black'), ...args.slice(1)];
		}
	}

	// First arg is something else, just apply all
	else {
		consoleArgs = [`%c[${label}]%`, color('blue'), ...args];
	}

	// Stack: add to args unless already aded
	if (topFrame && !isOneStringArg) {
		consoleArgs.push(topFrame);
	}

	// Log it
	console[entry.severity].apply(console, consoleArgs);
}

function color(color: string): string {
	return `color: ${color}`;
}