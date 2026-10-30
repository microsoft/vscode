/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IPickerQuickAccessItem, TriggerAction } from '../../../../../../platform/quickinput/browser/pickerQuickAccess.js';
import { IQuickPick, IQuickPickDidAcceptEvent, IQuickPickSeparator } from '../../../../../../platform/quickinput/common/quickInput.js';
import { TerminalLocation } from '../../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ITerminalEditorService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../../../terminal/browser/terminal.js';
import { ITerminalProfileResolverService, TerminalCommandId } from '../../../../terminal/common/terminal.js';
import { TerminalQuickAccessProvider } from '../../browser/terminalQuickAccess.js';

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
		hidden = false;
		override hide(): void { this.hidden = true; }
	}

	setup(() => {
		focused = [];
		disposed = [];
		closed = new Set();
		commands = [];
		backgroundPanels = [];
		backgroundEditors = [];
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
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ICommandService, {
			executeCommand: async (id, ...args) => { commands.push({ id, args }); return undefined; }
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
			focusInstance: async terminal => { focused.push(terminal.instanceId); },
			safeDisposeTerminal: async terminal => { disposed.push(terminal.instanceId); }
		});
		instantiationService.stub(ITerminalProfileResolverService, { getDefaultIcon: () => Codicon.terminal });
		instantiationService.stub(IThemeService, { getColorTheme: () => new TestColorTheme({ 'terminal.ansiRed': '#ff0000' }) });
		provider = store.add(instantiationService.createInstance(TestTerminalQuickAccessProvider));
	});

	function terminalPicks(filter = ''): IPickerQuickAccessItem[] {
		return provider.getPicks(filter).items.filter((item): item is IPickerQuickAccessItem => item.type !== 'separator' && item.description !== undefined);
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
		const pick = terminalPicks()[0];
		strictEqual(pick.buttons?.length, 2);
		strictEqual(await pick.trigger?.(0, keyMods), TriggerAction.NO_ACTION);
		strictEqual(await pick.trigger?.(1, keyMods), TriggerAction.REMOVE_ITEM);
		deepStrictEqual({ commands, disposed }, { commands: [{ id: TerminalCommandId.Rename, args: [terminals[0]] }], disposed: [3] });
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
});
