/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { unthemedInboxStyles } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { unthemedListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { raceTimeout } from '../../../../base/common/async.js';
import { unthemedCountStyles } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { unthemedKeybindingLabelOptions } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { unthemedProgressBarOptions } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { QUICK_INPUT_ITEM_HEIGHT, QUICK_INPUT_ITEM_WITH_DETAIL_HEIGHT, QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT, QUICK_INPUT_MAX_DIMENSION_RATIO, QUICK_INPUT_MAX_WIDTH, QUICK_INPUT_RESIZE_WIDTH_INCREMENT } from '../../browser/quickInputConstants.js';
import { QuickInputController } from '../../browser/quickInputController.js';
import { TestThemeService } from '../../../theme/test/common/testThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { QuickPick } from '../../browser/quickInput.js';
import { IQuickPickItem, ItemActivation, isKeyModified, NO_KEY_MODS } from '../../common/quickInput.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IContextMenuService, IContextViewService } from '../../../contextview/browser/contextView.js';
import { IListService, ListService } from '../../../list/browser/listService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../contextkey/browser/contextKeyService.js';
import { NoMatchingKb } from '../../../keybinding/common/keybindingResolver.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../storage/common/storage.js';

/**
 * Sets up an `onShow` listener that resolves after the quick pick is shown.
 */
async function setupWaitTilShownListener(controller: QuickInputController): Promise<void> {
	const result = await raceTimeout(new Promise<boolean>(resolve => {
		const event = controller.onShow(_ => {
			event.dispose();
			resolve(true);
		});
	}), 2000);

	if (!result) {
		throw new Error('Cancelled');
	}
}

suite('QuickInput', () => { // https://github.com/microsoft/vscode/issues/147543
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let controller: QuickInputController;
	let fixture: HTMLElement;
	let storageService: InMemoryStorageService;
	let layoutEmitter: Emitter<{ readonly container: HTMLElement; readonly dimension: { readonly width: number; readonly height: number } }>;
	let createController: () => QuickInputController;

	/** Dispatches a primary-button mouse event at the given coordinates. */
	function dispatchMouseEvent(target: EventTarget, type: string, x: number, y: number, detail = 1): void {
		target.dispatchEvent(new mainWindow.MouseEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			clientX: x,
			clientY: y,
			detail
		}));
	}

	/** Drags a resize sash by the given horizontal and vertical deltas. */
	function resize(sash: HTMLElement, deltaX: number, deltaY: number): void {
		dispatchMouseEvent(sash, 'mousedown', 0, 0);
		dispatchMouseEvent(mainWindow, 'mousemove', deltaX, deltaY);
		dispatchMouseEvent(mainWindow, 'mouseup', deltaX, deltaY);
	}

	/** Resizes the quick input host and emits its corresponding layout event. */
	function resizeHost(width: number, height: number): void {
		fixture.style.width = `${width}px`;
		fixture.style.height = `${height}px`;
		const dimension = { width, height };
		controller.layout(dimension, 0);
		layoutEmitter.fire({ container: fixture, dimension });
	}

	setup(() => {
		fixture = document.createElement('div');
		fixture.style.position = 'relative';
		fixture.style.width = '1000px';
		fixture.style.height = '800px';
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		const instantiationService = new TestInstantiationService();
		layoutEmitter = store.add(new Emitter());
		storageService = store.add(new InMemoryStorageService());

		// Stub the services the quick input controller needs to function
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IListService, store.add(new ListService()));
		instantiationService.stub(ILayoutService, {
			_serviceBrand: undefined,
			activeContainer: fixture,
			mainContainer: fixture,
			activeContainerDimension: { width: 1000, height: 800 },
			mainContainerDimension: { width: 1000, height: 800 },
			activeContainerOffset: { top: 0, quickPickTop: 0 },
			mainContainerOffset: { top: 0, quickPickTop: 0 },
			onDidLayoutContainer: layoutEmitter.event,
			getContainer: () => fixture,
		});
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IContextMenuService, {
			onDidShowContextMenu: Event.None
		});
		instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; },
		});

		createController = () => store.add(instantiationService.createInstance(
			QuickInputController,
			{
				container: fixture,
				idPrefix: 'testQuickInput',
				ignoreFocusOut() { return true; },
				returnFocus() { },
				backKeybindingLabel() { return undefined; },
				setContextKey() { return undefined; },
				linkOpenerDelegate(content) { },
				hoverDelegate: {
					showHover(options, focus) {
						return undefined;
					},
					delay: 200
				},
				styles: {
					button: unthemedButtonStyles,
					countBadge: unthemedCountStyles,
					inputBox: unthemedInboxStyles,
					toggle: unthemedToggleStyles,
					keybindingLabel: unthemedKeybindingLabelOptions,
					list: unthemedListStyles,
					progressBar: unthemedProgressBarOptions,
					widget: {
						quickInputBackground: undefined,
						quickInputForeground: undefined,
						quickInputTitleBackground: undefined,
						widgetBorder: undefined,
						widgetShadow: undefined,
					},
					pickerGroup: {
						pickerGroupBorder: undefined,
						pickerGroupForeground: undefined,
					}
				}
			}
		));

		// initial layout
		controller = createController();
		controller.layout({ height: 800, width: 1000 }, 0);
	});

	teardown(() => {
		sinon.restore();
	});

	test('close motion requires modern UI with motion enabled', () => {
		const clock = sinon.useFakeTimers();
		const quickpick = store.add(controller.createQuickPick());
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const states: { display: string; closing: boolean; inert: boolean; visible: boolean }[] = [];
		const recordState = () => states.push({
			display: widget.style.display,
			closing: widget.classList.contains('quick-input-widget-closing'),
			inert: widget.inert,
			visible: controller.isVisible(),
		});

		fixture.classList.add('modern-ui', 'monaco-reduce-motion');
		quickpick.show();
		quickpick.hide();
		recordState();

		fixture.classList.replace('monaco-reduce-motion', 'monaco-enable-motion');
		quickpick.show();
		quickpick.hide();
		recordState();

		quickpick.show();
		recordState();

		quickpick.hide();
		clock.tick(150);
		recordState();

		assert.deepStrictEqual(states, [
			{ display: 'none', closing: false, inert: false, visible: false },
			{ display: '', closing: true, inert: true, visible: false },
			{ display: '', closing: false, inert: false, visible: true },
			{ display: 'none', closing: false, inert: false, visible: false },
		]);
	});

	test('overlay picker aligns its input with the anchor and bypasses motion', () => {
		fixture.style.width = '600px';
		fixture.style.height = '400px';
		fixture.classList.add('modern-ui', 'monaco-enable-motion');
		controller.layout({ width: 600, height: 400 }, 0);

		const anchor = document.createElement('div');
		anchor.style.position = 'absolute';
		anchor.style.left = '80px';
		anchor.style.top = '40px';
		anchor.style.width = '300px';
		anchor.style.height = '26px';
		fixture.appendChild(anchor);

		const quickpick = store.add(controller.createQuickPick());
		quickpick.anchor = anchor;
		quickpick.anchorPosition = 'overlay';
		quickpick.show();

		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const input = fixture.querySelector<HTMLElement>('.quick-input-filter .monaco-inputbox')!;
		const anchorRect = anchor.getBoundingClientRect();
		const inputRect = input.getBoundingClientRect();
		const openState = {
			alignmentDelta: {
				left: inputRect.left - anchorRect.left,
				top: inputRect.top - anchorRect.top,
				width: inputRect.width - anchorRect.width,
				height: inputRect.height - anchorRect.height,
			},
			animationName: mainWindow.getComputedStyle(widget).animationName,
			overlay: widget.classList.contains('quick-input-widget-overlay'),
		};

		quickpick.hide();

		assert.deepStrictEqual({
			openState,
			closeState: {
				display: widget.style.display,
				closing: widget.classList.contains('quick-input-widget-closing'),
				inert: widget.inert,
			},
		}, {
			openState: {
				alignmentDelta: { left: 0, top: 0, width: 0, height: 0 },
				animationName: 'none',
				overlay: true,
			},
			closeState: {
				display: 'none',
				closing: false,
				inert: false,
			},
		});
	});

	test('quick pick can be resized from the sides, bottom, and bottom corners', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 30 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();

		assert.strictEqual(fixture.querySelectorAll('.quick-input-resize-sash').length, 3);
		assert.ok(fixture.querySelector('.quick-input-resize-west'));
		assert.ok(fixture.querySelector('.quick-input-resize-east'));
		const south = fixture.querySelector('.quick-input-resize-south')!;
		assert.strictEqual(south.querySelectorAll('.orthogonal-drag-handle').length, 2);
		assert.strictEqual(fixture.querySelector('.quick-input-resize-north'), null);
	});

	test('vertical resize accumulates deltas that are smaller than the row-height step', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;

		resize(south, 0, 10);
		resize(south, 0, 10);
		const repeatedDragHeight = JSON.parse(storageService.get(
			'workbench.quickInput.viewState',
			StorageScope.APPLICATION,
			'{}'
		)).height;

		const header = fixture.querySelector('.quick-input-header')!;
		dispatchMouseEvent(header, 'mousedown', 0, 0, 2);
		dispatchMouseEvent(header, 'mouseup', 0, 0, 2);
		resize(south, 0, 20);
		const singleDragHeight = JSON.parse(storageService.get(
			'workbench.quickInput.viewState',
			StorageScope.APPLICATION,
			'{}'
		)).height;
		assert.strictEqual(repeatedDragHeight, singleDragHeight);
	});

	test('vertical resize reveals one standard row at a time', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;
		const initialMaxHeight = parseFloat(list.style.maxHeight);

		resize(south, 0, QUICK_INPUT_ITEM_HEIGHT);

		assert.strictEqual(parseFloat(list.style.maxHeight), initialMaxHeight + QUICK_INPUT_ITEM_HEIGHT);
	});

	test('vertical resize uses one standard row for items with detail', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({
			label: `item ${index}`,
			detail: `detail ${index}`
		}));
		quickpick.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const firstItem = list.querySelector<HTMLElement>('.monaco-list-row')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;
		const initialMaxHeight = parseFloat(list.style.maxHeight);

		resize(south, 0, QUICK_INPUT_ITEM_HEIGHT);

		assert.deepStrictEqual({
			itemHeight: firstItem.clientHeight,
			maxHeightDelta: parseFloat(list.style.maxHeight) - initialMaxHeight
		}, {
			itemHeight: QUICK_INPUT_ITEM_WITH_DETAIL_HEIGHT,
			maxHeightDelta: QUICK_INPUT_ITEM_HEIGHT
		});
	});

	test('vertical resize uses the standard row-height grid with variable-height items', () => {
		const quickpick = store.add(controller.createQuickPick({ useSeparators: true }));
		quickpick.items = [
			{ label: 'standard item' },
			{ label: 'detailed item', detail: 'detail' },
			{ type: 'separator', label: 'section' },
			...Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }))
		];
		quickpick.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;
		const initialMaxHeight = parseFloat(list.style.maxHeight);

		resize(south, 0, QUICK_INPUT_ITEM_HEIGHT);

		assert.deepStrictEqual({
			maxHeightDelta: parseFloat(list.style.maxHeight) - initialMaxHeight,
			rowHeightRemainder: (parseFloat(list.style.maxHeight) - QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT) % QUICK_INPUT_ITEM_HEIGHT
		}, {
			maxHeightDelta: QUICK_INPUT_ITEM_HEIGHT,
			rowHeightRemainder: 0
		});
	});

	test('vertical resize reveals one fixed-height tree row at a time', () => {
		const quickTree = store.add(controller.createQuickTree());
		quickTree.setItemTree(Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` })));
		quickTree.show();
		const tree = fixture.querySelector<HTMLElement>('.quick-input-tree .monaco-list')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;
		const initialMaxHeight = parseFloat(tree.style.maxHeight);

		resize(south, 0, QUICK_INPUT_ITEM_HEIGHT);

		assert.strictEqual(parseFloat(tree.style.maxHeight), initialMaxHeight + QUICK_INPUT_ITEM_HEIGHT);
	});

	test('quick tree remains constrained when its vertical bound is zero', () => {
		const quickTree = store.add(controller.createQuickTree());
		quickTree.setItemTree(Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` })));
		quickTree.show();
		const tree = fixture.querySelector<HTMLElement>('.quick-input-tree .monaco-list')!;

		resizeHost(1000, 50);

		assert.strictEqual(tree.style.maxHeight, `${QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT}px`);
	});

	test('horizontal resize is symmetric and accumulates across drag gestures', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.show();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const east = fixture.querySelector<HTMLElement>('.quick-input-resize-east')!;

		assert.deepStrictEqual({ width: widget.clientWidth, left: widget.offsetLeft }, { width: QUICK_INPUT_MAX_WIDTH, left: 200 });

		resize(east, 50, 0);
		assert.deepStrictEqual({ width: widget.clientWidth, left: widget.offsetLeft }, { width: 700, left: 150 });

		resize(east, 25, 0);
		assert.deepStrictEqual({ width: widget.clientWidth, left: widget.offsetLeft }, { width: 750, left: 125 });
	});

	test('horizontal resize observes proportional limits and directional sash states', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.show();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const west = fixture.querySelector<HTMLElement>('.quick-input-resize-west')!;
		const east = fixture.querySelector<HTMLElement>('.quick-input-resize-east')!;

		resize(east, 1000, 0);
		assert.strictEqual(widget.clientWidth, 900);
		assert.ok(west.classList.contains('minimum'));
		assert.ok(east.classList.contains('maximum'));

		resize(east, -1000, 0);
		assert.strictEqual(widget.clientWidth, 200);
		assert.ok(west.classList.contains('maximum'));
		assert.ok(east.classList.contains('minimum'));
	});

	test('keyboard resize and reset commands preserve the custom position', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		controller.setAlignment({ top: 0.25, left: 0.75 });
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const initialListMaxHeight = parseFloat(list.style.maxHeight);

		controller.resize(QUICK_INPUT_RESIZE_WIDTH_INCREMENT, QUICK_INPUT_ITEM_HEIGHT);

		const resizedState = JSON.parse(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION, '{}'));
		assert.deepStrictEqual({
			width: widget.clientWidth,
			listMaxHeightDelta: parseFloat(list.style.maxHeight) - initialListMaxHeight,
			state: resizedState
		}, {
			width: QUICK_INPUT_MAX_WIDTH + QUICK_INPUT_RESIZE_WIDTH_INCREMENT,
			listMaxHeightDelta: QUICK_INPUT_ITEM_HEIGHT,
			state: { top: 0.25, left: 0.75, width: QUICK_INPUT_MAX_WIDTH + QUICK_INPUT_RESIZE_WIDTH_INCREMENT, height: 342 }
		});

		controller.resetSize();

		assert.deepStrictEqual({
			width: widget.clientWidth,
			state: JSON.parse(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION, '{}'))
		}, {
			width: QUICK_INPUT_MAX_WIDTH,
			state: { top: 0.25, left: 0.75 }
		});
	});

	test('vertical and corner resize use the total pointer delta', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;
		const corner = south.querySelector<HTMLElement>('.orthogonal-drag-handle.end')!;
		const initial = { width: widget.clientWidth, listHeight: list.clientHeight };

		resize(south, 0, 80);
		assert.ok(list.clientHeight > initial.listHeight);
		assert.strictEqual(widget.clientWidth, initial.width);

		const beforeCorner = { width: widget.clientWidth, listHeight: list.clientHeight };
		resize(corner, 40, 40);
		assert.strictEqual(widget.clientWidth, beforeCorner.width + 80);
		assert.ok(list.clientHeight > beforeCorner.listHeight);
		assert.ok(widget.clientHeight <= 720);
	});

	test('vertical resize is capped by filtered content and keeps one row visible', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;

		resize(south, 0, 80);
		const requestedHeight = JSON.parse(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION, '{}')).height;
		quickpick.value = 'item 49';
		assert.ok(south.classList.contains('disabled'));

		assert.strictEqual(list.style.maxHeight, `${QUICK_INPUT_ITEM_HEIGHT + QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT}px`);
		assert.ok(list.clientHeight >= QUICK_INPUT_ITEM_HEIGHT && list.clientHeight <= QUICK_INPUT_ITEM_HEIGHT + QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT + 1);
		assert.strictEqual(south.querySelector('.orthogonal-drag-handle'), null);
		assert.strictEqual(JSON.parse(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION, '{}')).height, requestedHeight);

		quickpick.value = '';
		assert.ok(list.clientHeight > QUICK_INPUT_ITEM_HEIGHT + QUICK_INPUT_LIST_SCROLL_INDICATOR_HEIGHT);
	});

	test('resize state persists without a custom position and header double click resets it', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const east = fixture.querySelector<HTMLElement>('.quick-input-resize-east')!;
		const south = fixture.querySelector<HTMLElement>('.quick-input-resize-south')!;

		resize(east, 50, 0);
		resize(south, 0, 80);

		const state = JSON.parse(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION, '{}'));
		assert.strictEqual(state.width, 700);
		assert.ok(state.height > 320);
		assert.strictEqual(state.top, undefined);
		assert.strictEqual(state.left, undefined);

		const header = fixture.querySelector('.quick-input-header')!;
		dispatchMouseEvent(header, 'mousedown', 0, 0, 2);
		dispatchMouseEvent(header, 'mouseup', 0, 0, 2);
		assert.strictEqual(widget.clientWidth, QUICK_INPUT_MAX_WIDTH);
		assert.strictEqual(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION), undefined);
	});

	test('size-only state is restored without being cleared by position initialization', () => {
		controller.dispose();
		storageService.store(
			'workbench.quickInput.viewState',
			JSON.stringify({ width: 700, height: 400 }),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
		controller = createController();
		controller.layout({ height: 800, width: 1000 }, 0);

		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;

		assert.deepStrictEqual({
			width: widget.clientWidth,
			left: widget.offsetLeft,
			listMaxHeight: list.style.maxHeight
		}, {
			width: 700,
			left: 150,
			listMaxHeight: '402px'
		});
		assert.strictEqual(storageService.get('workbench.quickInput.viewState', StorageScope.APPLICATION), JSON.stringify({ width: 700, height: 400 }));
	});

	test('size and position respond to host window resizing', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = Array.from({ length: 50 }, (_, index) => ({ label: `item ${index}` }));
		quickpick.show();
		controller.setAlignment({ top: 0.8, left: 0.9 });
		resize(fixture.querySelector<HTMLElement>('.quick-input-resize-east')!, 100, 0);
		resize(fixture.querySelector<HTMLElement>('.quick-input-resize-south')!, 0, 80);

		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const list = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list')!;
		const requestedSize = { width: widget.clientWidth, listHeight: list.clientHeight };

		resizeHost(500, 800);
		assert.strictEqual(widget.clientWidth, 500 * QUICK_INPUT_MAX_DIMENSION_RATIO);
		assert.strictEqual(list.clientHeight, requestedSize.listHeight);

		resizeHost(1000, 400);
		assert.strictEqual(widget.clientWidth, requestedSize.width);
		assert.ok(widget.clientHeight <= 400);

		resizeHost(500, 400);
		assert.ok(widget.offsetLeft >= 0);
		assert.ok(widget.offsetTop >= 0);
		assert.ok(widget.offsetLeft + widget.clientWidth <= 500);
		assert.ok(widget.offsetTop + widget.clientHeight <= 400);

		resizeHost(1000, 800);
		assert.strictEqual(widget.clientWidth, requestedSize.width);
		assert.strictEqual(list.clientHeight, requestedSize.listHeight);
	});

	test('anchored quick inputs cannot be resized', () => {
		const anchor = document.createElement('div');
		fixture.appendChild(anchor);
		const quickpick = store.add(controller.createQuickPick());
		quickpick.anchor = anchor;
		quickpick.show();

		for (const sash of fixture.querySelectorAll('.quick-input-resize-sash')) {
			assert.ok(sash.classList.contains('disabled'));
		}
	});

	test('pick - basecase', async () => {
		const item = { label: 'foo' };

		const wait = setupWaitTilShownListener(controller);
		const pickPromise = controller.pick([item, { label: 'bar' }]);
		await wait;

		controller.accept();
		const pick = await raceTimeout(pickPromise, 2000);

		assert.strictEqual(pick, item);
	});

	test('pick - activeItem is honored', async () => {
		const item = { label: 'foo' };

		const wait = setupWaitTilShownListener(controller);
		const pickPromise = controller.pick([{ label: 'bar' }, item], { activeItem: item });
		await wait;

		controller.accept();
		const pick = await pickPromise;

		assert.strictEqual(pick, item);
	});

	test('input - basecase', async () => {
		const wait = setupWaitTilShownListener(controller);
		const inputPromise = controller.input({ value: 'foo' });
		await wait;

		controller.accept();
		const value = await raceTimeout(inputPromise, 2000);

		assert.strictEqual(value, 'foo');
	});

	test('onDidChangeValue - gets triggered when .value is set', async () => {
		const quickpick = store.add(controller.createQuickPick());

		let value: string | undefined = undefined;
		store.add(quickpick.onDidChangeValue((e) => value = e));

		// Trigger a change
		quickpick.value = 'changed';

		try {
			assert.strictEqual(value, quickpick.value);
		} finally {
			quickpick.dispose();
		}
	});

	test('keepScrollPosition - works with activeItems', async () => {
		const quickpick = store.add(controller.createQuickPick() as QuickPick<IQuickPickItem>);

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		const cursorTop = quickpick.scrollTop;

		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(cursorTop, quickpick.scrollTop);

		quickpick.keepScrollPosition = false;
		quickpick.activeItems = [items[0]];
		assert.strictEqual(quickpick.scrollTop, 0);
	});

	test('keepScrollPosition - works with items', async () => {
		const quickpick = store.add(controller.createQuickPick() as QuickPick<IQuickPickItem>);

		const items = [];
		for (let i = 0; i < 1000; i++) {
			items.push({ label: `item ${i}` });
		}
		quickpick.items = items;
		// setting the active item should cause the quick pick to scroll to the bottom
		quickpick.activeItems = [items[items.length - 1]];
		quickpick.show();

		const cursorTop = quickpick.scrollTop;
		assert.notStrictEqual(cursorTop, 0);

		quickpick.keepScrollPosition = true;
		quickpick.items = items;
		assert.strictEqual(cursorTop, quickpick.scrollTop);

		quickpick.keepScrollPosition = false;
		quickpick.items = items;
		assert.strictEqual(quickpick.scrollTop, 0);
	});

	test('selectedItems - verify previous selectedItems does not hang over to next set of items', async () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = [{ label: 'step 1' }];
		quickpick.show();

		void (await new Promise<void>(resolve => {
			store.add(quickpick.onDidAccept(() => {
				quickpick.canSelectMany = true;
				quickpick.items = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
				resolve();
			}));

			// accept 'step 1'
			controller.accept();
		}));

		// accept in multi-select
		controller.accept();

		// Since we don't select any items, the selected items should be empty
		assert.strictEqual(quickpick.selectedItems.length, 0);
	});

	test('activeItems - verify onDidChangeActive is triggered after setting items', async () => {
		const quickpick = store.add(controller.createQuickPick());

		// Setup listener for verification
		const activeItemsFromEvent: IQuickPickItem[] = [];
		store.add(quickpick.onDidChangeActive(items => activeItemsFromEvent.push(...items)));

		quickpick.show();

		const item = { label: 'step 1' };
		quickpick.items = [item];

		assert.strictEqual(activeItemsFromEvent.length, 1);
		assert.strictEqual(activeItemsFromEvent[0], item);
		assert.strictEqual(quickpick.activeItems.length, 1);
		assert.strictEqual(quickpick.activeItems[0], item);
	});

	test('activeItems - verify setting itemActivation to None still triggers onDidChangeActive after selection #207832', async () => {
		const quickpick = store.add(controller.createQuickPick());
		const item = { label: 'step 1' };
		quickpick.items = [item];
		quickpick.show();
		assert.strictEqual(quickpick.activeItems[0], item);

		// Setup listener for verification
		const activeItemsFromEvent: IQuickPickItem[] = [];
		store.add(quickpick.onDidChangeActive(items => activeItemsFromEvent.push(...items)));

		// Trigger a change
		quickpick.itemActivation = ItemActivation.NONE;
		quickpick.items = [item];

		assert.strictEqual(activeItemsFromEvent.length, 0);
		assert.strictEqual(quickpick.activeItems.length, 0);
	});

	test('isKeyModified - returns false when no modifiers are pressed', () => {
		assert.strictEqual(isKeyModified(NO_KEY_MODS), false);
		assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: false }), false);
	});

	test('isKeyModified - returns true when any modifier is pressed', () => {
		assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: false, shift: false }), true);
		assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: true, shift: false }), true);
		assert.strictEqual(isKeyModified({ ctrlCmd: false, alt: false, shift: true }), true);
		assert.strictEqual(isKeyModified({ ctrlCmd: true, alt: true, shift: true }), true);
	});
});
