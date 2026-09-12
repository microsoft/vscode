/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy } from 'sinon';
import { addDisposableListener } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { toAction } from '../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Event as CommonEvent } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { IHoverService } from '../../../hover/browser/hover.js';
import { NullHoverService } from '../../../hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../keybinding/test/common/mockKeybindingService.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IOpenerService } from '../../../opener/common/opener.js';
import { NullOpenerService } from '../../../opener/test/common/nullOpenerService.js';
import { URI } from '../../../../base/common/uri.js';
import { ActionList, ActionListItemKind, ActionListWidget, IActionListItem, IActionListOptions } from '../../browser/actionList.js';
import { AnchorPosition } from '../../../../base/common/layout.js';

interface ITestActionItem {
	readonly id: string;
	readonly checked?: boolean;
}

function action(id: string): IActionListItem<ITestActionItem> {
	return { kind: ActionListItemKind.Action, label: id, item: { id } };
}

function separator(label?: string): IActionListItem<ITestActionItem> {
	return { kind: ActionListItemKind.Separator, label };
}

function createActionListWidget(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, options: {
	readonly items?: readonly IActionListItem<ITestActionItem>[];
	readonly onFilter?: (filter: string, cancellationToken: CancellationToken) => Promise<readonly IActionListItem<ITestActionItem>[]>;
	readonly onHide?: () => void;
	readonly onSelect?: (item: ITestActionItem) => void;
	readonly listOptions?: Partial<IActionListOptions>;
}): ActionListWidget<ITestActionItem> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	const delegate = options.onFilter
		? {
			onHide: options.onHide ?? (() => { }),
			onSelect: options.onSelect ?? (() => { }),
			onFilter: options.onFilter,
		}
		: {
			onHide: options.onHide ?? (() => { }),
			onSelect: options.onSelect ?? (() => { }),
		};

	const widget = disposables.add(instantiationService.createInstance(
		ActionListWidget<ITestActionItem>,
		'testActionList',
		false,
		options.items ?? [action('initial')],
		delegate,
		undefined,
		{ showFilter: true, ...options.listOptions },
	));

	if (widget.filterContainer) {
		document.body.appendChild(widget.filterContainer);
		disposables.add({ dispose: () => widget.filterContainer?.remove() });
	}
	// The header banner is a standalone element the caller attaches (like the
	// filter container), so the test appends it to exercise header behaviors.
	const headerContainer = widget.headerContainer;
	if (headerContainer) {
		document.body.appendChild(headerContainer);
		disposables.add({ dispose: () => headerContainer.remove() });
	}
	document.body.appendChild(widget.domNode);
	disposables.add({ dispose: () => widget.domNode.remove() });
	widget.layout(200, 200);

	return widget;
}

function typeFilter(widget: ActionListWidget<ITestActionItem>, value: string): void {
	assert.ok(widget.filterInput);
	widget.filterInput.value = value;
	widget.filterInput.dispatchEvent(new Event('input'));
}

function dispatchKeyDown(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	return event;
}

function settleLayout(): Promise<void> {
	return new Promise(resolve => mainWindow.requestAnimationFrame(() => mainWindow.requestAnimationFrame(() => resolve())));
}

function getVisibleRowText(widget: ActionListWidget<ITestActionItem>): string[] {
	return Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row'))
		.map(row => row.textContent ?? '')
		.filter(text => text.length > 0);
}

function withWindowInnerHeight<T>(height: number, callback: () => T): T {
	const originalDescriptor = Object.getOwnPropertyDescriptor(mainWindow, 'innerHeight');
	Object.defineProperty(mainWindow, 'innerHeight', { configurable: true, value: height });
	try {
		return callback();
	} finally {
		if (originalDescriptor) {
			Object.defineProperty(mainWindow, 'innerHeight', originalDescriptor);
		} else {
			Reflect.deleteProperty(mainWindow, 'innerHeight');
		}
	}
}

function createActionList(disposables: ReturnType<typeof ensureNoDisposablesAreLeakedInTestSuite>, items: readonly IActionListItem<ITestActionItem>[], options?: {
	readonly listOptions?: Partial<IActionListOptions>;
	readonly anchor?: { x: number; y: number; width: number; height: number };
}): ActionList<ITestActionItem> {
	const instantiationService = disposables.add(new TestInstantiationService());
	instantiationService.set(IKeybindingService, new MockKeybindingService());
	instantiationService.set(IHoverService, NullHoverService);
	instantiationService.set(IOpenerService, NullOpenerService);
	instantiationService.stub(IContextViewService, {
		layout: () => { },
		hideContextView: () => { },
		getContextViewElement: () => document.body,
	} as Partial<IContextViewService> as IContextViewService);
	instantiationService.stub(ILayoutService, {
		getContainer: () => document.body,
		mainContainer: document.body,
		activeContainer: document.body,
		onDidLayoutMainContainer: CommonEvent.None,
		onDidLayoutContainer: CommonEvent.None,
		onDidLayoutActiveContainer: CommonEvent.None,
		onDidAddContainer: CommonEvent.None,
		onDidChangeActiveContainer: CommonEvent.None,
	} as Partial<ILayoutService> as ILayoutService);

	const list = disposables.add(instantiationService.createInstance(
		ActionList<ITestActionItem>,
		'testActionList',
		false,
		items,
		{
			onHide: () => { },
			onSelect: () => { },
		},
		undefined,
		{ showFilter: true, ...options?.listOptions },
		options?.anchor ?? { x: 10, y: 150, width: 20, height: 20 },
	));

	const widget = document.createElement('div');
	widget.classList.add('action-widget');
	document.body.appendChild(widget);
	disposables.add({ dispose: () => widget.remove() });
	if (list.filterContainer) {
		widget.appendChild(list.filterContainer);
	}
	widget.appendChild(list.domNode);

	return list;
}

suite('ActionListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('recycled action icons do not retain a previous fallback or theme color', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('fallback')],
			listOptions: { showFilter: false },
		});
		widget.domNode.style.setProperty('--vscode-editorLightBulb-foreground', '#ffcc00');
		widget.domNode.style.setProperty('--vscode-problemsWarningIcon-foreground', '#ffaa00');
		widget.domNode.style.color = '#123456';
		const originalIcon = widget.domNode.querySelector<HTMLElement>('.monaco-list-row > .codicon')!;
		const iconState = () => {
			const icon = widget.domNode.querySelector<HTMLElement>('.monaco-list-row > .codicon')!;
			return { reused: icon === originalIcon, inlineColor: icon.style.color, color: mainWindow.getComputedStyle(icon).color };
		};
		const states = [iconState()];
		const icons = [
			Codicon.shield,
			{ ...Codicon.warning, color: { id: 'problemsWarningIcon.foreground' } },
			Codicon.shield,
		];
		for (const icon of icons) {
			widget.updateItems([{ ...action(icon.id), group: { title: '', icon } }]);
			states.push(iconState());
		}
		assert.deepStrictEqual(states, [
			{ reused: true, inlineColor: 'var(--vscode-editorLightBulb-foreground)', color: 'rgb(255, 204, 0)' },
			{ reused: true, inlineColor: '', color: 'rgb(18, 52, 86)' },
			{ reused: true, inlineColor: 'var(--vscode-problemsWarningIcon-foreground)', color: 'rgb(255, 170, 0)' },
			{ reused: true, inlineColor: '', color: 'rgb(18, 52, 86)' },
		]);
	});

	test('opening under a stationary pointer preserves keyboard focus and selection', () => {
		const selected: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second'), action('third')],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false },
		});
		const rows = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
		widget.focus();
		rows[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		rows[2].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'first');

		widget.focusNext();
		rows[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		rows[2].dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		widget.acceptSelected();
		assert.deepStrictEqual(selected, ['second']);
	});

	test('pointer movement enables hover on the initial row and subsequent rows', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second'), action('third')],
			listOptions: { showFilter: false },
		});
		const rows = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
		widget.focus();
		rows[1].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		rows[1].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'second');

		rows[2].dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'third');
	});

	for (const filterAsCombobox of [false, true]) {
		test(`only keyboard navigation draws the selection border (combobox: ${filterAsCombobox})`, () => {
			const widget = createActionListWidget(disposables, {
				items: [action('first'), action('second')],
				listOptions: { showFilter: filterAsCombobox, focusFilterOnOpen: filterAsCombobox, filterAsCombobox },
			});
			widget.domNode.classList.add('action-widget');
			widget.domNode.style.setProperty('--vscode-menu-selectionBorder', '#0069cc');
			widget.domNode.style.setProperty('--vscode-list-focusOutline', '#0069cc');
			widget.domNode.style.setProperty('--vscode-contrastActiveBorder', 'transparent');
			const rows = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
			const outline = () => mainWindow.getComputedStyle(widget.domNode.querySelector<HTMLElement>('.monaco-list-row.focused')!).outlineColor;

			widget.focus();
			widget.focusNext();
			const states = [outline()];
			rows[0].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
			states.push(outline());
			widget.focusNext();
			states.push(outline());
			rows[1].dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementY: 1 }));
			states.push(outline());
			widget.focusPrevious();
			states.push(outline());
			rows[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			states.push(outline());
			dispatchKeyDown(filterAsCombobox ? widget.filterInput! : widget.domNode.querySelector<HTMLElement>('.monaco-list')!, { key: 'Shift', keyCode: 16 });
			states.push(outline());
			if (filterAsCombobox) {
				widget.focus();
				states.push(outline());
			}

			assert.deepStrictEqual(states, [
				'rgb(0, 105, 204)',
				'rgba(0, 0, 0, 0)',
				'rgb(0, 105, 204)',
				'rgba(0, 0, 0, 0)',
				'rgb(0, 105, 204)',
				'rgba(0, 0, 0, 0)',
				'rgb(0, 105, 204)',
				...filterAsCombobox ? ['rgba(0, 0, 0, 0)'] : [],
			]);
		});
	}

	test('preserves high contrast outlines during pointer navigation', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second')],
			listOptions: { showFilter: false },
		});
		widget.domNode.classList.add('action-widget');
		widget.domNode.style.setProperty('--vscode-menu-selectionBorder', '#f38518');
		widget.domNode.style.setProperty('--vscode-contrastActiveBorder', '#f38518');
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));

		assert.strictEqual(mainWindow.getComputedStyle(row).outlineColor, 'rgb(243, 133, 24)');
	});

	test('the first click selects its row without prior pointer movement', () => {
		const selected: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('second')],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false },
		});
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		row.click();
		assert.deepStrictEqual(selected, ['second']);
	});

	for (const activation of ['mousemove', 'mousedown'] as const) {
		test(`stops mapping mouse moves after ${activation} enables hover`, () => {
			const widget = createActionListWidget(disposables, {
				items: [action('first'), action('second')],
				listOptions: { showFilter: false },
			});
			const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
			const getAttribute = spy(row, 'getAttribute');
			disposables.add({ dispose: () => getAttribute.restore() });

			row.dispatchEvent(new MouseEvent(activation, { bubbles: true, movementX: 1 }));
			const mappedActivation = getAttribute.calledWith('data-index');
			getAttribute.resetHistory();
			row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
			row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementY: 1 }));
			assert.deepStrictEqual({
				mappedActivation,
				mappedSubsequentMovement: getAttribute.calledWith('data-index'),
			}, {
				mappedActivation: true,
				mappedSubsequentMovement: false,
			});
		});
	}

	test('initial pointer movement and clicks do not select disabled items', () => {
		const selected: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('first'), { ...action('disabled'), disabled: true }],
			onSelect: item => selected.push(item.id),
			listOptions: { showFilter: false },
		});
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
		row.click();
		assert.deepStrictEqual(selected, []);
	});

	test('initial hover does not open a submenu until the pointer moves', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), { ...action('second'), hover: { content: 'Details' } }],
			listOptions: { showFilter: false },
		});
		widget.focus();
		const row = widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		await timeout(500);
		assert.strictEqual(panel.style.display, 'none');

		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementY: 1 }));
		await timeout(500);
		assert.notStrictEqual(panel.style.display, 'none');
	}));

	function createPersistentPreview(side: 'left' | 'right' = 'right', pointerIntentOnly = false) {
		const selected: string[] = [];
		const contents = ['first', 'second', 'third'].map(label => {
			const content = document.createElement('div');
			content.textContent = `Details for ${label}`;
			content.style.cssText = 'width: 180px; height: 180px;';
			return content;
		});
		const widget = createActionListWidget(disposables, {
			items: [
				...contents.map((content, index) => ({
					...action(['first', 'second', 'third'][index]),
					hover: { content },
				})),
				action('plain'),
			],
			onSelect: item => selected.push(item.id),
			listOptions: {
				showFilter: false,
				persistentHover: !pointerIntentOnly,
				submenuPointerIntent: pointerIntentOnly,
				headerText: 'Cache hint',
			},
		});
		const popup = document.createElement('div');
		popup.className = 'action-widget';
		popup.style.cssText = `position: fixed; top: 120px; left: ${side === 'left' ? mainWindow.innerWidth - 320 : 40}px; width: 260px; padding: 8px;`;
		document.body.appendChild(popup);
		disposables.add({ dispose: () => popup.remove() });
		popup.appendChild(widget.domNode);
		widget.layout(120, 240);
		const rows = () => widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row');
		const hover = (index: number, clientX?: number) => {
			const row = rows()[index];
			const bounds = row.getBoundingClientRect();
			const point = { x: clientX ?? bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
			row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: point.x, clientY: point.y }));
			row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: point.x, clientY: point.y, movementX: 1 }));
			return point;
		};
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const isCenteredOnRow = (index: number) => {
			const rowBounds = rows()[index].getBoundingClientRect();
			const panelBounds = panel.getBoundingClientRect();
			return Math.abs(panelBounds.top + panelBounds.height / 2 - rowBounds.top - rowBounds.height / 2) < 1;
		};
		return { widget, popup, panel, contents, selected, rows, hover, isCenteredOnRow };
	}

	test('renders and activates a standalone toggle row', () => {
		let checked = false;
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('Sandboxing for terminal'),
				standaloneToggle: {
					label: 'Sandboxing for terminal',
					checked: false,
					onChange: value => { checked = value; },
				},
			}],
			listOptions: { showFilter: false },
		});

		widget.focus();
		widget.acceptSelected();

		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row');
		assert.deepStrictEqual({
			checked,
			standaloneClass: row?.classList.contains('has-standalone-toggle'),
			label: row?.querySelector('.title')?.textContent,
			toggleLabelCount: row?.querySelectorAll('.action-list-item-inline-toggle-label').length,
			switchChecked: row?.querySelector('.monaco-switch')?.classList.contains('checked'),
			title: row?.title,
		}, {
			checked: true,
			standaloneClass: true,
			label: 'Sandboxing for terminal',
			toggleLabelCount: 0,
			switchChecked: true,
			title: '',
		});
	});

	test('does not activate a disabled standalone toggle row', () => {
		let changeCount = 0;
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('Sandboxing for terminal'),
				standaloneToggle: {
					label: 'Sandboxing for terminal',
					title: 'Managed by your organization',
					checked: true,
					disabled: true,
					onChange: () => { changeCount++; },
				},
			}],
		});

		widget.focus();
		widget.acceptSelected();
		const toggle = widget.domNode.querySelector<HTMLElement>('.monaco-switch');

		assert.deepStrictEqual({
			changeCount,
			checked: toggle?.classList.contains('checked'),
			disabled: (toggle as HTMLButtonElement | null)?.disabled,
			title: toggle?.getAttribute('aria-label'),
		}, {
			changeCount: 0,
			checked: true,
			disabled: true,
			title: 'Managed by your organization',
		});
	});

	test('Escape from a submenu hides the action list', () => {
		let hideCount = 0;
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('parent'),
				submenuActions: [toAction({ id: 'child', label: 'Child', run: () => { } })],
			}],
			onHide: () => hideCount++,
		});

		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const submenu = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel > .actionList');
		assert.ok(submenu);
		submenu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		assert.strictEqual(hideCount, 1);
	});

	test('hovering back to the parent keeps focus in the menu when a submenu was focused', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const states = [];
		for (const hover of [undefined, { content: 'Mode details' }]) {
			const widget = createActionListWidget(disposables, {
				items: [{ ...action('mode'), hover }, {
					...action('permissions'),
					label: 'Permissions',
					submenuActions: [toAction({ id: 'manual', label: 'Manual', run: () => { } })],
				}],
				listOptions: { showFilter: false },
			});
			const parentList = widget.domNode.querySelector<HTMLElement>('.monaco-list')!;
			const modeRow = parentList.querySelector<HTMLElement>('.monaco-list-row')!;
			widget.focus();
			widget.focusNext();
			parentList.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
			const initiallyFocusedSubmenu = panel.contains(document.activeElement);

			modeRow.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			modeRow.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
			await timeout(600);

			states.push({
				initiallyFocusedSubmenu,
				parentFocused: document.activeElement === parentList,
				highlightedRow: widget.getFocusedElement()?.item?.id,
				panel: panel.textContent,
			});
		}
		assert.deepStrictEqual(states, [
			{ initiallyFocusedSubmenu: true, parentFocused: true, highlightedRow: 'mode', panel: '' },
			{ initiallyFocusedSubmenu: true, parentFocused: true, highlightedRow: 'mode', panel: 'Mode details' },
		]);
	}));

	test('replacing a focused submenu moves focus before disposing its contents', () => {
		const widget = createActionListWidget(disposables, {
			items: ['permissions', 'configuration'].map(id => ({
				...action(id),
				submenuActions: [toAction({ id, label: id, run: () => { } })],
			})),
			listOptions: { showFilter: false },
		});
		const parentList = widget.domNode.querySelector<HTMLElement>('.monaco-list')!;
		widget.focus();
		parentList.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const secondRow = parentList.querySelectorAll<HTMLElement>('.monaco-list-row')[1];
		secondRow.querySelector<HTMLElement>('.action-list-submenu-indicator')!.click();

		assert.deepStrictEqual({
			parentFocused: document.activeElement === parentList,
			content: widget.domNode.querySelector('.action-list-submenu-panel .title')?.textContent,
		}, { parentFocused: true, content: 'configuration' });
	});

	test('runs dynamic filter updates immediately', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const filters: string[] = [];
		const widget = createActionListWidget(disposables, {
			onFilter: async filter => {
				filters.push(filter);
				return [action(`server-${filter === 'ma' ? 'ranked' : filter}-result`)];
			},
		});

		typeFilter(widget, 'm');
		typeFilter(widget, 'ma');
		assert.deepStrictEqual(filters, ['m', 'ma']);
		await timeout(0);
		assert.ok(widget.domNode.textContent?.includes('server-ranked-result'));
	}));

	test('ignores stale dynamic filter results', async () => {
		const firstResult = new DeferredPromise<readonly IActionListItem<ITestActionItem>[]>();
		const secondResult = new DeferredPromise<readonly IActionListItem<ITestActionItem>[]>();
		const filters: string[] = [];
		const widget = createActionListWidget(disposables, {
			onFilter: filter => {
				filters.push(filter);
				return filter === 'm' ? firstResult.p : secondResult.p;
			},
		});

		typeFilter(widget, 'm');
		typeFilter(widget, 'ma');
		assert.deepStrictEqual(filters, ['m', 'ma']);

		firstResult.complete([action('ma-stale-result')]);
		await timeout(0);
		assert.ok(!widget.domNode.textContent?.includes('ma-stale-result'));

		secondResult.complete([action('ma-fresh-result')]);
		await timeout(0);
		assert.ok(widget.domNode.textContent?.includes('ma-fresh-result'));
	});

	test('does not filter while an IME composition is in progress', () => {
		const filters: string[] = [];
		const widget = createActionListWidget(disposables, {
			onFilter: async filter => {
				filters.push(filter);
				return [action(`result-${filter}`)];
			},
		});

		assert.ok(widget.filterInput);
		widget.filterInput.dispatchEvent(new Event('compositionstart'));
		typeFilter(widget, 'd');
		typeFilter(widget, 'deepseek');
		widget.filterInput.value = 'DeepSeek';
		widget.filterInput.dispatchEvent(new Event('compositionend'));
		// Chromium fires a trailing `input` for the committed text, which must not re-filter.
		typeFilter(widget, 'DeepSeek');

		assert.deepStrictEqual(filters, ['DeepSeek']);
	});

	test('cancels an in-flight dynamic filter when a composition starts', async () => {
		const pending = new DeferredPromise<readonly IActionListItem<ITestActionItem>[]>();
		const widget = createActionListWidget(disposables, {
			onFilter: () => pending.p,
		});

		typeFilter(widget, 'd');
		assert.ok(widget.filterInput);
		widget.filterInput.dispatchEvent(new Event('compositionstart'));

		// Resolving now must not splice/re-layout the list underneath the IME candidate window.
		pending.complete([action('stale-result')]);
		await timeout(0);
		assert.ok(!widget.domNode.textContent?.includes('stale-result'));
	});

	suite('combobox filtering', () => {
		test('initializes the query and exposes the active result to assistive technology', () => {
			const widget = createActionListWidget(disposables, {
				items: [action('alpha'), action('beta'), action('alpine')],
				listOptions: {
					initialFilterValue: 'al',
					filterPlaceholder: 'Search models',
					filterAsCombobox: true,
					focusFilterOnOpen: true,
				},
			});
			widget.focus();
			const input = widget.filterInput;
			assert.ok(input);
			const activeResult = document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
			const controlledList = document.getElementById(input.getAttribute('aria-controls') ?? '');

			assert.deepStrictEqual({
				value: input.value,
				rows: getVisibleRowText(widget),
				inputFocused: document.activeElement === input,
				role: input.getAttribute('role'),
				label: input.getAttribute('aria-label'),
				autocomplete: input.getAttribute('aria-autocomplete'),
				expanded: input.getAttribute('aria-expanded'),
				listRole: controlledList?.getAttribute('role'),
				activeResult: activeResult?.textContent,
			}, {
				value: 'al',
				rows: ['alpha', 'alpine'],
				inputFocused: true,
				role: 'combobox',
				label: 'Search models',
				autocomplete: 'list',
				expanded: 'true',
				listRole: 'listbox',
				activeResult: 'alpha',
			});
		});

		test('arrow navigation skips disabled rows and separators without leaving the input', () => {
			const widget = createActionListWidget(disposables, {
				items: [action('alpha'), separator('Models'), { ...action('beta'), disabled: true }, action('gamma')],
				listOptions: { filterAsCombobox: true, focusFilterOnOpen: true, initialFilterValue: 'a' },
			});
			widget.focus();
			const input = widget.filterInput;
			assert.ok(input);
			input.setSelectionRange(0, 1);

			const states = [
				{ key: 'ArrowDown', keyCode: 40 },
				{ key: 'ArrowUp', keyCode: 38 },
				{ key: 'ArrowUp', keyCode: 38 },
				{ key: 'ArrowDown', keyCode: 40 },
			].map(key => {
				const event = dispatchKeyDown(input, key);
				const activeResult = document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
				return {
					result: widget.getFocusedElement()?.label,
					inputFocused: document.activeElement === input,
					selection: [input.selectionStart, input.selectionEnd],
					activeResult: activeResult?.textContent,
					defaultPrevented: event.defaultPrevented,
				};
			});

			assert.deepStrictEqual(states, ['gamma', 'alpha', 'gamma', 'alpha'].map(result => ({
				result,
				inputFocused: true,
				selection: [0, 1],
				activeResult: result,
				defaultPrevented: true,
			})));
		});

		test('typing can refine the query after navigation and Enter accepts the new result', () => {
			const selected: string[] = [];
			const widget = createActionListWidget(disposables, {
				items: [action('first'), action('second'), action('third')],
				listOptions: { filterAsCombobox: true, focusFilterOnOpen: true },
				onSelect: item => selected.push(item.id),
			});
			widget.focus();
			const input = widget.filterInput;
			assert.ok(input);
			dispatchKeyDown(input, { key: 'ArrowDown', keyCode: 40 });
			typeFilter(widget, 'thi');
			dispatchKeyDown(input, { key: 'Enter', keyCode: 13 });

			assert.deepStrictEqual({
				value: input.value,
				inputFocused: document.activeElement === input,
				rows: getVisibleRowText(widget),
				selected,
			}, { value: 'thi', inputFocused: true, rows: ['third'], selected: ['third'] });
		});

		test('empty and disabled results cannot accept a stale selection', () => {
			const selected: string[] = [];
			const widget = createActionListWidget(disposables, {
				items: [action('first'), { ...action('disabled'), disabled: true }],
				listOptions: { filterAsCombobox: true, focusFilterOnOpen: true },
				onSelect: item => selected.push(item.id),
			});
			widget.focus();
			const input = widget.filterInput;
			assert.ok(input);
			const states = ['missing', 'disabled'].map(query => {
				typeFilter(widget, query);
				dispatchKeyDown(input, { key: 'ArrowDown', keyCode: 40 });
				dispatchKeyDown(input, { key: 'ArrowUp', keyCode: 38 });
				dispatchKeyDown(input, { key: 'Enter', keyCode: 13 });
				return {
					inputFocused: document.activeElement === input,
					activeResult: input.getAttribute('aria-activedescendant'),
					focused: widget.getFocusedElement(),
					selected: [...selected],
				};
			});

			assert.deepStrictEqual(states, ['missing', 'disabled'].map(() => ({
				inputFocused: true, activeResult: null, focused: undefined, selected: [],
			})));
		});

		test('unrelated shortcuts still reach the workbench keybinding handler', () => {
			const widget = createActionListWidget(disposables, {
				listOptions: { filterAsCombobox: true, focusFilterOnOpen: true },
			});
			widget.focus();
			const input = widget.filterInput;
			const filterContainer = widget.filterContainer;
			assert.ok(input && filterContainer);
			const received: string[] = [];
			disposables.add(addDisposableListener(filterContainer, 'keydown', (event: KeyboardEvent) => received.push(event.key)));
			const events = [
				{ key: 'P', keyCode: 80, ctrlKey: true, shiftKey: true },
				{ key: 'P', keyCode: 80, metaKey: true, shiftKey: true },
				{ key: 'Enter', keyCode: 13, ctrlKey: true },
			].map(init => dispatchKeyDown(input, init));

			assert.deepStrictEqual({
				received,
				prevented: events.filter(event => event.defaultPrevented).map(event => event.key),
			}, { received: ['P', 'P', 'Enter'], prevented: [] });
		});

		for (const filterAsCombobox of [undefined, true]) {
			test(`retaining filter focus is opt-in: ${filterAsCombobox}`, () => {
				const widget = createActionListWidget(disposables, {
					items: [action('first'), action('second')],
					listOptions: { filterAsCombobox, focusFilterOnOpen: true },
				});
				widget.focus();
				widget.focusNext();

				assert.deepStrictEqual({
					focused: widget.getFocusedElement()?.label,
					inputFocused: document.activeElement === widget.filterInput,
					role: widget.filterInput?.getAttribute('role'),
				}, {
					focused: 'second',
					inputFocused: !!filterAsCombobox,
					role: filterAsCombobox ? 'combobox' : null,
				});
			});
		}
	});

	test('typing requests a filter instead of performing list type navigation when opted in', () => {
		const typed: string[] = [];
		const widget = createActionListWidget(disposables, {
			items: [action('alpha'), action('beta')],
			listOptions: { showFilter: false, onType: text => typed.push(text) },
		});
		widget.focus();
		const list = widget.domNode.querySelector<HTMLElement>('.monaco-list');
		assert.ok(list);
		const event = dispatchKeyDown(list, { key: 'b', keyCode: 66 });

		assert.deepStrictEqual({
			typed,
			focused: widget.getFocusedElement()?.label,
			defaultPrevented: event.defaultPrevented,
		}, { typed: ['b'], focused: 'alpha', defaultPrevented: true });
	});

	test('type-to-filter leaves shortcuts, composition, and embedded controls alone', () => {
		const typed: string[] = [];
		const widget = createActionListWidget(disposables, {
			listOptions: { showFilter: false, onType: text => typed.push(text) },
		});
		widget.focus();
		const list = widget.domNode.querySelector<HTMLElement>('.monaco-list');
		assert.ok(list);
		const events = [
			{ key: ' ', keyCode: 32 },
			{ key: 'b', keyCode: 66, ctrlKey: true },
			{ key: 'b', keyCode: 66, metaKey: true },
			{ key: 'b', keyCode: 66, altKey: true },
			{ key: 'b', keyCode: 66, isComposing: true },
		].map(init => dispatchKeyDown(list, init));

		for (const tag of ['input', 'textarea', 'button', 'a']) {
			const control = document.createElement(tag);
			widget.domNode.appendChild(control);
			events.push(dispatchKeyDown(control, { key: 'b', keyCode: 66 }));
		}
		const editable = document.createElement('div');
		editable.contentEditable = 'true';
		widget.domNode.appendChild(editable);
		const text = editable.appendChild(document.createElement('span'));
		events.push(dispatchKeyDown(text, { key: 'b', keyCode: 66 }));
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel');
		assert.ok(panel);
		events.push(dispatchKeyDown(panel, { key: 'b', keyCode: 66 }));

		assert.deepStrictEqual({
			typed,
			prevented: events.filter(event => event.defaultPrevented).map(event => event.key),
		}, { typed: [], prevented: [] });
	});

	test('batches row width writes before reading layout', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('first'),
				{ ...action('second'), toolbarActions: [toAction({ id: 'toolbar', label: 'Toolbar', run: () => { } })] },
				action('third'),
			],
		});
		const rows = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row'));
		const allRowsAutoAtRead: boolean[] = [];
		const measuredWidths = [120, 240, 180];
		for (let i = 0; i < rows.length; i++) {
			rows[i].getBoundingClientRect = () => {
				allRowsAutoAtRead.push(rows.every(row => row.style.width === 'auto'));
				return new mainWindow.DOMRect(0, 0, measuredWidths[i], 24);
			};
		}

		const width = widget.computeMaxWidth(0);

		assert.deepStrictEqual({
			width,
			allRowsAutoAtRead,
			restoredWidths: rows.map(row => row.style.width),
		}, {
			width: 278,
			allRowsAutoAtRead: [true, true, true],
			restoredWidths: ['', '', ''],
		});
	});

	test('does not double count a detail row toolbar when computing max width', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				{ ...action('detail'), detail: 'Description', toolbarActions: [toAction({ id: 'toolbar', label: 'Toolbar', run: () => { } })] },
			],
		});
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!;
		row.getBoundingClientRect = () => new mainWindow.DOMRect(0, 0, 240, 48);

		const width = widget.computeMaxWidth(0);

		assert.deepStrictEqual({
			width,
			restoredWidth: row.style.width,
		}, {
			width: 240,
			restoredWidth: '',
		});
	});

	test('keeps detail row geometry stable when its toolbar becomes visible', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('plain'),
				{ ...action('detail'), detail: 'Description', toolbarActions: [toAction({ id: 'toolbar', label: 'Toolbar', run: () => { } })] },
				...Array.from({ length: 20 }, (_, index) => action(`filler-${index}`)),
			],
		});
		const wrapper = document.createElement('div');
		wrapper.classList.add('action-widget');
		widget.domNode.parentElement?.insertBefore(wrapper, widget.domNode);
		wrapper.appendChild(widget.domNode);
		disposables.add({ dispose: () => wrapper.remove() });

		const rows = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row'));
		const detailRow = rows[1];
		const detail = detailRow.querySelector<HTMLElement>('.detail')!;
		const toolbar = detailRow.querySelector<HTMLElement>('.action-list-item-toolbar')!;
		const verticalScrollbar = widget.domNode.querySelector<HTMLElement>('.scrollbar.vertical')!;
		const initial = {
			rowHeight: detailRow.getBoundingClientRect().height,
			detailTop: detail.getBoundingClientRect().top,
			toolbarDisplay: mainWindow.getComputedStyle(toolbar).display,
			toolbarVisibility: mainWindow.getComputedStyle(toolbar).visibility,
			toolbarMarginRight: mainWindow.getComputedStyle(toolbar).marginRight,
		};
		detailRow.classList.add('focused');
		const focused = {
			rowHeight: detailRow.getBoundingClientRect().height,
			detailTop: detail.getBoundingClientRect().top,
			toolbarDisplay: mainWindow.getComputedStyle(toolbar).display,
			toolbarVisibility: mainWindow.getComputedStyle(toolbar).visibility,
			toolbarMarginRight: mainWindow.getComputedStyle(toolbar).marginRight,
			clearsScrollbar: detailRow.getBoundingClientRect().right - toolbar.getBoundingClientRect().right >= verticalScrollbar.getBoundingClientRect().width,
		};

		assert.deepStrictEqual({
			rows: rows.slice(0, 2).map(row => ({
				hasDetail: row.classList.contains('has-detail'),
				hasToolbar: row.classList.contains('has-toolbar'),
			})),
			initial,
			focused,
		}, {
			rows: [
				{ hasDetail: false, hasToolbar: false },
				{ hasDetail: true, hasToolbar: true },
			],
			initial: {
				rowHeight: 48,
				detailTop: initial.detailTop,
				toolbarDisplay: 'flex',
				toolbarVisibility: 'hidden',
				toolbarMarginRight: '10px',
			},
			focused: {
				rowHeight: 48,
				detailTop: initial.detailTop,
				toolbarDisplay: 'flex',
				toolbarVisibility: 'visible',
				toolbarMarginRight: '10px',
				clearsScrollbar: true,
			},
		});
	});

	test('keeps titled separator above first filtered match', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				separator('Provider A'),
				action('alpha'),
				separator('Provider B'),
				action('beta'),
			],
		});

		typeFilter(widget, 'alpha');

		assert.deepStrictEqual(getVisibleRowText(widget), ['Provider A', 'alpha']);
	});

	test('keeps only titled separators for sections with filtered matches', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				separator('Provider A'),
				action('alpha'),
				separator('Provider B'),
				action('beta'),
				separator('Provider C'),
				action('gamma'),
			],
		});

		typeFilter(widget, 'beta');

		assert.deepStrictEqual(getVisibleRowText(widget), ['Provider B', 'beta']);
	});

	test('excludes separators from accessible list positions after filtering', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('selected'),
				separator(),
				action('alpha'),
				action('beta'),
			],
		});
		const getAriaPositions = () => Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row[role="option"]')).map(row => ({
			label: row.getAttribute('aria-label'),
			setSize: row.getAttribute('aria-setsize'),
			posInSet: row.getAttribute('aria-posinset'),
		}));

		const initial = getAriaPositions();
		typeFilter(widget, 'a');
		const filtered = getAriaPositions();

		assert.deepStrictEqual({ initial, filtered }, {
			initial: [
				{ label: 'selected', setSize: '3', posInSet: '1' },
				{ label: 'alpha', setSize: '3', posInSet: '2' },
				{ label: 'beta', setSize: '3', posInSet: '3' },
			],
			filtered: [
				{ label: 'alpha', setSize: '2', posInSet: '1' },
				{ label: 'beta', setSize: '2', posInSet: '2' },
			],
		});
	});

	test('leaves room for action widget chrome when clamping dynamic height', () => withWindowInnerHeight(300, () => {
		const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)));

		list.layout(200);

		const filterHeight = 36;
		const widget = list.domNode.parentElement!;
		const style = mainWindow.getComputedStyle(widget);
		const toPixels = (value: string): number => Number.parseFloat(value) || 0;
		const actionWidgetVerticalChromeHeight = toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
		const availableSpaceAboveAnchor = 150;
		const listHeight = parseFloat(list.domNode.style.height);
		assert.ok(listHeight + filterHeight + actionWidgetVerticalChromeHeight <= availableSpaceAboveAnchor);
	}));

	test('forced above anchor position can clamp dynamic height without the default minimum floor', () => withWindowInnerHeight(300, () => {
		const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)), {
			listOptions: { anchorPosition: AnchorPosition.ABOVE },
			anchor: { x: 10, y: 20, width: 20, height: 20 },
		});

		list.layout(200);

		assert.deepStrictEqual(
			{ anchorPosition: list.anchorPosition, listHeight: parseFloat(list.domNode.style.height) },
			{ anchorPosition: AnchorPosition.ABOVE, listHeight: 0 },
		);
	}));

	test('full-height menus show all content instead of scrolling within the viewport fraction cap', () => withWindowInnerHeight(560, () => {
		const states = [false, true].map(useFullHeight => {
			const list = createActionList(disposables, Array.from({ length: 17 }, (_, index) => ({
				...action(`item-${index}`),
				item: { id: `item-${index}`, checked: index === 16 },
			})), {
				anchor: { x: 10, y: 432, width: 100, height: 24 },
				listOptions: { showFilter: false, anchorPosition: AnchorPosition.ABOVE, useFullHeight },
			});
			list.layout(260);
			list.focus();
			const rows = list.domNode.querySelector<HTMLElement>('.monaco-list-rows')!;
			return { useFullHeight, height: list.domNode.clientHeight, contentHeight: rows.clientHeight, contentTop: rows.style.top };
		});

		assert.deepStrictEqual(states, [
			{ useFullHeight: false, height: 336, contentHeight: 408, contentTop: '-72px' },
			{ useFullHeight: true, height: 408, contentHeight: 408, contentTop: '0px' },
		]);
	}));

	test('header dismiss removes the banner and requests a re-layout', () => {
		let dismissed = false;
		let layoutRequested = false;
		const widget = createActionListWidget(disposables, {
			listOptions: { headerText: 'Cache hint', headerDismiss: () => { dismissed = true; } },
		});
		disposables.add(widget.onDidRequestLayout(() => { layoutRequested = true; }));

		const header = widget.headerContainer;
		assert.ok(header, 'header banner should render when headerText + headerDismiss are set');
		const dismissButton = header!.querySelector<HTMLElement>('.action-list-header-dismiss');
		assert.ok(dismissButton, 'dismiss button should render');

		dismissButton!.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

		assert.deepStrictEqual(
			{ dismissed, layoutRequested, headerCleared: widget.headerContainer === undefined, headerStillInDom: header!.isConnected },
			{ dismissed: true, layoutRequested: true, headerCleared: true, headerStillInDom: false },
		);
	});

	test('an expandable row names the panel it opens, and stops when it closes', () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'panel', expandable: true } }, action('plain')],
			listOptions: { reserveSubmenuSpace: 'always' },
		});
		const rows = () => Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row.action'));
		const state = () => rows().map(row => ({
			haspopup: row.getAttribute('aria-haspopup'),
			expanded: row.getAttribute('aria-expanded'),
		}));

		const initial = state();
		// The chevron is what opens the panel; ArrowRight does the same from the keyboard.
		rows()[0].querySelector<HTMLElement>('.action-list-submenu-indicator.has-submenu')?.click();
		const opened = state();
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel');
		const panelRole = panel?.getAttribute('role');
		const panelLabel = panel?.getAttribute('aria-label');
		// Escape inside the panel is the way back to the row.
		panel?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		const closed = state();

		assert.deepStrictEqual(
			{ initial, opened, closed, panelRole, panelLabel },
			{
				// The plain row opens nothing, so it says nothing.
				initial: [{ haspopup: 'dialog', expanded: 'false' }, { haspopup: null, expanded: null }],
				opened: [{ haspopup: 'dialog', expanded: 'true' }, { haspopup: null, expanded: null }],
				closed: [{ haspopup: 'dialog', expanded: 'false' }, { haspopup: null, expanded: null }],
				panelRole: 'dialog',
				panelLabel: 'auto',
			},
		);
	});

	test('the submenu gutter follows the items the list currently holds', () => {
		const expandable = (id: string): IActionListItem<ITestActionItem> => ({ ...action(id), hover: { content: 'panel', expandable: true } });
		const gutters = (widget: ActionListWidget<ITestActionItem>) =>
			Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row .action-list-submenu-indicator'))
				.map(el => el.style.display === 'none' ? 'none' : (el.style.visibility || 'shown'));

		const widget = createActionListWidget(disposables, { items: [expandable('one'), action('two')] });
		const always = createActionListWidget(disposables, {
			items: [expandable('one'), action('two')],
			listOptions: { reserveSubmenuSpace: 'always' },
		});

		const before = { byDefault: gutters(widget), always: gutters(always) };
		// The chevrons go away, so by default the gutter goes with them.
		widget.updateItems([action('one'), action('two')]);
		always.updateItems([action('one'), action('two')]);

		assert.deepStrictEqual(
			{ before, afterLosingChevrons: { byDefault: gutters(widget), always: gutters(always) } },
			{
				before: { byDefault: ['shown', 'hidden'], always: ['shown', 'hidden'] },
				afterLosingChevrons: { byDefault: ['none', 'none'], always: ['hidden', 'hidden'] },
			},
		);
	});

	test('hidden hover chevrons preserve keyboard access without reserving a gutter', () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('model'), hover: { content: 'Model details', expandable: true, showIndicator: false } }],
			listOptions: { showFilter: false, reserveSubmenuSpace: false },
		});

		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row.action')!;
		const indicator = row.querySelector<HTMLElement>('.action-list-submenu-indicator')!;
		const initial = {
			indicator: indicator.style.display,
			haspopup: row.getAttribute('aria-haspopup'),
			expanded: row.getAttribute('aria-expanded'),
		};
		widget.focus();
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const opened = {
			role: panel.getAttribute('role'),
			focused: document.activeElement === panel,
			expanded: row.getAttribute('aria-expanded'),
		};
		panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

		assert.deepStrictEqual({
			initial,
			opened,
			closed: { expanded: row.getAttribute('aria-expanded'), focusReturned: widget.domNode.contains(document.activeElement) && !panel.contains(document.activeElement) },
		}, {
			initial: { indicator: 'none', haspopup: 'dialog', expanded: 'false' },
			opened: { role: 'dialog', focused: true, expanded: 'true' },
			closed: { expanded: 'false', focusReturned: true },
		});
	});

	test('nested submenu options enable filtering', () => {
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('remote'),
				hover: { preserveVerticalPosition: true, alignToAnchorTop: true },
				submenuActions: [
					toAction({ id: 'alpha', label: 'A long remote host label', run: () => { } }),
					toAction({ id: 'beta', label: 'Beta', run: () => { } }),
				],
				submenuOptions: {
					showFilter: true,
					filterPlaceholder: 'Search Remote',
					filterAsCombobox: true,
					minWidth: 180,
					maxWidth: 180,
				},
			}],
			listOptions: { showFilter: false },
		});
		widget.focus();
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const parentRow = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row.action'))
			.find(row => row.querySelector<HTMLElement>('.title')?.textContent === 'remote')!;
		const filter = panel.querySelector<HTMLInputElement>('.action-list-filter-input')!;
		const bubbledKeys: string[] = [];
		disposables.add(addDisposableListener(widget.domNode, 'keydown', event => bubbledKeys.push(event.key)));
		const longLabelTooltip = Array.from(panel.querySelectorAll<HTMLElement>('.monaco-list-row.action'))
			.find(row => row.querySelector<HTMLElement>('.title')?.textContent === 'A long remote host label')?.title;
		[
			{ key: 'r' },
			{ key: 'P', ctrlKey: true },
			{ key: 'F1', altKey: true },
			{ key: ' ' },
			{ key: 'Process' },
		].forEach(init => filter.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init })));
		filter.value = 'bet';
		filter.dispatchEvent(new Event('input'));

		assert.deepStrictEqual({
			placeholder: filter.placeholder,
			role: filter.getAttribute('role'),
			width: panel.style.width,
			alignment: {
				panelStyle: panel.style.top,
				expectedStyle: `${parentRow.getBoundingClientRect().top - widget.domNode.getBoundingClientRect().top}px`,
			},
			bubbledKeys,
			listWidth: panel.querySelector<HTMLElement>('.actionList')?.style.width,
			longLabelTooltip,
			rows: Array.from(panel.querySelectorAll<HTMLElement>('.monaco-list-row.action')).map(row => row.querySelector<HTMLElement>('.title')?.textContent),
		}, {
			placeholder: 'Search Remote',
			role: 'combobox',
			width: '190px',
			alignment: {
				panelStyle: '0px',
				expectedStyle: '0px',
			},
			bubbledKeys: ['P', 'F1', ' ', 'Process'],
			listWidth: '180px',
			longLabelTooltip: 'A long remote host label',
			rows: ['Beta'],
		});
	});

	test('a filtered submenu near the viewport bottom shifts enough to show one row', () => withWindowInnerHeight(300, () => {
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('remote'),
				hover: { preserveVerticalPosition: true, alignToAnchorTop: true },
				submenuActions: Array.from({ length: 10 }, (_, index) =>
					toAction({ id: `remote-${index}`, label: `Remote ${index}`, run: () => { } })),
				submenuOptions: {
					showFilter: true,
					filterPlaceholder: 'Search Remote',
					filterAsCombobox: true,
					minWidth: 180,
					maxWidth: 180,
				},
			}],
			listOptions: { showFilter: false },
		});
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row.action')!;
		widget.domNode.getBoundingClientRect = () => new mainWindow.DOMRect(40, 260, 180, 24);
		row.getBoundingClientRect = () => new mainWindow.DOMRect(40, 260, 180, 24);
		widget.focus();
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const viewport = panel.querySelector<HTMLElement>('.action-list-submenu-viewport')!;
		const filter = panel.querySelector<HTMLElement>('.action-list-filter')!;
		const submenuList = panel.querySelector<HTMLElement>('.actionList')!;
		panel.getBoundingClientRect = () => new mainWindow.DOMRect(220, 260, 190, 200);
		viewport.getBoundingClientRect = () => new mainWindow.DOMRect(220, 260, 190, 190);
		Object.defineProperty(filter, 'offsetHeight', { configurable: true, value: 30 });
		mainWindow.dispatchEvent(new Event('resize'));

		const top = parseFloat(panel.style.top);
		const listHeight = parseFloat(submenuList.style.height);
		const viewportHeight = parseFloat(viewport.style.height);
		assert.deepStrictEqual({
			hasVisibleRow: listHeight > 0,
			topFitsOuterChromeFilterAndRow: top === 300 - 260 - 10 - 30 - listHeight - 8,
			minimumPanelBottom: 260 + top + 10 + 30 + listHeight,
			viewportContainsFilterAndRow: viewportHeight === 30 + listHeight,
		}, {
			hasVisibleRow: true,
			topFitsOuterChromeFilterAndRow: true,
			minimumPanelBottom: 292,
			viewportContainsFilterAndRow: true,
		});
	}));

	test('a long filtered submenu scrolls its rows beneath the fixed filter', () => withWindowInnerHeight(300, () => {
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('remote'),
				hover: { preserveVerticalPosition: true, alignToAnchorTop: true },
				submenuActions: Array.from({ length: 30 }, (_, index) =>
					toAction({ id: `remote-${index}`, label: `Remote ${index}`, run: () => { } })),
				submenuOptions: {
					showFilter: true,
					filterPlaceholder: 'Search Remote',
					filterAsCombobox: true,
					minWidth: 180,
					maxWidth: 180,
				},
			}],
			listOptions: { showFilter: false },
		});
		const popup = document.createElement('div');
		popup.className = 'action-widget';
		popup.style.cssText = 'position: fixed; top: 100px; left: 40px; width: 200px; padding: 8px;';
		document.body.appendChild(popup);
		disposables.add({ dispose: () => popup.remove() });
		popup.appendChild(widget.domNode);
		widget.layout(24, 180);
		widget.focus();
		widget.domNode.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));

		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const submenuList = panel.querySelector<HTMLElement>('.actionList')!;
		const filter = panel.querySelector<HTMLElement>('.action-list-filter')!;
		const scrollable = submenuList.querySelector<HTMLElement>('.monaco-scrollable-element')!;

		assert.deepStrictEqual({
			filterOutsideList: !submenuList.contains(filter),
			listIsConstrained: parseFloat(submenuList.style.height) < 30 * 24,
			rowsAreScrollable: scrollable.scrollHeight > scrollable.clientHeight,
		}, {
			filterOutsideList: true,
			listIsConstrained: true,
			rowsAreScrollable: true,
		});
	}));

	test('tabs through a focused row toolbar and hover panel while preserving list navigation', () => {
		const createPanel = (id: string) => {
			const panel = document.createElement('div');
			const repository = document.createElement('a');
			repository.href = `https://example.com/${id}`;
			repository.textContent = `repo-${id}`;
			const reference = document.createElement('a');
			reference.href = `https://example.com/${id}/1`;
			reference.textContent = `#${id}`;
			const branch = document.createElement('button');
			branch.textContent = `branch-${id}`;
			branch.setAttribute('aria-label', `Copy branch ${id}`);
			panel.append(repository, reference, branch);
			return { panel, controls: [repository, reference, branch] };
		};
		const integratedAction = (id: string): IActionListItem<ITestActionItem> => {
			let panelControls: readonly HTMLElement[] = [];
			return {
				...action(id),
				toolbarActions: [toAction({ id: `copy-${id}`, label: `Copy ${id}`, run: () => { } })],
				hover: {
					content: () => {
						const result = createPanel(id);
						panelControls = result.controls;
						return result.panel;
					},
					expandable: true,
					showIndicator: false,
					tabThroughPanel: true,
					getTabbableElements: () => panelControls,
					contentOwnsPadding: true,
				},
			};
		};
		const widget = createActionListWidget(disposables, {
			items: [integratedAction('one'), integratedAction('two')],
			listOptions: { showFilter: false, reserveSubmenuSpace: false },
		});
		const press = (key: string, shiftKey = false) =>
			document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
		const focusState = () => {
			const active = document.activeElement;
			return {
				location: active === widget.domNode.querySelector('.monaco-list')
					? 'list'
					: active?.closest('.action-list-submenu-panel')
						? 'panel'
						: active?.closest('.action-list-item-toolbar')
							? 'toolbar'
							: 'other',
				label: active?.getAttribute('aria-label') ?? active?.textContent,
			};
		};
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		widget.focus();
		const initial = {
			focus: focusState(),
			panelRole: panel.getAttribute('role'),
			panelLabel: panel.getAttribute('aria-label'),
			contentOwnsPadding: panel.querySelector('.action-list-submenu-hover-header')?.classList.contains('content-owns-padding'),
		};
		press('Tab');
		const copy = focusState();
		press('Tab');
		const repository = focusState();
		press('Tab');
		const reference = focusState();
		press('Tab');
		const branch = focusState();
		const bubbledPanelActivationKeys: string[] = [];
		widget.domNode.addEventListener('keydown', event => {
			if (event.key === 'Enter' || event.key === ' ') {
				bubbledPanelActivationKeys.push(event.key);
			}
		});
		const enterDefaultPreserved = press('Enter');
		const spaceDefaultPreserved = press(' ');
		press('Tab', true);
		const backToReference = focusState();
		press('Tab', true);
		const backToRepository = focusState();
		press('Tab', true);
		const backToCopy = focusState();
		press('Tab', true);
		const backToList = focusState();
		press('Tab');
		press('Tab');
		press('ArrowDown');
		const nextItem = {
			focus: focusState(),
			item: widget.getFocusedElement()?.item?.id,
			panelLabel: panel.getAttribute('aria-label'),
		};

		assert.deepStrictEqual({
			initial,
			copy,
			repository,
			reference,
			branch,
			panelActivation: { bubbledPanelActivationKeys, enterDefaultPreserved, spaceDefaultPreserved },
			backToReference,
			backToRepository,
			backToCopy,
			backToList,
			nextItem,
		}, {
			initial: {
				focus: { location: 'list', label: 'Action Widget' },
				panelRole: 'dialog',
				panelLabel: 'one',
				contentOwnsPadding: true,
			},
			copy: { location: 'toolbar', label: 'Copy one' },
			repository: { location: 'panel', label: 'repo-one' },
			reference: { location: 'panel', label: '#one' },
			branch: { location: 'panel', label: 'Copy branch one' },
			panelActivation: { bubbledPanelActivationKeys: [], enterDefaultPreserved: true, spaceDefaultPreserved: true },
			backToReference: { location: 'panel', label: '#one' },
			backToRepository: { location: 'panel', label: 'repo-one' },
			backToCopy: { location: 'toolbar', label: 'Copy one' },
			backToList: { location: 'list', label: 'Action Widget' },
			nextItem: {
				focus: { location: 'list', label: 'Action Widget' },
				item: 'two',
				panelLabel: 'two',
			},
		});
	});

	test('Shift+Tab traverses the panel and toolbar controls in reverse order', () => {
		const createPanel = () => {
			const panel = document.createElement('div');
			const control = document.createElement('a');
			control.href = 'https://example.com';
			control.textContent = 'link';
			panel.append(control);
			return { panel, controls: [control] };
		};
		let panelControls: readonly HTMLElement[] = [];
		const item: IActionListItem<ITestActionItem> = {
			...action('one'),
			toolbarActions: [toAction({ id: 'copy', label: 'Copy', run: () => { } })],
			onRemove: () => { },
			hover: {
				content: () => {
					const result = createPanel();
					panelControls = result.controls;
					return result.panel;
				},
				expandable: true,
				showIndicator: false,
				tabThroughPanel: true,
				getTabbableElements: () => panelControls,
				contentOwnsPadding: true,
			},
		};
		const widget = createActionListWidget(disposables, {
			items: [item],
			listOptions: { showFilter: false, reserveSubmenuSpace: false },
		});
		const press = (key: string, shiftKey = false) =>
			document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
		const focusedToolbarLabel = () => document.activeElement?.closest('.action-list-item-toolbar') ? document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent : undefined;

		widget.focus();
		press('Tab'); // list -> Copy
		press('Tab'); // Copy -> Remove
		press('Tab'); // Remove -> panel link
		press('Tab', true); // panel link -> Shift+Tab back into the toolbar
		const firstReverseTarget = focusedToolbarLabel();
		press('Tab', true); // Remove -> Copy

		assert.deepStrictEqual({ firstReverseTarget, secondReverseTarget: focusedToolbarLabel() }, {
			firstReverseTarget: 'Remove',
			secondReverseTarget: 'Copy',
		});
	});

	test('rebuilding the items in place re-measures only when the row count changed', () => {
		const widget = createActionListWidget(disposables, { items: [action('one'), action('two')] });
		const layouts: string[] = [];
		disposables.add(widget.onDidRequestLayout(() => { layouts.push(getVisibleRowText(widget).join(',')); }));

		widget.updateItems([action('one'), action('two-renamed')]);
		const afterSameCount = layouts.length;
		widget.updateItems([action('one'), action('two-renamed'), action('three')]);

		assert.deepStrictEqual(
			{ afterSameCount, afterGrowing: layouts, rows: getVisibleRowText(widget) },
			{ afterSameCount: 0, afterGrowing: ['one,two-renamed,three'], rows: ['one', 'two-renamed', 'three'] },
		);
	});

	test('rebuilding the items in place leaves focus alone when the list does not have it', () => {
		const widget = createActionListWidget(disposables, { items: [action('one'), action('two')] });
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		disposables.add({ dispose: () => outside.remove() });
		outside.focus();

		widget.updateItems([action('one'), action('two'), action('three')]);

		assert.deepStrictEqual(
			{ focusStayedOutside: document.activeElement === outside, rows: getVisibleRowText(widget) },
			{ focusStayedOutside: true, rows: ['one', 'two', 'three'] },
		);
	});

	test('removing the focused row toolbar restores focus inside the remaining list', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				{ ...action('one'), toolbarActions: [toAction({ id: 'remove', label: 'Remove', run: () => { } })] },
				action('two'),
				action('three'),
			],
			listOptions: { showFilter: false },
		});
		widget.focus();
		widget.domNode.querySelector<HTMLElement>('.action-list-item-toolbar .action-label')!.focus();
		widget.updateItems([action('two'), action('three')]);

		assert.deepStrictEqual({
			focusInside: widget.domNode.contains(document.activeElement),
			focusedItem: widget.getFocusedElement()?.item?.id,
			rows: getVisibleRowText(widget),
		}, { focusInside: true, focusedItem: 'two', rows: ['two', 'three'] });
	});

	test('refreshing the initial selection stays quiet until hover or keyboard navigation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const items = [
			{ ...action('selected'), item: { id: 'selected', checked: true }, hover: { content: 'Selected details' } },
			{ ...action('other'), hover: { content: 'Other details' } },
		];
		const widget = createActionListWidget(disposables, {
			items,
			listOptions: { showFilter: false },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const state = () => ({
			focused: widget.getFocusedElement()?.item?.id,
			display: panel.style.display,
			text: panel.textContent,
			listFocused: widget.domNode.querySelector('.monaco-list') === document.activeElement,
		});
		widget.focus();
		const initial = state();
		widget.updateItems(items.map(item => ({ ...item })));
		await timeout(1000);
		const refreshed = state();
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!;
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		await timeout(1000);
		const hovered = state();
		widget.focusNext();
		const navigated = state();

		assert.deepStrictEqual({ initial, refreshed, hovered, navigated }, {
			initial: { focused: 'selected', display: 'none', text: '', listFocused: true },
			refreshed: { focused: 'selected', display: 'none', text: '', listFocused: true },
			hovered: { focused: 'selected', display: '', text: 'Selected details', listFocused: true },
			navigated: { focused: 'other', display: '', text: 'Other details', listFocused: true },
		});
	}));

	for (const persistentHover of [false, true]) {
		test(`refreshing an open hover preserves its latest content: persistent=${persistentHover}`, () => {
			const widget = createActionListWidget(disposables, {
				items: [{ ...action('selected'), item: { id: 'selected', checked: true }, hover: { content: 'Original details' } }],
				listOptions: { showFilter: false, persistentHover },
			});
			widget.focus();
			widget.showHoverForCheckedItem();
			widget.updateItems([{ ...action('selected'), item: { id: 'selected', checked: true }, hover: { content: 'Updated details' } }]);
			const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

			assert.deepStrictEqual({ focused: widget.getFocusedElement()?.item?.id, display: panel.style.display, text: panel.textContent }, {
				focused: 'selected', display: '', text: 'Updated details',
			});
		});
	}

	test('an explicit focus target after refreshing can still open a hover', () => {
		const items = [
			{ ...action('selected'), item: { id: 'selected', checked: true }, hover: { content: 'Selected details' } },
			{ ...action('other'), hover: { content: 'Other details' } },
		];
		const widget = createActionListWidget(disposables, {
			items,
			listOptions: { showFilter: false },
		});
		widget.focus();
		widget.updateItems(items, 'other');
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		assert.deepStrictEqual({ focused: widget.getFocusedElement()?.item?.id, display: panel.style.display, text: panel.textContent }, {
			focused: 'other', display: '', text: 'Other details',
		});
	});

	test('shows a row hover panel once the hover delay elapses', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		await timeout(1000);

		assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: '', text: 'Auto routes based on your task' });
	}));

	test('persistent previews follow each row immediately without selecting or taking pointer focus', () => {
		const { widget, panel, selected, hover, isCenteredOnRow } = createPersistentPreview();
		const outside = document.createElement('button');
		document.body.appendChild(outside);
		disposables.add({ dispose: () => outside.remove() });
		outside.focus();

		hover(0);
		const first = panel.textContent;
		const firstCentered = isCenteredOnRow(0);
		hover(1);
		const second = panel.textContent;
		const secondCentered = isCenteredOnRow(1);
		const pointerFocusPreserved = document.activeElement === outside;
		widget.focus();
		widget.focusNext();

		assert.deepStrictEqual({
			first,
			second,
			keyboard: panel.textContent,
			pointerFocusPreserved,
			selected,
			centeredOnRows: [firstCentered, secondCentered, isCenteredOnRow(2)],
		}, {
			first: 'Details for first',
			second: 'Details for second',
			keyboard: 'Details for third',
			pointerFocusPreserved: true,
			selected: [],
			centeredOnRows: [true, true, true],
		});
	});

	test('persistent previews start with the focused item when the tab has no checked item', () => {
		const { widget, panel, selected } = createPersistentPreview();
		widget.focus();
		widget.showHoverForCheckedItem();

		assert.deepStrictEqual({
			content: panel.textContent,
			selected,
			focused: widget.getFocusedElement()?.item?.id,
		}, { content: 'Details for first', selected: [], focused: 'first' });
	});

	test('persistent previews remain visible over chrome, plain rows, and pointer gaps', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { widget, panel, contents, hover } = createPersistentPreview();
		hover(0);
		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		panel.dispatchEvent(new MouseEvent('mouseenter'));
		panel.dispatchEvent(new MouseEvent('mouseleave'));
		widget.headerContainer!.dispatchEvent(new MouseEvent('mouseenter'));
		hover(3);
		await timeout(1000);

		assert.deepStrictEqual({
			display: panel.style.display,
			content: panel.textContent,
			sameContent: panel.firstElementChild === contents[0],
		}, { display: '', content: 'Details for first', sameContent: true });
	}));

	test('persistent previews close when their source items are replaced', () => {
		const { widget, panel, hover } = createPersistentPreview();
		hover(0);
		widget.updateItems([action('replacement')]);
		assert.deepStrictEqual({ display: panel.style.display, content: panel.textContent }, { display: 'none', content: '' });
	});

	test('persistent previews retain their last row position during virtualization', () => {
		const { widget, panel, contents, hover } = createPersistentPreview();
		hover(2);
		const top = panel.getBoundingClientRect().top;
		widget.layout(24, 240);

		assert.deepStrictEqual({
			display: panel.style.display,
			sameContent: panel.firstElementChild === contents[2],
			positionRetained: Math.abs(panel.getBoundingClientRect().top - top) < 1,
		}, { display: '', sameContent: true, positionRetained: true });
	});

	test('persistent previews keep their side and width across differently sized content', () => {
		const { popup, panel, contents, hover, isCenteredOnRow } = createPersistentPreview();
		popup.style.left = `${mainWindow.innerWidth - 480}px`;
		contents[0].style.width = '260px';
		contents[1].style.width = '120px';
		hover(0);
		const first = panel.getBoundingClientRect();
		const firstCentered = isCenteredOnRow(0);
		hover(1);
		const second = panel.getBoundingClientRect();
		const parent = popup.getBoundingClientRect();

		assert.deepStrictEqual({
			firstOnLeft: Math.abs(first.right - parent.left) < 1,
			secondOnLeft: Math.abs(second.right - parent.left) < 1,
			centeredOnRows: [firstCentered, isCenteredOnRow(1)],
			widthUnchanged: first.width === second.width,
		}, { firstOnLeft: true, secondOnLeft: true, centeredOnRows: [true, true], widthUnchanged: true });
	});

	for (const side of ['left', 'right'] as const) {
		test(`pointer travel into the ${side} preview does not switch to a crossed row`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { panel, hover } = createPersistentPreview(side);
			const origin = hover(0);
			hover(1, origin.x + (side === 'right' ? 60 : -60));
			const duringTravel = panel.textContent;
			await timeout(100);
			panel.dispatchEvent(new MouseEvent('mouseenter'));
			await timeout(300);
			const afterEntering = panel.textContent;
			panel.dispatchEvent(new MouseEvent('mouseleave'));
			hover(1);

			assert.deepStrictEqual({ duringTravel, afterEntering, afterReturning: panel.textContent }, {
				duringTravel: 'Details for first',
				afterEntering: 'Details for first',
				afterReturning: 'Details for second',
			});
		}));
	}

	test('submenu pointer intent does not apply persistent preview sizing', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { panel, popup, hover } = createPersistentPreview('right', true);
		const origin = hover(0);
		const initialWidth = panel.getBoundingClientRect().width;
		hover(1, origin.x + 60);
		await timeout(100);
		panel.dispatchEvent(new MouseEvent('mouseenter'));
		await timeout(300);

		assert.deepStrictEqual({
			content: panel.textContent,
			matchesParentWidth: initialWidth === popup.getBoundingClientRect().width,
		}, {
			content: 'Details for first',
			matchesParentWidth: false,
		});
	}));

	test('pointer travel grace is bounded across multiple crossed rows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { panel, hover } = createPersistentPreview();
		const origin = hover(0);
		hover(1, origin.x + 60);
		await timeout(150);
		hover(2, origin.x + 80);
		const beforeExpiry = panel.textContent;
		await timeout(60);

		assert.deepStrictEqual({ beforeExpiry, afterExpiry: panel.textContent }, {
			beforeExpiry: 'Details for first',
			afterExpiry: 'Details for third',
		});
	}));

	test('keyboard navigation supersedes a pending pointer preview', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { widget, panel, hover } = createPersistentPreview();
		const origin = hover(0);
		hover(1, origin.x + 60);
		widget.focus();
		widget.focusNext();
		const immediate = panel.textContent;
		await timeout(300);

		assert.deepStrictEqual({ immediate, afterDelay: panel.textContent }, {
			immediate: 'Details for third',
			afterDelay: 'Details for third',
		});
	}));

	test('disposing a persistent preview cancels pending pointer travel', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { widget, panel, hover } = createPersistentPreview();
		const origin = hover(0);
		hover(1, origin.x + 60);
		widget.dispose();
		await timeout(300);

		assert.strictEqual(panel.textContent, 'Details for first');
	}));

	test('opens a submenu on hover after the delay without moving DOM focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('permissions'),
				label: 'Permissions',
				submenuActions: [toAction({ id: 'manual', label: 'Manual', run: () => { } })],
			}, action('mode')],
			listOptions: { showFilter: false },
		});
		const popup = document.createElement('div');
		popup.className = 'action-widget';
		popup.style.cssText = 'position: fixed; top: 100px; left: 40px; width: 200px; padding: 8px;';
		document.body.appendChild(popup);
		disposables.add({ dispose: () => popup.remove() });
		popup.appendChild(widget.domNode);
		widget.layout(200, 180);
		widget.focus();
		widget.focusNext();
		const focusedElement = document.activeElement;
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!;

		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		await timeout(300);
		const displayBeforeDelay = panel.style.display;
		await timeout(300);

		assert.deepStrictEqual({
			displayBeforeDelay,
			display: panel.style.display,
			label: panel.querySelector('.title')?.textContent,
			expanded: row.getAttribute('aria-expanded'),
			focusUnchanged: document.activeElement === focusedElement,
			highlightedRows: Array.from(widget.domNode.querySelectorAll('.monaco-list-row.focused .title'), title => title.textContent),
		}, {
			displayBeforeDelay: 'none',
			display: '',
			label: 'Manual',
			expanded: 'true',
			focusUnchanged: true,
			highlightedRows: ['Permissions'],
		});
	}));

	test('cancels a submenu hover when the pointer leaves before the delay', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{
				...action('permissions'),
				label: 'Permissions',
				submenuActions: [toAction({ id: 'manual', label: 'Manual', run: () => { } })],
			}],
			listOptions: { showFilter: false },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
		const row = widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!;
		row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
		row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(1000);

		assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: 'none', text: '' });
	}));

	test('does not open a row hover panel once the pointer has left the list', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		// The banner is a sibling of the list, so reaching it drags the pointer across a row.
		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		await timeout(1000);

		assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: 'none', text: '' });
	}));

	test('dismisses an open row hover panel when the pointer reaches the header banner', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const widget = createActionListWidget(disposables, {
			items: [{ ...action('auto'), hover: { content: 'Auto routes based on your task' } }, action('other')],
			listOptions: { headerText: 'Cache hint' },
		});
		const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;

		// Dwelling on the row long enough for the panel to open, then continuing to the banner.
		widget.domNode.querySelector<HTMLElement>('.monaco-list-row')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
		await timeout(600);
		const openedWhileOnRow = panel.textContent;

		widget.domNode.dispatchEvent(new MouseEvent('mouseleave'));
		widget.headerContainer!.dispatchEvent(new MouseEvent('mouseenter'));

		assert.deepStrictEqual(
			{ openedWhileOnRow, display: panel.style.display, text: panel.textContent },
			{ openedWhileOnRow: 'Auto routes based on your task', display: 'none', text: '' },
		);
	}));

	test('header renders a "Learn more" link to the given uri', () => {
		const widget = createActionListWidget(disposables, {
			listOptions: { headerText: 'Cache hint', headerLink: { label: 'Learn more', uri: URI.parse('https://aka.ms/test') } },
		});

		const link = widget.headerContainer?.querySelector<HTMLAnchorElement>('a.monaco-link');
		assert.ok(link, 'a "Learn more" link should render in the header');
		assert.deepStrictEqual(
			{ text: link!.textContent, href: link!.getAttribute('href') },
			{ text: 'Learn more', href: 'https://aka.ms/test' },
		);
	});

	test('focuses the configured initial item when opened', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('first'), action('active'), action('last')],
			listOptions: { initialFocusItemId: 'active' },
		});

		widget.focus();

		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'active');
	});

	test('skips a disabled configured and checked item when choosing initial focus', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('first'),
				{ ...action('disabled'), item: { id: 'disabled', checked: true }, disabled: true },
				action('last'),
			],
			listOptions: { initialFocusItemId: 'disabled' },
		});

		widget.focus();

		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'first');
	});

	test('opening the checked hover reveals a model in a collapsed section', () => {
		const widget = createActionListWidget(disposables, {
			items: [
				action('pinned'),
				{
					...action('active'),
					item: { id: 'active', checked: true },
					section: 'other',
					hover: { content: 'Active model details' },
				},
			],
			listOptions: { showFilter: false, collapsedByDefault: new Set(['other']) },
		});
		widget.focus();
		widget.showHoverForCheckedItem();

		assert.deepStrictEqual({
			focused: widget.getFocusedElement()?.item?.id,
			details: widget.domNode.querySelector('.action-list-submenu-panel')?.textContent,
		}, { focused: 'active', details: 'Active model details' });
	});

	for (const activeIndex of [2, 8]) {
		test(`width measurement keeps the hover anchored to visible item ${activeIndex}`, async () => {
			const content = document.createElement('div');
			content.textContent = 'Model details';
			content.style.cssText = 'width: 120px; height: 80px;';
			const widget = createActionListWidget(disposables, {
				items: [
					...Array.from({ length: 10 }, (_, index) => index === activeIndex
						? { ...action('active'), item: { id: 'active', checked: true }, hover: { content, alignToParent: true } }
						: action(`visible-${index}`)),
					...Array.from({ length: 20 }, (_, index) => ({ ...action(`hidden-${index}`), section: 'other' })),
				],
				listOptions: { showFilter: false, collapsedByDefault: new Set(['other']) },
			});
			const popup = document.createElement('div');
			popup.className = 'action-widget';
			popup.style.cssText = 'position: fixed; top: 160px; left: 40px; width: 260px; padding: 8px;';
			document.body.appendChild(popup);
			disposables.add({ dispose: () => popup.remove() });
			popup.appendChild(widget.domNode);
			widget.layout(120, 240);
			widget.focus();
			widget.showHoverForCheckedItem();

			const measure = () => {
				const row = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')).find(row => row.textContent === 'active');
				const rowBounds = row?.getBoundingClientRect();
				const listBounds = widget.domNode.getBoundingClientRect();
				const panelBounds = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!.getBoundingClientRect();
				return {
					rowVisible: !!rowBounds && rowBounds.top >= listBounds.top && rowBounds.bottom <= listBounds.bottom,
					centeredOnRow: !!rowBounds && Math.abs(rowBounds.top + rowBounds.height / 2 - panelBounds.top - panelBounds.height / 2) < 1,
					expanded: row?.getAttribute('aria-expanded'),
					focused: widget.getFocusedElement()?.item?.id,
				};
			};
			await settleLayout();
			const before = measure();
			widget.computeMaxWidth(240);
			widget.layout(120, 240);
			content.style.height = '100px';
			await settleLayout();

			const expected = { rowVisible: true, centeredOnRow: true, expanded: 'true', focused: 'active' };
			assert.deepStrictEqual({ before, after: measure() }, { before: expected, after: expected });
		});
	}

	for (const side of ['left', 'right']) {
		for (const zoom of [1, 1.25]) {
			for (const nearBottom of [false, true]) {
				test(`resizable hover keeps its ${side} anchor at ${zoom} zoom${nearBottom ? ' near the viewport bottom' : ''}`, async () => {
					const content = document.createElement('div');
					content.style.cssText = 'width: 120px; height: 80px;';
					const button = document.createElement('button');
					button.textContent = 'Pricing details';
					content.appendChild(button);
					const widget = createActionListWidget(disposables, {
						items: [{
							...action('active'),
							item: { id: 'active', checked: true },
							hover: { content, alignToParent: true, preserveVerticalPosition: true },
						}],
						listOptions: { showFilter: false, persistentHover: true },
					});
					const popup = document.createElement('div');
					const left = side === 'left' ? (mainWindow.innerWidth - 320) / zoom : 40;
					const top = nearBottom ? (mainWindow.innerHeight - 100) / zoom : 100;
					popup.className = 'action-widget';
					popup.style.cssText = `position: fixed; top: ${top}px; left: ${left}px; width: 260px; padding: 8px; zoom: ${zoom};`;
					document.body.appendChild(popup);
					disposables.add({ dispose: () => popup.remove() });
					popup.appendChild(widget.domNode);
					widget.layout(24, 240);
					widget.focus();
					widget.showHoverForCheckedItem();
					await settleLayout();

					const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
					const viewport = panel.querySelector<HTMLElement>('.action-list-submenu-viewport')!;
					button.focus();
					const before = panel.getBoundingClientRect();
					const beforeButton = button.getBoundingClientRect();
					content.style.height = nearBottom ? `${mainWindow.innerHeight}px` : '160px';
					await settleLayout();
					const expanded = panel.getBoundingClientRect();
					const expandedButton = button.getBoundingClientRect();
					const scrolls = viewport.scrollHeight > viewport.clientHeight;
					const pageDown = dispatchKeyDown(button, { key: 'PageDown', keyCode: 34 });
					const scrolled = viewport.scrollTop > 0;
					dispatchKeyDown(button, { key: 'PageUp', keyCode: 33 });
					const pageUpRestored = viewport.scrollTop === 0;
					dispatchKeyDown(button, { key: 'PageDown', keyCode: 34 });
					content.style.height = '80px';
					await settleLayout();
					const collapsed = panel.getBoundingClientRect();
					const sameOrigin = (rect: DOMRect) => Math.abs(rect.x - before.x) < 1 && Math.abs(rect.y - before.y) < 1 && Math.abs(rect.width - before.width) < 1;

					assert.deepStrictEqual({
						expandedAnchored: sameOrigin(expanded),
						controlsAnchored: Math.abs(expandedButton.x - beforeButton.x) < 1 && Math.abs(expandedButton.y - beforeButton.y) < 1,
						grewDownward: expanded.height > before.height,
						withinViewport: expanded.bottom <= mainWindow.innerHeight - 7,
						scrolls,
						scrolled,
						pageDownHandled: pageDown.defaultPrevented,
						pageUpRestored,
						collapsedAnchored: sameOrigin(collapsed),
						collapsedHeight: Math.abs(collapsed.height - before.height) < 1,
						scrollReset: viewport.scrollTop === 0,
						focusRetained: document.activeElement === button,
					}, {
						expandedAnchored: true,
						controlsAnchored: true,
						grewDownward: true,
						withinViewport: true,
						scrolls: nearBottom,
						scrolled: nearBottom,
						pageDownHandled: true,
						pageUpRestored: true,
						collapsedAnchored: true,
						collapsedHeight: true,
						scrollReset: true,
						focusRetained: true,
					});
				});
			}
		}
	}

	for (const zoom of [1, 1.25]) {
		test(`refresh retains the live hover and its origin while the focused row moves at ${zoom} zoom`, async () => {
			const content = document.createElement('div');
			content.style.cssText = 'width: 120px; height: 80px;';
			const button = document.createElement('button');
			button.textContent = 'Pin Model';
			content.appendChild(button);
			const item = (id: string, label = id): IActionListItem<ITestActionItem> => ({
				...action(id), label, item: { id, checked: true },
				hover: { content: () => content, expandable: true, alignToParent: true, preserveVerticalPosition: true },
			});
			const others = ['one', 'two', 'three', 'four'].map(action);
			const widget = createActionListWidget(disposables, {
				items: [...others, item('model')],
				listOptions: { showFilter: false, persistentHover: true },
			});
			const popup = document.createElement('div');
			popup.className = 'action-widget';
			popup.style.cssText = `position: fixed; top: 80px; left: 40px; zoom: ${zoom};`;
			document.body.appendChild(popup);
			disposables.add({ dispose: () => popup.remove() });
			popup.appendChild(widget.domNode);
			widget.layout(160, 200);
			widget.showHoverForCheckedItem();
			await settleLayout();
			button.focus();
			const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
			const before = panel.getBoundingClientRect();
			widget.updateItems([item('model'), ...others], 'model', { preserveHover: true, animateItemMove: true });
			const moved = Array.from(widget.domNode.querySelectorAll<HTMLElement>('.monaco-list-row')).find(row => row.textContent === 'model')!;
			const animations = moved.getAnimations();
			const moveTiming = animations.map(animation => {
				const timing = animation.effect?.getTiming();
				return { duration: timing?.duration, easing: timing?.easing };
			});
			animations.forEach(animation => animation.finish());
			await settleLayout();
			const afterMove = panel.getBoundingClientRect();
			widget.updateItems([...others, item('model-fast', 'Fast Model')], 'model-fast', { preserveHover: true });
			await settleLayout();
			const afterVariant = panel.getBoundingClientRect();
			const stationary = (rect: DOMRect) => Math.abs(rect.x - before.x) < 1 && Math.abs(rect.y - before.y) < 1 && Math.abs(rect.width - before.width) < 1;

			assert.deepStrictEqual({
				samePanel: panel === widget.domNode.querySelector('.action-list-submenu-panel'),
				sameContent: panel.contains(content),
				focusPreserved: document.activeElement === button,
				stationaryAfterMove: stationary(afterMove),
				stationaryAfterVariant: stationary(afterVariant),
				focusedModel: widget.getFocusedElement()?.item?.id,
				panelLabel: panel.getAttribute('aria-label'),
				moveTiming,
			}, {
				samePanel: true,
				sameContent: true,
				focusPreserved: true,
				stationaryAfterMove: true,
				stationaryAfterVariant: true,
				focusedModel: 'model-fast',
				panelLabel: 'Fast Model',
				moveTiming: mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches ? [] : [{ duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }],
			});
		});
	}

	test('preserving a hover reveals its row in a collapsed section without reporting a user toggle', () => {
		const content = document.createElement('button');
		content.textContent = 'Unpin Model';
		const item: IActionListItem<ITestActionItem> = {
			...action('model'), item: { id: 'model', checked: true }, hover: { content, expandable: true, preserveVerticalPosition: true },
		};
		const toggles: boolean[] = [];
		const widget = createActionListWidget(disposables, {
			items: [item],
			listOptions: { showFilter: false, persistentHover: true, collapsedByDefault: new Set(['other']), onDidToggleSection: (_, collapsed) => toggles.push(collapsed) },
		});
		widget.showHoverForCheckedItem();
		content.focus();
		widget.updateItems([action('first'), { ...item, section: 'other' }], 'model', { preserveHover: true });

		assert.deepStrictEqual({
			rows: getVisibleRowText(widget),
			toggles,
			focused: widget.getFocusedElement()?.item?.id,
			buttonFocused: document.activeElement === content,
			panelVisible: widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')?.style.display !== 'none',
		}, { rows: ['first', 'model'], toggles: [], focused: 'model', buttonFocused: true, panelVisible: true });
	});

	test('a removed hover is not retained by an item with the same id but different content', () => {
		const content = document.createElement('button');
		content.textContent = 'Configure';
		const item: IActionListItem<ITestActionItem> = {
			...action('model'), item: { id: 'model', checked: true }, hover: { content, expandable: true },
		};
		const widget = createActionListWidget(disposables, { items: [item], listOptions: { showFilter: false, persistentHover: true } });
		widget.showHoverForCheckedItem();
		content.focus();
		widget.updateItems([{ ...item, hover: undefined }], undefined, { preserveHover: true });
		assert.deepStrictEqual({
			contentConnected: content.isConnected,
			panelHidden: widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')?.style.display === 'none',
		}, { contentConnected: false, panelHidden: true });
	});

	for (const side of ['left', 'right']) {
		for (const zoom of [1, 1.25]) {
			test(`hover aligns with the outer ${side} border at ${zoom} zoom`, () => {
				const content = document.createElement('div');
				content.textContent = 'Model details';
				content.style.cssText = 'width: 120px; height: 80px;';
				const widget = createActionListWidget(disposables, {
					items: [{ ...action('active'), item: { id: 'active', checked: true }, hover: { content, alignToParent: true } }],
					listOptions: { showFilter: false },
				});
				const popup = document.createElement('div');
				popup.className = 'action-widget';
				popup.style.cssText = `position: fixed; top: 120px; left: ${side === 'left' ? (mainWindow.innerWidth - 320) / zoom : 0}px; width: 240px; padding: 8px; zoom: ${zoom};`;
				document.body.appendChild(popup);
				disposables.add({ dispose: () => popup.remove() });
				popup.appendChild(widget.domNode);
				widget.focus();
				const focusedElement = document.activeElement;

				widget.showHoverForCheckedItem();

				const panel = widget.domNode.querySelector<HTMLElement>('.action-list-submenu-panel')!;
				const parentBounds = popup.getBoundingClientRect();
				const panelBounds = panel.getBoundingClientRect();
				const gap = side === 'left' ? parentBounds.left - panelBounds.right : panelBounds.left - parentBounds.right;
				assert.deepStrictEqual({
					shown: panel.style.display !== 'none',
					aligned: Math.abs(gap) < 1,
					focusPreserved: document.activeElement === focusedElement,
				}, { shown: true, aligned: true, focusPreserved: true });
			});
		}
	}

	test('consumes initial focus before later filtering and refocusing', () => {
		const widget = createActionListWidget(disposables, {
			items: [action('match-first'), action('match-initial'), action('other')],
			listOptions: { initialFocusItemId: 'match-initial' },
		});

		widget.focus();
		widget.focusPrevious();
		typeFilter(widget, 'match');
		widget.focus();

		assert.strictEqual(widget.getFocusedElement()?.item?.id, 'match-first');
	});

});
