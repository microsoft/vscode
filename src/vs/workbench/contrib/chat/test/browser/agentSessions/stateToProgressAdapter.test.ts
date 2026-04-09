/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ToolCallStatus, ToolCallConfirmationReason, ToolResultContentType, TurnState, ResponsePartKind, type IActiveTurn, type ICompletedToolCall, type IToolCallRunningState, type ITurn, type IToolCallResponsePart, ToolCallCancellationReason } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatToolInvocationSerialized, type IChatMarkdownContent } from '../../../common/chatService/chatService.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { turnsToHistory, activeTurnToProgress, toolCallStateToInvocation, finalizeToolInvocation } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

// ---- Helper factories -------------------------------------------------------

function createToolCallState(overrides?: Partial<IToolCallRunningState>): IToolCallRunningState {
	return {
		toolCallId: 'tc-1',
		toolName: 'test_tool',
		displayName: 'Test Tool',
		invocationMessage: 'Running test tool...',
		status: ToolCallStatus.Running,
		confirmed: ToolCallConfirmationReason.NotNeeded,
		...overrides,
	};
}

function createCompletedToolCall(overrides?: Partial<ICompletedToolCall>): ICompletedToolCall {
	return {
		status: ToolCallStatus.Completed,
		toolCallId: 'tc-1',
		toolName: 'test_tool',
		displayName: 'Test Tool',
		invocationMessage: 'Running test tool...',
		success: true,
		confirmed: ToolCallConfirmationReason.NotNeeded,
		pastTenseMessage: 'Ran test tool',
		...overrides,
	} as ICompletedToolCall;
}

function createTurn(overrides?: Partial<ITurn>): ITurn {
	return {
		id: 'turn-1',
		userMessage: { text: 'Hello' },
		responseParts: [],
		usage: undefined,
		state: TurnState.Complete,
		...overrides,
	};
}

// ---- Tests ------------------------------------------------------------------

suite('stateToProgressAdapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('turnsToHistory', () => {

		test('empty turns produces empty history', () => {
			const result = turnsToHistory([], 'p');
			assert.deepStrictEqual(result, []);
		});

		test('single turn produces request + response pair', () => {
			const turn = createTurn({
				userMessage: { text: 'Do something' },
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall() } as IToolCallResponsePart],
			});

			const history = turnsToHistory([turn], 'participant-1');
			assert.strictEqual(history.length, 2);

			// Request
			assert.strictEqual(history[0].type, 'request');
			assert.strictEqual(history[0].prompt, 'Do something');
			assert.strictEqual(history[0].participant, 'participant-1');

			// Response
			assert.strictEqual(history[1].type, 'response');
			assert.strictEqual(history[1].participant, 'participant-1');
			assert.strictEqual(history[1].parts.length, 1);

			const serialized = history[1].parts[0] as IChatToolInvocationSerialized;
			assert.strictEqual(serialized.kind, 'toolInvocationSerialized');
			assert.strictEqual(serialized.toolCallId, 'tc-1');
			assert.strictEqual(serialized.toolId, 'test_tool');
			assert.strictEqual(serialized.isComplete, true);
		});

		test('terminal tool call in history has correct terminal data', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						toolInput: 'echo hello',
						content: [
							{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t1', title: 'Terminal' },
							{ type: ToolResultContentType.Text, text: 'hello' },
						],
						success: true,
					})
				} as IToolCallResponsePart],
			});

			const history = turnsToHistory([turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; commandLine: { original: string }; terminalCommandOutput: { text: string }; terminalCommandState: { exitCode: number } };
			assert.strictEqual(termData.commandLine.original, 'echo hello');
			assert.strictEqual(termData.terminalCommandOutput.text, 'hello');
			assert.strictEqual(termData.terminalCommandState.exitCode, 0);
		});

		test('turn with responseText produces markdown content in history', () => {
			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Hello world' }],
			});

			const history = turnsToHistory([turn], 'p');
			assert.strictEqual(history.length, 2);

			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			assert.strictEqual(response.parts.length, 1);
			assert.strictEqual(response.parts[0].kind, 'markdownContent');
			assert.strictEqual((response.parts[0] as IChatMarkdownContent).content.value, 'Hello world');
		});

		test('error turn produces error message in history', () => {
			const turn = createTurn({
				state: TurnState.Error,
				error: { errorType: 'test', message: 'boom' },
			});

			const history = turnsToHistory([turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const errorPart = response.parts.find(p => p.kind === 'markdownContent' && (p as IChatMarkdownContent).content.value.includes('boom'));
			assert.ok(errorPart, 'Should have a markdownContent part containing the error message');
		});

		test('failed tool in history has exitCode 1', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						toolInput: 'bad-command',
						content: [
							{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t2', title: 'Terminal' },
							{ type: ToolResultContentType.Text, text: 'error' },
						],
						success: false,
					})
				} as IToolCallResponsePart],
			});

			const history = turnsToHistory([turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; terminalCommandState: { exitCode: number } };
			assert.strictEqual(termData.terminalCommandState.exitCode, 1);
		});
	});

	suite('toolCallStateToInvocation', () => {

		test('creates ChatToolInvocation for running tool', () => {
			const tc = createToolCallState({
				toolCallId: 'tc-42',
				toolName: 'my_tool',
				displayName: 'My Tool',
				invocationMessage: 'Doing stuff',
				status: ToolCallStatus.Running,
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolCallId, 'tc-42');
			assert.strictEqual(invocation.toolId, 'my_tool');
			assert.strictEqual(invocation.source, ToolDataSource.Internal);
		});

		test('sets terminal toolSpecificData when content has terminal block', () => {
			const tc = createToolCallState({
				toolInput: 'ls -la',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t3', title: 'Terminal' },
				],
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; commandLine: { original: string } };
			assert.strictEqual(termData.commandLine.original, 'ls -la');
		});

		test('creates invocation without toolArguments', () => {
			const tc = createToolCallState({});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolCallId, 'tc-1');
		});
	});

	suite('finalizeToolInvocation', () => {

		test('finalizes terminal tool with output and exit code', () => {
			const tc = createToolCallState({
				toolInput: 'echo hi',
				status: ToolCallStatus.Running,
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t4', title: 'Terminal' },
				],
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				toolInput: 'echo hi',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Ran echo hi',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t4', title: 'Terminal' },
					{ type: ToolResultContentType.Text, text: 'output text' },
				],
			});

			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandOutput: { text: string }; terminalCommandState: { exitCode: number } };
			assert.strictEqual(termData.terminalCommandOutput.text, 'output text');
			assert.strictEqual(termData.terminalCommandState.exitCode, 0);
		});

		test('finalizes failed tool with error message', () => {
			const tc = createToolCallState({
				status: ToolCallStatus.Running,
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: false,
				pastTenseMessage: 'Failed',
				error: { message: 'timeout' },
			});

			// Should not throw
		});

		test('returns file edits from completed tool call with FileEdit content', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			const fileEdits = finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'edit_file',
				displayName: 'Edit File',
				invocationMessage: 'Editing file...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Edited file',
				toolInput: JSON.stringify({ path: '/home/user/file.ts' }),
				content: [{
					type: ToolResultContentType.FileEdit,
					before: {
						uri: URI.file('/home/user/file.ts').toString(),
						content: { uri: 'agenthost-content:///session/snap/before' },
					},
					after: {
						uri: URI.file('/home/user/file.ts').toString(),
						content: { uri: 'agenthost-content:///session/snap/after' },
					},
				}],
			});

			assert.strictEqual(fileEdits.length, 1);
			assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, '/'), '/home/user/file.ts');
			assert.strictEqual(fileEdits[0].beforeContentUri?.toString(), URI.parse('agenthost-content:///session/snap/before').toString());
			assert.strictEqual(fileEdits[0].afterContentUri?.toString(), URI.parse('agenthost-content:///session/snap/after').toString());
			assert.ok(fileEdits[0].undoStopId);
		});

		test('returns empty file edits for cancelled tool call', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			const fileEdits = finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Cancelled,
				toolCallId: 'tc-1',
				toolName: 'edit_file',
				displayName: 'Edit File',
				invocationMessage: 'Editing file...',
				reason: ToolCallCancellationReason.Denied,
				reasonMessage: 'User cancelled',
			});

			assert.strictEqual(fileEdits.length, 0);
		});

		test('returns empty file edits when tool has no FileEdit content', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			const fileEdits = finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Ran test tool',
				content: [{ type: ToolResultContentType.Text, text: 'output' }],
			});

			assert.strictEqual(fileEdits.length, 0);
		});

		test('returns empty file edits when FileEdit has no before or after', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			const fileEdits = finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'edit_file',
				displayName: 'Edit File',
				invocationMessage: 'Editing file...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Edited',
				toolInput: JSON.stringify({ content: 'no path field' }),
				content: [{
					type: ToolResultContentType.FileEdit,
				}],
			});

			assert.strictEqual(fileEdits.length, 0);
		});

		test('returns file edit for create (only after present)', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			const fileEdits = finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'create_file',
				displayName: 'Create File',
				invocationMessage: 'Creating file...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Created file',
				content: [{
					type: ToolResultContentType.FileEdit,
					after: {
						uri: URI.file('/home/user/new-file.ts').toString(),
						content: { uri: 'agenthost-content:///snap/after' },
					},
				}],
			});

			assert.strictEqual(fileEdits.length, 1);
			assert.strictEqual(fileEdits[0].kind, 'create');
			assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, '/'), '/home/user/new-file.ts');
			assert.strictEqual(fileEdits[0].beforeContentUri, undefined);
			assert.ok(fileEdits[0].afterContentUri);
		});
	});

	suite('activeTurnToProgress', () => {

		function createActiveTurnState(responseParts?: IActiveTurn['responseParts']): IActiveTurn {
			return {
				id: 'turn-active',
				userMessage: { text: 'Do things' },
				responseParts: responseParts ?? [],
				usage: undefined,
			};
		}

		test('empty active turn produces empty progress', () => {
			const result = activeTurnToProgress(createActiveTurnState());
			assert.deepStrictEqual(result, []);
		});

		test('produces markdown content for streamed text', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Hello world' },
			]));
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'markdownContent');
			assert.strictEqual((result[0] as IChatMarkdownContent).content.value, 'Hello world');
		});

		test('produces thinking progress for reasoning', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Let me think about this...' },
			]));
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'thinking');
		});

		test('reasoning comes before streamed text when ordered that way', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Hmm...' },
				{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Result text' },
			]));
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].kind, 'thinking');
			assert.strictEqual(result[1].kind, 'markdownContent');
		});

		test('serializes completed tool calls', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						status: ToolCallStatus.Completed,
						toolCallId: 'tc-done',
						toolName: 'test_tool',
						displayName: 'Test Tool',
						invocationMessage: 'Ran test',
						confirmed: ToolCallConfirmationReason.NotNeeded,
						success: true,
						pastTenseMessage: 'Ran test tool',
					} as IToolCallResponsePart['toolCall'],
				},
			]));
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'toolInvocationSerialized');
		});

		test('creates live invocations for running tool calls', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: createToolCallState({
						toolCallId: 'tc-running',
						status: ToolCallStatus.Running,
					}),
				},
			]));
			assert.strictEqual(result.length, 1);
			// Live ChatToolInvocation - check it has the right toolCallId
			const invocation = result[0] as { toolCallId?: string; kind?: string };
			assert.strictEqual(invocation.toolCallId, 'tc-running');
		});

		test('creates confirmation invocations for pending tool confirmations', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: 'tc-pending',
						toolName: 'bash',
						displayName: 'Bash',
						invocationMessage: 'Run command',
						status: ToolCallStatus.PendingConfirmation,
						confirmationTitle: 'Run command',
						toolInput: 'echo hello',
					},
				},
			]));
			assert.strictEqual(result.length, 1);
			// PendingConfirmation tools have input-style specific data (no terminal content yet)
			const invocation = result[0] as { toolSpecificData?: { kind: string } };
			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'input');
		});

		test('includes all parts in correct order', () => {
			const result = activeTurnToProgress(createActiveTurnState([
				{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Thinking...' },
				{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Output so far' },
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: createToolCallState({
						toolCallId: 'tc-1',
						status: ToolCallStatus.Running,
					}),
				},
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: 'tc-2',
						toolName: 'test_tool',
						displayName: 'Test Tool',
						invocationMessage: 'Confirm',
						status: ToolCallStatus.PendingConfirmation,
						confirmationTitle: 'Confirm',
					},
				},
			]));
			// reasoning + text + tool call + pending confirmation = 4 items
			assert.strictEqual(result.length, 4);
			assert.strictEqual(result[0].kind, 'thinking');
			assert.strictEqual(result[1].kind, 'markdownContent');
		});
	});

	suite('terminal content blocks', () => {

		test('completed tool call with terminal content block sets terminalCommandUri', () => {
			const tc = createCompletedToolCall({
				_meta: { toolKind: 'terminal' },
				toolInput: 'npm test',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///abc123', title: 'Terminal' },
				],
				success: true,
			});

			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as IToolCallResponsePart],
			});

			const history = turnsToHistory([turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; terminalCommandUri?: { toString(): string } };
			assert.ok(termData.terminalCommandUri);
			assert.strictEqual(termData.terminalCommandUri.toString(), 'agenthost-terminal:/abc123');
		});

		test('terminal content block skips output from text content', () => {
			const tc = createCompletedToolCall({
				_meta: {
					toolKind: 'terminal',
				},
				toolInput: 'npm test',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///abc123', title: 'Terminal' },
					{ type: ToolResultContentType.Text, text: 'text-output' },
				],
				success: true,
			});

			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as IToolCallResponsePart],
			});

			const history = turnsToHistory([turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			const termData = serialized.toolSpecificData as { kind: 'terminal'; terminalCommandUri?: { toString(): string }; terminalCommandOutput?: { text: string } };
			// Terminal content block URI should be set
			assert.ok(termData.terminalCommandUri);
			// Text content is still extracted as output
			assert.strictEqual(termData.terminalCommandOutput?.text, 'text-output');
		});

		test('running tool call with terminal content block sets terminalCommandUri', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'terminal' },
				toolInput: 'npm test',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///running-term', title: 'Terminal' },
				],
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandUri?: { toString(): string } };
			assert.ok(termData.terminalCommandUri);
			assert.strictEqual(termData.terminalCommandUri.toString(), 'agenthost-terminal:/running-term');
		});

		test('finalize preserves terminal URI from content block', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'terminal' },
				toolInput: 'echo hello',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///final-term', title: 'Terminal' },
				],
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				_meta: { toolKind: 'terminal' },
				toolInput: 'echo hello',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Ran echo hello',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///final-term', title: 'Terminal' },
				],
			});

			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandUri?: { toString(): string }; terminalCommandState?: { exitCode: number } };
			assert.ok(termData.terminalCommandUri);
			assert.strictEqual(termData.terminalCommandUri.toString(), 'agenthost-terminal:/final-term');
			assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
		});

	});
});
