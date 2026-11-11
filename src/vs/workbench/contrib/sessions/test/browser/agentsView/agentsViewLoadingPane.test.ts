/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../../common/views.js';
import { ISessionsStorageService } from '../../../../../services/sessions/browser/sessionsStorageService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { AgentsProfileSessionsStorageService } from '../../../browser/agentsView/agentsProfileSessionsStorageService.js';
import { AgentsViewLoadingPane } from '../../../browser/agentsView/agentsViewLoadingPane.js';

suite('AgentsViewLoadingPane', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('starts loading the state the Sessions view waits for, as nothing else might', () => {
		let loads = 0;
		// Only the load matters here: the storage service is otherwise created only as the Sessions view or the chat part needs it
		const storageService: AgentsProfileSessionsStorageService = Object.create(AgentsProfileSessionsStorageService.prototype);
		storageService.whenReady = () => {
			loads++;
			return Promise.resolve();
		};
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(ISessionsStorageService, storageService);
		instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override readonly onDidChangeLocation = Event.None;
			override getViewLocationById(): ViewContainerLocation {
				return ViewContainerLocation.Sidebar;
			}
		});

		store.add(instantiationService.createInstance(AgentsViewLoadingPane, { id: 'workbench.view.agents.loading', title: 'Sessions' }));

		assert.strictEqual(loads, 1);
	});
});
