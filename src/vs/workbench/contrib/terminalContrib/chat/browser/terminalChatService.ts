/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ITerminalChatService, ITerminalInstance, ITerminalService } from '../../../terminal/browser/terminal.js';

/**
 * Used to manage chat tool invocations and the underlying terminal instances they create/use.
 */
export class TerminalChatService extends Disposable implements ITerminalChatService {
	declare _serviceBrand: undefined;

	private readonly _terminalInstancesByToolSessionId = new Map<string, ITerminalInstance>();
	private readonly _onDidRegisterTerminalInstanceForToolSession = new Emitter<{ terminalToolSessionId: string }>();
	readonly onDidRegisterTerminalInstanceForToolSession: Event<{ terminalToolSessionId: string }> = this._onDidRegisterTerminalInstanceForToolSession.event;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();
	}

	registerTerminalInstanceForToolSession(terminalToolSessionId: string | undefined, instance: ITerminalInstance): void {
		if (!terminalToolSessionId) {
			this._logService.warn('Attempted to register a terminal instance with an undefined tool session ID');
			return;
		}
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

	terminalIsHidden(terminalToolSessionId: string): boolean {
		const instance = this._terminalInstancesByToolSessionId.get(terminalToolSessionId);
		if (!instance) {
			return false;
		}
		return this._terminalService.instances.includes(instance) && !this._terminalService.foregroundInstances.includes(instance);
	}
}
