/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuRegistry, isIMenuItem } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, IEditorCloseEvent } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { DEFAULT_COMMANDS_TO_SKIP_SHELL } from '../../../../../workbench/contrib/terminal/common/terminal.js';
import { IEditorGroup, IEditorGroupsService, IEmbeddedEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { SessionGridCell, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, ChatWindowHasEditorAreaContext, IChatWindow, IChatWindowKind, IChatWindowService, IChatWindowTerminalHost, SessionLayoutModeContext } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowCellView } from '../../browser/chatWindowGridHost.js';
import { resolveChatWindowFromContext } from '../../browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';
import { CHAT_WINDOW_ADD_TERMINAL_COMMAND_ID, ChatWindowTerminalPositionMenu } from '../../browser/chatWindowTerminalActions.js';
import { ChatWindowTerminals, releaseChatWindowTerminalsOnUnload } from '../../browser/chatWindowTerminals.js';

function editor(typeId = 'test'): EditorInput {
	return { typeId } as unknown as EditorInput;
}

class TestGroup extends mock<IEditorGroup>() {
	readonly onDidCloseEditorEmitter = new Emitter<IEditorCloseEvent>();
	readonly onDidModelChangeEmitter = new Emitter<IGroupModelChangeEvent>();
	override readonly onDidCloseEditor = this.onDidCloseEditorEmitter.event;
	override readonly onDidModelChange = this.onDidModelChangeEmitter.event;
	override editors: EditorInput[] = [];
	moved: EditorInput[] = [];
	override get isEmpty() { return this.editors.length === 0; }
	override contains(editor: EditorInput) { return this.editors.includes(editor); }
	override moveEditor(editor: EditorInput, target: IEditorGroup): boolean {
		this.editors = this.editors.filter(candidate => candidate !== editor);
		(target as TestGroup).editors.push(editor);
		(target as TestGroup).moved.push(editor);
		return true;
	}
	constructor(override readonly id: number) { super(); }
	dispose() {
		this.onDidCloseEditorEmitter.dispose();
		this.onDidModelChangeEmitter.dispose();
	}
}

suite('Chat window terminals', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };

	function createEnvironment(options: { handed?: boolean } = {}) {
		const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
		const group = new TestGroup(10);
		disposables.add({ dispose: () => group.dispose() });
		const onDidAddGroup = disposables.add(new Emitter<IEditorGroup>());
		const onDidRemoveGroup = disposables.add(new Emitter<IEditorGroup>());
		const onDidActivateGroup = disposables.add(new Emitter<{ group: IEditorGroup }>());
		const created: IEmbeddedEditorPart[] = [];
		const part = new class extends mock<IEmbeddedEditorPart>() {
			override readonly groups = [group];
			override readonly activeGroup = group;
			override readonly onDidAddGroup = onDidAddGroup.event;
			override readonly onDidRemoveGroup = onDidRemoveGroup.event;
			override readonly onDidActivateGroup = onDidActivateGroup.event as IEmbeddedEditorPart['onDidActivateGroup'];
			override enforcePartOptions() { return { dispose() { } }; }
			override layout() { }
			override close() { return true; }
		}();
		const contextKeyService = disposables.add(new MockContextKeyService());
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection([IContextKeyService, contextKeyService])));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override get parts() { return created; }
			override createEditorPart() {
				created.push(part);
				return part;
			}
			override getScopedInstantiationService() { return instantiationService; }
		}());
		const calls: string[] = [];
		let hostAvailable = false;
		const host: IChatWindowTerminalHost = {
			show: async (_window, target) => {
				calls.push(`show:${target.id}`);
				return options.handed ?? true;
			},
			newTerminal: async () => {
				calls.push('new');
				return true;
			},
			showTerminal: async (_window, target, instanceId) => {
				calls.push(`showTerminal:${instanceId}:${target.id}`);
				return true;
			},
			hide: () => calls.push('hide'),
			release: () => calls.push('release'),
		};
		const window = new class extends mock<IChatWindow>() { }();
		let closing = false;
		const terminals = disposables.add(instantiationService.createInstance(ChatWindowTerminals, {
			window,
			state,
			cell: disposables.add(new ChatWindowCellView(SessionGridCell.Terminals, { minimumWidth: 0, maximumWidth: 1000, minimumHeight: 0, maximumHeight: 1000 })),
			parts: [],
			bindContext: () => { },
			isClosing: () => closing,
			container: $('div'),
		}, () => hostAvailable ? host : undefined));
		return { state, group, terminals, calls, created, setHost: (available: boolean) => hostAvailable = available, setClosing: (value: boolean) => closing = value };
	}

	test('a terminal handed to the terminals, such as the terminal of a task, shows in them and shows them; without a host, it does not', async () => {
		const { state, terminals, calls, setHost } = createEnvironment();
		const withoutHost = { shown: await terminals.showTerminal(7), terminalsShown: state.terminalShown.get() };
		setHost(true);
		const hidden = { shown: await terminals.showTerminal(7), terminalsShown: state.terminalShown.get() };
		assert.deepStrictEqual({ withoutHost, hidden, calls }, {
			withoutHost: { shown: false, terminalsShown: false },
			hidden: { shown: true, terminalsShown: true },
			calls: ['showTerminal:7:10'],
		});
	});

	test('terminals shown before a host registered are filled once it does', async () => {
		const { state, terminals, calls, setHost } = createEnvironment();
		await terminals.setShown(true, false);
		const before = { shown: state.terminalShown.get(), calls: [...calls] };
		setHost(true);
		terminals.showAgain();
		await timeout(0);
		assert.deepStrictEqual({ before, after: { shown: state.terminalShown.get(), calls } }, {
			before: { shown: true, calls: [] },
			after: { shown: true, calls: ['show:10'] },
		});
	});

	test('the terminals hide when the host has no terminal to show, and stay when it hands one that opens a moment later', async () => {
		const none = createEnvironment({ handed: false });
		none.setHost(true);
		await none.terminals.setShown(true, false);
		const handed = createEnvironment({ handed: true });
		handed.setHost(true);
		await handed.terminals.setShown(true, false);
		assert.deepStrictEqual({ none: none.state.terminalShown.get(), handed: handed.state.terminalShown.get() }, { none: false, handed: true });
	});

	test('closing the last terminal hides the terminals, a move does not, and the terminals keep running when the window closes', async () => {
		const { state, group, terminals, calls, setHost, setClosing } = createEnvironment();
		setHost(true);
		await terminals.setShown(true, false);
		group.editors = [editor()];
		group.editors = [];
		group.onDidCloseEditorEmitter.fire({ context: EditorCloseContext.MOVE } as IEditorCloseEvent);
		const afterMove = state.terminalShown.get();
		group.onDidCloseEditorEmitter.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		const afterLastClosed = state.terminalShown.get();
		await terminals.setShown(true, false);
		setClosing(true);
		terminals.release();
		group.onDidCloseEditorEmitter.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		assert.deepStrictEqual({ afterMove, afterLastClosed, whenClosing: state.terminalShown.get(), calls }, {
			afterMove: true,
			afterLastClosed: false,
			whenClosing: true,
			calls: ['show:10', 'hide', 'show:10', 'release'],
		});
	});

	test('a close that does not happen keeps the terminals: they are released only as the window unloads, and given back if its editors keep it open', async () => {
		const { state, group, terminals, calls, setHost } = createEnvironment();
		setHost(true);
		await terminals.setShown(true, false);
		group.editors = [editor()];
		const onUnload = disposables.add(new Emitter<void>());
		const terminalsOfWindow: ChatWindowTerminals | undefined = terminals;
		disposables.add(releaseChatWindowTerminalsOnUnload({ onUnload: onUnload.event }, () => terminalsOfWindow));
		const beforeUnload = [...calls];
		// Closed from the window itself, but kept open by an editor of its editor area: its terminals come back.
		terminals.release();
		terminals.reclaim();
		await timeout(0);
		group.editors = [];
		group.onDidCloseEditorEmitter.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		const lastClosedAfterVeto = state.terminalShown.get();
		onUnload.fire();
		assert.deepStrictEqual({ beforeUnload, lastClosedAfterVeto, calls }, {
			beforeUnload: ['show:10'],
			lastClosedAfterVeto: false,
			calls: ['show:10', 'release', 'show:10', 'hide', 'release'],
		});
	});

	test('a terminal opened in the editor area moves to the terminals, which show', async () => {
		const { state, group, terminals, setHost } = createEnvironment();
		setHost(true);
		const editorAreaGroup = new TestGroup(20);
		disposables.add({ dispose: () => editorAreaGroup.dispose() });
		const terminal = editor('workbench.editors.terminal');
		const file = editor('workbench.editors.files.fileEditorInput');
		editorAreaGroup.editors = [terminal, file];
		terminals.moveFromEditorArea(editorAreaGroup, terminal);
		terminals.moveFromEditorArea(editorAreaGroup, file);
		await timeout(0);
		assert.deepStrictEqual({ moved: group.moved.map(editor => editor.typeId), left: editorAreaGroup.editors.map(editor => editor.typeId), shown: state.terminalShown.get() }, {
			moved: ['workbench.editors.terminal'],
			left: ['workbench.editors.files.fileEditorInput'],
			shown: true,
		});
	});

	test('the Add Tab entry for a terminal adds one to the terminals that show a terminal, else shows them', async () => {
		const { group, terminals, calls, setHost } = createEnvironment();
		setHost(true);
		await terminals.addTerminal();
		group.editors = [editor()];
		await terminals.addTerminal();
		assert.deepStrictEqual(calls, ['show:10', 'new']);
	});
});

suite('Chat window terminal actions', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('the keys of the panel, the terminal and the side panel act in a chat window, above the main window\'s rules, and are not sent to the shell', () => {
		const keybindings = KeybindingsRegistry.getDefaultKeybindings().filter(rule => rule.command === CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID || rule.command === CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID);
		assert.deepStrictEqual({
			bound: keybindings.map(rule => rule.command).sort(),
			scoped: keybindings.every(rule => rule.when?.serialize().includes('sessions.chatWindowHasEditorArea')),
			skipShell: [CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID].every(id => DEFAULT_COMMANDS_TO_SKIP_SHELL.includes(id)),
		}, {
			bound: [CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID],
			scoped: true,
			skipShell: true,
		});
	});

	test('the terminal actions act on the chat window they are invoked from, and the position is only offered side by side', async () => {
		const calls: string[] = [];
		const windows = [1, 2].map(windowId => new class extends mock<IChatWindow>() {
			override readonly windowId = windowId;
			override readonly terminalShown = observableValue('shown', false);
			override async setTerminalShown(shown: boolean) { calls.push(`${windowId}:shown:${shown}`); }
			override async addTerminal() { calls.push(`${windowId}:add`); }
			override setTerminalPosition(position: SessionTerminalPosition) { calls.push(`${windowId}:position:${position}`); }
		}());
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow(context: unknown) {
				const groupId = (context as { groupId?: number } | undefined)?.groupId;
				return groupId === undefined ? windows[0] : windows.find(window => window.windowId === groupId);
			}
		}());
		const run = (id: string, context?: unknown) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		await run(CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, { groupId: 2 });
		await run(CHAT_WINDOW_ADD_TERMINAL_COMMAND_ID, { groupId: 2 });
		await run('sessions.chatWindow.terminalPosition.underChat', { groupId: 2 });
		await run(CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID);
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		ChatWindowHasEditorAreaContext.bindTo(contextKeyService).set(true);
		const layoutContext = SessionLayoutModeContext.bindTo(contextKeyService);
		const positionItems = MenuRegistry.getMenuItems(ChatWindowTerminalPositionMenu).filter(isIMenuItem);
		const preconditions = [SessionLayoutMode.SideBySide, SessionLayoutMode.Stacked].map(mode => {
			layoutContext.set(mode);
			return positionItems.map(item => contextKeyService.contextMatchesRules(item.command.precondition));
		});
		assert.deepStrictEqual({ calls, preconditions }, {
			calls: ['2:shown:true', '2:add', '2:position:underChat', '1:shown:true'],
			preconditions: [[true, true, true], [false, false, false]],
		});
	});

	test('Terminal Position from the editor title of a chat window\'s terminals acts on that window; without a context, on the active one', async () => {
		const calls: string[] = [];
		const groupsOf = (...ids: number[]) => ({ groups: ids.map(id => new class extends mock<IEditorGroup>() { override readonly id = id; }()) });
		const windows = [{ windowId: 1, editorArea: groupsOf(10), terminals: groupsOf(11) }, { windowId: 2, editorArea: groupsOf(20), terminals: groupsOf(21, 22) }].map(({ windowId, editorArea, terminals }) => ({
			windowId,
			parts: [editorArea, terminals],
			window: new class extends mock<IChatWindow>() {
				override readonly windowId = windowId;
				override setTerminalPosition(position: SessionTerminalPosition) { calls.push(`${windowId}:${position}`); }
			}(),
		}));
		const activeWindowId = 1;
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override resolveWindow(context: unknown) {
				return resolveChatWindowFromContext(windows, entry => entry.parts, context, activeWindowId)?.window;
			}
		}());
		const run = (id: string, context?: unknown) => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(id)!.handler(accessor, context));
		await run('sessions.chatWindow.terminalPosition.underChat', { groupId: 22 });
		await run('sessions.chatWindow.terminalPosition.underEditor', { groupId: 20 });
		await run('sessions.chatWindow.terminalPosition.fullWidth');
		await run('sessions.chatWindow.terminalPosition.underChat', { groupId: 99 });
		await run('sessions.chatWindow.terminalPosition.underEditor', { chatWindowId: 2 });
		assert.deepStrictEqual(calls, ['2:underChat', '2:underEditor', '1:fullWidth', '1:underChat', '2:underEditor']);
	});
});
