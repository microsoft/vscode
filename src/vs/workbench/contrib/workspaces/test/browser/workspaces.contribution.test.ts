/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService, IFileStatWithMetadata } from '../../../../../platform/files/common/files.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { NotificationService } from '../../../../services/notification/common/notificationService.js';
import { createFileStat, TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { WorkspacesFinderContribution } from '../../browser/workspaces.contribution.js';

suite('WorkspacesFinderContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const filename = 'project-[Open](command:unexpected).code-workspace';

	for (const multiple of [false, true]) {
		test(`preserves the documentation link and literal workspace names (multiple: ${multiple})`, async () => {
			const folder = URI.file('/workspace');
			const files = multiple ? [filename, 'second.code-workspace'] : [filename];
			const storageService = store.add(new InMemoryStorageService());
			const notificationService = store.add(new NotificationService(storageService));
			store.add(toDisposable(() => {
				for (const notification of [...notificationService.model.notifications]) {
					notification.close();
				}
			}));
			let opened = false;
			const added = Event.toPromise(notificationService.model.onDidChangeNotification);
			store.add(new WorkspacesFinderContribution(
				new TestContextService(testWorkspace(folder)),
				notificationService,
				new class extends mock<IFileService>() {
					override async resolve(resource: URI): Promise<IFileStatWithMetadata> {
						return createFileStat(resource, false, false, true, false, files.map(name => ({ resource: joinPath(folder, name) })));
					}
				},
				new class extends mock<IQuickInputService>() { },
				new class extends mock<IHostService>() {
					override async openWindow(): Promise<void> { opened = true; }
				},
				storageService
			));
			await added;
			const notification = notificationService.model.notifications[0];

			assert.deepStrictEqual({
				text: notification.message.linkedText.toString(),
				links: notification.message.linkedText.nodes.filter(node => typeof node !== 'string'),
				actions: notification.actions?.primary?.map(action => action.label),
			}, {
				text: multiple
					? 'This folder contains multiple workspace files. Do you want to open one? Learn more about workspace files.'
					: `This folder contains a workspace file '${filename}'. Do you want to open it? Learn more about workspace files.`,
				links: [{ label: 'Learn more', href: 'https://go.microsoft.com/fwlink/?linkid=2025315' }],
				actions: [multiple ? 'Select Workspace' : 'Open Workspace'],
			});

			if (!multiple) {
				await notification.actions!.primary![0].run();
				assert.strictEqual(opened, true);
			}
		});
	}
});
