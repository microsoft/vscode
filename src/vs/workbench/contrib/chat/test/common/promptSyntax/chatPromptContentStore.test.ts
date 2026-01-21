/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ChatPromptContentStore } from '../../../common/promptSyntax/chatPromptContentStore.js';

suite('ChatPromptContentStore', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let store: ChatPromptContentStore;

	setup(() => {
		store = testDisposables.add(new ChatPromptContentStore());
	});

	test('registerContent stores content retrievable by URI', () => {
		const uri = URI.parse('vscode-chat-prompt:/.agent.md/test-id');
		const content = '# Test Agent\nThis is test content';

		const disposable = store.registerContent(uri, content);
		testDisposables.add(disposable);

		const retrieved = store.getContent(uri);
		assert.strictEqual(retrieved, content);
	});

	test('getContent returns undefined for unregistered URI', () => {
		const uri = URI.parse('vscode-chat-prompt:/.agent.md/unknown-id');

		const retrieved = store.getContent(uri);
		assert.strictEqual(retrieved, undefined);
	});

	test('registerContent returns disposable that removes content', () => {
		const uri = URI.parse('vscode-chat-prompt:/.prompt.md/disposable-test');
		const content = 'Content to be disposed';

		const disposable = store.registerContent(uri, content);

		// Content should exist before disposal
		assert.strictEqual(store.getContent(uri), content);

		// Dispose and verify content is removed
		disposable.dispose();
		assert.strictEqual(store.getContent(uri), undefined);
	});

	test('multiple registrations for different URIs are independent', () => {
		const uri1 = URI.parse('vscode-chat-prompt:/.agent.md/id-1');
		const uri2 = URI.parse('vscode-chat-prompt:/.instructions.md/id-2');
		const content1 = 'Content 1';
		const content2 = 'Content 2';

		const disposable1 = store.registerContent(uri1, content1);
		const disposable2 = store.registerContent(uri2, content2);
		testDisposables.add(disposable1);
		testDisposables.add(disposable2);

		assert.strictEqual(store.getContent(uri1), content1);
		assert.strictEqual(store.getContent(uri2), content2);

		// Disposing one should not affect the other
		disposable1.dispose();
		assert.strictEqual(store.getContent(uri1), undefined);
		assert.strictEqual(store.getContent(uri2), content2);
	});

	test('re-registering same URI overwrites content', () => {
		const uri = URI.parse('vscode-chat-prompt:/.prompt.md/overwrite-test');
		const content1 = 'Original content';
		const content2 = 'Updated content';

		const disposable1 = store.registerContent(uri, content1);
		testDisposables.add(disposable1);

		assert.strictEqual(store.getContent(uri), content1);

		const disposable2 = store.registerContent(uri, content2);
		testDisposables.add(disposable2);

		assert.strictEqual(store.getContent(uri), content2);
	});

	test('store disposal clears all content', () => {
		const uri1 = URI.parse('vscode-chat-prompt:/.agent.md/clear-1');
		const uri2 = URI.parse('vscode-chat-prompt:/.agent.md/clear-2');

		store.registerContent(uri1, 'Content 1');
		store.registerContent(uri2, 'Content 2');

		assert.strictEqual(store.getContent(uri1), 'Content 1');
		assert.strictEqual(store.getContent(uri2), 'Content 2');

		// Create a new store for this test that we can dispose independently
		const localStore = new ChatPromptContentStore();
		const localUri = URI.parse('vscode-chat-prompt:/.agent.md/local');
		localStore.registerContent(localUri, 'Local content');

		assert.strictEqual(localStore.getContent(localUri), 'Local content');

		localStore.dispose();
		assert.strictEqual(localStore.getContent(localUri), undefined);
	});

	test('empty string content is stored correctly', () => {
		const uri = URI.parse('vscode-chat-prompt:/.prompt.md/empty-content');

		const disposable = store.registerContent(uri, '');
		testDisposables.add(disposable);

		const retrieved = store.getContent(uri);
		assert.strictEqual(retrieved, '');
	});

	test('content with special characters is stored correctly', () => {
		const uri = URI.parse('vscode-chat-prompt:/.instructions.md/special-chars');
		const content = '# Test\n\nUnicode: 你好世界 🎉\nSpecial: ${{variable}} @mention #tag';

		const disposable = store.registerContent(uri, content);
		testDisposables.add(disposable);

		const retrieved = store.getContent(uri);
		assert.strictEqual(retrieved, content);
	});

	test('URI comparison is string-based', () => {
		// Same logical URI created two different ways
		const uri1 = URI.parse('vscode-chat-prompt:/.agent.md/test');
		const uri2 = URI.from({
			scheme: 'vscode-chat-prompt',
			path: '/.agent.md/test'
		});

		const content = 'Test content';
		const disposable = store.registerContent(uri1, content);
		testDisposables.add(disposable);

		// Should be retrievable with equivalent URI
		assert.strictEqual(store.getContent(uri2), content);
	});

	test('getContent normalizes URI by stripping query parameters', () => {
		const baseUri = URI.parse('vscode-chat-prompt:/.agent.md/normalize-test');
		const content = 'Normalized content';

		const disposable = store.registerContent(baseUri, content);
		testDisposables.add(disposable);

		// Should retrieve content when queried with extra query parameters
		const uriWithQuery = baseUri.with({ query: 'vscodeLinkType=prompt' });
		assert.strictEqual(store.getContent(uriWithQuery), content);
	});

	test('getContent normalizes URI by stripping fragment', () => {
		const baseUri = URI.parse('vscode-chat-prompt:/.instructions.md/fragment-test');
		const content = 'Content with fragment lookup';

		const disposable = store.registerContent(baseUri, content);
		testDisposables.add(disposable);

		// Should retrieve content when queried with fragment
		const uriWithFragment = baseUri.with({ fragment: 'section1' });
		assert.strictEqual(store.getContent(uriWithFragment), content);
	});

	test('getContent normalizes URI by stripping both query and fragment', () => {
		const baseUri = URI.parse('vscode-chat-prompt:/.prompt.md/full-normalize');
		const content = 'Fully normalized content';

		const disposable = store.registerContent(baseUri, content);
		testDisposables.add(disposable);

		// Should retrieve content when queried with both query and fragment
		const uriWithBoth = baseUri.with({ query: 'vscodeLinkType=skill&foo=bar', fragment: 'heading' });
		assert.strictEqual(store.getContent(uriWithBoth), content);
	});

	test('registerContent normalizes URI so content registered with query is found without it', () => {
		const uriWithQuery = URI.parse('vscode-chat-prompt:/.agent.md/register-with-query?vscodeLinkType=agent');
		const content = 'Content registered with query';

		const disposable = store.registerContent(uriWithQuery, content);
		testDisposables.add(disposable);

		// Should retrieve content using base URI without query
		const baseUri = uriWithQuery.with({ query: '' });
		assert.strictEqual(store.getContent(baseUri), content);
	});
});
