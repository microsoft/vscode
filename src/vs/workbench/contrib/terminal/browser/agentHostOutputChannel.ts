/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { TerminalLifecycleStatus, type TerminalState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType } from '../../../../platform/agentHost/common/state/sessionActions.js';
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

	private _endsWithCarriageReturn = false;

	private _hasExited = false;
	get hasExited(): boolean { return this._hasExited; }

	private _exitCode: number | undefined;
	get exitCode(): number | undefined { return this._exitCode; }

	constructor(connection: IAgentConnection, terminalUri: URI) {
		super();
		const subscriptionRef = this._register(connection.getSubscription(StateComponents.Terminal, terminalUri, 'AgentHostOutputChannel'));
		const subscription = subscriptionRef.object;
		const acceptCurrentState = () => {
			if (subscription.value && !(subscription.value instanceof Error)) {
				this._acceptState(subscription.value);
			}
		};
		acceptCurrentState();
		this._register(subscription.onDidApplyAction(({ action, rejectionReason }) => {
			if (rejectionReason) {
				return;
			}
			if (action.type === ActionType.TerminalData) {
				this._appendData(action.data);
			} else {
				acceptCurrentState();
			}
		}));
		if (subscription.onDidApplySnapshot) {
			this._register(subscription.onDidApplySnapshot(acceptCurrentState));
		}
		if (subscription.onDidCancelSnapshotRefresh) {
			this._register(subscription.onDidCancelSnapshotRefresh(acceptCurrentState));
		}
	}

	private _acceptState(state: TerminalState): void {
		const output = state.content
			.map(part => part.type === 'command' ? part.output : part.value)
			.join('');
		this._output = normalizeLineEndings(output);
		this._endsWithCarriageReturn = output.endsWith('\r');
		const lifecycle = state.lifecycle;
		this._hasExited = lifecycle.status === TerminalLifecycleStatus.Exited;
		this._exitCode = lifecycle.status === TerminalLifecycleStatus.Exited ? lifecycle.exitCode : undefined;
		this._onDidChange.fire();
	}

	private _appendData(data: string): void {
		if (!data) {
			return;
		}
		this._output += this._endsWithCarriageReturn && data.startsWith('\n')
			? '\n' + normalizeLineEndings(data.slice(1))
			: normalizeLineEndings(data);
		this._endsWithCarriageReturn = data.endsWith('\r');
		this._onDidChange.fire();
	}
}

function normalizeLineEndings(text: string): string {
	return text.replace(/\r?\n/g, '\r\n');
}
