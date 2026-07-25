/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { boundChatTranscriptTurns, formatChatTranscript, resolveChatAttachment } from '../../../common/state/chatAttachmentContext.js';
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

suite('chatAttachmentContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('boundChatTranscriptTurns bounds through endTurn (inclusive)', () => {
		const turns = [turn('t1', 'a', 'A'), turn('t2', 'b', 'B'), turn('t3', 'c', 'C')];
		assert.deepStrictEqual(boundChatTranscriptTurns(turns, 't2').map(t => t.id), ['t1', 't2']);
	});

	test('boundChatTranscriptTurns rejects an unknown endTurn', () => {
		const turns = [turn('t1', 'a', 'A'), turn('t2', 'b', 'B')];
		assert.throws(() => boundChatTranscriptTurns(turns, 'missing'), /endTurn missing was not found/);
	});

	test('formatChatTranscript renders user + assistant text only (ignores tool calls)', () => {
		const text = formatChatTranscript([turn('t1', 'hi', 'hello'), turn('t2', 'more', 'sure')]);
		assert.strictEqual(text, 'User: hi\n\nAssistant: hello\n\nUser: more\n\nAssistant: sure');
	});

	test('resolveChatAttachment produces a Simple attachment carrying the bounded transcript', () => {
		const turns = [turn('t1', 'first', 'reply one'), turn('t2', 'second', 'reply two'), turn('t3', 'later', 'reply three')];
		const attachment: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't2', label: 'Conversation so far' };
		const resolved = resolveChatAttachment(attachment, turns);
		assert.strictEqual(resolved.type, MessageAttachmentKind.Simple);
		assert.strictEqual(resolved.label, 'Conversation so far');
		// Bounded through t2: t3 must be excluded.
		assert.ok(resolved.modelRepresentation!.includes('User: first'));
		assert.ok(resolved.modelRepresentation!.includes('Assistant: reply two'));
		assert.ok(!resolved.modelRepresentation!.includes('reply three'));
	});

	test('resolveChatAttachment does not recursively expand chat attachments inside the source transcript', () => {
		// A source turn whose message itself carries a Chat attachment: the
		// resolver must not follow it (non-recursive expansion).
		const nested: MessageChatAttachment = { type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/other', endTurn: 'x', label: 'Nested' };
		const turns = [turn('t1', 'ask', 'answer', [nested])];
		const resolved = resolveChatAttachment({ type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 't1', label: 'Conversation so far' }, turns);
		assert.ok(!resolved.modelRepresentation!.includes('ahp-chat://c/other'));
		assert.ok(!resolved.modelRepresentation!.includes('Nested'));
		assert.ok(resolved.modelRepresentation!.includes('User: ask'));
	});

	test('resolveChatAttachment rejects an attachment whose endTurn is not retained', () => {
		assert.throws(
			() => resolveChatAttachment({ type: MessageAttachmentKind.Chat, resource: 'ahp-chat://c/src', endTurn: 'missing', label: 'Conversation so far' }, [turn('t1', 'ask', 'answer')]),
			/endTurn missing was not found/,
		);
	});
});
