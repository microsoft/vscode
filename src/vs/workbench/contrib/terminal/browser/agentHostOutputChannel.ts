/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../platform/agentHost/common/agentService.js';
import { ActionType, type StateAction } from '../../../../platform/agentHost/common/state/sessionActions.js';
import { TerminalLifecycleStatus, type TerminalState } from '../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../platform/agentHost/common/state/sessionState.js';
import { AGENT_HOST_TERMINAL_MAX_CONTENT_LENGTH, AGENT_HOST_TERMINAL_TRIMMED_CONTENT_LENGTH } from '../../../../platform/agentHost/common/terminalConstants.js';
import type { IChatTerminalOutputPosition, IChatTerminalOutputSource } from './terminal.js';

function normalizeLineEndings(text: string): string {
	return text.replace(/\r?\n/g, '\r\n');
}

/** Channels never share a generation, so a renderer that switches to a replacement channel rewrites instead of appending. */
let nextOutputGeneration = 1;

/**
 * Read-only view of an AHP output channel. Unlike {@link AgentHostPty}, this
 * does not create a terminal process or an {@code ITerminalInstance}; chat
 * renders the retained plain-text output in its own detached xterm.
 */
export class AgentHostOutputChannel extends Disposable implements IChatTerminalOutputSource {
	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _output = '';
	get output(): string { return this._output; }

	/** The retained output as the host sent it, before line endings are normalized into {@link _output}. */
	private _rawOutput = '';

	private _outputPosition: IChatTerminalOutputPosition = { generation: nextOutputGeneration++, start: 0 };
	get outputPosition(): IChatTerminalOutputPosition { return this._outputPosition; }

	/** Whether the last data ended with a carriage return whose line feed may arrive with the next data. */
	private _endsWithCarriageReturn = false;

	/** The state content the output last reflected, so a change that leaves it as it was keeps the output. */
	private _content: TerminalState['content'] | undefined;

	private _hasExited = false;
	get hasExited(): boolean { return this._hasExited; }

	private _exitCode: number | undefined;
	get exitCode(): number | undefined { return this._exitCode; }

	constructor(connection: IAgentConnection, terminalUri: URI) {
		super();
		const subscription = this._register(connection.getSubscription(StateComponents.Terminal, terminalUri, 'AgentHostOutputChannel')).object;
		// Data is appended as each action announces it; state changes without an action, such as snapshots, rebuild the output.
		let pendingAction: StateAction | undefined;
		this._register(subscription.onWillApplyAction(envelope => pendingAction = envelope.action));
		this._register(subscription.onDidChange(state => {
			const action = pendingAction;
			pendingAction = undefined;
			this._acceptState(state, action);
		}));
		this._register(subscription.onDidApplyAction(() => pendingAction = undefined));
		const state = subscription.value;
		if (state && !(state instanceof Error)) {
			this._acceptState(state, undefined);
		}
	}

	private _acceptState(state: TerminalState, action: StateAction | undefined): void {
		switch (action?.type) {
			case ActionType.TerminalData:
				this._append(action.data);
				break;
			case ActionType.TerminalCleared:
				this._replace('');
				break;
			case ActionType.TerminalInput:
			case ActionType.TerminalResized:
			case ActionType.TerminalClaimed:
			case ActionType.TerminalTitleChanged:
			case ActionType.TerminalCwdChanged:
			case ActionType.TerminalExited:
			case ActionType.TerminalCommandDetectionAvailable:
			case ActionType.TerminalCommandExecuted:
			case ActionType.TerminalCommandFinished:
				break;
			default:
				// An action this client doesn't know, such as one from a newer host, can leave the content as it was
				if (state.content !== this._content) {
					this._replace(state.content.map(part => part.type === 'command' ? part.output : part.value).join(''));
				}
		}
		this._content = state.content;
		const lifecycle = state.lifecycle;
		this._hasExited = lifecycle.status === TerminalLifecycleStatus.Exited;
		this._exitCode = lifecycle.status === TerminalLifecycleStatus.Exited ? lifecycle.exitCode : undefined;
		this._onDidChange.fire();
	}

	private _append(data: string): void {
		if (!data) {
			return;
		}
		// A CRLF split across two chunks must not gain a second carriage return.
		const normalized = this._endsWithCarriageReturn && data.startsWith('\n')
			? '\n' + normalizeLineEndings(data.slice(1))
			: normalizeLineEndings(data);
		this._endsWithCarriageReturn = data.endsWith('\r');
		this._setOutput(this._rawOutput + data, this._output + normalized, this._outputPosition.generation, this._outputPosition.start);
	}

	private _replace(text: string): void {
		this._endsWithCarriageReturn = text.endsWith('\r');
		this._setOutput(text, normalizeLineEndings(text), nextOutputGeneration++, 0);
	}

	/**
	 * Keeps only as much output as the host retains, so an update costs the same however long the stream runs.
	 * The host counts the characters it sends, so the limits apply to the raw output rather than the normalized one.
	 */
	private _setOutput(rawOutput: string, output: string, generation: number, start: number): void {
		if (rawOutput.length > AGENT_HOST_TERMINAL_MAX_CONTENT_LENGTH) {
			let rawDropped = rawOutput.length - AGENT_HOST_TERMINAL_TRIMMED_CONTENT_LENGTH;
			// Keep a CRLF together: a line feed left at the start would normalize as a line ending of its own.
			if (rawOutput[rawDropped - 1] === '\r' && rawOutput[rawDropped] === '\n') {
				rawDropped++;
			}
			const dropped = normalizeLineEndings(rawOutput.slice(0, rawDropped)).length;
			rawOutput = rawOutput.slice(rawDropped);
			output = output.slice(dropped);
			start += dropped;
		}
		this._rawOutput = rawOutput;
		this._output = output;
		if (generation !== this._outputPosition.generation || start !== this._outputPosition.start) {
			this._outputPosition = { generation, start };
		}
	}
}
