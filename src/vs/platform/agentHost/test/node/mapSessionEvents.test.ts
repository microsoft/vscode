/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { MessageAttachmentKind, ResponsePartKind, TurnState, type ResponsePart } from '../../common/state/sessionState.js';
import { mapSessionEvents } from '../../node/copilot/mapSessionEvents.js';
import { toSessionEvents, type ISessionEvent } from './copilotTestEvents.js';

suite('mapSessionEvents — history replay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');

	function partKinds(parts: readonly ResponsePart[]): Array<{ kind: ResponsePartKind; content?: string }> {
		return parts.map(p => p.kind === ResponsePartKind.Markdown ? { kind: p.kind, content: p.content } : { kind: p.kind });
	}

	test('task_complete with a summary renders as a markdown part, not a tool call', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Working on it.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: { summary: 'Done. All good.' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.Markdown, content: 'Working on it.' },
			{ kind: ResponsePartKind.Markdown, content: '\n\n**Task completed:** Done. All good.' },
		]);
	});

	test('task_complete without a summary renders nothing', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'All set.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: {} } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.Markdown, content: 'All set.' },
		]);
	});

	test('a regular tool still renders as a tool call', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo hi' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'hi\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
		]);
	});

	test('restores best-effort model, fallback agent, and attachments onto user messages', async () => {
		const events: ISessionEvent[] = [
			{ type: 'session.model_change', data: { newModel: 'opus-4.7' } },
			{ type: 'subagent.selected', data: { agentName: 'reviewer', agentDisplayName: 'Reviewer', tools: null } },
			{
				type: 'user.message',
				data: {
					interactionId: 'm1',
					content: 'hi',
					attachments: [{
						type: 'file',
						path: '/tmp/example.ts',
						displayName: 'example.ts',
					}],
				}
			},
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'hello' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), {
			model: { id: 'fallback-model' },
			agent: { uri: 'fallback-agent' },
		});

		assert.deepStrictEqual({
			model: turns[0].message.model,
			agent: turns[0].message.agent,
			attachments: turns[0].message.attachments?.map(a => ({
				type: a.type,
				uri: a.type === MessageAttachmentKind.Resource ? a.uri : undefined,
				label: a.label,
			})),
		}, {
			model: { id: 'opus-4.7' },
			agent: { uri: 'fallback-agent' },
			attachments: [{
				type: MessageAttachmentKind.Resource,
				uri: 'file:///tmp/example.ts',
				label: 'example.ts',
			}],
		});
	});

	test('ignores empty assistant messages between model rounds', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Investigate this issue' } },
			{ type: 'assistant.message', id: 'tool-round', data: { interactionId: 'interaction-1', content: 'I will investigate.', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo investigating' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'investigating\n' } } },
			{ type: 'assistant.message', id: 'empty-round', data: { interactionId: 'interaction-1', content: '', toolRequests: [], reasoningOpaque: 'opaque-reasoning' } },
			{ type: 'assistant.message', id: 'final-round', data: { interactionId: 'interaction-1', content: 'Investigation complete.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: 'Investigate this issue',
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'I will investigate.' },
				{ kind: ResponsePartKind.ToolCall },
				{ kind: ResponsePartKind.Markdown, content: 'Investigation complete.' },
			],
		}]);
	});
});

suite('mapSessionEvents — subagent routing', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');

	function partKinds(parts: readonly ResponsePart[]): Array<{ kind: ResponsePartKind; content?: string }> {
		return parts.map(p => p.kind === ResponsePartKind.Markdown ? { kind: p.kind, content: p.content } : { kind: p.kind });
	}

	// The SDK migrated subagent correlation from the deprecated
	// `data.parentToolCallId` to an envelope-level `agentId`. Newer session
	// logs only carry `agentId`, so the replay path must route those events
	// into the subagent transcript rather than leaking them into the parent.
	test('routes subagent events tagged with envelope agentId into the subagent transcript', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			// Inner subagent message + tool call, tagged only with the
			// envelope-level agentId (no data.parentToolCallId).
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: '', toolRequests: [{ toolCallId: 'tc-inner', name: 'bash' }] } },
			{ type: 'tool.execution_start', agentId: 'agent-1', data: { toolCallId: 'tc-inner', toolName: 'bash', arguments: { command: 'ls' } } },
			{ type: 'tool.execution_complete', agentId: 'agent-1', data: { toolCallId: 'tc-inner', success: true, result: { content: 'a\nb\n' } } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm4', content: 'Subagent is done.' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true } },
			{ type: 'assistant.message', data: { messageId: 'm5', content: 'Here is what the subagent found.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		// The parent transcript must contain exactly the user turn with the
		// task tool call and the final parent assistant message — the
		// subagent's inner message must NOT appear as an extra turn.
		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
			{ kind: ResponsePartKind.Markdown, content: 'Here is what the subagent found.' },
		]);

		// The subagent's inner content is routed to its own transcript keyed
		// by the parent task tool call id.
		const subagentTurns = subagentTurnsByToolCallId.get('tc-task');
		assert.ok(subagentTurns, 'Expected subagent turns for tc-task');
		assert.strictEqual(subagentTurns!.length, 1);
		assert.deepStrictEqual(partKinds(subagentTurns![0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
			{ kind: ResponsePartKind.Markdown, content: 'Subagent is done.' },
		]);
	});
});
