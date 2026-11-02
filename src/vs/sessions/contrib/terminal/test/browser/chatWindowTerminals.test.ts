/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
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
import { ICreateTerminalOptions, ITerminalInstance, ITerminalLocationOptions, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IContentPart, IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatWindowTerminals, IChatWindowTerminalsSource } from '../../browser/chatWindowTerminals.js';

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
	constructor(override readonly id: number) { super(); }
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
	}

	function createEnvironment(options: IEnvironmentOptions = {}) {
		const calls: string[] = [];
		const shownInChatWindow: string[] = [];
		const session = upcastPartial<IActiveSession>({ sessionId: 'session-1' });

		// The window: its main part, and the part that holds its terminals once created.
		const mainGroup = new TestGroup(5);
		const terminalsGroup = new TestGroup(7);
		disposables.add({ dispose: () => { mainGroup.dispose(); terminalsGroup.dispose(); } });
		const mainPart = createPart(mainGroup);
		const terminalsElement = $('div');
		const terminalsPart = createPart(terminalsGroup, terminalsElement);
		const terminalsPartObs = observableValue<IContentPart | undefined>('terminalsPart', options.restoredWithTerminals ? terminalsPart : undefined);
		const onWillClose = disposables.add(new Emitter<void>());
		let focused = 0;
		const window = new class extends mock<IChatWindow>() {
			override readonly mainPart: IEditorPart = mainPart;
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
				terminalsGroup.editors.push(editor('workbench.editors.terminal', instance.resource));
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
		const otherGroups = Array.from({ length: options.groupsBefore ?? 0 }, (_, index) => upcastPartial<IEditorGroup>({ id: 100 + index }));
		const sessionScope: ISessionScope = { _serviceBrand: undefined, session: observableValue('session', session) };
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
			override getGroups() { return [...otherGroups, terminalsGroup]; }
			override getScopedInstantiationService(part: IEditorPart) {
				assert.strictEqual(part, mainPart);
				const accessor = upcastPartial<ServicesAccessor>({ get: <T>() => sessionScope as T });
				return upcastPartial<IInstantiationService>({ invokeFunction: (fn => fn(accessor)) as IInstantiationService['invokeFunction'] });
			}
		}());
		instantiationService.stub(IChatWindowService, new class extends mock<IChatWindowService>() {
			override readonly windows = windows;
		}());

		const source: IChatWindowTerminalsSource = {
			getChatWindowTerminal: async (forSession: IActiveSession, location?: ITerminalLocationOptions) => {
				calls.push(`terminalOf:${forSession.sessionId}:${JSON.stringify(location)}`);
				return options.terminal;
			},
			setShownInChatWindow: (instance, shown) => shownInChatWindow.push(`${instance.instanceId}:${shown}`),
		};
		windows.set([window], undefined);
		const terminals = disposables.add(instantiationService.createInstance(ChatWindowTerminals, source));
		return { calls, shownInChatWindow, window, terminals, terminalsGroup, terminalsElement, mainGroup, onWillClose, get focused() { return focused; } };
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

	test('the Add Tab entry for a terminal adds one to the terminals that show a terminal, else shows them', async () => {
		const { terminals, window, calls } = createEnvironment({ terminal: terminal(5) });

		await terminals.addTerminal(window);
		await terminals.addTerminal(window);

		assert.deepStrictEqual(calls, ['createPart', 'terminalOf:session-1:{"viewColumn":0}', 'fromBackground', 'toEditor:7', 'new:{"viewColumn":0}']);
	});
});
