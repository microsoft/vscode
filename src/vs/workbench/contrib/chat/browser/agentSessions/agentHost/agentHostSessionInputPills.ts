/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow } from '../../../../../../base/browser/dom.js';
import { toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedObservableWithCache, derivedOpts, observableFromEvent, observableSignal, observableSignalFromEvent } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { resolveChangesetUriTemplate, selectDefaultChangeset, type DefaultChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { ISessionArtifact, isGitHubArtifactLink, readSessionArtifactsNewestFirst, SessionArtifactType } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { Changeset, ChangesetState, ChangesetStatus, ChatOriginKind, DEFAULT_CHAT_ID, getSessionChatResource, getSessionRelatedPullRequestUrls, isSubagentChatUri, parseChatUri, readSessionGitHubState, SessionState, SessionSummaryMeta, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, getChatPillEntries, getChatPillResourceLocation, IChatPillEntry, IChatPillSection, type ChatPillsCompactMode } from '../../../../../browser/chatPills.js';
import { chatChangesStatsEqual, EMPTY_CHAT_CHANGES_STATS, IChatChangesStats } from '../../../../../browser/chatChangesPill.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { browserViewUrlMatches, BrowserViewSharingState, getAgentBrowserViewsNewestFirst, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { computePullRequestIcon, getHighestPriorityPullRequestIcon } from '../../../../../common/chatPullRequest.js';
import { ISessionChatPillVisibilityService, SessionChatPillKind } from '../../../common/sessionChatPills.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../common/constants.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import { chatPersistentContentVisibleClass, type ChatWidget } from '../../widget/chatWidget.js';
import { openChatTurnFile, previewKind } from '../../widget/chatTurnPills.js';
import { openChatFileChanges } from '../../editorChatResponseFileChangesService.js';
import { ChatInputPills, StandardChatInputPillSources } from '../../chatInputPills.js';
import { createSessionPullRequestPillData } from '../../sessionPullRequestPill.js';
import { agentHostChangesetFileToEntryDiff } from './agentHostResponseFileChanges.js';

const offeredPillKinds: readonly SessionChatPillKind[] = [
	SessionChatPillKind.Changes,
	SessionChatPillKind.PullRequests,
	SessionChatPillKind.Issues,
	SessionChatPillKind.Artifacts,
	SessionChatPillKind.References,
	SessionChatPillKind.Browsers,
];

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
	readonly issueUrls: readonly string[];
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

function isPromotedArtifact(artifact: ISessionArtifact, type: SessionArtifactType): artifact is ISessionArtifact & { readonly link: string } {
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
export function getAgentHostSessionPillMetadata(meta: SessionSummaryMeta | undefined): IAgentHostSessionPillMetadata {
	const entries = readSessionArtifactsNewestFirst(meta);
	const github = readSessionGitHubState(meta);
	const artifactPullRequests = entries.filter(entry => isPromotedArtifact(entry, SessionArtifactType.PullRequest)).map(entry => entry.link);
	const artifactIssues = entries.filter(entry => isPromotedArtifact(entry, SessionArtifactType.Issue)).map(entry => entry.link);
	// Recorded pull requests lead discovered ones, as in the Agents Window.
	const pullRequestUrls = dedupeLinks(artifactPullRequests, getSessionRelatedPullRequestUrls(github));
	const issueUrls = dedupeLinks(artifactIssues);
	const promotedLinks = new Set([...pullRequestUrls, ...issueUrls].map(linkKey));
	const remaining = entries.filter(entry => !entry.link || !promotedLinks.has(linkKey(entry.link)));
	return {
		pullRequestUrls,
		issueUrls,
		artifacts: remaining.filter(entry => entry.isArtifact),
		references: remaining.filter(entry => !entry.isArtifact),
	};
}

/** Resolves the session-wide changeset represented by the workbench Changes pill. */
export function resolveAgentHostSessionChangeset(
	backendSession: URI,
	changesets: readonly Changeset[] | undefined,
	defaultKind?: DefaultChangesetKind,
): { readonly changeset: Changeset; readonly resource: URI } | undefined {
	const staticChangesets = changesets?.filter(changeset => !changeset.uriTemplate.includes('{')) ?? [];
	const changeset = selectDefaultChangeset(staticChangesets, defaultKind);
	const resource = changeset ? parseUri(resolveChangesetUriTemplate(backendSession.toString(), changeset.uriTemplate)) : undefined;
	return changeset && resource ? { changeset, resource } : undefined;
}

/** Resolves the chat channel URI a workbench chat resource addresses. */
export function getAgentHostSessionChatResource(sessionResource: URI, state: Pick<SessionState, 'chats' | 'defaultChat'> | undefined): URI | undefined {
	const explicitChatResource = new URLSearchParams(sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
	if (explicitChatResource) {
		return parseUri(explicitChatResource);
	}
	return state ? parseUri(getSessionChatResource(state, sessionResource.fragment || DEFAULT_CHAT_ID)?.toString()) : undefined;
}

/** Returns the workbench chat resources whose browsers belong in the current chat's pill. */
export function getAgentHostSessionBrowserOwnerIds(sessionResource: URI, state: Pick<SessionState, 'chats' | 'defaultChat'> | undefined): ReadonlySet<string> {
	const ownerIds = new Set<string>([sessionResource.toString()]);
	if (!state) {
		return ownerIds;
	}

	const currentChatResource = getAgentHostSessionChatResource(sessionResource, state);
	if (!currentChatResource) {
		return ownerIds;
	}

	for (const chat of state.chats) {
		const parentChatResource = chat.origin?.kind === ChatOriginKind.Tool ? parseUri(chat.origin.chat) : undefined;
		const parsedChat = parseChatUri(chat.resource);
		if (!parentChatResource || !isEqual(parentChatResource, currentChatResource) || !parsedChat) {
			continue;
		}

		ownerIds.add(sessionResource.with({ fragment: parsedChat.chatId, query: null }).toString());
		const query = new URLSearchParams(sessionResource.query);
		query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, chat.resource);
		ownerIds.add(sessionResource.with({ fragment: parsedChat.chatId, query: query.toString() }).toString());
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

function referenceLabel(link: string, kind: 'pullRequest' | 'issue'): string {
	const resource = parseUri(link);
	const number = resource ? githubReferenceNumber(resource, kind) : undefined;
	if (kind === 'pullRequest') {
		return number
			? localize('agentHostSessionPills.pullRequest.number', "Pull Request #{0}", number)
			: localize('agentHostSessionPills.pullRequest', "Pull Request");
	}
	return number
		? localize('agentHostSessionPills.issue.number', "Issue #{0}", number)
		: localize('agentHostSessionPills.issue', "Issue");
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

/** Adds Agent Host session metadata pills to a workbench chat input. */
export class AgentHostSessionInputPills extends Disposable {

	private readonly _browserChanged = observableSignal(this);
	private readonly _browserListeners = this._register(new MutableDisposable<DisposableStore>());

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
	) {
		super();

		const sessionResource = observableFromEvent(this, this._widget.onDidChangeViewModel, () => this._widget.viewModel?.sessionResource);
		const sessionResolutionChanged = observableSignalFromEvent(this, connectionsService.onDidChangeSessionResolution);
		const resolution = derivedOpts<IAgentHostSessionResolution | undefined>({ owner: this, equalsFn: resolutionEquals }, reader => {
			sessionResolutionChanged.read(reader);
			const resource = sessionResource.read(reader);
			return resource ? connectionsService.resolveSessionResource(resource) : undefined;
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
		// A subagent (worker) chat inherits the session-wide pills, where they read
		// as the subagent's own work, so the row stays hidden there.
		const subagentChat = derived(this, reader => {
			const resource = sessionResource.read(reader);
			const chatResource = resource ? getAgentHostSessionChatResource(resource, sessionState.read(reader)) : undefined;
			return !!chatResource && isSubagentChatUri(chatResource);
		});
		const pillsVisible = derived(this, reader => !subagentChat.read(reader));
		const changesetTarget = derivedOpts({ owner: this, equalsFn: changesetTargetEquals }, reader => {
			const currentResolution = resolution.read(reader);
			return currentResolution
				? resolveAgentHostSessionChangeset(currentResolution.backendSession, sessionState.read(reader)?.changesets, currentResolution.defaultChangesetKind)
				: undefined;
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
			if (state.status !== ChangesetStatus.Ready && lastValue?.connectionAuthority === currentResolution.connectionAuthority && isEqual(lastValue.resource, target.resource)) {
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
				.map(file => agentHostChangesetFileToEntryDiff(file, currentResolution.connectionAuthority))
				.filter(isDefined);
		});
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
		const metadata = derived(this, reader => getAgentHostSessionPillMetadata(sessionState.read(reader)?._meta));
		const gitHubState = derived(this, reader => readSessionGitHubState(sessionState.read(reader)?._meta));

		this._register(this._browserViewService.onDidChangeBrowserViews(() => this._refreshBrowserListeners()));
		this._refreshBrowserListeners();
		const browserInputs = derived(this, reader => {
			this._browserChanged.read(reader);
			const resource = sessionResource.read(reader);
			if (!resource || !resolution.read(reader)) {
				return [];
			}
			const ownerIds = getAgentHostSessionBrowserOwnerIds(resource, sessionState.read(reader));
			return getAgentBrowserViewsNewestFirst(this._browserViewService, ownerIds);
		});
		const browserUrls = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: setsEqual }, reader => {
			return visibility.isVisible(SessionChatPillKind.Browsers, reader)
				? new Set(browserInputs.read(reader).map(input => input.url).filter(isDefined))
				: new Set();
		});

		const pullRequestSections = derived(this, reader => this._buildReferenceSections(metadata.read(reader).pullRequestUrls, 'pullRequest', gitHubState.read(reader)));
		const pullRequestIcon = derived(this, reader => {
			const icons = getChatPillEntries(pullRequestSections.read(reader)).map(entry => entry.icon);
			return getHighestPriorityPullRequestIcon(icons) ?? computePullRequestIcon('open');
		});
		const issueSections = derived(this, reader => this._buildReferenceSections(metadata.read(reader).issueUrls, 'issue'));
		const artifactSections = derived(this, reader => {
			const currentResolution = resolution.read(reader);
			return currentResolution
				? this._buildArtifactSections(metadata.read(reader).artifacts, browserUrls.read(reader), currentResolution)
				: [];
		});
		const referenceSections = derived(this, reader => {
			const currentResolution = resolution.read(reader);
			return currentResolution
				? this._buildArtifactSections(metadata.read(reader).references, browserUrls.read(reader), currentResolution)
				: [];
		});
		const browserSections = derived(this, reader => {
			const entries = browserInputs.read(reader).map(input => this._browserEntry(input, sessionResource.read(reader)));
			return entries.length > 0 ? [{ title: localize('agentHostSessionPills.browsers.section', "Browsers"), entries }] : [];
		});

		const sources = this._register(instantiationService.createInstance(StandardChatInputPillSources, {
			changes: {
				stats: changeStats,
				label: derived(this, reader => changesetTarget.read(reader)?.changeset.label ?? localize('agentHostSessionPills.changes', "Changes")),
				open: () => this._openChanges(changesetTarget.get()?.changeset.label ?? localize('agentHostSessionPills.changesEditor', "Session Changes"), changes.get()),
			},
			pullRequests: createSessionPullRequestPillData(pullRequestSections, visibility.pullRequests, pullRequestIcon),
			issues: { sections: issueSections },
			artifacts: { sections: artifactSections },
			references: { sections: referenceSections },
			browsers: { sections: browserSections },
		}, offeredPillKinds));
		const inputPills = this._register(instantiationService.createInstance(ChatInputPills, this._widget.inputPart.persistentContentContainerElement, {
			debugName: 'AgentHostSessionInputPills.content',
			compact,
			targetWindow: getWindow(this._widget.inputPart.persistentContentContainerElement),
			enabled: pillsVisible,
			sources: constObservable(sources.sources),
			offeredKinds: offeredPillKinds,
			ariaLabel: localize('agentHostSessionPills.ariaLabel', "Session status"),
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

	private _buildReferenceSections(links: readonly string[], kind: 'pullRequest' | 'issue', gitHubState?: ReturnType<typeof readSessionGitHubState>) {
		const entries = links.map(link => {
			const resource = parseUri(link);
			if (!resource) {
				return undefined;
			}
			const number = githubReferenceNumber(resource, kind);
			const label = referenceLabel(link, kind);
			const pullRequestState = kind === 'pullRequest'
				&& gitHubState?.pullRequestState
				&& gitHubState.pullRequestStateUrl
				&& linkKey(gitHubState.pullRequestStateUrl) === linkKey(link)
				? gitHubState.pullRequestState
				: 'open';
			return {
				id: linkKey(link),
				label,
				...(kind === 'pullRequest' && number ? { pillLabel: `#${number}` } : {}),
				icon: kind === 'pullRequest' ? computePullRequestIcon(pullRequestState) : Codicon.issues,
				pullRequestState: kind === 'pullRequest' ? pullRequestState : undefined,
				toolbarActions: [toAction({
					id: `chatInputPills.copy.${kind}.${linkKey(link)}`,
					label: kind === 'pullRequest'
						? localize('agentHostSessionPills.copyPullRequest', "Copy Pull Request URL")
						: localize('agentHostSessionPills.copyIssue', "Copy Issue URL"),
					class: ThemeIcon.asClassName(Codicon.copy),
					run: () => this._clipboardService.writeText(resource.toString(true)),
				})],
				...getChatPillResourceLocation(resource, label),
				open: () => this._openExternal(resource),
			};
		}).filter(isDefined);
		const title = kind === 'pullRequest'
			? localize('agentHostSessionPills.pullRequests.section', "Pull Requests")
			: localize('agentHostSessionPills.issues.section', "Issues");
		return entries.length > 0 ? [{ title, entries }] : [];
	}

	private _buildArtifactSections(entries: readonly ISessionArtifact[], browserUrls: ReadonlySet<string>, resolution: IAgentHostSessionResolution): readonly IChatPillSection[] {
		const browserKeys = new Set([...browserUrls].map(websiteKey).filter(isDefined));
		const entriesByType = new Map<SessionArtifactType, IChatPillEntry[]>();
		for (const artifact of entries) {
			if (artifact.type === SessionArtifactType.Website && artifact.link) {
				const key = websiteKey(artifact.link);
				if (key && browserKeys.has(key)) {
					continue;
				}
			}
			const entry = this._artifactEntry(artifact, resolution);
			if (entry) {
				const typeEntries = entriesByType.get(artifact.type) ?? [];
				typeEntries.push(entry);
				entriesByType.set(artifact.type, typeEntries);
			}
		}
		return artifactSectionOrder.flatMap(({ type, title }) => {
			const sectionEntries = entriesByType.get(type);
			return sectionEntries?.length ? [{ title, entries: sectionEntries }] : [];
		});
	}

	private _artifactEntry(artifact: ISessionArtifact, resolution: IAgentHostSessionResolution): IChatPillEntry | undefined {
		if (artifact.type === SessionArtifactType.File || artifact.type === SessionArtifactType.Resource) {
			const artifactResource = parseUri(artifact.uri);
			if (!artifactResource) {
				return undefined;
			}
			const resource = artifact.type === SessionArtifactType.File
				? toAgentHostUri(artifactResource, resolution.connectionAuthority)
				: artifactResource;
			const label = artifact.type === SessionArtifactType.File ? basename(resource) : artifact.label;
			return {
				id: artifact.id,
				label,
				...(artifact.type === SessionArtifactType.File ? { resource } : { icon: Codicon.link }),
				...getChatPillResourceLocation(resource, label),
				open: () => this._openResource(resource),
			};
		}

		const link = parseUri(artifact.link);
		const icon = artifactIcons.get(artifact.type) ?? Codicon.archive;
		if (link) {
			const copyAction = artifact.type === SessionArtifactType.Commit && artifact.commitHash
				? [toAction({
					id: 'chat.agentHost.sessionPills.copyCommitHash',
					label: localize('agentHostSessionPills.copyCommitHash', "Copy Commit Hash"),
					class: ThemeIcon.asClassName(Codicon.copy),
					run: () => this._clipboardService.writeText(artifact.commitHash!),
				})]
				: undefined;
			return {
				id: artifact.id,
				label: artifact.label,
				icon,
				...(copyAction ? { toolbarActions: copyAction } : {}),
				...getChatPillResourceLocation(link, artifact.label),
				open: () => this._openExternal(link),
			};
		}
		if (artifact.type === SessionArtifactType.Commit && artifact.commitHash) {
			return {
				id: artifact.id,
				label: artifact.label,
				icon,
				ariaLabel: localize('agentHostSessionPills.copyCommit', "Copy commit hash for {0}", artifact.label),
				tooltip: artifact.commitHash,
				open: () => { void this._clipboardService.writeText(artifact.commitHash!); },
			};
		}
		return undefined;
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

	private _openChanges(label: string, diffs: readonly IEditSessionEntryDiff[]): void {
		if (diffs.length > 0) {
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
