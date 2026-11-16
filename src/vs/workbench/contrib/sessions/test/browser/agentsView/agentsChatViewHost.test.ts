/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { INewSessionTarget } from '../../../browser/parts/chatView.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService, IWorkspaceFolder } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IChat, ISession, ISessionType } from '../../../../../services/sessions/common/session.js';
import { IChatWidget, IChatWidgetService } from '../../../../chat/browser/chat.js';
import { IChatModelReference, IChatService } from '../../../../chat/common/chatService/chatService.js';
import { IAgentsChatPartService } from '../../../browser/agentsView/agentsChatPart.js';
import { AgentsChatViewHost } from '../../../browser/agentsView/agentsChatViewHost.js';
import { IAgentsChatPartFrame } from '../../../browser/agentsView/agentsChatPartFrame.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../chat/browser/chatViewHost.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { IAgentsViewProvidersService } from '../../../browser/agentsView/agentsViewProviders.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAgentHostEnablementService } from '../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { SessionConfigSchema } from '../../../../../../platform/agentHost/common/state/protocol/channels-session/state.js';
import { IEditorGroupsService } from '../../../../../services/editor/common/editorGroupsService.js';
import { NewChatInWorktreeAction, NewChatWithoutWorkspaceAction } from '../../../../chat/browser/agentSessions/agentHost/agentHostNewChatActions.js';
import { AgentHostNewSessionFolderService, IAgentHostNewSessionFolderService } from '../../../../chat/browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { AgentHostUntitledProvisionalSessionService, IAgentHostUntitledProvisionalSessionService } from '../../../../chat/browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from '../../../../chat/browser/agentSessions/agentHost/agentHostImportConversationStore.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint, SessionType } from '../../../../chat/common/chatSessionsService.js';
import { ICustomizationHarnessService } from '../../../../chat/common/customizationHarnessService.js';
import { ILanguageModelToolsService } from '../../../../chat/common/tools/languageModelToolsService.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { extUri } from '../../../../../../base/common/resources.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection, IAgentHostService } from '../../../../../../platform/agentHost/common/agentService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IAgentHostActiveClientService } from '../../../../chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';

suite('AgentsChatViewHost', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface IHostOptions {
		readonly chatAvailable?: boolean;
		readonly chatPart?: Partial<IAgentsChatPartService>;
		readonly sessionsManagementService?: Partial<ISessionsManagementService>;
		readonly widgets?: IChatWidget[];
		readonly providersAcquired?: () => void;
		/** The chat part once created, as its frame has it: by default `chatPart`. */
		readonly content?: (chatPart: IAgentsChatPartService) => IObservable<IAgentsChatPartService | undefined>;
		readonly chatService?: Partial<IChatService>;
		readonly ownsNewChat?: boolean;
	}

	function createHost(options: IHostOptions = {}) {
		const calls: string[] = [];
		const composerWidget = upcastPartial<IChatWidget>({});
		const chatPart = upcastPartial<IAgentsChatPartService>({
			activeChat: constObservable(undefined),
			show: async (_target, showOptions) => { calls.push(`show preserveFocus=${showOptions?.preserveFocus}`); },
			openComposer: async (target, openOptions) => { calls.push(`openComposer ${target?.providerId ? `provider=${target.providerId} ` : ''}sessionType=${target?.sessionTypeId} newComposer=${openOptions?.newComposer}`); },
			getComposerWidget: async () => composerWidget,
			openChat: async (session, _chat, openOptions) => { calls.push(`openChat ${session.resource.toString()}${openOptions?.commit ? ' commit' : ''}`); },
			isShowing: () => false,
			...options.chatPart,
		});
		const content = options.content?.(chatPart) ?? constObservable(chatPart);
		const host = new AgentsChatViewHost(
			constObservable(options.ownsNewChat ?? true),
			chatPart,
			upcastPartial<ISessionsManagementService>({ getSessionForChatResource: () => undefined, getSession: () => undefined, getAllSessionTypes: () => [], getAllProviderSessionTypes: () => [], getSessions: () => [], getAllSessions: () => [], onDidChangeSession: () => toDisposable(() => { }), ...options.sessionsManagementService }),
			upcastPartial<IChatWidgetService>({ getAllWidgets: () => options.widgets ?? [] }),
			upcastPartial<IWorkbenchLayoutService>({ isVisible: () => false }),
			upcastPartial<IWorkspaceContextService>({ getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [] }) }),
			upcastPartial<IContextKeyService>({ contextMatchesRules: () => options.chatAvailable ?? true }),
			upcastPartial<IAgentsViewProvidersService>({
				acquire: () => {
					options.providersAcquired?.();
					calls.push('acquire');
					return toDisposable(() => calls.push('release'));
				},
			}),
			upcastPartial<IEditorService>({ activeEditor: undefined }),
			upcastPartial<IChatService>({
				acquireOrLoadSession: async resource => {
					calls.push(`hold ${resource.toString()}`);
					return upcastPartial<IChatModelReference>({ dispose: () => calls.push(`release ${resource.toString()}`) });
				},
				...options.chatService,
			}),
			upcastPartial<INotificationService>({ info: message => { calls.push(`info ${message}`); return undefined!; }, error: message => { calls.push(`error ${message}`); return undefined!; } }),
			upcastPartial<IAgentsChatPartFrame>({ content, contentCreated: derived(reader => !!content.read(reader)) }),
		);
		return { host, calls, composerWidget };
	}

	/** A session of `resource` whose chat the chat part shows with a widget. */
	function sessionOf(resource: URI) {
		const session = upcastPartial<ISession>({ resource });
		const owner = { session, chat: upcastPartial<IChat>({ resource }) };
		const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatWidget['viewModel'] & object>({ sessionResource: resource }) });
		return { owner, widget };
	}

	test('opening a session by its resource holds the providers before it looks the session up, as they may be released, until the chat part shows it', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		let registered = false;
		const lookups: boolean[] = [];
		const { host, calls } = createHost({
			// Its session is known only once the providers are registered
			sessionsManagementService: { getSessionForChatResource: () => { lookups.push(registered); return registered ? owner : undefined; } },
			widgets: [widget],
			providersAcquired: () => registered = true,
		});

		const opened = await host.openSession(chatResource);

		assert.deepStrictEqual({ opened: opened === widget, lookups, calls }, { opened: true, lookups: [true], calls: ['acquire', 'openChat agent-host-copilot:/session-1', 'release'] });
	});

	test('what would show the Chat view gets the widget of the composer it shows, whose submits create the session', async () => {
		const { host, calls, composerWidget } = createHost();

		const revealed = await host.reveal(true);
		const toggled = await host.toggle();

		assert.deepStrictEqual({ revealed: revealed === composerWidget, toggled, calls }, {
			revealed: true,
			toggled: true,
			calls: ['show preserveFocus=true', 'show preserveFocus=undefined'],
		});
	});

	test('reveals only a session that the chat part shows', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const showing = createHost({ chatPart: { isShowing: () => true }, sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });
		const notShowing = createHost({ sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });

		assert.deepStrictEqual({
			showing: await showing.host.revealIfShowing(chatResource) === widget,
			notShowing: await notShowing.host.revealIfShowing(chatResource),
			notShowingCalls: notShowing.calls,
		}, { showing: true, notShowing: undefined, notShowingCalls: [] });
	});

	test('shows nothing while chat is hidden or disabled, such as with AI features off', async () => {
		const { host, calls } = createHost({ chatAvailable: false });

		const results = [await host.reveal(), await host.openSession(URI.parse('test:/chat')), await host.toggle()];

		assert.deepStrictEqual({ results, calls }, { results: [undefined, undefined, false], calls: [] });
	});

	test('a started session that runs shows in the chat part, its model held until the start ends: as committed when its first request made it, as opened when it was given', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const real = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(real);
		const { host, calls } = createHost({ sessionsManagementService: { getSessionForChatResource: () => owner }, widgets: [widget] });

		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		await start.moved(real);
		const shown = await start.complete(real, true);
		start.dispose();
		const made = calls.splice(0);
		const given = await host.startSession(real, { local: false, importingConversation: false });
		await given.complete(real, true);
		given.dispose();

		assert.deepStrictEqual({ shown, made, given: calls }, {
			shown: true,
			made: ['hold agent-host-copilot:/untitled-1', 'acquire', 'openChat agent-host-copilot:/session-1 commit', 'release', 'release agent-host-copilot:/untitled-1'],
			given: ['hold agent-host-copilot:/session-1', 'acquire', 'openChat agent-host-copilot:/session-1', 'release', 'release agent-host-copilot:/session-1'],
		});
	});

	test('a new session that did not run is not shown: a composer of its provider\'s type shows instead, which gets the request back', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const { host, calls, composerWidget } = createHost({
			// The provider's type of these chats differs from their chat session type, as an agent host's does
			sessionsManagementService: { getAllProviderSessionTypes: () => [{ providerId: 'local-agent-host', sessionType: upcastPartial<ISessionType>({ id: 'claude', chatSessionType: 'agent-host-claude' }) }, { providerId: 'local-agent-host', sessionType: upcastPartial<ISessionType>({ id: 'copilot', chatSessionType: 'agent-host-copilot' }) }] },
		});

		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		const shown = await start.complete(untitled, false);
		const composer = await start.createComposer();
		start.dispose();

		assert.deepStrictEqual({ shown, composer: composer === composerWidget, calls }, {
			shown: false,
			composer: true,
			calls: ['hold agent-host-copilot:/untitled-1', 'openComposer provider=local-agent-host sessionType=copilot newComposer=true', 'release agent-host-copilot:/untitled-1'],
		});
	});

	test('completing a session that did not run waits for its composer to show, and fails as showing it fails', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const opening = new DeferredPromise<void>();
		const { host } = createHost({ chatPart: { openComposer: () => opening.p } });

		const start = await host.startSession(untitled, { local: false, importingConversation: false });
		let settled = false;
		const completed = start.complete(untitled, false).finally(() => settled = true);
		await timeout(0);
		const pendingWhileShowing = !settled;
		opening.error(new Error('no composer'));
		const error = await completed.then(() => undefined, (e: Error) => e.message);
		start.dispose();

		assert.deepStrictEqual({ pendingWhileShowing, error }, { pendingWhileShowing: true, error: 'no composer' });
	});

	test('does not start local chat, which the chat part does not show', async () => {
		const { host, calls } = createHost();

		const error = await host.startSession(URI.parse('vscode-chat-session://local/1'), { local: true, importingConversation: false }).then(() => undefined, e => e);

		assert.deepStrictEqual({ cancelled: isCancellationError(error), calls }, {
			cancelled: true,
			calls: ['info Local chat sessions are not available while chats open in the chat area.'],
		});
	});

	test('opens a session as restored or committed when asked to, so that it does not report it as opened', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const opened: string[] = [];
		const { host } = createHost({
			chatPart: { openChat: async (_session, _chat, openOptions) => { opened.push(`restore=${openOptions?.restore} commit=${openOptions?.commit}`); } },
			sessionsManagementService: { getSessionForChatResource: () => owner },
			widgets: [widget],
		});

		await host.openSession(chatResource, { restore: true });
		await host.openSession(chatResource, { commit: true });
		await host.openSession(chatResource);

		assert.deepStrictEqual(opened, ['restore=true commit=undefined', 'restore=undefined commit=true', 'restore=undefined commit=undefined']);
	});

	test('deactivated while it loads the session it starts, it releases the session and starts nothing', async () => {
		const load = new DeferredPromise<void>();
		const calls: string[] = [];
		const { host, calls: hostCalls } = createHost({ chatService: { acquireOrLoadSession: async () => { await load.p; return upcastPartial<IChatModelReference>({ dispose: () => calls.push('release model') }); } } });

		const starting = host.startSession(URI.parse('agent-host-copilot:/untitled-1'), { local: false, importingConversation: false });
		host.deactivate();
		load.complete();
		let cancelled = false;
		try {
			await starting;
		} catch (error) {
			cancelled = isCancellationError(error);
		}

		assert.deepStrictEqual({ cancelled, calls: [...hostCalls, ...calls] }, { cancelled: true, calls: ['release model'] });
	});

	test('deactivated while it looks up the session it started, it shows neither the session nor a composer', async () => {
		const lookup = new DeferredPromise<void>();
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner } = sessionOf(chatResource);
		const { host, calls } = createHost({
			sessionsManagementService: {
				getSessionForChatResource: () => lookup.isSettled ? owner : undefined,
				onDidChangeSession: listener => { void lookup.p.then(() => listener([])); return toDisposable(() => { }); },
			},
		});

		const start = await host.startSession(URI.parse('agent-host-copilot:/untitled-1'), { local: false, importingConversation: false });
		const completing = start.complete(chatResource, true);
		host.deactivate();
		lookup.complete();
		const shown = await completing;
		const composer = await start.createComposer();
		start.dispose();

		assert.deepStrictEqual({ shown, composer, calls }, { shown: false, composer: undefined, calls: ['hold agent-host-copilot:/untitled-1', 'acquire', 'release', 'release agent-host-copilot:/untitled-1'] });
	});

	test('deactivated while it looks a session up, it does not open the chat part', async () => {
		const chatResource = URI.parse('agent-host-copilot:/session-1');
		const { owner, widget } = sessionOf(chatResource);
		const lookup = new DeferredPromise<void>();
		const { host, calls } = createHost({
			sessionsManagementService: {
				getSessionForChatResource: () => lookup.isSettled ? owner : undefined,
				onDidChangeSession: listener => { void lookup.p.then(() => listener([])); return toDisposable(() => { }); },
			},
			widgets: [widget],
		});

		const opening = host.openSession(chatResource);
		host.deactivate();
		lookup.complete();

		assert.deepStrictEqual({ opened: await opening, calls }, { opened: undefined, calls: ['acquire', 'release'] });
	});

	test('shows the chats of the window\'s sessions and of the types its providers offer, and leaves other chats, such as local chat, to the Chat view', () => {
		const knownChat = URI.parse('known-chat:/chat-1');
		const knownSession = URI.parse('known-session:/session-1');
		const { host } = createHost({
			sessionsManagementService: {
				getSessionForChatResource: resource => resource.toString() === knownChat.toString() ? sessionOf(knownChat).owner : undefined,
				getSession: resource => resource.toString() === knownSession.toString() ? sessionOf(knownSession).owner.session : undefined,
				getAllSessionTypes: () => [upcastPartial<ISessionType>({ id: 'copilot-cloud', chatSessionType: 'copilot-cloud-agent' }), upcastPartial<ISessionType>({ id: 'local' })],
			},
		});

		assert.deepStrictEqual({
			agentHost: host.canShow(URI.parse('agent-host-copilot:/session-1')),
			knownChat: host.canShow(knownChat),
			knownSession: host.canShow(knownSession),
			untitledOfOfferedType: host.canShow(URI.parse('copilot-cloud-agent:/untitled-1')),
			local: host.canShow(LocalChatSessionUri.forSession('local-1')),
			extension: host.canShow(URI.parse('some-extension-chat:/session-1')),
		}, { agentHost: true, knownChat: true, knownSession: true, untitledOfOfferedType: true, local: false, extension: false });
	});

	test('New Chat opens a new-session composer in the chat part, unless chat is hidden or disabled, or the Chat view keeps its New Chat', async () => {
		const available = createHost();
		const unavailable = createHost({ chatAvailable: false });
		const notOwned = createHost({ ownsNewChat: false });

		assert.deepStrictEqual({
			available: await available.host.newChat(), availableCalls: available.calls,
			unavailable: await unavailable.host.newChat(), unavailableCalls: unavailable.calls,
			notOwned: await notOwned.host.newChat(), notOwnedCalls: notOwned.calls,
		}, {
			available: true, availableCalls: ['openComposer sessionType=undefined newComposer=true'],
			unavailable: false, unavailableCalls: [],
			notOwned: false, notOwnedCalls: [],
		});
	});

	test('New Chat aims its composer at a new worktree of a folder, or at no workspace, and refuses a placement it cannot have', async () => {
		const folder = URI.file('/repo');
		const targets: (INewSessionTarget | undefined)[] = [];
		const { host } = createHost({ chatPart: { openComposer: async target => { targets.push(target); } } });

		const results = [
			await host.newChat({ folder, placement: 'worktree' }),
			await host.newChat({ placement: 'noWorkspace' }),
			await host.newChat({ placement: 'worktree' }),
			await host.newChat({ folder, placement: 'noWorkspace' }),
		];

		assert.deepStrictEqual({ results, targets: targets.map(target => ({ folder: target?.folderUri?.path, placement: target?.placement })) }, {
			results: [true, true, false, false],
			targets: [{ folder: '/repo', placement: 'worktree' }, { folder: undefined, placement: undefined }],
		});
	});

	test('a session started for a new worktree that did not run shows a composer aimed at that worktree; one it cannot have starts nothing', async () => {
		const untitled = URI.parse('agent-host-copilot:/untitled-1');
		const folder = URI.file('/repo');
		const targets: (INewSessionTarget | undefined)[] = [];
		const { host, calls } = createHost({ chatPart: { openComposer: async target => { targets.push(target); } } });

		const start = await host.startSession(untitled, { local: false, importingConversation: false, target: { folder, placement: 'worktree' } });
		await start.complete(untitled, false);
		start.dispose();
		const refused = await host.startSession(untitled, { local: false, importingConversation: false, target: { placement: 'worktree' } }).then(() => false, error => isCancellationError(error));

		assert.deepStrictEqual({ refused, targets: targets.map(target => ({ folder: target?.folderUri?.path, placement: target?.placement })), errors: calls.filter(call => call.startsWith('error')).length }, {
			refused: true,
			targets: [{ folder: '/repo', placement: 'worktree' }],
			errors: 1,
		});
	});

	test('New Chat in Worktree and New Chat (No Workspace) of the Chat view start a composer here aimed at their placement: a new worktree of the prepared folder, or no workspace', async () => {
		const folder = URI.file('/repo');
		const run = async (action: NewChatInWorktreeAction | NewChatWithoutWorkspaceAction, preparedFolder: URI | undefined) => {
			const targets: (INewSessionTarget | undefined)[] = [];
			const { host, calls } = createHost({ chatPart: { openComposer: async target => { targets.push(target); } } });
			const steps: string[] = [];
			const instantiationService = store.add(new TestInstantiationService());
			instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ warn: () => { steps.push('warn'); return undefined!; } }));
			instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
			instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(true) }));
			instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({
				setNewWorktree: () => { },
				setNoWorkspace: () => { },
				resolveNewSessionPrimary: () => preparedFolder,
				clear: () => { steps.push('clear'); },
			}));
			// A configuration, prepared in the folder, that offers the new worktree the entry seeds
			instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
				getPreparedSessionConfig: () => ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } } as SessionConfigSchema, values: { isolation: 'worktree' } }),
				releaseSession: () => { steps.push('release'); },
			}));
			instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ startSession: (resource, options) => host.startSession(resource, options) }));
			instantiationService.stub(ILogService, upcastPartial<ILogService>({ error: () => { } }));
			instantiationService.stub(IChatService, {});
			instantiationService.stub(IEditorGroupsService, {});
			instantiationService.stub(IEditorService, {});
			instantiationService.stub(ICustomizationHarnessService, {});
			instantiationService.stub(ILanguageModelToolsService, {});
			instantiationService.stub(IAgentHostImportConversationStore, {});
			const opened = await instantiationService.invokeFunction(accessor => action.run(accessor));
			return {
				opened: !!opened,
				targets: targets.map(target => ({ folder: target?.folderUri?.path, placement: target?.placement })),
				errors: calls.filter(call => call.startsWith('error')).length,
				cleanup: steps,
			};
		};

		assert.deepStrictEqual({
			worktree: await run(new NewChatInWorktreeAction(), folder),
			noWorkspace: await run(new NewChatWithoutWorkspaceAction(), undefined),
			worktreeWithoutFolder: await run(new NewChatInWorktreeAction(), undefined),
		}, {
			worktree: { opened: true, targets: [{ folder: '/repo', placement: 'worktree' }], errors: 0, cleanup: [] },
			noWorkspace: { opened: true, targets: [{ folder: undefined, placement: undefined }], errors: 0, cleanup: [] },
			// No folder to make a worktree of: it starts nothing, and forgets the new chat
			worktreeWithoutFolder: { opened: false, targets: [], errors: 1, cleanup: ['clear', 'release'] },
		});
	});

	test('with the chat area on, New Chat in Worktree and New Chat (No Workspace) start through the real folder and provisional services, and the chat they prepared is forgotten once the host releases its model', async () => {
		const folder = URI.file('/repo');
		const onDidDisposeSession = store.add(new Emitter<{ readonly sessionResources: readonly URI[]; readonly reason: 'cleared' | 'disposed' }>());
		// As the chat service does: the session goes once the last reference to its model goes
		const chatService = upcastPartial<IChatService>({
			onDidDisposeSession: onDidDisposeSession.event,
			onDidCreateModel: Event.None,
			acquireOrLoadSession: async resource => upcastPartial<IChatModelReference>({ dispose: () => onDidDisposeSession.fire({ sessionResources: [resource], reason: 'disposed' }) }),
		});
		const resolution = (resource: URI) => ({
			connection: upcastPartial<IAgentConnection>({ resolveSessionConfig: async () => ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } } as SessionConfigSchema, values: { isolation: 'worktree' } }) }),
			connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY,
			backendSession: resource.with({ scheme: 'copilotcli' }),
		});
		const connections = new ResourceMap<ReturnType<typeof resolution>>();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatService, chatService);
		instantiationService.stub(IAgentHostService, upcastPartial<IAgentHostService>({ rootState: upcastPartial<IAgentHostService['rootState']>({ onDidChange: Event.None }), onAgentHostStart: Event.None }));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: Event.None,
			// The same connection for a session each time, as the provisional service checks it is still current
			resolveSessionResource: resource => {
				let resolved = connections.get(resource);
				if (!resolved) {
					resolved = resolution(resource);
					connections.set(resource, resolved);
				}
				return resolved;
			},
		}));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			onDidChangeWorkspaceFolders: Event.None,
			getWorkspace: () => upcastPartial<ReturnType<IWorkspaceContextService['getWorkspace']>>({ folders: [upcastPartial<IWorkspaceFolder>({ uri: folder })] }),
		}));
		instantiationService.stub(IWorkspaceTrustManagementService, upcastPartial<IWorkspaceTrustManagementService>({
			onDidChangeTrust: Event.None,
			onDidChangeTrustedFolders: Event.None,
			isWorkspaceTrusted: () => true,
			getUriTrustInfo: async uri => ({ uri, trusted: true }),
		}));
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(IAgentHostImportConversationStore, new AgentHostImportConversationStore());
		instantiationService.stub(IAgentHostActiveClientService, upcastPartial<IAgentHostActiveClientService>({}));
		const folderService = store.add(instantiationService.createInstance(AgentHostNewSessionFolderService));
		instantiationService.stub(IAgentHostNewSessionFolderService, folderService);
		const provisional = store.add(instantiationService.createInstance(AgentHostUntitledProvisionalSessionService));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, provisional);

		interface IProvisionalMaps { readonly [name: string]: ResourceMap<unknown> }
		const maps = provisional as unknown as IProvisionalMaps;
		const retained = (resource: URI) => ({
			seeded: folderService.isNewWorktree(resource) || folderService.isNoWorkspace(resource),
			maps: ['_preparedConfigs', '_resolvedConfigs', '_resolvedConfigRequestSeq', '_resolvedConfigConnections', '_sessionCreationMetadata'].filter(name => maps[name].has(resource)),
		});
		let started: URI | undefined;
		const composers: unknown[] = [];
		const { host, calls } = createHost({
			chatService,
			chatPart: {
				openComposer: async target => {
					// What the new chat holds while the composer aimed at it shows, before the host releases its model
					composers.push({ folder: target?.folderUri?.path, placement: target?.placement, ...retained(started!) });
				},
			},
		});
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({ startSession: (resource, options) => { started = resource; return host.startSession(resource, options); } }));
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ getChatSessionContribution: () => upcastPartial<ResolvedChatSessionsExtensionPoint>({ type: SessionType.AgentHostCopilot, displayName: 'Copilot' }) }));
		instantiationService.stub(IAgentHostEnablementService, upcastPartial<IAgentHostEnablementService>({ enabled: constObservable(true) }));
		instantiationService.stub(IEditorGroupsService, {});
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(ICustomizationHarnessService, {});
		instantiationService.stub(ILanguageModelToolsService, {});
		const run = async (action: NewChatInWorktreeAction | NewChatWithoutWorkspaceAction) => {
			const opened = await instantiationService.invokeFunction(accessor => action.run(accessor));
			return { opened: !!opened, afterRelease: retained(started!) };
		};

		const results = { worktree: await run(new NewChatInWorktreeAction()), noWorkspace: await run(new NewChatWithoutWorkspaceAction()) };

		assert.deepStrictEqual({ results, composers, errors: calls.filter(call => call.startsWith('error')).length }, {
			results: {
				worktree: { opened: true, afterRelease: { seeded: false, maps: [] } },
				noWorkspace: { opened: true, afterRelease: { seeded: false, maps: [] } },
			},
			composers: [
				{ folder: '/repo', placement: 'worktree', seeded: true, maps: ['_preparedConfigs', '_resolvedConfigConnections'] },
				{ folder: undefined, placement: undefined, seeded: true, maps: [] },
			],
			errors: 0,
		});
	});

	test('New Chat resolves only once its composer shows, so that a prompt run in a new chat goes to it, not to the chat shown before', async () => {
		const opening = new DeferredPromise<void>();
		const steps: string[] = [];
		const { host } = createHost({ chatPart: { openComposer: async () => { await opening.p; steps.push('composer shows'); } } });

		const newChat = host.newChat().then(taken => steps.push(`New Chat resolves ${taken}`));
		await timeout(0);
		steps.push('composer opening');
		opening.complete();
		await newChat;

		assert.deepStrictEqual(steps, ['composer opening', 'composer shows', 'New Chat resolves true']);
	});

	test('reports the chat of the chat part\'s active tab only once the chat part exists, without creating it', () => {
		const content = observableValue<IAgentsChatPartService | undefined>('content', undefined);
		const shown: IChatViewHostShownSession = { resource: URI.parse('agent-host-copilot:/session-1'), reason: 'restore' };
		const read: string[] = [];
		let created: IAgentsChatPartService | undefined;
		const { host } = createHost({ content: chatPart => { created = chatPart; return content; }, chatPart: { get shownSession() { read.push('shownSession'); return constObservable(shown); } } });

		const before = host.shownSession.get();
		content.set(created, undefined);

		assert.deepStrictEqual({ before, after: host.shownSession.get(), read }, { before: undefined, after: shown, read: ['shownSession'] });
	});
});
