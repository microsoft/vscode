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
import { markAsContextMenuHost } from '../../../../base/browser/contextmenu.js';
import { StandardMouseEvent } from '../../../../base/browser/mouseEvent.js';
import { IconSelectBox } from '../../../../base/browser/ui/icons/iconSelectBox.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IAction, SubmenuAction, toAction } from '../../../../base/common/actions.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { KeyCodeChord } from '../../../../base/common/keybindings.js';
import { OS } from '../../../../base/common/platform.js';
import { USLayoutResolvedKeybinding } from '../../../keybinding/common/usLayoutResolvedKeybinding.js';
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
import { IQuickInputButton, IQuickPick, IQuickPickItem, QuickInputButtonLocation, QuickPickFocus } from '../../common/quickInput.js';

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

function createQuickInputController(instantiationService: TestInstantiationService, container: HTMLElement, ignoreFocusOut: () => boolean): QuickInputController {
	return instantiationService.createInstance(
		QuickInputController,
		{
			container,
			idPrefix: 'testQuickInput',
			ignoreFocusOut,
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

	// Harmless stand-ins for the workbench text input actions; they act on the input the menu was opened for
	const textInputActions: IAction[] = [
		toAction({
			id: 'harmlessPaste', label: 'Paste', run: (target: HTMLInputElement) => {
				const start = target.selectionStart ?? 0;
				const end = target.selectionEnd ?? 0;
				target.value = `${target.value.substring(0, start)}T10-pasted${target.value.substring(end)}`;
				target.selectionStart = target.selectionEnd = start + 'T10-pasted'.length;
			}
		}),
		toAction({ id: 'selectAll', label: 'Select All', run: (target: HTMLInputElement) => target.select() }),
	];

	/**
	 * Mirrors the workbench `TextInputActionsProvider`: a generic opener for the context
	 * menu of any input that knows nothing about the quick input (no `domForShadowRoot`).
	 */
	function registerGenericTextInputContextMenu(): void {
		store.add(dom.addDisposableListener(fixture, dom.EventType.CONTEXT_MENU, e => {
			const target = e.target;
			if (e.defaultPrevented || !(target instanceof HTMLInputElement)) {
				return;
			}
			dom.EventHelper.stop(e, true);
			const anchor = new StandardMouseEvent(mainWindow, e);
			contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => textInputActions,
				getActionsContext: () => target,
			});
		}));
	}

	function setupController(withGenericTextInputContextMenu = true): void {
		if (withGenericTextInputContextMenu) {
			registerGenericTextInputContextMenu();
		}
		controller = store.add(createQuickInputController(instantiationService, fixture, () => ignoreFocusOut));
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
		target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, bubbles: true, cancelable: true, composed: true, ...init }));
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

	test('quick input keybinding context is off while the hosted menu has focus', async () => {
		setupController();
		showPicker();
		const contextKeyService = instantiationService.get(IContextKeyService);
		const inQuickInput = () => contextKeyService.getContextKeyValue<boolean>('inQuickInput');
		const before = inQuickInput();
		rightClickInput();
		await settle();
		const inMenu = inQuickInput();
		keydown(activeElementDeep()!, 'Escape', 27);
		await settle();
		assert.deepStrictEqual([before, inMenu, inQuickInput()], [true, false, true]);
	});

	for (const navigateFromMenu of [false, true]) {
		test(`quick navigation does not accept on modifier release from the hosted menu (navigation enabled ${navigateFromMenu ? 'during' : 'before'} menu focus)`, async () => {
			setupController();
			const picker = showPicker();
			const accepted: boolean[] = [];
			store.add(picker.onDidAccept(() => accepted.push(true)));
			const windowKeys: string[] = [];
			const onWindowKey = (e: KeyboardEvent) => windowKeys.push(`${e.type}:${e.key}`);
			mainWindow.addEventListener('keydown', onWindowKey);
			mainWindow.addEventListener('keyup', onWindowKey);
			store.add(toDisposable(() => { mainWindow.removeEventListener('keydown', onWindowKey); mainWindow.removeEventListener('keyup', onWindowKey); }));
			const quickNavigate = { keybindings: [new USLayoutResolvedKeybinding([new KeyCodeChord(true, false, false, false, KeyCode.KeyP)], OS)] };

			if (!navigateFromMenu) {
				picker.quickNavigate = quickNavigate;
			}
			rightClickInput();
			await settle();
			const menuItem = activeElementDeep()!;
			keydown(menuItem, 'p', 80, { ctrlKey: true }); // e.g. the quick open navigation keybinding
			if (navigateFromMenu) {
				picker.quickNavigate = quickNavigate;
			}
			menuItem.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', code: 'ControlLeft', keyCode: 17, bubbles: true, cancelable: true, composed: true }));
			await settle();
			assert.deepStrictEqual({ accepted, windowKeys, visible: state(picker).visible, menu: state(picker).menu }, { accepted: [], windowKeys: [], visible: true, menu: 'hosted' });
		});
	}

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

	test('arrow keys in a hosted toolbar menu do not move focus in the enclosing toolbar', async () => {
		setupController();
		const picker = showPicker([
			{ iconClass: Codicon.add.id, tooltip: 'T10 primary' },
			{ iconClass: Codicon.gear.id, tooltip: 'T10 secondary 1', secondary: true },
			{ iconClass: Codicon.gear.id, tooltip: 'T10 secondary 2', secondary: true },
		]);
		const more = widget().querySelector<HTMLElement>('.quick-input-right-action-bar .codicon-toolbar-more')!;
		more.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		const results = [];
		for (const [key, keyCode] of [['ArrowLeft', 37], ['ArrowRight', 39], ['Home', 36], ['End', 35]] as const) {
			keydown(activeElementDeep()!, key, keyCode);
			await settle();
			results.push({ key, menu: state(picker).menu, focusInMenu: !!activeElementDeep()?.closest('.monaco-menu') });
		}
		assert.deepStrictEqual(results, [
			{ key: 'ArrowLeft', menu: 'hosted', focusInMenu: true },
			{ key: 'ArrowRight', menu: 'hosted', focusInMenu: true },
			{ key: 'Home', menu: 'hosted', focusInMenu: true },
			{ key: 'End', menu: 'hosted', focusInMenu: true },
		]);
	});

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

	test('mouse down on a hosted submenu item outside both the picker and the root menu keeps the picker', async () => {
		setupController();
		const picker = showPicker();
		let ran = false;
		contextMenuService.showContextMenu({
			getAnchor: () => input,
			getActions: () => [new SubmenuAction('t10.submenu', 'T10 Submenu', [toAction({ id: 't10.subitem', label: 'T10 Subitem', run: () => { ran = true; } })])],
		});
		await settle();
		const { menu } = openMenu()!;
		menu.querySelector<HTMLElement>('.monaco-submenu-item')!.focus();
		keydown(activeElementDeep()!, 'ArrowRight', 39);
		activeElementDeep()!.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true, composed: true }));
		await settle();
		const submenu = menu.querySelector<HTMLElement>('.monaco-submenu')!;
		const widgetRect = widget().getBoundingClientRect();
		const submenuRect = submenu.getBoundingClientRect();
		submenu.style.top = `${parseFloat(submenu.style.top || '0') + widgetRect.bottom + 50 - submenuRect.top}px`; // overflow below the picker
		const item = submenu.querySelector<HTMLElement>('.action-label')!;
		const itemRect = item.getBoundingClientRect();
		const point = { x: itemRect.left + 5, y: itemRect.top + itemRect.height / 2 };
		const menuRect = menu.getBoundingClientRect();
		const outside = (r: DOMRect) => point.x < r.left || point.x > r.right || point.y < r.top || point.y > r.bottom;
		item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0, clientX: point.x, clientY: point.y }));
		await settle();
		const afterMouseDown = { visible: state(picker).visible, menu: state(picker).menu };
		await timeout(350); // menu items only accept mouse up after a short delay
		item.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, button: 0, clientX: point.x, clientY: point.y }));
		await settle();
		assert.deepStrictEqual([outside(widgetRect), outside(menuRect), afterMouseDown, ran, state(picker).visible], [true, true, { visible: true, menu: 'hosted' }, true, true]);
	});

	test('the window losing focus hides the picker, with or without an open hosted menu', async () => {
		setupController();
		let picker = showPicker();
		await setWebContentsFocus(false);
		await settle();
		const withoutMenu = state(picker).visible;
		await setWebContentsFocus(true);

		picker = showPicker();
		rightClickInput();
		await settle();
		await setWebContentsFocus(false);
		await settle();
		assert.deepStrictEqual([withoutMenu, state(picker).visible, state(picker).menu], [false, false, 'none']);
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

	test('the quick input itself does not handle context menu events of its input', async () => {
		setupController(false);
		const picker = showPicker();
		const event = rightClickInput();
		await settle();
		assert.deepStrictEqual([event.defaultPrevented, state(picker).menu, state(picker).visible], [false, 'none', true]);
	});

	test('the context menu of an ordinary input outside of the quick input is not hosted', async () => {
		setupController();
		const picker = showPicker();
		picker.hide();
		const other = document.createElement('input');
		fixture.appendChild(other);
		other.focus();
		other.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 }));
		await settle();
		const menu = openMenu();
		const hostedInWidget = !!menu && widget().contains(menu.host);
		instantiationService.get(IContextViewService).hideContextView();
		assert.deepStrictEqual([!!menu, hostedInWidget], [true, false]);
	});

	test('item row overflow menu is hosted in the quick input, not in the row; Escape keeps the picker', async () => {
		setupController();
		editor.focus();
		const picker = store.add(controller.createQuickPick());
		picker.items = [{ label: 'item', buttons: [{ iconClass: Codicon.gear.id, tooltip: 'T10 row secondary', secondary: true }] }];
		picker.show();
		input = fixture.querySelector<HTMLInputElement>('.quick-input-widget input')!;
		await settle();
		const row = widget().querySelector<HTMLElement>('.quick-input-list .monaco-list-row')!;
		const more = row.querySelector<HTMLElement>('.codicon-toolbar-more')!;
		more.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		more.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
		await settle();
		const menu = openMenu();
		const hosted = { inWidget: !!menu && widget().contains(menu.host), inRow: !!menu && row.contains(menu.host), visible: state(picker).visible };
		keydown(activeElementDeep()!, 'Escape', 27);
		await settle();
		assert.deepStrictEqual([hosted, state(picker).visible, state(picker).menu], [{ inWidget: true, inRow: false, visible: true }, true, 'none']);
	});

	test('a nested focus owner (icon picker) hosts the menu of its search box; it stays usable and Escape restores the search box', async () => {
		setupController();
		editor.focus();
		// Mirrors workbench IconPicker: hidden quick input box, an icon select box as custom widget that is
		// declared a context menu host and that moves focus to the first item when it loses focus.
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		const grid = store.add(new IconSelectBox({ icons: [Codicon.add, Codicon.gear, Codicon.edit].map(icon => ThemeIcon.fromId(icon.id)), inputBoxStyles: unthemedInboxStyles }));
		picker.hideInput = true;
		picker.widget = grid.domNode;
		picker.items = [{ type: 'separator' }, { label: 'Reset to default' }];
		store.add(markAsContextMenuHost(grid.domNode));
		const gridFocus = store.add(dom.trackFocus(grid.domNode));
		store.add(gridFocus.onDidFocus(() => picker.activeItems = []));
		store.add(gridFocus.onDidBlur(() => picker.focus(QuickPickFocus.First)));
		picker.show();
		grid.layout(new dom.Dimension(400, 200));
		grid.focus();
		const search = grid.domNode.querySelector<HTMLInputElement>('input')!;
		search.value = 'gear';
		search.setSelectionRange(1, 3);

		const rect = search.getBoundingClientRect();
		search.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 5, clientY: rect.top + 5 }));
		await settle();
		await timeout(20); // let deferred focus tracker callbacks run
		const menu = openMenu();
		const opened = { menu: !!menu, inGrid: !!menu && grid.domNode.contains(menu.host), focusInMenu: !!activeElementDeep()?.closest('.monaco-menu'), visible: controller.currentQuickInput === picker };

		keydown(activeElementDeep()!, 'Escape', 27);
		await settle();
		const escaped = { menu: !!openMenu(), focusInSearch: mainWindow.document.activeElement === search, selection: [search.selectionStart, search.selectionEnd], visible: controller.currentQuickInput === picker };

		search.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 5, clientY: rect.top + 5 }));
		await settle();
		keydown(activeElementDeep()!, 'End', 35);
		keydown(activeElementDeep()!, 'Enter', 13);
		await settle();
		const selectedAll = { focusInSearch: mainWindow.document.activeElement === search, selection: [search.selectionStart, search.selectionEnd], visible: controller.currentQuickInput === picker };

		assert.deepStrictEqual({ opened, escaped, selectedAll }, {
			opened: { menu: true, inGrid: true, focusInMenu: true, visible: true },
			escaped: { menu: false, focusInSearch: true, selection: [1, 3], visible: true },
			selectedAll: { focusInSearch: true, selection: [0, 4], visible: true },
		});
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
