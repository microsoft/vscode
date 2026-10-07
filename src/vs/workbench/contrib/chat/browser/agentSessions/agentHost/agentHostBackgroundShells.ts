/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable, IReader, observableFromEvent } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { readCopilotShellAttachment, readCopilotShellId } from '../../../../../../platform/agentHost/common/meta/copilotBackgroundWorkMeta.js';
import { BackgroundWorkKind, TerminalLifecycleStatus, type BackgroundWork, type TerminalState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { ChatBackgroundShellOutput, IChatBackgroundShell } from '../../../common/sessionChatPills.js';

/** Projects a chat's background work onto the shells its Background Shells pill lists. */
export function toChatBackgroundShells(work: readonly BackgroundWork[] | undefined, getOutput?: (terminal: string) => IObservable<ChatBackgroundShellOutput>): readonly IChatBackgroundShell[] {
	const shells: IChatBackgroundShell[] = [];
	for (const entry of work ?? []) {
		// The kind set is non-exhaustive, so newer hosts can send kinds this client doesn't render.
		if (entry.kind !== BackgroundWorkKind.Shell) {
			continue;
		}
		const shellId = readCopilotShellId(entry);
		const attachmentMode = readCopilotShellAttachment(entry);
		shells.push({
			id: entry.id,
			...(shellId !== undefined ? { shellId } : {}),
			description: entry.label,
			command: entry.command,
			startedAt: entry.startedAt,
			...(attachmentMode ? { attachmentMode } : {}),
			...(entry.terminal && getOutput ? { output: getOutput(entry.terminal) } : {}),
		});
	}
	return shells;
}

/** The live output of an Agent Host terminal, subscribed only while something reads it. */
export function observeAgentHostTerminalOutput(getConnection: (reader: IReader) => IAgentConnection | undefined, terminal: URI): IObservable<ChatBackgroundShellOutput> {
	const state = derived(reader => {
		const connection = getConnection(reader);
		if (!connection) {
			return undefined;
		}
		const subscription = reader.store.add(connection.getSubscription(StateComponents.Terminal, terminal, 'BackgroundShellOutput')).object;
		return observableFromEvent(subscription.onDidChange, () => subscription.value);
	});
	return derived(reader => toChatBackgroundShellOutput(state.read(reader)?.read(reader)));
}

function toChatBackgroundShellOutput(state: TerminalState | Error | undefined): ChatBackgroundShellOutput {
	if (state instanceof Error) {
		return { status: 'unavailable', message: state.message };
	}
	if (!state) {
		return { status: 'loading' };
	}
	const text = state.content.map(part => part.type === 'command' ? part.output : part.value).join('');
	if (state.lifecycle.status !== TerminalLifecycleStatus.Exited) {
		return { status: 'running', text };
	}
	return state.lifecycle.exitCode === undefined
		? { status: 'exited', text }
		: { status: 'exited', text, exitCode: state.lifecycle.exitCode };
}

/**
 * Projects background work while reusing one output observable per terminal,
 * so an unchanged list stays structurally equal and open views keep their subscription.
 */
export class AgentHostBackgroundShellOutputs {
	private readonly _outputs = new Map<string, IObservable<ChatBackgroundShellOutput>>();

	constructor(private readonly _getConnection: (reader: IReader) => IAgentConnection | undefined) { }

	project(work: readonly BackgroundWork[] | undefined): readonly IChatBackgroundShell[] {
		const listed = new Set<string>();
		const shells = toChatBackgroundShells(work, terminal => {
			listed.add(terminal);
			let output = this._outputs.get(terminal);
			if (!output) {
				output = observeAgentHostTerminalOutput(this._getConnection, URI.parse(terminal));
				this._outputs.set(terminal, output);
			}
			return output;
		});
		for (const terminal of [...this._outputs.keys()]) {
			if (!listed.has(terminal)) {
				this._outputs.delete(terminal);
			}
		}
		return shells;
	}
}
