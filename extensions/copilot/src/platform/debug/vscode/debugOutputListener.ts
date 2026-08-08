/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DebugAdapterTracker, DebugAdapterTrackerFactory, DebugSession, Disposable, ProviderResult, debug } from 'vscode';

const debugOutput: string[] = [];

export function getMostRecentDebugOutput(): string {
	return debugOutput.join('\n');
}

function appendLimitedWindow(target: string[], data: string) {
	target.push(removeAnsiEscapeCodes(data));
	if (target.length > 40) {
		// 40 lines should capture ~twice the visible area
		target.shift();
	}
}

class DebugSessionTracker implements DebugAdapterTracker {
	constructor(private readonly session: DebugSession) { }
	public onWillStartSession() { }

	public onWillReceiveMessage(message: any) { }

	public onDidSendMessage(message: any) {
		if (debug.activeDebugSession !== this.session) {
			return;
		}
		const output = this.extractOutput(message);
		if (output) {
			appendLimitedWindow(debugOutput, output);
		}
	}

	private extractOutput(message: any) {
		if (message.event === 'output' && (message.body.category === 'stdout' || message.body.category === 'stderr')) {
			return message.body.output as string;
		}
		return undefined;
	}

	public onWillStopSession() { }

	public onError(error: Error) { }

	public onExit(code: number | undefined, signal: string | undefined) { }
}

// taken from https://github.com/microsoft/vscode/blob/499fb52ae8c985485e6503669f3711ee0d6f31dc/src/vs/base/common/strings.ts#L731
function removeAnsiEscapeCodes(str: string): string {
	const CSI_SEQUENCE = /(:?\x1b\[|\x9B)[=?>!]?[\d;:]*["$#'* ]?[a-zA-Z@^`{}|~]/g;
	if (str) {
		str = str.replace(CSI_SEQUENCE, '');
	}
	return str;
}

export function installDebugOutputListeners(): Disposable[] {
	const debugAdapter = debug.registerDebugAdapterTrackerFactory('*', new DebugSessionLoggingFactory());
	return [debugAdapter];
}

export class DebugSessionLoggingFactory implements DebugAdapterTrackerFactory {
	public createDebugAdapterTracker(session: DebugSession): ProviderResult<DebugAdapterTracker> {
		return new DebugSessionTracker(session);
	}
}
