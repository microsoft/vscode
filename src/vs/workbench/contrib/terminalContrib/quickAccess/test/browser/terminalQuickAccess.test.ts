/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICodeEditorService } from '../../../../../../editor/browser/services/codeEditorService.js';
import { CopyAction } from '../../../../../../editor/contrib/clipboard/browser/clipboard.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IPickerQuickAccessItem, TriggerAction } from '../../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IInputBox, IQuickInput, IQuickInputHideEvent, IQuickInputService, IQuickPick, IQuickPickDidAcceptEvent, IQuickPickSeparator, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalEditingService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalInstanceService, ITerminalService } from '../../../../terminal/browser/terminal.js';
import '../../../../terminal/browser/terminal.contribution.js';
import { ITerminalProfileResolverService, ITerminalProfileService, TerminalCommandId } from '../../../../terminal/common/terminal.js';
import { TerminalQuickAccessProvider } from '../../browser/terminalQuickAccess.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../platform/notification/test/common/testNotificationService.js';
import { IQuickAccessController } from '../../../../../../platform/quickinput/common/quickAccess.js';
import { getInstanceFromResource } from '../../../../terminal/browser/terminalUri.js';
import '../../browser/terminal.quickAccess.contribution.js';

suite('TerminalQuickAccess', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const keyMods = { ctrlCmd: false, alt: false, shift: false };
	let provider: TestTerminalQuickAccessProvider;
	let terminals: ITerminalInstance[];
	let groups: ITerminalGroup[];
	let editors: ITerminalInstance[];
	let foreground: ITerminalInstance[];
	let activeTerminal: ITerminalInstance | undefined;
	let focused: number[];
	let disposed: number[];
	let closed: Set<number>;
	let commands: { id: string; args: unknown[] }[];
	let backgroundPanels: boolean[];
	let backgroundEditors: number[];
	let instantiationService: TestInstantiationService;
	let currentQuickInput: IQuickInput | undefined;
	let pickerSession: IDisposable | undefined;
	let renameInputs: TestInputBox[];
	let restoredPickers: TestQuickPick[];
	let clipboardWrites: string[];
	let nativeCopies: number;

	class TestTerminalQuickAccessProvider extends TerminalQuickAccessProvider {
		getPicks(filter = '') {
			return this._getPicks(filter);
		}
	}

	class TestQuickPick extends mock<IQuickPick<IPickerQuickAccessItem, { useSeparators: true }>>() {
		readonly changeValue = store.add(new Emitter<string>());
		readonly accept = store.add(new Emitter<IQuickPickDidAcceptEvent>());
		readonly changeActive = store.add(new Emitter<readonly IPickerQuickAccessItem[]>());
		override readonly onDidChangeValue = this.changeValue.event;
		override readonly onDidAccept = this.accept.event;
		override readonly onDidChangeActive = this.changeActive.event;
		override readonly onDidTriggerItemButton = Event.None;
		override readonly onDidTriggerSeparatorButton = Event.None;
		override value = 'term ';
		override items: readonly (IPickerQuickAccessItem | IQuickPickSeparator)[] = [];
		override activeItems: readonly IPickerQuickAccessItem[] = [];
		override selectedItems: readonly IPickerQuickAccessItem[] = [];
		override readonly keyMods = keyMods;
		override valueSelection: Readonly<[number, number]> | undefined = [5, 5];
		inputFocused = true;
		override inputHasFocus(): boolean { return this.inputFocused; }
		hidden = false;
		override hide(): void { this.hidden = true; }
	}

	class TestInputBox extends mock<IInputBox>() {
		readonly accepted = store.add(new Emitter<void>());
		readonly hidden = store.add(new Emitter<IQuickInputHideEvent>());
		override readonly onDidAccept = this.accepted.event;
		override readonly onDidHide = this.hidden.event;
		override value = '';
		override prompt: string | undefined;
		visible = false;
		override show(): void {
			currentQuickInput?.hide();
			pickerSession?.dispose();
			pickerSession = undefined;
			this.visible = true;
			currentQuickInput = this;
		}
		override hide(): void { this.hideWithReason(QuickInputHideReason.Other); }
		hideWithReason(reason: QuickInputHideReason): void {
			if (!this.visible) {
				return;
			}
			this.visible = false;
			if (currentQuickInput === this) {
				currentQuickInput = undefined;
			}
			this.hidden.fire({ reason });
		}
		override dispose(): void { this.hide(); }
	}

	function openPicker(value = 'term '): TestQuickPick {
		const picker = new TestQuickPick();
		picker.value = value;
		currentQuickInput = picker;
		pickerSession = store.add(provider.provide(picker, CancellationToken.None));
		return picker;
	}

	setup(() => {
		focused = [];
		disposed = [];
		closed = new Set();
		commands = [];
		backgroundPanels = [];
		backgroundEditors = [];
		currentQuickInput = undefined;
		pickerSession = undefined;
		renameInputs = [];
		restoredPickers = [];
		clipboardWrites = [];
		nativeCopies = 0;
		terminals = [3, 12, 21, 99].map(id => new class extends mock<ITerminalInstance>() {
			override readonly instanceId = id;
			override title = id === 99 ? 'Editor shell' : id === 21 ? 'Build' : 'Shell';
			override description = id === 3 ? 'src' : id === 21 ? 'Task' : '';
			override readonly resource = URI.parse(`vscode-terminal:/workspace/${id}`);
			override target = id === 99 ? TerminalLocation.Editor : TerminalLocation.Panel;
			override icon = id === 12 ? URI.file('/terminal-icon.svg') : Codicon.rocket;
			override readonly color = id === 3 ? 'terminal.ansiRed' : undefined;
			override get isDisposed() { return closed.has(id); }
			override rename(title: string): void { this.title = title; }
		}());
		groups = [
			new class extends mock<ITerminalGroup>() { override readonly terminalInstances = terminals.slice(0, 2); }(),
			new class extends mock<ITerminalGroup>() { override readonly terminalInstances = [terminals[2]]; }()
		];
		editors = [terminals[3]];
		foreground = [...terminals];
		activeTerminal = terminals[1];
		instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IQuickInputService, {
			get currentQuickInput() { return currentQuickInput; },
			createInputBox: () => {
				const input = new TestInputBox();
				renameInputs.push(input);
				return input;
			},
			quickAccess: {
				show: value => { restoredPickers.push(openPicker(value)); },
				pick: async () => undefined
			}
		});
		instantiationService.stub(IClipboardService, { writeText: async text => { clipboardWrites.push(text); } });
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IContextKeyService, {});
		instantiationService.stub(ICodeEditorService, { getFocusedCodeEditor: () => null });
		ok(CopyAction);
		store.add(CopyAction.addImplementation(109, 'test-native-copy', () => { nativeCopies++; return true; }));
		instantiationService.stub(ICommandService, {
			executeCommand: async (id, ...args) => {
				commands.push({ id, args });
				if (id === TerminalCommandId.CopyInstanceId) {
					const command = CommandsRegistry.getCommand(id);
					ok(command);
					await instantiationService.invokeFunction(accessor => command.handler(accessor, ...args));
				}
				return undefined;
			}
		});
		instantiationService.stub(IEditorService, { findEditors: () => [] });
		instantiationService.stub(ITerminalGroupService, {
			get groups() { return groups; },
			setActiveInstance: () => { },
			showPanel: async focus => { backgroundPanels.push(!!focus); }
		});
		instantiationService.stub(ITerminalEditorService, {
			get instances() { return editors; },
			openEditor: async terminal => { backgroundEditors.push(terminal.instanceId); },
			setActiveInstance: () => { }
		});
		instantiationService.stub(ITerminalService, {
			get activeInstance() { return activeTerminal; },
			get foregroundInstances() { return foreground; },
			getInstanceFromId: id => foreground.find(terminal => terminal.instanceId === id),
			focusInstance: async terminal => { focused.push(terminal.instanceId); },
			safeDisposeTerminal: async terminal => { disposed.push(terminal.instanceId); }
		});
		instantiationService.stub(ITerminalProfileResolverService, { getDefaultIcon: () => Codicon.terminal });
		instantiationService.stub(ITerminalConfigurationService, {});
		instantiationService.stub(ITerminalInstanceService, {});
		instantiationService.stub(ITerminalEditingService, {});
		instantiationService.stub(ITerminalProfileService, {});
		instantiationService.stub(IThemeService, { getColorTheme: () => new TestColorTheme({ 'terminal.ansiRed': '#ff0000' }) });
		provider = store.add(instantiationService.createInstance(TestTerminalQuickAccessProvider));
	});

	function terminalPicks(filter = ''): IPickerQuickAccessItem[] {
		return provider.getPicks(filter).items.filter((item): item is IPickerQuickAccessItem => item.type !== 'separator' && item.description !== undefined);
	}

	async function copy(): Promise<void> {
		ok(CopyAction);
		await CopyAction.runCommand(instantiationService, undefined);
	}

	test('copies the highlighted pane or editor ID without accepting or focusing it', async () => {
		const picker = currentQuickInput = new TestQuickPick();
		store.add(provider.provide(picker, CancellationToken.None));
		await copy();
		picker.activeItems = [terminalPicks()[3]];
		await copy();
		deepStrictEqual({ clipboardWrites, nativeCopies, focused, hidden: picker.hidden }, {
			clipboardWrites: ['12', '99'], nativeCopies: 0, focused: [], hidden: false
		});
	});

	function copyFromBrowser(target: HTMLElement): ClipboardEvent {
		const event = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true });
		target.dispatchEvent(event);
		return event;
	}

	function createCopyInput(): HTMLInputElement {
		const widget = document.createElement('div');
		widget.className = 'quick-input-widget';
		const input = document.createElement('input');
		input.value = 'term Build';
		input.setSelectionRange(5, 5);
		widget.appendChild(input);
		document.body.appendChild(widget);
		store.add(toDisposable(() => widget.remove()));
		input.focus();
		return input;
	}

	test('copies the highlighted terminal through the browser copy event without a command keybinding', () => {
		const picker = openPicker();
		const input = createCopyInput();
		const event = copyFromBrowser(input);
		deepStrictEqual({ text: event.clipboardData?.getData('text/plain'), prevented: event.defaultPrevented, clipboardWrites, focused, hidden: picker.hidden }, {
			text: '12', prevented: true, clipboardWrites: [], focused: [], hidden: false
		});
	});

	test('leaves browser copying of selected search text unchanged', () => {
		const picker = openPicker();
		picker.valueSelection = [0, 4];
		const event = copyFromBrowser(createCopyInput());
		deepStrictEqual({ text: event.clipboardData?.getData('text/plain'), prevented: event.defaultPrevented }, { text: '', prevented: false });
	});

	test('does not intercept browser copy outside this picker or after disposal', () => {
		openPicker();
		const input = createCopyInput();
		const outside = document.createElement('input');
		document.body.appendChild(outside);
		store.add(toDisposable(() => outside.remove()));
		const outsideEvent = copyFromBrowser(outside);
		pickerSession?.dispose();
		const disposedEvent = copyFromBrowser(input);
		deepStrictEqual([outsideEvent, disposedEvent].map(event => ({ text: event.clipboardData?.getData('text/plain'), prevented: event.defaultPrevented })), [
			{ text: '', prevented: false }, { text: '', prevented: false }
		]);
	});

	test('preserves native copying of selected search text', async () => {
		const picker = currentQuickInput = new TestQuickPick();
		store.add(provider.provide(picker, CancellationToken.None));
		picker.valueSelection = [0, 4];
		await copy();
		deepStrictEqual({ clipboardWrites, nativeCopies, hidden: picker.hidden }, { clipboardWrites: [], nativeCopies: 1, hidden: false });
	});

	test('copies the row ID when the list has focus despite a retained input selection', async () => {
		const picker = currentQuickInput = new TestQuickPick();
		store.add(provider.provide(picker, CancellationToken.None));
		picker.valueSelection = [0, 4];
		picker.inputFocused = false;
		await copy();
		deepStrictEqual(clipboardWrites, ['12']);
	});

	test('does not copy IDs from creation rows, empty selection, or closed terminals', async () => {
		const picker = currentQuickInput = new TestQuickPick();
		store.add(provider.provide(picker, CancellationToken.None));
		const picks = provider.getPicks().items;
		picker.activeItems = [picks[picks.length - 1] as IPickerQuickAccessItem];
		await copy();
		picker.activeItems = [];
		await copy();
		picker.activeItems = [terminalPicks()[0]];
		closed.add(3);
		await copy();
		deepStrictEqual({ clipboardWrites, nativeCopies }, { clipboardWrites: [], nativeCopies: 3 });
	});

	test('leaves other pickers and copying after disposal unchanged', async () => {
		const picker = currentQuickInput = new TestQuickPick();
		const session = store.add(provider.provide(picker, CancellationToken.None));
		currentQuickInput = new TestQuickPick();
		await copy();
		currentQuickInput = picker;
		session.dispose();
		await copy();
		deepStrictEqual({ clipboardWrites, nativeCopies }, { clipboardWrites: [], nativeCopies: 2 });
	});

	test('copies the clicked inactive row ID without changing picker state or focus', async () => {
		const picker = currentQuickInput = new TestQuickPick();
		store.add(provider.provide(picker, CancellationToken.None));
		picker.valueSelection = [0, 4];
		const item = terminalPicks()[0];
		strictEqual(await item.trigger?.(0, keyMods), TriggerAction.NO_ACTION);
		deepStrictEqual({
			clipboardWrites,
			activeId: activeTerminal?.instanceId,
			highlighted: picker.activeItems[0]?.description,
			selected: picker.selectedItems,
			query: picker.value,
			selection: picker.valueSelection,
			inputFocused: picker.inputHasFocus(),
			focused,
			hidden: picker.hidden
		}, {
			clipboardWrites: ['3'],
			activeId: 12,
			highlighted: '(id:12, tab:1, pane:2)',
			selected: [],
			query: 'term ',
			selection: [0, 4],
			inputFocused: true,
			focused: [],
			hidden: false
		});
	});

	for (const unavailable of ['disposed', 'missing']) {
		test(`does not copy from a ${unavailable} row target`, async () => {
			const item = terminalPicks()[0];
			if (unavailable === 'disposed') {
				closed.add(3);
			} else {
				foreground = foreground.filter(terminal => terminal.instanceId !== 3);
			}
			strictEqual(await item.trigger?.(0, keyMods), TriggerAction.REMOVE_ITEM);
			deepStrictEqual({ clipboardWrites, commands, focused, activeId: activeTerminal?.instanceId }, {
				clipboardWrites: [], commands: [], focused: [], activeId: 12
			});
		});
	}

	test('lists one row per pane with names, icons and location descriptions', () => {
		deepStrictEqual(terminalPicks().map(item => ({ label: item.label, description: item.description })), [
			{ label: '$(rocket) Shell', description: 'src (id:3, tab:1, pane:1)' },
			{ label: '$(terminal) Shell', description: '(id:12, tab:1, pane:2)' },
			{ label: '$(rocket) Build', description: 'Task (id:21, tab:2)' },
			{ label: '$(rocket) Editor shell', description: '(id:99, editor)' }
		]);
		deepStrictEqual(provider.getPicks().items.filter(item => item.type === 'separator').map(item => item.label), ['Panel', 'Editor', undefined]);
	});

	test('preserves theme colors and custom image icon classes', () => {
		const picks = terminalPicks();
		ok(picks[0].iconClasses?.includes('terminal-icon-terminal_ansiRed'));
		ok(picks[1].iconClasses?.includes('terminal-uri-icon'));
	});

	for (const filter of ['id:12', 'pane:2', '12']) {
		test(`filters by metadata: ${filter}`, () => {
			deepStrictEqual(terminalPicks(filter).map(item => item.description), ['(id:12, tab:1, pane:2)']);
			ok(terminalPicks(filter)[0].highlights?.description?.length);
		});
	}

	test('filters by names and existing descriptions', () => {
		deepStrictEqual(terminalPicks('Build').map(item => item.description), ['Task (id:21, tab:2)']);
		deepStrictEqual(terminalPicks('src').map(item => item.description), ['src (id:3, tab:1, pane:1)']);
		deepStrictEqual(terminalPicks('tab:1').map(item => item.description), ['src (id:3, tab:1, pane:1)', '(id:12, tab:1, pane:2)']);
	});

	test('preselects the active pane without reordering, including duplicate names', () => {
		const result = provider.getPicks();
		strictEqual(result.active?.description, '(id:12, tab:1, pane:2)');
		strictEqual(result.items.indexOf(result.active!), 2);
	});

	test('preselects editor terminals and does not select a filtered-out active terminal', () => {
		activeTerminal = terminals[3];
		strictEqual(provider.getPicks().active?.description, '(id:99, editor)');
		strictEqual(provider.getPicks('Build').active, undefined);
	});

	test('handles an empty terminal list and keeps creation actions', async () => {
		groups = [];
		editors = [];
		activeTerminal = undefined;
		const result = provider.getPicks();
		strictEqual(result.active, undefined);
		strictEqual(result.items.length, 2);
		for (const item of result.items) {
			if (item.type !== 'separator') { await item.accept?.(keyMods, { inBackground: false }); }
		}
		deepStrictEqual(commands.map(command => command.id), [TerminalCommandId.New, TerminalCommandId.NewWithProfile]);
	});

	test('focuses the accepted terminal in either location', async () => {
		const picks = terminalPicks();
		deepStrictEqual(focused, []);
		await picks[0].accept?.(keyMods, { inBackground: false });
		await picks[3].accept?.(keyMods, { inBackground: false });
		deepStrictEqual(focused, [3, 99]);
	});

	test('preserves acceptance in the background', async () => {
		const picks = terminalPicks();
		await picks[0].accept?.(keyMods, { inBackground: true });
		await picks[3].accept?.(keyMods, { inBackground: true });
		deepStrictEqual({ focused, backgroundPanels, backgroundEditors }, { focused: [], backgroundPanels: [false], backgroundEditors: [99] });
	});

	test('ignores a target that closed or disappeared before acceptance', async () => {
		const picks = terminalPicks();
		closed.add(3);
		foreground = foreground.filter(terminal => terminal.instanceId !== 99);
		await picks[0].accept?.(keyMods, { inBackground: false });
		await picks[3].accept?.(keyMods, { inBackground: false });
		deepStrictEqual(focused, []);
	});

	test('keeps rename and kill buttons', async () => {
		openPicker();
		const pick = terminalPicks()[0];
		deepStrictEqual(pick.buttons?.map(button => button.tooltip), ['Copy Terminal ID', 'Rename Terminal', 'Kill Terminal']);
		strictEqual(await pick.trigger?.(1, keyMods), TriggerAction.NO_ACTION);
		strictEqual(await pick.trigger?.(2, keyMods), TriggerAction.REMOVE_ITEM);
		deepStrictEqual({ commands, disposed, renameValue: renameInputs[0].value }, { commands: [], disposed: [3], renameValue: 'Shell' });
	});

	test('restores the search and highlights the renamed terminal without activating it', async () => {
		const picker = openPicker('term Shell');
		picker.valueSelection = [5, 10];
		await terminalPicks('Shell')[0].trigger?.(1, keyMods);
		renameInputs[0].value = 'Shell logs';
		renameInputs[0].accepted.fire();
		await Promise.resolve();
		const restored = restoredPickers[0];
		deepStrictEqual({
			query: restored.value,
			selection: restored.valueSelection,
			highlight: restored.activeItems[0]?.label,
			description: restored.activeItems[0]?.description,
			activeId: activeTerminal?.instanceId,
			focused
		}, {
			query: 'term Shell', selection: [5, 10], highlight: '$(rocket) Shell logs',
			description: 'src (id:3, tab:1, pane:1)', activeId: 12, focused: []
		});
	});

	test('Escape from rename returns to the same search and terminal without changing the title', async () => {
		openPicker('term Shell');
		await terminalPicks('Shell')[0].trigger?.(1, keyMods);
		renameInputs[0].value = 'Unconfirmed';
		renameInputs[0].hideWithReason(QuickInputHideReason.Gesture);
		await Promise.resolve();
		deepStrictEqual({ query: restoredPickers[0].value, highlight: restoredPickers[0].activeItems[0]?.description, title: terminals[0].title, focused }, {
			query: 'term Shell', highlight: 'src (id:3, tab:1, pane:1)', title: 'Shell', focused: []
		});
	});

	test('preserves the query and normal results when the renamed terminal no longer matches', async () => {
		openPicker('term Shell');
		await terminalPicks('Shell')[0].trigger?.(1, keyMods);
		renameInputs[0].value = 'Logs';
		renameInputs[0].accepted.fire();
		await Promise.resolve();
		const restored = restoredPickers[0];
		deepStrictEqual({
			query: restored.value,
			descriptions: restored.items.filter((item): item is IPickerQuickAccessItem => item.type !== 'separator' && !!item.description).map(item => item.description),
			highlight: restored.activeItems[0]?.description,
			focused
		}, {
			query: 'term Shell', descriptions: ['(id:12, tab:1, pane:2)', '(id:99, editor)'], highlight: '(id:12, tab:1, pane:2)', focused: []
		});
	});

	test('clicking away from rename leaves the picker closed', async () => {
		openPicker();
		await terminalPicks()[0].trigger?.(1, keyMods);
		renameInputs[0].hideWithReason(QuickInputHideReason.Blur);
		await Promise.resolve();
		deepStrictEqual({ restoredPickers, title: terminals[0].title, focused }, { restoredPickers: [], title: 'Shell', focused: [] });
	});

	test('initially highlights the active terminal but focuses only on acceptance', () => {
		const picker = new TestQuickPick();
		store.add(provider.provide(picker, CancellationToken.None));
		strictEqual(picker.activeItems[0].description, '(id:12, tab:1, pane:2)');
		const next = terminalPicks()[0];
		picker.activeItems = [next];
		picker.changeActive.fire([next]);
		deepStrictEqual(focused, []);
		picker.selectedItems = [next];
		picker.accept.fire({ inBackground: false });
		deepStrictEqual({ focused, hidden: picker.hidden }, { focused: [3], hidden: true });
	});

	test('keeps a snapshot during filtering and refreshes when reopened', () => {
		const picker = new TestQuickPick();
		const session = store.add(provider.provide(picker, CancellationToken.None));
		terminals[0].rename('Renamed');
		groups.reverse();
		picker.value = 'term src';
		picker.changeValue.fire(picker.value);
		deepStrictEqual(picker.items.filter(item => item.type !== 'separator' && item.description).map(item => ({ label: item.label, description: item.description })), [
			{ label: '$(rocket) Shell', description: 'src (id:3, tab:1, pane:1)' }
		]);
		session.dispose();
		deepStrictEqual(terminalPicks('Renamed').map(item => item.description), ['src (id:3, tab:2, pane:1)']);
	});

	suite('Switch Active Terminal command', () => {
		let instantiationService: TestInstantiationService;
		let instances: ITerminalInstance[];
		let activeInstance: ITerminalInstance | undefined;
		let events: string[];

		setup(() => {
			instantiationService = store.add(new TestInstantiationService());
			events = [];
			instances = [3, 12, 21, 99].map(id => new class extends mock<ITerminalInstance>() {
				override readonly instanceId = id;
				override readonly target = id === 99 ? TerminalLocation.Editor : TerminalLocation.Panel;
				override readonly resource = URI.parse(id === 99 ? 'vscode-terminal:/previous-workspace/7' : `vscode-terminal:/workspace/${id}`);
			}());
			activeInstance = instances[2];
			const groups = [
				new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = instances.slice(0, 2);
					override readonly activeInstance = instances[1];
				}(),
				new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = [instances[2]];
					override readonly activeInstance = instances[2];
				}()
			];
			instantiationService.stub(ITerminalService, {
				get activeInstance() { return activeInstance; },
				getInstanceFromId: id => instances.find(instance => instance.instanceId === id),
				getInstanceFromResource: resource => getInstanceFromResource(instances, resource),
				focusInstance: async instance => { activeInstance = instance; events.push(`focus:${instance.instanceId}`); }
			});
			instantiationService.stub(ITerminalGroupService, { groups, activeGroup: groups[1] });
			instantiationService.stub(ITerminalConfigurationService, {});
			instantiationService.stub(ITerminalInstanceService, {});
			instantiationService.stub(ITerminalEditorService, {});
			instantiationService.stub(ITerminalEditingService, {});
			instantiationService.stub(ITerminalProfileService, {});
			instantiationService.stub(ITerminalProfileResolverService, {});
			instantiationService.stub(IQuickInputService, {
				quickAccess: new class extends mock<IQuickAccessController>() {
					override show(prefix: string): void { events.push(`picker:${prefix}`); }
				}()
			});
			instantiationService.stub(INotificationService, new class extends TestNotificationService {
				override warn(): void { events.push('warning'); }
			}());
		});

		async function run(args?: unknown): Promise<void> {
			const command = CommandsRegistry.getCommand('workbench.action.quickOpenTerm');
			ok(command);
			await instantiationService.invokeFunction(accessor => command.handler(accessor, args));
		}

		test('opens the picker without changing focus when no arguments are supplied', async () => {
			await run();
			deepStrictEqual({ events, activeId: activeInstance?.instanceId }, { events: ['picker:term '], activeId: 21 });
		});

		const selections = [
			{ args: {}, expectedSelectedTerminalId: 21 },
			{ args: { terminalId: 12 }, expectedSelectedTerminalId: 12 },
			{ args: { resource: 'vscode-terminal:/workspace/12' }, expectedSelectedTerminalId: 12 },
			{ args: { resource: 'vscode-terminal:/workspace/12#Old title' }, expectedSelectedTerminalId: 12 },
			{ args: { terminalId: 99 }, expectedSelectedTerminalId: 99 },
			{ args: { resource: 'vscode-terminal:/previous-workspace/7' }, expectedSelectedTerminalId: 99 },
			{ args: { tab: 1 }, expectedSelectedTerminalId: 12 },
			{ args: { tab: 2 }, expectedSelectedTerminalId: 21 },
			{ args: { tab: 1, pane: 1 }, expectedSelectedTerminalId: 3 },
			{ args: { tab: 1, pane: 2 }, expectedSelectedTerminalId: 12 },
			{ args: { pane: 1 }, expectedSelectedTerminalId: 21 }
		];
		for (const { args, expectedSelectedTerminalId } of selections) {
			test(`focuses the selected terminal for ${JSON.stringify(args)} without opening the picker`, async () => {
				await run(args);
				deepStrictEqual({ events, activeId: activeInstance?.instanceId }, { events: [`focus:${expectedSelectedTerminalId}`], activeId: expectedSelectedTerminalId });
			});
		}

		const invalid = [null, 12, '12', [], true, { terminalId: 404 }, { terminalId: 0 }, { terminalId: '12' },
			{ resource: 'file:/workspace/12' }, { resource: 'vscode-terminal:/wrong-workspace/12' },
			{ tab: 3 }, { tab: 0 }, { pane: 2 }, { tab: 1, pane: 3 }, { terminalId: 12, tab: 1 }, { terminalId: 12, pane: 1 }];
		for (const args of invalid) {
			test(`rejects ${JSON.stringify(args)} without changing focus or opening the picker`, async () => {
				await run(args);
				deepStrictEqual({ events, activeId: activeInstance?.instanceId }, { events: ['warning'], activeId: 21 });
			});
		}

		test('does not fall back when the target terminal has closed', async () => {
			instances = instances.filter(instance => instance.instanceId !== 12);
			await run({ terminalId: 12 });
			deepStrictEqual({ events, activeId: activeInstance?.instanceId }, { events: ['warning'], activeId: 21 });
		});

		test('does nothing for an empty target when no terminal is active', async () => {
			activeInstance = undefined;
			await run({});
			deepStrictEqual(events, []);
		});
	});
});
