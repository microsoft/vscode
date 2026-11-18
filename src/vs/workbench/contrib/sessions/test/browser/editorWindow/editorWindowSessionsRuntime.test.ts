/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IAgentsViewProvidersReleaseParticipant, IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { EditorWindowSessionsRuntime } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';
import { EditorWindowSessionsPresenterService, IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { EditorWindowSessionsService } from '../../../browser/agentsView/editorWindowSessionsService.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ISessionOpenTelemetryService } from '../../../browser/sessionOpenTelemetryService.js';
import { SESSION_OPEN_WAIT_TIMEOUT } from '../../../browser/sessionOpen.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { ISessionsProvider } from '../../../common/sessionsProvider.js';
import { EditorWindowSessionsNavigationHost } from '../../../browser/agentsView/editorWindowSessionsNavigationHost.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { IChat, ISession, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';

suite('EditorWindowSessionsRuntime', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRuntime(state: { readonly views: Set<string>; chatPart: boolean }, events: string[]) {
		const onDidChangeViewVisibility = disposables.add(new Emitter<{ id: string; visible: boolean }>());
		const onDidChangePartVisibility = disposables.add(new Emitter<{ partId: string; visible: boolean }>());
		const listen = <T>(emitter: Emitter<T>, name: string) => (listener: (e: T) => unknown) => {
			events.push(`listen ${name}`);
			const listening = emitter.event(listener);
			return toDisposable(() => { events.push(`unlisten ${name}`); listening.dispose(); });
		};
		const runtime = disposables.add(new EditorWindowSessionsRuntime(
			upcastPartial<IViewsService>({ onDidChangeViewVisibility: listen(onDidChangeViewVisibility, 'views'), isViewVisible: id => state.views.has(id) }),
			upcastPartial<IWorkbenchLayoutService>({ onDidChangePartVisibility: listen(onDidChangePartVisibility, 'parts'), isVisible: part => part === Parts.CHAT_PART && state.chatPart }),
			upcastPartial<ILifecycleService>({ when: () => Promise.resolve() }),
			upcastPartial<IAgentsViewProvidersService>({ acquire: () => { events.push('acquire'); return toDisposable(() => events.push('release')); } }),
		));
		const showView = (id: string, visible: boolean) => {
			if (visible) {
				state.views.add(id);
			} else {
				state.views.delete(id);
			}
			onDidChangeViewVisibility.fire({ id, visible });
		};
		const showChatPart = (visible: boolean) => {
			state.chatPart = visible;
			onDidChangePartVisibility.fire({ partId: Parts.CHAT_PART, visible });
		};
		return { runtime, showView, showChatPart };
	}

	test('listens to nothing and holds nothing until a feature enables it, also while what shows sessions shows', async () => {
		const events: string[] = [];
		const { runtime, showView, showChatPart } = createRuntime({ views: new Set(['list']), chatPart: true }, events);
		showView('list', true);
		showChatPart(true);
		await Promise.resolve();

		assert.deepStrictEqual({ events, enabled: runtime.enabled.get() }, { events: [], enabled: false });
	});

	test('a feature that enables it twice with the same options keeps it enabled until it disposes both', async () => {
		const events: string[] = [];
		const { runtime } = createRuntime({ views: new Set(['list']), chatPart: false }, events);
		const options = { viewIds: ['list'] };

		const first = runtime.enable(options);
		const second = runtime.enable(options);
		first.dispose();
		const afterFirst = { enabled: runtime.enabled.get(), events: [...events] };
		second.dispose();

		assert.deepStrictEqual({ afterFirst, afterBoth: { enabled: runtime.enabled.get(), events } }, {
			afterFirst: { enabled: true, events: ['listen views', 'listen parts', 'acquire'] },
			afterBoth: { enabled: false, events: ['listen views', 'listen parts', 'acquire', 'unlisten views', 'unlisten parts', 'release'] },
		});
	});

	test('holds the providers while a view of a feature that enabled it, or the chat part, shows, as the window restores too', async () => {
		const events: string[] = [];
		const { runtime, showView, showChatPart } = createRuntime({ views: new Set(), chatPart: true }, events);
		const step = (label: string, action: () => void) => { events.push(`-- ${label}`); action(); };

		// The window restores with the chat part shown
		const list = runtime.enable({ viewIds: ['list'] });
		step('the list shows', () => showView('list', true));
		step('the chat part hides', () => showChatPart(false));
		step('a view of no feature shows', () => showView('other', true));
		step('another feature enables it with its view', () => runtime.enable({ viewIds: ['other'] }).dispose());
		step('the list hides', () => showView('list', false));
		step('the chat part shows', () => showChatPart(true));
		step('the last feature disables it', () => list.dispose());
		step('the list shows', () => showView('list', true));

		assert.deepStrictEqual(events, [
			'listen views', 'listen parts', 'acquire',
			'-- the list shows',
			'-- the chat part hides',
			'-- a view of no feature shows',
			'-- another feature enables it with its view',
			'-- the list hides', 'release',
			'-- the chat part shows', 'acquire',
			'-- the last feature disables it', 'unlisten views', 'unlisten parts', 'release',
			'-- the list shows',
		]);
	});
});

suite('EditorWindowSessionsPresenterService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('without a presenter, a new session starts a new chat of the Chat view\'s own, not of the chat widget that has focus, aimed at its target', async () => {
		const calls: string[] = [];
		const service = disposables.add(new EditorWindowSessionsPresenterService(
			upcastPartial<IChatViewHostService>({
				newChat: async (target, options) => { calls.push(`newChat ${target?.folder?.path} provider=${target?.providerId} type=${target?.sessionType} model=${target?.modelId} mode=${target?.modeId} devContainer=${target?.requireDevContainer} ownChat=${options?.ownChat} preserveFocus=${options?.preserveFocus}`); return true; },
			}),
			upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }),
		));

		await service.presenter.get().openComposer(undefined, { preserveFocus: true });
		await service.presenter.get().openComposer({ folderUri: URI.file('/repo.worktrees/a'), providerId: 'local-agent-host', sessionTypeId: 'copilotcli', modelId: 'model', modeId: 'mode', requireDevContainer: true });

		assert.deepStrictEqual(calls, [
			'newChat undefined provider=undefined type=undefined model=undefined mode=undefined devContainer=undefined ownChat=true preserveFocus=true',
			'newChat /repo.worktrees/a provider=local-agent-host type=copilotcli model=model mode=mode devContainer=true ownChat=true preserveFocus=undefined',
		]);
	});

	test('the presenter registered last presents, until its registration is disposed, also when the same presenter is registered twice', () => {
		const service = disposables.add(new EditorWindowSessionsPresenterService(upcastPartial<IChatViewHostService>({}), upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) })));
		const chatView = service.presenter.get();
		const first = upcastPartial<IEditorWindowSessionsPresenter>({});
		const second = upcastPartial<IEditorWindowSessionsPresenter>({});
		const name = () => service.presenter.get() === first ? 'first' : service.presenter.get() === second ? 'second' : service.presenter.get() === chatView ? 'chat view' : 'other';
		const steps: string[] = [];

		const firstEarlier = service.registerPresenter(first);
		const secondRegistration = service.registerPresenter(second);
		const firstAgain = service.registerPresenter(first);
		steps.push(name());
		firstEarlier.dispose();
		steps.push(name());
		firstAgain.dispose();
		steps.push(name());
		secondRegistration.dispose();
		steps.push(name());

		assert.deepStrictEqual(steps, ['first', 'first', 'second', 'chat view']);
	});

	test('as the providers are released, closes the idle composers of what holds them, also once it no longer presents the sessions, and keeps the providers while a composer remains', async () => {
		const participants: IAgentsViewProvidersReleaseParticipant[] = [];
		const service = disposables.add(new EditorWindowSessionsPresenterService(upcastPartial<IChatViewHostService>({}), upcastPartial<IAgentsViewProvidersService>({
			registerReleaseParticipant: participant => {
				participants.push(participant);
				return toDisposable(() => participants.splice(participants.indexOf(participant), 1));
			},
		})));
		const closed: string[] = [];
		const composer = { open: true, idle: false };
		const presenter = service.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({}));
		const holder = service.registerComposerHolder({
			hasComposer: () => composer.open,
			closeIdleComposers: async () => {
				if (composer.idle) {
					composer.open = false;
					closed.push('chat part');
				}
			},
		});

		presenter.dispose();
		const withInput = await participants[0].prepareRelease();
		composer.idle = true;
		const idle = await participants[0].prepareRelease();
		holder.dispose();
		service.dispose();

		assert.deepStrictEqual({ withInput, idle, closed, participants: participants.length }, { withInput: false, idle: true, closed: ['chat part'], participants: 0 });
	});
});

suite('EditorWindowSessionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('New Session starts a new chat in the Chat view while no feature presents the sessions, and a composer aimed at its target while one does', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ reveal: async () => { calls.push('reveal'); return undefined; }, newChat: async () => { calls.push('newChat'); return true; } }));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }), getWorkspaceFolder: () => null }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		const service = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));

		await service.openNewSession();
		const withoutPresenter = calls.splice(0);
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
			openComposer: async (target, options) => { calls.push(`composer ${target?.folderUri?.path} model=${target?.modelId} devContainer=${target?.requireDevContainer} toSide=${options?.sideBySide}`); },
		}));
		await service.openNewSession({ folderUri: URI.file('/repo'), modelId: 'model', requireDevContainer: true, toSide: true });
		registration.dispose();

		assert.deepStrictEqual({ withoutPresenter, withPresenter: calls }, {
			withoutPresenter: ['newChat'],
			withPresenter: ['composer /repo model=model devContainer=true toSide=true'],
		});
	});

	test('trust is the caller\'s to ask for: canOpenSession asks for it, and opening a session\'s chat, also to the side, does not', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
			openChat: async (_session, chatResource, options) => { calls.push(`open ${chatResource?.path} toSide=${options?.sideBySide}`); },
		}));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({ getRemoteHostLabel: () => undefined }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }), getWorkspaceFolder: () => null }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		instantiationService.stub(IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({ getUriTrustInfo: async uri => ({ uri, trusted: false }) }));
		instantiationService.stub(IWorkspaceTrustRequestService, upcastPartial<IWorkspaceTrustRequestService>({ requestResourcesTrust: async () => { calls.push('request trust'); return false; } }));
		const service = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));
		const folder = URI.file('/untrusted');
		const workspace: ISessionWorkspace = { uri: folder, label: 'untrusted', icon: undefined!, requiresWorkspaceTrust: true, isVirtualWorkspace: false, folders: [{ root: folder, workingDirectory: folder, name: 'untrusted', description: undefined, gitRepository: undefined }] };
		const built = buildTestSession({ id: 'untrusted', title: 'Untrusted' });
		const session: ISession = { ...built.session, workspace: constObservable(workspace) };
		const chat = built.mainChat.chat.resource;

		await service.openSessionToSide(session, { chatResource: chat });
		await service.openChat(session, chat);
		await service.openChatToSide(session, chat);
		const opened = calls.splice(0);
		const canOpen = await service.canOpenSession(session);
		registration.dispose();

		assert.deepStrictEqual({ opened, canOpen, asked: calls }, {
			opened: [`open ${chat.path} toSide=true`, `open ${chat.path} toSide=undefined`, `open ${chat.path} toSide=true`],
			canOpen: false,
			asked: ['request trust'],
		});
	});

	test('a later open supersedes an earlier one that still resolves its session, so the user\'s latest pick shows', async () => {
		const opened: string[] = [];
		const resolvingA = new DeferredPromise<URI>();
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
			openChat: async session => { opened.push(session.sessionId); },
			isShowing: () => false,
		}));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			resolveSessionResource: async resource => isEqual(resource, a.resource) ? resolvingA.p : resource,
			getSession: resource => [a, b].find(session => isEqual(session.resource, resource)),
		}));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => toDisposable(() => { }) }));
		instantiationService.stub(ISessionOpenTelemetryService, upcastPartial<ISessionOpenTelemetryService>({
			withOpenRequest: (async (_source: string, _token: unknown, open: (attempt: unknown) => Promise<void>) => open({})) as ISessionOpenTelemetryService['withOpenRequest'],
			sessionResolved: () => { }, sessionActivated: () => { }, sessionLoaded: () => { },
		}));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({}));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({}));
		const service = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));

		const openingA = service.openSession(a.resource);
		await service.openSession(b.resource);
		resolvingA.complete(a.resource);
		await openingA;
		registration.dispose();

		assert.deepStrictEqual(opened, ['b']);
	});

	test('New Session supersedes an open that still resolves its session; each open prepares its session with its provider before it shows it, such as to connect a Dev Container session', async () => {
		const events: string[] = [];
		const resolvingA = new DeferredPromise<URI>();
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
			openChat: async (session, chat, options) => { events.push(`show ${session.sessionId}${chat ? ' chat' : ''}${options?.sideBySide ? ' to the side' : ''}`); },
			openComposer: async () => { events.push('composer'); },
			isShowing: () => false,
		}));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			resolveSessionResource: async resource => isEqual(resource, a.resource) ? resolvingA.p : resource,
			getSession: resource => [a, b].find(session => isEqual(session.resource, resource)),
		}));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>(_providerId: string, sessionId?: string) => upcastPartial<ISessionsProvider>({ prepareSessionForOpen: async () => { events.push(`prepare ${sessionId}`); } }) as T,
		}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => toDisposable(() => { }) }));
		instantiationService.stub(ISessionOpenTelemetryService, upcastPartial<ISessionOpenTelemetryService>({
			withOpenRequest: (async (_source: string, _token: unknown, open: (attempt: unknown) => Promise<void>) => open({})) as ISessionOpenTelemetryService['withOpenRequest'],
			sessionResolved: () => { }, sessionActivated: () => { }, sessionLoaded: () => { },
		}));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }), getWorkspaceFolder: () => null }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		const service = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));

		const openingA = service.openSession(a.resource);
		await service.openNewSession();
		resolvingA.complete(a.resource);
		await openingA;
		const afterNewSession = events.splice(0);
		await service.openSession(b.resource);
		await service.openSessionToSide(b);
		await service.openChat(b, b.mainChat.get().resource);
		await service.openChatToSide(b, b.mainChat.get().resource);
		registration.dispose();

		assert.deepStrictEqual({ afterNewSession, opens: events }, {
			afterNewSession: ['composer'],
			opens: ['prepare b', 'show b', 'prepare b', 'show b to the side', 'prepare b', 'show b chat', 'prepare b', 'show b chat to the side'],
		});
	});

	test('New Session aims its composer at the window\'s folder with what is asked for, such as a model or a Dev Container; New Quick Chat at no folder, with what is asked for', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({}));
		const windowFolder = upcastPartial<IWorkspaceFolder>({ uri: URI.file('/window') });
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [windowFolder] }), getWorkspaceFolder: () => null }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		const service = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
			openComposer: async target => { calls.push(target ? `folder=${target.folderUri?.path ?? 'none'} provider=${target.providerId} model=${target.modelId} devContainer=${target.requireDevContainer}` : 'no target'); },
		}));

		await service.openNewSession({ modelId: 'model', requireDevContainer: true, providerId: 'provider' });
		service.openQuickChat({ providerId: 'provider', modelId: 'model' });
		await timeout(0);
		registration.dispose();

		assert.deepStrictEqual(calls, [
			'folder=/window provider=provider model=model devContainer=true',
			'folder=none provider=provider model=model devContainer=undefined',
		]);
	});

	test('the navigation host\'s later open supersedes an earlier one that still resolves its session, so the user\'s latest pick shows', async () => {
		const opened: string[] = [];
		const resolvingA = new DeferredPromise<URI>();
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({ openChat: async session => { opened.push(session.sessionId); } }));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			resolveSessionResource: async resource => isEqual(resource, a.resource) ? resolvingA.p : resource,
			getSession: resource => [a, b].find(session => isEqual(session.resource, resource)),
		}));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => toDisposable(() => { }) }));
		instantiationService.stub(IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({}));
		instantiationService.stub(IWorkspaceTrustRequestService, upcastPartial<IWorkspaceTrustRequestService>({}));
		const host = disposables.add(instantiationService.createInstance(EditorWindowSessionsNavigationHost));

		const openingA = host.openSession(a.resource);
		await host.openSession(b.resource);
		resolvingA.complete(a.resource);
		await openingA;
		registration.dispose();

		assert.deepStrictEqual(opened, ['b']);
	});

	test('an open waiting for a session its providers do not know yet stops as a later open supersedes it, and releases the providers then, by the sessions service and the navigation host alike', () => runWithFakedTimers({}, async () => {
		const results: Record<string, unknown> = {};
		for (const opener of ['service', 'host'] as const) {
			const events: string[] = [];
			const unknown: ISession = { ...buildTestSession({ id: 'unknown', title: 'Unknown' }).session, loading: constObservable(false) };
			const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
			instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
			const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
			const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
				openChat: async session => { events.push(`open ${session.sessionId}`); },
				isShowing: () => false,
			}));
			instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
			instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				resolveSessionResource: async resource => resource,
				getSession: resource => isEqual(resource, b.resource) ? b : undefined,
				onDidChangeSessions: Event.None,
				onDidChangeSession: Event.None,
			}));
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined, onDidChangeProviders: Event.None }));
			let holds = 0;
			instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => { holds++; return toDisposable(() => { holds--; events.push(`release, ${holds} held`); }); } }));
			instantiationService.stub(ISessionOpenTelemetryService, upcastPartial<ISessionOpenTelemetryService>({
				withOpenRequest: (async (_source: string, _token: unknown, open: (attempt: unknown) => Promise<void>) => open({})) as ISessionOpenTelemetryService['withOpenRequest'],
				sessionResolved: () => { }, sessionActivated: () => { }, sessionLoaded: () => { },
			}));
			instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({}));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({}));
			instantiationService.stub(IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({}));
			instantiationService.stub(IWorkspaceTrustRequestService, upcastPartial<IWorkspaceTrustRequestService>({}));
			const target = opener === 'service'
				? disposables.add(instantiationService.createInstance(EditorWindowSessionsService))
				: disposables.add(instantiationService.createInstance(EditorWindowSessionsNavigationHost));

			const start = Date.now();
			let waited: number | undefined;
			const openingUnknown = target.openSession(unknown.resource).then(() => { waited = Date.now() - start; });
			await timeout(10);
			await target.openSession(b.resource);
			await openingUnknown;
			registration.dispose();
			results[opener] = { events, stoppedAtOnce: waited !== undefined && waited < SESSION_OPEN_WAIT_TIMEOUT };
		}

		assert.deepStrictEqual(results, {
			service: { events: ['release, 1 held', 'open b', 'release, 0 held'], stoppedAtOnce: true },
			host: { events: ['release, 1 held', 'open b', 'release, 0 held'], stoppedAtOnce: true },
		});
	}));

	test('disposing what opens a session ends its open, by the sessions service and the navigation host alike: a wait for a session its providers do not know yet stops and releases the providers, and an open whose session still prepares shows nothing', () => runWithFakedTimers({}, async () => {
		const unknown: ISession = { ...buildTestSession({ id: 'unknown', title: 'Unknown' }).session, loading: constObservable(false) };
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const run = async (opener: 'service' | 'host', open: (target: EditorWindowSessionsService | EditorWindowSessionsNavigationHost) => Promise<void>) => {
			const events: string[] = [];
			const preparingA = new DeferredPromise<void>();
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
			instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
			const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
			const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({
				openChat: async session => { events.push(`open ${session.sessionId}`); },
				isShowing: () => false,
			}));
			instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
			instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				resolveSessionResource: async resource => resource,
				getSession: resource => isEqual(resource, a.resource) ? a : undefined,
				onDidChangeSessions: Event.None,
				onDidChangeSession: Event.None,
			}));
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
				getProvider: <T extends ISessionsProvider>() => upcastPartial<ISessionsProvider>({ prepareSessionForOpen: () => preparingA.p }) as T,
				onDidChangeProviders: Event.None,
			}));
			let holds = 0;
			instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => { holds++; return toDisposable(() => { holds--; events.push(`release, ${holds} held`); }); } }));
			instantiationService.stub(ISessionOpenTelemetryService, upcastPartial<ISessionOpenTelemetryService>({
				withOpenRequest: (async (_source: string, _token: unknown, open: (attempt: unknown) => Promise<void>) => open({})) as ISessionOpenTelemetryService['withOpenRequest'],
				sessionResolved: () => { }, sessionActivated: () => { }, sessionLoaded: () => { },
			}));
			instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({}));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({}));
			instantiationService.stub(IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({}));
			instantiationService.stub(IWorkspaceTrustRequestService, upcastPartial<IWorkspaceTrustRequestService>({}));
			const target = opener === 'service'
				? disposables.add(instantiationService.createInstance(EditorWindowSessionsService))
				: disposables.add(instantiationService.createInstance(EditorWindowSessionsNavigationHost));

			const start = Date.now();
			let ended: number | undefined;
			const opening = open(target).then(() => { ended = Date.now() - start; });
			await timeout(10);
			target.dispose();
			await timeout(0);
			preparingA.complete();
			await opening;
			registration.dispose();
			return { events, endedAtOnce: ended !== undefined && ended < SESSION_OPEN_WAIT_TIMEOUT };
		};

		const results: Record<string, unknown> = {};
		for (const opener of ['service', 'host'] as const) {
			results[opener] = {
				waitingForSession: await run(opener, target => target.openSession(unknown.resource)),
				preparingSession: await run(opener, target => target.openSession(a.resource)),
				preparingChat: await run(opener, target => target.openChat(a, a.mainChat.get().resource)),
			};
		}

		const expected = {
			waitingForSession: { events: ['release, 0 held'], endedAtOnce: true },
			preparingSession: { events: ['release, 0 held'], endedAtOnce: true },
			preparingChat: { events: [], endedAtOnce: true },
		};
		assert.deepStrictEqual(results, { service: expected, host: expected });
	}));

	test('a chat open whose session still prepares is superseded by a later open, also of a quick chat, and supersedes an earlier one, by the sessions service and the navigation host alike, so the user\'s latest pick shows', async () => {
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
		const run = async (kind: 'service' | 'navigation host') => {
			const shown: string[] = [];
			let preparingA: DeferredPromise<void> | undefined;
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
			instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
			const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
			const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({ openChat: async (session, chat) => { shown.push(`${session.sessionId}${chat ? ' chat' : ''}`); }, openComposer: async () => { shown.push('composer'); }, isShowing: () => false }));
			instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
			instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
			instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
				resolveSessionResource: async resource => resource,
				getSession: resource => [a, b].find(session => isEqual(session.resource, resource)),
			}));
			instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
				getProvider: <T extends ISessionsProvider>(_providerId: string, sessionId?: string) => upcastPartial<ISessionsProvider>({ prepareSessionForOpen: () => sessionId === 'a' && preparingA ? preparingA.p : Promise.resolve() }) as T,
			}));
			instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => toDisposable(() => { }) }));
			instantiationService.stub(ISessionOpenTelemetryService, upcastPartial<ISessionOpenTelemetryService>({
				withOpenRequest: (async (_source: string, _token: unknown, open: (attempt: unknown) => Promise<void>) => open({})) as ISessionOpenTelemetryService['withOpenRequest'],
				sessionResolved: () => { }, sessionActivated: () => { }, sessionLoaded: () => { },
			}));
			instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }), getWorkspaceFolder: () => null }));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
			instantiationService.stub(IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({}));
			instantiationService.stub(IWorkspaceTrustRequestService, upcastPartial<IWorkspaceTrustRequestService>({}));
			const host = kind === 'service' ? disposables.add(instantiationService.createInstance(EditorWindowSessionsService)) : disposables.add(instantiationService.createInstance(EditorWindowSessionsNavigationHost));
			const supersededBy = async (later: () => Promise<void>) => {
				preparingA = new DeferredPromise<void>();
				const openingA = host.openChat(a, a.mainChat.get().resource);
				await later();
				preparingA.complete();
				await openingA;
				return shown.splice(0);
			};

			const bySession = await supersededBy(() => host.openSession(b.resource));
			const byChat = await supersededBy(() => host.openChat(b, b.mainChat.get().resource));
			const byQuickChat = host instanceof EditorWindowSessionsService ? await supersededBy(async () => { host.openQuickChat(); }) : ['composer'];
			// A session whose open still prepares does not show over a chat or a quick chat opened later
			const sessionOpenSupersededBy = async (later: () => Promise<void>) => {
				preparingA = new DeferredPromise<void>();
				const openingA = host.openSession(a.resource);
				await timeout(0);
				await later();
				preparingA.complete();
				await openingA;
				return shown.splice(0);
			};
			const overSessionOpen = await sessionOpenSupersededBy(() => host.openChat(b, b.mainChat.get().resource));
			const quickChatOverSessionOpen = host instanceof EditorWindowSessionsService ? await sessionOpenSupersededBy(async () => { host.openQuickChat(); }) : ['composer'];
			registration.dispose();
			return { bySession, byChat, byQuickChat, overSessionOpen, quickChatOverSessionOpen };
		};

		const expected = { bySession: ['b'], byChat: ['b chat'], byQuickChat: ['composer'], overSessionOpen: ['b chat'], quickChatOverSessionOpen: ['composer'] };
		assert.deepStrictEqual({ service: await run('service'), navigationHost: await run('navigation host') }, { service: expected, navigationHost: expected });
	});

	test('a new chat in a session whose provider still creates it is superseded by a later open, and supersedes an earlier one, so the user\'s latest pick shows', async () => {
		const shown: string[] = [];
		let creating: DeferredPromise<IChat | undefined> | undefined;
		// Only the open of A in the second case prepares A
		const preparingA = new DeferredPromise<void>();
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ registerReleaseParticipant: () => toDisposable(() => { }) }));
		const presenterService = disposables.add(instantiationService.createInstance(EditorWindowSessionsPresenterService));
		const registration = presenterService.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({ openChat: async (session, chat) => { shown.push(`${session.sessionId}${chat ? ' chat' : ''}`); }, isShowing: () => false }));
		instantiationService.stub(IEditorWindowSessionsPresenterService, presenterService);
		instantiationService.stub(ISessionHost, upcastPartial<ISessionHost>({}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			resolveSessionResource: async resource => resource,
			getSession: resource => [a, b].find(session => isEqual(session.resource, resource)),
			createNewChatInSession: async session => session === a && creating ? creating.p : session.mainChat.get(),
		}));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({
			getProvider: <T extends ISessionsProvider>(_providerId: string, sessionId?: string) => upcastPartial<ISessionsProvider>({ prepareSessionForOpen: () => sessionId === 'a' ? preparingA.p : Promise.resolve() }) as T,
		}));
		instantiationService.stub(IAgentsViewProvidersService, upcastPartial<IAgentsViewProvidersService>({ acquire: () => toDisposable(() => { }) }));
		instantiationService.stub(ISessionOpenTelemetryService, upcastPartial<ISessionOpenTelemetryService>({
			withOpenRequest: (async (_source: string, _token: unknown, open: (attempt: unknown) => Promise<void>) => open({})) as ISessionOpenTelemetryService['withOpenRequest'],
			sessionResolved: () => { }, sessionActivated: () => { }, sessionLoaded: () => { },
		}));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }), getWorkspaceFolder: () => null }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ activeEditor: undefined }));
		const service = disposables.add(instantiationService.createInstance(EditorWindowSessionsService));

		// A's provider still creates its new chat, as switching the harness of A's composer does, when the user opens B
		creating = new DeferredPromise<IChat | undefined>();
		const creatingInA = service.openNewChatInSession(a, { harness: 'other' });
		await service.openSession(b.resource);
		creating.complete(a.mainChat.get());
		await creatingInA;
		creating = undefined;
		const newChatOverLaterOpen = shown.splice(0);

		// A's open still prepares its session when the user starts a new chat in B
		const openingA = service.openSession(a.resource);
		await timeout(0);
		await service.openNewChatInSession(b);
		preparingA.complete();
		await openingA;
		const openOverLaterNewChat = shown.splice(0);
		registration.dispose();

		assert.deepStrictEqual({ newChatOverLaterOpen, openOverLaterNewChat }, { newChatOverLaterOpen: ['b'], openOverLaterNewChat: ['b chat'] });
	});
});
