/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { $, append, Dimension } from '../../../../../base/browser/dom.js';
import { PaneView } from '../../../../../base/browser/ui/splitview/paneview.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../../workbenchTestServices.js';

suite('ViewPaneContainer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps pane-internal bottom spacing independent of inter-panel spacing', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const layoutService = new class extends TestLayoutService {
			compact = false;
			spacing = 4;
			floating = true;
			position = Position.BOTTOM;
			override isModernUICompact() { return this.compact; }
			override getPanelSpacing() { return this.spacing; }
			override isFloatingPanelsEnabled() { return this.floating; }
			override getPanelPosition() { return this.position; }
		}();
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		const viewContainer: ViewContainer = {
			id: 'test.viewPaneContainer',
			title: { value: 'Test', original: 'Test' },
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer),
		};
		const model = new class extends mock<IViewContainerModel>() {
			override readonly visibleViewDescriptors = [];
			override readonly onDidAddVisibleViewDescriptors = Event.None;
			override readonly onDidRemoveVisibleViewDescriptors = Event.None;
			override readonly onDidChangeActiveViewDescriptors = Event.None;
			override setSizes() { }
		}();
		let location = ViewContainerLocation.Sidebar;
		instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override getViewContainerById() { return viewContainer; }
			override getViewContainerModel() { return model; }
			override getViewContainerLocation() { return location; }
			override canMoveViews() { return false; }
			override readonly onDidChangeContainerLocation = Event.None;
		}());
		const element = append(mainWindow.document.body, $('.view-pane-container-test'));
		store.add(toDisposable(() => element.remove()));
		const container = store.add(instantiationService.createInstance(ViewPaneContainer, viewContainer.id, { mergeViewWithContainerWhenSingleView: false }));
		container.create(element);
		await instantiationService.get(IExtensionService).whenInstalledExtensionsRegistered();
		const childLayout = spy(PaneView.prototype, 'layout');
		store.add(toDisposable(() => childLayout.restore()));

		for (const compact of [false, true]) {
			layoutService.compact = compact;
			for (const spacing of [0, 4, 16]) {
				layoutService.spacing = spacing;
				container.layout(new Dimension(300, 600));
			}
		}
		layoutService.compact = false;
		location = ViewContainerLocation.Panel;
		layoutService.position = Position.TOP;
		container.layout(new Dimension(300, 600));
		layoutService.floating = false;
		container.layout(new Dimension(300, 600));

		assert.deepStrictEqual(childLayout.args, [
			[595, 300], [595, 300], [595, 300],
			[599, 300], [599, 300], [599, 300],
			[599, 300], [600, 300],
		]);
	});
});
