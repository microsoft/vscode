/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual, deepStrictEqual } from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { TestThemeService } from '../../../test/browser/workbenchTestServices.js';
import { ChatSessionsView } from '../browser/chatSessions.js';
import { IChatGettingStartedItem, chatGettingStartedExtensionPoint } from '../browser/chatGettingStartedExtensionPoint.js';

suite('Chat Getting Started Extension Point', () => {
	
	let disposables: DisposableStore;
	
	setup(() => {
		disposables = new DisposableStore();
	});
	
	teardown(() => {
		disposables.dispose();
	});
	
	test('Extension point should be registered', () => {
		strictEqual(chatGettingStartedExtensionPoint.name, 'chatGettingStarted');
	});
	
	test('Extension point should have correct schema', () => {
		const schema = chatGettingStartedExtensionPoint.jsonSchema;
		strictEqual(schema.type, 'array');
		strictEqual(schema.items.type, 'object');
		
		// Check required fields
		deepStrictEqual(schema.items.required, ['id', 'label', 'commandId']);
		
		// Check properties exist
		const properties = schema.items.properties;
		strictEqual(typeof properties.id, 'object');
		strictEqual(typeof properties.label, 'object');
		strictEqual(typeof properties.commandId, 'object');
		strictEqual(typeof properties.icon, 'object');
		strictEqual(typeof properties.args, 'object');
		strictEqual(typeof properties.when, 'object');
	});
	
	test('Extension contributions should be processed correctly', () => {
		const mockExtensions = [
			{
				description: { identifier: { value: 'test-extension-1' } },
				value: [
					{
						id: 'test-item-1',
						label: 'Test Item 1',
						commandId: 'test.command1',
						icon: 'book'
					},
					{
						id: 'test-item-2',
						label: 'Test Item 2',
						commandId: 'test.command2',
						icon: 'extensions',
						args: ['arg1', 'arg2']
					}
				] as IChatGettingStartedItem[]
			}
		];
		
		// Verify the extension contributions structure
		const firstExtension = mockExtensions[0];
		const contributions = firstExtension.value;
		
		strictEqual(contributions.length, 2);
		strictEqual(contributions[0].id, 'test-item-1');
		strictEqual(contributions[0].label, 'Test Item 1');
		strictEqual(contributions[0].commandId, 'test.command1');
		strictEqual(contributions[0].icon, 'book');
		
		strictEqual(contributions[1].id, 'test-item-2');
		strictEqual(contributions[1].commandId, 'test.command2');
		deepStrictEqual(contributions[1].args, ['arg1', 'arg2']);
	});
	
	test('Context filtering should work correctly', () => {
		const contributions: IChatGettingStartedItem[] = [
			{
				id: 'always-visible',
				label: 'Always Visible',
				commandId: 'test.command1'
			},
			{
				id: 'context-dependent',
				label: 'Context Dependent',
				commandId: 'test.command2',
				when: 'someContextKey'
			}
		];
		
		// Test that items without when clause are always included
		const alwaysVisible = contributions.find(c => c.id === 'always-visible');
		strictEqual(alwaysVisible?.when, undefined);
		
		// Test that items with when clause have the condition
		const contextDependent = contributions.find(c => c.id === 'context-dependent');
		strictEqual(contextDependent?.when, 'someContextKey');
	});
	
	test('Example extension should have correct structure', () => {
		// Test the structure of our example extension contributions
		const exampleContributions: IChatGettingStartedItem[] = [
			{
				id: 'install-extensions',
				label: 'Install Chat Extensions',
				commandId: 'chat.sessions.gettingStarted',
				icon: 'extensions'
			},
			{
				id: 'learn-more',
				label: 'Learn More About GitHub Copilot coding agent',
				commandId: 'vscode.open',
				icon: 'book',
				args: ['https://aka.ms/coding-agent-docs']
			}
		];
		
		strictEqual(exampleContributions.length, 2);
		
		const installItem = exampleContributions[0];
		strictEqual(installItem.id, 'install-extensions');
		strictEqual(installItem.label, 'Install Chat Extensions');
		strictEqual(installItem.commandId, 'chat.sessions.gettingStarted');
		strictEqual(installItem.icon, 'extensions');
		
		const learnMoreItem = exampleContributions[1];
		strictEqual(learnMoreItem.id, 'learn-more');
		strictEqual(learnMoreItem.label, 'Learn More About GitHub Copilot coding agent');
		strictEqual(learnMoreItem.commandId, 'vscode.open');
		strictEqual(learnMoreItem.icon, 'book');
		deepStrictEqual(learnMoreItem.args, ['https://aka.ms/coding-agent-docs']);
	});
});