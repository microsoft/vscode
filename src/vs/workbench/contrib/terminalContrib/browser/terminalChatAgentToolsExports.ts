/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ITerminalInstance } from '../../terminal/browser/terminal.js';
import { Emitter, Event } from '../../../../base/common/event.js';

// Local registry used as a bridge between the run-in-terminal tool implementation
// and chat UI components
const terminalInstancesByToolSessionId = new Map<string, ITerminalInstance>();
const onDidRegisterTerminalInstanceForToolSessionEmitter = new Emitter<{ terminalToolSessionId: string }>();
export const onDidRegisterTerminalInstanceForToolSession: Event<{ terminalToolSessionId: string }> = onDidRegisterTerminalInstanceForToolSessionEmitter.event;

export function registerTerminalInstanceForToolSession(terminalToolSessionId: string, instance: ITerminalInstance): void {
	terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
	onDidRegisterTerminalInstanceForToolSessionEmitter.fire({ terminalToolSessionId });
	instance.onDisposed(() => {
		terminalInstancesByToolSessionId.delete(terminalToolSessionId);
	});
}

export function getTerminalInstanceByToolSessionId(terminalToolSessionId: string | undefined): ITerminalInstance | undefined {
	if (!terminalToolSessionId) {
		return undefined;
	}
	return terminalInstancesByToolSessionId.get(terminalToolSessionId);
}
