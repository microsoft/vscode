/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, toDisposable, type IReference } from '../../../../../../base/common/lifecycle.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ISessionArtifact, SessionArtifactType, withSessionArtifacts } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { AgentHostArtifactRemovalCapabilityMetaKey } from '../../../../../../platform/agentHost/common/meta/agentHostArtifactRemovalMeta.js';
import { buildDefaultChatUri, buildSubagentChatUri, Changeset, ChangesetState, ChangesetStatus, ChatOriginKind, ChatState, ComponentToState, SessionState, StateComponents, withSessionGitHubState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IGitHubService } from '../../../../../../platform/github/common/githubService.js';
import { PullRequestSnapshot } from '../../../../../../platform/github/common/githubPullRequestService.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { IBrowserViewModel, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { type IChatWidgetViewModelChangeEvent } from '../../../browser/chat.js';
import { AgentHostSessionInputPills, getAgentHostSessionBrowserOwnerIds, getAgentHostSessionPillMetadata, resolveAgentHostChangeset } from '../../../browser/agentSessions/agentHost/agentHostSessionInputPills.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind, SessionChatPillVisibility } from '../../../common/sessionChatPills.js';
import { createSessionPullRequestPillData } from '../../../browser/sessionPullRequestPill.js';
import { chatPersistentContentVisibleClass, ChatWidget } from '../../../browser/widget/chatWidget.js';
import { ChatInputPart } from '../../../browser/widget/input/chatInputPart.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';

class StaticAgentConnection extends mock<IAgentConnection>() {
	readonly requested: Array<{ kind: StateComponents; resource: URI }> = [];
	readonly released: URI[] = [];
	readonly removeSessionArtifactCalls: { readonly session: URI; readonly artifactId: string }[] = [];
	override readonly initializeResult;
	removeSessionArtifactError: Error | undefined;
	private readonly emitters = new Map<StateComponents, Emitter<unknown>>();

	constructor(private readonly values: ReadonlyMap<StateComponents, SessionState | ChatState | ChangesetState>, supportsArtifactRemoval = false) {
		super();
		this.initializeResult = constObservable<InitializeResult | undefined>(supportsArtifactRemoval ? upcastPartial<InitializeResult>({
			_meta: { [AgentHostArtifactRemovalCapabilityMetaKey]: true },
		}) : undefined);
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
			dispose: () => { this.released.push(resource); },
		};
	}

	setState(kind: StateComponents, value: SessionState | ChatState | ChangesetState): void {
		(this.values as Map<StateComponents, SessionState | ChatState | ChangesetState>).set(kind, value);
		this.emitters.get(kind)?.fire(value);
	}

	override async removeSessionArtifact(session: URI, artifactId: string): Promise<void> {
		this.removeSessionArtifactCalls.push({ session, artifactId });
		if (this.removeSessionArtifactError) {
			throw this.removeSessionArtifactError;
		}
	}
}

class TestOpenerService extends mock<IOpenerService>() {
	readonly opened: { readonly resource: URI; readonly options: Parameters<IOpenerService['open']>[1] }[] = [];

	override async open(resource: URI | string, options?: Parameters<IOpenerService['open']>[1]): Promise<boolean> {
		this.opened.push({
			resource: typeof resource === 'string' ? URI.parse(resource) : resource,
			options,
		});
		return true;
	}
}

suite('AgentHostSessionInputPills', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const noProvisionalSessions = upcastPartial<IAgentHostUntitledProvisionalSessionService>({
		onDidChange: Event.None,
		get: () => undefined,
	});
	const notificationService = upcastPartial<INotificationService>({ error: () => { } });
	const labelService = upcastPartial<ILabelService>({
		getUriLabel: (resource, options) => options?.relative ? resource.path.replace(/^\/repo\/?/, '') : resource.fsPath,
	});
	const createInstantiationService = () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IGitHubService, upcastPartial<IGitHubService>({
			credentials: upcastPartial<IGitHubService['credentials']>({
				onDidInvalidate: Event.None,
				getCredential: () => new Promise(() => { }),
			}),
		}));
		return instantiationService;
	};
	const createRichGitHubService = (disposed: string[], options?: {
		readonly credentialState?: { fail: boolean; calls: number };
		readonly pullRequestSnapshots?: Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>;
	}) => upcastPartial<IGitHubService>({
		credentials: upcastPartial<IGitHubService['credentials']>({
			onDidInvalidate: Event.None,
			getCredential: async signal => {
				if (options?.credentialState) {
					options.credentialState.calls++;
					if (options.credentialState.fail) {
						throw new Error('offline');
					}
				}
				return {
					account: { host: 'github.com', accountId: 'test' },
					token: 'token',
					generation: 1,
					signal,
				};
			},
		}),
		query: upcastPartial<IGitHubService['query']>({
			subscribeIssue: ref => upcastPartial({
				resource: {
					ref,
					state: constObservable({
						status: 'ready',
						complete: true,
						value: {
							number: ref.number,
							title: 'Live issue title',
							body: 'Live issue body',
							url: `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`,
							state: 'closed',
							stateReason: 'completed',
							author: { login: 'issue-author' },
							assignees: [],
							labels: [],
							createdAt: '2026-09-01T12:00:00Z',
							updatedAt: '2026-09-02T00:00:00Z',
						},
					}),
				},
				update: () => { },
				refresh: async () => { },
				dispose: () => disposed.push(`issue:${ref.number}`),
			}),
		}),
		pullRequests: upcastPartial<IGitHubService['pullRequests']>({
			subscribePullRequest: (ref): ReturnType<IGitHubService['pullRequests']['subscribePullRequest']> => {
				const snapshot = observableValue<PullRequestSnapshot>(`pullRequestSnapshot.${ref.number}`, upcastPartial<PullRequestSnapshot>({
					core: {
						status: 'ready',
						complete: true,
						value: {
							repositoryNameWithOwner: `${ref.owner}/${ref.repo}`,
							number: ref.number,
							title: `Live pull request ${ref.number}`,
							body: 'Live pull request body',
							url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
							state: ref.number === 335387 ? 'merged' : 'open',
							draft: false,
							headSha: 'head',
							headRef: 'feature',
							baseSha: 'base',
							baseRef: 'main',
							author: { login: 'pr-author' },
							createdAt: '2026-09-01T12:00:00Z',
						},
					},
					checks: {
						status: 'ready',
						complete: true,
						value: { headSha: 'head', checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
					},
				}));
				options?.pullRequestSnapshots?.set(ref.number, snapshot);
				return upcastPartial({
					resource: upcastPartial({
						ref,
						snapshot,
					}),
					update: () => { },
					refresh: async () => { },
					dispose: () => disposed.push(`pullRequest:${ref.number}`),
				});
			},
		}),
	});

	test('Back to an untitled draft does not subscribe to its UI identity', () => {
		const instantiationService = createInstantiationService();
		const connection = new StaticAgentConnection(new Map());
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeSessionResolution: Event.None,
			resolveSessionResource: resource => ({
				connection,
				connectionAuthority: 'local',
				backendSession: resource.with({ scheme: 'copilotcli' }),
			}),
		});
		const browserViewService = upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
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
		const sessionResource = URI.parse('agent-host-copilotcli:/migrated');
		let viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		const viewModelChanged = store.add(new Emitter<IChatWidgetViewModelChangeEvent>());
		const widget = upcastPartial<ChatWidget>({
			inputPart: upcastPartial<ChatInputPart>({
				persistentContentContainerElement: persistentContent,
				registerChatPetHorizontalPlatformProvider: () => Disposable.None,
			}),
			onDidChangeViewModel: viewModelChanged.event,
			get viewModel() { return viewModel; },
			setPersistentContentHeight: () => { },
		});
		const provisionalChanged = store.add(new Emitter<URI>());
		let provisionalBackend: URI | undefined;
		const provisionalSessions = upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: provisionalChanged.event,
			get: () => provisionalBackend,
		});
		store.add(new AgentHostSessionInputPills(
			widget, false, connectionsService, browserViewService, clipboardService,
			configurationService, editorService, instantiationService, openerService, visibility,
			provisionalSessions,
			labelService,
			notificationService,
		));
		const draft = URI.parse('agent-host-copilotcli:/untitled-draft');
		viewModel = upcastPartial<ChatViewModel>({ sessionResource: draft });
		viewModelChanged.fire({ previousSessionResource: sessionResource, currentSessionResource: draft });

		const requested = () => [...new Set(connection.requested.map(request => request.resource.toString()))];
		const beforeProvisioning = requested();
		const releasedOnBack = connection.released.some(resource => resource.toString() === 'copilotcli:/migrated');
		provisionalBackend = URI.parse('copilotcli:/provisional');
		provisionalChanged.fire(draft);
		const afterProvisioning = requested();
		provisionalBackend = URI.parse('copilotcli:/replacement');
		provisionalChanged.fire(draft);
		const afterReplacement = requested();
		provisionalBackend = undefined;
		provisionalChanged.fire(draft);
		const releasedOnRetirement = connection.released.some(resource => resource.toString() === 'copilotcli:/replacement');
		viewModel = upcastPartial<ChatViewModel>({ sessionResource });
		viewModelChanged.fire({ previousSessionResource: draft, currentSessionResource: sessionResource });

		assert.deepStrictEqual({
			beforeProvisioning,
			releasedOnBack,
			afterProvisioning,
			afterReplacement,
			releasedOnRetirement,
			lastSubscription: connection.requested.at(-1)?.resource.toString(),
			invalidDraftSubscriptions: requested().filter(resource => resource.includes('untitled-')),
		}, {
			beforeProvisioning: ['copilotcli:/migrated'],
			releasedOnBack: true,
			afterProvisioning: ['copilotcli:/migrated', 'copilotcli:/provisional'],
			afterReplacement: ['copilotcli:/migrated', 'copilotcli:/provisional', 'copilotcli:/replacement'],
			releasedOnRetirement: true,
			lastSubscription: 'copilotcli:/migrated',
			invalidDraftSubscriptions: [],
		});
	});

	test('partitions GitHub links, artifacts, and references without duplication', () => {
		const entries: readonly ISessionArtifact[] = [
			{ id: 'created-pr', type: SessionArtifactType.PullRequest, label: 'Created PR', link: 'https://github.com/microsoft/vscode/pull/2', isGitHub: true, isArtifact: true },
			{ id: 'untitled-pr', type: SessionArtifactType.PullRequest, label: '', link: 'https://github.com/microsoft/vscode/pull/3', isGitHub: true, isArtifact: true },
			{ id: 'duplicate-pr', type: SessionArtifactType.PullRequest, label: 'Existing PR', link: 'https://github.com/microsoft/vscode/pull/1/', isGitHub: true, isArtifact: false },
			{ id: 'pr-reference', type: SessionArtifactType.PullRequest, label: 'Related PR', link: 'https://github.com/microsoft/vscode/pull/4', isGitHub: true, isArtifact: false },
			{ id: 'created-issue', type: SessionArtifactType.Issue, label: 'Created Issue', link: 'https://github.com/microsoft/vscode/issues/3', isGitHub: true, isArtifact: true },
			{ id: 'issue-reference', type: SessionArtifactType.Issue, label: 'Related Issue', link: 'https://github.com/microsoft/vscode/issues/4', isGitHub: true, isArtifact: false },
			{ id: 'website', type: SessionArtifactType.Website, label: 'Preview', link: 'https://example.com', isArtifact: true },
			{ id: 'resource', type: SessionArtifactType.Resource, label: 'Docs', uri: 'https://example.com/docs', isArtifact: false },
		];
		const meta = withSessionGitHubState(
			withSessionArtifacts(undefined, entries),
			'file:///repo',
			{
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
			},
		);

		const metadata = getAgentHostSessionPillMetadata(meta, 'file:///repo');

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			pullRequestTitles: [...metadata.pullRequestTitles],
			pullRequestArtifactIds: [...metadata.pullRequestArtifacts].map(([link, artifact]) => [link, artifact.id]),
			issueUrls: metadata.issueUrls,
			issueTitles: [...metadata.issueTitles],
			issueArtifactIds: [...metadata.issueArtifacts].map(([link, artifact]) => [link, artifact.id]),
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/3',
				'https://github.com/microsoft/vscode/pull/2',
				'https://github.com/microsoft/vscode/pull/1',
			],
			pullRequestTitles: [['https://github.com/microsoft/vscode/pull/2', 'Created PR']],
			pullRequestArtifactIds: [
				['https://github.com/microsoft/vscode/pull/3', 'untitled-pr'],
				['https://github.com/microsoft/vscode/pull/2', 'created-pr'],
			],
			issueUrls: ['https://github.com/microsoft/vscode/issues/3'],
			issueTitles: [['https://github.com/microsoft/vscode/issues/3', 'Created Issue']],
			issueArtifactIds: [['https://github.com/microsoft/vscode/issues/3', 'created-issue']],
			artifactIds: ['website'],
			// Only artifacts are promoted; references stay listed newest first, even when the pull request pill shows their link.
			referenceIds: ['resource', 'issue-reference', 'pr-reference', 'duplicate-pr'],
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

		const metadata = getAgentHostSessionPillMetadata(withSessionArtifacts(undefined, entries), undefined);

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			pullRequestTitles: [...metadata.pullRequestTitles],
			pullRequestArtifactIds: [...metadata.pullRequestArtifacts].map(([link, artifact]) => [link, artifact.id]),
			issueUrls: metadata.issueUrls,
			issueTitles: [...metadata.issueTitles],
			issueArtifactIds: [...metadata.issueArtifacts].map(([link, artifact]) => [link, artifact.id]),
			artifactIds: metadata.artifacts.map(artifact => artifact.id),
			referenceIds: metadata.references.map(reference => reference.id),
		}, {
			pullRequestUrls: [
				'https://github.com/microsoft/vscode/pull/2',
				'https://github.com/microsoft/vscode/pull/1',
			],
			pullRequestTitles: [
				['https://github.com/microsoft/vscode/pull/2', 'New PR'],
				['https://github.com/microsoft/vscode/pull/1', 'Old PR'],
			],
			pullRequestArtifactIds: [
				['https://github.com/microsoft/vscode/pull/2', 'new-pr'],
				['https://github.com/microsoft/vscode/pull/1', 'old-pr'],
			],
			issueUrls: [
				'https://github.com/microsoft/vscode/issues/2',
				'https://github.com/microsoft/vscode/issues/1',
			],
			issueTitles: [
				['https://github.com/microsoft/vscode/issues/2', 'New Issue'],
				['https://github.com/microsoft/vscode/issues/1', 'Old Issue'],
			],
			issueArtifactIds: [
				['https://github.com/microsoft/vscode/issues/2', 'new-issue'],
				['https://github.com/microsoft/vscode/issues/1', 'old-issue'],
			],
			artifactIds: ['new-website', 'old-website'],
			referenceIds: ['new-reference', 'old-reference'],
		});
	});

	test('keeps the newest artifact and title for duplicate GitHub links', () => {
		const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/1';
		const issueUrl = 'https://github.com/microsoft/vscode/issues/2';
		const entries: readonly ISessionArtifact[] = [
			{ id: 'old-pr', type: SessionArtifactType.PullRequest, label: 'Old PR', link: pullRequestUrl, isGitHub: true, isArtifact: true },
			{ id: 'old-issue', type: SessionArtifactType.Issue, label: 'Old Issue', link: issueUrl, isGitHub: true, isArtifact: true },
			{ id: 'new-pr', type: SessionArtifactType.PullRequest, label: 'New PR', link: `${pullRequestUrl}/`, isGitHub: true, isArtifact: true },
			{ id: 'new-issue', type: SessionArtifactType.Issue, label: 'New Issue', link: `${issueUrl}/`, isGitHub: true, isArtifact: true },
		];
		const metadata = getAgentHostSessionPillMetadata(withSessionArtifacts(undefined, entries), undefined);

		assert.deepStrictEqual({
			pullRequestUrls: metadata.pullRequestUrls,
			pullRequestTitle: metadata.pullRequestTitles.get(pullRequestUrl),
			pullRequestArtifactId: metadata.pullRequestArtifacts.get(pullRequestUrl)?.id,
			issueUrls: metadata.issueUrls,
			issueTitle: metadata.issueTitles.get(issueUrl),
			issueArtifactId: metadata.issueArtifacts.get(issueUrl)?.id,
		}, {
			pullRequestUrls: [`${pullRequestUrl}/`],
			pullRequestTitle: 'New PR',
			pullRequestArtifactId: 'new-pr',
			issueUrls: [`${issueUrl}/`],
			issueTitle: 'New Issue',
			issueArtifactId: 'new-issue',
		});
	});

	test('renders rich GitHub metadata in editor session pills', async () => {
		const instantiationService = createInstantiationService();
		const disposedSubscriptions: string[] = [];
		const credentialState = { fail: false, calls: 0 };
		const pullRequestSnapshots = new Map<number, ReturnType<typeof observableValue<PullRequestSnapshot>>>();
		instantiationService.stub(IGitHubService, createRichGitHubService(disposedSubscriptions, { credentialState, pullRequestSnapshots }));
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const issueUrl = 'https://github.com/microsoft/vscode/issues/335383';
		const firstPullRequestUrl = 'https://github.com/microsoft/vscode/pull/335387';
		const secondPullRequestUrl = 'https://github.com/microsoft/vscode/pull/332982';
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				_meta: withSessionArtifacts(undefined, [
					{
						id: 'issue',
						type: SessionArtifactType.Issue,
						label: 'Agent Window issue pill discards the recorded issue title',
						link: issueUrl,
						isGitHub: true,
						isArtifact: true,
					},
					{
						id: 'first-pr',
						type: SessionArtifactType.PullRequest,
						label: 'sessions: preserve recorded issue titles in pills',
						link: firstPullRequestUrl,
						isGitHub: true,
						isArtifact: true,
					},
					{
						id: 'second-pr',
						type: SessionArtifactType.PullRequest,
						label: 'Chat: unify Agent Host status pills across chat surfaces',
						link: secondPullRequestUrl,
						isGitHub: true,
						isArtifact: true,
					},
				]),
			} as unknown as SessionState],
		]), true);
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
			getKnownBrowserViews: () => new Map(),
		});
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		let dropdownItems: readonly IActionListItem<object>[] = [];
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			show: (_user, _supportsPreview, items) => {
				dropdownItems = items as readonly IActionListItem<object>[];
			},
			hide: () => { },
			updateItems: items => {
				dropdownItems = items as readonly IActionListItem<object>[];
			},
			focusItemById: () => { },
		}));
		const [clipboardService, configurationService, editorService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
		] as const);
		const openerService = new TestOpenerService();

		const pills = store.add(new AgentHostSessionInputPills(
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
			noProvisionalSessions,
			labelService,
			notificationService,
		));
		await timeout(0);

		const buttons = [...persistentContent.querySelectorAll<HTMLElement>('.chat-dropdown-pill-button')];
		const [pullRequestButton, issueButton] = buttons;
		const pullRequestSnapshot = pullRequestSnapshots.get(332982)!;
		const currentSnapshot = pullRequestSnapshot.get();
		pullRequestSnapshot.set({
			...currentSnapshot,
			checks: {
				status: 'ready',
				complete: true,
				value: {
					headSha: 'head',
					checks: [{ id: 'check', type: 'checkRun', name: 'Build', status: 'COMPLETED', conclusion: 'SUCCESS' }],
					requirednessComplete: true,
					expectedSuites: [],
					expectedSuitesComplete: true,
				},
			},
		}, undefined);
		await timeout(0);
		pullRequestButton?.click();
		const checksDescription = dropdownItems.find(item => item.item && (item.item as { id?: string }).id?.endsWith('/332982'))?.ariaDescription;
		pullRequestSnapshot.set({
			...pullRequestSnapshot.get(),
			core: {
				...pullRequestSnapshot.get().core,
				value: {
					...pullRequestSnapshot.get().core.value!,
					headSha: 'new-head',
				},
			},
		}, undefined);
		await timeout(0);
		const staleChecksDescription = dropdownItems.find(item => item.item && (item.item as { id?: string }).id?.endsWith('/332982'))?.ariaDescription;
		const pullRequestDropdownItems = dropdownItems;
		const pullRequestHoverItem = pullRequestDropdownItems.find(item => typeof item.hover?.content === 'function');
		const pullRequestHover = pullRequestHoverItem?.hover?.content;
		const pullRequestHoverElement = typeof pullRequestHover === 'function' ? pullRequestHover() : undefined;
		if (pullRequestHoverElement instanceof HTMLElement) {
			document.body.appendChild(pullRequestHoverElement);
			store.add(toDisposable(() => pullRequestHoverElement.remove()));
		}
		const focusedControl = pullRequestHoverItem?.hover?.getTabbableElements?.()[0];
		focusedControl?.focus();
		const refreshedPullRequestHoverElement = typeof pullRequestHover === 'function' ? pullRequestHover() : undefined;
		const refreshedFocusedControl = pullRequestHoverItem?.hover?.getTabbableElements?.()[0];
		const pullRequestHoverCache = Reflect.get(pills, '_pullRequestHoverCache') as ReadonlyMap<string, object>;
		const cachedHoverCount = pullRequestHoverCache.size;
		const gitHubReferenceResolver = Reflect.get(pills, '_gitHubReferenceResolver') as {
			getIssue(target: { owner: string; repo: string; number: number }): IObservable<{ title: string } | undefined>;
		};
		credentialState.fail = true;
		const recoveredIssue = gitHubReferenceResolver.getIssue({ owner: 'microsoft', repo: 'vscode', number: 999 });
		await timeout(0);
		credentialState.fail = false;
		gitHubReferenceResolver.getIssue({ owner: 'microsoft', repo: 'vscode', number: 999 });
		await timeout(0);
		issueButton?.click();
		const removePullRequest = pullRequestDropdownItems.flatMap(item => item.toolbarActions ?? []).find(action => action.label.startsWith('Remove '));
		await removePullRequest?.run();
		const presentation = {
			pullRequests: {
				label: pullRequestButton?.querySelector('.chat-pill-label')?.textContent,
				ariaLabel: pullRequestButton?.getAttribute('aria-label'),
				dropdownLabels: pullRequestDropdownItems.map(item => item.label ?? ''),
				hoverClassName: pullRequestHoverElement instanceof HTMLElement ? pullRequestHoverElement.className : undefined,
				hoverText: pullRequestHoverElement instanceof HTMLElement ? pullRequestHoverElement.textContent : undefined,
				actionLabels: pullRequestDropdownItems.flatMap(item => item.toolbarActions ?? []).map(action => action.label),
			},
			issue: {
				label: issueButton?.querySelector('.chat-pill-label')?.textContent,
				ariaLabel: issueButton?.getAttribute('aria-label'),
				ariaDescription: issueButton?.getAttribute('aria-description'),
			},
			opened: openerService.opened.map(({ resource, options }) => ({ resource: resource.toString(true), options })),
			removed: connection.removeSessionArtifactCalls.map(({ session, artifactId }) => ({ session: session.toString(), artifactId })),
		};
		connection.setState(StateComponents.Session, {
			defaultChat: buildDefaultChatUri(backendSession),
			chats: [],
			_meta: withSessionArtifacts(undefined, []),
		} as unknown as SessionState);
		await timeout(0);

		assert.deepStrictEqual({
			...presentation,
			disposedSubscriptions: disposedSubscriptions.sort(),
			cachedHoverCount,
			retainedHoverCount: pullRequestHoverCache.size,
			checksDescription,
			staleChecksDescription,
			credentialRecovery: {
				calls: credentialState.calls,
				title: recoveredIssue.get()?.title,
			},
			hoverRefresh: {
				rootPreserved: refreshedPullRequestHoverElement === pullRequestHoverElement,
				controlReplaced: refreshedFocusedControl !== focusedControl,
				focusPreserved: document.activeElement === refreshedFocusedControl,
			},
		}, {
			pullRequests: {
				label: '2 Pull Requests',
				ariaLabel: 'Show 2 pull requests',
				dropdownLabels: [
					'Pull Requests',
					'Live pull request 332982',
					'Live pull request 335387',
				],
				hoverClassName: 'sessions-pr-hover compact',
				hoverText: 'microsoft/vscodeon Sep 1Live pull request 332982 #332982OpenLive pull request bodymain←feature@pr-author opened this pull request',
				actionLabels: [
					'Copy Pull Request URL',
					'Remove Artifact Chat: unify Agent Host status pills across chat surfaces from Session',
					'Copy Pull Request URL',
					'Remove Artifact sessions: preserve recorded issue titles in pills from Session',
				],
			},
			issue: {
				label: 'Live issue title',
				ariaLabel: 'Open Issue #335383: Live issue title',
				ariaDescription: `Closed. ${issueUrl}`,
			},
			opened: [{
				resource: issueUrl,
				options: { openExternal: true, allowContributedOpeners: true, fromUserGesture: true },
			}],
			removed: [{ session: backendSession.toString(), artifactId: 'second-pr' }],
			disposedSubscriptions: ['issue:335383', 'issue:999', 'pullRequest:332982', 'pullRequest:335387'],
			cachedHoverCount: 1,
			retainedHoverCount: 0,
			checksDescription: `Open. Checks passed. ${secondPullRequestUrl}`,
			staleChecksDescription: `Open. ${secondPullRequestUrl}`,
			credentialRecovery: {
				calls: 5,
				title: 'Live issue title',
			},
			hoverRefresh: {
				rootPreserved: true,
				controlReplaced: true,
				focusPreserved: true,
			},
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
			preferred: resolveAgentHostChangeset(backendSession, changesets, ChangesetKind.Session),
			fallback: resolveAgentHostChangeset(backendSession, changesets.slice(0, 2), ChangesetKind.Branch),
			turnOnly: resolveAgentHostChangeset(backendSession, changesets.slice(0, 1), ChangesetKind.Session),
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
		const instantiationService = createInstantiationService();
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
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
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
			noProvisionalSessions,
			labelService,
			notificationService,
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

	test('uses cached recomputing files in floating persistent content from a legacy session catalogue', () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const backendChat = URI.parse(buildDefaultChatUri(backendSession));
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChatState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: backendChat.toString(),
				chats: [],
				changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
			} as unknown as SessionState],
			[StateComponents.Chat, {} as ChatState],
			[StateComponents.Changeset, {
				status: ChangesetStatus.Computing,
				files: [],
			} as unknown as ChangesetState],
		]));
		const cachedFiles: ChangesetState['files'] = [{
			id: 'change',
			edit: {
				after: { uri: URI.file('/changed.ts').toString(), content: { uri: 'git-blob://after' } },
				diff: { added: 3, removed: 1 },
			},
		}];
		const otherConnection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChatState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: backendChat.toString(),
				chats: [],
				changesets: [{ label: 'Branch Changes', uriTemplate: 'changeset/branch', changeKind: ChangesetKind.Branch }],
			} as unknown as SessionState],
			[StateComponents.Chat, {} as ChatState],
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
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
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
			noProvisionalSessions,
			labelService,
			notificationService,
		));
		const row = persistentContent.querySelector<HTMLElement>('.agent-host-session-input-pills');
		const initial = {
			hidden: row?.classList.contains('hidden'),
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Recomputing,
			files: cachedFiles,
		} as ChangesetState);
		const button = row?.querySelector('.chat-pill-button');
		const recomputing = {
			hidden: row?.classList.contains('hidden'),
			label: row?.querySelector('.chat-pill-label')?.textContent,
			persistentContentVisible: persistentContent.classList.contains(chatPersistentContentVisibleClass),
			persistentContentHeight,
		};
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Computing,
			files: [],
		} as ChangesetState);
		const computing = {
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
			files: cachedFiles,
		} as ChangesetState);
		connection.setState(StateComponents.Changeset, {
			status: ChangesetStatus.Computing,
			files: [],
		} as ChangesetState);
		currentConnection = otherConnection;
		connectionAuthority = 'remote';
		resolutionChanged.fire();

		assert.deepStrictEqual({
			initial,
			recomputing,
			computing,
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
			initial: {
				hidden: true,
				persistentContentVisible: false,
				persistentContentHeight: undefined,
			},
			recomputing: {
				hidden: false,
				label: '1 File',
				persistentContentVisible: true,
				persistentContentHeight: 28,
			},
			computing: {
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
				kind: StateComponents.Chat,
				resource: backendChat.toString(),
			}, {
				kind: StateComponents.Changeset,
				resource: `${backendSession.toString()}/changeset/branch`,
			}],
		});
	});

	test('matches the Agents Window pull request summary presentation', async () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				workingDirectories: ['file:///repo'],
				_meta: withSessionGitHubState(undefined, 'file:///repo', {
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
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		const filterActions = createSessionPullRequestPillData(constObservable([]), visibility.pullRequests).getContextMenuActions();
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		const [clipboardService, configurationService, editorService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IClipboardService),
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
		] as const);
		const openerService = new TestOpenerService();

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
			noProvisionalSessions,
			labelService,
			notificationService,
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
		await filterActions[1].run();
		const filteredLabel = persistentContent.querySelector('.chat-pill-label')?.textContent;
		await filterActions[0].run();
		connection.setState(StateComponents.Session, {
			defaultChat: buildDefaultChatUri(backendSession),
			chats: [],
			workingDirectories: ['file:///repo'],
			_meta: withSessionGitHubState(undefined, 'file:///repo', {
				pullRequestUrls: ['https://github.com/microsoft/vscode/pull/1'],
				pullRequestState: 'merged',
				pullRequestStateUrl: 'https://github.com/microsoft/vscode/pull/1',
			}),
		} as unknown as SessionState);
		const singleButton = persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button');
		const singleIcon = singleButton?.querySelector<HTMLElement>('.chat-pill-icon');
		const single = {
			buttonPreserved: singleButton === multiple.button,
			label: singleButton?.querySelector('.chat-pill-label')?.textContent,
			iconClass: singleIcon?.classList.contains('codicon-git-pull-request-done'),
			iconColor: singleIcon?.style.color,
			hasChevron: singleButton?.querySelector('.chat-pill-chevron') !== null,
		};
		singleButton?.click();
		await filterActions[1].run();

		assert.deepStrictEqual({
			multiple,
			filteredLabel,
			single,
			opened: openerService.opened.map(({ resource, options }) => ({ resource: resource.toString(true), options })),
			filteredOnly: persistentContent.querySelector('.chat-dropdown-pill-button'),
			canConfigure: persistentContent.querySelector('.chat-pills-row')?.classList.contains('empty'),
		}, {
			multiple: {
				button,
				label: '3 Pull Requests',
				iconClass: true,
				iconColor: 'var(--vscode-charts-green)',
				hasChevron: true,
			},
			filteredLabel: '2 Pull Requests',
			single: {
				buttonPreserved: true,
				label: '#1',
				iconClass: true,
				iconColor: 'var(--vscode-charts-purple)',
				hasChevron: false,
			},
			opened: [{
				resource: 'https://github.com/microsoft/vscode/pull/1',
				options: { openExternal: true, allowContributedOpeners: true, fromUserGesture: true },
			}],
			filteredOnly: null,
			canConfigure: true,
		});
	});

	test('offers canonical copy actions for generic references while Browsers is hidden', async () => {
		const instantiationService = createInstantiationService();
		const sessionResource = URI.parse('agent-host-copilot:/session');
		const backendSession = URI.parse('copilot:/session');
		const website = URI.parse('https://example.com/preview');
		const connection = new StaticAgentConnection(new Map<StateComponents, SessionState | ChangesetState>([
			[StateComponents.Session, {
				defaultChat: buildDefaultChatUri(backendSession),
				chats: [],
				_meta: withSessionArtifacts(undefined, [
					{
						id: 'preview',
						type: SessionArtifactType.Website,
						label: 'Preview',
						link: website.toString(),
						isArtifact: false,
					},
					{
						id: 'file',
						type: SessionArtifactType.File,
						label: 'README',
						uri: 'file:///repo/README.md',
						isArtifact: false,
					},
					{
						id: 'resource',
						type: SessionArtifactType.Resource,
						label: 'Chat settings',
						uri: 'vscode://settings/chat',
						isArtifact: false,
					},
					{
						id: 'commit',
						type: SessionArtifactType.Commit,
						label: 'Commit',
						link: 'https://github.com/microsoft/vscode/commit/abc123',
						commitHash: 'abc123',
						isArtifact: false,
					},
				]),
			} as unknown as SessionState],
		]), true);
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
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
		visibility.hide(SessionChatPillKind.Browsers);
		instantiationService.stub(ISessionChatPillVisibilityService, visibility);
		let dropdownActions: readonly IAction[] = [];
		let dropdownFooterActionLabels: readonly string[] = [];
		instantiationService.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			isVisible: false,
			show: (_user, _supportsPreview, items) => {
				dropdownActions = items.flatMap(item => item.toolbarActions ?? []);
				dropdownFooterActionLabels = items.flatMap(item => item.hover?.actions?.map(action => action.label) ?? []);
			},
			hide: () => { },
			updateItems: () => { },
			focusItemById: () => { },
		}));
		const clipboardService = new TestClipboardService();
		const [configurationService, editorService, openerService] = instantiationService.invokeFunction(accessor => [
			accessor.get(IConfigurationService),
			accessor.get(IEditorService),
			accessor.get(IOpenerService),
		] as const);

		const errors: string[] = [];
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
			noProvisionalSessions,
			labelService,
			upcastPartial<INotificationService>({ error: error => errors.push(String(error)) }),
		));
		persistentContent.querySelector<HTMLElement>('.chat-dropdown-pill-button')?.click();
		const copied: string[] = [];
		for (const action of dropdownActions.filter(action => action.label.startsWith('Copy '))) {
			await action.run();
			copied.push(await clipboardService.readText());
		}
		connection.removeSessionArtifactError = new Error('write failed');
		await dropdownActions.find(action => action.label === 'Remove Reference Preview from Session')?.run();

		assert.deepStrictEqual({
			pills: Array.from(persistentContent.querySelectorAll('.chat-pill-label')).map(label => label.textContent),
			empty: persistentContent.querySelector('.agent-host-session-input-pills')?.classList.contains('empty'),
			dropdownActionLabels: dropdownActions.map(action => action.label),
			dropdownFooterActionLabels,
			copied,
			removeCalls: connection.removeSessionArtifactCalls.map(({ session, artifactId }) => ({ session: session.toString(), artifactId })),
			errors,
		}, {
			pills: ['4 References'],
			empty: false,
			dropdownActionLabels: [
				'Copy Commit URL',
				'Remove Reference Commit from Session',
				'Copy Website URL',
				'Remove Reference Preview from Session',
				'Copy Path',
				'Remove Reference README from Session',
				'Copy URI',
				'Remove Reference Chat settings from Session',
			],
			dropdownFooterActionLabels: ['Copy Hash', 'Copy Relative Path'],
			copied: [
				'https://github.com/microsoft/vscode/commit/abc123',
				website.toString(true),
				URI.parse('file:///repo/README.md').fsPath,
				'vscode://settings/chat',
			],
			removeCalls: [{ session: backendSession.toString(), artifactId: 'preview' }],
			errors: ['Could not remove Preview from this session: write failed'],
		});
	});

	test('hides the session pills in a subagent chat', () => {
		const instantiationService = createInstantiationService();
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
		const visibility = store.add(instantiationService.createInstance(SessionChatPillVisibility));
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
			noProvisionalSessions,
			labelService,
			notificationService,
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
