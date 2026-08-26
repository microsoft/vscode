/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { readAgentMessageDelegationMeta } from '../../../common/meta/agentMessageDelegationMeta.js';
import { SessionServerToolName } from '../../../common/serverToolNames.js';
import { replayThreadToTurns } from '../../../node/codex/codexReplayMapper.js';
import { getTurnError, MessageKind, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState, type ModelSelection } from '../../../common/state/sessionState.js';

suite('codexReplayMapper', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty thread → no turns', () => {
		const turns = replayThreadToTurns({ id: 'thr', turns: [] } as never);
		assert.deepStrictEqual(turns, []);
	});

	test('thread with one user/agent exchange → one Turn', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'hi', text_elements: [] }] },
					{ type: 'agentMessage', id: 'a1', text: 'hello back', phase: null, memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].id, 'turn_a');
		assert.strictEqual(turns[0].message.text, 'hi');
		assert.strictEqual(turns[0].state, TurnState.Complete);
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0];
		assert.strictEqual(part.kind, ResponsePartKind.Markdown);
		assert.strictEqual((part as { content: string }).content, 'hello back');
	});

	test('restored turn carries its original model on the request and response usage', () => {
		const model: ModelSelection = { id: 'codex-model:openai:gpt-5.6-sol' };
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'hi', text_elements: [] }] },
					{ type: 'agentMessage', id: 'a1', text: 'hello back', phase: null, memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never, new Map([['turn_a', model]]));

		assert.deepStrictEqual({
			messageModel: turns[0].message.model,
			usage: turns[0].usage,
		}, {
			messageModel: model,
			usage: { model: model.id },
		});
	});

	test('restores delegated user messages as visible prompts with source provenance', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [{
					type: 'userMessage',
					id: 'u1',
					content: [{
						type: 'text',
						text: '<codex_delegation><source_thread_id>source-thread</source_thread_id><input>Open &lt;the control&gt;.</input></codex_delegation>',
						text_elements: [],
					}],
				}],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never);

		assert.deepStrictEqual({
			text: turns[0].message.text,
			delegation: readAgentMessageDelegationMeta(turns[0].message),
		}, {
			text: 'Open <the control>.',
			delegation: { sourceThreadId: 'source-thread' },
		});
	});

	test('restores create-thread outcomes as one link tool and removes the matching directive', () => {
		const targetThreadId = '019ff590-65e5-7940-943f-d2a8718c358b';
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Create another chat', text_elements: [] }] },
					{
						type: 'dynamicToolCall',
						id: 'tool-1',
						namespace: 'codex_app',
						tool: 'create_thread',
						arguments: { prompt: 'Remember this word: capybara', target: { type: 'projectless' } },
						status: 'completed',
						contentItems: [
							{ type: 'inputText', text: 'Script completed' },
							{ type: 'inputText', text: JSON.stringify({ threadId: targetThreadId, hostId: 'local' }) },
						],
						success: true,
						durationMs: 300,
					},
					{
						type: 'agentMessage',
						id: 'a1',
						text: `Created another chat.\n\n::created-thread{threadId="${targetThreadId}"}`,
						phase: 'final_answer',
						memoryCitation: null,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never);
		const toolPart = turns[0].responseParts.find(part => part.kind === ResponsePartKind.ToolCall);
		const markdownPart = turns[0].responseParts.find(part => part.kind === ResponsePartKind.Markdown);
		const toolCall = toolPart?.kind === ResponsePartKind.ToolCall && toolPart.toolCall.status === ToolCallStatus.Completed ? toolPart.toolCall : undefined;

		assert.deepStrictEqual({
			partKinds: turns[0].responseParts.map(part => part.kind),
			toolName: toolCall?.toolName,
			toolInput: toolCall?.toolInput,
			toolOutput: toolCall?.content,
			markdown: markdownPart?.kind === ResponsePartKind.Markdown ? markdownPart.content : undefined,
		}, {
			partKinds: [ResponsePartKind.ToolCall, ResponsePartKind.Markdown],
			toolName: SessionServerToolName.CreateSession,
			toolInput: JSON.stringify({ prompt: 'Remember this word: capybara', target: { type: 'projectless' } }, null, 2),
			toolOutput: [{ type: 'text', text: `agent-host-session://codex/${targetThreadId}` }],
			markdown: 'Created another chat.',
		});
	});

	test('restores send-message outcomes as links to the target thread', () => {
		const targetThreadId = 'target-thread';
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Send foo', text_elements: [] }] },
					{
						type: 'dynamicToolCall',
						id: 'tool-1',
						namespace: 'codex_app',
						tool: 'send_message_to_thread',
						arguments: { threadId: targetThreadId, prompt: 'foo' },
						status: 'completed',
						contentItems: [{ type: 'inputText', text: JSON.stringify({ threadId: targetThreadId }) }],
						success: true,
						durationMs: 300,
					},
					{ type: 'agentMessage', id: 'a1', text: 'Sent “foo” to that chat.', phase: 'final_answer', memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never);
		const toolPart = turns[0].responseParts.find(part => part.kind === ResponsePartKind.ToolCall);
		const toolCall = toolPart?.kind === ResponsePartKind.ToolCall && toolPart.toolCall.status === ToolCallStatus.Completed ? toolPart.toolCall : undefined;

		assert.deepStrictEqual({
			toolName: toolCall?.toolName,
			toolOutput: toolCall?.content,
		}, {
			toolName: SessionServerToolName.SendMessage,
			toolOutput: [{ type: 'text', text: `agent-host-session://codex/${targetThreadId}` }],
		});
	});

	test('restores rollout thread operations when thread/read omits their tool items', () => {
		const targetThreadId = 'target-thread';
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn-create',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Create another chat', text_elements: [] }] },
					{
						type: 'agentMessage',
						id: 'a1',
						text: `Created another chat.\n\n::created-thread{threadId="${targetThreadId}"}`,
						phase: 'final_answer',
						memoryCitation: null,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}, {
				id: 'turn-send',
				items: [
					{ type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'Send foo', text_elements: [] }] },
					{ type: 'agentMessage', id: 'a2', text: 'Sent “foo” to that chat.', phase: 'final_answer', memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never, undefined, new Map([
			['turn-create', [{
				toolName: SessionServerToolName.CreateSession,
				targetThreadId,
				openLink: `agent-host-session://codex/${targetThreadId}`,
				toolInput: { prompt: 'Remember capybara' },
			}]],
			['turn-send', [{
				toolName: SessionServerToolName.SendMessage,
				targetThreadId,
				openLink: `agent-host-session://codex/${targetThreadId}`,
				toolInput: { prompt: 'foo' },
			}]],
		]));

		assert.deepStrictEqual(turns.map(turn => ({
			markdown: turn.responseParts.filter(part => part.kind === ResponsePartKind.Markdown).map(part => part.content),
			tools: turn.responseParts.filter(part => part.kind === ResponsePartKind.ToolCall).map(part => part.toolCall.toolName),
		})), [{
			markdown: ['Created another chat.'],
			tools: [SessionServerToolName.CreateSession],
		}, {
			markdown: ['Sent “foo” to that chat.'],
			tools: [SessionServerToolName.SendMessage],
		}]);
	});

	test('keeps create and send outcomes to the same target while deduplicating equivalent replay data', () => {
		const targetThreadId = 'target-thread';
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn-a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Create and message a chat', text_elements: [] }] },
					{
						type: 'dynamicToolCall',
						id: 'create-tool',
						namespace: 'codex_app',
						tool: 'create_thread',
						arguments: { prompt: 'Remember capybara' },
						status: 'completed',
						contentItems: [{ type: 'inputText', text: JSON.stringify({ threadId: targetThreadId }) }],
						success: true,
						durationMs: 100,
					},
					{
						type: 'dynamicToolCall',
						id: 'send-tool',
						namespace: 'codex_app',
						tool: 'send_message_to_thread',
						arguments: { threadId: targetThreadId, prompt: 'foo' },
						status: 'completed',
						contentItems: [{ type: 'inputText', text: JSON.stringify({ threadId: targetThreadId }) }],
						success: true,
						durationMs: 100,
					},
					{
						type: 'agentMessage',
						id: 'a1',
						text: `Done.\n\n::created-thread{threadId="${targetThreadId}"}`,
						phase: 'final_answer',
						memoryCitation: null,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never, undefined, new Map([['turn-a', [{
			toolName: SessionServerToolName.CreateSession,
			targetThreadId,
			openLink: `agent-host-session://codex/${targetThreadId}`,
			toolInput: { prompt: 'Remember capybara' },
		}]]]));

		assert.deepStrictEqual({
			tools: turns[0].responseParts
				.filter(part => part.kind === ResponsePartKind.ToolCall)
				.map(part => part.toolCall.toolName),
			markdown: turns[0].responseParts
				.filter(part => part.kind === ResponsePartKind.Markdown)
				.map(part => part.content),
		}, {
			tools: [SessionServerToolName.CreateSession, SessionServerToolName.SendMessage],
			markdown: ['Done.'],
		});
	});

	test('uses a directive fallback but leaves directive examples inside code fences unchanged', () => {
		const targetThreadId = 'target-thread';
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Create another chat', text_elements: [] }] },
					{
						type: 'agentMessage',
						id: 'a1',
						text: [
							'Created another chat.',
							'',
							`::created-thread{threadId="${targetThreadId}"}`,
							'',
							'```text',
							'::created-thread{threadId="example-only"}',
							'```typescript',
							'::created-thread{threadId="after-info-string"}',
							'',
							'',
							'',
							'    ::created-thread{threadId="indented-example"}',
							'```',
							'',
							'    ::created-thread{threadId="indented-outside"}',
						].join('\n'),
						phase: 'final_answer',
						memoryCitation: null,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never);
		const toolParts = turns[0].responseParts.filter(part => part.kind === ResponsePartKind.ToolCall);
		const markdownPart = turns[0].responseParts.find(part => part.kind === ResponsePartKind.Markdown);

		assert.deepStrictEqual({
			toolCount: toolParts.length,
			toolName: toolParts[0]?.kind === ResponsePartKind.ToolCall ? toolParts[0].toolCall.toolName : undefined,
			markdown: markdownPart?.kind === ResponsePartKind.Markdown ? markdownPart.content : undefined,
		}, {
			toolCount: 1,
			toolName: SessionServerToolName.CreateSession,
			markdown: [
				'Created another chat.',
				'',
				'```text',
				'::created-thread{threadId="example-only"}',
				'```typescript',
				'::created-thread{threadId="after-info-string"}',
				'',
				'',
				'',
				'    ::created-thread{threadId="indented-example"}',
				'```',
				'',
				'    ::created-thread{threadId="indented-outside"}',
			].join('\n'),
		});
	});

	test('ignores similarly named dynamic tools from other namespaces', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn-a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'Call another tool', text_elements: [] }] },
					{
						type: 'dynamicToolCall',
						id: 'tool-1',
						namespace: 'other_app',
						tool: 'send_message_to_thread',
						arguments: { threadId: 'target-thread', prompt: 'foo' },
						status: 'completed',
						contentItems: [{ type: 'inputText', text: JSON.stringify({ threadId: 'target-thread' }) }],
						success: true,
						durationMs: 100,
					},
					{ type: 'agentMessage', id: 'a1', text: 'Done.', phase: 'final_answer', memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null,
				completedAt: null,
				durationMs: null,
			}],
		} as never);

		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind), [ResponsePartKind.Markdown]);
	});

	test('restores turn timing from the persisted codex thread', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'hi', text_elements: [] }] }],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: 1785060000, completedAt: null, durationMs: 4200,
			}, {
				id: 'turn_b',
				items: [{ type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'again', text_elements: [] }] }],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: 1785060100, completedAt: 1785060103, durationMs: null,
			}, {
				id: 'turn_c',
				items: [{ type: 'userMessage', id: 'u3', content: [{ type: 'text', text: 'legacy', text_elements: [] }] }],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn_a', startedAt: '2026-07-26T10:00:00.000Z', duration: 4200 },
			{ id: 'turn_b', startedAt: '2026-07-26T10:01:40.000Z', duration: 3000 },
			{ id: 'turn_c', startedAt: undefined, duration: undefined },
		]);
	});

	test('failed turn maps to TurnState.Error', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'q', text_elements: [] }] },
				],
				itemsView: { type: 'full' } as never,
				status: 'failed' as never,
				error: { message: 'oops' } as never,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			error: getTurnError(turn),
			errorPartCount: turn.responseParts.filter(part => part.kind === ResponsePartKind.Error).length,
		})), [{
			state: TurnState.Error,
			error: { errorType: 'CodexError', message: 'oops' },
			errorPartCount: 1,
		}]);
	});

	test('turn with no recognizable items is dropped', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'plan', id: 'p', text: 'planning' } as never,
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null,
				startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.deepStrictEqual(turns, []);
	});

	test('multi-turn thread preserves order', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [
				{
					id: 't1',
					items: [
						{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'first', text_elements: [] }] },
						{ type: 'agentMessage', id: 'a', text: 'one', phase: null, memoryCitation: null },
					],
					itemsView: { type: 'full' } as never,
					status: 'completed' as never,
					error: null, startedAt: null, completedAt: null, durationMs: null,
				},
				{
					id: 't2',
					items: [
						{ type: 'userMessage', id: 'u2', content: [{ type: 'text', text: 'second', text_elements: [] }] },
						{ type: 'agentMessage', id: 'a2', text: 'two', phase: null, memoryCitation: null },
					],
					itemsView: { type: 'full' } as never,
					status: 'completed' as never,
					error: null, startedAt: null, completedAt: null, durationMs: null,
				},
			],
		} as never);
		assert.deepStrictEqual(turns.map(t => t.id), ['t1', 't2']);
	});

	test('adjacent agentMessages in a turn are separated so a heading keeps its own line', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'go on', text_elements: [] }] },
					{ type: 'agentMessage', id: 'm1', text: 'Consolidating the recommendation and tradeoffs.', phase: null, memoryCitation: null },
					{ type: 'agentMessage', id: 'm2', text: '## Conclusion\n\nDone.', phase: null, memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		// History replay emits one markdownContent per Markdown part; the chat
		// model coalesces adjacent ones by plain concatenation, so the joined
		// text must keep `## Conclusion` at the start of a line.
		const joined = turns[0].responseParts
			.map(part => part.kind === ResponsePartKind.Markdown ? (part as { content: string }).content : '')
			.join('');
		assert.strictEqual(joined, 'Consolidating the recommendation and tradeoffs.\n\n## Conclusion\n\nDone.');
	});

	test('commandExecution renders a completed terminal tool call', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'run it', text_elements: [] }] },
					{
						type: 'commandExecution', id: 'c1',
						command: '/bin/zsh -lc \'ls -la\'', cwd: '/tmp', processId: null,
						source: 'agent', status: 'completed',
						commandActions: [], aggregatedOutput: 'total 0', exitCode: 0, durationMs: 5,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0] as { kind: ResponsePartKind; toolCall: { toolName: string; invocationMessage: string; pastTenseMessage: string; success: boolean; content?: { text: string }[] } };
		assert.deepStrictEqual({
			kind: part.kind,
			toolName: part.toolCall.toolName,
			invocationMessage: part.toolCall.invocationMessage,
			pastTenseMessage: part.toolCall.pastTenseMessage,
			success: part.toolCall.success,
			output: part.toolCall.content?.[0].text,
		}, {
			kind: ResponsePartKind.ToolCall,
			toolName: 'shell',
			invocationMessage: 'ls -la',
			pastTenseMessage: 'Ran `ls -la`',
			success: true,
			output: 'total 0',
		});
	});

	test('imageGeneration restores its generated image', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'draw it', text_elements: [] }] },
					{ type: 'imageGeneration', id: 'image_1', status: 'completed', revisedPrompt: 'A watercolor fox', result: 'aW1hZ2U=' },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		const part = turns[0].responseParts[0];
		assert.deepStrictEqual(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
			toolName: part.toolCall.toolName,
			displayName: part.toolCall.displayName,
			toolInput: part.toolCall.toolInput,
			success: part.toolCall.success,
			pastTenseMessage: part.toolCall.pastTenseMessage,
			content: part.toolCall.content,
		} : undefined, {
			toolName: 'image_gen.imagegen',
			displayName: 'Generate image',
			toolInput: '{"prompt":"A watercolor fox"}',
			success: true,
			pastTenseMessage: 'Generated image',
			content: [{ type: ToolResultContentType.EmbeddedResource, data: 'aW1hZ2U=', contentType: 'image/png' }],
		});
	});

	test('contextCompaction is restored as a completed /compact turn', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_compact',
				items: [{ type: 'contextCompaction', id: 'compact_1' }],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		const part = turns[0].responseParts[0];

		assert.deepStrictEqual({
			message: turns[0].message,
			kind: part.kind,
			toolCall: part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
				status: part.toolCall.status,
				toolName: part.toolCall.toolName,
				displayName: part.toolCall.displayName,
				invocationMessage: part.toolCall.invocationMessage,
				pastTenseMessage: part.toolCall.pastTenseMessage,
				success: part.toolCall.success,
			} : undefined,
		}, {
			message: { text: '/compact', origin: { kind: MessageKind.User } },
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolName: 'compact',
				displayName: 'Compact conversation',
				invocationMessage: 'Compacting conversation',
				pastTenseMessage: 'Compacted conversation',
				success: true,
			},
		});
	});

	test('automatic contextCompaction remains progress within its existing turn', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_auto_compact',
				items: [
					{ type: 'userMessage', id: 'u1', content: [{ type: 'text', text: 'continue', text_elements: [] }] },
					{ type: 'contextCompaction', id: 'compact_1' },
					{ type: 'agentMessage', id: 'a1', text: 'continued', phase: null, memoryCitation: null },
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);

		assert.strictEqual(turns.length, 1);
		assert.strictEqual(turns[0].message.text, 'continue');
		assert.deepStrictEqual(turns[0].responseParts.map(part => part.kind), [
			ResponsePartKind.ToolCall,
			ResponsePartKind.Markdown,
		]);
	});

	test('commandExecution coalesces a sandbox pre-flight with its re-run into one box', () => {
		const turns = replayThreadToTurns({
			id: 'thr',
			turns: [{
				id: 'turn_a',
				items: [
					{ type: 'userMessage', id: 'u', content: [{ type: 'text', text: 'curl it', text_elements: [] }] },
					// Pre-flight: same command, no output, success → deferred.
					{
						type: 'commandExecution', id: 'pre',
						command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
						source: 'agent', status: 'completed',
						commandActions: [], aggregatedOutput: '', exitCode: 0, durationMs: 3,
					},
					// Escalated re-run: same command, real output.
					{
						type: 'commandExecution', id: 'esc',
						command: 'curl -s https://example.com', cwd: '/tmp', processId: null,
						source: 'agent', status: 'completed',
						commandActions: [], aggregatedOutput: 'Example Domain', exitCode: 0, durationMs: 30,
					},
				],
				itemsView: { type: 'full' } as never,
				status: 'completed' as never,
				error: null, startedAt: null, completedAt: null, durationMs: null,
			}],
		} as never);
		assert.strictEqual(turns.length, 1);
		// Exactly one box — the pre-flight is coalesced away.
		assert.strictEqual(turns[0].responseParts.length, 1);
		const part = turns[0].responseParts[0] as { toolCall: { content?: { text: string }[] } };
		assert.strictEqual(part.toolCall.content?.[0].text, 'Example Domain');
	});
});
