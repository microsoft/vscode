/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid, isUUID } from '../../../../base/common/uuid.js';
import { AgentSession } from '../../common/agent.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildChatUri, type MessageAttachment, type ResponsePart, type ToolCallCompletedState, type Turn } from '../../common/state/sessionState.js';
import { buildSessionEventLogFromTurns, buildSessionEventsFromTurns, serializeSessionEventsToJsonl } from '../../node/copilot/buildSessionEvents.js';
import { withAttachmentDetail } from '../../common/meta/attachmentMeta.js';
import { mapSessionEvents as mapSessionEventsWithRouting } from '../../node/copilot/mapSessionEvents.js';
import type { SessionEvent } from '@github/copilot-sdk';
import type { ISessionDatabase } from '../../common/sessionDataService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';

suite('buildSessionEventsFromTurns — reverse of mapSessionEvents', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const session = AgentSession.uri('copilot', 'test-session');
	const sessionId = 'test-session';

	function mapSessionEvents(session: URI, db: ISessionDatabase | undefined, events: Parameters<typeof mapSessionEventsWithRouting>[2]) {
		return mapSessionEventsWithRouting(session, db, events, URI.parse(buildChatUri(session, 'default')), session);
	}

	function markdown(content: string): ResponsePart {
		return { kind: ResponsePartKind.Markdown, id: 'ignored', content };
	}

	function reasoning(content: string): ResponsePart {
		return { kind: ResponsePartKind.Reasoning, id: 'ignored', content };
	}

	function toolCallPart(toolCallId: string, toolName: string, toolInput: string, resultText: string, opts?: { success?: boolean; errorMessage?: string }): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolCallId,
				toolName,
				displayName: toolName,
				invocationMessage: '',
				toolInput,
				success: opts?.success ?? true,
				pastTenseMessage: '',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				content: resultText ? [{ type: ToolResultContentType.Text, text: resultText }] : undefined,
				...(opts?.errorMessage ? { error: { message: opts.errorMessage } } : {}),
			} satisfies ToolCallCompletedState,
		};
	}

	function userTurn(id: string, text: string, responseParts: ResponsePart[]): Turn {
		return {
			id,
			message: { text, origin: { kind: MessageKind.User } },
			responseParts,
			usage: undefined,
			state: TurnState.Complete,
		};
	}

	function subagentToolCallPart(toolCallId: string, toolName: string, agentName: string, description: string, resultText: string): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolCallId,
				toolName,
				displayName: agentName,
				invocationMessage: '',
				toolInput: '',
				success: true,
				pastTenseMessage: '',
				confirmed: ToolCallConfirmationReason.NotNeeded,
				content: [
					{ type: ToolResultContentType.Text, text: resultText },
					{ type: ToolResultContentType.Subagent, resource: `agent-host-subagent:/${toolCallId}`, title: agentName, agentName, description },
				],
			} satisfies ToolCallCompletedState,
		};
	}

	/**
	 * Projection that ignores non-deterministic response-part ids so round-trips
	 * are comparable. The turn id is preserved (a UUID id round-trips through the
	 * event log), so it is included.
	 */
	function project(turns: readonly Turn[]) {
		return turns.map(turn => ({
			id: turn.id,
			text: turn.message.text,
			originKind: turn.message.origin.kind,
			state: turn.state,
			parts: turn.responseParts.map(part =>
				part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning
					? { kind: part.kind, content: part.content }
					: { kind: part.kind }),
		}));
	}

	test('round-trips text turns (prompt, markdown, reasoning) preserving UUID turn id, order and state', async () => {
		const idA = generateUuid();
		const idB = generateUuid();
		const turns: Turn[] = [
			userTurn(idA, 'What is 2+2?', [markdown('It is 4.')]),
			userTurn(idB, 'Explain why.', [reasoning('2 plus 2...'), markdown('Because arithmetic.')]),
		];

		const events = buildSessionEventsFromTurns(turns, { sessionId });
		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);

		assert.deepStrictEqual(project(reconstructed), project(turns));
	});

	test('preserves interleaved markdown/reasoning order by splitting assistant messages', async () => {
		const id = generateUuid();
		const turns: Turn[] = [userTurn(id, 'q', [markdown('A'), reasoning('R'), markdown('B')])];

		const events = buildSessionEventsFromTurns(turns, { sessionId });

		// Interleaved reasoning/markdown must not merge into one assistant.message
		// (which the reverse mapper would reorder as reasoning-then-content).
		assert.deepStrictEqual(events.map(e => e.type), [
			'session.start',
			'user.message',
			'assistant.turn_start',
			'assistant.message',
			'assistant.message',
			'assistant.message',
			'assistant.turn_end',
		]);

		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);
		assert.deepStrictEqual(project(reconstructed), project(turns));
	});

	for (const sourceId of [generateUuid(), 'local-turn']) {
		test(`imported reasoning timing survives event-log and database reopen (${isUUID(sourceId) ? 'UUID' : 'local'} turn id)`, async () => {
			const directory = await fs.mkdtemp(join(tmpdir(), 'import-reasoning-timing-'));
			const databasePath = join(directory, 'session.db');
			const database = store.add(await SessionDatabase.open(databasePath));
			let reopened: SessionDatabase | undefined;
			try {
				const timed = { kind: ResponsePartKind.Reasoning as const, id: 'timed-run', content: 'Consider the answer', startedAt: '1970-01-01T00:00:01.000Z', duration: 45_000 };
				const zero = { kind: ResponsePartKind.Reasoning as const, id: 'zero-run', content: 'Check the result', duration: 0 };
				const untimed = { kind: ResponsePartKind.Reasoning as const, id: 'untimed-run', content: 'Older reasoning' };
				const writes: Promise<void>[] = [];
				const events = buildSessionEventsFromTurns([userTurn(sourceId, 'Question', [
					timed, toolCallPart('read', 'read_file', '{"path":"file.ts"}', 'Result'),
					zero, markdown('Answer'), untimed, markdown('Done'),
				])], {
					sessionId,
					onAssistantMessage: (turnId, responseId, parts) => {
						if (parts.some(part => part.kind === ResponsePartKind.Reasoning)) {
							writes.push(database.setAssistantResponseParts(turnId, responseId, parts));
						}
					},
				});
				await fs.writeFile(join(directory, 'events.jsonl'), serializeSessionEventsToJsonl(events));
				await Promise.all(writes);
				await database.close();
				reopened = store.add(await SessionDatabase.open(databasePath));
				const savedEvents: SessionEvent[] = (await fs.readFile(join(directory, 'events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
				const { turns } = await mapSessionEvents(session, reopened, savedEvents);
				const restoredReasoning = turns[0].responseParts.filter(part => part.kind === ResponsePartKind.Reasoning);
				const importedTurnId = savedEvents.find(event => event.type === 'user.message')!.id;
				await reopened.deleteTurn(importedTurnId);

				assert.deepStrictEqual({
					restoredReasoning,
					turnId: turns[0].id,
					remainingParts: [...await reopened.getAssistantResponseParts()],
				}, {
					restoredReasoning: [timed, zero, untimed],
					turnId: importedTurnId,
					remainingParts: [],
				});
			} finally {
				await reopened?.close();
				await database.close();
				await fs.rm(directory, { recursive: true, force: true });
			}
		});
	}

	test('emits an abort for a cancelled turn so it reconstructs as cancelled with its text', async () => {
		const id = generateUuid();
		const turns: Turn[] = [{
			id,
			message: { text: 'stop', origin: { kind: MessageKind.User } },
			responseParts: [markdown('partial answer')],
			usage: undefined,
			state: TurnState.Cancelled,
		}];

		const events = buildSessionEventsFromTurns(turns, { sessionId });

		// The abort trails the already-flushed assistant content and ends the turn without a `turn_end`.
		assert.deepStrictEqual(events.map(e => e.type), [
			'session.start',
			'user.message',
			'assistant.turn_start',
			'assistant.message',
			'abort',
		]);

		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);
		assert.deepStrictEqual(project(reconstructed), project(turns));
	});

	test('round-trips a completed tool call interleaved with assistant text preserving order and identity', async () => {
		const id = generateUuid();
		const toolCallId = generateUuid();
		const turns: Turn[] = [{
			id,
			message: { text: 'run it', origin: { kind: MessageKind.User } },
			responseParts: [
				markdown('Let me run the tool.'),
				toolCallPart(toolCallId, 'bash', JSON.stringify({ command: 'ls' }), 'file1\nfile2'),
				markdown('Done.'),
			],
			usage: undefined,
			state: TurnState.Complete,
		}];

		const events = buildSessionEventsFromTurns(turns, { sessionId });

		// The tool call becomes a start + complete pair, with assistant text
		// flushed before and after it as separate assistant.message events.
		assert.deepStrictEqual(events.map(e => e.type), [
			'session.start',
			'user.message',
			'assistant.turn_start',
			'assistant.message',
			'tool.execution_start',
			'tool.execution_complete',
			'assistant.message',
			'assistant.turn_end',
		]);

		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);
		const projected = reconstructed.map(turn => ({
			id: turn.id,
			parts: turn.responseParts.map(part => part.kind === ResponsePartKind.ToolCall
				? {
					kind: part.kind,
					toolCallId: part.toolCall.toolCallId,
					toolName: part.toolCall.toolName,
					status: part.toolCall.status,
					success: (part.toolCall as ToolCallCompletedState).success,
					output: (part.toolCall as ToolCallCompletedState).content?.find(c => c.type === ToolResultContentType.Text)?.text,
				}
				: { kind: part.kind, content: (part as { content: string }).content }),
		}));

		assert.deepStrictEqual(projected, [{
			id,
			parts: [
				{ kind: ResponsePartKind.Markdown, content: 'Let me run the tool.' },
				{ kind: ResponsePartKind.ToolCall, toolCallId, toolName: 'bash', status: ToolCallStatus.Completed, success: true, output: 'file1\nfile2' },
				{ kind: ResponsePartKind.Markdown, content: 'Done.' },
			],
		}]);
	});

	test('omits array tool input from structured session event arguments', () => {
		const events = buildSessionEventsFromTurns([
			userTurn(generateUuid(), 'run it', [toolCallPart(generateUuid(), 'tool', '["one", "two"]', '')]),
		], { sessionId });
		const started = events.find(e => e.type === 'tool.execution_start');

		assert.ok(started && started.type === 'tool.execution_start');
		assert.strictEqual(started.data.arguments, undefined);
	});

	test('round-trips a failed tool call preserving the error message', async () => {
		const id = generateUuid();
		const toolCallId = generateUuid();
		const turns: Turn[] = [{
			id,
			message: { text: 'run it', origin: { kind: MessageKind.User } },
			responseParts: [toolCallPart(toolCallId, 'bash', '{}', '', { success: false, errorMessage: 'boom' })],
			usage: undefined,
			state: TurnState.Complete,
		}];

		const events = buildSessionEventsFromTurns(turns, { sessionId });
		const complete = events.find(e => e.type === 'tool.execution_complete');
		assert.ok(complete && complete.type === 'tool.execution_complete');
		assert.strictEqual(complete.data.success, false);
		assert.strictEqual(complete.data.error?.message, 'boom');

		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);
		const toolPart = reconstructed[0].responseParts.find(p => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolPart && toolPart.kind === ResponsePartKind.ToolCall);
		assert.strictEqual((toolPart.toolCall as ToolCallCompletedState).success, false);
		assert.strictEqual((toolPart.toolCall as ToolCallCompletedState).error?.message, 'boom');
	});

	test('emits subagent.started for a sub-agent tool call so the name/description survive the round-trip', async () => {
		const id = generateUuid();
		const toolCallId = generateUuid();
		const turns: Turn[] = [userTurn(id, 'delegate', [subagentToolCallPart(toolCallId, 'bash', 'explore', 'Explores the codebase', 'found it')])];

		const events = buildSessionEventsFromTurns(turns, { sessionId });

		// `subagent.started` precedes the tool execution pair so a resume applies
		// the sub-agent identity to the parent tool call. The turn ends on the
		// tool call, so an empty assistant message completes it before `turn_end`.
		assert.deepStrictEqual(events.map(e => e.type), [
			'session.start',
			'user.message',
			'assistant.turn_start',
			'subagent.started',
			'tool.execution_start',
			'tool.execution_complete',
			'assistant.message',
			'assistant.turn_end',
		]);
		const started = events.find(e => e.type === 'subagent.started');
		assert.ok(started && started.type === 'subagent.started');
		assert.deepStrictEqual(
			{ toolCallId: started.data.toolCallId, agentName: started.data.agentName, agentDescription: started.data.agentDescription },
			{ toolCallId, agentName: 'explore', agentDescription: 'Explores the codebase' },
		);

		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);
		const toolPart = reconstructed[0].responseParts.find(p => p.kind === ResponsePartKind.ToolCall);
		assert.ok(toolPart && toolPart.kind === ResponsePartKind.ToolCall);
		const subagentContent = (toolPart.toolCall as ToolCallCompletedState).content?.find(c => c.type === ToolResultContentType.Subagent);
		assert.ok(subagentContent && subagentContent.type === ToolResultContentType.Subagent);
		assert.deepStrictEqual(
			{ agentName: subagentContent.agentName, description: subagentContent.description },
			{ agentName: 'explore', description: 'Explores the codebase' },
		);
	});

	test('reuses a UUID turn id as the user.message envelope id, minting UUIDs for non-UUID ids', () => {
		const idA = generateUuid();
		const turns: Turn[] = [
			userTurn(idA, 'first', [markdown('r1')]),
			userTurn('not-a-uuid', 'second', [markdown('r2')]),
		];

		const events = buildSessionEventsFromTurns(turns, { sessionId, model: 'gpt-5' });

		// Shape: session.start, (user.message, turn_start, assistant.message, turn_end) x2.
		assert.deepStrictEqual(events.map(e => e.type), [
			'session.start',
			'user.message',
			'assistant.turn_start',
			'assistant.message',
			'assistant.turn_end',
			'user.message',
			'assistant.turn_start',
			'assistant.message',
			'assistant.turn_end',
		]);

		// First event roots the chain; every subsequent event links to its predecessor.
		assert.strictEqual(events[0].parentId, null);
		for (let i = 1; i < events.length; i++) {
			assert.strictEqual(events[i].parentId, events[i - 1].id, `event ${i} must link to its predecessor`);
		}

		const userIds = events.filter(e => e.type === 'user.message').map(e => e.id);
		// The UUID id is reused verbatim; the non-UUID id is replaced with a minted UUID.
		assert.strictEqual(userIds[0], idA);
		assert.notStrictEqual(userIds[1], 'not-a-uuid');
		assert.ok(events.every(e => isUUID(e.id)), 'all event ids must be UUIDs');

		// session.start carries the session id and selected model.
		const start = events[0];
		assert.strictEqual(start.type === 'session.start' && start.data.sessionId, sessionId);
		assert.strictEqual(start.type === 'session.start' && start.data.selectedModel, 'gpt-5');
	});

	test('completes a turn with no response content with an empty assistant message', async () => {
		const turns: Turn[] = [userTurn('turn-empty', 'just a note', [])];

		const events = buildSessionEventsFromTurns(turns, { sessionId });

		assert.deepStrictEqual(events.map(e => e.type === 'assistant.message' ? { type: e.type, content: e.data.content } : e.type), [
			'session.start', 'user.message', 'assistant.turn_start', { type: 'assistant.message', content: '' }, 'assistant.turn_end',
		]);
	});

	test('serializes to newline-terminated JSONL whose lines parse back to the same events', () => {
		const turns: Turn[] = [
			userTurn('turn-a', 'What is 2+2?', [markdown('It is 4.')]),
			userTurn('turn-b', 'Explain.', [reasoning('math'), markdown('Because arithmetic.')]),
		];

		const events = buildSessionEventsFromTurns(turns, { sessionId });
		const jsonl = serializeSessionEventsToJsonl(events);

		// One JSON object per line, terminated by a trailing newline.
		assert.ok(jsonl.endsWith('\n'), 'jsonl must be newline-terminated');
		const lines = jsonl.split('\n').filter(line => line.length > 0);
		assert.strictEqual(lines.length, events.length);
		assert.deepStrictEqual(lines.map(line => JSON.parse(line)), events);

		// Empty input serializes to the empty string.
		assert.strictEqual(serializeSessionEventsToJsonl([]), '');
	});

	test('the on-disk JSONL bytes reconstruct the original turns end to end', async () => {
		const turns: Turn[] = [
			userTurn(generateUuid(), 'What is 2+2?', [markdown('It is 4.')]),
			userTurn(generateUuid(), 'Explain why.', [reasoning('2 plus 2...'), markdown('Because arithmetic.')]),
		];

		// Full path a real import takes: turns -> events.jsonl string -> (write to disk) ->
		// parse each line -> reconstruct turns.
		const jsonl = buildSessionEventLogFromTurns(turns, { sessionId });
		const parsed = jsonl.split('\n').filter(line => line.length > 0).map(line => JSON.parse(line) as SessionEvent);
		const { turns: reconstructed } = await mapSessionEvents(session, undefined, parsed);

		assert.deepStrictEqual(project(reconstructed), project(turns));
	});

	test('a cold restore keeps every finished imported turn complete', async () => {
		const turns: Turn[] = [
			userTurn(generateUuid(), 'text', [markdown('Answer')]),
			userTurn(generateUuid(), 'ends on a tool call', [markdown('Looking'), toolCallPart('call-1', 'read', '{}', 'contents')]),
			userTurn(generateUuid(), 'no response', []),
			{ ...userTurn(generateUuid(), 'cancelled', [markdown('Partial')]), state: TurnState.Cancelled },
			userTurn(generateUuid(), 'last', [markdown('Done')]),
		];

		const events = buildSessionEventsFromTurns(turns, { sessionId });
		const { turns: restored } = await mapSessionEventsWithRouting(session, undefined, events, URI.parse(buildChatUri(session, 'default')), session, {
			interruptedTurnError: { errorType: 'executionInterrupted', message: 'interrupted' },
		});

		assert.deepStrictEqual(restored.map(turn => ({ text: turn.message.text, state: turn.state, parts: turn.responseParts.map(part => part.kind) })), [
			{ text: 'text', state: TurnState.Complete, parts: [ResponsePartKind.Markdown] },
			{ text: 'ends on a tool call', state: TurnState.Complete, parts: [ResponsePartKind.Markdown, ResponsePartKind.ToolCall] },
			{ text: 'no response', state: TurnState.Complete, parts: [] },
			{ text: 'cancelled', state: TurnState.Cancelled, parts: [ResponsePartKind.Markdown] },
			{ text: 'last', state: TurnState.Complete, parts: [ResponsePartKind.Markdown] },
		]);
	});

	test('round-trips message attachments and the model each turn used', async () => {
		const selection = { start: { line: 1, character: 2 }, end: { line: 1, character: 6 } };
		const attachments: MessageAttachment[] = [
			{ type: MessageAttachmentKind.Resource, uri: URI.file('/repo/a.ts').toString(), label: 'a.ts', displayKind: 'document' },
			{ type: MessageAttachmentKind.Resource, uri: URI.file('/repo/src').toString(), label: 'src', displayKind: 'directory' },
			{ type: MessageAttachmentKind.Resource, uri: URI.file('/repo/b.ts').toString(), label: 'b.ts:2', displayKind: 'selection', selection: { range: selection } },
			{ type: MessageAttachmentKind.Simple, label: 'Pasted', modelRepresentation: 'pasted text' },
			{ type: MessageAttachmentKind.Simple, label: 'Workspace', modelRepresentation: 'repo info', displayKind: 'workspace' },
			{ type: MessageAttachmentKind.EmbeddedResource, label: 'shot.png', data: 'AAEC', contentType: 'image/png', displayKind: 'image' },
			{ type: MessageAttachmentKind.Resource, uri: 'untitled:Untitled-1', label: 'Untitled-1', displayKind: 'document' },
		];
		const turns: Turn[] = [
			{ ...userTurn(generateUuid(), 'first', [markdown('A')]), message: { text: 'first', origin: { kind: MessageKind.User }, attachments, model: { id: 'gpt-5' } } },
			userTurn(generateUuid(), 'unresolved model', [markdown('B')]),
			{ ...userTurn(generateUuid(), 'third', [markdown('C')]), message: { text: 'third', origin: { kind: MessageKind.User }, model: { id: 'claude-sonnet-5' } } },
		];

		const events = buildSessionEventsFromTurns(turns, { sessionId, model: 'auto' });
		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);

		assert.deepStrictEqual({
			eventTypes: events.map(e => e.type),
			messages: reconstructed.map(turn => ({ model: turn.message.model?.id, attachments: turn.message.attachments })),
		}, {
			eventTypes: [
				'session.start', 'session.model_change', 'user.message', 'assistant.turn_start', 'assistant.message', 'assistant.turn_end',
				'session.model_change', 'user.message', 'assistant.turn_start', 'assistant.message', 'assistant.turn_end',
				'session.model_change', 'user.message', 'assistant.turn_start', 'assistant.message', 'assistant.turn_end',
				'session.model_change',
			],
			messages: [
				{
					model: 'gpt-5',
					attachments: [
						{ type: MessageAttachmentKind.Resource, uri: URI.file('/repo/a.ts').toString(), label: 'a.ts', displayKind: 'document' },
						{ type: MessageAttachmentKind.Resource, uri: URI.file('/repo/src').toString(), label: 'src', displayKind: 'directory' },
						// No saved selection text: replayed as the selected whole lines of the file, never as invented text.
						{ type: MessageAttachmentKind.Resource, uri: URI.file('/repo/b.ts').toString(), label: 'b.ts:2', displayKind: 'selection', selection: { range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } } } },
						{ type: MessageAttachmentKind.Simple, label: 'Pasted', modelRepresentation: 'pasted text' },
						{ type: MessageAttachmentKind.Simple, label: 'Workspace', modelRepresentation: 'repo info', displayKind: 'workspace' },
						{ type: MessageAttachmentKind.EmbeddedResource, label: 'shot.png', data: 'AAEC', contentType: 'image/png', displayKind: 'image' },
						{ type: MessageAttachmentKind.Simple, label: 'Untitled-1', modelRepresentation: 'untitled:Untitled-1' },
					],
				},
				{ model: 'auto', attachments: undefined },
				{ model: 'claude-sonnet-5', attachments: undefined },
			],
		});
	});

	test('records no per-turn models when the session has no model', async () => {
		const turns: Turn[] = [
			{ ...userTurn(generateUuid(), 'first', [markdown('A')]), message: { text: 'first', origin: { kind: MessageKind.User }, model: { id: 'gpt-5' } } },
			userTurn(generateUuid(), 'unresolved model', [markdown('B')]),
		];

		const events = buildSessionEventsFromTurns(turns, { sessionId });
		const { turns: reconstructed } = await mapSessionEvents(session, undefined, events);

		assert.deepStrictEqual({
			modelEvents: events.filter(e => e.type === 'session.model_change' || (e.type === 'assistant.message' && e.data.model)).length,
			models: reconstructed.map(turn => turn.message.model),
		}, { modelEvents: 0, models: [undefined, undefined] });
	});

	test('records saved selection text, and only the selected lines when no text was saved', () => {
		const file = URI.file('/repo/b.ts');
		const range = (startLine: number, startCharacter: number, endLine: number, endCharacter: number) => ({ start: { line: startLine, character: startCharacter }, end: { line: endLine, character: endCharacter } });
		const selection = (label: string, selected: ReturnType<typeof range>): MessageAttachment => ({ type: MessageAttachmentKind.Resource, uri: file.toString(), label, displayKind: 'selection', selection: { range: selected } });
		const attachments = [
			withAttachmentDetail(selection('saved', range(1, 2, 2, 3)), { type: 'selection', text: 'saved text' }),
			selection('unsaved', range(1, 2, 2, 3)),
			selection('ends at line start', range(1, 0, 3, 0)),
		];
		const turns: Turn[] = [{ ...userTurn(generateUuid(), 'q', []), message: { text: 'q', origin: { kind: MessageKind.User }, attachments } }];

		const userMessage = buildSessionEventsFromTurns(turns, { sessionId }).find(e => e.type === 'user.message');

		assert.deepStrictEqual(userMessage?.type === 'user.message' ? userMessage.data.attachments : undefined, [
			{ type: 'selection', filePath: file.fsPath, displayName: 'saved', text: 'saved text', selection: range(1, 2, 2, 3) },
			{ type: 'file', path: file.fsPath, displayName: 'unsaved', lineRange: { start: 2, end: 3 } },
			{ type: 'file', path: file.fsPath, displayName: 'ends at line start', lineRange: { start: 2, end: 3 } },
		]);
	});
});
