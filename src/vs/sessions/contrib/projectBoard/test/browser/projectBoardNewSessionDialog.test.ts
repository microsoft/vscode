/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import '../../browser/media/projectBoard.css';
import * as dom from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { SuggestController } from '../../../../../editor/contrib/suggest/browser/suggestController.js';
import { State as SuggestState, SuggestModel } from '../../../../../editor/contrib/suggest/browser/suggestModel.js';
import { ISelectedSuggestion, SuggestWidget } from '../../../../../editor/contrib/suggest/browser/suggestWidget.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { ResultKind } from '../../../../../platform/keybinding/common/keybindingResolver.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceTrustRequestService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ChatAgentLocation } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IHostService } from '../../../../../workbench/services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { SessionHasWorkspaceContext, SessionProviderIdContext, SessionTypeContext, SessionUsesCombinedConfigPickerContext } from '../../../../common/contextkeys.js';
import { VisibleSession } from '../../../../services/sessions/browser/visibleSessions.js';
import { ChatInteractivity, IChat, ISession, ISessionType, ISessionWorkspace, SessionStatus, SessionTypeAuthRequirement } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionDraft, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { INewChatWidgetHost, NewChatWidget } from '../../../chat/browser/newChatWidget.js';
import { INewSessionComposer, INewSessionComposerService, NewSessionComposerService } from '../../../chat/browser/newSessionComposerService.js';
import { ProjectBoardNewSessionDialog } from '../../browser/projectBoardNewSessionDialog.js';
import { ProjectBoardState } from '../../browser/projectBoardState.js';
import { defaultConfiguration } from '../../common/projectBoardConfiguration.js';

suite('ProjectBoardNewSessionDialog', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function makeSession(id: string, workspace: IObservable<ISessionWorkspace | undefined> = constObservable(undefined), status: IObservable<SessionStatus> = constObservable(SessionStatus.Untitled)): ISession {
		const chat = new class extends mock<IChat>() {
			override readonly resource = URI.parse(`test-chat:/${id}`);
			override readonly modelId = constObservable('model');
			override readonly mode = constObservable(undefined);
			override readonly status = status;
			override readonly interactivity = constObservable(ChatInteractivity.Full);
			override readonly workspace = workspace;
			override readonly changes = constObservable([]);
			override readonly changesets = constObservable([]);
		}();
		return new class extends mock<ISession>() {
			override readonly sessionId = `test:${id}`;
			override readonly providerId = 'test';
			override readonly sessionType = 'test-chat';
			override readonly resource = chat.resource;
			override readonly status = status;
			override readonly mainChat = constObservable(chat);
			override readonly chats = constObservable([chat]);
			override readonly workspace = workspace;
			override readonly isArchived = constObservable(false);
			override readonly isRead = constObservable(true);
			override readonly capabilities = constObservable({ supportsMultipleChats: false });
		}();
	}

	function setup(options: { document?: Document; autoInclude?: boolean; boardId?: string } = {}) {
		const document = options.document ?? mainWindow.document;
		const container = dom.append(document.body, dom.$('.monaco-workbench'));
		const elsewhere = dom.append(document.body, dom.$('.monaco-workbench'));
		store.add(toDisposable(() => { container.remove(); elsewhere.remove(); }));
		const instantiation = store.add(new TestInstantiationService());
		const configuration = observableValue('boardConfiguration', { ...defaultConfiguration(), autoIncludeSessions: options.autoInclude ?? true });
		const available = observableValue('boardAvailable', true);
		const state = {
			providerAvailable: true, unusable: false, requiresTrust: true, editable: true, combinedConfig: false,
			text: 'Keep this prompt', draftText: 'Keep this prompt', disposed: false, saved: [] as string[], layoutCount: 0,
		};
		const boardState = new class extends mock<ProjectBoardState>() {
			override readonly boardId = options.boardId ?? 'origin-board';
			override readonly configuration = configuration;
			override readonly isAvailable = available;
			override get canEdit() { return state.editable && available.get(); }
		}();
		const draftWorkspace = observableValue<ISessionWorkspace | undefined>('draftWorkspace', undefined);
		const draftStatus = observableValue<SessionStatus>('draftStatus', SessionStatus.Untitled);
		const draftSession = makeSession('draft', draftWorkspace, draftStatus);
		const canonical = makeSession('canonical');
		const send = sinon.stub<[ISendRequestOptions], Promise<ISession | undefined>>().resolves(canonical);
		const draftDispose = sinon.spy();
		const draft: ISessionDraft = { session: draftSession, send, dispose: draftDispose };
		const createDraft = sinon.stub<[URI | undefined, ICreateNewSessionOptions?], Promise<ISessionDraft>>().resolves(draft);
		const createMain = sinon.spy();
		const createAutomation = sinon.spy();
		const trust = sinon.stub().resolves(true);
		const log = store.add(new NullLogService());
		const logError = sinon.spy(log, 'error');
		const resolveWorkspace = sinon.stub().callsFake((_folder: URI, providerId?: string) => state.providerAvailable ? {
			providerId: providerId ?? 'test',
			workspace: new class extends mock<ISessionWorkspace>() {
				override get requiresWorkspaceTrust() { return state.requiresTrust; }
			}(),
		} : undefined);
		const targetAvailable = sinon.stub().callsFake((_folder?: URI, target?: ICreateNewSessionOptions) => state.providerAvailable && !state.unusable && (!target?.providerId || target.providerId === 'test'));
		const sessionTypes = () => state.providerAvailable ? [{
			providerId: 'test',
			sessionType: new class extends mock<ISessionType>() {
				override readonly id = 'test-chat';
				override get authRequirement() { return state.unusable ? SessionTypeAuthRequirement.Unusable : SessionTypeAuthRequirement.None; }
			}(),
		}] : [];
		const providersChanged = store.add(new Emitter<void>());
		instantiation.stub(ISessionsManagementService, {
			sessionDrafts: constObservable(new Set([draftSession])),
			onDidChangeSessionTypes: providersChanged.event,
			usesCombinedNewSessionConfigPicker: () => state.combinedConfig,
			getSessionTypesForFolder: sessionTypes,
			getQuickChatSessionTypes: sessionTypes,
			isNewSessionTargetAvailable: targetAvailable,
			isQuickChatTargetAvailable: () => targetAvailable(),
			resolveWorkspace,
			createSessionDraft: createDraft,
			createNewSession: createMain,
			createAutomationSession: createAutomation,
		});
		instantiation.stub(IWorkspaceTrustRequestService, { requestResourcesTrust: trust });
		instantiation.stub(ILogService, log);
		const notifyError = sinon.spy();
		instantiation.stub(INotificationService, { error: notifyError });
		instantiation.stub(IContextViewService, {});
		const mainContext = store.add(new MockContextKeyService());
		SessionProviderIdContext.bindTo(mainContext).set('main-provider');
		SessionTypeContext.bindTo(mainContext).set('main-type');
		SessionUsesCombinedConfigPickerContext.bindTo(mainContext).set(true);
		const scopedContext = new MockContextKeyService();
		const contextDispose = sinon.spy(scopedContext, 'dispose');
		const createScoped = sinon.stub(mainContext, 'createScoped').returns(scopedContext);
		instantiation.stub(IContextKeyService, mainContext);
		const focusedEditor = sinon.stub<[], ICodeEditor | null>().returns(null);
		instantiation.stub(ICodeEditorService, { getFocusedCodeEditor: focusedEditor });
		// Deliberately differ from the origin, including for keybinding resolution.
		instantiation.stub(IWorkbenchLayoutService, { activeContainer: elsewhere });
		instantiation.stub(IHostService, { setWindowDimmed: async () => { } });
		const softDispatch = sinon.stub().returns({ kind: ResultKind.NoMatchingKb });
		instantiation.stub(IKeybindingService, { softDispatch });
		const mainComposerService = store.add(new NewSessionComposerService());
		const mainComposer = new class extends mock<INewSessionComposer>() { }();
		store.add(mainComposerService.registerComposer(mainComposer));
		instantiation.stub(INewSessionComposerService, mainComposerService);
		const modalComposer = new class extends mock<INewSessionComposer>() { }();
		let modalComposerService: INewSessionComposerService | undefined;
		let modalRegistration: IDisposable | undefined;
		const editor = document.createElement('textarea');
		editor.value = state.text;
		const widget = new class extends mock<NewChatWidget>() {
			override render(parent: HTMLElement) {
				dom.append(dom.append(parent, dom.$('.sessions-chat-widget.monaco-editor')), editor);
				modalRegistration = modalComposerService!.registerComposer(modalComposer);
			}
			override focusInput() { editor.focus(); }
			override layout() { state.layoutCount++; }
			override saveState() { state.saved.push(state.draftText); }
			override dispose() {
				state.disposed = true;
				modalRegistration?.dispose();
			}
			override async submitInput() {
				state.draftText = '';
				try {
					const sent = await host.sendRequest(host.session.get()!, { query: state.text });
					assert.strictEqual(state.disposed, false, 'shared input must finish clearing before disposal');
					if (sent) {
						state.text = '';
					}
					return sent;
				} finally {
					state.draftText = state.text;
				}
			}
		}();
		instantiation.stubInstance(NewChatWidget, widget);
		let creations: sinon.SinonSpy | undefined;
		sinon.stub(instantiation, 'createChild').callsFake(services => {
			const child = new TestInstantiationService(services, false, instantiation);
			modalComposerService = child.get(INewSessionComposerService);
			creations = sinon.spy(child, 'createInstance');
			return child;
		});
		const dialog = store.add(instantiation.createInstance(ProjectBoardNewSessionDialog));
		const onDidCreate = sinon.stub();
		const onDidResolve = sinon.stub();
		const showing = dialog.show({ container, boardState, onDidCreate, onDidResolve });
		const widgetCreation = creations?.getCalls().find(call => call.args[0] === NewChatWidget);
		assert.ok(widgetCreation, 'instantiate the real shared NewChatWidget class, not a native chat editor');
		const host: INewChatWidgetHost = (widgetCreation.args[1] as ConstructorParameters<typeof NewChatWidget>[0]).host!;
		const select = (folder = URI.file('/workspace'), creationOptions: ICreateNewSessionOptions = { providerId: 'test', sessionTypeId: 'test-chat' }, token = CancellationToken.None) => host.createSession(folder, creationOptions, token);
		const cancel = () => container.querySelector<HTMLElement>('.dialog-toolbar [aria-label="Close Dialog"]')!.click();
		const destination = container.querySelector<HTMLSelectElement>('.project-board-new-session-destination select')!;
		const selectDestination = (index: number) => {
			destination.selectedIndex = index;
			destination.dispatchEvent(new (dom.getWindow(container).Event)('change', { bubbles: true }));
		};
		const error = () => container.querySelector('[role="alert"]')?.textContent;
		return { container, elsewhere, editor, dialog, showing, host, widget, state, configuration, available, select, cancel, destination, selectDestination, error, draft, draftDispose, draftSession, draftStatus, canonical, send, createDraft, createMain, createAutomation, trust, resolveWorkspace, targetAvailable, onDidCreate, onDidResolve, notifyError, logError, softDispatch, createScoped, contextDispose, focusedEditor, mainComposerService, mainComposer, modalComposerService: modalComposerService!, modalComposer, mainContext, scopedContext, providersChanged, draftWorkspace };
	}

	test('hands off the existing provisional session without waiting for canonical discovery', async () => {
		const h = setup({ autoInclude: false });
		await h.select();
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		let accepted = false;
		const submitting = h.widget.submitInput().then(result => { accepted = result; });
		h.draftStatus.set(SessionStatus.InProgress, undefined);
		await timeout(0);
		const handedOff = accepted;
		if (!handedOff) {
			await pending.complete(h.canonical);
			await submitting;
		}
		assert.strictEqual(handedOff, true, 'canonical discovery must not gate input clearing or modal dismissal');
		await submitting;
		assert.strictEqual(await h.showing, h.draftSession);
		assert.deepStrictEqual(h.onDidCreate.firstCall.args, [h.draftSession, { rowId: 'general', columnId: 'p0' }]);
		assert.strictEqual(h.state.text, '');
		assert.strictEqual(h.draftDispose.called, false, 'the background send still owns the draft');
		h.dialog.dispose();
		assert.strictEqual(h.draftDispose.called, false);
		await pending.complete(h.canonical);
		await timeout(0);
		assert.deepStrictEqual(h.onDidResolve.firstCall.args, [h.draftSession, h.canonical]);
		assert.strictEqual(h.onDidCreate.callCount, 1);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.notifyError.called, false);
	});

	test('reports a late discovery failure without losing ownership or inviting a duplicate send', async () => {
		const h = setup();
		await h.select();
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		const submitting = h.widget.submitInput();
		h.draftStatus.set(SessionStatus.InProgress, undefined);
		await timeout(0);
		await pending.error(new Error('canonical discovery failed'));
		assert.strictEqual(await submitting, true);
		await h.showing;
		await timeout(0);
		assert.strictEqual(h.notifyError.callCount, 1);
		assert.match(h.notifyError.firstCall.args[0], /canonical discovery failed/);
		assert.strictEqual(h.logError.callCount, 1);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.onDidResolve.called, false);
		assert.strictEqual(h.send.callCount, 1);
	});

	test('an unpublished error status does not accept or clear the prompt', async () => {
		const h = setup();
		await h.select();
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		const submitting = h.widget.submitInput();
		h.draftStatus.set(SessionStatus.Error, undefined);
		await timeout(0);
		await pending.error(new Error('send rejected'));
		assert.strictEqual(await submitting, false);
		assert.strictEqual(h.onDidCreate.called, false);
		assert.strictEqual(h.state.text, 'Keep this prompt');
		await timeout(0);
		h.cancel();
		await h.showing;
	});

	test('closing the standalone origin after handoff cannot cancel discovery or send again', async () => {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const h = setup({ document: frame.contentDocument! });
		await h.select();
		const active = h.host.session.get()!;
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		const submitting = h.widget.submitInput();
		h.draftStatus.set(SessionStatus.InProgress, undefined);
		assert.strictEqual(await submitting, true);
		assert.strictEqual(await h.showing, h.draftSession);
		h.dialog.dispose();
		frame.remove();
		assert.strictEqual(h.draftDispose.called, false);
		assert.strictEqual(await h.host.sendRequest(active, { query: 'duplicate' }), false);
		await pending.complete(h.canonical);
		await timeout(0);
		assert.strictEqual(h.send.callCount, 1);
		assert.strictEqual(h.onDidResolve.callCount, 1);
		assert.strictEqual(h.draftDispose.callCount, 1);
	});

	test('labels board placement Project Path and dismisses with X without footer actions', async () => {
		const h = setup();
		assert.deepStrictEqual({
			label: h.container.querySelector('.project-board-new-session-destination span')?.textContent,
			accessibleLabel: h.destination.getAttribute('aria-label'),
			footerButtons: h.container.querySelectorAll('.dialog-buttons .monaco-button').length,
			footerDisplay: mainWindow.getComputedStyle(h.container.querySelector('.dialog-buttons-row')!).display,
		}, { label: 'Project Path', accessibleLabel: 'Project Path', footerButtons: 0, footerDisplay: 'none' });
		h.cancel();
		assert.strictEqual(await h.showing, undefined);
	});

	test('provider and workspace toolbar context tracks the modal draft without changing the main provider', async () => {
		const h = setup();
		assert.strictEqual(SessionProviderIdContext.getValue(h.scopedContext), '');
		assert.strictEqual(SessionUsesCombinedConfigPickerContext.getValue(h.scopedContext), false);
		assert.strictEqual(ChatContextKeys.location.getValue(h.scopedContext), ChatAgentLocation.Chat);
		assert.strictEqual(ChatContextKeys.inChatSession.getValue(h.scopedContext), true);
		await h.select();
		assert.strictEqual(SessionProviderIdContext.getValue(h.scopedContext), 'test');
		assert.strictEqual(SessionTypeContext.getValue(h.scopedContext), 'test-chat');
		h.draftWorkspace.set(new class extends mock<ISessionWorkspace>() {
			override readonly label = 'Selected Workspace';
			override readonly folders = [];
		}(), undefined);
		assert.strictEqual(SessionHasWorkspaceContext.getValue(h.scopedContext), true);
		h.state.combinedConfig = true;
		h.providersChanged.fire();
		assert.strictEqual(SessionUsesCombinedConfigPickerContext.getValue(h.scopedContext), true);
		h.host.clearSession();
		assert.strictEqual(SessionProviderIdContext.getValue(h.scopedContext), '');
		assert.strictEqual(SessionHasWorkspaceContext.getValue(h.scopedContext), false);
		assert.strictEqual(SessionUsesCombinedConfigPickerContext.getValue(h.scopedContext), false);
		assert.strictEqual(SessionProviderIdContext.getValue(h.mainContext), 'main-provider');
		assert.strictEqual(SessionTypeContext.getValue(h.mainContext), 'main-type');
		h.cancel();
		await h.showing;
	});

	test('scopes composer registration and workspace defaults separately from the main composer', async () => {
		const h = setup();
		assert.notStrictEqual(h.mainComposerService, h.modalComposerService);
		assert.strictEqual(h.mainComposerService.activeComposer.get(), h.mainComposer);
		assert.strictEqual(h.modalComposerService.activeComposer.get(), h.modalComposer);
		h.modalComposerService.notifyUserWorkspaceSelection();
		h.modalComposerService.notifyUserNavigation();
		assert.strictEqual(h.modalComposerService.userWorkspaceSelectionVersion.get(), 1);
		assert.strictEqual(h.mainComposerService.userWorkspaceSelectionVersion.get(), 0);
		assert.strictEqual(h.mainComposerService.userNavigationVersion.get(), 0);
		h.cancel();
		await h.showing;
		assert.strictEqual(h.mainComposerService.activeComposer.get(), h.mainComposer);
	});

	test('hosts the shared composer with an isolated board draft and trusts the exact provider before creation', async () => {
		const h = setup();
		const folder = URI.file('/workspace/chosen');
		assert.strictEqual(h.host.session.get(), undefined);
		assert.strictEqual(h.host.draftStorageKey, 'sessions.agentHub.newSessionDraft.origin-board.embedded');
		assert.strictEqual(h.createScoped.firstCall.args[0], h.container.querySelector('.project-board-new-session-composer'));
		assert.strictEqual(await h.select(folder).then(result => result.session), h.draftSession);
		assert.ok(h.host.session.get() instanceof VisibleSession);
		assert.strictEqual(h.host.session.get()?.mainChat.get(), h.draftSession.mainChat.get());
		assert.deepStrictEqual(h.resolveWorkspace.firstCall.args, [folder, 'test']);
		assert.strictEqual(h.trust.firstCall.args[0].uri, folder);
		assert.ok(h.trust.calledBefore(h.createDraft));
		assert.deepStrictEqual(h.createDraft.firstCall.args, [folder, { providerId: 'test', sessionTypeId: 'test-chat' }]);
		assert.strictEqual(h.createMain.called || h.createAutomation.called, false);
		h.cancel();
		assert.strictEqual(await h.showing, undefined);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.contextDispose.callCount, 1);
		assert.deepStrictEqual(h.state.saved, ['Keep this prompt']);
	});

	test('successful send returns the canonical session and calls back once with the source board destination', async () => {
		const h = setup({ autoInclude: false });
		assert.strictEqual(h.destination.options[0].text, 'General / P0');
		assert.ok(![...h.destination.options].some(option => option.text === 'Unassigned'));
		h.selectDestination(1);
		assert.deepStrictEqual({ ...h.container.querySelector<HTMLElement>('.project-board-new-session-body')!.dataset }, { boardId: 'origin-board', rowId: 'general', columnId: 'p1' });
		await h.select();
		assert.strictEqual(await h.widget.submitInput(), true);
		assert.strictEqual(h.state.disposed, false);
		assert.strictEqual(h.onDidCreate.callCount, 1);
		assert.deepStrictEqual(h.onDidCreate.firstCall.args, [h.canonical, { rowId: 'general', columnId: 'p1' }]);
		assert.deepStrictEqual(h.send.firstCall.args, [{ query: 'Keep this prompt', background: true }]);
		assert.strictEqual(await h.showing, h.canonical);
		assert.strictEqual(h.state.disposed, true);
		assert.deepStrictEqual(h.state.saved, ['']);
		assert.strictEqual(h.draftDispose.callCount, 1);
	});

	test('auto-inclusion defaults to Unassigned and separate boards use separate input keys', async () => {
		const h = setup();
		assert.strictEqual(h.destination.options[h.destination.selectedIndex].text, 'Unassigned');
		await h.select();
		await h.widget.submitInput();
		await h.showing;
		assert.deepStrictEqual(h.onDidCreate.firstCall.args, [h.canonical, undefined]);
		const other = setup({ boardId: 'other-board' });
		assert.notStrictEqual(other.host.draftStorageKey, h.host.draftStorageKey);
		other.cancel();
		await other.showing;
	});

	test('parallel surfaces use separate retained input keys and standalone reopening ignores native window IDs', async () => {
		const embedded = setup();
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		ensureCodeWindow(frame.contentWindow!, 45321);
		const standalone = setup({ document: frame.contentDocument! });
		assert.strictEqual(embedded.host.draftStorageKey, 'sessions.agentHub.newSessionDraft.origin-board.embedded');
		assert.strictEqual(standalone.host.draftStorageKey, 'sessions.agentHub.newSessionDraft.origin-board.standalone');
		assert.strictEqual(standalone.container.querySelector<HTMLElement>('[data-board-id]')!.dataset.boardId, 'origin-board');
		standalone.cancel();
		await standalone.showing;

		const reopenedFrame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(reopenedFrame);
		store.add(toDisposable(() => reopenedFrame.remove()));
		ensureCodeWindow(reopenedFrame.contentWindow!, 45322);
		const reopened = setup({ document: reopenedFrame.contentDocument! });
		assert.strictEqual(reopened.host.draftStorageKey, standalone.host.draftStorageKey);
		assert.notStrictEqual(reopened.host.draftStorageKey, embedded.host.draftStorageKey);
		reopened.cancel();
		await reopened.showing;
		embedded.cancel();
		await embedded.showing;
		const reopenedEmbedded = setup();
		assert.strictEqual(reopenedEmbedded.host.draftStorageKey, embedded.host.draftStorageKey);
		reopenedEmbedded.cancel();
		await reopenedEmbedded.showing;
	});

	test('failed sends retain input, report an inline error, and permit retry', async () => {
		const h = setup();
		await h.select();
		h.send.onFirstCall().rejects(new Error('provider failed'));
		assert.strictEqual(await h.widget.submitInput(), false);
		await timeout(0);
		assert.strictEqual(h.state.text, 'Keep this prompt');
		assert.strictEqual(h.error(), 'provider failed');
		assert.strictEqual(h.onDidCreate.called, false);
		assert.strictEqual(h.draftDispose.called, false);
		assert.deepStrictEqual(h.state.saved, ['Keep this prompt']);
		assert.strictEqual(await h.widget.submitInput(), true);
		await h.showing;
		assert.strictEqual(h.onDidCreate.callCount, 1);
	});

	test('completed send during shutdown clears input and cannot be retried without a canonical placement result', async () => {
		const h = setup();
		await h.select();
		const active = h.host.session.get()!;
		h.send.resolves(undefined);
		assert.strictEqual(await h.widget.submitInput(), true);
		assert.strictEqual(await h.host.sendRequest(active, { query: 'duplicate' }), false);
		assert.strictEqual(await h.showing, undefined);
		assert.strictEqual(h.send.callCount, 1);
		assert.strictEqual(h.onDidCreate.called, false);
		assert.strictEqual(h.state.text, '');
		assert.strictEqual(h.state.saved.at(-1), '');
	});

	test('provider errors are logged and do not clear the shared input', async () => {
		const h = setup();
		await h.select();
		h.send.rejects(new Error('provider failed'));
		assert.strictEqual(await h.widget.submitInput(), false);
		await timeout(0);
		assert.strictEqual(h.error(), 'provider failed');
		assert.strictEqual(h.logError.callCount, 1);
		h.cancel();
		await h.showing;
		assert.strictEqual(h.state.saved.at(-1), 'Keep this prompt');
	});

	test('a prepared replacement draft remains the active composer after a failed send', async () => {
		const h = setup();
		await h.select();
		const prepared = makeSession('prepared');
		h.send.callsFake(async () => {
			sinon.stub(h.draft, 'session').get(() => prepared);
			throw new Error('provider failed');
		});
		assert.strictEqual(await h.widget.submitInput(), false);
		await timeout(0);
		assert.strictEqual(h.host.session.get()?.sessionId, prepared.sessionId);
		assert.strictEqual(h.state.text, 'Keep this prompt');
		h.cancel();
		await h.showing;
		assert.strictEqual(h.draftDispose.callCount, 1);
	});

	test('trust decline clears the previous workspace draft instead of silently falling back', async () => {
		const h = setup();
		await h.select();
		const previous = h.host.session.get()!;
		h.trust.resolves(false);
		const result = await h.select(URI.file('/declined'));
		assert.strictEqual(result.trustDeclined, true);
		assert.strictEqual(h.host.session.get(), undefined);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.createDraft.callCount, 1);
		assert.match(h.error()!, /trust is required/);
		assert.strictEqual(h.logError.called, false);
		assert.strictEqual(await h.host.sendRequest(previous, { query: 'must not reach the old workspace' }), false);
		assert.strictEqual(h.send.called, false);
		h.cancel();
		await h.showing;
	});

	test('a new workspace creation failure invalidates the prior modal draft before awaiting creation', async () => {
		const h = setup();
		await h.select();
		const previous = h.host.session.get()!;
		const pending = new DeferredPromise<ISessionDraft>();
		h.state.requiresTrust = false;
		h.createDraft.returns(pending.p);
		const changing = h.select(URI.file('/failed-workspace'));
		assert.strictEqual(h.host.session.get(), undefined);
		assert.strictEqual(h.draftDispose.callCount, 1);
		await pending.error(new Error('workspace creation failed'));
		assert.strictEqual((await changing).session, undefined);
		assert.strictEqual(h.error(), 'workspace creation failed');
		assert.strictEqual(await h.host.sendRequest(previous, { query: 'must not reach the old workspace' }), false);
		assert.strictEqual(h.send.called, false);
		assert.strictEqual(h.state.text, 'Keep this prompt');
		h.cancel();
		await h.showing;
	});

	test('an unavailable explicit provider never falls back to the previous provider or workspace', async () => {
		const h = setup();
		await h.select();
		assert.strictEqual((await h.select(URI.file('/new'), { providerId: 'missing' })).session, undefined);
		assert.strictEqual(h.host.session.get(), undefined);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.createDraft.callCount, 1);
		assert.match(h.error()!, /No available agent/);
		h.cancel();
		await h.showing;
	});

	test('unusable providers cannot create a draft', async () => {
		const h = setup();
		h.state.unusable = true;
		assert.strictEqual((await h.select()).session, undefined);
		assert.strictEqual(h.createDraft.called || h.trust.called, false);
		assert.match(h.error()!, /No available agent/);
		h.dialog.dispose();
		assert.strictEqual(await h.showing, undefined);
		assert.strictEqual(h.state.disposed, true);
	});

	test('provider availability is revalidated after trust and before sending', async () => {
		const h = setup();
		const trust = new DeferredPromise<boolean>();
		h.trust.returns(trust.p);
		const creating = h.select();
		h.state.providerAvailable = false;
		await trust.complete(true);
		assert.strictEqual((await creating).session, undefined);
		assert.strictEqual(h.createDraft.called, false);
		h.state.providerAvailable = true;
		h.trust.resolves(true);
		await h.select();
		h.state.providerAvailable = false;
		assert.strictEqual(await h.widget.submitInput(), false);
		assert.strictEqual(h.send.called, false);
		assert.match(h.error()!, /no longer available/);
		h.cancel();
		await h.showing;
	});

	test('late-created drafts are disposed when a newer workspace wins', async () => {
		const h = setup();
		const pending = new DeferredPromise<ISessionDraft>();
		const abandoned = { session: makeSession('abandoned'), send: sinon.stub().resolves(undefined), dispose: sinon.spy() };
		h.state.requiresTrust = false;
		h.createDraft.onFirstCall().returns(pending.p);
		const first = h.select(URI.file('/first'));
		const second = await h.select(URI.file('/second'));
		await pending.complete(abandoned);
		assert.strictEqual((await first).session, undefined);
		assert.strictEqual(second.session, h.draftSession);
		assert.strictEqual(h.host.session.get()?.sessionId, h.draftSession.sessionId);
		assert.strictEqual(abandoned.dispose.callCount, 1);
		h.cancel();
		await h.showing;
	});

	test('closing while trust is pending prevents creation and late drafts after close are disposed', async () => {
		const h = setup();
		const trust = new DeferredPromise<boolean>();
		h.trust.returns(trust.p);
		const creating = h.select();
		h.cancel();
		await h.showing;
		await trust.complete(true);
		assert.strictEqual((await creating).session, undefined);
		assert.strictEqual(h.createDraft.called, false);
		const other = setup();
		other.state.requiresTrust = false;
		const pending = new DeferredPromise<ISessionDraft>();
		other.createDraft.returns(pending.p);
		const late = other.select();
		other.cancel();
		await other.showing;
		await pending.complete(other.draft);
		assert.strictEqual((await late).session, undefined);
		assert.strictEqual(other.draftDispose.callCount, 1);
	});

	test('token cancellation and normal provider cancellation are inert', async () => {
		const h = setup();
		const cts = store.add(new CancellationTokenSource());
		h.state.requiresTrust = false;
		const pending = new DeferredPromise<ISessionDraft>();
		h.createDraft.returns(pending.p);
		const creating = h.select(undefined, undefined, cts.token);
		cts.cancel();
		await pending.complete(h.draft);
		assert.strictEqual((await creating).session, undefined);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.logError.called, false);
		h.createDraft.rejects(new CancellationError());
		await h.select();
		assert.strictEqual(h.error(), '');
		assert.strictEqual(h.logError.called, false);
		h.cancel();
		await h.showing;
	});

	test('quick chat drafts do not resolve or trust an unrelated workspace', async () => {
		const h = setup();
		await h.host.createSession(undefined, { providerId: 'test', sessionTypeId: 'test-chat' }, CancellationToken.None);
		assert.strictEqual(h.resolveWorkspace.called || h.trust.called, false);
		assert.strictEqual(h.createDraft.firstCall.args[0], undefined);
		h.cancel();
		await h.showing;
	});

	for (const change of ['deleted', 'readOnly', 'rowRemoved', 'columnRemoved', 'autoIncludeDisabled'] as const) {
		test(`revalidates the captured board before send: ${change}`, async () => {
			const h = setup({ autoInclude: change === 'autoIncludeDisabled' });
			await h.select();
			switch (change) {
				case 'deleted': h.available.set(false, undefined); break;
				case 'readOnly': h.state.editable = false; break;
				case 'rowRemoved': h.configuration.set({ ...h.configuration.get(), rows: [{ id: 'new', label: 'Replacement' }] }, undefined); break;
				case 'columnRemoved': h.configuration.set({ ...h.configuration.get(), columns: [{ id: 'new', label: 'Replacement' }] }, undefined); break;
				case 'autoIncludeDisabled': h.configuration.set({ ...h.configuration.get(), autoIncludeSessions: false }, undefined); break;
			}
			assert.strictEqual(await h.widget.submitInput(), false);
			assert.strictEqual(h.send.called, false);
			assert.strictEqual(h.state.text, 'Keep this prompt');
			assert.match(h.error()!, /no longer available/);
			h.cancel();
			await h.showing;
		});
	}

	test('external disposal during send resolves undefined but still reports the canonical committed session once', async () => {
		const h = setup({ autoInclude: false });
		await h.select();
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		const submitting = h.widget.submitInput();
		h.dialog.dispose();
		assert.strictEqual(await h.showing, undefined);
		assert.strictEqual(h.draftDispose.called || h.state.disposed, false);
		assert.deepStrictEqual(h.state.saved, []);
		await pending.complete(h.canonical);
		assert.strictEqual(await submitting, true);
		await timeout(0);
		assert.deepStrictEqual(h.onDidCreate.firstCall.args, [h.canonical, { rowId: 'general', columnId: 'p0' }]);
		assert.strictEqual(h.onDidCreate.callCount, 1);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.deepStrictEqual(h.state.saved, ['']);
	});

	test('placement callback failure cannot turn provider success into a retry', async () => {
		const h = setup();
		// The callback object is captured by show; throwing from its stub verifies
		// the host boundary independently of the parent's placement error handler.
		h.onDidCreate.withArgs(h.canonical, undefined).throws(new Error('placement failed'));
		await h.select();
		assert.strictEqual(await h.widget.submitInput(), true);
		assert.strictEqual(await h.host.sendRequest(h.host.session.get()!, { query: 'retry' }), false);
		assert.strictEqual(await h.showing, h.canonical);
		assert.strictEqual(h.send.callCount, 1);
		assert.strictEqual(h.logError.callCount, 1);
	});

	test('external disposal wins over the scheduled successful close without losing the committed callback', async () => {
		const h = setup();
		await h.select();
		assert.strictEqual(await h.widget.submitInput(), true);
		h.dialog.dispose();
		assert.strictEqual(await h.showing, undefined);
		await timeout(0);
		assert.strictEqual(h.onDidCreate.callCount, 1);
		assert.strictEqual(h.onDidCreate.firstCall.args[0], h.canonical);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.state.saved.at(-1), '');
	});

	test('disposing during a failed send preserves the prompt and defers draft and context disposal', async () => {
		const h = setup();
		await h.select();
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		const submitting = h.widget.submitInput();
		h.dialog.dispose();
		assert.strictEqual(await h.showing, undefined);
		assert.strictEqual(h.contextDispose.called || h.draftDispose.called, false);
		assert.strictEqual(h.state.draftText, '');
		assert.deepStrictEqual(h.state.saved, [], 'do not persist the cleared in-flight draft snapshot');
		await pending.error(new Error('provider failed'));
		assert.strictEqual(await submitting, false);
		await timeout(0);
		assert.strictEqual(h.contextDispose.callCount, 1);
		assert.strictEqual(h.draftDispose.callCount, 1);
		assert.strictEqual(h.onDidCreate.called, false);
		assert.strictEqual(h.state.saved.at(-1), 'Keep this prompt');
	});

	test('pending send blocks the close toolbar and Escape, then a failed send can be dismissed without losing input', async () => {
		const h = setup();
		await h.select();
		const pending = new DeferredPromise<ISession | undefined>();
		h.send.returns(pending.p);
		const submitting = h.widget.submitInput();
		let closed = false;
		void h.showing.then(() => { closed = true; });
		h.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		h.editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		await timeout(0);
		assert.strictEqual(closed, false);
		assert.strictEqual(h.state.disposed, false);
		assert.deepStrictEqual(h.state.saved, []);
		assert.match(h.container.querySelector('[role="status"]')!.textContent!, /Starting session/);
		assert.strictEqual(h.container.querySelector('.dialog-toolbar-row')!.hasAttribute('inert'), true);
		await pending.error(new Error('provider failed'));
		assert.strictEqual(await submitting, false);
		await timeout(0);
		assert.strictEqual(h.state.draftText, 'Keep this prompt');
		h.cancel();
		assert.strictEqual(await h.showing, undefined);
		assert.ok(h.state.saved.length > 0);
		assert.ok(h.state.saved.every(text => text === 'Keep this prompt'));
	});

	test('uses the explicit origin container even when the active container has drifted', async () => {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const h = setup({ document: frame.contentDocument! });
		assert.strictEqual(h.elsewhere.querySelector('[role="dialog"]'), null);
		assert.strictEqual(mainWindow.document.querySelector('[role="dialog"]'), null);
		assert.ok(h.container.querySelector('[role="dialog"]'));
		h.cancel();
		await h.showing;
	});

	test('picker popup stacking and Escape ownership last only for the dialog lifetime', async () => {
		const h = setup();
		const popup = dom.append(h.container, dom.$('.context-view.monaco-component', { tabindex: '0' }));
		popup.style.zIndex = '2575';
		assert.ok(Number(mainWindow.getComputedStyle(popup).zIndex) > Number(mainWindow.getComputedStyle(h.container.querySelector('.monaco-dialog-modal-block')!).zIndex));
		popup.focus();
		assert.strictEqual(mainWindow.document.activeElement, popup);
		popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		popup.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(0);
		assert.ok(h.container.querySelector('[role="dialog"]'));
		h.cancel();
		await h.showing;
		assert.strictEqual(mainWindow.getComputedStyle(popup).zIndex, '2575');
	});

	test('editing and undo keybindings pass through while unrelated workbench commands are stopped', async () => {
		const h = setup();
		for (const commandId of ['undo', 'redo', 'cursorWordLeft', 'deleteWordLeft', 'acceptSelectedSuggestion', 'editor.action.selectAll', 'workbench.action.showCommands']) {
			h.softDispatch.returns({ kind: ResultKind.KbFound, commandId });
			const event = new KeyboardEvent('keydown', { key: 'z', keyCode: 90, ctrlKey: true, bubbles: true, cancelable: true });
			h.editor.dispatchEvent(event);
			assert.strictEqual(event.defaultPrevented, commandId === 'workbench.action.showCommands', commandId);
			assert.strictEqual(h.softDispatch.lastCall.args[1], h.container);
		}
		h.cancel();
		await h.showing;
	});

	test('an auxiliary popup adopted from the main window retains Escape ownership', async () => {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		const h = setup({ document: frame.contentDocument! });
		const targetWindow = dom.getWindow(h.container);
		const popup = dom.append(h.container, dom.$('.context-view.monaco-component', { tabindex: '0' }));
		assert.strictEqual(popup instanceof targetWindow.HTMLElement, false);
		let closed = false;
		void h.showing.then(() => { closed = true; });
		popup.focus();
		popup.dispatchEvent(new targetWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		popup.remove();
		h.editor.focus();
		h.editor.dispatchEvent(new targetWindow.KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
		await timeout(0);
		assert.strictEqual(closed, false, 'dismissing the popup must leave the composer available');
		h.cancel();
		await h.showing;
	});

	test('shared Tab navigation reaches Project Path and composer without a footer action; Escape dismisses', async () => {
		const h = setup();
		assert.strictEqual(mainWindow.document.activeElement, h.editor);
		h.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, shiftKey: true, bubbles: true, cancelable: true }));
		assert.strictEqual(mainWindow.document.activeElement, h.destination);
		h.destination.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
		assert.strictEqual(mainWindow.document.activeElement, h.editor);
		h.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
		h.editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true }));
		assert.strictEqual(await h.showing, undefined);
		assert.strictEqual(h.state.disposed, true);
	});

	test('shared picker buttons retain toolbar styling despite dialog inline link styles', async () => {
		const h = setup();
		h.container.style.setProperty('--vscode-descriptionForeground', 'rgb(120, 130, 140)');
		h.container.style.setProperty('--vscode-icon-foreground', 'rgb(150, 160, 170)');
		h.container.style.setProperty('--vscode-foreground', 'rgb(180, 190, 200)');
		h.container.style.setProperty('--vscode-problemsWarningIcon-foreground', 'rgb(210, 150, 40)');
		h.container.style.setProperty('--vscode-problemsInfoIcon-foreground', 'rgb(40, 150, 210)');
		const composer = h.container.querySelector<HTMLElement>('.project-board-new-session-composer')!;
		const slot = dom.append(composer, dom.$('.sessions-chat-picker-slot.sessions-workspace-category-picker-slot'));
		const button = dom.append(slot, dom.$('a.action-label.selected', undefined, 'Workspace'));
		button.style.color = 'rgb(0, 0, 255)';
		button.style.textDecoration = 'underline';
		const style = mainWindow.getComputedStyle(button);
		assert.deepStrictEqual({ color: style.color, decoration: style.textDecorationLine }, { color: 'rgb(120, 130, 140)', decoration: 'none' });
		button.setAttribute('aria-expanded', 'true');
		assert.strictEqual(mainWindow.getComputedStyle(button).color, 'rgb(180, 190, 200)');
		const model = dom.append(composer, dom.$('a.action-label', { role: 'button' }, 'Model'));
		model.style.color = 'rgb(0, 0, 255)';
		model.style.textDecoration = 'underline';
		assert.strictEqual(mainWindow.getComputedStyle(model).color, 'rgb(150, 160, 170)');
		assert.strictEqual(mainWindow.getComputedStyle(model).textDecorationLine, 'none');
		model.classList.add('warning');
		assert.strictEqual(mainWindow.getComputedStyle(model).color, 'rgb(210, 150, 40)');
		model.classList.replace('warning', 'info');
		assert.strictEqual(mainWindow.getComputedStyle(model).color, 'rgb(40, 150, 210)');
		const link = dom.append(composer, dom.$('a', { href: 'https://example.invalid/' }, 'Learn More'));
		link.style.color = 'rgb(0, 0, 255)';
		link.style.textDecoration = 'underline';
		assert.strictEqual(mainWindow.getComputedStyle(link).color, 'rgb(0, 0, 255)');
		assert.strictEqual(mainWindow.getComputedStyle(link).textDecorationLine, 'underline');
		h.dialog.dispose();
		await h.showing;
	});

	test('Tab accepts an editor suggestion and Escape dismisses suggestions before the dialog', async () => {
		const h = setup();
		h.focusedEditor.returns(new class extends mock<ICodeEditor>() {
			override getDomNode() { return h.editor.parentElement; }
			override hasTextFocus() { return true; }
		}());
		let state = SuggestState.Manual;
		const accept = sinon.spy();
		const cancel = sinon.spy(() => { state = SuggestState.Idle; });
		const suggestWidget: SuggestWidget = new class extends mock<SuggestWidget>() {
			override getFocusedItem(): ISelectedSuggestion | undefined { return new class extends mock<ISelectedSuggestion>() { }(); }
		}();
		const controller: SuggestController = new class extends mock<SuggestController>() {
			override readonly model: SuggestModel = new class extends mock<SuggestModel>() {
				override get state() { return state; }
			}();
			override readonly widget: dom.WindowIdleValue<SuggestWidget> = new class extends mock<dom.WindowIdleValue<SuggestWidget>>() {
				override get value(): SuggestWidget { return suggestWidget; }
			}();
			override acceptSelectedSuggestion = accept;
			override cancelSuggestWidget = cancel;
		}();
		sinon.stub(SuggestController, 'get').returns(controller);
		h.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
		assert.strictEqual(accept.callCount, 1);
		assert.strictEqual(mainWindow.document.activeElement, h.editor);
		const escape = () => {
			h.editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			h.editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		};
		escape();
		assert.strictEqual(cancel.callCount, 1);
		await timeout(0);
		assert.ok(h.container.querySelector('[role="dialog"]'));
		escape();
		assert.strictEqual(await h.showing, undefined);
	});
});
