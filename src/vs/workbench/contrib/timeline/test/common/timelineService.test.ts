/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { TimelinePaneId, TimelineProvidersChangeEvent } from '../../common/timeline.js';
import { TimelineService } from '../../common/timelineService.js';

suite('TimelineService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('setUri notifies the view only after it has been opened', async () => {
		const events: string[] = [];
		const openView = new DeferredPromise<null>();
		const viewsService = upcastPartial<IViewsService>({
			openView: async id => {
				events.push(`openView ${id}`);
				await openView.p;
				events.push('opened');
				return null;
			}
		});
		const service = store.add(new TimelineService(new NullLogService(), viewsService, new TestConfigurationService(), store.add(new MockContextKeyService())));
		store.add(service.onDidChangeUri(uri => events.push(`onDidChangeUri ${uri?.path}`)));

		const result = service.setUri(URI.file('/timeline.txt'));
		await openView.complete(null);
		await result;

		assert.deepStrictEqual(events, [`openView ${TimelinePaneId}`, 'opened', 'onDidChangeUri /timeline.txt']);
	});
	test('removing one kind of provider with a shared id reloads the other kind', () => {
		const service = store.add(new TimelineService(new NullLogService(), upcastPartial<IViewsService>({}), new TestConfigurationService(), store.add(new MockContextKeyService())));
		const events: TimelineProvidersChangeEvent[] = [];
		store.add(service.onDidChangeProviders(e => events.push(e)));
		const registerFile = () => service.registerTimelineProvider({ id: 'shared', label: 'Shared', scheme: 'file', provideTimeline: async () => undefined, dispose() { } });
		const registerWorkspace = () => service.registerWorkspaceTimelineProvider({ id: 'shared', label: 'Shared', provideWorkspaceTimeline: async () => undefined, dispose() { } });

		const file = registerFile();
		const workspace = registerWorkspace();
		events.length = 0;
		workspace.dispose();
		file.dispose();
		const workspaceRemoved = events.splice(0);

		const file2 = registerFile();
		const workspace2 = registerWorkspace();
		events.length = 0;
		file2.dispose();
		workspace2.dispose();

		assert.deepStrictEqual({ workspaceRemoved, fileRemoved: events }, {
			workspaceRemoved: [{ removed: ['shared'], added: ['shared'] }, { removed: ['shared'] }],
			fileRemoved: [{ removed: ['shared'], added: ['shared'] }, { removed: ['shared'] }],
		});
	});
});
