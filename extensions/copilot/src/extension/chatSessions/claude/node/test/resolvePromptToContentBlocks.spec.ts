/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type * as vscode from 'vscode';
import { URI } from '../../../../../util/vs/base/common/uri';
import { ChatReferenceBinaryData } from '../../../../../vscodeTypes';
import { TestChatRequest } from '../../../../test/node/testHelpers';
import { resolvePromptToContentBlocks } from '../claudePromptResolver';

// #region Test Helpers

function makeRef(
	value: vscode.ChatPromptReference['value'],
	range?: [number, number],
): vscode.ChatPromptReference {
	return { id: 'ref', name: 'ref', value, range } as vscode.ChatPromptReference;
}

function makeLocationRef(
	uri: URI,
	startLine: number,
	range?: [number, number],
): vscode.ChatPromptReference {
	const location = { uri, range: { start: { line: startLine, character: 0 }, end: { line: startLine, character: 0 } } };
	return { id: 'loc', name: 'loc', value: location, range } as vscode.ChatPromptReference;
}

function textBlocks(blocks: Anthropic.ContentBlockParam[]): Anthropic.TextBlockParam[] {
	return blocks.filter(b => b.type === 'text') as Anthropic.TextBlockParam[];
}

function imageBlocks(blocks: Anthropic.ContentBlockParam[]): Anthropic.ImageBlockParam[] {
	return blocks.filter(b => b.type === 'image') as Anthropic.ImageBlockParam[];
}

// #endregion

describe('resolvePromptToContentBlocks', () => {
	it('returns plain text for a simple prompt', async () => {
		const request = new TestChatRequest('Hello world');
		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		expect(textBlocks(blocks)[0].text).toBe('Hello world');
	});

	it('passes through slash-command prompts unmodified', async () => {
		const request = new TestChatRequest('/help me with something');
		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		expect(textBlocks(blocks)[0].text).toBe('/help me with something');
	});

	it('prefixes command name when request.command is set', async () => {
		const request = new TestChatRequest('fix this bug');
		request.command = 'fix';
		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		expect(textBlocks(blocks)[0].text).toBe('/fix fix this bug');
	});

	// #region Inline References (ref.range)

	it('substitutes an inline URI reference at the correct range', async () => {
		const fileUri = URI.file('/src/app.ts');
		// Simulate "fix #file:app.ts please" where #file:app.ts occupies indices 4..16
		const prompt = 'fix #file:app.ts please';
		const ref = makeRef(fileUri, [4, 16]);
		const request = new TestChatRequest(prompt, [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		expect(textBlocks(blocks)[0].text).toBe(`fix ${fileUri.fsPath} please`);
	});

	it('substitutes an inline Location reference with line number', async () => {
		const fileUri = URI.file('/src/utils.ts');
		// "look at #ref here" — #ref is at [8, 12]
		const prompt = 'look at #ref here';
		const ref = makeLocationRef(fileUri, 41, [8, 12]);
		const request = new TestChatRequest(prompt, [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		// Location refs include `:lineNumber` (1-indexed)
		expect(textBlocks(blocks)[0].text).toBe(`look at ${fileUri.fsPath}:42 here`);
	});

	it('substitutes multiple inline references correctly', async () => {
		const uri1 = URI.file('/a.ts');
		const uri2 = URI.file('/b.ts');
		// "compare #ref1 and #ref2" — refs at [8, 12] and [17, 21]
		const prompt = 'compare #rf1 and #rf2';
		const ref1 = makeRef(uri1, [8, 12]);
		const ref2 = makeRef(uri2, [17, 21]);
		const request = new TestChatRequest(prompt, [ref1, ref2]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		const text = textBlocks(blocks)[0].text;
		expect(text).toContain(uri1.fsPath);
		expect(text).toContain(uri2.fsPath);
	});

	// #endregion

	// #region Non-Inline References (system-reminder block)

	it('appends non-inline URI references as a system-reminder block', async () => {
		const fileUri = URI.file('/src/main.ts');
		const ref = makeRef(fileUri);
		const request = new TestChatRequest('explain this', [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(2);
		expect(textBlocks(blocks)[0].text).toBe('explain this');
		expect(textBlocks(blocks)[1].text).toContain('<system-reminder>');
		expect(textBlocks(blocks)[1].text).toContain(fileUri.fsPath);
	});

	it('includes multiple non-inline references in a single system-reminder block', async () => {
		const uri1 = URI.file('/a.ts');
		const uri2 = URI.file('/b.ts');
		const request = new TestChatRequest('check these', [makeRef(uri1), makeRef(uri2)]);

		const blocks = await resolvePromptToContentBlocks(request);

		const reminderBlocks = textBlocks(blocks).filter(b => b.text.includes('<system-reminder>'));
		expect(reminderBlocks).toHaveLength(1);
		expect(reminderBlocks[0].text).toContain(uri1.fsPath);
		expect(reminderBlocks[0].text).toContain(uri2.fsPath);
	});

	// #endregion

	// #region Image References

	it('converts a PNG binary reference to an image content block', async () => {
		const imageData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
		const ref = makeRef(new ChatReferenceBinaryData('image/png', () => Promise.resolve(imageData)));
		const request = new TestChatRequest('describe this', [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(imageBlocks(blocks)).toHaveLength(1);
		const img = imageBlocks(blocks)[0];
		expect(img.source.type).toBe('base64');
		expect((img.source as Anthropic.Base64ImageSource).media_type).toBe('image/png');
		expect((img.source as Anthropic.Base64ImageSource).data).toBe(Buffer.from(imageData).toString('base64'));
	});

	it('normalizes image/jpg to image/jpeg', async () => {
		const ref = makeRef(new ChatReferenceBinaryData('image/jpg', () => Promise.resolve(new Uint8Array([0xFF, 0xD8]))));
		const request = new TestChatRequest('check', [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		const img = imageBlocks(blocks)[0];
		expect((img.source as Anthropic.Base64ImageSource).media_type).toBe('image/jpeg');
	});

	it('skips unsupported image MIME types', async () => {
		const ref = makeRef(new ChatReferenceBinaryData('image/bmp', () => Promise.resolve(new Uint8Array([0x42, 0x4D]))));
		const request = new TestChatRequest('check', [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(imageBlocks(blocks)).toHaveLength(0);
	});

	it('falls back to reference URI when ChatReferenceBinaryData has unsupported MIME but has a reference', async () => {
		const fileUri = URI.file('/img/photo.bmp');
		const binaryData = Object.assign(
			new ChatReferenceBinaryData('image/bmp', () => Promise.resolve(new Uint8Array([]))),
			{ reference: fileUri },
		);
		const ref = makeRef(binaryData);
		const request = new TestChatRequest('check', [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		expect(imageBlocks(blocks)).toHaveLength(0);
		// URI should appear in system-reminder instead
		expect(textBlocks(blocks).some(b => b.text.includes(fileUri.fsPath))).toBe(true);
	});

	// #endregion

	// #region Mixed References

	it('handles a mix of inline, non-inline, and image references', async () => {
		const inlineUri = URI.file('/inline.ts');
		const extraUri = URI.file('/extra.ts');
		const imageData = new Uint8Array([0x89]);

		const prompt = 'fix #ref and check';
		const inlineRef = makeRef(inlineUri, [4, 8]);
		const extraRef = makeRef(extraUri);
		const imageRef = makeRef(new ChatReferenceBinaryData('image/png', () => Promise.resolve(imageData)));

		const request = new TestChatRequest(prompt, [inlineRef, extraRef, imageRef]);
		const blocks = await resolvePromptToContentBlocks(request);

		// Text block with inline substitution
		expect(textBlocks(blocks)[0].text).toContain(inlineUri.fsPath);
		expect(textBlocks(blocks)[0].text).toContain('and check');

		// Image block
		expect(imageBlocks(blocks)).toHaveLength(1);

		// System-reminder block for the non-inline ref
		const reminderBlocks = textBlocks(blocks).filter(b => b.text.includes('<system-reminder>'));
		expect(reminderBlocks).toHaveLength(1);
		expect(reminderBlocks[0].text).toContain(extraUri.fsPath);
	});

	it('does not add system-reminder block when there are no non-inline references', async () => {
		const uri = URI.file('/file.ts');
		const prompt = 'fix #ref please';
		const ref = makeRef(uri, [4, 8]);
		const request = new TestChatRequest(prompt, [ref]);

		const blocks = await resolvePromptToContentBlocks(request);

		const reminderBlocks = textBlocks(blocks).filter(b => b.text.includes('<system-reminder>'));
		expect(reminderBlocks).toHaveLength(0);
	});

	it('handles empty references array', async () => {
		const request = new TestChatRequest('just text', []);
		const blocks = await resolvePromptToContentBlocks(request);

		expect(blocks).toHaveLength(1);
		expect(textBlocks(blocks)[0].text).toBe('just text');
	});

	// #endregion
});
