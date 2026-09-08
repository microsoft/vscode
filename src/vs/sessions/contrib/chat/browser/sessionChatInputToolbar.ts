/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toAction } from '../../../../base/common/actions.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { ChatInputPills, StandardChatInputPillSources } from '../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { createSessionPullRequestPillData, type IChatPullRequestPillEntry, type IChatPullRequestPillSection } from '../../../../workbench/contrib/chat/browser/sessionPullRequestPill.js';
import { diffStatsEqual, EMPTY_DIFF_STATS, IDiffStats } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { SessionArtifacts, sessionArtifactLocation } from './sessionArtifacts.js';
import { SessionCustomizations } from './sessionCustomizations.js';
import { localize } from '../../../../nls.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, getChatPillResourceLocation, type ChatPillsCompactMode, type IChatPillEntry, type IChatPillSection } from '../../../../workbench/browser/chatPills.js';
import { computeAggregateIssueIcon, computeIssueIcon, getPullRequestStatusFromIcon, GitHubIssueState, OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID, type IGitHubIssue } from '../../github/common/types.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { IResolvedSessionPullRequest, SessionPullRequestPresentationModel } from '../../github/browser/pullRequestIconStatus.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind } from '../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ChatOriginKind, getGitHubPullRequestRefs, IChat, type IGitHubIssueRef } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { SessionBackgroundActivitiesControl } from './sessionBackgroundActivitiesControl.js';
import { SessionBrowsersControl } from './sessionBrowsersControl.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';
import { SessionActivatingActionRunner } from '../../../browser/sessionActionRunner.js';
import { computePullRequestIcon } from '../../../../workbench/common/chatPullRequest.js';
import { ISessionChangesStatsCache, readSessionChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { getSessionAgentMergeConfigurationObservable } from '../../../browser/sessionAgentMerge.js';
import { createIssueHoverElement } from '../../github/browser/issueHover.js';
import { createPullRequestHoverElement } from '../../github/browser/pullRequestHover.js';

/** Fake artifacts for the pill debug overlay. */
function buildDebugArtifactSections(debugData: ISessionChatPillsDebugData): readonly IChatPillSection[] {
	const entries = debugData.markdownFiles.map(name => {
		const resource = URI.from({ scheme: 'session-chat-pills-debug', path: `/${name}` });
		return { id: name, label: name, resource, ...sessionArtifactLocation(resource.path, name), open: () => { } };
	});
	return entries.length ? [{ title: localize('sessionArtifacts.files', "Files"), entries }] : [];
}

function getPullRequestAttention(icon: ThemeIcon, status: IResolvedSessionPullRequest['status']): string | undefined {
	if (status.hasFailingChecks && status.hasUnresolvedComments) {
		return localize('sessionChatPills.pullRequestFailingChecksAndComments', "failing checks and unresolved review comments");
	}
	if (status.hasFailingChecks) {
		return localize('sessionChatPills.pullRequestFailingChecks', "failing checks");
	}
	if (status.hasUnresolvedComments || icon.id === Codicon.gitPullRequestComment.id) {
		return localize('sessionChatPills.pullRequestComments', "unresolved review comments");
	}
	if (icon.id === Codicon.gitPullRequestError.id) {
		return localize('sessionChatPills.pullRequestAttention', "failing checks or merge conflicts");
	}
	return undefined;
}

function getGitHubRepositoryHoverData(owner: string, repo: string, openerService: IOpenerService) {
	const repository = URI.parse(`https://github.com/${owner}/${repo}`);
	return {
		repositoryHref: repository.toString(true),
		onDidClickRepository: () => { void openerService.open(repository, { openExternal: true }); },
	};
}

/** Builds Agents Window pull request pill entries, enriching them when live details are available. */
export function buildSessionPullRequestSections(pullRequests: readonly IResolvedSessionPullRequest[], session: IActiveSession | undefined, commandService: ICommandService, clipboardService: IClipboardService, openerService: IOpenerService, sessionsService: ISessionsService): readonly IChatPullRequestPillSection[] {
	const entries = pullRequests.map(({ ref, pullRequest, icon, status }) => {
		const title = pullRequest?.title ?? ref.title;
		const label = title
			? localize('sessionChatPills.pullRequestWithTitle', "Pull Request #{0}: {1}", ref.number, title)
			: localize('sessionChatPills.pullRequest', "Pull Request #{0}", ref.number);
		const resolvedIcon = icon ?? computePullRequestIcon('open');
		const attention = getPullRequestAttention(resolvedIcon, status);
		const pullRequestState = pullRequest?.state ?? ref.liveState ?? ref.state ?? getPullRequestStatusFromIcon(resolvedIcon) ?? 'open';
		const state = pullRequestState === 'open' && pullRequest?.isDraft
			? 'draft'
			: pullRequestState;
		const stateDescription = state === 'draft'
			? localize('sessionChatPills.pullRequestDraft', "draft")
			: attention ?? (
				state === 'merged'
					? localize('sessionChatPills.pullRequestMerged', "merged")
					: state === 'closed'
						? localize('sessionChatPills.pullRequestClosed', "closed")
						: localize('sessionChatPills.pullRequestOpen', "open")
			);
		return {
			id: ref.uri.toString(),
			label,
			pillLabel: `#${ref.number}`,
			icon: resolvedIcon,
			pullRequestState: state,
			toolbarActions: [toAction({
				id: `sessionChatPills.copyPullRequest.${ref.owner}.${ref.repo}.${ref.number}`,
				label: localize('sessionChatPills.copyPullRequest', "Copy Pull Request URL"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => clipboardService.writeText(ref.uri.toString(true)),
			})],
			...getChatPillResourceLocation(ref.uri, label),
			ariaDescription: localize('sessionChatPills.pullRequestDescription', "{0}. {1}", stateDescription, ref.uri.toString(true)),
			...(pullRequest ? {
				pillHover: {
					element: () => createPullRequestHoverElement({
						owner: ref.owner,
						repo: ref.repo,
						number: ref.number,
						...getGitHubRepositoryHoverData(ref.owner, ref.repo, openerService),
						pullRequest,
					}),
				},
			} : {}),
			open: () => {
				if (session) {
					sessionsService.setActive(session);
				}
				void commandService.executeCommand(OPEN_PULL_REQUEST_ACTION_ID, { pullRequest: ref });
			},
		} satisfies IChatPullRequestPillEntry;
	});
	return entries.length > 0 ? [{ title: localize('sessionChatPills.pullRequests', "Pull Requests"), entries }] : [];
}

interface IResolvedSessionIssue {
	readonly ref: IGitHubIssueRef;
	readonly issue: IGitHubIssue | undefined;
}

/** Builds Agents Window issue pill entries, enriching them when live details are available. */
export function buildSessionIssueSections(issues: readonly IResolvedSessionIssue[], session: IActiveSession | undefined, commandService: ICommandService, clipboardService: IClipboardService, openerService: IOpenerService, sessionsService: ISessionsService): readonly IChatPillSection[] {
	const entries = issues.map(({ ref, issue }) => {
		const label = issue?.title
			? localize('sessionChatPills.issueWithTitle', "Issue #{0}: {1}", ref.number, issue.title)
			: localize('sessionChatPills.issue', "Issue #{0}", ref.number);
		return {
			id: ref.uri.toString(),
			label,
			pillLabel: `#${ref.number}`,
			icon: issue ? computeIssueIcon(issue.state, issue.stateReason) : computeIssueIcon(GitHubIssueState.Open, undefined),
			toolbarActions: [toAction({
				id: `sessionChatPills.copyIssue.${ref.owner}.${ref.repo}.${ref.number}`,
				label: localize('sessionChatPills.copyIssue', "Copy Issue URL"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => clipboardService.writeText(ref.uri.toString(true)),
			})],
			...getChatPillResourceLocation(ref.uri, label),
			...(issue ? {
				pillHover: {
					element: () => createIssueHoverElement({
						owner: ref.owner,
						repo: ref.repo,
						number: ref.number,
						...getGitHubRepositoryHoverData(ref.owner, ref.repo, openerService),
						issue,
					}),
				},
			} : {}),
			open: () => {
				if (session) {
					sessionsService.setActive(session);
				}
				void commandService.executeCommand(OPEN_ISSUE_ACTION_ID, { issue: ref });
			},
		} satisfies IChatPillEntry;
	});
	return entries.length > 0 ? [{ title: localize('sessionChatPills.issues', "Issues"), entries }] : [];
}

/** Returns the session-scoped changes counts represented by the shared Changes pill. */
export function computeSessionInputPillStats(session: IActiveSession | undefined, changesStatsCache: ISessionChangesStatsCache, reader: IReader): IDiffStats {
	if (session?.worktreePending?.read(reader)) {
		return EMPTY_DIFF_STATS;
	}
	const workspace = session?.workspace.read(reader);
	const stats = session && workspace
		? readSessionChangesStats(session, reader) ?? changesStatsCache.get(session.sessionId, reader)
		: undefined;
	return stats ?? EMPTY_DIFF_STATS;
}

/**
 * The row's rendered height, reserved below the transcript by its host because
 * the row floats over it. Derived from the row's `2px`/`4px` padding here plus a
 * 22px `.monaco-text-button.small` pill; keep in sync if either changes.
 */
export const SESSION_CHAT_INPUT_TOOLBAR_HEIGHT = CHAT_INPUT_PILLS_ROW_HEIGHT;

/** A toolbar for session metadata, active-turn status, and background activity. */
export class SessionChatInputToolbar extends Disposable {

	readonly element: HTMLElement;
	readonly onDidChangeChatPetPlatform: Event<void>;
	readonly onDidChangeVisibility: Event<boolean>;
	private readonly _inputPills: ChatInputPills;

	/** Sentinel distinguishing "no override" from an explicit `undefined` session. */
	private readonly _sessionOverride = observableValue<IActiveSession | undefined | 'unset'>(this, 'unset');
	/** The chat whose last-turn changes are reflected. */
	private readonly _chat = observableValue<IChat | undefined>(this, undefined);
	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);
	private readonly _browsers: SessionBrowsersControl;
	private readonly _backgroundActivities: SessionBackgroundActivitiesControl;

	/** The session that owns the reflected chat, from an explicit override or resolved from the chat. */
	private readonly _session: IObservable<IActiveSession | undefined> = derived(reader => {
		const override = this._sessionOverride.read(reader);
		if (override !== 'unset') {
			return override;
		}
		const chat = this._chat.read(reader);
		if (!chat) {
			return undefined;
		}
		return this._findOwningSession(chat.resource, reader);
	});

	/**
	 * Whether the reflected chat is a subagent (worker) chat. Its pills describe
	 * the session the subagent was spawned from rather than the subagent's own
	 * work, so the row stays hidden there.
	 */
	private readonly _isSubagentChat: IObservable<boolean> = derived(this, reader => this._chat.read(reader)?.origin?.kind === ChatOriginKind.Tool);

	/** The current turn's diff stats. */
	private readonly _diffStats: IObservable<IDiffStats>;
	/** Artifact sections shown in the artifact pill. */
	private readonly _artifactSections: IObservable<readonly IChatPillSection[]>;
	/** Reference sections shown in the references pill. */
	private readonly _referenceSections: IObservable<readonly IChatPillSection[]>;
	/** Customization sections shown in the customizations pill. */
	private readonly _customizationSections: IObservable<readonly IChatPillSection[]>;

	constructor(
		compact: ChatPillsCompactMode,
		focusFallback: (() => void) | undefined,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IClipboardService clipboardService: IClipboardService,
		@ICommandService commandService: ICommandService,
		@IGitHubService gitHubService: IGitHubService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
		@ISessionChangesService sessionChangesService: ISessionChangesService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@IOpenerService openerService: IOpenerService,
		@ISessionChatPillVisibilityService visibility: ISessionChatPillVisibilityService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._diffStats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => {
			const debugData = this._debugData.read(reader);
			if (debugData) {
				return debugData.stats;
			}
			return computeSessionInputPillStats(this._session.read(reader), changesStatsCache, reader);
		});

		const pillsEnabled = constObservable(true);
		this._browsers = this._register(instantiationService.createInstance(SessionBrowsersControl, this._session, this._chat, pillsEnabled, derived(reader => visibility.isVisible(SessionChatPillKind.Browsers, reader))));

		// The browsers pill already offers the pages it lists, so the artifacts and
		// references pills leave those websites out.
		const sessionArtifacts = this._register(instantiationService.createInstance(SessionArtifacts, this._session, this._browsers.urls));
		this._artifactSections = derived(this, reader => {
			const debugData = this._debugData.read(reader);
			return debugData ? buildDebugArtifactSections(debugData) : sessionArtifacts.sections.read(reader);
		});
		this._referenceSections = sessionArtifacts.referenceSections;
		const sessionCustomizations = this._register(instantiationService.createInstance(SessionCustomizations, this._chat, this._session));
		this._customizationSections = sessionCustomizations.sections;

		const pillsVisible = derived(this, reader => this._debugData.read(reader) !== undefined || !this._isSubagentChat.read(reader));
		this._backgroundActivities = this._register(instantiationService.createInstance(SessionBackgroundActivitiesControl, this._session, this._chat, pillsEnabled, constObservable(true)));
		const gitHubInfo = derived(this, reader => {
			const session = this._session.read(reader);
			const workspace = session?.workspace.read(reader);
			return workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
		});
		const pullRequestRefs = derived(this, reader => getGitHubPullRequestRefs(gitHubInfo.read(reader)));
		const agentMergeConfiguration = derived(this, reader => {
			const session = this._session.read(reader);
			return session ? getSessionAgentMergeConfigurationObservable(session, sessionsProvidersService, this._configurationService).read(reader) : undefined;
		});
		const pullRequestPresentation = this._register(new SessionPullRequestPresentationModel(pullRequestRefs, agentMergeConfiguration, gitHubService));
		const pullRequestSections = derived(this, reader => buildSessionPullRequestSections(pullRequestPresentation.pullRequests.read(reader), this._session.read(reader), commandService, clipboardService, openerService, this._sessionsService));
		const issueRefs = derived(this, reader => gitHubInfo.read(reader)?.issues ?? []);
		const issues = derived(this, reader => issueRefs.read(reader).map(ref => {
			const reference = reader.store.add(gitHubService.createIssueModelReference(ref.owner, ref.repo, ref.number));
			return { ref, issue: reference.object.issue.read(reader) };
		}));
		const issuesActive = derived(this, reader => visibility.isVisible(SessionChatPillKind.Issues, reader));
		this._register(autorun(reader => {
			if (!issuesActive.read(reader)) {
				return;
			}
			for (const ref of issueRefs.read(reader)) {
				const reference = reader.store.add(gitHubService.createIssueModelReference(ref.owner, ref.repo, ref.number));
				const model = reference.object;
				model.refresh();
				const shouldPoll = derived(this, pollReader => model.issue.read(pollReader)?.state !== GitHubIssueState.Closed);
				reader.store.add(autorun(pollReader => {
					if (shouldPoll.read(pollReader)) {
						pollReader.store.add(model.startPolling());
					}
				}));
			}
		}));
		const issueSections = derived(this, reader => buildSessionIssueSections(issues.read(reader), this._session.read(reader), commandService, clipboardService, openerService, this._sessionsService));
		const issueIcon = derived(this, reader => {
			const resolved = issues.read(reader);
			if (resolved.length === 1) {
				const issue = resolved[0].issue;
				return issue ? computeIssueIcon(issue.state, issue.stateReason) : computeIssueIcon(GitHubIssueState.Open, undefined);
			}
			return computeAggregateIssueIcon(resolved.map(({ issue }) => issue));
		});
		const changesLabel = derived(this, reader => {
			const workspace = this._session.read(reader)?.workspace.read(reader);
			const branch = workspace?.folders[0]?.gitRepository?.branchName?.trim();
			return branch
				? localize('sessionChatPills.allChangesOnBranch', "All Changes ({0})", branch)
				: localize('sessionChatPills.allChanges', "All Changes");
		});
		const sources = this._register(instantiationService.createInstance(StandardChatInputPillSources, {
			changes: {
				stats: this._diffStats,
				label: changesLabel,
				open: () => {
					const session = this._session.get();
					if (!session || this._debugData.get()) {
						return;
					}
					layoutService.revealEditorPartExplicitly();
					void sessionChangesService.openChangesEditor(session.resource, { changesetSelection: { kind: 'id', id: undefined } });
				},
			},
			pullRequests: createSessionPullRequestPillData(pullRequestSections, visibility.pullRequests, pullRequestPresentation.icon),
			issues: { sections: issueSections, icon: issueIcon },
			artifacts: { sections: this._artifactSections },
			references: { sections: this._referenceSections },
			customizations: { sections: this._customizationSections },
			browsers: { sections: this._browsers.sections },
			subagents: { sections: this._backgroundActivities.sections },
		}, SESSION_CHAT_PILL_KINDS));
		const actionRunner = this._register(new SessionActivatingActionRunner(() => this._session.get(), this._sessionsService));
		this._inputPills = this._register(instantiationService.createInstance(ChatInputPills, undefined, {
			debugName: 'SessionChatInputToolbar.content',
			compact,
			enabled: pillsVisible,
			sources: constObservable(sources.sources),
			offeredKinds: SESSION_CHAT_PILL_KINDS,
			context: this._session,
			actionRunner,
			focusFallback,
		}));
		this.element = this._inputPills.element;
		this.element.classList.add('session-chat-input-toolbar');
		this.onDidChangeChatPetPlatform = this._inputPills.onDidChange;
		this.onDidChangeVisibility = this._inputPills.onDidChangeVisibility;
	}

	get visible(): boolean {
		return this._inputPills.visible;
	}

	getChatPetPlatformElements(): readonly HTMLElement[] {
		return this._inputPills.getPillElements();
	}

	/**
	 * Track the currently-viewed chat; the toolbar reflects that chat's last-turn
	 * changes and status, resolving the owning session for provider gating and the
	 * open-changes action. Clears any explicit {@link setSession} override.
	 */
	setChat(chat: IChat | undefined): void {
		this.setDebugData(undefined);
		this._sessionOverride.set('unset', undefined);
		this._chat.set(chat, undefined);
	}

	/**
	 * Explicitly set the session and chat to reflect, bypassing chat-to-session
	 * resolution. Intended for component fixtures and callers that already hold
	 * both.
	 */
	setSession(session: IActiveSession | undefined, chat: IChat | undefined): void {
		this.setDebugData(undefined);
		this._sessionOverride.set(session, undefined);
		this._chat.set(chat, undefined);
	}

	setDebugData(data: ISessionChatPillsDebugData | undefined): void {
		this._debugData.set(data, undefined);
		this._browsers.setDebugData(data);
		this._backgroundActivities.setDebugData(data);
	}

	getDebugData(): ISessionChatPillsDebugData | undefined {
		return this._debugData.get();
	}

	private _findOwningSession(chatResource: URI, reader: IReader): IActiveSession | undefined {
		for (const session of this._sessionsService.visibleSessions.read(reader)) {
			if (session?.chats.read(reader).some(c => isEqual(c.resource, chatResource))) {
				return session;
			}
		}
		const active = this._sessionsService.activeSession.read(reader);
		return active?.chats.read(reader).some(c => isEqual(c.resource, chatResource)) ? active : undefined;
	}

}
