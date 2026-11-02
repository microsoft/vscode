/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append } from '../../../../base/browser/dom.js';
import { ObjectTree } from '../../../../base/browser/ui/tree/objectTree.js';
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
import { backButton, IQuickInputStyles, QuickPick } from '../../browser/quickInput.js';
import { IQuickPick, IQuickPickItem, ItemActivation, isKeyModified, NO_KEY_MODS, QuickPickFocus } from '../../common/quickInput.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../theme/common/themeService.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ILayoutService } from '../../../layout/browser/layoutService.js';
import { IContextMenuService, IContextViewService } from '../../../contextview/browser/contextView.js';
import { IListService, ListService, WorkbenchListWidget } from '../../../list/browser/listService.js';
import { IContextKeyService } from '../../../contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../contextkey/browser/contextKeyService.js';
import { NoMatchingKb } from '../../../keybinding/common/keybindingResolver.js';
import { IKeybindingService } from '../../../keybinding/common/keybinding.js';
import { ContextViewService } from '../../../contextview/browser/contextViewService.js';
import { IAccessibilityService } from '../../../accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../accessibility/test/common/testAccessibilityService.js';
import { IMarkdownRendererService } from '../../../markdown/browser/markdownRenderer.js';
import { HoverService } from '../../../hover/browser/hoverService.js';

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

const testQuickInputStyles: IQuickInputStyles = {
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
};

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
		controller.layout({ height: 20, width: 40 }, 0);
	});

	teardown(() => {
		sinon.restore();
	});

	test('custom content is exclusive to QuickWidget and cleared when switching controls', () => {
		const widget = store.add(controller.createQuickWidget());
		const content = mainWindow.document.createElement('div');
		widget.widget = content;
		widget.show();
		const controls = [
			store.add(controller.createQuickPick()),
			store.add(controller.createInputBox()),
			store.add(controller.createQuickTree()),
		];
		const states = controls.map(control => {
			widget.show();
			control.show();
			return { supportsWidget: Reflect.has(control, 'widget'), contentAttached: content.isConnected };
		});
		assert.deepStrictEqual(states, controls.map(() => ({ supportsWidget: false, contentAttached: false })));
	});

	test('quick widgets retain their content when shown again without disturbing focus on updates', () => {
		const picker = store.add(controller.createQuickWidget());
		const content = mainWindow.document.createElement('input');
		picker.widget = content;
		picker.show();
		content.focus();
		picker.title = 'Updated title';
		const focusedDuringUpdate = mainWindow.document.activeElement === content;
		picker.hide();
		picker.show();
		assert.deepStrictEqual({
			focusedDuringUpdate,
			reattached: fixture.querySelector('.quick-input-html-widget')?.firstElementChild === content,
		}, { focusedDuringUpdate: true, reattached: true });
	});

	for (const action of ['click', 'next', 'previous']) {
		test(`filtered action headers focus the first visible command (${action})`, async () => {
			controller.layout({ height: 500, width: 600 }, 0);
			const picker = store.add(controller.createQuickPick({ useSeparators: true }));
			picker.sortByLabel = false;
			const visible = { label: 'hit one' };
			const other = { label: 'hit two' };
			picker.items = [
				{ type: 'separator', label: 'Commands', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] },
				{ label: 'hidden command' }, visible,
				{ type: 'separator', label: 'Other commands', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] },
				other,
			];
			picker.value = 'hit';
			picker.show();
			if (action === 'click') {
				fixture.querySelector<HTMLElement>('.quick-input-list-separator-as-item')!.click();
			} else {
				picker.activeItems = [other];
				picker.focus(action === 'next' ? QuickPickFocus.NextSeparator : QuickPickFocus.PreviousSeparator);
			}
			let accepted: string[] = [];
			store.add(picker.onDidAccept(() => accepted = picker.activeItems.map(item => item.label)));
			await controller.accept();
			assert.deepStrictEqual({
				active: picker.activeItems.map(item => item.label),
				accepted,
			}, { active: ['hit one'], accepted: ['hit one'] });
		});
	}

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

	test('next section wraps to the first visible item when filtering hides the original first item', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		const first = { label: 'hit one' };
		const last = { label: 'hit two' };
		picker.items = [{ label: 'hidden' }, first, { type: 'separator' }, last];
		picker.sortByLabel = false;
		picker.value = 'hit';
		picker.show();
		picker.activeItems = [last];
		const active: string[][] = [];
		for (let index = 0; index < 3; index++) {
			picker.focus(QuickPickFocus.NextSeparator);
			active.push(picker.activeItems.map(item => item.label));
		}
		assert.deepStrictEqual(active, [['hit one'], ['hit two'], ['hit one']]);
	});

	test('previous section distinguishes an action section interior, first item, and header', () => {
		controller.layout({ height: 500, width: 600 }, 0);
		const picker = store.add(controller.createQuickPick({ useSeparators: true }));
		const first = { label: 'A1' };
		const second = { label: 'A2' };
		const third = { label: 'B1' };
		const fourth = { label: 'B2' };
		picker.items = [
			{ type: 'separator', label: 'A', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] }, first, second,
			{ type: 'separator', label: 'B', buttons: [{ iconClass: 'codicon-add', tooltip: 'Add' }] }, third, fourth,
		];
		picker.show();
		const list = fixture.querySelector<HTMLElement>('.quick-input-list > .monaco-list')!;
		const tree = getRegisteredLists().find(widget => widget.getHTMLElement() === list);
		if (!(tree instanceof ObjectTree)) {
			throw new Error('Expected the Quick Input tree');
		}
		picker.activeItems = [fourth];
		picker.focus(QuickPickFocus.PreviousSeparator);
		const fromInterior = picker.activeItems.map(item => item.label);
		picker.focus(QuickPickFocus.PreviousSeparator);
		const fromFirstItem = picker.activeItems.map(item => item.label);
		picker.activeItems = [third];
		const header = tree.getParentElement(tree.getFocus()[0]);
		if (!header) {
			throw new Error('Expected an action-bearing section header');
		}
		tree.setFocus([header]);
		picker.focus(QuickPickFocus.PreviousSeparator);
		assert.deepStrictEqual({
			fromInterior,
			fromFirstItem,
			fromHeader: picker.activeItems.map(item => item.label),
		}, { fromInterior: ['B1'], fromFirstItem: ['A1'], fromHeader: ['A1'] });
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

	test('title-bar corners follow the picker frame across radius changes and keep the bottom square', () => {
		const picker = store.add(controller.createQuickWidget());
		picker.title = 'Change group icon';
		picker.widget = mainWindow.document.createElement('div');
		picker.show();
		const frame = fixture.querySelector<HTMLElement>('.quick-input-widget')!;
		const title = fixture.querySelector<HTMLElement>('.quick-input-titlebar')!;
		const corners = () => {
			const frameStyle = mainWindow.getComputedStyle(frame);
			const titleStyle = mainWindow.getComputedStyle(title);
			return {
				left: titleStyle.borderTopLeftRadius === frameStyle.borderTopLeftRadius,
				right: titleStyle.borderTopRightRadius === frameStyle.borderTopRightRadius,
				bottomLeft: titleStyle.borderBottomLeftRadius,
				bottomRight: titleStyle.borderBottomRightRadius,
			};
		};
		const states = [];
		for (const radius of ['12px', '20px']) {
			fixture.style.setProperty('--vscode-cornerRadius-xLarge', radius);
			states.push(corners());
		}
		assert.deepStrictEqual(states, [
			{ left: true, right: true, bottomLeft: '0px', bottomRight: '0px' },
			{ left: true, right: true, bottomLeft: '0px', bottomRight: '0px' },
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

		assert.strictEqual(value, quickpick.value);
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

suite('QuickInput item hover layout', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let controller: QuickInputController;
	let hoverService: HoverService;
	let fixture: HTMLElement;
	let showHoverResult: 'hover' | 'undefined';
	// Quick inputs are disposed (and hidden) before the controller that shows them
	let inputs: DisposableStore;

	setup(() => {
		// Modern UI with motion and without frosted glass, where the entrance animation of the
		// widget makes it a containing block for fixed-position descendants
		fixture = document.createElement('div');
		fixture.classList.add('modern-ui', 'monaco-enable-motion');
		Object.assign(fixture.style, { position: 'fixed', top: '0', left: '0', width: '800px', height: '600px' });
		mainWindow.document.body.appendChild(fixture);
		store.add(toDisposable(() => fixture.remove()));

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IThemeService, new TestThemeService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(IListService, store.add(new ListService()));
		instantiationService.stub(ILayoutService, {
			_serviceBrand: undefined,
			activeContainer: fixture,
			onDidLayoutContainer: Event.None,
			getContainer: () => fixture,
		});
		instantiationService.stub(IContextViewService, store.add(instantiationService.createInstance(ContextViewService)));
		instantiationService.stub(IContextKeyService, store.add(instantiationService.createInstance(ContextKeyService)));
		instantiationService.stub(IContextMenuService, { onDidShowContextMenu: Event.None });
		instantiationService.stub(IKeybindingService, {
			mightProducePrintableCharacter() { return false; },
			softDispatch() { return NoMatchingKb; },
			lookupKeybinding() { return undefined; },
		});
		instantiationService.stub(IMarkdownRendererService, {
			render() { return { element: document.createElement('div'), dispose() { } }; },
			setDefaultCodeBlockRenderer() { }
		});
		hoverService = store.add(instantiationService.createInstance(HoverService));

		inputs = store.add(new DisposableStore());
		showHoverResult = 'hover';
		controller = store.add(instantiationService.createInstance(QuickInputController, {
			container: fixture,
			idPrefix: 'testQuickInputHover',
			ignoreFocusOut() { return true; },
			returnFocus() { },
			backKeybindingLabel() { return undefined; },
			setContextKey() { return undefined; },
			linkOpenerDelegate() { },
			hoverDelegate: {
				showHover(options, focus) {
					return showHoverResult === 'hover' ? hoverService.showInstantHover(options, focus) : undefined;
				},
				delay: 0
			},
			styles: testQuickInputStyles
		}));
		controller.layout({ height: 600, width: 800 }, 0);
	});

	teardown(() => {
		hoverService.hideHover(true);
	});

	function widget(): HTMLElement {
		const element = fixture.querySelector<HTMLElement>('.quick-input-widget');
		assert.ok(element);
		return element;
	}

	async function showPicker(labels: string[]): Promise<IQuickPick<IQuickPickItem>> {
		const picker = inputs.add(controller.createQuickPick<IQuickPickItem>());
		picker.items = labels.map(label => ({ label, tooltip: `Tooltip of ${label}` }));
		picker.show();
		const container = widget();
		// Stands in for `.modern-ui .quick-input-widget { overflow: hidden }` (roundedCorners.css),
		// which lives in the workbench layer
		container.style.overflow = 'hidden';
		// Stylesheets of the test runner load asynchronously
		const loaded = await raceTimeout(new Promise<boolean>(resolve => {
			const check = () => mainWindow.getComputedStyle(container).position === 'absolute' ? resolve(true) : setTimeout(check, 10);
			check();
		}), 2000);
		assert.ok(loaded, 'quickInput.css should be loaded');
		return picker;
	}

	function runningOpenAnimations(): number {
		return widget().getAnimations().filter(a => a instanceof CSSAnimation && a.animationName === 'quick-input-widget-open' && a.playState === 'running').length;
	}

	async function settle(): Promise<void> {
		await raceTimeout(new Promise<void>(resolve => {
			const check = () => runningOpenAnimations() === 0 ? resolve() : setTimeout(check, 10);
			check();
		}), 1000);
	}

	/**
	 * Geometry of the shown item hover relative to the focused row, rounded to whole pixels.
	 */
	function hoverGeometry() {
		const row = fixture.querySelector<HTMLElement>('.quick-input-list .monaco-list-row.focused');
		const hover = fixture.querySelector<HTMLElement>('.workbench-hover');
		const pointer = fixture.querySelector<HTMLElement>('.workbench-hover-pointer');
		if (!row || !hover || !pointer) {
			return { shown: false };
		}
		const rowRect = row.getBoundingClientRect();
		const hoverRect = hover.getBoundingClientRect();
		const pointerRect = pointer.getBoundingClientRect();
		const hit = mainWindow.document.elementFromPoint(hoverRect.left + hoverRect.width / 2, hoverRect.top + hoverRect.height / 2);
		return {
			shown: true,
			besideRow: Math.abs(hoverRect.left - (rowRect.right + 3)) <= 1,
			// The pointer element anchors a 6px caret drawn by its `:after`, centred 3px below its top
			pointerOnRow: Math.abs((pointerRect.top + 3) - (rowRect.top + rowRect.height / 2)) <= 1,
			visible: !!hit && hover.contains(hit),
			notCollapsed: hover.scrollWidth <= hover.clientWidth + 1,
		};
	}

	const expectedGeometry = { shown: true, besideRow: true, pointerOnRow: true, visible: true, notCollapsed: true };

	test('shows the item hover beside its row during and after the entrance animation', async () => {
		await showPicker(['first']);
		controller.toggleHover();
		const duringAnimation = hoverGeometry();
		controller.toggleHover();

		await settle();
		controller.toggleHover();
		const afterAnimation = hoverGeometry();

		assert.deepStrictEqual({ duringAnimation, afterAnimation }, { duringAnimation: expectedGeometry, afterAnimation: expectedGeometry });
	});

	test('does not replay the entrance animation when item hovers are hidden, replaced, fail to show or lose their items', async () => {
		const picker = await showPicker(['first', 'second']);
		const states: { step: string; replaying: boolean; geometry?: ReturnType<typeof hoverGeometry>; hoverShown?: boolean }[] = [];
		const record = (step: string, geometry = true) => states.push({ step, replaying: runningOpenAnimations() > 0, ...(geometry ? { geometry: hoverGeometry() } : {}) });

		controller.toggleHover();
		controller.toggleHover();
		record('toggled off', false);
		controller.toggleHover();
		record('toggled on');

		picker.activeItems = [picker.items[1] as IQuickPickItem];
		record('replaced by next row');

		hoverService.hideHover(true);
		record('hidden externally', false);

		showHoverResult = 'undefined';
		controller.toggleHover();
		controller.toggleHover();
		record('failed to show', false);

		showHoverResult = 'hover';
		controller.toggleHover();
		record('shown before removal');
		picker.items = [];
		states.push({ step: 'items removed while shown', replaying: runningOpenAnimations() > 0, hoverShown: !!fixture.querySelector('.workbench-hover') });
		picker.items = [{ label: 'third', tooltip: 'Tooltip of third' }];
		controller.toggleHover();
		record('reopened for new items');

		assert.deepStrictEqual(states, [
			{ step: 'toggled off', replaying: false },
			{ step: 'toggled on', replaying: false, geometry: expectedGeometry },
			{ step: 'replaced by next row', replaying: false, geometry: expectedGeometry },
			{ step: 'hidden externally', replaying: false },
			{ step: 'failed to show', replaying: false },
			{ step: 'shown before removal', replaying: false, geometry: expectedGeometry },
			{ step: 'items removed while shown', replaying: false, hoverShown: false },
			{ step: 'reopened for new items', replaying: false, geometry: expectedGeometry },
		]);
	});

	test('renders the item hover in a viewport-sized host inside the list that only the hover receives pointer events in', async () => {
		await showPicker(['first']);
		await settle();
		controller.toggleHover();

		const hover = fixture.querySelector<HTMLElement>('.workbench-hover');
		const contextView = hover?.closest<HTMLElement>('.context-view');
		const host = contextView?.parentElement;
		assert.ok(hover && contextView && host);
		const hostRect = host.getBoundingClientRect();
		const contextViewStyle = mainWindow.getComputedStyle(contextView);
		const hostStyle = mainWindow.getComputedStyle(host);

		assert.deepStrictEqual({
			hostClass: host.classList.contains('quick-input-list-hover-host'),
			hostInList: !!host.parentElement?.classList.contains('quick-input-list'),
			hostCoversViewport: hostRect.left === 0 && hostRect.top === 0 && hostRect.width === mainWindow.innerWidth && hostRect.height === mainWindow.innerHeight,
			hostPointerEvents: hostStyle.pointerEvents,
			contextViewPosition: contextViewStyle.position,
			contextViewFixedClass: contextView.classList.contains('fixed'),
			contextViewPointerEvents: contextViewStyle.pointerEvents,
		}, {
			hostClass: true,
			hostInList: true,
			hostCoversViewport: true,
			hostPointerEvents: 'none',
			contextViewPosition: 'absolute',
			contextViewFixedClass: false,
			contextViewPointerEvents: 'auto',
		});
	});

	test('keeps the item hover above positioned list contents such as sticky headers and the scrollbar', async () => {
		await showPicker(['first']);
		await settle();
		controller.toggleHover();
		const hover = fixture.querySelector<HTMLElement>('.workbench-hover');
		const list = fixture.querySelector<HTMLElement>('.quick-input-list');
		assert.ok(hover && list);

		// Stands in for the list's sticky headers (z-index: 13) and scrollbar (z-index: 14) overlapping the hover
		const rect = hover.getBoundingClientRect();
		const overlay = append(list, $('div'));
		Object.assign(overlay.style, { position: 'fixed', zIndex: '14', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
		const hit = mainWindow.document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
		overlay.remove();

		assert.strictEqual(!!hit && hover.contains(hit), true);
	});

	test('dismisses the item hover when the picker moves and keeps it when relaid out in place', async () => {
		await showPicker(['first']);
		await settle();
		controller.toggleHover();
		const shown = hoverGeometry();

		controller.layout({ height: 600, width: 800 }, 0);
		const relaidOutInPlace = hoverGeometry();

		// A different size re-centres the picker, which a viewport-positioned hover would not follow
		controller.layout({ height: 600, width: 700 }, 0);
		const afterMove = hoverGeometry();

		controller.toggleHover();
		const reopened = hoverGeometry();

		assert.deepStrictEqual({ shown, relaidOutInPlace, afterMove, reopened }, {
			shown: expectedGeometry,
			relaidOutInPlace: expectedGeometry,
			afterMove: { shown: false },
			reopened: expectedGeometry,
		});
	});

	test('returns focus to where it was when the picker moves while the item hover has focus', async () => {
		await showPicker(['first']);
		await settle();
		const focusedBeforeHover = mainWindow.document.activeElement;
		controller.toggleHover();
		const hover = fixture.querySelector<HTMLElement>('.monaco-hover');
		assert.ok(hover);
		hover.focus();
		const hoverFocused = mainWindow.document.activeElement === hover;

		controller.layout({ height: 600, width: 700 }, 0);

		assert.deepStrictEqual({
			focusedBeforeHoverInPicker: !!focusedBeforeHover && widget().contains(focusedBeforeHover),
			hoverFocused,
			hoverShown: !!fixture.querySelector('.workbench-hover'),
			focusReturned: mainWindow.document.activeElement === focusedBeforeHover,
		}, { focusedBeforeHoverInPicker: true, hoverFocused: true, hoverShown: false, focusReturned: true });
	});

	test('keeps the widget settled when a visible picker is replaced and animates a new show', async () => {
		await showPicker(['first']);
		await settle();

		const pickerB = inputs.add(controller.createQuickPick<IQuickPickItem>());
		pickerB.items = [{ label: 'second', tooltip: 'Tooltip of second' }];
		pickerB.show();
		const replacedByPicker = runningOpenAnimations() > 0;
		controller.toggleHover();
		const geometryAfterReplacement = hoverGeometry();
		controller.toggleHover();

		const inputBox = inputs.add(controller.createInputBox());
		inputBox.show();
		const replacedByInputBox = runningOpenAnimations() > 0;

		inputBox.hide();
		// The settled marker must not suppress the close animation
		const animatesClose = widget().getAnimations().some(a => a instanceof CSSAnimation && a.animationName === 'quick-input-widget-close');
		await raceTimeout(new Promise<void>(resolve => {
			const check = () => widget().style.display === 'none' ? resolve() : setTimeout(check, 10);
			check();
		}), 1000);
		const pickerC = inputs.add(controller.createQuickPick<IQuickPickItem>());
		pickerC.items = [{ label: 'third' }];
		pickerC.show();
		const animatesNewShow = runningOpenAnimations() > 0;

		assert.deepStrictEqual({ replacedByPicker, geometryAfterReplacement, replacedByInputBox, animatesClose, animatesNewShow }, {
			replacedByPicker: false,
			geometryAfterReplacement: expectedGeometry,
			replacedByInputBox: false,
			animatesClose: true,
			animatesNewShow: true,
		});
	});
});
