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
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { GroupModelChangeKind } from '../../../../../workbench/common/editor.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { IChatWindow, IChatWindowService } from '../../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ICreateTerminalOptions, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { TerminalEditorInput } from '../../../../../workbench/contrib/terminal/browser/terminalEditorInput.js';
import { IContentPart, IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionHost, ISessionHostService, SessionHostKind } from '../../../../services/sessions/browser/sessionHost.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatWindowTerminals, IChatWindowTerminalsSource } from '../../browser/chatWindowTerminals.js';

/** The id of the chat window of the tests, not the main window's. */
const CHAT_WINDOW_ID = mainWindow.vscodeWindowId + 1;

class TestGroup extends mock<IEditorGroup>() {
	readonly onModelChange = new Emitter<IGroupModelChangeEvent>();
	override readonly onDidModelChange = this.onModelChange.event;
	override editors: EditorInput[] = [];
	override activeEditor: EditorInput | null = null;
	moved: EditorInput[] = [];
	activated: EditorInput[] = [];
	override get isEmpty() { return this.editors.length === 0; }
	override contains(editor: EditorInput) { return this.editors.includes(editor); }
	override moveEditor(editor: EditorInput, target: IEditorGroup, options?: { index?: number }): boolean {
		this.editors = this.editors.filter(candidate => candidate !== editor);
		if (target === this && options?.index !== undefined) {
			this.editors.splice(options.index, 0, editor);
			return true;
		}
		(target as TestGroup).editors.push(editor);
		(target as TestGroup).moved.push(editor);
		return true;
	}
	override async openEditor(editor: EditorInput) {
		this.activeEditor = editor;
		this.activated.push(editor);
		return undefined;
	}
	open(editor: EditorInput) {
		this.editors.push(editor);
		this.activeEditor = editor;
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

/**
 * The editor of a terminal, which knows its terminal also while the terminal services do not list it, such as while it
 * moves between groups; records in `detached` when it lets go of its terminal.
 */
function terminalEditor(instance: ITerminalInstance, detached: string[]): EditorInput {
	const input = Object.create(TerminalEditorInput.prototype) as TerminalEditorInput;
	Object.defineProperty(input, 'resource', { value: instance.resource });
	Object.defineProperty(input, 'terminalInstance', { value: instance });
	Object.defineProperty(input, 'detachInstance', { value: () => detached.push(`detach:${instance.instanceId}`) });
	Object.defineProperty(input, 'dispose', { value: () => detached.push(`dispose:${instance.instanceId}`) });
	return input;
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
		/** The terminals the session gives a chat window, in their order, rather than {@link terminal}. */
		readonly terminals?: ITerminalInstance[];
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
		/** Whether an editor opens first in its group, as `workbench.editor.openPositioning` `first` opens it. */
		readonly opensFirst?: boolean;
		/** Called as a terminal moves into an editor group, such as to close the window meanwhile. */
		readonly onMoveToEditor?: (instance: ITerminalInstance) => void;
		/** The terminals the window gets for a session, such as ones it creates, when the test controls them. */
		readonly terminalsOf?: (session: ISession) => Promise<readonly ITerminalInstance[]>;
	}

	function createEnvironment(options: IEnvironmentOptions = {}) {
		const calls: string[] = [];
		const shownInChatWindow: string[] = [];
		const tracked: string[] = [];
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
		const onWillCloseParts = disposables.add(new Emitter<void>());
		let focused = 0;
		const window = new class extends mock<IChatWindow>() {
			override readonly windowId = options.windowId ?? CHAT_WINDOW_ID;
			override readonly mainPart: IContentPart = mainPart;
			override readonly chatPart: IContentPart = chatPart;
			override readonly chatEditor = chatEditor;
			override readonly terminalsPart: IObservable<IContentPart | undefined> = terminalsPartObs;
			override readonly terminalsVisible = derived(reader => !!terminalsPartObs.read(reader) && terminalsGroup.editors.length > 0);
			override readonly onWillClose = onWillClose.event;
			override readonly onWillCloseParts = onWillCloseParts.event;
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
			override getInstanceFromResource(resource: URI | undefined) { return [...options.instances ?? [], ...options.terminals ?? [], ...options.terminal ? [options.terminal] : []].find(instance => instance.resource.toString() === resource?.toString()); }
			override async showBackgroundTerminal(instance: ITerminalInstance) {
				foreground.push(instance);
				calls.push('fromBackground');
			}
			override moveToEditor(instance: ITerminalInstance, groupId: number) {
				instance.target = TerminalLocation.Editor;
				calls.push(`toEditor:${groupId}`);
				panelGroup?.instances.splice(panelGroup.instances.indexOf(instance), 1);
				options.onMoveToEditor?.(instance);
				if (options.opensLater) {
					setTimeout(() => { calls.push('opened'); terminalsGroup.open(editor('workbench.editors.terminal', instance.resource)); }, 10);
				} else if (options.opensFirst) {
					terminalsGroup.editors.unshift(editor('workbench.editors.terminal', instance.resource));
				} else {
					terminalsGroup.editors.push(editor('workbench.editors.terminal', instance.resource));
				}
			}
			override async moveToTerminalView() { calls.push('toTerminalView'); }
			override moveToBackground(instance: ITerminalInstance) {
				foreground.splice(foreground.indexOf(instance), 1);
				calls.push('toBackground');
				// Its editor closes, wherever it is
				for (const group of [terminalsGroup, mainGroup, chatGroup]) {
					group.editors = group.editors.filter(candidate => candidate.resource?.toString() !== instance.resource.toString());
				}
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
		// The session whose chat the window shows, which changes as another chat of the window becomes active.
		const hostSession = observableValue<IActiveSession | undefined>('hostSession', session);
		const host = upcastPartial<ISessionHost>({ kind: SessionHostKind.ChatWindow, session: hostSession, chat: constObservable(undefined) });
		// The hosts of other chat windows, by window id: the window's host otherwise.
		const hostsByWindow = new Map<number, ISessionHost>();
		instantiationService.stub(ISessionHostService, upcastPartial<ISessionHostService>({ getHostOfWindow: windowId => hostsByWindow.get(windowId) ?? host }));
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getGroups() { return [...otherGroups, terminalsGroup]; }
			override get groups() { return [mainGroup, terminalsGroup, chatGroup, ...otherWindowGroups]; }
			override readonly onDidAddGroup = Event.None;
			override readonly onDidRemoveGroup = Event.None;
		}());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override readonly windows = windows;
		}());
		const onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		instantiationService.stub(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = onDidChangeSessions.event;
		}());

		// The session each terminal is a terminal of, as the sessions' terminals track it.
		const owners = new Map<number, string>();
		const source: IChatWindowTerminalsSource = {
			getChatWindowTerminals: async (forSession: ISession, _chat: IChat | undefined, location?: ITerminalLocationOptions) => {
				calls.push(`terminalOf:${forSession.sessionId}:${JSON.stringify(location)}`);
				const instance = options.terminalsOf || !options.pendingTerminal ? options.terminal : await options.pendingTerminal;
				const instances = options.terminalsOf ? await options.terminalsOf(forSession) : options.terminals ?? (instance ? [instance] : []);
				instances.forEach(candidate => owners.set(candidate.instanceId, forSession.sessionId));
				return instances;
			},
			createChatWindowTerminal: async (forSession: ISession, _chat: IChat | undefined, location?: ITerminalLocationOptions) => {
				calls.push(`newOf:${forSession.sessionId}:${JSON.stringify(location)}`);
				const created = terminal(100);
				owners.set(created.instanceId, forSession.sessionId);
				return created;
			},
			setShownInChatWindow: (instance, shown) => shownInChatWindow.push(`${instance.instanceId}:${shown}`),
			trackChatWindowTerminal: (forSession, instance) => {
				shownInChatWindow.push(`${instance.instanceId}:true`);
				tracked.push(`${forSession.sessionId}:${instance.instanceId}`);
				owners.set(instance.instanceId, forSession.sessionId);
			},
			getChatWindowTerminalOwner: instance => owners.get(instance.instanceId),
		};
		windows.set([window], undefined);
		const terminals = disposables.add(instantiationService.createInstance(ChatWindowTerminals, source));
		return { calls, shownInChatWindow, tracked, owners, hostSession, hostsByWindow, window, windows, terminals, terminalsGroup, terminalsElement, mainGroup, otherWindowGroups, chatGroup, chatEditor, onWillClose, onWillCloseParts, onDidChangeSessions, session, get focused() { return focused; } };
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

	test('terminals a window gets for a session while it switches to a chat of another session stay that session\'s: they wait in the panel, rather than showing for the other session, and show once the window shows the session again', async () => {
		const instance = terminal(5);
		const acquired = new DeferredPromise<ITerminalInstance | undefined>();
		const environment = createEnvironment({ pendingTerminal: acquired.p });
		const otherSession = upcastPartial<IActiveSession>({ sessionId: 'session-2' });

		const showing = environment.terminals.show(environment.window, false);
		// Another chat of the window, of another session, becomes active while the terminals of the first are on their way.
		environment.hostSession.set(otherSession, undefined);
		await acquired.complete(instance);
		const shownForOther = await showing;
		const whileOther = { owner: environment.owners.get(5), tracked: [...environment.tracked], target: instance.target, inTerminalsPart: environment.terminalsGroup.editors.length };
		environment.hostSession.set(environment.session, undefined);
		const shownAgain = await environment.terminals.show(environment.window, false);

		assert.deepStrictEqual({ shownForOther, whileOther, shownAgain, owner: environment.owners.get(5), tracked: environment.tracked }, {
			shownForOther: false,
			whileOther: { owner: 'session-1', tracked: [], target: TerminalLocation.Panel, inTerminalsPart: 0 },
			shownAgain: true,
			owner: 'session-1',
			tracked: ['session-1:5'],
		});
	});

	test('a terminal that shows for a session in an editor that opens later, while the window switches to a chat of another session, does not stay in the window: it waits in the panel, still the session\'s', async () => {
		const instance = terminal(5);
		const otherSession = upcastPartial<IActiveSession>({ sessionId: 'session-2' });
		let switchSession = () => { };
		// The editor opens 10ms after the terminal moved; the window switches before that.
		const environment = createEnvironment({ terminal: instance, opensLater: true, onMoveToEditor: () => setTimeout(() => switchSession(), 5) });
		switchSession = () => environment.hostSession.set(otherSession, undefined);

		const shown = await environment.terminals.show(environment.window, false);
		await timeout(20);

		assert.deepStrictEqual({ shown, inTerminalsPart: environment.terminalsGroup.editors.length, target: instance.target, shownInChatWindow: environment.shownInChatWindow.at(-1), owner: environment.owners.get(5) }, {
			shown: false,
			inTerminalsPart: 0,
			target: TerminalLocation.Panel,
			shownInChatWindow: '5:false',
			owner: 'session-1',
		});
	});

	test('terminals that open in a window while it gets terminals for a session are the session the window shows, unless they are the ones it gets: one opened by New Terminal, and one of another session moved into the window', async () => {
		const acquired = terminal(5);
		const created = terminal(30);
		const moved = terminal(31);
		const pending = new DeferredPromise<readonly ITerminalInstance[]>();
		const otherSession = upcastPartial<IActiveSession>({ sessionId: 'session-2' });
		const environment = createEnvironment({ instances: [created, moved], terminalsOf: () => pending.p });
		environment.owners.set(31, 'session-3');

		const showing = environment.terminals.show(environment.window, false);
		environment.hostSession.set(otherSession, undefined);
		environment.terminalsGroup.open(editor('workbench.editors.terminal', created.resource));
		environment.mainGroup.open(editor('workbench.editors.terminal', moved.resource));
		await pending.complete([acquired]);
		await showing;
		// The window's main part moves a terminal that opens there to the part that holds its terminals once it opened.
		await timeout(0);

		assert.deepStrictEqual({ acquired: environment.owners.get(5), created: environment.owners.get(30), moved: environment.owners.get(31) }, {
			acquired: 'session-1',
			created: 'session-2',
			moved: 'session-2',
		});
	});

	/** A terminal with no session that opens in the window while it gets terminals for its session, and its editor there. */
	function openUnownedWhileAcquiring() {
		const created = terminal(30);
		const pending = new DeferredPromise<readonly ITerminalInstance[]>();
		const environment = createEnvironment({ instances: [created], terminalsOf: () => pending.p });
		const showing = environment.terminals.show(environment.window, false);
		const createdEditor = editor('workbench.editors.terminal', created.resource);
		environment.terminalsGroup.open(createdEditor);
		const complete = async () => {
			await pending.complete([terminal(5)]);
			await showing;
		};
		return { environment, created, createdEditor, complete };
	}

	test('a terminal with no session that opens in a window while it gets terminals, and that the user moves to another chat window meanwhile, is that window\'s session\'s: the first window does not take it back', async () => {
		const { environment, createdEditor, complete } = openUnownedWhileAcquiring();
		const otherChatWindowId = CHAT_WINDOW_ID + 1;
		const otherGroup = new TestGroup(12, otherChatWindowId);
		disposables.add({ dispose: () => otherGroup.dispose() });
		environment.otherWindowGroups.push(otherGroup);
		environment.hostsByWindow.set(otherChatWindowId, upcastPartial<ISessionHost>({ kind: SessionHostKind.ChatWindow, session: constObservable(upcastPartial<IActiveSession>({ sessionId: 'session-b' })), chat: constObservable(undefined) }));
		environment.windows.set([environment.window, new class extends mock<IChatWindow>() {
			override readonly windowId = otherChatWindowId;
			override readonly mainPart = createPart(new TestGroup(13, otherChatWindowId));
			override readonly terminalsPart = constObservable(undefined);
			override readonly onWillClose = Event.None;
			override readonly onWillCloseParts = Event.None;
		}()], undefined);

		// Dragged into the other window: it closes in the first and opens in the other.
		environment.terminalsGroup.editors = environment.terminalsGroup.editors.filter(candidate => candidate !== createdEditor);
		otherGroup.open(createdEditor);
		await complete();

		assert.deepStrictEqual({ owner: environment.owners.get(30), tracked: environment.tracked.filter(entry => entry.endsWith(':30')) }, {
			owner: 'session-b',
			tracked: ['session-b:30'],
		});
	});

	test('a terminal with no session that opens in a window while it gets terminals, and that the user moves out of the window meanwhile, such as to the panel or to an editor of the main window, is not the window\'s', async () => {
		const outOfWindow = async (move: (environment: ReturnType<typeof createEnvironment>, createdEditor: EditorInput) => void) => {
			const { environment, createdEditor, complete } = openUnownedWhileAcquiring();
			move(environment, createdEditor);
			await complete();
			return environment.owners.get(30) ?? 'none';
		};

		assert.deepStrictEqual({
			toPanel: await outOfWindow((environment, createdEditor) => {
				environment.terminalsGroup.editors = environment.terminalsGroup.editors.filter(candidate => candidate !== createdEditor);
			}),
			toMainWindow: await outOfWindow((environment, createdEditor) => {
				const mainWindowGroup = new TestGroup(14, mainWindow.vscodeWindowId);
				disposables.add({ dispose: () => mainWindowGroup.dispose() });
				environment.otherWindowGroups.push(mainWindowGroup);
				environment.terminalsGroup.editors = environment.terminalsGroup.editors.filter(candidate => candidate !== createdEditor);
				mainWindowGroup.open(createdEditor);
			}),
		}, { toPanel: 'none', toMainWindow: 'none' });
	});

	test('terminals a window creates for two sessions at once, as it switches between their chats, are each the terminal of its own session', async () => {
		const first = terminal(20);
		const second = terminal(21);
		const otherSession = upcastPartial<IActiveSession>({ sessionId: 'session-2' });
		const pending = new Map<string, DeferredPromise<readonly ITerminalInstance[]>>();
		const environment: ReturnType<typeof createEnvironment> = createEnvironment({
			instances: [first, second],
			terminalsOf: forSession => {
				// Created in the part that holds the window's terminals: it opens there before the session has it.
				const created = forSession.sessionId === 'session-1' ? first : second;
				environment.terminalsGroup.open(editor('workbench.editors.terminal', created.resource));
				const deferred = new DeferredPromise<readonly ITerminalInstance[]>();
				pending.set(forSession.sessionId, deferred);
				return deferred.p.then(() => [created]);
			},
		});

		const showingFirst = environment.terminals.show(environment.window, false);
		environment.hostSession.set(otherSession, undefined);
		const showingSecond = environment.terminals.show(environment.window, false);
		await pending.get('session-2')!.complete([]);
		await pending.get('session-1')!.complete([]);
		const shown = { first: await showingFirst, second: await showingSecond };

		assert.deepStrictEqual({ shown, owners: { first: environment.owners.get(20), second: environment.owners.get(21) }, tracked: environment.tracked }, {
			shown: { first: false, second: true },
			owners: { first: 'session-1', second: 'session-2' },
			tracked: ['session-2:21'],
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
			override readonly onWillCloseParts = Event.None;
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

	test('the terminals the window takes, such as the terminal of a task or one opened by New Terminal in the part that holds its terminals, are terminals of its session', async () => {
		const task = terminal(9);
		const opened = terminal(11, { target: TerminalLocation.Editor });
		const besideChat = terminal(12, { target: TerminalLocation.Editor });
		const inMain = terminal(13, { target: TerminalLocation.Editor });
		const { terminals, window, terminalsGroup, chatGroup, mainGroup, tracked } = createEnvironment({ instances: [task, opened, besideChat, inMain], foreground: [task, opened, besideChat, inMain] });

		await terminals.showTerminal(window, 9, false);
		terminalsGroup.open(editor('workbench.editors.terminal', opened.resource));
		// Such as dragged there from another session, or opened next to the chat: in any part of the window
		chatGroup.open(editor('workbench.editors.terminal', besideChat.resource));
		mainGroup.open(editor('workbench.editors.terminal', inMain.resource));
		await timeout(0);
		terminals.release(window);

		assert.deepStrictEqual(tracked, ['session-1:9', 'session-1:11', 'session-1:12', 'session-1:13']);
	});

	test('as the window closes, a terminal beside the chat, or in its main part, goes to the panel, still running, before those parts close, rather than closing with them; the terminals of the part that holds them leave once it unloads; also as its window unloads, which closes it without that step', () => {
		const shown = terminal(5, { target: TerminalLocation.Editor });
		const besideChat = terminal(6, { target: TerminalLocation.Editor });
		const inMain = terminal(7, { target: TerminalLocation.Editor });
		// The terminal service does not list the one beside the chat: its editor moved into the main part as the window closes
		const closing = createEnvironment({ instances: [shown, inMain], foreground: [shown, besideChat, inMain] });
		closing.window.getOrCreateTerminalsPart();
		closing.terminalsGroup.editors.push(editor('workbench.editors.terminal', shown.resource));
		const detached: string[] = [];
		closing.chatGroup.editors.push(terminalEditor(besideChat, detached));
		closing.mainGroup.editors.push(editor('workbench.editors.terminal', inMain.resource));
		const unloading = createEnvironment({ instances: [besideChat], foreground: [besideChat] });
		unloading.chatGroup.editors.push(editor('workbench.editors.terminal', besideChat.resource));

		closing.onWillCloseParts.fire();
		const beforePartsClose = [...closing.shownInChatWindow];
		closing.onWillClose.fire();
		unloading.onWillClose.fire();

		// The editor beside the chat lets go of its terminal itself, and closes: the terminal editor service does not know
		// it, and its closing with the part would end the terminal.
		assert.deepStrictEqual({ beforePartsClose, detached, closed: closing.shownInChatWindow, unloaded: unloading.shownInChatWindow }, {
			beforePartsClose: ['7:false', '6:false'],
			detached: ['detach:6', 'dispose:6'],
			closed: ['7:false', '6:false', '5:false'],
			unloaded: ['6:false'],
		});
	});

	test('a window shows all the terminals of its session that the session gives it, in their order, not only the first; shown again, such as in the window the chat opens in again, they show in the order and with the active one they last showed with', async () => {
		const calls: string[] = [];
		const instances = [terminal(5, { calls }), terminal(6, { calls }), terminal(7, { calls })];
		// The terminal service opens each in the group after it moved there
		const { terminals, window, terminalsGroup, onWillClose } = createEnvironment({ terminals: instances, foreground: [], opensLater: true });

		await terminals.show(window, true);
		const shown = terminalsGroup.editors.map(candidate => candidate.resource?.toString());
		// The user moves the first to the end and activates the second
		terminalsGroup.editors.push(terminalsGroup.editors.shift()!);
		terminalsGroup.activeEditor = terminalsGroup.editors[0];
		onWillClose.fire();
		await terminals.show(window, true);

		assert.deepStrictEqual({
			shown,
			shownAgain: terminalsGroup.editors.map(candidate => candidate.resource?.toString()),
			active: terminalsGroup.activeEditor?.resource?.toString(),
			focused: calls,
		}, {
			shown: instances.map(instance => instance.resource.toString()),
			shownAgain: [instances[1], instances[2], instances[0]].map(instance => instance.resource.toString()),
			active: instances[1].resource.toString(),
			focused: ['focus', 'focus'],
		});
	});

	test('a window that closes while its terminals move into it takes none of the others: they stay with their session, in the panel', async () => {
		const instances = [terminal(5), terminal(6), terminal(7)];
		let close = () => { };
		const { terminals, window, calls, shownInChatWindow, onWillClose } = createEnvironment({ terminals: instances, foreground: [], onMoveToEditor: instance => instance === instances[0] && close() });
		close = () => onWillClose.fire();

		const shown = await terminals.show(window, true);

		assert.deepStrictEqual({ shown, moved: calls.filter(call => call.startsWith('toEditor')), takenAfterClose: shownInChatWindow.slice(1).filter(entry => entry.endsWith(':true')) }, {
			shown: false,
			moved: ['toEditor:7'],
			takenAfterClose: [],
		});
	});

	test('the terminals of a session keep their order in the window also where new editors open first in their group', async () => {
		const instances = [terminal(5), terminal(6), terminal(7)];
		const { terminals, window, terminalsGroup } = createEnvironment({ terminals: instances, foreground: [], opensFirst: true });

		await terminals.show(window, false);

		assert.deepStrictEqual({ order: terminalsGroup.editors.map(candidate => candidate.resource?.toString()), active: terminalsGroup.activeEditor?.resource?.toString() }, {
			order: instances.map(instance => instance.resource.toString()),
			active: instances[0].resource.toString(),
		});
	});

	test('the order and the active one a session last showed its terminals with go with the session once it is removed', async () => {
		const instances = [terminal(5), terminal(6), terminal(7)];
		const { terminals, window, terminalsGroup, onWillClose, onDidChangeSessions, session } = createEnvironment({ terminals: instances, foreground: [] });
		await terminals.show(window, false);
		terminalsGroup.editors.push(terminalsGroup.editors.shift()!);
		onWillClose.fire();

		onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
		await terminals.show(window, false);

		assert.deepStrictEqual(terminalsGroup.editors.map(candidate => candidate.resource?.toString()), instances.map(instance => instance.resource.toString()));
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
