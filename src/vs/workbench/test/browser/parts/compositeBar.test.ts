/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, Dimension } from '../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../base/browser/contextmenu.js';
import { ActionsOrientation } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { HoverPosition } from '../../../../base/browser/ui/hover/hoverWidget.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ActivitybarPart } from '../../../browser/parts/activitybar/activitybarPart.js';
import { CompositeBar, ICompositeBarOptions } from '../../../browser/parts/compositeBar.js';
import { CompositeBarAction } from '../../../browser/parts/compositeBarActions.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { workbenchInstantiationService } from '../workbenchTestServices.js';
import '../../../../base/browser/ui/codicons/codiconStyles.js';
import '../../../browser/media/floatingPanels.css';
import '../../../browser/parts/activitybar/media/activityaction.css';
import '../../../browser/parts/activitybar/media/activitybarpart.css';
import '../../../browser/parts/media/paneCompositePart.css';

interface ICompositeBarInternals {
	readonly compositeOverflowAction: { readonly value: IAction | undefined };
}

class TestViewDescriptorService extends mock<IViewDescriptorService>() {
	override getViewContainerBadgeEnablementState(): boolean {
		return true;
	}
}

interface IRendered {
	readonly visible: string[];
	readonly overflowControl: boolean;
	readonly overflow: string[];
}

/**
 * These tests cover the generic composite bar with equal-size composites and overflow
 * control, which is how every Activity Bar layout is configured. The Activity Bar's own
 * wiring of those sizes is covered by `activitybarPart.test.ts`.
 *
 * Strides: 48 classic, 28 compact, 44 floating (36 + 8 gap), 40 floating compact (36 + 4 gap).
 */
suite('CompositeBar overflow', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const strides = [48, 28, 44, 40];

	let workbench: HTMLElement;

	setup(() => {
		workbench = append(mainWindow.document.body, $('.monaco-workbench'));
	});

	teardown(() => {
		workbench.remove();
	});

	function createBar(options: { count: number; compositeSize: number; overflowActionSize: number; pinned?: (index: number) => boolean; parent?: HTMLElement }) {
		const menus: IContextMenuDelegate[] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IContextMenuService, { showContextMenu: (delegate: IContextMenuDelegate) => { menus.push(delegate); } });
		instantiationService.stub(IViewDescriptorService, new TestViewDescriptorService());

		const ids = Array.from({ length: options.count }, (_, index) => `view${index}`);
		const activityActions = new Map<string, CompositeBarAction>();
		const barOptions: ICompositeBarOptions = {
			icon: true,
			orientation: ActionsOrientation.VERTICAL,
			colors: () => ({}),
			compositeSize: options.compositeSize,
			overflowActionSize: options.overflowActionSize,
			dndHandler: { drop() { }, onDragOver: () => true, onDragEnter: () => true },
			activityHoverOptions: { position: () => HoverPosition.RIGHT },
			getActivityAction: id => {
				let action = activityActions.get(id);
				if (!action) {
					action = store.add(new CompositeBarAction({ id, name: `View ${id.substring(4)}` }));
					activityActions.set(id, action);
				}
				return action;
			},
			getCompositePinnedAction: id => toAction({ id, label: '', run: () => { } }),
			getCompositeBadgeAction: id => toAction({ id, label: '', run: () => { } }),
			getOnCompositeClickAction: id => toAction({ id, label: '', run: async () => { bar.activateComposite(id); await bar.pin(id); } }),
			fillExtraContextMenuActions: () => { },
			getContextMenuActionsForComposite: () => [],
			openComposite: async () => null,
			getDefaultCompositeId: () => undefined,
		};

		const bar: CompositeBar = store.add(instantiationService.createInstance(CompositeBar, ids.map((id, index) => ({ id, name: `View ${index}`, pinned: options.pinned?.(index) ?? true, visible: true, order: index })), barOptions));
		const parent = options.parent ?? append(append(workbench, $('.activitybar.left')), $('.content'));
		bar.create(parent);
		return { bar, ids, menus, parent };
	}

	/** Reads what the user sees: visible views from the DOM, hidden views from the overflow menu. */
	async function rendered(bar: CompositeBar, parent: HTMLElement, menus: IContextMenuDelegate[]): Promise<IRendered> {
		const visible: string[] = [];
		let overflowControl = false;
		for (const label of parent.querySelectorAll('.action-item .action-label')) {
			const ariaLabel = label.getAttribute('aria-label') ?? '';
			if (ariaLabel.startsWith('Additional Views')) {
				overflowControl = true;
				continue;
			}
			const match = /^View (?<n>\d+)/.exec(ariaLabel);
			if (match?.groups) {
				visible.push(`view${match.groups.n}`);
			}
		}

		let overflow: string[] = [];
		if (overflowControl) {
			const overflowAction = (bar as unknown as ICompositeBarInternals).compositeOverflowAction.value;
			assert.ok(overflowAction);
			await overflowAction.run();
			overflow = menus[menus.length - 1].getActions().map(action => action.id);
		}

		return { visible, overflowControl, overflow };
	}

	async function layout(bar: CompositeBar, parent: HTMLElement, menus: IContextMenuDelegate[], height: number): Promise<IRendered> {
		bar.layout(new Dimension(48, height));
		return rendered(bar, parent, menus);
	}

	function expected(visible: string[], overflow: string[]): IRendered {
		return { visible, overflowControl: overflow.length > 0, overflow };
	}

	test('four views fit exactly and overflow at least two when shrunk by one pixel', async () => {
		for (const stride of strides) {
			const { bar, menus, parent } = createBar({ count: 4, compositeSize: stride, overflowActionSize: stride });

			assert.deepStrictEqual({ stride, ...await layout(bar, parent, menus, stride * 4) }, { stride, ...expected(['view0', 'view1', 'view2', 'view3'], []) });
			assert.deepStrictEqual({ stride, ...await layout(bar, parent, menus, stride * 4 - 1) }, { stride, ...expected(['view0', 'view1'], ['view2', 'view3']) });
			assert.deepStrictEqual({ stride, ...await layout(bar, parent, menus, stride * 4) }, { stride, ...expected(['view0', 'view1', 'view2', 'view3'], []) });
		}
	});

	test('five views in a four-item height overflow two views', async () => {
		for (const stride of strides) {
			const { bar, menus, parent } = createBar({ count: 5, compositeSize: stride, overflowActionSize: stride });

			assert.deepStrictEqual({ stride, ...await layout(bar, parent, menus, stride * 4) }, { stride, ...expected(['view0', 'view1', 'view2'], ['view3', 'view4']) });
		}
	});

	test('never overflows a single view across heights', async () => {
		for (const stride of strides) {
			const { bar, ids, menus, parent } = createBar({ count: 10, compositeSize: stride, overflowActionSize: stride });

			for (let height = stride; height <= stride * 12; height++) {
				const result = await layout(bar, parent, menus, height);
				assert.notStrictEqual(result.overflow.length, 1, `stride ${stride}, height ${height}`);
				assert.strictEqual(result.overflowControl, result.overflow.length > 0, `stride ${stride}, height ${height}`);
				assert.deepStrictEqual([...result.visible, ...result.overflow].sort(), [...ids].sort(), `stride ${stride}, height ${height}`);
			}
		}
	});

	test('keeps the active view visible and overflows at least two others', async () => {
		for (const stride of strides) {
			const pinned = createBar({ count: 6, compositeSize: stride, overflowActionSize: stride });
			pinned.bar.activateComposite('view5');
			assert.deepStrictEqual({ stride, ...await layout(pinned.bar, pinned.parent, pinned.menus, stride * 4) }, { stride, ...expected(['view0', 'view1', 'view5'], ['view2', 'view3', 'view4']) });

			const unpinned = createBar({ count: 6, compositeSize: stride, overflowActionSize: stride, pinned: index => index !== 5 });
			unpinned.bar.layout(new Dimension(48, stride * 4));
			unpinned.bar.activateComposite('view5');
			assert.deepStrictEqual({ stride, ...await rendered(unpinned.bar, unpinned.parent, unpinned.menus) }, { stride, ...expected(['view0', 'view1', 'view5'], ['view2', 'view3', 'view4']) });
		}
	});

	test('a smaller overflow control than the views can overflow a single view', async () => {
		// Guards that the checks above can fail: the historical layout (#187737) used 52px views with a 48px overflow control.
		const { bar, menus, parent } = createBar({ count: 5, compositeSize: 52, overflowActionSize: 48 });

		assert.deepStrictEqual(await layout(bar, parent, menus, 52 * 4 + 48), expected(['view0', 'view1', 'view2', 'view3'], ['view4']));
	});

	test('the overflow menu lists the hidden views and selecting one shows it', async () => {
		const { bar, menus, parent } = createBar({ count: 5, compositeSize: 48, overflowActionSize: 48 });
		assert.deepStrictEqual(await layout(bar, parent, menus, 192), expected(['view0', 'view1', 'view2'], ['view3', 'view4']));

		const overflowAction = (bar as unknown as ICompositeBarInternals).compositeOverflowAction.value;
		assert.ok(overflowAction);
		const menu = menus[menus.length - 1];
		const actions = menu.getActions();
		assert.deepStrictEqual({
			overflowAction: { id: overflowAction.id, label: overflowAction.label },
			checkedRepresentation: menu.getCheckedActionsRepresentation?.(actions[0]),
			menu: actions.map(action => ({ id: action.id, label: action.label, checked: !!action.checked })),
		}, {
			overflowAction: { id: 'additionalComposites.action', label: 'Additional Views' },
			checkedRepresentation: 'radio',
			menu: [
				{ id: 'view3', label: 'View 3', checked: false },
				{ id: 'view4', label: 'View 4', checked: false },
			],
		});

		await actions[1].run();
		assert.deepStrictEqual(await rendered(bar, parent, menus), expected(['view0', 'view1', 'view4'], ['view2', 'view3']));
	});

	test('rendered items match the configured stride and stay within the height', async () => {
		const layouts = [
			{ name: 'classic', stride: 48 },
			{ name: 'compact', stride: 28 },
			{ name: 'floating', stride: ActivitybarPart.FLOATING_ACTION_HEIGHT + ActivitybarPart.FLOATING_ACTION_GAP, floating: { compact: false, gap: ActivitybarPart.FLOATING_ACTION_GAP } },
			{ name: 'floating compact', stride: ActivitybarPart.FLOATING_ACTION_HEIGHT + ActivitybarPart.FLOATING_COMPACT_ACTION_GAP, floating: { compact: true, gap: ActivitybarPart.FLOATING_COMPACT_ACTION_GAP } },
		];

		for (const { name, stride, floating } of layouts) {
			const height = stride * 4;
			let root: HTMLElement | undefined;
			let part: HTMLElement;
			if (floating) {
				const width = floating.compact ? ActivitybarPart.FLOATING_COMPACT_ACTIVITYBAR_WIDTH : ActivitybarPart.FLOATING_ACTIVITYBAR_WIDTH;
				root = append(mainWindow.document.body, $('.monaco-workbench.modern-ui.floating-panels'));
				root.classList.toggle('modern-ui-compact', floating.compact);
				root.style.position = 'relative';
				root.style.width = '200px';
				root.style.height = '600px';
				part = append(root, $('.part.activitybar.left'));
				part.style.setProperty('--activity-bar-width', `${width}px`);
				part.style.setProperty('--activity-bar-action-height', `${ActivitybarPart.FLOATING_ACTION_HEIGHT}px`);
				part.style.setProperty('--activity-bar-action-gap', `${floating.gap}px`);
			} else {
				part = append(workbench, $('.activitybar.left'));
				part.style.setProperty('--activity-bar-action-height', `${stride}px`);
				part.style.width = '48px';
			}

			try {
				const content = append(part, $('.content'));
				content.style.height = `${height}px`;
				const { bar, menus, parent } = createBar({ count: 6, compositeSize: stride, overflowActionSize: stride, parent: content });
				const result = await layout(bar, parent, menus, height);
				assert.deepStrictEqual({ name, ...result }, { name, ...expected(['view0', 'view1', 'view2'], ['view3', 'view4', 'view5']) });

				const items = [...parent.querySelectorAll<HTMLElement>('.composite-bar .actions-container > .action-item')].map(item => item.getBoundingClientRect());
				const top = items[0].top;
				const itemHeight = floating ? ActivitybarPart.FLOATING_ACTION_HEIGHT : stride;
				assert.deepStrictEqual({
					name,
					items: items.length,
					steps: items.slice(1).map((item, index) => Math.round(item.top - items[index].top)),
					heights: items.map(item => Math.round(item.height)),
					contained: items[items.length - 1].bottom <= top + height + 0.5,
				}, {
					name,
					items: 4,
					steps: [stride, stride, stride],
					heights: [itemHeight, itemHeight, itemHeight, itemHeight],
					contained: true,
				});
			} finally {
				root?.remove();
			}
		}
	});
});
