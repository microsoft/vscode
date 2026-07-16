/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun } from '../../../../../../base/common/observable.js';
import { hasKey } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import type { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { McpAuthRequiredReason } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { fromAgentHostUri, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { buildSubagentChatUri, MessageKind, ToolCallContributorKind, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolCallConfirmationReason, ToolResultContentType, TurnState, ResponsePartKind, readUsageInfoMeta, type ActiveTurn, type ICompletedToolCall, type ToolCallRunningState, type Turn, type ToolCallResponsePart, ToolCallCancellationReason, type Message } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind, type IChatMarkdownContent, type IChatTerminalToolInvocationData, type IChatThinkingPart, type IChatUsage } from '../../../common/chatService/chatService.js';
import { isToolResultInputOutputDetails, type IToolResultInputOutputDetails, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { turnsToHistory as rawTurnsToHistory, activeTurnToProgress as rawActiveTurnToProgress, toolCallStateToInvocation as rawToolCallStateToInvocation, finalizeToolInvocation as rawFinalizeToolInvocation, updateRunningToolSpecificData as rawUpdateRunningToolSpecificData, usageInfoToAutoModeResolution, usageInfoToQuotas, formatTurnResponseDetails, rewriteAgentHostLinkTarget, rewriteMarkdownLinks, type TurnModelLookup } from '../../../browser/agentSessions/agentHost/stateToProgressAdapter.js';

// ---- Helper factories -------------------------------------------------------

function createToolCallState(overrides?: Partial<ToolCallRunningState>): ToolCallRunningState {
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

function createTurn(overrides?: Partial<Turn>): Turn {
	return {
		id: 'turn-1',
		message: { text: 'Hello', origin: { kind: MessageKind.User } },
		responseParts: [],
		usage: undefined,
		state: TurnState.Complete,
		...overrides,
	};
}

function getSerializedTerminalData(serialized: IChatToolInvocationSerialized): IChatTerminalToolInvocationData {
	const toolSpecificData = serialized.toolSpecificData;
	assert.strictEqual(toolSpecificData?.kind, 'terminal');
	assert.ok(toolSpecificData && hasKey(toolSpecificData, { commandLine: true }));
	return toolSpecificData;
}

function message(text: string, kind = MessageKind.User): Message {
	return { text, origin: { kind } };
}

function toolCallStateToInvocation(tc: Parameters<typeof rawToolCallStateToInvocation>[0], subAgentInvocationId?: string) {
	return rawToolCallStateToInvocation(tc, subAgentInvocationId, URI.file('/'), 'local');
}

function finalizeToolInvocation(invocation: Parameters<typeof rawFinalizeToolInvocation>[0], tc: Parameters<typeof rawFinalizeToolInvocation>[1]) {
	return rawFinalizeToolInvocation(invocation, tc, URI.file('/'), 'local');
}

function turnsToHistory(backendSession: Parameters<typeof rawTurnsToHistory>[0], turns: Parameters<typeof rawTurnsToHistory>[1], participantId: Parameters<typeof rawTurnsToHistory>[2], lookup?: Parameters<typeof rawTurnsToHistory>[4]) {
	return rawTurnsToHistory(backendSession, turns, participantId, 'local', lookup);
}

/**
 * Builds a fake {@link TurnModelLookup} that namespaces ids with a fixed
 * prefix and returns display names from a static map. `fallbackRawModelId`
 * mirrors the real handler's "use summary.model when usage hasn't reported
 * yet" behavior.
 */
function makeLookup(prefix: string, displayNames: Record<string, string>, fallbackRawModelId?: string): TurnModelLookup {
	const resolveRaw = (raw: string | undefined): string | undefined => raw ?? fallbackRawModelId;
	return {
		toLanguageModelId: (raw) => {
			const r = resolveRaw(raw);
			return r ? `${prefix}${r}` : undefined;
		},
		toResponseDetails: (raw) => {
			const r = resolveRaw(raw);
			return r ? displayNames[r] : undefined;
		},
		toAutoModeResolution: usage => {
			const raw = readUsageInfoMeta(usage).autoModeResolved?.chosenModel;
			return usageInfoToAutoModeResolution(usage, raw ? displayNames[raw] : undefined);
		},
	};
}

function activeTurnToProgress(sessionResource: Parameters<typeof rawActiveTurnToProgress>[0], activeTurn: Parameters<typeof rawActiveTurnToProgress>[1], connectionAuthority?: Parameters<typeof rawActiveTurnToProgress>[2]) {
	return rawActiveTurnToProgress(sessionResource, activeTurn, connectionAuthority || 'local');
}

function updateRunningToolSpecificData(existing: Parameters<typeof rawUpdateRunningToolSpecificData>[0], tc: Parameters<typeof rawUpdateRunningToolSpecificData>[1]) {
	return rawUpdateRunningToolSpecificData(existing, tc, URI.file('/'), 'local');
}

function assertInputOutputDetails(details: unknown): asserts details is IToolResultInputOutputDetails {
	assert.ok(isToolResultInputOutputDetails(details));
}

// ---- Tests ------------------------------------------------------------------

suite('stateToProgressAdapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('rewriteAgentHostLinkTarget', () => {
		test('supports absolute paths and file URIs with validated locations', () => {
			const unwrap = (href: string) => fromAgentHostUri(URI.parse(rewriteAgentHostLinkTarget(href, 'my-host'))).toString();
			assert.deepStrictEqual(
				[
					unwrap('C:\\remote\\windows.ts:42'),
					unwrap('\\\\server\\share\\unc.ts:42'),
					unwrap('FILE:///remote/upper.ts:42'),
					unwrap('/remote/zero.ts:0'),
					unwrap('/remote/zero-column.ts:42:0'),
					unwrap('/remote/numeric-segment.ts:42:name.ts'),
					unwrap('/remote/scientific.ts:1e2'),
					unwrap('/remote/encoded%3A42'),
					unwrap('/remote/encoded%3A42:10'),
					unwrap('file:///remote/encoded%3A42'),
					unwrap('file:///remote/encoded%3A42:10'),
					unwrap('file:///remote/queried.ts?rev=1:42'),
					unwrap('/remote/range.ts:42-48'),
				],
				[
					URI.file('C:/remote/windows.ts').with({ fragment: 'L42' }).toString(),
					URI.file('//server/share/unc.ts').with({ fragment: 'L42' }).toString(),
					URI.file('/remote/upper.ts').with({ fragment: 'L42' }).toString(),
					URI.file('/remote/zero.ts:0').toString(),
					URI.file('/remote/zero-column.ts:42:0').toString(),
					URI.file('/remote/numeric-segment.ts:42:name.ts').toString(),
					URI.file('/remote/scientific.ts:1e2').toString(),
					URI.file('/remote/encoded:42').toString(),
					URI.file('/remote/encoded:42').with({ fragment: 'L10' }).toString(),
					URI.file('/remote/encoded:42').toString(),
					URI.file('/remote/encoded:42').with({ fragment: 'L10' }).toString(),
					URI.file('/remote/queried.ts').with({ query: 'rev=1:42' }).toString(),
					URI.file('/remote/range.ts:42-48').toString(),
				],
			);
		});

		test('preserves client-handled link schemes', () => {
			assert.deepStrictEqual(
				[
					rewriteAgentHostLinkTarget('vscode-browser://example.com', 'my-host'),
					rewriteAgentHostLinkTarget('copilot-skill:/plan', 'my-host'),
					rewriteAgentHostLinkTarget('C:relative', 'my-host'),
					rewriteAgentHostLinkTarget('git:foo', 'my-host'),
					rewriteAgentHostLinkTarget('urn:isbn:123', 'my-host'),
				],
				[
					'vscode-browser://example.com',
					'copilot-skill:/plan',
					'C:relative',
					'git:foo',
					'urn:isbn:123',
				],
			);
		});
	});

	suite('turnsToHistory', () => {

		test('empty turns produces empty history', () => {
			const result = turnsToHistory(URI.file('/'), [], 'p');
			assert.deepStrictEqual(result, []);
		});

		test('single turn produces request + response pair', () => {
			const turn = createTurn({
				message: message('Do something'),
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall() } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'participant-1');
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

		test('system-initiated turn preserves compact request label', () => {
			const turn = createTurn({
				message: message('`sleep 6` completed', MessageKind.SystemNotification),
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'participant-1');
			assert.strictEqual(history[0].type, 'request');
			if (history[0].type !== 'request') { return; }
			assert.strictEqual(history[0].isSystemInitiated, true);
			assert.strictEqual(history[0].prompt, '`sleep 6` completed');
			assert.strictEqual(history[0].systemInitiatedLabel, undefined);
		});

		test('system notification response part restores as system notification', () => {
			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.SystemNotification, content: 'Shell command completed' }],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'participant-1');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const progress = response.parts[0];
			assert.strictEqual(progress.kind, 'systemNotification');
			if (progress.kind !== 'systemNotification') { return; }
			assert.strictEqual(progress.content.value, 'Shell command completed');
		});

		test('reasoning response part restores as thinking progress carrying its id', () => {
			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Let me think about this...' }],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'participant-1');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const thinking = response.parts[0] as IChatThinkingPart;
			assert.strictEqual(thinking.kind, 'thinking');
			assert.strictEqual(thinking.value, 'Let me think about this...');
			assert.strictEqual(thinking.id, 'r-1');
		});

		test('generic completed tool call in history includes input/output details', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						toolInput: '{"query":"terminal activation"}',
						content: [{ type: ToolResultContentType.Text, text: 'Use shell integration.' }],
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			const details = serialized.resultDetails;

			assertInputOutputDetails(details);
			assert.strictEqual(details.input, '{"query":"terminal activation"}');
			assert.strictEqual(details.inputLanguage, 'json');
			assert.deepStrictEqual(details.output, [{ type: 'embed', value: 'Use shell integration.', isText: true, mimeType: 'text/plain' }]);
			assert.strictEqual(details.isError, false);
		});

		test('generic failed tool call in history uses error text as output', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						toolInput: '{"url":"https://example.com"}',
						success: false,
						error: { message: 'request timed out' },
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			const details = serialized.resultDetails;

			assertInputOutputDetails(details);
			assert.strictEqual(details.isError, true);
			assert.deepStrictEqual(details.output, [{ type: 'embed', value: 'request timed out', isText: true, mimeType: 'text/plain' }]);
		});

		test('generic completed tool call maps embedded resources and resource refs', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						toolInput: '{"image":"diagram"}',
						content: [
							{ type: ToolResultContentType.EmbeddedResource, data: 'aW1hZ2U=', contentType: 'image/png' },
							{ type: ToolResultContentType.Resource, uri: 'agenthost-content:///session/result.txt', contentType: 'text/plain' },
						],
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			const details = serialized.resultDetails;

			assertInputOutputDetails(details);
			assert.strictEqual(details.output.length, 2);
			assert.deepStrictEqual(details.output[0], { type: 'embed', value: 'aW1hZ2U=', mimeType: 'image/png' });
			assert.strictEqual(details.output[1].type, 'ref');
			// Resource URI is wrapped via toAgentHostUri so it resolves through the
			// agent host filesystem provider on the client when the session is backed
			// by a remote agent host.
			assert.strictEqual(details.output[1].uri.scheme, 'vscode-agent-host');
			assert.strictEqual(details.output[1].uri.authority, 'local');
			assert.strictEqual(details.output[1].uri.path, '/session/result.txt');
			assert.strictEqual(details.output[1].mimeType, 'text/plain');
		});

		test('per-turn model id and display name flow from usage.model', () => {
			const turn1 = createTurn({
				id: 'turn-1',
				message: message('first'),
				usage: { model: 'gpt-5' },
			});
			const turn2 = createTurn({
				id: 'turn-2',
				message: message('second'),
				usage: { model: 'opus-4.7' },
			});

			const lookup = makeLookup('agent-host-copilot:', { 'gpt-5': 'GPT-5', 'opus-4.7': 'Claude Opus 4.7' });
			const history = turnsToHistory(URI.file('/'), [turn1, turn2], 'p', lookup);

			assert.deepStrictEqual(
				history.map(h => h.type === 'request'
					? { type: h.type, modelId: h.modelId }
					: { type: h.type, details: h.details }),
				[
					{ type: 'request', modelId: 'agent-host-copilot:gpt-5' },
					{ type: 'response', details: 'GPT-5' },
					{ type: 'request', modelId: 'agent-host-copilot:opus-4.7' },
					{ type: 'response', details: 'Claude Opus 4.7' },
				],
			);
		});

		test('restores Auto model routing with the shared chat UI part', () => {
			const turn = createTurn({
				usage: {
					model: 'gpt-5.4-mini',
					_meta: {
						autoModeResolved: {
							chosenModel: 'gpt-5.4-mini',
							predictedLabel: 'no_reasoning',
							confidence: 0.98,
						},
					},
				},
			});
			const lookup = makeLookup('agent-host-copilot:', { 'gpt-5.4-mini': 'GPT-5.4 mini' });

			const history = turnsToHistory(URI.file('/'), [turn], 'p', lookup);
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }

			assert.deepStrictEqual(response.parts, [{
				kind: 'autoModeResolution',
				resolvedModel: 'gpt-5.4-mini',
				resolvedModelName: 'GPT-5.4 mini',
				predictedLabel: 'no_reasoning',
				confidence: 0.98,
			}]);
		});

		test('falls back to session-level model when turn has no usage.model', () => {
			const turn = createTurn({ message: message('first') });
			const lookup = makeLookup('agent-host-copilot:', { 'gpt-5': 'GPT-5' }, 'gpt-5');
			const history = turnsToHistory(URI.file('/'), [turn], 'p', lookup);

			assert.deepStrictEqual(
				history.map(h => h.type === 'request'
					? { type: h.type, modelId: h.modelId }
					: { type: h.type, details: h.details }),
				[
					{ type: 'request', modelId: 'agent-host-copilot:gpt-5' },
					{ type: 'response', details: 'GPT-5' },
				],
			);
		});

		test('maps turn usage to chat usage progress for restored history', () => {
			const turn = createTurn({
				usage: { inputTokens: 1200, outputTokens: 300, model: 'gpt-5' },
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Done' }],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }

			assert.deepStrictEqual(
				response.parts.map(part => part.kind === 'usage'
					? { kind: part.kind, promptTokens: part.promptTokens, completionTokens: part.completionTokens }
					: { kind: part.kind }),
				[
					{ kind: 'usage', promptTokens: 1200, completionTokens: 300 },
					{ kind: 'markdownContent' },
				],
			);
		});

		test('request history includes restored model id', () => {
			const turn = createTurn({
				message: message('Use restored model'),
				startedAt: '2025-07-08T22:05:21.000Z',
				duration: 2_500,
			});

			const lookup = makeLookup('agent-host-copilot:', {}, 'gpt-5');
			const history = turnsToHistory(URI.file('/'), [turn], 'participant-1', lookup);

			assert.deepStrictEqual(history[0], {
				id: turn.id,
				type: 'request',
				prompt: 'Use restored model',
				participant: 'participant-1',
				modelId: 'agent-host-copilot:gpt-5',
				timestamp: 1_752_012_321_000,
				variableData: undefined,
			});
			assert.deepStrictEqual(history[1].type === 'response' ? {
				elapsedMs: history[1].elapsedMs,
				completedAt: history[1].completedAt,
			} : undefined, {
				elapsedMs: 2_500,
				completedAt: 1_752_012_323_500,
			});
		});

		test('request history omits invalid restored timestamp', () => {
			const turn = createTurn({ startedAt: 'invalid' });
			const history = turnsToHistory(URI.file('/'), [turn], 'participant-1');

			assert.strictEqual(history[0].type === 'request' ? history[0].timestamp : undefined, undefined);
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
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
			assert.strictEqual(serialized.resultDetails, undefined);
			const termData = serialized.toolSpecificData as { kind: 'terminal'; commandLine: { original: string }; terminalCommandOutput: { text: string }; terminalCommandState: { exitCode: number } };
			assert.strictEqual(termData.commandLine.original, 'echo hello');
			assert.strictEqual(termData.terminalCommandOutput.text, 'hello');
			assert.strictEqual(termData.terminalCommandState.exitCode, 0);
		});

		test('terminal tool call in history carries the LM intention', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						intention: 'List files in the repo root',
						toolInput: 'ls',
						content: [
							{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///intent', title: 'Terminal' },
							{ type: ToolResultContentType.Text, text: 'a\nb' },
						],
						success: true,
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			assert.strictEqual(serialized.toolSpecificData?.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; intention?: string };
			assert.strictEqual(termData.intention, 'List files in the repo root');
		});

		test('terminal tool call in history does not set pastTenseMessage (avoids duplicate render)', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						_meta: { toolKind: 'terminal' },
						toolInput: 'echo hi',
						pastTenseMessage: 'Ran echo hi',
						content: [
							{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///past', title: 'Terminal' },
							{ type: ToolResultContentType.Text, text: 'hi' },
						],
						success: true,
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			assert.strictEqual(serialized.toolSpecificData?.kind, 'terminal');
			assert.strictEqual(serialized.pastTenseMessage, undefined);
		});

		test('terminal tool call (by toolKind only) in history does not set pastTenseMessage', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						_meta: { toolKind: 'terminal' },
						toolInput: 'echo hi',
						pastTenseMessage: 'Ran echo hi',
						content: [
							{ type: ToolResultContentType.Text, text: 'hi' },
						],
						success: true,
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			assert.strictEqual(serialized.toolSpecificData?.kind, 'terminal');
			assert.strictEqual(serialized.pastTenseMessage, undefined);
		});

		test('subagent tool call in history has correct subagent data', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
						content: [
							{ type: ToolResultContentType.Text, text: 'Agent result' },
							{ type: ToolResultContentType.Subagent, resource: 'copilot://session/subagent/tc-1', title: 'Explore', agentName: 'explore', description: 'Explores the codebase' },
						],
						success: true,
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'subagent');
			assert.strictEqual(serialized.resultDetails, undefined);
			if (serialized.toolSpecificData.kind === 'subagent') {
				assert.strictEqual(serialized.toolSpecificData.agentName, 'explore');
				// description is the TASK description from _meta, not the agent description
				assert.strictEqual(serialized.toolSpecificData.description, 'Find related files');
				assert.strictEqual(serialized.toolSpecificData.result, 'Agent result');
				// The subagent chat resource is carried so the UI can offer "Open chat".
				assert.strictEqual(serialized.toolSpecificData.chatResource, 'copilot://session/subagent/tc-1');
			}
		});

		test('subagent tool without content falls back to toolKind meta', () => {
			// This happens when the in-memory state lost subagent content
			// (e.g. tool_complete overwrote it before the merge fix)
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						toolName: 'task',
						displayName: 'Task',
						_meta: { toolKind: 'subagent' },
						content: [{ type: ToolResultContentType.Text, text: 'Result text' }],
						success: true,
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'subagent');
			assert.strictEqual(serialized.resultDetails, undefined);
			if (serialized.toolSpecificData.kind === 'subagent') {
				assert.strictEqual(serialized.toolSpecificData.description, 'Task');
				assert.strictEqual(serialized.toolSpecificData.result, 'Result text');
			}
		});

		test('turn with responseText produces markdown content in history', () => {
			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Hello world' }],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			assert.strictEqual(history.length, 2);

			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			assert.strictEqual(response.parts.length, 1);
			assert.strictEqual(response.parts[0].kind, 'markdownContent');
			assert.strictEqual((response.parts[0] as IChatMarkdownContent).content.value, 'Hello world');
		});

		test('markdown links in response content stay raw until rendering', () => {
			const content = 'See [local](file:///a/b.ts), [external](https://example.com) and [rel](./foo.md).';
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.Markdown,
					id: 'md-links',
					content,
				}],
			});

			const history = rawTurnsToHistory(URI.file('/'), [turn], 'p', 'my-host');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const part = response.parts[0] as IChatMarkdownContent;
			assert.strictEqual(part.content.value, content);
		});

		test('markdown link syntax inside fenced code blocks is preserved verbatim', () => {
			const input = [
				'Use [real](file:///a.ts) directly.',
				'',
				'```md',
				'[fake](file:///b.ts)',
				'```',
				'',
				'And then [another](file:///c.ts).',
			].join('\n');
			const value = rewriteMarkdownLinks(input, 'my-host');
			assert.ok(value.includes('[](vscode-agent-host://my-host/a.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)'));
			assert.ok(value.includes('[](vscode-agent-host://my-host/c.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)'));
			// The link inside the fenced code block must NOT be rewritten.
			assert.ok(value.includes('[fake](file:///b.ts)'));
			assert.ok(!value.includes('[fake](vscode-agent-host'));
		});

		test('markdown link syntax inside inline code spans is preserved verbatim', () => {
			const input = 'Real [one](file:///a.ts) and literal `[two](file:///b.ts)` here.';
			const value = rewriteMarkdownLinks(input, 'my-host');
			assert.strictEqual(value,
				'Real [](vscode-agent-host://my-host/a.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0) and literal `[two](file:///b.ts)` here.'
			);
		});

		test('preserves label and tags vscodeLinkType=skill for SKILL.md links', () => {
			const value = rewriteMarkdownLinks('Loaded [plan](file:///abs/repo/skills/plan/SKILL.md) and [other](file:///abs/repo/foo.ts).', 'my-host');
			assert.strictEqual(value,
				'Loaded [plan](vscode-agent-host://my-host/abs/repo/skills/plan/SKILL.md?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0%26vscodeLinkType%3Dskill) ' +
				'and [](vscode-agent-host://my-host/abs/repo/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0).'
			);
		});

		test('preserves alt text for image tokens', () => {
			const value = rewriteMarkdownLinks('See ![diagram](file:///a/b.png).', 'my-host');
			assert.strictEqual(value, 'See ![diagram](vscode-agent-host://my-host/a/b.png?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0).');
		});

		test('error turn produces error details in history', () => {
			const turn = createTurn({
				state: TurnState.Error,
				error: { errorType: 'test', message: 'boom' },
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			assert.strictEqual(response.errorDetails?.message, 'Error: (test) boom');
			assert.ok(!response.parts.some(p => p.kind === 'markdownContent' && (p as IChatMarkdownContent).content.value.includes('boom')), 'Error should not be duplicated as a markdown part');
		});

		test('forwarded quota error turn produces quota-exceeded error details', () => {
			const turn = createTurn({
				state: TurnState.Error,
				error: {
					errorType: 'quota',
					message: 'raw',
					_meta: { chatError: { fetchError: { type: 'quotaExceeded', capiError: { code: 'quota_exceeded' } } } },
				},
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			assert.strictEqual(response.errorDetails?.isQuotaExceeded, true);
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
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.ok(serialized.toolSpecificData);
			assert.strictEqual(serialized.toolSpecificData.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; terminalCommandState: { exitCode: number } };
			assert.strictEqual(termData.terminalCommandState.exitCode, 1);
		});

		test('search tool in history keeps search rendering without generic details', () => {
			const turn = createTurn({
				responseParts: [{
					kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall({
						_meta: { toolKind: 'search' },
						toolInput: '{"query":"activation"}',
						content: [{ type: ToolResultContentType.Text, text: 'found results' }],
					})
				} as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;

			assert.strictEqual(serialized.toolSpecificData?.kind, 'search');
			assert.strictEqual(serialized.resultDetails, undefined);
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

		test('creates authentication-required invocation for an MCP tool call', () => {
			const invocation = rawToolCallStateToInvocation({
				...createToolCallState(),
				status: ToolCallStatus.AuthRequired,
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'mcp-1' },
				auth: {
					reason: McpAuthRequiredReason.InsufficientScope,
					resource: {
						resource: 'https://mcp.example.com',
						resource_name: 'Example MCP',
						authorization_servers: ['https://auth.example.com'],
						scopes_supported: ['repo'],
					},
					requiredScopes: ['repo'],
				},
			}, undefined, URI.parse('agent-host-copilot://backend/session'), 'remote', 'frontend');

			const state = invocation.state.get();
			assert.strictEqual(state.type, IChatToolInvocation.StateKind.WaitingForAuthentication);
			if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
				assert.fail('Expected authentication-required state');
			}
			const { cancel, ...stateWithoutCancel } = state;
			assert.strictEqual(typeof cancel, 'function');
			assert.deepStrictEqual(stateWithoutCancel, {
				type: IChatToolInvocation.StateKind.WaitingForAuthentication,
				confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: undefined },
				parameters: undefined,
				confirmationMessages: undefined,
				server: {
					id: 'frontend/mcp-1',
					name: 'Example MCP',
					resource: 'https://mcp.example.com',
					authorizationServers: ['https://auth.example.com'],
					supportedScopes: ['repo'],
					requiredScopes: ['repo'],
					reason: McpAuthRequiredReason.InsufficientScope,
				},
			});
			invocation.setAuthenticationResolved();
			assert.strictEqual(invocation.state.get().type, IChatToolInvocation.StateKind.Executing);
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

		test('sets terminal toolSpecificData for built-in bash via _meta.toolKind (no Terminal content block)', () => {
			// The SDK's built-in bash tool (used when the Custom Terminal tool
			// is disabled) runs outside AHP's terminal infra and does not emit
			// a Terminal content block. The terminal pill must still render so
			// the user can expand the full multi-line command and output.
			const tc = createToolCallState({
				toolName: 'bash',
				displayName: 'Run Shell Command',
				toolInput: 'ls -la\nwc -l',
				_meta: { toolKind: 'terminal' },
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; commandLine: { original: string }; language?: string; terminalToolSessionId?: string; terminalCommandUri?: URI };
			assert.strictEqual(termData.commandLine.original, 'ls -la\nwc -l');
			assert.strictEqual(termData.language, 'shellscript');
			assert.strictEqual(termData.terminalToolSessionId, undefined, 'no AHP terminal session for built-in bash');
			assert.strictEqual(termData.terminalCommandUri, undefined, 'no AHP terminal URI for built-in bash');
		});

		test('built-in bash terminal toolSpecificData picks up streaming text output (running)', () => {
			const tc = createToolCallState({
				toolName: 'bash',
				toolInput: 'echo hi',
				_meta: { toolKind: 'terminal' },
				status: ToolCallStatus.Running,
				content: [
					{ type: ToolResultContentType.Text, text: 'hi\n' },
				],
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandOutput?: { text: string } };
			assert.strictEqual(termData.terminalCommandOutput?.text, 'hi\r\n', 'normalizes \\n to \\r\\n for xterm');
		});

		test('does not render terminal pill for terminal toolKind without a command (falls back to invocationMessage)', () => {
			// The built-in bash tool advertises `_meta.toolKind === 'terminal'`
			// from the tool-open seam, but the command only arrives once the
			// tool input has streamed in. Until then there is nothing to show in
			// the terminal pill, so we must fall back to the generic tool widget
			// (the `invocationMessage`) rather than rendering an empty command.
			const tc = createToolCallState({
				toolName: 'bash',
				invocationMessage: 'Running shell command',
				_meta: { toolKind: 'terminal' },
				status: ToolCallStatus.Running,
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData, undefined, 'no terminal pill without a command');
			assert.strictEqual(invocation.invocationMessage, 'Running shell command');
		});

		test('creates invocation without toolArguments', () => {
			const tc = createToolCallState({});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolCallId, 'tc-1');
		});

		test('sets subagent toolSpecificData from _meta for subagent toolKind', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'subagent', subagentDescription: 'Review code', subagentAgentName: 'code-reviewer' },
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'subagent');
			if (invocation.toolSpecificData.kind === 'subagent') {
				assert.strictEqual(invocation.toolSpecificData.description, 'Review code');
				assert.strictEqual(invocation.toolSpecificData.agentName, 'code-reviewer');
			}
		});

		test('sets MCP App toolSpecificData for running MCP tool calls', () => {
			const invocation = toolCallStateToInvocation(createToolCallState({
				toolInput: '{"topic":"metadata"}',
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'docs-customization' },
				_meta: {
					ui: {
						resourceUri: 'ui://docs/app',
						channel: 'mcp://copilot/test-session-1/docs',
					},
				},
			}));

			assert.deepStrictEqual(invocation.toolSpecificData, {
				kind: 'input',
				rawInput: { topic: 'metadata' },
				mcpAppData: {
					kind: 'agentHost',
					resourceUri: 'ui://docs/app',
					serverId: 'docs-customization',
					channel: 'mcp://copilot/test-session-1/docs',
				},
			});
		});

		test('does not set MCP App toolSpecificData for a streaming MCP tool call', () => {
			// A `Streaming` call is created in the UI's `Executing` state before
			// it may transition to confirmation, so the App must not mount yet.
			const invocation = toolCallStateToInvocation({
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				status: ToolCallStatus.Streaming,
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'docs-customization' },
				_meta: {
					ui: {
						resourceUri: 'ui://docs/app',
						channel: 'mcp://copilot/test-session-1/docs',
					},
				},
			});

			assert.strictEqual(invocation.toolSpecificData, undefined);
		});

		test('synthesizes subagent chatResource from the tool call id when no discovery content block is present', () => {
			// A background subagent's `subagent_started` can arrive after its
			// spawning tool call has already completed, so the running-only
			// discovery content update is dropped and the child chat resource
			// never lands on the tool call. The chat resource must still be
			// derivable from the session + tool call id so the inline subagent
			// pill remains linkable.
			const tc = createToolCallState({
				_meta: { toolKind: 'subagent', subagentDescription: 'Map aux bar + editor part creation' },
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				assert.strictEqual(invocation.toolSpecificData.chatResource, buildSubagentChatUri(URI.file('/').toString(), 'tc-1'));
			}
		});

		test('prefers the host-stamped _meta.subagentChatUri over a discovery content block resource', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'subagent', subagentChatUri: 'ahp-chat://subagent/stamped/tc-1' },
				content: [{
					type: ToolResultContentType.Subagent,
					resource: 'ahp-chat://subagent/discovery/tc-1',
					title: 'Explore',
					agentName: 'explore',
					description: 'Explores the codebase',
				}],
			});

			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				assert.strictEqual(invocation.toolSpecificData.chatResource, 'ahp-chat://subagent/stamped/tc-1');
			}
		});

		test('passes subAgentInvocationId to ChatToolInvocation', () => {
			const tc = createToolCallState({});

			const invocation = toolCallStateToInvocation(tc, 'parent-tc-42');
			assert.strictEqual(invocation.subAgentInvocationId, 'parent-tc-42');
		});
	});

	suite('addComment reference', () => {

		const commentRange = { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 5 };

		function addCommentInput(text: string): string {
			return JSON.stringify({ resourceUri: 'file:///workspace/a.ts', range: commentRange, text });
		}

		function markdown(message: string | IMarkdownString | undefined): IMarkdownString {
			assert.ok(message && typeof message !== 'string', 'expected a markdown reference');
			return message;
		}

		test('renders tool name, truncated quoted preview and a reveal command link', () => {
			const tc = createToolCallState({ toolName: 'addComment', invocationMessage: 'Adding comment', toolInput: addCommentInput('This comment is quite long and should be truncated') });
			const message = markdown(toolCallStateToInvocation(tc).invocationMessage);

			assert.deepStrictEqual(
				{
					value: message.value,
					supportThemeIcons: message.supportThemeIcons,
					isTrusted: message.isTrusted,
				},
				{
					value: `[addComment "This comment is quite long and should be…"](command:_agentFeedbackReview.revealAt?${encodeURIComponent(JSON.stringify(['file:///workspace/a.ts', commentRange]))})`,
					supportThemeIcons: true,
					isTrusted: { enabledCommands: ['_agentFeedbackReview.revealAt'] },
				},
			);
		});

		test('does not truncate a short comment', () => {
			const tc = createToolCallState({ toolName: 'addComment', invocationMessage: 'Adding comment', toolInput: addCommentInput('Short note') });
			const message = markdown(toolCallStateToInvocation(tc).invocationMessage);
			assert.ok(message.value.includes('addComment "Short note"'), message.value);
			assert.ok(!message.value.includes('…'), message.value);
		});

		test('sets the same reference as the past-tense message on completion', () => {
			const running = createToolCallState({ toolName: 'addComment', invocationMessage: 'Adding comment', toolInput: addCommentInput('Short note') });
			const invocation = toolCallStateToInvocation(running);
			const completed = createCompletedToolCall({ toolName: 'addComment', toolInput: addCommentInput('Short note'), pastTenseMessage: 'Added comment' });
			finalizeToolInvocation(invocation, completed);
			assert.strictEqual(markdown(invocation.pastTenseMessage).value, markdown(invocation.invocationMessage).value);
		});

		test('falls back to the server message when the input cannot be parsed', () => {
			const tc = createToolCallState({ toolName: 'addComment', invocationMessage: 'Adding comment', toolInput: 'not json' });
			assert.strictEqual(toolCallStateToInvocation(tc).invocationMessage, 'Adding comment');
		});

		test('falls back to the server message when the range is not a valid 1-based range', () => {
			for (const range of [
				{ startLineNumber: 0, startColumn: 1, endLineNumber: 1, endColumn: 1 },
				{ startLineNumber: 1, startColumn: 1.5, endLineNumber: 1, endColumn: 2 },
				{ startLineNumber: -1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
			]) {
				const tc = createToolCallState({ toolName: 'addComment', invocationMessage: 'Adding comment', toolInput: JSON.stringify({ resourceUri: 'file:///workspace/a.ts', range, text: 'hi' }) });
				assert.strictEqual(toolCallStateToInvocation(tc).invocationMessage, 'Adding comment', JSON.stringify(range));
			}
		});
	});

	suite('finalizeToolInvocation', () => {

		test('rewrites markdown links in pastTenseMessage through the agent host scheme', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			rawFinalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'view_file',
				displayName: 'View File',
				invocationMessage: 'Reading file...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: { markdown: 'Read [foo.ts](file:///path/to/foo.ts)' },
			} as ICompletedToolCall, URI.file('/'), 'ssh__macbook-air');

			assert.ok(invocation.pastTenseMessage);
			assert.strictEqual(typeof invocation.pastTenseMessage, 'object');
			const value = (invocation.pastTenseMessage as { value: string }).value;
			assert.strictEqual(value, 'Read [](vscode-agent-host://ssh__macbook-air/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)');
		});

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
			assert.strictEqual(IChatToolInvocation.resultDetails(invocation), undefined);
		});

		test('normalizes LF line endings to CRLF in terminal output for xterm rendering', () => {
			const tc = createToolCallState({
				toolInput: 'grep -n foo',
				status: ToolCallStatus.Running,
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t5', title: 'Terminal' },
				],
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				toolInput: 'grep -n foo',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Ran grep -n foo',
				content: [
					{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal:///t5', title: 'Terminal' },
					{ type: ToolResultContentType.Text, text: 'line1\nline2\r\nline3\n' },
				],
			});

			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandOutput: { text: string } };
			assert.strictEqual(termData.terminalCommandOutput.text, 'line1\r\nline2\r\nline3\r\n');
		});

		test('finalizes generic tool with input/output details', () => {
			const tc = createToolCallState({
				status: ToolCallStatus.Running,
				toolInput: '{"path":"README.md"}',
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				toolInput: '{"path":"README.md"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Read README',
				content: [{ type: ToolResultContentType.Text, text: '# VS Code' }],
			});

			const details = IChatToolInvocation.resultDetails(invocation);
			assertInputOutputDetails(details);
			assert.strictEqual(details.input, '{"path":"README.md"}');
			assert.deepStrictEqual(details.output, [{ type: 'embed', value: '# VS Code', isText: true, mimeType: 'text/plain' }]);
			assert.strictEqual(details.isError, false);
		});

		test('finalizes failed tool with error message', () => {
			const tc = createToolCallState({
				status: ToolCallStatus.Running,
				toolInput: '{"operation":"slow"}',
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				toolInput: '{"operation":"slow"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: false,
				pastTenseMessage: 'Failed',
				error: { message: 'timeout' },
			});

			const details = IChatToolInvocation.resultDetails(invocation);
			assertInputOutputDetails(details);
			assert.strictEqual(details.isError, true);
			assert.deepStrictEqual(details.output, [{ type: 'embed', value: 'timeout', isText: true, mimeType: 'text/plain' }]);
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
			assert.strictEqual(invocation.presentation, ToolInvocationPresentation.Hidden);
			assert.strictEqual(IChatToolInvocation.resultDetails(invocation), undefined);
		});

		test('does not hide presentation when tool with file edits fails', () => {
			const tc = createToolCallState({ status: ToolCallStatus.Running });
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'edit_file',
				displayName: 'Edit File',
				invocationMessage: 'Editing file...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: false,
				pastTenseMessage: 'Failed to edit',
				error: { message: 'write error' },
				content: [{
					type: ToolResultContentType.FileEdit,
					after: {
						uri: URI.file('/home/user/file.ts').toString(),
						content: { uri: 'agenthost-content:///snap/after' },
					},
				}],
			});

			assert.notStrictEqual(invocation.presentation, ToolInvocationPresentation.Hidden);
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

		test('finalized search tool keeps search rendering without generic details', () => {
			const tc = createToolCallState({
				status: ToolCallStatus.Running,
				_meta: { toolKind: 'search' },
				toolInput: '{"query":"terminal"}',
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'search',
				displayName: 'Search',
				invocationMessage: 'Searching...',
				_meta: { toolKind: 'search' },
				toolInput: '{"query":"terminal"}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Searched',
				content: [{ type: ToolResultContentType.Text, text: 'result' }],
			});

			assert.strictEqual(invocation.toolSpecificData?.kind, 'search');
			assert.strictEqual(IChatToolInvocation.resultDetails(invocation), undefined);
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

		test('preserves subagent credits when finalizing', () => {
			const tc = createToolCallState({
				status: ToolCallStatus.Running,
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
			});
			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.credits = 2.5;
				invocation.toolSpecificData.isActive = true;
			}

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'run_subagent',
				displayName: 'Run Subagent',
				invocationMessage: 'Running subagent...',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Ran subagent',
				content: [{
					type: ToolResultContentType.Subagent,
					resource: 'copilot://session/subagent/tc-1',
					title: 'Explore',
					agentName: 'explore',
					description: 'Explores the codebase',
				}, {
					type: ToolResultContentType.Text,
					text: 'Subagent result',
				}],
			} as ICompletedToolCall);

			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				assert.deepStrictEqual({
					credits: invocation.toolSpecificData.credits,
					isActive: invocation.toolSpecificData.isActive,
				}, {
					credits: 2.5,
					isActive: true,
				});
			}
		});
	});

	suite('activeTurnToProgress', () => {

		function createActiveTurnState(responseParts?: ActiveTurn['responseParts']): ActiveTurn {
			return {
				id: 'turn-active',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: message('Do things'),
				responseParts: responseParts ?? [],
				usage: undefined,
			};
		}

		test('empty active turn produces empty progress', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState(), undefined);
			assert.deepStrictEqual(result, []);
		});

		test('includes usage progress from active turn usage', () => {
			const activeTurn = createActiveTurnState();
			activeTurn.usage = { inputTokens: 1000, outputTokens: 250 };

			const result = activeTurnToProgress(URI.file('/'), activeTurn, undefined);
			const usage = result[0] as IChatUsage;
			assert.deepStrictEqual(
				{ kind: usage.kind, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
				{ kind: 'usage', promptTokens: 1000, completionTokens: 250 },
			);
		});

		test('produces markdown content for streamed text', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
				{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Hello world' },
			]), undefined);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'markdownContent');
			assert.strictEqual((result[0] as IChatMarkdownContent).content.value, 'Hello world');
		});

		test('produces system notification for system notification response part', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
				{ kind: ResponsePartKind.SystemNotification, content: 'Shell command completed' },
			]), undefined);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'systemNotification');
			if (result[0].kind !== 'systemNotification') { return; }
			assert.strictEqual(result[0].content.value, 'Shell command completed');
		});

		test('produces thinking progress for reasoning', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
				{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Let me think about this...' },
			]), undefined);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'thinking');
			assert.strictEqual((result[0] as IChatThinkingPart).id, 'r-1');
		});

		test('reasoning comes before streamed text when ordered that way', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
				{ kind: ResponsePartKind.Reasoning, id: 'r-1', content: 'Hmm...' },
				{ kind: ResponsePartKind.Markdown, id: 'md-1', content: 'Result text' },
			]), undefined);
			assert.strictEqual(result.length, 2);
			assert.strictEqual(result[0].kind, 'thinking');
			assert.strictEqual(result[1].kind, 'markdownContent');
		});

		test('serializes completed tool calls', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
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
					} as ToolCallResponsePart['toolCall'],
				},
			]), undefined);
			assert.strictEqual(result.length, 1);
			assert.strictEqual(result[0].kind, 'toolInvocationSerialized');
		});

		test('creates live invocations for running tool calls', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: createToolCallState({
						toolCallId: 'tc-running',
						status: ToolCallStatus.Running,
					}),
				},
			]), undefined);
			assert.strictEqual(result.length, 1);
			// Live ChatToolInvocation - check it has the right toolCallId
			const invocation = result[0] as { toolCallId?: string; kind?: string };
			assert.strictEqual(invocation.toolCallId, 'tc-running');
		});

		test('creates confirmation invocations for pending tool confirmations', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
				{
					kind: ResponsePartKind.ToolCall,
					toolCall: {
						toolCallId: 'tc-pending',
						toolName: 'bash',
						displayName: 'Bash',
						invocationMessage: 'Run command',
						status: ToolCallStatus.PendingConfirmation,
						confirmationTitle: 'Run command',
						riskAssessment: {
							kind: ToolCallRiskAssessmentKind.Judge,
							status: ToolCallRiskAssessmentStatus.Complete,
							reason: 'The command removes a project file.',
							safety: 0.15,
						},
						toolInput: 'echo hello',
					},
				},
			]), undefined);
			assert.strictEqual(result.length, 1);
			// PendingConfirmation tools have input-style specific data (no terminal content yet)
			const invocation = result[0] as IChatToolInvocation;
			assert.ok(invocation.toolSpecificData);
			assert.strictEqual(invocation.toolSpecificData.kind, 'input');
			const state = invocation.state.get();
			assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : undefined, {
				status: 'complete',
				explanation: 'The command removes a project file.',
				safety: 0.15,
			});
		});

		test('creates loading confirmation invocations while judgement is pending', () => {
			const invocation = toolCallStateToInvocation({
				toolCallId: 'tc-judging',
				toolName: 'bash',
				displayName: 'Bash',
				invocationMessage: 'Run command',
				status: ToolCallStatus.PendingConfirmation,
				confirmationTitle: 'Run command',
				riskAssessment: {
					kind: ToolCallRiskAssessmentKind.Judge,
					status: ToolCallRiskAssessmentStatus.Loading,
				},
				toolInput: 'echo hello',
			});
			const state = invocation.state.get();

			assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : undefined, {
				status: 'loading',
			});
		});

		test('updates a rendered confirmation when asynchronous judgement completes', () => {
			const invocation = toolCallStateToInvocation({
				toolCallId: 'tc-judging',
				toolName: 'bash',
				displayName: 'Bash',
				invocationMessage: 'Run command',
				status: ToolCallStatus.PendingConfirmation,
				confirmationTitle: 'Run command',
				riskAssessment: {
					kind: ToolCallRiskAssessmentKind.Judge,
					status: ToolCallRiskAssessmentStatus.Loading,
				},
				toolInput: 'echo hello',
			});

			invocation.updateConfirmationMessages({
				title: 'Run command',
				message: 'Run command',
				approvalReason: {
					status: 'complete',
					explanation: 'This command modifies protected files.',
					safety: 0.1,
				},
			});
			const state = invocation.state.get();

			assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : undefined, {
				status: 'complete',
				explanation: 'This command modifies protected files.',
				safety: 0.1,
			});
		});

		test('preserves create metadata and proposed content for pending file confirmations', () => {
			const invocation = toolCallStateToInvocation({
				toolCallId: 'tc-create',
				toolName: 'write',
				displayName: 'Write',
				invocationMessage: 'Creating package.json',
				status: ToolCallStatus.PendingConfirmation,
				confirmationTitle: 'Create file?',
				edits: {
					items: [{
						after: {
							uri: 'file:///workspace/package.json',
							content: { uri: 'pending-edit-content://session/tc-create/package.json' },
						},
					}],
				},
			});

			assert.deepStrictEqual(invocation.toolSpecificData, {
				kind: 'modifiedFilesConfirmation',
				options: ['Allow'],
				modifiedFiles: [{
					uri: URI.file('/workspace/package.json'),
					editKind: 'create',
					originalUri: undefined,
					modifiedContentUri: toAgentHostUri(URI.parse('pending-edit-content://session/tc-create/package.json'), 'local'),
					originalContentUri: undefined,
					insertions: undefined,
					deletions: undefined,
					title: 'package.json',
					description: '/workspace/package.json',
				}],
			});
		});

		test('includes all parts in correct order', () => {
			const result = activeTurnToProgress(URI.file('/'), createActiveTurnState([
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
			]), undefined);
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
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
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
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
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

		test('uses terminal completion exit code for completed SDK shell tool history', () => {
			const tc = createCompletedToolCall({
				_meta: { toolKind: 'terminal' },
				toolInput: 'gti status',
				content: [
					{ type: ToolResultContentType.Text, text: 'command not found\n<shellId: 104 completed with exit code 127>' },
					{ type: ToolResultContentType.TerminalComplete, exitCode: 127, cwd: URI.file('/repo').toString(), preview: 'preview only\n', truncated: true },
				],
				success: true,
			});

			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			const termData = getSerializedTerminalData(serialized);
			assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
			assert.strictEqual(termData.terminalCommandOutput?.text, 'preview only\r\n');
			assert.strictEqual(termData.terminalCommandOutput?.truncated, true);
			assert.ok(!termData.terminalCommandOutput?.text.includes('shellId'));
		});

		test('strips legacy shell completion marker from terminal fallback output', () => {
			const tc = createCompletedToolCall({
				_meta: { toolKind: 'terminal' },
				toolInput: 'ehco hi',
				content: [
					{ type: ToolResultContentType.Text, text: 'bash: line 1: ehco: command not found\n<shellId: 104 completed with exit code 127>' },
					{ type: ToolResultContentType.TerminalComplete, exitCode: 127, cwd: URI.file('/repo').toString() },
				],
				success: true,
			});

			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			const termData = getSerializedTerminalData(serialized);
			assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
			assert.strictEqual(termData.terminalCommandOutput?.text, 'bash: line 1: ehco: command not found\r\n');
			assert.ok(!termData.terminalCommandOutput?.text.includes('shellId'));
		});

		test('keeps zero terminal completion exit code as success for completed SDK shell tool history', () => {
			const tc = createCompletedToolCall({
				_meta: { toolKind: 'terminal' },
				toolInput: 'pwd',
				content: [
					{ type: ToolResultContentType.Text, text: '/repo\n' },
					{ type: ToolResultContentType.TerminalComplete, exitCode: 0, cwd: URI.file('/repo').toString() },
				],
				success: true,
			});

			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			assert.strictEqual(serialized.toolSpecificData?.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; terminalCommandState?: { exitCode: number } };
			assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
		});

		test('falls back to tool success when terminal completion has no exit code', () => {
			const tc = createCompletedToolCall({
				_meta: { toolKind: 'terminal' },
				toolInput: 'pwd',
				content: [
					{ type: ToolResultContentType.Text, text: '/repo\n' },
					{ type: ToolResultContentType.TerminalComplete, cwd: URI.file('/repo').toString() },
				],
				success: true,
			});

			const turn = createTurn({
				responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc } as ToolCallResponsePart],
			});

			const history = turnsToHistory(URI.file('/'), [turn], 'p');
			const response = history[1];
			assert.strictEqual(response.type, 'response');
			if (response.type !== 'response') { return; }
			const serialized = response.parts[0] as IChatToolInvocationSerialized;
			assert.strictEqual(serialized.toolSpecificData?.kind, 'terminal');
			const termData = serialized.toolSpecificData as { kind: 'terminal'; terminalCommandState?: { exitCode: number } };
			assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
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

		test('finalize uses terminal completion exit code over SDK tool success', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'terminal' },
				toolInput: 'false',
				status: ToolCallStatus.Running,
			});
			const invocation = toolCallStateToInvocation(tc);

			finalizeToolInvocation(invocation, {
				status: ToolCallStatus.Completed,
				toolCallId: 'tc-1',
				toolName: 'bash',
				displayName: 'Run Shell Command',
				invocationMessage: 'Running shell command',
				_meta: { toolKind: 'terminal' },
				toolInput: 'false',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				success: true,
				pastTenseMessage: 'Ran false',
				content: [
					{ type: ToolResultContentType.Text, text: '' },
					{ type: ToolResultContentType.TerminalComplete, exitCode: 1, cwd: URI.file('/repo').toString() },
				],
			});

			assert.strictEqual(invocation.toolSpecificData?.kind, 'terminal');
			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandState?: { exitCode: number } };
			assert.strictEqual(termData.terminalCommandState?.exitCode, 1);
		});

	});

	suite('updateRunningToolSpecificData', () => {

		test('sets subagent toolSpecificData from content and notifies state observers', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
			});
			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');

			// Simulate subagent content arriving via ChatToolCallContentChanged
			const runningTc: ToolCallRunningState = {
				...tc,
				status: ToolCallStatus.Running,
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
				content: [{
					type: ToolResultContentType.Subagent,
					resource: 'copilot://session/subagent/tc-1',
					title: 'Explore',
					agentName: 'explore',
					description: 'Explores the codebase',
				}],
			};

			let stateChanged = false;
			const disposable = autorun(r => {
				invocation.state.read(r);
				stateChanged = true;
			});
			stateChanged = false; // reset after initial read
			const before = invocation.toolSpecificData;

			updateRunningToolSpecificData(invocation, runningTc);

			assert.strictEqual(stateChanged, true, 'state observers should be notified');
			assert.notStrictEqual(invocation.toolSpecificData, before, 'toolSpecificData should be replaced');
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				assert.strictEqual(invocation.toolSpecificData.agentName, 'explore');
				// description is the TASK description from _meta, not the agent description
				assert.strictEqual(invocation.toolSpecificData.description, 'Find related files');
			}
			disposable.dispose();
		});

		test('preserves subagent credits when refreshing toolSpecificData from content', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
			});
			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');

			// Simulate the session handler having recorded this subagent's credits.
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.credits = 1.5;
			}

			const runningTc: ToolCallRunningState = {
				...tc,
				status: ToolCallStatus.Running,
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
				content: [{
					type: ToolResultContentType.Subagent,
					resource: 'copilot://session/subagent/tc-1',
					title: 'Explore',
					agentName: 'explore',
					description: 'Explores the codebase',
				}],
			};

			updateRunningToolSpecificData(invocation, runningTc);

			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				assert.strictEqual(invocation.toolSpecificData.credits, 1.5, 'credits should survive a toolSpecificData refresh');
			}
		});

		test('preserves subagent model name when refreshing toolSpecificData from content', () => {
			const tc = createToolCallState({
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
			});
			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');

			// Simulate the session handler having recorded this subagent's model.
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.modelName = 'Claude Sonnet 4';
			}

			const runningTc: ToolCallRunningState = {
				...tc,
				status: ToolCallStatus.Running,
				_meta: { toolKind: 'subagent', subagentDescription: 'Find related files' },
				content: [{
					type: ToolResultContentType.Subagent,
					resource: 'copilot://session/subagent/tc-1',
					title: 'Explore',
					agentName: 'explore',
					description: 'Explores the codebase',
				}],
			};

			updateRunningToolSpecificData(invocation, runningTc);

			assert.strictEqual(invocation.toolSpecificData?.kind, 'subagent');
			if (invocation.toolSpecificData?.kind === 'subagent') {
				assert.strictEqual(invocation.toolSpecificData.modelName, 'Claude Sonnet 4', 'model name should survive a toolSpecificData refresh');
			}
		});

		test('mounts MCP App toolSpecificData when a confirmed MCP tool starts running', () => {
			// The MCP App channel is present in `_meta.ui` from the first tool
			// state (a tool cannot start until its server is Ready), but the App
			// is only mounted once the tool leaves confirmation and starts
			// running.
			const meta = {
				ui: {
					resourceUri: 'ui://docs/app',
					channel: 'mcp://copilot/test-session-1/docs',
				},
			};
			const invocation = toolCallStateToInvocation({
				toolCallId: 'tc-1',
				toolName: 'test_tool',
				displayName: 'Test Tool',
				invocationMessage: 'Running test tool...',
				status: ToolCallStatus.PendingConfirmation,
				toolInput: '{"topic":"metadata"}',
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'docs-customization' },
				_meta: meta,
			});
			// Confirmation state carries the raw input but does not mount the App.
			assert.deepStrictEqual(invocation.toolSpecificData, { kind: 'input', rawInput: { topic: 'metadata' } });

			let stateChanged = false;
			const disposable = autorun(r => {
				invocation.state.read(r);
				stateChanged = true;
			});
			stateChanged = false;

			updateRunningToolSpecificData(invocation, createToolCallState({
				toolInput: '{"topic":"metadata"}',
				contributor: { kind: ToolCallContributorKind.MCP, customizationId: 'docs-customization' },
				_meta: meta,
			}));

			assert.strictEqual(stateChanged, true, 'state observers should be notified');
			assert.deepStrictEqual(invocation.toolSpecificData, {
				kind: 'input',
				rawInput: { topic: 'metadata' },
				mcpAppData: {
					kind: 'agentHost',
					resourceUri: 'ui://docs/app',
					serverId: 'docs-customization',
					channel: 'mcp://copilot/test-session-1/docs',
				},
			});
			disposable.dispose();
		});

		test('does not notify when no subagent content is present', () => {
			const tc = createToolCallState({});
			const invocation = toolCallStateToInvocation(tc);
			const originalData = invocation.toolSpecificData;

			const runningTc: ToolCallRunningState = {
				...tc,
				status: ToolCallStatus.Running,
			};

			updateRunningToolSpecificData(invocation, runningTc);
			assert.strictEqual(invocation.toolSpecificData, originalData, 'toolSpecificData should not change');
		});

		test('refreshes terminal output as text content streams (built-in bash)', () => {
			const tc = createToolCallState({
				toolName: 'bash',
				toolInput: 'sleep 1; echo hi',
				_meta: { toolKind: 'terminal' },
			});
			const invocation = toolCallStateToInvocation(tc);
			assert.strictEqual(invocation.toolSpecificData?.kind, 'terminal');
			assert.strictEqual((invocation.toolSpecificData as { terminalCommandOutput?: { text: string } }).terminalCommandOutput, undefined);

			const runningTc: ToolCallRunningState = {
				...tc,
				status: ToolCallStatus.Running,
				content: [{ type: ToolResultContentType.Text, text: 'hi\n' }],
			};

			updateRunningToolSpecificData(invocation, runningTc);
			const termData = invocation.toolSpecificData as { kind: 'terminal'; terminalCommandOutput?: { text: string } };
			assert.strictEqual(termData.kind, 'terminal');
			assert.strictEqual(termData.terminalCommandOutput?.text, 'hi\r\n');
		});

		test('preserves AHP terminal fields (terminalToolSessionId, terminalCommandUri) when refreshing output', () => {
			// Simulates the race where `_reviveTerminalIfNeeded` has populated
			// AHP terminal fields and a subsequent content change triggers
			// `updateRunningToolSpecificData`. The async-populated fields
			// must survive the refresh.
			const tc = createToolCallState({
				toolName: 'bash',
				toolInput: 'echo hi',
				_meta: { toolKind: 'terminal' },
			});
			const invocation = toolCallStateToInvocation(tc);
			const reviveUri = URI.parse('agenthost-terminal:///t9');
			invocation.toolSpecificData = {
				kind: 'terminal',
				commandLine: { original: 'echo hi' },
				language: 'shellscript',
				terminalToolSessionId: 'session-id-from-revive',
				terminalCommandUri: reviveUri,
				terminalCommandId: 'cmd-id-from-revive',
			};

			const runningTc: ToolCallRunningState = {
				...tc,
				status: ToolCallStatus.Running,
				content: [{ type: ToolResultContentType.Text, text: 'hi\n' }],
			};

			updateRunningToolSpecificData(invocation, runningTc);
			const termData = invocation.toolSpecificData as {
				kind: 'terminal';
				terminalToolSessionId?: string;
				terminalCommandUri?: URI;
				terminalCommandId?: string;
				terminalCommandOutput?: { text: string };
			};
			assert.strictEqual(termData.terminalToolSessionId, 'session-id-from-revive');
			assert.strictEqual(termData.terminalCommandUri, reviveUri);
			assert.strictEqual(termData.terminalCommandId, 'cmd-id-from-revive');
			assert.strictEqual(termData.terminalCommandOutput?.text, 'hi\r\n');
		});
	});

	suite('usageInfoToQuotas', () => {

		test('returns undefined when no quota snapshots present', () => {
			assert.strictEqual(usageInfoToQuotas(undefined), undefined);
			assert.strictEqual(usageInfoToQuotas({ inputTokens: 10 }), undefined);
			assert.strictEqual(usageInfoToQuotas({ _meta: { cost: 1 } }), undefined);
		});

		test('maps premium and chat snapshots, deriving additional usage and reset date', () => {
			const result = usageInfoToQuotas({
				_meta: {
					quotaSnapshots: {
						premium_interactions: {
							isUnlimitedEntitlement: false,
							entitlementRequests: 300,
							usedRequests: 75,
							remainingPercentage: 75,
							overage: 1.5,
							overageAllowedWithExhaustedQuota: true,
							resetDate: '2026-07-01T00:00:00.000Z',
						},
						chat: {
							isUnlimitedEntitlement: true,
							entitlementRequests: -1,
							usedRequests: 10,
							remainingPercentage: 100,
						},
					},
				},
			});

			assert.deepStrictEqual(result, {
				premiumChat: {
					percentRemaining: 75,
					unlimited: false,
					entitlement: 300,
					quotaRemaining: 225,
					resetAt: Date.parse('2026-07-01T00:00:00.000Z'),
				},
				chat: {
					percentRemaining: 100,
					unlimited: true,
					entitlement: undefined,
					quotaRemaining: undefined,
					resetAt: undefined,
				},
				additionalUsageEnabled: true,
				additionalUsageCount: 1.5,
				resetDate: '2026-07-01T00:00:00.000Z',
			});
		});

		test('skips categories with no allocated entitlement', () => {
			const result = usageInfoToQuotas({
				_meta: {
					quotaSnapshots: {
						premium_interactions: {
							isUnlimitedEntitlement: false,
							entitlementRequests: 0,
							usedRequests: 0,
							remainingPercentage: 0,
							overage: 0,
							overageAllowedWithExhaustedQuota: false,
						},
					},
				},
			});

			// The 0-entitlement premium snapshot is skipped, but additional-usage fields are still derived.
			assert.deepStrictEqual(result, {
				additionalUsageEnabled: false,
				additionalUsageCount: 0,
			});
		});

		test('skips a category whose remainingPercentage is missing', () => {
			const result = usageInfoToQuotas({
				_meta: {
					quotaSnapshots: {
						chat: {
							isUnlimitedEntitlement: false,
							entitlementRequests: 100,
							usedRequests: 10,
							// remainingPercentage intentionally absent — must not masquerade as exhausted (0%).
						},
					},
				},
			});

			assert.strictEqual(result, undefined);
		});
	});

	suite('formatTurnResponseDetails', () => {

		const auto = { name: 'Auto' };

		test('appends the billed model id when one is supplied', () => {
			// A pick whose billed model is unregistered (e.g. "Auto" billed as "raptor-mini") shows "Auto (raptor-mini)".
			const result = {
				resolvedModel: formatTurnResponseDetails(auto, 'raptor-mini', undefined),
				withPricing: formatTurnResponseDetails({ ...auto, pricing: '0x' }, 'raptor-mini', undefined),
				withCredits: formatTurnResponseDetails(auto, 'raptor-mini', { _meta: { cost: 2 } }),
				oneCredit: formatTurnResponseDetails(auto, 'raptor-mini', { _meta: { cost: 1 } }),
				noBilledModel: formatTurnResponseDetails(auto, undefined, undefined),
			};

			assert.deepStrictEqual(result, {
				resolvedModel: 'Auto (raptor-mini)',
				withPricing: 'Auto (raptor-mini) · 0x',
				withCredits: 'Auto (raptor-mini) • 2 credits',
				oneCredit: 'Auto (raptor-mini) • 1 credit',
				noBilledModel: 'Auto',
			});
		});

		test('uses the registered model name as-is without a billed id, undefined when unknown', () => {
			const sonnet = { name: 'Claude Sonnet 4.5', pricing: '1x' };
			const result = {
				concrete: formatTurnResponseDetails(sonnet, undefined, undefined),
				concreteWithCredits: formatTurnResponseDetails(sonnet, undefined, { _meta: { cost: 2 } }),
				unknown: formatTurnResponseDetails(undefined, 'raptor-mini', { _meta: { cost: 2 } }),
			};

			assert.deepStrictEqual(result, {
				concrete: 'Claude Sonnet 4.5 · 1x',
				concreteWithCredits: 'Claude Sonnet 4.5 • 2 credits',
				unknown: undefined,
			});
		});
	});
});
