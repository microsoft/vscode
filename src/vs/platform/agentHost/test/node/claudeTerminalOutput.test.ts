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

function toolState(toolName: string, command?: string): ClaudeMapperState {
	const state = new ClaudeMapperState();
	state.startToolBlock(0, TOOL_CALL_ID, toolName, TURN_ID);
	if (command !== undefined) {
		state.appendToolBlockInputDelta(0, JSON.stringify({ command }));
		state.finalizeToolBlock(0);
	}
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

interface IInlineOutputCase {
	readonly name: string;
	readonly message: ReturnType<typeof bashResult>;
	readonly toolName: string;
	readonly command?: string;
	readonly signal?: AbortSignal;
}

suite('ClaudeTerminalOutputs', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('stores saved output for Bash and PowerShell commands routed through Claude shell tool', async () => {
		const cases = [
			{ name: 'Bash', command: 'printf test' },
			{ name: 'PowerShell', command: 'pwsh -NoProfile -Command "Write-Output test"' },
		];
		const results = [];
		for (const { name, command } of cases) {
			const { outputs, database, fileService } = createHarness(disposables);
			await fileService.writeFile(URI.file(OUTPUT_PATH), VSBuffer.fromString(OUTPUT));
			const state = toolState('Bash', command);

			await outputs.capture(CHAT, CHAT, TURN_ID, bashResult({ stdout: OUTPUT, stderr: '', interrupted: false, persistedOutputPath: OUTPUT_PATH, persistedOutputSize: OUTPUT.length }), state);

			const stored = await database.readTerminalOutput(TOOL_CALL_ID);
			results.push({
				name,
				command: state.toolCalls.lookup(TOOL_CALL_ID)?.info?.toolInput,
				stored: stored && VSBuffer.wrap(stored).toString(),
				terminal: state.takeTerminalOutput(TOOL_CALL_ID),
			});
		}

		assert.deepStrictEqual(results, cases.map(({ name, command }) => ({
			name,
			command,
			stored: OUTPUT,
			terminal: {
				type: ToolResultContentType.Terminal,
				resource: buildNonPtyShellTerminalUri(CHAT, SESSION, CHAT, TOOL_CALL_ID),
				title: 'Run shell command',
				isPty: false,
				result: { exitCode: 0, preview: 'FULL_OUTPUT_BEGIN', truncated: true },
			},
		})));
	});

	test('preserves provider output when Claude did not save complete shell output', async () => {
		const { outputs, database, fileService } = createHarness(disposables);
		await fileService.writeFile(URI.file(OUTPUT_PATH), VSBuffer.fromString(OUTPUT));
		const saved = { stdout: OUTPUT, stderr: '', interrupted: false, persistedOutputPath: OUTPUT_PATH };
		const cases: readonly IInlineOutputCase[] = [
			{ name: 'inline Bash output', message: bashResult({ stdout: OUTPUT, stderr: '', interrupted: false }), toolName: 'Bash', command: 'printf test' },
			{ name: 'inline PowerShell output', message: bashResult({ stdout: OUTPUT, stderr: '', interrupted: false }), toolName: 'Bash', command: 'pwsh -NoProfile -Command "Write-Output test"' },
			{ name: 'backgrounded command', message: bashResult({ ...saved, backgroundTaskId: 'bash_1' }), toolName: 'Bash' },
			{ name: 'subagent command', message: bashResult(saved, 'toolu_task'), toolName: 'Bash' },
			{ name: 'other tool', message: bashResult(saved), toolName: 'Read' },
			{ name: 'missing file', message: bashResult({ ...saved, persistedOutputPath: '/claude/tool-results/missing.txt' }), toolName: 'Bash' },
			{ name: 'cancelled turn', message: bashResult(saved), toolName: 'Bash', signal: AbortSignal.abort() },
		];

		const results = [];
		for (const { name, message, toolName, command, signal } of cases) {
			const state = toolState(toolName, command);
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

	test('restores retained output only for completed terminal calls with stored output', async () => {
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
