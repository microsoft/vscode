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
import { IViewPaneOptions, ViewPane } from '../../../../browser/parts/views/viewPane.js';
import { IViewContainerModel, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../../common/views.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IConstructorSignature } from '../../../../../platform/instantiation/common/instantiation.js';
import { IActivityService } from '../../../../services/activity/common/activity.js';
import { ActivityService } from '../../../../services/activity/browser/activityService.js';
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

	test('a view shows the title badge the activity service shows for it after its title and description, and reads it with its header', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const viewContainer: ViewContainer = {
			id: 'test.viewPaneContainer',
			title: { value: 'Test', original: 'Test' },
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer),
		};
		const model = new class extends mock<IViewContainerModel>() {
			override readonly title = 'Test';
			override readonly onDidChangeContainerInfo = Event.None;
		}();
		instantiationService.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override getViewContainerByViewId() { return viewContainer; }
			override getDefaultContainerById() { return viewContainer; }
			override getViewDescriptorById() { return null; }
			override getViewContainerModel() { return model; }
			override getViewLocationById() { return ViewContainerLocation.Sidebar; }
			override readonly onDidChangeLocation = Event.None;
		}());
		const activityService = store.add(instantiationService.createInstance(ActivityService));
		instantiationService.stub(IActivityService, activityService);
		class TestViewPane extends ViewPane {
			setDescription(description: string) { this.updateTitleDescription(description); }
			setTitle(title: string) { this.updateTitle(title); }
		}
		const pane = store.add(instantiationService.createInstance(TestViewPane as IConstructorSignature<TestViewPane, [IViewPaneOptions]>, { id: 'test.view', title: 'vscode' }));
		pane.render();
		const header = pane.element.querySelector('.pane-header')!;
		const state = () => ({
			badge: header.querySelector('.view-title-badge-container:not(.hidden)')?.textContent ?? null,
			icon: !!header.querySelector('.view-title-badge-icon.codicon-worktree'),
			ariaHeaderLabel: pane.ariaHeaderLabel,
			headerAria: header.getAttribute('aria-label'),
		});
		const badge = { icon: Codicon.worktree, label: 'fix', tooltip: 'tooltip', ariaLabel: 'Folder Location, fix' };

		const before = state();
		const shown = activityService.showViewTitleBadge('test.view', badge);
		const withBadge = state();
		const otherView = activityService.showViewTitleBadge('other.view', { ...badge, label: 'other' });
		const afterOtherView = state();
		pane.setDescription('description');
		const order = [...header.querySelectorAll('.title, .description, .view-title-badge-container')].map(e => e.className.split(' ')[0]);
		const withDescription = state();
		const title = header.querySelector('.title')!;
		title.setAttribute('aria-label', pane.ariaHeaderLabel);
		pane.setTitle('renamed');
		const renamed = { header: pane.ariaHeaderLabel, title: title.getAttribute('aria-label') };
		shown.dispose();
		otherView.dispose();

		assert.deepStrictEqual({ order, renamed, states: [before, withBadge, afterOtherView, withDescription, state()] }, {
			order: ['title', 'description', 'view-title-badge-container'],
			renamed: { header: 'renamed - description Section, Folder Location, fix', title: 'renamed - description Section, Folder Location, fix' },
			states: [
				{ badge: null, icon: false, ariaHeaderLabel: 'vscode Section', headerAria: 'vscode Section' },
				{ badge: 'fix', icon: true, ariaHeaderLabel: 'vscode Section, Folder Location, fix', headerAria: 'vscode Section, Folder Location, fix' },
				{ badge: 'fix', icon: true, ariaHeaderLabel: 'vscode Section, Folder Location, fix', headerAria: 'vscode Section, Folder Location, fix' },
				{ badge: 'fix', icon: true, ariaHeaderLabel: 'vscode - description Section, Folder Location, fix', headerAria: 'vscode - description Section, Folder Location, fix' },
				{ badge: null, icon: false, ariaHeaderLabel: 'renamed - description Section', headerAria: 'renamed - description Section' },
			]
		});
	});
});
