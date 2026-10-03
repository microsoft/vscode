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
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';

suite('NonPtyShellTerminalStreams', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionUri = URI.parse('agenthost-session://test/session-1');
	const chatUri = URI.parse(buildDefaultChatUri(sessionUri));
	let manager: TestAgentHostTerminalManager;
	let streams: NonPtyShellTerminalStreams;

	setup(() => {
		manager = store.add(new TestAgentHostTerminalManager());
		streams = store.add(new NonPtyShellTerminalStreams(sessionUri, sessionUri, chatUri, manager));
	});

	function channelContent(): string {
		return manager.outputTerminalData.map(d => d.data).join('');
	}

	suite('completed output cleanup', () => {
		for (const preview of ['short output\n', '', undefined]) {
			test(`retires settled short output without retaining or reviving it (${JSON.stringify(preview)})`, () => {
				const disposed: string[] = [];
				for (let i = 0; i < 20; i++) {
					const toolCallId = `short-${i}`;
					streams.track(toolCallId, 'shell');
					streams.append(toolCallId, 'streamed output\n');
					const completion = streams.completeToolCall(toolCallId, undefined, {
						shellId: String(i),
						result: { exitCode: i % 2 ? 127 : 0, preview },
					});
					ok(completion);
					strictEqual(completion.result?.preview, preview ?? 'streamed output\n');
					strictEqual(completion.shouldRetire, true);
					streams.retire(toolCallId);
					streams.retire(toolCallId);
					disposed.push(completion.uri);
					deepStrictEqual({
						live: manager.getTerminalState(completion.uri),
						lateOutput: streams.append(toolCallId, 'late output'),
					}, { live: undefined, lateOutput: undefined });
				}
				streams.dispose();
				deepStrictEqual(manager.disposedTerminals, disposed);
			});
		}

		test('retires the live channel even when a command spills output', () => {
			streams.track('spilled', 'shell');
			streams.append('spilled', 'partial output');
			const artifact = URI.file('/tmp/copilot-output.txt');
			const completion = streams.completeToolCall('spilled', undefined, {
				shellId: '1',
				result: { exitCode: 0, preview: 'preview', truncated: true },
				outputFilePath: artifact.fsPath,
			});
			ok(completion);
			strictEqual(manager.getTerminalState(completion.uri)?.lifecycle.status, 'running');
			streams.finalizeToolCall('spilled', completion.result?.exitCode, 'authoritative output');
			deepStrictEqual({
				replacements: manager.outputTerminalReplacements,
				state: manager.getTerminalState(completion.uri),
			}, {
				replacements: [{ uri: completion.uri, data: 'authoritative output' }],
				state: {
					title: 'shell',
					content: [{ type: 'unclassified', value: 'authoritative output' }],
					lifecycle: { status: 'exited', exitCode: 0 },
					claim: {
						kind: 'session',
						session: sessionUri.toString(),
						chat: chatUri.toString(),
						toolCallId: 'spilled',
					},
					isPty: false,
				},
			});
			streams.retire('spilled');
			streams.dispose();
			deepStrictEqual({
				live: manager.getTerminalState(completion.uri),
				disposed: manager.disposedTerminals,
			}, { live: undefined, disposed: [completion.uri] });
		});
	});

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
			strictEqual(completion.shouldRetire, true);
			deepStrictEqual(manager.outputTerminalResets, []);
			strictEqual(channelContent(), 'line 1\r\nline 2\r\nline 3\r\nline 4\r\nline 5\r\n');
			deepStrictEqual(manager.outputTerminalsFinalized, [{ uri: completion.uri, exitCode: 0 }]);
			streams.retire('call-2');
			strictEqual(manager.getTerminalState(completion.uri), undefined);
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
					uri: buildNonPtyShellTerminalUri(sessionUri, sessionUri, chatUri, 'call-12'),
					result: { exitCode: -1, preview: 'fallback output\r\n' },
					shouldRetire: true,
				},
				content: 'fallback output\r\n',
				finalized: [{ uri: buildNonPtyShellTerminalUri(sessionUri, sessionUri, chatUri, 'call-12'), exitCode: -1 }],
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

	suite('background shells', () => {
		const asyncStarted = (shellId: string) => `<command started in background with shellId: ${shellId}>`;

		test('keeps streaming an attached command after its tool call returns, until the shell exits', () => {
			streams.track('call-20', 'shell');
			const uri = streams.append('call-20', 'step 1\n')?.uri;

			const completion = streams.completeToolCall('call-20', asyncStarted('7'), undefined);
			const streaming = streams.isStreamingInBackground('call-20');
			streams.append('call-20', 'step 1\nstep 2\n');
			const terminal = streams.getBackgroundShellTerminal('7');
			streams.completeBackgroundShell('7', 0);
			streams.append('call-20', 'step 1\nstep 2\nstep 3\n');

			deepStrictEqual({
				completion,
				streaming,
				terminal,
				content: channelContent(),
				finalized: manager.outputTerminalsFinalized,
				afterExit: { streaming: streams.isStreamingInBackground('call-20'), terminal: streams.getBackgroundShellTerminal('7') },
				disposed: manager.disposedTerminals,
			}, {
				completion: { uri, shouldRetire: false, backgroundShellId: '7' },
				streaming: true,
				terminal: uri,
				content: 'step 1\nstep 2\n',
				finalized: [{ uri, exitCode: 0 }],
				afterExit: { streaming: false, terminal: undefined },
				disposed: [],
			});
		});

		test('creates the channel when the command returned before producing output', () => {
			streams.track('call-21', 'shell');

			const completion = streams.completeToolCall('call-21', '<command with shellId: 8 is still running after 30 seconds. The command is still running. Use read_bash to continue waiting for output, or stop_bash to stop it.>', undefined);
			streams.append('call-21', 'late\n');

			const uri = buildNonPtyShellTerminalUri(sessionUri, sessionUri, chatUri, 'call-21');
			deepStrictEqual({ completion, created: manager.outputTerminalsCreated.map(terminal => terminal.uri), content: channelContent() }, {
				completion: { uri, shouldRetire: false, backgroundShellId: '8' },
				created: [uri],
				content: 'late\n',
			});
		});

		test('does not stream detached commands or a shell ID that is already in use', () => {
			const results = {
				'call-22': '<command started in detached background with shellId: 9>',
				'call-26': '<command with shellId: 9 is still running in detached background after 30s. Use read_bash to continue waiting, or stop_bash to stop it.>',
				'call-27': '<command with shellId: 9 is already running, wait for output with read_bash, stop it with stop_bash tool>',
			};
			const completions = Object.entries(results).map(([toolCallId, text]) => {
				streams.track(toolCallId, 'shell');
				streams.append(toolCallId, 'starting\n');
				return { completion: streams.completeToolCall(toolCallId, text, undefined), streaming: streams.isStreamingInBackground(toolCallId) };
			});

			deepStrictEqual({ completions, terminal: streams.getBackgroundShellTerminal('9') }, {
				completions: Object.keys(results).map(toolCallId => ({
					completion: { uri: buildNonPtyShellTerminalUri(sessionUri, sessionUri, chatUri, toolCallId), shouldRetire: false },
					streaming: false,
				})),
				terminal: undefined,
			});
		});

		test('only settles captured shells that are no longer listed', () => {
			streams.track('call-23', 'shell');
			const earlier = streams.captureBackgroundShells();
			const uri = streams.completeToolCall('call-23', asyncStarted('10'), undefined)?.uri;

			streams.reconcileBackgroundShells(new Set(), earlier);
			const afterEarlierRead = [...manager.outputTerminalsFinalized];
			streams.reconcileBackgroundShells(new Set(['10']), streams.captureBackgroundShells());
			const whileListed = [...manager.outputTerminalsFinalized];
			streams.reconcileBackgroundShells(new Set(), streams.captureBackgroundShells());

			deepStrictEqual({ afterEarlierRead, whileListed, finalized: manager.outputTerminalsFinalized }, {
				afterEarlierRead: [],
				whileListed: [],
				finalized: [{ uri, exitCode: undefined }],
			});
		});

		test('settles a shell that exits before any read lists it', () => {
			streams.track('call-28', 'shell');
			const uri = streams.completeToolCall('call-28', asyncStarted('12'), undefined)?.uri;

			streams.reconcileBackgroundShells(new Set(), streams.captureBackgroundShells());

			deepStrictEqual(manager.outputTerminalsFinalized, [{ uri, exitCode: undefined }]);
		});

		test('does not settle a replacement command from a task read started before its shell ID was reused', () => {
			streams.track('call-32', 'shell');
			const first = streams.completeToolCall('call-32', asyncStarted('16'), undefined)?.uri;
			const earlier = streams.captureBackgroundShells();

			streams.track('call-33', 'shell');
			const second = streams.completeToolCall('call-33', asyncStarted('16'), undefined)?.uri;
			streams.reconcileBackgroundShells(new Set(), earlier);
			const afterEarlierRead = {
				finalized: [...manager.outputTerminalsFinalized],
				terminal: streams.getBackgroundShellTerminal('16'),
				streaming: streams.isStreamingInBackground('call-33'),
			};
			streams.reconcileBackgroundShells(new Set(), streams.captureBackgroundShells());

			deepStrictEqual({ afterEarlierRead, finalized: manager.outputTerminalsFinalized }, {
				afterEarlierRead: {
					finalized: [{ uri: first, exitCode: undefined }],
					terminal: second,
					streaming: true,
				},
				finalized: [{ uri: first, exitCode: undefined }, { uri: second, exitCode: undefined }],
			});
		});

		test('preserves shell completion received while a task read is pending', () => {
			streams.track('call-34', 'shell');
			const uri = streams.completeToolCall('call-34', asyncStarted('17'), undefined)?.uri;
			const snapshot = streams.captureBackgroundShells();

			streams.completeBackgroundShell('17', 3);
			streams.reconcileBackgroundShells(new Set(), snapshot);

			deepStrictEqual({
				finalized: manager.outputTerminalsFinalized,
				terminal: streams.getBackgroundShellTerminal('17'),
			}, {
				finalized: [{ uri, exitCode: 3 }],
				terminal: undefined,
			});
		});

		test('settles a shell from a read result with its exit code and from a stop result', () => {
			streams.track('call-29', 'shell');
			const read = streams.completeToolCall('call-29', asyncStarted('13'), undefined)?.uri;
			streams.track('call-30', 'shell');
			const stopped = streams.completeToolCall('call-30', asyncStarted('14'), undefined)?.uri;
			streams.track('call-31', 'shell');
			const running = streams.completeToolCall('call-31', asyncStarted('15'), undefined)?.uri;

			streams.completeBackgroundShellFromHelperResult('done\n<shellId: 13 completed with exit code 3>');
			streams.completeBackgroundShellFromHelperResult('<command with id: 14 stopped>');
			streams.completeBackgroundShellFromHelperResult('<shellId: 99 completed with exit code 1>');
			streams.completeBackgroundShellFromHelperResult('still running');
			streams.completeBackgroundShellFromHelperResult('log: <command with id: 15 stopped>\nlog: <shellId: 15 completed with exit code 0>\nstill running');

			deepStrictEqual({ finalized: manager.outputTerminalsFinalized, running: streams.getBackgroundShellTerminal('15') }, {
				finalized: [
					{ uri: read, exitCode: 3 },
					{ uri: stopped, exitCode: undefined },
				],
				running,
			});
		});

		test('settles the previous command when a new one reuses its shell ID', () => {
			streams.track('call-24', 'shell');
			const first = streams.completeToolCall('call-24', asyncStarted('11'), undefined)?.uri;
			streams.track('call-25', 'shell');
			const second = streams.completeToolCall('call-25', asyncStarted('11'), undefined)?.uri;

			deepStrictEqual({ finalized: manager.outputTerminalsFinalized, terminal: streams.getBackgroundShellTerminal('11') }, {
				finalized: [{ uri: first, exitCode: undefined }],
				terminal: second,
			});
		});
	});
});
