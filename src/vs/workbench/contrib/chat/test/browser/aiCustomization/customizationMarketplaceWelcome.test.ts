/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IRenderedMarkdown } from '../../../../../../base/browser/markdownRenderer.js';
import { timeout } from '../../../../../../base/common/async.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IMarkdownRendererService } from '../../../../../../platform/markdown/browser/markdownRenderer.js';
import { CustomizationMarketplaceWelcome } from '../../../browser/aiCustomization/customizationMarketplaceWelcome.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../common/aiCustomizationWorkspaceService.js';

suite('CustomizationMarketplaceWelcome', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders an accessible embedded notice and opens the requested marketplace section', async () => {
		const commands: { id: string; args: unknown[] }[] = [];
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<R = unknown>(id: string, ...args: unknown[]): Promise<R | undefined> {
				commands.push({ id, args });
				return undefined;
			}
		}();
		const markdownRendererService = new class extends mock<IMarkdownRendererService>() {
			override render(markdown: MarkdownString): IRenderedMarkdown {
				const element = document.createElement('div');
				element.textContent = markdown.value;
				return { element, dispose() { } };
			}
		}();
		const container = document.createElement('div');
		store.add(new CustomizationMarketplaceWelcome(container, {
			title: 'MCP Servers have moved',
			description: new MarkdownString('Browse and manage MCP servers in Customizations'),
			buttonLabel: 'Browse',
			section: AICustomizationManagementSection.McpServers,
		}, markdownRendererService, commandService));

		container.querySelector<HTMLAnchorElement>('.monaco-button')!.click();
		await timeout(0);

		assert.deepStrictEqual({
			title: container.querySelector('.customizations-marketplace-welcome-title')?.textContent,
			description: container.querySelector('.customizations-marketplace-welcome-description')?.textContent,
			iconHidden: container.querySelector('.codicon-info')?.getAttribute('aria-hidden'),
			button: container.querySelector<HTMLAnchorElement>('.monaco-button')?.textContent,
			commands,
		}, {
			title: 'MCP Servers have moved',
			description: 'Browse and manage MCP servers in Customizations',
			iconHidden: 'true',
			button: 'Browse',
			commands: [{
				id: AICustomizationManagementCommands.OpenMarketplace,
				args: [AICustomizationManagementSection.McpServers],
			}],
		});
	});
});
