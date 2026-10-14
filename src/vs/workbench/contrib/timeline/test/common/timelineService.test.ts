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
import { TimelinePaneId } from '../../common/timeline.js';
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
		store.add(service.onDidChangeUri(uri => events.push(`onDidChangeUri ${uri.path}`)));

		const result = service.setUri(URI.file('/timeline.txt'));
		await openView.complete(null);
		await result;

		assert.deepStrictEqual(events, [`openView ${TimelinePaneId}`, 'opened', 'onDidChangeUri /timeline.txt']);
	});
});
