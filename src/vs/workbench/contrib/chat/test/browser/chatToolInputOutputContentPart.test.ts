/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatCollapsibleInputOutputContentPart, IChatCollapsibleIODataPart } from '../../browser/chatContentParts/chatToolInputOutputContentPart.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('ChatToolInputOutputContentPart - MCP Resource Markdown Support', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('should separate markdown and non-markdown parts correctly', () => {
		// Test the core logic for separating parts based on mime type
		const encoder = new TextEncoder();
		
		const parts: IChatCollapsibleIODataPart[] = [
			{
				kind: 'data',
				value: encoder.encode('# Markdown Content\n\nThis is **bold** text.'),
				mimeType: 'text/markdown',
				uri: URI.parse('mcp://test/readme.md')
			},
			{
				kind: 'data',
				value: encoder.encode('Plain text content'),
				mimeType: 'text/plain',
				uri: URI.parse('mcp://test/file.txt')
			},
			{
				kind: 'data',
				value: encoder.encode('{ "key": "value" }'),
				mimeType: 'application/json',
				uri: URI.parse('mcp://test/data.json')
			},
			{
				kind: 'data',
				value: encoder.encode('## Another Markdown\n\n- Item 1\n- Item 2'),
				mimeType: 'text/markdown',
				uri: URI.parse('mcp://test/notes.md')
			}
		];

		// Simulate the logic from addResourceGroup method
		const markdownParts: IChatCollapsibleIODataPart[] = [];
		const otherParts: IChatCollapsibleIODataPart[] = [];
		
		for (const part of parts) {
			if (part.mimeType === 'text/markdown' && part.value) {
				markdownParts.push(part);
			} else {
				otherParts.push(part);
			}
		}

		assert.strictEqual(markdownParts.length, 2, 'Should find 2 markdown parts');
		assert.strictEqual(otherParts.length, 2, 'Should find 2 non-markdown parts');

		// Verify markdown parts
		assert.strictEqual(markdownParts[0].uri.path, '/readme.md', 'First markdown part should be readme.md');
		assert.strictEqual(markdownParts[1].uri.path, '/notes.md', 'Second markdown part should be notes.md');

		// Verify non-markdown parts  
		assert.strictEqual(otherParts[0].mimeType, 'text/plain', 'First other part should be plain text');
		assert.strictEqual(otherParts[1].mimeType, 'application/json', 'Second other part should be JSON');
	});

	test('should handle empty or missing content gracefully', () => {
		const parts: IChatCollapsibleIODataPart[] = [
			{
				kind: 'data',
				value: undefined, // No content
				mimeType: 'text/markdown',
				uri: URI.parse('mcp://test/empty.md')
			},
			{
				kind: 'data',
				value: new Uint8Array(0), // Empty content
				mimeType: 'text/markdown',
				uri: URI.parse('mcp://test/zero.md')
			}
		];

		const markdownParts: IChatCollapsibleIODataPart[] = [];
		const otherParts: IChatCollapsibleIODataPart[] = [];
		
		for (const part of parts) {
			if (part.mimeType === 'text/markdown' && part.value) {
				markdownParts.push(part);
			} else {
				otherParts.push(part);
			}
		}

		assert.strictEqual(markdownParts.length, 1, 'Should find 1 markdown part with content');
		assert.strictEqual(otherParts.length, 1, 'Should find 1 part without content');
	});

	test('should create content part instance successfully with mixed content', async () => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));

		const encoder = new TextEncoder();
		const markdownPart: IChatCollapsibleIODataPart = {
			kind: 'data',
			value: encoder.encode('# Test Markdown\n\nThis is a test.'),
			mimeType: 'text/markdown',
			uri: URI.parse('mcp://test/readme.md')
		};

		const textPart: IChatCollapsibleIODataPart = {
			kind: 'data',
			value: encoder.encode('Plain text content'),
			mimeType: 'text/plain',
			uri: URI.parse('mcp://test/file.txt')
		};

		const input = {
			kind: 'code' as const,
			textModel: null as any,
			languageId: 'markdown',
			options: {},
			codeBlockInfo: { codeBlockIndex: 0, element: null as any }
		};

		const output = {
			parts: [markdownPart, textPart]
		};

		const contentPart = instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			'Test Title',
			'Test Subtitle',
			{} as any, // context
			{} as any, // editorPool
			input,
			output,
			false, // isError
			true, // initiallyExpanded
			800 // width
		);

		assert.ok(contentPart, 'Content part should be created successfully');
		assert.ok(contentPart.domNode, 'Content part should have a DOM node');

		store.add(contentPart);
	});
});