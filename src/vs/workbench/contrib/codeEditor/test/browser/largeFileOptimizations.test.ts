/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NotificationService } from '../../../../services/notification/common/notificationService.js';
import { LargeFileOptimizationsWarner } from '../../browser/largeFileOptimizations.js';

suite('LargeFileOptimizationsWarner', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const filename = 'readme-[Open Empty Editor](command:workbench.action.files.newUntitledFile "Open README").txt';

	for (const { lineCount, largeFileOptimizations, expectedNotifications } of [
		{ lineCount: 300000, largeFileOptimizations: true, expectedNotifications: 0 },
		{ lineCount: 300001, largeFileOptimizations: true, expectedNotifications: 1 },
		{ lineCount: 300001, largeFileOptimizations: false, expectedNotifications: 0 },
	]) {
		test(`${lineCount} lines, optimizations ${largeFileOptimizations}`, async () => {
			const model = store.add(createTextModel('\n'.repeat(lineCount - 1), null, { largeFileOptimizations }, URI.file(`/${filename}`)));
			const notificationService = store.add(new NotificationService(store.add(new InMemoryStorageService())));
			store.add(toDisposable(() => {
				for (const notification of [...notificationService.model.notifications]) {
					notification.close();
				}
			}));
			const configurationService = new class extends TestConfigurationService {
				override updateValue(...args: Parameters<TestConfigurationService['updateValue']>): Promise<void> {
					return this.setUserConfiguration(...args);
				}
			}({ editor: { largeFileOptimizations } });
			store.add(new LargeFileOptimizationsWarner(
				new class extends mock<ICodeEditor>() {
					override readonly onDidChangeModel = Event.None;
					override getModel() { return model; }
				},
				notificationService,
				configurationService
			));

			assert.strictEqual(notificationService.model.notifications.length, expectedNotifications);
			if (expectedNotifications) {
				const notification = notificationService.model.notifications[0];
				assert.deepStrictEqual({
					startsWithFilename: notification.message.raw.startsWith(`${filename}: `),
					nodes: notification.message.linkedText.nodes,
					actions: notification.actions?.primary?.map(action => action.label),
				}, {
					startsWithFilename: true,
					nodes: [notification.message.raw],
					actions: ['Don\'t Show Again', 'Forcefully Enable Features'],
				});

				await notification.actions!.primary![1].run();
				assert.deepStrictEqual({
					largeFileOptimizations: configurationService.getValue('editor.largeFileOptimizations'),
					messages: notificationService.model.notifications.map(item => item.message.raw),
				}, {
					largeFileOptimizations: false,
					messages: ['Please reopen file in order for this setting to take effect.'],
				});
			}
		});
	}
});
