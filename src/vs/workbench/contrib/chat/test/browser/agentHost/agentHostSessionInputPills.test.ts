/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { buildDefaultChatUri, buildSubagentChatUri, Changeset, ChatOriginKind, SessionState, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { AgentHostSessionInputPills, getAgentHostSessionBrowserOwnerIds, getAgentHostSessionPillMetadata, selectAgentHostSessionChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { ISessionChatPillVisibilityService } from '../../../common/sessionChatPills.js';
import { ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';

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

	test('prefers branch changes and ignores templated turn changesets as fallbacks', () => {
		const changesets: readonly Changeset[] = [
			{ label: 'Last Turn', uriTemplate: 'copilot:/session/changeset/turn/{turnId}', changeKind: ChangesetKind.Turn },
			{ label: 'Session Changes', uriTemplate: 'copilot:/session/changeset/session', changeKind: ChangesetKind.Session },
			{ label: 'Branch Changes', uriTemplate: 'copilot:/session/changeset/branch', changeKind: ChangesetKind.Branch },
		];

		assert.deepStrictEqual({
			preferred: selectAgentHostSessionChangeset(changesets)?.label,
			fallback: selectAgentHostSessionChangeset(changesets.slice(0, 2))?.label,
			turnOnly: selectAgentHostSessionChangeset(changesets.slice(0, 1))?.label,
		}, {
			preferred: 'Branch Changes',
			fallback: 'Session Changes',
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
			persistentContentHeight,
		}, {
			hidden: true,
			pillCount: 0,
			persistentContentHeight: undefined,
		});
	});
});
