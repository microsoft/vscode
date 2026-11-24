/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ISettableObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { isWindows } from '../../../../../../../base/common/platform.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { extUriBiasedIgnorePathCase, originalFSPath } from '../../../../../../../base/common/resources.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../../platform/agentHost/common/agentService.js';
import { IAgentSubscription } from '../../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { NotificationType, type INotification } from '../../../../../../../platform/agentHost/common/state/sessionActions.js';
import { getAgentHostChatId, type SessionState, type SessionSummary } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, IFileService, IFileStatWithMetadata } from '../../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../../../platform/label/common/label.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../../platform/notification/test/common/testNotificationService.js';
import { IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IFolderLocationChangeEvent, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IWorkspaceEditingService } from '../../../../../../services/workspaces/common/workspaceEditing.js';
import { TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import { ITerminalInstance, ITerminalService } from '../../../../../terminal/browser/terminal.js';
import { AgentHostWorktreeContribution } from '../../../../browser/agentSessions/agentHost/agentHostWorktree.contribution.js';
import { AgentHostWorktreeChatResolverService, IAgentHostWorktreeChatResolverService } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeChatResolver.js';
import { IAgentHostWorktreeLocations } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeLocationsService.js';
import { IAgentSession } from '../../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { IChatViewHostService, IChatViewHostShownSession } from '../../../../browser/chatViewHost.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatSessionCommitEvent, IChatSessionsService, SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { LocalChatSessionUri } from '../../../../common/model/chatUri.js';

suite('AgentHostWorktree', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const worktree = URI.file('/work/vscode.worktrees/feature');
	const created = URI.file('/work/vscode.worktrees/created');

	/** The feature in a window whose folder is at `at`, recording the moves it asks for, the chats it opens and its experiment triggers. */
	function createWorktree(options: { readonly enabled: boolean; readonly at?: URI; readonly canSetLocation?: boolean; readonly worktrees?: readonly URI[]; readonly resolving?: Promise<void>; readonly terminalCwd?: URI; readonly setting?: Promise<void>; readonly resolvingFor?: Record<string, Promise<void>>; readonly realPaths?: Record<string, string>; readonly realPathError?: Error; readonly folderForms?: Record<string, string>; readonly root?: URI; readonly listedAtStart?: boolean }) {
		/** The worktrees the folder's location provider knows, to which a test may add one it comes to know. */
		const worktrees = [...options.worktrees ?? [worktree, created]];
		const marks: string[] = [];
		const terminal = upcastPartial<ITerminalInstance>({
			// As the terminal reports it, with its drive letter in the case it has
			initialCwd: options.terminalCwd && originalFSPath(options.terminalCwd),
			statusList: upcastPartial<ITerminalInstance['statusList']>({ add: () => { marks.push('marked'); }, remove: () => { marks.push('unmarked'); } }),
		});
		const shownSession = observableValue<IChatViewHostShownSession | undefined>('shownSession', undefined);
		const workingDirectories = new Map<string, string>();
		const onDidChangeSessions = store.add(new Emitter<void>());
		const onDidChangeLocation = store.add(new Emitter<IFolderLocationChangeEvent>());
		const onDidChangeLocations = store.add(new Emitter<void>());
		const onDidChangeWorkspaceFolders = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		const onDidCommitSession = store.add(new Emitter<IChatSessionCommitEvent>());
		const root = options.root ?? primary;
		const workspace = { at: options.at ?? root };
		const moves: string[] = [];
		/** The moves the workspace made: of those it was asked for, each that was still the latest once `options.setting` let it complete. */
		const applied: string[] = [];
		const opened: string[] = [];
		const providers: string[] = [];
		const telemetryService = new TestExperimentTriggerTelemetryService();
		const configurationService = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.enabled });
		const contextKeyService = store.add(new MockContextKeyService());
		contextKeyService.createKey(ChatContextKeys.enabled.key, true);
		const folder = () => upcastPartial<IWorkspaceFolder>({ uri: workspace.at });

		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IChatViewHostService, upcastPartial<IChatViewHostService>({
			shownSession,
			// The host reports the chat it opens as shown, as one it restores where asked to
			openSession: async (resource: URI, openOptions?: { readonly restore?: boolean }) => {
				opened.push(`${resource.path}${openOptions?.restore ? ' (restore)' : ''}`);
				shownSession.set({ resource, reason: openOptions?.restore ? 'restore' : 'open' }, undefined);
				return undefined;
			},
			// Reports the chat it shows already as asked, without loading it again
			revealIfShowing: async (resource: URI, openOptions?: { readonly restore?: boolean }) => {
				opened.push(`${resource.path} (shown already${openOptions?.restore ? ', restore' : ''})`);
				shownSession.set({ resource, reason: openOptions?.restore ? 'restore' : 'open' }, undefined);
				return undefined;
			},
		}));
		instantiationService.stub(IChatSessionsService, upcastPartial<IChatSessionsService>({ onDidCommitSession: onDidCommitSession.event }));
		// Where the chats of the editor window's session layer work, which the Chat view's sessions list does not list
		const layerDirectories = new Map<string, ISettableObservable<string | undefined>>();
		const layerDirectory = (chat: string) => {
			let directory = layerDirectories.get(chat);
			if (!directory) {
				directory = observableValue<string | undefined>(chat, undefined);
				layerDirectories.set(chat, directory);
			}
			return directory;
		};
		/** Where a chat of the session layer works, as its own observable state tells it, which fires no change of the layer's. */
		const sessionLayerDirectories = { set: (chat: string, path: string) => layerDirectory(chat).set(path, undefined) };
		/** The chats of the session layer whose sessions are archived, which the Chat view's list does not know. */
		const layerArchived = new Set<string>();
		const onDidChangeSessionLayer = store.add(new Emitter<void>());
		/** The sessions of the Chat view's list that are archived, by their resource. */
		const archived = new Set<string>();
		// As the session layer registers its resolver: a chat of it works where the layer says
		const chatResolver = store.add(new AgentHostWorktreeChatResolverService());
		store.add(chatResolver.registerResolver({
			onDidChange: onDidChangeSessionLayer.event,
			resolve: (chat: URI) => chat.scheme === 'ahp-chat'
				? { workingDirectory: layerDirectory(chat.toString()).map(path => path ? URI.file(path) : undefined), isArchived: layerArchived.has(chat.toString()) }
				: undefined,
		}));
		instantiationService.stub(IAgentHostWorktreeChatResolverService, chatResolver);
		/**
		 * The local agent host's state of each session of the Chat view's list, by its path, as a subscription to it has it:
		 * where the session works, and where each of its chats works where it works on its own.
		 */
		const sessionStates = new Map<string, { readonly workingDirectories: readonly string[]; readonly chats: Readonly<Record<string, string | undefined>> }>();
		const onDidChangeSessionState = store.add(new Emitter<SessionState>());
		/** The subscriptions to the agent host's sessions that are held. */
		const subscriptions: string[] = [];
		const toSessionState = (path: string): SessionState | undefined => {
			const known = sessionStates.get(path);
			return known && upcastPartial<SessionState>({
				// In the host's own space, which the connection maps to the window's
				workingDirectories: known.workingDirectories.map(directory => URI.file(directory).with({ scheme: 'host' }).toString()),
				defaultChat: `copilot:${path}/default`,
				chats: Object.entries(known.chats).map(([chat, directory]) => upcastPartial<SessionState['chats'][number]>({ resource: `copilot:${path}/${chat}`, workingDirectories: directory ? [URI.file(directory).with({ scheme: 'host' }).toString()] : undefined })),
			});
		};
		/** The sessions of the Chat view's list that are not on the local agent host yet, such as one its first request just made, by their path. */
		const unannounced = new Set<string>();
		/** The sessions of the Chat view's list whose session the local agent host has not advertised yet, which resolve only to a guess, by their path. */
		const unadvertised = new Set<string>();
		const onDidNotification = store.add(new Emitter<INotification>());
		const onDidChangeSessionResolution = store.add(new Emitter<void>());
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: onDidChangeSessionResolution.event,
			resolveSessionResource: (resource: URI) => resource.scheme !== SessionType.AgentHostCopilot ? undefined : upcastPartial<IAgentHostSessionResolution>({
				connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY,
				backendSession: URI.from({ scheme: unadvertised.has(resource.path) ? 'guessed' : 'copilot', path: resource.path }),
				...(unadvertised.has(resource.path) ? {} : { backendSessionIsAdvertised: true }),
				connection: upcastPartial<IAgentConnection>({
					resourceUris: { fromAgentHost: (resource: URI) => resource.with({ scheme: 'file' }), toAgentHost: (resource: URI) => resource.with({ scheme: 'host' }) },
					onDidNotification: onDidNotification.event,
					getSubscription: (_kind: unknown, backendSession: URI) => {
						subscriptions.push(backendSession.path);
						// As a subscription to a session not on the host yet: it fails, and is not retried on its own
						const failed = unannounced.has(backendSession.path) ? new Error('Unknown session') : undefined;
						const subscription = upcastPartial<IAgentSubscription<SessionState>>({
							get value() { return failed ?? toSessionState(backendSession.path); },
							onDidChange: onDidChangeSessionState.event,
						});
						return { object: subscription, dispose: () => subscriptions.splice(subscriptions.indexOf(backendSession.path), 1) } as never;
					},
				}),
			}),
		}));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({
			getSession: (resource: URI) => {
				const path = workingDirectories.get(resource.toString());
				const isArchived = archived.has(resource.toString());
				return path || isArchived ? upcastPartial<IAgentSession>({ metadata: path ? { workingDirectoryPath: path } : undefined, isArchived: () => isArchived }) : undefined;
			},
			model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: onDidChangeSessions.event, onDidResolve: Event.None }),
		}));
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: root, folders: [folder()] }),
			onDidChangeWorkspaceFolders: onDidChangeWorkspaceFolders.event,
			onDidChangeWorkbenchState: Event.None,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			canSetLocation: () => options.canSetLocation ?? true,
			onDidChangeLocation: onDidChangeLocation.event,
			onDidChangeLocations: onDidChangeLocations.event,
			getLocation: () => extUriBiasedIgnorePathCase.isEqual(workspace.at, root) ? undefined : upcastPartial<IResolvedFolderLocation>({ providerId: 'agentHost.sessionWorktrees' }),
			resolveLocation: async (_primary: URI, location: URI) => {
				// As the location service does, in the form the provider knows it, compared as the file system does; where
				// `listedAtStart`, as the provider listed them as it was asked, not as it answers
				const find = () => worktrees.find(candidate => extUriBiasedIgnorePathCase.isEqual(candidate, location));
				const listed = options.listedAtStart ? find() : undefined;
				await options.resolving;
				await options.resolvingFor?.[location.path];
				const known = options.listedAtStart ? listed : find();
				return known ? upcastPartial<IResolvedFolderLocation>({ uri: known }) : undefined;
			},
			registerProvider: () => { providers.push('registered'); return toDisposable(() => providers.push('unregistered')); },
		}));
		// Like the workspace: only its latest request applies, and an automatic one gives way to one under way
		let latestMove = 0;
		let movesUnderWay = 0;
		const setFolderLocation = async (location: URI, moveOptions?: { readonly ifIdle?: boolean; readonly reason?: string; readonly force?: boolean }) => {
			if (moveOptions?.ifIdle && movesUnderWay > 0) {
				moves.push(`${location.path} (gave way)`);
				return;
			}
			// Only a move the user asked for may ask the user about what runs in the folder
			moves.push(`${location.path}${moveOptions?.ifIdle ? ' (automatic)' : ''}${moveOptions?.force || moveOptions?.reason === 'user' ? '' : ' (would ask)'}`);
			const move = ++latestMove;
			movesUnderWay++;
			try {
				await options.setting;
			} finally {
				movesUnderWay--;
			}
			if (move !== latestMove) {
				return;
			}
			applied.push(location.path);
			workspace.at = location;
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [folder()] });
			onDidChangeLocation.fire({ folder: folder(), reason: moveOptions?.reason === 'user' ? 'user' : 'programmatic' });
		};
		instantiationService.stub(IWorkspaceEditingService, upcastPartial<IWorkspaceEditingService>({ setFolderLocation }));
		instantiationService.stub(IFileService, upcastPartial<IFileService>({
			stat: async () => upcastPartial<IFileStatWithMetadata>({}),
			realpath: async (resource: URI) => { if (options.realPathError) { throw options.realPathError; } const real = options.realPaths?.[resource.path]; return real ? URI.file(real) : resource; },
		}));
		instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: (uri: URI) => uri.path }));
		// The kinds of the notifications it shows, such as of a move that failed
		const notices: string[] = [];
		const notificationService = new TestNotificationService();
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({
			info: () => { notices.push('info'); return notificationService.info(''); },
			error: () => { notices.push('error'); return notificationService.error(''); },
		}));
		instantiationService.stub(ITerminalService, upcastPartial<ITerminalService>({ instances: options.terminalCwd ? [terminal] : [], onDidCreateInstance: Event.None }));
		instantiationService.stub(IStorageService, store.add(new TestStorageService()));
		instantiationService.stub(ITelemetryService, telemetryService);
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri: extUriBiasedIgnorePathCase }));
		instantiationService.stub(IWorkbenchEnvironmentService, upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: false }));
		// The provider the contribution registers while worktree support is on, which knows the real paths of the window's folders
		instantiationService.stub(IAgentHostWorktreeLocations, upcastPartial<IAgentHostWorktreeLocations>({
			id: 'agentHost.sessionWorktrees',
			getFolderForms: (folder: URI) => options.folderForms?.[folder.path] ? [folder, URI.file(options.folderForms[folder.path])] : [folder],
		}));
		const contribution = store.add(instantiationService.createInstance(AgentHostWorktreeContribution));

		const show = (resource: URI, reason: IChatViewHostShownSession['reason'] = 'open') => shownSession.set({ resource, reason }, undefined);
		const setEnabled = (enabled: boolean) => {
			configurationService.setUserConfiguration(ChatConfiguration.EditorWindowEnableWorktree, enabled);
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: (key: string) => key === ChatConfiguration.EditorWindowEnableWorktree } as never);
		};
		const userMovesTo = (location: URI) => {
			workspace.at = location;
			onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [folder()] });
			onDidChangeLocation.fire({ folder: folder(), reason: 'user' });
		};
		/** The user moves the folder in the window's title, which the workspace makes like any other move. */
		const userStartsMoveTo = (location: URI) => setFolderLocation(location, { reason: 'user' });
		const commit = (original: URI, committed: URI) => onDidCommitSession.fire({ original, committed });
		return { show, archived, workingDirectories, onDidChangeSessions, sessionLayerDirectories, layerArchived, onDidChangeSessionLayer, sessionStates, onDidChangeSessionState, subscriptions, unannounced, unadvertised, onDidNotification, onDidChangeSessionResolution, worktrees, onDidChangeLocations, moves, applied, opened, providers, triggers: telemetryService.triggers, setEnabled, userMovesTo, userStartsMoveTo, commit, contribution, marks, notices };
	}

	const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
	const agentSession = (id: string) => URI.from({ scheme: SessionType.AgentHostCopilot, path: `/${id}` });
	const localChat = LocalChatSessionUri.forSession('local-1');

	test('follows a chat the user opens to its worktree and a local chat back to the folder, but not a restored chat', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'), 'restore');
		await settle();
		const restored = [...feature.moves];
		feature.show(agentSession('a'));
		await settle();
		feature.show(localChat);
		await settle();

		assert.deepStrictEqual({ restored, moves: feature.moves, providers: feature.providers, triggers: feature.triggers }, {
			restored: [],
			moves: ['/work/vscode.worktrees/feature', '/work/vscode'],
			providers: ['registered'],
			triggers: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`],
		});
	});

	test('an archived chat the user opens, or one that works in a worktree only later, moves nothing, and follows again once unarchived', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('done').toString(), worktree.fsPath);
		feature.archived.add(agentSession('done').toString());
		feature.archived.add(localChat.toString());
		feature.show(agentSession('done'));
		await settle();
		feature.workingDirectories.set(agentSession('done').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		feature.show(localChat);
		await settle();
		const whileArchived = [...feature.moves];
		feature.archived.delete(agentSession('done').toString());
		feature.show(agentSession('done'));
		await settle();

		assert.deepStrictEqual({ whileArchived, unarchived: feature.moves }, {
			whileArchived: [],
			unarchived: ['/work/vscode.worktrees/created'],
		});
	});

	test('an archived chat the user keeps open follows as where it works changes once unarchived, but unarchiving alone moves nothing', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('done').toString(), worktree.fsPath);
		feature.archived.add(agentSession('done').toString());
		feature.show(agentSession('done'));
		await settle();
		feature.archived.delete(agentSession('done').toString());
		feature.onDidChangeSessions.fire();
		await settle();
		const unarchived = [...feature.moves];
		feature.workingDirectories.set(agentSession('done').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();

		assert.deepStrictEqual({ unarchived, changed: feature.moves }, {
			unarchived: [],
			changed: ['/work/vscode.worktrees/created (automatic)'],
		});
	});

	test('a chat archived while the folder is about to follow it moves nothing', async () => {
		const resolving = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, resolving: resolving.p });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.archived.add(agentSession('a').toString());
		feature.onDidChangeSessions.fire();
		resolving.complete();
		await settle();
		await settle();

		assert.deepStrictEqual(feature.moves, []);
	});

	test('follows on its own once the shown session\'s working directory is known, or as it changes, such as to a worktree its agent created', async () => {
		const feature = createWorktree({ enabled: true });
		feature.show(agentSession('new'));
		await settle();
		const beforeKnown = [...feature.moves];
		feature.workingDirectories.set(agentSession('new').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		feature.workingDirectories.set(agentSession('new').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();

		assert.deepStrictEqual({ beforeKnown, moves: feature.moves }, {
			beforeKnown: [],
			moves: ['/work/vscode.worktrees/feature (automatic)', '/work/vscode.worktrees/created (automatic)'],
		});
	});

	test('follows a chat that works in the folder\'s own location by another path, such as /private/tmp of /tmp, back to the folder', async () => {
		const feature = createWorktree({ enabled: true, at: worktree, realPaths: { '/private/work/vscode/src': '/work/vscode/src' } });
		feature.workingDirectories.set(agentSession('a').toString(), '/private/work/vscode/src');
		feature.show(agentSession('a'));
		await settle();

		assert.deepStrictEqual(feature.moves, ['/work/vscode']);
	});

	test('a chat whose folder\'s real path cannot be read, other than as missing, fails to move the folder with an error rather than staying silent', async () => {
		const feature = createWorktree({ enabled: true, at: worktree, realPathError: createFileSystemProviderError('EACCES', FileSystemProviderErrorCode.NoPermissions) });
		feature.workingDirectories.set(agentSession('a').toString(), '/private/work/vscode/src');
		feature.show(agentSession('a'));
		await settle();

		assert.deepStrictEqual({ moves: feature.moves, notices: feature.notices }, { moves: [], notices: ['error'] });
	});

	test('a chat opened by a link in the window keeps the folder where it is, also as it comes to work elsewhere, and is not the last chat of where the folder is; a chat picked in the sessions list follows', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('linked').toString(), worktree.fsPath);
		feature.show(agentSession('linked'), 'keepFolder');
		await settle();
		feature.workingDirectories.set(agentSession('linked').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		const linked = [...feature.moves];
		// Moved away and back by the user, the folder reopens no chat of its own location
		feature.userMovesTo(worktree);
		feature.userMovesTo(primary);
		await settle();
		const reopened = [...feature.opened];
		feature.workingDirectories.set(agentSession('picked').toString(), worktree.fsPath);
		feature.show(agentSession('picked'));
		await settle();

		assert.deepStrictEqual({ linked, reopened, picked: feature.moves.slice(linked.length) }, {
			linked: [],
			reopened: [],
			picked: ['/work/vscode.worktrees/feature'],
		});
	});

	test('opens the last chat of a location the user moves the folder to themselves', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.show(localChat);
		await settle();
		feature.userMovesTo(worktree);

		assert.deepStrictEqual({ moves: feature.moves, opened: feature.opened }, {
			moves: ['/work/vscode.worktrees/feature', '/work/vscode'],
			opened: ['/a (restore)'],
		});
	});

	test('does not reopen the last chat of a location the user moves the folder to once it is archived, and does again once unarchived', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.show(localChat);
		await settle();
		feature.archived.add(agentSession('a').toString());
		feature.userMovesTo(worktree);
		// The chats it reopens at the worktree, not the local chat it reopens back at the folder
		const reopened = () => feature.opened.filter(opened => opened.startsWith('/a '));
		const whileArchived = reopened();
		feature.userMovesTo(URI.file('/work/vscode'));
		feature.archived.delete(agentSession('a').toString());
		feature.userMovesTo(worktree);

		assert.deepStrictEqual({ whileArchived, unarchived: reopened() }, {
			whileArchived: [],
			unarchived: ['/a (restore)'],
		});
	});

	test('does not reopen the last chat of a location once its session layer archived it, such as a chat of the chat part', async () => {
		const chat = URI.from({ scheme: 'ahp-chat', path: '/remembered' });
		const feature = createWorktree({ enabled: true });
		feature.sessionLayerDirectories.set(chat.toString(), worktree.fsPath);
		feature.show(chat);
		await settle();
		feature.show(localChat);
		await settle();
		feature.layerArchived.add(chat.toString());
		feature.onDidChangeSessionLayer.fire();
		feature.userMovesTo(worktree);
		const reopened = () => feature.opened.filter(opened => opened.startsWith('/remembered '));
		const whileArchived = reopened();
		feature.userMovesTo(URI.file('/work/vscode'));
		feature.layerArchived.delete(chat.toString());
		feature.userMovesTo(worktree);

		assert.deepStrictEqual({ whileArchived, unarchived: reopened() }, { whileArchived: [], unarchived: ['/remembered (restore)'] });
	});

	test('with the setting off, logs the same trigger but moves nothing; turned off at a worktree, returns the folder to its own location', async () => {
		const off = createWorktree({ enabled: false });
		off.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		off.show(agentSession('a'));
		await settle();

		const turnedOff = createWorktree({ enabled: true, at: worktree });
		turnedOff.setEnabled(false);
		await settle();

		const notMovable = createWorktree({ enabled: true, canSetLocation: false });
		notMovable.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		notMovable.show(agentSession('a'));
		await settle();

		assert.deepStrictEqual({
			off: { moves: off.moves, providers: off.providers, triggers: off.triggers },
			turnedOff: { moves: turnedOff.moves, providers: turnedOff.providers },
			notMovable: { moves: notMovable.moves, triggers: notMovable.triggers },
		}, {
			off: { moves: [], providers: [], triggers: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`] },
			turnedOff: { moves: ['/work/vscode'], providers: ['registered', 'unregistered'] },
			notMovable: { moves: [], triggers: [] },
		});
	});

	test('a later choice, also one that moves nothing, or a move of the user\'s own, supersedes a switch still under way', async () => {
		const run = async (supersede: (feature: ReturnType<typeof createWorktree>) => void) => {
			const resolving = new DeferredPromise<void>();
			const feature = createWorktree({ enabled: true, resolving: resolving.p });
			feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
			feature.show(agentSession('a'));
			await settle();
			supersede(feature);
			resolving.complete();
			await settle();
			return feature.moves;
		};
		assert.deepStrictEqual({
			chatThatMovesNothing: await run(feature => feature.show(localChat)),
			userMove: await run(feature => feature.userMovesTo(primary.with({ path: '/work/elsewhere' }))),
		}, { chatThatMovesNothing: [], userMove: [] });
	});

	test('follows to a worktree inside the folder, and back to the folder for a chat that works in a folder inside it', async () => {
		const nested = URI.file('/work/vscode/.worktrees/nested');
		const feature = createWorktree({ enabled: true, worktrees: [nested] });
		feature.workingDirectories.set(agentSession('nested').toString(), nested.fsPath);
		feature.workingDirectories.set(agentSession('src').toString(), URI.file('/work/vscode/src').fsPath);
		feature.show(agentSession('nested'));
		await settle();
		feature.show(agentSession('src'));
		await settle();
		const atFolder = [...feature.moves];
		feature.show(agentSession('src'));
		await settle();

		assert.deepStrictEqual({ atFolder, again: feature.moves }, {
			atFolder: ['/work/vscode/.worktrees/nested', '/work/vscode'],
			again: ['/work/vscode/.worktrees/nested', '/work/vscode'],
		});
	});

	test('a restored chat\'s working directory that becomes known as the list loads moves nothing, but a later change does', async () => {
		const feature = createWorktree({ enabled: true });
		feature.show(agentSession('restored'), 'restore');
		await settle();
		feature.workingDirectories.set(agentSession('restored').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		const hydrated = [...feature.moves];
		feature.workingDirectories.set(agentSession('restored').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();

		assert.deepStrictEqual({ hydrated, changed: feature.moves }, { hydrated: [], changed: ['/work/vscode.worktrees/created (automatic)'] });
	});

	test('a switch under way does not apply once disposed', async () => {
		const resolving = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, resolving: resolving.p });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.contribution.dispose();
		resolving.complete();
		await settle();

		assert.deepStrictEqual(feature.moves, []);
	});

	test('marks terminals only while on, and clears their marks as it turns off', async () => {
		const off = createWorktree({ enabled: false, at: worktree, terminalCwd: primary });
		off.userMovesTo(primary);
		off.userMovesTo(worktree);
		const on = createWorktree({ enabled: true, at: worktree, terminalCwd: primary });
		on.userMovesTo(primary);
		on.userMovesTo(worktree);
		const whileOn = [...on.marks];
		on.setEnabled(false);
		await settle();

		assert.deepStrictEqual({ off: off.marks, whileOn: whileOn.includes('marked'), afterOff: on.marks.at(-1) }, { off: [], whileOn: true, afterOff: 'unmarked' });
	});

	test('a later choice that moves nothing, or disposing, supersedes a move that the workspace still makes', async () => {
		const run = async (supersede: (feature: ReturnType<typeof createWorktree>) => void) => {
			const setting = new DeferredPromise<void>();
			const feature = createWorktree({ enabled: true, setting: setting.p });
			feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
			feature.workingDirectories.set(agentSession('here').toString(), primary.fsPath);
			feature.show(agentSession('a'));
			await settle();
			supersede(feature);
			setting.complete();
			await settle();
			return feature.applied;
		};
		assert.deepStrictEqual({
			localChat: await run(feature => feature.show(localChat)),
			chatWhereTheFolderIs: await run(feature => feature.show(agentSession('here'))),
			newChat: await run(feature => feature.show(agentSession('untitled-1'))),
			disposed: await run(feature => feature.contribution.dispose()),
		}, { localChat: ['/work/vscode'], chatWhereTheFolderIs: ['/work/vscode'], newChat: ['/work/vscode'], disposed: ['/work/vscode'] });
	});

	test('a chat in a folder inside a worktree follows to that worktree, and stays at it', async () => {
		const nested = URI.file('/work/vscode/.worktrees/w');
		const atFolder = createWorktree({ enabled: true, worktrees: [nested] });
		atFolder.workingDirectories.set(agentSession('src').toString(), URI.file('/work/vscode/.worktrees/w/src').fsPath);
		atFolder.show(agentSession('src'));
		await settle();
		const atWorktree = createWorktree({ enabled: true, worktrees: [nested], at: nested });
		atWorktree.workingDirectories.set(agentSession('src').toString(), URI.file('/work/vscode/.worktrees/w/src').fsPath);
		atWorktree.show(agentSession('src'));
		await settle();

		assert.deepStrictEqual({ atFolder: atFolder.moves, atWorktree: atWorktree.moves }, { atFolder: ['/work/vscode/.worktrees/w'], atWorktree: [] });
	});

	test('the last chat that shows as the user moves the folder keeps the folder there, also where it works elsewhere now', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.show(localChat);
		await settle();
		feature.workingDirectories.set(agentSession('a').toString(), created.fsPath);
		feature.userMovesTo(worktree);
		await settle();

		assert.deepStrictEqual({ moves: feature.moves, opened: feature.opened }, { moves: ['/work/vscode.worktrees/feature', '/work/vscode'], opened: ['/a (restore)'] });
	});

	test('remembers the last chat opened where the folder is already, follows a session that replaces it, and forgets a deleted one', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.workingDirectories.set(agentSession('b').toString(), worktree.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.show(agentSession('b'));
		await settle();
		feature.show(localChat);
		await settle();
		const atPrimary = feature.contribution.getLastSession(primary)?.path;
		const atWorktree = feature.contribution.getLastSession(worktree)?.path;
		feature.commit(agentSession('b'), agentSession('c'));
		const replaced = feature.contribution.getLastSession(worktree)?.path;
		feature.workingDirectories.set(agentSession('c').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		feature.workingDirectories.delete(agentSession('c').toString());
		feature.onDidChangeSessions.fire();

		assert.deepStrictEqual({ atPrimary, atWorktree, replaced, deleted: feature.contribution.getLastSession(worktree) }, {
			atPrimary: localChat.path, atWorktree: '/b', replaced: '/c', deleted: undefined,
		});
	});

	test('the chat that a first request makes follows on its own, so a move that the user started still wins', async () => {
		const plain = createWorktree({ enabled: true });
		plain.workingDirectories.set(agentSession('c').toString(), created.fsPath);
		plain.show(agentSession('c'), 'commit');
		await settle();

		const setting = new DeferredPromise<void>();
		const held = createWorktree({ enabled: true, setting: setting.p });
		held.workingDirectories.set(agentSession('c').toString(), created.fsPath);
		const userMove = held.userStartsMoveTo(worktree);
		held.show(agentSession('c'), 'commit');
		await settle();
		setting.complete();
		await userMove;
		await settle();

		assert.deepStrictEqual({ plain: plain.moves, held: { moves: held.moves, applied: held.applied } }, {
			plain: ['/work/vscode.worktrees/created (automatic)'],
			held: { moves: ['/work/vscode.worktrees/feature', '/work/vscode.worktrees/created (gave way)'], applied: ['/work/vscode.worktrees/feature'] },
		});
	});

	test('logs the trigger as a window with a folder that can move starts, in both arms, before any chat shows', async () => {
		const on = createWorktree({ enabled: true });
		const off = createWorktree({ enabled: false });
		const notMovable = createWorktree({ enabled: true, canSetLocation: false });

		assert.deepStrictEqual({ on: on.triggers, off: off.triggers, notMovable: notMovable.triggers }, {
			on: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`],
			off: [`config.${ChatConfiguration.EditorWindowEnableWorktree}`],
			notMovable: [],
		});
	});

	test('a working directory that changes while it follows the previous one is followed once that settles', async () => {
		const setting = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, setting: setting.p });
		feature.show(agentSession('new'));
		await settle();
		feature.workingDirectories.set(agentSession('new').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		feature.workingDirectories.set(agentSession('new').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		setting.complete();
		await settle();
		await settle();

		assert.deepStrictEqual(feature.applied, ['/work/vscode.worktrees/feature', '/work/vscode.worktrees/created']);
	});

	test('on Windows, follows a chat in a worktree by its drive letter in either case, stops at a drive or share root for a folder elsewhere, and marks a terminal of the worktree', async () => {
		// Local folders on Windows drives, as their URI paths are on every OS; the drive letter differs in case where Windows
		// treats both as the same folder
		const drive = (letter: string, path: string) => URI.from({ scheme: 'file', path: `/${letter}:${path}` });
		const otherCase = isWindows ? 'C' : 'c';
		const root = drive('c', '/work/vscode');
		const feature = drive('c', '/work/vscode.worktrees/feature');
		const follow = async (workingDirectory: URI) => {
			const window = createWorktree({ enabled: true, root, worktrees: [feature] });
			// As the session reports it, with its drive letter in the case it has, which `fsPath` would lowercase
			window.workingDirectories.set(agentSession('w').toString(), originalFSPath(workingDirectory));
			window.show(agentSession('w'));
			await settle();
			return window.moves;
		};
		const terminal = createWorktree({ enabled: true, root, at: feature, worktrees: [feature], terminalCwd: drive(otherCase, '/work/vscode.worktrees/feature/src') });
		terminal.userMovesTo(root);

		assert.deepStrictEqual({
			worktree: await follow(drive(otherCase, '/work/vscode.worktrees/feature/src')),
			otherDrive: await follow(drive('d', '/elsewhere/project')),
			share: await follow(URI.from({ scheme: 'file', authority: 'server', path: '/share/project' })),
			terminal: terminal.marks.at(-1),
			// The product gets the other case: the window's folder and its worktree are `c:`
			fedDrive: /^\/?([a-z]:)/i.exec(originalFSPath(drive(otherCase, '/work')))?.[1],
		}, {
			worktree: ['/c:/work/vscode.worktrees/feature'],
			otherDrive: [],
			share: [],
			terminal: 'marked',
			fedDrive: `${otherCase}:`,
		});
	});

	test('marks a terminal that started in a worktree inside the folder once the folder returns to its own location', async () => {
		const nested = URI.file('/work/vscode/.worktrees/nested');
		const feature = createWorktree({ enabled: true, at: nested, worktrees: [nested], terminalCwd: URI.file('/work/vscode/.worktrees/nested/src') });
		feature.userMovesTo(primary);

		assert.deepStrictEqual(feature.marks.at(-1), 'marked');
	});

	test('the last chat of where the user moves the folder, shown already before its working directory is known, keeps the folder there as that becomes known', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('r').toString(), worktree.fsPath);
		feature.show(agentSession('r'));
		await settle();
		feature.show(localChat);
		await settle();
		// Shown again before the sessions list knows where it works, such as after a reload
		feature.workingDirectories.delete(agentSession('r').toString());
		feature.show(agentSession('r'));
		await settle();
		feature.userMovesTo(worktree);
		await settle();
		feature.workingDirectories.set(agentSession('r').toString(), created.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();

		assert.deepStrictEqual({ moves: feature.moves, opened: feature.opened }, {
			moves: ['/work/vscode.worktrees/feature', '/work/vscode'],
			opened: ['/r (shown already, restore)'],
		});
	});

	test('keeps track only of the sessions it remembers', async () => {
		const feature = createWorktree({ enabled: true, at: worktree });
		for (let i = 0; i < 25; i++) {
			feature.workingDirectories.set(agentSession(`s${i}`).toString(), worktree.fsPath);
			feature.show(agentSession(`s${i}`));
			await settle();
		}
		const listed = Reflect.get(feature.contribution, '_listedSessions') as { readonly size: number };

		assert.deepStrictEqual({ listed: listed.size, last: feature.contribution.getLastSession(worktree)?.path }, { listed: 1, last: '/s24' });
	});

	test('keeping the folder in place for a later chat supersedes only the earlier move, not that chat\'s switch still under way', async () => {
		const setting = new DeferredPromise<void>();
		const resolvingCreated = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, setting: setting.p, resolvingFor: { [created.path]: resolvingCreated.p } });
		feature.workingDirectories.set(agentSession('a').toString(), worktree.fsPath);
		feature.workingDirectories.set(agentSession('b').toString(), created.fsPath);
		feature.show(agentSession('a'));
		await settle();
		feature.show(agentSession('b'));
		await settle();
		setting.complete();
		await settle();
		resolvingCreated.complete();
		await settle();
		await settle();

		assert.deepStrictEqual(feature.applied, ['/work/vscode', '/work/vscode.worktrees/created']);
	});

	test('follows a chat of the editor window\'s session layer, which the Chat view\'s sessions list does not list: as the user opens it, and on its own as its session comes to work in a worktree', async () => {
		// Chats as the editor window's session layer names them
		const chat = (id: string) => URI.from({ scheme: 'ahp-chat', path: `/${id}` });
		const feature = createWorktree({ enabled: true });
		feature.sessionLayerDirectories.set(chat('existing').toString(), worktree.fsPath);
		feature.show(chat('existing'));
		await settle();
		const opened = [...feature.moves];
		feature.show(localChat);
		await settle();
		// A new chat whose first request created a worktree for its session
		feature.show(chat('new'));
		await settle();
		feature.sessionLayerDirectories.set(chat('new').toString(), created.fsPath);
		feature.onDidChangeSessionLayer.fire();
		await settle();

		assert.deepStrictEqual({ opened, moves: feature.moves }, {
			opened: ['/work/vscode.worktrees/feature'],
			moves: ['/work/vscode.worktrees/feature', '/work/vscode', '/work/vscode.worktrees/created (automatic)'],
		});
	});

	test('follows a chat of a session with other chats on its own as it alone comes to work in a worktree, such as by isolating it, while its session still works in the folder', async () => {
		const feature = createWorktree({ enabled: true });
		const peer = agentSession('s').with({ fragment: getAgentHostChatId('copilot:/s/peer') });
		// The Chat view's list has where the session works for each of its chats
		feature.workingDirectories.set(agentSession('s').toString(), primary.fsPath);
		feature.workingDirectories.set(peer.toString(), primary.fsPath);
		feature.sessionStates.set('/s', { workingDirectories: [primary.fsPath], chats: { default: undefined, peer: undefined } });
		feature.show(agentSession('s'));
		await settle();
		feature.sessionStates.set('/s', { workingDirectories: [primary.fsPath, worktree.fsPath], chats: { default: worktree.fsPath, peer: undefined } });
		feature.onDidChangeSessionState.fire(upcastPartial<SessionState>({}));
		await settle();
		feature.show(peer);
		await settle();
		feature.sessionStates.set('/s', { workingDirectories: [primary.fsPath, worktree.fsPath, created.fsPath], chats: { default: worktree.fsPath, peer: created.fsPath } });
		feature.onDidChangeSessionState.fire(upcastPartial<SessionState>({}));
		await settle();
		const subscribed = [...feature.subscriptions];
		feature.show(localChat);
		await settle();

		assert.deepStrictEqual({ moves: feature.moves, subscribed, released: feature.subscriptions }, {
			moves: ['/work/vscode.worktrees/feature (automatic)', '/work/vscode', '/work/vscode.worktrees/created (automatic)', '/work/vscode'],
			subscribed: ['/s'],
			released: [],
		});
	});

	test('a chat that a first request made follows as only it comes to work in a worktree, once its local agent host advertises its session and has it: never by a guess of it', async () => {
		const feature = createWorktree({ enabled: true });
		feature.unadvertised.add('/n');
		feature.unannounced.add('/n');
		feature.workingDirectories.set(agentSession('n').toString(), primary.fsPath);
		feature.sessionStates.set('/n', { workingDirectories: [primary.fsPath], chats: { default: undefined, peer: undefined } });
		feature.show(agentSession('n'), 'commit');
		await settle();
		const guessed = [...feature.subscriptions];
		// Advertised before the host has it, as its subscription fails until the host announces it
		feature.unadvertised.delete('/n');
		feature.onDidChangeSessionResolution.fire();
		await settle();
		feature.unannounced.delete('/n');
		feature.onDidNotification.fire(upcastPartial<INotification>({ type: NotificationType.SessionAdded, summary: upcastPartial<SessionSummary>({ resource: 'copilot:/n' }) }));
		await settle();
		feature.sessionStates.set('/n', { workingDirectories: [primary.fsPath, worktree.fsPath], chats: { default: worktree.fsPath, peer: undefined } });
		feature.onDidChangeSessionState.fire(upcastPartial<SessionState>({}));
		await settle();

		assert.deepStrictEqual({ guessed, moves: feature.moves, subscribed: feature.subscriptions }, { guessed: [], moves: ['/work/vscode.worktrees/feature (automatic)'], subscribed: ['/n'] });
	});

	test('a restored chat of a session with other chats moves nothing as the state of its session first becomes known, but follows as where it works changes later', async () => {
		const feature = createWorktree({ enabled: true });
		feature.workingDirectories.set(agentSession('r').toString(), primary.fsPath);
		feature.show(agentSession('r'), 'restore');
		await settle();
		// Its session's state, known only after its listing, has the chat working in a worktree of its own already
		feature.sessionStates.set('/r', { workingDirectories: [primary.fsPath, worktree.fsPath], chats: { default: worktree.fsPath } });
		feature.onDidChangeSessionState.fire(upcastPartial<SessionState>({}));
		await settle();
		const restored = [...feature.moves];
		feature.sessionStates.set('/r', { workingDirectories: [primary.fsPath, worktree.fsPath, created.fsPath], chats: { default: created.fsPath } });
		feature.onDidChangeSessionState.fire(upcastPartial<SessionState>({}));
		await settle();

		assert.deepStrictEqual({ restored, moves: feature.moves }, { restored: [], moves: ['/work/vscode.worktrees/created (automatic)'] });
	});

	test('follows a chat of the session layer on its own as it alone comes to work in a worktree, which the layer tells only by where that chat works', async () => {
		const chat = URI.from({ scheme: 'ahp-chat', path: '/main' });
		const feature = createWorktree({ enabled: true });
		feature.sessionLayerDirectories.set(chat.toString(), primary.fsPath);
		feature.show(chat);
		await settle();
		feature.sessionLayerDirectories.set(chat.toString(), worktree.fsPath);
		await settle();

		assert.deepStrictEqual(feature.moves, ['/work/vscode.worktrees/feature (automatic)']);
	});

	test('follows a chat that comes to work in a worktree its agent host lists as a location only later, once it does, unless the user moved the folder meanwhile', async () => {
		const chat = URI.from({ scheme: 'ahp-chat', path: '/main' });
		const later = URI.file('/work/vscode.worktrees/later');
		const followed = createWorktree({ enabled: true });
		followed.sessionLayerDirectories.set(chat.toString(), primary.fsPath);
		followed.show(chat);
		await settle();
		followed.sessionLayerDirectories.set(chat.toString(), later.fsPath);
		await settle();
		const beforeListed = [...followed.moves];
		followed.worktrees.push(later);
		followed.onDidChangeLocations.fire();
		await settle();

		const superseded = createWorktree({ enabled: true });
		superseded.sessionLayerDirectories.set(chat.toString(), primary.fsPath);
		superseded.show(chat);
		await settle();
		superseded.sessionLayerDirectories.set(chat.toString(), later.fsPath);
		await settle();
		superseded.userMovesTo(worktree);
		superseded.worktrees.push(later);
		superseded.onDidChangeLocations.fire();
		await settle();

		assert.deepStrictEqual({ beforeListed, followed: followed.moves, superseded: superseded.moves }, {
			beforeListed: [],
			followed: ['/work/vscode.worktrees/later (automatic)'],
			superseded: [],
		});
	});

	test('follows a chat whose worktree becomes a location while the folder resolves where it works, once that settles', async () => {
		const chat = URI.from({ scheme: 'ahp-chat', path: '/main' });
		const later = URI.file('/work/vscode.worktrees/later');
		const resolving = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, listedAtStart: true, resolvingFor: { [later.path]: resolving.p } });
		feature.sessionLayerDirectories.set(chat.toString(), primary.fsPath);
		feature.show(chat);
		await settle();
		feature.sessionLayerDirectories.set(chat.toString(), later.fsPath);
		await settle();
		feature.worktrees.push(later);
		feature.onDidChangeLocations.fire();
		resolving.complete();
		await settle();
		await settle();

		assert.deepStrictEqual(feature.moves, ['/work/vscode.worktrees/later (automatic)']);
	});

	test('follows a chat working in another form of a folder of the window, such as its real path, to that folder as the window names it', async () => {
		const chat = (id: string) => URI.from({ scheme: 'ahp-chat', path: `/${id}` });
		const feature = createWorktree({ enabled: true, at: worktree, folderForms: { '/work/vscode': '/private/work/vscode', '/work/vscode.worktrees/feature': '/private/work/vscode.worktrees/feature' } });
		feature.sessionLayerDirectories.set(chat('here').toString(), '/private/work/vscode.worktrees/feature');
		feature.sessionLayerDirectories.set(chat('primary').toString(), '/private/work/vscode');
		feature.show(chat('here'));
		await settle();
		const here = [...feature.moves];
		feature.show(chat('primary'));
		await settle();

		assert.deepStrictEqual({ here, moves: feature.moves }, { here: [], moves: ['/work/vscode'] });
	});

	test('a working directory that changes back to where the folder is while it follows the previous one is followed once that settles', async () => {
		const setting = new DeferredPromise<void>();
		const feature = createWorktree({ enabled: true, setting: setting.p });
		feature.show(agentSession('r'));
		await settle();
		feature.workingDirectories.set(agentSession('r').toString(), worktree.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		// The move to the worktree is under way, as the session comes to work where the folder still is
		feature.workingDirectories.set(agentSession('r').toString(), primary.fsPath);
		feature.onDidChangeSessions.fire();
		await settle();
		setting.complete();
		await settle();
		await settle();

		assert.deepStrictEqual(feature.applied, ['/work/vscode.worktrees/feature', '/work/vscode']);
	});
});
