/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventType, getWindow } from '../../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { IActionViewItemOptions } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { Action, IAction, Separator, toAction } from '../../../../../../base/common/actions.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, observableFromEvent, observableSignal, observableSignalFromEvent } from '../../../../../../base/common/observable.js';
import { basename, isEqual } from '../../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { isDefined } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { ChangesetKind } from '../../../../../../platform/agentHost/common/changesetUri.js';
import { ISessionArtifact, isGitHubArtifactLink, readSessionArtifacts, SessionArtifactType } from '../../../../../../platform/agentHost/common/sessionArtifacts.js';
import { observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { Changeset, ChangesetState, getSessionRelatedPullRequestUrls, readSessionGitHubState, SessionState, SessionSummaryMeta, StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, ChatPillsRow, ChatPillsWidget, getChatPillEntries, getChatPillResourceLocation, IChatPill, IChatPillEntry, IChatPillSection, IChatPillsModel } from '../../../../../browser/chatPills.js';
import { ChatChangesPillActionViewItem, chatChangesStatsEqual, EMPTY_CHAT_CHANGES_STATS, IChatChangesStats } from '../../../../../browser/chatChangesPill.js';
import { ChatPillSingleEntry, createChatSectionPill, IChatDropdownPillOptions } from '../../../../../browser/chatDropdownPill.js';
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from '../../../../../browser/labels.js';
import { BrowserEditorInput } from '../../../../browserView/common/browserEditorInput.js';
import { browserViewUrlMatches, BrowserViewSharingState, IBrowserViewWorkbenchService } from '../../../../browserView/common/browserView.js';
import { IEditorService } from '../../../../../services/editor/common/editorService.js';
import { getSessionChatPillMenu, ISessionChatPillMenuEntry, ISessionChatPillVisibilityService, SessionChatPillKind } from '../../../common/sessionChatPills.js';
import { IEditSessionEntryDiff } from '../../../common/editing/chatEditingService.js';
import type { ChatWidget } from '../../widget/chatWidget.js';
import { chatArtifactPillOptions, observeTurnStatusPillsEnabled, openChatTurnFile, previewKind } from '../../widget/chatTurnPills.js';
import { openChatFileChanges } from '../../editorChatResponseFileChangesService.js';
import { agentHostChangesetFileToEntryDiff } from './agentHostResponseFileChanges.js';

const AGENT_HOST_SESSION_CHANGES_PILL_ID = 'chat.agentHost.sessionPills.changes';
const AGENT_HOST_SESSION_ARTIFACTS_PILL_ID = 'chat.agentHost.sessionPills.artifacts';
const AGENT_HOST_SESSION_REFERENCES_PILL_ID = 'chat.agentHost.sessionPills.references';
const AGENT_HOST_SESSION_PULL_REQUESTS_PILL_ID = 'chat.agentHost.sessionPills.pullRequests';
const AGENT_HOST_SESSION_ISSUES_PILL_ID = 'chat.agentHost.sessionPills.issues';
const AGENT_HOST_SESSION_BROWSERS_PILL_ID = 'chat.agentHost.sessionPills.browsers';

const offeredPillKinds: readonly SessionChatPillKind[] = [
	SessionChatPillKind.Changes,
	SessionChatPillKind.PullRequests,
	SessionChatPillKind.Issues,
	SessionChatPillKind.Artifacts,
	SessionChatPillKind.References,
	SessionChatPillKind.Browsers,
];

const pullRequestsPillOptions: IChatDropdownPillOptions = {
	widgetId: 'agentHostSessionPullRequests',
	icon: Codicon.gitPullRequest,
	title: localize('agentHostSessionPills.pullRequests.title', "Pull Requests"),
	summaryLabel: count => count === 1
		? localize('agentHostSessionPills.pullRequests.countSingle', "1 Pull Request")
		: localize('agentHostSessionPills.pullRequests.count', "{0} Pull Requests", count),
	summaryAriaLabel: count => count === 1
		? localize('agentHostSessionPills.pullRequests.showSingle', "Show 1 pull request")
		: localize('agentHostSessionPills.pullRequests.show', "Show {0} pull requests", count),
};

const issuesPillOptions: IChatDropdownPillOptions = {
	widgetId: 'agentHostSessionIssues',
	icon: Codicon.issues,
	title: localize('agentHostSessionPills.issues.title', "Issues"),
	summaryLabel: count => count === 1
		? localize('agentHostSessionPills.issues.countSingle', "1 Issue")
		: localize('agentHostSessionPills.issues.count', "{0} Issues", count),
	summaryAriaLabel: count => count === 1
		? localize('agentHostSessionPills.issues.showSingle', "Show 1 issue")
		: localize('agentHostSessionPills.issues.show', "Show {0} issues", count),
};

const referencesPillOptions: IChatDropdownPillOptions = {
	widgetId: 'agentHostSessionReferences',
	icon: Codicon.bookmark,
	title: localize('agentHostSessionPills.references.title', "References"),
	summaryLabel: count => count === 1
		? localize('agentHostSessionPills.references.countSingle', "1 Reference")
		: localize('agentHostSessionPills.references.count', "{0} References", count),
	summaryAriaLabel: count => count === 1
		? localize('agentHostSessionPills.references.showSingle', "Show 1 reference")
		: localize('agentHostSessionPills.references.show', "Show {0} references", count),
	singleEntry: ChatPillSingleEntry.Summary,
};

const browsersPillOptions: IChatDropdownPillOptions = {
	widgetId: 'agentHostSessionBrowsers',
	icon: Codicon.globe,
	title: localize('agentHostSessionPills.browsers.title', "Browsers"),
	summaryLabel: count => count === 1
		? localize('agentHostSessionPills.browsers.countSingle', "1 Active Browser")
		: localize('agentHostSessionPills.browsers.count', "{0} Active Browsers", count),
	summaryAriaLabel: count => count === 1
		? localize('agentHostSessionPills.browsers.showSingle', "Show 1 browser")
		: localize('agentHostSessionPills.browsers.show', "Show {0} browsers", count),
};

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

type ResolvedAgentHostSession = IAgentHostSessionResolution & { readonly connectionAuthority: string };

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

function isPromotedArtifact(artifact: ISessionArtifact, type: SessionArtifactType): artifact is ISessionArtifact & { readonly link: string } {
	return artifact.isArtifact
		&& artifact.type === type
		&& artifact.isGitHub === true
		&& typeof artifact.link === 'string'
		&& isGitHubArtifactLink(artifact.link);
}

/** Partitions Agent Host metadata into dedicated GitHub, artifact, and reference pills. */
export function getAgentHostSessionPillMetadata(meta: SessionSummaryMeta | undefined): IAgentHostSessionPillMetadata {
	const entries = readSessionArtifacts(meta);
	const github = readSessionGitHubState(meta);
	const artifactPullRequests = entries.filter(entry => isPromotedArtifact(entry, SessionArtifactType.PullRequest)).map(entry => entry.link);
	const artifactIssues = entries.filter(entry => isPromotedArtifact(entry, SessionArtifactType.Issue)).map(entry => entry.link);
	const pullRequestUrls = dedupeLinks(getSessionRelatedPullRequestUrls(github), artifactPullRequests);
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

/** Selects the session-wide changeset represented by the workbench Changes pill. */
export function selectAgentHostSessionChangeset(changesets: readonly Changeset[] | undefined): Changeset | undefined {
	const staticChangesets = changesets?.filter(changeset => !changeset.uriTemplate.includes('{')) ?? [];
	return staticChangesets.find(changeset => changeset.changeKind === ChangesetKind.Branch)
		?? staticChangesets.find(changeset => changeset.changeKind === ChangesetKind.Session)
		?? staticChangesets.find(changeset => changeset.changeKind === ChangesetKind.Uncommitted)
		?? staticChangesets.at(0);
}

function resolutionEquals(first: ResolvedAgentHostSession | undefined, second: ResolvedAgentHostSession | undefined): boolean {
	return first === second || (!!first && !!second
		&& first.connection === second.connection
		&& first.connectionAuthority === second.connectionAuthority
		&& isEqual(first.backendSession, second.backendSession));
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
	const number = resource?.path.split('/').filter(Boolean).at(-1);
	if (kind === 'pullRequest') {
		return number
			? localize('agentHostSessionPills.pullRequest.number', "Pull Request #{0}", number)
			: localize('agentHostSessionPills.pullRequest', "Pull Request");
	}
	return number
		? localize('agentHostSessionPills.issue.number', "Issue #{0}", number)
		: localize('agentHostSessionPills.issue', "Issue");
}

function websiteKey(url: string): string | undefined {
	const parsed = URL.parse(url);
	if (!parsed) {
		return undefined;
	}
	const path = parsed.pathname.length > 1 && parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
	return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${parsed.hash}`;
}

function getPillKind(actionId: string): SessionChatPillKind | undefined {
	switch (actionId) {
		case AGENT_HOST_SESSION_CHANGES_PILL_ID: return SessionChatPillKind.Changes;
		case AGENT_HOST_SESSION_ARTIFACTS_PILL_ID: return SessionChatPillKind.Artifacts;
		case AGENT_HOST_SESSION_REFERENCES_PILL_ID: return SessionChatPillKind.References;
		case AGENT_HOST_SESSION_PULL_REQUESTS_PILL_ID: return SessionChatPillKind.PullRequests;
		case AGENT_HOST_SESSION_ISSUES_PILL_ID: return SessionChatPillKind.Issues;
		case AGENT_HOST_SESSION_BROWSERS_PILL_ID: return SessionChatPillKind.Browsers;
		default: return undefined;
	}
}

/** Adds Agent Host session metadata pills to a workbench chat input. */
export class AgentHostSessionInputPills extends Disposable {

	private readonly _browserChanged = observableSignal(this);
	private readonly _browserListeners = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _widget: ChatWidget,
		compact: boolean,
		@IAgentHostConnectionsService connectionsService: IAgentHostConnectionsService,
		@IBrowserViewWorkbenchService private readonly _browserViewService: IBrowserViewWorkbenchService,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@ISessionChatPillVisibilityService visibility: ISessionChatPillVisibilityService,
	) {
		super();

		const row = this._register(new ChatPillsRow('AgentHostSessionInputPills.content', { compact }));
		row.element.classList.add('agent-host-session-input-pills', 'hidden');
		this._widget.inputPart.persistentContentContainerElement.appendChild(row.element);
		this._register(toDisposable(() => row.element.remove()));

		const pillsEnabled = observeTurnStatusPillsEnabled(this._configurationService);
		const sessionResource = observableFromEvent(this, this._widget.onDidChangeViewModel, () => this._widget.viewModel?.sessionResource);
		const connectionsChanged = observableSignalFromEvent(this, connectionsService.onDidChangeConnections);
		const resolution = derivedOpts<ResolvedAgentHostSession | undefined>({ owner: this, equalsFn: resolutionEquals }, reader => {
			connectionsChanged.read(reader);
			const resource = sessionResource.read(reader);
			const resolved = resource ? connectionsService.resolveSessionResource(resource) : undefined;
			const connectionAuthority = resolved
				? connectionsService.connections.find(info => info.connection === resolved.connection)?.authority
				: undefined;
			return resolved && connectionAuthority ? { ...resolved, connectionAuthority } : undefined;
		});
		const sessionStateSource = derived(this, reader => {
			const current = resolution.read(reader);
			if (!current || !pillsEnabled.read(reader)) {
				return constObservable<SessionState | undefined>(undefined);
			}
			const subscription = reader.store.add(current.connection.getSubscription(StateComponents.Session, current.backendSession, 'AgentHostSessionInputPills'));
			return observableFromSubscription(this, subscription.object);
		});
		const sessionState = derived(this, reader => sessionStateSource.read(reader).read(reader));
		const changeset = derived(this, reader => selectAgentHostSessionChangeset(sessionState.read(reader)?.changesets));
		const changesetUri = derivedOpts<URI | undefined>({ owner: this, equalsFn: isEqual }, reader => parseUri(changeset.read(reader)?.uriTemplate));
		const changesetStateSource = derived(this, reader => {
			const currentResolution = resolution.read(reader);
			const resource = changesetUri.read(reader);
			if (!currentResolution || !resource) {
				return constObservable<ChangesetState | undefined>(undefined);
			}
			const subscription = reader.store.add(currentResolution.connection.getSubscription(StateComponents.Changeset, resource, 'AgentHostSessionInputPills'));
			return observableFromSubscription(this, subscription.object);
		});
		const changes = derived<readonly IEditSessionEntryDiff[]>(this, reader => {
			const currentResolution = resolution.read(reader);
			const state = changesetStateSource.read(reader).read(reader);
			if (!currentResolution || !state) {
				return [];
			}
			return state.files
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

		this._register(this._browserViewService.onDidChangeBrowserViews(() => this._refreshBrowserListeners()));
		this._refreshBrowserListeners();
		const browserInputs = derived(this, reader => {
			this._browserChanged.read(reader);
			const resource = sessionResource.read(reader);
			if (!resource || !resolution.read(reader) || !pillsEnabled.read(reader)) {
				return [];
			}
			const ownerId = resource.toString();
			return [...this._browserViewService.getKnownBrowserViews().values()]
				.filter(input => input.model?.owner.type === 'agent' && input.model.owner.sessionId === ownerId);
		});
		const browserUrls = derivedOpts<ReadonlySet<string>>({ owner: this, equalsFn: (first, second) => first.size === second.size && [...first].every(value => second.has(value)) }, reader => {
			return visibility.isVisible(SessionChatPillKind.Browsers, reader)
				? new Set(browserInputs.read(reader).map(input => input.url).filter(isDefined))
				: new Set();
		});

		const pullRequestSections = derived(this, reader => this._buildReferenceSections(metadata.read(reader).pullRequestUrls, 'pullRequest'));
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

		const visibleSections = (kind: SessionChatPillKind, sections: IObservable<readonly IChatPillSection[]>) => derived(
			this,
			reader => pillsEnabled.read(reader) && visibility.isVisible(kind, reader) ? sections.read(reader) : [],
		);
		const resourceLabels = this._register(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
		const sectionPill = (id: string, label: string, sections: IObservable<readonly IChatPillSection[]>, options: IChatDropdownPillOptions) => {
			const action = this._register(new Action(id, label));
			return createChatSectionPill(action, sections, options, resourceLabels, instantiationService);
		};

		const changesAction = this._register(new Action(
			AGENT_HOST_SESSION_CHANGES_PILL_ID,
			localize('agentHostSessionPills.changes', "Changes"),
			undefined,
			true,
			() => this._openChanges(changeset.get()?.label ?? localize('agentHostSessionPills.changesEditor', "Session Changes"), changes.get()),
		));
		this._register(autorun(reader => {
			const label = changeset.read(reader)?.label ?? localize('agentHostSessionPills.changes', "Changes");
			changesAction.label = label;
			changesAction.tooltip = localize('agentHostSessionPills.viewChanges', "View {0}", label);
		}));
		const changesPill: IChatPill = {
			action: changesAction,
			createActionViewItem: (options: IActionViewItemOptions) => new ChatChangesPillActionViewItem(changesAction, options, changeStats, instantiationService),
		};
		const pullRequestPill = sectionPill(
			AGENT_HOST_SESSION_PULL_REQUESTS_PILL_ID,
			localize('agentHostSessionPills.pullRequests', "Pull Requests"),
			visibleSections(SessionChatPillKind.PullRequests, pullRequestSections),
			pullRequestsPillOptions,
		);
		const issuePill = sectionPill(
			AGENT_HOST_SESSION_ISSUES_PILL_ID,
			localize('agentHostSessionPills.issues', "Issues"),
			visibleSections(SessionChatPillKind.Issues, issueSections),
			issuesPillOptions,
		);
		const artifactPill = sectionPill(
			AGENT_HOST_SESSION_ARTIFACTS_PILL_ID,
			localize('agentHostSessionPills.artifacts', "Artifacts"),
			visibleSections(SessionChatPillKind.Artifacts, artifactSections),
			chatArtifactPillOptions,
		);
		const referencePill = sectionPill(
			AGENT_HOST_SESSION_REFERENCES_PILL_ID,
			localize('agentHostSessionPills.references', "References"),
			visibleSections(SessionChatPillKind.References, referenceSections),
			referencesPillOptions,
		);
		const browserPill = sectionPill(
			AGENT_HOST_SESSION_BROWSERS_PILL_ID,
			localize('agentHostSessionPills.browsers', "Browsers"),
			visibleSections(SessionChatPillKind.Browsers, browserSections),
			browsersPillOptions,
		);

		const kindsWithData = derived(this, reader => {
			const kinds = new Set<SessionChatPillKind>();
			if (!pillsEnabled.read(reader)) {
				return kinds;
			}
			if (changeStats.read(reader).files > 0) {
				kinds.add(SessionChatPillKind.Changes);
			}
			if (getChatPillEntries(pullRequestSections.read(reader)).length > 0) {
				kinds.add(SessionChatPillKind.PullRequests);
			}
			if (getChatPillEntries(issueSections.read(reader)).length > 0) {
				kinds.add(SessionChatPillKind.Issues);
			}
			if (getChatPillEntries(artifactSections.read(reader)).length > 0) {
				kinds.add(SessionChatPillKind.Artifacts);
			}
			if (getChatPillEntries(referenceSections.read(reader)).length > 0) {
				kinds.add(SessionChatPillKind.References);
			}
			if (getChatPillEntries(browserSections.read(reader)).length > 0) {
				kinds.add(SessionChatPillKind.Browsers);
			}
			return kinds;
		});
		const pillsModel: IChatPillsModel = {
			pills: derived(this, reader => {
				if (!pillsEnabled.read(reader)) {
					return [];
				}
				const pills: IChatPill[] = [];
				if (changeStats.read(reader).files > 0) {
					pills.push(changesPill);
				}
				if (visibility.isVisible(SessionChatPillKind.PullRequests, reader) && getChatPillEntries(pullRequestSections.read(reader)).length > 0) {
					pills.push(pullRequestPill.read(reader));
				}
				if (visibility.isVisible(SessionChatPillKind.Issues, reader) && getChatPillEntries(issueSections.read(reader)).length > 0) {
					pills.push(issuePill.read(reader));
				}
				if (visibility.isVisible(SessionChatPillKind.Artifacts, reader) && getChatPillEntries(artifactSections.read(reader)).length > 0) {
					pills.push(artifactPill.read(reader));
				}
				if (visibility.isVisible(SessionChatPillKind.References, reader) && getChatPillEntries(referenceSections.read(reader)).length > 0) {
					pills.push(referencePill.read(reader));
				}
				if (visibility.isVisible(SessionChatPillKind.Browsers, reader) && getChatPillEntries(browserSections.read(reader)).length > 0) {
					pills.push(browserPill.read(reader));
				}
				return pills;
			}),
		};
		const pills = this._register(instantiationService.createInstance(ChatPillsWidget, pillsModel, {
			ariaLabel: localize('agentHostSessionPills.ariaLabel', "Session status"),
			allowContextMenu: true,
		}));
		pills.element.classList.add('show-file-icons');
		row.content.appendChild(pills.element);
		row.observe(pills.element);

		this._register(this._widget.inputPart.registerChatPetHorizontalPlatformProvider({
			onDidChange: Event.any(row.onDidChangeLayout, pills.onDidChangePills),
			getElements: () => pills.getPillElements(),
		}));
		const showContextMenu = (anchor: HTMLElement | StandardMouseEvent, targetKind?: SessionChatPillKind) => {
			const kinds = kindsWithData.get();
			if (kinds.size === 0) {
				return;
			}
			this._contextMenuService.showContextMenu({
				getAnchor: () => anchor,
				getActions: () => this._getVisibilityActions(kinds, visibility, targetKind, () => row.restoreFocus(() => pills.getPillElements())),
			});
		};
		this._register(addDisposableListener(row.content, EventType.CONTEXT_MENU, (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
			const targetPill = pills.getPill(event.target as HTMLElement | null);
			const targetKind = targetPill ? getPillKind(targetPill.action.id) : undefined;
			showContextMenu(new StandardMouseEvent(getWindow(row.content), event), targetKind);
		}));
		this._register(row.onDidRequestContextMenu(anchor => {
			const targetPill = pills.getPill(anchor);
			showContextMenu(anchor, targetPill ? getPillKind(targetPill.action.id) : undefined);
		}));
		this._register(autorun(reader => {
			const hasData = kindsWithData.read(reader).size > 0;
			const anyVisible = pills.isVisible.read(reader);
			row.element.classList.toggle('hidden', !hasData);
			row.setEmpty(hasData && !anyVisible, localize('agentHostSessionPills.configure', "Configure Session Status Pills"));
			this._widget.setPersistentContentHeight(hasData ? CHAT_INPUT_PILLS_ROW_HEIGHT : undefined);
			row.scanDomNode();
		}));
	}

	private _buildReferenceSections(links: readonly string[], kind: 'pullRequest' | 'issue'): readonly IChatPillSection[] {
		const entries = links.map(link => {
			const resource = parseUri(link);
			if (!resource) {
				return undefined;
			}
			const label = referenceLabel(link, kind);
			return {
				id: linkKey(link),
				label,
				icon: kind === 'pullRequest' ? Codicon.gitPullRequest : Codicon.issues,
				...getChatPillResourceLocation(resource, label),
				open: () => this._openExternal(resource),
			} satisfies IChatPillEntry;
		}).filter(isDefined);
		const title = kind === 'pullRequest'
			? localize('agentHostSessionPills.pullRequests.section', "Pull Requests")
			: localize('agentHostSessionPills.issues.section', "Issues");
		return entries.length > 0 ? [{ title, entries }] : [];
	}

	private _buildArtifactSections(entries: readonly ISessionArtifact[], browserUrls: ReadonlySet<string>, resolution: ResolvedAgentHostSession): readonly IChatPillSection[] {
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

	private _artifactEntry(artifact: ISessionArtifact, resolution: ResolvedAgentHostSession): IChatPillEntry | undefined {
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

	private _getVisibilityActions(kindsWithData: ReadonlySet<SessionChatPillKind>, visibility: ISessionChatPillVisibilityService, targetKind: SessionChatPillKind | undefined, restoreFocus: () => void): readonly IAction[] {
		const menu = getSessionChatPillMenu(kindsWithData, visibility.readHiddenKinds(undefined), targetKind, offeredPillKinds);
		const toggleAction = (entry: ISessionChatPillMenuEntry) => toAction({
			id: `chat.agentHost.sessionPills.toggle.${entry.kind}`,
			label: entry.label,
			checked: entry.checked,
			run: () => {
				visibility.toggle(entry.kind);
				restoreFocus();
			},
		});
		const groups: IAction[][] = [];
		if (menu.hide) {
			const hide = menu.hide;
			groups.push([toAction({
				id: `chat.agentHost.sessionPills.hide.${hide.kind}`,
				label: hide.label,
				run: () => {
					visibility.hide(hide.kind);
					restoreFocus();
				},
			})]);
		}
		groups.push(menu.withData.map(toggleAction), menu.withoutData.map(toggleAction));
		return Separator.join(...groups);
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
