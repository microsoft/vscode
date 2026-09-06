/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NonPtyShellTerminalStreams } from '../../node/copilot/copilotNonPtyShellTerminals.js';
import { buildDefaultChatUri } from '../../common/state/sessionState.js';
import { TestAgentHostTerminalManager } from './testAgentHostTerminalManager.js';

suite('NonPtyShellTerminalStreams', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = URI.parse('agenthost-session://test/session-1');
	let manager: TestAgentHostTerminalManager;
	let streams: NonPtyShellTerminalStreams;

	setup(() => {
		manager = store.add(new TestAgentHostTerminalManager());
		streams = store.add(new NonPtyShellTerminalStreams(sessionUri, URI.parse(buildDefaultChatUri(sessionUri)), manager));
	});

	function channelContent(): string {
		return manager.outputTerminalData.map(d => d.data).join('');
	}

	suite('rolling-tail snapshot stitching', () => {
		test('appends only the unseen suffix when the snapshot is a rolling tail, without resetting', () => {
			streams.track('call-1', 'shell');
			streams.append('call-1', 'line 1\r\nline 2\r\nline 3\r\n');
			streams.append('call-1', 'line 2\r\nline 3\r\nline 4\r\n');
			streams.append('call-1', 'line 4\r\nline 5\r\nline 6\r\n');

			deepStrictEqual(manager.outputTerminalResets, [], 'rolling tails must not reset the channel');
			strictEqual(channelContent(), 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\nline 6\r\n');
		});

		test('truncated completion preview does not discard the streamed transcript', () => {
			streams.track('call-2', 'shell');
			streams.append('call-2', 'line 1\r\nline 2\r\nline 3\r\n');
			streams.append('call-2', 'line 3\r\nline 4\r\nline 5\r\n');

			const completion = streams.completeToolCall('call-2', undefined, {
				shellId: 'shell-1',
				result: { exitCode: 0, preview: 'line 4\r\nline 5\r\n', truncated: true }
			});

			ok(completion);
			deepStrictEqual(manager.outputTerminalResets, []);
			strictEqual(channelContent(), 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n');
			deepStrictEqual(manager.outputTerminalsFinalized, [{ uri: completion.uri, exitCode: 0 }]);
		});

		test('preserves the transcript across truncation marker rewrites and disjoint rolling tails', () => {
			streams.track('call-3', 'shell');
			streams.append('call-3', 'line 1\r\nline 498\r\nline 499\r\n');
			streams.append('call-3', 'line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 42 lines from the end>\n');
			streams.append('call-3', 'line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 99 lines from the end>\n');
			streams.append('call-3', 'line 498\r\nline 499\r\nline 500\r\n');
			streams.append('call-3', 'line 499\r\nline 500\r\nline 501\r\n');
			streams.append('call-3', 'line 700\r\nline 701\r\nline 702\r\n');

			deepStrictEqual({
				resets: manager.outputTerminalResets,
				content: channelContent(),
			}, {
				resets: [],
				content: [
					'line 1\r\nline 498\r\nline 499\r\n<output too long - dropped 42 lines from the end>\n',
					'line 500\r\n',
					'line 501\r\n',
					'line 700\r\nline 701\r\nline 702\r\n',
				].join(''),
			});
		});

		test('recognizes the single-line character truncation marker', () => {
			streams.track('call-4', 'shell');
			streams.append('call-4', 'abcdefghij');
			streams.append('call-4', 'abcdefghij<output too long - dropped 5 characters from the end>');
			streams.append('call-4', 'abcdefghij<output too long - dropped 8 characters from the end>');

			deepStrictEqual({
				resets: manager.outputTerminalResets,
				content: channelContent(),
			}, {
				resets: [],
				content: 'abcdefghij<output too long - dropped 5 characters from the end>',
			});
		});

		test('preserves a direct transition to disjoint shorter tails', () => {
			streams.track('call-5', 'shell');
			streams.append('call-5', 'alpha beta gamma\r\n');
			streams.append('call-5', 'tail one\r\n');
			streams.append('call-5', 'tail two\r\n');

			deepStrictEqual({
				resets: manager.outputTerminalResets,
				content: channelContent(),
			}, {
				resets: [],
				content: 'alpha beta gamma\r\ntail one\r\ntail two\r\n',
			});
		});

		test('does not append a truncated completion preview after streamed output', () => {
			streams.track('call-6', 'shell');
			streams.append('call-6', 'line 1\r\nline 2\r\n<output too long - dropped 42 lines from the end>\n');
			streams.append('call-6', 'line 498\r\nline 499\r\nline 500\r\n');

			streams.completeToolCall('call-6', undefined, {
				shellId: 'shell-1',
				result: { exitCode: 0, preview: 'line 1\r\nline 2\r\n', truncated: true }
			});

			strictEqual(channelContent(), [
				'line 1\r\nline 2\r\n<output too long - dropped 42 lines from the end>\n',
				'line 498\r\nline 499\r\nline 500\r\n',
			].join(''));
		});

		test('seeds a zero-partial terminal from its truncated completion preview', () => {
			streams.track('call-7', 'shell');

			streams.completeToolCall('call-7', undefined, {
				shellId: 'shell-1',
				result: { exitCode: 0, preview: 'line 1\r\nline 2\r\n', truncated: true }
			});

			strictEqual(channelContent(), 'line 1\r\nline 2\r\n');
		});

		test('replaces a truncated stream with an authoritative non-truncated completion preview', () => {
			streams.track('call-8', 'shell');
			const appended = streams.append('call-8', 'head\r\n<output too long - dropped 42 lines from the end>\n');
			ok(appended);

			streams.completeToolCall('call-8', undefined, {
				shellId: 'shell-1',
				result: { exitCode: 0, preview: 'complete output\r\n', truncated: false }
			});

			deepStrictEqual({
				resets: manager.outputTerminalResets,
				data: manager.outputTerminalData,
			}, {
				resets: [appended.uri],
				data: [
					{ uri: appended.uri, data: 'head\r\n<output too long - dropped 42 lines from the end>\n' },
					{ uri: appended.uri, data: 'complete output\r\n' },
				],
			});
		});

		test('clears stale streamed output when the authoritative completion preview is empty', () => {
			streams.track('call-9', 'shell');
			const appended = streams.append('call-9', 'stale output\r\n');
			ok(appended);

			streams.completeToolCall('call-9', undefined, {
				shellId: 'shell-1',
				result: { exitCode: 0, preview: '', truncated: false }
			});

			deepStrictEqual({
				resets: manager.outputTerminalResets,
				data: manager.outputTerminalData,
			}, {
				resets: [appended.uri],
				data: [{ uri: appended.uri, data: 'stale output\r\n' }],
			});
		});

		test('appends a prefix-stable authoritative completion preview', () => {
			streams.track('call-10', 'shell');
			const appended = streams.append('call-10', 'line 1\r\n');
			ok(appended);

			streams.completeToolCall('call-10', undefined, {
				shellId: 'shell-1',
				result: { exitCode: 0, preview: 'line 1\r\nline 2\r\n', truncated: false }
			});

			deepStrictEqual({
				resets: manager.outputTerminalResets,
				data: manager.outputTerminalData,
			}, {
				resets: [],
				data: [
					{ uri: appended.uri, data: 'line 1\r\n' },
					{ uri: appended.uri, data: 'line 2\r\n' },
				],
			});
		});

		test('an unrelated rewrite still resets the channel', () => {
			streams.track('call-11', 'shell');
			streams.append('call-11', 'alpha beta gamma\r\n');
			streams.append('call-11', 'completely different content\r\n');

			strictEqual(manager.outputTerminalResets.length, 1);
			deepStrictEqual(manager.outputTerminalData.map(d => d.data), ['alpha beta gamma\r\n', 'completely different content\r\n']);
		});
	});

	suite('completion and lifecycle', () => {
		test('parses fallback completion, finalizes once, and ignores later output', () => {
			streams.track('call-12', 'shell');

			const completion = streams.completeToolCall('call-12', 'fallback output\r\n<shellId: shell-1 completed with exit code -1>', undefined);
			streams.completeToolCall('call-12', 'different output\r\n<shellId: shell-1 completed with exit code -1>', undefined);
			streams.append('call-12', 'late output\r\n');

			deepStrictEqual({
				completion,
				content: channelContent(),
				finalized: manager.outputTerminalsFinalized,
			}, {
				completion: {
					uri: 'agenthost-terminal://shell/session-1/call-12',
					result: { exitCode: -1, preview: 'fallback output\r\n' },
					shouldRetire: true,
				},
				content: 'fallback output\r\n',
				finalized: [{ uri: 'agenthost-terminal://shell/session-1/call-12', exitCode: -1 }],
			});
		});

		test('drops an unstarted stream without completion data', () => {
			streams.track('call-13', 'shell');

			strictEqual(streams.completeToolCall('call-13', undefined, undefined), undefined);
			strictEqual(streams.append('call-13', 'late output'), undefined);
		});

		test('keeps a started stream alive without completion data', () => {
			streams.track('call-14', 'shell');
			const appended = streams.append('call-14', 'partial output');
			ok(appended);

			deepStrictEqual(streams.completeToolCall('call-14', undefined, undefined), {
				uri: appended.uri,
				shouldRetire: false,
			});
		});

		test('retires a stream exactly once', () => {
			streams.track('call-15', 'shell');
			const appended = streams.append('call-15', 'partial output');
			ok(appended);

			streams.retire('call-15');
			streams.retire('call-15');

			deepStrictEqual(manager.disposedTerminals, [appended.uri]);
			strictEqual(streams.append('call-15', 'late output'), undefined);
		});

		test('ignores append and completion for an untracked tool call', () => {
			strictEqual(streams.append('missing', 'output'), undefined);
			strictEqual(streams.completeToolCall('missing', undefined, undefined), undefined);
		});
	});
});
