/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IInstantiationService, ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { GroupModelChangeKind } from '../../../../../workbench/common/editor.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ICreateTerminalOptions, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatWindowTerminals, IChatWindowTerminalsSource } from '../../browser/chatWindowTerminals.js';

/** The id of the chat window of the tests, not the main window's. */
const CHAT_WINDOW_ID = mainWindow.vscodeWindowId + 1;

class TestGroup extends mock<IEditorGroup>() {
	readonly onModelChange = new Emitter<IGroupModelChangeEvent>();
	override readonly onDidModelChange = this.onModelChange.event;
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
	open(editor: EditorInput) {
		this.editors.push(editor);
		this.onModelChange.fire({ kind: GroupModelChangeKind.EDITOR_OPEN, editor });
	}
	constructor(override readonly id: number, override readonly windowId = CHAT_WINDOW_ID) { super(); }
	dispose() { this.onModelChange.dispose(); }
}

function createPart(group: TestGroup, element = $('div')): IContentPart {
	return new class extends mock<IContentPart>() {
		override readonly element = element;
		override readonly groups = [group];
		override readonly activeGroup = group;
		override readonly onDidAddGroup = Event.None;
		override readonly onDidRemoveGroup = Event.None;
	}();
}

function editor(typeId: string, resource?: URI): EditorInput {
	return upcastPartial<EditorInput>({ typeId, resource });
}

function terminal(instanceId: number, options: { target?: TerminalLocation; resource?: URI; calls?: string[] } = {}): ITerminalInstance {
	return new class extends mock<ITerminalInstance>() {
		override readonly instanceId = instanceId;
		override readonly isDisposed = false;
		override readonly resource = options.resource ?? URI.parse(`vscode-terminal:/1/${instanceId}`);
		override target: TerminalLocation | undefined = options.target ?? TerminalLocation.Panel;
		override async focusWhenReady() { options.calls?.push('focus'); }
	}();
}

suite('Chat window terminals', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	interface IEnvironmentOptions {
		/** The terminal the session gives a chat window, if any. */
		readonly terminal?: ITerminalInstance;
		/** Terminals the terminal service knows by id. */
		readonly instances?: readonly ITerminalInstance[];
		/** Terminals that show in the foreground of the panel. */
		readonly foreground?: ITerminalInstance[];
		/** Whether the window was restored with its terminals: the part that holds them is there, empty. */
		readonly restoredWithTerminals?: boolean;
		/** Groups before the terminals' group, as the order of all groups, for its view column. */
		readonly groupsBefore?: number;
		/** The terminal of the session, once it is created: the window waits for it. */
		readonly pendingTerminal?: Promise<ITerminalInstance | undefined>;
		/** The terminals of a group of the main window's panel, the first of them its active one. */
		readonly panelGroup?: ITerminalInstance[];
		/** Whether a terminal moved to an editor opens there later, as the editor service opens it. */
		readonly opensLater?: boolean;
		/** The id of the window, such as of the active window, which is the main window in tests. */
		readonly windowId?: number;
	}

	function createEnvironment(options: IEnvironmentOptions = {}) {
		const calls: string[] = [];
		const shownInChatWindow: string[] = [];
		const session = upcastPartial<IActiveSession>({ sessionId: 'session-1' });

		// The window: its main part, and the part that holds its terminals once created.
		const mainGroup = new TestGroup(5);
		const terminalsGroup = new TestGroup(7);
		const chatGroup = new TestGroup(9);
		disposables.add({ dispose: () => { mainGroup.dispose(); terminalsGroup.dispose(); chatGroup.dispose(); } });
		const mainPart = createPart(mainGroup);
		const chatPart = createPart(chatGroup);
		const chatEditor = editor('workbench.editors.viewEditor');
		const terminalsElement = $('div');
		const terminalsPart = createPart(terminalsGroup, terminalsElement);
		const terminalsPartObs = observableValue<IContentPart | undefined>('terminalsPart', options.restoredWithTerminals ? terminalsPart : undefined);
		const onWillClose = disposables.add(new Emitter<void>());
		let focused = 0;
		const window = new class extends mock<IChatWindow>() {
			override readonly windowId = options.windowId ?? CHAT_WINDOW_ID;
			override readonly mainPart: IContentPart = mainPart;
			override readonly chatPart: IContentPart = chatPart;
			override readonly chatEditor = chatEditor;
			override readonly terminalsPart: IObservable<IContentPart | undefined> = terminalsPartObs;
			override readonly terminalsVisible = derived(reader => !!terminalsPartObs.read(reader) && terminalsGroup.editors.length > 0);
			override readonly onWillClose = onWillClose.event;
			override getOrCreateTerminalsPart() {
				if (!terminalsPartObs.get()) {
					calls.push('createPart');
					terminalsPartObs.set(terminalsPart, undefined);
				}
				return terminalsPart;
			}
			override focus() { focused++; }
		}();
		const windows = observableValue<readonly IChatWindow[]>('windows', []);

		const instantiationService = disposables.add(new TestInstantiationService());
		const foreground = options.foreground ?? [];
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override get foregroundInstances() { return foreground; }
			override getInstanceFromId(id: number) { return options.instances?.find(instance => instance.instanceId === id); }
			override async showBackgroundTerminal(instance: ITerminalInstance) {
				foreground.push(instance);
				calls.push('fromBackground');
			}
			override moveToEditor(instance: ITerminalInstance, groupId: number) {
				instance.target = TerminalLocation.Editor;
				calls.push(`toEditor:${groupId}`);
				panelGroup?.instances.splice(panelGroup.instances.indexOf(instance), 1);
				if (options.opensLater) {
					setTimeout(() => { calls.push('opened'); terminalsGroup.open(editor('workbench.editors.terminal', instance.resource)); }, 10);
				} else {
					terminalsGroup.editors.push(editor('workbench.editors.terminal', instance.resource));
				}
			}
			override async moveToTerminalView() { calls.push('toTerminalView'); }
			override moveToBackground(instance: ITerminalInstance) {
				foreground.splice(foreground.indexOf(instance), 1);
				calls.push('toBackground');
				terminalsGroup.editors = terminalsGroup.editors.filter(candidate => candidate.resource?.toString() !== instance.resource.toString());
			}
			override async createTerminal(createOptions?: ICreateTerminalOptions) {
				calls.push(`new:${JSON.stringify(createOptions?.location)}`);
				return terminal(100);
			}
		}());
		const otherWindowGroups: TestGroup[] = [];
		const panelGroup = options.panelGroup && { instances: options.panelGroup, active: 0 };
		instantiationService.stub(ITerminalGroupService, new class extends mock<ITerminalGroupService>() {
			override getGroupForInstance(instance: ITerminalInstance) {
				return panelGroup?.instances.includes(instance) ? upcastPartial<ITerminalGroup>({
					get activeInstance() { return panelGroup.instances[panelGroup.active]; },
					get terminalInstances() { return panelGroup.instances; },
					setActiveInstanceByIndex: (index: number) => { calls.push(`panelActive:${panelGroup.instances[index].instanceId}`); panelGroup.active = index; },
				}) : undefined;
			}
		}());
		const otherGroups = Array.from({ length: options.groupsBefore ?? 0 }, (_, index) => upcastPartial<IEditorGroup>({ id: 100 + index }));
		const sessionScope: ISessionScope = { _serviceBrand: undefined, session: observableValue('session', session) };
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getGroups() { return [...otherGroups, terminalsGroup]; }
			override get groups() { return [mainGroup, terminalsGroup, chatGroup, ...otherWindowGroups]; }
			override getScopedInstantiationService(part: IEditorPart) {
				assert.strictEqual(part, mainPart);
				const accessor = upcastPartial<ServicesAccessor>({ get: <T>() => sessionScope as T });
				return upcastPartial<IInstantiationService>({ invokeFunction: (<R>(fn: (accessor: ServicesAccessor) => R) => fn(accessor)) as IInstantiationService['invokeFunction'] });
			}
		}());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override readonly windows = windows;
		}());

		const source: IChatWindowTerminalsSource = {
			getChatWindowTerminal: async (forSession: IActiveSession, location?: ITerminalLocationOptions) => {
				calls.push(`terminalOf:${forSession.sessionId}:${JSON.stringify(location)}`);
				return options.pendingTerminal ? options.pendingTerminal : options.terminal;
			},
			createChatWindowTerminal: async (forSession: IActiveSession, location?: ITerminalLocationOptions) => {
				calls.push(`newOf:${forSession.sessionId}:${JSON.stringify(location)}`);
				return terminal(100);
			},
			setShownInChatWindow: (instance, shown) => shownInChatWindow.push(`${instance.instanceId}:${shown}`),
		};
		windows.set([window], undefined);
		const terminals = disposables.add(instantiationService.createInstance(ChatWindowTerminals, source));
		return { calls, shownInChatWindow, window, windows, terminals, terminalsGroup, terminalsElement, mainGroup, otherWindowGroups, chatGroup, chatEditor, onWillClose, get focused() { return focused; } };
	}

	test('shows a terminal of the window\'s session in the part that holds its terminals, and gives it back to the panel, still running, as the window closes', async () => {
		const calls: string[] = [];
		const instance = terminal(5, { calls });
		const environment = createEnvironment({ terminal: instance });

		const shown = await environment.terminals.show(environment.window, true);
		environment.onWillClose.fire();

		assert.deepStrictEqual({ shown, calls: [...environment.calls, ...calls], shownInChatWindow: environment.shownInChatWindow, target: instance.target }, {
			shown: true,
			calls: ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7', 'toBackground', 'focus'],
			shownInChatWindow: ['5:true', '5:false'],
			target: TerminalLocation.Panel,
		});
	});

	test('shows a terminal handed to it, such as the terminal of a task, in the window, from the panel, and once only when it runs again; an unknown one does not show', async () => {
		const instance = terminal(9);
		const { terminals, window, calls, shownInChatWindow } = createEnvironment({ instances: [instance], foreground: [instance] });

		const first = await terminals.showTerminal(window, 9, false);
		const again = await terminals.showTerminal(window, 9, false);
		const unknown = await terminals.showTerminal(window, 99, false);
		terminals.release(window);

		assert.deepStrictEqual({ first, again, unknown, calls, shownInChatWindow, shownInWindow: window.terminalsVisible.get() }, {
			first: true,
			again: true,
			unknown: false,
			calls: ['createPart', 'toEditor:7', 'toBackground'],
			shownInChatWindow: ['9:true', '9:false'],
			shownInWindow: false,
		});
	});

	test('shows a terminal of a session, such as of a task run for it, in the window that shows the session while it is the active window, such as one the task was run from; for another session, or while another window, such as the main window, is active, it does not', async () => {
		const instance = terminal(9);
		// The active window in tests is the main window
		const { terminals, window, calls } = createEnvironment({ instances: [instance], foreground: [instance], windowId: mainWindow.vscodeWindowId });

		const otherSession = await terminals.showSessionTerminal(upcastPartial<ISession>({ sessionId: 'session-2' }), 9, false);
		const shownSession = await terminals.showSessionTerminal(upcastPartial<ISession>({ sessionId: 'session-1' }), 9, false);
		const shownInWindow = window.terminalsVisible.get();
		terminals.release(window);

		const inactive = createEnvironment({ instances: [terminal(9)], foreground: [] });
		const notActive = await inactive.terminals.showSessionTerminal(upcastPartial<ISession>({ sessionId: 'session-1' }), 9, false);

		assert.deepStrictEqual({ otherSession, shownSession, shownInWindow, calls, notActive, notActiveCalls: inactive.calls }, {
			otherSession: false,
			shownSession: true,
			shownInWindow: true,
			calls: ['createPart', 'toEditor:7', 'toBackground'],
			notActive: false,
			notActiveCalls: [],
		});
	});

	test('creates the first terminal of a chat window in the part that holds its terminals, rather than in the panel of the main window to move it, and does not move it again', async () => {
		const calls: string[] = [];
		const resource = URI.parse('vscode-terminal:/1/3');
		const instance = terminal(3, { target: TerminalLocation.Editor, resource, calls });
		const environment = createEnvironment({ terminal: instance, foreground: [instance], groupsBefore: 1 });
		// Created in the group: the terminal service opened it there.
		environment.terminalsGroup.editors.push(editor('workbench.editors.terminal', resource));

		const shown = await environment.terminals.show(environment.window, true);

		assert.deepStrictEqual({ shown, calls: [...environment.calls, ...calls] }, {
			shown: true,
			// The group is the second of all groups: the terminal is created at its column, and only focused.
			calls: ['createPart', 'terminalOf:session-1:{"viewColumn":1}', 'focus'],
		});
	});

	test('the terminals do not show when the session has no terminal to show', async () => {
		const { terminals, window, calls } = createEnvironment();

		const shown = await terminals.show(window, false);

		assert.deepStrictEqual({ shown, calls, visible: window.terminalsVisible.get() }, { shown: false, calls: ['createPart', 'terminalOf:session-1:{"viewColumn":0}'], visible: false });
	});

	test('hiding the terminals gives them back to the panel, still running, and focus in them stays in the window, in its chat', async () => {
		const environment = createEnvironment({ terminal: terminal(5) });
		const { terminals, window, terminalsElement } = environment;
		await terminals.show(window, false);
		mainWindow.document.body.appendChild(terminalsElement);
		disposables.add({ dispose: () => terminalsElement.remove() });
		append(terminalsElement, $('textarea')).focus();

		terminals.hide(window);

		assert.deepStrictEqual({ visible: window.terminalsVisible.get(), calls: environment.calls, shownInChatWindow: environment.shownInChatWindow, focused: environment.focused }, {
			visible: false,
			calls: ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7', 'toBackground'],
			shownInChatWindow: ['5:true', '5:false'],
			focused: 1,
		});
	});

	test('toggling shows the terminals, and hides them while they show; they show the same terminal again', async () => {
		const { terminals, window, calls } = createEnvironment({ terminal: terminal(5) });

		await terminals.toggle(window);
		const shown = window.terminalsVisible.get();
		await terminals.toggle(window);
		const hidden = window.terminalsVisible.get();
		await terminals.toggle(window);

		assert.deepStrictEqual({ shown, hidden, shownAgain: window.terminalsVisible.get(), calls }, {
			shown: true,
			hidden: false,
			shownAgain: true,
			calls: ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7', 'toBackground', 'fromBackground', 'toEditor:7'],
		});
	});

	test('a window restored with its terminals shows a terminal of its session in the part that holds them', async () => {
		const { calls } = createEnvironment({ terminal: terminal(5), restoredWithTerminals: true });

		await timeout(0);

		assert.deepStrictEqual(calls, ['terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7']);
	});

	test('a terminal the user moved into another part of the window, such as its main part, stays there as the terminals hide and show: they show a terminal of their own in the part that holds them', async () => {
		const instance = terminal(9, { target: TerminalLocation.Editor });
		const { terminals, window, calls, mainGroup, terminalsGroup } = createEnvironment({ terminal: terminal(5), instances: [instance], foreground: [instance] });
		await terminals.showTerminal(window, 9, false);
		// The user moved it into the main part
		const terminalEditor = terminalsGroup.editors.find(candidate => candidate.resource?.toString() === instance.resource.toString())!;
		terminalsGroup.moveEditor(terminalEditor, mainGroup);
		calls.length = 0;

		// Cmd+J twice
		await terminals.toggle(window);
		const shown = { visible: window.terminalsVisible.get(), calls: [...calls] };
		await terminals.toggle(window);

		assert.deepStrictEqual({ shown, hidden: { visible: window.terminalsVisible.get(), calls: calls.slice(shown.calls.length) }, stays: mainGroup.contains(terminalEditor) && !terminalsGroup.contains(terminalEditor) }, {
			shown: { visible: true, calls: ['terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7'] },
			hidden: { visible: false, calls: ['toBackground'] },
			stays: true,
		});
	});

	test('showing the terminals moves a terminal of the window that is in an editor of the main window\'s editor area from that group, not through the panel of the main window, which would show and focus it', async () => {
		const instance = terminal(9, { target: TerminalLocation.Editor });
		const { terminals, window, calls, terminalsGroup, otherWindowGroups } = createEnvironment({ instances: [instance], foreground: [instance] });
		await terminals.showTerminal(window, 9, false);
		const terminalEditor = terminalsGroup.editors.find(candidate => candidate.resource?.toString() === instance.resource.toString())!;
		const otherWindowGroup = new TestGroup(12, mainWindow.vscodeWindowId);
		disposables.add({ dispose: () => otherWindowGroup.dispose() });
		otherWindowGroups.push(otherWindowGroup);
		terminalsGroup.moveEditor(terminalEditor, otherWindowGroup);
		calls.length = 0;

		await terminals.show(window, false);
		terminals.release(window);

		assert.deepStrictEqual({ calls, movedBack: terminalsGroup.moved.includes(terminalEditor) }, {
			calls: ['toBackground'],
			movedBack: true,
		});
	});

	test('a terminal of the window that another chat window shows now, such as one the user moved there, is that window\'s: showing the terminals does not take it from there', async () => {
		const instance = terminal(9, { target: TerminalLocation.Editor });
		const { terminals, window, windows, calls, terminalsGroup, otherWindowGroups } = createEnvironment({ instances: [instance], foreground: [instance] });
		await terminals.showTerminal(window, 9, false);
		const terminalEditor = terminalsGroup.editors.find(candidate => candidate.resource?.toString() === instance.resource.toString())!;
		const otherChatWindowId = CHAT_WINDOW_ID + 1;
		const otherGroup = new TestGroup(12, otherChatWindowId);
		const otherMainGroup = new TestGroup(13, otherChatWindowId);
		disposables.add({ dispose: () => { otherGroup.dispose(); otherMainGroup.dispose(); } });
		otherWindowGroups.push(otherGroup);
		windows.set([window, new class extends mock<IChatWindow>() {
			override readonly windowId = otherChatWindowId;
			override readonly mainPart = createPart(otherMainGroup);
			override readonly terminalsPart = constObservable(undefined);
			override readonly onWillClose = Event.None;
		}()], undefined);
		terminalsGroup.moveEditor(terminalEditor, otherGroup);
		calls.length = 0;

		await terminals.show(window, false);
		terminals.release(window);

		assert.deepStrictEqual({ calls: calls.filter(call => call !== 'terminalOf:session-1:{"viewColumn":0}'), stays: otherGroup.contains(terminalEditor), movedBack: terminalsGroup.moved.includes(terminalEditor) }, {
			calls: [],
			stays: true,
			movedBack: false,
		});
	});

	test('a terminal of the session from the panel of the main window, the active one of its group there, leaves it without that group focusing another terminal there, and takes the focus only once it shows in the window', async () => {
		const calls: string[] = [];
		const instance = terminal(9, { calls });
		const sibling = terminal(10, { calls });
		const environment = createEnvironment({ terminal: instance, instances: [instance, sibling], foreground: [instance, sibling], panelGroup: [instance, sibling], opensLater: true });

		await environment.terminals.show(environment.window, true);
		environment.terminals.release(environment.window);

		assert.deepStrictEqual([...environment.calls, ...calls].filter(call => call !== 'toBackground'), ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'panelActive:10', 'toEditor:7', 'opened', 'focus']);
	});

	test('a terminal opened in the main part moves to the part that holds the terminals; other editors stay', async () => {
		const { mainGroup, terminalsGroup, calls } = createEnvironment();
		const terminalEditor = editor('workbench.editors.terminal');
		const file = editor('workbench.editors.files.fileEditorInput');

		mainGroup.open(terminalEditor);
		mainGroup.open(file);
		await timeout(0);

		assert.deepStrictEqual({ moved: terminalsGroup.moved.map(candidate => candidate.typeId), left: mainGroup.editors.map(candidate => candidate.typeId), calls }, {
			moved: ['workbench.editors.terminal'],
			left: ['workbench.editors.files.fileEditorInput'],
			calls: ['createPart'],
		});
	});

	test('a terminal the user moves into the main part from another group, such as by merging the terminals into the main part, stays there', async () => {
		const { mainGroup, terminalsGroup, calls } = createEnvironment();
		const terminalEditor = editor('workbench.editors.terminal');
		terminalsGroup.editors.push(terminalEditor);

		// A move to another group opens the editor there before it closes where it was
		mainGroup.open(terminalEditor);
		terminalsGroup.editors = terminalsGroup.editors.filter(candidate => candidate !== terminalEditor);
		await timeout(0);

		assert.deepStrictEqual({ inMain: mainGroup.contains(terminalEditor), inTerminals: terminalsGroup.contains(terminalEditor), calls }, {
			inMain: true,
			inTerminals: false,
			calls: [],
		});
	});

	test('another editor that opens in the part that holds the terminals, such as one dropped on it, stays there beside the terminals; the chat goes back to the chat part', async () => {
		const { mainGroup, terminalsGroup, chatGroup, chatEditor } = createEnvironment({ restoredWithTerminals: true });
		const terminalEditor = editor('workbench.editors.terminal');
		const file = editor('workbench.editors.files.fileEditorInput');

		terminalsGroup.open(terminalEditor);
		terminalsGroup.open(file);
		terminalsGroup.open(chatEditor);
		await timeout(0);

		assert.deepStrictEqual({ terminals: terminalsGroup.editors.map(candidate => candidate.typeId), main: mainGroup.moved.map(candidate => candidate.typeId), chat: chatGroup.moved.map(candidate => candidate.typeId) }, {
			terminals: ['workbench.editors.terminal', 'workbench.editors.files.fileEditorInput'],
			main: [],
			chat: ['workbench.editors.viewEditor'],
		});
	});

	test('the Add Tab entry for a terminal adds one to the terminals that show a terminal, else shows them', async () => {
		const { terminals, window, calls } = createEnvironment({ terminal: terminal(5) });

		await terminals.addTerminal(window);
		await terminals.addTerminal(window);

		assert.deepStrictEqual(calls, ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7', 'newOf:session-1:{"viewColumn":0}']);
	});

	test('a window that closes while its first terminal is created does not take it: nothing moves into the window, the terminal stays with its session', async () => {
		const pending = new DeferredPromise<ITerminalInstance | undefined>();
		const { terminals, window, calls, shownInChatWindow, terminalsGroup, onWillClose } = createEnvironment({ pendingTerminal: pending.p });

		const showing = terminals.show(window, true);
		await timeout(0);
		onWillClose.fire();
		pending.complete(terminal(5));
		const shown = await showing;

		// Nor does it listen to the part that holds its terminals, for terminals to take as its own.
		assert.deepStrictEqual({ shown, calls, shownInChatWindow, listens: terminalsGroup.onModelChange.hasListeners() }, { shown: false, calls: ['createPart', 'terminalOf:session-1:{"viewColumn":0}'], shownInChatWindow: ['5:false'], listens: false });
	});

	test('a terminal created as an editor for a window that closed meanwhile goes into the background of the panel, rather than staying in an editor of another group', async () => {
		const pending = new DeferredPromise<ITerminalInstance | undefined>();
		const { terminals, window, calls, shownInChatWindow, onWillClose } = createEnvironment({ pendingTerminal: pending.p });

		const showing = terminals.show(window, true);
		await timeout(0);
		onWillClose.fire();
		const instance = terminal(5, { target: TerminalLocation.Editor });
		pending.complete(instance);
		const shown = await showing;

		assert.deepStrictEqual({ shown, calls, shownInChatWindow, target: instance.target }, {
			shown: false,
			calls: ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'toBackground'],
			shownInChatWindow: ['5:false'],
			target: TerminalLocation.Panel,
		});
	});
});
