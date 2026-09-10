/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileService } from '../../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../log/common/log.js';
import { SessionServerToolName } from '../../../common/serverToolNames.js';
import { readCodexRolloutMetadata } from '../../../node/codex/codexRolloutMetadata.js';

suite('codexRolloutMetadata', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createFileService(testDisposables: DisposableStore): FileService {
		const fileService = testDisposables.add(new FileService(new NullLogService()));
		testDisposables.add(fileService.registerProvider(Schemas.file, testDisposables.add(new InMemoryFileSystemProvider())));
		return fileService;
	}

	test('restores create-thread and send-message targets from completed rollout tool calls', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const fileService = createFileService(testDisposables);
		const resource = URI.file('/rollout.jsonl');
		const targetThreadId = 'target-thread';
		const clientThreadId = 'pending-worktree';
		const records = [
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call',
					call_id: 'create-call',
					name: 'exec',
					input: 'const result = await tools.codex_app__create_thread({\\n  prompt: \"Remember this word: capybara\",\\n  title: \"Remember capybara\"\\n});',
					internal_chat_message_metadata_passthrough: { turn_id: 'turn-create' },
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call_output',
					call_id: 'create-call',
					output: [
						{ type: 'input_text', text: 'Script completed' },
						{ type: 'input_text', text: JSON.stringify({ threadId: targetThreadId, hostId: 'local' }) },
					],
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call',
					call_id: 'send-call',
					name: 'exec',
					input: `const result = await tools.codex_app__send_message_to_thread({\\n  threadId: \"${targetThreadId}\",\\n  hostId: \"local\",\\n  prompt: \"foo\"\\n});`,
					internal_chat_message_metadata_passthrough: { turn_id: 'turn-send' },
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call_output',
					call_id: 'send-call',
					output: JSON.stringify({ threadId: targetThreadId }),
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call',
					call_id: 'worktree-call',
					name: 'exec',
					input: 'const result = await tools.codex_app__create_thread({ prompt: \"Set up the worktree\", title: \"Worktree setup\" });',
					internal_chat_message_metadata_passthrough: { turn_id: 'turn-worktree' },
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call_output',
					call_id: 'worktree-call',
					output: JSON.stringify({ clientThreadId, hostId: 'local' }),
				},
			},
		];
		await fileService.writeFile(resource, VSBuffer.fromString(records.map(record => JSON.stringify(record)).join('\n')));

		const metadata = await readCodexRolloutMetadata(fileService, resource.fsPath);

		assert.deepStrictEqual([...metadata.threadCoordinationByTurnId].map(([turnId, calls]) => ({
			turnId,
			calls: calls.map(call => ({
				toolName: call.toolName,
				targetThreadId: call.targetThreadId,
				openLink: call.openLink,
				toolInput: call.toolInput,
			})),
		})), [{
			turnId: 'turn-create',
			calls: [{
				toolName: SessionServerToolName.CreateSession,
				targetThreadId,
				openLink: `agent-host-session://codex/${targetThreadId}`,
				toolInput: { prompt: 'Remember capybara' },
			}],
		}, {
			turnId: 'turn-send',
			calls: [{
				toolName: SessionServerToolName.SendMessage,
				targetThreadId,
				openLink: `agent-host-session://codex/${targetThreadId}`,
				toolInput: { prompt: 'foo' },
			}],
		}, {
			turnId: 'turn-worktree',
			calls: [{
				toolName: SessionServerToolName.CreateSession,
				targetThreadId: clientThreadId,
				openLink: `agent-host-session://codex/${clientThreadId}`,
				toolInput: { prompt: 'Worktree setup' },
			}],
		}]);
	});

	test('ignores incomplete and non-local thread-management calls', async () => {
		const testDisposables = disposables.add(new DisposableStore());
		const fileService = createFileService(testDisposables);
		const resource = URI.file('/rollout.jsonl');
		const records = [
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call',
					call_id: 'remote-call',
					name: 'exec',
					input: 'const result = await tools.codex_app__send_message_to_thread({ threadId: \"remote-thread\", hostId: \"ssh\", prompt: \"foo\" });',
					internal_chat_message_metadata_passthrough: { turn_id: 'turn-remote' },
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call_output',
					call_id: 'remote-call',
					output: [{ type: 'input_text', text: JSON.stringify({ threadId: 'remote-thread' }) }],
				},
			},
			{
				type: 'response_item',
				payload: {
					type: 'custom_tool_call',
					call_id: 'unfinished-call',
					name: 'exec',
					input: 'const result = await tools.codex_app__create_thread({ prompt: \"unfinished\" });',
					internal_chat_message_metadata_passthrough: { turn_id: 'turn-unfinished' },
				},
			},
		];
		await fileService.writeFile(resource, VSBuffer.fromString(records.map(record => JSON.stringify(record)).join('\n')));

		const metadata = await readCodexRolloutMetadata(fileService, resource.fsPath);

		assert.deepStrictEqual([...metadata.threadCoordinationByTurnId], []);
	});
});
