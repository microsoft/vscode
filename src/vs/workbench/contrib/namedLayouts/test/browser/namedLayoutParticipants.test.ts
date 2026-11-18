/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { ISharedLayoutStateService } from '../../../../services/layout/common/sharedLayoutState.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { mock } from '../../../../test/common/workbenchTestServices.js';
import { SharedLayoutStateParticipant } from '../../browser/namedLayoutParticipants.js';

suite('NamedLayoutParticipants', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('the description of view containers and views specifies values that are the defaults of their contributions', () => {
		const createViewContainer = (id: string) => new class extends mock<ViewContainer>() { override readonly id = id; };
		const createView = (id: string) => new class extends mock<IViewDescriptor>() { override readonly id = id; override readonly canToggleVisibility = true; };
		const explorer = createViewContainer('explorer');
		const search = createViewContainer('search');
		const outline = createView('outline');
		const timeline = createView('timeline');
		const createModel = (viewDescriptors: IViewDescriptor[], visibleIds: string[]) => new class extends mock<IViewContainerModel>() {
			override readonly allViewDescriptors = viewDescriptors;
			override readonly activeViewDescriptors = viewDescriptors;
			override isVisible(id: string) { return visibleIds.includes(id); }
		};
		const explorerModel = createModel([outline, timeline], [outline.id]);
		const searchModel = createModel([], []);
		const viewDescriptorService = new class extends mock<IViewDescriptorService>() {
			override getViewContainersByLocation(location: ViewContainerLocation) { return location === ViewContainerLocation.Sidebar ? [explorer, search] : []; }
			override getViewContainerModel(viewContainer: ViewContainer) { return viewContainer === explorer ? explorerModel : searchModel; }
			override getDefaultContainerById() { return explorer; }
		};
		// The pinned view containers and their order are the defaults of their contributions
		const paneCompositePartService = new class extends mock<IPaneCompositePartService>() {
			override getPinnedPaneCompositeIds() { return [explorer.id]; }
			override getPaneCompositeIds() { return [explorer.id, search.id]; }
		};
		const sharedLayoutStateService = new class extends mock<ISharedLayoutStateService>() { override readonly onDidChange = Event.None; };

		const testObject = new SharedLayoutStateParticipant(sharedLayoutStateService, viewDescriptorService, paneCompositePartService);

		assert.deepStrictEqual(testObject.captureDefinition(), {
			viewContainers: {
				explorer: { location: 'sideBar', visible: true, order: 1 },
				search: { location: 'sideBar', visible: false, order: 2 }
			},
			views: {
				outline: { visible: true, order: 1 },
				timeline: { visible: false, order: 2 }
			}
		});
	});
});
