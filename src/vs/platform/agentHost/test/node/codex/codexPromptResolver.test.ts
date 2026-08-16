/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MessageAttachmentKind, type MessageAttachment } from '../../../common/state/sessionState.js';
import { resolveCodexInput } from '../../../node/codex/codexPromptResolver.js';

suite('codexPromptResolver', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('plain prompt becomes a single text input', () => {
		const { input, cleanupPaths } = resolveCodexInput('hello world', undefined);
		assert.strictEqual(input.length, 1);
		assert.strictEqual(input[0].type, 'text');
		assert.strictEqual((input[0] as { text: string }).text, 'hello world');
		assert.strictEqual(cleanupPaths.length, 0);
	});

	test('Resource (file:) attachment becomes @<path> mention', () => {
		const uri = URI.file('/tmp/foo.txt');
		const att: MessageAttachment = {
			type: MessageAttachmentKind.Resource,
			label: 'foo.txt',
			uri: uri.toString(),
		} as MessageAttachment;
		const { input } = resolveCodexInput('look at this', [att]);
		assert.strictEqual(input.length, 1);
		const text = (input[0] as { text: string }).text;
		assert.ok(text.includes(`@${uri.fsPath}`), `text: ${text}`);
		assert.ok(text.includes('look at this'));
	});

	test('Simple attachment with modelRepresentation is appended', () => {
		const att: MessageAttachment = {
			type: MessageAttachmentKind.Simple,
			label: 'meta',
			modelRepresentation: 'extra context',
		} as MessageAttachment;
		const { input } = resolveCodexInput('top', [att]);
		const text = (input[0] as { text: string }).text;
		assert.ok(text.includes('top'));
		assert.ok(text.includes('extra context'));
	});

	test('EmbeddedResource image becomes localImage and tracks cleanup', () => {
		const att: MessageAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'pic',
			data: Buffer.from('fake-png-bytes').toString('base64'),
			contentType: 'image/png',
		} as MessageAttachment;
		const { input, cleanupPaths } = resolveCodexInput('see image', [att]);
		assert.strictEqual(cleanupPaths.length, 1);
		const imageItem = input.find(i => i.type === 'localImage') as { type: 'localImage'; path: string };
		assert.ok(imageItem, 'expected localImage item');
		assert.ok(imageItem.path.endsWith('.png'));
		// Cleanup so the test doesn't leak the tmp file.
		try { fs.unlinkSync(cleanupPaths[0]); } catch { /* ignore */ }
	});

	test('non-image EmbeddedResource is dropped silently', () => {
		const att: MessageAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'pdf',
			data: 'ZmFrZQ==',
			contentType: 'application/pdf',
		} as MessageAttachment;
		const { input, cleanupPaths } = resolveCodexInput('', [att]);
		assert.strictEqual(cleanupPaths.length, 0);
		assert.strictEqual(input.length, 1);
		assert.strictEqual(input[0].type, 'text');
	});

	test('textual EmbeddedResource (unsaved document) is inlined with label', () => {
		const body = 'console.log("draft")';
		const att: MessageAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'Untitled-1',
			displayKind: 'document',
			data: Buffer.from(body).toString('base64'),
			contentType: 'text/plain',
		} as MessageAttachment;
		const { input, cleanupPaths } = resolveCodexInput('review this', [att]);
		assert.strictEqual(cleanupPaths.length, 0);
		assert.strictEqual(input.length, 1);
		const text = (input[0] as { text: string }).text;
		assert.ok(text.includes('review this'), `text: ${text}`);
		assert.ok(text.includes('Untitled-1'), `text: ${text}`);
		assert.ok(text.includes(body), `text: ${text}`);
	});

	test('textual EmbeddedResource selection annotates a one-based line range', () => {
		const body = 'second line\nthird line';
		const att: MessageAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label: 'foo.ts',
			displayKind: 'selection',
			data: Buffer.from(body).toString('base64'),
			contentType: 'text/plain',
			selection: { range: { start: { line: 1, character: 0 }, end: { line: 2, character: 9 } } },
		} as MessageAttachment;
		const { input } = resolveCodexInput('explain', [att]);
		const text = (input[0] as { text: string }).text;
		assert.ok(text.includes('foo.ts (lines 2-3)'), `text: ${text}`);
		assert.ok(text.includes(body), `text: ${text}`);
	});
});
