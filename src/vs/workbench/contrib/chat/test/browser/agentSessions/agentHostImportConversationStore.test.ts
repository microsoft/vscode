/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { MessageKind, TurnState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { AgentHostImportConversationStore } from '../../../browser/agentSessions/agentHost/agentHostImportConversationStore.js';

suite('AgentHostImportConversationStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const untitled = URI.parse('agent-host-copilotcli:/untitled-1');
	const real = URI.parse('agent-host-copilotcli:/real-1');

	function turn(text: string): Turn {
		return { id: text, message: { text, origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
	}

	test('set/take round-trips the conversation and consumes it exactly once', () => {
		const store = new AgentHostImportConversationStore();
		const conversation = { turns: [turn('a')], model: { id: 'gpt-x' } };

		store.set(untitled, conversation);

		assert.deepStrictEqual({
			first: store.take(untitled),
			second: store.take(untitled),
			unknown: store.take(real),
		}, {
			first: conversation,
			second: undefined,
			unknown: undefined,
		});
	});

	test('set with no turns is a no-op', () => {
		const store = new AgentHostImportConversationStore();

		store.set(untitled, { turns: [] });

		assert.strictEqual(store.take(untitled), undefined);
	});

	test('rename moves the stash from the untitled resource to the real one', () => {
		const store = new AgentHostImportConversationStore();
		const conversation = { turns: [turn('a')], model: { id: 'gpt-x' } };
		store.set(untitled, conversation);

		store.rename(untitled, real);

		assert.deepStrictEqual({
			old: store.take(untitled),
			renamed: store.take(real),
		}, {
			old: undefined,
			renamed: conversation,
		});
	});

	test('rename of a missing entry is a no-op', () => {
		const store = new AgentHostImportConversationStore();

		store.rename(untitled, real);

		assert.strictEqual(store.take(real), undefined);
	});
});
