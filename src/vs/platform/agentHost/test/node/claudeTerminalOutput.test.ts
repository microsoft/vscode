/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { InstantiationService } from '../../../instantiation/common/instantiationService.js';
import { ServiceCollection } from '../../../instantiation/common/serviceCollection.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { buildNonPtyShellTerminalUri } from '../../common/nonPtyShellTerminalUri.js';
import { ISessionDataService } from '../../common/sessionDataService.js';
import { buildChatUri, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, type ToolCallResponsePart, type Turn } from '../../common/state/sessionState.js';
import { ClaudeMapperState } from '../../node/claude/claudeMapSessionEvents.js';
import { ClaudeTerminalOutputs } from '../../node/claude/claudeTerminalOutput.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';
import { makeUserToolResultMessage } from './claudeMapSessionEventsTestUtils.js';

const SESSION = 'claude:/sess-1';
const CHAT = URI.parse(buildChatUri(SESSION, 'peer'));
const TURN_ID = 'turn-1';
const TOOL_CALL_ID = 'toolu_1';
const OUTPUT_PATH = '/claude/tool-results/toolu_1.txt';
const OUTPUT = `FULL_OUTPUT_BEGIN\n${'x'.repeat(4096)}\nFULL_OUTPUT_END\n`;
const NOTICE = [
	'<persisted-output>',
	`Output too large (4.1KB). Full output saved to: ${OUTPUT_PATH}`,
	'',
	'Preview (first 2KB):',
	'FULL_OUTPUT_BEGIN',
	'...',
	'</persisted-output>',
].join('\n');

function createHarness(disposables: Pick<DisposableStore, 'add'>, database = new TestSessionDatabase()) {
	const fileService = disposables.add(new FileService(new NullLogService()));
	disposables.add(fileService.registerProvider('file', disposables.add(new InMemoryFileSystemProvider())));
	const services = new ServiceCollection(
		[ILogService, new NullLogService()],
		[IFileService, fileService],
		[ISessionDataService, createSessionDataService(database)],
	);
	const outputs = disposables.add(new InstantiationService(services)).createInstance(ClaudeTerminalOutputs);
	return { outputs, database, fileService };
}

function toolState(toolName: string): ClaudeMapperState {
	const state = new ClaudeMapperState();
	state.startToolBlock(0, TOOL_CALL_ID, toolName, TURN_ID);
	return state;
}

function bashResult(toolUseResult: unknown, parentToolUseId: string | null = null) {
	return {
		...makeUserToolResultMessage('sess-1', TOOL_CALL_ID, NOTICE),
		tool_use_result: toolUseResult,
		parent_tool_use_id: parentToolUseId,
	};
}

function completedToolCall(toolCallId: string, toolName: string, text: string): ToolCallResponsePart {
	return {
		kind: ResponsePartKind.ToolCall,
		toolCall: {
			status: ToolCallStatus.Completed,
			toolCallId,
			toolName,
			displayName: toolName,
			invocationMessage: toolName,
			confirmed: ToolCallConfirmationReason.NotNeeded,
			success: true,
			pastTenseMessage: toolName,
			content: [{ type: ToolResultContentType.Text, text }],
		},
	};
}

suite('ClaudeTerminalOutputs', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('stores the output Claude saved for a Bash result and stages its terminal content', async () => {
		const { outputs, database, fileService } = createHarness(disposables);
		await fileService.writeFile(URI.file(OUTPUT_PATH), VSBuffer.fromString(OUTPUT));
		const state = toolState('Bash');

		await outputs.capture(CHAT, CHAT, TURN_ID, bashResult({ stdout: OUTPUT, stderr: '', interrupted: false, persistedOutputPath: OUTPUT_PATH, persistedOutputSize: OUTPUT.length }), state);

		const stored = await database.readTerminalOutput(TOOL_CALL_ID);
		assert.deepStrictEqual({
			stored: stored && VSBuffer.wrap(stored).toString(),
			terminal: state.takeTerminalOutput(TOOL_CALL_ID),
		}, {
			stored: OUTPUT,
			terminal: {
				type: ToolResultContentType.Terminal,
				resource: buildNonPtyShellTerminalUri(CHAT, SESSION, CHAT, TOOL_CALL_ID),
				title: 'Run shell command',
				isPty: false,
				result: { exitCode: 0, preview: 'FULL_OUTPUT_BEGIN', truncated: true },
			},
		});
	});

	test('keeps output inline when Claude did not save the complete output of a top-level Bash call', async () => {
		const { outputs, database, fileService } = createHarness(disposables);
		await fileService.writeFile(URI.file(OUTPUT_PATH), VSBuffer.fromString(OUTPUT));
		const saved = { stdout: OUTPUT, stderr: '', interrupted: false, persistedOutputPath: OUTPUT_PATH };
		const cases = [
			{ name: 'inline output', message: bashResult({ stdout: OUTPUT, stderr: '', interrupted: false }), toolName: 'Bash' },
			{ name: 'backgrounded command', message: bashResult({ ...saved, backgroundTaskId: 'bash_1' }), toolName: 'Bash' },
			{ name: 'subagent command', message: bashResult(saved, 'toolu_task'), toolName: 'Bash' },
			{ name: 'other tool', message: bashResult(saved), toolName: 'Read' },
			{ name: 'missing file', message: bashResult({ ...saved, persistedOutputPath: '/claude/tool-results/missing.txt' }), toolName: 'Bash' },
			{ name: 'cancelled turn', message: bashResult(saved), toolName: 'Bash', signal: AbortSignal.abort() },
		];

		const results = [];
		for (const { name, message, toolName, signal } of cases) {
			const state = toolState(toolName);
			await outputs.capture(CHAT, CHAT, TURN_ID, message, state, signal);
			results.push({ name, staged: state.takeTerminalOutput(TOOL_CALL_ID), stored: await database.getTerminalOutputSize(TOOL_CALL_ID) });
		}

		assert.deepStrictEqual(results, cases.map(({ name }) => ({ name, staged: undefined, stored: undefined })));
	});

	test('removes stored output when the turn is cancelled before its result is published', async () => {
		const cancellation = new AbortController();
		const database = new class extends TestSessionDatabase {
			override async storeTerminalOutput(turnId: string, toolCallId: string, content: Uint8Array): Promise<void> {
				await super.storeTerminalOutput(turnId, toolCallId, content);
				cancellation.abort();
			}
		}();
		const { outputs, fileService } = createHarness(disposables, database);
		await fileService.writeFile(URI.file(OUTPUT_PATH), VSBuffer.fromString(OUTPUT));
		const state = toolState('Bash');

		await outputs.capture(CHAT, CHAT, TURN_ID, bashResult({ stdout: OUTPUT, stderr: '', interrupted: false, persistedOutputPath: OUTPUT_PATH }), state, cancellation.signal);

		assert.deepStrictEqual({
			staged: state.takeTerminalOutput(TOOL_CALL_ID),
			stored: await database.getTerminalOutputSize(TOOL_CALL_ID),
		}, { staged: undefined, stored: undefined });
	});

	test('restores retained output only for completed Bash calls with stored output', async () => {
		const { outputs, database } = createHarness(disposables);
		await database.createTurn(TURN_ID);
		await database.storeTerminalOutput(TURN_ID, 'toolu_retained', VSBuffer.fromString(OUTPUT).buffer);
		await database.storeTerminalOutput(TURN_ID, 'toolu_read', VSBuffer.fromString(OUTPUT).buffer);
		const turn: Turn = {
			id: TURN_ID,
			message: { text: 'run it', origin: { kind: MessageKind.User } },
			responseParts: [
				completedToolCall('toolu_retained', 'Bash', NOTICE),
				completedToolCall('toolu_inline', 'Bash', 'short output'),
				completedToolCall('toolu_read', 'Read', 'file contents'),
			],
			usage: undefined,
			state: TurnState.Complete,
		};

		await outputs.restore(CHAT, CHAT, [turn]);

		assert.deepStrictEqual(turn.responseParts.map(part => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.content : undefined), [
			[
				{ type: ToolResultContentType.Text, text: NOTICE },
				{
					type: ToolResultContentType.Terminal,
					resource: buildNonPtyShellTerminalUri(CHAT, SESSION, CHAT, 'toolu_retained'),
					title: 'Bash',
					isPty: false,
					result: { exitCode: 0, preview: 'FULL_OUTPUT_BEGIN', truncated: true },
				},
			],
			[{ type: ToolResultContentType.Text, text: 'short output' }],
			[{ type: ToolResultContentType.Text, text: 'file contents' }],
		]);
	});
});
