/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { buildDefaultChatUri, buildSubagentChatUri, Changeset, ChangesetState, ChangesetStatus, ChatOriginKind, ComponentToState, SessionState, StateComponents, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { type IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { AgentHostSessionInputPills, getAgentHostSessionBrowserOwnerIds, getAgentHostSessionPillMetadata, resolveAgentHostSessionChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind } from '../../../common/sessionChatPills.js';
import { chatPersistentContentVisibleClass, ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';

class StaticAgentConnection extends mock<IAgentConnection>() {
	readonly requested: Array<{ kind: StateComponents; resource: URI }> = [];
	private readonly emitters = new Map<StateComponents, Emitter<unknown>>();

	constructor(private readonly values: ReadonlyMap<StateComponents, SessionState | ChangesetState>) {
		super();
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		this.requested.push({ kind, resource });
		let emitter = this.emitters.get(kind);
		if (!emitter) {
			emitter = new Emitter<unknown>();
			this.emitters.set(kind, emitter);
		}
		const values = this.values;
		return {
			object: {
				get value() { return values.get(kind) as ComponentToState[T]; },
				get verifiedValue() { return values.get(kind) as ComponentToState[T]; },
				onDidChange: emitter.event as Event<ComponentToState[T]>,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
	}

	setState(kind: StateComponents, value: SessionState | ChangesetState): void {
		(this.values as Map<StateComponents, SessionState | ChangesetState>).set(kind, value);
		this.emitters.get(kind)?.fire(value);
	}
}

suite('AgentHostSessionInputPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('partitions GitHub links, artifacts, and references without duplication', () => {
		const entries: readonly ISessionArtifact[] = [
			{ id: 'created-pr', type: SessionArtifactType.PullRequest, label: 'Created PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, isArtifact: true },
			{ id: 'duplicate-pr', type: SessionArtifactType.PullRequest, label: 'Existing PR', link: 'https://github.com/microsoft/vscode/pull/1/', isGitHub: true, isArtifact: false },
			{ id: 'created-issue', type: SessionArtifactType.Issue, label: 'Created Issue', link: 'https://github.com/microsoft/vscode/issues/3', isGitHub: true, isArtifact: true },
			{ id: 'issue-reference', type: SessionArtifactType.Issue, label: 'Related Issue', link: 'https://github.com/microsoft/vscode/issues/4', isGitHub: true, isArtifact: false },
			{ id: 'website', type: SessionArtifactType.Website, label: 'Preview', link: 'https://example.com', isArtifact: true },
			{ id: 'resource', type: SessionArtifactType.Resource, label: 'Docs', uri: 'https://example.com/docs', isArtifact: false },
		];
		const meta = withSessionGitHubState(
			withSessionArtifacts(undefined, entries),
			{
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			},
		);

		const metadata = getAgentHostSessionPillMetadata(meta);

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			issueUrls: metadata.issueUrls,
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/2',
				'https://github.com/microsoft/vscode/pull/1',
			],
			issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			artifactIds: ['website'],
			// Newest first: `resource` was recorded after `issue-reference`.
			referenceIds: ['resource', 'issue-reference'],
		});
	});

	test('lists each pill newest first, within the section it belongs to', () => {
		const entries: readonly ISessionArtifact[] = [
			{ id: 'old-website', type: SessionArtifactType.Website, label: 'Old Preview', link: 'https://example.com/old', isArtifact: true },
			{ id: 'old-reference', type: SessionArtifactType.Resource, label: 'Old Docs', uri: 'https://example.com/old-docs', isArtifact: false },
			{ id: 'old-pr', type: SessionArtifactType.PullRequest, label: 'Old PR', link: 'https://github.com/microsoft/vscode/pull/1', isGitHub: true, isArtifact: true },
			{ id: 'old-issue', type: SessionArtifactType.Issue, label: 'Old Issue', link: 'https://github.com/microsoft/vscode/issues/1', isGitHub: true, isArtifact: true },
			{ id: 'new-website', type: SessionArtifactType.Website, label: 'New Preview', link: 'https://example.com/new', isArtifact: true },
			{ id: 'new-reference', type: SessionArtifactType.Resource, label: 'New Docs', uri: 'https://example.com/new-docs', isArtifact: false },
			{ id: 'new-pr', type: SessionArtifactType.PullRequest, label: 'New PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, isArtifact: true },
			{ id: 'new-issue', type: SessionArtifactType.Issue, label: 'New Issue', link: 'https://github.com/microsoft/vscode/issues/2', isGitHub: true, isArtifact: true },
		];

		const metadata = getAgentHostSessionPillMetadata(withSessionArtifacts(undefined, entries));

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			issueUrls: metadata.issueUrls,
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/2',
				'https://github.com/microsoft/vscode/pull/1',
			],
			issueUrls: [
				'https://github.com/microsoft/vscode/issues/2',
				'https://github.com/microsoft/vscode/issues/1',
			],
			artifactIds: ['new-website', 'old-website'],
			referenceIds: ['new-reference', 'old-reference'],
		});
	});

	test('resolves the configured session changeset and ignores templated entries', () => {
		const backendSession = URI.parse('ahp-session:/session');
		const changesets: readonly Changeset[] = [
			{ label: 'Last Turn', uriTemplate: 'changeset/turn/{turnId}', changeKind: ChangesetKind.Turn },
			{ label: 'Session Changes', uriTemplate: 'changeset/session', changeKind: ChangesetKind.Session },
			{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch },
		];

		assert.deepStrictEqual({
			preferred: resolveAgentHostSessionChangeset(backendSession, changesets, ChangesetKind.Session),
			fallback: resolveAgentHostSessionChangeset(backendSession, changesets.slice(0, 2), ChangesetKind.Branch),
			turnOnly: resolveAgentHostSessionChangeset(backendSession, changesets.slice(0, 1), ChangesetKind.Session),
		}, {
			preferred: {
				changeset: changesets[1],
				resource: URI.parse('ahp-session:/session/changeset/session'),
			},
			fallback: {
				changeset: changesets[1],
				resource: URI.parse('ahp-session:/session/changeset/session'),
			},
			turnOnly: undefined,
		});
	});

	test('includes browsers owned by direct tool-origin child chats', () => {
		const sessionResource = URI.parse('vscode-chat-session://agent-host/session');
		const backendSession = URI.parse('ahp-session://host/session');
		const parentChat = buildDefaultChatUri(backendSession);
		const childChat = buildSubagentChatUri(backendSession, 'tool-1');
		const unrelatedChildChat = buildSubagentChatUri(backendSession, 'tool-2');
		const childChatId = 'subagent/tool-1';
		const stateWithoutChild = {
			defaultChat: parentChat,
			chats: [],
		} as unknown as SessionState;
		const stateWithChild = {
			defaultChat: parentChat,
			chats: [{
				resource: childChat,
				origin: { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: 'tool-1' },
			}, {
				resource: unrelatedChildChat,
				origin: { kind: ChatOriginKind.Tool, chat: buildDefaultChatUri(URI.parse('ahp-session://host/other')), toolCallId: 'tool-2' },
			}],
		} as unknown as SessionState;
		const explicitQuery = new URLSearchParams();
		explicitQuery.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, childChat);
		const canonicalChildResource = sessionResource.with({ fragment: childChatId, query: null });
		const explicitChildResource = sessionResource.with({ fragment: childChatId, query: explicitQuery.toString() });

		const before = getAgentHostSessionBrowserOwnerIds(sessionResource, stateWithoutChild);
		const after = getAgentHostSessionBrowserOwnerIds(sessionResource, stateWithChild);

		assert.deepStrictEqual({
			before: [...before],
			after: [...after],
			hasCanonicalChild: after.has(canonicalChildResource.toString()),
			hasExplicitChild: after.has(explicitChildResource.toString()),
			hasUnrelatedChild: after.has(sessionResource.with({ fragment: 'subagent/tool-2', query: null }).toString()),
		}, {
			before: [sessionResource.toString()],
			after: [
				sessionResource.toString(),
				canonicalChildResource.toString(),
				explicitChildResource.toString(),
			],
			hasCanonicalChild: true,
			hasExplicitChild: true,
			hasUnrelatedChild: false,
		});
	});

	test('does not render pills for a Local chat input', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const sessionResource = URI.parse('vscode-chat-session://local/session');
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		let persistentContentHeight: number | undefined;
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: height => persistentContentHeight = height,
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => undefined,
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = upcastPartial<ISessionChatPillVisibilityService>({
			readHiddenKinds: () => new Set(),
			isVisible: () => true,
			hide: () => { },
			toggle: () => { },
		});
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
		));
		const row = persistentContent.querySelector<HTMLElement>('.agent-host-session-input-pills');

		assert.deepStrictEqual({
			hidden: row?.classList.contains('hidden'),
			pillCount: row?.querySelectorAll('.chat-pill-item').length,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		}, {
			hidden: true,
			pillCount: 0,
			persistentContentVisible: false,
			persistentContentHeight: undefined,
		});
	});

	test('marks floating persistent content visible when Agent Host pills have data', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
			} as unknown as SessionState],
			[StateComponents.Changeset, {
				status: ChangesetStatus.Ready,
				files: [{
					id: 'change',
					edit: {
						after: { uri: URI.file('/changed.ts').toString(), content: { uri: 'git-blob://after' } },
						diff: { added: 3, removed: 1 },
					},
				}],
			} as unknown as ChangesetState],
		]));
		const otherConnection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
			} as unknown as SessionState],
			[StateComponents.Changeset, {
				status: ChangesetStatus.Computing,
				files: [],
			} as unknown as ChangesetState],
		]));
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		let persistentContentHeight: number | undefined;
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: height => persistentContentHeight = height,
		});
		const resolutionChanged = new Emitter<void>();
		let currentConnection = connection;
		let connectionAuthority = 'local';
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: resolutionChanged.event,
			connections: [],
			resolveSessionResource: () => ({
				connection: currentConnection,
				connectionAuthority,
				backendSession,
				defaultChangesetKind: ChangesetKind.Branch,
			}),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = upcastPartial<ISessionChatPillVisibilityService>({
			readHiddenKinds: () => new Set(),
			isVisible: () => true,
			hide: () => { },
			toggle: () => { },
		});
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
		));
		const row = persistentContent.querySelector<HTMLElement>('.agent-host-session-input-pills');
		const button = row?.querySelector('.chat-pill-button');
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Computing,
			files: [],
		} as ChangesetState);
		const recomputing = {
			hidden: row?.classList.contains('hidden'),
			buttonPreserved: row?.querySelector('.chat-pill-button') === button,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Ready,
			files: [],
		} as ChangesetState);
		const readyEmpty = {
			hidden: row?.classList.contains('hidden'),
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Ready,
			files: [{
				id: 'change',
				edit: {
					after: { uri: URI.file('/changed.ts').toString(), content: { uri: 'git-blob://after' } },
					diff: { added: 3, removed: 1 },
				},
			}],
		} as ChangesetState);
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Computing,
			files: [],
		} as ChangesetState);
		currentConnection = otherConnection;
		connectionAuthority = 'remote';
		resolutionChanged.fire();

		assert.deepStrictEqual({
			recomputing,
			readyEmpty,
			otherConnection: {
				hidden: row?.classList.contains('hidden'),
				persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
				persistentContentHeight,
			},
			subscriptions: [...new Map(connection.requested.map(request => {
				const value = { kind: request.kind, resource: request.resource.toString() };
				return [`${value.kind}:${value.resource}`, value];
			})).values()],
		}, {
			recomputing: {
				hidden: false,
				buttonPreserved: true,
				persistentContentVisible: true,
				persistentContentHeight: 28,
			},
			readyEmpty: {
				hidden: true,
				persistentContentVisible: false,
				persistentContentHeight: undefined,
			},
			otherConnection: {
				hidden: true,
				persistentContentVisible: false,
				persistentContentHeight: undefined,
			},
			subscriptions: [{
				kind: StateComponents.Session,
				resource: 'copilot:/session',
			}, {
				kind: StateComponents.Changeset,
				resource: 'copilot:/session/changeset/branch',
			}],
		});
	});

	test('matches the Agents Window pull request summary presentation', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				_meta: withSessionGitHubState(undefined, {
					pullRequestUrls: [
						'https://github.com/microsoft/vscode/pull/1',
						'https://github.com/microsoft/vscode/pull/2',
						'https://github.com/microsoft/vscode/pull/3',
					],
					// Only pull request #1 is merged; the other entries must retain their open state.
					pullRequestState: 'merged',
					pullRequestStateUrl: 'https://github.com/microsoft/vscode/pull/1',
				}),
			} as unknown as SessionState],
		]));
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: () => { },
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [{ authority: 'local', address: undefined, name: 'Local', isAmbient: true, connection }],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = upcastPartial<ISessionChatPillVisibilityService>({
			readHiddenKinds: () => new Set(),
			isVisible: () => true,
			hide: () => { },
			toggle: () => { },
		});
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
		));
		const button = persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button');
		const icon = button?.querySelector<HTMLElement>('.chat-pill-icon');
		const multiple = {
			button,
			label: button?.querySelector('.chat-pill-label')?.textContent,
			iconClass: icon?.classList.contains('codicon-git-pull-request'),
			iconColor: icon?.style.color,
			hasChevron: button?.querySelector('.chat-pill-chevron') !== null,
		};
		connection.setState(StateComponents.Session, {
			defaultChat: buildDefaultChatUri(backendSession),
			chats: [],
			_meta: withSessionGitHubState(undefined, {
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				pullRequestState: 'merged',
				pullRequestStateUrl: 'https://github.com/microsoft/vscode/pull/1',
			}),
		} as unknown as SessionState);
		const singleButton = persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button');
		const singleIcon = singleButton?.querySelector<HTMLElement>('.chat-pill-icon');

		assert.deepStrictEqual({
			multiple,
			single: {
				buttonPreserved: singleButton === multiple.button,
				label: singleButton?.querySelector('.chat-pill-label')?.textContent,
				iconClass: singleIcon?.classList.contains('codicon-git-pull-request-done'),
				iconColor: singleIcon?.style.color,
				hasChevron: singleButton?.querySelector('.chat-pill-chevron') !== null,
			},
		}, {
			multiple: {
				button,
				label: '3 Pull Requests',
				iconClass: true,
				iconColor: 'var(--vscode-charts-green)',
				hasChevron: true,
			},
			single: {
				buttonPreserved: true,
				label: '#1',
				iconClass: true,
				iconColor: 'var(--vscode-charts-purple)',
				hasChevron: false,
			},
		});
	});

	test('keeps a matching website artifact visible while Browsers is hidden', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const website = URI.parse('https://example.com/preview');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				_meta: withSessionArtifacts(undefined, [{
					id: 'preview',
					type: SessionArtifactType.Website,
					label: 'Preview',
					link: website.toString(),
					isArtifact: true,
				}]),
			} as unknown as SessionState],
		]));
		const browserModel = upcastPartial<IBrowserViewModel>({
			owner: { type: 'agent', sessionId: sessionResource.toString() },
		});
		const browser = new class extends mock<BrowserEditorInput>() {
			override get id(): string { return 'preview-browser'; }
			override get model(): IBrowserViewModel { return browserModel; }
			override get url(): string { return website.toString(); }
			override get title(): string { return 'Preview'; }
			override readonly onDidChangeLabel = Event.None;
		}();
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: Event.None,
			viewModel: upcastPartial<ChatViewModel>({ sessionResource }),
			setPersistentContentHeight: () => { },
		});
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map([[browser.id, browser]]),
		});
		const visibility = upcastPartial<ISessionChatPillVisibilityService>({
			readHiddenKinds: () => new Set([SessionChatPillKind.Browsers]),
			isVisible: kind => kind !== SessionChatPillKind.Browsers,
			hide: () => { },
			toggle: () => { },
		});
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
		));

		assert.deepStrictEqual({
			pills: Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent),
			empty: persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('empty'),
		}, {
			pills: ['1 Artifact'],
			empty: false,
		});
	});

	test('hides the session pills in a subagent chat', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const defaultChat = buildDefaultChatUri(backendSession);
		const subagentChat = buildSubagentChatUri(backendSession, 'tool-1');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat,
				chats: [{
					resource: subagentChat,
					origin: { kind: ChatOriginKind.Tool, chat: defaultChat, toolCallId: 'tool-1' },
				}],
				_meta: withSessionArtifacts(undefined, [{
					id: 'preview',
					type: SessionArtifactType.Website,
					label: 'Preview',
					link: 'https://example.com/preview',
					isArtifact: true,
				}]),
			} as unknown as SessionState],
		]));
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: Event.None,
			onDidChangeSessionResolution: Event.None,
			connections: [],
			resolveSessionResource: () => ({ connection, connectionAuthority: 'local', backendSession }),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = upcastPartial<ISessionChatPillVisibilityService>({
			readHiddenKinds: () => new Set(),
			isVisible: () => true,
			hide: () => { },
			toggle: () => { },
		});
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);
		const persistentContent = document.createElement('div');
		document.body.appendChild(persistentContent);
		store.add(toDisposable(() => persistentContent.remove()));
		let persistentContentHeight: number | undefined;
		// The chat editor keeps one pills instance while its widget navigates
		// between the session and one of its subagent chats.
		let viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: viewModelChanged.event,
			get viewModel() { return viewModel; },
			setPersistentContentHeight: height => persistentContentHeight = height,
		});
		store.add(new AgentHostSessionInputPills(
			widget,
			false,
			connectionsService,
			browserViewService,
			clipboardService,
			configurationService,
			editorService,
			instantiationService,
			openerService,
			visibility,
		));
		const showChat = (resource: URI) => {
			const previousSessionResource = viewModel.sessionResource;
			viewModel = upcastPartial<ChatViewModel>({ sessionResource: resource });
			viewModelChanged.fire({ previousSessionResource, currentSessionResource: resource });
			return {
				pills: Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent),
				hidden: persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('hidden'),
				persistentContentHeight,
			};
		};
		const explicitQuery = new URLSearchParams();
		explicitQuery.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, subagentChat);

		assert.deepStrictEqual({
			session: showChat(sessionResource),
			// The subagent editor addresses its chat by query parameter, and by
			// fragment alone once the session state resolves the chat id.
			explicitSubagent: showChat(sessionResource.with({ fragment: 'subagent/tool-1', query: explicitQuery.toString() })),
			canonicalSubagent: showChat(sessionResource.with({ fragment: 'subagent/tool-1' })),
			backToSession: showChat(sessionResource),
		}, {
			session: { pills: ['1 Artifact'], hidden: false, persistentContentHeight: 28 },
			explicitSubagent: { pills: [], hidden: true, persistentContentHeight: undefined },
			canonicalSubagent: { pills: [], hidden: true, persistentContentHeight: undefined },
			backToSession: { pills: ['1 Artifact'], hidden: false, persistentContentHeight: 28 },
		});
	});
});
