/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readToolCallMeta } from '../../common/meta/agentToolCallMeta.js';
import { AgentSession } from '../../common/agent.js';
import { getErrorResponsePart, getTurnError, MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildChatUri, type ResponsePart, type StringOrMarkdown, type ToolCallResponsePart, type ToolResultContent } from '../../common/state/sessionState.js';
import { appendSdkToolResultContent, mapSessionEvents as mapSessionEventsWithRouting, type IMapSessionEventsOptions } from '../../node/copilot/mapSessionEvents.js';
import { toSessionEvents, type ISessionEvent } from './copilotTestEvents.js';

function mapSessionEvents(session: URI, db: undefined, events: Parameters<typeof mapSessionEventsWithRouting>[2], options: IMapSessionEventsOptions | undefined = undefined) {
	return mapSessionEventsWithRouting(session, db, events, URI.parse(buildChatUri(session, 'default')), options);
}

suite('mapSessionEvents — history replay', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');

	function partKinds(parts: readonly ResponsePart[]): Array<{ kind: ResponsePartKind; content?: StringOrMarkdown }> {
		return parts.map(p => p.kind === ResponsePartKind.Markdown || p.kind === ResponsePartKind.SystemNotification ? { kind: p.kind, content: p.content } : { kind: p.kind });
	}

	test('task_complete renders the input summary when tool output is truncated', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Working on it.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: { summary: 'Done. All good.' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'Output too large to read at once (11.3 KB). Saved to: /tmp/task-complete.txt' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.strictEqual(turns.length, 1);
		assert.deepStrictEqual(partKinds(turns[0].responseParts), [
			{ kind: ResponsePartKind.Markdown, content: 'Working on it.' },
			{ kind: ResponsePartKind.Markdown, content: '\n\n**Task completed:** Done. All good.' },
		]);
	});

	test('restores Auto model resolution as usage metadata', async () => {
		const autoModeResolved = {
			chosenModel: 'claude-opus-4.8',
			reasoningBucket: 'high',
			categoryScores: { reasoning: 0.91, code_gen: 0.72 },
			predictedLabel: 'needs_reasoning',
			confidence: 0.93,
			candidateModels: ['claude-opus-4.8', 'claude-sonnet-4.6'],
		};
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-before-auto', data: { interactionId: 'm0', content: 'First prompt' } },
			{ type: 'assistant.message', data: { messageId: 'm1', content: 'First response.' } },
			// The runtime resolves Auto while building settings, before it persists
			// the user message for the turn that will use the chosen model.
			{ type: 'session.auto_mode_resolved', data: autoModeResolved },
			{ type: 'user.message', id: 'turn-auto', data: { interactionId: 'm1', content: 'Solve this problem' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Done.' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, usage: turn.usage })), [
			{ id: 'turn-before-auto', usage: undefined },
			{
				id: 'turn-auto',
				usage: {
					model: 'claude-opus-4.8',
					_meta: { autoModeResolved },
				},
			},
		]);
	});

	test('restores a subagent Auto model resolution onto the subagent turn', async () => {
		const autoModeResolved = { chosenModel: 'claude-opus-4.8' };
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', data: { interactionId: 'm1', content: 'summarize the service' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'Summarize', agent_type: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore Agent', agentDescription: 'Explores' } },
			// Auto routes before the model call, so the decision lands before the
			// subagent's first message. It must not pull the turn's start time back.
			{ type: 'session.auto_mode_resolved', agentId: 'agent-1', timestamp: '2025-01-01T00:00:10.000Z', data: autoModeResolved },
			{ type: 'user.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:20.000Z', data: { interactionId: 'subagent-prompt', content: 'Inspect the implementation.' } },
			{ type: 'assistant.message', agentId: 'agent-1', timestamp: '2025-01-01T00:00:30.000Z', data: { messageId: 'm3', content: 'Subagent is done.' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			parentUsage: turns.map(turn => turn.usage),
			subagentTurns: subagentTurnsByToolCallId.get('tc-task')?.map(turn => ({ text: turn.message.text, startedAt: turn.startedAt, duration: turn.duration, usage: turn.usage })),
		}, {
			parentUsage: [undefined],
			subagentTurns: [{
				text: 'Inspect the implementation.',
				startedAt: '2025-01-01T00:00:20.000Z',
				duration: 10000,
				usage: { model: 'claude-opus-4.8', _meta: { autoModeResolved } },
			}],
		});
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

	test('restored completed task_complete is not marked interrupted', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-task-complete', data: { interactionId: 'm1', content: 'finish the task' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'All done.', toolRequests: [{ toolCallId: 'tc-1', name: 'task_complete' }] } },
			{ type: 'assistant.turn_end', data: { turnId: 'sdk-turn' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'task_complete', arguments: {} } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), {
			interruptedTurnError: { errorType: 'executionInterrupted', message: 'interrupted' },
		});

		assert.deepStrictEqual({
			state: turns[0].state,
			error: getErrorResponsePart(turns[0]),
		}, {
			state: TurnState.Complete,
			error: undefined,
		});
	});

	test('restores an unfinished request as an error on the same turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'interrupted-turn', data: { interactionId: 'm1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'Partial response' } },
		];
		const interruptedTurnError = {
			errorType: 'executionInterrupted',
			message: 'The agent was interrupted before this request finished.',
		};

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), { interruptedTurnError });

		assert.deepStrictEqual({
			turnCount: turns.length,
			id: turns[0].id,
			state: turns[0].state,
			errorPart: getErrorResponsePart(turns[0]),
		}, {
			turnCount: 1,
			id: 'interrupted-turn',
			state: TurnState.Error,
			errorPart: {
				kind: ResponsePartKind.Error,
				error: interruptedTurnError,
			},
		});
	});

	test('restores a continued failed request as one completed turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-08-11T00:00:00.000Z', data: { interactionId: 'm1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:00:00.100Z', data: { turnId: 'sdk-turn-1' } },
			{ type: 'session.error', timestamp: '2026-08-11T00:00:02.000Z', data: { errorType: 'requestFailed', message: 'First failure' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:10:00.000Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:10:03.000Z', data: { messageId: 'm2', content: 'Finished response' } },
			{ type: 'assistant.turn_end', timestamp: '2026-08-11T00:10:03.000Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'session.idle', timestamp: '2026-08-11T00:10:03.000Z', data: {} },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			state: turn.state,
			duration: turn.duration,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'turn-1',
			state: TurnState.Complete,
			duration: 5000,
			parts: [
				{ kind: ResponsePartKind.Error },
				{ kind: ResponsePartKind.Markdown, content: 'Finished response' },
			],
		}]);
	});

	test('excludes host downtime when an interrupted execution resumes and is interrupted again', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-08-11T00:00:00.000Z', data: { interactionId: 'm1', content: 'Keep working' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:00:00.100Z', data: { turnId: 'sdk-turn-1' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:00:02.000Z', data: { messageId: 'm2', content: 'First segment' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:10:00.000Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:10:03.000Z', data: { messageId: 'm3', content: 'Second segment' } },
		];
		const interruptedTurnError = {
			errorType: 'executionInterrupted',
			message: 'The agent was interrupted before this request finished.',
		};

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), { interruptedTurnError });

		assert.deepStrictEqual({
			duration: turns[0].duration,
			state: turns[0].state,
			parts: partKinds(turns[0].responseParts),
			resumable: getErrorResponsePart(turns[0])?.resumable,
		}, {
			duration: 5000,
			state: TurnState.Error,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'First segment' },
				{ kind: ResponsePartKind.Markdown, content: 'Second segment' },
				{ kind: ResponsePartKind.Error },
			],
			resumable: undefined,
		});
	});

	test('keeps an error terminal when a later notification starts another turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'failed-turn', timestamp: '2026-08-11T00:00:00.000Z', data: { interactionId: 'm1', content: 'Start the background agent' } },
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:00:00.100Z', data: { turnId: 'sdk-turn-1' } },
			{ type: 'session.error', timestamp: '2026-08-11T00:00:02.000Z', data: { errorType: 'requestFailed', message: 'First failure' } },
			{
				type: 'system.notification',
				id: 'notification-turn',
				timestamp: '2026-08-11T00:10:00.000Z',
				data: {
					content: '<system_notification>\nAgent completed\n</system_notification>',
					kind: { type: 'agent_idle', agentId: 'agent-a', agentType: 'general-purpose' },
				},
			},
			{ type: 'assistant.turn_start', timestamp: '2026-08-11T00:10:00.100Z', data: { turnId: 'sdk-turn-2' } },
			{ type: 'assistant.message', timestamp: '2026-08-11T00:10:01.000Z', data: { messageId: 'm2', content: 'The background agent finished.' } },
			{ type: 'assistant.turn_end', timestamp: '2026-08-11T00:10:01.000Z', data: { turnId: 'sdk-turn-2' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			message: turn.message,
			state: turn.state,
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'failed-turn',
			message: { text: 'Start the background agent', origin: { kind: MessageKind.User } },
			state: TurnState.Error,
			parts: [{ kind: ResponsePartKind.Error }],
		}, {
			id: 'notification-turn',
			message: { text: 'Background agent agent-a is complete', origin: { kind: MessageKind.SystemNotification } },
			state: TurnState.Complete,
			parts: [{ kind: ResponsePartKind.Markdown, content: 'The background agent finished.' }],
		}]);
		assert.strictEqual(getErrorResponsePart(turns[0])?.resumable, undefined);
	});

	test('keeps an error as the final part when a late tool completion arrives', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'failed-turn', data: { interactionId: 'm1', content: 'Run a command' } },
			{ type: 'assistant.turn_start', data: { turnId: 'sdk-turn-1' } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'bash', arguments: { command: 'echo hi' } } },
			{ type: 'session.error', data: { errorType: 'requestFailed', message: 'First failure' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true, result: { content: 'hi\n' } } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			state: turns[0].state,
			parts: partKinds(turns[0].responseParts),
			resumable: getErrorResponsePart(turns[0])?.resumable,
		}, {
			state: TurnState.Error,
			parts: [{ kind: ResponsePartKind.Error }],
			resumable: undefined,
		});
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

	test('resolves relative patch links in restored tool messages', async () => {
		const patch = [
			'*** Begin Patch',
			'*** Update File: src/file.ts',
			'@@',
			'-old',
			'+new',
			'*** End Patch',
		].join('\n');
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'edit the file' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'apply_patch' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'apply_patch', arguments: patch } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-1', success: true } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events), { workingDirectory: URI.file('/workspace') });
		const part = turns[0].responseParts.find(part => part.kind === ResponsePartKind.ToolCall) as ToolCallResponsePart | undefined;
		assert.ok(part);
		assert.deepStrictEqual({
			invocationMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.invocationMessage : undefined,
			pastTenseMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.pastTenseMessage : undefined,
		}, {
			invocationMessage: { markdown: 'Edit [file.ts](file:///workspace/src/file.ts)' },
			pastTenseMessage: { markdown: 'Edit [file.ts](file:///workspace/src/file.ts)' },
		});
	});

	test('restores MCP app data for completed tool calls', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'call an MCP app tool' } },
			{
				type: 'assistant.message',
				data: {
					messageId: 'm2',
					content: '',
					toolRequests: [{
						toolCallId: 'tc-1',
						name: 'GitHub-get_me',
						arguments: {},
						type: 'function',
						mcpServerName: 'GitHub',
						mcpToolName: 'get_me',
					}],
				},
			},
			{
				type: 'tool.execution_start',
				data: {
					toolCallId: 'tc-1',
					toolName: 'GitHub-get_me',
					arguments: {},
					mcpServerName: 'GitHub',
					mcpToolName: 'get_me',
					toolDescription: {
						_meta: {
							ui: {
								resourceUri: 'ui://github-mcp-server/get-me',
							},
						},
					},
				},
			},
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: { content: '{"login":"octocat"}' },
				},
			},
		];

		const chatUri = URI.parse(buildChatUri(session, 'restored-chat'));
		const sdkConversationUri = URI.parse('copilot-sdk:/conversation-123');
		const { turns } = await mapSessionEventsWithRouting(sdkConversationUri, undefined, toSessionEvents(events), chatUri);

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
		assert.deepStrictEqual({
			contributor: part.toolCall.contributor,
			meta: readToolCallMeta(part.toolCall),
		}, {
			contributor: {
				kind: ToolCallContributorKind.MCP,
				customizationId: 'mcp-top-level:copilot:test-session:GitHub',
			},
			meta: {
				mcpServerName: 'GitHub',
				mcpToolName: 'get_me',
				ui: {
					resourceUri: 'ui://github-mcp-server/get-me',
					channel: `mcp://copilot/${encodeURIComponent(chatUri.toString())}/GitHub`,
				},
			},
		});
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

	test('maps SDK image content to an embedded resource on replayed tool completion', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'view the image' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'view_image' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'view_image', arguments: { path: '/repo/image.png' } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'Viewed image file successfully.',
						contents: [{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.deepStrictEqual(part.toolCall.content, [
			{ type: ToolResultContentType.Text, text: 'Viewed image file successfully.' },
			{ type: ToolResultContentType.EmbeddedResource, data: 'iVBORw0KGgo=', contentType: 'image/png' },
		]);
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
			{
				type: ToolResultContentType.Terminal,
				resource: 'agenthost-terminal://shell/test-session/tc-1',
				title: 'Run Shell Command',
				isPty: false,
				result: { exitCode: 0, preview: 'hi\n' },
			},
		]);
	});

	test('does not classify read_bash shell_exit metadata as a terminal completion on replay', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-1', name: 'read_bash' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-1', toolName: 'read_bash', arguments: { shellId: 'build', delay: 0 } } },
			{
				type: 'tool.execution_complete',
				data: {
					toolCallId: 'tc-1',
					success: true,
					result: {
						content: 'Build completed\n',
						contents: [{ type: 'shell_exit', shellId: 'build', exitCode: 0, outputPreview: 'Build completed\n' }],
					},
				},
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		const part = turns[0].responseParts[0] as ToolCallResponsePart;
		assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
		if (part.toolCall.status !== ToolCallStatus.Completed) { return; }
		assert.deepStrictEqual({
			toolKind: readToolCallMeta(part.toolCall).toolKind,
			pastTenseMessage: part.toolCall.pastTenseMessage,
			content: part.toolCall.content,
		}, {
			toolKind: undefined,
			pastTenseMessage: 'Read Terminal',
			content: [{ type: ToolResultContentType.Text, text: 'Build completed\n' }],
		});
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
		assert.deepStrictEqual(part.toolCall.content?.find(content => content.type === ToolResultContentType.Terminal), {
			type: ToolResultContentType.Terminal,
			resource: 'agenthost-terminal://shell/test-session/tc-1',
			title: 'Run Shell Command',
			isPty: false,
			result: { exitCode: 127 },
		});
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

	test('seeds the model from session.start selectedModel when no launch model is supplied', async () => {
		const events: ISessionEvent[] = [
			{ type: 'session.start', data: { selectedModel: 'opus-5' } },
			{ type: 'user.message', data: { interactionId: 'm1', content: 'hi' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: 'hello' } },
			{ type: 'user.message', data: { interactionId: 'm3', content: 'again' } },
			{ type: 'session.model_change', data: { newModel: 'gpt-5' } },
			{ type: 'user.message', data: { interactionId: 'm4', content: 'switched' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(t => t.message.model), [
			{ id: 'opus-5' },
			{ id: 'opus-5' },
			{ id: 'gpt-5' },
		]);
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

	test('restores an idle system notification and resumed response in the preceding turn', async () => {
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
		})), [{
			id: 'user-event',
			message: { text: 'Start the background agent', origin: { kind: MessageKind.User } },
			state: TurnState.Complete,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'The background agent is running.' },
				{ kind: ResponsePartKind.SystemNotification, content: 'Background agent agent-a is complete' },
				{ kind: ResponsePartKind.Markdown, content: 'Reading the background agent result.' },
			],
		}]);
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

	test('strips prompt scaffolding from user message content', async () => {
		const wrapped = 'hi\n <reminder>\nIMPORTANT: ignore this\n</reminder>\n<attachments>\n<attachment id="microsoft/vscode">repo</attachment>\n</attachments>\n<userRequest>\nhi\n</userRequest>\n';
		// The Copilot CLI injects context as a `<system_reminder>` block (e.g. the
		// `IMPORTANT: this context may or may not be relevant…` preamble); it must
		// not leak into the reconstructed message (and thus the session title).
		const systemReminder = 'hi\n\n<system_reminder>\nIMPORTANT: this context may or may not be relevant\n<sql_tables>Available tables: todos, todo_deps</sql_tables>\n</system_reminder>';
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'wrapped', data: { interactionId: 'interaction-1', content: wrapped } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-1', content: 'Hello.', toolRequests: [] } },
			{ type: 'user.message', id: 'wrapper-only', data: { interactionId: 'interaction-2', content: '<userRequest>hi5</userRequest>' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-2', content: 'Hi again.', toolRequests: [] } },
			{ type: 'user.message', id: 'empty-wrapper', data: { interactionId: 'interaction-3', content: '/remote <reminder>x</reminder><userRequest></userRequest>' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-3', content: 'Ok remote.', toolRequests: [] } },
			{ type: 'user.message', id: 'plain', data: { interactionId: 'interaction-4', content: 'just text' } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-4', content: 'Ok.', toolRequests: [] } },
			{ type: 'user.message', id: 'system-reminder', data: { interactionId: 'interaction-5', content: systemReminder } },
			{ type: 'assistant.message', data: { interactionId: 'interaction-5', content: 'Hi.', toolRequests: [] } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => turn.message.text), ['hi', 'hi5', '/remote', 'just text', 'hi']);
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

	test('restores a request error as terminal turn state', async () => {
		const events: ISessionEvent[] = [
			{
				type: 'session.error',
				data: { errorType: 'unassociated', message: 'Ignore this session diagnostic.' },
			},
			{
				type: 'user.message',
				id: 'user-event',
				timestamp: '2026-07-29T10:00:00.000Z',
				data: { interactionId: 'interaction-1', content: 'Complete this request' },
			},
			{
				type: 'assistant.turn_start',
				data: { turnId: 'assistant-turn', interactionId: 'interaction-1' },
			},
			{
				type: 'assistant.message',
				timestamp: '2026-07-29T10:00:01.000Z',
				data: { interactionId: 'interaction-1', content: 'Working on it.', toolRequests: [] },
			},
			{
				type: 'assistant.turn_end',
				data: { turnId: 'assistant-turn', interactionId: 'interaction-1' },
			},
			{
				type: 'session.error',
				id: 'error-event',
				timestamp: '2026-07-29T10:00:02.000Z',
				data: {
					errorType: 'quota',
					errorCode: 'quota_exceeded',
					message: 'No premium requests remain.',
					stack: 'Error: No premium requests remain.',
					statusCode: 402,
					providerCallId: 'provider-request-id',
					serviceRequestId: 'service-request-id',
				},
			},
			{
				type: 'assistant.message',
				data: { interactionId: 'interaction-1', content: 'Late completion.', toolRequests: [] },
			},
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({
			id: turn.id,
			state: turn.state,
			duration: turn.duration,
			error: getTurnError(turn),
			parts: partKinds(turn.responseParts),
		})), [{
			id: 'user-event',
			state: TurnState.Error,
			duration: 2000,
			error: {
				errorType: 'quota',
				message: 'No premium requests remain.',
				stack: 'Error: No premium requests remain.',
				_meta: {
					chatError: {
						fetchError: {
							type: 'quotaExceeded',
							reason: 'No premium requests remain.',
							requestId: 'provider-request-id',
							serverRequestId: 'service-request-id',
							capiError: {
								code: 'quota_exceeded',
								message: 'No premium requests remain.',
							},
						},
					},
				},
			},
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Working on it.' },
				{ kind: ResponsePartKind.Error },
			],
		}]);
	});

	test('restores turn timing from the SDK event envelopes', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-07-29T10:00:00.000Z', data: { interactionId: 'm1', content: 'first' } },
			{ type: 'assistant.message', timestamp: '2026-07-29T10:00:03.500Z', data: { messageId: 'm2', content: 'First answer.' } },
			{ type: 'user.message', id: 'turn-2', timestamp: '2026-07-29T10:05:00.000Z', data: { interactionId: 'm3', content: 'second' } },
			{ type: 'assistant.message', timestamp: '2026-07-29T10:05:01.000Z', data: { messageId: 'm4', content: 'Second answer.' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn-1', startedAt: '2026-07-29T10:00:00.000Z', duration: 3500 },
			{ id: 'turn-2', startedAt: '2026-07-29T10:05:00.000Z', duration: 1000 },
		]);
	});

	test('bounds turn duration by the last event belonging to the turn', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', timestamp: '2026-07-29T10:00:00.000Z', data: { interactionId: 'm1', content: 'first' } },
			{ type: 'assistant.turn_start', timestamp: '2026-07-29T10:00:00.500Z', data: { turnId: 't1' } },
			{ type: 'assistant.message', timestamp: '2026-07-29T10:00:03.500Z', data: { messageId: 'm2', content: 'First answer.' } },
			{ type: 'assistant.turn_end', timestamp: '2026-07-29T10:00:04.000Z', data: { turnId: 't1' } },
			// Ignored by the mapper an hour later: it must not extend the turn.
			{ type: 'session.unrelated_event', timestamp: '2026-07-29T11:00:00.000Z' },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn-1', startedAt: '2026-07-29T10:00:00.000Z', duration: 4000 },
		]);
	});

	test('leaves turn timing undefined when envelopes carry no usable timestamp', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'turn-1', data: { interactionId: 'm1', content: 'first' } },
			{ type: 'assistant.message', timestamp: 'not-a-date', data: { messageId: 'm2', content: 'First answer.' } },
		];

		const { turns } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual(turns.map(turn => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
			{ id: 'turn-1', startedAt: undefined, duration: undefined },
		]);
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
			{ type: 'user.message', agentId: 'agent-1', data: { interactionId: 'subagent-prompt', content: 'Inspect the implementation.' } },
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
		assert.strictEqual(subagentTurns![0].message.text, 'Inspect the implementation.');
		assert.deepStrictEqual(partKinds(subagentTurns![0].responseParts), [
			{ kind: ResponsePartKind.ToolCall },
			{ kind: ResponsePartKind.Markdown, content: 'Subagent is done.' },
		]);
	});

	test('reconstructs subagent content when legacy completion precedes subagent start', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'summarize the service' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'Summarize agent service', agent_type: 'explore' } } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: true, result: { content: 'Agent started in background.' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore Agent', agentDescription: 'Explores' } },
			{ type: 'user.message', agentId: 'agent-1', data: { interactionId: 'subagent-prompt', content: 'Inspect agentService.ts.' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Summary complete.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const toolCall = turns[0].responseParts.find((part): part is ToolCallResponsePart => part.kind === ResponsePartKind.ToolCall)?.toolCall;
		const subagentContent = toolCall?.status === ToolCallStatus.Completed
			? toolCall.content?.find(content => content.type === ToolResultContentType.Subagent)
			: undefined;

		assert.deepStrictEqual({
			description: toolCall ? readToolCallMeta(toolCall).subagentDescription : undefined,
			subagentContent,
			childMarkdown: subagentTurnsByToolCallId.get('tc-task')?.flatMap(turn => turn.responseParts)
				.filter(part => part.kind === ResponsePartKind.Markdown)
				.map(part => part.content),
		}, {
			description: 'Summarize agent service',
			subagentContent: {
				type: ToolResultContentType.Subagent,
				resource: 'copilot:/test-session/subagent/tc-task',
				title: 'Explore Agent',
				agentName: 'explore',
				description: 'Explores',
			},
			childMarkdown: ['Summary complete.'],
		});
	});

	test('drops subagent user messages whose agentId cannot be mapped', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', id: 'root-message', data: { interactionId: 'm1', content: 'Continue the task' } },
			{ type: 'user.message', id: 'orphan-subagent-message', agentId: 'unknown-agent', data: { interactionId: 'm2', content: 'Delegated prompt' } },
			{ type: 'assistant.message', data: { messageId: 'm3', content: 'Done.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));

		assert.deepStrictEqual({
			turns: turns.map(turn => ({
				id: turn.id,
				message: turn.message.text,
				parts: partKinds(turn.responseParts),
			})),
			subagentTurns: [...subagentTurnsByToolCallId],
		}, {
			turns: [{
				id: 'root-message',
				message: 'Continue the task',
				parts: [{ kind: ResponsePartKind.Markdown, content: 'Done.' }],
			}],
			subagentTurns: [],
		});
	});

	test('routes subagent skill events into the subagent transcript', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'skill.invoked', agentId: 'agent-1', data: { name: 'research', path: '/skills/research', content: '' } },
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

	test('subagent error marks only the subagent turn errored and remains terminal', async () => {
		const events: ISessionEvent[] = [
			{ type: 'user.message', data: { interactionId: 'm1', content: 'spawn a subagent' } },
			{ type: 'assistant.message', data: { messageId: 'm2', content: '', toolRequests: [{ toolCallId: 'tc-task', name: 'task' }] } },
			{ type: 'tool.execution_start', data: { toolCallId: 'tc-task', toolName: 'task', arguments: { description: 'explore', agentName: 'explore' } } },
			{ type: 'subagent.started', agentId: 'agent-1', data: { toolCallId: 'tc-task', agentName: 'explore', agentDisplayName: 'Explore', agentDescription: 'Explores' } },
			{ type: 'assistant.message', agentId: 'agent-1', data: { messageId: 'm3', content: 'Partial result.' } },
			{ type: 'session.error', agentId: 'agent-1', data: { errorType: 'rate_limit', message: 'Subagent rate limited.', statusCode: 429 } },
			{ type: 'abort', agentId: 'agent-1', data: { reason: 'cleanup after failure' } },
			{ type: 'tool.execution_complete', data: { toolCallId: 'tc-task', success: false } },
			{ type: 'assistant.message', data: { messageId: 'm4', content: 'The subagent failed.' } },
		];

		const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, undefined, toSessionEvents(events));
		const subagentTurn = subagentTurnsByToolCallId.get('tc-task')?.[0];

		assert.deepStrictEqual({
			parentState: turns[0].state,
			parentError: getTurnError(turns[0]),
			subagentState: subagentTurn?.state,
			subagentError: getTurnError(subagentTurn),
			subagentParts: partKinds(subagentTurn?.responseParts ?? []),
		}, {
			parentState: TurnState.Complete,
			parentError: undefined,
			subagentState: TurnState.Error,
			subagentError: {
				errorType: 'rate_limit',
				message: 'Subagent rate limited.',
				stack: undefined,
				_meta: {
					chatError: {
						fetchError: {
							type: 'rateLimited',
							reason: 'Subagent rate limited.',
							requestId: '',
							capiError: { code: undefined, message: 'Subagent rate limited.' },
						},
					},
				},
			},
			subagentParts: [
				{ kind: ResponsePartKind.Markdown, content: 'Partial result.' },
				{ kind: ResponsePartKind.Error },
			],
		});
	});
});

suite('appendSdkToolResultContent', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('folds shell_exit into an existing terminal block instead of adding a second one', () => {
		const content: ToolResultContent[] = [
			{ type: ToolResultContentType.Terminal, resource: 'agenthost-terminal://shell/abc', title: 'Bash' },
		];

		const result = appendSdkToolResultContent(content, [
			{ type: 'shell_exit', shellId: '0', exitCode: 2, outputPreview: 'boom\n', outputTruncated: false },
		], { session: AgentSession.uri('copilot', 'test-session'), toolCallId: 'tc-1', title: 'Run Shell Command' });

		assert.deepStrictEqual(result, { shellId: '0', result: { exitCode: 2, preview: 'boom\n', truncated: false } });
		assert.deepStrictEqual(content, [
			{
				type: ToolResultContentType.Terminal,
				resource: 'agenthost-terminal://shell/abc',
				title: 'Bash',
				result: { exitCode: 2, preview: 'boom\n', truncated: false },
			},
		]);
	});

	test('ignores a null shell_exit output preview', () => {
		const content: ToolResultContent[] = [];

		const result = appendSdkToolResultContent(content, [
			{ type: 'shell_exit', shellId: '0', exitCode: 7, outputPreview: null, outputTruncated: false },
		], { session: AgentSession.uri('copilot', 'test-session'), toolCallId: 'tc-1', title: 'Run Shell Command' });

		assert.deepStrictEqual({ result, content }, {
			result: { shellId: '0', result: { exitCode: 7, truncated: false } },
			content: [
				{
					type: ToolResultContentType.Terminal,
					resource: 'agenthost-terminal://shell/test-session/tc-1',
					title: 'Run Shell Command',
					isPty: false,
					result: { exitCode: 7, truncated: false },
				},
			],
		});
	});
});
