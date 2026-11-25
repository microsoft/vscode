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
import { IConstructorSignature } from '../../../../../platform/instantiation/common/instantiation.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewContainerModel, IViewDescriptorService, IViewTitleBadge, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { Codicon } from '../../../../../base/common/codicons.js';
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

	test('the title of a merged container carries the badge of its only view, which its header shows after the title and reads with it', async () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const viewContainer: ViewContainer = {
			id: 'test.viewPaneContainer',
			title: { value: 'Test', original: 'Test' },
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer),
		};
		const model = new class extends mock<IViewContainerModel>() {
			override readonly title = 'Test';
			override readonly visibleViewDescriptors = [];
			override readonly onDidAddVisibleViewDescriptors = Event.None;
			override readonly onDidRemoveVisibleViewDescriptors = Event.None;
			override readonly onDidChangeActiveViewDescriptors = Event.None;
			override readonly onDidChangeContainerInfo = Event.None;
			override setSizes() { }
		}();
		instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override getViewContainerById() { return viewContainer; }
			override getViewContainerByViewId() { return viewContainer; }
			override getDefaultContainerById() { return viewContainer; }
			override getViewDescriptorById() { return null; }
			override getViewContainerModel() { return model; }
			override getViewContainerLocation() { return ViewContainerLocation.Sidebar; }
			override getViewLocationById() { return ViewContainerLocation.Sidebar; }
			override canMoveViews() { return false; }
			override readonly onDidChangeContainerLocation = Event.None;
			override readonly onDidChangeLocation = Event.None;
		}());
		class TestViewPane extends ViewPane {
			setBadge(badge: IViewTitleBadge | undefined) { this.updateTitleBadge(badge); }
			setDescription(description: string) { this.updateTitleDescription(description); }
		}
		const element = append(mainWindow.document.body, $('.view-pane-container-test'));
		store.add(toDisposable(() => element.remove()));
		const container = store.add(instantiationService.createInstance(ViewPaneContainer, viewContainer.id, { mergeViewWithContainerWhenSingleView: true }));
		container.create(element);
		await instantiationService.get(IExtensionService).whenInstalledExtensionsRegistered();
		const pane = instantiationService.createInstance(TestViewPane as IConstructorSignature<TestViewPane, [IViewPaneOptions]>, { id: 'test.view', title: 'vscode' });
		pane.render();
		container.addPanes([{ pane, size: 100, disposable: toDisposable(() => { }) }]);
		let titleAreaUpdates = 0;
		store.add(container.onTitleAreaUpdate(() => titleAreaUpdates++));
		const header = pane.element.querySelector('.pane-header')!;
		const state = () => ({
			containerBadge: container.getTitleBadge()?.label,
			headerBadge: header.querySelector('.view-title-badge-container:not(.hidden)')?.textContent ?? null,
			afterTitle: header.querySelector('.title')!.nextElementSibling?.classList.contains('view-title-badge-container') ?? false,
			ariaHeaderLabel: pane.ariaHeaderLabel,
			titleAreaUpdates,
		});

		const before = state();
		pane.setBadge({ icon: Codicon.worktree, label: 'fix-tab-corner-alignment', tooltip: 'tooltip', ariaLabel: 'Folder Location, fix-tab-corner-alignment' });
		const withBadge = state();
		pane.setDescription('description');
		const order = [...header.querySelectorAll('.title, .description, .view-title-badge-container')].map(e => e.className.split(' ')[0]);
		pane.setBadge(undefined);

		assert.deepStrictEqual(order, ['title', 'description', 'view-title-badge-container']);
		assert.deepStrictEqual([before, withBadge, state()], [
			{ containerBadge: undefined, headerBadge: null, afterTitle: false, ariaHeaderLabel: 'vscode Section', titleAreaUpdates: 0 },
			{ containerBadge: 'fix-tab-corner-alignment', headerBadge: 'fix-tab-corner-alignment', afterTitle: true, ariaHeaderLabel: 'vscode, Folder Location, fix-tab-corner-alignment Section', titleAreaUpdates: 1 },
			{ containerBadge: undefined, headerBadge: null, afterTitle: false, ariaHeaderLabel: 'vscode - description Section', titleAreaUpdates: 3 },
		]);
	});
});
