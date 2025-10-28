/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';

suite('ChatShareUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('parseGitHubUrl - raw.githubusercontent.com', () => {
		const url = 'https://raw.githubusercontent.com/microsoft/vscode/main/.github/chats/chat-2024-01-15_10-30-00.json';
		const uri = URI.parse(url);
		
		assert.strictEqual(uri.authority, 'raw.githubusercontent.com');
		const parts = uri.path.split('/').filter(p => p);
		assert.strictEqual(parts[0], 'microsoft');
		assert.strictEqual(parts[1], 'vscode');
		assert.strictEqual(parts[2], 'main');
		assert.strictEqual(parts.slice(3).join('/'), '.github/chats/chat-2024-01-15_10-30-00.json');
	});

	test('parseGitHubUrl - github.com blob', () => {
		const url = 'https://github.com/microsoft/vscode/blob/main/.github/chats/chat-2024-01-15_10-30-00.json';
		const uri = URI.parse(url);
		
		assert.strictEqual(uri.authority, 'github.com');
		const parts = uri.path.split('/').filter(p => p);
		assert.strictEqual(parts[0], 'microsoft');
		assert.strictEqual(parts[1], 'vscode');
		assert.strictEqual(parts[2], 'blob');
		assert.strictEqual(parts[3], 'main');
		assert.strictEqual(parts.slice(4).join('/'), '.github/chats/chat-2024-01-15_10-30-00.json');
	});

	test('vscode protocol URL encoding', () => {
		const relativePath = '.github/chats/chat-2024-01-15_10-30-00.json';
		const shareUrl = `vscode://github.copilot-chat?open-chat=${encodeURIComponent(relativePath)}`;
		
		assert.ok(shareUrl.startsWith('vscode://github.copilot-chat?open-chat='));
		
		const uri = URI.parse(shareUrl);
		assert.strictEqual(uri.scheme, 'vscode');
		assert.strictEqual(uri.authority, 'github.copilot-chat');
		
		// Match the handler's decoding logic
		const query = decodeURIComponent(uri.query);
		assert.ok(query.startsWith('open-chat='));
		const chatUrl = query.substring('open-chat='.length);
		assert.strictEqual(chatUrl, relativePath);
	});
});
