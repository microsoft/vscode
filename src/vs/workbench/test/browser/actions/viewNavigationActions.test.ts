/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { focusNavigableView } from '../../../browser/actions/viewNavigationActions.js';
import { IViewNavigationRequest } from '../../../browser/actions/viewNavigationModel.js';

interface IFocusCall {
	readonly id: string;
	readonly focus: boolean;
}

interface IFocusTestHarness {
	readonly views: IViewsService;
	readonly descriptors: IViewDescriptorService;
	readonly layout: IWorkbenchLayoutService;
	readonly calls: IFocusCall[];
	readonly headerFocusCalls: string[];
	isCollapsed(id: string): boolean;
	setFocused(id: string | undefined): void;
	setVisible(location: ViewContainerLocation, visible: boolean): void;
	setPartVisible(location: ViewContainerLocation, visible: boolean): void;
	setViews(containerId: string, views: readonly string[]): void;
	setCollapsed(viewId: string, collapsed: boolean): void;
	setHeaderAvailable(viewId: string, available: boolean): void;
	setHeaderVisible(viewId: string, visible: boolean): void;
	setHeaderConnected(viewId: string, connected: boolean): void;
	setHeaderTabbable(viewId: string, tabbable: boolean): void;
	setHidden(viewId: string, hidden: boolean): void;
}

function createFocusHarness(): IFocusTestHarness {
	const containers = [
		{ id: 'explorer', location: ViewContainerLocation.Sidebar },
		{ id: 'auxiliary', location: ViewContainerLocation.AuxiliaryBar },
		{ id: 'problems', location: ViewContainerLocation.Panel }
	];

	const visibleContainers = new Set<string>(containers.map(container => container.id));
	const visibleParts = new Set<Parts>([Parts.SIDEBAR_PART, Parts.AUXILIARYBAR_PART, Parts.PANEL_PART]);
	const partForLocation = (location: ViewContainerLocation) => {
		switch (location) {
			case ViewContainerLocation.Sidebar: return Parts.SIDEBAR_PART;
			case ViewContainerLocation.AuxiliaryBar: return Parts.AUXILIARYBAR_PART;
			case ViewContainerLocation.Panel: return Parts.PANEL_PART;
		}
	};
	const viewsByContainer = new Map<string, readonly string[]>([
		['explorer', ['a', 'b', 'c']],
		['auxiliary', ['d', 'e']],
		['problems', ['f', 'g']]
	]);
	const collapsed = new Set<string>();
	const unavailableHeaders = new Set<string>();
	const hiddenHeaders = new Set<string>();
	const detachedHeaders = new Set<string>();
	const untabbableHeaders = new Set<string>();
	const hidden = new Set<string>();
	const calls: IFocusCall[] = [];
	const headerFocusCalls: string[] = [];
	let focusedId: string | undefined = 'a';

	const getContainerForView = (viewId: string) =>
		containers.find(container => (viewsByContainer.get(container.id) ?? []).includes(viewId));

	const views = {
		getFocusedView: () => focusedId ? ({ id: focusedId } as IViewDescriptor) : null,
		getVisibleViewContainer: (location: ViewContainerLocation) => {
			const container = containers.find(candidate => candidate.location === location);
			return container && visibleContainers.has(container.id) ? container as ViewContainer : null;
		},
		getActiveViewWithId: (id: string) => unavailableHeaders.has(id) ? null : ({
			headerVisible: !hiddenHeaders.has(id),
			draggableElement: {
				get isConnected() { return !detachedHeaders.has(id); },
				get tabIndex() { return untabbableHeaders.has(id) ? -1 : 0; },
				focus: () => {
					headerFocusCalls.push(id);
					focusedId = id;
				}
			}
		}),
		openView: async (id: string, focus: boolean) => {
			calls.push({ id, focus });
			focusedId = id;
			return null;
		}
	} as unknown as IViewsService;

	const descriptors = {
		getViewContainerByViewId: (id: string) => (getContainerForView(id) as ViewContainer | undefined) ?? null,
		getViewContainerModel: (container: ViewContainer) => ({
			visibleViewDescriptors: (viewsByContainer.get(container.id) ?? [])
				.filter(id => !hidden.has(id))
				.map(id => ({ id } as IViewDescriptor)),
			isCollapsed: (id: string) => collapsed.has(id)
		}) as unknown as IViewContainerModel
	} as unknown as IViewDescriptorService;

	return {
		views,
		descriptors,
		layout: { isVisible: (part: Parts) => visibleParts.has(part) } as IWorkbenchLayoutService,
		calls,
		headerFocusCalls,
		isCollapsed(id) { return collapsed.has(id); },
		setFocused(id) { focusedId = id; },
		setVisible(location, visible) {
			const container = containers.find(candidate => candidate.location === location);
			if (!container) {
				return;
			}
			if (visible) {
				visibleContainers.add(container.id);
			} else {
				visibleContainers.delete(container.id);
			}
		},
		setPartVisible(location, visible) {
			const part = partForLocation(location);
			if (!part) {
				return;
			}
			if (visible) { visibleParts.add(part); } else { visibleParts.delete(part); }
		},
		setViews(containerId, values) { viewsByContainer.set(containerId, values); },
		setCollapsed(viewId, isCollapsed) {
			if (isCollapsed) { collapsed.add(viewId); } else { collapsed.delete(viewId); }
		},
		setHeaderAvailable(viewId, available) {
			if (available) { unavailableHeaders.delete(viewId); } else { unavailableHeaders.add(viewId); }
		},
		setHeaderVisible(viewId, visible) {
			if (visible) { hiddenHeaders.delete(viewId); } else { hiddenHeaders.add(viewId); }
		},
		setHeaderConnected(viewId, connected) {
			if (connected) { detachedHeaders.delete(viewId); } else { detachedHeaders.add(viewId); }
		},
		setHeaderTabbable(viewId, tabbable) {
			if (tabbable) { untabbableHeaders.delete(viewId); } else { untabbableHeaders.add(viewId); }
		},
		setHidden(viewId, isHidden) {
			if (isHidden) { hidden.add(viewId); } else { hidden.delete(viewId); }
		}
	};
}

async function navigate(harness: IFocusTestHarness, request: IViewNavigationRequest): Promise<IFocusCall | undefined> {
	const count = harness.calls.length;
	await focusNavigableView(harness.views, harness.descriptors, harness.layout, request);
	return harness.calls[count];
}

suite('Workbench view navigation: command integration', () => {

	test('focuses a collapsed pane header without expanding its body', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		const result = await navigate(harness, { direction: 'next', scope: 'container' });
		assert.strictEqual(result, undefined);
		assert.deepStrictEqual(harness.headerFocusCalls, ['b']);
		assert.deepStrictEqual(harness.calls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});


	test('a collapsed target still focuses its header when its descriptor lookup disappears', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		const descriptors = {
			getViewContainerByViewId: (id: string) =>
				id === 'b' ? null : harness.descriptors.getViewContainerByViewId(id),
			getViewContainerModel: (container: ViewContainer) => harness.descriptors.getViewContainerModel(container)
		} as unknown as IViewDescriptorService;

		await focusNavigableView(harness.views, descriptors, harness.layout, {
			direction: 'next', scope: 'container'
		});
		assert.deepStrictEqual(harness.headerFocusCalls, ['b']);
		assert.deepStrictEqual(harness.calls, [], 'a stale descriptor must not cause openView to expand b');
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('a collapsed target retains snapshot state when a stale descriptor reports it expanded', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		const moved = { id: 'moving' } as ViewContainer;
		const descriptors = {
			getViewContainerByViewId: (id: string) =>
				id === 'b' ? moved : harness.descriptors.getViewContainerByViewId(id),
			getViewContainerModel: (container: ViewContainer) => container === moved
				? { isCollapsed: () => false } as unknown as IViewContainerModel
				: harness.descriptors.getViewContainerModel(container)
		} as unknown as IViewDescriptorService;

		await focusNavigableView(harness.views, descriptors, harness.layout, {
			direction: 'next', scope: 'container'
		});
		assert.deepStrictEqual(harness.headerFocusCalls, ['b']);
		assert.deepStrictEqual(harness.calls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('an expanded target uses openView despite a stale descriptor reporting it collapsed', async () => {
		const harness = createFocusHarness();
		const moved = { id: 'moving' } as ViewContainer;
		const descriptors = {
			getViewContainerByViewId: (id: string) =>
				id === 'b' ? moved : harness.descriptors.getViewContainerByViewId(id),
			getViewContainerModel: (container: ViewContainer) => container === moved
				? { isCollapsed: () => true } as unknown as IViewContainerModel
				: harness.descriptors.getViewContainerModel(container)
		} as unknown as IViewDescriptorService;

		await focusNavigableView(harness.views, descriptors, harness.layout, {
			direction: 'next', scope: 'container'
		});
		assert.deepStrictEqual(harness.calls, [{ id: 'b', focus: true }]);
		assert.deepStrictEqual(harness.headerFocusCalls, []);
	});

	test('skips a collapsed pane when rendering produced no header', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setHeaderAvailable('b', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});



	test('skips a collapsed header detached from the document', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setHeaderConnected('b', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('skips a collapsed header that is not keyboard-focusable', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setHeaderTabbable('b', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('restoring a detached header makes it a navigation target again', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setHeaderConnected('b', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });
		harness.setFocused('a');
		harness.setHeaderConnected('b', true);
		assert.strictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), undefined);
		assert.deepStrictEqual(harness.headerFocusCalls, ['b']);
	});

	test('workbench traversal skips a detached header in another part', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		harness.setCollapsed('d', true);
		harness.setHeaderConnected('d', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'workbench' }), { id: 'e', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
	});

	test('skips a collapsed pane whose header exists but is not visible', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setHeaderVisible('b', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('skips hidden collapsed headers rather than expanding them across workbench locations', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		harness.setCollapsed('d', true);
		harness.setHeaderVisible('d', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'workbench' }), { id: 'e', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.strictEqual(harness.isCollapsed('d'), true);
	});

	test('a collapsed header becomes a focus target once it is visible again', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setHeaderVisible('b', false);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });

		harness.setFocused('a');
		harness.setHeaderVisible('b', true);
		assert.strictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), undefined);
		assert.deepStrictEqual(harness.headerFocusCalls, ['b']);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('does nothing when all visible panes are collapsed and have no headers', async () => {
		const harness = createFocusHarness();
		for (const id of ['a', 'b', 'c']) {
			harness.setCollapsed(id, true);
			harness.setHeaderAvailable(id, false);
		}
		harness.setVisible(ViewContainerLocation.AuxiliaryBar, false);
		harness.setVisible(ViewContainerLocation.Panel, false);
		await navigate(harness, { direction: 'next', scope: 'container' });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.deepStrictEqual(harness.calls, []);
	});

	test('can focus a collapsed pane header in a different workbench location', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		harness.setCollapsed('d', true);
		await navigate(harness, { direction: 'next', scope: 'workbench' });
		assert.deepStrictEqual(harness.headerFocusCalls, ['d']);
		assert.deepStrictEqual(harness.calls, []);
		assert.strictEqual(harness.isCollapsed('d'), true);
	});

	test('normal navigation from a collapsed header does not expand its pane', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		await navigate(harness, { direction: 'next', scope: 'container' });
		assert.strictEqual(harness.isCollapsed('b'), true);
		assert.deepStrictEqual(await navigate(harness, { direction: 'next', scope: 'container' }), { id: 'c', focus: true });
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('expanded-only navigation from a collapsed header uses original ordering', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		harness.setFocused('b');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container', includeCollapsed: false, wrap: false
		}), { id: 'c', focus: true });
		harness.setFocused('b');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'previous', scope: 'container', includeCollapsed: false, wrap: false
		}), { id: 'a', focus: true });
	});

	test('an all-collapsed container does not leak focus into the next container', async () => {
		const harness = createFocusHarness();
		for (const id of ['a', 'b', 'c']) {
			harness.setCollapsed(id, true);
		}
		harness.setFocused('b');
		assert.strictEqual(await navigate(harness, {
			direction: 'next', scope: 'container', includeCollapsed: false
		}), undefined);
		assert.deepStrictEqual(harness.calls, []);
		assert.deepStrictEqual(harness.headerFocusCalls, []);
	});


	test('a next-view command calls openView with focus=true', async () => {
		const harness = createFocusHarness();
		const result = await navigate(harness, { direction: 'next', scope: 'container' });
		assert.deepStrictEqual(result, { id: 'b', focus: true });
	});

	test('a previous-view command moves focus in the opposite direction', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'previous', scope: 'container'
		}), { id: 'b', focus: true });
	});

	test('first and last commands focus the respective boundaries', async () => {
		const harness = createFocusHarness();
		harness.setFocused('b');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'last', scope: 'container'
		}), { id: 'c', focus: true });
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'first', scope: 'container'
		}), { id: 'a', focus: true });
	});

	test('navigation crosses sidebar to auxiliary bar when requested', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'd', focus: true });
	});

	test('navigation crosses auxiliary bar to panel when requested', async () => {
		const harness = createFocusHarness();
		harness.setFocused('e');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'f', focus: true });
	});

	test('navigation wraps to the sidebar across all visible containers', async () => {
		const harness = createFocusHarness();
		harness.setFocused('g');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'a', focus: true });
	});

	test('navigation in a container never moves focus to a different container', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'a', focus: true });
	});

	test('the target follows a user-driven view reordering', async () => {
		const harness = createFocusHarness();
		harness.setViews('explorer', ['c', 'b', 'a']);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'b', focus: true });
	});

	test('the target follows a view moved to a different container', async () => {
		const harness = createFocusHarness();
		harness.setViews('explorer', ['a', 'c']);
		harness.setViews('problems', ['f', 'b', 'g']);
		harness.setFocused('b');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'previous', scope: 'container'
		}), { id: 'f', focus: true });
	});

	test('a hidden pane is skipped without side effects', async () => {
		const harness = createFocusHarness();
		harness.setHidden('b', true);
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'c', focus: true });
	});

	test('collapsed views remain a valid focus destination', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		assert.strictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), undefined);
		assert.deepStrictEqual(harness.headerFocusCalls, ['b']);
		assert.deepStrictEqual(harness.calls, []);
		assert.strictEqual(harness.isCollapsed('b'), true);
	});

	test('expanded-only commands skip collapsed views', async () => {
		const harness = createFocusHarness();
		harness.setCollapsed('b', true);
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container', includeCollapsed: false
		}), { id: 'c', focus: true });
	});

	test('a panel with no visible views is skipped', async () => {
		const harness = createFocusHarness();
		harness.setViews('auxiliary', []);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'f', focus: true });
	});


	test('hidden sidebar part is not navigated even if its view container stays active', async () => {
		const harness = createFocusHarness();
		harness.setPartVisible(ViewContainerLocation.Sidebar, false);
		harness.setFocused(undefined);
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'd', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
	});

	test('hidden auxiliary bar part is skipped during workbench traversal', async () => {
		const harness = createFocusHarness();
		harness.setPartVisible(ViewContainerLocation.AuxiliaryBar, false);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'f', focus: true });
	});

	test('hidden panel part is excluded from wraparound navigation', async () => {
		const harness = createFocusHarness();
		harness.setPartVisible(ViewContainerLocation.Panel, false);
		harness.setFocused('e');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'a', focus: true });
	});


	test('container-scoped navigation leaves a hidden focused view for the next visible part', async () => {
		const harness = createFocusHarness();
		harness.setPartVisible(ViewContainerLocation.Sidebar, false);
		harness.setFocused('b');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'd', focus: true });
	});

	test('navigation immediately observes a workbench part becoming visible again', async () => {
		const harness = createFocusHarness();
		harness.setPartVisible(ViewContainerLocation.AuxiliaryBar, false);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'f', focus: true });

		harness.setPartVisible(ViewContainerLocation.AuxiliaryBar, true);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'd', focus: true });
	});

	test('all hidden layout parts leave navigation focus unchanged', async () => {
		const harness = createFocusHarness();
		for (const location of [
			ViewContainerLocation.Sidebar,
			ViewContainerLocation.AuxiliaryBar,
			ViewContainerLocation.Panel
		]) {
			harness.setPartVisible(location, false);
		}
		await navigate(harness, { direction: 'next', scope: 'workbench' });
		assert.deepStrictEqual(harness.calls, []);
		assert.deepStrictEqual(harness.headerFocusCalls, []);
	});

	test('collapsed headers inside a hidden auxiliary bar are not focus targets', async () => {
		const harness = createFocusHarness();
		harness.setPartVisible(ViewContainerLocation.AuxiliaryBar, false);
		harness.setCollapsed('d', true);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'f', focus: true });
		assert.deepStrictEqual(harness.headerFocusCalls, []);
		assert.strictEqual(harness.isCollapsed('d'), true);
	});

	test('a hidden container does not appear in the navigation sequence', async () => {
		const harness = createFocusHarness();
		harness.setVisible(ViewContainerLocation.AuxiliaryBar, false);
		harness.setFocused('c');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), { id: 'f', focus: true });
	});

	test('the editor fallback focuses the first visible sidebar view', async () => {
		const harness = createFocusHarness();
		harness.setFocused(undefined);
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'a', focus: true });
	});

	test('the editor fallback uses another visible location without a sidebar', async () => {
		const harness = createFocusHarness();
		harness.setVisible(ViewContainerLocation.Sidebar, false);
		harness.setFocused(undefined);
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'd', focus: true });
	});

	test('an unavailable focused view falls back safely', async () => {
		const harness = createFocusHarness();
		harness.setFocused('removed-view');
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'a', focus: true });
	});

	test('no visible containers means no openView call', async () => {
		const harness = createFocusHarness();
		harness.setVisible(ViewContainerLocation.Sidebar, false);
		harness.setVisible(ViewContainerLocation.AuxiliaryBar, false);
		harness.setVisible(ViewContainerLocation.Panel, false);
		assert.strictEqual(await navigate(harness, {
			direction: 'next', scope: 'workbench'
		}), undefined);
		assert.deepStrictEqual(harness.calls, []);
	});

	test('no wrapping leaves the current focus untouched at the boundary', async () => {
		const harness = createFocusHarness();
		harness.setFocused('c');
		assert.strictEqual(await navigate(harness, {
			direction: 'next', scope: 'container', wrap: false
		}), undefined);
		assert.deepStrictEqual(harness.calls, []);
	});

	test('repeated navigation observes the focus updated by prior calls', async () => {
		const harness = createFocusHarness();
		for (const expected of ['b', 'c', 'a', 'b']) {
			const result = await navigate(harness, { direction: 'next', scope: 'container' });
			assert.strictEqual(result?.id, expected);
			assert.strictEqual(result?.focus, true);
		}
		assert.strictEqual(harness.calls.length, 4);
	});
});
