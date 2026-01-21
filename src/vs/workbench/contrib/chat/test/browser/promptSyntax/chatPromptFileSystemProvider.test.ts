/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../../../../../../platform/files/common/files.js';
import { ChatPromptFileSystemProvider } from '../../../browser/promptSyntax/chatPromptFileSystemProvider.js';
import { ChatPromptContentStore } from '../../../common/promptSyntax/chatPromptContentStore.js';

suite('ChatPromptFileSystemProvider', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	let contentStore: ChatPromptContentStore;
	let provider: ChatPromptFileSystemProvider;

	setup(() => {
		contentStore = testDisposables.add(new ChatPromptContentStore());
		provider = new ChatPromptFileSystemProvider(contentStore);
	});

	suite('stat', () => {
		test('returns stat for registered content', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/test-agent');
			const content = '# Test Agent\nThis is test content.';

			testDisposables.add(contentStore.registerContent(uri, content));

			const stat = await provider.stat(uri);

			assert.strictEqual(stat.type, 1); // FileType.File
			assert.strictEqual(stat.size, VSBuffer.fromString(content).byteLength);
		});

		test('throws FileNotFound for unregistered URI', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/missing');

			await assert.rejects(
				() => provider.stat(uri),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound;
				},
				'Should throw FileNotFound error'
			);
		});

		test('returns correct size for empty content', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.prompt.md/empty');

			testDisposables.add(contentStore.registerContent(uri, ''));

			const stat = await provider.stat(uri);

			assert.strictEqual(stat.size, 0);
		});

		test('returns correct size for unicode content', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.instructions.md/unicode');
			const content = '日本語テスト 🎉';

			testDisposables.add(contentStore.registerContent(uri, content));

			const stat = await provider.stat(uri);

			assert.strictEqual(stat.size, VSBuffer.fromString(content).byteLength);
		});
	});

	suite('readFile', () => {
		test('returns content for registered URI', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/test-agent');
			const content = '# Test Agent\nThis is test content.';

			testDisposables.add(contentStore.registerContent(uri, content));

			const result = await provider.readFile(uri);

			assert.strictEqual(VSBuffer.wrap(result).toString(), content);
		});

		test('throws FileNotFound for unregistered URI', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/missing');

			await assert.rejects(
				() => provider.readFile(uri),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound;
				},
				'Should throw FileNotFound error'
			);
		});

		test('returns empty buffer for empty content', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.prompt.md/empty');

			testDisposables.add(contentStore.registerContent(uri, ''));

			const result = await provider.readFile(uri);

			assert.strictEqual(result.byteLength, 0);
		});

		test('preserves unicode content', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.instructions.md/unicode');
			const content = '日本語テスト 🎉\n\n```typescript\nconst greeting = "こんにちは";\n```';

			testDisposables.add(contentStore.registerContent(uri, content));

			const result = await provider.readFile(uri);

			assert.strictEqual(VSBuffer.wrap(result).toString(), content);
		});

		test('handles content with special markdown characters', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/markdown');
			const content = '# Heading\n\n- List item\n- Another item\n\n> Blockquote\n\n```\ncode block\n```';

			testDisposables.add(contentStore.registerContent(uri, content));

			const result = await provider.readFile(uri);

			assert.strictEqual(VSBuffer.wrap(result).toString(), content);
		});
	});

	suite('content lifecycle', () => {
		test('readFile fails after content is disposed', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/lifecycle-test');
			const content = 'Temporary content';

			const registration = contentStore.registerContent(uri, content);

			// Verify content is readable
			const result = await provider.readFile(uri);
			assert.strictEqual(VSBuffer.wrap(result).toString(), content);

			// Dispose the content
			registration.dispose();

			// Now reading should fail
			await assert.rejects(
				() => provider.readFile(uri),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound;
				}
			);
		});

		test('stat fails after content is disposed', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.prompt.md/lifecycle-stat');
			const content = 'Content for stat test';

			const registration = contentStore.registerContent(uri, content);

			// Verify stat works
			const stat = await provider.stat(uri);
			assert.strictEqual(stat.size, VSBuffer.fromString(content).byteLength);

			// Dispose the content
			registration.dispose();

			// Now stat should fail
			await assert.rejects(
				() => provider.stat(uri),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.FileNotFound;
				}
			);
		});
	});

	suite('URI normalization', () => {
		test('readFile succeeds when URI has query parameters', async () => {
			const baseUri = URI.parse('vscode-chat-prompt:/.agent.md/query-test');
			const content = 'Content for query test';

			testDisposables.add(contentStore.registerContent(baseUri, content));

			// Read with query parameters
			const uriWithQuery = baseUri.with({ query: 'vscodeLinkType=prompt' });
			const result = await provider.readFile(uriWithQuery);

			assert.strictEqual(VSBuffer.wrap(result).toString(), content);
		});

		test('stat succeeds when URI has fragment', async () => {
			const baseUri = URI.parse('vscode-chat-prompt:/.instructions.md/fragment-test');
			const content = 'Content for fragment test';

			testDisposables.add(contentStore.registerContent(baseUri, content));

			// Stat with fragment
			const uriWithFragment = baseUri.with({ fragment: 'section1' });
			const stat = await provider.stat(uriWithFragment);

			assert.strictEqual(stat.size, VSBuffer.fromString(content).byteLength);
		});
	});

	suite('unsupported operations', () => {
		test('writeFile throws NoPermissions error', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/write-test');

			await assert.rejects(
				() => provider.writeFile(uri, new Uint8Array(), { create: true, overwrite: true, unlock: false, atomic: false }),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions;
				}
			);
		});

		test('mkdir throws NoPermissions error', async () => {
			const uri = URI.parse('vscode-chat-prompt:/test-dir');

			await assert.rejects(
				() => provider.mkdir(uri),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions;
				}
			);
		});

		test('delete throws NoPermissions error', async () => {
			const uri = URI.parse('vscode-chat-prompt:/.agent.md/delete-test');

			await assert.rejects(
				() => provider.delete(uri, { recursive: false, useTrash: false, atomic: false }),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions;
				}
			);
		});

		test('rename throws NoPermissions error', async () => {
			const from = URI.parse('vscode-chat-prompt:/.agent.md/rename-from');
			const to = URI.parse('vscode-chat-prompt:/.agent.md/rename-to');

			await assert.rejects(
				() => provider.rename(from, to, { overwrite: false }),
				(err: Error & { code?: string }) => {
					return toFileSystemProviderErrorCode(err) === FileSystemProviderErrorCode.NoPermissions;
				}
			);
		});

		test('readdir returns empty array', async () => {
			const uri = URI.parse('vscode-chat-prompt:/');

			const result = await provider.readdir(uri);

			assert.deepStrictEqual(result, []);
		});
	});
});
