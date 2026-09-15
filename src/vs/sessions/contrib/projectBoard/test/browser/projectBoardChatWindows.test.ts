/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { registerWindow } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IEditorOptions } from '../../../../../platform/editor/common/editor.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IEditorIdentifier, IEditorPane, IUntypedEditorInput, IVisibleEditorPane } from '../../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../../workbench/common/editor/editorInput.js';
import { ChatEditorInput } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { AUX_WINDOW_GROUP, IEditorService, PreferredGroup } from '../../../../../workbench/services/editor/common/editorService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { Event } from '../../../../../base/common/event.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ProjectBoardChatWindows } from '../../browser/projectBoardNavigation.js';
import { IProjectBoardCard } from '../../common/projectBoardModel.js';

suite('ProjectBoardChatWindows', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function setup() {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const targetWindow = frame.contentWindow!;
		ensureCodeWindow(targetWindow, 12345);
		store.add(registerWindow(targetWindow));
		const windowId = targetWindow.vscodeWindowId;
		const resource = URI.parse('test-chat:session#child');
		let inputDisposed = false;
		const closed: EditorInput[] = [];
		const input = new class extends mock<ChatEditorInput>() {
			override readonly resource = resource;
			override dispose(): void { inputDisposed = true; }
		}();
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 10;
			override readonly windowId = windowId;
			override readonly activeEditor = input;
			override get activeEditorPane(): IVisibleEditorPane { return pane; }
			override async closeEditor(editor: EditorInput): Promise<boolean> {
				closed.push(editor);
				return state.closeAllowed;
			}
		}();
		const mainGroup = new class extends mock<IEditorGroup>() {
			override readonly id = 1;
			override readonly windowId = mainWindow.vscodeWindowId;
		}();
		const focused: Window[] = [];
		const readSessions: ISession[] = [];
		const errors: string[] = [];
		const state = {
			existing: [] as IEditorIdentifier[],
			opened: false,
			editorFocused: false,
			focusError: undefined as Error | undefined,
			trusted: true,
			readError: undefined as Error | undefined,
			closeAllowed: true,
			editorId: ChatEditorInput.EditorID,
		};
		const pane = new class extends mock<IEditorPane>() {
			override getId(): string { return state.editorId; }
			override readonly group = group;
			override readonly input = input;
			override focus(): void { state.editorFocused = true; }
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ILogService, store.add(new NullLogService()));
		instantiationService.stub(INotificationService, { error: message => { errors.push(String(message)); } });
		instantiationService.stubInstance(ChatEditorInput, input);
		const openEditor = sinon.stub().callsFake(async (_editor: EditorInput | IUntypedEditorInput, _options?: IEditorOptions | PreferredGroup, _group?: PreferredGroup): Promise<IEditorPane | undefined> => {
			state.opened = true;
			return pane;
		});
		instantiationService.stub(IEditorService, {
			activeEditorPane: undefined,
			findEditors: () => state.existing,
			openEditor,
			isOpened: () => state.opened,
		});
		instantiationService.stub(IEditorGroupsService, {
			groups: [],
			parts: [new class extends mock<IEditorPart>() {
				override readonly windowId = windowId;
				override readonly activeGroup = group;
			}()],
			getGroup: id => id === group.id ? group : id === mainGroup.id ? mainGroup : undefined,
		});
		instantiationService.stub(IHostService, {
			focus: async window => {
				if (state.focusError) {
					throw state.focusError;
				}
				focused.push(window);
			},
		});
		instantiationService.stub(ISessionsService, {
			canOpenSession: async () => state.trusted,
			openChat: async () => { assert.fail('Standalone chat opening must not navigate the Agents window'); },
		});
		instantiationService.stub(ISessionsManagementService, {
			onDidChangeSessions: Event.None,
			markRead: async session => {
				assert.strictEqual(state.editorFocused, true, 'Only mark read after the chat view has opened and focused');
				if (state.readError) {
					throw state.readError;
				}
				readSessions.push(session);
			},
		});
		instantiationService.stub(IChatService, { onDidSubmitRequest: Event.None });
		instantiationService.stub(IChatSessionsService, { getMaterializedSessionResource: () => undefined });
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, { onDidChange: Event.None, get: () => undefined });
		const opener = store.add(instantiationService.createInstance(ProjectBoardChatWindows));
		const createInstance = sinon.spy(instantiationService, 'createInstance');
		const card = new class extends mock<IProjectBoardCard>() {
			override readonly id = 'test-card';
			override readonly title = 'Child';
			override readonly session = new class extends mock<ISession>() {
				override readonly resource = URI.parse('test-session:/owner');
				override readonly sessionId = 'owner';
			}();
			override readonly chat = new class extends mock<IChat>() {
				override readonly resource = resource;
			}();
		}();
		return { opener, card, input, openEditor, createInstance, state, focused, readSessions, errors, targetWindow, group, mainGroup, pane, closed, inputDisposed: () => inputDisposed };
	}

	test('PB-05 Escape closure uses the editor close lifecycle only for an auxiliary chat', async () => {
		const h = setup();
		assert.strictEqual(await h.opener.closeActiveSession(h.mainGroup.windowId), undefined);
		h.state.editorId = 'workbench.editors.text';
		assert.strictEqual(await h.opener.closeActiveSession(h.group.windowId), undefined);
		assert.deepStrictEqual(h.closed, []);
		h.state.editorId = ChatEditorInput.EditorID;
		h.state.closeAllowed = false;
		assert.strictEqual(await h.opener.closeActiveSession(h.group.windowId), undefined);
		h.state.closeAllowed = true;
		assert.strictEqual(await h.opener.closeActiveSession(h.group.windowId), h.card.chat.resource);
		assert.deepStrictEqual(h.closed, [h.input, h.input]);
		assert.strictEqual(h.inputDisposed(), false, 'Never bypass the normal close handler');
	});

	test('PB-05 opens the exact child in a compact chat editor window, not the owner', async () => {
		const h = setup();
		await h.opener.open(h.card);
		assert.ok(h.createInstance.calledWith(ChatEditorInput, h.card.chat.resource, { title: { fallback: 'Child' } }));
		assert.deepStrictEqual(h.openEditor.firstCall.args, [
			h.input,
			{ pinned: true, revealIfOpened: false, auxiliary: { compact: true, bounds: { width: 800, height: 640 } } },
			AUX_WINDOW_GROUP,
		]);
		assert.deepStrictEqual(h.focused, [h.targetWindow]);
		assert.strictEqual(h.state.editorFocused, true);
		assert.strictEqual(h.inputDisposed(), false);
	});

	test('PB-04 explicit standalone opening marks the owning provider session read after rendering', async () => {
		const h = setup();
		assert.deepStrictEqual(h.readSessions, []);
		await h.opener.open(h.card);
		assert.deepStrictEqual(h.readSessions, [h.card.session]);
	});

	test('PB-04 read-state failures report that the chat opened successfully', async () => {
		const h = setup();
		h.state.readError = new Error('Provider unavailable');
		await h.opener.open(h.card);
		assert.deepStrictEqual({ opened: h.state.opened, read: h.readSessions, errors: h.errors }, {
			opened: true, read: [], errors: ['The chat opened, but its read state could not be updated.'],
		});
	});


	test('PB-05 reuses the existing standalone editor for the exact resource', async () => {
		const h = setup();
		h.state.existing = [{ editor: h.input, groupId: h.group.id }];
		await h.opener.open(h.card);
		assert.strictEqual(h.createInstance.calledWith(ChatEditorInput), false);
		assert.strictEqual(h.openEditor.firstCall.args[2], h.group.id);
		assert.deepStrictEqual(h.focused, [h.targetWindow]);
	});

	test('PB-05 never redirects to a matching editor in the main window', async () => {
		const h = setup();
		h.state.existing = [{ editor: h.input, groupId: h.mainGroup.id }];
		await h.opener.open(h.card);
		assert.ok(h.createInstance.calledWith(ChatEditorInput, h.card.chat.resource));
		assert.strictEqual(h.openEditor.firstCall.args[2], AUX_WINDOW_GROUP);
		assert.deepStrictEqual(h.focused, [h.targetWindow]);
	});

	test('PB-05 coalesces concurrent opens of the same chat', async () => {
		const h = setup();
		const result = new DeferredPromise<IEditorPane>();
		h.openEditor.callsFake(() => result.p);
		const first = h.opener.open(h.card);
		const second = h.opener.open(h.card);
		await Promise.resolve();
		assert.strictEqual(h.openEditor.callCount, 1);
		await result.complete(h.pane);
		await Promise.all([first, second]);
		assert.strictEqual(h.openEditor.callCount, 1);
	});

	test('PB-05 can reopen a chat after its standalone editor closes', async () => {
		const h = setup();
		await h.opener.open(h.card);
		h.state.existing = [];
		h.state.opened = false;
		await h.opener.open(h.card);
		assert.strictEqual(h.openEditor.callCount, 2);
		assert.strictEqual(h.openEditor.secondCall.args[2], AUX_WINDOW_GROUP);
	});

	test('PB-05 reports a failed editor open and allows retry', async () => {
		const h = setup();
		h.openEditor.onFirstCall().resolves(undefined);
		await assert.rejects(h.opener.open(h.card), /separate window/);
		assert.strictEqual(h.inputDisposed(), true);
		assert.deepStrictEqual(h.focused, []);
		await h.opener.open(h.card);
		assert.strictEqual(h.openEditor.callCount, 2);
	});

	test('PB-05 rejects an editor returned in the main window', async () => {
		const h = setup();
		h.openEditor.resolves(new class extends mock<IEditorPane>() {
			override getId(): string { return ChatEditorInput.EditorID; }
			override readonly group = h.mainGroup;
		}());
		await assert.rejects(h.opener.open(h.card), /separate window/);
		assert.deepStrictEqual(h.focused, []);
	});

	test('PB-05 propagates native focus failure without cancelling or disposing an open chat', async () => {
		const h = setup();
		h.state.focusError = new Error('Native focus failed');
		await assert.rejects(h.opener.open(h.card), /Native focus failed/);
		assert.strictEqual(h.inputDisposed(), false);
	});

	test('PB-05 honours a declined workspace trust prompt without opening or navigating', async () => {
		const h = setup();
		h.state.trusted = false;
		await h.opener.open(h.card);
		assert.strictEqual(h.openEditor.callCount, 0);
		assert.strictEqual(h.createInstance.calledWith(ChatEditorInput), false);
		assert.deepStrictEqual(h.focused, []);
	});
});
