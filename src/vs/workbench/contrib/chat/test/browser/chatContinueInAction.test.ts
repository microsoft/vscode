/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { buildDelegationTranscript, createDelegationTranscriptAttachment, IDelegationTranscriptRequest } from '../../browser/actions/chatContinueInAction.js';
import { ChatPasteAttachmentMetadata } from '../../common/attachments/chatVariableEntries.js';

suite('ChatContinueInAction - delegation transcript', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function req(text: string, response?: string): IDelegationTranscriptRequest {
		return {
			message: { text },
			response: response !== undefined ? { response: { getMarkdown: () => response } } : undefined,
		};
	}

	test('buildDelegationTranscript joins user and assistant turns', () => {
		const transcript = buildDelegationTranscript([
			req('hello', 'hi there'),
			req('only a question'),
		]);
		assert.strictEqual(transcript, 'User: hello\nAssistant: hi there\n\nUser: only a question');
	});

	test('buildDelegationTranscript truncates to the most recent content', () => {
		const transcript = buildDelegationTranscript([req('a'.repeat(50))], 10);
		assert.strictEqual(transcript.length, 10);
		assert.strictEqual(transcript, 'a'.repeat(10));
	});

	test('createDelegationTranscriptAttachment returns undefined for empty transcript', () => {
		assert.strictEqual(createDelegationTranscriptAttachment('', 'Local'), undefined);
	});

	test('createDelegationTranscriptAttachment wraps the transcript as a paste attachment', () => {
		const attachment = createDelegationTranscriptAttachment('User: hello', 'Copilot CLI');
		assert.ok(attachment);
		assert.strictEqual(attachment.kind, 'paste');
		assert.strictEqual(attachment.language, 'markdown');
		assert.strictEqual(attachment.icon?.id, Codicon.history.id);
		assert.ok(attachment.id.startsWith('chat-delegation-transcript-'));
		// The prior conversation and its provenance live inside the attachment,
		// not in the prompt.
		assert.ok(attachment.code.includes('Copilot CLI'));
		assert.ok(attachment.code.includes('User: hello'));
		assert.strictEqual(attachment.value, attachment.code);
		assert.deepStrictEqual(attachment._meta, {
			[ChatPasteAttachmentMetadata.Kind]: 'paste',
			[ChatPasteAttachmentMetadata.Language]: 'markdown',
			[ChatPasteAttachmentMetadata.FileName]: 'Previous conversation',
			[ChatPasteAttachmentMetadata.PastedLines]: 'Previous conversation',
		});
	});
});
