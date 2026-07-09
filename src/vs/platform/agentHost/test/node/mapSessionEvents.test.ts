/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState, type ResponsePart, type StringOrMarkdown, type ToolCallResponsePart } from '../../common/state/sessionState.js';
import { mapSessionEvents } from '../../node/copilot/mapSessionEvents.js';
import { toSessionEvents, type ISessionEvent } from './copilotTestEvents.js';

suite('mapSessionEvents — history replay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');

	function partKinds(parts: readonly ResponsePart[]): Array<{ kind: ResponsePartKind; content?: StringOrMarkdown }> {
		return parts.map(p => p.kind === ResponsePartKind.Markdown || p.kind === ResponsePartKind.SystemNotification ? { kind: p.kind, content: p.content } : { kind: p.kind });
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

	test('fallback task_complete marks the turn complete', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'finish the task' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'All done.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete', arguments: { summary: 'Finished.' } }] } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'All done.' },
				{ kind: ResponsePartKind.Markdown, content: '\n\n**Task completed:** Finished.' },
			],
		}]);
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

	test('derives shell tool intention from the description argument on replay', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'ls', description: 'List files in the repo root' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'a\nb\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.strictEqual(part.toolCall.intention, 'List files in the repo root');
	});

	test('maps SDK shell_exit content to terminal completion on replayed tool completion', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo hi' } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'hi\n',
						contents: [{ type: 'shell_exit', shellId: '0', exitCode: 0, cwd: '/repo', outputPreview: 'hi\n' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.deepStrictEqual(part.toolCall.content, [
			{ type: ToolResultContentType.Text, text: 'hi\n' },
			{ type: ToolResultContentType.TerminalComplete, exitCode: 0, cwd: URI.file('/repo').toString(), preview: 'hi\n' },
		]);
	});

	test('preserves non-zero terminal completion even when SDK tool completion succeeded', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'gti status' } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'command not found\n',
						contents: [{ type: 'shell_exit', shellId: '0', exitCode: 127, cwd: '/repo' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.strictEqual(part.toolCall.success, true);
		assert.ok(part.toolCall.content?.some(content => content.type === ToolResultContentType.TerminalComplete && content.exitCode === 127));
		assert.ok(!part.toolCall.content?.some(content => content.type === ToolResultContentType.Terminal));
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

	test('uses top-level user messages as turn boundaries', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event-1', data: { interactionId: 'interaction-1', content: 'Investigate this issue' } },
			{ type: 'assistant.message', id: 'initial-round', data: { interactionId: 'interaction-1', content: 'I found a likely cause.', toolRequests: [] } },
			{ type: 'assistant.message', id: 'tool-round', data: { interactionId: 'interaction-2', content: 'I will verify it.', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo investigating' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'investigating\n' } } },
			{ type: 'assistant.message', id: 'empty-round', data: { interactionId: 'interaction-2', content: '', toolRequests: [], reasoningOpaque: 'opaque-reasoning' } },
			{ type: 'assistant.message', id: 'final-round', data: { interactionId: 'interaction-2', content: 'Investigation complete.', toolRequests: [] } },
			{ type: 'user.message', id: 'user-event-2', data: { interactionId: 'interaction-3', content: 'Thanks' } },
			{ type: 'assistant.message', id: 'acknowledgement', data: { interactionId: 'interaction-3', content: 'You are welcome.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [
			{
				id: 'user-event-1',
				message: 'Investigate this issue',
				state: TurnState.Complete,
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'I found a likely cause.' },
					{ kind: ResponsePartKind.Markdown, content: 'I will verify it.' },
					{ kind: ResponsePartKind.ToolCall },
					{ kind: ResponsePartKind.Markdown, content: 'Investigation complete.' },
				],
			},
			{
				id: 'user-event-2',
				message: 'Thanks',
				state: TurnState.Complete,
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'You are welcome.' },
				],
			},
		]);
	});

	test('restores a system notification inside an assistant turn as a response part', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Wait for the background command' } },
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-1' } },
			{
				type: 'system.notification',
				id: 'notification-event',
				data: {
					content: '<system_notification>\nShell command completed\n</system_notification>',
					kind: { type: 'shell_completed', shellId: 'shell-a', exitCode: 0, description: 'sleep 6' },
				},
			},
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'Reading the output now.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: { text: 'Wait for the background command', origin: { kind: MessageKind.User } },
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.SystemNotification, content: '`sleep 6` completed' },
				{ kind: ResponsePartKind.Markdown, content: 'Reading the output now.' },
			],
		}]);
	});

	test('restores an idle system notification as a system-initiated turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Start the background agent' } },
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-1' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'The background agent is running.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
			{
				type: 'system.notification',
				id: 'notification-event',
				data: {
					content: '<system_notification>\nAgent completed\n</system_notification>',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose' },
				},
			},
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-2' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'Reading the background agent result.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [
			{
				id: 'user-event',
				message: { text: 'Start the background agent', origin: { kind: MessageKind.User } },
				state: TurnState.Complete,
				parts: [{ kind: ResponsePartKind.Markdown, content: 'The background agent is running.' }],
			},
			{
				id: 'notification-event',
				message: { text: 'Background agent agent-a is complete', origin: { kind: MessageKind.SystemNotification } },
				state: TurnState.Complete,
				parts: [{ kind: ResponsePartKind.Markdown, content: 'Reading the background agent result.' }],
			},
		]);
	});

	test('does not restore a passive notification outside an assistant turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Check for instructions' } },
			{ type: 'assistant.turn_start', data: { turnId: '0', interactionId: 'interaction-1' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'No new instructions.', toolRequests: [] } },
			{ type: 'assistant.turn_end', data: { turnId: '0' } },
			{
				type: 'system.notification',
				id: 'notification-event',
				data: {
					content: '<system_notification>\nInstruction discovered\n</system_notification>',
					kind: { type: 'instruction_discovered', sourcePath: 'AGENTS.md', triggerFile: 'src/index.ts', triggerTool: 'view', description: 'Workspace instructions' },
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			parts: [{ kind: ResponsePartKind.Markdown, content: 'No new instructions.' }],
		}]);
	});

	test('synthetic user messages do not start a new turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event-1', data: { interactionId: 'interaction-1', content: 'Use the skill' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'I will use it.', toolRequests: [] } },
			{ type: 'user.message', id: 'synthetic-event', data: { interactionId: 'interaction-2', content: 'Injected skill content', source: 'skill' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'The skill is complete.', toolRequests: [] } },
			{ type: 'user.message', id: 'user-event-2', data: { interactionId: 'interaction-3', content: 'Thanks' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-3', content: 'You are welcome.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			parts: partKinds(turn.responseParts),
		})), [
			{
				id: 'user-event-1',
				message: 'Use the skill',
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'I will use it.' },
					{ kind: ResponsePartKind.Markdown, content: 'The skill is complete.' },
				],
			},
			{
				id: 'user-event-2',
				message: 'Thanks',
				parts: [
					{ kind: ResponsePartKind.Markdown, content: 'You are welcome.' },
				],
			},
		]);
	});

	test('terminal empty assistant message completes a tool-only turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Close out the todos' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'todo' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'todo', arguments: { status: 'done' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: '', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message.text,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			message: 'Close out the todos',
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.ToolCall },
			],
		}]);
	});

	test('tool-only turn without a terminal assistant message remains cancelled', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'user-event', data: { interactionId: 'interaction-1', content: 'Run the command' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo done' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'done\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			state: TurnState.Cancelled,
			parts: [
				{ kind: ResponsePartKind.ToolCall },
			],
		}]);
	});

	test('abort remains terminal for the turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'interaction-1', content: 'Wait for the task' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'The task is complete.', toolRequests: [] } },
			{ type: 'abort', data: { reason: 'user initiated' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'Late completion.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			state: TurnState.Cancelled,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'The task is complete.' },
				{ kind: ResponsePartKind.Markdown, content: 'Late completion.' },
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

	test('routes subagent skill events into the subagent transcript', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'skill.invoked', agentId: 'agent-1', data: { name: 'research', path: '/skills/research' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true } },
			{ type: 'assistant.message', data: { messageId: 'm3', content: 'The subagent finished.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			parentState: turns[0].state,
			parentParts: partKinds(turns[0].responseParts),
			subagentParts: partKinds(subagentTurnsByToolCallId.get('tc-task')?.[0].responseParts ?? []),
		}, {
			parentState: TurnState.Complete,
			parentParts: [
				{ kind: ResponsePartKind.ToolCall },
				{ kind: ResponsePartKind.Markdown, content: 'The subagent finished.' },
			],
			subagentParts: [
				{ kind: ResponsePartKind.ToolCall },
			],
		});
	});

	test('subagent abort marks the subagent turn cancelled', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Partial result.' } },
			{ type: 'abort', agentId: 'agent-1', data: { reason: 'user initiated' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: false } },
			{ type: 'assistant.message', data: { messageId: 'm4', content: 'The subagent was cancelled.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const subagentTurn = subagentTurnsByToolCallId.get('tc-task')?.[0];

		assert.deepStrictEqual({
			parentState: turns[0].state,
			subagentState: subagentTurn?.state,
			subagentParts: partKinds(subagentTurn?.responseParts ?? []),
		}, {
			parentState: TurnState.Complete,
			subagentState: TurnState.Cancelled,
			subagentParts: [
				{ kind: ResponsePartKind.Markdown, content: 'Partial result.' },
			],
		});
	});

	test('subagent abort before its first response remains cancelled', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'abort', agentId: 'agent-1', data: { reason: 'user initiated' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Late partial result.' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: false } },
			{ type: 'assistant.message', data: { messageId: 'm4', content: 'The subagent was cancelled.' } },
		];

		const { subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const subagentTurn = subagentTurnsByToolCallId.get('tc-task')?.[0];

		assert.deepStrictEqual({
			state: subagentTurn?.state,
			parts: partKinds(subagentTurn?.responseParts ?? []),
		}, {
			state: TurnState.Cancelled,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Late partial result.' },
			],
		});
	});
});
