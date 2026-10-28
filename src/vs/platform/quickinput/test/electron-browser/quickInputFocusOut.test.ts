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
import { IQuickPick, IQuickPickItem } from '../../common/quickInput.js';

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

suite('QuickInput focus out with context menus', () => { // https://github.com/microsoft/vscode/issues/153267
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: HTMLElement;
	let editor: HTMLButtonElement;
	let outside: HTMLButtonElement;
	let instantiationService: TestInstantiationService;
	let contextMenuService: ContextMenuService;
	let ignoreFocusOut: boolean;
	let controller: QuickInputController;

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
		controller = store.add(createQuickInputController(instantiationService, fixture, () => ignoreFocusOut));
		controller.layout({ height: 200, width: 400 }, 0);
	});

	teardown(async () => {
		await setWebContentsFocus(true);
	});

	function showPicker(): { picker: IQuickPick<IQuickPickItem>; input: HTMLInputElement } {
		editor.focus();
		const picker = store.add(controller.createQuickPick());
		picker.items = [{ label: 'item' }];
		picker.show();
		const input = fixture.querySelector<HTMLInputElement>('.quick-input-widget input')!;
		picker.value = 'T10 harmless';
		input.setSelectionRange(4, 7);
		return { picker, input };
	}

	function openContextMenu(input: HTMLInputElement, actions: IAction[] = [
		toAction({
			id: 'harmlessPaste', label: 'Paste', run: () => {
				const start = input.selectionStart ?? 0;
				const end = input.selectionEnd ?? 0;
				input.value = `${input.value.substring(0, start)}T10-pasted${input.value.substring(end)}`;
				input.selectionStart = input.selectionEnd = start + 'T10-pasted'.length;
			}
		})
	]): void {
		contextMenuService.showContextMenu({
			getAnchor: () => input,
			getActions: () => actions,
			getActionsContext: () => input,
		});
	}

	function menuElement(): HTMLElement | null {
		return mainWindow.document.querySelector<HTMLElement>('.context-view .monaco-menu');
	}

	function keydown(target: Element, key: string, keyCode: number): void {
		target.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, keyCode, bubbles: true, cancelable: true }));
	}

	async function settle(): Promise<void> {
		// focus tracker blur and the quick input reconciliation both run on a timeout
		await timeout(0);
		await timeout(0);
		await timeout(0);
	}

	function state(picker: IQuickPick<IQuickPickItem>, input: HTMLInputElement) {
		const activeElement = mainWindow.document.activeElement;
		return {
			visible: controller.currentQuickInput === picker,
			focus: activeElement === input ? 'input' : activeElement === editor ? 'editor' : activeElement === outside ? 'outside' : activeElement?.closest('.context-view') ? 'menu' : 'other',
			menu: !!menuElement(),
			value: input.value,
			selection: [input.selectionStart, input.selectionEnd],
		};
	}

	test('focus moving outside without a context menu hides the picker', async () => {
		const { picker, input } = showPicker();
		outside.focus();
		await settle();
		assert.deepStrictEqual(state(picker, input), { visible: false, focus: 'outside', menu: false, value: 'T10 harmless', selection: [4, 7] });
	});

	test('escaping the context menu after focus out keeps the picker, focus and selection', async () => {
		const { picker, input } = showPicker();
		openContextMenu(input);
		await settle();
		const opened = state(picker, input);
		keydown(mainWindow.document.activeElement!, 'Escape', 27);
		await settle();
		assert.deepStrictEqual([opened, state(picker, input)], [
			{ visible: true, focus: 'menu', menu: true, value: 'T10 harmless', selection: [4, 7] },
			{ visible: true, focus: 'input', menu: false, value: 'T10 harmless', selection: [4, 7] },
		]);
	});

	test('closing the context menu before focus out is processed keeps the picker and the original focus to return to', async () => {
		const { picker, input } = showPicker();
		openContextMenu(input);
		keydown(mainWindow.document.activeElement!, 'Escape', 27); // synchronously, before the blur timeout
		await settle();
		const afterMenu = state(picker, input);
		picker.hide();
		assert.deepStrictEqual([afterMenu, state(picker, input).focus], [
			{ visible: true, focus: 'input', menu: false, value: 'T10 harmless', selection: [4, 7] },
			'editor',
		]);
	});

	test('running a context menu action keeps the picker and returns focus to the input', async () => {
		const { picker, input } = showPicker();
		openContextMenu(input);
		await settle();
		keydown(mainWindow.document.activeElement!, 'ArrowDown', 40);
		keydown(mainWindow.document.activeElement!, 'Enter', 13);
		await settle();
		const afterPaste = state(picker, input);
		picker.hide();
		assert.deepStrictEqual([afterPaste, state(picker, input).focus], [
			{ visible: true, focus: 'input', menu: false, value: 'T10 T10-pastedmless', selection: [14, 14] },
			'editor',
		]);
	});

	test('clicking outside an open context menu hides menu and picker', async () => {
		const { picker, input } = showPicker();
		openContextMenu(input);
		await settle();
		const block = mainWindow.document.querySelector<HTMLElement>('.context-view-block')!;
		block.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
		(mainWindow.document.activeElement as HTMLElement).blur(); // default action of clicking the non focusable block
		await settle();
		assert.deepStrictEqual(state(picker, input), { visible: false, focus: 'other', menu: false, value: 'T10 harmless', selection: [4, 7] });
	});

	test('focus moving from the context menu to outside hides the picker', async () => {
		const { picker, input } = showPicker();
		openContextMenu(input);
		await settle();
		outside.focus();
		await settle();
		const result = state(picker, input);
		assert.deepStrictEqual([result.visible, result.focus], [false, 'outside']);
	});

	test('an empty context menu does not defer a later focus out', async () => {
		const { picker, input } = showPicker();
		openContextMenu(input, []);
		await settle();
		const afterEmptyMenu = state(picker, input);
		outside.focus();
		await settle();
		assert.deepStrictEqual([afterEmptyMenu.visible, afterEmptyMenu.focus, state(picker, input).visible], [true, 'input', false]);
	});

	test('hiding the picker while focus out is deferred does not affect the next picker', async () => {
		const first = showPicker();
		openContextMenu(first.input);
		await settle();
		first.picker.hide();
		keydown(mainWindow.document.activeElement!, 'Escape', 27);
		await settle();

		const second = showPicker();
		await settle();
		const shown = state(second.picker, second.input);
		outside.focus();
		await settle();
		assert.deepStrictEqual([shown.visible, shown.focus, state(second.picker, second.input).visible], [true, 'input', false]);
	});

	test('ignoreFocusOut keeps the picker when focus moves outside while a context menu is open', async () => {
		ignoreFocusOut = true;
		const { picker, input } = showPicker();
		openContextMenu(input);
		await settle();
		outside.focus();
		await settle();
		assert.deepStrictEqual(state(picker, input).visible, true);
	});
});
