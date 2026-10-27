/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { TerminalLocation } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalInstance, ITerminalService } from '../../../../../workbench/contrib/terminal/browser/terminal.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChatWindow } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ChatWindowTerminalHost } from '../../browser/sessionsTerminalContribution.js';

suite('ChatWindowTerminalHost', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shows a terminal of the chat window\'s session in its group, and gives it back to the panel, still running, when it hides', async () => {
		const calls: string[] = [];
		const session = { sessionId: 'session-1' } as IActiveSession;
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly instanceId = 5;
			override readonly isDisposed = false;
			override target: TerminalLocation | undefined = TerminalLocation.Panel;
			override async focusWhenReady() { calls.push('focus'); }
		}();
		const foreground: ITerminalInstance[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override get foregroundInstances() { return foreground; }
			override async showBackgroundTerminal(terminal: ITerminalInstance) {
				foreground.push(terminal);
				calls.push('fromBackground');
			}
			override moveToEditor(terminal: ITerminalInstance, groupId: number) {
				terminal.target = TerminalLocation.Editor;
				calls.push(`toEditor:${groupId}`);
			}
			override moveToBackground(terminal: ITerminalInstance) {
				foreground.splice(foreground.indexOf(terminal), 1);
				calls.push('toBackground');
			}
		}());
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
		const shownInChatWindow: boolean[] = [];
		const host = instantiationService.createInstance(ChatWindowTerminalHost, {
			getChatWindowTerminal: async (forSession: IActiveSession) => {
				calls.push(`terminalOf:${forSession.sessionId}`);
				return instance;
			},
			setShownInChatWindow: (_instance: ITerminalInstance, shown: boolean) => shownInChatWindow.push(shown),
		});
		const window = new class extends mock<IChatWindow>() {
			override readonly session = observableValue<IActiveSession | undefined>('session', session);
			override readonly terminalShown = observableValue('shown', true);
		}();
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override readonly editors = [];
			override readonly onDidModelChange = Event.None;
		}();

		const shown = await host.show(window, group, true);
		host.release(window);

		assert.deepStrictEqual({ shown, calls, shownInChatWindow, target: instance.target }, {
			shown: true,
			calls: ['terminalOf:session-1', 'fromBackground', 'toEditor:7', 'focus', 'toBackground'],
			shownInChatWindow: [true, false],
			target: TerminalLocation.Panel,
		});
	});

	test('shows a terminal handed to it, such as the terminal of a task, in the group of the chat window, from the panel, and once only when it runs again', async () => {
		const calls: string[] = [];
		const instance = new class extends mock<ITerminalInstance>() {
			override readonly instanceId = 9;
			override readonly isDisposed = false;
			override target: TerminalLocation | undefined = TerminalLocation.Panel;
		}();
		const foreground: ITerminalInstance[] = [instance];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override get foregroundInstances() { return foreground; }
			override getInstanceFromId(id: number) { return id === instance.instanceId ? instance : undefined; }
			override async showBackgroundTerminal() { calls.push('fromBackground'); }
			override moveToEditor(terminal: ITerminalInstance, groupId: number) {
				terminal.target = TerminalLocation.Editor;
				calls.push(`toEditor:${groupId}`);
			}
			override async moveToTerminalView() { calls.push('toTerminalView'); }
			override moveToBackground() { calls.push('toBackground'); }
		}());
		instantiationService.stub(IEditorGroupsService, new class extends mock<IEditorGroupsService>() { }());
		const shownInChatWindow: boolean[] = [];
		const host = instantiationService.createInstance(ChatWindowTerminalHost, {
			getChatWindowTerminal: async () => undefined,
			setShownInChatWindow: (_instance: ITerminalInstance, shown: boolean) => shownInChatWindow.push(shown),
		});
		const window = new class extends mock<IChatWindow>() { }();
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override readonly editors = [];
			override readonly onDidModelChange = Event.None;
		}();

		const first = await host.showTerminal(window, group, 9, false);
		const again = await host.showTerminal(window, group, 9, false);
		const unknown = await host.showTerminal(window, group, 99, false);
		host.release(window);

		assert.deepStrictEqual({ first, again, unknown, calls, shownInChatWindow }, {
			first: true,
			again: true,
			unknown: false,
			calls: ['toEditor:7', 'toBackground'],
			shownInChatWindow: [true, false],
		});
	});
});
