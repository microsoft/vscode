/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { PanelPart } from '../../../browser/parts/panel/panelPart.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IWorkbenchLayoutService, Position } from '../../../services/layout/browser/layoutService.js';
import { TestLayoutService, workbenchInstantiationService } from '../workbenchTestServices.js';

class TestPaneCompositeLayoutService extends TestLayoutService {
	panelPosition = Position.BOTTOM;
	override getPanelPosition(): Position { return this.panelPosition; }
}

class TestViewDescriptorService extends mock<IViewDescriptorService>() {
	override readonly onDidChangeViewContainers = Event.None;
	override readonly onDidChangeContainerLocation = Event.None;
	override canMoveViews(): boolean { return false; }
	override getDefaultViewContainer(_location: ViewContainerLocation) { return undefined; }
	override getViewContainersByLocation(_location: ViewContainerLocation) { return []; }
}

class TestPanelPart extends PanelPart {
	get testContentDimension() { return assertReturnsDefined(this.contentDimension); }
}

suite('Pane composite part layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves classic panel border sizing at every position', () => {
		const root = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => root.remove()));
		const container = append(root, $('.part.panel'));
		const layoutService = new TestPaneCompositeLayoutService();
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IWorkbenchLayoutService, layoutService);
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());

		const part = store.add(instantiationService.createInstance(TestPanelPart));
		part.create(container);
		const layoutAt = (position: Position) => {
			layoutService.panelPosition = position;
			part.layout(300, 200, 0, 0);
			return { width: part.testContentDimension.width, height: part.testContentDimension.height };
		};

		assert.deepStrictEqual({
			top: layoutAt(Position.TOP),
			right: layoutAt(Position.RIGHT),
			bottom: layoutAt(Position.BOTTOM),
			left: layoutAt(Position.LEFT),
		}, {
			top: { width: 300, height: 199 },
			right: { width: 299, height: 200 },
			bottom: { width: 300, height: 200 },
			left: { width: 300, height: 200 },
		});
	});
});
