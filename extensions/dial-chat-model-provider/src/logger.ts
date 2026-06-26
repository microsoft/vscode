import * as vscode from 'vscode';

let channel: vscode.LogOutputChannel | undefined;

export function initDialLogger(context: vscode.ExtensionContext): void {
	channel = vscode.window.createOutputChannel('DIAL', { log: true });
	context.subscriptions.push(channel);
}

/** Common ancestor for log arguments — everything except `symbol` and `function`. */
export type LogArg = string | number | bigint | boolean | null | undefined | object;

function formatArg(arg: LogArg): string {
	if (arg instanceof Error) {
		return arg.stack ?? arg.message;
	}
	if (typeof arg === 'object' && arg !== null) {
		try {
			return JSON.stringify(arg);
		} catch {
			return String(arg);
		}
	}
	return String(arg);
}

function append(level: 'INFO' | 'WARN' | 'ERROR', message: string, args: readonly LogArg[]): void {
	if (!channel) {
		return;
	}

	const formattedArgs = args.map(formatArg);

	switch (level) {
		case 'INFO':
			channel.info(message, ...formattedArgs);
			break;
		case 'WARN':
			channel.warn(message, ...formattedArgs);
			break;
		case 'ERROR':
			channel.error(message, ...formattedArgs);
			break;
		default:
			break;
	}
}

export const dialLog = {
	info(message: string, ...args: LogArg[]): void {
		append('INFO', message, args);
	},
	warn(message: string, ...args: LogArg[]): void {
		append('WARN', message, args);
	},
	error(message: string, ...args: LogArg[]): void {
		append('ERROR', message, args);
	},
};
