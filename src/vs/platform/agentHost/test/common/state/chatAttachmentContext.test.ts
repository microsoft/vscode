/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { boundChatTranscriptTurns, formatChatTranscript, MAX_CHAT_ATTACHMENT_EXCERPT_CHARS, resolveChatAttachment } from '../../../common/state/chatAttachmentContext.js';
import { MessageAttachmentKind, MessageKind, ResponsePartKind, TurnState, type Turn } from '../../../common/state/sessionState.js';
import { type MessageChatAttachment } from '../../../common/state/protocol/state.js';

/** Build a completed turn with a user message and a single assistant markdown reply. */
function turn(id: string, userText: string, assistantText: string, extraAttachments?: Turn['message']['attachments']): Turn {
	return {
		id,
		message: { text: userText, origin: { kind: MessageKind.User }, ...(extraAttachments ? { attachments: extraAttachments } : {}) },
		responseParts: [
			// A reasoning part must be ignored by the transcript formatter.
			{ kind: ResponsePartKind.Reasoning, id: `${id}-reason`, content: 'internal reasoning' },
			{ kind: ResponsePartKind.Markdown, id: `${id}-md`, content: assistantText },
		],
		usage: undefined,
		state: TurnState.Complete,
	};
}

const OPEN_LINK = 'agent-host-session://mock/session-1?chat=peer-1';

suite('chatAttachmentContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('boundChatTranscriptTurns bounds through endTurn (inclusive)', () => {
		const turns = [turn('t1', 'a', 'A'), turn('t2', 'b', 'B'), turn('t3', 'c', 'C')];
		assert.deepStrictEqual(boundChatTranscriptTurns(turns, 't2').map(t => t.id), ['t1', 't2']);
	});

	test('boundChatTranscriptTurns returns every turn when endTurn is omitted', () => {
		const turns = [turn('t1', 'a', 'A'), turn('t2', 'b', 'B'), turn('t3', 'c', 'C')];
		assert.deepStrictEqual(boundChatTranscriptTurns(turns).map(t => t.id), ['t1', 't2', 't3']);
	});

	test('boundChatTranscriptTurns rejects an unknown endTurn', () => {
		const turns = [turn('t1', 'a', 'A'), turn('t2', 'b', 'B')];
		assert.throws(() => boundChatTranscriptTurns(turns, 'missing'), /endTurn missing was not found/);
	});

	test('formatChatTranscript renders user + assistant text only (ignores tool calls)', () => {
		const text = formatChatTranscript([turn('t1', 'hi', 'hello'), turn('t2', 'more', 'sure')]);
		assert.strictEqual(text, 'User: hi\n\nAssistant: hello\n\nUser: more\n\nAssistant: sure');
	});

	test('resolveChatAttachment points at the referenced chat and inlines a short transcript whole', () => {
		const turns = [turn('t1', 'first', 'reply one'), turn('t2', 'second', 'reply two'), turn('t3', 'later', 'reply three')];
		const attachment: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't2', label: 'Conversation so far' };
		const resolved = resolveChatAttachment(attachment, turns, OPEN_LINK);
		// Bounded through t2 (t3 excluded); the transcript is short so it is included in full.
		assert.deepStrictEqual(resolved, {
			type: MessageAttachmentKind.Simple,
			label: 'Conversation so far',
			modelRepresentation:
				'The user referenced another chat, "Conversation so far". ' +
				`That chat is identified by the link ${OPEN_LINK}. ` +
				'To read its full transcript, call the get_session_context server tool with its "session" argument set to that link.' +
				'\n\nThe excerpt below is that chat\'s full transcript up to the selected turn:' +
				'\n\nUser: first\n\nAssistant: reply one\n\nUser: second\n\nAssistant: reply two',
		});
	});

	test('resolveChatAttachment includes every turn when endTurn is omitted', () => {
		const turns = [turn('t1', 'first', 'reply one'), turn('t2', 'second', 'reply two'), turn('t3', 'later', 'reply three')];
		const attachment: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', label: 'Conversation so far' };
		const resolved = resolveChatAttachment(attachment, turns, OPEN_LINK);
		// No endTurn pin, so the host resolves the full retained transcript (t1..t3).
		assert.deepStrictEqual(resolved, {
			type: MessageAttachmentKind.Simple,
			label: 'Conversation so far',
			modelRepresentation:
				'The user referenced another chat, "Conversation so far". ' +
				`That chat is identified by the link ${OPEN_LINK}. ` +
				'To read its full transcript, call the get_session_context server tool with its "session" argument set to that link.' +
				'\n\nThe excerpt below is that chat\'s full transcript up to the selected turn:' +
				'\n\nUser: first\n\nAssistant: reply one\n\nUser: second\n\nAssistant: reply two\n\nUser: later\n\nAssistant: reply three',
		});
	});

	test('resolveChatAttachment forwards a range when present', () => {
		const range = { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } };
		const attachment: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't1', label: 'Earlier chat', range };
		const resolved = resolveChatAttachment(attachment, [turn('t1', 'ask', 'answer')], OPEN_LINK);
		assert.deepStrictEqual(resolved.range, range);
	});

	test('resolveChatAttachment keeps only the tail of a long transcript', () => {
		// A long assistant reply forces truncation; only the most recent
		// characters (the tail) survive, and the earlier content is dropped.
		const longReply = 'x'.repeat(MAX_CHAT_ATTACHMENT_EXCERPT_CHARS * 2);
		const turns = [turn('t1', 'oldest question', 'ANCIENT'), turn('t2', 'recent question', longReply)];
		const attachment: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't2', label: 'Long chat' };
		const resolved = resolveChatAttachment(attachment, turns, OPEN_LINK);
		const rep = resolved.modelRepresentation!;
		const excerpt = rep.slice(rep.lastIndexOf('\n\n') + 2);
		assert.deepStrictEqual({
			label: resolved.label,
			mentionsTailNote: rep.includes(`about the last ${MAX_CHAT_ATTACHMENT_EXCERPT_CHARS} characters`),
			excerptLength: excerpt.length,
			droppedOldest: !rep.includes('ANCIENT'),
			keptRecentTail: excerpt === 'x'.repeat(MAX_CHAT_ATTACHMENT_EXCERPT_CHARS),
		}, {
			label: 'Long chat',
			mentionsTailNote: true,
			excerptLength: MAX_CHAT_ATTACHMENT_EXCERPT_CHARS,
			droppedOldest: true,
			keptRecentTail: true,
		});
	});

	test('resolveChatAttachment describes an empty transcript without an excerpt', () => {
		// A turn with no user text and no assistant markdown yields an empty transcript.
		const empty: Turn = { id: 't1', message: { text: '', origin: { kind: MessageKind.User } }, responseParts: [], usage: undefined, state: TurnState.Complete };
		const attachment: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't1', label: 'Empty chat' };
		const resolved = resolveChatAttachment(attachment, [empty], OPEN_LINK);
		assert.deepStrictEqual(resolved, {
			type: MessageAttachmentKind.Simple,
			label: 'Empty chat',
			modelRepresentation:
				'The user referenced another chat, "Empty chat". ' +
				`That chat is identified by the link ${OPEN_LINK}. ` +
				'To read its full transcript, call the get_session_context server tool with its "session" argument set to that link.' +
				'\n\nThe referenced chat has no transcript content up to the selected turn.',
		});
	});

	test('resolveChatAttachment does not recursively expand chat attachments inside the source transcript', () => {
		// A source turn whose message itself carries a Chat attachment: the
		// resolver must not follow it (non-recursive expansion).
		const nested: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/other', endTurn: 'x', label: 'Nested' };
		const turns = [turn('t1', 'ask', 'answer', [nested])];
		const resolved = resolveChatAttachment({ type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't1', label: 'Conversation so far' }, turns, OPEN_LINK);
		assert.ok(!resolved.modelRepresentation!.includes('ahp-chat://c/other'));
		assert.ok(!resolved.modelRepresentation!.includes('Nested'));
		assert.ok(resolved.modelRepresentation!.includes('User: ask'));
	});

	test('resolveChatAttachment rejects an attachment whose endTurn is not retained', () => {
		assert.throws(
			() => resolveChatAttachment({ type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 'missing', label: 'Conversation so far' }, [turn('t1', 'ask', 'answer')], OPEN_LINK),
			/endTurn missing was not found/,
		);
	});
});
