/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import type { TerminalState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import type { IChatTerminalOutputSource } from './terminal.js';

/**
 * Read-only view of an AHP output channel. Unlike {@link AgentHostPty}, this
 * does not create a terminal process or an {@code ITerminalInstance}; chat
 * renders the accumulated plain-text state in its own detached xterm.
 */
export class AgentHostOutputChannel extends Disposable implements IChatTerminalOutputSource {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _output = '';
	get output(): string { return this._output; }

	private _exitCode: number | undefined;
	get exitCode(): number | undefined { return this._exitCode; }

	constructor(connection: IAgentConnection, terminalUri: URI) {
		super();
		const subscriptionRef = this._register(connection.getSubscription(StateComponents.Terminal, terminalUri, 'AgentHostOutputChannel'));
		const subscription = subscriptionRef.object;
		if (subscription.value && !(subscription.value instanceof Error)) {
			this._acceptState(subscription.value);
		}
		this._register(subscription.onDidChange(state => this._acceptState(state)));
	}

	private _acceptState(state: TerminalState): void {
		this._output = state.content
			.map(part => part.type === 'command' ? part.output : part.value)
			.join('')
			.replace(/\r?\n/g, '\r\n');
		this._exitCode = state.exitCode;
		this._onDidChange.fire();
	}
}
