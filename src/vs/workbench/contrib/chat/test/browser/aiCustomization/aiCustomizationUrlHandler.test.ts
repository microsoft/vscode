/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IURLService } from '../../../../../../platform/url/common/url.js';
import { AIChatCustomizationsUrlHandler, parseChatCustomizationsUrl } from '../../../browser/aiCustomization/aiCustomizationUrlHandler.js';
import { AICustomizationManagementCommands, AICustomizationManagementSection } from '../../../browser/aiCustomization/aiCustomizationManagement.js';

suite('AIChatCustomizationsUrlHandler', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('parses supported pages and search query', () => {
		const pages = [
			['discover', { showDiscover: true }],
			['agents', { section: AICustomizationManagementSection.Agents }],
			['skills', { section: AICustomizationManagementSection.Skills }],
			['instructions', { section: AICustomizationManagementSection.Instructions }],
			['hooks', { section: AICustomizationManagementSection.Hooks }],
			['mcp-servers', { section: AICustomizationManagementSection.McpServers }],
			['plugins', { section: AICustomizationManagementSection.Plugins }],
			['tools', { section: AICustomizationManagementSection.Tools }],
			['migrations', { migration: true }],
		] as const;

		assert.deepStrictEqual(
			pages.map(([page, target]) => ({
				page,
				actual: parseChatCustomizationsUrl(URI.parse(`vscode://chat-customizations/open?page=${page}&search=code%20review`)),
				expected: { ...target, searchQuery: 'code review' },
			})),
			pages.map(([page, target]) => ({
				page,
				actual: { ...target, searchQuery: 'code review' },
				expected: { ...target, searchQuery: 'code review' },
			})),
		);
	});

	test('rejects unrelated and invalid URLs', () => {
		assert.deepStrictEqual([
			parseChatCustomizationsUrl(URI.parse('vscode://other/open?page=plugins')),
			parseChatCustomizationsUrl(URI.parse('vscode://chat-customizations/unknown?page=plugins')),
			parseChatCustomizationsUrl(URI.parse('vscode://chat-customizations/open')),
			parseChatCustomizationsUrl(URI.parse('vscode://chat-customizations/open?page=unknown')),
			parseChatCustomizationsUrl(URI.parse('vscode://chat-customizations/open?page=constructor')),
		], [undefined, undefined, undefined, undefined, undefined]);
	});

	test('normalizes human-readable page names', () => {
		assert.deepStrictEqual([
			parseChatCustomizationsUrl(URI.parse('vscode://chat-customizations/open?page=mcp%20server')),
			parseChatCustomizationsUrl(URI.parse('vscode://chat-customizations/open?page=mcpServers')),
		], [
			{ section: AICustomizationManagementSection.McpServers, searchQuery: undefined },
			{ section: AICustomizationManagementSection.McpServers, searchQuery: undefined },
		]);
	});

	test('dispatches valid URLs to the open editor command', async () => {
		const commands: { id: string; target: object }[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IURLService, {
			registerHandler: () => ({ dispose() { } }),
		} as unknown as IURLService);
		instantiationService.stub(ICommandService, {
			executeCommand: async (id: string, target: object) => {
				commands.push({ id, target });
			},
		} as unknown as ICommandService);
		instantiationService.stub(ILogService, new NullLogService());

		const handler = store.add(instantiationService.createInstance(AIChatCustomizationsUrlHandler));
		const handled = await handler.handleURL(URI.parse('vscode://chat-customizations/open?page=plugins&search=github'));

		assert.deepStrictEqual({ handled, commands }, {
			handled: true,
			commands: [{
				id: AICustomizationManagementCommands.OpenEditor,
				target: {
					section: AICustomizationManagementSection.Plugins,
					searchQuery: 'github',
				},
			}],
		});
	});
});
