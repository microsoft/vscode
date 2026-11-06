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
