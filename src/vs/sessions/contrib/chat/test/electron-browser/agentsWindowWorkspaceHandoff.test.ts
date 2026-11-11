/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowOpenSource, IAgentsWindowDraft } from '../../../../../platform/window/common/window.js';
import { LifecyclePhase, ShutdownReason } from '../../../../../workbench/services/lifecycle/common/lifecycle.js';
import { TestLifecycleService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISessionsWindowOpenContext, SessionsWindowOpenTelemetry } from '../../../sessions/browser/sessionsWindowOpenTelemetry.js';
import { AgentsWindowRequestActivity, SelectAgentsFolderContribution } from '../../electron-browser/chat.contribution.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ISession } from '../../../../../workbench/services/sessions/common/session.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentsWindowWorkspaceHandoff } from '../../browser/agentsWindowWorkspaceHandoff.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { AGENT_HOST_SCHEME } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { IOpenNewSessionOptions } from '../../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { SessionsManagementService } from '../../../../../workbench/contrib/sessions/browser/sessionsManagementService.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { IChatRequestAcceptedEvent, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { AgentHostEditorUpdate } from '../../../../../platform/chat/common/agentsWindowInvitation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { extUri } from '../../../../../base/common/resources.js';
import { remoteAgentHostSessionTypeId } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import { RemoteAgentHostHandoffResult } from '../../../../common/remoteWorkspaceHandoff.js';

const getSessionForResource = Reflect.get(SelectAgentsFolderContribution.prototype, 'getSessionForResource') as (
	chatResource: URI,
) => ISession | undefined;

const startWindowOpenTelemetry = Reflect.get(SelectAgentsFolderContribution.prototype, '_startWindowOpenTelemetry') as (
	source: AgentsWindowOpenSource,
	context: ISessionsWindowOpenContext,
) => SessionsWindowOpenTelemetry | undefined;

suite('Agents Window workspace handoff telemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports accepted Agents Window requests without editor status or usage initialization', async () => {
		const accepted = disposables.add(new Emitter<IChatRequestAcceptedEvent>());
		const updates: AgentHostEditorUpdate[] = [];
		disposables.add(new AgentsWindowRequestActivity(
			upcastPartial<IChatService>({ onDidAcceptRequest: accepted.event }),
			upcastPartial<INativeHostService>({ updateAgentHostEditorState: async update => { updates.push(update); } }),
			disposables.add(new TestLifecycleService()), new NullLogService(),
		));
		const resource = URI.parse('agent-host-copilotcli:/session');
		accepted.fire({ chatSessionResource: resource, isNewSession: false });
		accepted.fire({ chatSessionResource: URI.parse('vscode-local-chat:/session'), isNewSession: true });
		await timeout(0);
		assert.deepStrictEqual(updates, [{ kind: 'request', resource: resource.toJSON(), isNewSession: false }]);
	});

	test('resolves an additional chat to its containing session and opens that exact chat', async () => {
		const session = createTestSession('Session').session;
		const chatResource = session.mainChat.get().resource.with({ fragment: 'additional-chat' });
		const chat = { ...session.mainChat.get(), resource: chatResource };
		const management = {
			_getMergedSessions: () => [{ ...session, chats: { get: () => [session.mainChat.get(), chat] } }],
			uriIdentityService: { extUri },
			getSession: () => undefined,
			getSessionForChatResource: Reflect.get(SessionsManagementService.prototype, 'getSessionForChatResource') as (resource: URI) => { session: ISession } | undefined,
		};
		const opens: { resource: URI; chatResource?: URI }[] = [];
		const harness = {
			sessionsManagementService: management,
			getSessionForResource,
			waitForSessionAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionAvailable') as (resource: URI, token: CancellationToken) => Promise<boolean>,
			resolveAndOpenSession: Reflect.get(SelectAgentsFolderContribution.prototype, 'resolveAndOpenSession') as (resource: URI, token: CancellationToken) => Promise<void>,
			sessionsService: { openChat: async (session: ISession, chatResource: URI) => { opens.push({ resource: session.resource, chatResource }); } },
			logService: new NullLogService(),
		};
		await harness.resolveAndOpenSession(chatResource, CancellationToken.None);
		assert.deepStrictEqual({ parent: harness.getSessionForResource(chatResource)?.resource, opens }, {
			parent: session.resource, opens: [{ resource: session.resource, chatResource }],
		});
	});

	test('routes a typed draft without a workspace and preserves existing-session precedence', async () => {
		const draft: IAgentsWindowDraft = { inputText: 'Incoming', attachments: '[]' };
		const drafts: IAgentsWindowWorkspaceHandoff[] = [];
		const sessions: URI[] = [];
		const handleOpenIntent = Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
			this: typeof harness, folder: URI | undefined, session: URI | undefined,
			isDefault: boolean, token: CancellationToken, telemetry: undefined, draft: IAgentsWindowDraft, noWorkspace?: boolean, showNewSession?: boolean
		) => Promise<void>;
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const harness = {
			configurationService,
			_workspaceHandoff: { selectWorkspace: async (intent: IAgentsWindowWorkspaceHandoff) => { drafts.push(intent); } },
			openExistingSession: async (resource: URI) => { sessions.push(resource); },
		};
		await handleOpenIntent.call(harness, undefined, undefined, true, CancellationToken.None, undefined, draft);
		const persisted = URI.parse('agent-host-copilot:/persisted');
		await handleOpenIntent.call(harness, URI.file('/source'), persisted, false, CancellationToken.None, undefined, draft, false, true);
		assert.deepStrictEqual({ drafts, sessions }, {
			drafts: [{ folderUri: undefined, preferDevContainer: false, isDefault: true, draft, noWorkspace: false, revealNewSession: false }],
			sessions: [persisted],
		});
	});

	for (const cancelBeforeRestore of [false, true]) {
		test(`reveals the new-session composer after restore starts (cancelled: ${cancelBeforeRestore})`, async () => {
			const lifecycleService = disposables.add(new TestLifecycleService());
			lifecycleService.usePhases = true;
			const cancellation = disposables.add(new CancellationTokenSource());
			const events: string[] = [];
			const calls: { options: IOpenNewSessionOptions; usesHandoffToken: boolean }[] = [];
			const harness = {
				lifecycleService,
				newSessionComposerService: { notifyUserNavigation: () => events.push('navigation') },
				sessionsService: {
					openNewSession: async (options: IOpenNewSessionOptions, token: CancellationToken) => {
						events.push('newSession');
						calls.push({ options, usesHandoffToken: token === cancellation.token });
					},
				},
				_workspaceHandoff: { selectWorkspace: () => assert.fail('The invitation must preserve the pending draft, not select a workspace') },
				openExistingSession: () => assert.fail('A spotlight-only invitation must not open the invited chat'),
			};
			const handleOpenIntent = Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
				this: typeof harness, workspace: URI | undefined, session: URI | undefined, isDefault: boolean,
				token: CancellationToken, telemetry: undefined, draft: undefined, noWorkspace: boolean, showNewSession: boolean
			) => Promise<void>;
			const running = handleOpenIntent.call(harness, undefined, undefined, false, cancellation.token, undefined, undefined, false, true);
			await timeout(0);
			const beforeRestore = [...events];
			if (cancelBeforeRestore) {
				cancellation.cancel();
			} else {
				lifecycleService.phase = LifecyclePhase.Restored;
			}
			await running;
			assert.deepStrictEqual({ beforeRestore, events, calls }, {
				beforeRestore: [],
				events: cancelBeforeRestore ? [] : ['navigation', 'newSession'],
				calls: cancelBeforeRestore ? [] : [{ options: { cancelRestore: true }, usesHandoffToken: true }],
			});
		});
	}

	test('explicit new-session reveal retains workspace and draft intent', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const intents: IAgentsWindowWorkspaceHandoff[] = [];
		let navigations = 0;
		const harness = {
			configurationService,
			newSessionComposerService: { notifyUserNavigation: () => navigations++ },
			_workspaceHandoff: { selectWorkspace: async (intent: IAgentsWindowWorkspaceHandoff) => { intents.push(intent); } },
			handleOpenIntent: Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
				workspace: URI | undefined, session: URI | undefined, isDefault: boolean,
				token: CancellationToken, telemetry: undefined, draft: IAgentsWindowDraft | undefined, noWorkspace: boolean, showNewSession: boolean
			) => Promise<void>,
		};
		const folder = URI.file('/source');
		const draft = { inputText: 'Incoming', attachments: '[]' };
		await harness.handleOpenIntent(folder, undefined, true, CancellationToken.None, undefined, undefined, false, true);
		await harness.handleOpenIntent(undefined, undefined, false, CancellationToken.None, undefined, draft, false, true);
		assert.deepStrictEqual({ navigations, intents }, {
			navigations: 2,
			intents: [
				{ folderUri: folder, preferDevContainer: false, isDefault: true, draft: undefined, noWorkspace: false, revealNewSession: true },
				{ folderUri: undefined, preferDevContainer: false, isDefault: false, draft, noWorkspace: false, revealNewSession: true },
			],
		});
	});

	test('hands remote workspaces to the handoff instead of treating them as absent', async () => {
		const configurationService = new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: true });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const calls: IAgentsWindowWorkspaceHandoff[] = [];
		const harness = {
			configurationService,
			_workspaceHandoff: { selectWorkspace: async (intent: IAgentsWindowWorkspaceHandoff) => { calls.push(intent); } },
			openExistingSession: async () => assert.fail('A draft must not open an existing session'),
		};
		const handleOpenIntent = Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
			this: typeof harness, workspace: URI | undefined, session: URI | undefined, isDefault: boolean,
			token: CancellationToken, telemetry: undefined, draft?: IAgentsWindowDraft
		) => Promise<void>;
		const hostFolder = URI.file('/host/project');
		const remoteWorkspaces = [
			URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/project' }),
			URI.from({ scheme: Schemas.vscodeRemote, authority: 'tunnel+host', path: '/project' }),
			URI.from({ scheme: Schemas.vscodeRemote, authority: `dev-container+${encodeHex(VSBuffer.fromString('/host/project'))}@ssh-remote+host`, path: '/project' }),
			URI.from({ scheme: AGENT_HOST_SCHEME, authority: 'remote-host', path: '/project' }),
			URI.from({ scheme: 'unavailable-workspace', path: '/project' }),
		];
		const draft = { inputText: 'Work in the source project', attachments: '[]' };
		for (const workspace of remoteWorkspaces) {
			await handleOpenIntent.call(harness, workspace, undefined, false, CancellationToken.None, undefined, draft);
		}
		const localContainer = URI.from({ scheme: Schemas.vscodeRemote, authority: `dev-container+${encodeHex(VSBuffer.fromString(hostFolder.fsPath))}`, path: '/project' });
		await handleOpenIntent.call(harness, localContainer, undefined, false, CancellationToken.None, undefined, draft);
		await handleOpenIntent.call(harness, remoteWorkspaces[0], undefined, false, CancellationToken.None, undefined);
		await handleOpenIntent.call(harness, URI.from({ scheme: Schemas.vscodeRemote, authority: 'codespaces+name', path: '/workspaces/project' }), undefined, true, CancellationToken.None, undefined);
		const sshRemote = { kind: 'ssh', folder: { remoteAuthority: 'ssh-remote+host', path: '/project' } };
		assert.deepStrictEqual(calls.map(intent => ({
			folder: intent.folderUri?.toString(), remote: intent.remote, preferDevContainer: intent.preferDevContainer, isDefault: intent.isDefault, draft: intent.draft,
		})), [
			{ folder: remoteWorkspaces[0].toString(), remote: sshRemote, preferDevContainer: false, isDefault: false, draft },
			{ folder: remoteWorkspaces[1].toString(), remote: { kind: 'tunnel', folder: { remoteAuthority: 'tunnel+host', path: '/project' } }, preferDevContainer: false, isDefault: false, draft },
			{ folder: remoteWorkspaces[2].toString(), remote: { kind: 'ssh', folder: { remoteAuthority: 'ssh-remote+host', path: '/host/project' } }, preferDevContainer: true, isDefault: false, draft },
			{ folder: remoteWorkspaces[3].toString(), remote: undefined, preferDevContainer: false, isDefault: false, draft },
			{ folder: remoteWorkspaces[4].toString(), remote: undefined, preferDevContainer: false, isDefault: false, draft },
			{ folder: hostFolder.toString(), remote: undefined, preferDevContainer: true, isDefault: false, draft },
			{ folder: undefined, remote: sshRemote, preferDevContainer: false, isDefault: false, draft: undefined },
			{ folder: undefined, remote: { kind: 'codespaces', folder: undefined }, preferDevContainer: false, isDefault: true, draft: undefined },
		]);
	});

	test('opens sessions of a remote editor window\'s own agent host on its machine, or else its folder', async () => {
		const configurationService = new TestConfigurationService();
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		const sessions: { resource: string; remoteAuthority: string | undefined }[] = [];
		const folders: IAgentsWindowWorkspaceHandoff['remote'][] = [];
		const harness = {
			configurationService,
			logService: new NullLogService(),
			_workspaceHandoff: { selectWorkspace: async (intent: IAgentsWindowWorkspaceHandoff) => { folders.push(intent.remote); } },
			openExistingSession: async (resource: URI, _token: CancellationToken, remoteAuthority?: string) => {
				sessions.push({ resource: resource.toString(), remoteAuthority });
				return remoteAuthority?.startsWith('ssh-remote+') ? 'unsupported' as const : undefined;
			},
		};
		const handleOpenIntent = Reflect.get(SelectAgentsFolderContribution.prototype, 'handleOpenIntent') as (
			this: typeof harness, workspace: URI | undefined, session: URI | undefined, isDefault: boolean, token: CancellationToken, telemetry: undefined,
			draft: undefined, noWorkspace: boolean, showNewSession: boolean, revealRemoteAuthority: string | undefined
		) => Promise<void>;
		const tunnelFolder = URI.from({ scheme: Schemas.vscodeRemote, authority: 'tunnel+box', path: '/project' });
		const sshFolder = URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/project' });
		for (const [workspace, session, remoteAuthority] of [
			[tunnelFolder, 'agent-host-copilotcli:/session', 'tunnel+box'],
			[URI.file('/project'), 'agent-host-copilotcli:/session', undefined],
			[tunnelFolder, 'copilotcli:/session', 'tunnel+box'],
			[sshFolder, 'agent-host-copilotcli:/session', 'ssh-remote+host'],
			[undefined, 'agent-host-copilotcli:/session', 'ssh-remote+host'],
		] as const) {
			await handleOpenIntent.call(harness, workspace, URI.parse(session), false, CancellationToken.None, undefined, undefined, false, false, remoteAuthority);
		}
		assert.deepStrictEqual({ sessions, folders }, {
			sessions: [
				{ resource: 'agent-host-copilotcli:/session', remoteAuthority: 'tunnel+box' },
				{ resource: 'agent-host-copilotcli:/session', remoteAuthority: undefined },
				{ resource: 'copilotcli:/session', remoteAuthority: undefined },
				{ resource: 'agent-host-copilotcli:/session', remoteAuthority: 'ssh-remote+host' },
				{ resource: 'agent-host-copilotcli:/session', remoteAuthority: 'ssh-remote+host' },
			],
			folders: [{ kind: 'ssh', folder: { remoteAuthority: 'ssh-remote+host', path: '/project' } }],
		});
	});

	test('opens sessions of tunnel editor windows under this window\'s connection and silently falls back for other remotes', async () => {
		const sessionType = remoteAgentHostSessionTypeId('tunnel-box', 'copilotcli');
		const known = URI.parse(`${sessionType}:/known#chat`);
		const hosts: Record<string, RemoteAgentHostHandoffResult> = {
			'tunnel+box': { connectionAuthority: 'tunnel-box', connected: Promise.resolve(true), sharesEditorWindowAgentHost: () => true },
			'tunnel+editor': { connectionAuthority: 'tunnel-box', connected: Promise.resolve(true), sharesEditorWindowAgentHost: () => false },
			'tunnel+offline': { connectionAuthority: 'tunnel-offline', connected: Promise.resolve(false), sharesEditorWindowAgentHost: () => true },
			'tunnel+unknown': { unavailableReason: 'Tunnel \'unknown\' was not found for the signed-in accounts.' },
		};
		const resolved: string[] = [];
		const opened: string[] = [];
		const notifications: string[] = [];
		const results: ('unsupported' | undefined)[] = [];
		const harness = {
			resolveAndOpenRemoteSession: Reflect.get(SelectAgentsFolderContribution.prototype, 'resolveAndOpenRemoteSession') as (resource: URI, remoteAuthority: string, token: CancellationToken) => Promise<'unsupported' | undefined>,
			remoteWorkspaceHandoffService: { resolveHost: async (remoteAuthority: string) => { resolved.push(remoteAuthority); return hosts[remoteAuthority]; } },
			notificationService: { warn: (message: string) => { notifications.push(message); } },
			logService: new NullLogService(),
			// Another chat of the same session is focused.
			_focusedSessionHostService: { focusedHost: { get: () => ({ chatResource: { get: () => URI.parse(`${sessionType}:/known#focused`) } }) } },
			waitForSessionAvailable: async (resource: URI) => extUri.isEqual(resource, known),
			getSessionForResource: (resource: URI) => extUri.isEqual(resource, known) ? upcastPartial<ISession>({ resource: known }) : undefined,
			sessionsService: { openChat: async (_session: ISession, chatResource: URI) => { opened.push(chatResource.toString()); } },
		};
		for (const [remoteAuthority, resource] of [
			['tunnel+box', 'agent-host-copilotcli:/known#chat'],
			['tunnel+box', 'agent-host-copilotcli:/known#focused'],
			['tunnel+box', 'agent-host-copilotcli:/missing'],
			['tunnel+editor', 'agent-host-copilotcli:/known#chat'],
			['tunnel+offline', 'agent-host-copilotcli:/known#chat'],
			['tunnel+unknown', 'agent-host-copilotcli:/known#chat'],
			['ssh-remote+host', 'agent-host-copilotcli:/known#chat'],
		]) {
			results.push(await harness.resolveAndOpenRemoteSession(URI.parse(resource), remoteAuthority, CancellationToken.None));
		}
		assert.deepStrictEqual({ resolved, opened, notifications, results }, {
			resolved: ['tunnel+box', 'tunnel+box', 'tunnel+box', 'tunnel+editor', 'tunnel+offline', 'tunnel+unknown'],
			opened: [known.toString()],
			notifications: [
				'The session of your remote window could not be found on the remote agent host.',
				'The session of your remote window can\'t be opened in the Agents Window, because the Agents Window is connected to a different agent host on the tunnel\'s machine than your remote window.',
				'The session of your remote window could not be opened in the Agents Window. Tunnel \'unknown\' was not found for the signed-in accounts.',
			],
			results: [undefined, undefined, undefined, 'unsupported', undefined, undefined, 'unsupported'],
		});
	});

	test('later opening requests cannot change the initial opening context or handoff tracker', () => {
		const lifecycleService = disposables.add(new TestLifecycleService());
		const events: { name: string; data?: ITelemetryData }[] = [];
		const harness = {
			startWindowOpenTelemetry,
			_didHandleInitialWindowOpen: false,
			_windowOpenTelemetry: disposables.add(new MutableDisposable<SessionsWindowOpenTelemetry>()),
			_workspaceSelectionTelemetry: disposables.add(new MutableDisposable()),
			instantiationService: { createInstance: () => Disposable.None },
			storageService: disposables.add(new InMemoryStorageService()),
			telemetryService: upcastPartial<ITelemetryService>({ publicLog2: (name, data) => { events.push({ name, data }); } }),
			sessionsManagementService: { getSessions: () => [] },
			sessionsSetUpService: { initialSignInDialogShown: false },
			_getWindowOpenViewState: () => ({ workspacePreselected: false, workspacePreselectionSource: 'none', viewKind: 'noComposer' }),
			lifecycleService,
		};
		const initialTracker = harness.startWindowOpenTelemetry(AgentsWindowOpenSource.TitleBar, { workspaceArgumentKind: 'local', hasSessionArgument: false, workspaceArgumentIsDefault: true });
		initialTracker?.recordWorkspaceHandoffState('waitingForProvider');
		const subsequentTracker = harness.startWindowOpenTelemetry(AgentsWindowOpenSource.CommandPalette, { workspaceArgumentKind: 'none', hasSessionArgument: true });
		subsequentTracker?.recordWorkspaceHandoffState('applied');
		lifecycleService.fireShutdown(ShutdownReason.CLOSE);

		const data = events.find(event => event.name === 'agents/firstTimeWindowOpen')?.data;
		assert.deepStrictEqual({
			eventNames: events.map(event => event.name),
			hasInitialTracker: initialTracker !== undefined,
			hasSubsequentTracker: subsequentTracker !== undefined,
			source: data?.source,
			argument: data?.workspaceArgumentKind,
			isDefault: data?.workspaceArgumentIsDefault,
			hasSessionArgument: data?.hasSessionArgument,
			handoff: data?.workspaceHandoffStateAtEmission,
			nonArchivedSessionListCount: data?.nonArchivedSessionListCount,
		}, {
			eventNames: ['agents/windowSessionStart', 'agents/firstTimeWindowOpen'],
			hasInitialTracker: true,
			hasSubsequentTracker: false,
			source: 'titleBar',
			argument: 'local',
			isDefault: true,
			hasSessionArgument: false,
			handoff: 'waitingForProvider',
			nonArchivedSessionListCount: 0,
		});
	});

	test('a superseded existing-session lookup cannot navigate after a newer opening', async () => {
		const found = new DeferredPromise<boolean>();
		const cancellation = disposables.add(new CancellationTokenSource());
		let opened = false;
		const harness = {
			resolveAndOpenSession: Reflect.get(SelectAgentsFolderContribution.prototype, 'resolveAndOpenSession') as (resource: URI, token: CancellationTokenSource['token']) => Promise<void>,
			waitForSessionAvailable: () => found.p,
			sessionsService: { openSession: async () => { opened = true; } },
			logService: { info: () => { }, warn: () => { } },
		};
		const opening = harness.resolveAndOpenSession(URI.file('/private/session'), cancellation.token);
		cancellation.cancel();
		await found.complete(true);
		await opening;
		assert.strictEqual(opened, false);
	});

	for (const kind of ['session', 'link'] as const) {
		for (const alreadyCancelled of [false, true]) {
			test(`disposes ${kind} lookup listeners on ${alreadyCancelled ? 'immediate' : 'pending'} cancellation`, async () => {
				const changed = disposables.add(new Emitter<void>());
				const resolved = disposables.add(new Emitter<void>());
				const cancellation = disposables.add(new CancellationTokenSource());
				const harness = {
					waitForSessionAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionAvailable') as (resource: URI, token: CancellationToken) => Promise<boolean>,
					getSessionForResource,
					waitForSessionLinkAvailable: Reflect.get(SelectAgentsFolderContribution.prototype, 'waitForSessionLinkAvailable') as (resource: URI, token: CancellationToken) => Promise<ISession | undefined>,
					sessionsManagementService: { getSession: () => undefined, getSessionForChatResource: () => undefined, getSessions: () => [], onDidChangeSessions: changed.event },
					agentHostConnectionsService: { onDidChangeSessionResolution: resolved.event },
				};
				if (alreadyCancelled) {
					cancellation.cancel();
				}
				const resource = URI.parse('agent-host-copilot:/session');
				const opening = kind === 'link'
					? harness.waitForSessionLinkAvailable(resource, cancellation.token)
					: harness.waitForSessionAvailable(resource, cancellation.token);
				const listening = changed.hasListeners();
				cancellation.cancel();
				const result = await opening;
				assert.deepStrictEqual({ listening, result, listenersRemain: changed.hasListeners() || resolved.hasListeners() }, {
					listening: !alreadyCancelled, result: kind === 'link' ? undefined : false, listenersRemain: false,
				});
			});
		}
	}
});
