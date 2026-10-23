/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../../base/browser/dom.js';
import { status } from '../../../../../../base/browser/ui/aria/aria.js';
import { isAuxiliaryWindow } from '../../../../../../base/browser/window.js';
import { toAction } from '../../../../../../base/common/actions.js';
import { distinct } from '../../../../../../base/common/arrays.js';
import { disposableTimeout, raceTimeout, SequencerByKey } from '../../../../../../base/common/async.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { structuralEquals } from '../../../../../../base/common/equals.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { getMediaMime } from '../../../../../../base/common/mime.js';
import { autorun, constObservable, derived, derivedObservableWithCache, derivedOpts, IObservable, IReader, ISettableObservable, observableFromEvent, observableSignal, observableSignalFromEvent, observableValue } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { format } from '../../../../../../base/common/strings.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID, AGENT_HOST_DISCARD_CHANGES_OPERATION_ID } from '../../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { isCopilotAgentHostProvider } from '../../../../../../platform/agentHost/common/agentHostSessionType.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { branchChangesetLabel, ChangesetKind, resolveChangesetUriTemplate, resolveChatChangesetCatalogue, selectDefaultChangeset, sessionChangesetLabel, uncommittedChangesetLabel, type DefaultChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { affectsAgentHostProviderPreference, isLocalAgentHostProviderDisabledByPolicy } from '../../../../../../platform/agentHost/common/agentService.js';
import { ISessionArtifact, isGitHubArtifactLink, readSessionArtifactsNewestFirst, SessionArtifactType } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { supportsAgentHostArtifactRemoval } from '../../../../../../platform/agentHost/common/meta/agentHostArtifactRemovalMeta.js';
import { type IAgentSubscription, observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { Changeset, ChangesetOperation, ChangesetOperationScope, ChangesetOperationStatus, ChangesetOperationTargetKind, ChangesetState, ChangesetStatus, ChatOriginKind, ChatState, DEFAULT_CHAT_ID, getAgentHostChatId, getSessionChatResource, getSessionRelatedPullRequestUrls, readSessionFolderGitHubState, readSessionGitHubState, SessionLifecycle, SessionState, SessionStatus, SessionSummaryMeta, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { getFileNamesMessage, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { GitHubIssue, GitHubIssueRef } from '../../../../../../platform/github/common/githubQueryService.js';
import { PullRequestCheck, PullRequestCore, PullRequestRef, PullRequestSnapshot } from '../../../../../../platform/github/common/githubPullRequestService.js';
import { IWorkbenchGitHubService } from '../../../../../services/github/common/githubService.js';
import { parseGitHubCommitTarget } from '../../../../../../platform/github/common/githubUrls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { observableConfigValue } from '../../../../../../platform/observable/common/platformObservableUtils.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, chatPillCopyHashHoverLabel, chatPillCopyUrlHoverLabel, chatPillRemoveArtifactHoverLabel, chatPillRemoveReferenceHoverLabel, getChatPillEntries, getChatPillResourceLocation, getChatReferencePillPresentation, IChatPillEntry, IChatPillSection, type ChatPillsCompactMode, withChatPillHoverLabel } from '../../../../../browser/chatPills.js';
import { chatChangesStatsEqual, EMPTY_CHAT_CHANGES_STATS, IChatChangesStats } from '../../../../../browser/chatChangesPill.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { browserViewUrlMatches, BrowserViewSharingState, getAgentBrowserViewsNewestFirst, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { CanvasesPillControl } from '../../../../canvases/browser/canvasesPillControl.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { computeAggregateIssueIcon, computeIssueIcon } from '../../../../../common/chatIssue.js';
import { computePullRequestIcon, getHighestPriorityPullRequestIcon } from '../../../../../common/chatPullRequest.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind, type IChatBackgroundShell } from '../../../common/sessionChatPills.js';
import { createCustomizationIndexObservable, createProgressiveChatCustomizations, type ICustomizationJobScheduler } from '../../../common/agentHostSessionCustomizations.js';
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatConfiguration } from '../../../common/constants.js';
import { isUntitledChatSession } from '../../../common/model/chatUri.js';
import { getLocalAgentHostSessionProvider } from './agentHostSessionUri.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { IChatSessionWorkingSetKeep, IChatSessionWorkingSetUndo, isSameSessionFileChange } from '../../widget/input/chatSessionWorkingSet.js';
import { chatPersistentContentVisibleClass, type ChatWidget } from '../../widget/chatWidget.js';
import { openChatTurnFile, previewKind } from '../../widget/chatTurnPills.js';
import { openChatFileChanges } from '../../editorChatResponseFileChangesService.js';
import { confirmUndoAllEdits } from '../../chatEditing/chatEditing.js';
import { ChatInputPills, StandardChatInputPillSources } from '../../chatInputPills.js';
import { ChatArtifactPillSource, mergeChatArtifactSections } from '../../chatArtifactPillSource.js';
import { SessionBackgroundShellsControl } from '../../sessionBackgroundShellsControl.js';
import { createSessionPullRequestPillData, type IChatPullRequestPillEntry } from '../../sessionPullRequestPill.js';
import { SessionCustomizations } from '../../sessionCustomizations.js';
import { createSessionSubagentsPillData, type IChatSubagentPillEntry } from '../../sessionSubagentsPill.js';
import { AgentHostBackgroundShellOutputs } from './agentHostBackgroundShells.js';
import { agentHostChangesetFileToEntryDiff } from './agentHostResponseFileChanges.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { GitHubCommitResolver } from '../../../../github/browser/githubCommitResolver.js';
import { createCommitResourceHover, createIssueResourceHover, createPullRequestResourceHover, getIssueResourceStatus, getPullRequestChecksStatusLabel, getPullRequestResourceStatus, type GitHubChecksStatus, type IGitHubIssueHoverModel, type IGitHubPullRequestHoverModel } from '../../../../github/browser/githubResourceHover.js';
import { getGitHubResourcePresentation, GitHubResourceDetailsResolver } from '../../../../github/browser/githubResourceDetails.js';
import { ChatPillHoverCache } from '../../../../../browser/chatPillHover.js';

const artifactIcons: ReadonlyMap<SessionArtifactType, ThemeIcon> = new Map([
	[SessionArtifactType.PullRequest, Codicon.gitPullRequest],
	[SessionArtifactType.Issue, Codicon.issues],
	[SessionArtifactType.Commit, Codicon.gitCommit],
	[SessionArtifactType.Website, Codicon.globe],
	[SessionArtifactType.Resource, Codicon.link],
]);

const artifactSectionOrder: readonly { readonly type: SessionArtifactType; readonly title: string }[] = [
	{ type: SessionArtifactType.PullRequest, title: localize('agentHostSessionPills.artifacts.pullRequests', "Pull Requests") },
	{ type: SessionArtifactType.Issue, title: localize('agentHostSessionPills.artifacts.issues', "Issues") },
	{ type: SessionArtifactType.Commit, title: localize('agentHostSessionPills.artifacts.commits', "Commits") },
	{ type: SessionArtifactType.Website, title: localize('agentHostSessionPills.artifacts.websites', "Websites") },
	{ type: SessionArtifactType.File, title: localize('agentHostSessionPills.artifacts.files', "Files") },
	{ type: SessionArtifactType.Resource, title: localize('agentHostSessionPills.artifacts.resources', "Resources") },
];

export interface IAgentHostSessionPillMetadata {
	readonly pullRequestUrls: readonly string[];
	readonly pullRequestTitles: ReadonlyMap<string, string>;
	readonly pullRequestArtifacts: ReadonlyMap<string, ISessionArtifact>;
	readonly issueUrls: readonly string[];
	readonly issueTitles: ReadonlyMap<string, string>;
	readonly issueArtifacts: ReadonlyMap<string, ISessionArtifact>;
	readonly artifacts: readonly ISessionArtifact[];
	readonly references: readonly ISessionArtifact[];
}

function linkKey(link: string): string {
	return link.replace(/\/+$/, '').toLowerCase();
}

function dedupeLinks(...groups: readonly (readonly string[] | undefined)[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const group of groups) {
		for (const link of group ?? []) {
			const key = linkKey(link);
			if (!seen.has(key)) {
				seen.add(key);
				result.push(link);
			}
		}
	}
	return result;
}

function setsEqual<T>(first: ReadonlySet<T>, second: ReadonlySet<T>): boolean {
	return first === second || (first.size === second.size && [...first].every(value => second.has(value)));
}

/** Only artifacts are promoted into the dedicated pills; references stay in the references pill. */
function isPromotedGitHubArtifact(artifact: ISessionArtifact, type: SessionArtifactType): artifact is ISessionArtifact & { readonly link: string } {
	return artifact.isArtifact
		&& artifact.type === type
		&& artifact.isGitHub === true
		&& typeof artifact.link === 'string'
		&& isGitHubArtifactLink(artifact.link);
}

/**
 * Partitions Agent Host metadata into dedicated GitHub, artifact, and reference
 * pills. Every list is most recent first, so each pill's dropdown opens on what
 * the session did last.
 */
export function getAgentHostSessionPillMetadata(meta: SessionSummaryMeta | undefined, sessionWorkingDirectory: string | undefined): IAgentHostSessionPillMetadata {
	const entries = readSessionArtifactsNewestFirst(meta);
	const github = readSessionGitHubState(meta, sessionWorkingDirectory);
	const recordedPullRequests = distinct(entries.filter(entry => isPromotedGitHubArtifact(entry, SessionArtifactType.PullRequest)), entry => linkKey(entry.link));
	const recordedIssues = distinct(entries.filter(entry => isPromotedGitHubArtifact(entry, SessionArtifactType.Issue)), entry => linkKey(entry.link));
	// Recorded pull requests lead discovered ones, as in the Agents Window.
	const pullRequestUrls = dedupeLinks(recordedPullRequests.map(entry => entry.link), getSessionRelatedPullRequestUrls(github));
	const pullRequestTitles = new Map(recordedPullRequests.filter(entry => entry.label).map(entry => [linkKey(entry.link), entry.label]));
	const pullRequestArtifacts = new Map(recordedPullRequests.map(entry => [linkKey(entry.link), entry]));
	const issueUrls = dedupeLinks(recordedIssues.map(entry => entry.link));
	const issueTitles = new Map(recordedIssues.map(entry => [linkKey(entry.link), entry.label]));
	const issueArtifacts = new Map(recordedIssues.map(entry => [linkKey(entry.link), entry]));
	const promotedLinks = new Set([...pullRequestUrls, ...issueUrls].map(linkKey));
	return {
		pullRequestUrls,
		pullRequestTitles,
		pullRequestArtifacts,
		issueUrls,
		issueTitles,
		issueArtifacts,
		artifacts: entries.filter(entry => entry.isArtifact && (!entry.link || !promotedLinks.has(linkKey(entry.link)))),
		// References always stay in the references pill, even for a pull request or issue the dedicated pills show.
		references: entries.filter(entry => !entry.isArtifact),
	};
}

/** The changeset the workbench Changes pill targets unless the session's provider configures another default. */
const CHANGES_PILL_DEFAULT_CHANGESET_KIND: DefaultChangesetKind = ChangesetKind.Session;

/** Resolves the changeset represented by the workbench Changes pill. */
export function resolveAgentHostChangeset(
	ownerResource: URI,
	changesets: readonly Changeset[] | undefined,
	defaultKind: DefaultChangesetKind = CHANGES_PILL_DEFAULT_CHANGESET_KIND,
): { readonly changeset: Changeset; readonly resource: URI } | undefined {
	const staticChangesets = changesets?.filter(changeset => !changeset.uriTemplate.includes('{')) ?? [];
	const changeset = selectDefaultChangeset(staticChangesets, defaultKind);
	const resource = changeset ? parseUri(resolveChangesetUriTemplate(ownerResource.toString(), changeset.uriTemplate)) : undefined;
	return changeset && resource ? { changeset, resource } : undefined;
}

/**
 * Resolves the chat channel URI a workbench chat resource addresses.
 * `defaultChat` is the session's advertised default chat (`SessionState.defaultChat`).
 */
export function getAgentHostSessionChatResource(sessionResource: URI, state: Pick<SessionState, 'chats'> | undefined, defaultChat: string | undefined): URI | undefined {
	const explicitChatResource = new URLSearchParams(sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
	if (explicitChatResource) {
		return parseUri(explicitChatResource);
	}
	return state ? parseUri(getSessionChatResource(state, sessionResource.fragment || DEFAULT_CHAT_ID, defaultChat)?.toString()) : undefined;
}

/** Returns the workbench chat resources whose browsers belong in the current chat's pill. */
export function getAgentHostSessionBrowserOwnerIds(sessionResource: URI, state: Pick<SessionState, 'chats'> | undefined, defaultChat: string | undefined): ReadonlySet<string> {
	const ownerIds = new Set<string>([sessionResource.toString()]);
	if (!state) {
		return ownerIds;
	}

	const currentChatResource = getAgentHostSessionChatResource(sessionResource, state, defaultChat);
	if (!currentChatResource) {
		return ownerIds;
	}

	for (const chat of state.chats) {
		const parentChatResource = chat.origin?.kind === ChatOriginKind.Tool ? parseUri(chat.origin.chat) : undefined;
		if (!parentChatResource || !isEqual(parentChatResource, currentChatResource)) {
			continue;
		}

		const query = new URLSearchParams(sessionResource.query);
		query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, chat.resource);
		ownerIds.add(sessionResource.with({ fragment: chat.resource, query: query.toString() }).toString());
		// Retain browser ownership for editors restored with the legacy local chat fragment.
		const chatId = getAgentHostChatId(chat.resource);
		ownerIds.add(sessionResource.with({ fragment: chatId, query: null }).toString());
		ownerIds.add(sessionResource.with({ fragment: chatId, query: query.toString() }).toString());
	}
	return ownerIds;
}

function resolutionEquals(first: IAgentHostSessionResolution | undefined, second: IAgentHostSessionResolution | undefined): boolean {
	return first === second || (!!first && !!second
		&& first.connection === second.connection
		&& first.connectionAuthority === second.connectionAuthority
		&& first.defaultChangesetKind === second.defaultChangesetKind
		&& isEqual(first.backendSession, second.backendSession));
}

function changesetTargetEquals(
	first: { readonly changeset: Changeset; readonly resource: URI } | undefined,
	second: { readonly changeset: Changeset; readonly resource: URI } | undefined,
): boolean {
	return first === second || (!!first && !!second
		&& first.changeset.changeKind === second.changeset.changeKind
		&& first.changeset.label === second.changeset.label
		&& first.changeset.uriTemplate === second.changeset.uriTemplate
		&& isEqual(first.resource, second.resource));
}

function parseUri(value: string | undefined): URI | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return URI.parse(value, true);
	} catch {
		return undefined;
	}
}

/**
 * The authority of the agent host URIs handed out by the session's connection. The ambient
 * host always resolves with the `local` authority, even in a remote window where it runs on
 * the remote, so host files would otherwise be opened as paths on this machine.
 */
function resourceAuthority(resolution: IAgentHostSessionResolution): string {
	const root = resolution.connection.resourceUris.fromAgentHost(URI.file('/'));
	return root.scheme === AGENT_HOST_SCHEME ? root.authority : resolution.connectionAuthority;
}

function referenceLabel(link: string, kind: 'pullRequest' | 'issue', title?: string): string {
	const resource = parseUri(link);
	const number = resource ? githubReferenceNumber(resource, kind) : undefined;
	if (number) {
		return getChatReferencePillPresentation(kind, `#${number}`, title).resourceLabel;
	}
	return title || (kind === 'pullRequest'
		? localize('agentHostSessionPills.pullRequest', "Pull Request")
		: localize('agentHostSessionPills.issue', "Issue"));
}

function githubReferenceNumber(resource: URI, kind: 'pullRequest' | 'issue'): string | undefined {
	const segment = kind === 'pullRequest' ? 'pull' : 'issues';
	return new RegExp(`/${segment}/(?<number>\\d+)(?:/|$)`).exec(resource.path)?.groups?.number;
}

function websiteKey(url: string): string | undefined {
	const parsed = URL.parse(url);
	if (!parsed) {
		return undefined;
	}
	const path = parsed.pathname.length > 1 && parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
	return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
}

interface IGitHubReferenceTarget {
	readonly owner: string;
	readonly repo: string;
	readonly number: number;
}

interface IPullRequestHoverDetails {
	readonly pullRequest: IGitHubPullRequestHoverModel;
	readonly checksStatus: GitHubChecksStatus | undefined;
}

interface IGitHubReferenceEntry<T> {
	readonly target: IGitHubReferenceTarget;
	readonly value: ReturnType<typeof observableValue<T | undefined>>;
	readonly subscription: MutableDisposable<DisposableStore>;
	generation: number;
}

class AgentHostGitHubReferenceResolver extends Disposable {

	private readonly _issues = new Map<string, IGitHubReferenceEntry<IGitHubIssueHoverModel>>();
	private readonly _pullRequests = new Map<string, IGitHubReferenceEntry<IPullRequestHoverDetails>>();

	constructor(
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._gitHubService.onDidChangeDefaultClient(() => {
			for (const entry of this._issues.values()) {
				this._initializeIssue(entry);
			}
			for (const entry of this._pullRequests.values()) {
				this._initializePullRequest(entry);
			}
		}));
	}

	getIssue(target: IGitHubReferenceTarget): IObservable<IGitHubIssueHoverModel | undefined> {
		const key = githubTargetKey(target);
		let entry = this._issues.get(key);
		if (!entry) {
			entry = this._createEntry<IGitHubIssueHoverModel>(target);
			this._issues.set(key, entry);
		}
		if (!entry.subscription.value) {
			this._initializeIssue(entry);
		}
		return entry.value;
	}

	getPullRequest(target: IGitHubReferenceTarget): IObservable<IPullRequestHoverDetails | undefined> {
		const key = githubTargetKey(target);
		let entry = this._pullRequests.get(key);
		if (!entry) {
			entry = this._createEntry<IPullRequestHoverDetails>(target);
			this._pullRequests.set(key, entry);
		}
		if (!entry.subscription.value) {
			this._initializePullRequest(entry);
		}
		return entry.value;
	}

	retain(issueTargets: readonly IGitHubReferenceTarget[], pullRequestTargets: readonly IGitHubReferenceTarget[]): void {
		this._retainEntries(this._issues, new Set(issueTargets.map(githubTargetKey)));
		this._retainEntries(this._pullRequests, new Set(pullRequestTargets.map(githubTargetKey)));
	}

	private _createEntry<T>(target: IGitHubReferenceTarget): IGitHubReferenceEntry<T> {
		return {
			target,
			value: observableValue<T | undefined>(this, undefined),
			subscription: this._register(new MutableDisposable<DisposableStore>()),
			generation: 0,
		};
	}

	private _retainEntries<T>(entries: Map<string, IGitHubReferenceEntry<T>>, retainedKeys: ReadonlySet<string>): void {
		for (const [key, entry] of entries) {
			if (!retainedKeys.has(key)) {
				this._store.delete(entry.subscription);
				entries.delete(key);
			}
		}
	}

	private _initializeIssue(entry: IGitHubReferenceEntry<IGitHubIssueHoverModel>): void {
		const generation = ++entry.generation;
		const store = new DisposableStore();
		entry.subscription.value = store;
		entry.value.set(undefined, undefined);
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		void this._gitHubService.acquireDefaultAccountClient(controller.signal).then(async reference => {
			if (store.isDisposed) {
				reference.dispose();
				return;
			}
			const client = store.add(reference).object;
			const credential = await client.credentials.getCredential(controller.signal);
			if (controller.signal.aborted || generation !== entry.generation) {
				return;
			}
			const ref: GitHubIssueRef = { ...credential.account, ...entry.target };
			const subscription = store.add(client.query.subscribeIssue(ref, { priority: 'visible' }));
			store.add(autorun(reader => {
				const issue = subscription.resource.state.read(reader).value;
				entry.value.set(issue ? toIssueHoverModel(issue) : undefined, undefined);
			}));
			void subscription.refresh().catch(error => this._logService.warn('[AgentHostSessionInputPills] Failed to refresh GitHub issue reference', error));
		}).catch(error => {
			if (!controller.signal.aborted && generation === entry.generation) {
				this._logService.warn('[AgentHostSessionInputPills] Failed to resolve GitHub credentials for issue reference', error);
				entry.subscription.clear();
			}
		});
	}

	private _initializePullRequest(entry: IGitHubReferenceEntry<IPullRequestHoverDetails>): void {
		const generation = ++entry.generation;
		const store = new DisposableStore();
		entry.subscription.value = store;
		entry.value.set(undefined, undefined);
		const controller = new AbortController();
		store.add(toDisposable(() => controller.abort()));
		void this._gitHubService.acquireDefaultAccountClient(controller.signal).then(async reference => {
			if (store.isDisposed) {
				reference.dispose();
				return;
			}
			const client = store.add(reference).object;
			const credential = await client.credentials.getCredential(controller.signal);
			if (controller.signal.aborted || generation !== entry.generation) {
				return;
			}
			const ref: PullRequestRef = { ...credential.account, ...entry.target };
			const subscription = store.add(client.pullRequests.subscribePullRequest(ref, {
				priority: 'visible',
				core: true,
				checks: { includeOptional: true },
			}));
			store.add(autorun(reader => {
				const snapshot = subscription.resource.snapshot.read(reader);
				const pullRequest = snapshot.core.value;
				entry.value.set(pullRequest ? {
					pullRequest: toPullRequestHoverModel(pullRequest),
					checksStatus: getChecksStatus(snapshot),
				} : undefined, undefined);
			}));
			void subscription.refresh('core').catch(error => this._logService.warn('[AgentHostSessionInputPills] Failed to refresh GitHub pull request reference', error));
			void subscription.refresh('checks').catch(error => this._logService.warn('[AgentHostSessionInputPills] Failed to refresh GitHub pull request checks', error));
		}).catch(error => {
			if (!controller.signal.aborted && generation === entry.generation) {
				this._logService.warn('[AgentHostSessionInputPills] Failed to resolve GitHub credentials for pull request reference', error);
				entry.subscription.clear();
			}
		});
	}
}

function githubTargetKey(target: IGitHubReferenceTarget): string {
	return `${target.owner.toLowerCase()}/${target.repo.toLowerCase()}#${target.number}`;
}

function parseGitHubReferenceTarget(resource: URI, kind: 'pullRequest' | 'issue'): IGitHubReferenceTarget | undefined {
	const segments = resource.path.split('/').filter(Boolean);
	const expectedKind = kind === 'pullRequest' ? 'pull' : 'issues';
	const number = Number(segments[3]);
	return resource.authority.toLowerCase() === 'github.com'
		&& segments.length >= 4
		&& segments[2] === expectedKind
		&& Number.isInteger(number)
		&& number > 0
		? { owner: segments[0], repo: segments[1], number }
		: undefined;
}

function toIssueHoverModel(issue: GitHubIssue): IGitHubIssueHoverModel {
	return {
		title: issue.title,
		body: issue.body,
		state: issue.state,
		stateReason: issue.stateReason,
		author: issue.author,
		createdAt: issue.createdAt,
	};
}

function toPullRequestHoverModel(pullRequest: PullRequestCore): IGitHubPullRequestHoverModel {
	return {
		title: pullRequest.title,
		body: pullRequest.body ?? '',
		state: pullRequest.state,
		author: pullRequest.author ?? { login: 'unknown' },
		headRef: pullRequest.headRef,
		baseRef: pullRequest.baseRef,
		isDraft: pullRequest.draft,
		createdAt: pullRequest.createdAt,
	};
}

function getChecksStatus(snapshot: PullRequestSnapshot): GitHubChecksStatus | undefined {
	const checksValue = snapshot.checks.value;
	if (!checksValue || checksValue.headSha !== snapshot.core.value?.headSha) {
		return undefined;
	}
	const checks = checksValue.checks;
	if (!checks?.length) {
		return undefined;
	}
	if (checks.some(isPendingCheck)) {
		return 'pending';
	}
	return checks.some(isFailingCheck) ? 'failure' : 'success';
}

function isPendingCheck(check: PullRequestCheck): boolean {
	return check.type === 'checkRun'
		? check.status !== 'COMPLETED'
		: check.status === 'PENDING' || check.status === 'EXPECTED';
}

/** Whether `operation` is the host's Discard Changes operation for single files. */
function isFileDiscardOperation(operation: ChangesetOperation): boolean {
	return operation.id === AGENT_HOST_DISCARD_CHANGES_OPERATION_ID && operation.scopes.includes(ChangesetOperationScope.Resource);
}

/** Whether `operation` is the host's Accept Changes operation for single files. */
function isFileAcceptOperation(operation: ChangesetOperation): boolean {
	return operation.id === AGENT_HOST_ACCEPT_CHANGES_OPERATION_ID && operation.scopes.includes(ChangesetOperationScope.Resource);
}

/** Whether `operation` can be invoked now: it isn't disabled, as while a turn runs, or running already. */
function isOperationAvailable(operation: ChangesetOperation | undefined): boolean {
	return operation?.status !== ChangesetOperationStatus.Disabled && operation?.status !== ChangesetOperationStatus.Running;
}

/** How long Undo waits for Session Changes to finish updating before it gives up on the files left to undo. */
const SESSION_CHANGES_READY_TIMEOUT = 30_000;

/** How long a session that was just created waits for its host to replace the changeset catalogue it advertised while being created. */
const SESSION_CREATION_CATALOGUE_TIMEOUT = 1_000;

/** The changeset catalogue a session advertised while it was being created. */
interface ISessionCreationCatalogue {
	readonly connectionAuthority: string;
	readonly backendSession: URI;
	readonly changesets: SessionState['changesets'];
	/** Whether the session is ready, so its host is expected to replace the catalogue. */
	readonly ready: boolean;
}

/**
 * Resolves to the state of `changeset` once it's up to date, or `undefined`
 * if it fails or doesn't finish updating in time. While it updates, its files
 * are the previous ones, which miss the edits of a turn that just ran.
 */
async function whenChangesetReady(changeset: IAgentSubscription<ChangesetState>): Promise<ChangesetState | undefined> {
	const isSettled = (state: ChangesetState | Error | undefined) => state instanceof Error || state?.status === ChangesetStatus.Ready || state?.status === ChangesetStatus.Error;
	let state = changeset.value;
	if (!isSettled(state)) {
		const settled = Event.toPromise(Event.filter(changeset.onDidChange, isSettled));
		state = await raceTimeout(settled, SESSION_CHANGES_READY_TIMEOUT, () => settled.cancel());
	}
	return state instanceof Error || state?.status !== ChangesetStatus.Ready ? undefined : state;
}

function isFailingCheck(check: PullRequestCheck): boolean {
	return check.type === 'checkRun'
		? check.conclusion === 'FAILURE'
		|| check.conclusion === 'TIMED_OUT'
		|| check.conclusion === 'CANCELLED'
		|| check.conclusion === 'ACTION_REQUIRED'
		|| check.conclusion === 'STARTUP_FAILURE'
		: check.status === 'FAILURE' || check.status === 'ERROR';
}

/** Adds Agent Host session metadata pills to a workbench chat input. */
export class AgentHostSessionInputPills extends Disposable {

	/** Binds operations to the displayed diff, not a newer changeset publication. */
	private readonly _fileChangeNonces = new WeakMap<IEditSessionEntryDiff, string>();
	private readonly _browserChanged = observableSignal(this);
	private readonly _browserListeners = this._register(new MutableDisposable<DisposableStore>());
	private readonly _pullRequestHoverCache = this._register(new ChatPillHoverCache());
	private readonly _issueHoverCache = this._register(new ChatPillHoverCache());
	private readonly _commitHoverCache = this._register(new ChatPillHoverCache());
	private readonly _gitHubReferenceResolver: AgentHostGitHubReferenceResolver;
	private readonly _gitHubResourceDetailsResolver: GitHubResourceDetailsResolver;
	/** Runs the file operations on each working set channel one after another, so a Keep staged with Git waits for one in progress. */
	private readonly _fileOperations = new SequencerByKey<string>();

	constructor(
		private readonly _widget: ChatWidget,
		compact: ChatPillsCompactMode,
		@IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ISessionChatPillVisibilityService visibility: ISessionChatPillVisibilityService,
		@IAgentHostUntitledProvisionalSessionService provisionalSessions: IAgentHostUntitledProvisionalSessionService,
		@ILabelService private readonly _labelService: ILabelService,
		@INotificationService private readonly _notificationService: INotificationService,
		@ICommandService commandService: ICommandService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();
		this._gitHubReferenceResolver = this._register(instantiationService.createInstance(AgentHostGitHubReferenceResolver));
		this._gitHubResourceDetailsResolver = this._register(instantiationService.createInstance(GitHubResourceDetailsResolver));
		const gitHubCommitResolver = this._register(instantiationService.createInstance(GitHubCommitResolver));

		const sessionResource = observableFromEvent(this, this._widget.onDidChangeViewModel, () => this._widget.viewModel?.sessionResource);
		const workingSetConfigured = observableConfigValue(ChatConfiguration.EditorWorkingSetEnabled, false, this._configurationService);
		const transcriptArtifacts = this._register(instantiationService.createInstance(ChatArtifactPillSource, sessionResource));
		const sessionResolutionChanged = observableSignalFromEvent(this, connectionsService.onDidChangeSessionResolution);
		const provisionalSessionChanged = observableSignalFromEvent(this, provisionalSessions.onDidChange);
		const policyChanged = observableSignalFromEvent(this, Event.filter(this._configurationService.onDidChangeConfiguration, event => affectsAgentHostProviderPreference(event, true)));
		const resolution = derivedOpts<IAgentHostSessionResolution | undefined>({ owner: this, equalsFn: resolutionEquals }, reader => {
			sessionResolutionChanged.read(reader);
			const resource = sessionResource.read(reader);
			if (!resource) {
				return undefined;
			}
			const localProvider = getLocalAgentHostSessionProvider(resource);
			if (localProvider) {
				policyChanged.read(reader);
				if (isLocalAgentHostProviderDisabledByPolicy(localProvider, this._configurationService)) {
					return undefined;
				}
			}
			provisionalSessionChanged.read(reader);
			const provisionalBackend = provisionalSessions.get(resource);
			if (isUntitledChatSession(resource) && !provisionalBackend) {
				return undefined;
			}
			const resolved = connectionsService.resolveSessionResource(resource);
			return resolved && provisionalBackend ? { ...resolved, backendSession: provisionalBackend } : resolved;
		});
		const sessionStateSource = derived(this, reader => {
			const current = resolution.read(reader);
			if (!current) {
				return constObservable<SessionState | undefined>(undefined);
			}
			const subscription = reader.store.add(current.connection.getSubscription(StateComponents.Session, current.backendSession, 'AgentHostSessionInputPills'));
			return observableFromSubscription(this, subscription.object);
		});
		const sessionState = derived(this, reader => sessionStateSource.read(reader).read(reader));
		const defaultChat = derived(this, reader => {
			const current = resolution.read(reader);
			return current ? sessionState.read(reader)?.defaultChat : undefined;
		});
		const chatResource = derivedOpts<URI | undefined>({ owner: this, equalsFn: isEqual }, reader => {
			const resource = sessionResource.read(reader);
			return resource ? getAgentHostSessionChatResource(resource, sessionState.read(reader), defaultChat.read(reader)) : undefined;
		});
		const chatStateSource = derived(this, reader => {
			const current = resolution.read(reader);
			const resource = chatResource.read(reader);
			if (!current || !resource) {
				return constObservable<ChatState | undefined>(undefined);
			}
			const subscription = reader.store.add(current.connection.getSubscription(StateComponents.Chat, resource, 'AgentHostSessionInputPills'));
			return observableFromSubscription(this, subscription.object);
		});
		const chatState = derived(this, reader => chatStateSource.read(reader).read(reader));
		// Session-wide metadata pills still belong to the parent session.
		const subagentChat = derived(this, reader => {
			const resource = chatResource.read(reader);
			return !!resource && !!sessionState.read(reader)?.chats.some(chat =>
				isEqual(URI.parse(chat.resource), resource) && chat.origin?.kind === ChatOriginKind.Tool);
		});
		const selectableChangesets = derived(this, reader => {
			const chat = chatResource.read(reader);
			if (!chat) {
				return undefined;
			}
			const session = sessionState.read(reader);
			return resolveChatChangesetCatalogue(chat.toString(), chatState.read(reader)?.changesets, session?.changesets, defaultChat.read(reader))
				?.filter(({ changeset }) => !changeset.uriTemplate.includes('{'));
		});
		// The session's Working Set, when its host advertises one, holds the changes that haven't been kept.
		const sessionWorkingSetChangeset = derived(this, reader => sessionState.read(reader)?.changesets
			?.find(changeset => changeset.changeKind === ChangesetKind.WorkingSet && !changeset.uriTemplate.includes('{')));
		// Only inputs that can show the working set swap the Changes pill for it, so the Agents window keeps its pill.
		const workingSetAvailable = derived(this, reader => this._widget.inputPart.supportsSessionWorkingSet
			&& isCopilotAgentHostProvider(sessionState.read(reader)?.provider)
			&& !subagentChat.read(reader));
		const workingSetSupported = derived(this, reader => workingSetAvailable.read(reader) && workingSetConfigured.read(reader));
		const workingSetEnabled = derived(this, reader => workingSetSupported.read(reader)
			&& (sessionWorkingSetChangeset.read(reader) !== undefined
				|| selectableChangesets.read(reader)?.some(({ changeset }) => changeset.changeKind === ChangesetKind.Session) === true));
		// A host advertises a session's Session Changes and Working Set only once the session is ready, and
		// may do so in a later update. The catalogue it advertised while creating the session is kept until
		// it's replaced, so a new session doesn't show the workspace's uncommitted changes in the Changes pill.
		const creationCatalogue = derivedObservableWithCache<ISessionCreationCatalogue | undefined>(this, (reader, lastValue) => {
			const currentResolution = resolution.read(reader);
			const state = sessionState.read(reader);
			if (!currentResolution || !state || !workingSetSupported.read(reader)) {
				return undefined;
			}
			const current = lastValue?.connectionAuthority === currentResolution.connectionAuthority
				&& isEqual(lastValue.backendSession, currentResolution.backendSession)
				&& lastValue.changesets === state.changesets
				? lastValue
				: undefined;
			switch (state.lifecycle) {
				case SessionLifecycle.Creating:
					return current && !current.ready
						? current
						: { connectionAuthority: currentResolution.connectionAuthority, backendSession: currentResolution.backendSession, changesets: state.changesets, ready: false };
				case SessionLifecycle.Ready:
					return current && !current.ready ? { ...current, ready: true } : current;
				default:
					return undefined;
			}
		});
		// Hosts that keep the catalogue once the session is ready get the Changes pill back after a moment.
		const expiredCreationCatalogue = observableValue<ISessionCreationCatalogue | undefined>(this, undefined);
		this._register(autorun(reader => {
			const catalogue = creationCatalogue.read(reader);
			if (catalogue?.ready) {
				reader.store.add(disposableTimeout(() => expiredCreationCatalogue.set(catalogue, undefined), SESSION_CREATION_CATALOGUE_TIMEOUT));
			}
		}));
		const workingSetPending = derived(this, reader => {
			const catalogue = creationCatalogue.read(reader);
			return !!catalogue && expiredCreationCatalogue.read(reader) !== catalogue && !workingSetEnabled.read(reader);
		});
		const changesPillHidden = derived(this, reader => workingSetEnabled.read(reader) || workingSetPending.read(reader));
		const changesetTarget = derivedOpts({ owner: this, equalsFn: changesetTargetEquals }, reader => {
			const currentResolution = resolution.read(reader);
			const chat = chatResource.read(reader);
			if (!currentResolution || !chat || workingSetPending.read(reader)) {
				return undefined;
			}
			// The working set shows the session's Working Set, or Session Changes on hosts without one.
			const workingSetChangeset = workingSetEnabled.read(reader) ? sessionWorkingSetChangeset.read(reader) : undefined;
			if (workingSetChangeset) {
				return resolveAgentHostChangeset(currentResolution.backendSession, [workingSetChangeset]);
			}
			const selectableEntries = selectableChangesets.read(reader);
			const defaultKind = workingSetEnabled.read(reader) ? ChangesetKind.Session : currentResolution.defaultChangesetKind ?? CHANGES_PILL_DEFAULT_CHANGESET_KIND;
			const selectedChangeset = selectDefaultChangeset(selectableEntries?.map(({ changeset }) => changeset), defaultKind);
			const selectedEntry = selectableEntries?.find(({ changeset }) => changeset === selectedChangeset);
			return resolveAgentHostChangeset(
				selectedEntry?.owner === 'session' ? currentResolution.backendSession : chat,
				selectedChangeset ? [selectedChangeset] : undefined,
				defaultKind,
			);
		});
		const changesetStateSource = derived(this, reader => {
			const currentResolution = resolution.read(reader);
			const resource = changesetTarget.read(reader)?.resource;
			if (!currentResolution || !resource) {
				return constObservable<ChangesetState | undefined>(undefined);
			}
			const subscription = reader.store.add(currentResolution.connection.getSubscription(StateComponents.Changeset, resource, 'AgentHostSessionInputPills'));
			return observableFromSubscription(this, subscription.object);
		});
		const changesetFiles = derivedObservableWithCache<{ readonly connectionAuthority: string; readonly resource: URI; readonly files: ChangesetState['files'] } | undefined>(this, (reader, lastValue) => {
			const currentResolution = resolution.read(reader);
			const target = changesetTarget.read(reader);
			if (!currentResolution || !target) {
				return undefined;
			}
			const state = changesetStateSource.read(reader).read(reader);
			if (!state) {
				return lastValue?.connectionAuthority === currentResolution.connectionAuthority && isEqual(lastValue.resource, target.resource) ? lastValue : undefined;
			}
			if (state.status !== ChangesetStatus.Ready
				&& state.status !== ChangesetStatus.Recomputing
				&& lastValue?.connectionAuthority === currentResolution.connectionAuthority
				&& isEqual(lastValue.resource, target.resource)) {
				return lastValue;
			}
			// Status and operation updates keep the same files, so they don't rebuild the file lists (and drop focus within them).
			if (lastValue?.files === state.files
				&& lastValue.connectionAuthority === currentResolution.connectionAuthority
				&& isEqual(lastValue.resource, target.resource)) {
				return lastValue;
			}
			return { connectionAuthority: currentResolution.connectionAuthority, resource: target.resource, files: state.files };
		});
		const changes = derived<readonly IEditSessionEntryDiff[]>(this, reader => {
			const currentResolution = resolution.read(reader);
			const files = changesetFiles.read(reader)?.files;
			if (!currentResolution || !files) {
				return [];
			}
			return files
				.map(file => {
					const diff = agentHostChangesetFileToEntryDiff(file, currentResolution.connectionAuthority);
					if (diff && file.nonce !== undefined) {
						this._fileChangeNonces.set(diff, file.nonce);
					}
					return diff;
				})
				.filter(isDefined);
		});
		const workingSetChanges = derived(this, reader => {
			if (!workingSetEnabled.read(reader)) {
				return undefined;
			}
			return changes.read(reader);
		});
		// Undo reverts a file's changes with the host's file-level Discard Changes operation, when the host offers it.
		const workingSetDiscard = derived<ChangesetOperation | undefined>(this, reader => {
			const kind = changesetTarget.read(reader)?.changeset.changeKind;
			if (!workingSetEnabled.read(reader) || (kind !== ChangesetKind.Session && kind !== ChangesetKind.WorkingSet)) {
				return undefined;
			}
			return changesetStateSource.read(reader).read(reader)?.operations?.find(isFileDiscardOperation);
		});
		const canDiscardWorkingSetChanges = derived(this, reader => !!workingSetDiscard.read(reader));
		// The working set channels with an undo in flight; one for each undo, so overlapping undos on a channel each count.
		const discardsInFlight = observableValue<readonly string[]>(this, []);
		const workingSetUndo = derived<IChatSessionWorkingSetUndo | undefined>(this, reader => {
			const currentResolution = resolution.read(reader);
			const channel = changesetTarget.read(reader)?.resource;
			if (!currentResolution || !channel || !canDiscardWorkingSetChanges.read(reader)) {
				return undefined;
			}
			return {
				enabled: derived(enabledReader => !discardsInFlight.read(enabledReader).includes(channel.toString()) && isOperationAvailable(workingSetDiscard.read(enabledReader))),
				undo: (diffs, all) => this._discardSessionChanges(currentResolution, channel, workingSetDiscard, discardsInFlight, diffs, all),
			};
		});
		// Keep accepts a file's changes in the session's Working Set with the host's file-level Accept Changes operation.
		const workingSetAccept = derived<ChangesetOperation | undefined>(this, reader => {
			if (!workingSetEnabled.read(reader) || changesetTarget.read(reader)?.changeset.changeKind !== ChangesetKind.WorkingSet) {
				return undefined;
			}
			return changesetStateSource.read(reader).read(reader)?.operations?.find(isFileAcceptOperation);
		});
		const acceptsInFlight = observableValue<readonly string[]>(this, []);
		const isSessionWorkingSet = derived(this, reader => changesetTarget.read(reader)?.changeset.changeKind === ChangesetKind.WorkingSet);
		const workingSetKeep = derived<IChatSessionWorkingSetKeep | undefined>(this, reader => {
			const currentResolution = resolution.read(reader);
			const channel = changesetTarget.read(reader)?.resource;
			// The host records what the Working Set keeps, so Keep never falls back to hiding files in the workbench;
			// it is disabled while the host doesn't offer Accept Changes.
			if (!currentResolution || !channel || !isSessionWorkingSet.read(reader)) {
				return undefined;
			}
			return {
				enabled: derived(enabledReader => {
					const accept = workingSetAccept.read(enabledReader);
					return !!accept && !acceptsInFlight.read(enabledReader).includes(channel.toString()) && isOperationAvailable(accept);
				}),
				keep: (diffs, automatic) => this._keepWorkingSetChanges(currentResolution, channel, workingSetAccept, acceptsInFlight, diffs, automatic),
			};
		});
		// The session's Working Set tracks what was kept, so it also offers Undo; Session Changes only once Undo ships.
		this._register(autorun(reader => {
			if (workingSetEnabled.read(reader)) {
				const undo = this.workingSetUndoEnabled || isSessionWorkingSet.read(reader) ? workingSetUndo : undefined;
				reader.store.add(this._widget.inputPart.registerSessionFileChanges(workingSetChanges, undo, workingSetKeep));
			}
		}));
		const changeStats = derivedOpts<IChatChangesStats>({ owner: this, equalsFn: chatChangesStatsEqual }, reader => {
			const diffs = changes.read(reader);
			return diffs.length === 0
				? EMPTY_CHAT_CHANGES_STATS
				: {
					files: diffs.length,
					insertions: diffs.reduce((total, diff) => total + diff.added, 0),
					deletions: diffs.reduce((total, diff) => total + diff.removed, 0),
				};
		});
		const metadata = derived(this, reader => {
			const state = sessionState.read(reader);
			return getAgentHostSessionPillMetadata(state?._meta, state?.workingDirectories?.[0]);
		});
		const gitHubState = derived(this, reader => readSessionFolderGitHubState(sessionState.read(reader)));
		this._register(autorun(reader => {
			const currentMetadata = metadata.read(reader);
			this._pullRequestHoverCache.retain(new Set(currentMetadata.pullRequestUrls.map(linkKey)), sessionResource.read(reader)?.toString());
			this._issueHoverCache.retain(new Set(currentMetadata.issueUrls.map(linkKey)), sessionResource.read(reader)?.toString());
			this._commitHoverCache.retain(new Set([...currentMetadata.artifacts, ...currentMetadata.references]
				.filter(artifact => artifact.type === SessionArtifactType.Commit).map(artifact => artifact.id)), sessionResource.read(reader)?.toString());
			this._gitHubReferenceResolver.retain(
				currentMetadata.issueUrls.map(link => parseUri(link)).filter(isDefined).map(resource => parseGitHubReferenceTarget(resource, 'issue')).filter(isDefined),
				currentMetadata.pullRequestUrls.map(link => parseUri(link)).filter(isDefined).map(resource => parseGitHubReferenceTarget(resource, 'pullRequest')).filter(isDefined),
			);
			this._gitHubResourceDetailsResolver.retain(currentMetadata.references.flatMap(artifact => {
				const resource = artifact.isGitHub === true && artifact.link ? parseUri(artifact.link) : undefined;
				return resource ? [{ identity: artifact, resource }] : [];
			}), sessionState.read(reader) ? sessionResource.read(reader)?.toString() : undefined);
			gitHubCommitResolver.retain([...currentMetadata.artifacts, ...currentMetadata.references]
				.flatMap(artifact => artifact.type === SessionArtifactType.Commit && artifact.link ? [parseUri(artifact.link)] : [])
				.filter(isDefined)
				.map(parseGitHubCommitTarget)
				.filter(isDefined));
		}));

		this._register(this._browserViewService.onDidChangeBrowserViews(() => this._refreshBrowserListeners()));
		this._refreshBrowserListeners();
		const browserInputs = derived(this, reader => {
			this._browserChanged.read(reader);
			const resource = sessionResource.read(reader);
			if (!resource || !resolution.read(reader)) {
				return [];
			}
			const ownerIds = getAgentHostSessionBrowserOwnerIds(resource, sessionState.read(reader), defaultChat.read(reader));
			return getAgentBrowserViewsNewestFirst(this._browserViewService, ownerIds);
		});
		const browserUrls = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setsEqual }, reader => {
			return visibility.isVisible(SessionChatPillKind.Browsers, reader)
				? new Set(browserInputs.read(reader).map(input => input.url).filter(isDefined))
				: new Set();
		});

		const pullRequestSections = derived(this, reader => {
			const currentMetadata = metadata.read(reader);
			const currentResolution = resolution.read(reader);
			return this._buildReferenceSections(
				currentMetadata.pullRequestUrls,
				'pullRequest',
				reader,
				this._gitHubReferenceResolver,
				gitHubState.read(reader),
				currentMetadata.pullRequestTitles,
				currentMetadata.pullRequestArtifacts,
				this._getRemoveArtifactAction(currentResolution, reader),
			);
		});
		const pullRequestIcon = derived(this, reader => {
			const icons = getChatPillEntries(pullRequestSections.read(reader)).map(entry => entry.icon);
			return getHighestPriorityPullRequestIcon(icons) ?? computePullRequestIcon('open');
		});
		const issueSections = derived(this, reader => {
			const currentMetadata = metadata.read(reader);
			const currentResolution = resolution.read(reader);
			return this._buildReferenceSections(
				currentMetadata.issueUrls,
				'issue',
				reader,
				this._gitHubReferenceResolver,
				undefined,
				currentMetadata.issueTitles,
				currentMetadata.issueArtifacts,
				this._getRemoveArtifactAction(currentResolution, reader),
			);
		});
		const issueIcon = derived(this, reader => computeAggregateIssueIcon(metadata.read(reader).issueUrls.map(link => {
			const resource = parseUri(link);
			const target = resource ? parseGitHubReferenceTarget(resource, 'issue') : undefined;
			return target ? this._gitHubReferenceResolver.getIssue(target).read(reader) : undefined;
		})));
		const artifactSections = derived(this, reader => {
			const currentResolution = resolution.read(reader);
			const recorded = !subagentChat.read(reader) && currentResolution
				? this._buildArtifactSections(metadata.read(reader).artifacts, browserUrls.read(reader), currentResolution, gitHubCommitResolver, reader, this._getRemoveArtifactAction(currentResolution, reader))
				: [];
			return mergeChatArtifactSections(recorded, transcriptArtifacts.sections.read(reader));
		});
		const referenceSections = derived(this, reader => {
			const currentResolution = resolution.read(reader);
			return currentResolution
				? this._buildArtifactSections(metadata.read(reader).references, browserUrls.read(reader), currentResolution, gitHubCommitResolver, reader, this._getRemoveArtifactAction(currentResolution, reader))
				: [];
		});
		const browserSections = derived(this, reader => {
			const entries = browserInputs.read(reader).map(input => this._browserEntry(input, sessionResource.read(reader)));
			return entries.length > 0 ? [{ title: localize('agentHostSessionPills.browsers.section', "Browsers"), entries }] : [];
		});
		const targetWindow = getWindow(this._widget.inputPart.persistentContentContainerElement);
		// Canvases are only presented in the main window, beside their owning chat.
		const presentsCanvases = !isAuxiliaryWindow(targetWindow);
		const chatModel = observableFromEvent(this, this._widget.onDidChangeViewModel, () => this._widget.viewModel?.model);
		const canvases = this._register(instantiationService.createInstance(CanvasesPillControl, derived(this, reader =>
			presentsCanvases ? chatModel.read(reader)?.canvasContext?.read(reader) : undefined)));
		const subagents = derived<readonly IChatSubagentPillEntry[]>(this, reader => {
			const parentSession = sessionResource.read(reader);
			const parentChat = chatResource.read(reader);
			if (!parentSession || !parentChat) {
				return [];
			}
			return (sessionState.read(reader)?.chats ?? [])
				.filter(chat => chat.origin?.kind === ChatOriginKind.Tool && isEqual(URI.parse(chat.origin.chat), parentChat))
				.map(chat => ({
					id: chat.resource,
					title: chat.title,
					isActive: (chat.status & SessionStatus.InProgress) !== 0,
					open: async () => {
						await commandService.executeCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, {
							chatResource: chat.resource,
							parentSessionResource: parentSession.toString(),
							title: chat.title,
						});
					},
				}));
		});
		const workingDirectories = derived(this, reader => sessionState.read(reader)?.workingDirectories);
		const customizationRoots = derived(this, reader => workingDirectories.read(reader)?.map(resource => URI.parse(resource)) ?? []);
		const customizationFolders = derived(this, reader => {
			const current = resolution.read(reader);
			return current ? customizationRoots.read(reader).map(workingDirectory => ({
				name: basename(workingDirectory),
				workingDirectory: current.connection.resourceUris.fromAgentHost(workingDirectory),
			})) : [];
		});
		const customizations = derived(this, reader => sessionState.read(reader)?.customizations);
		const customizationUriMapper = derived(this, reader => {
			const current = resolution.read(reader);
			return current ? (uri: URI) => current.connection.resourceUris.fromAgentHost(uri) : undefined;
		});
		const customizationIndex = createCustomizationIndexObservable(this, customizations, customizationRoots, customizationUriMapper, { scope: derived(this, reader => chatResource.read(reader)?.toString()) });
		// Resolution is sliced over idle time so selecting a large chat never blocks on it.
		const chatCustomizations = createProgressiveChatCustomizations(this, chatState, customizationIndex, {
			scheduler: this.createCustomizationScheduler(),
			scope: derived(this, reader => {
				resolution.read(reader);
				return chatResource.read(reader)?.toString();
			}),
		});
		const sessionCustomizations = this._register(instantiationService.createInstance(SessionCustomizations, chatCustomizations, customizationFolders));
		// A new source per chat keeps one chat's shell details from carrying over to another.
		const backgroundShellOutputs = new AgentHostBackgroundShellOutputs(reader => resolution.read(reader)?.connection);
		const backgroundShells = this._register(instantiationService.createInstance(SessionBackgroundShellsControl, derived(this, reader => chatResource.read(reader) ? {
			backgroundShells: derivedOpts<readonly IChatBackgroundShell[]>({ owner: this, equalsFn: structuralEquals }, shellReader => backgroundShellOutputs.project(chatState.read(shellReader)?.backgroundWork, chatResource.read(shellReader))),
		} : undefined)));

		const sources = this._register(instantiationService.createInstance(StandardChatInputPillSources, {
			changes: {
				stats: changeStats,
				label: derived(this, reader => changesetTarget.read(reader)?.changeset.label ?? localize('agentHostSessionPills.changes', "Changes")),
				open: () => this._openChanges(changesetTarget.get()?.changeset, changes.get()),
				getContextMenuPrimaryActions: () => workingSetAvailable.get() ? [toAction({
					id: 'chat.sessionWorkingSet.showWorkingSet',
					label: localize('agentHostSessionPills.showWorkingSet', "Show Working Set"),
					run: () => this._configurationService.updateValue(ChatConfiguration.EditorWorkingSetEnabled, true),
				})] : [],
			},
			pullRequests: createSessionPullRequestPillData(pullRequestSections, visibility.pullRequests, pullRequestIcon),
			issues: { sections: issueSections, icon: issueIcon },
			artifacts: { sections: artifactSections },
			references: { sections: referenceSections },
			customizations: sessionCustomizations,
			canvases: { sections: canvases.sections },
			browsers: { sections: browserSections },
			subagents: createSessionSubagentsPillData(subagents, visibility.subagents),
			backgroundShells,
		}, SESSION_CHAT_PILL_KINDS, derived(this, reader => {
			const session = sessionResource.read(reader);
			const chat = chatResource.read(reader);
			return session && chat ? JSON.stringify([getLocalAgentHostSessionProvider(session), session.toString(), chat.toString()]) : undefined;
		})));
		const inputPills = this._register(instantiationService.createInstance(ChatInputPills, this._widget.inputPart.persistentContentContainerElement, {
			debugName: 'AgentHostSessionInputPills.content',
			compact,
			targetWindow,
			enabled: constObservable(true),
			sources: derived(this, reader => {
				if (subagentChat.read(reader)) {
					return sources.sources.filter(source => source.kind === SessionChatPillKind.Artifacts);
				}
				const offeredSources = canvases.offered.read(reader) ? sources.sources : sources.sources.filter(source => source.kind !== SessionChatPillKind.Canvases);
				return changesPillHidden.read(reader)
					? offeredSources.filter(source => source.kind !== SessionChatPillKind.Changes)
					: offeredSources;
			}),
			offeredKinds: SESSION_CHAT_PILL_KINDS,
			focusFallback: () => this._widget.focusInput(),
		}));
		inputPills.element.classList.add('agent-host-session-input-pills');

		this._register(this._widget.inputPart.registerChatPetHorizontalPlatformProvider({
			onDidChange: inputPills.onDidChange,
			getElements: () => inputPills.getPillElements(),
		}));
		const updateVisibility = (visible: boolean) => {
			this._widget.inputPart.persistentContentContainerElement.classList.toggle(chatPersistentContentVisibleClass, visible);
			this._widget.setPersistentContentHeight(visible ? CHAT_INPUT_PILLS_ROW_HEIGHT : undefined);
		};
		this._register(inputPills.onDidChangeVisibility(updateVisibility));
		updateVisibility(inputPills.visible);
	}

	/** Overridable so tests can drive customization resolution deterministically; `undefined` uses the idle scheduler. */
	protected createCustomizationScheduler(): ICustomizationJobScheduler | undefined {
		return undefined;
	}

	/**
	 * Whether the session working set offers Undo when it shows Session Changes,
	 * on hosts without a Working Set. Undo is switched off there, which hides its
	 * buttons, until it ships; overridable so tests can turn it on.
	 */
	protected get workingSetUndoEnabled(): boolean {
		return false;
	}

	private _buildReferenceSections(
		links: readonly string[],
		kind: 'pullRequest' | 'issue',
		reader: IReader,
		gitHubReferenceResolver: AgentHostGitHubReferenceResolver,
		gitHubState?: ReturnType<typeof readSessionGitHubState>,
		titles?: ReadonlyMap<string, string>,
		artifacts?: ReadonlyMap<string, ISessionArtifact>,
		removeArtifact?: (artifact: ISessionArtifact) => Promise<void>,
	) {
		const entries = links.map(link => {
			const resource = parseUri(link);
			if (!resource) {
				return undefined;
			}
			const number = githubReferenceNumber(resource, kind);
			const title = titles?.get(linkKey(link));
			const artifact = artifacts?.get(linkKey(link));
			const label = referenceLabel(link, kind, title);
			const target = parseGitHubReferenceTarget(resource, kind);
			const pullRequestDetails = kind === 'pullRequest' && target
				? gitHubReferenceResolver.getPullRequest(target).read(reader)
				: undefined;
			const issue = kind === 'issue' && target
				? gitHubReferenceResolver.getIssue(target).read(reader)
				: undefined;
			const liveTitle = pullRequestDetails?.pullRequest.title ?? issue?.title;
			const presentation = number ? getChatReferencePillPresentation(kind, `#${number}`, liveTitle, title) : undefined;
			const resourceLabel = presentation?.resourceLabel ?? label;
			const pullRequestState = pullRequestDetails
				? getPullRequestResourceStatus(pullRequestDetails.pullRequest).kind
				: kind === 'pullRequest'
					&& gitHubState?.pullRequestState
					&& gitHubState.pullRequestStateUrl
					&& linkKey(gitHubState.pullRequestStateUrl) === linkKey(link)
					? gitHubState.pullRequestState
					: 'open';
			const createHover = pullRequestDetails && target
				? (density: 'default' | 'compact') => createPullRequestResourceHover({
					...target,
					repositoryHref: `https://github.com/${target.owner}/${target.repo}`,
					referenceHref: resource.toString(true),
					pullRequest: pullRequestDetails.pullRequest,
					checksStatus: pullRequestDetails.checksStatus,
					density,
					onDidClickRepository: () => this._openExternal(URI.parse(`https://github.com/${target.owner}/${target.repo}`)),
					onDidClickReference: () => this._openExternal(resource),
					onDidClickBaseBranch: () => this._clipboardService.writeText(pullRequestDetails.pullRequest.baseRef),
					onDidClickHeadBranch: () => this._clipboardService.writeText(pullRequestDetails.pullRequest.headRef),
				})
				: issue && target
					? (density: 'default' | 'compact') => createIssueResourceHover({
						...target,
						repositoryHref: `https://github.com/${target.owner}/${target.repo}`,
						referenceHref: resource.toString(true),
						issue,
						density,
						onDidClickRepository: () => this._openExternal(URI.parse(`https://github.com/${target.owner}/${target.repo}`)),
						onDidClickReference: () => this._openExternal(resource),
					})
					: undefined;
			const stateDescription = pullRequestDetails
				? getPullRequestResourceStatus(pullRequestDetails.pullRequest).label
				: issue
					? getIssueResourceStatus(issue).label
					: undefined;
			const checksDescription = pullRequestDetails
				? getPullRequestChecksStatusLabel(pullRequestDetails.pullRequest, pullRequestDetails.checksStatus)
				: undefined;
			const entry: IChatPullRequestPillEntry = {
				id: linkKey(link),
				label,
				icon: kind === 'pullRequest' ? computePullRequestIcon(pullRequestState) : computeIssueIcon(issue?.state ?? 'open', issue?.stateReason),
				pullRequestState: kind === 'pullRequest' ? pullRequestState : undefined,
				promotedAction: artifact && removeArtifact ? this._createRemoveAction(artifact, removeArtifact) : undefined,
				toolbarActions: [withChatPillHoverLabel(toAction({
					id: `chatInputPills.copy.${kind}.${linkKey(link)}`,
					label: kind === 'pullRequest'
						? localize('agentHostSessionPills.copyPullRequest', "Copy Pull Request URL")
						: localize('agentHostSessionPills.copyIssue', "Copy Issue URL"),
					class: ThemeIcon.asClassName(Codicon.copy),
					run: () => this._clipboardService.writeText(resource.toString(true)),
				}), chatPillCopyUrlHoverLabel)],
				...getChatPillResourceLocation(resource, resourceLabel),
				...presentation?.entry,
				...(stateDescription ? {
					ariaDescription: checksDescription
						? localize('agentHostSessionPills.referenceDescriptionWithChecks', "{0}. {1}. {2}", stateDescription, checksDescription, resource.toString(true))
						: localize('agentHostSessionPills.referenceDescription', "{0}. {1}", stateDescription, resource.toString(true)),
				} : {}),
				...(liveTitle || title ? { tooltip: `${resourceLabel}\n${resource.toString(true)}` } : {}),
				open: () => this._openExternal(resource),
			};
			return target ? {
				...entry,
				...(kind === 'pullRequest' ? this._pullRequestHoverCache : this._issueHoverCache).get(linkKey(link), entry, createHover),
			} : entry;
		}).filter(isDefined);
		const title = kind === 'pullRequest'
			? localize('agentHostSessionPills.pullRequests.section', "Pull Requests")
			: localize('agentHostSessionPills.issues.section', "Issues");
		return entries.length > 0 ? [{ title, entries }] : [];
	}

	private _buildArtifactSections(entries: readonly ISessionArtifact[], browserUrls: ReadonlySet<string>, resolution: IAgentHostSessionResolution, commitResolver: GitHubCommitResolver, reader: IReader, removeArtifact?: (artifact: ISessionArtifact) => Promise<void>): readonly IChatPillSection[] {
		const browserKeys = new Set([...browserUrls].map(websiteKey).filter(isDefined));
		const entriesByType = new Map<SessionArtifactType, IChatPillEntry[]>();
		for (const artifact of entries) {
			if (artifact.type === SessionArtifactType.Website && artifact.link) {
				const key = websiteKey(artifact.link);
				if (key && browserKeys.has(key)) {
					continue;
				}
			}
			const entry = this._artifactEntry(artifact, resolution, commitResolver, reader);
			if (entry) {
				const typeEntries = entriesByType.get(artifact.type) ?? [];
				typeEntries.push(removeArtifact ? { ...entry, promotedAction: this._createRemoveAction(artifact, removeArtifact) } : entry);
				entriesByType.set(artifact.type, typeEntries);
			}
		}
		return artifactSectionOrder.flatMap(({ type, title }) => {
			const sectionEntries = entriesByType.get(type);
			return sectionEntries?.length ? [{ title, entries: sectionEntries }] : [];
		});
	}

	private _artifactEntry(artifact: ISessionArtifact, resolution: IAgentHostSessionResolution, commitResolver: GitHubCommitResolver, reader: IReader): IChatPillEntry | undefined {
		if (artifact.type === SessionArtifactType.File || artifact.type === SessionArtifactType.Resource) {
			const artifactResource = parseUri(artifact.uri);
			if (!artifactResource) {
				return undefined;
			}
			const resource = artifact.type === SessionArtifactType.File
				? toAgentHostUri(artifactResource, resourceAuthority(resolution))
				: artifactResource;
			const label = artifact.type === SessionArtifactType.File ? basename(resource) : artifact.label;
			const imageMimeType = artifact.type === SessionArtifactType.File && !artifact.isArtifact ? getMediaMime(resource.path) : undefined;
			const fullPath = artifact.type === SessionArtifactType.File ? this._labelService.getUriLabel(resource, { noPrefix: true }) : undefined;
			const relativePath = artifact.type === SessionArtifactType.File ? this._labelService.getUriLabel(resource, { relative: true, noPrefix: true }) : undefined;
			return {
				id: artifact.id,
				label,
				...(artifact.type === SessionArtifactType.File ? { resource } : { icon: Codicon.link }),
				toolbarActions: [toAction({
					id: artifact.type === SessionArtifactType.File
						? `chat.agentHost.sessionPills.copyFilePath.${artifact.id}`
						: `chat.agentHost.sessionPills.copyResourceUri.${artifact.id}`,
					label: artifact.type === SessionArtifactType.File
						? localize('agentHostSessionPills.copyFilePath', "Copy Path")
						: localize('agentHostSessionPills.copyResourceUri', "Copy URI"),
					class: ThemeIcon.asClassName(Codicon.copy),
					run: () => this._clipboardService.writeText(fullPath ?? resource.toString(true)),
				})],
				...(relativePath ? {
					hoverActions: [toAction({
						id: `chat.agentHost.sessionPills.copyFileRelativePath.${artifact.id}`,
						label: localize('agentHostSessionPills.copyFileRelativePath', "Copy Relative Path"),
						class: ThemeIcon.asClassName(Codicon.copy),
						run: () => this._clipboardService.writeText(relativePath),
					})],
				} : {}),
				...(imageMimeType?.startsWith('image/') ? { imagePreview: { resource, mimeType: imageMimeType } } : {}),
				...getChatPillResourceLocation(resource, label),
				open: () => this._openResource(resource),
			};
		}

		const link = parseUri(artifact.link);
		const icon = artifactIcons.get(artifact.type) ?? Codicon.archive;
		if (link) {
			const commitTarget = artifact.type === SessionArtifactType.Commit ? parseGitHubCommitTarget(link) : undefined;
			const commit = commitTarget ? commitResolver.get(commitTarget).read(reader) : undefined;
			const label = commit?.message.split(/\r?\n/, 1)[0] || artifact.label;
			const createCommitHover = commitTarget && commit ? (density: 'default' | 'compact') => createCommitResourceHover({
				owner: commitTarget.owner,
				repo: commitTarget.repo,
				repositoryHref: `https://github.com/${commitTarget.owner}/${commitTarget.repo}`,
				referenceHref: link.toString(true),
				commit,
				density,
				onDidClickRepository: () => this._openExternal(URI.parse(`https://github.com/${commitTarget.owner}/${commitTarget.repo}`)),
				onDidClickReference: () => this._openExternal(link),
			}) : undefined;
			const copyAction = artifact.type === SessionArtifactType.Commit
				? withChatPillHoverLabel(toAction({
					id: `chat.agentHost.sessionPills.copyCommitUrl.${artifact.id}`,
					label: localize('agentHostSessionPills.copyCommitUrl', "Copy Commit URL"),
					class: ThemeIcon.asClassName(Codicon.copy),
					run: () => this._clipboardService.writeText(link.toString(true)),
				}), chatPillCopyUrlHoverLabel)
				: artifact.type === SessionArtifactType.Website
					? withChatPillHoverLabel(toAction({
						id: `chat.agentHost.sessionPills.copyWebsiteUrl.${artifact.id}`,
						label: localize('agentHostSessionPills.copyWebsiteUrl', "Copy Website URL"),
						class: ThemeIcon.asClassName(Codicon.copy),
						run: () => this._clipboardService.writeText(link.toString(true)),
					}), chatPillCopyUrlHoverLabel)
					: artifact.type === SessionArtifactType.PullRequest || artifact.type === SessionArtifactType.Issue
						? withChatPillHoverLabel(toAction({
							id: `chat.agentHost.sessionPills.copyReferenceUrl.${artifact.id}`,
							label: artifact.type === SessionArtifactType.PullRequest
								? localize('agentHostSessionPills.copyPullRequestUrl', "Copy Pull Request URL")
								: localize('agentHostSessionPills.copyIssueUrl', "Copy Issue URL"),
							class: ThemeIcon.asClassName(Codicon.copy),
							run: () => this._clipboardService.writeText(link.toString(true)),
						}), chatPillCopyUrlHoverLabel)
						: undefined;
			const gitHubKind = artifact.isGitHub === true
				? artifact.type === SessionArtifactType.PullRequest
					? 'pullRequest'
					: artifact.type === SessionArtifactType.Issue
						? 'issue'
						: undefined
				: undefined;
			const gitHubDetails = gitHubKind ? this._gitHubResourceDetailsResolver.resolveReference(artifact, {
				kind: gitHubKind,
				resource: link,
				fallbackLabel: label,
				enrich: !artifact.isArtifact,
				onDidClickRepository: resource => this._openExternal(resource),
				onDidClickReference: () => this._openExternal(link),
				onDidClickBranch: branch => { void this._clipboardService.writeText(branch); },
			}) : undefined;
			const gitHubPresentation = gitHubDetails
				? gitHubDetails.presentation.read(reader)
				: gitHubKind
					? getGitHubResourcePresentation(link, gitHubKind, undefined, label)
					: undefined;
			const displayLabel = gitHubPresentation?.label ?? label;
			const entry: IChatPillEntry = {
				id: artifact.id,
				label: displayLabel,
				icon,
				...(copyAction ? { toolbarActions: [copyAction] } : {}),
				...((artifact.type === SessionArtifactType.Commit && (artifact.commitHash || commit?.sha)) ? {
					hoverActions: [withChatPillHoverLabel(toAction({
						id: `chat.agentHost.sessionPills.copyCommitHash.${artifact.id}`,
						label: localize('agentHostSessionPills.copyCommitHash', "Copy Commit Hash"),
						class: ThemeIcon.asClassName(Codicon.copy),
						run: () => this._clipboardService.writeText(artifact.commitHash ?? commit!.sha),
					}), chatPillCopyHashHoverLabel)],
				} : {}),
				...getChatPillResourceLocation(link, displayLabel),
				...gitHubPresentation,
				...gitHubDetails?.hover,
				open: () => this._openExternal(link),
			};
			return artifact.type === SessionArtifactType.Commit
				? { ...entry, ...this._commitHoverCache.get(artifact.id, entry, createCommitHover, commitTarget ? 'preview' : 'content') }
				: entry;
		}
		if (artifact.type === SessionArtifactType.Commit && artifact.commitHash) {
			return {
				id: artifact.id,
				label: artifact.label,
				icon,
				ariaLabel: localize('agentHostSessionPills.copyCommit', "Copy Commit Hash for {0}", artifact.label),
				tooltip: artifact.commitHash,
				open: () => { void this._clipboardService.writeText(artifact.commitHash!); },
			};
		}
		return undefined;
	}

	private _getRemoveArtifactAction(resolution: IAgentHostSessionResolution | undefined, reader: IReader): ((artifact: ISessionArtifact) => Promise<void>) | undefined {
		return resolution?.connection.removeSessionArtifact && supportsAgentHostArtifactRemoval(resolution.connection.initializeResult.read(reader))
			? artifact => this._removeArtifact(resolution, artifact)
			: undefined;
	}

	private _createRemoveAction(artifact: ISessionArtifact, removeArtifact: (artifact: ISessionArtifact) => Promise<void>) {
		return withChatPillHoverLabel(toAction({
			id: `chat.agentHost.sessionPills.removeArtifact.${artifact.id}`,
			label: artifact.isArtifact
				? localize('agentHostSessionPills.removeArtifact', "Remove Artifact {0} from Session", artifact.label)
				: localize('agentHostSessionPills.removeReference', "Remove Reference {0} from Session", artifact.label),
			class: ThemeIcon.asClassName(Codicon.close),
			run: () => removeArtifact(artifact),
		}), artifact.isArtifact ? chatPillRemoveArtifactHoverLabel : chatPillRemoveReferenceHoverLabel);
	}

	private async _removeArtifact(resolution: IAgentHostSessionResolution, artifact: ISessionArtifact): Promise<void> {
		try {
			if (!resolution.connection.removeSessionArtifact) {
				throw new Error(localize('agentHostSessionPills.removeArtifactUnavailable', "Removing references is unavailable for this session."));
			}
			await resolution.connection.removeSessionArtifact(resolution.backendSession, artifact.id);
			status(localize('agentHostSessionPills.artifactRemoved', "{0} removed from session.", artifact.label));
		} catch (error) {
			this._notificationService.error(localize('agentHostSessionPills.removeArtifactFailed', "Could not remove {0} from this session: {1}", artifact.label, toErrorMessage(error)));
		}
	}

	/**
	 * Discards the session's changes to the files of `diffs`, one at a time, with
	 * the host's `operation` on the working set's `channel`, after confirming
	 * once if the host requires that. Without the host's confirmation, as on the
	 * Working Set, only undoing `all` files is confirmed, like Undo All Edits in
	 * the editing session's working set. See {@link _invokeFileOperation} for how
	 * each file is checked. Resolves to whether any file's changes were discarded.
	 */
	private async _discardSessionChanges(resolution: IAgentHostSessionResolution, channel: URI, operation: IObservable<ChangesetOperation | undefined>, inFlight: ISettableObservable<readonly string[]>, diffs: readonly IEditSessionEntryDiff[], all: boolean): Promise<boolean> {
		const discard = operation.get();
		if (!discard || diffs.length === 0) {
			return false;
		}
		if (discard.confirmation) {
			if (!await this._confirmFileOperation(discard, diffs)) {
				return false;
			}
		} else if (all && !await confirmUndoAllEdits(this._dialogService, diffs.map(diff => diff.modifiedURI))) {
			return false;
		}
		return this._invokeFileOperation(resolution, channel, discard, inFlight, diffs, {
			unverified: localize('agentHostSessionPills.undoUnverified', "The session's changes couldn't be checked. Try again."),
			changed: fileName => localize('agentHostSessionPills.undoChanged', "'{0}' changed after the undo was confirmed.", fileName),
			failed: (fileNames, messages) => localize('agentHostSessionPills.undoFailed', "Could not undo changes to {0}: {1}", fileNames, messages),
		});
	}

	/**
	 * Keeps the session's changes to the files of `diffs`, one at a time, with
	 * the host's Accept Changes `operation` on the session's Working Set
	 * `channel`, after confirming once if the host requires that. See
	 * {@link _invokeFileOperation} for how each file is checked. Changes kept
	 * `automatic`ally, as by staging them with Git, are kept after a Keep in
	 * progress, and are left alone while the host can't accept them, as while a
	 * turn runs, or when it requires confirming. Resolves to whether any file's
	 * changes were kept.
	 */
	private async _keepWorkingSetChanges(resolution: IAgentHostSessionResolution, channel: URI, operation: IObservable<ChangesetOperation | undefined>, inFlight: ISettableObservable<readonly string[]>, diffs: readonly IEditSessionEntryDiff[], automatic: boolean): Promise<boolean> {
		const accept = operation.get();
		if (!accept || diffs.length === 0) {
			return false;
		}
		if (automatic) {
			if (accept.status === ChangesetOperationStatus.Disabled || accept.confirmation) {
				return false;
			}
		} else if (!await this._confirmFileOperation(accept, diffs)) {
			return false;
		}
		return this._invokeFileOperation(resolution, channel, accept, inFlight, diffs, {
			unverified: localize('agentHostSessionPills.keepUnverified', "The session's changes couldn't be checked. Try again."),
			changed: fileName => localize('agentHostSessionPills.keepChanged', "'{0}' changed before its changes could be kept.", fileName),
			failed: (fileNames, messages) => localize('agentHostSessionPills.keepFailed', "Could not keep changes to {0}: {1}", fileNames, messages),
		});
	}

	/**
	 * Shows the host's confirmation of `operation` on the files of `diffs`, as
	 * the protocol requires before invoking an operation that has one.
	 * Resolves to whether to invoke it: always when it has no confirmation.
	 */
	private async _confirmFileOperation(operation: ChangesetOperation, diffs: readonly IEditSessionEntryDiff[]): Promise<boolean> {
		if (!operation.confirmation) {
			return true;
		}
		const template = typeof operation.confirmation === 'string' ? operation.confirmation : operation.confirmation.markdown;
		// The host's confirmation names one file, so several are counted there and listed in the detail.
		const { confirmed } = await this._dialogService.confirm({
			type: 'warning',
			message: format(template, diffs.length === 1 ? basename(diffs[0].modifiedURI) : localize('agentHostSessionPills.undoFileCount', "{0} files", diffs.length)),
			detail: diffs.length === 1 ? undefined : getFileNamesMessage(diffs.map(diff => this._labelService.getUriLabel(diff.modifiedURI, { relative: true, noPrefix: true }))),
			primaryButton: operation.label,
		});
		return confirmed;
	}

	/**
	 * Invokes the host's file-level `operation` on `channel` for the files of
	 * `diffs`, one at a time, after the file operations on `channel` already
	 * in progress. Each file is first checked against the channel's
	 * up-to-date files, and a file whose changes differ from its diff, as when a
	 * turn changed it in the meantime, is left alone. Each file leaves the
	 * working set once the host recomputes the channel. Failures are reported
	 * together. Resolves to whether the operation succeeded for any file.
	 */
	private async _invokeFileOperation(resolution: IAgentHostSessionResolution, channel: URI, operation: ChangesetOperation, inFlight: ISettableObservable<readonly string[]>, diffs: readonly IEditSessionEntryDiff[], messages: { readonly unverified: string; changed(fileName: string): string; failed(fileNames: string, messages: string): string }): Promise<boolean> {
		const channelKey = channel.toString();
		inFlight.set([...inFlight.get(), channelKey], undefined);
		try {
			return await this._fileOperations.queue(channelKey, () => this._doInvokeFileOperation(resolution, channel, operation, diffs, messages));
		} finally {
			const channels = [...inFlight.get()];
			channels.splice(channels.indexOf(channelKey), 1);
			inFlight.set(channels, undefined);
		}
	}

	private async _doInvokeFileOperation(resolution: IAgentHostSessionResolution, channel: URI, operation: ChangesetOperation, diffs: readonly IEditSessionEntryDiff[], messages: { readonly unverified: string; changed(fileName: string): string; failed(fileNames: string, messages: string): string }): Promise<boolean> {
		const { connection, connectionAuthority } = resolution;
		const channelKey = channel.toString();
		// Each file is checked against the channel's latest state, which outlasts a switch to another session.
		const changeset = connection.getSubscription(StateComponents.Changeset, channel, 'AgentHostSessionInputPills.fileOperation');
		const failures: { readonly fileName: string; readonly message: string }[] = [];
		let succeeded = 0;
		try {
			for (let i = 0; i < diffs.length; i++) {
				const diff = diffs[i];
				const fileName = basename(diff.modifiedURI);
				// The operation updates the channel's files, so each file waits for them.
				const state = await whenChangesetReady(changeset.object);
				if (!state) {
					// Without up-to-date changes, a file can't be checked against the expected ones, so none is changed.
					failures.push(...diffs.slice(i).map(remaining => ({ fileName: basename(remaining.modifiedURI), message: messages.unverified })));
					break;
				}
				const currentFile = state.files.find(file => {
					const candidate = agentHostChangesetFileToEntryDiff(file, connectionAuthority);
					return candidate && isEqual(candidate.modifiedURI, diff.modifiedURI);
				});
				const current = currentFile && agentHostChangesetFileToEntryDiff(currentFile, connectionAuthority);
				if (!current) {
					// The file's changes are already gone.
					continue;
				}
				const nonce = this._fileChangeNonces.get(diff);
				if (!isSameSessionFileChange(current, diff) || (nonce !== undefined && nonce !== currentFile?.nonce)) {
					failures.push({ fileName, message: messages.changed(fileName) });
					continue;
				}
				// The agent may change the file while it works, so a Working Set operation names the changes that were shown.
				try {
					await connection.invokeChangesetOperation({
						channel: channelKey,
						operationId: operation.id,
						target: {
							kind: ChangesetOperationTargetKind.Resource,
							resource: connection.resourceUris.toAgentHost(diff.modifiedURI).toString(),
							...(nonce !== undefined ? { nonce } : {}),
						},
					});
					succeeded++;
				} catch (error) {
					failures.push({ fileName, message: toErrorMessage(error) });
				}
			}
		} finally {
			changeset.dispose();
		}
		if (failures.length > 0) {
			this._notificationService.error(messages.failed(failures.map(failure => failure.fileName).join(', '), distinct(failures.map(failure => failure.message)).join(' ')));
		}
		return succeeded > 0;
	}

	private _browserEntry(input: BrowserEditorInput, sessionResource: URI | undefined): IChatPillEntry {
		const label = input.title?.trim() || localize('agentHostSessionPills.browser', "Browser");
		return {
			id: input.id,
			label,
			icon: Codicon.globe,
			open: () => { void this._openBrowser(input, sessionResource); },
		};
	}

	private async _openBrowser(input: BrowserEditorInput, sessionResource: URI | undefined): Promise<void> {
		const url = input.url;
		const shared = url
			? [...this._browserViewService.getContextualBrowserViews({ activeSessionId: sessionResource?.toString() }).values()]
				.filter(candidate => candidate.model?.sharingState === BrowserViewSharingState.Shared && browserViewUrlMatches(candidate.url, url))
			: [];
		const target = input.model?.sharingState === BrowserViewSharingState.Shared || !url
			? input
			: shared.find(candidate => candidate.url === url) ?? shared.at(0) ?? input;
		const existing = this._editorService.findEditors(target.resource)
			.find(identifier => identifier.editor instanceof BrowserEditorInput && identifier.editor.id === target.id);
		const targetGroup = existing?.groupId ?? await this._browserViewService.getPreferredGroup();
		await this._editorService.openEditor(target, undefined, targetGroup);
	}

	private _openChanges(changeset: Changeset | undefined, diffs: readonly IEditSessionEntryDiff[]): void {
		if (diffs.length > 0) {
			const sessionEditorLabel = localize('agentHostSessionPills.changesEditor', "Session Changes");
			let label = changeset?.label ?? sessionEditorLabel;
			// Keep editor titles descriptive without replacing host-defined labels.
			if (changeset?.changeKind === ChangesetKind.Branch && label === branchChangesetLabel()) {
				label = localize('agentHostSessionPills.branchChangesEditor', "Branch Changes");
			} else if (changeset?.changeKind === ChangesetKind.Uncommitted && label === uncommittedChangesetLabel()) {
				label = localize('agentHostSessionPills.uncommittedChangesEditor', "Uncommitted Changes");
			} else if (changeset?.changeKind === ChangesetKind.Session && label === sessionChangesetLabel()) {
				label = sessionEditorLabel;
			}
			openChatFileChanges(this._editorService, label, diffs);
		}
	}

	private _openExternal(resource: URI): void {
		void this._openerService.open(resource, { openExternal: true, allowContributedOpeners: true, fromUserGesture: true });
	}

	private _openResource(resource: URI): void {
		const kind = previewKind(resource);
		if (kind) {
			void openChatTurnFile({ uri: resource, kind, created: false }, this._openerService, this._configurationService);
			return;
		}
		void this._openerService.open(resource, { fromUserGesture: true });
	}

	private _refreshBrowserListeners(): void {
		const store = new DisposableStore();
		this._browserListeners.value = store;
		for (const input of this._browserViewService.getKnownBrowserViews().values()) {
			store.add(input.onDidChangeLabel(() => this._browserChanged.trigger(undefined)));
		}
		this._browserChanged.trigger(undefined);
	}
}
