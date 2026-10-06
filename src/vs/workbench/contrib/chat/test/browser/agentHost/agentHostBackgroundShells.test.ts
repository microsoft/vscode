/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import type { IReference } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { BackgroundWorkKind, TerminalClaimKind, TerminalLifecycleStatus, type TerminalState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ComponentToState, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostBackgroundShellOutputs } from '../../../browser/agentSessions/agentHost/agentHostBackgroundShells.js';
import type { ChatBackgroundShellOutput } from '../../../common/sessionChatPills.js';

class TerminalConnection extends mock<IAgentConnection>() {
	readonly subscribed: string[] = [];
	readonly released: string[] = [];
	private readonly _onDidChange = new Emitter<TerminalState>();
	private _state: TerminalState | undefined;

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		this.subscribed.push(`${kind} ${resource.toString()}`);
		const connection = this;
		return {
			object: {
				get value() { return connection._state as ComponentToState[T] | undefined; },
				get verifiedValue() { return connection._state as ComponentToState[T] | undefined; },
				onDidChange: connection._onDidChange.event as Event<ComponentToState[T]>,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { connection.released.push(resource.toString()); },
		};
	}

	setState(state: TerminalState): void {
		this._state = state;
		this._onDidChange.fire(state);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

suite('AgentHostBackgroundShellOutputs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('subscribes to the terminal a host advertises as given, and leaves shells without one unchanged', () => {
		const connection = store.add(new TerminalConnection());
		const outputs = new AgentHostBackgroundShellOutputs(() => connection);
		// Another conforming host can use any terminal URI and opaque entry IDs, without VS Code's `_meta`.
		const terminal = 'remote-terminal://host-b/shells/9?token=abc';
		const startedAt = new Date(0).toISOString();
		const shells = outputs.project([
			{ kind: BackgroundWorkKind.Shell, id: 'remote-entry-1', label: 'Serve', command: 'serve', startedAt, terminal },
			{ kind: BackgroundWorkKind.Shell, id: 'remote-entry-2', label: 'Build', command: 'build', startedAt },
		]);
		const seen: ChatBackgroundShellOutput[] = [];
		const reader = autorun(r => {
			const output = shells[0].output?.read(r);
			if (output) {
				seen.push(output);
			}
		});
		const claim = { kind: TerminalClaimKind.Session, session: 'remote-session:/1', chat: 'remote-chat:/1' } as const;
		connection.setState({ title: 'Serve', content: [{ type: 'unclassified', value: 'ready\n' }], lifecycle: { status: TerminalLifecycleStatus.Running }, claim, isPty: false });
		connection.setState({ title: 'Serve', content: [{ type: 'unclassified', value: 'ready\n' }], lifecycle: { status: TerminalLifecycleStatus.Exited, exitCode: 1 }, claim, isPty: false });
		reader.dispose();

		assert.deepStrictEqual({
			ids: shells.map(shell => ({ id: shell.id, shellId: shell.shellId, attachmentMode: shell.attachmentMode })),
			withoutTerminal: shells[1].output,
			subscribed: connection.subscribed,
			seen,
			released: connection.released,
		}, {
			ids: [
				{ id: 'remote-entry-1', shellId: undefined, attachmentMode: undefined },
				{ id: 'remote-entry-2', shellId: undefined, attachmentMode: undefined },
			],
			withoutTerminal: undefined,
			subscribed: [`${StateComponents.Terminal} ${URI.parse(terminal).toString()}`],
			seen: [
				{ status: 'loading' },
				{ status: 'running', text: 'ready\n' },
				{ status: 'exited', text: 'ready\n', exitCode: 1 },
			],
			released: [URI.parse(terminal).toString()],
		});
	});
});
