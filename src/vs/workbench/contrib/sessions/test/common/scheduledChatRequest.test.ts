/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { decodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { MessageAttachmentKind } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { captureScheduledChatRequest, parseScheduledChatTime } from '../../common/scheduledChatRequest.js';

suite('Scheduled chat request', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('captures selections and image bytes while retaining normal file reference semantics and mention ranges', async () => {
		const uri = URI.file('/workspace/a.ts');
		const reads: string[] = [];
		const message = await captureScheduledChatRequest({
			inputText: 'Review #a',
			attachments: [
				{ kind: 'file', id: 'selection', name: 'selection', value: { uri, range: new Range(2, 1, 3, 1) } },
				{ kind: 'file', id: 'file', name: 'a.ts', value: uri, range: { start: 7, endExclusive: 9 } },
				{ kind: 'image', id: 'image', name: 'screenshot', value: new Uint8Array([1, 2, 3]), mimeType: 'image/png' },
			],
		}, async (resource, range) => {
			reads.push(`${resource.path}:${range?.startLineNumber}`);
			return 'captured selection';
		}, async () => { throw new Error('Unexpected image file read'); });
		assert.deepStrictEqual({
			text: message.text,
			reads,
			attachments: message.attachments?.map(attachment => ({
				type: attachment.type,
				content: attachment.type === MessageAttachmentKind.EmbeddedResource ? [...decodeBase64(attachment.data).buffer] : attachment.type === MessageAttachmentKind.Resource ? attachment.uri : undefined,
				range: attachment.range,
			})),
		}, {
			text: 'Review #a',
			reads: ['/workspace/a.ts:2'],
			attachments: [
				{ type: MessageAttachmentKind.EmbeddedResource, content: [...VSBuffer.fromString('captured selection').buffer], range: undefined },
				{ type: MessageAttachmentKind.Resource, content: uri.toString(), range: { start: { line: 0, character: 7 }, end: { line: 0, character: 9 } } },
				{ type: MessageAttachmentKind.EmbeddedResource, content: [1, 2, 3], range: undefined },
			],
		});
	});

	test('captures dirty files and untitled buffers instead of retaining unresolvable or stale references', async () => {
		const dirty = URI.file('/workspace/dirty.ts');
		const untitled = URI.parse('untitled:Untitled-1');
		const message = await captureScheduledChatRequest({
			inputText: 'review', attachments: [dirty, untitled].map((value, i) => ({ kind: 'file', id: String(i), name: value.path, value })),
		}, async uri => uri.toString() === dirty.toString() ? 'unsaved changes' : 'new buffer', async () => { throw new Error('Unexpected disk read'); }, uri => uri.toString() === dirty.toString());
		assert.deepStrictEqual(message.attachments?.map(attachment => attachment.type === MessageAttachmentKind.EmbeddedResource ? decodeBase64(attachment.data).toString() : attachment.type), ['unsaved changes', 'new buffer']);
	});

	test('refuses remote and unsupported context rather than silently dropping attachments', async () => {
		const readSelection = async () => '';
		const readFile = async () => VSBuffer.alloc(0);
		await assert.rejects(() => captureScheduledChatRequest({
			inputText: 'review', attachments: [{ kind: 'file', id: 'remote', name: 'remote.ts', value: URI.parse('vscode-remote://host/path') }],
		}, readSelection, readFile), /attachments on this device/);
		await assert.rejects(() => captureScheduledChatRequest({
			inputText: 'review', attachments: [{ kind: 'tool', id: 'tool', name: 'tool', value: undefined }],
		}, readSelection, readFile), /cannot be saved for later/);
	});

	test('parses local calendar values without rolling invalid dates or accepting ambiguous text', () => {
		const valid = parseScheduledChatTime('2030-07-14 09:30');
		assert.deepStrictEqual({
			valid: valid && [valid.getFullYear(), valid.getMonth() + 1, valid.getDate(), valid.getHours(), valid.getMinutes()],
			invalid: ['2030-02-30 09:30', '2030-13-01 09:30', '2030-01-01 24:00', 'tomorrow', '2030-01-01T09:30Z'].map(parseScheduledChatTime),
		}, { valid: [2030, 7, 14, 9, 30], invalid: [undefined, undefined, undefined, undefined, undefined] });
	});
});
