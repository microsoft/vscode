/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { ILifecycleService } from '../../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { EditorWindowSessionsRuntime } from '../../../browser/editorWindow/editorWindowSessionsRuntime.js';
import { EditorWindowSessionsPresenterService, IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../../../browser/editorWindow/editorWindowSessionsPresenter.js';
import { IChatViewHostService } from '../../../../chat/browser/chatViewHost.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { ACTION_ID_NEW_CHAT } from '../../../../chat/browser/actions/chatActions.js';
import { URI } from '../../../../../../base/common/uri.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { ISessionHost } from '../../../../../services/sessions/browser/sessionHost.js';
import { EditorWindowSessionsService } from '../../../browser/agentsView/editorWindowSessionsService.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { ISessionOpenTelemetryService } from '../../../browser/sessionOpenTelemetryService.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { ISession } from '../../../../../services/sessions/common/session.js';

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

	test('without a presenter, a new session starts a new chat in the Chat view, rather than the next request going to the chat it showed', async () => {
		const calls: string[] = [];
		const service = disposables.add(new EditorWindowSessionsPresenterService(
			upcastPartial<IChatViewHostService>({ reveal: async preserveFocus => { calls.push(`reveal preserveFocus=${preserveFocus}`); return undefined; } }),
			upcastPartial<ICommandService>({ executeCommand: async (id: string) => { calls.push(id); return undefined; } }),
		));

		await service.presenter.get().openComposer(undefined, { preserveFocus: true });

		assert.deepStrictEqual(calls, ['reveal preserveFocus=true', ACTION_ID_NEW_CHAT]);
	});

	test('the presenter registered last presents, until its registration is disposed, also when the same presenter is registered twice', () => {
		const service = disposables.add(new EditorWindowSessionsPresenterService(upcastPartial<IChatViewHostService>({}), upcastPartial<ICommandService>({})));
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

	test('counts the composers of what holds them, also once it no longer presents the sessions, until it no longer holds them', async () => {
		const service = disposables.add(new EditorWindowSessionsPresenterService(upcastPartial<IChatViewHostService>({}), upcastPartial<ICommandService>({})));
		const closed: string[] = [];
		const presenter = service.registerPresenter(upcastPartial<IEditorWindowSessionsPresenter>({}));
		const holder = service.registerComposerHolder({ hasComposer: () => true, closeIdleComposers: async () => { closed.push('chat part'); } });

		presenter.dispose();
		const afterPresenter = service.hasComposer();
		await service.closeIdleComposers();
		holder.dispose();

		assert.deepStrictEqual({ afterPresenter, closed, afterHolder: service.hasComposer() }, { afterPresenter: true, closed: ['chat part'], afterHolder: false });
	});
});

suite('EditorWindowSessionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('New Session starts a new chat in the Chat view while no feature presents the sessions, and a composer aimed at its target while one does', async () => {
		const calls: string[] = [];
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ reveal: async () => { calls.push('reveal'); return undefined; } }));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (id: string) => { calls.push(id); return undefined; } }));
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
			withoutPresenter: ['reveal', ACTION_ID_NEW_CHAT],
			withPresenter: ['composer /repo model=model devContainer=true toSide=true'],
		});
	});

	test('a later open supersedes an earlier one that still resolves its session, so the user\'s latest pick shows', async () => {
		const opened: string[] = [];
		const resolvingA = new DeferredPromise<URI>();
		const a: ISession = { ...buildTestSession({ id: 'a', title: 'A' }).session, loading: constObservable(false) };
		const b: ISession = { ...buildTestSession({ id: 'b', title: 'B' }).session, loading: constObservable(false) };
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({}));
		instantiationService.stub(ICommandService, upcastPartial<ICommandService>({}));
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
});
