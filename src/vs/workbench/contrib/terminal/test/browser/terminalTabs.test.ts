/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/terminal.css';
import { deepStrictEqual, ok, rejects, strictEqual } from 'assert';
import { restore, spy, stub } from 'sinon';
import { $, addDisposableListener, getActiveElement, scheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { ElementsDragAndDropData, NativeDragAndDropData } from '../../../../../base/browser/ui/list/listView.js';
import { DomScrollableElement } from '../../../../../base/browser/ui/scrollbar/scrollableElement.js';
import { DataTransfers } from '../../../../../base/browser/dnd.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isMacintosh, OS, OperatingSystem } from '../../../../../base/common/platform.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IShellLaunchConfig, ITerminalBackend, TitleEventSource } from '../../../../../platform/terminal/common/terminal.js';
import { IProcessDetails } from '../../../../../platform/terminal/common/terminalProcess.js';
import { IEditableData } from '../../../../common/views.js';
import { TestTerminalGroupService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ICreateTerminalOptions, ITerminalChatService, ITerminalEditingService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from '../../browser/terminal.js';
import { TerminalTabbedView } from '../../browser/terminalTabbedView.js';
import { InstanceContext } from '../../browser/terminalContextMenu.js';
import { TerminalTabsBar } from '../../browser/terminalTabsBar.js';
import { TerminalStatusList } from '../../browser/terminalStatusList.js';
import { TerminalTabList, TerminalTabsDragAndDrop, TerminalTabsRenderer } from '../../browser/terminalTabsList.js';
import { getSelectedTerminalTabInstances } from '../../browser/terminalTabsWidget.js';
import { ITerminalConfiguration } from '../../common/terminal.js';
import { TerminalStorageKeys } from '../../common/terminalStorageKeys.js';

class TabInstance extends mock<ITerminalInstance>() {
	override title = 'shell';
	override description = 'workspace';
	override icon = Codicon.terminal;
	override shellLaunchConfig: IShellLaunchConfig = {};
	override readonly resource: URI;
	focusCount = 0;
	readonly paths: (string | URI)[] = [];
	pathError: Error | undefined;

	constructor(
		override readonly instanceId: number,
		override readonly statusList: TerminalStatusList,
	) {
		super();
		this.resource = URI.from({ scheme: Schemas.vscodeTerminal, path: `/test/${instanceId}` });
	}

	override focus(): void { this.focusCount++; }
	override async focusWhenReady(): Promise<void> { this.focus(); }
	override async sendPath(path: string | URI): Promise<void> {
		if (this.pathError) {
			throw this.pathError;
		}
		this.paths.push(path);
	}
}

class TabGroup extends mock<ITerminalGroup>() {
	size = { width: 0, height: 0 };
	constructor(override terminalInstances: ITerminalInstance[]) { super(); }
	override layout(width: number, height: number): void { this.size = { width, height }; }
}

function processDetails(): IProcessDetails {
	return {
		id: 99, pid: 100, title: 'external shell', titleSource: TitleEventSource.Process,
		cwd: '/', workspaceId: 'external', workspaceName: 'external', isOrphan: true,
		icon: undefined, color: undefined, fixedDimensions: undefined, environmentVariableCollections: undefined,
		hasChildProcesses: false, shellIntegrationNonce: ''
	};
}

suite('Terminal tabs', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let configurationService: TestConfigurationService;
	let tabs: ITerminalConfiguration['tabs'];
	let container: HTMLElement;
	let instances: TabInstance[];
	let groups: TabGroup[];
	let groupService: TestTerminalGroupService;
	let changes: Emitter<void>;
	let titles: Emitter<ITerminalInstance>;
	let statuses: Emitter<ITerminalInstance>;
	let icons: Emitter<{ instance: ITerminalInstance; userInitiated: boolean }>;
	let connectionChanges: Emitter<void>;
	let hiddenChanges: Emitter<ITerminalInstance>;
	let activeChanges: Emitter<ITerminalInstance | undefined>;
	let editable: { instance: ITerminalInstance; data: IEditableData } | undefined;
	let editingTerminal: ITerminalInstance | undefined;
	let terminalContainer: HTMLElement | undefined;
	let hiddenInstances: ITerminalInstance[];
	let backend: ITerminalBackend | undefined;
	let moves: { sources: number[]; target?: number }[];
	let created: (ICreateTerminalOptions | undefined)[];
	let disposed: ITerminalInstance[];
	let executedCommands: string[];

	setup(() => {
		tabs = {
			enabled: true,
			hideCondition: 'never',
			showActiveTerminal: 'singleTerminalOrNarrow',
			location: 'top',
			focusMode: 'doubleClick',
			title: '${process}',
			description: '${cwdFolder}',
			separator: ' - ',
			allowAgentCliTitle: false
		};
		configurationService = new TestConfigurationService({ terminal: { integrated: { tabs, rightClickBehavior: 'default' } } });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, store);
		const workbench = $('.monaco-workbench');
		const pane = $('.pane-body.integrated-terminal');
		workbench.appendChild(pane);
		mainWindow.document.body.appendChild(workbench);
		container = pane;
		container.style.width = '600px';
		container.style.height = '300px';
		instances = [1, 2, 3].map(id => new TabInstance(id, store.add(instantiationService.createInstance(TerminalStatusList))));
		groups = [new TabGroup(instances.slice(0, 2)), new TabGroup(instances.slice(2))];
		changes = store.add(new Emitter<void>());
		titles = store.add(new Emitter<ITerminalInstance>());
		statuses = store.add(new Emitter<ITerminalInstance>());
		icons = store.add(new Emitter<{ instance: ITerminalInstance; userInitiated: boolean }>());
		connectionChanges = store.add(new Emitter<void>());
		hiddenChanges = store.add(new Emitter<ITerminalInstance>());
		activeChanges = store.add(new Emitter<ITerminalInstance | undefined>());
		groupService = new class extends TestTerminalGroupService {
			override groups = groups;
			override instances = instances;
			override activeInstance: ITerminalInstance | undefined = instances[0];
			override onDidChangeInstances = changes.event;
			override onDidChangeActiveInstance = activeChanges.event;
			override getGroupForInstance(instance: ITerminalInstance): ITerminalGroup | undefined { return this.groups.find(group => group.terminalInstances.includes(instance)); }
			override instanceIsSplit(instance: ITerminalInstance): boolean { return (this.getGroupForInstance(instance)?.terminalInstances.length ?? 0) > 1; }
			override setActiveInstance(instance: ITerminalInstance): void {
				this.activeInstance = instance;
				activeChanges.fire(instance);
			}
			override moveGroup(source: ITerminalInstance | ITerminalInstance[], target: ITerminalInstance): void {
				moves.push({ sources: (Array.isArray(source) ? source : [source]).map(instance => instance.instanceId), target: target.instanceId });
			}
			override moveGroupToEnd(source: ITerminalInstance | ITerminalInstance[]): void {
				moves.push({ sources: (Array.isArray(source) ? source : [source]).map(instance => instance.instanceId) });
			}
			override focusTabs(): void { }
		};
		backend = undefined;
		moves = [];
		created = [];
		disposed = [];
		executedCommands = [];
		instantiationService.stub(ITerminalGroupService, groupService);
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onAnyInstanceTitleChange = titles.event;
			override onAnyInstanceIconChange = icons.event;
			override onAnyInstancePrimaryStatusChange = statuses.event;
			override onDidChangeConnectionState = connectionChanges.event;
			override onDidChangeInstances = Event.None;
			override onDidDisposeInstance = Event.None;
			override connectionState = TerminalConnectionState.Connected;
			override getPrimaryBackend(): ITerminalBackend | undefined { return backend; }
			override setContainers(_parent: HTMLElement, element: HTMLElement): void { terminalContainer = element; }
			override setActiveInstance(instance: ITerminalInstance): void { groupService.setActiveInstance(instance); }
			override getInstanceFromResource(resource: URI): ITerminalInstance | undefined { return instances.find(instance => instance.resource.toString() === resource.toString()); }
			override async moveToTerminalView(): Promise<void> { }
			override async createTerminal(options?: ICreateTerminalOptions): Promise<ITerminalInstance> {
				created.push(options);
				const instance = new TabInstance(instances.length + 1, store.add(instantiationService.createInstance(TerminalStatusList)));
				instances.push(instance);
				groups.push(new TabGroup([instance]));
				changes.fire();
				return instance;
			}
			override async safeDisposeTerminal(instance: ITerminalInstance): Promise<void> {
				disposed.push(instance);
				hiddenInstances = hiddenInstances.filter(hidden => hidden !== instance);
				hiddenChanges.fire(instance);
			}
		});
		editable = undefined;
		editingTerminal = undefined;
		instantiationService.stub(ITerminalEditingService, new class extends mock<ITerminalEditingService>() {
			override getEditableData(instance: ITerminalInstance): IEditableData | undefined { return editable?.instance === instance ? editable.data : undefined; }
			override isEditable(instance: ITerminalInstance | undefined): boolean { return !!editable && (!instance || editable.instance === instance); }
			override getEditingTerminal(): ITerminalInstance | undefined { return editingTerminal; }
			override setEditingTerminal(instance: ITerminalInstance | undefined): void { editingTerminal = instance; }
		});
		hiddenInstances = [];
		instantiationService.stub(ITerminalChatService, new class extends mock<ITerminalChatService>() {
			override onDidRegisterTerminalInstanceWithToolSession = hiddenChanges.event;
			override getToolSessionTerminalInstances(): ITerminalInstance[] { return hiddenInstances; }
		});
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string): Promise<T | undefined> {
				executedCommands.push(id);
				return undefined;
			}
		});
	});

	teardown(() => {
		restore();
		container.parentElement?.remove();
	});

	function createBar(os = OS): TerminalTabsBar {
		const tabsContainer = $('.tabs-container.horizontal-tabs.has-text');
		const listContainer = $('.tabs-list-container');
		const list = $('.tabs-list');
		container.appendChild(tabsContainer);
		tabsContainer.appendChild(listContainer);
		listContainer.appendChild(list);
		const bar = store.add(instantiationService.createInstance(TerminalTabsBar, list, os));
		bar.layout(TerminalTabsBar.HEIGHT, 300);
		return bar;
	}

	function changeConfiguration(values: Partial<ITerminalConfiguration['tabs']>): void {
		Object.assign(tabs, values);
		const keys = Object.keys(values).map(key => `terminal.integrated.tabs.${key}`);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === 'terminal.integrated' || keys.includes(key),
			affectedKeys: new Set(keys),
			change: { keys, overrides: [] },
			source: ConfigurationTarget.USER
		});
	}

	function keyboardEvent(type: 'keydown' | 'keyup', key: string, options: KeyboardEventInit = {}): KeyboardEvent {
		const keyCodes: Record<string, number> = { a: 65, A: 65, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, Enter: 13, ' ': 32, F2: 113, F10: 121, ContextMenu: 93 };
		return new KeyboardEvent(type, { key, keyCode: keyCodes[key], code: key === 'ContextMenu' ? 'ContextMenu' : '', bubbles: true, cancelable: true, ...options });
	}

	function press(bar: TerminalTabsBar, key: string, options: KeyboardEventInit = {}): void {
		const element = bar.getHTMLElement().querySelector<HTMLElement>(`[data-index="${bar.getFocus()[0]}"]`)!;
		element.dispatchEvent(keyboardEvent('keydown', key, options));
		element.dispatchEvent(keyboardEvent('keyup', key, options));
	}

	test('renders individual split terminals with accessible names and group boundaries', () => {
		const bar = createBar();
		deepStrictEqual(Array.from(bar.getHTMLElement().children).map(element => ({
			role: element.getAttribute('role'),
			label: element.getAttribute('aria-label'),
			selected: element.getAttribute('aria-selected'),
			groupStart: element.classList.contains('group-start')
		})), [
			{ role: 'tab', label: 'Terminal 1 shell, split 1 of 2', selected: 'true', groupStart: false },
			{ role: 'tab', label: 'Terminal 2 shell, split 2 of 2', selected: 'false', groupStart: false },
			{ role: 'tab', label: 'Terminal 3 shell', selected: 'false', groupStart: true }
		]);
	});

	for (const location of ['left', 'right', 'top', 'bottom'] as const) {
		test(`${location}: context menus target unselected terminals alone and preserve selected groups`, () => {
			tabs.location = location;
			const contexts: number[][] = [];
			stub(instantiationService.get(IContextMenuService), 'showContextMenu').callsFake(delegate => {
				try {
					const context = delegate.getActionsContext?.();
					ok(Array.isArray(context) && context.every(instance => instance instanceof InstanceContext));
					contexts.push(context.map(instance => instance.instanceId));
				} finally {
					delegate.onHide?.(false);
				}
			});
			const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
			view.layout(600, 300);
			const entries = () => container.querySelectorAll<HTMLElement>('.terminal-tabs-bar-tab, .monaco-list-row');
			entries()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
			entries()[2].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
			entries()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
			entries()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
			entries()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
			entries()[2].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
			deepStrictEqual(contexts, [[3], [2, 1], [3]]);
		});
	}

	test('adds late task actions without losing focused Kill or rebuilding unchanged controls', async () => {
		const fill = spy(TerminalTabsRenderer.prototype, 'fillActionBar');
		const bar = createBar();
		bar.domFocus();
		const firstTab = bar.getHTMLElement().children[0];
		const kill = firstTab.querySelector<HTMLElement>('.action-label.codicon-trashcan')!;
		kill.focus();
		instances[0].shellLaunchConfig.tabActions = [{ id: 'test.rerunTask', label: 'Rerun Task', icon: Codicon.refresh }];
		titles.fire(instances[0]);
		const template = fill.lastCall.args[1];
		deepStrictEqual({
			labels: Array.from(firstTab.querySelectorAll('.action-label')).map(element => element.getAttribute('aria-label')),
			focusedKill: getActiveElement() === firstTab.querySelector('.action-label.codicon-trashcan')
		}, { labels: ['Split', 'Rerun Task', 'Kill'], focusedKill: true });
		await template.actionBar.getAction(1)!.run();
		deepStrictEqual(executedCommands, ['test.rerunTask']);
		const controls = Array.from(firstTab.querySelectorAll('.action-label'));
		fill.resetHistory();
		statuses.fire(instances[0]);
		titles.fire(instances[0]);
		bar.refresh();
		deepStrictEqual({ retained: controls.every(control => control.isConnected), rebuilds: fill.callCount }, { retained: true, rebuilds: 0 });
	});

	test('reconciles changed, replaced and removed task action definitions on refresh', () => {
		const rerun = { id: 'test.rerunTask', label: 'Rerun Task', icon: Codicon.refresh };
		instances[0].shellLaunchConfig.tabActions = [rerun];
		const bar = createBar();
		bar.domFocus();
		const firstTab = bar.getHTMLElement().children[0];
		firstTab.querySelector<HTMLElement>('.action-label.codicon-refresh')!.focus();
		rerun.label = 'Restart Task';
		rerun.icon = Codicon.debugRestart;
		bar.refresh();
		const labels = () => Array.from(firstTab.querySelectorAll('.action-label')).map(element => element.getAttribute('aria-label'));
		const changed = { labels: labels(), focused: getActiveElement()?.getAttribute('aria-label'), icon: firstTab.querySelector('.codicon-debug-restart') !== null };
		const changedControls = Array.from(firstTab.querySelectorAll('.action-label'));
		instances[0].shellLaunchConfig.tabActions = [{ ...rerun }];
		bar.refresh();
		const retained = changedControls.every(control => control.isConnected);
		instances[0].shellLaunchConfig.tabActions = [];
		bar.refresh();
		deepStrictEqual({
			changed, retained, removed: labels(), focusRemainsInTab: firstTab.contains(getActiveElement())
		}, {
			changed: { labels: ['Split', 'Restart Task', 'Kill'], focused: 'Restart Task', icon: true },
			retained: true, removed: ['Split', 'Kill'], focusRemainsInTab: true
		});
	});

	test('navigates horizontally, selects ranges, and targets focused unselected tabs', () => {
		const bar = createBar();
		bar.domFocus();
		press(bar, 'ArrowRight');
		press(bar, 'End', { shiftKey: true });
		const range = bar.getSelectedElements().map(instance => instance.instanceId);
		press(bar, 'Home', isMacintosh ? { metaKey: true } : { ctrlKey: true });
		deepStrictEqual({
			range,
			focused: bar.getFocus(),
			targets: getSelectedTerminalTabInstances(bar).map(instance => instance.instanceId),
			active: groupService.activeInstance?.instanceId,
			terminalFocusCalls: instances.map(instance => instance.focusCount)
		}, { range: [2, 3], focused: [0], targets: [1], active: 2, terminalFocusCalls: [0, 0, 0] });
	});

	test('does not intercept the macOS Enter rename binding', () => {
		const bar = createBar();
		const event = keyboardEvent('keydown', 'Enter');
		bar.getHTMLElement().children[0].dispatchEvent(event);
		deepStrictEqual({ prevented: event.defaultPrevented, focused: instances[0].focusCount }, { prevented: !isMacintosh, focused: isMacintosh ? 0 : 1 });
	});

	test('preserves identity selection and DOM across title changes and reordering', () => {
		const bar = createBar();
		bar.setSelection([0, 1]);
		bar.setFocus([1]);
		const element = bar.getHTMLElement().children[1];
		instances[1].title = 'renamed';
		titles.fire(instances[1]);
		groupService.instances = [instances[2], instances[0], instances[1]];
		changes.fire();
		deepStrictEqual({
			sameElement: bar.getHTMLElement().children[2] === element,
			selection: bar.getSelection(),
			focus: bar.getFocus(),
			targets: getSelectedTerminalTabInstances(bar).map(instance => instance.instanceId)
		}, { sameElement: true, selection: [1, 2], focus: [2], targets: [1, 2] });
	});

	test('keeps unfinished rename input through title and status refreshes', () => {
		const bar = createBar();
		editable = { instance: instances[0], data: { validationMessage: () => null, onFinish: () => { throw new Error('Rename should not finish during refresh'); } } };
		editingTerminal = instances[0];
		bar.refresh();
		const input = bar.getHTMLElement().querySelector('input')!;
		input.value = 'unfinished';
		titles.fire(instances[0]);
		bar.refresh();
		deepStrictEqual({
			sameInput: input === bar.getHTMLElement().querySelector('input'),
			value: input.value,
			focused: getActiveElement() === input
		}, { sameInput: true, value: 'unfinished', focused: true });
	});

	test('preserves keyboard focus on tab actions when a terminal title changes', () => {
		const bar = createBar();
		bar.domFocus();
		const action = bar.getHTMLElement().querySelector<HTMLElement>('.action-label.codicon-trashcan')!;
		action.focus();
		instances[0].title = 'updated title';
		titles.fire(instances[0]);
		deepStrictEqual({
			connected: action.isConnected,
			focused: getActiveElement() === action,
			title: bar.getHTMLElement().querySelector('.label-name')?.textContent?.trim()
		}, { connected: true, focused: true, title: 'updated title' });
	});

	test('preserves focused controls through status, icon, theme-style, and reconnect refreshes', () => {
		const bar = createBar();
		bar.domFocus();
		const action = bar.getHTMLElement().querySelector<HTMLElement>('.action-label.codicon-split-horizontal')!;
		action.focus();
		statuses.fire(instances[0]);
		icons.fire({ instance: instances[0], userInitiated: true });
		bar.refresh();
		connectionChanges.fire();
		deepStrictEqual({
			sameControl: action === bar.getHTMLElement().querySelector('.action-label.codicon-split-horizontal'),
			focused: getActiveElement() === action,
			selection: bar.getSelection()
		}, { sameControl: true, focused: true, selection: [0] });
	});

	test('bounds update work to the changed terminal with 250 open tabs and 1000 title/status events', async () => {
		instances = Array.from({ length: 250 }, (_, index) => new TabInstance(index + 1, store.add(instantiationService.createInstance(TerminalStatusList))));
		groups = instances.map(instance => new TabGroup([instance]));
		groupService.instances = instances;
		groupService.groups = groups;
		groupService.activeInstance = instances[0];
		const bar = createBar();
		const render = spy(TerminalTabsRenderer.prototype, 'updateElement');
		const templates = spy(TerminalTabsRenderer.prototype, 'renderTemplate');
		const actions = spy(TerminalTabsRenderer.prototype, 'fillActionBar');
		const scans = spy(DomScrollableElement.prototype, 'scanDomNode');
		const controls = Array.from(bar.getHTMLElement().querySelectorAll('.action-label'));
		for (let i = 0; i < 500; i++) {
			instances[125].title = `task ${i}`;
			titles.fire(instances[125]);
			statuses.fire(instances[125]);
		}
		const synchronousScans = scans.callCount;
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		deepStrictEqual({
			renders: render.callCount,
			targets: [...new Set(render.args.map(([instance]) => instance.instanceId))],
			newTemplates: templates.callCount,
			rebuiltActions: actions.callCount,
			synchronousScans,
			scansAfterFrame: scans.callCount,
			retainedControls: controls.every(control => control.isConnected),
			tabs: bar.getHTMLElement().children.length
		}, { renders: 1000, targets: [126], newTemplates: 0, rebuiltActions: 0, synchronousScans: 0, scansAfterFrame: 1, retainedControls: true, tabs: 250 });
	});

	for (const { name, os } of [
		{ name: 'macOS', os: OperatingSystem.Macintosh },
		{ name: 'Windows', os: OperatingSystem.Windows },
		{ name: 'Linux', os: OperatingSystem.Linux }
	]) {
		test(`${name}: platform selection modifiers, range navigation and rename keys`, () => {
			const bar = createBar(os);
			const modifier = os === OperatingSystem.Macintosh ? { metaKey: true } : { ctrlKey: true };
			bar.domFocus();
			press(bar, 'a', modifier);
			const all = bar.getSelection();
			press(bar, 'ArrowRight', modifier);
			press(bar, ' ', modifier);
			const toggled = bar.getSelection();
			press(bar, 'Home');
			press(bar, 'End', { shiftKey: true });
			const rename = keyboardEvent('keydown', os === OperatingSystem.Macintosh ? 'Enter' : 'F2');
			getActiveElement()!.dispatchEvent(rename);
			deepStrictEqual({ all, toggled, range: bar.getSelection(), focus: bar.getFocus(), renameHandled: rename.defaultPrevented },
				{ all: [0, 1, 2], toggled: [0, 2], range: [0, 1, 2], focus: [2], renameHandled: false });
		});

		test(`${name}: mouse multi-selection and keyboard context menu`, () => {
			const bar = createBar(os);
			const second = bar.getHTMLElement().children[1];
			second.dispatchEvent(new MouseEvent('click', { bubbles: true, ...os === OperatingSystem.Macintosh ? { metaKey: true } : { ctrlKey: true } }));
			let contextMenus = 0;
			store.add(addDisposableListener(bar.getHTMLElement(), 'contextmenu', () => contextMenus++));
			press(bar, 'F10', { shiftKey: true });
			deepStrictEqual({ selection: bar.getSelection(), focus: bar.getFocus(), contextMenus }, { selection: [0, 1], focus: [1], contextMenus: 1 });
		});

		test(`${name}: Enter activation and Space focus follow platform conventions`, () => {
			const bar = createBar(os);
			bar.domFocus();
			const enter = keyboardEvent('keydown', 'Enter');
			getActiveElement()!.dispatchEvent(enter);
			const enterFocusCount = instances[0].focusCount;
			press(bar, ' ');
			deepStrictEqual({ enterHandled: enter.defaultPrevented, enterFocusCount, totalFocusCount: instances[0].focusCount },
				{ enterHandled: os !== OperatingSystem.Macintosh, enterFocusCount: os === OperatingSystem.Macintosh ? 0 : 1, totalFocusCount: os === OperatingSystem.Macintosh ? 1 : 2 });
		});

		test(`${name}: Select All handles Caps Lock and non-Latin keys without intercepting other chords`, () => {
			const bar = createBar(os);
			const modifier = os === OperatingSystem.Macintosh ? { metaKey: true } : { ctrlKey: true };
			bar.domFocus();
			const selections: number[][] = [];
			for (const key of ['A', '\u0444']) {
				bar.setSelection([0]);
				press(bar, key, { ...modifier, keyCode: 65, code: 'KeyA' });
				selections.push(bar.getSelection());
			}
			bar.setSelection([0]);
			press(bar, 'A', { ...modifier, shiftKey: true });
			selections.push(bar.getSelection());
			press(bar, 'a', { ...modifier, isComposing: true });
			selections.push(bar.getSelection());
			deepStrictEqual(selections, [[0, 1, 2], [0, 1, 2], [0], [0]]);
		});

		test(`${name}: honors Alt multi-selection without splitting terminals`, async () => {
			await configurationService.setUserConfiguration('workbench.list.multiSelectModifier', 'alt');
			tabs.focusMode = 'singleClick';
			const bar = createBar(os);
			bar.domFocus();
			bar.getHTMLElement().children[1].dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
			deepStrictEqual({ selection: bar.getSelection(), created: created.length, focused: instances.map(instance => instance.focusCount) },
				{ selection: [0, 1], created: 0, focused: [0, 0, 0] });
			await configurationService.setUserConfiguration('workbench.list.multiSelectModifier', 'ctrlCmd');
			const create = spy(instantiationService.get(ITerminalService), 'createTerminal');
			bar.getHTMLElement().children[1].dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
			await create.firstCall.returnValue;
			deepStrictEqual(created, [{ location: { parentTerminal: instances[1] } }]);
		});
	}

	for (const key of ['ContextMenu', 'F10']) {
		test(`${key}: opens on keyup and suppresses native context menus during the key press`, () => {
			const bar = createBar();
			bar.domFocus();
			const tab = bar.getHTMLElement().children[0];
			let menus = 0;
			store.add(addDisposableListener(bar.getHTMLElement(), 'contextmenu', () => menus++));
			const down = keyboardEvent('keydown', key, { shiftKey: key === 'F10' });
			tab.dispatchEvent(down);
			const afterDown = menus;
			const nativeMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
			tab.dispatchEvent(nativeMenu);
			const afterNative = menus;
			const up = keyboardEvent('keyup', key, { shiftKey: key === 'F10' });
			tab.dispatchEvent(up);
			const afterUp = menus;
			tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
			deepStrictEqual({
				menus: [afterDown, afterNative, afterUp, menus],
				prevented: [down.defaultPrevented, nativeMenu.defaultPrevented, up.defaultPrevented]
			}, { menus: [0, 0, 1, 2], prevented: [true, true, true] });
		});
	}

	test('vertical Alt multi-selection does not also split or focus terminal content', async () => {
		await configurationService.setUserConfiguration('workbench.list.multiSelectModifier', 'alt');
		tabs.location = 'right';
		tabs.focusMode = 'singleClick';
		const list = store.add(instantiationService.createInstance(TerminalTabList, container));
		list.layout(300, 120);
		list.setSelection([0]);
		list.domFocus();
		list.getHTMLElement().querySelector('.monaco-list-row[data-index="1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
		deepStrictEqual({ selection: list.getSelection(), created: created.length, focused: instances.map(instance => instance.focusCount) },
			{ selection: [0, 1], created: 0, focused: [0, 0, 0] });
		await configurationService.setUserConfiguration('workbench.list.multiSelectModifier', 'ctrlCmd');
		const key = 'workbench.list.multiSelectModifier';
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: configuration => configuration === key,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			source: ConfigurationTarget.USER
		});
		const create = spy(instantiationService.get(ITerminalService), 'createTerminal');
		list.getHTMLElement().querySelector('.monaco-list-row[data-index="1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
		await create.firstCall.returnValue;
		deepStrictEqual(created, [{ location: { parentTerminal: instances[1] } }]);
	});

	for (const surface of ['horizontal', 'vertical', 'empty-area'] as const) {
		test(`${surface}: a failed drop reports one visible error and a failure outcome`, async () => {
			tabs.location = surface === 'vertical' ? 'right' : 'top';
			const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
			view.layout(600, 300);
			const notifications = spy(instantiationService.get(INotificationService), 'error');
			const logged = spy(instantiationService.get(ILogService), 'error');
			const drop = spy(TerminalTabsDragAndDrop.prototype, 'drop');
			const dataTransfer = new DataTransfer();
			dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([URI.from({ scheme: Schemas.vscodeTerminal, path: '/external/99' }).toString()]));
			const target = container.querySelector(surface === 'vertical' ? '.monaco-list-row' : surface === 'empty-area' ? '.tabs-container' : '.terminal-tabs-bar-tab')!;
			target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
			target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			strictEqual(drop.callCount, 1);
			const result = await drop.firstCall.returnValue;
			deepStrictEqual({
				result, notifications: notifications.callCount, logged: logged.callCount,
				message: notifications.firstCall.args[0] instanceof Error ? notifications.firstCall.args[0].message : notifications.firstCall.args[0]
			}, { result: false, notifications: 1, logged: 1, message: 'Cannot move the terminal because its terminal connection is unavailable.' });
		});
	}

	for (const completedTransfers of [1, 2]) {
		test(`failed drop reports ${completedTransfers} completed transfers without reporting batch success`, async () => {
			backend = new class extends mock<ITerminalBackend>() {
				override async requestDetachInstance(_workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
					return instanceId < 99 + completedTransfers ? { ...processDetails(), id: instanceId } : undefined;
				}
			};
			const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, () => { throw new Error('Failed batch must not select a successful drop'); }));
			const notifications = spy(instantiationService.get(INotificationService), 'error');
			const logged = spy(instantiationService.get(ILogService), 'error');
			const dataTransfer = new DataTransfer();
			const resources = Array.from({ length: completedTransfers + 1 }, (_, index) => URI.from({ scheme: Schemas.vscodeTerminal, path: `/external/${99 + index}` }).toString());
			dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify(resources));
			const result = await dnd.drop(new NativeDragAndDropData(), undefined, undefined, undefined, new DragEvent('drop', { dataTransfer }));
			const error = notifications.firstCall.args[0];
			ok(error instanceof Error && error.cause instanceof Error);
			const partialMessage = completedTransfers === 1
				? 'The terminal drop failed after moving one terminal. It remains available in this window.'
				: 'The terminal drop failed after moving 2 terminals. They remain available in this window.';
			deepStrictEqual({
				result, notifications: notifications.callCount, logged: logged.callCount,
				message: error.message,
				cause: error.cause.message,
				transferred: created.length,
				visible: groupService.instances.length,
				moves
			}, {
				result: false, notifications: 1, logged: 1,
				message: `${partialMessage} Cannot move the terminal because it could not be detached from its original window.`,
				cause: 'Cannot move the terminal because it could not be detached from its original window.',
				transferred: completedTransfers, visible: 3 + completedTransfers, moves: []
			});
		});
	}

	test('scrolls a single row and reveals keyboard navigation targets', () => {
		const bar = createBar();
		bar.layout(TerminalTabsBar.HEIGHT, 120);
		bar.domFocus();
		press(bar, 'End');
		const element = bar.getHTMLElement();
		const entries = Array.from(element.children) as HTMLElement[];
		ok(element.scrollWidth > element.clientWidth && element.scrollLeft > 0);
		strictEqual(new Set(entries.map(entry => entry.offsetTop)).size, 1);
	});

	test('background label updates do not reveal the active tab over a manually scrolled position', async () => {
		const bar = createBar();
		bar.layout(TerminalTabsBar.HEIGHT, 120);
		const element = bar.getHTMLElement();
		element.scrollLeft = 100;
		const position = element.scrollLeft;
		instances[0].title = 'task';
		titles.fire(instances[0]);
		await new Promise<void>(resolve => store.add(scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
		deepStrictEqual({ before: position, after: element.scrollLeft, focused: bar.getFocus() }, { before: 100, after: 100, focused: [0] });
	});

	test('restores an entry focus when a context menu returns focus to the empty strip', () => {
		const bar = createBar();
		bar.setSelection([]);
		bar.setFocus([]);
		bar.getHTMLElement().focus();
		press(bar, 'ArrowRight');
		deepStrictEqual({ focus: bar.getFocus(), selection: bar.getSelection() }, { focus: [1], selection: [1] });
	});

	test('shared drops return terminal instances rather than group indexes to the widget', async () => {
		let selected: ITerminalInstance[] = [];
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, instances => selected = instances));
		await dnd.drop(new ElementsDragAndDropData([instances[1]]), instances[2], 2, undefined, new DragEvent('drop'));
		deepStrictEqual({ moves, selected: selected.map(instance => instance.instanceId) }, { moves: [{ sources: [2], target: 3 }], selected: [2] });
	});

	test('native terminal drops on empty strip space move the group to the end', async () => {
		let selected: ITerminalInstance[] = [];
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, instances => selected = instances));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([instances[1].resource.toString()]));
		await dnd.drop(new NativeDragAndDropData(), undefined, undefined, undefined, new DragEvent('drop', { dataTransfer }));
		deepStrictEqual({ moves, selected: selected.map(instance => instance.instanceId) }, { moves: [{ sources: [2] }], selected: [2] });
	});

	for (const source of ['local', 'cross-window'] as const) {
		test(`vertical ${source} drops align selection, focus and command targets`, async () => {
			tabs.location = 'right';
			backend = new class extends mock<ITerminalBackend>() {
				override async requestDetachInstance(): Promise<IProcessDetails> { return processDetails(); }
			};
			const list = store.add(instantiationService.createInstance(TerminalTabList, container));
			list.layout(300, 120);
			list.setSelection([0]);
			list.setFocus([0]);
			list.domFocus();
			const drop = spy(TerminalTabsDragAndDrop.prototype, 'drop');
			const dataTransfer = new DataTransfer();
			const resources = source === 'local'
				? [instances[1].resource, instances[2].resource]
				: [URI.from({ scheme: Schemas.vscodeTerminal, path: '/external/99' })];
			dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify(resources.map(resource => resource.toString())));
			const target = list.getHTMLElement().querySelector<HTMLElement>('.monaco-list-row[data-index="0"]')!;
			target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }));
			target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
			strictEqual(drop.callCount, 1);
			await drop.firstCall.returnValue;
			const expected = source === 'local' ? [2, 3] : [4];
			deepStrictEqual({
				selected: list.getSelectedElements().map(instance => instance.instanceId),
				focused: list.getFocusedElements().map(instance => instance.instanceId),
				targets: getSelectedTerminalTabInstances(list).map(instance => instance.instanceId),
				active: groupService.activeInstance?.instanceId
			}, { selected: expected, focused: expected.slice(0, 1), targets: expected, active: expected[0] });
		});
	}

	test('propagates cross-window detach failures', async () => {
		backend = new class extends mock<ITerminalBackend>() {
			override async requestDetachInstance(): Promise<never> { throw new Error('detach failed'); }
		};
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, () => { throw new Error('Failed drop must not change selection'); }));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([URI.from({ scheme: Schemas.vscodeTerminal, path: '/external/99' }).toString()]));
		await rejects(dnd.performDrop(new NativeDragAndDropData(), undefined, undefined, undefined, new DragEvent('drop', { dataTransfer })), /detach failed/);
	});

	test('uses a reconnected backend for successful cross-window attachment and preserves the drop target', async () => {
		let selected: ITerminalInstance[] = [];
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, instances => selected = instances));
		const process = processDetails();
		const detached: { workspaceId: string; instanceId: number }[] = [];
		backend = new class extends mock<ITerminalBackend>() {
			override async requestDetachInstance(workspaceId: string, instanceId: number): Promise<IProcessDetails> {
				detached.push({ workspaceId, instanceId });
				return process;
			}
		};
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([URI.from({ scheme: Schemas.vscodeTerminal, path: '/external/99' }).toString()]));
		await dnd.drop(new NativeDragAndDropData(), instances[2], 2, undefined, new DragEvent('drop', { dataTransfer }));
		deepStrictEqual({
			detached, created, moves,
			selected: selected.map(instance => instance.instanceId),
			active: groupService.activeInstance?.instanceId
		}, {
			detached: [{ workspaceId: 'external', instanceId: 99 }],
			created: [{ config: { attachPersistentProcess: process } }],
			moves: [{ sources: [4], target: 3 }],
			selected: [4], active: 4
		});
	});

	test('reports unavailable cross-window connections instead of silently discarding the drop', async () => {
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, () => { throw new Error('Failed drop must not change selection'); }));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([URI.from({ scheme: Schemas.vscodeTerminal, path: '/external/99' }).toString()]));
		const event = new DragEvent('drop', { dataTransfer });
		await rejects(dnd.performDrop(new NativeDragAndDropData(), undefined, undefined, undefined, event), /connection is unavailable/);
		backend = new class extends mock<ITerminalBackend>() {
			override async requestDetachInstance(): Promise<undefined> { return undefined; }
		};
		await rejects(dnd.performDrop(new NativeDragAndDropData(), undefined, undefined, undefined, event), /could not be detached/);
		deepStrictEqual({ created, moves }, { created: [], moves: [] });
	});

	test('reattaches each detached process before a subsequent transfer failure', async () => {
		const process = processDetails();
		backend = new class extends mock<ITerminalBackend>() {
			override async requestDetachInstance(_workspaceId: string, instanceId: number): Promise<IProcessDetails | undefined> {
				return instanceId === 99 ? process : undefined;
			}
		};
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, () => { throw new Error('Failed batch must not report successful selection'); }));
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify([99, 100].map(id => URI.from({ scheme: Schemas.vscodeTerminal, path: `/external/${id}` }).toString())));
		await rejects(dnd.performDrop(new NativeDragAndDropData(), undefined, undefined, undefined, new DragEvent('drop', { dataTransfer })), /failed after moving one terminal.*could not be detached/);
		deepStrictEqual({
			created, moves,
			visibleInstances: groupService.instances.map(instance => instance.instanceId)
		}, {
			created: [{ config: { attachPersistentProcess: process } }], moves: [],
			visibleInstances: [1, 2, 3, 4]
		});
	});

	test('file drops target the selected terminal and propagate write failures', async () => {
		const dnd = store.add(instantiationService.createInstance(TerminalTabsDragAndDrop, () => { throw new Error('File drops do not change tab selection'); }));
		const dataTransfer = new DataTransfer();
		const resource = URI.file('/workspace/file.txt');
		dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify([resource.toString()]));
		await dnd.drop(new NativeDragAndDropData(), instances[1], 1, undefined, new DragEvent('drop', { dataTransfer }));
		deepStrictEqual({ paths: instances[1].paths.map(path => path.toString()), active: groupService.activeInstance?.instanceId, moves }, { paths: [resource.toString()], active: 2, moves: [] });
		instances[1].pathError = new Error('terminal disconnected');
		await rejects(dnd.performDrop(new NativeDragAndDropData(), instances[1], 1, undefined, new DragEvent('drop', { dataTransfer })), /terminal disconnected/);
	});

	for (const location of ['top', 'bottom'] as const) {
		test(`${location}: gives terminals full width and reserves exactly one row`, () => {
			tabs.location = location;
			const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
			view.layout(600, 300);
			deepStrictEqual(groups.map(group => group.size), [{ width: 600, height: 272 }, { width: 600, height: 272 }]);
		});
	}

	test('switches all locations without replacing the terminal container or saved side widths', () => {
		const storage = instantiationService.get(IStorageService);
		storage.store(TerminalStorageKeys.TabsListWidthHorizontal, 150, StorageScope.PROFILE, StorageTarget.USER);
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(600, 300);
		const original = terminalContainer;
		const sizes: { width: number; height: number }[] = [];
		for (const location of ['left', 'top', 'right', 'bottom', 'left'] as const) {
			changeConfiguration({ location });
			sizes.push(groups[0].size);
			strictEqual(terminalContainer, original);
		}
		deepStrictEqual({
			sizes,
			storedWidth: storage.getNumber(TerminalStorageKeys.TabsListWidthHorizontal, StorageScope.PROFILE)
		}, {
			sizes: [{ width: 450, height: 300 }, { width: 600, height: 272 }, { width: 450, height: 300 }, { width: 600, height: 272 }, { width: 450, height: 300 }],
			storedWidth: 150
		});
	});

	test('handles simultaneous configuration changes and a location change while hidden', () => {
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(600, 300);
		changeConfiguration({ enabled: false, location: 'bottom' });
		const disabled = groups[0].size;
		changeConfiguration({ location: 'right' });
		changeConfiguration({ enabled: true, location: 'top' });
		deepStrictEqual({ disabled, enabled: groups[0].size }, { disabled: { width: 600, height: 300 }, enabled: { width: 600, height: 272 } });
	});

	for (const location of ['left', 'right', 'top', 'bottom'] as const) {
		test(`${location}: restores terminal focus when a location change also disables tabs`, () => {
			tabs.location = location;
			const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
			view.layout(600, 300);
			const terminalInput = $('textarea');
			terminalContainer!.appendChild(terminalInput);
			stub(instances[0], 'focus').callsFake(() => terminalInput.focus());
			view.focusTabs();
			ok(container.querySelector('.tabs-container')!.contains(getActiveElement()));
			changeConfiguration({ location: location === 'top' ? 'bottom' : 'top', enabled: false });
			deepStrictEqual({
				tabsRemoved: container.querySelector('.tabs-container') === null,
				terminalFocused: getActiveElement() === terminalInput
			}, { tabsRemoved: true, terminalFocused: true });
		});
	}

	test('restores terminal focus when a location change also hides the single group', () => {
		groupService.groups = [new TabGroup(instances)];
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(600, 300);
		const terminalInput = $('textarea');
		terminalContainer!.appendChild(terminalInput);
		stub(instances[0], 'focus').callsFake(() => terminalInput.focus());
		view.focusTabs();
		changeConfiguration({ location: 'left', hideCondition: 'singleGroup' });
		deepStrictEqual({
			tabsRemoved: container.querySelector('.tabs-container') === null,
			terminalFocused: getActiveElement() === terminalInput
		}, { tabsRemoved: true, terminalFocused: true });
	});

	test('combined location and visibility changes do not steal focus from another control', () => {
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(600, 300);
		const otherInput = $('input');
		container.parentElement!.appendChild(otherInput);
		otherInput.focus();
		changeConfiguration({ location: 'right', enabled: false });
		deepStrictEqual({
			otherControlFocused: getActiveElement() === otherInput,
			terminalFocusCalls: instances[0].focusCount
		}, { otherControlFocused: true, terminalFocusCalls: 0 });
	});

	test('updates side-list text visibility from the current allocated width', () => {
		tabs.location = 'right';
		const storage = instantiationService.get(IStorageService);
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		const visibility: boolean[] = [];
		for (const width of [120, 46, 120]) {
			storage.store(TerminalStorageKeys.TabsListWidthHorizontal, width, StorageScope.PROFILE, StorageTarget.USER);
			view.layout(600, 300);
			visibility.push(container.querySelector('.tabs-container')!.classList.contains('has-text'));
		}
		deepStrictEqual(visibility, [true, false, true]);
	});

	test('hidden chat terminals do not take a second row from horizontal terminal content', () => {
		hiddenInstances = [instances[0]];
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(600, 300);
		deepStrictEqual(groups[0].size, { width: 600, height: 272 });
	});

	test('hidden chat terminals remain keyboard accessible without triggering tab rename', () => {
		hiddenInstances = [instances[1], instances[2]];
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		container.style.width = '260px';
		view.layout(260, 300);
		const entry = container.querySelector<HTMLElement>('.terminal-tabs-chat-entry')!;
		const bar = container.querySelector<HTMLElement>('.terminal-tabs-bar')!;
		ok(entry.clientWidth <= 260 * 0.4 && bar.clientWidth + entry.clientWidth <= 260);
		let bubbled = 0;
		store.add(addDisposableListener(container, 'keydown', () => bubbled++));
		entry.focus();
		entry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		const label = entry.getAttribute('aria-label');
		entry.querySelector<HTMLElement>('.terminal-tabs-chat-entry-delete')!.click();
		deepStrictEqual({
			label, executedCommands, bubbled,
			disposed: disposed.map(instance => instance.instanceId),
			hidden: entry.style.display,
			content: groups[0].size
		}, {
			label: 'Show 2 hidden chat terminals', executedCommands: ['workbench.action.terminal.chat.viewHiddenChatTerminals'],
			bubbled: 0, disposed: [2, 3], hidden: 'none', content: { width: 260, height: 272 }
		});
	});

	test('restores terminal focus when the last hidden chat entry disappears', () => {
		tabs.hideCondition = 'singleTerminal';
		groupService.instances = [instances[0]];
		groupService.groups = [new TabGroup([instances[0]])];
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(600, 300);
		hiddenInstances = [instances[1]];
		hiddenChanges.fire(instances[1]);
		const entry = container.querySelector<HTMLElement>('.terminal-tabs-chat-entry')!;
		entry.focus();
		hiddenInstances = [];
		hiddenChanges.fire(instances[1]);
		deepStrictEqual({
			focusedTerminal: instances[0].focusCount,
			tabsRemoved: container.querySelector('.tabs-container') === null,
			content: (groupService.groups[0] as TabGroup).size
		}, { focusedTerminal: 1, tabsRemoved: true, content: { width: 600, height: 300 } });
	});

	test('small and zero-height containers never pass negative terminal dimensions', () => {
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, container));
		view.layout(100, 10);
		const small = groups[0].size;
		view.layout(0, 0);
		deepStrictEqual({ small, zero: groups[0].size }, { small: { width: 100, height: 0 }, zero: { width: 0, height: 0 } });
	});
});
