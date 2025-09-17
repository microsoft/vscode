/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { PlanningModeService } from '../../browser/planningModeService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { RESTRICTED_OPERATIONS } from '../../common/planningMode.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Planning Mode Service', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let service: PlanningModeService;
	let configurationService: TestConfigurationService;
	let storageService: TestStorageService;
	let notificationService: TestNotificationService;

	setup(() => {
		configurationService = new TestConfigurationService();
		storageService = new TestStorageService();
		notificationService = new TestNotificationService();

		service = disposables.add(new PlanningModeService(
			configurationService,
			storageService,
			notificationService
		));
	});

	teardown(() => {
		// Disposables are automatically disposed by ensureNoDisposablesAreLeakedInTestSuite
	});

	test('should start inactive', () => {
		assert.strictEqual(service.isActive, false);
		assert.strictEqual(service.conversationEntries.length, 0);
	});

	test('should activate planning mode', async () => {
		let changed = false;
		disposables.add(service.onDidChange(() => {
			changed = true;
		}));

		await service.setActive(true);

		assert.strictEqual(service.isActive, true);
		assert.strictEqual(changed, true);
		assert.ok(service.conversationEntries.length > 0); // Should have system message
	});

	test('should track conversation entries', () => {
		service.addConversationEntry({
			type: 'user',
			content: 'Test message'
		});

		service.addConversationEntry({
			type: 'assistant',
			content: 'Test response'
		});

		assert.strictEqual(service.conversationEntries.length, 2);
		assert.strictEqual(service.conversationEntries[0].type, 'user');
		assert.strictEqual(service.conversationEntries[1].type, 'assistant');
	});

	test('should restrict operations when active', async () => {
		await service.setActive(true);

		assert.strictEqual(service.isOperationRestricted(RESTRICTED_OPERATIONS.FILE_SAVE), true);
		assert.strictEqual(service.isOperationRestricted(RESTRICTED_OPERATIONS.FILE_CREATE), true);
		assert.strictEqual(service.isOperationRestricted(RESTRICTED_OPERATIONS.FILE_WRITE), true);
	});

	test('should not restrict operations when inactive', () => {
		assert.strictEqual(service.isOperationRestricted(RESTRICTED_OPERATIONS.FILE_SAVE), false);
		assert.strictEqual(service.isOperationRestricted(RESTRICTED_OPERATIONS.FILE_CREATE), false);
		assert.strictEqual(service.isOperationRestricted(RESTRICTED_OPERATIONS.FILE_WRITE), false);
	});

	test('should generate summary', async () => {
		await service.setActive(true);

		service.addConversationEntry({
			type: 'user',
			content: 'What files are in this project?'
		});

		service.addConversationEntry({
			type: 'tool-call',
			content: 'Called file listing tool',
			metadata: {
				toolName: 'list_files',
				toolParams: { path: '.' }
			}
		});

		service.addConversationEntry({
			type: 'assistant',
			content: 'Found 5 TypeScript files in the project root.'
		});

		const summary = service.generateSummary();

		assert.ok(summary.totalEntries >= 4); // System message + 3 added
		assert.ok(summary.toolsUsed.includes('list_files'));
		assert.ok(summary.summary.length > 0);
		assert.ok(summary.recommendations.length > 0);
	});

	test('should export conversation', async () => {
		await service.setActive(true);

		service.addConversationEntry({
			type: 'user',
			content: 'Test planning session'
		});

		const exported = service.exportConversation();

		assert.ok(exported.includes('# Planning Session Summary'));
		assert.ok(exported.includes('Test planning session'));
		assert.ok(exported.includes('## Detailed Conversation Log'));
	});

	test('should clear conversation', () => {
		service.addConversationEntry({
			type: 'user',
			content: 'Test message'
		});

		assert.ok(service.conversationEntries.length > 0);

		service.clearConversation();

		assert.strictEqual(service.conversationEntries.length, 0);
	});
});
