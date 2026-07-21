/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentSession } from '../../common/agentService.js';
import { augmentTroubleshootRequest } from '../../common/agentHostTroubleshoot.js';
import { toSessionReferenceAttachmentMeta } from '../../common/meta/agentSessionReferenceMeta.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../common/state/protocol/state.js';

suite('agentHostTroubleshoot - augmentTroubleshootRequest', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const PROVIDER = 'copilotcli';
	const resolvePath = (id: string) => `/state/${id}/log.jsonl`;

	function sessionReferenceAttachment(sessionId: string, title: string = sessionId): MessageAttachment {
		const resource = AgentSession.uri(PROVIDER, sessionId);
		return {
			type: MessageAttachmentKind.Simple,
			// The label mirrors the inserted `#session:<title>` marker text.
			label: title,
			_meta: toSessionReferenceAttachmentMeta({ sessionResource: resource.toString(), sessionID: sessionId }),
		};
	}

	function plainAttachment(label: string): MessageAttachment {
		return { type: MessageAttachmentKind.Simple, label };
	}

	test('omits the log path for a bare request and forwards the free text as context', () => {
		const result = augmentTroubleshootRequest('why slow', undefined, resolvePath);
		assert.deepStrictEqual(result, {
			input: `Additional context from the user:\nwhy slow`,
			attachments: undefined,
		});
	});

	test('targets a referenced session and strips the marker when it is the only text', () => {
		const attachments = [sessionReferenceAttachment('other', 'Other Session')];
		const result = augmentTroubleshootRequest('#session:Other Session', attachments, resolvePath);
		assert.deepStrictEqual(result, {
			input: `Session log: /state/other/log.jsonl`,
			attachments: [],
		});
	});

	test('keeps a genuine question typed alongside a reference', () => {
		const attachments = [sessionReferenceAttachment('build', 'Build')];
		const result = augmentTroubleshootRequest('#session:Build why was the test skipped?', attachments, resolvePath);
		assert.deepStrictEqual(result, {
			input: `Session log: /state/build/log.jsonl\n\nAdditional context from the user:\nwhy was the test skipped?`,
			attachments: [],
		});
	});

	test('keeps non-marker attachments and dedupes multiple references', () => {
		const keep = plainAttachment('notes.txt');
		const attachments = [sessionReferenceAttachment('a', 'A'), keep, sessionReferenceAttachment('b', 'B'), sessionReferenceAttachment('a', 'A')];
		const result = augmentTroubleshootRequest('#session:A #session:B', attachments, resolvePath);
		assert.deepStrictEqual(result, {
			input: `Session log: /state/a/log.jsonl, /state/b/log.jsonl`,
			attachments: [keep],
		});
	});
});
