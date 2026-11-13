/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IContext } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INewSessionInAgentsWindowOptions, NEW_SESSION_IN_AGENTS_WINDOW_COMMAND_ID, SessionType } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { ISessionsPartService, ISessionView } from '../../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { IsAuxiliaryWindowContext, LayoutModeContext, SideBarVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { SessionsWelcomeVisibleContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { SessionsTitleBarNewSessionEnabledContext } from '../../../../common/agentsWindowContextKeys.js';
import { ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { IWindowCanvasService } from '../../../../../workbench/contrib/sessions/browser/windowCanvas.js';
import { ISessionsProvidersService } from '../../../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { ISessionWorkspace } from '../../../../../workbench/services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { INewSessionComposerService } from '../../../../../workbench/contrib/sessions/browser/newSessionComposerService.js';
import { ISessionDraftsService } from '../../../../../workbench/contrib/sessions/browser/sessionDraftsService.js';
import { NewChatInSessionsWindowAction } from '../../../../../workbench/contrib/sessions/browser/chat/newSessionAction.js';
import { NEW_SESSION_ACTION_ID } from '../../../../../workbench/contrib/sessions/common/chatConstants.js';
import { appendNewSessionTitleBarMenuItem } from '../../browser/newSessionTitleBarMenu.js';
import { ITestSessionsService, ITestSessionWithChat, stubMissingSessionHostsFromSessionsService } from '../../../../../workbench/contrib/sessions/test/browser/sessionHostTestUtils.js';

suite('NewChatInSessionsWindowAction', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse(`${SessionType.AgentHostCopilot}:/new-session`);
	const folderUri = URI.file('/workspace');

	function createCommand(options: { active?: boolean; available?: boolean; creationFailed?: boolean; workspace?: boolean; sendFailed?: boolean; submission?: Promise<boolean> } = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionDraftsService, { stowAndClear: () => undefined });
		const opened: { target: ICreateNewSessionOptions | undefined; preserveNavigation: boolean | undefined }[] = [];
		const openedWorkspace: (ICreateNewSessionOptions | undefined)[] = [];
		const calls: string[] = [];
		const sending = new DeferredPromise<void>();
		const tools: { resource: URI; toolIds: readonly string[] }[] = [];
		const session = upcastPartial<ITestSessionWithChat>({ resource, sessionId: 'new-session' });
		instantiationService.stub(IAgentHostActiveClientService, {
			setSessionTools: (resource, toolIds) => { calls.push('tools'); tools.push({ resource, toolIds }); },
			clearSessionTools: () => { calls.push('clear'); },
		});
		instantiationService.stub(ISessionsPartService, {
			getSessionView: sessionId => sessionId === session.sessionId ? upcastPartial<ISessionView>({
				sendQuery: async prompt => {
					calls.push(`send:${prompt}`);
					await sending.complete();
					if (options.sendFailed) {
						throw new Error('Send failed');
					}
					return options.submission ?? true;
				},
				prefillInput: prompt => { calls.push(`prefill:${prompt}`); },
			}) : undefined,
		});
		instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
		let navigations = 0;
		instantiationService.stub(INewSessionComposerService, {
			notifyUserNavigation: () => { navigations++; },
		});
		instantiationService.stub(ISessionsManagementService, {
			isQuickChatTargetAvailable: () => options.available ?? true,
			isNewSessionTargetAvailable: () => options.available ?? true,
			getNewSessionTarget: () => undefined,
		});
		instantiationService.stub(ISessionsService, upcastPartial<ITestSessionsService>({
			activeSession: constObservable(options.active ? upcastPartial<ITestSessionWithChat>({
				providerId: 'other-provider',
				sessionType: 'other-agent',
				workspace: constObservable(options.workspace ? upcastPartial<ISessionWorkspace>({ uri: folderUri }) : undefined),
			}) : undefined),
			openQuickChat: (target, preserveNavigation) => {
				opened.push({ target, preserveNavigation });
				return options.creationFailed ? undefined : session;
			},
			openNewSession: async target => {
				openedWorkspace.push(target);
				return { session: options.creationFailed ? undefined : session, trustDeclined: false };
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
			openedWorkspace,
			calls,
			tools,
			sending: sending.p,
			get navigations() { return navigations; },
			run: async (args: INewSessionInAgentsWindowOptions) => instantiationService.invokeFunction(command.handler, args),
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

	test('launches a workspace migration in the requested harness with client tools registered before sending', async () => {
		const fixture = createCommand({ active: true, workspace: true });
		const result = await fixture.run({ agentHostProvider: 'copilotcli', prompt: '/migrate-customizations', sessionToolIds: ['migration-result'] });
		assert.deepStrictEqual({ result, opened: fixture.openedWorkspace, tools: fixture.tools, calls: fixture.calls }, {
			result: resource,
			opened: [{ folderUri, toSide: undefined, providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: 'copilotcli' }],
			tools: [{ resource, toolIds: ['migration-result'] }],
			calls: ['tools', 'send:/migrate-customizations'],
		});
	});

	test('does not expose client tools when only prefilling a prompt', async () => {
		const fixture = createCommand();
		await fixture.run({ noWorkspace: true, prompt: '/migrate-customizations', prefillPrompt: true, sessionToolIds: ['migration-result'] });
		assert.deepStrictEqual({ tools: fixture.tools, calls: fixture.calls }, { tools: [], calls: ['prefill:/migrate-customizations'] });
	});

	test('uses the initiating workspace instead of the main window workspace', async () => {
		const fixture = createCommand({ active: true, workspace: true });
		const initiatingFolder = URI.file('/initiating-workspace');
		await fixture.run({ folderUri: initiatingFolder, agentHostProvider: 'copilotcli', prompt: '/migrate-customizations' });
		assert.deepStrictEqual(fixture.openedWorkspace, [{
			folderUri: initiatingFolder,
			toSide: undefined,
			providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
			sessionTypeId: 'copilotcli',
		}]);
	});

	test('waits for delayed submission before returning the migration resource', async () => {
		const submission = new DeferredPromise<boolean>();
		const fixture = createCommand({ submission: submission.p });
		let returned = false;
		const result = fixture.run({ noWorkspace: true, prompt: '/migrate-customizations', sessionToolIds: ['migration-result'] }).then(resource => {
			returned = true;
			return resource;
		});
		await fixture.sending;
		const returnedBeforeSubmission = returned;
		await submission.complete(true);
		assert.deepStrictEqual({ returnedBeforeSubmission, result: await result, calls: fixture.calls }, {
			returnedBeforeSubmission: false,
			result: resource,
			calls: ['tools', 'send:/migrate-customizations'],
		});
	});

	test('clears reporting tools when submission is rejected', async () => {
		const fixture = createCommand({ submission: Promise.resolve(false) });
		await assert.rejects(async () => fixture.run({ noWorkspace: true, prompt: '/migrate-customizations', sessionToolIds: ['migration-result'] }), /Could not send the initial prompt/);
		assert.deepStrictEqual(fixture.calls, ['tools', 'send:/migrate-customizations', 'clear']);
	});

	test('clears session tools and surfaces a failure to send the prompt', async () => {
		const fixture = createCommand({ sendFailed: true });
		await assert.rejects(async () => fixture.run({ noWorkspace: true, prompt: '/migrate-customizations', sessionToolIds: ['migration-result'] }), /Send failed/);
		assert.deepStrictEqual(fixture.calls, ['tools', 'send:/migrate-customizations', 'clear']);
	});

	test('does not send a migration prompt when session creation fails', async () => {
		const fixture = createCommand({ active: true, workspace: true, creationFailed: true });
		await assert.rejects(async () => fixture.run({ agentHostProvider: 'copilotcli', prompt: '/migrate-customizations', sessionToolIds: ['migration-result'] }), /chat is unavailable/);
		assert.deepStrictEqual({ tools: fixture.tools, calls: fixture.calls }, { tools: [], calls: [] });
	});

	test('does not replace an unavailable workspace migration target with another harness', async () => {
		const fixture = createCommand({ active: true, workspace: true, available: false });
		await assert.rejects(async () => fixture.run({ agentHostProvider: 'copilotcli', prompt: '/migrate-customizations' }), /unavailable/);
		assert.deepStrictEqual(fixture.openedWorkspace, []);
	});

	test('keeps default target selection when there is no active session', async () => {
		const fixture = createCommand();
		await fixture.run({ noWorkspace: true });
		assert.deepStrictEqual(fixture.opened, [{ target: undefined, preserveNavigation: true }]);
	});

	test('uses the provider creation target instead of the active backend workspace', async () => {
		const instantiationService = store.add(new TestInstantiationService());
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
