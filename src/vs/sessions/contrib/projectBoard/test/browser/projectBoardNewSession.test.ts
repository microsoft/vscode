/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { registerWindow } from '../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { IModelContentChangedEvent } from '../../../../../editor/common/textModelEvents.js';
import { ChatEditor } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditor.js';
import { ChatEditorInput } from '../../../../../workbench/contrib/chat/browser/widgetHosts/editor/chatEditorInput.js';
import { ChatWidget } from '../../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { ChatAttachmentModel } from '../../../../../workbench/contrib/chat/browser/attachments/chatAttachmentModel.js';
import { IChatModel, IInputModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatViewModel } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatAgentData } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, IChat, ISession, ISessionType, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ProjectBoardChatWindows } from '../../browser/projectBoardNavigation.js';
import { ProjectBoardModel } from '../../common/projectBoardModel.js';

suite('ProjectBoardNewSession', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function setup() {
		const instantiation = store.add(new TestInstantiationService());
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const window = frame.contentWindow!;
		ensureCodeWindow(window, 14567);
		store.add(registerWindow(window));
		const windowId = window.vscodeWindowId;
		const resource = URI.parse('test-chat:/draft');
		const closing = store.add(new Emitter<void>());
		const inputChanged = store.add(new Emitter<void>());
		const submitted = store.add(new Emitter<void>());
		const sessionsChanged = store.add(new Emitter<ISessionsChangeEvent>());
		const state = { text: '', submitted: false, references: 0, deletedProvisional: 0, closeAllowed: true, closeCount: 0, attachments: [] as IChatRequestVariableEntry[], materialized: undefined as URI | undefined, published: undefined as URI | undefined, provisional: undefined as URI | undefined };
		const input = new class extends mock<ChatEditorInput>() {
			override readonly resource = resource;
			override readonly onWillDispose = closing.event;
			override dispose(): void { closing.fire(); }
		}();
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = resource;
			override readonly inputModel = new class extends mock<IInputModel>() {
				override readonly state = constObservable(undefined);
			}();
			override get hasRequests() { return state.submitted; }
		}();
		const widget = new class extends mock<ChatWidget>() {
			override get attachmentModel() { return new class extends mock<ChatAttachmentModel>() {
				override readonly onDidChange = Event.None;
			}(); }
			override get inputEditor() { return new class extends mock<ICodeEditor>() {
				override readonly onDidChangeModelContent = Event.map(inputChanged.event, () => new class extends mock<IModelContentChangedEvent>() { }());
			}(); }
			override readonly onDidChangeViewModel = Event.None;
			override readonly onDidSubmitAgent = Event.map(submitted.event, () => ({ agent: new class extends mock<IChatAgentData>() { }() }));
			override get viewModel() { return new class extends mock<ChatViewModel>() {
				override get model() { return model; }
				override get sessionResource() { return resource; }
			}(); }
			override getInput() { return state.text; }
			override getInputState() {
				return { inputText: state.text, attachments: state.attachments, mode: { id: 'agent', kind: undefined }, selectedModel: undefined, selections: [], contrib: {} };
			}
		}();
		const pane = sinon.createStubInstance(ChatEditor);
		sinon.stub(pane, 'widget').get(() => widget);
		const group = new class extends mock<IEditorGroup>() {
			override readonly id = 7;
			override readonly windowId = windowId;
			override async closeEditor(): Promise<boolean> {
				if (state.closeAllowed) {
					state.closeCount++;
					input.dispose();
				}
				return state.closeAllowed;
			}
		}();
		Object.defineProperty(pane, 'group', { value: group });
		pane.getId.returns(ChatEditorInput.EditorID);
		const openEditor = sinon.stub().resolves(pane);
		instantiation.stubInstance(ChatEditorInput, input);
		instantiation.stub(IEditorService, { openEditor, findEditors: () => [], isOpened: () => true });
		instantiation.stub(IEditorGroupsService, { groups: [], getGroup: id => id === group.id ? group : undefined });
		instantiation.stub(IHostService, { focus: async () => { } });
		instantiation.stub(ISessionsManagementService, {
			markRead: async () => { },
			onDidChangeSessions: sessionsChanged.event,
			getSessionForChatResource: resource => isEqual(resource, state.published)
				? { session: new class extends mock<ISession>() { }(), chat: new class extends mock<IChat>() { }() }
				: undefined,
			getSessions: () => state.published ? [new class extends mock<ISession>() {
				override readonly resource = state.published!;
				override readonly mainChat = constObservable(new class extends mock<IChat>() {
					override readonly resource = state.published!;
				}());
			}()] : [],
			getQuickChatSessionTypes: () => [{ providerId: 'test', sessionType: new class extends mock<ISessionType>() {
				override readonly id = 'test-chat';
				override readonly authRequirement = SessionTypeAuthRequirement.None;
			}() }],
		});
		instantiation.stub(ISessionsService, { activeSession: constObservable(undefined), canOpenSession: async () => true });
		instantiation.stub(IChatSessionsService, { getMaterializedSessionResource: () => state.materialized });
		instantiation.stub(IAgentHostUntitledProvisionalSessionService, {
			onDidChange: Event.None, get: () => state.provisional,
			disposeSession: async () => { state.deletedProvisional++; },
		});
		instantiation.stub(IAgentHostConnectionsService, { resolveSessionResource: () => state.provisional
			? { connectionAuthority: 'local', backendSession: state.provisional, connection: new class extends mock<IAgentConnection>() { }() }
			: undefined });
		instantiation.stub(ILogService, store.add(new NullLogService()));
		instantiation.stub(INotificationService, { error: error => assert.fail(String(error)) });
		instantiation.stub(IChatService, { onDidSubmitRequest: Event.None, acquireExistingSession: () => {
			state.references++;
			return { object: model, dispose: () => { state.references--; } };
		} });
		const opener = store.add(instantiation.createInstance(ProjectBoardChatWindows));
		return { opener, state, closing, inputChanged, submitted, openEditor, sessionsChanged, instantiation };
	}

	test('explicit draft deletion closes its editor and disposes the backend exactly once', async () => {
		const h = setup();
		h.state.provisional = URI.parse('agent-host:/owned-draft');
		await h.opener.createNewSession();
		const id = h.opener.drafts.get()[0].id;
		h.state.closeAllowed = false;
		assert.strictEqual(await h.opener.deleteDraft(id), false);
		assert.strictEqual(h.opener.drafts.get().length, 1);
		assert.strictEqual(h.state.deletedProvisional, 0);
		h.state.closeAllowed = true;
		assert.strictEqual(await h.opener.deleteDraft(id), true);
		assert.strictEqual(h.state.closeCount, 1);
		assert.strictEqual(h.state.deletedProvisional, 1);
		assert.strictEqual(h.opener.drafts.get().length, 0);
		assert.strictEqual(h.state.references, 0);
	});

	test('failed editor closure reports draft deletion failure without removing the draft', async () => {
		const h = setup();
		h.state.provisional = URI.parse('agent-host:/owned-draft');
		await h.opener.createNewSession();
		const notifications: string[] = [];
		sinon.stub(h.instantiation.invokeFunction(accessor => accessor.get(INotificationService)), 'error').callsFake(error => notifications.push(String(error)));
		const pane = await h.openEditor.lastCall.returnValue;
		sinon.stub(pane.group, 'closeEditor').rejects(new Error('Expected close failure'));
		assert.strictEqual(await h.opener.deleteDraft(h.opener.drafts.get()[0].id), false);
		assert.strictEqual(h.opener.drafts.get().length, 1);
		assert.strictEqual(h.state.deletedProvisional, 0);
		assert.deepStrictEqual(notifications, ['The session draft could not be deleted.']);
	});

	test('PB-03/PB-05 send hi, close, move to General/P1 and reopen retains the published chat identity and title', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.state.text = 'hi';
		h.inputChanged.fire();
		h.state.submitted = true;
		h.submitted.fire();
		const published = URI.parse('test-chat:/published-hi');
		h.state.materialized = published;
		h.state.published = published;
		h.sessionsChanged.fire({ added: [], removed: [], changed: [] });
		h.closing.fire();
		const chat = new class extends mock<IChat>() {
			override readonly resource = published;
			override readonly title = constObservable('Greeting');
			override readonly status = constObservable(SessionStatus.Completed);
			override readonly isRead = constObservable(false);
			override readonly isArchived = constObservable(false);
			override readonly interactivity = constObservable(ChatInteractivity.Full);
			override readonly description = constObservable(undefined);
		}();
		const session = new class extends mock<ISession>() {
			override readonly resource = published;
			override readonly providerId = 'test';
			override readonly title = constObservable('Greeting');
			override readonly chats = constObservable([chat]);
			override readonly isArchived = constObservable(false);
		}();
		const board = new ProjectBoardModel();
		board.updateSessions([session]);
		const [card] = board.getUnassignedCards();
		board.moveCard(card.id, { rowId: 'general', columnId: 'p1' });
		board.updateSessions([session]);
		const [moved] = board.getCards('general', 'p1');
		const createInput = sinon.spy(h.instantiation, 'createInstance');
		await h.opener.open(moved);
		assert.deepStrictEqual({
			title: moved.title, id: moved.id, resource: moved.chat.resource.toString(),
			drafts: h.opener.drafts.get().length, deleted: h.state.deletedProvisional,
			unassigned: board.getUnassignedCards().length,
		}, { title: 'Greeting', id: card.id, resource: published.toString(), drafts: 0, deleted: 0, unassigned: 0 });
		assert.ok(createInput.calledWith(ChatEditorInput, published, { title: { fallback: 'Greeting' } }));
		assert.strictEqual(h.openEditor.callCount, 2);
	});

	test('PB-16 creates a provisional card and standalone composer without sending', async () => {
		const h = setup();
		await h.opener.createNewSession();
		assert.strictEqual(h.opener.drafts.get().length, 1);
		assert.strictEqual(h.openEditor.firstCall.args[2], AUX_WINDOW_GROUP);
		assert.strictEqual(h.opener.drafts.get()[0].submitted, false);
	});

	test('PB-17 closing an untouched composer removes only its draft and releases its model', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.closing.fire();
		assert.deepStrictEqual(h.opener.drafts.get(), []);
		assert.strictEqual(h.state.references, 0);
	});

	test('PB-17 closing after typing preserves and restores the unsent input', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.state.text = 'Keep my draft';
		h.inputChanged.fire();
		h.closing.fire();
		const draft = h.opener.drafts.get()[0];
		assert.strictEqual(draft.hasContent, true);
		assert.strictEqual(h.state.references, 1);
		await h.opener.openDraft(draft.id);
		assert.strictEqual(h.openEditor.lastCall.args[1].modelInputState.inputText, 'Keep my draft');
	});

	test('PB-17 a submitted or failed request is never discarded as an untouched draft', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.state.submitted = true;
		h.submitted.fire();
		h.closing.fire();
		assert.strictEqual(h.opener.drafts.get()[0].submitted, true);
		assert.strictEqual(h.state.references, 1);
	});

	test('PB-16 materialized publication replaces the provisional card without duplicates', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.submitted.fire();
		h.state.materialized = URI.parse('test-chat:/committed');
		h.state.published = h.state.materialized;
		h.sessionsChanged.fire({ added: [], removed: [], changed: [] });
		assert.deepStrictEqual(h.opener.drafts.get(), []);
		assert.strictEqual(h.state.references, 0);
	});

	test('PB-17 attachments count as user content even with empty text', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.state.attachments = [{ kind: 'generic', id: 'context', name: 'Context', value: 'Keep this attachment' }];
		h.inputChanged.fire();
		h.closing.fire();
		assert.strictEqual(h.opener.drafts.get()[0].hasContent, true);
	});

	test('PB-17 clearing previously typed text does not make the draft untouched again', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.state.text = 'Previously typed';
		h.inputChanged.fire();
		h.state.text = '';
		h.inputChanged.fire();
		h.closing.fire();
		assert.strictEqual(h.opener.drafts.get()[0].hasContent, true);
	});

	test('PB-16 opaque provider provisional identity resolves to one published card', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.submitted.fire();
		h.state.provisional = URI.parse('backend:/opaque-id');
		h.state.published = URI.parse('test-chat:/published-id');
		h.sessionsChanged.fire({ added: [], removed: [], changed: [] });
		assert.deepStrictEqual(h.opener.drafts.get(), []);
		assert.strictEqual(h.state.deletedProvisional, 0);
	});

	test('PB-17 untouched provider provisional state is discarded on close', async () => {
		const h = setup();
		await h.opener.createNewSession();
		h.state.provisional = URI.parse('backend:/owned-empty');
		h.closing.fire();
		await Promise.resolve();
		assert.deepStrictEqual(h.opener.drafts.get(), []);
		assert.strictEqual(h.state.deletedProvisional, 1);
		assert.strictEqual(h.state.references, 0);
	});

	test('PB-17 closing before the composer finishes loading leaves no draft or false open failure', async () => {
		const h = setup();
		const pending = new DeferredPromise<ChatEditor>();
		h.openEditor.callsFake(() => pending.p);
		const creating = h.opener.createNewSession();
		h.closing.fire();
		await pending.error(new Error('Editor was closed during load'));
		await creating;
		assert.deepStrictEqual(h.opener.drafts.get(), []);
	});
});
