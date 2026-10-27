/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionInfo, IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import type { InitializeResult } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { BrowserViewStorageScope, IBrowserViewOwner } from '../../../../../platform/browserView/common/browserView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IBrowserViewNetworkResolver, IBrowserViewSessionRequest, IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { BrowserEditorInput, IBrowserEditorInputData } from '../../../../../workbench/contrib/browserView/common/browserEditorInput.js';
import { IEditorWillOpenEvent } from '../../../../../workbench/common/editor.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionFolder, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionBrowserNetworkContribution } from '../../browser/sessionBrowserNetwork.js';

suite('SessionBrowserNetworkContribution', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function session(id: string, providerId: string, folder?: string): ISession {
		return upcastPartial<ISession>({
			sessionId: id,
			resource: URI.parse(`session:/${id}`),
			providerId,
			workspace: constObservable(folder ? upcastPartial<ISessionWorkspace>({ folders: [upcastPartial<ISessionFolder>({ root: URI.file(folder) })] }) : undefined),
		});
	}

	function createResolver(services: {
		readonly sessionsManagement?: Partial<ISessionsManagementService>;
		readonly sessions?: Partial<ISessionsService>;
		readonly providers?: Partial<ISessionsProvidersService>;
		readonly connections: Partial<IAgentHostConnectionsService>;
		readonly browserView?: Partial<IBrowserViewWorkbenchService>;
		readonly editor?: Partial<IEditorService>;
		readonly editorGroups?: Partial<IEditorGroupsService>;
		readonly configuration?: TestConfigurationService;
	}): IBrowserViewNetworkResolver {
		const instantiationService = store.add(new TestInstantiationService());
		let resolver: IBrowserViewNetworkResolver | undefined;
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			registerNetworkResolver: r => {
				resolver = r;
				return Disposable.None;
			},
			...services.browserView,
		}));
		instantiationService.stub(ISessionsManagementService, upcastPartial<ISessionsManagementService>({
			newSession: constObservable(undefined),
			onDidReplaceSession: Event.None,
			onDidReplaceNewDraftSession: Event.None,
			onDidDiscardNewSession: Event.None,
			...services.sessionsManagement,
		}));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ activeSession: constObservable(undefined), ...services.sessions }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ ...services.providers }));
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ connections: [], onDidChangeConnections: Event.None, ...services.connections }));
		instantiationService.stub(IEditorService, upcastPartial<IEditorService>({ onWillOpenEditor: Event.None, ...services.editor }));
		instantiationService.stub(IEditorGroupsService, upcastPartial<IEditorGroupsService>({ groups: [], ...services.editorGroups }));
		instantiationService.stub(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
		instantiationService.stub(ILogService, new NullLogService());
		instantiationService.stub(IConfigurationService, services.configuration ?? new TestConfigurationService());
		store.add(instantiationService.createInstance(SessionBrowserNetworkContribution));
		return resolver!;
	}

	test('uses the network of remote agent hosts and leaves local sessions on the local network', () => {
		const committed = session('committed', 'agenthost-ssh', '/repo');
		const local = session('local', 'local-agent-host', '/repo');
		const draft = session('draft', 'agenthost-wsl', '/repo');
		const workspaceless = session('quick', 'agenthost-ssh');
		const activeSession = observableValue<IActiveSession | undefined>('active', undefined);
		const newSession = observableValue<ISession | undefined>('draft', draft);
		const chats = new Map<string, ISession>([['chat:/committed', committed], ['chat:/local', local], ['chat:/quick', workspaceless]]);

		const resolver = createResolver({
			sessionsManagement: {
				newSession,
				getSessionForChatResource: resource => {
					const owning = chats.get(resource.toString());
					return owning ? { session: owning, chat: upcastPartial<IChat>({}) } : undefined;
				},
				getSession: () => undefined,
			},
			sessions: { activeSession },
			providers: {
				getProvider: <T extends ISessionsProvider>(id: string) => upcastPartial<IAgentHostSessionsProvider>(id === 'agenthost-wsl' ? { id, remoteAddress: 'wsl:Ubuntu' } : { id }) as unknown as T,
			},
			connections: {
				resolveSessionResourceIdentity: resource => {
					if (resource.path === '/committed' || resource.path === '/quick') {
						return { connectionAuthority: 'ssh-host', backendSession: resource };
					}
					if (resource.path === '/local') {
						return { connectionAuthority: AMBIENT_AGENT_HOST_AUTHORITY, backendSession: resource };
					}
					return undefined;
				},
			},
		});

		const resolve = (owner: IBrowserViewOwner) => ({ network: resolver.resolveNetwork(owner), storageAffinity: resolver.resolveStorageAffinity?.(owner) });
		const repo = (authority: string) => JSON.stringify([authority, extUri.getComparisonKey(URI.file('/repo'))]);
		const networks = {
			composerDraft: resolve({ type: 'user' }),
			agentOnRemoteHost: resolve({ type: 'agent', sessionId: 'chat:/committed' }),
			agentOnLocalHost: resolve({ type: 'agent', sessionId: 'chat:/local' }),
			workspaceless: resolve({ type: 'agent', sessionId: 'chat:/quick' }),
		};
		activeSession.set(upcastPartial<IActiveSession>(local), undefined);
		const activeLocal = resolve({ type: 'user' });

		const localNetwork = { network: undefined, storageAffinity: undefined };
		assert.deepStrictEqual({ ...networks, activeLocal }, {
			composerDraft: { network: { authority: agentHostAuthority('wsl:Ubuntu') }, storageAffinity: repo(agentHostAuthority('wsl:Ubuntu')) },
			agentOnRemoteHost: { network: { authority: 'ssh-host' }, storageAffinity: repo('ssh-host') },
			agentOnLocalHost: localNetwork,
			workspaceless: { network: { authority: 'ssh-host' }, storageAffinity: undefined },
			activeLocal: localNetwork,
		});
	});

	test('reports whether hosts are connected and can proxy browsers', () => {
		const connection = (initializeResult: IObservable<InitializeResult | undefined>) => upcastPartial<IAgentConnection>({ openTcpConnection: async () => { throw new Error('unused'); }, initializeResult });
		const handshake = observableValue<InitializeResult | undefined>('handshake', undefined);
		const connections = new Map<string, IAgentConnection>([
			['capable', connection(constObservable(upcastPartial<InitializeResult>({ tcpConnections: {} })))],
			['legacy', connection(constObservable(upcastPartial<InitializeResult>({})))],
			['connecting', connection(handshake)],
		]);
		const resolver = createResolver({
			connections: {
				connections: ['capable', 'legacy', 'connecting', 'disconnected'].map(authority => upcastPartial<IAgentHostConnectionInfo>({ authority, name: `${authority} host` })),
				getConnectionByAuthority: authority => connections.get(authority),
			},
		});
		let changes = 0;
		store.add(resolver.onDidChangeNetworkStatus(() => changes++));
		const statuses = () => Object.fromEntries(['capable', 'legacy', 'connecting', 'disconnected', 'unknown'].map(authority => [authority, resolver.getNetworkStatus({ authority })]));

		const before = statuses();
		handshake.set(upcastPartial<InitializeResult>({ tcpConnections: {} }), undefined);

		assert.deepStrictEqual({ before, after: statuses().connecting, changes }, {
			before: {
				capable: { label: 'capable host', connected: true, proxySupported: true },
				legacy: { label: 'legacy host', connected: true, proxySupported: false },
				connecting: { label: 'connecting host', connected: true, proxySupported: undefined },
				disconnected: { label: 'disconnected host', connected: false, proxySupported: undefined },
				unknown: { label: 'unknown', connected: false, proxySupported: undefined },
			},
			after: { label: 'connecting host', connected: true, proxySupported: true },
			changes: 1,
		});
	});

	/** The composer's draft and browser tabs, in one editor group where replacing a tab swaps it in place. */
	function createComposer(initialDraft: ISession) {
		const hosts: Record<string, string> = { 'agenthost-a': 'host-a', 'agenthost-b': 'host-b' };
		const newSession = observableValue<ISession | undefined>('draft', initialDraft);
		const onWillOpenEditor = store.add(new Emitter<IEditorWillOpenEvent>());
		const onDidReplaceNewDraftSession = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const onDidReplaceSession = store.add(new Emitter<{ from: ISession; to: ISession }>());
		const tabs: BrowserEditorInput[] = [];
		const group = upcastPartial<IEditorGroup>({
			contains: editor => tabs.includes(editor as BrowserEditorInput),
			isPinned: () => true,
			isSticky: () => false,
			isActive: () => false,
			replaceEditors: async ([{ editor, replacement }]) => {
				tabs[tabs.indexOf(editor as BrowserEditorInput)] = replacement as BrowserEditorInput;
			},
		});
		const created: BrowserEditorInput[] = [];
		const browserView = upcastPartial<IBrowserViewWorkbenchService>({});
		const createInput = (data: IBrowserEditorInputData) => {
			const input = new BrowserEditorInput(data, async () => { throw new Error('unused'); }, upcastPartial<IThemeService>({}), NullTelemetryService, browserView);
			created.push(input);
			return input;
		};
		createResolver({
			sessionsManagement: { newSession, onDidReplaceNewDraftSession: onDidReplaceNewDraftSession.event, onDidReplaceSession: onDidReplaceSession.event },
			providers: {
				getProvider: <T extends ISessionsProvider>(id: string) => upcastPartial<IAgentHostSessionsProvider>({ id, remoteAddress: hosts[id] }) as unknown as T,
			},
			connections: { resolveSessionResourceIdentity: () => undefined },
			browserView: { getOrCreateLazy: createInput },
			editor: { onWillOpenEditor: onWillOpenEditor.event },
			editorGroups: { groups: [group] },
			configuration: new TestConfigurationService({ workbench: { browser: { enableRemoteProxy: true } } }),
		});
		const open = (id: string, session: IBrowserViewSessionRequest, associatedResource?: URI) => {
			const input = createInput({ id, url: associatedResource?.toString() ?? `http://${id}/`, session, associatedResource });
			onWillOpenEditor.fire({ editor: input, groupId: 0 });
			tabs.push(input);
			return input;
		};
		return {
			newSession, onWillOpenEditor, onDidReplaceNewDraftSession, onDidReplaceSession, tabs, created, createInput, open,
			dispose: () => created.forEach(input => input.dispose(true)),
		};
	}

	const affinity = (authority: string, folder: string) => JSON.stringify([authority, extUri.getComparisonKey(URI.file(folder))]);
	const hostA = agentHostAuthority('host-a');
	const hostB = agentHostAuthority('host-b');

	test('moves tabs opened from the composer with their own draft, keeping their storage scope', async () => {
		const draftA = session('draftA', 'agenthost-a', '/repo');
		const draftB = session('draftB', 'agenthost-b', '/repo');
		const draftC = session('draftC', 'agenthost-b', '/other');
		const started = session('started', 'agenthost-b', '/repo');
		const { newSession, onWillOpenEditor, onDidReplaceNewDraftSession, onDidReplaceSession, tabs, created, createInput, open } = createComposer(draftA);

		open('page', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostA, '/repo'), network: { authority: hostA } });
		open('global', { scope: BrowserViewStorageScope.Global });
		open('ephemeral', { scope: BrowserViewStorageScope.Ephemeral, network: { authority: hostA } });
		const file = URI.file('/repo/index.html');
		open('file', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostA, '/repo'), network: { authority: hostA } }, file);
		const existing = createInput({ id: 'existing', url: 'http://existing/' });
		tabs.push(existing);
		// Activating a tab that is already open does not make it follow the draft.
		onWillOpenEditor.fire({ editor: existing, groupId: 0 });

		// The draft moves to another host, then starts in the background while the composer opens a new draft.
		onDidReplaceNewDraftSession.fire({ from: draftA, to: draftB });
		await timeout(0);
		const afterReplace = tabs.map(tab => [tab.url, tab.session]);
		const replacedFile = tabs.find(tab => tab.url === file.toString());
		const fileAssociation = replacedFile && [replacedFile.isDisposed(), replacedFile.associatedResource?.toString()];
		newSession.set(undefined, undefined);
		newSession.set(draftC, undefined);
		open('next', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostB, '/other'), network: { authority: hostB } });
		onDidReplaceSession.fire({ from: draftB, to: started });
		await timeout(0);

		try {
			const moved = [
				['http://page/', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostB, '/repo'), network: { authority: hostB } }],
				// Global storage never uses a remote network, so the tab is not recreated.
				['http://global/', { scope: BrowserViewStorageScope.Global }],
				['http://ephemeral/', { scope: BrowserViewStorageScope.Ephemeral, network: { authority: hostB } }],
				[file.toString(), { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostB, '/repo'), network: { authority: hostB } }],
				['http://existing/', undefined],
			];
			assert.deepStrictEqual({ afterReplace, fileAssociation, afterStart: tabs.map(tab => [tab.url, tab.session]) }, {
				afterReplace: moved,
				// The recreated tab still belongs to its file.
				fileAssociation: [false, file.toString()],
				// Starting on the same host and folders changes nothing, and the new draft's tab stays with that draft.
				afterStart: [...moved, ['http://next/', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostB, '/other'), network: { authority: hostB } }]],
			});
			assert.strictEqual(created.filter(input => !input.isDisposed()).length, tabs.length);
		} finally {
			for (const input of created) {
				input.dispose(true);
			}
		}
	});

	test('moves tabs with a draft replaced without an event, and leaves hidden tabs untouched', async () => {
		const draft = session('draft', 'agenthost-a', '/repo');
		const quickChat = session('quick', 'agenthost-b');
		const started = session('started', 'agenthost-b', '/repo');
		const composer = createComposer(draft);
		const shown = composer.open('shown', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostA, '/repo'), network: { authority: hostA } });
		const hidden = composer.open('hidden', { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostA, '/repo'), network: { authority: hostA } });
		// Hidden with its session's other editors, as when the user switches to another session.
		composer.tabs.splice(composer.tabs.indexOf(hidden), 1);

		// The composer switches the draft to a quick chat on another host, which fires no replacement event.
		composer.newSession.set(quickChat, undefined);
		await timeout(0);
		const afterQuickChat = composer.tabs.map(tab => [tab.url, tab.session]);
		composer.onDidReplaceSession.fire({ from: quickChat, to: started });
		await timeout(0);

		try {
			assert.deepStrictEqual({ afterQuickChat, shownReplaced: shown.isDisposed(), hidden: [hidden.isDisposed(), hidden.session] }, {
				// A workspace-less quick chat has no storage partition.
				afterQuickChat: [['http://shown/', { scope: BrowserViewStorageScope.Workspace, network: { authority: hostB } }]],
				shownReplaced: true,
				hidden: [false, { scope: BrowserViewStorageScope.Workspace, affinity: affinity(hostA, '/repo'), network: { authority: hostA } }],
			});
		} finally {
			composer.dispose();
		}
	});
});
