/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { addDisposableListener, EventType } from '../../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { IconSelectBox } from '../../../../base/browser/ui/icons/iconSelectBox.js';
import { ObjectTree } from '../../../../base/browser/ui/tree/objectTree.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCodeChord } from '../../../../base/common/keybindings.js';
import { OS } from '../../../../base/common/platform.js';
import { unthemedInboxStyles } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { unthemedButtonStyles } from '../../../../base/browser/ui/button/button.js';
import { unthemedListStyles } from '../../../../base/browser/ui/list/listWidget.js';
import { unthemedToggleStyles } from '../../../../base/browser/ui/toggle/toggle.js';
import { Event } from '../../../../base/common/event.js';
import { DeferredPromise, raceTimeout } from '../../../../base/common/async.js';
import { unthemedCountStyles } from '../../../../base/browser/ui/countBadge/countBadge.js';
import { unthemedKeybindingLabelOptions } from '../../../../base/browser/ui/keybindingLabel/keybindingLabel.js';
import { unthemedProgressBarOptions } from '../../../../base/browser/ui/progressbar/progressbar.js';
import { QuickInputController } from '../../browser/quickInputController.js';
import { TestThemeService } from '../../../theme/test/common/testThemeService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { backButton, QuickPick } from '../../browser/quickInput.js';
import { IQuickInput, IQuickInputService, IQuickPickItem, ItemActivation, isKeyModified, NO_KEY_MODS, QuickPickFocus } from '../../common/quickInput.js';
import { CommandsRegistry } from '../../../commands/common/commands.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IContextViewService } from '../../../contextview/browser/contextView.js';
import { IListService, ListService, WorkbenchListWidget } from '../../../list/browser/listService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../contextkey/browser/contextKeyService.js';
import { KeybindingResolver, NoMatchingKb, ResultKind } from '../../../keybinding/common/keybindingResolver.js';
import { KeybindingsRegistry } from '../../../keybinding/common/keybindingsRegistry.js';
import { ResolvedKeybindingItem } from '../../../keybinding/common/resolvedKeybindingItem.js';
import { USLayoutResolvedKeybinding } from '../../../keybinding/common/usLayoutResolvedKeybinding.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';

// Sets up an `onShow` listener to allow us to wait until the quick pick is shown (useful when triggering an `accept()` right after launching a quick pick)
// kick this off before you launch the picker and then await the promise returned after you launch the picker.
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
	let instantiationService: TestInstantiationService;
	let getRegisteredLists: () => readonly WorkbenchListWidget[];

	setup(() => {
		fixture = document.createElement('div');
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		instantiationService = new TestInstantiationService();

		// Stub the services the quick input controller needs to function
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		const listService = store.add(new ListService());
		const registrations = sinon.spy(listService, 'register');
		getRegisteredLists = () => registrations.getCalls().map(call => call.args[0]);
		instantiationService.stub(IListService, listService);
		instantiationService.stub(ILayoutService, {
			_serviceBrand: undefined,
			activeContainer: fixture,
			onDidLayoutContainer: Event.None,
			getContainer: () => fixture,
		});
		instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; },
		});

		controller = store.add(instantiationService.createInstance(
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
					list: {
						...unthemedListStyles,
						listFocusBackground: 'var(--vscode-quickInputList-focusBackground)',
						listFocusForeground: 'var(--vscode-quickInputList-focusForeground)',
						listInactiveFocusBackground: 'var(--vscode-quickInputList-focusBackground)',
						listInactiveFocusForeground: 'var(--vscode-quickInputList-focusForeground)',
						listFocusOutline: 'var(--vscode-list-focusOutline)',
						listInactiveFocusOutline: 'var(--vscode-list-focusOutline)',
					},
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
		controller.layout({ height: 20, width: 40 }, 0);
	});

	teardown(() => {
		sinon.restore();
	});

	test('custom content stays above standard picker rows through updates and reopen', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick());
		const content = mainWindow.document.createElement('div');
		const input = mainWindow.document.createElement('input');
		content.append(input);
		const quickInput: IQuickInput = picker;
		quickInput.widget = content;
		picker.hideInput = true;
		picker.items = [{ label: 'Reset to default' }];
		picker.show();
		input.focus();
		picker.items = [{ label: 'Updated row' }];
		const host = fixture.querySelector('.quick-input-html-widget')!;
		const list = fixture.querySelector('.quick-input-list')!;
		const focusedDuringUpdate = mainWindow.document.activeElement === input;
		const aboveList = !!(content.compareDocumentPosition(list) & mainWindow.Node.DOCUMENT_POSITION_FOLLOWING);
		const row = list.querySelector('.label-name')?.textContent;
		picker.hide();
		picker.show();
		assert.deepStrictEqual({
			focusedDuringUpdate,
			aboveList,
			reattached: host.firstElementChild === content,
			row,
		}, { focusedDuringUpdate: true, aboveList: true, reattached: true, row: 'Updated row' });
	});

	test('quick widgets retain their content when shown again', () => {
		const picker = store.add(controller.createQuickWidget());
		const content = mainWindow.document.createElement('div');
		picker.widget = content;
		picker.show();
		picker.hide();
		picker.show();
		assert.strictEqual(fixture.querySelector('.quick-input-html-widget')?.firstElementChild, content);
	});

	test('modified icon-search caret keys do not activate host quick-pick navigation bindings', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick());
		const grid = store.add(new IconSelectBox({ icons: [Codicon.rocket], inputBoxStyles: unthemedInboxStyles }));
		picker.widget = grid.domNode;
		picker.hideInput = true;
		picker.itemActivation = ItemActivation.NONE;
		picker.items = [{ label: 'Reset to default' }];
		instantiationService.stub(IQuickInputService, { currentQuickInput: picker });
		const contextKeyService = instantiationService.get(IContextKeyService);
		contextKeyService.createKey('inQuickInput', true);
		contextKeyService.createKey('quickInputType', 'quickPick');
		const bindings = KeybindingsRegistry.getDefaultKeybindings().filter(binding =>
			binding.command === 'quickInput.first' || binding.command === 'quickInput.last');
		const resolver = new KeybindingResolver(bindings.flatMap(binding => binding.keybinding
			? USLayoutResolvedKeybinding.resolveKeybinding(binding.keybinding, OS).map(keybinding =>
				new ResolvedKeybindingItem(keybinding, binding.command, binding.commandArgs, binding.when ?? undefined, true, null, false))
			: []), [], () => { });
		const hostCommands: string[] = [];
		store.add(addDisposableListener(fixture, EventType.KEY_DOWN, event => {
			const key = new StandardKeyboardEvent(event);
			const dispatch = USLayoutResolvedKeybinding.getDispatchStr(new KeyCodeChord(key.ctrlKey, key.shiftKey, key.altKey, key.metaKey, key.keyCode));
			if (!dispatch) {
				return;
			}
			const result = resolver.resolve(contextKeyService.getContext(event.target as HTMLElement), [], dispatch);
			if (result.kind === ResultKind.KbFound && result.commandId) {
				const command = CommandsRegistry.getCommand(result.commandId)!;
				hostCommands.push(result.commandId);
				instantiationService.invokeFunction(command.handler);
				event.preventDefault();
			}
		}));
		picker.show();
		const input = grid.domNode.querySelector<HTMLInputElement>('input')!;
		input.value = 'rocket';
		grid.focus();
		const dispatch = (key: string, keyCode: number) => {
			const event = new KeyboardEvent('keydown', { key, keyCode, ctrlKey: true, bubbles: true, cancelable: true });
			input.dispatchEvent(event);
			return event.defaultPrevented;
		};
		const prevented = [dispatch('Home', 36), dispatch('End', 35)];
		const isolatedCommands = [...hostCommands];
		const isolatedActive = picker.activeItems.map(item => item.label);
		const unprotected = mainWindow.document.createElement('input');
		grid.domNode.parentElement!.append(unprotected);
		unprotected.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', keyCode: 36, ctrlKey: true, bubbles: true, cancelable: true }));
		unprotected.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', keyCode: 35, ctrlKey: true, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({ prevented, isolatedCommands, isolatedActive, hostCommands, hostActive: picker.activeItems.map(item => item.label) }, {
			prevented: [false, false],
			isolatedCommands: [],
			isolatedActive: [],
			hostCommands: ['quickInput.first', 'quickInput.last'],
			hostActive: ['Reset to default'],
		});
	});

	test('a leading separator divides custom content from picker rows, but stays hidden without content', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.widget = mainWindow.document.createElement('div');
		const reset = { label: 'Reset to default' };
		picker.items = [{ type: 'separator' }, reset];
		picker.canSelectMany = true;
		picker.show();
		picker.activeItems = [reset];
		picker.selectedItems = [reset];
		const withContent = fixture.querySelectorAll('.quick-input-list-separator-empty').length;
		const activeWithContent = picker.activeItems.map(item => item.label);
		picker.widget = undefined;
		assert.deepStrictEqual({
			withContent,
			activeWithContent,
			withoutContent: fixture.querySelectorAll('.quick-input-list-separator-empty').length,
			contentMarker: fixture.querySelector('.quick-input-widget')?.classList.contains('has-custom-widget'),
			active: picker.activeItems.map(item => item.label),
			selected: picker.selectedItems.map(item => item.label),
		}, {
			withContent: 1,
			activeWithContent: ['Reset to default'],
			withoutContent: 0,
			contentMarker: false,
			active: ['Reset to default'],
			selected: ['Reset to default'],
		});
	});

	test('custom content changes preserve filtered order, focus and checked items', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		const zap = { label: 'zap' };
		const apple = { label: 'apple' };
		picker.items = [{ type: 'separator' }, zap, { type: 'separator' }, apple];
		picker.canSelectMany = true;
		picker.value = 'a';
		picker.show();
		picker.activeItems = [zap];
		picker.selectedItems = [apple];
		const state = () => ({
			items: [...fixture.querySelectorAll('.quick-input-list-entry .label-name')].map(label => label.textContent),
			dividers: fixture.querySelectorAll('.quick-input-list-separator-empty').length,
			active: picker.activeItems.map(item => item.label),
			selected: picker.selectedItems.map(item => item.label),
		});
		const before = state();
		picker.widget = mainWindow.document.createElement('div');
		const withContent = state();
		picker.widget = undefined;
		const expected = { items: ['apple', 'zap'], dividers: 0, active: ['zap'], selected: ['apple'] };
		assert.deepStrictEqual([before, withContent, state()], [expected, expected, expected]);
	});

	test('section navigation wraps across a hidden leading divider', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [
			{ type: 'separator' }, { label: 'First section' },
			{ type: 'separator' }, { label: 'Second section' },
		];
		picker.show();
		const active = [picker.activeItems.map(item => item.label)];
		for (const direction of [QuickPickFocus.NextSeparator, QuickPickFocus.NextSeparator, QuickPickFocus.PreviousSeparator, QuickPickFocus.PreviousSeparator]) {
			picker.focus(direction);
			active.push(picker.activeItems.map(item => item.label));
		}
		assert.deepStrictEqual(active, [
			['First section'], ['Second section'], ['First section'], ['Second section'], ['First section'],
		]);
	});

	for (const canSelectMany of [false, true]) {
		test(`dividers do not become keyboard parents (multi-select: ${canSelectMany})`, async () => {
			controller.layout({ height: 500, width: 600 }, 0);
			const picker = store.add(controller.createQuickPick({ useSeparators: true }));
			picker.items = [{ label: 'Red' }, { type: 'separator' }, { label: 'Reset to default' }];
			picker.canSelectMany = canSelectMany;
			picker.show();
			picker.focus(QuickPickFocus.Last);
			const list = fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!;
			list.focus();
			list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true, cancelable: true }));
			const context = instantiationService.get(IContextKeyService).getContext(list);
			if (canSelectMany) {
				controller.toggle();
			}
			let accepted: string[] = [];
			store.add(picker.onDidAccept(() => accepted = picker.activeItems.map(item => item.label)));
			await controller.accept();
			const row = list.querySelector('.monaco-list-row.focused')!;
			assert.deepStrictEqual({
				hasParent: context.getValue('treeElementHasParent'),
				canCollapse: context.getValue('treeElementCanCollapse'),
				active: picker.activeItems.map(item => item.label),
				selected: picker.selectedItems.map(item => item.label),
				accepted,
				position: row.getAttribute('aria-posinset'),
				size: row.getAttribute('aria-setsize'),
				level: row.getAttribute('aria-level'),
			}, {
				hasParent: false,
				canCollapse: false,
				active: ['Reset to default'],
				selected: ['Reset to default'],
				accepted: ['Reset to default'],
				position: '2',
				size: '2',
				level: '1',
			});
		});
	}

	test('appearance picker selection is neutral without changing the next ordinary picker', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		fixture.style.setProperty('--vscode-quickInputList-focusBackground', '#0000ff');
		fixture.style.setProperty('--vscode-quickInputList-focusForeground', '#ffffff');
		fixture.style.setProperty('--vscode-list-inactiveSelectionBackground', '#dddddd');
		fixture.style.setProperty('--vscode-list-inactiveSelectionForeground', '#111111');
		fixture.style.setProperty('--vscode-list-focusOutline', '#ff00ff');
		const picker = store.add(controller.createQuickPick());
		picker.useNeutralSelection = true;
		picker.items = [{ label: 'Red' }, { label: 'Reset to default' }];
		picker.show();
		const colors = () => {
			const row = fixture.querySelector<HTMLElement>('.monaco-list-row.focused')!;
			const style = mainWindow.getComputedStyle(row);
			return { background: style.backgroundColor, foreground: style.color };
		};
		const appearance = colors();
		picker.focus(QuickPickFocus.Last);
		const reset = colors();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!;
		list.focus();
		const focusStyle = mainWindow.getComputedStyle(list.querySelector<HTMLElement>('.monaco-list-row.focused')!);
		const focusOutline = { color: focusStyle.outlineColor, visible: focusStyle.outlineStyle !== 'none', width: focusStyle.outlineWidth };
		picker.hide();
		const ordinary = store.add(controller.createQuickPick());
		ordinary.items = [{ label: 'Ordinary command' }];
		ordinary.show();
		assert.deepStrictEqual({ appearance, reset, focusOutline, ordinary: colors() }, {
			appearance: { background: 'rgb(221, 221, 221)', foreground: 'rgb(17, 17, 17)' },
			reset: { background: 'rgb(221, 221, 221)', foreground: 'rgb(17, 17, 17)' },
			focusOutline: { color: 'rgb(255, 0, 255)', visible: true, width: '1px' },
			ordinary: { background: 'rgb(0, 0, 255)', foreground: 'rgb(255, 255, 255)' },
		});
	});

	for (const palette of [
		{ name: 'Light 2026', background: '#DADADA99', foreground: '#202020', highlight: '#0069CC', focusBackground: '#0069CC', expectedHighlight: 'rgb(0, 105, 204)' },
		{ name: 'Dark 2026', background: '#2C2D2E', foreground: '#ededed', highlight: '#48A0C7', focusBackground: '#297AA0', expectedHighlight: 'rgb(72, 160, 199)' },
	]) {
		test(`neutral search matches retain the normal highlight color (${palette.name} palette)`, () => {
			controller.layout({ height: 500, width: 600 }, 0);
			fixture.style.setProperty('--vscode-quickInputList-focusBackground', palette.focusBackground);
			fixture.style.setProperty('--vscode-quickInputList-focusHighlightForeground', '#ffffff');
			fixture.style.setProperty('--vscode-list-inactiveSelectionBackground', palette.background);
			fixture.style.setProperty('--vscode-list-inactiveSelectionForeground', palette.foreground);
			fixture.style.setProperty('--vscode-list-highlightForeground', palette.highlight);
			const picker = store.add(controller.createQuickPick());
			picker.useNeutralSelection = true;
			picker.items = [{ label: 'Red' }, { label: 'Green' }];
			picker.value = 're';
			picker.show();
			const matches = () => Array.from(
				fixture.querySelectorAll<HTMLElement>('.monaco-list-row .monaco-highlighted-label .highlight'),
				element => ({ text: element.textContent, color: mainWindow.getComputedStyle(element).color })
			);
			const inputFocused = matches();
			fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!.focus();
			const listFocused = matches();
			picker.hide();
			const ordinary = store.add(controller.createQuickPick());
			ordinary.items = picker.items;
			ordinary.value = 're';
			ordinary.show();
			const neutral = [{ text: 'Re', color: palette.expectedHighlight }, { text: 're', color: palette.expectedHighlight }];
			assert.deepStrictEqual({ inputFocused, listFocused, ordinary: matches() }, {
				inputFocused: neutral,
				listFocused: neutral,
				ordinary: [{ text: 'Re', color: 'rgb(255, 255, 255)' }, { text: 're', color: palette.expectedHighlight }],
			});
		});
	}

	test('direct tree navigation skips decorative dividers while preserving action headers', async () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.widget = mainWindow.document.createElement('div');
		const reset = { label: 'Reset to default' };
		picker.items = [
			{ type: 'separator' }, reset,
			{ type: 'separator', label: 'Actions', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] },
			{ type: 'separator' }, { label: 'Second' },
		];
		picker.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!;
		const tree = getRegisteredLists().find(widget => widget.getHTMLElement() === list);
		if (!(tree instanceof ObjectTree)) {
			throw new Error('Expected the Quick Input tree');
		}
		const states: { active: string[]; header: boolean }[] = [];
		const record = () => states.push({
			active: picker.activeItems.map(item => item.label),
			header: !!list.querySelector('.monaco-list-row.focused .quick-input-list-separator-as-item.has-actions'),
		});
		tree.focusFirst();
		record();
		picker.activeItems = [reset];
		tree.focusNext();
		record();
		tree.focusLast();
		record();
		tree.focusPrevious();
		record();
		tree.focusFirst();
		record();
		let accepted: string[] = [];
		store.add(picker.onDidAccept(() => accepted = picker.activeItems.map(item => item.label)));
		await controller.accept();
		assert.deepStrictEqual({ states, accepted }, {
			states: [
				{ active: ['Reset to default'], header: false },
				{ active: [], header: true },
				{ active: ['Second'], header: false },
				{ active: [], header: true },
				{ active: ['Reset to default'], header: false },
			],
			accepted: ['Reset to default'],
		});
	});

	test('labelled separators keep their inline labels and button separators keep their header height', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [
			{ type: 'separator', label: 'Inline section' }, { label: 'First item' },
			{ type: 'separator', label: 'Section with actions', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] }, { label: 'Second item' },
		];
		picker.show();
		const header = fixture.querySelector<HTMLElement>('.quick-input-list-separator-as-item')!;
		picker.focus(QuickPickFocus.Next);
		assert.deepStrictEqual({
			inline: fixture.querySelector('.quick-input-list-entry .quick-input-list-separator')?.textContent,
			headerHeight: header.getBoundingClientRect().height,
			dividers: fixture.querySelectorAll('.quick-input-list-separator-empty').length,
			active: picker.activeItems.map(item => item.label),
		}, { inline: 'Inline section', headerHeight: 30, dividers: 0, active: ['Second item'] });
	});

	test('unlabelled dividers have their own geometry outside the centered Reset row', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		fixture.style.setProperty('--vscode-strokeThickness', '1px');
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [{ label: 'Red' }, { type: 'separator' }, { label: 'Reset to default' }];
		picker.show();
		const divider = fixture.querySelector<HTMLElement>('.quick-input-list-separator-empty')!;
		const reset = [...fixture.querySelectorAll<HTMLElement>('.quick-input-list-entry')].find(entry => entry.textContent === 'Reset to default')!;
		const dividerBounds = divider.getBoundingClientRect();
		const row = reset.closest<HTMLElement>('.monaco-list-row')!;
		const rowBounds = row.getBoundingClientRect();
		const labelBounds = reset.querySelector<HTMLElement>('.quick-input-list-row')!.getBoundingClientRect();
		picker.focus(QuickPickFocus.Next);
		const active = picker.activeItems.map(item => item.label);
		picker.value = 'Reset';
		const filteredDividers = fixture.querySelectorAll('.quick-input-list-separator-empty').length;
		picker.value = '';
		assert.deepStrictEqual({
			dividerHeight: dividerBounds.height,
			dividerStroke: mainWindow.getComputedStyle(divider, '::before').borderTopWidth,
			separate: dividerBounds.bottom <= rowBounds.top,
			rowHeight: rowBounds.height,
			entryHeight: reset.getBoundingClientRect().height,
			contentCentered: Math.abs((labelBounds.top + labelBounds.bottom) - (rowBounds.top + rowBounds.bottom)) <= 1,
			rowHasDivider: reset.classList.contains('quick-input-list-separator-border'),
			active,
			filteredDividers,
			restoredDividers: fixture.querySelectorAll('.quick-input-list-separator-empty').length,
		}, {
			dividerHeight: 8,
			dividerStroke: '1px',
			separate: true,
			rowHeight: 22,
			entryHeight: 22,
			contentCentered: true,
			rowHasDivider: false,
			active: ['Reset to default'],
			filteredDividers: 0,
			restoredDividers: 1,
		});
	});

	test('dividers preserve action-bearing section membership', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [
			{ type: 'separator', label: 'Colors', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] },
			{ label: 'Red' }, { type: 'separator' }, { label: 'Reset to default' },
		];
		picker.show();
		picker.focus(QuickPickFocus.Last);
		const list = fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!;
		list.focus();
		const row = list.querySelector('.monaco-list-row.focused')!;
		assert.deepStrictEqual({
			headers: fixture.querySelectorAll('.quick-input-list-separator-as-item:not(.quick-input-list-separator-empty)').length,
			headerActive: fixture.querySelector('.quick-input-list-separator-as-item.has-actions')?.classList.contains('focus-inside'),
			dividers: fixture.querySelectorAll('.quick-input-list-separator-empty').length,
			hasParent: instantiationService.get(IContextKeyService).getContext(list).getValue('treeElementHasParent'),
			level: row.getAttribute('aria-level'),
			active: picker.activeItems.map(item => item.label),
		}, { headers: 1, headerActive: true, dividers: 1, hasParent: true, level: '2', active: ['Reset to default'] });
	});

	test('previous section targets visible matches instead of hidden first children', async () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [{ label: 'apple' }, { type: 'separator' }, { label: 'berry' }, { label: 'apricot' }];
		picker.sortByLabel = false;
		picker.value = 'a';
		picker.show();
		picker.focus(QuickPickFocus.PreviousSeparator);
		let accepted: string[] = [];
		store.add(picker.onDidAccept(() => accepted = picker.activeItems.map(item => item.label)));
		await controller.accept();
		assert.deepStrictEqual({
			active: picker.activeItems.map(item => item.label),
			accepted,
			focused: fixture.querySelector('.monaco-list-row.focused .label-name')?.textContent,
		}, { active: ['apricot'], accepted: ['apricot'], focused: 'apricot' });
	});

	test('previous section moves to the current section start before the preceding section', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [
			{ label: 'A1' }, { label: 'A2' }, { type: 'separator' }, { label: 'B1' }, { label: 'B2' },
		];
		picker.show();
		picker.focus(QuickPickFocus.Last);
		const active: string[][] = [];
		for (let index = 0; index < 3; index++) {
			picker.focus(QuickPickFocus.PreviousSeparator);
			active.push(picker.activeItems.map(item => item.label));
		}
		assert.deepStrictEqual(active, [['B1'], ['A1'], ['B1']]);
	});

	test('action headers followed immediately by dividers navigate and select visible options', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [
			{ label: 'First' },
			{ type: 'separator', label: 'Colors', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] },
			{ type: 'separator' }, { label: 'Reset to default' },
		];
		picker.show();
		picker.focus(QuickPickFocus.NextSeparator);
		const navigated = picker.activeItems.map(item => item.label);
		const header = fixture.querySelector<HTMLElement>('.quick-input-list-separator-as-item.has-actions')!;
		header.click();
		const row = fixture.querySelector('.monaco-list-row.focused')!;
		assert.deepStrictEqual({
			navigated,
			selected: picker.activeItems.map(item => item.label),
			position: row.getAttribute('aria-posinset'),
			size: row.getAttribute('aria-setsize'),
		}, { navigated: ['Reset to default'], selected: ['Reset to default'], position: '1', size: '1' });
	});

	test('the sole Reset option counts once below a custom widget divider', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.widget = mainWindow.document.createElement('div');
		picker.items = [{ type: 'separator' }, { label: 'Reset to default' }];
		picker.show();
		const row = fixture.querySelector('.monaco-list-row.focused')!;
		assert.deepStrictEqual({
			position: row.getAttribute('aria-posinset'),
			size: row.getAttribute('aria-setsize'),
		}, { position: '1', size: '1' });
	});

	test('section navigation preserves action-header focus context', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		const first = { label: 'A1' };
		const middle = { label: 'B1' };
		const last = { label: 'C1' };
		picker.items = [
			{ type: 'separator', label: 'A', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] }, first,
			{ type: 'separator', label: 'B', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] }, middle,
			{ type: 'separator', label: 'C', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] }, last,
		];
		picker.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!;
		const tree = getRegisteredLists().find(widget => widget.getHTMLElement() === list);
		if (!(tree instanceof ObjectTree)) {
			throw new Error('Expected the focused Quick Input tree');
		}
		const active: string[][] = [];
		for (const [item, direction] of [
			[middle, QuickPickFocus.NextSeparator],
			[middle, QuickPickFocus.PreviousSeparator],
			[first, QuickPickFocus.PreviousSeparator],
			[last, QuickPickFocus.NextSeparator],
		] as const) {
			picker.activeItems = [item];
			const header = tree.getParentElement(tree.getFocus()[0]);
			if (!header) {
				throw new Error('Expected an action-bearing parent header');
			}
			tree.setFocus([header]);
			picker.focus(direction);
			active.push(picker.activeItems.map(item => item.label));
		}
		assert.deepStrictEqual(active, [['C1'], ['A1'], ['C1'], ['A1']]);
	});

	test('section navigation starts at the correct boundary with no active item', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const states: { kind: string; initial: string[]; backward: string[]; forward: string[] }[] = [];
		for (const kind of ['labelled', 'action', 'unlabelled']) {
			const picker = store.add(controller.createQuickPick({ useSeparators: true }));
			picker.itemActivation = ItemActivation.NONE;
			picker.items = ['A', 'B', 'C'].flatMap(label => [
				{ type: 'separator' as const, label: kind === 'unlabelled' ? undefined : label, buttons: kind === 'action' ? [{ iconClass: 'codicon-add', tooltip: 'Add' }] : undefined },
				{ label: `${label}1` },
			]);
			picker.show();
			const initial = picker.activeItems.map(item => item.label);
			picker.focus(QuickPickFocus.PreviousSeparator);
			const backward = picker.activeItems.map(item => item.label);
			picker.activeItems = [];
			picker.focus(QuickPickFocus.NextSeparator);
			states.push({ kind, initial, backward, forward: picker.activeItems.map(item => item.label) });
			picker.hide();
		}
		assert.deepStrictEqual(states, [
			{ kind: 'labelled', initial: [], backward: ['C1'], forward: ['A1'] },
			{ kind: 'action', initial: [], backward: ['C1'], forward: ['A1'] },
			{ kind: 'unlabelled', initial: [], backward: ['C1'], forward: ['A1'] },
		]);
	});

	test('filtering does not carry a section label across an unlabelled boundary', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		picker.items = [{ type: 'separator', label: 'A' }, { label: 'apple' }, { type: 'separator' }, { label: 'berry' }];
		picker.sortByLabel = false;
		picker.show();
		const states: { query: string; active: string[]; sections: (string | null)[] }[] = [];
		for (const query of ['berry', 'apple', '']) {
			picker.value = query;
			states.push({
				query,
				active: picker.activeItems.map(item => item.label),
				sections: Array.from(fixture.querySelectorAll<HTMLElement>('.quick-input-list-separator'))
					.filter(element => element.style.display !== 'none')
					.map(element => element.textContent),
			});
		}
		assert.deepStrictEqual(states, [
			{ query: 'berry', active: ['berry'], sections: [] },
			{ query: 'apple', active: ['apple'], sections: ['A'] },
			{ query: '', active: ['apple'], sections: ['A'] },
		]);
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

	for (const action of ['accept', 'cancel'] as const) {
		test(`hides immediately on ${action} when CSS suppresses close motion`, async () => {
			fixture.classList.add('modern-ui', 'monaco-enable-motion');
			const quickpick = store.add(controller.createQuickPick());
			quickpick.items = [{ label: 'item' }];
			store.add(quickpick.onDidAccept(() => quickpick.hide()));
			const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
			widget.style.animation = 'none';

			quickpick.show();
			await controller[action]();

			assert.deepStrictEqual({
				display: widget.style.display,
				closing: widget.classList.contains('quick-input-widget-closing'),
				inert: widget.inert,
				visible: controller.isVisible(),
			}, {
				display: 'none',
				closing: false,
				inert: false,
				visible: false,
			});
		});
	}

	test('finishes closing when the close animation finishes', async () => {
		sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		fixture.classList.add('modern-ui', 'monaco-enable-motion');
		const quickpick = store.add(controller.createQuickPick());
		quickpick.show();
		quickpick.hide();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const [animation] = widget.getAnimations();
		assert.ok(animation);
		const finished = Event.toPromise(Event.fromDOMEventEmitter(animation, 'finish'), store.add(new DisposableStore()));
		animation.finish();
		await finished;

		assert.deepStrictEqual({
			display: widget.style.display,
			closing: widget.classList.contains('quick-input-widget-closing'),
			inert: widget.inert,
		}, {
			display: 'none',
			closing: false,
			inert: false,
		});
	});

	test('finishes closing when reduced motion cancels the animation', async () => {
		sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		fixture.classList.add('modern-ui', 'monaco-enable-motion');
		const quickpick = store.add(controller.createQuickPick());
		quickpick.show();
		quickpick.hide();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const [animation] = widget.getAnimations();
		assert.ok(animation);
		const cancelled = Event.toPromise(Event.fromDOMEventEmitter(animation, 'cancel'), store.add(new DisposableStore()));
		fixture.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
		const animationCount = widget.getAnimations().length;
		await cancelled;

		assert.deepStrictEqual({
			animationCount,
			display: widget.style.display,
			closing: widget.classList.contains('quick-input-widget-closing'),
			inert: widget.inert,
		}, {
			animationCount: 0,
			display: 'none',
			closing: false,
			inert: false,
		});
	});

	test('reopening discards the previous close animation callbacks and timeout', () => {
		const clock = sinon.useFakeTimers();
		fixture.classList.add('modern-ui', 'monaco-enable-motion');
		const quickpick = store.add(controller.createQuickPick());
		quickpick.show();
		quickpick.hide();
		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const [animation] = widget.getAnimations();
		assert.ok(animation);

		quickpick.show();
		clock.tick(150);
		const reopened = {
			display: widget.style.display,
			closing: widget.classList.contains('quick-input-widget-closing'),
			inert: widget.inert,
			visible: controller.isVisible(),
		};
		quickpick.hide();
		animation.dispatchEvent(new mainWindow.Event('finish'));
		animation.dispatchEvent(new mainWindow.Event('cancel'));

		assert.deepStrictEqual({
			reopened,
			closingAgain: {
				display: widget.style.display,
				closing: widget.classList.contains('quick-input-widget-closing'),
				inert: widget.inert,
				visible: controller.isVisible(),
			},
		}, {
			reopened: { display: '', closing: false, inert: false, visible: true },
			closingAgain: { display: '', closing: true, inert: true, visible: false },
		});
		clock.tick(150);
	});

	test('title bar is hidden when empty', () => {
		const quickpick = store.add(controller.createQuickPick());
		const titleBar = fixture.querySelector<HTMLElement>('.quick-input-titlebar')!;
		const states: string[] = [];
		const recordState = () => states.push(titleBar.style.display);

		quickpick.show();
		recordState();

		quickpick.title = 'Title';
		recordState();

		quickpick.title = undefined;
		quickpick.buttons = [backButton];
		recordState();

		quickpick.buttons = [];
		recordState();

		assert.deepStrictEqual(states, ['none', '', '', 'none']);
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

	test('positions an anchored picker below its anchor when requested', () => {
		fixture.style.width = '600px';
		fixture.style.height = '400px';
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
		quickpick.anchorPosition = 'below';
		quickpick.show();

		const widget = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		assert.deepStrictEqual({
			top: widget.getBoundingClientRect().top,
			anchorBottomWithGap: anchor.getBoundingClientRect().bottom + 4,
		}, {
			top: anchor.getBoundingClientRect().bottom + 4,
			anchorBottomWithGap: anchor.getBoundingClientRect().bottom + 4,
		});
	});

	test('scoped anchors apply only to the next unanchored quick pick', async () => {
		const anchor = document.createElement('div');
		const explicitAnchor = document.createElement('div');
		fixture.appendChild(anchor);
		fixture.appendChild(explicitAnchor);
		let explicitState = { anchor: false, position: undefined as string | undefined };
		let inheritedState = { anchor: false, position: undefined as string | undefined };
		await controller.withQuickInputAnchor(anchor, 'below', async () => {
			const input = store.add(controller.createInputBox());
			input.show();
			input.hide();
			const explicit = store.add(controller.createQuickPick());
			explicit.anchor = explicitAnchor;
			explicit.anchorPosition = 'above';
			explicit.show();
			explicitState = { anchor: explicit.anchor === explicitAnchor, position: explicit.anchorPosition };
			explicit.hide();
			const inherited = store.add(controller.createQuickPick());
			inherited.show();
			inheritedState = { anchor: inherited.anchor === anchor, position: inherited.anchorPosition };
			inherited.hide();
		});
		const subsequent = store.add(controller.createQuickPick());
		subsequent.show();

		assert.deepStrictEqual({
			explicitState,
			inheritedState,
			subsequentAnchor: subsequent.anchor,
			subsequentPosition: subsequent.anchorPosition,
		}, {
			explicitState: { anchor: true, position: 'above' },
			inheritedState: { anchor: true, position: 'below' },
			subsequentAnchor: undefined,
			subsequentPosition: undefined,
		});
	});

	test('serializes scoped anchor operations', async () => {
		const firstAnchor = document.createElement('div');
		const secondAnchor = document.createElement('div');
		fixture.appendChild(firstAnchor);
		fixture.appendChild(secondAnchor);
		const firstStarted = new DeferredPromise<void>();
		const releaseFirst = new DeferredPromise<void>();
		const order: string[] = [];
		let firstPickerAnchored = false;
		let secondPickerAnchored = false;

		const first = controller.withQuickInputAnchor(firstAnchor, 'below', async () => {
			order.push('first:start');
			firstStarted.complete();
			await releaseFirst.p;
			const picker = store.add(controller.createQuickPick());
			picker.show();
			firstPickerAnchored = picker.anchor === firstAnchor;
			picker.hide();
			order.push('first:end');
		});
		await firstStarted.p;
		const second = controller.withQuickInputAnchor(secondAnchor, 'above', async () => {
			order.push('second:start');
			const picker = store.add(controller.createQuickPick());
			picker.show();
			secondPickerAnchored = picker.anchor === secondAnchor;
			picker.hide();
			order.push('second:end');
		});
		await Promise.resolve();
		const orderWhileFirstIsPending = order.slice();
		releaseFirst.complete();
		await Promise.all([first, second]);

		assert.deepStrictEqual({
			orderWhileFirstIsPending,
			order,
			firstPickerAnchored,
			secondPickerAnchored,
		}, {
			orderWhileFirstIsPending: ['first:start'],
			order: ['first:start', 'first:end', 'second:start', 'second:end'],
			firstPickerAnchored: true,
			secondPickerAnchored: true,
		});
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

	test('id is exposed as DOM metadata and cleared when absent', () => {
		const quickpick = store.add(controller.createQuickPick());
		quickpick.items = [{ id: 'item-id', label: 'item with id' }];
		quickpick.show();

		const entry = fixture.querySelector<HTMLElement>('.quick-input-list-entry')!;
		const id = entry.getAttribute('data-quick-input-id');

		quickpick.items = [{ label: 'item without id' }];
		const recycledEntry = fixture.querySelector<HTMLElement>('.quick-input-list-entry')!;
		const recycledId = recycledEntry.getAttribute('data-quick-input-id');

		assert.deepStrictEqual({ id, recycledId }, {
			id: 'item-id',
			recycledId: null
		});
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
