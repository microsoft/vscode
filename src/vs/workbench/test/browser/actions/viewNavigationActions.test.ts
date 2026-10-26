/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IViewContainerModel, IViewDescriptor, IViewDescriptorService, ViewContainer, ViewContainerLocation } from '../../../common/views.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { focusNavigableView } from '../../../browser/actions/viewNavigationActions.js';
import { IViewNavigationRequest } from '../../../browser/actions/viewNavigationModel.js';

interface IFocusCall {
	readonly id: string;
	readonly focus: boolean;
}

interface IFocusTestHarness {
	readonly views: IViewsService;
	readonly descriptors: IViewDescriptorService;
	readonly calls: IFocusCall[];
	setFocused(id: string | undefined): void;
	setVisible(location: ViewContainerLocation, visible: boolean): void;
	setViews(containerId: string, views: readonly string[]): void;
	setCollapsed(viewId: string, collapsed: boolean): void;
	setHidden(viewId: string, hidden: boolean): void;
}

function createFocusHarness(): IFocusTestHarness {
	const containers = [
		{ id: 'explorer', location: ViewContainerLocation.Sidebar },
		{ id: 'auxiliary', location: ViewContainerLocation.AuxiliaryBar },
		{ id: 'problems', location: ViewContainerLocation.Panel }
	];

	const visibleContainers = new Set<string>(containers.map(container => container.id));
	const viewsByContainer = new Map<string, readonly string[]>([
		['explorer', ['a', 'b', 'c']],
		['auxiliary', ['d', 'e']],
		['problems', ['f', 'g']]
	]);
	const collapsed = new Set<string>();
	const hidden = new Set<string>();
	const calls: IFocusCall[] = [];
	let focusedId: string | undefined = 'a';

	const getContainer = (id: string) => containers.find(container => container.id === id);
	const getContainerForView = (viewId: string) =>
		containers.find(container => (viewsByContainer.get(container.id) ?? []).includes(viewId));

	const views = {
		getFocusedView: () => focusedId ? ({ id: focusedId } as IViewDescriptor) : null,
		getVisibleViewContainer: (location: ViewContainerLocation) => {
			const container = containers.find(candidate => candidate.location === location);
			return container && visibleContainers.has(container.id) ? container as ViewContainer : null;
		},
		openView: async (id: string, focus: boolean) => {
			calls.push({ id, focus });
			focusedId = id;
			return null;
		}
	} as unknown as IViewsService;

	const descriptors = {
		getViewContainerByViewId: (id: string) => getContainerForView(id) as ViewContainer | undefined ?? null,
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
		calls,
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
		setViews(containerId, values) { viewsByContainer.set(containerId, values); },
		setCollapsed(viewId, isCollapsed) {
			if (isCollapsed) { collapsed.add(viewId); } else { collapsed.delete(viewId); }
		},
		setHidden(viewId, isHidden) {
			if (isHidden) { hidden.add(viewId); } else { hidden.delete(viewId); }
		}
	};
}

async function navigate(harness: IFocusTestHarness, request: IViewNavigationRequest): Promise<IFocusCall | undefined> {
	const count = harness.calls.length;
	await focusNavigableView(harness.views, harness.descriptors, request);
	return harness.calls[count];
}

suite('Workbench view navigation: command integration', () => {
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
		assert.deepStrictEqual(await navigate(harness, {
			direction: 'next', scope: 'container'
		}), { id: 'b', focus: true });
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
