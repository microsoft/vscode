/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../base/browser/dom.js';
import { unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { unthemedCountStyles } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { unthemedInboxStyles } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { unthemedKeybindingLabelOptions } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { unthemedListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { unthemedProgressBarOptions } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { mainWindow } from '../../../../base/browser/window.js';
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
import { TestClipboardService } from '../../../clipboard/test/common/testClipboardService.js';
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

suite('QuickInput keeps focus while its context menus are open', () => { // https://github.com/microsoft/vscode/issues/153267
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: HTMLElement;
	let editor: HTMLButtonElement;
	let outside: HTMLButtonElement;
	let instantiationService: TestInstantiationService;
	let contextMenuService: ContextMenuService;
	let ignoreFocusOut: boolean;
	let controller: QuickInputController;
	let input: HTMLInputElement;
	let clipboardService: TestClipboardService;

	// Harmless stand-ins for the workbench text input actions; they act on the input the menu was opened for
	const textInputActions: IAction[] = [
		toAction({
			id: 'harmlessPaste', label: 'Paste', run: async (target: HTMLInputElement) => {
				const text = await clipboardService.readText();
				if (!text) {
					return;
				}
				const start = target.selectionStart ?? 0;
				const end = target.selectionEnd ?? 0;
				target.value = `${target.value.substring(0, start)}${text}${target.value.substring(end)}`;
				target.selectionStart = target.selectionEnd = start + text.length;
			}
		}),
		toAction({ id: 'selectAll', label: 'Select All', run: (target: HTMLInputElement) => target.select() }),
	];

	/**
	 * Mirrors the workbench `TextInputActionsProvider`: a generic opener for the context
	 * menu of any input that hosts the menu as a popover at the input's parent.
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
				domForShadowRoot: target.parentElement ?? undefined,
				hostAsPopover: true,
			});
		}));
	}

	function setupController(): void {
		registerGenericTextInputContextMenu();
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
		clipboardService = new TestClipboardService();
		await clipboardService.writeText('T10-pasted');

		// Real context view, context menu service and handler
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

	function clickElement(element: HTMLElement): void {
		element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
	}

	/** The element that is in the top layer for the open context view, if it is shown as a popover. */
	function popoverElement(): Element | undefined {
		const view = instantiationService.get(IContextViewService).getContextViewElement();
		const root = view.getRootNode();
		const element = root instanceof ShadowRoot ? root.host : view;
		return element.matches(':popover-open') ? element : undefined;
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

	/** Whether the element is what the user would hit when clicking its center. */
	function isHittable(element: HTMLElement): boolean {
		if (!element.isConnected) {
			return false;
		}
		const rect = element.getBoundingClientRect();
		const x = rect.left + rect.width / 2;
		const y = rect.top + rect.height / 2;
		let hit = mainWindow.document.elementFromPoint(x, y);
		while (hit?.shadowRoot) {
			const inner = hit.shadowRoot.elementFromPoint(x, y);
			if (!inner || inner === hit) {
				break;
			}
			hit = inner;
		}
		const item = element.closest('.action-menu-item') ?? element;
		return !!hit && item.contains(hit);
	}

	/**
	 * Presses the pointer on the given element like a real click: pointer and mouse
	 * down and, for focusable targets, the resulting focus change.
	 */
	function pressPointer(target: HTMLElement): void {
		const rect = target.getBoundingClientRect();
		const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: rect.left + 2, clientY: rect.top + 2 };
		target.dispatchEvent(new PointerEvent('pointerdown', init));
		target.dispatchEvent(new MouseEvent('mousedown', init));
		if (target.tabIndex >= 0) {
			target.focus();
		} else {
			(mainWindow.document.activeElement as HTMLElement | null)?.blur();
		}
	}

	function state(picker: IQuickPick<IQuickPickItem>) {
		const activeElement = mainWindow.document.activeElement;
		const menu = openMenu();
		return {
			visible: controller.currentQuickInput === picker,
			focus: activeElement === input ? 'input' : activeElement === editor ? 'editor' : activeElement === outside ? 'outside' : widget().contains(activeElement) ? 'widget' : activeElement === mainWindow.document.body ? 'body' : 'other',
			menu: menu ? (widget().contains(menu.host) ? (popoverElement() === menu.host ? 'hosted' : 'in widget, not a popover') : 'outside widget') : 'none',
			value: input.value,
			selection: [input.selectionStart, input.selectionEnd],
		};
	}

	test('right-clicking the input opens a hosted popover menu and keeps the picker', async () => {
		setupController();
		const picker = showPicker();
		const event = rightClickInput();
		await settle();
		assert.deepStrictEqual({ defaultPrevented: event.defaultPrevented, focusInMenu: !!activeElementDeep()?.closest('.monaco-menu'), blocker: !!fixture.querySelector('.context-view-block'), ...state(picker) }, {
			defaultPrevented: true, focusInMenu: true, blocker: false, visible: true, focus: 'widget', menu: 'hosted', value: 'T10 harmless', selection: [4, 7]
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

	test('keys in the hosted menu do not reach the quick input or the window; the quick input keybinding context keeps its meaning', async () => {
		setupController();
		const picker = showPicker();
		const accepted: boolean[] = [];
		store.add(picker.onDidAccept(() => accepted.push(true)));
		const reached: string[] = [];
		const onWindowKey = (e: KeyboardEvent) => reached.push(`window ${e.type}:${e.key}`);
		const onWidgetKey = (e: KeyboardEvent) => reached.push(`widget ${e.type}:${e.key}`);
		mainWindow.addEventListener('keydown', onWindowKey);
		widget().addEventListener('keydown', onWidgetKey);
		store.add(toDisposable(() => { mainWindow.removeEventListener('keydown', onWindowKey); widget().removeEventListener('keydown', onWidgetKey); }));
		const contextKeyService = instantiationService.get(IContextKeyService);
		const inQuickInput = () => contextKeyService.getContextKeyValue<boolean>('inQuickInput');

		rightClickInput();
		await settle();
		const inMenu = inQuickInput();
		keydown(activeElementDeep()!, 'End', 35); // Select All
		keydown(activeElementDeep()!, 'Enter', 13);
		await settle();
		assert.deepStrictEqual({ inMenu, after: inQuickInput(), accepted, reached, ...state(picker) }, {
			inMenu: true, after: true, accepted: [], reached: [], visible: true, focus: 'input', menu: 'none', value: 'T10 harmless', selection: [0, 12]
		});
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
		keydown(activeElementDeep()!, 'End', 35); // Select All
		keydown(activeElementDeep()!, 'ArrowUp', 38); // Paste
		keydown(activeElementDeep()!, 'Enter', 13);
		await settle();
		const afterPaste = state(picker);
		picker.hide();
		assert.deepStrictEqual([afterPaste, state(picker).focus], [
			{ visible: true, focus: 'input', menu: 'none', value: 'T10 T10-pastedmless', selection: [14, 14] },
			'editor',
		]);
	});

	test('hiding a picker hosted in a shadow root returns focus to the editor in that shadow root', async () => {
		const shadowHost = document.createElement('div');
		mainWindow.document.body.appendChild(shadowHost);
		store.add(toDisposable(() => shadowHost.remove()));
		const shadowRoot = shadowHost.attachShadow({ mode: 'open' });
		shadowRoot.appendChild(fixture);
		setupController();
		const picker = showPicker();
		const shown = { documentActive: mainWindow.document.activeElement === shadowHost, shadowActive: shadowRoot.activeElement === input };

		picker.hide();

		assert.deepStrictEqual({ shown, hiddenFocus: shadowRoot.activeElement === editor }, {
			shown: { documentActive: true, shadowActive: true },
			hiddenFocus: true
		});
	});

	test('pasting when the clipboard cannot be read keeps the value and selection', async () => {
		setupController();
		await clipboardService.writeText(''); // what the browser clipboard service returns when reading fails
		const picker = showPicker();
		rightClickInput();
		await settle();
		keydown(activeElementDeep()!, 'End', 35);
		keydown(activeElementDeep()!, 'ArrowUp', 38);
		keydown(activeElementDeep()!, 'Enter', 13);
		await settle();
		assert.deepStrictEqual(state(picker), { visible: true, focus: 'input', menu: 'none', value: 'T10 harmless', selection: [4, 7] });
	});

	for (const location of [QuickInputButtonLocation.Title, QuickInputButtonLocation.Inline]) {
		test(`toolbar overflow menu (${QuickInputButtonLocation[location]}) is hosted; Escape and actions keep the picker`, async () => {
			setupController();
			const triggered: string[] = [];
			const button: IQuickInputButton = { iconClass: Codicon.gear.id, tooltip: 'T10 secondary', secondary: true, location };
			const picker = showPicker([button]);
			store.add(picker.onDidTriggerButton(b => triggered.push(b.tooltip!)));
			const more = widget().querySelector<HTMLElement>(location === QuickInputButtonLocation.Title ? '.quick-input-right-action-bar .codicon-toolbar-more' : '.quick-input-inline-action-bar .codicon-toolbar-more')!;

			clickElement(more);
			await settle();
			const opened = state(picker);
			const ownerIsDropdown = !!openMenu() && openMenu()!.host.parentElement === more.closest('.monaco-dropdown');
			keydown(activeElementDeep()!, 'Escape', 27);
			await settle();
			// The dropdown keeps focus where it was on pointer press, so Escape restores it to the input
			const escaped = state(picker);

			clickElement(more);
			await settle();
			keydown(activeElementDeep()!, 'ArrowDown', 40);
			keydown(activeElementDeep()!, 'Enter', 13);
			await settle();
			assert.deepStrictEqual([opened.visible, opened.menu, ownerIsDropdown, escaped.visible, escaped.menu, escaped.focus, state(picker).visible, triggered], [true, 'hosted', true, true, 'none', 'input', true, ['T10 secondary']]);
		});
	}

	test('input box buttons have no overflow menu; triggering a secondary one keeps the picker', async () => {
		setupController();
		const triggered: string[] = [];
		const picker = showPicker([{ iconClass: Codicon.gear.id, tooltip: 'T10 input secondary', secondary: true, location: QuickInputButtonLocation.Input }]);
		store.add(picker.onDidTriggerButton(b => triggered.push(b.tooltip!)));
		const more = widget().querySelector('.quick-input-box .codicon-toolbar-more');
		const button = widget().querySelector<HTMLElement>('.quick-input-box .monaco-action-bar .action-label')!;
		clickElement(button);
		await settle();
		assert.deepStrictEqual([!!more, triggered, state(picker).visible, state(picker).menu], [false, ['T10 input secondary'], true, 'none']);
	});

	test('arrow keys in a hosted toolbar menu do not move focus in the enclosing toolbar', async () => {
		setupController();
		const picker = showPicker([
			{ iconClass: Codicon.add.id, tooltip: 'T10 primary' },
			{ iconClass: Codicon.gear.id, tooltip: 'T10 secondary 1', secondary: true },
			{ iconClass: Codicon.gear.id, tooltip: 'T10 secondary 2', secondary: true },
		]);
		const more = widget().querySelector<HTMLElement>('.quick-input-right-action-bar .codicon-toolbar-more')!;
		clickElement(more);
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

	for (const target of ['focusable', 'non-focusable'] as const) {
		test(`pressing the pointer on a ${target} element outside closes the menu and the picker`, async () => {
			setupController();
			const plain = document.createElement('div');
			plain.textContent = 'plain';
			fixture.appendChild(plain);
			const picker = showPicker();
			rightClickInput();
			await settle();
			pressPointer(target === 'focusable' ? outside : plain);
			await settle();
			assert.deepStrictEqual([state(picker).visible, state(picker).menu, state(picker).focus], [false, 'none', target === 'focusable' ? 'outside' : 'body']);
		});

		test(`pressing the pointer on a ${target} element outside with ignoreFocusOut only closes the menu, without moving focus back`, async () => {
			setupController();
			ignoreFocusOut = true;
			const plain = document.createElement('div');
			plain.textContent = 'plain';
			fixture.appendChild(plain);
			const picker = showPicker();
			rightClickInput();
			await settle();
			pressPointer(target === 'focusable' ? outside : plain);
			await settle();
			assert.deepStrictEqual([state(picker).visible, state(picker).menu, state(picker).focus], [true, 'none', target === 'focusable' ? 'outside' : 'body']);
		});
	}

	test('pressing the pointer on the part of a hosted menu outside the picker keeps both; pressing the picker outside the menu closes only the menu', async () => {
		setupController();
		const picker = showPicker();
		rightClickInput();
		await settle();
		const { menu } = openMenu()!;
		const widgetRect = widget().getBoundingClientRect();
		const items = menu.querySelectorAll<HTMLElement>('.action-label');
		const lastItem = items[items.length - 1];
		const lastItemBeyondWidget = lastItem.getBoundingClientRect().bottom > widgetRect.bottom;
		const lastItemHittable = isHittable(lastItem);
		const init = (r: DOMRect) => ({ bubbles: true, cancelable: true, composed: true, button: 0, clientX: r.left + 5, clientY: r.top + r.height / 2 });
		lastItem.dispatchEvent(new PointerEvent('pointerdown', init(lastItem.getBoundingClientRect())));
		lastItem.dispatchEvent(new MouseEvent('mousedown', init(lastItem.getBoundingClientRect())));
		await settle();
		const afterMenuPress = { visible: state(picker).visible, menu: state(picker).menu };
		const title = widget();
		// On the picker, outside the menu: a real press then focuses the nearest focusable ancestor, the widget
		title.dispatchEvent(new PointerEvent('pointerdown', init(widgetRect)));
		title.dispatchEvent(new MouseEvent('mousedown', init(widgetRect)));
		title.focus();
		await settle();
		// A press outside the menu's owner (the input box) closes the menu like any menu, but keeps the picker
		assert.deepStrictEqual([lastItemBeyondWidget, lastItemHittable, afterMenuPress, state(picker).visible, state(picker).menu], [true, true, { visible: true, menu: 'hosted' }, true, 'none']);
	});

	test('a hosted submenu item outside both the picker and the root menu is hittable and runs, keeping the picker', async () => {
		setupController();
		const picker = showPicker();
		let ran = false;
		contextMenuService.showContextMenu({
			getAnchor: () => input,
			domForShadowRoot: input.parentElement!,
			hostAsPopover: true,
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
		const outsideRect = (r: DOMRect) => point.x < r.left || point.x > r.right || point.y < r.top || point.y > r.bottom;
		const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: point.x, clientY: point.y };
		const hittable = isHittable(item);
		item.dispatchEvent(new PointerEvent('pointerdown', init));
		item.dispatchEvent(new MouseEvent('mousedown', init));
		await settle();
		const afterMouseDown = { visible: state(picker).visible, menu: state(picker).menu };
		await timeout(350); // menu items only accept mouse up after a short delay
		item.dispatchEvent(new MouseEvent('mouseup', init));
		await settle();
		assert.deepStrictEqual([outsideRect(widgetRect), outsideRect(menuRect), hittable, afterMouseDown, ran, state(picker).visible], [true, true, true, { visible: true, menu: 'hosted' }, true, true]);
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
		await settle();
		results.push({ menu: openMenu() ? 'open' : 'none', popover: !!popoverElement(), focus: state(picker).focus });

		picker = showPicker([{ iconClass: Codicon.gear.id, tooltip: 'T10 secondary', secondary: true }]);
		const more = widget().querySelector<HTMLElement>('.quick-input-right-action-bar .codicon-toolbar-more')!;
		clickElement(more);
		await settle();
		const toolbarMenuOpened = !!openMenu();
		picker.hide();
		await settle();
		results.push({ menu: openMenu() ? 'open' : 'none', popover: !!popoverElement(), focus: state(picker).focus });

		picker = showPicker();
		rightClickInput();
		await settle();
		assert.deepStrictEqual([toolbarMenuOpened, results, state(picker).visible, state(picker).menu], [
			true,
			[{ menu: 'none', popover: false, focus: 'editor' }, { menu: 'none', popover: false, focus: 'editor' }],
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
		await settle();
		const menu = openMenu();
		assert.deepStrictEqual([menu?.menu.textContent?.includes('Unrelated'), menu ? widget().contains(menu.host) : undefined, !!popoverElement()], [true, false, false]);
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

	test('the quick input does not open a menu of its own; the generic opener hosts it at the input\'s parent', async () => {
		setupController();
		const picker = showPicker();
		const show = sinon.spy(contextMenuService, 'showContextMenu');
		store.add(toDisposable(() => show.restore()));
		rightClickInput();
		await settle();
		const calls = show.getCalls().map(call => ({ hostIsInputParent: call.args[0].domForShadowRoot === input.parentElement, hostAsPopover: call.args[0].hostAsPopover }));
		assert.deepStrictEqual([calls, state(picker).menu], [[{ hostIsInputParent: true, hostAsPopover: true }], 'hosted']);
	});

	test('the context menu of an ordinary input outside of the quick input is a popover at its parent, outside the picker', async () => {
		setupController();
		const picker = showPicker();
		picker.hide();
		const wrapper = document.createElement('div');
		const other = document.createElement('input');
		wrapper.appendChild(other);
		fixture.appendChild(wrapper);
		other.focus();
		other.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 5, clientY: 5 }));
		await settle();
		const menu = openMenu();
		const opened = { menu: !!menu, inWidget: !!menu && widget().contains(menu.host), ownerIsParent: menu?.host.parentElement === wrapper, popover: !!popoverElement() };
		keydown(activeElementDeep()!, 'Escape', 27);
		await settle();
		assert.deepStrictEqual([opened, mainWindow.document.activeElement === other, !!openMenu()], [{ menu: true, inWidget: false, ownerIsParent: true, popover: true }, true, false]);
	});

	test('item row overflow menus are hosted and every item is hittable and runs', async () => {
		setupController();
		editor.focus();
		const picker = store.add(controller.createQuickPick());
		const buttons: IQuickInputButton[] = [1, 2, 3, 4, 5, 6].map(i => ({ iconClass: Codicon.gear.id, tooltip: `T10 row secondary ${i}`, secondary: true }));
		picker.items = [{ label: 'item', buttons }];
		const triggered: string[] = [];
		store.add(picker.onDidTriggerItemButton(e => triggered.push(e.button.tooltip!)));
		picker.show();
		input = fixture.querySelector<HTMLInputElement>('.quick-input-widget input')!;
		await settle();
		const row = widget().querySelector<HTMLElement>('.quick-input-list .monaco-list-row')!;
		const results = [];
		for (let i = 0; i < buttons.length; i++) {
			const more = row.querySelector<HTMLElement>('.codicon-toolbar-more')!;
			clickElement(more);
			await settle();
			const menu = openMenu();
			const items = menu ? [...menu.menu.querySelectorAll<HTMLElement>('.action-label')] : [];
			const item = items[i];
			const hittable = !!item && isHittable(item);
			const hosted = !!menu && widget().contains(menu.host) && popoverElement() === menu.host;
			if (item) {
				const rect = item.getBoundingClientRect();
				const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: rect.left + 5, clientY: rect.top + rect.height / 2 };
				const hit = (item.getRootNode() as ShadowRoot).elementFromPoint(init.clientX, init.clientY) as HTMLElement;
				hit.dispatchEvent(new MouseEvent('mousedown', init));
				await timeout(350); // menu items only accept mouse up after a short delay
				hit.dispatchEvent(new MouseEvent('mouseup', init));
				await settle();
			}
			results.push({ hosted, hittable, visible: controller.currentQuickInput === picker });
		}
		assert.deepStrictEqual([results, triggered], [
			buttons.map(() => ({ hosted: true, hittable: true, visible: true })),
			buttons.map(b => b.tooltip),
		]);
	});

	test('a nested focus owner (icon picker) keeps focus while the menu of its search box is open; Escape restores the search box', async () => {
		setupController();
		editor.focus();
		const picker = store.add(controller.createQuickWidget());
		const grid = store.add(new IconSelectBox({ icons: [Codicon.add, Codicon.gear, Codicon.edit].map(icon => ThemeIcon.fromId(icon.id)), inputBoxStyles: unthemedInboxStyles }));
		picker.widget = grid.domNode;
		const gridFocus = store.add(dom.trackFocus(grid.domNode));
		let gridBlurs = 0;
		store.add(gridFocus.onDidBlur(() => gridBlurs++));
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
		const opened = { menu: !!menu, inGrid: !!menu && grid.domNode.contains(menu.host), popover: !!menu && popoverElement() === menu.host, focusInMenu: !!activeElementDeep()?.closest('.monaco-menu'), gridBlurs, visible: controller.currentQuickInput === picker };

		keydown(activeElementDeep()!, 'Escape', 27);
		await settle();
		const escaped = { menu: !!openMenu(), focusInSearch: mainWindow.document.activeElement === search, selection: [search.selectionStart, search.selectionEnd], visible: controller.currentQuickInput === picker };

		search.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: rect.left + 5, clientY: rect.top + 5 }));
		await settle();
		keydown(activeElementDeep()!, 'End', 35);
		keydown(activeElementDeep()!, 'Enter', 13);
		await settle();
		const selectedAll = { focusInSearch: mainWindow.document.activeElement === search, selection: [search.selectionStart, search.selectionEnd], gridBlurs, visible: controller.currentQuickInput === picker };

		assert.deepStrictEqual({ opened, escaped, selectedAll }, {
			opened: { menu: true, inGrid: true, popover: true, focusInMenu: true, gridBlurs: 0, visible: true },
			escaped: { menu: false, focusInSearch: true, selection: [1, 3], visible: true },
			selectedAll: { focusInSearch: true, selection: [0, 4], gridBlurs: 0, visible: true },
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
			const computed = mainWindow.getComputedStyle(widget());
			const transformedOrClipped = { overflow: computed.overflow, transformed: computed.transform !== 'none' || computed.willChange.includes('transform') };
			rightClickInput();
			await settle();
			const { menu } = openMenu()!;
			const items = menu.querySelectorAll<HTMLElement>('.action-item');
			const last = items[items.length - 1];
			const lastRect = last.getBoundingClientRect();
			const hit = (menu.getRootNode() as ShadowRoot).elementFromPoint(lastRect.left + lastRect.width / 2, lastRect.top + lastRect.height / 2);
			const hitIsLastItem = !!hit && last.contains(hit);
			const widgetRect = widget().getBoundingClientRect();
			const extendsBeyondWidget = menu.getBoundingClientRect().bottom > widgetRect.bottom;
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
				overflow: transformedOrClipped.overflow,
				transformed: transformedOrClipped.transformed,
				extendsBeyondWidget, hitIsLastItem,
				...result,
			}, {
				animated: true,
				overflow: 'hidden',
				transformed: true,
				extendsBeyondWidget: true, hitIsLastItem: true,
				visible: true, focus: 'input', menu: 'none', value: 'T10 harmless', selection: [0, 12],
			});
		});
	}
});
