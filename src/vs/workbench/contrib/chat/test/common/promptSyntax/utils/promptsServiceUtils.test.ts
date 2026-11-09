/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { isOrganizationPromptFile } from '../../../../common/promptSyntax/utils/promptsServiceUtils.js';
import { mockService } from './mock.js';

suite('promptsServiceUtils', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('isOrganizationPromptFile', () => {
		const CHAT_EXTENSION_ID = 'github.copilot-chat';

		function createProductService(chatExtensionId: string | undefined): IProductService {
			return mockService<IProductService>({
				defaultChatAgent: chatExtensionId ? { chatExtensionId } : undefined,
			} as Partial<IProductService>);
		}

		test('returns false when no chatExtensionId is configured', () => {
			const uri = URI.file('/some/path/github/prompt.md');
			const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
			const productService = createProductService(undefined);

			assert.strictEqual(
				isOrganizationPromptFile(uri, extensionId, productService),
				false,
				'Should return false when chatExtensionId is not configured',
			);
		});

		test('returns false when extension ID does not match', () => {
			const uri = URI.file('/some/path/github/prompt.md');
			const extensionId = new ExtensionIdentifier('some.other-extension');
			const productService = createProductService(CHAT_EXTENSION_ID);

			assert.strictEqual(
				isOrganizationPromptFile(uri, extensionId, productService),
				false,
				'Should return false when extension ID does not match the built-in chat extension',
			);
		});

		test('returns false outside the default chat extension global storage cache', () => {
			const uri = URI.file('/some/path/to/prompt.md');
			const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
			const productService = createProductService(CHAT_EXTENSION_ID);

			assert.strictEqual(
				isOrganizationPromptFile(uri, extensionId, productService),
				false,
				'Should return false outside global storage',
			);
		});

		test('returns true for the default chat extension organization cache', () => {
			const uri = URI.file('/home/dev/.config/Code/User/globalStorage/github.copilot-chat/github/contoso/prompts/prompt.md');
			const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
			const productService = createProductService(CHAT_EXTENSION_ID);

			assert.strictEqual(
				isOrganizationPromptFile(uri, extensionId, productService),
				true,
				'Should return true for organization cache files',
			);
		});

		test('extension ID comparison is case-insensitive', () => {
			const uri = URI.file('/home/dev/.config/Code/User/globalStorage/github.copilot-chat/github/contoso/prompt.md');
			const extensionId = new ExtensionIdentifier('GITHUB.COPILOT-CHAT');
			const productService = createProductService('github.copilot-chat');

			assert.strictEqual(
				isOrganizationPromptFile(uri, extensionId, productService),
				true,
				'Extension ID comparison should be case-insensitive',
			);
		});

		test('returns false when defaultChatAgent exists but chatExtensionId is empty', () => {
			const uri = URI.file('/home/dev/.config/Code/User/globalStorage/github.copilot-chat/github/contoso/prompt.md');
			const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
			const productService = mockService<IProductService>({
				defaultChatAgent: { chatExtensionId: '' },
			} as Partial<IProductService>);

			assert.strictEqual(
				isOrganizationPromptFile(uri, extensionId, productService),
				false,
				'Should return false when chatExtensionId is empty string',
			);
		});

		test('returns false for unrelated github path segments', () => {
			const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
			const productService = createProductService(CHAT_EXTENSION_ID);

			const invalidPaths = [
				'/home/dev/github/vscode/extensions/copilot-chat/assets/prompts/prompt.md',
				'/home/dev/.config/Code/User/globalStorage/other.extension/github/contoso/prompt.md',
				'/home/dev/.config/Code/User/globalStorage/github.copilot-chat/githubs/contoso/prompt.md',
				'/home/dev/.config/Code/User/globalStorage/github.copilot-chat/github-org/contoso/prompt.md',
			];

			for (const path of invalidPaths) {
				const uri = URI.file(path);
				assert.strictEqual(
					isOrganizationPromptFile(uri, extensionId, productService),
					false,
					`Should return false for path: ${path}`,
				);
			}
		});
	});
});
