/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Pane } from '../../../../base/browser/ui/splitview/paneview.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { focusNavigableView } from '../../../browser/actions/viewNavigationActions.js';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';

/** Exercise the real focusable and collapsible header provided by the pane widget. */
class NavigationTestPane extends Pane {
	constructor() {
		super({ title: 'Collapsed Test Pane', minimumBodySize: 10, maximumBodySize: 100, expanded: false });
		this.render();
	}

	protected renderHeader(_container: HTMLElement): void { }
	protected renderBody(_container: HTMLElement): void { }
	protected layoutBody(_height: number, _width: number): void { }
}

suite('Workbench view navigation: rendered pane', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('focuses a collapsed pane header without expanding it', async () => {
		const pane = disposables.add(new NavigationTestPane());
		const host = document.createElement('div');
		document.body.appendChild(host);
		host.appendChild(pane.element);

		try {
			const container = { id: 'explorer' } as ViewContainer;
			let openedViews = 0;
			const views = {
				getFocusedView: () => ({ id: 'a' }) as IViewDescriptor,
				getVisibleViewContainer: (location: ViewContainerLocation) =>
					location === ViewContainerLocation.Sidebar ? container : null,
				getActiveViewWithId: (id: string) => id === 'b' ? pane : null,
				openView: async () => { openedViews++; return null; }
			} as unknown as IViewsService;
			const descriptors = {
				getViewContainerByViewId: (id: string) => ['a', 'b'].includes(id) ? container : null,
				getViewContainerModel: () => ({
					visibleViewDescriptors: [{ id: 'a' }, { id: 'b' }],
					isCollapsed: (id: string) => id === 'b'
				}) as unknown as IViewContainerModel
			} as unknown as IViewDescriptorService;

			assert.strictEqual(pane.isExpanded(), false);
			assert.notStrictEqual(document.activeElement, pane.draggableElement);

			const layout = { isVisible: (part: Parts) => part === Parts.SIDEBAR_PART } as IWorkbenchLayoutService;
			await focusNavigableView(views, descriptors, layout, { direction: 'next', scope: 'container' });

			assert.strictEqual(document.activeElement, pane.draggableElement);
			assert.strictEqual(pane.isExpanded(), false, 'focus must not change the collapsed state');
			assert.strictEqual(openedViews, 0, 'openView would expand the pane');
		} finally {
			host.remove();
		}
	});



	test('focuses a rendered collapsed header when its descriptor mapping becomes unavailable', async () => {
		const pane = disposables.add(new NavigationTestPane());
		const host = document.createElement('div');
		document.body.appendChild(host);
		host.appendChild(pane.element);

		try {
			const container = { id: 'explorer' } as ViewContainer;
			let openedViews = 0;
			const views = {
				getFocusedView: () => ({ id: 'a' }) as IViewDescriptor,
				getVisibleViewContainer: (location: ViewContainerLocation) =>
					location === ViewContainerLocation.Sidebar ? container : null,
				getActiveViewWithId: (id: string) => id === 'b' ? pane : null,
				openView: async () => { openedViews++; return null; }
			} as unknown as IViewsService;
			const descriptors = {
				// A moving view may already have lost its previous descriptor
				// mapping while its rendered header remains in the snapshot.
				getViewContainerByViewId: (id: string) => id === 'a' ? container : null,
				getViewContainerModel: () => ({
					visibleViewDescriptors: [{ id: 'a' }, { id: 'b' }],
					isCollapsed: (id: string) => id === 'b'
				}) as unknown as IViewContainerModel
			} as unknown as IViewDescriptorService;
			const layout = { isVisible: (part: Parts) => part === Parts.SIDEBAR_PART } as IWorkbenchLayoutService;

			await focusNavigableView(views, descriptors, layout, { direction: 'next', scope: 'container' });

			assert.strictEqual(document.activeElement, pane.draggableElement);
			assert.strictEqual(pane.isExpanded(), false, 'snapshot focus must preserve the collapsed state');
			assert.strictEqual(openedViews, 0, 'stale descriptor mapping must not call openView');
		} finally {
			host.remove();
		}
	});

	test('skips a collapsed pane with a hidden header in the rendered workbench', async () => {
		const pane = disposables.add(new NavigationTestPane());
		const host = document.createElement('div');
		document.body.appendChild(host);
		host.appendChild(pane.element);

		try {
			pane.headerVisible = false;
			const header = pane.draggableElement;
			assert.ok(header);
			assert.strictEqual(header.classList.contains('hidden'), true);

			const container = { id: 'explorer' } as ViewContainer;
			const opened: string[] = [];
			const views = {
				getFocusedView: () => ({ id: 'a' }) as IViewDescriptor,
				getVisibleViewContainer: (location: ViewContainerLocation) =>
					location === ViewContainerLocation.Sidebar ? container : null,
				getActiveViewWithId: (id: string) => id === 'b' ? pane : null,
				openView: async (id: string) => { opened.push(id); return null; }
			} as unknown as IViewsService;
			const descriptors = {
				getViewContainerByViewId: (id: string) => ['a', 'b', 'c'].includes(id) ? container : null,
				getViewContainerModel: () => ({
					visibleViewDescriptors: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
					isCollapsed: (id: string) => id === 'b'
				}) as unknown as IViewContainerModel
			} as unknown as IViewDescriptorService;
			const layout = { isVisible: (part: Parts) => part === Parts.SIDEBAR_PART } as IWorkbenchLayoutService;

			await focusNavigableView(views, descriptors, layout, { direction: 'next', scope: 'container' });

			assert.deepStrictEqual(opened, ['c']);
			assert.notStrictEqual(document.activeElement, header);
			assert.strictEqual(pane.isExpanded(), false);
			assert.strictEqual(pane.headerVisible, false);
		} finally {
			host.remove();
		}
	});


	test('only connected and tabbable collapsed headers can be navigation targets', async () => {
		const pane = disposables.add(new NavigationTestPane());
		const host = document.createElement('div');
		host.appendChild(pane.element);
		const header = pane.draggableElement;
		assert.ok(header);
		const container = { id: 'explorer' } as ViewContainer;
		const opened: string[] = [];
		const views = {
			getFocusedView: () => ({ id: 'a' }) as IViewDescriptor,
			getVisibleViewContainer: (location: ViewContainerLocation) =>
				location === ViewContainerLocation.Sidebar ? container : null,
			getActiveViewWithId: (id: string) => id === 'b' ? pane : null,
			openView: async (id: string) => { opened.push(id); return null; }
		} as unknown as IViewsService;
		const descriptors = {
			getViewContainerByViewId: (id: string) => ['a', 'b', 'c'].includes(id) ? container : null,
			getViewContainerModel: () => ({
				visibleViewDescriptors: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
				isCollapsed: (id: string) => id === 'b'
			}) as unknown as IViewContainerModel
		} as unknown as IViewDescriptorService;
		const layout = { isVisible: (part: Parts) => part === Parts.SIDEBAR_PART } as IWorkbenchLayoutService;
		const navigate = () => focusNavigableView(views, descriptors, layout, { direction: 'next', scope: 'container' });

		try {
			assert.strictEqual(header.isConnected, false);
			await navigate();
			assert.deepStrictEqual(opened, ['c'], 'detached header must be skipped');

			document.body.appendChild(host);
			pane.collapsible = false;
			assert.strictEqual(header.tabIndex, -1);
			await navigate();
			assert.deepStrictEqual(opened, ['c', 'c'], 'non-tabbable header must be skipped');

			pane.collapsible = true;
			assert.strictEqual(header.tabIndex, 0);
			await navigate();
			assert.deepStrictEqual(opened, ['c', 'c'], 'focus must not call openView on a collapsed pane');
			assert.strictEqual(document.activeElement, header);
			assert.strictEqual(pane.isExpanded(), false);
		} finally {
			host.remove();
		}
	});

	test('a rendered header is keyboard-focusable and retains its collapsed state', () => {
		const pane = disposables.add(new NavigationTestPane());
		const host = document.createElement('div');
		document.body.appendChild(host);
		host.appendChild(pane.element);

		try {
			const header = pane.draggableElement;
			assert.ok(header);
			assert.strictEqual(header.getAttribute('tabindex'), '0');
			assert.strictEqual(header.getAttribute('aria-expanded'), 'false');

			header.focus();
			assert.strictEqual(document.activeElement, header);
			assert.strictEqual(pane.isExpanded(), false);
			assert.strictEqual(header.getAttribute('aria-expanded'), 'false');
		} finally {
			host.remove();
		}
	});
});
