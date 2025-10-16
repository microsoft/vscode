/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { ITerminalChatService, ITerminalInstance } from '../../../terminal/browser/terminal.js';

/**
 * Used to manage chat tool invocations and the underlying terminal instances they create/use.
 */
export class TerminalChatService implements ITerminalChatService {
	declare _serviceBrand: undefined;

	private readonly _terminalInstancesByToolSessionId = new Map<string, ITerminalInstance>();
	private readonly _onDidRegisterTerminalInstanceForToolSession = new Emitter<{ terminalToolSessionId: string }>();
	readonly onDidRegisterTerminalInstanceForToolSession: Event<{ terminalToolSessionId: string }> = this._onDidRegisterTerminalInstanceForToolSession.event;

	registerTerminalInstanceForToolSession(terminalToolSessionId: string, instance: ITerminalInstance): void {
		this._terminalInstancesByToolSessionId.set(terminalToolSessionId, instance);
		this._onDidRegisterTerminalInstanceForToolSession.fire({ terminalToolSessionId });
		instance.onDisposed(() => {
			this._terminalInstancesByToolSessionId.delete(terminalToolSessionId);
		});
	}

	getTerminalInstanceByToolSessionId(terminalToolSessionId: string | undefined): ITerminalInstance | undefined {
		if (!terminalToolSessionId) {
			return undefined;
		}
		return this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
	}
}
