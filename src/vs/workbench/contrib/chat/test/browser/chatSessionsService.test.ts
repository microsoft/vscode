/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatSessionsService } from '../../browser/chatSessions.contribution.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite.skip('ChatSessionsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let chatSessionsService: ChatSessionsService;

	setup(() => {
		const instantiationService = store.add(workbenchInstantiationService(undefined, store));
		chatSessionsService = store.add(instantiationService.createInstance(ChatSessionsService));
	});

	suite('extractFileNameFromLink', () => {

		function callExtractFileNameFromLink(filePath: string): string {
			// Access the private method using bracket notation with proper typing
			type ServiceWithPrivateMethod = Record<'extractFileNameFromLink', (filePath: string) => string>;
			return (chatSessionsService as unknown as ServiceWithPrivateMethod)['extractFileNameFromLink'](filePath);
		}

		test('should extract filename from markdown link with link text', () => {
			const input = 'Read [README](file:///path/to/README.md) for more info';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Read README for more info');
		});

		test('should extract filename from markdown link without link text', () => {
			const input = 'Read [](file:///index.js) for instructions';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Read index.js for instructions');
		});

		test('should extract filename from markdown link with empty link text', () => {
			const input = 'Check [  ](file:///config.json) settings';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Check config.json settings');
		});

		test('should handle multiple file links in same string', () => {
			const input = 'See [main](file:///main.js) and [utils](file:///utils/helper.ts)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'See main and utils');
		});

		test('should handle file path without extension', () => {
			const input = 'Open [](file:///src/components/Button)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Open Button');
		});

		test('should handle deep file paths', () => {
			const input = 'Edit [](file:///very/deep/nested/path/to/file.tsx)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Edit file.tsx');
		});

		test('should handle file path that is just a filename', () => {
			const input = 'View [script](file:///script.py)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'View script');
		});

		test('should handle link text with special characters', () => {
			const input = 'See [App.js (main)](file:///App.js)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'See App.js (main)');
		});

		test('should return original string if no file links present', () => {
			const input = 'This is just regular text with no links';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'This is just regular text with no links');
		});

		test('should handle mixed content with file links and regular text', () => {
			const input = 'Check [config](file:///config.yml) and visit https://example.com';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Check config and visit https://example.com');
		});

		test('should handle file path with query parameters or fragments', () => {
			const input = 'Open [](file:///index.html?param=value#section)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Open index.html?param=value#section');
		});

		test('should handle Windows-style paths', () => {
			const input = 'Edit [](file:///C:/Users/user/Documents/file.txt)';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, 'Edit file.txt');
		});

		test('should preserve whitespace around replacements', () => {
			const input = '   Check [](file:///test.js)   ';
			const result = callExtractFileNameFromLink(input);
			assert.strictEqual(result, '   Check test.js   ');
		});
	});
});
