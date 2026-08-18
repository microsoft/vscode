/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { ChatModeKind, ChatPermissionLevel } from '../../../../../workbench/contrib/chat/common/constants.js';
import { IChatSessionHistoryItem, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { TestFileService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { ISessionsProvidersChangeEvent, ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IChat, ISession, SessionStatus, ChatInteractivity, ISessionWorkspace, ISessionWorkspaceBrowseAction, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from '../../../../services/sessions/common/session.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { OmniSessionRoutingAdapter } from '../../browser/omniSessionRoutingAdapter.contribution.js';

suite('OmniSessionRoutingAdapter', () => {

	const store = new DisposableStore();
	let managementService: TestSessionsManagementService;
	let providersService: TestSessionsProvidersService;
	let recentWorkspacesService: TestRecentWorkspacesService;
	let opened: URI[];
	let adapter: OmniSessionRoutingAdapter;
	let selectedLocalFolder: URI[] | undefined;
	let history: readonly IChatSessionHistoryItem[];

	setup(() => {
		managementService = store.add(new TestSessionsManagementService());
		providersService = store.add(new TestSessionsProvidersService());
		recentWorkspacesService = store.add(new TestRecentWorkspacesService());
		providersService.setProviders([createProvider('provider', { supportsLocalWorkspaces: true })]);
		opened = [];
		selectedLocalFolder = undefined;
		history = [];
		const fileService = store.add(new TestFileService());
		adapter = store.add(new OmniSessionRoutingAdapter(
			managementService,
			upcastPartial<ISessionsService>({
				openSession: async resource => { opened.push(resource); },
			}),
			upcastPartial<IChatSessionsService>({
				getChatSessionHistory: async () => history,
			}),
			providersService,
			recentWorkspacesService,
			new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }),
			upcastPartial<IFileDialogService>({
				showOpenDialog: async () => selectedLocalFolder,
			}),
			fileService,
			store.add(new UriIdentityService(fileService)),
			upcastPartial<ILogService>({
				error: () => { },
			}),
			upcastPartial<INotificationService>({
				error: () => undefined!,
			}),
		));
	});

	teardown(() => store.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('aggregates provider-neutral sessions and filters drafts, archived, and non-routable chats', () => {
		managementService.sessions = [
			createSession('provider-a:one', { providerId: 'provider-a', title: 'One', description: 'First session', repository: 'vscode', status: SessionStatus.InProgress }),
			createSession('provider-b:two', { providerId: 'provider-b', title: 'Two', status: SessionStatus.Completed }),
			createSession('provider-a:draft', { status: SessionStatus.Untitled }),
			createSession('provider-a:archived', { archived: true }),
			createSession('provider-a:readonly', { interactivity: ChatInteractivity.ReadOnly }),
		];

		assert.deepStrictEqual(adapter.getCandidateSessions(CancellationToken.None), [
			{
				sessionId: 'provider-a:one',
				resource: URI.from({ scheme: 'session', path: '/provider-a:one' }),
				label: 'One',
				repo: 'microsoft/vscode',
				cwd: '/work/vscode',
				status: 'working',
				lastActivity: Date.parse('2026-08-13T12:00:00Z'),
				description: 'First session',
			},
			{
				sessionId: 'provider-b:two',
				resource: URI.from({ scheme: 'session', path: '/provider-b:two' }),
				label: 'Two',
				repo: 'microsoft/repo',
				cwd: '/work/repo',
				status: 'idle',
				lastActivity: Date.parse('2026-08-13T12:00:00Z'),
				description: undefined,
			},
		]);
	});

	test('refreshes on lifecycle changes and rejects a removed provider session', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		managementService.fireSessionsChanged({ added: [session], removed: [], changed: [] });
		assert.deepStrictEqual(adapter.getCandidateSessions(CancellationToken.None).map(candidate => ({
			sessionId: candidate.sessionId,
			resource: candidate.resource?.toString(),
		})), [{
			sessionId: 'provider:session',
			resource: session.resource.toString(),
		}]);
		assert.strictEqual(adapter.resolveSessionResource(session.sessionId)?.toString(), session.mainChat.get().resource.toString());

		managementService.sessions = [];
		managementService.fireSessionsChanged({ added: [], removed: [session], changed: [] });

		assert.deepStrictEqual({
			candidates: adapter.getCandidateSessions(CancellationToken.None),
			dispatch: await adapter.dispatchToSession(session.sessionId, 'Continue', {}, CancellationToken.None),
		}, {
			candidates: [],
			dispatch: {
				status: 'rejected',
				reasonCode: 'providerRemoved',
				reason: 'The selected session is no longer available.',
			},
		});
	});

	test('publishes live title, status, and response snapshots', async () => {
		const title = observableValue('title', 'New session');
		const status = observableValue('status', SessionStatus.InProgress);
		const original = {
			...createSession('provider:session', { title: 'New session', status: SessionStatus.InProgress }),
			title,
			status,
		};
		managementService.sessions = [original];
		history = [{
			type: 'response',
			parts: [
				{ kind: 'markdownContent', content: { value: 'Renaming this session to match your request, then I will make the change.' } },
				{ kind: 'markdownContent', content: { value: 'Implemented the requested change.' } },
			],
			participant: 'assistant',
		}];
		let changeCount = 0;
		store.add(adapter.onDidChangeSessions(() => changeCount++));
		let watchedCount = 0;
		store.add(adapter.watchSession(original.resource, () => watchedCount++));

		title.set('Update routing badge', undefined);
		status.set(SessionStatus.Completed, undefined);
		const snapshot = await adapter.getSessionSnapshot(original.resource, CancellationToken.None);

		assert.deepStrictEqual({ changeCount, watchedCount, snapshot }, {
			changeCount: 0,
			watchedCount: 3,
			snapshot: {
				sessionId: 'provider:session',
				resource: original.resource,
				label: 'Update routing badge',
				repo: 'microsoft/repo',
				cwd: '/work/repo',
				status: 'idle',
				lastActivity: Date.parse('2026-08-13T12:00:00Z'),
				description: undefined,
				lastResponse: 'Implemented the requested change.',
			},
		});
	});

	test('follows a new session from its provisional resource to the committed session', async () => {
		const provisional = createSession('provider:provisional', { title: 'New session', status: SessionStatus.InProgress });
		const committed = createSession('provider:committed', { title: 'Adding repository README', status: SessionStatus.Completed });
		managementService.sessions = [provisional];
		history = [{
			type: 'response',
			parts: [{ kind: 'markdownContent', content: { value: 'Added the repository README.' } }],
			participant: 'assistant',
		}];
		let watchedCount = 0;
		store.add(adapter.watchSession(provisional.mainChat.get().resource, () => watchedCount++));

		managementService.fireSessionReplaced(provisional, committed);
		const snapshot = await adapter.getSessionSnapshot(provisional.mainChat.get().resource, CancellationToken.None);
		await adapter.revealSession(provisional.mainChat.get().resource);

		assert.deepStrictEqual({
			watchedCount,
			label: snapshot?.label,
			status: snapshot?.status,
			lastResponse: snapshot?.lastResponse,
			opened: opened.map(resource => resource.toString()),
		}, {
			watchedCount: 2,
			label: 'Adding repository README',
			status: 'idle',
			lastResponse: 'Added the repository README.',
			opened: [committed.resource.toString()],
		});
	});

	test('publishes canonical grouped recents, browse actions, and restored provider selection', async () => {
		const shared = URI.file('/work/shared');
		const local = createProvider('local', { supportsLocalWorkspaces: true, group: SESSION_WORKSPACE_GROUP_LOCAL });
		const github = createProvider('github', {
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			browseActions: [createBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, workspace(shared, 'GitHub shared', SESSION_WORKSPACE_GROUP_GITHUB))],
		});
		const remote = createProvider('remote', {
			group: SESSION_WORKSPACE_GROUP_REMOTE,
			browseActions: [createBrowseAction('remote', SESSION_WORKSPACE_GROUP_REMOTE, undefined)],
		});
		providersService.setProviders([local, github, remote]);
		recentWorkspacesService.recents = [
			recent(workspace(shared, 'GitHub shared', SESSION_WORKSPACE_GROUP_GITHUB), 'github', true),
			recent(workspace(URI.file('/work/local'), 'Local repo', SESSION_WORKSPACE_GROUP_LOCAL), 'local', false),
		];
		recentWorkspacesService.ownRecents = [recentWorkspacesService.recents[0]];

		const catalog = await adapter.getNewSessionWorkspaceCatalog();

		assert.deepStrictEqual({
			groups: catalog.groups.map(group => group.id),
			workspaces: catalog.workspaces.map(entry => [entry.label, entry.providerId, entry.group]),
			browseActions: catalog.browseActions.map(action => [action.id, action.providerId, action.group, action.label]),
			defaultWorkspace: catalog.defaultWorkspace && [catalog.defaultWorkspace.label, catalog.defaultWorkspace.providerId],
		}, {
			groups: [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_REMOTE],
			workspaces: [
				['GitHub shared', 'github', SESSION_WORKSPACE_GROUP_GITHUB],
				['Local repo', 'local', SESSION_WORKSPACE_GROUP_LOCAL],
			],
			browseActions: [
				['local', undefined, SESSION_WORKSPACE_GROUP_LOCAL, 'Select...'],
				['provider:github:0', 'github', SESSION_WORKSPACE_GROUP_GITHUB, 'Select...'],
				['provider:remote:0', 'remote', SESSION_WORKSPACE_GROUP_REMOTE, 'Select...'],
			],
			defaultWorkspace: ['GitHub shared', 'github'],
		});
	});

	test('falls back to the most frequent recent session workspace when no workspace is checked', async () => {
		const first = createSession('provider:first', { repository: 'frequent' });
		const second = createSession('provider:second', { repository: 'other' });
		const third = createSession('provider:third', { repository: 'frequent' });
		providersService.setProviders([createProvider('provider', {
			supportsLocalWorkspaces: true,
			sessions: [first, second, third],
		})]);

		const catalog = await adapter.getNewSessionWorkspaceCatalog();

		assert.deepStrictEqual(
			catalog.defaultWorkspace && [catalog.defaultWorkspace.label, catalog.defaultWorkspace.providerId, catalog.defaultWorkspace.uri.toString()],
			['frequent', 'provider', URI.file('/work/frequent').toString()]
		);
	});

	test('refreshes workspace catalog lifecycle and persists exact provider selections', () => {
		let changes = 0;
		store.add(adapter.onDidChangeNewSessionWorkspaceCatalog(() => changes++));
		const selected = workspace(URI.file('/work/shared'), 'Shared', SESSION_WORKSPACE_GROUP_GITHUB);
		const github = createProvider('github', { group: SESSION_WORKSPACE_GROUP_GITHUB });
		providersService.setProviders([github]);
		recentWorkspacesService.fireChanged();

		adapter.selectNewSessionWorkspace({
			uri: selected.folders[0].root,
			providerId: 'github',
			group: selected.group,
			label: selected.label,
			icon: selected.icon,
		});

		assert.deepStrictEqual({
			changes,
			added: recentWorkspacesService.added.map(entry => [entry.uri.toString(), entry.providerId, entry.checked]),
		}, {
			changes: 3,
			added: [[selected.folders[0].root.toString(), 'github', true]],
		});
	});

	test('returns exact local and provider browse selections', async () => {
		const shared = URI.file('/work/shared');
		const localFolder = URI.file('/work/local');
		const local = createProvider('local', { supportsLocalWorkspaces: true, group: SESSION_WORKSPACE_GROUP_LOCAL });
		const github = createProvider('github', {
			group: SESSION_WORKSPACE_GROUP_GITHUB,
			browseActions: [createBrowseAction('github', SESSION_WORKSPACE_GROUP_GITHUB, workspace(shared, 'GitHub shared', SESSION_WORKSPACE_GROUP_GITHUB))],
		});
		providersService.setProviders([local, github]);
		selectedLocalFolder = [localFolder];
		const catalog = await adapter.getNewSessionWorkspaceCatalog();
		const githubAction = catalog.browseActions.find(action => action.providerId === 'github');

		const localSelection = await adapter.browseNewSessionWorkspace('local', CancellationToken.None);
		const githubSelection = await adapter.browseNewSessionWorkspace(githubAction!.id, CancellationToken.None);

		assert.deepStrictEqual({
			local: localSelection && [localSelection.uri.toString(), localSelection.providerId, localSelection.group],
			github: githubSelection && [githubSelection.uri.toString(), githubSelection.providerId, githubSelection.group],
		}, {
			local: [localFolder.toString(), 'local', SESSION_WORKSPACE_GROUP_LOCAL],
			github: [shared.toString(), 'github', SESSION_WORKSPACE_GROUP_GITHUB],
		});
	});

	test('returns an explicit rejection when the owning provider disappears during dispatch', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		managementService.sendError = new Error(`Sessions provider 'provider' not found`);

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {}, CancellationToken.None);

		assert.deepStrictEqual(result, {
			status: 'rejected',
			resource: session.mainChat.get().resource,
			reason: `Sessions provider 'provider' not found`,
		});
	});

	test('sends existing sessions through Sessions management with attachments in the background', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file', name: 'file' });

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {
			attachedContext: [attachment],
			userSelectedTools: constObservable({ tool: true }),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			send: managementService.existingSend,
		}, {
			result: {
				status: 'sent',
				resource: session.mainChat.get().resource,
				activityBaseline: session.lastTurnEnd.get()!.getTime(),
			},
			send: {
				session,
				chat: session.mainChat.get(),
				options: { query: 'Continue', attachedContext: [attachment], background: true },
			},
		});
	});

	test('creates and sends a folder session with supported model, mode, permission, and attachments', async () => {
		const created = createSession('provider:created');
		managementService.createdSession = created;
		const folder = URI.file('/work/repo');
		const attachment = upcastPartial<IChatRequestVariableEntry>({ id: 'file', name: 'file' });

		const result = await adapter.dispatchToNewSession({ folder, providerId: 'provider' }, 'Build it', {
			attachedContext: [attachment],
			userSelectedModelId: 'model',
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: ChatPermissionLevel.AutoApprove,
			},
		}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			folderSend: managementService.folderSend,
		}, {
			result: {
				status: 'sent',
				resource: created.mainChat.get().resource,
				activityBaseline: created.createdAt.getTime(),
			},
			folderSend: {
				folder,
				options: { query: 'Build it', attachedContext: [attachment], background: true },
				createOptions: { providerId: 'provider', modelId: 'model', modeId: 'agent', permissionLevel: ChatPermissionLevel.AutoApprove },
			},
		});
	});

	test('creates and sends a quick chat when no folder is selected', async () => {
		const created = createSession('provider:quick');
		managementService.createdSession = created;

		const result = await adapter.dispatchToNewSession({}, 'Explain this', {}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			quickSend: managementService.quickSend,
		}, {
			result: {
				status: 'sent',
				resource: created.mainChat.get().resource,
				activityBaseline: created.createdAt.getTime(),
			},
			quickSend: {
				options: { query: 'Explain this', attachedContext: undefined, background: true },
				createOptions: undefined,
			},
		});

		test('rejects a missing selected workspace provider instead of rerouting', async () => {
			const result = await adapter.dispatchToNewSession({
				folder: URI.file('/work/repo'),
				providerId: 'missing',
			}, 'Build it', {}, CancellationToken.None);

			assert.deepStrictEqual(result, {
				status: 'rejected',
				reasonCode: 'providerRemoved',
				reason: 'The selected workspace provider is no longer available.',
			});
			assert.strictEqual(managementService.folderSend, undefined);
		});
	});

	test('rejects unsupported request context instead of dropping it', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {
			userSelectedTools: constObservable({ tool: false }),
		}, CancellationToken.None);

		assert.deepStrictEqual(result, {
			status: 'rejected',
			reasonCode: 'unsupportedOptions',
			reason: 'The selected tool configuration cannot be sent through Sessions.',
		});
		assert.strictEqual(managementService.existingSend, undefined);
	});

	test('sends with the selected model when its configuration cannot be forwarded', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {
			userSelectedModelId: 'model',
			userSelectedModelConfiguration: { reasoningEffort: 'high', contextSize: 1_000_000 },
		}, CancellationToken.None);

		assert.deepStrictEqual({
			result,
			send: managementService.existingSend,
		}, {
			result: {
				status: 'sent',
				resource: session.mainChat.get().resource,
				activityBaseline: session.lastTurnEnd.get()!.getTime(),
			},
			send: {
				session,
				chat: session.mainChat.get(),
				options: { query: 'Continue', attachedContext: undefined, background: true },
			},
		});
	});

	test('rejects cancelled sends before dispatch', async () => {
		const session = createSession('provider:session');
		managementService.sessions = [session];
		const cts = new CancellationTokenSource();
		cts.cancel();

		const result = await adapter.dispatchToSession(session.sessionId, 'Continue', {}, cts.token);

		assert.deepStrictEqual(result, {
			status: 'rejected',
			resource: undefined,
			reasonCode: 'cancelled',
			reason: 'The request was cancelled.',
		});
		assert.strictEqual(managementService.existingSend, undefined);
		cts.dispose();
	});

	test('opens adapter results through Sessions service', async () => {
		const resource = URI.parse('session:/provider/session');

		await adapter.revealSession(resource);

		assert.deepStrictEqual(opened, [resource]);
	});
});

class TestSessionsProvidersService extends Disposable implements ISessionsProvidersService {
	declare readonly _serviceBrand: undefined;

	private readonly changeEmitter = this._register(new Emitter<ISessionsProvidersChangeEvent>());
	readonly onDidChangeProviders = this.changeEmitter.event;
	private providers: ISessionsProvider[] = [];

	setProviders(providers: ISessionsProvider[]): void {
		const removed = this.providers;
		this.providers = providers;
		this.changeEmitter.fire({ added: providers, removed });
	}

	registerProvider(provider: ISessionsProvider) {
		this.setProviders([...this.providers, provider]);
		return toDisposable(() => this.setProviders(this.providers.filter(candidate => candidate !== provider)));
	}

	getProviders(): ISessionsProvider[] {
		return [...this.providers];
	}

	getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
		return this.providers.find(provider => provider.id === providerId) as T | undefined;
	}
}

class TestRecentWorkspacesService extends Disposable implements ISessionsRecentWorkspacesService {
	declare readonly _serviceBrand: undefined;

	private readonly changeEmitter = this._register(new Emitter<void>());
	readonly onDidChangeRecentWorkspaces = this.changeEmitter.event;
	recents: IRecentWorkspace[] = [];
	ownRecents: IRecentWorkspace[] = [];
	readonly added: Array<{ uri: URI; providerId: string | undefined; checked: boolean }> = [];

	getRecentWorkspaces(includeVSCodeRecents = true): IRecentWorkspace[] {
		return [...(includeVSCodeRecents ? this.recents : this.ownRecents)];
	}

	addRecentWorkspace(uri: URI, providerId: string | undefined, checked: boolean): void {
		this.added.push({ uri, providerId, checked });
		this.changeEmitter.fire();
	}

	removeRecentWorkspace(): void { }
	clearCheckedWorkspace(): void { }
	fireChanged(): void {
		this.changeEmitter.fire();
	}
}

class TestSessionsManagementService extends mock<ISessionsManagementService>() {
	declare readonly _serviceBrand: undefined;

	private readonly sessionsChangedEmitter = new Emitter<ISessionsChangeEvent>();
	private readonly sessionTypesChangedEmitter = new Emitter<void>();
	private readonly sessionReplacedEmitter = new Emitter<{ readonly from: ISession; readonly to: ISession }>();
	override readonly onDidChangeSessions = this.sessionsChangedEmitter.event;
	override readonly onDidChangeSessionTypes = this.sessionTypesChangedEmitter.event;
	override readonly onDidReplaceSession = this.sessionReplacedEmitter.event;

	sessions: ISession[] = [];
	createdSession: ISession | undefined;
	sendError: Error | undefined;
	existingSend: { session: ISession; chat: IChat; options: ISendRequestOptions } | undefined;
	folderSend: { folder: URI; options: ISendRequestOptions; createOptions: ICreateNewSessionOptions | undefined } | undefined;
	quickSend: { options: ISendRequestOptions; createOptions: ICreateNewSessionOptions | undefined } | undefined;

	override getSessions(): ISession[] {
		return this.sessions;
	}

	override getSession(resource: URI): ISession | undefined {
		return this.sessions.find(session => session.resource.toString() === resource.toString());
	}

	override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
		for (const session of this.sessions) {
			const chat = session.chats.get().find(candidate => candidate.resource.toString() === resource.toString());
			if (chat) {
				return { session, chat };
			}
		}
		return undefined;
	}

	override async sendRequest(session: ISession, chat: IChat, options: ISendRequestOptions): Promise<void> {
		if (this.sendError) {
			throw this.sendError;
		}
		this.existingSend = { session, chat, options };
	}

	override async createAndSendNewChatRequest(folder: URI, options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined> {
		this.folderSend = { folder, options, createOptions };
		return this.createdSession;
	}

	override async createAndSendQuickChatRequest(options: ISendRequestOptions, createOptions?: ICreateNewSessionOptions): Promise<ISession | undefined> {
		this.quickSend = { options, createOptions };
		return this.createdSession;
	}

	fireSessionsChanged(event: ISessionsChangeEvent): void {
		this.sessionsChangedEmitter.fire(event);
	}

	fireSessionReplaced(from: ISession, to: ISession): void {
		this.sessions = this.sessions.filter(session => session !== from);
		this.sessions.push(to);
		this.sessionReplacedEmitter.fire({ from, to });
	}

	dispose(): void {
		this.sessionsChangedEmitter.dispose();
		this.sessionTypesChangedEmitter.dispose();
		this.sessionReplacedEmitter.dispose();
	}
}

function createSession(sessionId: string, options: {
	readonly providerId?: string;
	readonly title?: string;
	readonly description?: string;
	readonly repository?: string;
	readonly status?: SessionStatus;
	readonly archived?: boolean;
	readonly interactivity?: ChatInteractivity;
} = {}): ISession {
	const providerId = options.providerId ?? 'provider';
	const status = options.status ?? SessionStatus.Completed;
	const repository = options.repository ?? 'repo';
	const resource = URI.parse(`session:/${sessionId}`);
	const chat = upcastPartial<IChat>({
		resource: URI.parse(`chat:/${sessionId}`),
		createdAt: new Date('2026-08-13T10:00:00Z'),
		title: constObservable(options.title ?? sessionId),
		updatedAt: constObservable(new Date('2026-08-13T12:00:00Z')),
		status: constObservable(status),
		isArchived: constObservable(options.archived ?? false),
		interactivity: constObservable(options.interactivity ?? ChatInteractivity.Full),
	});
	return upcastPartial<ISession>({
		sessionId,
		resource,
		providerId,
		sessionType: 'test',
		createdAt: new Date('2026-08-13T10:00:00Z'),
		title: constObservable(options.title ?? sessionId),
		updatedAt: constObservable(new Date('2026-08-13T12:00:00Z')),
		status: constObservable(status),
		isArchived: constObservable(options.archived ?? false),
		isAutomation: constObservable(false),
		description: constObservable(options.description ? { value: options.description } : undefined),
		lastTurnEnd: constObservable(new Date('2026-08-13T12:00:00Z')),
		workspace: constObservable({
			uri: URI.file(`/work/${repository}`),
			label: repository,
			icon: { id: 'folder' },
			folders: [{
				root: URI.file(`/work/${repository}`),
				workingDirectory: URI.file(`/work/${repository}`),
				name: repository,
				description: undefined,
				gitRepository: {
					uri: URI.file(`/work/${repository}`),
					workTreeUri: undefined,
					baseBranchName: undefined,
					gitHubInfo: constObservable({ owner: 'microsoft', repo: repository }),
				},
			}],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		chats: constObservable([chat]),
		mainChat: constObservable(chat),
	});
}

function createProvider(id: string, options: {
	readonly supportsLocalWorkspaces?: boolean;
	readonly group?: string;
	readonly browseActions?: readonly ISessionWorkspaceBrowseAction[];
	readonly sessions?: readonly ISession[];
} = {}): ISessionsProvider {
	return upcastPartial<ISessionsProvider>({
		id,
		label: id,
		order: 0,
		supportsLocalWorkspaces: options.supportsLocalWorkspaces,
		browseActions: options.browseActions ?? [],
		onDidChangeSessions: Event.None,
		getSessions: () => [...options.sessions ?? []],
		resolveWorkspace: (uri: URI) => workspace(uri, uri.path.split('/').filter(Boolean).at(-1) ?? uri.path, options.group),
	});
}

function createBrowseAction(providerId: string, group: string, selection: ISessionWorkspace | undefined): ISessionWorkspaceBrowseAction {
	return {
		label: 'Provider action',
		group,
		icon: { id: 'folder-opened' },
		providerId,
		run: async () => selection,
	};
}

function workspace(uri: URI, label: string, group?: string): ISessionWorkspace {
	return {
		uri,
		label,
		group,
		icon: { id: 'folder' },
		folders: [{
			root: uri,
			workingDirectory: uri,
			name: label,
			description: undefined,
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function recent(workspace: ISessionWorkspace, providerId: string, checked: boolean): IRecentWorkspace {
	return { workspace, providerId, checked };
}
