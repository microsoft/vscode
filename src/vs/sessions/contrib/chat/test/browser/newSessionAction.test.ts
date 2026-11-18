/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IsAuxiliaryWindowContext, LayoutModeContext, SideBarVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SessionsTitleBarNewSessionEnabledContext } from '../../../../common/agentsWindowContextKeys.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { IWindowCanvasService } from '../../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISession, ISessionWorkspace } from '../../../../../workbench/services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { INewSessionComposerService } from '../../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ISessionDraftsService } from '../../../../../workbench/contrib/sessions/browser/sessionDraftsService.js';
import { NewChatInSessionsWindowAction } from '../../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { NEW_SESSION_ACTION_ID } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { appendNewSessionTitleBarMenuItem } from '../../browser/newSessionTitleBarMenu.js';
import { ITestSessionsService, ITestSessionWithChat, stubMissingSessionHostsFromSessionsService } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { ISessionCategoriesService, SessionCategoriesService } from '../../../../../workbench/contrib/sessions/common/sessionCategory.js';
import { IWorkbenchEnvironmentService } from '../../../../../workbench/services/environment/common/environmentService.js';

suite('NewChatInSessionsWindowAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse(`${SessionType.AgentHostCopilot}:/new-session`);

	function createCommand(options: { active?: boolean; available?: boolean; creationFailed?: boolean; chatCategory?: boolean; storage?: IStorageService; isSessionsWindow?: boolean; sessions?: readonly ISession[] } = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IViewsService, { getViewWithId: () => null });
		const environment = upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: options.isSessionsWindow ?? true });
		instantiationService.stub(IWorkbenchEnvironmentService, environment);
		const categories = store.add(new SessionCategoriesService(options.storage ?? store.add(new InMemoryStorageService()), environment));
		if (options.chatCategory) {
			categories.selectCategory('personal');
		}
		instantiationService.stub(ISessionCategoriesService, categories);
		instantiationService.stub(ICustomViewService, { activeCustomView: constObservable(undefined) });
		instantiationService.stub(IWindowCanvasService, { openNewSession: () => undefined });
		instantiationService.stub(ISessionDraftsService, { stowAndClear: () => undefined });
		const opened: { target: (ICreateNewSessionOptions & { readonly folderUri?: URI }) | undefined; preserveNavigation: boolean | undefined }[] = [];
		instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
		let navigations = 0;
		instantiationService.stub(INewSessionComposerService, {
			notifyUserNavigation: () => { navigations++; },
		});
		instantiationService.stub(ISessionsManagementService, {
			isQuickChatTargetAvailable: () => options.available ?? true,
			getSessions: () => [...options.sessions ?? []],
			getNewSessionTarget: () => undefined,
			isNewSessionTargetAvailable: () => true,
		});
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
			activeSession: constObservable(options.active ? upcastPartial<ITestSessionWithChat>({
				providerId: 'other-provider',
				sessionType: 'other-agent',
			}) : undefined),
			openQuickChat: (target, preserveNavigation) => {
				opened.push({ target, preserveNavigation });
				return options.creationFailed ? undefined : upcastPartial<NonNullable<ReturnType<ISessionsService['openQuickChat']>>>({ sessionId: 'new-session', resource });
			},
			openNewSession: async target => {
				opened.push({ target, preserveNavigation: undefined });
				return { session: upcastPartial<ITestSessionWithChat>({ sessionId: 'new-session', resource }), trustDeclined: false };
			},
		}));
		stubMissingSessionHostsFromSessionsService(instantiationService);
		if (!CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID)) {
			store.add(registerAction2(NewChatInSessionsWindowAction));
		}
		const command = CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID);
		assert.ok(command);
		return {
			opened,
			categories,
			get navigations() { return navigations; },
			run: (args?: INewSessionInAgentsWindowOptions) => instantiationService.invokeFunction(command.handler, args),
		};
	}

	test('shows in the title bar in place of the hidden sessions list of the main window, and of an editor window as before, never in a chat window', () => {
		store.add(appendNewSessionTitleBarMenuItem());
		const when = MenuRegistry.getMenuItems(AgentsWindowMenus.TitleBarLeftLayout).filter(isIMenuItem).find(item => item.command.id === NEW_SESSION_ACTION_ID)?.when;
		// A chat window has layout modes; the main window and editor windows have none.
		const shows = (window: { auxiliary: boolean; layoutMode?: string }) => !!when?.evaluate(new class extends mock<IContext>() {
			override getValue<T>(key: string): T | undefined {
				const values: Record<string, unknown> = { [IsAuxiliaryWindowContext.key]: window.auxiliary, [LayoutModeContext.key]: window.layoutMode, [SideBarVisibleContext.key]: false, [SessionsWelcomeVisibleContext.key]: false, [SessionsTitleBarNewSessionEnabledContext.key]: true };
				return values[key] as T | undefined;
			}
		}());
		assert.deepStrictEqual({ mainWindow: shows({ auxiliary: false }), editorWindow: shows({ auxiliary: true }), chatWindow: shows({ auxiliary: true, layoutMode: 'sideBySide' }) }, { mainWindow: true, editorWindow: true, chatWindow: false });
	});

	test('reuses an already registered New Session command', async () => {
		createCommand();
		const command = CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID);
		const fixture = createCommand();
		assert.deepStrictEqual({
			commandUnchanged: CommandsRegistry.getCommand(NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID) === command,
			result: await fixture.run({ noWorkspace: true }),
			opened: fixture.opened,
		}, {
			commandUnchanged: true,
			result: resource,
			opened: [{ target: undefined, preserveNavigation: true }],
		});
	});

	test('the registered command returns the explicitly requested local Copilot session', async () => {
		const fixture = createCommand({ active: true });
		const result = await fixture.run({ noWorkspace: true, agentHostProvider: 'copilotcli' });
		assert.deepStrictEqual({ result, opened: fixture.opened, navigations: fixture.navigations }, {
			result: resource,
			opened: [{ target: { providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }, preserveNavigation: true }],
			navigations: 1,
		});
	});

	test('keeps inheriting the active target for ordinary workspace-less sessions', async () => {
		const fixture = createCommand({ active: true });
		await fixture.run({ noWorkspace: true });
		assert.deepStrictEqual(fixture.opened, [{
			target: { providerId: 'other-provider', sessionTypeId: 'other-agent' },
			preserveNavigation: true,
		}]);
	});

	test('keeps default target selection when there is no active session', async () => {
		const fixture = createCommand();
		await fixture.run({ noWorkspace: true });
		assert.deepStrictEqual(fixture.opened, [{ target: undefined, preserveNavigation: true }]);
	});

	test('New Session in Personal without a personal folder assigns the category and starts without a workspace', async () => {
		const fixture = createCommand({ chatCategory: true });
		assert.deepStrictEqual({ result: await fixture.run(), opened: fixture.opened, category: fixture.categories.getCategory('new-session') }, {
			result: resource,
			opened: [{ target: { category: 'personal' }, preserveNavigation: false }],
			category: 'personal',
		});
	});

	test('restores Personal for New Session before the Sessions view is instantiated', async () => {
		const storage = store.add(new InMemoryStorageService());
		const previous = createCommand({ chatCategory: true, storage });
		previous.categories.dispose();
		const restored = createCommand({ storage });
		const editor = createCommand({ storage, isSessionsWindow: false });
		assert.deepStrictEqual({
			result: await restored.run(),
			opened: restored.opened,
			category: restored.categories.getCategory('new-session'),
			editorResult: await editor.run(),
			editorOpened: editor.opened,
		}, {
			result: resource,
			opened: [{ target: { category: 'personal' }, preserveNavigation: false }],
			category: 'personal',
			editorResult: resource,
			editorOpened: [{ target: { toSide: undefined, folderUri: undefined }, preserveNavigation: undefined }],
		});
		// Without workspace-less agents, Personal starts an ordinary new session.
		const unavailable = createCommand({ storage, available: false });
		await unavailable.run();
		assert.deepStrictEqual(unavailable.opened, [{ target: { toSide: undefined, folderUri: undefined, category: 'personal' }, preserveNavigation: undefined }]);
	});

	test('explicit workspace-less options preserve navigation when Personal is selected', async () => {
		const fixture = createCommand({ chatCategory: true });
		await fixture.run({ noWorkspace: true });
		assert.deepStrictEqual(fixture.opened, [{ target: undefined, preserveNavigation: true }]);
	});

	test('New Session starts in the selected context\'s most recently updated folder', async () => {
		const session = (sessionId: string, folder: string, updated: number) => upcastPartial<ISession>({
			sessionId, providerId: 'provider', sessionType: 'agent', createdAt: new Date(0),
			updatedAt: constObservable(new Date(updated)), isArchived: constObservable(false), isQuickChat: constObservable(false),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ uri: URI.file(folder) })),
		});
		const sessions = [session('old-personal', '/old-personal', 1), session('personal', '/personal', 2), session('work', '/work', 3)];
		const personal = createCommand({ chatCategory: true, sessions });
		personal.categories.setFolderCategory(URI.file('/old-personal'), 'personal');
		personal.categories.setFolderCategory(URI.file('/personal'), 'personal');
		await personal.run();
		const work = createCommand({ sessions });
		work.categories.setFolderCategory(URI.file('/personal'), 'personal');
		await work.run();
		assert.deepStrictEqual({ personal: personal.opened.map(({ target }) => target?.folderUri?.path), work: work.opened.map(({ target }) => target?.folderUri?.path) }, { personal: ['/personal'], work: ['/work'] });
	});

	test('uses the provider creation target instead of the active backend workspace', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: false });
		instantiationService.stub(ISessionDraftsService, { stowAndClear: () => undefined });
		const backendResource = URI.parse('remote-provider:/existing');
		const backendFolder = URI.parse('vscode-agent-host://sandbox/repo');
		const creationTarget = { providerId: 'cloud-creator', folderUri: URI.parse('github-remote-file://github/owner/repo/HEAD') };
		const opened: (ICreateNewSessionOptions | undefined)[] = [];
		instantiationService.stub(INewSessionComposerService, { notifyUserNavigation() { } });
		instantiationService.stub(ICustomViewService, { activeCustomView: constObservable(undefined) });
		instantiationService.stub(IWindowCanvasService, { openNewSession: () => undefined });
		instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
		instantiationService.stub(ISessionsManagementService, {
			getNewSessionTarget: (providerId, sessionResource) => providerId === 'sandbox-backend' && isEqual(sessionResource, backendResource) ? creationTarget : undefined,
			isNewSessionTargetAvailable: (folder, target) => isEqual(folder, creationTarget.folderUri) && target?.providerId === creationTarget.providerId,
		});
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
			activeSession: constObservable(upcastPartial<ITestSessionWithChat>({
				providerId: 'sandbox-backend', sessionType: 'copilot', resource: backendResource,
				workspace: constObservable(upcastPartial<ISessionWorkspace>({ uri: backendFolder })),
			})),
			openNewSession: async options => {
				opened.push(options);
				return { session: upcastPartial<ITestSessionWithChat>({ resource }), trustDeclined: false };
			},
		}));
		stubMissingSessionHostsFromSessionsService(instantiationService);
		const result = await instantiationService.invokeFunction(accessor => new NewChatInSessionsWindowAction().run(accessor));
		assert.deepStrictEqual({ result, opened }, {
			result: resource,
			opened: [{ ...creationTarget, toSide: undefined }],
		});
	});

	test('does not fall back to another provider when the explicit target is unavailable', async () => {
		const fixture = createCommand({ available: false, active: true });
		await assert.rejects(async () => fixture.run({ noWorkspace: true, agentHostProvider: 'copilotcli' }), /unavailable/);
		assert.deepStrictEqual(fixture.opened, []);
	});

	test('New Session stows and clears before reusing the composer, but not when opening to the side', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		instantiationService.stub(INewSessionComposerService, { notifyUserNavigation() { } });
		instantiationService.stub(ISessionDraftsService, { stowAndClear: () => { calls.push('save and clear'); return undefined; } });
		instantiationService.stub(ICustomViewService, { activeCustomView: constObservable(undefined) });
		instantiationService.stub(IWindowCanvasService, { openNewSession: () => undefined });
		instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
		instantiationService.stub(ISessionsManagementService, {});
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
			activeSession: constObservable(undefined),
			openNewSession: async () => { calls.push('open'); return { session: undefined, trustDeclined: false }; },
		}));
		stubMissingSessionHostsFromSessionsService(instantiationService);
		for (const toSide of [false, true]) {
			await instantiationService.invokeFunction(accessor => new NewChatInSessionsWindowAction().run(accessor, { toSide }));
		}
		assert.deepStrictEqual(calls, ['save and clear', 'open', 'open']);
	});

	test('surfaces failure to create an explicitly targeted session', async () => {
		const fixture = createCommand({ creationFailed: true });
		await assert.rejects(async () => fixture.run({ noWorkspace: true, agentHostProvider: 'copilotcli' }), /Could not create a session/);
	});
});
