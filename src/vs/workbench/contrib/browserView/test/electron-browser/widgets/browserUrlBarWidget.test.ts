/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import {
	IQuickInput,
	IQuickInputButton,
	IQuickInputService,
	IQuickPick,
	IQuickPickDidAcceptEvent,
	IQuickPickItem,
	IQuickPickItemButtonEvent,
	IQuickPickSeparator,
	IQuickPickSeparatorButtonEvent,
	QuickInputHideReason,
} from '../../../../../../platform/quickinput/common/quickInput.js';
import { BrowserEditorContribution, IBrowserUrlPickerActionProvider, IBrowserUrlSuggestionProvider } from '../../../electron-browser/browserEditor.js';
import { BrowserEditorInput } from '../../../common/browserEditorInput.js';
import { BrowserUrlBarWidget, IBrowserUrlBarHost } from '../../../electron-browser/widgets/browserUrlBarWidget.js';

class FakeQuickPick<T extends IQuickPickItem> extends Disposable {
	placeholder: string | undefined;
	ignoreFocusOut = false;
	sortByLabel = true;
	matchOnDescription = false;
	anchor: HTMLElement | { x: number; y: number } | undefined;
	anchorPosition: 'above' | 'below' | 'overlay' | undefined;
	value = '';
	valueSelection: Readonly<[number, number]> | undefined;
	items: ReadonlyArray<T | IQuickPickSeparator> = [];
	activeItems: ReadonlyArray<T> = [];
	buttons: ReadonlyArray<IQuickInputButton> = [];

	visible = false;

	private readonly _onWillHide = this._register(new Emitter<{ reason: QuickInputHideReason }>());
	readonly onWillHide = this._onWillHide.event;
	private readonly _onDidChangeValue = this._register(new Emitter<string>());
	readonly onDidChangeValue = this._onDidChangeValue.event;
	private readonly _onDidTriggerButton = this._register(new Emitter<IQuickInputButton>());
	readonly onDidTriggerButton = this._onDidTriggerButton.event;
	private readonly _onDidTriggerItemButton = this._register(new Emitter<IQuickPickItemButtonEvent<T>>());
	readonly onDidTriggerItemButton = this._onDidTriggerItemButton.event;
	private readonly _onDidTriggerSeparatorButton = this._register(new Emitter<IQuickPickSeparatorButtonEvent>());
	readonly onDidTriggerSeparatorButton = this._onDidTriggerSeparatorButton.event;
	private readonly _onDidAccept = this._register(new Emitter<IQuickPickDidAcceptEvent>());
	readonly onDidAccept = this._onDidAccept.event;
	private readonly _onDidHide = this._register(new Emitter<{ reason: QuickInputHideReason }>());
	readonly onDidHide = this._onDidHide.event;

	show(): void { this.visible = true; }
	hide(reason: QuickInputHideReason = QuickInputHideReason.Other): void {
		if (!this.visible) {
			return;
		}
		this.visible = false;
		this._onWillHide.fire({ reason });
		this._onDidHide.fire({ reason });
	}

	type(value: string): void {
		this.value = value;
		this._onDidChangeValue.fire(value);
	}

	accept(): void {
		this._onDidAccept.fire({ inBackground: false });
	}

	triggerButton(button: IQuickInputButton): void {
		this._onDidTriggerButton.fire(button);
	}

	triggerItemButton(item: T, button: IQuickInputButton): void {
		this._onDidTriggerItemButton.fire({ item, button });
	}

	triggerSeparatorButton(separator: IQuickPickSeparator, button: IQuickInputButton): void {
		this._onDidTriggerSeparatorButton.fire({ separator, button });
	}
}

function asPicker<T extends IQuickPickItem>(fake: FakeQuickPick<T>): IQuickPick<T, { useSeparators: true }> {
	return fake as unknown as IQuickPick<T, { useSeparators: true }>;
}

function asInput(state: { url: string; navigate(url: string): void }): BrowserEditorInput {
	return state as unknown as BrowserEditorInput;
}

suite('BrowserUrlBarWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestHarness {
		readonly widget: BrowserUrlBarWidget;
		readonly picker: FakeQuickPick<IQuickPickItem>;
		readonly display: HTMLElement;
		readonly inputState: { url: string; navigate(url: string): void };
		readonly navigated: readonly string[];
		readonly ensureBrowserFocusCalls: () => number;
		/** Simulate another picker (e.g. command palette) taking over. */
		setReplaced(active: boolean): void;
	}

	function makeHarness(): ITestHarness {
		const picker = new FakeQuickPick<IQuickPickItem>();
		// Ensure the picker hides before the widget is disposed so the widget's
		// per-picker DisposableStore (released in onDidHide) doesn't leak.
		store.add({
			dispose: () => {
				if (picker.visible) {
					picker.hide();
				}
				picker.dispose();
			},
		});

		let replacementActive = false;
		const quickInputService: Partial<IQuickInputService> = {
			get currentQuickInput(): IQuickInput | undefined {
				if (replacementActive) {
					return {} as unknown as IQuickInput;
				}
				return picker.visible ? asPicker(picker) as unknown as IQuickInput : undefined;
			},
			createQuickPick: ((..._args: unknown[]) => asPicker(picker)) as IQuickInputService['createQuickPick'],
		};

		const navigated: string[] = [];
		const inputState = {
			url: 'https://example.com/',
			navigate(url: string) { navigated.push(url); },
		};

		let ensureBrowserFocusCalls = 0;
		const host: IBrowserUrlBarHost = {
			get input() { return asInput(inputState); },
			ensureBrowserFocus() { ensureBrowserFocusCalls++; },
		};

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IQuickInputService, quickInputService);

		const widget = store.add(instantiationService.createInstance(BrowserUrlBarWidget, host));
		widget.mountContributions([]);
		mainWindow.document.body.appendChild(widget.element);
		store.add({ dispose: () => widget.element.remove() });

		const display = widget.element.querySelector('.browser-url-display') as HTMLElement;

		return {
			widget,
			picker,
			display,
			inputState,
			navigated,
			ensureBrowserFocusCalls: () => ensureBrowserFocusCalls,
			setReplaced: (active: boolean) => { replacementActive = active; },
		};
	}

	function mountSuggestionProvider(widget: BrowserUrlBarWidget, provider: IBrowserUrlSuggestionProvider): void {
		const contribution = {
			widgets: [],
			urlRenderers: [],
			urlSuggestionProviders: [provider],
			urlPickerActionProviders: [],
		} as unknown as BrowserEditorContribution;
		widget.mountContributions([contribution]);
	}

	function mountPickerActionProvider(widget: BrowserUrlBarWidget, provider: IBrowserUrlPickerActionProvider): void {
		const contribution = {
			widgets: [],
			urlRenderers: [],
			urlSuggestionProviders: [],
			urlPickerActionProviders: [provider],
		} as unknown as BrowserEditorContribution;
		widget.mountContributions([contribution]);
	}

	test('initial render shows the canonical URL', () => {
		const { display } = makeHarness();
		assert.strictEqual(display.textContent, 'https://example.com/');
	});

	test('refreshUrl updates the display when the input URL changes', () => {
		const { widget, display, inputState } = makeHarness();
		inputState.url = 'https://newsite.test/path';
		widget.refreshUrl();
		assert.strictEqual(display.textContent, 'https://newsite.test/path');
	});

	test('previewUrl renders an override URL while not editing', () => {
		const { widget, display } = makeHarness();
		widget.previewUrl('https://preview.test/');
		assert.strictEqual(display.textContent, 'https://preview.test/');
	});

	test('previewUrl is a no-op while the picker is open', () => {
		const { widget, display } = makeHarness();
		widget.openUrlPicker();
		widget.previewUrl('https://should-not-show.test/');
		assert.strictEqual(display.textContent, 'https://example.com/');
	});

	test('openUrlPicker shows a picker pre-filled with the canonical URL', () => {
		const { widget, picker } = makeHarness();
		widget.openUrlPicker();
		assert.deepStrictEqual(
			{
				visible: picker.visible,
				value: picker.value,
				valueSelection: picker.valueSelection,
				anchorPosition: picker.anchorPosition,
			},
			{
				visible: true,
				value: 'https://example.com/',
				valueSelection: [0, 'https://example.com/'.length],
				anchorPosition: 'overlay',
			},
		);
	});

	test('accepting the "Go to" item navigates to the typed value', () => {
		const { widget, picker, navigated } = makeHarness();
		widget.openUrlPicker();
		picker.type('https://target.test/page');
		picker.activeItems = [picker.items.find((i): i is IQuickPickItem => i.type !== 'separator')!];
		picker.accept();
		assert.deepStrictEqual(navigated, ['https://target.test/page']);
	});

	test('accepting a contributed suggestion calls its apply with the input', async () => {
		const harness = makeHarness();
		const { widget, picker, inputState } = harness;
		const applyCalls: BrowserEditorInput[] = [];
		mountSuggestionProvider(widget, {
			async getSuggestions() {
				return [{
					id: 'sugg-1',
					label: 'Suggestion',
					apply(input) { applyCalls.push(input); },
				}];
			},
		});

		widget.openUrlPicker();
		// Let the async provider load run.
		await new Promise(resolve => setTimeout(resolve, 0));
		const suggestion = picker.items.find((i): i is IQuickPickItem => i.type !== 'separator' && i.id === 'sugg-1');
		assert.ok(suggestion, 'suggestion item should be present');
		picker.activeItems = [suggestion];
		picker.accept();
		assert.strictEqual(applyCalls.length, 1);
		assert.strictEqual(applyCalls[0], asInput(inputState));
	});

	test('hiding after an accept reverts to canonical and releases focus to the page', () => {
		const harness = makeHarness();
		const { widget, picker, display } = harness;
		widget.openUrlPicker();
		picker.type('https://typed.test/');
		picker.accept(); // onDidAccept handler calls picker.hide() synchronously
		assert.deepStrictEqual(
			{
				display: display.textContent,
				visible: picker.visible,
				ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls(),
			},
			{
				display: 'https://example.com/',
				visible: false,
				ensureBrowserFocusCalls: 1,
			},
		);
	});

	test('hiding on Blur reverts to canonical without releasing focus to the page', () => {
		const harness = makeHarness();
		const { widget, picker, display } = harness;
		widget.openUrlPicker();
		picker.type('https://abandoned.test/');
		picker.hide(QuickInputHideReason.Blur);
		assert.deepStrictEqual(
			{
				display: display.textContent,
				visible: picker.visible,
				ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls(),
			},
			{
				display: 'https://example.com/',
				visible: false,
				ensureBrowserFocusCalls: 0,
			},
		);
	});

	test('clear hides the picker and reverts the display', () => {
		const { widget, picker, display } = makeHarness();
		widget.openUrlPicker();
		picker.type('https://wip.test/');
		widget.clear();
		assert.deepStrictEqual(
			{ display: display.textContent, visible: picker.visible },
			{ display: 'https://example.com/', visible: false },
		);
	});

	test('typing in the picker mirrors into the display', () => {
		const { widget, picker, display } = makeHarness();
		widget.openUrlPicker();
		picker.type('https://typing.test/');
		assert.strictEqual(display.textContent, 'https://typing.test/');
	});

	test('dismissal without action refocuses the display and preserves the typed text', () => {
		const harness = makeHarness();
		const { widget, picker, display } = harness;
		widget.openUrlPicker();
		picker.type('https://in-progress.test/');
		picker.hide(QuickInputHideReason.Other);
		assert.deepStrictEqual(
			{
				display: display.textContent,
				active: display.ownerDocument.activeElement === display,
				ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls(),
			},
			{
				display: 'https://in-progress.test/',
				active: true,
				ensureBrowserFocusCalls: 0,
			},
		);
	});

	test('a replaced picker reverts the display and suppresses the next focus-open', () => {
		const { widget, picker, display, setReplaced } = makeHarness();
		widget.openUrlPicker();
		picker.type('https://abandoned.test/');
		setReplaced(true);
		picker.hide(QuickInputHideReason.Other);
		// Display has reverted to canonical; refocusing the display (which is
		// what the QuickInputController does on the replacement's hide) must
		// NOT reopen the picker thanks to the armed suppress flag.
		display.focus();
		assert.deepStrictEqual(
			{ display: display.textContent, pickerVisible: picker.visible },
			{ display: 'https://example.com/', pickerVisible: false },
		);
	});

	test('accept with no active item navigates to the picker value', () => {
		const { widget, picker, navigated } = makeHarness();
		widget.openUrlPicker();
		picker.type('https://fallback.test/');
		picker.activeItems = [];
		picker.accept();
		assert.deepStrictEqual(navigated, ['https://fallback.test/']);
	});

	test('refreshUrl while the picker is open mirrors the canonical URL into the picker value', () => {
		const { widget, picker, inputState } = makeHarness();
		widget.openUrlPicker();
		inputState.url = 'https://changed.test/';
		widget.refreshUrl();
		assert.strictEqual(picker.value, 'https://changed.test/');
	});

	test('triggering a picker chrome button runs the action and releases focus on hide', () => {
		const harness = makeHarness();
		const { widget, picker } = harness;
		const runCalls: BrowserEditorInput[] = [];
		const action: IQuickInputButton & { id: string; run(input: BrowserEditorInput): void } = {
			id: 'bookmark-toggle',
			tooltip: 'Toggle bookmark',
			iconClass: 'icon',
			run(input) { runCalls.push(input); },
		};
		mountPickerActionProvider(widget, { getActions: () => [action] });

		widget.openUrlPicker();
		picker.triggerButton(action);
		picker.hide(QuickInputHideReason.Other);
		assert.deepStrictEqual(
			{
				runCount: runCalls.length,
				calledWithInput: runCalls[0] === asInput(harness.inputState),
				ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls(),
			},
			{ runCount: 1, calledWithInput: true, ensureBrowserFocusCalls: 1 },
		);
	});

	test('triggering a per-item button runs the action without dismissing the picker', async () => {
		const harness = makeHarness();
		const { widget, picker, inputState } = harness;
		const runCalls: BrowserEditorInput[] = [];
		const itemAction = {
			id: 'delete-bookmark',
			tooltip: 'Delete bookmark',
			iconClass: 'icon',
			run(input: BrowserEditorInput) { runCalls.push(input); },
		};
		mountSuggestionProvider(widget, {
			async getSuggestions() {
				return [{
					id: 'sugg-2',
					label: 'Bookmark',
					apply() { },
					actions: [itemAction],
				}];
			},
		});
		widget.openUrlPicker();
		await new Promise(resolve => setTimeout(resolve, 0));
		const suggestion = picker.items.find((i): i is IQuickPickItem => i.type !== 'separator' && i.id === 'sugg-2')!;
		picker.triggerItemButton(suggestion, itemAction);
		assert.deepStrictEqual(
			{
				runCount: runCalls.length,
				calledWithInput: runCalls[0] === asInput(inputState),
				pickerVisible: picker.visible,
			},
			{ runCount: 1, calledWithInput: true, pickerVisible: true },
		);
	});

	test('pressing Enter on the display navigates and preserves the typed text through the subsequent blur', () => {
		const harness = makeHarness();
		const { widget, display, navigated } = harness;
		widget.focusUrlInput();
		display.textContent = 'https://typed-into-display.test/';
		// `StandardKeyboardEvent` reads the (deprecated) numeric `keyCode`,
		// so pass it explicitly (Enter == 13) rather than relying on `key`.
		display.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 13, key: 'Enter', bubbles: true, cancelable: true } as KeyboardEventInit));
		display.blur();
		// `model.url` (canonical) hasn't caught up to the typed URL yet, but
		// the BLUR-revert should be suppressed for an Enter-commit so the
		// destination stays visible until the navigation commits.
		assert.deepStrictEqual(
			{
				navigated: [...navigated],
				display: display.textContent,
				ensureBrowserFocusCalls: harness.ensureBrowserFocusCalls(),
			},
			{
				navigated: ['https://typed-into-display.test/'],
				display: 'https://typed-into-display.test/',
				ensureBrowserFocusCalls: 1,
			},
		);
	});

	test('suggestion provider onDidChange reruns the load', async () => {
		const { widget, picker } = makeHarness();
		const refresh = new Emitter<void>();
		store.add(refresh);
		let counter = 0;
		mountSuggestionProvider(widget, {
			onDidChange: refresh.event,
			async getSuggestions() {
				counter++;
				return [{
					id: `sugg-${counter}`,
					label: `Suggestion ${counter}`,
					apply() { },
				}];
			},
		});

		widget.openUrlPicker();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.ok(picker.items.some(i => i.type !== 'separator' && i.id === 'sugg-1'), 'initial suggestion present');

		refresh.fire();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.ok(picker.items.some(i => i.type !== 'separator' && i.id === 'sugg-2'), 'refreshed suggestion present');
	});

	test('streamed-in suggestions are never auto-focused; the default item stays active', async () => {
		const { widget, picker } = makeHarness();
		mountSuggestionProvider(widget, {
			async getSuggestions() {
				return [{ id: 'tab-1', label: 'A tab', apply() { } }];
			},
		});

		widget.openUrlPicker();
		picker.type('https://typed.test/');
		// The synchronous default item ("Go to <value>") is the active item.
		assert.strictEqual(picker.activeItems[0]?.id, 'https://typed.test/');

		// Once the asynchronous suggestion streams in, focus must NOT jump to it.
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.ok(picker.items.some(i => i.type !== 'separator' && i.id === 'tab-1'), 'suggestion streamed in');
		assert.strictEqual(picker.activeItems[0]?.id, 'https://typed.test/');
	});

	test('background refresh preserves the user selection but typing resets to the default', async () => {
		const { widget, picker } = makeHarness();
		const refresh = new Emitter<void>();
		store.add(refresh);
		mountSuggestionProvider(widget, {
			onDidChange: refresh.event,
			async getSuggestions() {
				return [{ id: 'tab-1', label: 'A tab', apply() { } }];
			},
		});

		widget.openUrlPicker();
		picker.type('https://typed.test/');
		await new Promise(resolve => setTimeout(resolve, 0));

		// User arrow-keys onto the streamed-in suggestion.
		const suggestion = picker.items.find((i): i is IQuickPickItem => i.type !== 'separator' && i.id === 'tab-1')!;
		picker.activeItems = [suggestion];

		// A background provider refresh must keep the user's selection.
		refresh.fire();
		await new Promise(resolve => setTimeout(resolve, 0));
		assert.strictEqual(picker.activeItems[0]?.id, 'tab-1', 'background refresh preserves selection');

		// Typing, however, resets focus back to the default "Go to" item.
		picker.type('https://typed.test/x');
		assert.strictEqual(picker.activeItems[0]?.id, 'https://typed.test/x', 'typing resets to the default item');
	});
});
