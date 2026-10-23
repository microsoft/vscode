/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Action, IAction, toAction } from '../../../../base/common/actions.js';
import { disposableTimeout } from '../../../../base/common/async.js';
import { coalesce, distinct } from '../../../../base/common/arrays.js';
import { groupBy } from '../../../../base/common/collections.js';
import { Event } from '../../../../base/common/event.js';
import { structuralEquals } from '../../../../base/common/equals.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Schemas } from '../../../../base/common/network.js';
import { autorun, constObservable, derived, derivedOpts, IObservable, IReader, observableFromEvent, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { WebviewInput } from '../../../../workbench/contrib/webviewPanel/browser/webviewEditorInput.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { IExternalUriOpenerService } from '../../../../workbench/contrib/externalUriOpener/common/externalUriOpenerService.js';
import { externalUriOpenersSettingId } from '../../../../workbench/contrib/externalUriOpener/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING } from '../../../common/sessionConfig.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { AgentHostAutoAttachPullRequestsConfigKey } from '../../../../platform/agentHost/common/agentHostSchema.js';
import { ChatInputPills, StandardChatInputPillSources, createChatInputPillSource, IChatInputPillSource } from '../../../../workbench/contrib/chat/browser/chatInputPills.js';
import { createSessionPullRequestPillData, type IChatPullRequestPillEntry, type IChatPullRequestPillSection } from '../../../../workbench/contrib/chat/browser/sessionPullRequestPill.js';
import { diffStatsEqual, EMPTY_DIFF_STATS, IDiffStats } from '../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { SessionArtifacts, sessionArtifactLocation } from './sessionArtifacts.js';
import { SessionCustomizations } from '../../../../workbench/contrib/chat/browser/sessionCustomizations.js';
import { localize } from '../../../../nls.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, chatPillCopyUrlHoverLabel, chatPillRemoveArtifactHoverLabel, getChatPillEntries, getChatPillResourceLocation, getChatReferencePillPresentation, type ChatPillsCompactMode, type IChatPillEntry, type IChatPillSection, withChatPillHoverLabel } from '../../../../workbench/browser/chatPills.js';
import { computeAggregateIssueIcon, computeIssueIcon, getPullRequestStatusFromIcon, GitHubCIOverallStatus, GitHubIssueState, OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID, OPEN_PULL_REQUEST_CHANGES_ACTION_ID, type IGitHubIssue } from '../../github/common/types.js';
import { getSessionGitHubReferences } from '../../github/common/sessionGitHubReferences.js';
import { IGitHubService } from '../../github/browser/githubService.js';
import { IResolvedSessionPullRequest, SessionPullRequestPresentationModel } from '../../github/browser/pullRequestIconStatus.js';
import { ISessionChatPillVisibilityService, SESSION_CHAT_PILL_KINDS, SessionChatPillKind } from '../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { BRANCH_CHANGES_CHANGESET_ID, ChatOriginKind, IChat, SESSION_CHANGES_CHANGESET_ID, type IGitHubIssueRef, type IGitHubPullRequestRef, type ISessionWorkspace } from '../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { logSessionArtifactOpen } from '../../../common/sessionsTelemetry.js';
import { isAgentHostProvider, isAgentHostProviderId } from '../../../common/agentHostSessionsProvider.js';
import { SessionBackgroundActivitiesControl } from './sessionBackgroundActivitiesControl.js';
import { SessionBackgroundShellsControl } from '../../../../workbench/contrib/chat/browser/sessionBackgroundShellsControl.js';
import { SessionBrowsersControl } from './sessionBrowsersControl.js';
import type { ISessionChatPillsDebugData } from './sessionChatInputToolbarDebug.js';
import { SessionActivatingActionRunner } from '../../../browser/sessionActionRunner.js';
import { computePullRequestIcon } from '../../../../workbench/common/chatPullRequest.js';
import { ISessionChangesStatsCache, readChatChangesStats, readLoadedChatChangesStats } from '../../../services/sessions/common/sessionChangesStatsCache.js';
import { ISessionChangesService } from '../../changes/browser/sessionChangesService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { SessionCanvasesControl } from '../../canvases/browser/sessionCanvasesControl.js';
import { createIssueHover, getIssueStatus } from '../../github/browser/issueHover.js';
import { createPullRequestHover, getPullRequestChecksStatusLabel } from '../../github/browser/pullRequestHover.js';
import { ArtifactDetailsContextView } from './artifactDetailsContextView.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ChatPillHoverCache, createChatPillHover } from '../../../../workbench/browser/chatPillHover.js';
import { EditorsOrder } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';

const copiedLabel = localize('sessionChatPills.copied', "Copied");
const copiedToClipboardStatus = localize('sessionChatPills.copiedToClipboard', "Copied to clipboard");
const openChangesHoverLabel = localize('sessionChatPills.openChanges', "Open Changes");
const copyFeedbackDuration = 1200;

/** Fake artifacts for the pill debug overlay. */
function buildDebugArtifactSections(debugData: ISessionChatPillsDebugData, copy: (value: string) => void): readonly IChatPillSection[] {
	const entries = debugData.markdownFiles.map(name => {
		const resource = URI.from({ scheme: 'session-chat-pills-debug', path: `/${name}` });
		return {
			id: name,
			label: name,
			resource,
			toolbarActions: [toAction({
				id: `sessions.debug.chatPills.copyArtifactPath.${name}`,
				label: localize('sessions.debug.chatPills.copyArtifactPath', "Copy Path"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => copy(resource.path),
			})],
			...sessionArtifactLocation(resource.path, name),
			open: () => { },
		};
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

function getGitHubHoverLinkData(owner: string, repo: string, reference: URI, openerService: IOpenerService, onDidOpenReference?: () => void) {
	const repository = reference.with({ path: `/${owner}/${repo}`, query: null, fragment: null });
	return {
		repositoryHref: repository.toString(true),
		referenceHref: reference.toString(true),
		onDidClickRepository: () => { void openerService.open(repository, { openExternal: true }); },
		onDidClickReference: () => {
			void openerService.open(reference, { openExternal: true });
			onDidOpenReference?.();
		},
	};
}

interface IRecordedArtifactActions {
	remove?(ids: readonly string[], label: string): Promise<void>;
	recordOpen?(id: string): void;
}

type CreateCopyAction = (key: string, label: string, copy: () => Promise<void>) => IAction;

/** Builds Agents Window pull request pill entries, enriching them when live details are available. */
export function buildSessionPullRequestSections(pullRequests: readonly IResolvedSessionPullRequest[], session: IActiveSession | undefined, commandService: ICommandService, clipboardService: IClipboardService, openerService: IOpenerService, sessionsService: ISessionsService, artifactActions?: IRecordedArtifactActions, hoverCache?: ChatPillHoverCache, createCopyAction?: CreateCopyAction): readonly IChatPullRequestPillSection[] {
	const entries = pullRequests.map(({ ref, pullRequest, icon, status, ciStatus }) => {
		const { entry: presentation, resourceLabel } = getChatReferencePillPresentation('pullRequest', `#${ref.number}`, pullRequest?.title, ref.title);
		const recordedReferenceId = ref.recordedReferenceId;
		const createHover = pullRequest ? (density: 'default' | 'compact') => createPullRequestHover({
			owner: ref.owner,
			repo: ref.repo,
			number: ref.number,
			...getGitHubHoverLinkData(ref.owner, ref.repo, ref.uri, openerService, recordedReferenceId ? () => artifactActions?.recordOpen?.(recordedReferenceId) : undefined),
			pullRequest,
			ciStatus,
			density,
			...(pullRequest.baseRef ? { onDidClickBaseBranch: () => { void clipboardService.writeText(pullRequest.baseRef); } } : {}),
			...(pullRequest.headRef ? { onDidClickHeadBranch: () => { void clipboardService.writeText(pullRequest.headRef); } } : {}),
		}) : undefined;
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
		const checksDescription = pullRequest && !(ciStatus === GitHubCIOverallStatus.Failure && status.hasFailingChecks)
			? getPullRequestChecksStatusLabel(pullRequest, ciStatus)
			: undefined;
		const entry: IChatPullRequestPillEntry = {
			id: recordedReferenceId ?? ref.uri.toString(),
			icon: resolvedIcon,
			pullRequestState: state,
			promotedAction: recordedReferenceId && artifactActions?.remove ? withChatPillHoverLabel(toAction({
				id: `sessionChatPills.removePullRequest.${recordedReferenceId}`,
				label: localize('sessionChatPills.removePullRequest', "Remove Pull Request Artifact from Session"),
				class: ThemeIcon.asClassName(Codicon.close),
				run: () => artifactActions.remove?.([recordedReferenceId], resourceLabel),
			}), chatPillRemoveArtifactHoverLabel) : undefined,
			toolbarActions: [withChatPillHoverLabel(toAction({
				id: `sessionChatPills.openPullRequestChanges.${ref.owner.toLowerCase()}.${ref.repo.toLowerCase()}.${ref.number}`,
				label: localize('sessionChatPills.openPullRequestChanges', "Open Pull Request Changes"),
				class: ThemeIcon.asClassName(Codicon.diffMultiple),
				run: () => {
					if (session) {
						sessionsService.setActive(session);
					}
					return commandService.executeCommand(OPEN_PULL_REQUEST_CHANGES_ACTION_ID, { pullRequest: ref });
				},
			}), openChangesHoverLabel), withChatPillHoverLabel(createCopyAction?.(
				`${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`,
				localize('sessionChatPills.copyPullRequest', "Copy pull request URL"),
				() => clipboardService.writeText(ref.uri.toString(true)),
			) ?? toAction({
				id: `sessionChatPills.copyPullRequest.${ref.owner}.${ref.repo}.${ref.number}`,
				label: localize('sessionChatPills.copyPullRequest', "Copy pull request URL"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => clipboardService.writeText(ref.uri.toString(true)),
			}), chatPillCopyUrlHoverLabel)],
			...getChatPillResourceLocation(ref.uri, resourceLabel),
			...presentation,
			ariaDescription: checksDescription
				? localize('sessionChatPills.pullRequestDescriptionWithChecks', "{0}. {1}. {2}", stateDescription, checksDescription, ref.uri.toString(true))
				: localize('sessionChatPills.pullRequestDescription', "{0}. {1}", stateDescription, ref.uri.toString(true)),
			...(!pullRequest && ref.title ? { tooltip: `${resourceLabel}\n${ref.uri.toString(true)}` } : {}),
			...(createHover && !hoverCache ? createChatPillHover({ fallback: resourceLabel, createContent: createHover }) : {}),
			open: () => {
				if (session) {
					sessionsService.setActive(session);
				}
				void commandService.executeCommand(OPEN_PULL_REQUEST_ACTION_ID, { pullRequest: ref });
				if (recordedReferenceId) {
					artifactActions?.recordOpen?.(recordedReferenceId);
				}
			},
		};
		return hoverCache ? {
			...entry,
			...hoverCache.get(`${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`, entry, createHover),
		} : entry;
	});
	return entries.length > 0 ? [{ title: localize('sessionChatPills.pullRequests', "Pull Requests"), entries }] : [];
}

interface IResolvedSessionIssue {
	readonly ref: IGitHubIssueRef;
	readonly issue: IGitHubIssue | undefined;
}

function groupSessionIssues(issues: readonly IResolvedSessionIssue[]) {
	const groups = groupBy(issues, ({ ref }) => `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`);
	return coalesce(Object.values(groups)).map(group => ({
		ref: group[0].ref,
		issue: group.find(candidate => candidate.issue)?.issue,
		recordedReferenceIds: distinct(group.flatMap(({ ref }) => ref.recordedReferenceId ? [ref.recordedReferenceId] : [])),
	}));
}

function getSessionIssueUri(ref: IGitHubIssueRef): URI {
	return ref.uri.with({ scheme: Schemas.https, authority: 'github.com', path: `/${ref.owner}/${ref.repo}/issues/${ref.number}`, query: '', fragment: '' });
}

/** Builds one pill entry per issue, grouping comment links and enriching entries with live details. */
export function buildSessionIssueSections(issues: readonly IResolvedSessionIssue[], session: IActiveSession | undefined, commandService: ICommandService, clipboardService: IClipboardService, openerService: IOpenerService, sessionsService: ISessionsService, artifactActions?: IRecordedArtifactActions, hoverCache?: ChatPillHoverCache, createCopyAction?: CreateCopyAction): readonly IChatPillSection[] {
	const entries = groupSessionIssues(issues).map(({ ref, issue, recordedReferenceIds }) => {
		const uri = getSessionIssueUri(ref);
		const { entry: presentation, resourceLabel } = getChatReferencePillPresentation('issue', `#${ref.number}`, issue?.title, ref.title);
		const recordedReferenceId = recordedReferenceIds[0];
		const createHover = issue ? (density: 'default' | 'compact') => createIssueHover({
			owner: ref.owner,
			repo: ref.repo,
			number: ref.number,
			...getGitHubHoverLinkData(ref.owner, ref.repo, uri, openerService, recordedReferenceId ? () => artifactActions?.recordOpen?.(recordedReferenceId) : undefined),
			issue,
			density,
		}) : undefined;
		const entry: IChatPillEntry = {
			id: recordedReferenceId ?? uri.toString(),
			icon: issue ? computeIssueIcon(issue.state, issue.stateReason) : computeIssueIcon(GitHubIssueState.Open, undefined),
			promotedAction: recordedReferenceId && artifactActions?.remove ? withChatPillHoverLabel(toAction({
				id: `sessionChatPills.removeIssue.${recordedReferenceId}`,
				label: localize('sessionChatPills.removeIssue', "Remove Issue Artifact from Session"),
				class: ThemeIcon.asClassName(Codicon.close),
				run: () => artifactActions.remove?.(recordedReferenceIds, resourceLabel),
			}), chatPillRemoveArtifactHoverLabel) : undefined,
			toolbarActions: [withChatPillHoverLabel(createCopyAction?.(
				`${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`,
				localize('sessionChatPills.copyIssue', "Copy issue URL"),
				() => clipboardService.writeText(uri.toString(true)),
			) ?? toAction({
				id: `sessionChatPills.copyIssue.${ref.owner}.${ref.repo}.${ref.number}`,
				label: localize('sessionChatPills.copyIssue', "Copy issue URL"),
				class: ThemeIcon.asClassName(Codicon.copy),
				run: () => clipboardService.writeText(uri.toString(true)),
			}), chatPillCopyUrlHoverLabel)],
			...getChatPillResourceLocation(uri, resourceLabel),
			...presentation,
			ariaDescription: issue
				? localize('sessionChatPills.issueDescription', "{0}. {1}", getIssueStatus(issue).label, uri.toString(true))
				: uri.toString(true),
			...(!issue && ref.title ? { tooltip: `${resourceLabel}\n${uri.toString(true)}` } : {}),
			...(createHover && !hoverCache ? createChatPillHover({ fallback: resourceLabel, createContent: createHover }) : {}),
			open: () => {
				if (session) {
					sessionsService.setActive(session);
				}
				void commandService.executeCommand(OPEN_ISSUE_ACTION_ID, { issue: { ...ref, uri } });
				if (recordedReferenceId) {
					artifactActions?.recordOpen?.(recordedReferenceId);
				}
			},
		};
		return hoverCache ? {
			...entry,
			...hoverCache.get(`${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`, entry, createHover),
		} : entry;
	});
	return entries.length > 0 ? [{ title: localize('sessionChatPills.issues', "Issues"), entries }] : [];
}

/** Returns the focused chat's changes counts represented by the shared Changes pill. */
export function computeSessionInputPillStats(session: IActiveSession | undefined, chat: IChat | undefined, reader: IReader, changesStatsCache?: ISessionChangesStatsCache): IDiffStats {
	if (session?.worktreePending?.read(reader)) {
		return EMPTY_DIFF_STATS;
	}
	const workspace = chat?.workspace?.read(reader);
	const stats = chat && workspace ? readChatChangesStats(chat, reader, getChangesPillChangesetId(workspace, isNestedChat(session, chat, reader), session)) : undefined;
	if (stats) {
		return stats;
	}
	const mainChat = session?.mainChat?.read(reader);
	const isMainChat = mainChat && chat && isEqual(mainChat.resource, chat.resource);
	return (isMainChat && session ? changesStatsCache?.get(session.sessionId, reader) : undefined) ?? EMPTY_DIFF_STATS;
}

/**
 * The focused chat's changes counts the shared Changes pill reports, or `undefined`
 * while they are not known yet: before the chat reports its changes, while the
 * represented changeset loads, or while the session's worktree is being created.
 * Unlike {@link computeSessionInputPillStats}, this never falls back to cached stats.
 */
export function readLoadedSessionInputPillStats(session: IActiveSession | undefined, chat: IChat | undefined, reader: IReader): IDiffStats | undefined {
	if (session?.worktreePending?.read(reader)) {
		return undefined;
	}
	const workspace = chat?.workspace?.read(reader);
	const stats = chat && workspace ? readLoadedChatChangesStats(chat, reader, getChangesPillChangesetId(workspace, isNestedChat(session, chat, reader), session)) : undefined;
	// Providers that only summarize the session report its main chat's file list empty until it resolves.
	if (stats?.files === 0 && chat && !chat.changesSummary && !isNestedChat(session, chat, reader) && (session?.changesSummary?.read(reader)?.files ?? 0) > 0) {
		return undefined;
	}
	return stats;
}

/** Whether `chat` is one of the session's nested chats rather than its main chat. */
function isNestedChat(session: IActiveSession | undefined, chat: IChat | undefined, reader: IReader | undefined): boolean {
	const mainChat = session?.mainChat?.read(reader);
	return !!mainChat && !!chat && !isEqual(mainChat.resource, chat.resource);
}

function isCloudSandboxSession(session: IActiveSession | undefined): boolean {
	return session?.environment === 'cloud' && isAgentHostProviderId(session.providerId);
}

/** Cloud sandboxes and nested chats show Session Changes; other main chats keep their workspace-based selection. */
function getChangesPillChangesetId(workspace: ISessionWorkspace | undefined, isNested: boolean, session: IActiveSession | undefined): string {
	return !isNested && !isCloudSandboxSession(session) && workspace?.folders[0]?.gitRepository?.workTreeUri
		? BRANCH_CHANGES_CHANGESET_ID
		: SESSION_CHANGES_CHANGESET_ID;
}

/**
 * The row's rendered height, reserved below the transcript by its host because
 * the row floats over it. Derived from the row's `2px`/`4px` padding here plus a
 * 22px `.monaco-text-button.small` pill; keep in sync if either changes.
 */
export const SESSION_CHAT_INPUT_TOOLBAR_HEIGHT = CHAT_INPUT_PILLS_ROW_HEIGHT;

class CopyFeedbackAction extends Action {

	private readonly _reset = this._register(new MutableDisposable());

	constructor(id: string, private _copyLabel: string, private _copy: () => Promise<void>) {
		super(id, _copyLabel, ThemeIcon.asClassName(Codicon.copy));
	}

	update(copyLabel: string, copy: () => Promise<void>): void {
		this._copyLabel = copyLabel;
		this._copy = copy;
		if (this.label !== copiedLabel) {
			this.label = copyLabel;
		}
	}

	override async run(): Promise<void> {
		await this._copy();
		this.label = copiedLabel;
		this.class = ThemeIcon.asClassName(Codicon.check);
		status(copiedToClipboardStatus);
		this._reset.value = disposableTimeout(() => {
			this.label = this._copyLabel;
			this.class = ThemeIcon.asClassName(Codicon.copy);
		}, copyFeedbackDuration);
	}
}

class CopyFeedbackActionCache extends Disposable {

	private readonly _actions = new Map<string, CopyFeedbackAction>();

	get(key: string, label: string, copy: () => Promise<void>): IAction {
		let action = this._actions.get(key);
		if (!action) {
			action = new CopyFeedbackAction(`sessionChatPills.copy.${key}`, label, copy);
			this._actions.set(key, action);
			this._register(action);
		} else {
			action.update(label, copy);
		}
		return action;
	}

	retain(keys: ReadonlySet<string>): void {
		for (const [key, action] of this._actions) {
			if (!keys.has(key)) {
				action.dispose();
				this._actions.delete(key);
			}
		}
	}
}

/** A toolbar for session metadata, active-turn status, and background activity. */
export class SessionChatInputToolbar extends Disposable {

	readonly element: HTMLElement;
	readonly onDidChangeChatPetPlatform: Event<void>;
	readonly onDidChangeVisibility: Event<boolean>;
	readonly activityBarActions: IObservable<readonly IAction[]>;
	private readonly _inputPills: ChatInputPills;
	private _inputElement: HTMLElement | undefined;

	/** Sentinel distinguishing "no override" from an explicit `undefined` session. */
	private readonly _sessionOverride = observableValue<IActiveSession | undefined | 'unset'>(this, 'unset');
	/** The chat whose last-turn changes are reflected. */
	private readonly _chat = observableValue<IChat | undefined>(this, undefined);
	private readonly _debugData = observableValue<ISessionChatPillsDebugData | undefined>(this, undefined);
	private readonly _browsers: SessionBrowsersControl;
	private readonly _canvases: SessionCanvasesControl;
	private readonly _backgroundActivities: SessionBackgroundActivitiesControl;
	private readonly _pullRequestHoverCache = this._register(new ChatPillHoverCache());
	private readonly _issueHoverCache = this._register(new ChatPillHoverCache());
	private readonly _pullRequestCopyActions = this._register(new CopyFeedbackActionCache());
	private readonly _issueCopyActions = this._register(new CopyFeedbackActionCache());
	private readonly _activityBarOpenerCheck = this._register(new MutableDisposable());

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
		@IClipboardService clipboardService: IClipboardService,
		@ICommandService commandService: ICommandService,
		@IGitHubService gitHubService: IGitHubService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@INotificationService notificationService: INotificationService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@ISessionChangesService sessionChangesService: ISessionChangesService,
		@ISessionChangesStatsCache changesStatsCache: ISessionChangesStatsCache,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@IOpenerService openerService: IOpenerService,
		@ISessionChatPillVisibilityService visibility: ISessionChatPillVisibilityService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IChatEntitlementService entitlementService: IChatEntitlementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IEditorService editorService: IEditorService,
		@IExternalUriOpenerService externalUriOpenerService: IExternalUriOpenerService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService configurationService: IConfigurationService,
		@ILogService logService: ILogService,
	) {
		super();

		this._diffStats = derivedOpts<IDiffStats>({ owner: this, equalsFn: diffStatsEqual }, reader => {
			const debugData = this._debugData.read(reader);
			if (debugData) {
				return debugData.stats;
			}
			return computeSessionInputPillStats(this._session.read(reader), this._chat.read(reader), reader, changesStatsCache);
		});

		const pillsEnabled = constObservable(true);
		this._browsers = this._register(instantiationService.createInstance(SessionBrowsersControl, this._session, this._chat, pillsEnabled, derived(reader => visibility.isVisible(SessionChatPillKind.Browsers, reader))));
		this._canvases = this._register(instantiationService.createInstance(SessionCanvasesControl, this._session, this._chat, derived(this, reader => this._debugData.read(reader) === undefined)));
		const autoAssociatePullRequests = derived(this, reader => {
			const session = this._session.read(reader);
			const provider = session ? sessionsProvidersService.getProvider(session.providerId) : undefined;
			return provider && isAgentHostProvider(provider)
				? observableFromEvent(this, provider.onDidChangeRootConfig, () => {
					const config = provider.getRootConfig();
					return (config?.values[AgentHostAutoAttachPullRequestsConfigKey] ?? config?.schema.properties[AgentHostAutoAttachPullRequestsConfigKey]?.default) !== false;
				})
				: constObservable(true);
		});
		const gitHubReferences = derived(this, reader => getSessionGitHubReferences(this._session.read(reader), reader, this._chat.read(reader), autoAssociatePullRequests.read(reader).read(reader)));

		// The browsers pill already offers the pages it lists, so the artifacts and
		// references pills leave those websites out.
		const detailsHost = this._register(instantiationService.createInstance(ArtifactDetailsContextView, () => this._inputElement ?? this.element, () => this.element, focusFallback));
		const sessionArtifacts = this._register(instantiationService.createInstance(SessionArtifacts, this._session, this._chat, this._browsers.urls, gitHubReferences, detailsHost));
		this._artifactSections = derived(this, reader => {
			const debugData = this._debugData.read(reader);
			return debugData ? buildDebugArtifactSections(debugData, value => clipboardService.writeText(value)) : sessionArtifacts.sections.read(reader);
		});
		this._referenceSections = sessionArtifacts.referenceSections;
		const sessionCustomizations = this._register(instantiationService.createInstance(SessionCustomizations,
			derived(this, reader => this._chat.read(reader)?.customizations?.read(reader) ?? []),
			derived(this, reader => this._session.read(reader)?.workspace.read(reader)?.folders ?? [])));
		this._customizationSections = sessionCustomizations.sections;

		const pillsVisible = derived(this, reader => this._debugData.read(reader) !== undefined || !this._isSubagentChat.read(reader));
		this._backgroundActivities = this._register(instantiationService.createInstance(SessionBackgroundActivitiesControl, this._session, this._chat, pillsEnabled, constObservable(true)));
		const backgroundShells = this._register(instantiationService.createInstance(SessionBackgroundShellsControl, this._chat));
		const pullRequestRefs = derivedOpts<readonly IGitHubPullRequestRef[]>({ owner: this, equalsFn: structuralEquals }, reader => gitHubReferences.read(reader).pullRequests);
		const pullRequestPresentation = this._register(new SessionPullRequestPresentationModel(pullRequestRefs, gitHubService));
		const artifactActions = (session: IActiveSession, reader: IReader): IRecordedArtifactActions => {
			const artifactsById = new Map((session.artifacts?.read(reader) ?? []).map(artifact => [artifact.id, artifact]));
			return {
				recordOpen: id => {
					const artifact = artifactsById.get(id);
					if (artifact) {
						logSessionArtifactOpen(telemetryService, session.sessionId, artifact.kind, artifact.isArtifact);
					}
				},
				...(session.capabilities.read(reader).supportsRemoveArtifacts ? {
					remove: async (ids: readonly string[], label: string) => {
						try {
							for (const id of ids) {
								await sessionsManagementService.removeSessionArtifact(session, id);
							}
							status(localize('sessionChatPills.referenceRemoved', "{0} removed from session.", label));
						} catch (error) {
							notificationService.error(localize('sessionChatPills.removeReferenceFailed', "Could not remove {0} from this session: {1}", label, toErrorMessage(error)));
						}
					},
				} : {}),
			};
		};
		const pullRequestSections = derived(this, reader => {
			const session = this._session.read(reader);
			const pullRequests = pullRequestPresentation.pullRequests.read(reader);
			const keys = new Set(pullRequests.map(({ ref }) => `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`));
			this._pullRequestCopyActions.retain(keys);
			this._pullRequestHoverCache.retain(keys, session ? `${session.providerId}/${session.sessionId}` : undefined);
			return buildSessionPullRequestSections(pullRequests, session, commandService, clipboardService, openerService, this._sessionsService, session ? artifactActions(session, reader) : undefined, this._pullRequestHoverCache, (key, label, copy) => this._pullRequestCopyActions.get(key, label, copy));
		});
		const issueRefs = derivedOpts<readonly IGitHubIssueRef[]>({ owner: this, equalsFn: structuralEquals }, reader => gitHubReferences.read(reader).issues);
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
				model.refresh({ priority: 'visible' });
				const shouldPoll = derived(this, pollReader => model.issue.read(pollReader)?.state !== GitHubIssueState.Closed);
				reader.store.add(autorun(pollReader => {
					if (shouldPoll.read(pollReader)) {
						pollReader.store.add(model.startPolling());
					}
				}));
			}
		}));
		const issueSections = derived(this, reader => {
			const session = this._session.read(reader);
			const resolvedIssues = issues.read(reader);
			this._issueCopyActions.retain(new Set(resolvedIssues.map(({ ref }) => `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`)));
			this._issueHoverCache.retain(new Set(resolvedIssues.map(({ ref }) => `${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}/${ref.number}`)), session ? `${session.providerId}/${session.sessionId}` : undefined);
			return buildSessionIssueSections(resolvedIssues, session, commandService, clipboardService, openerService, this._sessionsService, session ? artifactActions(session, reader) : undefined, this._issueHoverCache, (key, label, copy) => this._issueCopyActions.get(key, label, copy));
		});
		const issueIcon = derived(this, reader => {
			const resolved = groupSessionIssues(issues.read(reader));
			if (resolved.length === 1) {
				const issue = resolved[0].issue;
				return issue ? computeIssueIcon(issue.state, issue.stateReason) : computeIssueIcon(GitHubIssueState.Open, undefined);
			}
			return computeAggregateIssueIcon(resolved.map(({ issue }) => issue));
		});
		const plainPullRequestSections = derived(this, reader => pullRequestSections.read(reader)
			.map(section => ({ ...section, entries: section.entries.filter(entry => !sessionArtifacts.hasIntegration(entry.id, reader)) })));
		const plainIssueSections = derived(this, reader => issueSections.read(reader)
			.map(section => ({ ...section, entries: section.entries.filter(entry => !sessionArtifacts.hasIntegration(entry.id, reader)) })));
		const pullRequestData = createSessionPullRequestPillData(plainPullRequestSections, visibility.pullRequests, pullRequestPresentation.icon);
		const activityBarPullRequests = createSessionPullRequestPillData(pullRequestSections, visibility.pullRequests, pullRequestPresentation.icon);
		const gitHubActionsEnabled = observableConfigValue(SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING, false, configurationService);
		const openerChanges = observableSignalFromEvent(this, Event.any<unknown>(
			extensionService.onDidChangeExtensions,
			Event.filter(configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(externalUriOpenersSettingId)),
		));
		const activityBarOpeners = derived(this, reader => {
			openerChanges.read(reader);
			const supported = observableValue<ReadonlySet<string>>(this, new Set());
			if (!gitHubActionsEnabled.read(reader) || !pillsVisible.read(reader) || this._debugData.read(reader) || entitlementService.sentimentObs.read(reader).hidden) {
				return supported;
			}
			const refs = [...pullRequestRefs.read(reader), ...issueRefs.read(reader)];
			const cancellation = new CancellationTokenSource();
			const check = toDisposable(() => cancellation.dispose(true));
			this._activityBarOpenerCheck.value = check;
			reader.store.add(toDisposable(() => {
				if (this._activityBarOpenerCheck.value === check) {
					this._activityBarOpenerCheck.clear();
				}
			}));
			void Promise.all(refs.map(async ref => {
				try {
					const opener = await externalUriOpenerService.getOpener(ref.uri, { sourceUri: ref.uri }, cancellation.token);
					return opener ? ref.recordedReferenceId ?? ref.uri.toString() : undefined;
				} catch (error) {
					if (!cancellation.token.isCancellationRequested) {
						logService.error('[SessionChatInputToolbar] Could not resolve GitHub activity bar opener', error);
					}
					return undefined;
				}
			})).then(ids => {
				if (!cancellation.token.isCancellationRequested) {
					supported.set(new Set(coalesce(ids)), undefined);
				}
			});
			return supported;
		});
		const activeEditor = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditor);
		const editorPaneVisible = observableFromEvent(this, layoutService.onDidChangePartVisibility, () => layoutService.isVisible(Parts.EDITOR_PART, mainWindow));
		this.activityBarActions = derived(this, reader => {
			if (!gitHubActionsEnabled.read(reader) || !pillsVisible.read(reader) || this._debugData.read(reader) || entitlementService.sentimentObs.read(reader).hidden) {
				return [];
			}
			const chat = this._chat.read(reader);
			const session = this._session.read(reader);
			const createAction = (id: string, title: string, sections: IObservable<readonly IChatPillSection[]>, icon: ThemeIcon, viewType: string, refs: readonly (IGitHubPullRequestRef | IGitHubIssueRef)[]): IAction[] => {
				const supported = activityBarOpeners.read(reader).read(reader);
				const entries = getChatPillEntries(sections.read(reader)).filter(entry => supported.has(entry.id));
				if (!entries.length) {
					return [];
				}
				const label = entries.length === 1
					? entries[0].ariaLabel ?? entries[0].label
					: localize('sessionChatPills.activityBar.openEntries', "{0} ({1})", title, entries.length);
				const matchesEditor = (editor: EditorInput | undefined, availableEntries = entries) => !!editor && !editor.isDisposed() && (
					editor instanceof WebviewInput && editor.providerId === viewType
					|| !!editor.resource && refs.some(ref => availableEntries.some(entry => entry.id === (ref.recordedReferenceId ?? ref.uri.toString())) && isEqual(viewType === 'IssueOverview' ? getSessionIssueUri(ref) : ref.uri, editor.resource)));
				const checked = editorPaneVisible.read(reader) && matchesEditor(activeEditor.read(reader));
				const currentEntries = () => {
					if (this._store.isDisposed || !gitHubActionsEnabled.read(undefined) || !pillsVisible.read(undefined) || this._debugData.read(undefined) || entitlementService.sentimentObs.read(undefined).hidden || this._chat.read(undefined) !== chat || this._session.read(undefined) !== session) {
						return [];
					}
					const supported = activityBarOpeners.read(undefined).read(undefined);
					return getChatPillEntries(sections.read(undefined)).filter(entry => supported.has(entry.id));
				};
				return [toAction({
					id, label, class: ThemeIcon.asClassName(icon), checked,
					run: async () => {
						const entries = currentEntries();
						if (!entries.length) {
							return;
						}
						const editors = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
						const existing = editors.find(({ editor }) => editor === editorService.activeEditor && matchesEditor(editor, entries))
							?? editors.find(({ editor }) => matchesEditor(editor, entries));
						if (existing) {
							layoutService.revealEditorPartExplicitly();
							await editorService.openEditor(existing.editor, { revealIfOpened: true }, existing.groupId);
							return;
						}
						entries[0].open();
					},
				})];
			};
			return [
				...createAction(OPEN_PULL_REQUEST_ACTION_ID, localize('sessionChatPills.activityBar.openPullRequest', "Open Pull Request"), activityBarPullRequests.sections, activityBarPullRequests.icon.read(reader), 'PullRequestOverview', pullRequestRefs.read(reader)),
				...createAction(OPEN_ISSUE_ACTION_ID, localize('sessionChatPills.activityBar.openIssue', "Open Issue"), issueSections, issueIcon.read(reader), 'IssueOverview', issueRefs.read(reader)),
			];
		});
		const integratedSources = derived(this, reader => {
			if (this._debugData.read(reader) || entitlementService.sentimentObs.read(reader).hidden) {
				return [];
			}
			const pullRequests = new Map(pullRequestSections.read(reader).flatMap(section => section.entries.map(entry => [entry.id, entry] as const)));
			const issues = new Map(issueSections.read(reader).flatMap(section => section.entries.map(entry => [entry.id, entry] as const)));
			const artifacts = this._session.read(reader)?.artifacts?.read(reader) ?? [];
			return sessionArtifacts.integratedEntries.read(reader).flatMap((entry): IChatInputPillSource[] => {
				const preferredEntry = pullRequests.get(entry.id) ?? issues.get(entry.id);
				const decorated = preferredEntry ? sessionArtifacts.decorateEntry(preferredEntry, reader) : entry;
				if (!decorated.inlinePill) {
					return [];
				}
				const kind = pullRequests.has(entry.id) ? SessionChatPillKind.PullRequests : issues.has(entry.id) ? SessionChatPillKind.Issues
					: artifacts.find(artifact => artifact.id === entry.id)?.isArtifact ? SessionChatPillKind.Artifacts : SessionChatPillKind.References;
				return [{
					...createChatInputPillSource(decorated.inlinePill, kind),
					isVisible: kind === SessionChatPillKind.PullRequests
						? constObservable(visibility.pullRequests.isVisible(getPullRequestStatusFromIcon(decorated.icon) ?? pullRequests.get(entry.id)?.pullRequestState, reader))
						: undefined,
					getContextMenuPrimaryActions: () => decorated.promotedAction ? [decorated.promotedAction] : [],
				}];
			});
		});
		const changesLabel = derived(this, reader => {
			const session = this._session.read(reader);
			if (isNestedChat(session, this._chat.read(reader), reader) || isCloudSandboxSession(session)) {
				return localize('sessionChatPills.sessionChanges', "Session Changes");
			}
			const workspace = session?.workspace.read(reader);
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
					const chat = this._chat.get();
					const workspace = chat?.workspace?.get() ?? session.workspace.get();
					layoutService.revealEditorPartExplicitly();
					void sessionChangesService.openChangesEditor(session.resource, {
						changesetSelection: {
							kind: 'id',
							id: getChangesPillChangesetId(workspace, isNestedChat(session, chat, undefined), session),
						}
					});
				},
			},
			pullRequests: pullRequestData,
			issues: {
				sections: plainIssueSections,
				icon: issueIcon,

			},
			artifacts: { sections: this._artifactSections },
			references: { sections: this._referenceSections },
			customizations: { sections: this._customizationSections },
			canvases: { sections: this._canvases.sections },
			browsers: { sections: this._browsers.sections },
			subagents: this._backgroundActivities,
			backgroundShells,
		}, SESSION_CHAT_PILL_KINDS, derived(this, reader => {
			const session = this._session.read(reader);
			const chat = this._chat.read(reader);
			return session && chat ? JSON.stringify([session.providerId, session.resource.toString(), chat.resource.toString()]) : undefined;
		})));
		const actionRunner = this._register(new SessionActivatingActionRunner(() => this._session.get(), this._sessionsService));
		this._inputPills = this._register(instantiationService.createInstance(ChatInputPills, undefined, {
			debugName: 'SessionChatInputToolbar.content',
			compact,
			enabled: pillsVisible,
			sources: derived(reader => sources.sources.flatMap(source => source.kind === SessionChatPillKind.Artifacts ? [...integratedSources.read(reader), source] : [source])),
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

	setInputElement(element: HTMLElement | undefined): void {
		this._inputElement = element;
	}

	getChatPetPlatformElements(): readonly HTMLElement[] {
		return this._inputPills.getPillElements();
	}

	focusFirst(): boolean {
		return this._inputPills.focusFirst();
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
