/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../base/browser/dom.js';
import { unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { unthemedCountStyles } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { unthemedInboxStyles } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { unthemedKeybindingLabelOptions } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { unthemedListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { unthemedProgressBarOptions } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { IAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { timeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-browser/globals.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
import { IMenuService } from '../../../actions/common/actions.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ContextMenuService } from '../../../contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewService } from '../../../contextview/browser/contextView.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { NoMatchingKb } from '../../../keybinding/common/keybindingResolver.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IListService, ListService } from '../../../list/browser/listService.js';
import { INotificationService } from '../../../notification/common/notification.js';
import { TestNotificationService } from '../../../notification/test/common/testNotificationService.js';
import { InMemoryStorageService, IStorageService } from '../../../storage/common/storage.js';
import { ITelemetryService } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { TestThemeService } from '../../../theme/test/common/testThemeService.js';
import { QuickInputController } from '../../browser/quickInputController.js';
import { IQuickInputButton, IQuickPick, IQuickPickItem, QuickInputButtonLocation } from '../../common/quickInput.js';

/**
 * Real blur/focus events only fire while the test document has focus. The main
 * process resolves the request before the renderer observes it, so wait for it.
 */
async function setWebContentsFocus(focused: boolean): Promise<void> {
	const changed = mainWindow.document.hasFocus() === focused
		? undefined
		: new Promise<void>(resolve => mainWindow.addEventListener(focused ? dom.EventType.FOCUS : dom.EventType.BLUR, () => resolve(), { once: true }));
	await ipcRenderer.invoke('vscode:test-set-web-contents-focus', focused);
	await changed;
}

function createQuickInputController(instantiationService: TestInstantiationService, container: HTMLElement, ignoreFocusOut: () => boolean, textInputContextMenuActions: (() => readonly IAction[]) | undefined): QuickInputController {
	return instantiationService.createInstance(
		QuickInputController,
		{
			container,
			idPrefix: 'testQuickInput',
			ignoreFocusOut,
			textInputContextMenuActions,
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
	);
}

suite('QuickInput hosts its context menus', () => { // https://github.com/microsoft/vscode/issues/153267
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: HTMLElement;
	let editor: HTMLButtonElement;
	let outside: HTMLButtonElement;
	let instantiationService: TestInstantiationService;
	let contextMenuService: ContextMenuService;
	let ignoreFocusOut: boolean;
	let controller: QuickInputController;
	let input: HTMLInputElement;

	const textInputActions: IAction[] = [
		toAction({
			id: 'harmlessPaste', label: 'Paste', run: () => {
				const start = input.selectionStart ?? 0;
				const end = input.selectionEnd ?? 0;
				input.value = `${input.value.substring(0, start)}T10-pasted${input.value.substring(end)}`;
				input.selectionStart = input.selectionEnd = start + 'T10-pasted'.length;
			}
		}),
		toAction({ id: 'selectAll', label: 'Select All', run: () => input.select() }),
	];

	function setupController(withTextInputActions = true): void {
		controller = store.add(createQuickInputController(instantiationService, fixture, () => ignoreFocusOut, withTextInputActions ? () => textInputActions : undefined));
		controller.layout({ height: 400, width: 800 }, 0);
	}

	setup(async () => {
		await setWebContentsFocus(true);
		fixture = document.createElement('div');
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		editor = document.createElement('button');
		editor.textContent = 'editor';
		outside = document.createElement('button');
		outside.textContent = 'outside';
		fixture.append(editor, outside);

		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IListService, store.add(new ListService()));
		instantiationService.stub(ILayoutService, {
			_serviceBrand: undefined,
			mainContainer: fixture,
			activeContainer: fixture,
			onDidLayoutContainer: Event.None,
			getContainer: () => fixture,
		});
		instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; },
			lookupKeybinding() { return undefined; },
		});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(INotificationService, new TestNotificationService());
		instantiationService.stub(IMenuService, {});
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));

		// Real context menu service and handler (blocks mouse like in the workbench)
		contextMenuService = store.add(instantiationService.createInstance(ContextMenuService));
		instantiationService.stub(IContextMenuService, contextMenuService);

		ignoreFocusOut = false;
	});

	teardown(async () => {
		await setWebContentsFocus(true);
	});

	function showPicker(buttons: IQuickInputButton[] = []): IQuickPick<IQuickPickItem> {
		editor.focus();
		const picker = store.add(controller.createQuickPick());
		picker.items = [{ label: 'item' }];
		picker.buttons = buttons;
		picker.show();
		input = fixture.querySelector<HTMLInputElement>('.quick-input-widget input')!;
		picker.value = 'T10 harmless';
		input.setSelectionRange(4, 7);
		return picker;
	}

	function widget(): HTMLElement {
		return fixture.querySelector<HTMLElement>('.quick-input-widget')!;
	}

	function rightClickInput(): MouseEvent {
		const rect = input.getBoundingClientRect();
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 10, clientY: rect.top + 5 });
		input.dispatchEvent(event);
		return event;
	}

	/** The open context view's menu, looking into shadow roots. */
	function openMenu(): { menu: HTMLElement; host: Element } | undefined {
		const view = instantiationService.get(IContextViewService).getContextViewElement();
		const menu = view.querySelector<HTMLElement>('.monaco-menu');
		if (!view.isConnected || !menu || view.style.display === 'none') {
			return undefined;
		}
		const root = view.getRootNode();
		return { menu, host: root instanceof ShadowRoot ? root.host : view };
	}

	function keydown(target: Element, key: string, keyCode: number, init: KeyboardEventInit = {}): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, bubbles: true, cancelable: true, ...init }));
	}

	function activeElementDeep(): Element | null {
		let element = mainWindow.document.activeElement;
		while (element?.shadowRoot?.activeElement) {
			element = element.shadowRoot.activeElement;
		}
		return element;
	}

	async function settle(): Promise<void> {
		await timeout(0);
		await timeout(0);
	}

	function state(picker: IQuickPick<IQuickPickItem>) {
		const activeElement = mainWindow.document.activeElement;
		const menu = openMenu();
		return {
			visible: controller.currentQuickInput === picker,
			focus: activeElement === input ? 'input' : activeElement === editor ? 'editor' : activeElement === outside ? 'outside' : widget().contains(activeElement) ? 'widget' : 'other',
			menu: menu ? (widget().contains(menu.host) ? 'hosted' : 'outside widget') : 'none',
			value: input.value,
			selection: [input.selectionStart, input.selectionEnd],
		};
	}

	test('right-clicking the input opens a hosted menu and keeps the picker', async () => {
		setupController();
		const picker = showPicker();
		const event = rightClickInput();
		await settle();
		assert.deepStrictEqual({ defaultPrevented: event.defaultPrevented, focusInMenu: !!activeElementDeep()?.closest('.monaco-menu'), ...state(picker) }, {
			defaultPrevented: true, focusInMenu: true, visible: true, focus: 'widget', menu: 'hosted', value: 'T10 harmless', selection: [4, 7]
		});
	});

	test('escaping the hosted menu keeps the picker, focus and selection', async () => {
		setupController();
		const picker = showPicker();
		rightClickInput();
		await settle();
		keydown(activeElementDeep()!, 'Escape', 27);
		await settle();
		assert.deepStrictEqual(state(picker), { visible: true, focus: 'input', menu: 'none', value: 'T10 harmless', selection: [4, 7] });
	});

	test('running a hosted menu action keeps the picker; hiding returns focus to the editor', async () => {
		setupController();
		const picker = showPicker();
		rightClickInput();
		await settle();
		keydown(activeElementDeep()!, 'ArrowDown', 40);
		keydown(activeElementDeep()!, 'Enter', 13);
		await settle();
		const afterPaste = state(picker);
		picker.hide();
		assert.deepStrictEqual([afterPaste, state(picker).focus], [
			{ visible: true, focus: 'input', menu: 'none', value: 'T10 T10-pastedmless', selection: [14, 14] },
			'editor',
		]);
	});

	for (const location of [QuickInputButtonLocation.Title, QuickInputButtonLocation.Inline]) {
		test(`toolbar overflow menu (${QuickInputButtonLocation[location]}) is hosted; Escape and actions keep the picker`, async () => {
			setupController();
			const triggered: string[] = [];
			const button: IQuickInputButton = { iconClass: Codicon.gear.id, tooltip: 'T10 secondary', secondary: true, location };
			const picker = showPicker([button]);
			store.add(picker.onDidTriggerButton(b => triggered.push(b.tooltip!)));
			const more = widget().querySelector<HTMLElement>(location === QuickInputButtonLocation.Title ? '.quick-input-right-action-bar .codicon-toolbar-more' : '.quick-input-inline-action-bar .codicon-toolbar-more')!;

			more.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
			await settle();
			const opened = state(picker);
			keydown(activeElementDeep()!, 'Escape', 27);
			await settle();
			const escaped = state(picker);

			more.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
			await settle();
			keydown(activeElementDeep()!, 'ArrowDown', 40);
			keydown(activeElementDeep()!, 'Enter', 13);
			await settle();
			assert.deepStrictEqual([opened.visible, opened.menu, escaped.visible, escaped.menu, state(picker).visible, triggered], [true, 'hosted', true, 'none', true, ['T10 secondary']]);
		});
	}

	/**
	 * Dispatches only a mouse down on the hosted menu's mouse blocker at the given
	 * point, like a real click outside of the menu. No focus change is simulated:
	 * the context menu itself restores focus when it closes.
	 */
	function mouseDownOnBlocker(x: number, y: number): void {
		const block = openMenu()!.menu.closest('.context-view')!.querySelector<HTMLElement>('.context-view-block')!;
		block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0, clientX: x, clientY: y }));
	}

	function pointBelowWidget(): { x: number; y: number } {
		const rect = widget().getBoundingClientRect();
		return { x: rect.left + 5, y: rect.bottom + 100 };
	}

	test('clicking outside an open hosted menu hides menu and picker and returns focus', async () => {
		setupController();
		const picker = showPicker();
		rightClickInput();
		await settle();
		const { x, y } = pointBelowWidget();
		mouseDownOnBlocker(x, y);
		await settle();
		assert.deepStrictEqual([state(picker).visible, state(picker).menu, state(picker).focus], [false, 'none', 'editor']);
	});

	test('clicking outside an open hosted menu with ignoreFocusOut only closes the menu', async () => {
		setupController();
		ignoreFocusOut = true;
		const picker = showPicker();
		rightClickInput();
		await settle();
		const { x, y } = pointBelowWidget();
		mouseDownOnBlocker(x, y);
		(activeElementDeep() as HTMLElement).blur(); // the menu closes on blur
		await settle();
		assert.deepStrictEqual([state(picker).visible, state(picker).menu], [true, 'none']);
	});

	test('mouse down on the part of a hosted menu outside the picker or within the picker keeps the picker', async () => {
		setupController();
		const picker = showPicker();
		rightClickInput();
		await settle();
		const { menu } = openMenu()!;
		const menuRect = menu.getBoundingClientRect();
		const widgetRect = widget().getBoundingClientRect();
		const menuBeyondWidget = menuRect.bottom > widgetRect.bottom;
		const items = menu.querySelectorAll<HTMLElement>('.action-label');
		const lastItem = items[items.length - 1];
		const lastItemRect = lastItem.getBoundingClientRect();
		lastItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0, clientX: lastItemRect.left + 5, clientY: lastItemRect.top + lastItemRect.height / 2 }));
		await settle();
		const afterMenuMouseDown = { visible: state(picker).visible, menu: state(picker).menu };
		mouseDownOnBlocker(widgetRect.left + 3, widgetRect.top + 3); // over the picker, outside the menu
		await settle();
		assert.deepStrictEqual([menuBeyondWidget, afterMenuMouseDown, state(picker).visible], [true, { visible: true, menu: 'hosted' }, true]);
	});

	test('focus moving outside without a context menu hides the picker', async () => {
		setupController();
		const picker = showPicker();
		outside.focus();
		await settle();
		assert.deepStrictEqual([state(picker).visible, state(picker).focus], [false, 'outside']);
	});

	test('hiding the picker closes its hosted input and toolbar menus; the next picker opens cleanly', async () => {
		setupController();
		const results = [];

		let picker = showPicker();
		rightClickInput();
		await settle();
		picker.hide();
		results.push({ menu: openMenu() ? 'open' : 'none', inertContainsMenu: !!fixture.querySelector('.quick-input-widget[inert] .shadow-root-host') });

		picker = showPicker([{ iconClass: Codicon.gear.id, tooltip: 'T10 secondary', secondary: true }]);
		const more = widget().querySelector<HTMLElement>('.quick-input-right-action-bar .codicon-toolbar-more')!;
		more.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		const toolbarMenuOpened = !!openMenu();
		picker.hide();
		results.push({ menu: openMenu() ? 'open' : 'none', inertContainsMenu: false });

		picker = showPicker();
		rightClickInput();
		await settle();
		assert.deepStrictEqual([toolbarMenuOpened, results, state(picker).visible, state(picker).menu], [
			true,
			[{ menu: 'none', inertContainsMenu: false }, { menu: 'none', inertContainsMenu: false }],
			true,
			'hosted'
		]);
	});

	test('hiding the picker does not close an unrelated context menu', async () => {
		setupController();
		ignoreFocusOut = true;
		const picker = showPicker();
		rightClickInput();
		await settle();
		contextMenuService.showContextMenu({ getAnchor: () => outside, getActions: () => [toAction({ id: 'unrelated', label: 'Unrelated', run: () => { } })] });
		await settle();
		picker.hide();
		const menu = openMenu();
		assert.deepStrictEqual([menu?.menu.textContent?.includes('Unrelated'), menu ? widget().contains(menu.host) : undefined], [true, false]);
		instantiationService.get(IContextViewService).hideContextView();
	});

	test('ignoreFocusOut keeps the picker when focus moves outside', async () => {
		setupController();
		ignoreFocusOut = true;
		const picker = showPicker();
		outside.focus();
		await settle();
		assert.deepStrictEqual(state(picker).visible, true);
	});

	test('without text input actions (e.g. standalone) no menu is shown and the event is not prevented', async () => {
		setupController(false);
		const picker = showPicker();
		const event = rightClickInput();
		await settle();
		assert.deepStrictEqual([event.defaultPrevented, state(picker).menu, state(picker).visible], [false, 'none', true]);
	});

	for (const immediate of [true, false]) {
		test(`hosted menu is unclipped and usable with motion (${immediate ? 'during' : 'after'} the open animation)`, async () => {
			// Production quick input motion (quickInput.css) plus the Modern UI clipping of the widget
			// (workbench/contrib/modernUI/browser/media/roundedCorners.css)
			fixture.classList.add('modern-ui', 'monaco-enable-motion');
			const style = document.createElement('style');
			style.textContent = '.modern-ui .quick-input-widget { overflow: hidden; }';
			fixture.appendChild(style);
			setupController();
			const picker = showPicker();
			const animations = widget().getAnimations().map(a => (a as CSSAnimation).animationName);
			if (!immediate) {
				await Promise.all(widget().getAnimations().map(a => a.finished));
			}
			rightClickInput();
			await settle();
			const { menu } = openMenu()!;
			const computed = mainWindow.getComputedStyle(widget());
			const rect1 = menu.getBoundingClientRect().toJSON();
			await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
			await new Promise(resolve => mainWindow.requestAnimationFrame(resolve));
			const rect2 = menu.getBoundingClientRect().toJSON();
			const items = menu.querySelectorAll<HTMLElement>('.action-item');
			const last = items[items.length - 1];
			const lastRect = last.getBoundingClientRect();
			const hit = (menu.getRootNode() as ShadowRoot).elementFromPoint(lastRect.left + lastRect.width / 2, lastRect.top + lastRect.height / 2);
			const hitIsLastItem = !!hit && last.contains(hit);
			const widgetRect = widget().getBoundingClientRect();
			const extendsBeyondWidget = rect2.bottom > widgetRect.bottom;
			await timeout(300); // menu items only accept mouse up after a short delay
			hit?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			hit?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
			await settle();
			const result = state(picker);

			// let the close animation complete before the test tears down
			picker.hide();
			await Promise.all(widget().getAnimations().map(a => a.finished.catch(() => undefined)));
			await settle();

			assert.deepStrictEqual({
				animated: animations.includes('quick-input-widget-open'),
				transform: computed.transform, willChange: computed.willChange,
				stable: JSON.stringify(rect1) === JSON.stringify(rect2),
				extendsBeyondWidget, hitIsLastItem,
				...result,
			}, {
				animated: true,
				transform: 'none', willChange: 'auto',
				stable: true,
				extendsBeyondWidget: true, hitIsLastItem: true,
				visible: true, focus: 'input', menu: 'none', value: 'T10 harmless', selection: [0, 12],
			});
		});
	}
});
