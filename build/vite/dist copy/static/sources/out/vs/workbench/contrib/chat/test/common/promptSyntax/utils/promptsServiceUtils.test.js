/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../../platform/extensions/common/extensions.js';
import { isOrganizationPromptFile } from '../../../../common/promptSyntax/utils/promptsServiceUtils.js';
import { mockService } from './mock.js';
suite('promptsServiceUtils', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    suite('isOrganizationPromptFile', () => {
        const CHAT_EXTENSION_ID = 'github.copilot-chat';
        function createProductService(chatExtensionId) {
            return mockService({
                defaultChatAgent: chatExtensionId ? { chatExtensionId } : undefined,
            });
        }
        test('returns false when no chatExtensionId is configured', () => {
            const uri = URI.file('/some/path/github/prompt.md');
            const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
            const productService = createProductService(undefined);
            assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), false, 'Should return false when chatExtensionId is not configured');
        });
        test('returns false when extension ID does not match', () => {
            const uri = URI.file('/some/path/github/prompt.md');
            const extensionId = new ExtensionIdentifier('some.other-extension');
            const productService = createProductService(CHAT_EXTENSION_ID);
            assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), false, 'Should return false when extension ID does not match the built-in chat extension');
        });
        test('returns false when path does not contain /github/', () => {
            const uri = URI.file('/some/path/to/prompt.md');
            const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
            const productService = createProductService(CHAT_EXTENSION_ID);
            assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), false, 'Should return false when path does not contain /github/');
        });
        test('returns true when extension matches and path contains /github/', () => {
            const uri = URI.file('/some/path/github/prompts/prompt.md');
            const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
            const productService = createProductService(CHAT_EXTENSION_ID);
            assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), true, 'Should return true when extension matches and path contains /github/');
        });
        test('extension ID comparison is case-insensitive', () => {
            const uri = URI.file('/some/github/prompt.md');
            const extensionId = new ExtensionIdentifier('GITHUB.COPILOT-CHAT');
            const productService = createProductService('github.copilot-chat');
            assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), true, 'Extension ID comparison should be case-insensitive');
        });
        test('returns false when defaultChatAgent exists but chatExtensionId is empty', () => {
            const uri = URI.file('/some/github/prompt.md');
            const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
            const productService = mockService({
                defaultChatAgent: { chatExtensionId: '' },
            });
            assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), false, 'Should return false when chatExtensionId is empty string');
        });
        test('returns false for similar but incorrect paths', () => {
            const extensionId = new ExtensionIdentifier(CHAT_EXTENSION_ID);
            const productService = createProductService(CHAT_EXTENSION_ID);
            const invalidPaths = [
                '/some/githubs/prompt.md', // extra 's'
                '/some/github-org/prompt.md', // hyphenated
                '/some/mygithub/prompt.md', // prefix
                '/some/githubstuff/prompt.md', // suffix
                '/some/GITHUB/prompt.md', // uppercase (path matching is case-sensitive)
                '/some/Github/prompt.md', // mixed case
            ];
            for (const path of invalidPaths) {
                const uri = URI.file(path);
                assert.strictEqual(isOrganizationPromptFile(uri, extensionId, productService), false, `Should return false for path: ${path}`);
            }
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0c1NlcnZpY2VVdGlscy50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvdXRpbHMvcHJvbXB0c1NlcnZpY2VVdGlscy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDekcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sK0RBQStELENBQUM7QUFFcEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOERBQThELENBQUM7QUFDeEcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLFdBQVcsQ0FBQztBQUV4QyxLQUFLLENBQUMscUJBQXFCLEVBQUUsR0FBRyxFQUFFO0lBQ2pDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLEdBQUcsRUFBRTtRQUN0QyxNQUFNLGlCQUFpQixHQUFHLHFCQUFxQixDQUFDO1FBRWhELFNBQVMsb0JBQW9CLENBQUMsZUFBbUM7WUFDaEUsT0FBTyxXQUFXLENBQWtCO2dCQUNuQyxnQkFBZ0IsRUFBRSxlQUFlLENBQUMsQ0FBQyxDQUFDLEVBQUUsZUFBZSxFQUFFLENBQUMsQ0FBQyxDQUFDLFNBQVM7YUFDdkMsQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFFRCxJQUFJLENBQUMscURBQXFELEVBQUUsR0FBRyxFQUFFO1lBQ2hFLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQztZQUNwRCxNQUFNLFdBQVcsR0FBRyxJQUFJLG1C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