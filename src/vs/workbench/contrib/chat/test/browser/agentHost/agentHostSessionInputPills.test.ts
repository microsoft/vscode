/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
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
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { AgentHostSessionInputPills, getAgentHostSessionBrowserOwnerIds, getAgentHostSessionPillMetadata, resolveAgentHostSessionChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { ISessionChatPillVisibilityService } from '../../../common/sessionChatPills.js';
import { chatPersistentContentVisibleClass, ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';

class StaticAgentConnection extends mock<IAgentConnection>() {
	readonly requested: Array<{ kind: StateComponents; resource: URI }> = [];

	constructor(private readonly values: ReadonlyMap<StateComponents, SessionState | ChangesetState>) {
		super();
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		this.requested.push({ kind, resource });
		const value = this.values.get(kind) as ComponentToState[T];
		return {
			object: {
				value,
				verifiedValue: value,
				onDidChange: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
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
				'https://github.com/microsoft/vscode/pull/1',
				'https://github.com/microsoft/vscode/pull/2',
			],
			issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			artifactIds: ['website'],
			referenceIds: ['issue-reference', 'resource'],
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
		const [clipboardService, configurationService, contextMenuService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IContextMenuService),
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
			contextMenuService,
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
			connections: [{ authority: 'local', address: undefined, name: 'Local', isAmbient: true, connection }],
			resolveSessionResource: () => ({
				connection,
				connectionAuthority: 'local',
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
		const [clipboardService, configurationService, contextMenuService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IContextMenuService),
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
			contextMenuService,
			editorService,
			instantiationService,
			openerService,
			visibility,
		));
		const row = persistentContent.querySelector<HTMLElement>('.agent-host-session-input-pills');

		assert.deepStrictEqual({
			hidden: row?.classList.contains('hidden'),
			label: row?.querySelector('.chat-pill-label')?.textContent,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
			subscriptions: connection.requested.map(request => ({
				kind: request.kind,
				resource: request.resource.toString(),
			})),
		}, {
			hidden: false,
			label: '1 File',
			persistentContentVisible: true,
			persistentContentHeight: 28,
			subscriptions: [{
				kind: StateComponents.Session,
				resource: 'copilot:/session',
			}, {
				kind: StateComponents.Changeset,
				resource: 'copilot:/session/changeset/branch',
			}],
		});
	});
});
