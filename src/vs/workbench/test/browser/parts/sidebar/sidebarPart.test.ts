/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Orientation, Sash } from '../../../../../base/browser/ui/sash/sash.js';
import { Event } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { SidebarPart } from '../../../../browser/parts/sidebar/sidebarPart.js';
import { ActivitybarPart } from '../../../../browser/parts/activitybar/activitybarPart.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { ISharedLayoutStateService } from '../../../../services/layout/common/sharedLayoutState.js';
import { TestLayoutService, workbenchInstantiationService } from '../../workbenchTestServices.js';

class TestSidebarLayoutService extends TestLayoutService {
	sideBarPosition = Position.LEFT;

	override getSideBarPosition(): Position {
		return this.sideBarPosition;
	}
}

class TestViewDescriptorService extends mock<IViewDescriptorService>() {
	override readonly onDidChangeViewContainers = Event.None;
	override readonly onDidChangeContainerLocation = Event.None;
	override readonly onDidChangeViewContainerBadgeEnablement = Event.None;

	override getDefaultViewContainer(_location: ViewContainerLocation) {
		return undefined;
	}

	override getViewContainersByLocation(_location: ViewContainerLocation) {
		return [];
	}
}

suite('SidebarPart', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('moves the primary side bar class to the inward boundary sash', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const layoutService = new TestSidebarLayoutService();
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());

		const part = store.add(instantiationService.createInstance(SidebarPart));
		const container = document.createElement('div');
		const leftSash = store.add(new Sash(container, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL }));
		const rightSash = store.add(new Sash(container, { getVerticalSashLeft: () => 0 }, { orientation: Orientation.VERTICAL }));
		const leftSashElement = container.children.item(0);
		const rightSashElement = container.children.item(1);
		const states: boolean[][] = [];
		const captureState = () => states.push([
			leftSashElement?.classList.contains('primary-sidebar-sash') ?? false,
			rightSashElement?.classList.contains('primary-sidebar-sash') ?? false,
		]);

		part.setBoundarySashes({ left: leftSash, right: rightSash });
		captureState();

		layoutService.sideBarPosition = Position.RIGHT;
		part.setBoundarySashes({ left: leftSash, right: rightSash });
		captureState();

		part.dispose();
		captureState();

		assert.deepStrictEqual(states, [
			[false, true],
			[true, false],
			[false, false],
		]);
	});

	test('stores the arrangement of its view containers while neither it nor the activity bar shows them', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchLayoutService, new TestSidebarLayoutService());
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());
		const sharedLayoutStateService = instantiationService.get(ISharedLayoutStateService);
		sharedLayoutStateService.store(ActivitybarPart.pinnedViewContainersKey, JSON.stringify([
			{ id: 'explorer', pinned: true, visible: true },
			{ id: 'search', pinned: true, visible: true }
		]));

		const part = store.add(instantiationService.createInstance(SidebarPart));
		part.arrangePaneComposites({ pinned: new Map([['explorer', false]]), order: ['search', 'chat'] });

		assert.deepStrictEqual(JSON.parse(sharedLayoutStateService.get(ActivitybarPart.pinnedViewContainersKey, '[]')), [
			{ id: 'search', pinned: true, visible: true },
			{ id: 'chat', pinned: true, visible: false },
			{ id: 'explorer', pinned: false, visible: true }
		]);
	});
});
