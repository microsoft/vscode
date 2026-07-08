/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { buildChatUri, buildDefaultChatUri, type StringOrMarkdown } from '../../common/state/sessionState.js';
import { createRenameSessionServerToolGroup, getRenameSessionToolDisplay, RENAME_SESSION_TOOL_NAME, type IRenameSessionToolResult } from '../../node/shared/agentRenameSessionServerTool.js';

function text(value: StringOrMarkdown | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : value.markdown;
}

suite('agentRenameSessionServerTool', () => {
	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	const SESSION = 'agenthost-session://copilot/rename-tool-test';

	function setup(result: IRenameSessionToolResult) {
		// `execute` ignores the state manager (it delegates to the handler), but
		// its type requires one, so pass a real (disposable) instance.
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const calls: { sessionUri: string; rawTitle: string }[] = [];
		const group = createRenameSessionServerToolGroup((sessionUri, rawTitle) => {
			calls.push({ sessionUri, rawTitle });
			return result;
		});
		const run = (uri: string, args: unknown) => group.execute(stateManager, uri, RENAME_SESSION_TOOL_NAME, args);
		return { calls, run };
	}

	test('renames via a plain session URI and confirms the cleaned title', () => {
		const { calls, run } = setup({ status: 'renamed', title: 'Adding JWT auth' });
		const message = run(SESSION, { title: '  Adding JWT auth  ' });
		assert.deepStrictEqual({ message, calls }, {
			message: 'Renamed session to "Adding JWT auth".',
			calls: [{ sessionUri: SESSION, rawTitle: '  Adding JWT auth  ' }],
		});
	});

	test('normalizes a default-chat URI to its owning session before delegating', () => {
		const { calls, run } = setup({ status: 'renamed', title: 'Adding JWT auth' });
		const message = run(buildDefaultChatUri(SESSION), { title: 'Adding JWT auth' });
		assert.deepStrictEqual({ message, sessionUri: calls[0]?.sessionUri }, {
			message: 'Renamed session to "Adding JWT auth".',
			sessionUri: SESSION,
		});
	});

	test('rejects a peer (non-default) chat URI without calling the handler', () => {
		const { calls, run } = setup({ status: 'renamed', title: 'x' });
		const message = run(buildChatUri(SESSION, 'chat-2'), { title: 'Adding JWT auth' });
		assert.deepStrictEqual({ message, calls }, {
			message: 'Renaming additional chats is not supported; only the session can be renamed.',
			calls: [],
		});
	});

	test('throws for a missing or empty title before delegating', () => {
		const { calls, run } = setup({ status: 'renamed', title: 'x' });
		assert.throws(() => run(SESSION, {}), /non-empty string/);
		assert.throws(() => run(SESSION, { title: '' }), /non-empty string/);
		assert.deepStrictEqual(calls, []);
	});

	test('surfaces the handler outcome for skipped and invalid results', () => {
		assert.deepStrictEqual({
			skipped: setup({ status: 'skippedUserNamed' }).run(SESSION, { title: 'Adding JWT auth' }),
			invalid: setup({ status: 'invalid' }).run(SESSION, { title: '   ' }),
		}, {
			skipped: 'Skipped: the session was already renamed by the user.',
			invalid: 'Could not rename the session: the provided title was empty after normalization.',
		});
	});

	test('getRenameSessionToolDisplay renders localized invocation and past-tense strings', () => {
		const withTitle = getRenameSessionToolDisplay(RENAME_SESSION_TOOL_NAME, { title: 'Adding JWT auth' });
		assert.deepStrictEqual({
			displayName: withTitle?.displayName,
			invocation: text(withTitle?.invocationMessage),
			pastWithTitle: text(withTitle?.pastTenseMessage),
			pastWithoutTitle: text(getRenameSessionToolDisplay(RENAME_SESSION_TOOL_NAME, {})?.pastTenseMessage),
			otherTool: getRenameSessionToolDisplay('addComment', { title: 'x' }),
		}, {
			displayName: 'Rename Session',
			invocation: 'Renaming session',
			pastWithTitle: 'Renamed session to "Adding JWT auth"',
			pastWithoutTitle: 'Renamed session',
			otherTool: undefined,
		});
	});
});
