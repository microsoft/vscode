/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
// eslint-disable-next-line local/code-translation-remind -- Experimental entry is excluded from production translation resources.
import { localize } from '../../../../nls.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { AgentHostOutputChannel } from '../../../../workbench/contrib/terminal/browser/agentHostOutputChannel.js';
import { ITerminalChatService, ITerminalInstance } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { IAgentHostEntry, IAgentHostTerminalCreateOptions, IAgentHostTerminalProfileInfo, IAgentHostTerminalService } from '../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js';

/**
 * Phone implementation of {@link IAgentHostTerminalService}.
 *
 * The phone does not create agent-host terminals. The shared remote-agent-host chat
 * contribution nevertheless requires this service to reconnect terminals when a
 * host reconnects, so the phone provides an implementation that owns no
 * terminals: reconnection reports nothing to recover, and creating or reviving
 * a terminal is rejected with a user-facing message.
 *
 * Watching what an agent runs is a different matter: the chat transcript
 * renders a command's output as a read-only card fed by an output source, which
 * is a plain stream over the host connection and needs no terminal. The phone
 * keeps that path so a user following along can see the output of commands,
 * even though they cannot type into a shell.
 */
export class MobileNullAgentHostTerminalService extends Disposable implements IAgentHostTerminalService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
	) {
		super();
	}

	readonly profiles: IObservable<readonly IAgentHostTerminalProfileInfo[]> = constObservable([]);

	getProfileForConnection(_address: string): IAgentHostTerminalProfileInfo | undefined {
		return undefined;
	}

	registerEntry(_entry: IAgentHostEntry): IDisposable {
		return Disposable.None;
	}

	createTerminal(_connection: IAgentConnection, _options?: IAgentHostTerminalCreateOptions): Promise<ITerminalInstance> {
		return Promise.reject(new Error(localize('mobile.terminalUnavailable', "Terminals are not available on this device.")));
	}

	createTerminalForEntry(_address: string, _options?: IAgentHostTerminalCreateOptions): Promise<ITerminalInstance | undefined> {
		return Promise.resolve(undefined);
	}

	reconnectTerminals(_newConnection: IAgentConnection, _oldClientId: string): Promise<{ recovered: number; total: number }> {
		return Promise.resolve({ recovered: 0, total: 0 });
	}

	reviveTerminal(_connection: IAgentConnection, _terminalUri: URI, _terminalToolSessionId: string): Promise<ITerminalInstance> {
		return Promise.reject(new Error(localize('mobile.terminalUnavailable', "Terminals are not available on this device.")));
	}

	attachOutputTerminal(connection: IAgentConnection, terminalUri: URI, terminalToolSessionId: string): IDisposable {
		const store = new DisposableStore();
		const source = store.add(new AgentHostOutputChannel(connection, terminalUri));
		store.add(this._terminalChatService.registerOutputSource(terminalToolSessionId, source));
		return store;
	}

	setDefaultCwd(_cwd: URI | undefined): void { }

	getAgentHostAddress(_instance: ITerminalInstance): string | undefined {
		return undefined;
	}

	isCommandExecuting(_instance: ITerminalInstance): boolean | undefined {
		return undefined;
	}

	markCommandPending(_instance: ITerminalInstance): void { }

	getCwd(_instance: ITerminalInstance): { readonly initial: string; readonly current: string } | undefined {
		return undefined;
	}
}
