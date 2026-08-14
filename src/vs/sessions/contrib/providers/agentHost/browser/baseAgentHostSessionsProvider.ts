/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellation, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { arrayEquals, structuralEquals } from '../../../../../base/common/equals.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, markdownStringEqual } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { equals } from '../../../../../base/common/objects.js';
import { constObservable, derived, derivedOpts, IObservable, IReader, ISettableObservable, ITransaction, observableValueOpts, subtransaction, transaction, waitForState, autorun, observableValue } from '../../../../../base/common/observable.js';
import { isEqual, isEqualOrParent, relativePath } from '../../../../../base/common/resources.js';
import { themeColorFromId, ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { localize } from '../../../../../nls.js';
import { AgentSession, AuthenticateParams, AuthenticateResult, IAgentSessionMetadata, protectedResourcesRequireGitHubCopilotSignIn } from '../../../../../platform/agentHost/common/agent.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { getCustomizationDisabledReason, isCustomizationEnabled, withCustomizationEnablement } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { buildAnnotationsUri } from '../../../../../platform/agentHost/common/annotationsUri.js';
import { parseGitHubIssueUrl } from '../../../../../platform/agentHost/common/githubIssueReferences.js';
import { getEffectiveAgents } from '../../../../../platform/agentHost/common/customAgents.js';
import { KNOWN_MODE_VALUES, SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { migrateLegacyAutopilotConfig } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ResolveSessionConfigResult, type SessionConfigPropertySchema } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AgentCustomization, ChangesSummary, ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, type ClientPluginCustomization, Customization, CustomizationEnablementKind, CustomizationType, type CustomizationEnablement, ModelSelection, SessionStatus as ProtocolSessionStatus, RootConfigState, RootState, SessionState, SessionSummary, type Changeset } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, isChatAction, isSessionAction, NotificationType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AgentCapabilities, AgentInfo, buildChatUri, buildDefaultChatUri, getSessionRelatedPullRequestUrls, isDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionEhcliAdoptable, readSessionExternal, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, ROOT_STATE_URI, SESSION_META_MULTI_ROOT_KEY, SessionMeta, SessionSourceControlOutcome, StateComponents, withSessionExternal, withSessionMultiRootMetadata, withSessionStatusFlag, withSessionWorkspaceless, type ChatSummary, type ISessionGitState, type ISessionMultiRootMetadata } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { AgentHostDownloadProgress } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostDownloadProgress.js';
import { areCustomizationScopeRootsEqual, IAgentCustomizationScope, IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatSendRequestOptions, IChatService, type IChatModelReference } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionFileChange2, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, isChatPermissionLevel, type IChatDefaultConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { isAutoApprovePolicyRestricted, normalizeSessionConfigValue } from '../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { getRegisteredLanguageModels, resolveConfiguredModel, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { buildMutableConfigSchema, IAgentHostMcpServer, IAgentHostSessionsProvider, resolvedConfigsEqual } from '../../../../common/agentHostSessionsProvider.js';
import { agentHostSessionWorkspaceKey } from '../../../../common/agentHostSessionWorkspace.js';
import { isSessionConfigComplete } from '../../../../common/sessionConfig.js';
import { ChatInteractivity, ChatOriginKind, DEFAULT_CHAT_CAPABILITIES, effectiveChatInteractivity, IChat, IChatCapabilities, IGitHubInfo, IGitHubIssueRef, IGitHubPullRequestRef, ISession, ISessionAgentRef, ISessionCapabilities, ISessionChangeset, ISessionChangesSummary, ISessionFile, ISessionFileChange, ISessionTurnFileChange, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, ISideChatSelection, sessionFileChangesEqual, sessionWorkspaceEqual, SessionStatus, SessionTypeAuthRequirement, toSessionId } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IDeleteChatOptions, ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions, ISessionModelsSnapshot, ISessionsProviderCreateSessionOptions, ISessionWorktreeConfiguration } from '../../../../services/sessions/common/sessionsProvider.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { computeSessionPullRequestIcon } from '../../../github/browser/pullRequestIconStatus.js';
import { IPullRequestIconCache } from '../../../github/browser/pullRequestIconCache.js';
import { mapProtocolStatus } from './agentHostDiffs.js';
import { createChangesets } from './agentHostSessionChangesets.js';
import { createSessionOutputObs, ISessionOutputObs } from './agentHostSessionFiles.js';

const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = 'sessions.agentHost.sessionConfigPicker.selectedValues';
const UNSAFE_SESSION_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Well-known config chips whose last-resolved schemas are cached and seeded into
// new drafts, so they stay visible (disabled) while a draft re-resolves rather
// than blanking then reappearing.
const SEEDED_CONFIG_SCHEMA_KEYS = [SessionConfigKey.Isolation, SessionConfigKey.Branch] as const;

/** Cancels its token when replaced or disposed by a mutable disposable. */
class ActiveClientSyncCancellationTokenSource extends CancellationTokenSource {
	override dispose(): void {
		super.dispose(true);
	}
}

/**
 * {@link SessionConfigKey.Isolation} value that runs a session in its own git worktree.
 */
const WORKTREE_ISOLATION_VALUE = 'worktree';

/** Whether the given session config values select worktree isolation. */
function isWorktreeIsolation(values: Record<string, unknown> | undefined): boolean {
	return values?.[SessionConfigKey.Isolation] === WORKTREE_ISOLATION_VALUE;
}

/** Maximum number of cached session summaries persisted per provider. */
const CACHED_SESSIONS_MAX_PER_HOST = 100;

/**
 * Serialized shape of an {@link IAgentSessionMetadata} suitable for
 * persisting via {@link IStorageService}. URIs are stored as strings
 * and diffs are intentionally omitted (they are re-populated when the
 * connection refreshes sessions).
 */
interface ISerializedSessionMetadata {
	readonly session: string;
	readonly startTime: number;
	readonly modifiedTime: number;
	readonly summary?: string;
	readonly workingDirectory?: string;
	/** Session-scoped flag bits only — see {@link SESSION_STATUS_FLAG_MASK}. */
	readonly status?: ProtocolSessionStatus;
	/** @deprecated Superseded by the `IsRead` bit on {@link status}. */
	readonly isRead?: boolean;
	/** @deprecated Superseded by the `IsArchived` bit on {@link status}. */
	readonly isArchived?: boolean;
	/** @deprecated Legacy name for `isArchived`. */
	readonly isDone?: boolean;
	readonly project?: { readonly uri: string; readonly displayName: string };
	/**
	 * Whether the session is a workspace-less quick chat. Persisted because the
	 * adapter seeds its session-kind from this tag at construction (see
	 * {@link AgentHostSessionAdapter}); dropping it on restore would leak the
	 * host's scratch dir as a workspace folder until the next listing arrives.
	 */
	readonly workspaceless?: boolean;
	readonly external?: boolean;
	readonly multiRoot?: ISessionMultiRootMetadata;
}

/**
 * Only these bits are cached. The activity bits are live state, and restoring them
 * would show a stale spinner until the next `listSessions()` lands — indefinitely
 * for an unreachable remote host, which keeps republishing its cached snapshot.
 */
const SESSION_STATUS_FLAG_MASK = ProtocolSessionStatus.IsRead | ProtocolSessionStatus.IsArchived;

function serializeMetadata(meta: IAgentSessionMetadata): ISerializedSessionMetadata {
	return {
		session: meta.session.toString(),
		startTime: meta.startTime,
		modifiedTime: meta.modifiedTime,
		summary: meta.summary,
		workingDirectory: meta.workingDirectories?.[0]?.toString(),
		status: meta.status !== undefined ? meta.status & SESSION_STATUS_FLAG_MASK : undefined,
		project: meta.project ? { uri: meta.project.uri.toString(), displayName: meta.project.displayName } : undefined,
		workspaceless: readSessionWorkspaceless(meta._meta) || undefined,
		external: readSessionExternal(meta._meta) || undefined,
		multiRoot: readSessionMultiRootMetadata(meta._meta),
	};
}

function deserializeMetadata(raw: ISerializedSessionMetadata): IAgentSessionMetadata | undefined {
	try {
		let _meta = withSessionWorkspaceless(undefined, raw.workspaceless === true);
		_meta = withSessionExternal(_meta, raw.external === true);
		_meta = withSessionMultiRootMetadata(_meta, readSessionMultiRootMetadata({ [SESSION_META_MULTI_ROOT_KEY]: raw.multiRoot }));
		return {
			session: URI.parse(raw.session),
			startTime: raw.startTime,
			modifiedTime: raw.modifiedTime,
			summary: raw.summary,
			workingDirectories: raw.workingDirectory ? [URI.parse(raw.workingDirectory)] : undefined,
			status: deserializeStatus(raw),
			project: raw.project ? { uri: URI.parse(raw.project.uri), displayName: raw.project.displayName } : undefined,
			...(_meta ? { _meta } : {}),
		};
	} catch {
		return undefined;
	}
}

/** Reads the cached flag bits, folding in the legacy standalone booleans. */
function deserializeStatus(raw: ISerializedSessionMetadata): ProtocolSessionStatus | undefined {
	const legacyArchived = raw.isArchived ?? raw.isDone;
	if (raw.isRead === undefined && legacyArchived === undefined) {
		return raw.status !== undefined ? raw.status & SESSION_STATUS_FLAG_MASK : undefined;
	}
	let status = (raw.status ?? ProtocolSessionStatus.Idle) & SESSION_STATUS_FLAG_MASK;
	if (raw.isRead !== undefined) {
		status = withSessionStatusFlag(status, ProtocolSessionStatus.IsRead, raw.isRead);
	}
	if (legacyArchived !== undefined) {
		status = withSessionStatusFlag(status, ProtocolSessionStatus.IsArchived, legacyArchived);
	}
	return status;
}

function isRememberedSessionConfigKey(property: string): boolean {
	return property !== SessionConfigKey.Branch && !UNSAFE_SESSION_CONFIG_KEYS.has(property);
}

function normalizeAutoApproveValue(value: unknown, policyRestricted: boolean): ChatPermissionLevel | undefined {
	// `KNOWN_AUTO_APPROVE_VALUES` is intentionally tolerant of legacy values
	// that are not real `ChatPermissionLevel`s. Validate against the enum here
	// so this function never returns a value outside its declared contract.
	const normalized = getChatPermissionLevelFromDefaultConfiguration(value) ?? (isChatPermissionLevel(value) ? value : undefined);
	if (!normalized) {
		return undefined;
	}
	// Bypass and (legacy) Autopilot auto-approve at least some
	// tool calls, so clamp them to Default when enterprise policy disables
	// global auto-approval.
	if (policyRestricted && normalized !== ChatPermissionLevel.Default) {
		return ChatPermissionLevel.Default;
	}
	return normalized;
}

function isGitHubInfoEqual(a: IGitHubInfo | undefined, b: IGitHubInfo | undefined): boolean {
	if (a === b) {
		return true;
	}

	if (a === undefined || b === undefined) {
		return false;
	}

	return a.owner === b.owner &&
		a.repo === b.repo &&
		arrayEquals(a.pullRequests ?? [], b.pullRequests ?? [], (x, y) =>
			x.owner === y.owner &&
			x.repo === y.repo &&
			x.number === y.number &&
			isEqual(x.uri, y.uri) &&
			x.icon?.id === y.icon?.id) &&
		a.pullRequest?.number === b.pullRequest?.number &&
		a.pullRequest?.icon?.id === b.pullRequest?.icon?.id &&
		a.pullRequest?.baseRefOid === b.pullRequest?.baseRefOid &&
		a.pullRequest?.headRefOid === b.pullRequest?.headRefOid &&
		arrayEquals(a.issues ?? [], b.issues ?? [], (x, y) => x.owner === y.owner && x.repo === y.repo && x.number === y.number);
}

function dateEquals(a: Date | undefined, b: Date | undefined): boolean {
	return a?.getTime() === b?.getTime();
}

function markdownStringEquals(a: IMarkdownString | undefined, b: IMarkdownString | undefined): boolean {
	return a === b || !!a && !!b && markdownStringEqual(a, b);
}

/** Maps the GitHub issue URLs recorded on the session's metadata to issue references. */
function toGitHubIssueRefs(issueUrls: readonly string[] | undefined): readonly IGitHubIssueRef[] | undefined {
	const refs: IGitHubIssueRef[] = [];
	for (const url of issueUrls ?? []) {
		const reference = parseGitHubIssueUrl(url);
		if (reference) {
			refs.push({ ...reference, uri: URI.parse(url) });
		}
	}
	return refs.length > 0 ? refs : undefined;
}

/** Maps session pull request URLs to references, preserving recency order. */
function toGitHubPullRequestRefs(pullRequestUrls: readonly string[] | undefined): readonly IGitHubPullRequestRef[] | undefined {
	const refs: IGitHubPullRequestRef[] = [];
	for (const url of pullRequestUrls ?? []) {
		const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/.exec(url);
		if (!match) {
			continue;
		}
		refs.push({
			owner: match[1],
			repo: match[2],
			number: Number(match[3]),
			uri: URI.parse(url),
		});
	}
	return refs.length > 0 ? refs : undefined;
}

function toGitHubInfo(meta: SessionMeta | undefined): IGitHubInfo | undefined {
	const state = readSessionGitHubState(meta);
	const gitState = readSessionGitState(meta);
	const pullRequests = toGitHubPullRequestRefs(getSessionRelatedPullRequestUrls(state));
	const pullRequest = pullRequests?.[0];
	const repository = state?.owner && state.repo
		? { owner: state.owner, repo: state.repo }
		: gitState?.githubOwner && gitState.githubRepo
			? { owner: gitState.githubOwner, repo: gitState.githubRepo }
			: pullRequest;

	if (!repository) {
		return undefined;
	}

	return {
		owner: repository.owner,
		repo: repository.repo,
		pullRequests,
		pullRequest: pullRequest ? {
			number: pullRequest.number,
			uri: pullRequest.uri,
		} : undefined,
		issues: toGitHubIssueRefs(state?.issueUrls),
	};
}

// ============================================================================
// AgentHostSessionAdapter — shared adapter for local and remote sessions
// ============================================================================

/** Copilot CLI session type */
export const CopilotCLISessionType: ISessionType = {
	id: 'copilotcli',
	label: localize('copilotCLI', "Copilot"),
	icon: Codicon.copilot,
	supportsWorktreeConfiguration: true,
	authRequirement: SessionTypeAuthRequirement.GitHub,
};

/**
 * Resolve what an agent needs before it can serve a request, from what it
 * advertises — rather than from a static per-type flag, which cannot track
 * credentials that come and go. The advertised protected-resource set already
 * crosses the agent-host IPC boundary and already updates reactively, so it is
 * the signal rather than a parallel field providers would have to keep in sync.
 *
 * An agent that still requires the GitHub Copilot protected resource needs
 * sign-in; one that has dropped the requirement is running on its own
 * credentials. Note both Claude and Codex encode "not required" by *keeping* the
 * Copilot resource and marking it `required: false` rather than omitting it —
 * that lets the host silently forward a token to an already-signed-in user
 * without forcing sign-in on anyone else. This treats the two identically.
 *
 * The model count is the second, load-bearing half. `required: false` alone
 * would read as "usable without GitHub" even for an agent that cannot serve
 * anything, because an agent may advertise a *static* model catalog that answers
 * regardless of credentials (the Claude SDK's `supportedModels()` does exactly
 * this). Providers are therefore expected to publish an empty catalog when they
 * genuinely cannot run, and an empty catalog is what distinguishes
 * {@link SessionTypeAuthRequirement.Unusable} from
 * {@link SessionTypeAuthRequirement.None} here.
 *
 * Absent resources mean the host has not resolved the agent yet, so assume
 * GitHub until it does.
 */
export function resolveAgentAuthRequirement(agent: AgentInfo): SessionTypeAuthRequirement {
	if (!agent.protectedResources || protectedResourcesRequireGitHubCopilotSignIn(agent.protectedResources)) {
		return SessionTypeAuthRequirement.GitHub;
	}
	return agent.models.length > 0 ? SessionTypeAuthRequirement.None : SessionTypeAuthRequirement.Unusable;
}

/**
 * Strategy that captures the quick-chat vs. workspace differences of an
 * agent-host session in one place, so the adapter and draft classes delegate to
 * it instead of re-branching on `readSessionWorkspaceless`. Drafts fix their
 * kind at construction; adapters select it from their monotonic quick-chat
 * state, so a promotion swaps the strategy.
 */
interface IAgentHostSessionKind {
	readonly isQuickChat: boolean;
	/** Whether the session requires a workspace/repository to be constructed. */
	readonly requiresWorkspace: boolean;
	/** Untitled skeleton title before the first request commits the session. */
	readonly untitledTitle: string;
	computeWorkspace(buildWorkspace: () => ISessionWorkspace | undefined): ISessionWorkspace | undefined;
}

const WorkspaceSessionKind: IAgentHostSessionKind = {
	isQuickChat: false,
	requiresWorkspace: true,
	get untitledTitle() { return localize('new session', "New Session"); },
	computeWorkspace: buildWorkspace => buildWorkspace(),
};

const QuickChatSessionKind: IAgentHostSessionKind = {
	isQuickChat: true,
	requiresWorkspace: false,
	get untitledTitle() { return localize('new chat', "New Chat"); },
	computeWorkspace: () => undefined,
};

function sessionKind(isQuickChat: boolean): IAgentHostSessionKind {
	return isQuickChat ? QuickChatSessionKind : WorkspaceSessionKind;
}

/**
 * Variation points the host provider supplies when building an adapter.
 * Differences between local and remote sessions (icon, description text,
 * workspace builder, optional URI mapping) flow through this options bag so
 * the adapter itself stays a single concrete class.
 */
export interface IAgentHostAdapterOptions {
	readonly icon: ThemeIcon;
	/** Loading observable wired to the provider's authentication-pending state. */
	readonly loading: IObservable<boolean>;
	/** Builds the session workspace from session metadata; provider-specific (icon, providerLabel, requiresWorkspaceTrust). */
	readonly buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectories: readonly URI[] | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined) => ISessionWorkspace | undefined;
	/** Optional URI mapping for diff entries (remote uses `toAgentHostUri`; local uses identity). */
	readonly mapDiffUri?: (uri: URI) => URI;
	/**
	 * GitHub service used to resolve the pull request that targets the
	 * session's branch and refresh its live state. Optional so tests / hosts
	 * without a workbench GitHub service still construct adapters; PR
	 * affordances simply stay dormant when absent.
	 */
	readonly gitHubService?: IGitHubService;
	/**
	 * Instantiation service used to construct the session's changeset
	 * resolvers. Shared with the Copilot chat sessions provider so all
	 * agent-host sessions surface the same set of changesets.
	 */
	readonly instantiationService: IInstantiationService;
	/**
	 * Forces every chat in the session to be read-only while `true`, regardless of what the host
	 * reported. Set when the session's backing environment is unreachable and its conversation is
	 * being served from persisted history: the transcript is real, but nothing can be sent to a
	 * host that no longer exists.
	 */
	readonly readOnly?: IObservable<boolean>;
	/**
	 * Returns the agent connection for the session, if it exists.
	 */
	readonly getConnection: () => IAgentConnection | undefined;
	/** Agent capability lookup shared by every adapter owned by this provider. */
	readonly agentCapabilities: IObservable<ReadonlyMap<string, AgentCapabilities | undefined> | undefined>;
	/**
	 * The scheme the host addresses this session under, when it differs from the agent provider
	 * (cloud sandbox: provider `copilot`, sessions `ahp-session:/<id>`). Defaults to the provider.
	 */
	readonly backendSessionScheme?: string;
}

/**
 * Maps the protocol {@link ProtocolChatInteractivity} to the provider-agnostic
 * {@link ChatInteractivity}. Absent interactivity defaults to {@link
 * ChatInteractivity.Full} for backward compatibility.
 */
function toChatInteractivity(interactivity: ProtocolChatInteractivity | undefined): ChatInteractivity {
	switch (interactivity) {
		case ProtocolChatInteractivity.ReadOnly:
			return ChatInteractivity.ReadOnly;
		case ProtocolChatInteractivity.Hidden:
			return ChatInteractivity.Hidden;
		default:
			return ChatInteractivity.Full;
	}
}

/**
 * A non-default peer chat within an {@link AgentHostSessionAdapter}. Holds its
 * own observables seeded from the protocol {@link ChatSummary} so the chat tab
 * renders the chat's own title/status/activity independently of the aggregated
 * session-level state. The {@link IChat.resource} carries the chatId in its URI
 * fragment so the chat view opens a distinct widget per peer chat.
 */
class AdditionalChat extends Disposable {

	readonly chat: IChat;

	private readonly _title: ISettableObservable<string>;
	private readonly _status: ISettableObservable<SessionStatus>;
	private readonly _updatedAt: ISettableObservable<Date>;
	private readonly _modelId: ISettableObservable<string | undefined>;
	private readonly _mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	private readonly _description: ISettableObservable<IMarkdownString | undefined>;
	private readonly _lastTurnEnd: ISettableObservable<Date | undefined>;
	private readonly _interactivity: ISettableObservable<ChatInteractivity>;
	private readonly _isNew: ISettableObservable<boolean>;

	constructor(resource: URI, summary: ChatSummary, isNew: boolean = false, parentChat?: URI, sessionIsArchived: IObservable<boolean> = constObservable(false), lastTurnChanges?: IObservable<readonly ISessionTurnFileChange[]>, sessionIsReadOnly: IObservable<boolean> = constObservable(false)) {
		super();
		const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : new Date();
		this._title = observableValue('chatTitle', summary.title || localize('newChatTab', "New Chat"));
		this._status = observableValue<SessionStatus>('chatStatus', mapProtocolStatus(summary.status));
		this._updatedAt = observableValueOpts<Date>({ owner: this, debugName: 'chatUpdatedAt', equalsFn: dateEquals }, modifiedAt);
		this._modelId = observableValue<string | undefined>('chatModelId', undefined);
		this._mode = observableValueOpts<{ readonly id: string; readonly kind: string } | undefined>({ owner: this, debugName: 'chatMode', equalsFn: structuralEquals }, undefined);
		this._description = observableValueOpts<IMarkdownString | undefined>({ owner: this, debugName: 'chatDescription', equalsFn: markdownStringEquals }, summary.activity ? new MarkdownString().appendText(summary.activity) : undefined);
		this._lastTurnEnd = observableValueOpts<Date | undefined>({ owner: this, debugName: 'chatLastTurnEnd', equalsFn: dateEquals }, modifiedAt);
		this._interactivity = observableValue<ChatInteractivity>('chatInteractivity', toChatInteractivity(summary.interactivity));
		this._isNew = observableValue<boolean>('chatIsNew', isNew);
		this.chat = {
			resource,
			createdAt: modifiedAt,
			title: this._title,
			updatedAt: this._updatedAt,
			status: derived(reader => this._isNew.read(reader) ? SessionStatus.Untitled : this._status.read(reader)),
			changes: constObservable([]),
			lastTurnChanges,
			checkpoints: observableValue(this, undefined),
			modelId: this._modelId,
			mode: this._mode,
			isArchived: sessionIsArchived,
			isRead: constObservable(true),
			// An archived session is read-only, as is one whose environment is gone and whose
			// history is being replayed: force every chat's interactivity to ReadOnly so the chat
			// view hides the composer and gates mutating actions.
			interactivity: derived(reader => effectiveChatInteractivity(
				sessionIsArchived.read(reader) || sessionIsReadOnly.read(reader),
				this._interactivity.read(reader))),
			description: this._description,
			lastTurnEnd: this._lastTurnEnd,
			origin: summary.origin ? {
				kind: toSessionChatOriginKind(summary.origin.kind),
				parentChat,
				...((summary.origin.kind === ProtocolChatOriginKind.Fork || summary.origin.kind === ProtocolChatOriginKind.SideChat) ? { turnId: summary.origin.turnId } : {}),
				...(summary.origin.kind === ProtocolChatOriginKind.SideChat && summary.origin.selection ? { selection: toSessionSideChatSelection(summary.origin.selection) } : {}),
			} : undefined,
			// Subagent (tool-origin) worker chats are transient children and can be
			// neither renamed nor deleted; other peer chats are fully manageable.
			capabilities: constObservable<IChatCapabilities>(
				summary.origin?.kind === ProtocolChatOriginKind.Tool
					? { canRename: false, canDelete: false }
					: DEFAULT_CHAT_CAPABILITIES),
		};
	}

	update(summary: ChatSummary): void {
		const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : this._updatedAt.get();
		transaction(tx => {
			this._title.set(summary.title || localize('newChatTab', "New Chat"), tx);
			this._status.set(mapProtocolStatus(summary.status), tx);
			this._updatedAt.set(modifiedAt, tx);
			this._description.set(summary.activity ? new MarkdownString().appendText(summary.activity) : undefined, tx);
			this._lastTurnEnd.set(modifiedAt, tx);
			this._interactivity.set(toChatInteractivity(summary.interactivity), tx);
		});
	}

	/** Optimistically update the chat title ahead of the host's `chatUpdated`. */
	setTitle(title: string): void {
		this._title.set(title || localize('newChatTab', "New Chat"), undefined);
	}

	/** Present as `Untitled` until the first request is sent so the view shows the composer. */
	markNew(): void {
		this._isNew.set(true, undefined);
	}

	/** Clear the `new` presentation after the first request is sent. */
	markSent(): void {
		this._isNew.set(false, undefined);
	}

	setModelId(modelId: string | undefined): void {
		this._modelId.set(modelId, undefined);
	}

	setAgent(agent: ISessionAgentRef | undefined): void {
		this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined, undefined);
	}
}

/**
 * Adapts an {@link IAgentSessionMetadata} into an {@link ISession} for the
 * sessions UI. A single concrete class for both local and remote agent
 * hosts — variation flows through {@link IAgentHostAdapterOptions}.
 */
export function toSessionChatOriginKind(kind: string): ChatOriginKind {
	switch (kind) {
		case ChatOriginKind.Tool:
			return ChatOriginKind.Tool;
		case ChatOriginKind.Fork:
			return ChatOriginKind.Fork;
		case ChatOriginKind.SideChat:
			return ChatOriginKind.SideChat;
		default:
			return ChatOriginKind.User;
	}
}

function toSessionSideChatSelection(selection: { text: string; responsePartId?: string }): ISideChatSelection {
	return {
		text: selection.text,
		...(selection.responsePartId ? { responsePartId: selection.responsePartId } : {}),
	};
}

export class AgentHostSessionAdapter extends Disposable implements ISession {

	readonly sessionId: string;
	readonly resource: URI;
	readonly providerId: string;
	readonly sessionType: string;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;
	readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	readonly isQuickChat: IObservable<boolean>;
	readonly isAutomation = observableValue('isAutomation', false);
	/** See {@link ISession.worktreePending}. */
	readonly worktreePending: IObservable<boolean>;
	readonly title: ISettableObservable<string>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly completedStateIcon: IObservable<ThemeIcon | undefined>;
	readonly changes: IObservable<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>;
	readonly changesets: ISettableObservable<readonly ISessionChangeset[] | undefined>;
	readonly externalChanges: IObservable<readonly ISessionFile[]>;
	readonly modelId: ISettableObservable<string | undefined>;
	modelSelection: ModelSelection | undefined;
	readonly mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	readonly loading: IObservable<boolean>;
	readonly isArchived = observableValue('isArchived', false);
	// Read/unread state is owned by the provider and backed by the agent host
	// protocol's `IsRead` status bit (persisted as session metadata). It is
	// seeded from the session metadata, kept in sync with protocol updates, and
	// mutated via {@link BaseAgentHostSessionsProvider.setSessionReadState}.
	readonly isRead = observableValue('isRead', true);
	readonly description: IObservable<IMarkdownString | undefined>;
	readonly lastTurnEnd: ISettableObservable<Date | undefined>;
	readonly gitHubInfo: IObservable<IGitHubInfo | undefined>;

	readonly mainChat: IObservable<IChat>;
	readonly chats: IObservable<readonly IChat[]>;
	/**
	 * Capabilities derived reactively from the connection's root state rather
	 * than snapshotted at construction time. The root state can still be loading
	 * when an adapter is built (the agent-host process may be starting), in which
	 * case the agent's advertised capabilities are not yet available; the derived
	 * re-emits (and drives the chat catalog / context keys) as soon as the root
	 * state arrives instead of being permanently frozen to the `false` defaults.
	 * `supportsRename`/`supportsDelete` are always supported for agent-host
	 * sessions.
	 */
	readonly capabilities: IObservable<ISessionCapabilities>;

	/**
	 * The default chat (resource == this session's resource). Always present;
	 * for single-chat sessions it is the only chat and `chats === [it]`.
	 */
	private readonly _defaultChat: IChat;
	/**
	 * The session's live output observables (external files + per-chat last-turn
	 * changes), parsed once from the active-session subscriptions and shared by
	 * the default chat and every peer chat so each chat's status pills reflect
	 * that chat's own last turn.
	 */
	private readonly _sessionOutput: ISessionOutputObs;
	/**
	 * Independent title override for the default chat tab. `undefined` means the
	 * default chat inherits the session title; a non-empty value means the user
	 * (or host) renamed the default chat independently of the session.
	 */
	private readonly _defaultChatTitleOverride = observableValue<string | undefined>('defaultChatTitleOverride', undefined);
	/**
	 * Independent status override for the default chat tab. `undefined` means the
	 * default chat reflects the aggregated session status (the single-chat case,
	 * where they are equivalent); a defined value means a multi-chat session, so
	 * the default chat shows its own status rather than the session aggregate
	 * (which may have been promoted by a running peer chat).
	 */
	private readonly _defaultChatStatusOverride = observableValue<SessionStatus | undefined>('defaultChatStatusOverride', undefined);
	/** Whether this session was created with worktree isolation. */
	private readonly _worktreeIsolation = observableValue<boolean>('worktreeIsolation', false);
	/** Interactivity of the default chat. Driven from the default chat's protocol summary. */
	private readonly _defaultChatInteractivity = observableValue<ChatInteractivity>('defaultChatInteractivity', ChatInteractivity.Full);
	private readonly _mainChatObs: ISettableObservable<IChat>;
	private readonly _chatsObs: ISettableObservable<readonly IChat[]>;
	/** Additional (non-default) peer chats keyed by chatId. */
	private readonly _additionalChats = this._register(new DisposableMap<string, AdditionalChat>());
	private readonly _sessionOutputCache = new Map<string, unknown>();
	/** Chat ids that have not yet sent their first request (presented as `Untitled`). */
	private readonly _newChatIds = new Set<string>();
	/**
	 * The last {@link SessionState} applied to the chat catalog, retained so the
	 * catalog can be re-reconciled when {@link capabilities} change after the
	 * fact (see the capability autorun in the constructor).
	 */
	private _lastCatalogState: SessionState | undefined;
	private readonly _rawId: string;
	private readonly _resourceScheme: string;

	readonly agentProvider: string;
	/**
	 * This session's URI as the host's registry is keyed by it, which may use a different scheme
	 * than {@link agentProvider} (cloud sandbox: provider `copilot`, backend `ahp-session:/<id>`).
	 * Every backend call must address the session by this URI.
	 */
	readonly backendUri: URI;

	// Retained so we can rebuild `workspace` when only `_meta` changes via
	// a `SessionMetaChanged` action dispatched on session open (without a full
	// list refresh). See `_applySessionMetaFromState` / `setMeta`.
	private _project: IAgentSessionMetadata['project'];
	private _workingDirectories: readonly URI[] | undefined;
	/** Working-directory set used to resolve session customizations. */
	get workingDirectories(): readonly URI[] { return this._workingDirectories ?? []; }
	// The directory that the current `mode` custom-agent URI is rooted at. Used to
	// compute the agent's repo-relative path so the selection can be rebased onto
	// its worktree twin when the session relocates into an isolated worktree (see
	// `reconcileSelectedAgent`).
	private _agentBaseDir: URI | undefined;
	private _meta: SessionMeta | undefined;
	/**
	 * Whether this session is a workspace-less quick chat. Seeded from the
	 * constructor metadata and only ever promoted by
	 * {@link _promoteToQuickChatIfWorkspaceless}.
	 */
	private readonly _isQuickChat: ISettableObservable<boolean>;
	/** Session-kind strategy (quick chat vs. workspace), derived from {@link _isQuickChat}. */
	private get _kind(): IAgentHostSessionKind { return sessionKind(this._isQuickChat.get()); }
	/**
	 * Observable mirror of {@link _meta}, kept in sync with every write to
	 * `_meta` so reactive derivations (notably {@link gitHubInfo}) re-fire
	 * when git / GitHub state arrives (or changes). The host treats the
	 * session-state and session-summary `_meta` as the same bag, so both git
	 * state and GitHub state live here.
	 */
	private readonly _metaObs: ISettableObservable<SessionMeta | undefined>;

	private _activity: ISettableObservable<string | undefined>;

	private readonly _changesSummary = observableValueOpts<ISessionChangesSummary | undefined>({ equalsFn: structuralEquals }, undefined);
	get changesSummary(): IObservable<ISessionChangesSummary | undefined> { return this._changesSummary; }
	/**
	 * Sets the aggregate change chip. Callers inside a transaction MUST pass it
	 * — a `set` without one builds and finishes its own transaction, notifying
	 * observers before the enclosing update has applied its remaining fields.
	 */
	setChangesSummary(changes: ChangesSummary | undefined, tx?: ITransaction): boolean {
		if (!changes) {
			return false;
		}

		const { additions, deletions, files } = changes;
		const currentChangesSummary = this._changesSummary.get();

		if (
			(currentChangesSummary?.files ?? 0) === (files ?? 0) &&
			(currentChangesSummary?.additions ?? 0) === (additions ?? 0) &&
			(currentChangesSummary?.deletions ?? 0) === (deletions ?? 0)
		) {
			return false;
		}

		this._changesSummary.set({
			additions: additions ?? 0,
			deletions: deletions ?? 0,
			files: files ?? 0
		}, tx);

		return true;
	}

	readonly isActiveSessionObs: IObservable<boolean>;

	constructor(
		metadata: IAgentSessionMetadata,
		providerId: string,
		resourceScheme: string,
		logicalSessionType: string,
		private readonly _options: IAgentHostAdapterOptions,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IPullRequestIconCache private readonly _pullRequestIconCache: IPullRequestIconCache,
	) {
		super();
		const rawId = AgentSession.id(metadata.session);
		const agentProvider = AgentSession.provider(metadata.session);
		if (!agentProvider) {
			throw new Error(`Agent session URI has no provider scheme: ${metadata.session.toString()}`);
		}
		this.agentProvider = agentProvider;
		this.backendUri = AgentSession.uri(_options.backendSessionScheme ?? agentProvider, rawId);
		this.resource = URI.from({ scheme: resourceScheme, path: `/${rawId}` });
		this._rawId = rawId;
		this._resourceScheme = resourceScheme;
		this.sessionId = toSessionId(providerId, this.resource);
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		this._isQuickChat = observableValue('isQuickChat', readSessionWorkspaceless(metadata._meta));
		this.icon = _options.icon;
		this.createdAt = new Date(metadata.startTime);
		this.title = observableValue('title', metadata.summary || `Session ${rawId.substring(0, 8)}`);
		this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
		this.modelSelection = undefined;
		this.status = observableValue<SessionStatus>('status', metadata.status !== undefined ? mapProtocolStatus(metadata.status) : SessionStatus.Completed);
		this.modelId = observableValue<string | undefined>('modelId', undefined);
		this.mode = observableValueOpts<{ readonly id: string; readonly kind: string } | undefined>({ owner: this, debugName: 'mode', equalsFn: structuralEquals }, undefined);
		this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this._activity = observableValue('activity', metadata.activity);
		this._project = metadata.project;
		this._workingDirectories = metadata.workingDirectories;

		this._meta = metadata._meta;
		this._metaObs = observableValue<SessionMeta | undefined>('agentHostSessionMeta', this._meta);

		const baseGitHubInfoObs = derivedOpts<IGitHubInfo | undefined>({
			equalsFn: isGitHubInfoEqual
		}, reader => {
			return toGitHubInfo(this._metaObs.read(reader));
		});

		const gitHubInfoWithIcon = derived<IGitHubInfo | undefined>(this, reader => {
			const baseGitHubInfo = baseGitHubInfoObs.read(reader);
			if (!baseGitHubInfo?.pullRequest) {
				return baseGitHubInfo;
			}

			const icon = computeSessionPullRequestIcon(reader, this._gitHubService, this._pullRequestIconCache, baseGitHubInfo);
			return {
				...baseGitHubInfo,
				pullRequests: baseGitHubInfo.pullRequests?.map((pullRequest, index) => index === 0 ? {
					...pullRequest,
					icon
				} : pullRequest),
				pullRequest: {
					...baseGitHubInfo.pullRequest,
					icon
				}
			};
		});
		this.gitHubInfo = derivedOpts<IGitHubInfo | undefined>({ owner: this, equalsFn: isGitHubInfoEqual }, reader => gitHubInfoWithIcon.read(reader));
		this.completedStateIcon = derived(this, reader => {
			const sourceControlState = readSessionSourceControlState(this._metaObs.read(reader));
			if (sourceControlState?.latestOutcome === SessionSourceControlOutcome.Merge) {
				return { ...Codicon.gitMerge, color: themeColorFromId('charts.purple') };
			}
			return this.gitHubInfo.read(reader)?.pullRequest?.icon;
		});

		const initialWorkspace = this._computeWorkspace();
		this.workspace = observableValue('workspace', initialWorkspace);
		this.isQuickChat = this._isQuickChat;
		// Until the host reports the worktree, the workspace is still the checkout it was started from.
		this.worktreePending = derived(this, reader =>
			this._worktreeIsolation.read(reader)
			&& !this.workspace.read(reader)?.folders.some(folder => !!folder.gitRepository?.workTreeUri));
		this.loading = _options.loading;
		this.description = derivedOpts<IMarkdownString | undefined>({ owner: this, equalsFn: markdownStringEquals }, reader => {
			const status = this.status.read(reader);
			if (status === SessionStatus.InProgress || status === SessionStatus.NeedsInput) {
				const activity = this._activity.read(reader);
				if (activity) {
					return new MarkdownString().appendText(activity);
				}
			}

			return undefined;
		});

		if (isSessionStatusArchived(metadata.status)) {
			this.isArchived.set(true, undefined);
		}

		if (metadata.status !== undefined) {
			this.isRead.set(isSessionStatusRead(metadata.status), undefined);
		}

		this.isActiveSessionObs = derived(this, reader => {
			const activeSession = this._sessionsService.activeSession.read(reader);
			return isEqual(activeSession?.resource, this.resource);
		});

		// Set the changes summary from the aggregate. While the session is active,
		// the changes summary will be updated through the session changeset changes.
		// As soon as the session is no longer active, the changes summary will be
		// updated from `metadata.changes` (mirroring `SessionSummary.changes`).
		this.setChangesSummary(metadata.changes);

		// Changesets will be resolved asynchronously when the session is active. `undefined`
		// marks the uninitialized state, distinct from a resolved session that simply has no
		// changesets (an empty array).
		this.changesets = observableValue<readonly ISessionChangeset[] | undefined>(this, undefined);

		// Create an observable for the changes of the session's
		// default changeset (ex: Branch Changes). This will always
		// track the default changeset independent of the selected
		// changeset.
		this.changes = this._createChangesObs();

		// Files created/edited/deleted outside the workspace, plus the last turn's
		// changes, parsed from the chat-state turns. Computed lazily from the same
		// active-session subscriptions used for changes.
		const sessionOutput = createSessionOutputObs(
			this.backendUri,
			this._options,
			this.isActiveSessionObs,
			this.isArchived,
			this.workspace,
			this._sessionOutputCache,
		);
		this._sessionOutput = sessionOutput;
		this.externalChanges = sessionOutput.externalFiles;

		const mainChat: IChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			title: derived(this, reader => this._defaultChatTitleOverride.read(reader) ?? this.title.read(reader)),
			updatedAt: this.updatedAt,
			status: derived(this, reader => this._defaultChatStatusOverride.read(reader) ?? this.status.read(reader)),
			changes: this.changes,
			lastTurnChanges: sessionOutput.getLastTurnChanges(URI.parse(buildDefaultChatUri(this.backendUri))),
			checkpoints: observableValue(this, undefined),
			modelId: this.modelId,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: this.isRead,
			// An archived session is read-only, as is one whose environment is gone and whose
			// history is being replayed: force the default chat's interactivity to ReadOnly so the
			// chat view hides the composer and gates mutating actions.
			interactivity: derived(this, reader => effectiveChatInteractivity(
				this.isArchived.read(reader) || (this._options.readOnly?.read(reader) ?? false),
				this._defaultChatInteractivity.read(reader))),
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this._defaultChat = mainChat;
		this._mainChatObs = observableValue<IChat>(this, mainChat);
		this._chatsObs = observableValueOpts<readonly IChat[]>({ owner: this, equalsFn: arrayEquals }, [mainChat]);
		this.mainChat = this._mainChatObs;
		this.chats = this._chatsObs;

		this.capabilities = derivedOpts<ISessionCapabilities>({ owner: this, equalsFn: structuralEquals }, reader => {
			const agentCapabilities = this._options.agentCapabilities.read(reader)?.get(this.agentProvider);
			return {
				supportsMultipleChats: !this.isQuickChat.read(reader) && (agentCapabilities?.multipleChats !== undefined),
				supportsFork: agentCapabilities?.multipleChats?.fork ?? false,
				supportsSideChat: agentCapabilities?.multipleChats?.sideChat ?? false,
				supportsRename: true,
				supportsDelete: true,
			};
		});

		// Re-apply the chat catalog when advertised capabilities change (e.g. the
		// agent host's root state arrives after the session's first state update).
		// Without this, a multi-chat session whose state was processed while
		// `supportsMultipleChats` was still `false` would stay collapsed to
		// `[defaultChat]` until the next session-state update.
		this._register(autorun(reader => {
			this.capabilities.read(reader);
			const state = this._lastCatalogState;
			if (state) {
				this._applyChatCatalog(state);
			}
		}));
	}

	/**
	 * Reconcile the per-chat catalog from an AHP {@link SessionState}.
	 *
	 * The default chat (resource == this session's resource) always maps to
	 * {@link _defaultChat}. Additional peer chats become their own {@link IChat}
	 * whose resource carries the chatId in the URI fragment so the chat view
	 * opens a distinct widget that the session handler routes to the matching
	 * chat channel.
	 *
	 * A non-default chat surfaces as a peer tab when the session supports
	 * multiple chats (the `copilotcli` case) OR when it is a subagent
	 * (tool-origin) chat. Subagent chats are always surfaced as read-only peers
	 * — independent of multi-chat support — so the user can review a worker's
	 * transcript (the agent-team pattern). Sessions with no surfaced peers
	 * degrade to `[defaultChat]`.
	 */
	applyChatCatalog(state: SessionState): void {
		this._lastCatalogState = state;
		this._applyChatCatalog(state);
	}

	private _applyChatCatalog(state: SessionState): void {
		// The default chat's catalog title drives its independent tab title.
		// Empty means "inherit the session title"; a non-empty value means it was
		// renamed independently of the session.
		const defaultChatUri = state.defaultChat?.toString();
		const isDefault = (summary: ChatSummary): boolean => defaultChatUri
			? summary.resource.toString() === defaultChatUri
			: isDefaultChatUri(summary.resource);
		const defaultSummary = state.chats.find(isDefault);
		this._defaultChatTitleOverride.set(defaultSummary?.title || undefined, undefined);
		this._defaultChatInteractivity.set(toChatInteractivity(defaultSummary?.interactivity), undefined);

		// Tool-origin subagents and user-created side (`/btw`) chats must reach
		// the peer-chat catalog even when the backing session type is otherwise
		// single-chat; the UI later decides whether to show them by default.
		const surfacesAsPeer = (summary: ChatSummary): boolean =>
			!isDefault(summary)
			&& !!parseChatUri(summary.resource)?.chatId
			&& (this.capabilities.get().supportsMultipleChats
				|| summary.origin?.kind === ProtocolChatOriginKind.Tool
				|| summary.origin?.kind === ProtocolChatOriginKind.SideChat);

		if (!state.chats.some(surfacesAsPeer)) {
			// Single visible chat: the default chat is the session, so let it
			// reflect the aggregated session status directly (clear any override).
			this._defaultChatStatusOverride.set(undefined, undefined);
			if (this._additionalChats.size > 0) {
				this._additionalChats.clearAndDisposeAll();
			}
			if (this._chatsObs.get().length !== 1 || this._chatsObs.get()[0] !== this._defaultChat) {
				transaction(tx => {
					this._chatsObs.set([this._defaultChat], tx);
					this._mainChatObs.set(this._defaultChat, tx);
				});
			}
			return;
		}

		// Multiple chats: the default chat must show its own status, not the
		// session aggregate which may have been promoted by a running peer chat.
		this._defaultChatStatusOverride.set(defaultSummary ? mapProtocolStatus(defaultSummary.status) : undefined, undefined);

		const seen = new Set<string>();
		const ordered: IChat[] = [];
		for (const summary of state.chats) {
			if (isDefault(summary)) {
				ordered.push(this._defaultChat);
				continue;
			}
			if (!surfacesAsPeer(summary)) {
				continue;
			}
			const chatId = parseChatUri(summary.resource)!.chatId;
			seen.add(chatId);
			let entry = this._additionalChats.get(chatId);
			if (!entry) {
				entry = this._createAdditionalChat(chatId, summary);
				this._additionalChats.set(chatId, entry);
			} else {
				entry.update(summary);
			}
			ordered.push(entry.chat);
		}

		for (const chatId of [...this._additionalChats.keys()]) {
			if (!seen.has(chatId)) {
				this._additionalChats.deleteAndDispose(chatId);
			}
		}

		const main = (defaultChatUri && ordered.find(c => isEqual(c.resource, this.resource))) || this._defaultChat;
		transaction(tx => {
			this._chatsObs.set(ordered.length > 0 ? ordered : [this._defaultChat], tx);
			this._mainChatObs.set(main, tx);
		});
	}

	private _createAdditionalChat(chatId: string, summary: ChatSummary): AdditionalChat {
		const resource = URI.from({ scheme: this._resourceScheme, path: `/${this._rawId}`, fragment: chatId });
		const lastTurnChanges = this._sessionOutput.getLastTurnChanges(URI.parse(summary.resource));
		return new AdditionalChat(resource, summary, this._newChatIds.has(chatId), this._resolveParentChatResource(summary.origin), this.isArchived, lastTurnChanges, this._options.readOnly);
	}

	/**
	 * Maps a protocol parent-chat URI (from a Tool/Fork {@link ChatSummary.origin})
	 * to this session's UI chat resource: the default chat maps to the session
	 * resource; peer chats carry their chatId in the resource fragment.
	 */
	private _resolveParentChatResource(origin: ChatSummary['origin']): URI | undefined {
		const parentUri = origin && (
			origin.kind === ProtocolChatOriginKind.Tool
			|| origin.kind === ProtocolChatOriginKind.Fork
			|| origin.kind === ProtocolChatOriginKind.SideChat)
			? origin.chat
			: undefined;
		if (!parentUri) {
			return undefined;
		}
		if (isDefaultChatUri(parentUri)) {
			return this.resource;
		}
		const parentChatId = parseChatUri(parentUri)?.chatId;
		return parentChatId
			? URI.from({ scheme: this._resourceScheme, path: `/${this._rawId}`, fragment: parentChatId })
			: this.resource;
	}

	/** Mark a peer chat new so it shows as `Untitled` until its first request. */
	markChatAsNew(chatId: string): void {
		this._newChatIds.add(chatId);
		this._additionalChats.get(chatId)?.markNew();
	}

	/** Clear the `new` flag after the chat's first request is sent. */
	markChatAsSent(chatId: string): void {
		this._newChatIds.delete(chatId);
		this._additionalChats.get(chatId)?.markSent();
	}

	setChatModelId(chatResource: URI, modelId: string | undefined): void {
		const chatId = chatResource.fragment;
		if (chatId) {
			this._getAdditionalChat(chatResource)?.setModelId(modelId);
		} else {
			this.modelId.set(modelId, undefined);
			this.modelSelection = modelId ? this._toModelSelection(modelId) : undefined;
		}
	}

	setChatAgent(chatResource: URI, agent: ISessionAgentRef | undefined): void {
		const chatId = chatResource.fragment;
		if (chatId) {
			this._getAdditionalChat(chatResource)?.setAgent(agent);
		} else {
			this.mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined, undefined);
			// Remember which working directory the agent URI is rooted at so the
			// selection can be rebased if the session later relocates into a worktree.
			this._agentBaseDir = agent ? this._workingDirectories?.[0] : undefined;
		}
	}

	/**
	 * Reconcile the selected custom-agent URI against the host's current agent
	 * list — e.g. the session graduated with an agent picked in the original repo
	 * but now runs in an isolated worktree, where the host reports the same agent
	 * file under the worktree path.
	 *
	 * The selection is rebased by matching the agent's repo-relative path against
	 * the available agents (which already carry the worktree root) rather than the
	 * session's reported working directory. The working directory is unreliable
	 * here: the worktree-pathed customizations arrive well before either the
	 * `SessionSummary` or `SessionState` working-directory flips to the worktree,
	 * so a working-directory-keyed rebase would miss the window and let the picker
	 * destructively reset the selection. Deriving the worktree root from the agent
	 * list closes that race.
	 *
	 * Mirrors the agent-host backend's code to rebase by relative path.
	 * The re-point is only applied to a URI that actually exists in
	 * the supplied agent list, so it never runs ahead of the host reporting the
	 * worktree agents (which would otherwise re-introduce the mismatch it fixes).
	 */
	reconcileSelectedAgent(agents: readonly AgentCustomization[]): void {
		const current = this.mode.get();
		if (!current || agents.some(a => a.uri === current.id)) {
			return; // no agent selected, or the selection is already valid
		}
		const base = this._agentBaseDir;
		if (!base) {
			return; // unknown root for the current selection — nothing to rebase against
		}
		const agentUri = URI.parse(current.id);
		if (!isEqualOrParent(agentUri, base)) {
			return; // agent lives outside the repo (e.g. a user-global agent)
		}
		const rel = relativePath(base, agentUri);
		if (!rel) {
			return;
		}
		const relocated = this._findRelocatedAgent(agents, agentUri, base, rel);
		if (relocated) {
			this.mode.set({ id: relocated.uri, kind: current.kind }, undefined);
			this._agentBaseDir = relocated.root;
		}
	}

	/**
	 * Finds an available agent that is the same repo-relative file as the current
	 * selection but rooted under a different directory (its worktree twin).
	 *
	 * A candidate matches when its path ends with `/<rel>` on a path-segment
	 * boundary and the implied root (the candidate path minus that suffix) differs
	 * from `base`. The root is re-validated with `relativePath` so only a genuine
	 * relocation of the same file is accepted. Returns the matched agent's URI and
	 * its derived root, or `undefined` when there is no twin.
	 */
	private _findRelocatedAgent(
		agents: readonly AgentCustomization[],
		agentUri: URI,
		base: URI,
		rel: string,
	): { readonly uri: string; readonly root: URI } | undefined {
		const suffix = `/${rel}`;
		for (const agent of agents) {
			const candidate = URI.parse(agent.uri);
			if (candidate.scheme !== agentUri.scheme || candidate.authority !== agentUri.authority) {
				continue;
			}
			if (!candidate.path.endsWith(suffix) || candidate.path.length === suffix.length) {
				continue; // not the same relative file, or it sits at the filesystem root
			}
			const root = candidate.with({ path: candidate.path.slice(0, candidate.path.length - suffix.length) });
			if (isEqual(root, base) || relativePath(root, candidate) !== rel) {
				continue; // same root (would have matched exactly), or not a clean relocation
			}
			return { uri: agent.uri, root };
		}
		return undefined;
	}

	/**
	 * Seed the selected custom agent when a session is resumed (e.g. after a
	 * window reload). A freshly loaded adapter starts with `mode === undefined`;
	 * the host persists the selection on the default chat's `ChatState.draft.agent`,
	 * which the provider reads and mirrors onto `session.mode` here. Guarded to
	 * never override a live selection (a Part 1 graduation seed or a user pick),
	 * keeping this a resume-only hydration.
	 */
	hydrateSelectedAgent(agentUri: string): void {
		if (this.mode.get() !== undefined) {
			return;
		}
		this.setChatAgent(this.resource, { uri: agentUri, name: '' });
	}

	getChatModelId(chatResource: URI): string | undefined {
		return chatResource.fragment
			? this._getAdditionalChat(chatResource)?.chat.modelId.get()
			: this.modelId.get();
	}

	getChatModelSelection(chatResource: URI): ModelSelection | undefined {
		const modelId = this.getChatModelId(chatResource);
		if (modelId) {
			return this._toModelSelection(modelId);
		}
		return chatResource.fragment ? undefined : this.modelSelection;
	}

	getChatMode(chatResource: URI): { readonly id: string; readonly kind: string } | undefined {
		return chatResource.fragment
			? this._getAdditionalChat(chatResource)?.chat.mode.get()
			: this.mode.get();
	}

	/** Optimistically set the default chat tab title (independent of the session title). */
	setDefaultChatTitle(title: string): void {
		this._defaultChatTitleOverride.set(title || undefined, undefined);
	}

	/** Optimistically set an additional peer chat's title ahead of the host's `chatUpdated`. */
	setAdditionalChatTitle(chatId: string, title: string): void {
		this._additionalChats.get(chatId)?.setTitle(title);
	}

	private _toModelSelection(modelId: string): ModelSelection {
		const prefix = `${this._resourceScheme}:`;
		return { id: modelId.startsWith(prefix) ? modelId.substring(prefix.length) : modelId };
	}

	private _getAdditionalChat(chatResource: URI): AdditionalChat | undefined {
		const byFragment = chatResource.fragment ? this._additionalChats.get(chatResource.fragment) : undefined;
		if (byFragment) {
			return byFragment;
		}
		for (const chat of this._additionalChats.values()) {
			if (isEqual(chat.chat.resource, chatResource)) {
				return chat;
			}
		}
		return undefined;
	}

	private _createChangesObs(): IObservable<readonly ISessionFileChange[]> {
		const defaultChangesetObs = derivedOpts<ISessionChangeset | undefined>({
			equalsFn: (c1, c2) => c1?.id === c2?.id
		}, reader => {
			const changesets = this.changesets.read(reader);
			if (!changesets) {
				return undefined;
			}

			return changesets.find(c => c.isDefault.read(reader) === true);
		});

		const defaultChangesetChangesObs = derived(reader => {
			const defaultChangeset = defaultChangesetObs.read(reader);
			if (!defaultChangeset) {
				return [];
			}
			return defaultChangeset.changes.read(reader);
		});

		return derivedOpts({ equalsFn: sessionFileChangesEqual },
			reader => defaultChangesetChangesObs.read(reader) ?? []);
	}

	/**
	 * Update fields from a refreshed metadata snapshot. Returns `true` iff
	 * any user-visible field changed.
	 */
	update(metadata: IAgentSessionMetadata): boolean {
		let didChange = false;

		transaction(tx => {
			const summary = metadata.summary;
			if (summary !== undefined && summary !== this.title.get()) {
				this.title.set(summary, tx);
				didChange = true;
			}

			if (metadata.status !== undefined) {
				const uiStatus = mapProtocolStatus(metadata.status);
				if (uiStatus !== this.status.get()) {
					this.status.set(uiStatus, tx);
					didChange = true;
				}
			}

			const modifiedTime = metadata.modifiedTime;
			if (this.updatedAt.get().getTime() !== modifiedTime) {
				this.updatedAt.set(new Date(modifiedTime), tx);
				didChange = true;
			}

			const currentLastTurnEndTime = this.lastTurnEnd.get()?.getTime();
			const nextLastTurnEndTime = modifiedTime ? modifiedTime : undefined;
			if (currentLastTurnEndTime !== nextLastTurnEndTime) {
				this.lastTurnEnd.set(nextLastTurnEndTime !== undefined ? new Date(nextLastTurnEndTime) : undefined, tx);
				didChange = true;
			}

			this._project = metadata.project;
			this._workingDirectories = metadata.workingDirectories;
			// Only update `_meta` when the source actually provides one — an
			// undefined value means "not included" (e.g. a summary path that
			// omits it), not "cleared". The authoritative git-state `_meta`
			// still flows via `setMeta` from `SessionState` subscriptions.
			//
			// `setMeta` rebuilds the workspace from the project / working
			// directories assigned just above plus the incoming `_meta`, so it
			// fully subsumes the rebuild below — running both would recompute
			// the same workspace twice for every `_meta`-bearing refresh. The
			// fallback is only for snapshots that carry no `_meta`.
			if (metadata._meta !== undefined) {
				if (this.setMeta(metadata._meta, tx)) {
					didChange = true;
				}
			} else {
				const workspace = this._computeWorkspace();
				if (this._setWorkspace(workspace, tx)) {
					didChange = true;
				}
			}

			if (metadata.status !== undefined) {
				const isArchived = isSessionStatusArchived(metadata.status);
				if (isArchived !== this.isArchived.get()) {
					this.isArchived.set(isArchived, tx);
					didChange = true;
				}

				const isRead = isSessionStatusRead(metadata.status);
				if (isRead !== this.isRead.get()) {
					this.isRead.set(isRead, tx);
					didChange = true;
				}
			}

			// `metadata.changes` (aggregate) drives the chip aggregate.
			// The dropdown content is built separately via `createChangesets`.
			if (metadata.changes !== undefined && this.setChangesSummary(metadata.changes, tx)) {
				didChange = true;
			}

			if (this._activity.get() !== metadata.activity) {
				this._activity.set(metadata.activity, tx);
				didChange = true;
			}
		});

		return didChange;
	}

	/**
	 * Sets the activity text from a `SessionSummaryChanged` notification.
	 * Returns `true` iff the activity observable changed. Callers inside a
	 * transaction MUST pass it — see {@link setChangesSummary}.
	 */
	setActivity(activity: string | undefined, tx?: ITransaction): boolean {
		if (this._activity.get() !== activity) {
			this._activity.set(activity, tx);
			return true;
		}

		return false;
	}

	/**
	 * Apply a `_meta` delta (the shared session-state / session-summary bag,
	 * fed from `_applySessionMetaFromState` or a `SessionSummaryChanged`
	 * notification), promote the session kind if the delta reports it
	 * workspace-less, and rebuild the workspace if the git state changed.
	 * Returns `true` iff anything observable changed, so the list regroups a
	 * session that became a quick chat without ever having had a workspace.
	 *
	 * Callers that are already inside a transaction MUST pass it: a plain
	 * `transaction()` here would finish (and therefore notify) mid-way through
	 * the enclosing one, letting observers of `_meta` / `isQuickChat` /
	 * `workspace` read a torn snapshot of the fields the caller has not applied
	 * yet.
	 */
	setMeta(meta: SessionMeta | undefined, tx?: ITransaction): boolean {
		this._meta = meta;
		let didChange = false;
		subtransaction(tx, tx => {
			this._metaObs.set(this._meta, tx);
			didChange = this._promoteToQuickChatIfWorkspaceless(tx);
			const workspace = this._computeWorkspace();
			if (this._setWorkspace(workspace, tx)) {
				didChange = true;
			}
		});
		return didChange;
	}

	refreshWorkspace(): boolean {
		let didChange = false;
		transaction(tx => {
			didChange = this._setWorkspace(this._computeWorkspace(), tx);
		});
		return didChange;
	}

	setIsAutomation(isAutomation: boolean): void {
		this.isAutomation.set(isAutomation, undefined);
	}

	/** Records that this session runs with worktree isolation. See {@link worktreePending}. */
	setWorktreeIsolation(isolated: boolean): void {
		this._worktreeIsolation.set(isolated, undefined);
	}

	/**
	 * Heal an adapter born mis-classified because the path that materialized it
	 * carried no `_meta` (a stale persisted cache, an older host). One-way: an
	 * absent marker means "not included", never "cleared", so a quick chat is
	 * never demoted back into a workspace session rooted at its scratch cwd.
	 */
	private _promoteToQuickChatIfWorkspaceless(tx: ITransaction): boolean {
		if (this._isQuickChat.get() || !readSessionWorkspaceless(this._meta)) {
			return false;
		}
		this._isQuickChat.set(true, tx);
		return true;
	}

	/**
	 * The session's project. Read at persist time so a value assigned after the snapshot was taken
	 * is not lost on the next save.
	 */
	get project(): IAgentSessionMetadata['project'] { return this._project; }

	/**
	 * Assign a project to a session that was materialized without one, recomputing the workspace.
	 * Refuses when the session already has a project.
	 *
	 * Narrower than {@link update}, which also assigns `_workingDirectories` and would clear real
	 * working directories, revert a renamed title, and roll back the modified time.
	 */
	backfillProject(project: IAgentSessionMetadata['project']): boolean {
		if (!project || this._project) {
			return false;
		}
		this._project = project;
		transaction(tx => {
			this._setWorkspace(this._computeWorkspace(), tx);
		});
		// Reports the metadata mutation, not whether the workspace happened to change: the caller
		// announces this to mark the session cache dirty, and a project assigned but never
		// persisted would be lost on reload.
		return true;
	}

	private _setWorkspace(workspace: ISessionWorkspace | undefined, tx: ITransaction): boolean {
		if (agentHostSessionWorkspaceKey(workspace) === agentHostSessionWorkspaceKey(this.workspace.get())) {
			return false;
		}
		this._sessionOutputCache.clear();
		this.workspace.set(workspace, tx);
		return true;
	}

	/**
	 * Resolves the session workspace. Quick chats stay workspace-less
	 * (`undefined`) regardless of any scratch working directory the host
	 * assigned; workspace sessions build from project/git metadata.
	 */
	private _computeWorkspace(): ISessionWorkspace | undefined {
		return this._kind.computeWorkspace(() => this._options.buildWorkspace(this._project, this._workingDirectories, this.gitHubInfo, readSessionGitState(this._meta)));
	}

	updateChangesets(changesetsMetadata: readonly Changeset[] | undefined) {
		if (!changesetsMetadata) {
			return;
		}

		const changesets = createChangesets(this.backendUri, this._options, this.isActiveSessionObs, changesetsMetadata);

		this.changesets.set(changesets, undefined);
	}
}

/**
 * `kind` literal used on `ISession.mode` when the mode slot carries a
 * custom-agent selection. The `mode.id` is then the agent's URI.
 */
export const AGENT_MODE_KIND = 'agent';

function customizationsChanged(previous: SessionState, state: SessionState): boolean {
	if (previous.customizations !== state.customizations) {
		return true;
	}
	const previousActiveCustomizations = flattenActiveClientCustomizations(previous);
	const currentActiveCustomizations = flattenActiveClientCustomizations(state);
	return !arrayEquals(previousActiveCustomizations, currentActiveCustomizations, (a, b) => {
		if (a.nonce !== undefined && a.nonce === b.nonce) {
			return true;
		}
		return a === b;
	});
}

/** Flattens the customizations contributed by every active client of a session. */
function flattenActiveClientCustomizations(state: SessionState): ClientPluginCustomization[] {
	const result: ClientPluginCustomization[] = [];
	for (const client of state.activeClients) {
		if (client.customizations) {
			result.push(...client.customizations);
		}
	}
	return result;
}

// ============================================================================
// NewSession — bundles the in-flight new-session state
// ============================================================================

/**
 * Inputs needed to construct a {@link NewSession}.
 */
interface INewSessionConstructionContext {
	/**
	 * Workspace the session is scoped to, or `undefined` for a **quick chat**
	 * (a workspace-less session not bound to any folder). When `undefined`,
	 * {@link quickChat} must be `true` and the backend session is created with
	 * no `workingDirectory` (the host assigns a throwaway scratch cwd).
	 */
	readonly workspace: ISessionWorkspace | undefined;
	/**
	 * `true` when this is a quick chat (see {@link workspace}). Forwarded to the
	 * agent host on `createSession` so the session is tagged and routed as
	 * workspace-less.
	 */
	readonly quickChat?: boolean;
	readonly sessionType: ISessionType;
	readonly providerId: string;
	readonly icon: ThemeIcon;
	readonly resourceScheme: string;
	/**
	 * The URI scheme used to reconstruct this draft's backend (wire) session URI,
	 * when it differs from the agent provider ({@link sessionType}.id). Defaults to
	 * the agent provider. Cloud sandbox creates sessions under `ahp-session:/<id>`
	 * while the agent provider is `copilot`; the eager backend `createSession`/
	 * subscribe must use this scheme so it matches the handler's create path.
	 */
	readonly backendSessionScheme?: string;
	readonly authenticationPending: IObservable<boolean>;
	readonly logService: ILogService;
	/**
	 * Optional initial config values to seed into the new session before its
	 * first {@link NewSession.resolveConfig} round-trip. Used to forward
	 * `chat.permissions.default` into the agent host's `autoApprove` slot and
	 * `git.branchPrefix` into the `worktreeBranchPrefix` slot so the values are
	 * present from the very first `resolveConfig`/`createSession`.
	 */
	readonly initialConfigValues?: Record<string, unknown>;
	/**
	 * Optional property schemas to seed into the new session's config before its
	 * first {@link NewSession.resolveConfig} round-trip. Carried over from the
	 * provider's cache of well-known chips (isolation/branch) so those chips stay
	 * visible (disabled) while the draft re-resolves, instead of blanking.
	 */
	readonly initialConfigSchema?: Record<string, SessionConfigPropertySchema>;
	readonly initialMetadata?: Record<string, unknown>;
	/**
	 * Instantiation service used to construct the session's changeset
	 * resolvers, so the new-session skeleton surfaces the same changeset
	 * list as the committed session that replaces it.
	 */
	readonly instantiationService: IInstantiationService;
	/**
	 * Forwards `SessionState` snapshots from the eagerly-held wire
	 * subscription back to the provider. `state === undefined` is a
	 * cleanup sentinel emitted by {@link NewSession.dispose} on the
	 * close-without-graduation path so the provider can drop any cached
	 * entry it accumulated for this session. The graduation path skips
	 * this sentinel because the running-session subscription pipeline
	 * takes over ownership of the same `sessionId` key.
	 */
	readonly onSessionState?: (sessionId: string, state: SessionState | undefined) => void;
	readonly activeClientScope?: IAgentCustomizationScope;
}

/**
 * Bundles the at-most-one in-flight "new session" — the session being
 * composed in the new-chat view before the first message is sent.
 *
 * Encapsulates:
 *  - the `ISession` skeleton + its observables (status, modelId, loading)
 *  - the user's selected model (read by `sendRequest`)
 *  - the resolved session config + a stale-request guard
 *  - the eagerly created backend session (URI + subscription) that lets the
 *    chat handler skip its legacy `createSession`-on-first-message round-trip
 *
 * Lifecycle:
 *  - {@link eagerCreate} fires `connection.createSession` then opens a state
 *    subscription. Wire ordering matters — see the comment in the body.
 *  - {@link graduate} releases the subscription without firing
 *    `disposeSession`; called when the session successfully transitions into
 *    a real running session via `sendRequest`.
 *  - {@link Disposable.dispose}/`dispose` releases the subscription **and**
 *    fires `connection.disposeSession`; called when the user abandons the
 *    new session (workspace switch, send failure, etc.).
 */
class NewSession extends Disposable {

	readonly session: ISession;
	readonly sessionId: string;
	readonly agentProvider: string;
	/** This draft's URI as the host's registry would key it. See {@link AgentHostSessionAdapter.backendUri}. */
	private readonly _backendSessionUri: URI;
	readonly workspaceUri: URI | undefined;
	readonly requiresWorkspaceTrust: boolean;
	/** `true` when this is a workspace-less quick chat. */
	readonly isQuickChat: boolean;
	/** Session-kind strategy chosen once at construction (quick chat vs. workspace). */
	private readonly _kind: IAgentHostSessionKind;

	private readonly _status: ISettableObservable<SessionStatus>;
	private readonly _title: ISettableObservable<string>;
	private readonly _modelId: ISettableObservable<string | undefined>;
	private readonly _mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	private readonly _workspace: ISettableObservable<ISessionWorkspace | undefined>;
	private readonly _changesets = observableValue<readonly ISessionChangeset[] | undefined>(this, undefined);
	private readonly _worktreePending = observableValue<boolean>(this, false);
	private readonly _description: ISettableObservable<IMarkdownString | undefined>;
	private readonly _isActiveSessionObs: IObservable<boolean>;
	private readonly _loading: ISettableObservable<boolean>;
	private readonly _mainChat: ISettableObservable<IChat>;
	private _selectedModelId: string | undefined;
	private _selectedAgent: ISessionAgentRef | undefined;

	observeClientCustomAgents(customAgents: IObservable<readonly AgentCustomization[]>, onDidChange: () => void): void {
		let previous = customAgents.get();
		this._register(autorun(reader => {
			const current = customAgents.read(reader);
			if (current === previous) {
				return;
			}
			previous = current;
			onDidChange();
		}));
	}

	getClientCustomAgents(): readonly AgentCustomization[] {
		return this._activeClientScope?.customAgents.get() ?? [];
	}

	/**
	 * Latest resolved config. Replaces what used to live in `_newSessionConfigs`.
	 * `undefined` indicates the most recent {@link resolveConfig} failed and no
	 * cached values are usable.
	 */
	private _config: ResolveSessionConfigResult | undefined = { schema: { type: 'object', properties: {} }, values: {} };
	private _configResolution: Promise<void> | undefined;

	/**
	 * Monotonic counter for in-flight {@link resolveConfig} calls. Each call
	 * increments the counter and only writes its result back if its sequence
	 * is still the latest one. Bumped on dispose so any pending resolve
	 * discards itself.
	 */
	private _configRequestSeq = 0;

	/**
	 * `true` while a `resolveConfig` round-trip is in flight. Distinct from
	 * {@link ISession.loading} which also stays true when required config
	 * values are missing — pickers gate on this so they stay interactive
	 * in that state. Set sync in {@link beginResolveConfigSync} so the
	 * optimistic `onDidChangeSessionConfig` pulse already exposes it.
	 */
	private readonly _isResolvingConfig: ISettableObservable<boolean>;
	private readonly _lifetimeCts = this._register(new CancellationTokenSource());
	private _eagerCreateTask: Promise<void> | undefined;

	/** Backend session URI, set immediately before the eager `createSession` call. */
	private _backendUri: URI | undefined;
	/** Connection used to create the backend session, captured for `disposeSession` on tear-down. */
	private _connection: IAgentConnection | undefined;
	/** Held state subscription. Set after the wire `createSession` resolves. */
	private _subscription: IReference<IAgentSubscription<SessionState>> | undefined;
	/**
	 * `onDidChange` listener for {@link _subscription}. Forwards every
	 * `SessionState` snapshot to the provider via {@link _onSessionState}
	 * so the new session's customizations (and any other state) reach
	 * `_lastSessionStates` while the session is still Untitled. Detached
	 * in {@link graduate} (handoff) and {@link dispose} (close-without-send).
	 */
	private readonly _stateListener = this._register(new MutableDisposable());
	private readonly _onSessionState: ((sessionId: string, state: SessionState | undefined) => void) | undefined;

	private readonly _activeClientScope: IAgentCustomizationScope | undefined;
	private readonly _initialMetadata: Record<string, unknown> | undefined;

	private readonly _logService: ILogService;
	private readonly _providerId: string;

	constructor(
		ctx: INewSessionConstructionContext,
		private readonly _options: IAgentHostAdapterOptions,
		@ISessionsService sessionsService: ISessionsService,
	) {
		super();
		const workspaceUri = ctx.workspace?.folders[0]?.root;
		this._kind = sessionKind(!!ctx.quickChat);
		if (this._kind.requiresWorkspace && !workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}
		this.workspaceUri = workspaceUri;
		this.isQuickChat = this._kind.isQuickChat;
		this.requiresWorkspaceTrust = !!ctx.workspace?.requiresWorkspaceTrust;
		this.agentProvider = ctx.sessionType.id;
		this._providerId = ctx.providerId;
		this._logService = ctx.logService;
		this._onSessionState = ctx.onSessionState;
		this._activeClientScope = ctx.activeClientScope;
		if (this._activeClientScope) {
			this._register(this._activeClientScope);
		}
		this._initialMetadata = ctx.initialMetadata;

		const resource = URI.from({ scheme: ctx.resourceScheme, path: `/${generateUuid()}` });
		this._isActiveSessionObs = derived(this, reader => isEqual(sessionsService.activeSession.read(reader)?.resource, resource));
		// Defaults to scheme == provider; only hosts that address sessions under a different
		// scheme (cloud sandbox: provider `copilot`, scheme `ahp-session`) override it.
		this._backendSessionUri = AgentSession.uri(ctx.backendSessionScheme ?? this.agentProvider, AgentSession.id(resource));
		this._status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		this._title = observableValue<string>(this, '');
		const title = this._title;
		const updatedAt = observableValue(this, new Date());
		this._workspace = observableValue<ISessionWorkspace | undefined>(this, ctx.workspace);
		const changes = observableValueOpts<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
		const checkpoints = observableValue(this, undefined);
		this._selectedModelId = undefined;
		this._selectedAgent = undefined;
		this._modelId = observableValue<string | undefined>(this, this._selectedModelId);
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, undefined);
		this._mode = mode;
		const isArchived = observableValue(this, false);
		const isRead = observableValue(this, true);
		this._description = observableValue<IMarkdownString | undefined>(this, undefined);
		const lastTurnEnd = observableValue<Date | undefined>(this, undefined);
		this._loading = observableValue(this, true);
		this._isResolvingConfig = observableValue(this, false);
		const createdAt = new Date();

		const mainChat: IChat = {
			resource, createdAt, title, updatedAt,
			status: this._status,
			changes,
			checkpoints,
			modelId: this._modelId,
			mode, isArchived, isRead,
			interactivity: constObservable(ChatInteractivity.Full),
			description: this._description, lastTurnEnd,
		};
		this._mainChat = observableValue<IChat>(this, mainChat);
		const authPending = ctx.authenticationPending;
		const loading = this._loading;
		const chats = this._mainChat.map(c => [c]);
		this.session = {
			sessionId: `${ctx.providerId}:${resource.toString()}`,
			resource,
			providerId: ctx.providerId,
			sessionType: ctx.sessionType.id,
			icon: ctx.icon,
			createdAt,
			workspace: this._workspace,
			isQuickChat: constObservable(this._kind.isQuickChat),
			worktreePending: this._worktreePending,
			title,
			updatedAt,
			status: this._status,
			changesets: this._changesets,
			changes,
			modelId: this._modelId,
			mode,
			loading: derived(reader => loading.read(reader) || authPending.read(reader)),
			isArchived,
			isRead,
			description: this._description,
			lastTurnEnd,
			mainChat: this._mainChat,
			chats,
			capabilities: constObservable({ supportsMultipleChats: false, supportsRename: true, supportsDelete: true }),
		};
		this.sessionId = this.session.sessionId;

		if (ctx.initialConfigValues || ctx.initialConfigSchema) {
			this._config = {
				schema: { type: 'object', properties: { ...ctx.initialConfigSchema } },
				values: { ...ctx.initialConfigValues },
			};
		}
		this._syncWorktreePending();
	}

	/** Re-reads the isolation pick from the cached config into {@link _worktreePending}. */
	private _syncWorktreePending(): void {
		this._worktreePending.set(isWorktreeIsolation(this._config?.values), undefined);
	}

	// -- Picker mutations ----------------------------------------------------

	setSelectedModelId(modelId: string): void {
		this._selectedModelId = modelId;
		this._modelId.set(modelId, undefined);
	}

	getSelectedModelId(): string | undefined { return this._selectedModelId; }
	clearSelectedModelId(): void { this._selectedModelId = undefined; }
	/** Untitled skeleton title used until the first request commits the session. */
	get untitledTitle(): string { return this._kind.untitledTitle; }
	setSelectedAgent(agent: ISessionAgentRef | undefined): void {
		this._selectedAgent = agent;
		this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined, undefined);
	}

	getSelectedAgent(): ISessionAgentRef | undefined { return this._selectedAgent; }
	clearSelectedAgent(): void {
		this._selectedAgent = undefined;
		this._mode.set(undefined, undefined);
	}

	setStatus(status: SessionStatus): void { this._status.set(status, undefined); }
	setActivity(activity: string | undefined): void {
		this._description.set(activity ? new MarkdownString().appendText(activity) : undefined, undefined);
	}
	setLoading(loading: boolean): void { this._loading.set(loading, undefined); }
	setTitle(title: string): void { this._title.set(title, undefined); }

	applySessionMeta(meta: SessionMeta | undefined): boolean {
		const workspace = this._workspace.get();
		const primaryFolder = workspace?.folders[0];
		if (!workspace || !primaryFolder) {
			return false;
		}

		const gitState = readSessionGitState(meta);
		const gitHubInfo = toGitHubInfo(meta);
		if (!gitState && !gitHubInfo) {
			return false;
		}

		const currentRepository = primaryFolder.gitRepository ?? {
			uri: primaryFolder.root,
			workTreeUri: undefined,
			baseBranchName: undefined,
			gitHubInfo: constObservable<IGitHubInfo | undefined>(undefined),
		};
		const nextGitHubInfo = gitHubInfo
			?? (gitState?.hasGitHubRemote === false ? undefined : currentRepository.gitHubInfo.get());
		const nextWorkspace: ISessionWorkspace = {
			...workspace,
			folders: [{
				...primaryFolder,
				gitRepository: {
					...currentRepository,
					branchName: gitState?.branchName ?? currentRepository.branchName,
					baseBranchName: gitState?.baseBranchName ?? currentRepository.baseBranchName,
					hasGitHubRemote: gitState?.hasGitHubRemote ?? currentRepository.hasGitHubRemote,
					upstreamBranchName: gitState?.upstreamBranchName ?? currentRepository.upstreamBranchName,
					incomingChanges: gitState?.incomingChanges ?? currentRepository.incomingChanges,
					outgoingChanges: gitState?.outgoingChanges ?? currentRepository.outgoingChanges,
					uncommittedChanges: gitState?.uncommittedChanges ?? currentRepository.uncommittedChanges,
					gitHubInfo: constObservable(nextGitHubInfo),
				},
			}, ...workspace.folders.slice(1)],
		};
		if (sessionWorkspaceEqual(workspace, nextWorkspace)) {
			return false;
		}
		this._workspace.set(nextWorkspace, undefined);
		return true;
	}

	// -- Config --------------------------------------------------------------

	getConfig(): ResolveSessionConfigResult | undefined { return this._config; }
	getConfigValues(): Record<string, unknown> | undefined { return this._config?.values; }

	trackConfigResolution(promise: Promise<void>): Promise<void> {
		this._configResolution = promise;
		void promise.then(
			() => this._clearConfigResolution(promise),
			() => this._clearConfigResolution(promise),
		);
		return promise;
	}

	async waitForConfigResolution(): Promise<void> {
		while (this._configResolution) {
			await raceCancellationError(this._configResolution, this.cancellationToken);
		}
	}

	private _clearConfigResolution(promise: Promise<void>): void {
		if (this._configResolution === promise) {
			this._configResolution = undefined;
		}
	}

	/**
	 * Optimistically merges a single property into the cached config.
	 * Preserves the existing schema so schema-driven pickers don't flash
	 * during the async re-resolve. {@link resolveConfig} replaces both
	 * schema and values when its response lands.
	 */
	setConfigValue(property: string, value: unknown): void {
		const current = this._config;
		this._config = {
			schema: current?.schema ?? { type: 'object', properties: {} },
			values: { ...(current?.values ?? {}), [property]: value },
		};
		this._syncWorktreePending();
	}

	/**
	 * `true` while a {@link resolveConfig} round-trip is in flight. See
	 * {@link _isResolvingConfig} for why this is distinct from {@link ISession.loading}.
	 */
	get isResolvingConfig(): IObservable<boolean> { return this._isResolvingConfig; }
	get cancellationToken(): CancellationToken { return this._lifetimeCts.token; }

	/** Mark a resolve as starting before the optimistic event fires. */
	beginResolveConfigSync(): void {
		this._isResolvingConfig.set(true, undefined);
	}

	/**
	 * Clear the in-flight flag for early-return paths that skip
	 * {@link resolveConfig} (e.g. no connection), where the `finally`
	 * cleanup never runs.
	 */
	endResolveConfigSync(): void {
		this._isResolvingConfig.set(false, undefined);
	}

	/**
	 * Re-resolves the session config against the agent host using the
	 * currently cached values. Ignores its own response if a newer call
	 * superseded it. Returns `true` if the config was applied (i.e. this
	 * call was not stale by the time the response arrived). On failure, the
	 * cached config is cleared so {@link getConfig} returns `undefined`.
	 * @param strict Rethrow the latest resolution error instead of treating the refresh as best effort.
	 */
	async resolveConfig(connection: IAgentConnection, strict = false): Promise<boolean> {
		const seq = ++this._configRequestSeq;
		this._isResolvingConfig.set(true, undefined);
		try {
			const result = await connection.resolveSessionConfig({
				provider: this.agentProvider,
				workingDirectory: this.workspaceUri,
				config: this._config?.values,
			});
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = result;
			this._syncWorktreePending();
			return true;
		} catch (error) {
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = undefined;
			this._syncWorktreePending();
			if (strict) {
				throw error;
			}
			return true;
		} finally {
			// Only the latest request owns the flag.
			if (seq === this._configRequestSeq) {
				this._isResolvingConfig.set(false, undefined);
			}
		}
	}

	getConfigCompletions(connection: IAgentConnection, property: string, query: string | undefined) {
		return connection.sessionConfigCompletions({
			provider: this.agentProvider,
			workingDirectory: this.workspaceUri,
			config: this._config?.values,
			property,
			query,
		});
	}

	// -- Backend session lifecycle -------------------------------------------

	/**
	 * Eagerly create the session on the agent host so the chat handler can
	 * skip its legacy `createSession`-on-first-message round-trip.
	 *
	 * Wire ordering matters: we must `createSession` *before* opening the
	 * subscription. Subscribing first would race the wire send — the server
	 * receives the `subscribe` before the `createSession` and rejects it as
	 * `AHP_SESSION_NOT_FOUND`, leaving the client subscription in an
	 * unrecoverable error state. The session handler would then fall back
	 * to its legacy create-and-subscribe path on the user's first send,
	 * issuing a duplicate `createSession`.
	 *
	 * If the user switches workspaces or graduates this session before the
	 * `createSession` round-trip completes, this object will have been
	 * disposed (and `_backendUri` cleared) — the bail-out check below skips
	 * opening a stale subscription.
	 *
	 * Failures are non-fatal: the legacy first-message path in
	 * `AgentHostSessionHandler._invokeAgent` re-issues `createSession` if
	 * no session state exists at send time.
	 */
	eagerCreate(connection: IAgentConnection, canCreate?: () => Promise<boolean>): void {
		const backendUri = this._backendSessionUri;
		if (this._eagerCreateTask || this._backendUri?.toString() === backendUri.toString() || this._subscription) {
			return;
		}

		this._eagerCreateTask = (async () => {
			if (canCreate) {
				try {
					if (!await canCreate()) {
						return;
					}
				} catch (error) {
					this._logService.warn(`[${this._providerId}] Eager createSession precondition failed for ${backendUri.toString()}: ${error}`);
					return;
				}
			}
			if (this.cancellationToken.isCancellationRequested) {
				return;
			}

			this._backendUri = backendUri;
			this._connection = connection;

			try {
				await this._activeClientScope?.whenResolved();
				if (this._backendUri?.toString() !== backendUri.toString()) {
					return;
				}
				const activeClient = this._activeClientScope?.activeClient(connection.clientId).get();
				await connection.createSession({
					provider: this.agentProvider,
					session: backendUri,
					workingDirectories: this.workspaceUri ? [this.workspaceUri] : undefined,
					config: this._config?.values,
					_meta: this._initialMetadata,
					// MCP-style opt-in: offer to receive `progress` for any
					// long-running bring-up (chiefly the lazy first-use SDK
					// download, which fires later at first-message
					// materialization). The host echoes this token on each
					// `progress` frame so `_handleProgress` can correlate it.
					progressToken: generateUuid(),
					...(this._selectedAgent ? { agent: { uri: this._selectedAgent.uri } } : {}),
					...(activeClient ? { activeClient } : {}),
				});
			} catch (err) {
				this._logService.warn(`[${this._providerId}] Eager createSession failed for ${backendUri.toString()}: ${err}`);
				// Clear backend bookkeeping so a later `dispose()` doesn't
				// fire `disposeSession` for a session the agent host never
				// created. Only do this if we're still the current attempt
				// (the caller may have already overwritten these fields by
				// disposing this NewSession and constructing a new one).
				if (this._backendUri?.toString() === backendUri.toString()) {
					this._backendUri = undefined;
					this._connection = undefined;
				}
				return;
			}

			// Bail if the user switched workspaces, graduated this session,
			// or otherwise disposed it while the round-trip was in flight.
			if (this._backendUri?.toString() !== backendUri.toString()) {
				return;
			}

			// Hold a state subscription for our lifetime so the agent host's
			// empty-session GC sees a non-zero subscriber count. The session
			// handler refcounts the same subscription via `getSubscription`
			// when chat content opens, so when we release this ref on
			// graduation the wire-level refcount stays positive.
			const ref = connection.getSubscription(StateComponents.Session, backendUri, 'BaseAgentHostSessionsProvider.session');
			this._subscription = ref;

			// Forward `SessionState` updates back to the provider so
			// `_lastSessionStates` (and therefore `getCustomAgents`) becomes
			// populated for this still-Untitled session. Seed once from the
			// cached value, then attach a listener for subsequent deltas.
			const onSessionState = this._onSessionState;
			if (onSessionState) {
				const initial = ref.object.value;
				if (initial && !(initial instanceof Error)) {
					this.updateChangesets(initial.changesets);
					onSessionState(this.sessionId, initial);
				}
				this._stateListener.value = ref.object.onDidChange(state => {
					this.updateChangesets(state.changesets);
					onSessionState(this.sessionId, state);
				});
			}
		})();
	}

	async waitForEagerCreate(): Promise<void> {
		if (this._eagerCreateTask) {
			await raceCancellationError(this._eagerCreateTask, this.cancellationToken);
		}
	}

	private updateChangesets(changesetsMetadata: readonly Changeset[] | undefined) {
		if (!changesetsMetadata) {
			return;
		}

		const changesets = createChangesets(this._backendSessionUri, this._options, this._isActiveSessionObs, changesetsMetadata);

		this._changesets.set(changesets, undefined);
	}

	/**
	 * Release the backend subscription without firing `disposeSession`.
	 * Used on the success path in `sendRequest` when the session has
	 * graduated into a real running session.
	 */
	graduate(): void {
		this._lifetimeCts.cancel();
		// Detach the new-session listener BEFORE releasing the subscription.
		// Both code paths (this one and the running-session pipeline) write
		// `_lastSessionStates` under the same `sessionId` key, so detaching
		// here hands ownership cleanly to `_ensureSessionStateSubscription`
		// without a transient empty-read window or a duplicate writer.
		this._stateListener.clear();
		this._subscription?.dispose();
		this._subscription = undefined;
		this._backendUri = undefined;
		this._connection = undefined;
		this._configRequestSeq++;
	}

	override dispose(): void {
		this._lifetimeCts.cancel();
		// Bump the seq so any in-flight resolveConfig discards itself.
		this._configRequestSeq++;

		// Detach the state listener BEFORE firing the cleanup sentinel so
		// a racing `onDidChange` cannot re-populate `_lastSessionStates`
		// after we have asked the provider to delete the entry. Then fire
		// the sentinel so the provider drops the cached snapshot. Only
		// fires when a listener was actually wired (i.e. `eagerCreate`
		// reached the post-`createSession` branch).
		const hadListener = !!this._stateListener.value;
		this._stateListener.clear();
		if (hadListener) {
			this._onSessionState?.(this.sessionId, undefined);
		}

		this._subscription?.dispose();
		this._subscription = undefined;

		const oldUri = this._backendUri;
		const connection = this._connection;
		this._backendUri = undefined;
		this._connection = undefined;
		if (oldUri && connection) {
			connection.disposeSession(oldUri).catch(err => {
				this._logService.warn(`[${this._providerId}] Failed to dispose eager backend session ${oldUri.toString()}: ${err}`);
			});
		}
		super.dispose();
	}
}

// ============================================================================
// BaseAgentHostSessionsProvider — shared base for local and remote providers
// ============================================================================

/**
 * Shared base class for the local and remote agent host sessions providers.
 *
 * Owns the structures and flows that are identical between the two:
 * the session cache, the new-session/running-session config picker state,
 * the lazy session-state subscriptions, the AHP notification/action
 * handlers, and every connection-routed method (set/get/archive/delete/
 * rename/setModel/sendRequest).
 *
 * Subclasses supply the genuine variation points: the connection
 * accessor, the authentication-pending observable, an adapter factory,
 * URI-scheme mapping for session metadata, the agent-provider lookup, and
 * the browse UI.
 */
export abstract class BaseAgentHostSessionsProvider extends Disposable implements IAgentHostSessionsProvider {

	abstract readonly id: string;
	abstract readonly label: string;
	abstract readonly icon: ThemeIcon;
	abstract readonly browseActions: readonly ISessionWorkspaceBrowseAction[];

	get order(): number { return 0; }

	get sessionTypes(): readonly ISessionType[] { return this._sessionTypes; }
	protected _sessionTypes: ISessionType[] = [];

	private _lastAgents: readonly AgentInfo[] | undefined;
	private readonly _agentCapabilities = observableValue<ReadonlyMap<string, AgentCapabilities | undefined> | undefined>(this, undefined);

	protected readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	protected readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions: Event<ISessionChangeEvent> = this._onDidChangeSessions.event;

	protected readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	protected readonly _onDidChangeSessionConfig = this._register(new Emitter<string>());
	readonly onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;

	protected readonly _onDidChangeRootConfig = this._register(new Emitter<void>());
	readonly onDidChangeRootConfig = this._onDidChangeRootConfig.event;

	protected readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;

	protected readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomizations = this._onDidChangeCustomizations.event;
	/** Last-known root config state (schema + values), seeded from `RootState.config`. */
	protected _rootConfig: RootConfigState | undefined;

	/**
	 * Last-known session state per session ID, seeded from
	 * {@link _applySessionStateUpdate}. Holds the snapshot used to extract
	 * `customizations` and `activeClient.customizations` for the picker.
	 */
	protected readonly _lastSessionStates = new Map<string, SessionState>();

	/** Cache of adapted sessions, keyed by raw session ID. */
	protected readonly _sessionCache = new Map<string, AgentHostSessionAdapter>();

	protected _refreshSessionWorkspaces(): void {
		const changed = [...this._sessionCache.values()].filter(session => session.refreshWorkspace());
		if (changed.length > 0) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed });
		}
	}

	/**
	 * Storage key under which {@link _sessionCache} snapshots are persisted, or
	 * `undefined` while persistence is disabled. Set via
	 * {@link _enableSessionCachePersistence}, which subclasses call once their
	 * identity fields are ready. When `undefined`, the cache is in-memory only.
	 */
	private _sessionCacheStorageKey: string | undefined;

	/**
	 * Snapshot of the source metadata for each adapter in {@link _sessionCache},
	 * keyed by raw session ID. Captured in {@link createAdapter}/{@link updateAdapter}
	 * and re-used by {@link _persistCache} to serialize sessions without having to
	 * reconstruct every `IAgentSessionMetadata` field from observables.
	 */
	private readonly _metaByRawId = new Map<string, IAgentSessionMetadata>();

	/**
	 * Set when {@link _sessionCache} has changed since the last persist. The
	 * actual write happens on the next `onWillSaveState` signal from
	 * {@link IStorageService} so that bursts of notifications do not repeatedly
	 * re-serialize the whole cache.
	 */
	private _cacheDirty = false;

	/**
	 * Renders the agent host's lazy, first-use SDK download as a notification
	 * progress bar. Shared with the editor window so both surfaces render
	 * download progress identically. Fed by the `NotificationType.Progress`
	 * frames received in {@link _attachConnectionListeners}.
	 */
	private readonly _downloadProgress: AgentHostDownloadProgress;

	/**
	 * Temporary session that has been sent (first turn dispatched) but not yet
	 * committed by the backend session list. Shown in the session list until the
	 * server reports the backend session, at which point it is replaced via
	 * {@link _onDidReplaceSession}.
	 */
	protected _pendingSession: ISession | undefined;

	/**
	 * Raw ids of backend sessions that an in-flight {@link _waitForNewSession}
	 * has already matched to its send, so a *concurrent* new-session send of
	 * the same scheme does not resolve to the same committed session. Each
	 * matched id is released by the owning send in its `finally`.
	 */
	private readonly _committingSessionRawIds = new Set<string>();

	/**
	 * Own raw ids ({@link chatResource} path) of currently in-flight
	 * new-session sends. A send's committed backend session keeps the eager
	 * id it was created with, so {@link _waitForNewSession} matches a send to
	 * its OWN id first. The novelty fallback (for flows where the backend
	 * assigns a different id) must then never latch onto *another* in-flight
	 * send's own session — otherwise two concurrent same-scheme sends racing
	 * in a shared download/materialize window would swap sessions (each
	 * graduating onto the other's committed session). Populated at send start,
	 * cleared in the send's `finally`.
	 */
	private readonly _inFlightNewSessionOwnIds = new Set<string>();

	/**
	 * In-flight new sessions — sessions being composed in the new-chat view
	 * before their first message is sent, keyed by `sessionId`. See
	 * {@link NewSession} for the encapsulated state and lifecycle.
	 *
	 * Held as a {@link DisposableMap} so multiple new sessions can be tracked
	 * concurrently (e.g. while one is sending in the background and the composer
	 * re-seeds a fresh one). Entries are disposed individually when sent
	 * ({@link deleteAndDispose}/{@link deleteAndLeak}) or abandoned (via
	 * {@link deleteNewSession}), and all remaining entries are cleaned up when
	 * the provider itself is disposed.
	 */
	private readonly _newSessions = this._register(new DisposableMap<string, NewSession>());

	/** The in-flight new session with the given id, if any. */
	protected _getNewSession(sessionId: string): NewSession | undefined {
		return this._newSessions.get(sessionId);
	}

	/**
	 * Dispose every in-flight new session, firing each one's `disposeSession`
	 * sentinel so the eagerly-created backend records are freed. Used when the
	 * connection drops and the composed-but-unsent drafts can no longer commit.
	 */
	protected _disposeAllNewSessions(): void {
		this._newSessions.clearAndDisposeAll();
	}

	deleteNewSession(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	/** Full resolved config (schema + values) for running sessions, keyed by session ID. */
	protected readonly _runningSessionConfigs = new Map<string, ResolveSessionConfigResult>();
	private readonly _runningSessionConfigResolveSeq = new Map<string, number>();

	/**
	 * Last authoritatively-resolved schemas for {@link SEEDED_CONFIG_SCHEMA_KEYS},
	 * seeded into new drafts so their chips survive a workspace/agent switch. Lives
	 * on the provider (not the picker) so it outlives toolbar item reconstruction.
	 */
	private readonly _cachedConfigSchemas = new Map<string, SessionConfigPropertySchema>();

	/**
	 * Lazy session-state subscriptions used to seed {@link _runningSessionConfigs}
	 * for sessions that already exist on the agent host (e.g. created in a prior
	 * window). The underlying wire subscription is reference-counted by
	 * {@link IAgentConnection.getSubscription}, so when the session handler is
	 * also subscribed (i.e. chat content is loaded) no extra wire subscribe is
	 * issued. Each entry is released after
	 * {@link SESSION_STATE_SUBSCRIPTION_IDLE_MS} of no calls into the keep-alive
	 * helper, so the server-side refcount can drop and any idle restored session
	 * state can be evicted on the agent host. Keyed by session ID.
	 */
	protected readonly _sessionStateSubscriptions = this._register(new DisposableMap<string, DisposableStore>());

	/**
	 * Idle-release timers paired with {@link _sessionStateSubscriptions}. Each
	 * call to {@link _keepSessionStateAlive} resets the timer for `sessionId`;
	 * when the timer fires, the subscription is disposed and the wire
	 * `unsubscribe` flows through {@link IAgentConnection.getSubscription}'s
	 * refcount to the agent host.
	 */
	private readonly _sessionStateIdleTimers = this._register(new DisposableMap<string, IDisposable>());

	/**
	 * Session ids whose views are currently visible in the Agents window. Their
	 * state subscription is pinned open (no idle release) so host-driven catalog
	 * changes the user did not initiate — most importantly spawned subagent chats
	 * ({@link ChatOriginKind.Tool}) — keep flowing into `cached.chats` while the
	 * session is on screen. Without this, the idle timer (only refreshed by
	 * client-initiated actions/queries) can release the state listener mid-view,
	 * so a subagent's `chatAdded` is dropped and its inline "Open Subagent" pill
	 * cannot resolve until the session is re-subscribed (e.g. switched away and
	 * back). Driven by {@link _syncVisibleSessionStatePins}.
	 */
	private readonly _pinnedSessionStates = new Set<string>();

	protected _cacheInitialized = false;

	private static readonly SESSION_REFRESH_RETRY_MIN_MS = 1_000;
	private static readonly SESSION_REFRESH_RETRY_MAX_MS = 30_000;

	/**
	 * Backoff timer that retries {@link _refreshSessions} after a failed
	 * attempt. A failed initial list (e.g. the agent threw
	 * `AHP_AUTH_REQUIRED` because its token wasn't yet effective server-side,
	 * or a transient offline/network error) must not leave the session list
	 * permanently empty. The timer is armed only on failure and cancelled on
	 * the next successful refresh.
	 */
	private readonly _sessionRefreshRetry = this._register(new MutableDisposable());

	/** Current backoff delay (ms) for the session-refresh retry. */
	private _sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;

	/** True while a {@link _refreshSessions} call is awaiting `listSessions()`. */
	private _sessionRefreshInFlight = false;

	private readonly _activeSessionScope = this._register(new MutableDisposable<IAgentCustomizationScope>());
	private readonly _activeClientSyncCancellation = this._register(new MutableDisposable<ActiveClientSyncCancellationTokenSource>());
	private _activeSessionScopeSessionType: string | undefined;
	private _activeSessionScopeRoots: readonly URI[] | undefined;

	constructor(
		@IChatSessionsService protected readonly _chatSessionsService: IChatSessionsService,
		@IChatService protected readonly _chatService: IChatService,
		@IChatWidgetService protected readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService protected readonly _languageModelsService: ILanguageModelsService,
		@IConfigurationService protected readonly _baseConfigurationService: IConfigurationService,
		@ILogService protected readonly _logService: ILogService,
		@IGitHubService protected readonly _gitHubService: IGitHubService,
		@IInstantiationService protected readonly _instantiationService: IInstantiationService,
		@ISessionsService protected readonly _sessionsService: ISessionsService,
		@IAgentHostActiveClientService protected readonly _activeClientService: IAgentHostActiveClientService,
		@IStorageService protected readonly _storageService: IStorageService,
		@IDialogService protected readonly _dialogService: IDialogService,
		@IWorkspaceTrustManagementService protected readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
		super();
		this._downloadProgress = this._register(this._instantiationService.createInstance(AgentHostDownloadProgress));
		this._register(toDisposable(() => {
			for (const cached of this._sessionCache.values()) {
				cached.dispose();
			}
			this._sessionCache.clear();
		}));

		// Keep the state subscription of every on-screen session pinned so
		// host-spawned catalog changes (e.g. subagents) reach `cached.chats`
		// live, instead of relying on the idle timer that only client actions
		// refresh.
		this._register(autorun(reader => this._syncVisibleSessionStatePins(reader)));
		this._register(autorun(reader => {
			this._sessionsService.activeSession.read(reader);
			this._syncActiveClient();
		}));

		// Session-cache persistence. These listeners are inert until a subclass
		// opts in via `_enableSessionCachePersistence` (which sets the storage
		// key). They are safe to register unconditionally because they only act
		// at event time and read the key lazily.
		this._register(this._onDidChangeSessions.event(e => {
			if (!this._shouldTrackSessionCacheChanges()) {
				return;
			}
			if (e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0) {
				this._cacheDirty = true;
			}
			for (const removed of e.removed) {
				const rawId = this._rawIdFromChatId(removed.sessionId);
				if (rawId) {
					this._metaByRawId.delete(rawId);
				}
			}
		}));
		this._register(this._storageService.onWillSaveState(() => {
			if (this._sessionCacheStorageKey && this._cacheDirty) {
				this._persistCache();
				this._cacheDirty = false;
			}
		}));
	}

	// -- Subclass hooks -------------------------------------------------------

	/** Current connection (always present for local; may be undefined while disconnected for remote). */
	protected abstract get connection(): IAgentConnection | undefined;

	/** Provider-level authentication-pending observable used to derive `loading` for sessions. */
	protected abstract get authenticationPending(): IObservable<boolean>;

	/**
	 * Subclass-specific portion of the adapter options. Base fills in
	 * the bits that are uniform across hosts (`icon`, `loading`,
	 * `mapDiffUri`) from the corresponding hooks.
	 */
	protected abstract _adapterOptions(): Pick<IAgentHostAdapterOptions, 'buildWorkspace' | 'readOnly'>;

	/**
	 * Hook to normalize a session's metadata before it is cached, keyed, or
	 * persisted. The default is identity. Subclasses override this when the host
	 * addresses sessions under a scheme that differs from the agent provider
	 * (e.g. a cloud sandbox host that lists sessions as `ahp-session:/<id>` while
	 * its agent provider is `copilot`), so that routing, persistence, and content
	 * resolution all agree on a single scheme. Must preserve the raw session id
	 * (URI path) so cache keys remain stable.
	 */
	protected _adoptSessionMeta(meta: IAgentSessionMetadata): IAgentSessionMetadata {
		return meta;
	}

	/**
	 * The backend (wire) session URI scheme for a given agent provider. Default is
	 * identity (scheme == provider), which holds for every host except the Copilot
	 * host used by cloud sandbox, whose sessions are addressed under
	 * `ahp-session:/<id>` while the agent provider is `copilot`. Subclasses
	 * override this so all backend `AgentSession.uri(...)` reconstructions on the
	 * adapter and provider use the host's real scheme. Must be a stable per-provider
	 * mapping.
	 */
	protected _backendSessionScheme(agentProvider: string): string {
		return agentProvider;
	}

	/** Build an adapter for the given metadata. */
	protected createAdapter(meta: IAgentSessionMetadata): AgentHostSessionAdapter {
		const provider = AgentSession.provider(meta.session);
		if (!provider) {
			throw new Error(`Agent session URI has no provider scheme: ${meta.session.toString()}`);
		}
		const resourceScheme = this.resourceSchemeForProvider(provider);

		const options = {
			icon: this.iconForAgentProvider(provider) ?? this.icon,
			loading: this.authenticationPending,
			mapDiffUri: this._diffUriMapper(),
			gitHubService: this._gitHubService,
			instantiationService: this._instantiationService,
			getConnection: () => this.connection,
			agentCapabilities: this._agentCapabilities,
			backendSessionScheme: this._backendSessionScheme(provider),
			...this._adapterOptions(),
		} satisfies IAgentHostAdapterOptions;

		this._metaByRawId.set(AgentSession.id(meta.session), meta);
		return this._instantiationService.createInstance(AgentHostSessionAdapter, meta, this.id, resourceScheme, provider, options);
	}

	protected updateAdapter(adapter: AgentHostSessionAdapter, meta: IAgentSessionMetadata): boolean {
		this._metaByRawId.set(AgentSession.id(meta.session), meta);
		this._cacheDirty = true;
		return adapter.update(meta);
	}

	/**
	 * Computes the URI resource scheme used to route session URIs to this
	 * provider's content provider for a given agent provider name. Local
	 * uses `agent-host-${provider}`; remote uses a per-connection scheme.
	 *
	 * The resource scheme is host-specific and exists purely for content
	 * provider routing. The logical {@link ISession.sessionType} is the
	 * agent provider name itself, so the same agent (e.g. `copilotcli`)
	 * appears under one shared session type across hosts.
	 */
	protected abstract resourceSchemeForProvider(provider: string): string;

	/** Format the human-readable label for a session type entry (e.g. `Copilot`). */
	protected abstract _formatSessionTypeLabel(agentLabel: string): string;

	/**
	 * Whether `provider` should be advertised as a session type by this host.
	 * Defaults to `true` (advertise everything the host reports). The local
	 * provider overrides this to suppress the agent host's Claude when the
	 * window prefers the extension-host Claude, mirroring the gate
	 * {@link AgentHostContribution} applies to the chat session contribution so
	 * the welcome picker doesn't list Claude twice.
	 */
	protected _shouldAdvertiseAgent(_provider: string): boolean {
		return true;
	}

	protected _syncRootState(rootState: RootState | Error | undefined): void {
		if (rootState && !(rootState instanceof Error)) {
			this._syncSessionTypesFromRootState(rootState);
			this._syncRootConfigFromRootState(rootState);
			return;
		}

		this._syncAgentCapabilities(undefined);
		if (this._sessionTypes.length > 0) {
			this._sessionTypes = [];
			this._onDidChangeSessionTypes.fire();
		}
		if (this._rootConfig) {
			this._rootConfig = undefined;
			this._onDidChangeRootConfig.fire();
		}
	}

	private _syncAgentCapabilities(agents: readonly AgentInfo[] | undefined): void {
		if (this._lastAgents === agents) {
			return;
		}

		this._lastAgents = agents;
		this._agentCapabilities.set(agents ? new Map(agents.map(agent => [agent.provider, agent.capabilities])) : undefined, undefined);
		this._onDidChangeCustomAgents.fire();
		this._onDidChangeCustomizations.fire();
	}

	/**
	 * Reconcile {@link _sessionTypes} against the agents advertised by the
	 * host's root state, firing {@link onDidChangeSessionTypes} only if the
	 * id/label set actually changed.
	 */
	protected _syncSessionTypesFromRootState(rootState: RootState): void {
		this._syncAgentCapabilities(rootState.agents);
		const next = rootState.agents
			.filter(agent => this._shouldAdvertiseAgent(agent.provider))
			.map((agent): ISessionType => ({
				id: agent.provider,
				supportsWorktreeConfiguration: agent.provider === CopilotCLISessionType.id,
				authRequirement: resolveAgentAuthRequirement(agent),
				// The chat session contribution and language models for an agent-host
				// agent are registered under its resource scheme (`agent-host-<provider>`),
				// not the bare provider id, so carry it for availability lookups.
				chatSessionType: this.resourceSchemeForProvider(agent.provider),
				label: this._formatSessionTypeLabel(agent.displayName?.trim() || agent.provider),
				icon: this.iconForAgentProvider(agent.provider) ?? this.icon,
			}));

		const prev = this._sessionTypes;
		if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id && t.label === next[i].label && t.authRequirement === next[i].authRequirement)) {
			return;
		}
		this._sessionTypes = next;
		this._onDidChangeSessionTypes.fire();
	}

	/**
	 * Returns the {@link ThemeIcon} associated with a known agent provider, or
	 * `undefined` when the provider is not recognised.
	 */
	private iconForAgentProvider(provider: string): ThemeIcon | undefined {
		if (provider === CopilotCLISessionType.id) {
			return CopilotCLISessionType.icon;
		}

		if (provider.includes('claude')) {
			return Codicon.claude;
		}

		if (provider === 'openai' || provider.includes('codex')) {
			return Codicon.openai;
		}

		return undefined;
	}

	/**
	 * Reconcile {@link _rootConfig} against {@link RootState.config}, firing
	 * {@link onDidChangeRootConfig} only when schema or values actually change.
	 */
	protected _syncRootConfigFromRootState(rootState: RootState): void {
		const next = rootState.config;
		const prev = this._rootConfig;
		if (prev === next) {
			return;
		}
		if (!next) {
			this._rootConfig = undefined;
			this._onDidChangeRootConfig.fire();
			return;
		}
		if (prev?.schema === next.schema && equals(prev.values, next.values)) {
			return;
		}
		this._rootConfig = next;
		this._onDidChangeRootConfig.fire();
	}

	abstract resolveWorkspace(repositoryUri: URI): ISessionWorkspace | undefined;

	/** Optional event fired when the underlying connection is lost; used to short-circuit `_waitForNewSession`. */
	protected get onConnectionLost(): Event<void> { return Event.None; }

	/** Maps a working-directory URI from the session summary to a local URI. Default identity; remote overrides to `toAgentHostUri`. */
	protected mapWorkingDirectoryUri(uri: URI): URI { return uri; }

	/** Maps a project URI from the session summary to a local URI. Default identity; remote overrides for `file:` paths. */
	protected mapProjectUri(uri: URI): URI { return uri; }

	// -- Session listing ------------------------------------------------------

	getSessionTypes(_repositoryUri: URI): ISessionType[] {
		return [...this.sessionTypes];
	}

	private _syncActiveClient(): void {
		const cancellation = new ActiveClientSyncCancellationTokenSource();
		this._activeClientSyncCancellation.value = cancellation;
		const activeSession = this._sessionsService.activeSession.get();
		if (!activeSession || activeSession.providerId !== this.id) {
			this._clearActiveSessionScope();
			return;
		}

		const rawId = this._rawIdFromChatId(activeSession.sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!rawId || !cached || !connection) {
			this._clearActiveSessionScope();
			return;
		}

		const sessionType = this.resourceSchemeForProvider(cached.agentProvider);
		let scope = this._activeSessionScope.value;
		if (!scope || this._activeSessionScopeSessionType !== sessionType || !areCustomizationScopeRootsEqual(this._activeSessionScopeRoots, cached.workingDirectories)) {
			scope = this._activeClientService.acquireScope(sessionType, cached.workingDirectories);
			this._activeSessionScope.value = scope;
			this._activeSessionScopeSessionType = scope ? sessionType : undefined;
			this._activeSessionScopeRoots = scope ? [...cached.workingDirectories] : undefined;
		}
		if (!scope) {
			return;
		}

		void this._dispatchActiveClientWhenResolved(cancellation.token, activeSession.sessionId, rawId, cached, connection, scope);
	}

	private async _dispatchActiveClientWhenResolved(
		token: CancellationToken,
		activeSessionId: string,
		rawId: string,
		cached: AgentHostSessionAdapter,
		connection: IAgentConnection,
		scope: IAgentCustomizationScope,
	): Promise<void> {
		await raceCancellation(scope.whenResolved(), token);
		const activeSession = this._sessionsService.activeSession.get();
		if (
			token.isCancellationRequested ||
			scope !== this._activeSessionScope.value ||
			this.connection !== connection ||
			this._sessionCache.get(rawId) !== cached ||
			activeSession?.providerId !== this.id ||
			activeSession.sessionId !== activeSessionId
		) {
			return;
		}

		const activeClient = scope.activeClient(connection.clientId).get();
		const existing = this._lastSessionStates.get(cached.sessionId)?.activeClients.find(client => client.clientId === activeClient.clientId);
		if (equals(existing, activeClient)) {
			return;
		}

		connection.dispatch(AgentSession.uri(cached.agentProvider, rawId).toString(), {
			type: ActionType.SessionActiveClientSet,
			activeClient,
		});
	}

	private _clearActiveSessionScope(): void {
		this._activeClientSyncCancellation.clear();
		this._activeSessionScope.clear();
		this._activeSessionScopeSessionType = undefined;
		this._activeSessionScopeRoots = undefined;
	}

	getSessions(): ISession[] {
		this._ensureSessionCache();
		// Filter at read time (rather than evicting from the cache) so a gate
		// flip is instant in both directions: hidden sessions stay cached and
		// reappear immediately when the preference flips back. The default gate
		// admits everything; only the local provider suppresses the agent host's
		// Claude when the window prefers the extension-host Claude.
		//
		// Both `agentProvider` (cached) and `sessionType` (pending) carry the
		// bare provider name (e.g. `claude`), which is what the gate expects —
		// NOT the `agent-host-<provider>` resource scheme from
		// `resourceSchemeForProvider`. Keep it that way.
		//
		// Subclasses whose `_shouldAdvertiseAgent` can change at runtime MUST
		// fire `onDidChangeSessions` when it does, so consumers re-query and
		// re-filter (see the local provider's `preferAgentHost` listener).
		const pendingSession = this._pendingSession;
		const sessions: ISession[] = [];
		for (const cached of this._sessionCache.values()) {
			if (pendingSession && isEqual(cached.resource, pendingSession.resource)) {
				continue;
			}
			if (this._shouldAdvertiseAgent(cached.agentProvider)) {
				sessions.push(cached);
			}
		}
		if (pendingSession && this._shouldAdvertiseAgent(pendingSession.sessionType)) {
			sessions.push(pendingSession);
		}
		return sessions;
	}

	getSessionByResource(resource: URI): ISession | undefined {
		for (const newSession of this._newSessions.values()) {
			if (newSession.session.resource.toString() === resource.toString()) {
				return newSession.session;
			}
		}

		if (this._pendingSession?.resource.toString() === resource.toString()) {
			return this._pendingSession;
		}

		this._ensureSessionCache();
		for (const cached of this._sessionCache.values()) {
			if (cached.resource.toString() === resource.toString()) {
				// Opening a session: subscribe to its AHP state so that
				// `_meta` (e.g. lazy git state computed by the agent host)
				// flows into the cached adapter. The keep-alive helper resets
				// an idle timer so the subscription is dropped once the session
				// is no longer being touched, allowing the agent host to evict
				// idle restored state.
				this._keepSessionStateAlive(cached.sessionId);
				return cached;
			}
		}

		return undefined;
	}

	// -- Session lifecycle ----------------------------------------------------

	createNewSession(workspaceUri: URI, sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
		if (!workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}

		const sessionType = this.sessionTypes.find(t => t.id === sessionTypeId);
		if (!sessionType) {
			throw new Error(this._noAgentsErrorMessage());
		}

		this._validateBeforeCreate(sessionType);

		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`Cannot resolve workspace for URI: ${workspaceUri.toString()}`);
		}

		return this._createDraftSession(sessionType, workspace, false, options?.metadata);
	}

	startNewSessionRequest(sessionId: string, activity?: string): IDisposable {
		const newSession = this._getNewSession(sessionId);
		if (!newSession) {
			throw new Error('Cannot start a session that is no longer pending.');
		}
		newSession.setStatus(SessionStatus.InProgress);
		newSession.setActivity(activity);
		return toDisposable(() => newSession.setActivity(undefined));
	}

	createQuickChat(sessionTypeId: string): ISession {
		const sessionType = this.sessionTypes.find(t => t.id === sessionTypeId);
		if (!sessionType) {
			throw new Error(this._noAgentsErrorMessage());
		}

		this._validateBeforeCreate(sessionType);

		// A quick chat is the same session type as a normal session, just
		// workspace-less: no `resolveWorkspace`, no `workingDirectory`. The
		// agent host runs it in a throwaway scratch cwd and tags it via the
		// `quickChat` create flag.
		return this._createDraftSession(sessionType, undefined, true);
	}

	/**
	 * Builds, tracks, and eagerly starts a {@link NewSession} draft for the
	 * given session type. Shared by {@link createNewSession} (workspace-bound)
	 * and {@link createQuickChat} (workspace-less, `quickChat === true`).
	 */
	private _createDraftSession(sessionType: ISessionType, workspace: ISessionWorkspace | undefined, quickChat: boolean, initialMetadata?: Record<string, unknown>): ISession {
		// Tear-down of superseded drafts is handled by the management layer
		// (it calls `deleteNewSession` on the previous pending session). Each
		// new session is tracked independently in `_newSessions` so several can
		// be in flight at once (e.g. one sending in the background while the
		// composer re-seeds a fresh draft).
		const connection = this.connection;
		const resourceScheme = this.resourceSchemeForProvider(sessionType.id);
		const activeClientScope = this._activeClientService.acquireScope(resourceScheme, workspace?.folders.map(folder => folder.root) ?? []);
		let newSession: NewSession;
		try {
			newSession = this._instantiationService.createInstance(NewSession, {
				workspace,
				quickChat,
				sessionType,
				providerId: this.id,
				icon: sessionType.icon,
				resourceScheme,
				backendSessionScheme: this._backendSessionScheme(sessionType.id),
				authenticationPending: this.authenticationPending,
				logService: this._logService,
				initialConfigValues: this._initialNewSessionConfig(workspace),
				initialConfigSchema: this._seededConfigSchema(),
				initialMetadata,
				instantiationService: this._instantiationService,
				onSessionState: (id, state) => state === undefined
					? this._handleNewSessionStateGone(id)
					: this._handleNewSessionStateUpdate(id, state),
				activeClientScope,
			}, {
				icon: this.iconForAgentProvider(sessionType.id) ?? this.icon,
				loading: this.authenticationPending,
				mapDiffUri: this._diffUriMapper(),
				gitHubService: this._gitHubService,
				instantiationService: this._instantiationService,
				getConnection: () => this.connection,
				agentCapabilities: this._agentCapabilities,
				...this._adapterOptions(),
			} satisfies IAgentHostAdapterOptions);
		} catch (err) {
			activeClientScope?.dispose();
			throw err;
		}
		this._newSessions.set(newSession.sessionId, newSession);
		newSession.observeClientCustomAgents(activeClientScope?.customAgents ?? constObservable([]), () => {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		});
		this._onDidChangeSessionConfig.fire(newSession.sessionId);

		// Kick off the initial config resolve and the eager backend session
		// in parallel after authentication settles. While auth is pending,
		// providers such as Codex reject both paths with AuthRequired; the
		// subclass calls _resumeNewSessionAfterAuthenticationSettles when the
		// first auth pass completes.
		if (connection) {
			if (!this.authenticationPending.get()) {
				this._startNewSessionBackend(newSession, connection);
			}
		} else {
			newSession.setLoading(false);
		}
		return newSession.session;
	}

	protected _resumeNewSessionAfterAuthenticationSettles(): void {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		for (const newSession of this._newSessions.values()) {
			this._startNewSessionBackend(newSession, connection);
		}
	}

	private _startNewSessionBackend(newSession: NewSession, connection: IAgentConnection): void {
		// Resolving the session config (schema + defaults for the picker chips)
		// is part of viewing the new-session UI and stays ungated.
		void newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession, { markSessionLoading: true }));

		// Defense-in-depth: never eagerly spawn an agent backend in an
		// untrusted folder. The interactive trust prompt lives at folder-pick
		// time (newChatWidget) and a backstop runs on first Send
		// (AgentHostSessionHandler), so in the normal flow the folder is
		// already trusted here. This guards alternate entry points (e.g.
		// delegation). No-op for providers that don't require trust (remote).
		const workspaceUri = newSession.workspaceUri;
		const canCreate = newSession.requiresWorkspaceTrust && workspaceUri ? async () => {
			const { trusted } = await this._workspaceTrustManagementService.getUriTrustInfo(workspaceUri);
			if (this._newSessions.get(newSession.sessionId) !== newSession) {
				return false;
			}
			if (!trusted) {
				this._logService.trace(`[${this.id}] Skipping eager createSession for untrusted folder ${workspaceUri.toString()}`);
				newSession.setLoading(false);
				return false;
			}
			return true;
		} : undefined;
		newSession.eagerCreate(connection, canCreate);
	}

	/**
	 * Re-resolves session config and pulses {@link _onDidChangeSessionConfig}.
	 * Expected values are validated after strict resolutions.
	 */
	private async _refreshNewSessionConfig(session: NewSession, options: {
		readonly expected?: Readonly<Record<string, unknown>>;
		readonly markSessionLoading?: boolean;
	} = {}): Promise<void> {
		const { expected, markSessionLoading } = options;
		const connection = this.connection;
		if (!connection) {
			// {@link resolveConfig} (the only other clear path) is skipped
			// on this branch, so clear the flag here to avoid stalling
			// the picker forever.
			session.endResolveConfigSync();
			session.setLoading(false);
			this._onDidChangeSessionConfig.fire(session.sessionId);
			if (expected) {
				throw new Error('Cannot set session repository config without an agent host connection.');
			}
			return;
		}
		if (markSessionLoading) {
			session.setLoading(true);
		}
		let applied: boolean;
		try {
			applied = await session.resolveConfig(connection, !!expected);
		} catch (error) {
			session.setLoading(false);
			this._onDidChangeSessionConfig.fire(session.sessionId);
			throw error;
		}
		// Bail if a newer call superseded us — its own pulse will take over.
		if (!applied || this._newSessions.get(session.sessionId) !== session) {
			if (expected) {
				throw new Error('Session repository config was superseded before it could be applied.');
			}
			return;
		}
		const config = session.getConfig();
		this._cacheSeededConfigSchemas(config);
		session.setLoading(config !== undefined && !isSessionConfigComplete(config));
		this._onDidChangeSessionConfig.fire(session.sessionId);
		for (const [property, value] of Object.entries(expected ?? {})) {
			if (!equals(config?.values[property], value)) {
				throw new Error(`Agent host did not apply session config '${property}'.`);
			}
		}
	}

	/**
	 * Snapshot the well-known {@link SEEDED_CONFIG_SCHEMA_KEYS} schemas from an
	 * authoritative resolve so the next new draft can render those chips
	 * immediately (disabled) instead of blanking. A `undefined` config (failed
	 * resolve) leaves the previous cache intact.
	 */
	private _cacheSeededConfigSchemas(config: ResolveSessionConfigResult | undefined): void {
		if (!config) {
			return;
		}
		for (const key of SEEDED_CONFIG_SCHEMA_KEYS) {
			const schema = config.schema.properties[key];
			if (schema) {
				this._cachedConfigSchemas.set(key, schema);
			} else {
				this._cachedConfigSchemas.delete(key);
			}
		}
	}

	/** Seed schema for a fresh draft, or `undefined` when nothing is cached yet. */
	private _seededConfigSchema(): Record<string, SessionConfigPropertySchema> | undefined {
		if (this._cachedConfigSchemas.size === 0) {
			return undefined;
		}
		const seed: Record<string, SessionConfigPropertySchema> = Object.create(null);
		for (const [key, schema] of this._cachedConfigSchemas) {
			seed[key] = schema;
		}
		return seed;
	}

	/** Subclass hook for additional pre-create checks (e.g. remote requires connection). */
	protected _validateBeforeCreate(_sessionType: ISessionType): void { /* default: no-op */ }

	/** Localized "no agents" error message. Subclasses can override. */
	protected _noAgentsErrorMessage(): string {
		return localize('noAgents', "Agent host has not advertised any agents yet.");
	}

	/**
	 * Initial session-config values applied to a brand-new agent-host session
	 * before its schema is resolved. Values are seeded from portable picks in
	 * the profile-scoped remembered session-config map and then normalized
	 * against policy/feature constraints.
	 *
	 * The agent-host defaults are controlled by the single
	 * `chat.defaultConfiguration` object setting (with `mode` and
	 * `approvals` properties). Per axis the precedence is: enterprise
	 * **policy** value > the user's **remembered** last pick > the ordinary
	 * configured **setting** value (treated as a plain default) > schema
	 * default. So a normal setting behaves as a default that the remembered
	 * pick overrides, while an enterprise policy still wins outright. The
	 * local-only `chat.permissions.default` setting is intentionally NOT
	 * consulted here.
	 *
	 * If enterprise policy disables global auto-approval
	 * (`chat.tools.global.autoApprove` policy value `false`), the approval seed
	 * is clamped to `default` so the agent host never starts in an elevated
	 * permission level the user is not allowed to pick.
	 *
	 * The user's `git.branchPrefix` setting (resource-scoped to the workspace's
	 * first folder) is seeded into the `worktreeBranchPrefix` slot so the agent
	 * host can prepend it to the branch it creates for an isolated worktree.
	 */
	protected _initialNewSessionConfig(workspace?: ISessionWorkspace): Record<string, unknown> | undefined {
		const config = Object.create(null) as Record<string, unknown>;
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);

		// Seed session config values from the last user picks, migrating any
		// legacy `autoApprove='autopilot'` remembered value into the new
		// `mode='autopilot'` shape before the per-axis precedence below runs.
		const rememberedValues = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
		for (const [property, value] of Object.entries(rememberedValues)) {
			if (typeof value === 'string' && isRememberedSessionConfigKey(property)) {
				config[property] = value;
			}
		}
		const remembered = migrateLegacyAutopilotConfig(config);

		// `chat.defaultConfiguration` controls both axes. Per axis the
		// precedence is: enterprise policy > remembered pick > effective
		// configured value (`inspect().value`, which is the user's setting or
		// the schema default). `inspect().value` is used instead of
		// `getValue()` only so the policy layer can be lifted above the
		// remembered pick.
		const inspected = this._baseConfigurationService.inspect<IChatDefaultConfiguration>(ChatConfiguration.DefaultConfiguration);
		const policyDefaults = inspected.policyValue;
		const effectiveDefaults = inspected.value;

		// Approval axis: policy > remembered > effective.
		const resolvedAutoApprove =
			normalizeAutoApproveValue(policyDefaults?.approvals, policyRestricted)
			?? normalizeAutoApproveValue(remembered[SessionConfigKey.AutoApprove], policyRestricted)
			?? normalizeAutoApproveValue(effectiveDefaults?.approvals, policyRestricted);
		if (resolvedAutoApprove) {
			remembered[SessionConfigKey.AutoApprove] = resolvedAutoApprove;
		} else {
			delete remembered[SessionConfigKey.AutoApprove];
		}

		// Mode axis: policy > remembered > effective.
		const resolvedMode = [policyDefaults?.mode, remembered[SessionConfigKey.Mode], effectiveDefaults?.mode]
			.find((value): value is string => typeof value === 'string' && KNOWN_MODE_VALUES.has(value));
		if (resolvedMode) {
			remembered[SessionConfigKey.Mode] = resolvedMode;
		} else {
			delete remembered[SessionConfigKey.Mode];
		}

		// Worktree branch prefix, forwarded from `git.branchPrefix`. Seeded
		// here (rather than remembered) since it is derived from a setting, not
		// a user pick; an empty value is omitted so the default branch naming
		// is preserved.
		const resource = workspace?.folders[0]?.root;
		const branchPrefix = this._baseConfigurationService.getValue<string>('git.branchPrefix', { resource });
		if (typeof branchPrefix === 'string' && branchPrefix.length > 0) {
			remembered[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
		}

		const worktreeIncludeFiles = this._baseConfigurationService.getValue<string[]>('git.worktreeIncludeFiles', { resource });
		if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
			remembered[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
		}

		return Object.keys(remembered).length > 0 ? remembered : undefined;
	}

	// -- Dynamic session config ----------------------------------------------

	getSessionConfig(sessionId: string): ResolveSessionConfigResult | undefined {
		// New-session config wins (during pre-creation flow). Otherwise lazily
		// subscribe to the session's state so the running picker can seed its
		// schema/values from the AHP `SessionState.config` snapshot for sessions
		// that weren't created in this window. Each query bumps the idle timer
		// so the subscription stays alive while the picker (or any other UI
		// surface) is repeatedly reading the running config.
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			return newSession.getConfig();
		}
		this._keepSessionStateAlive(sessionId);
		return this._runningSessionConfigs.get(sessionId);
	}

	/**
	 * Observable: `true` while a `resolveSessionConfig` round-trip is in
	 * flight. Distinct from `session.loading` (which also covers the
	 * required-values-missing state) — pickers gate on this so they stay
	 * interactive when the user has to fill in required values.
	 */
	isSessionConfigResolving(sessionId: string): IObservable<boolean> {
		const newSession = this._getNewSession(sessionId);
		return newSession
			? newSession.isResolvingConfig
			: constObservable(false);
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const normalizedValue = normalizeSessionConfigValue(property, value, policyRestricted);

		// Remember portable config picks across sessions.
		if (typeof normalizedValue === 'string' && isRememberedSessionConfigKey(property)) {
			const rememberedValues = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
			const nextRememberedValues = Object.create(null) as Record<string, string>;
			for (const [key, rememberedValue] of Object.entries(rememberedValues)) {
				if (typeof rememberedValue === 'string' && isRememberedSessionConfigKey(key)) {
					nextRememberedValues[key] = rememberedValue;
				}
			}
			nextRememberedValues[property] = normalizedValue;
			this._storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify(nextRememberedValues), StorageScope.PROFILE, StorageTarget.MACHINE);
		}

		// Mark resolution before firing so the first picker render is already inert.
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			// Defense-in-depth: pickers render disabled during a resolve,
			// but keyboard dropdown and mobile sheet paths bypass that.
			// Drop the second pick so it can't race the schema replacement.
			if (newSession.isResolvingConfig.get()) {
				return;
			}
			newSession.beginResolveConfigSync();
			newSession.setConfigValue(property, normalizedValue);
			this._onDidChangeSessionConfig.fire(sessionId);
			await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession));
			return;
		}

		// Running session: dispatch SessionConfigChanged for sessionMutable properties
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}
		const schema = runningConfig.schema.properties[property];
		if (!schema?.sessionMutable) {
			return;
		}

		// Update local cache optimistically
		const nextValues = { ...runningConfig.values, [property]: normalizedValue };
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const sessionUri = cached.backendUri;
			const action = { type: ActionType.SessionConfigChanged as const, config: { [property]: normalizedValue } };
			connection.dispatch(sessionUri.toString(), action);
			void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
		}
	}

	async replaceSessionConfig(sessionId: string, values: Record<string, unknown>): Promise<void> {
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}

		// Build the outgoing payload: for every known property, prefer the
		// caller-supplied value if the property is user-editable
		// (`sessionMutable: true` and not `readOnly`), otherwise force the
		// current value through. This guarantees replace semantics never
		// alter a non-editable property even if the caller included it.
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const nextValues: Record<string, unknown> = {};
		for (const [key, schema] of Object.entries(runningConfig.schema.properties)) {
			const editable = schema.sessionMutable === true && schema.readOnly !== true;
			if (editable) {
				nextValues[key] = normalizeSessionConfigValue(key, values[key], policyRestricted);
			} else if (Object.hasOwn(runningConfig.values, key)) {
				nextValues[key] = runningConfig.values[key];
			}
		}
		// Unknown keys from the caller are ignored (no schema entry).

		// Skip the dispatch entirely when nothing meaningful changes.
		if (equals(nextValues, runningConfig.values)) {
			return;
		}

		// Update local cache optimistically (full replace).
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host with replace semantics.
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const sessionUri = cached.backendUri;
			const action = {
				type: ActionType.SessionConfigChanged as const,
				config: nextValues,
				replace: true,
			};
			connection.dispatch(sessionUri.toString(), action);
			void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
		}
	}

	private async _resolveRunningSessionConfig(sessionId: string, cached: AgentHostSessionAdapter, values: Record<string, unknown>): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		const seq = (this._runningSessionConfigResolveSeq.get(sessionId) ?? 0) + 1;
		this._runningSessionConfigResolveSeq.set(sessionId, seq);
		try {
			const resolved = await connection.resolveSessionConfig({
				provider: cached.agentProvider,
				workingDirectory: cached.workspace.get()?.folders[0]?.root,
				config: values,
			});
			if (this._runningSessionConfigResolveSeq.get(sessionId) !== seq) {
				return;
			}
			this._runningSessionConfigs.set(sessionId, resolved);
			this._onDidChangeSessionConfig.fire(sessionId);
		} catch (err) {
			this._logService.warn(`[${this.id}] Failed to re-resolve session config for ${sessionId}: ${err}`);
		}
	}

	async getSessionConfigCompletions(sessionId: string, property: string, query?: string) {
		const newSession = this._getNewSession(sessionId);
		const connection = this.connection;
		if (!newSession || !connection) {
			return [];
		}
		const result = await newSession.getConfigCompletions(connection, property, query);
		return result.items;
	}

	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined {
		return this._getNewSession(sessionId)?.getConfigValues();
	}

	async setIsolationMode(sessionId: string, mode: string): Promise<void> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const value = normalizeSessionConfigValue(
			SessionConfigKey.Isolation,
			mode === 'workspace' ? 'folder' : mode,
			policyRestricted,
		);
		await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.Isolation, value);
	}

	async setWorktreeConfiguration(sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const values: Record<string, unknown> = {};
		if (configuration.isolationMode) {
			values[SessionConfigKey.Isolation] = normalizeSessionConfigValue(
				SessionConfigKey.Isolation,
				configuration.isolationMode === 'workspace' ? 'folder' : configuration.isolationMode,
				policyRestricted,
			);
		}
		if (configuration.worktreeBranchTrack !== undefined) {
			values[SessionConfigKey.WorktreeBranchTrack] = configuration.worktreeBranchTrack;
		}
		if (configuration.branch) {
			values[SessionConfigKey.Branch] = normalizeSessionConfigValue(SessionConfigKey.Branch, configuration.branch, policyRestricted);
		}
		await this._setTransientNewSessionConfigValues(sessionId, values, false);
	}

	async setWorktreeBranchTrack(sessionId: string, enabled: boolean): Promise<void> {
		await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.WorktreeBranchTrack, enabled);
	}

	async setBranch(sessionId: string, branch: string): Promise<void> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const value = normalizeSessionConfigValue(SessionConfigKey.Branch, branch, policyRestricted);
		await this._setTransientNewSessionConfigValue(sessionId, SessionConfigKey.Branch, value);
	}

	private async _setTransientNewSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		await this._setTransientNewSessionConfigValues(sessionId, { [property]: value }, true);
	}

	private async _setTransientNewSessionConfigValues(sessionId: string, values: Readonly<Record<string, unknown>>, waitForCurrentResolve: boolean): Promise<void> {
		const newSession = this._getNewSession(sessionId);
		if (!newSession) {
			throw new Error('Cannot configure repository settings after session creation.');
		}
		await waitForState(this.authenticationPending, pending => !pending, undefined, newSession.cancellationToken);
		if (waitForCurrentResolve) {
			await waitForState(newSession.isResolvingConfig, resolving => !resolving, undefined, newSession.cancellationToken);
		}
		if (this._getNewSession(sessionId) !== newSession) {
			throw new Error('Session was disposed before repository configuration could be applied.');
		}

		newSession.beginResolveConfigSync();
		for (const [property, value] of Object.entries(values)) {
			newSession.setConfigValue(property, value);
		}
		this._onDidChangeSessionConfig.fire(sessionId);
		await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession, { expected: values }));
	}

	clearSessionConfig(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._newSessions.deleteAndDispose(sessionId);
		}
	}

	// -- Root (agent host) Config --------------------------------------------

	getRootConfig(): RootConfigState | undefined {
		return this._rootConfig;
	}

	getRootState(): RootState | undefined {
		const value = this.connection?.rootState.value;
		return value instanceof Error ? undefined : value;
	}

	mapAgentHostResource(uri: URI): URI {
		return this.mapWorkingDirectoryUri(uri);
	}

	async authenticate(params: AuthenticateParams): Promise<AuthenticateResult> {
		const connection = this.connection;
		if (!connection) {
			return { authenticated: false };
		}
		return connection.authenticate(params);
	}

	async setRootConfigValue(property: string, value: unknown): Promise<void> {
		const current = this._rootConfig;
		const connection = this.connection;
		if (!current || !connection) {
			return;
		}
		if (!current.schema.properties[property]) {
			return;
		}

		// Optimistically update local cache.
		this._rootConfig = {
			...current,
			values: { ...current.values, [property]: value },
		};
		this._onDidChangeRootConfig.fire();

		const action = {
			type: ActionType.RootConfigChanged as const,
			config: { [property]: value },
		};
		connection.dispatch(ROOT_STATE_URI, action);
	}

	async replaceRootConfig(values: Record<string, unknown>): Promise<void> {
		const current = this._rootConfig;
		const connection = this.connection;
		if (!current || !connection) {
			return;
		}

		// Filter to known properties so we don't dispatch values for keys the
		// host didn't publish a schema for.
		const nextValues: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(values)) {
			if (current.schema.properties[key]) {
				nextValues[key] = value;
			}
		}

		if (equals(nextValues, current.values)) {
			return;
		}

		this._rootConfig = { ...current, values: nextValues };
		this._onDidChangeRootConfig.fire();

		const action = {
			type: ActionType.RootConfigChanged as const,
			config: nextValues,
			replace: true,
		};
		connection.dispatch(ROOT_STATE_URI, action);
	}

	// -- Model selection ------------------------------------------------------

	get onDidChangeModels(): Event<void> {
		return Event.signal(Event.any(
			this._languageModelsService.onDidChangeLanguageModels,
			this._languageModelsService.onDidChangeModelVisibility,
		));
	}

	getModelsSnapshot(sessionId: string, desiredModelId?: string): ISessionModelsSnapshot {
		// Agent-host models are registered against the session's resource
		// scheme (the per-host/per-agent `targetChatSessionType`). Resolve the
		// scheme from the session and return the matching language models.
		const resourceScheme = this._resolveSessionResourceScheme(sessionId);
		if (!resourceScheme) {
			return {
				models: [],
				desiredModelResolution: resolveModelIdentifier([], desiredModelId, false),
				modelTarget: undefined,
			};
		}
		const allModels = getRegisteredLanguageModels(this._languageModelsService);
		const models = allModels.filter(model => {
			if (model.metadata.targetChatSessionType !== resourceScheme) {
				return false;
			}
			if (this._languageModelsService.isModelHidden(model.identifier)) {
				return false;
			}
			const manageModelsIdentifier = ILanguageModelChatMetadata.getAgentHostByokManageModelsIdentifier(model.metadata);
			return manageModelsIdentifier === undefined || !this._languageModelsService.isModelHidden(manageModelsIdentifier);
		});
		const desiredModel = desiredModelId ? this._languageModelsService.lookupLanguageModel(desiredModelId) : undefined;
		const resolvedDesiredModelId = desiredModel?.targetChatSessionType && this.resourceSchemeForProvider(desiredModel.targetChatSessionType) === resourceScheme
			? `${resourceScheme}:${desiredModel.id}`
			: desiredModelId;
		return {
			models,
			desiredModelResolution: resolveModelIdentifierFromLanguageModels(models, resolvedDesiredModelId, this._languageModelsService, allModels),
			modelTarget: resourceScheme,
		};
	}

	getModelPickerOptions(sessionId: string): ISessionModelPickerOptions {
		// A session type that requires an explicit model selection cannot fall
		// back to Auto. When it has no models (e.g. the Claude agent host for a
		// Copilot Free / Student user), the picker shows a "No models available"
		// state instead of Auto. Harnesses that support Auto (e.g. the Copilot
		// CLI agent host) keep the Auto fallback. Derive this from the
		// contribution's declarative `showAutoModel` flag (keyed by the
		// session's resource scheme, which is the registered
		// `agent-host-<provider>` chat session type) rather than hardcoding names.
		const resourceScheme = this._resolveSessionResourceScheme(sessionId);
		const showAutoModel = !resourceScheme || this._chatSessionsService.supportsAutoModelForSessionType(resourceScheme);
		return {
			useGroupedModelPicker: true,
			showFeatured: true,
			showUnavailableFeatured: true,
			showManageModelsAction: true,
			showAutoModel,
		};
	}

	/**
	 * Resolve a remembered model selection at send time: when it is conclusively
	 * unavailable and the harness supports Auto, return the Auto model identifier
	 * (rather than `undefined`, which would leave an already-running chat pinned
	 * to its stale backend model) so the request is explicitly reset to Auto.
	 */
	private _resolveSendModelId(sessionId: string, selectedModelId: string | undefined): string | undefined {
		if (!selectedModelId) {
			return selectedModelId;
		}
		const snapshot = this.getModelsSnapshot(sessionId, selectedModelId);
		if (snapshot.desiredModelResolution.kind !== 'unavailable') {
			// Available, pending (list not yet populated) or not requested: keep the selection.
			return selectedModelId;
		}
		const resourceScheme = this._resolveSessionResourceScheme(sessionId);
		const supportsAuto = !resourceScheme || this._chatSessionsService.supportsAutoModelForSessionType(resourceScheme);
		if (!supportsAuto) {
			return selectedModelId;
		}
		// Send the harness's Auto model explicitly. Returning `undefined` would
		// omit `model` from the turn, which leaves an already-running chat on its
		// stale backend selection and still fails on the unroutable model.
		const autoModelId = resolveConfiguredModel('auto', snapshot.models)?.identifier;
		this._logService.warn(`[${this.id}] Selected model '${selectedModelId}' is unavailable for session '${sessionId}'; falling back to Auto instead of sending an unroutable model.`);
		return autoModelId;
	}

	private _resolveSessionResourceScheme(sessionId: string): string | undefined {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			return newSession.session.resource.scheme;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		return cached?.resource.scheme;
	}

	setModel(sessionId: string, modelId: string): void {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			newSession.setSelectedModelId(modelId);
			return;
		}

		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			const chatResource = this._activeChatResource(cached);
			cached.setChatModelId(chatResource, modelId);
			this._updateChatSessionState(chatResource, modelId, cached.getChatMode(chatResource)?.id).catch(err => this._logService.error(`[${this.id}] Failed to update chat model state for ${chatResource.toString()}`, err));
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	setAgent(sessionId: string, agent: ISessionAgentRef | undefined): void {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			newSession.setSelectedAgent(agent);
			// The selection is forwarded to the host at first-message time
			// via `sendOptions.agentHostSessionAgent` (see `sendRequest`),
			// mirroring how `userSelectedModelId` flows.
			return;
		}

		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			const chatResource = this._activeChatResource(cached);
			cached.setChatAgent(chatResource, agent);
			this._updateChatSessionState(chatResource, cached.getChatModelId(chatResource), agent?.uri).catch(err => this._logService.error(`[${this.id}] Failed to update chat model state for ${chatResource.toString()}`, err));
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	getCustomAgents(sessionId: string): readonly AgentCustomization[] {
		const sessionState = this._lastSessionStates.get(sessionId);
		const stateAgents = getEffectiveAgents(sessionState?.customizations);
		const newSession = this._newSessions.get(sessionId);
		if (!newSession) {
			return stateAgents;
		}
		const clientAgents = newSession.getClientCustomAgents();
		if (clientAgents.length === 0) {
			return stateAgents;
		}
		const agentsByUri = new Map(stateAgents.map(agent => [agent.uri.toString(), agent]));
		for (const agent of clientAgents) {
			agentsByUri.set(agent.uri.toString(), agent);
		}
		return [...agentsByUri.values()].sort((a, b) => a.name.localeCompare(b.name) || a.uri.toString().localeCompare(b.uri.toString()));
	}

	getCustomizations(sessionId: string): Customization[] {
		const sessionState = this._lastSessionStates.get(sessionId);
		return sessionState?.customizations ?? [];
	}

	getWorkingDirectory(sessionId: string): string | undefined {
		const sessionState = this._lastSessionStates.get(sessionId);
		return sessionState?.workingDirectories?.[0];
	}

	getBackendChatResource(chatResource: URI): URI | undefined {
		// The client resource is `<scheme>:/<rawId>[#chatId]`; drop the fragment to
		// recover the session resource, whose `sessionId` keys `_lastSessionStates`.
		const sessionResource = chatResource.with({ fragment: '' });
		const state = this._lastSessionStates.get(toSessionId(this.id, sessionResource));
		if (!state) {
			return undefined;
		}
		// Look up the authoritative host-supplied backend chat URI rather than
		// constructing one: a peer chat's client fragment is exactly the chatId of
		// its `ChatSummary.resource` (see `_createAdditionalChat`); the default
		// chat (no fragment) is `SessionState.defaultChat`, falling back to the
		// summary flagged by `isDefaultChatUri` — mirroring `_applyChatCatalog`.
		const chatId = chatResource.fragment || undefined;
		const backendResource = chatId
			? state.chats.find(c => parseChatUri(c.resource)?.chatId === chatId)?.resource
			: (state.defaultChat ?? state.chats.find(c => isDefaultChatUri(c.resource))?.resource);
		if (!backendResource) {
			return undefined;
		}
		// The resource is host-supplied and only parsed here to hand back a URI;
		// a malformed one must not break the drag gesture that asks for it.
		try {
			return URI.parse(backendResource.toString());
		} catch {
			return undefined;
		}
	}

	getWorkingDirectories(sessionId: string): readonly string[] {
		const sessionState = this._lastSessionStates.get(sessionId);
		return sessionState?.workingDirectories ?? [];
	}

	getMcpServers(sessionId: string): readonly IAgentHostMcpServer[] {
		const sessionState = this._lastSessionStates.get(sessionId);
		if (!sessionState) {
			return [];
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!cached || !rawId) {
			return [];
		}
		const sessionUri = cached.backendUri;
		return (sessionState.customizations ?? [])
			.flatMap(customization => customization.type === CustomizationType.McpServer
				? [{ server: customization, plugin: undefined }]
				: customization.children
					? customization.children.filter(child => child.type === CustomizationType.McpServer).map(server => ({
						server,
						plugin: customization.type === CustomizationType.Plugin ? customization : undefined,
					}))
					: [])
			.map(({ server, plugin }): IAgentHostMcpServer => ({
				id: `${sessionUri.authority}/${server.id}`,
				name: server.name,
				enabled: isCustomizationEnabled(server) && (!plugin || isCustomizationEnabled(plugin)),
				enablement: server.enablement,
				disabledReason: getCustomizationDisabledReason(server, plugin),
				status: server.state.kind,
				state: server.state,
				setEnabled: (enabled: boolean) => {
					const connection = this.connection;
					if (!connection) {
						return;
					}
					connection.dispatch(sessionUri.toString(), {
						type: ActionType.SessionCustomizationToggled,
						id: server.id,
						enablement: withCustomizationEnablement(server.enablement, CustomizationEnablementKind.Session, { kind: CustomizationEnablementKind.Session, enabled }),
					});
				},
				start: async () => {
					const connection = this.connection;
					if (!connection) {
						return;
					}
					connection.dispatch(sessionUri.toString(), {
						type: ActionType.SessionMcpServerStartRequested,
						id: server.id,
					});
				},
				stop: async () => {
					const connection = this.connection;
					if (!connection) {
						return;
					}
					connection.dispatch(sessionUri.toString(), {
						type: ActionType.SessionMcpServerStopRequested,
						id: server.id,
					});
				},
			}));
	}

	setCustomizationEnablement(sessionId: string, customizationId: string, enablement: readonly CustomizationEnablement[]): void {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!cached || !connection) {
			return;
		}
		connection.dispatch(cached.backendUri.toString(), {
			type: ActionType.SessionCustomizationToggled,
			id: customizationId,
			enablement: [...enablement],
		});
	}

	getFeedbackAnnotationsChannel(sessionId: string): { readonly connection: IAgentConnection; readonly annotationsUri: URI } | undefined {
		const connection = this.connection;
		if (!connection) {
			return undefined;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!cached || !rawId) {
			return undefined;
		}
		const sessionUri = cached.backendUri;
		const annotationsUri = URI.parse(buildAnnotationsUri(sessionUri.toString()));
		return { connection, annotationsUri };
	}

	// -- Session actions ------------------------------------------------------

	async archiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(true, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const sessionUri = cached.backendUri;
				const action = { type: ActionType.SessionIsArchivedChanged as const, isArchived: true };
				connection.dispatch(sessionUri.toString(), action);
			}
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			cached.isArchived.set(false, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const sessionUri = cached.backendUri;
				const action = { type: ActionType.SessionIsArchivedChanged as const, isArchived: false };
				connection.dispatch(sessionUri.toString(), action);
			}
		}
	}

	async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId && cached.isRead.get() !== isRead) {
			cached.isRead.set(isRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const sessionUri = cached.backendUri;
				const action = { type: ActionType.SessionIsReadChanged as const, isRead };
				connection.dispatch(sessionUri.toString(), action);
			}
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		await this.deleteSessions([sessionId]);
	}

	async deleteSessions(sessionIds: readonly string[]): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		const targets: { rawId: string; cached: AgentHostSessionAdapter }[] = [];
		for (const sessionId of sessionIds) {
			const rawId = this._rawIdFromChatId(sessionId);
			const cached = rawId ? this._sessionCache.get(rawId) : undefined;
			if (cached && rawId) {
				targets.push({ rawId, cached });
			}
		}
		if (targets.length === 0) {
			return;
		}
		const removed: AgentHostSessionAdapter[] = [];
		try {
			for (const { rawId, cached } of targets) {
				await connection.disposeSession(cached.backendUri);
				const removedSession = this._removeCachedSession(rawId, cached);
				if (removedSession) {
					removed.push(removedSession);
				}
			}
		} finally {
			if (removed.length > 0) {
				this._onDidChangeSessions.fire({ added: [], removed, changed: [] });
				for (const cached of removed) {
					cached.dispose();
				}
			}
		}
	}

	async renameChat(sessionId: string, chatUri: URI, title: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!cached || !rawId || !connection) {
			return;
		}
		const sessionUri = cached.backendUri;
		const chatId = chatUri.fragment;
		const action = { type: ActionType.SessionTitleChanged as const, title };
		if (chatId) {
			// Additional peer chat: rename only that chat by dispatching on its
			// chat channel. The host translates this to a per-chat update.
			cached.setAdditionalChatTitle(chatId, title);
			connection.dispatch(buildChatUri(sessionUri, chatId), action);
		} else {
			// Default chat: rename the default chat tab independently of the
			// session title by dispatching on the default chat channel.
			cached.setDefaultChatTitle(title);
			connection.dispatch(buildDefaultChatUri(sessionUri), action);
		}
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
	}

	async renameSession(sessionId: string, title: string): Promise<void> {
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const sessionUri = cached.backendUri;
			const action = { type: ActionType.SessionTitleChanged as const, title };
			connection.dispatch(sessionUri.toString(), action);
		}
	}

	async deleteChat(sessionId: string, chatUri: URI, options?: IDeleteChatOptions): Promise<boolean> {
		const chatId = chatUri.fragment;
		if (!chatId) {
			// The default chat lives and dies with its session and cannot be
			// deleted in isolation.
			return false;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!rawId || !cached || !connection) {
			return false;
		}
		const sessionUri = cached.backendUri;
		const ahpChatUri = URI.parse(buildChatUri(sessionUri, chatId));

		if (!options?.skipConfirmation) {
			const confirmed = await this._dialogService.confirm({
				message: localize('deleteChat.confirm', "Are you sure you want to delete this chat?"),
				detail: localize('deleteChat.detail', "This action cannot be undone."),
				primaryButton: localize('deleteChat.delete', "Delete")
			});
			if (!confirmed.confirmed) {
				return false;
			}
		}

		// Keep the session-state subscription alive so the `chatRemoved` the
		// host emits flows into `applyChatCatalog` and drops the chat from
		// `cached.chats`.
		this._keepSessionStateAlive(cached.sessionId);
		await connection.disposeChat(ahpChatUri);
		return true;
	}

	async createNewChat(chatId: string): Promise<IChat> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}

		const newSession = this._getNewSession(chatId);
		if (newSession) {
			// Create the chat session model so the management service can open the widget
			await this._chatSessionsService.getOrCreateChatSession(newSession.session.resource, CancellationToken.None);
			return newSession.session.mainChat.get();
		}

		// Otherwise this is an additional peer chat inside an existing running
		// session. Mint a client-chosen chat URI, ask the host to add it to the
		// session's catalog, and wait for the adapter to surface the new chat.
		return this._createAdditionalChat(chatId, connection);
	}

	private async _createAdditionalChat(chatId: string, connection: IAgentConnection): Promise<IChat> {
		const rawId = this._rawIdFromChatId(chatId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!rawId || !cached) {
			throw new Error(`Session '${chatId}' not found`);
		}
		if (!cached.capabilities.get().supportsMultipleChats) {
			throw new Error(`Session '${chatId}' does not support multiple chats`);
		}

		const sessionUri = cached.backendUri;
		const newChatId = generateUuid();
		const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
		const selectedModelId = cached.modelId.get() ?? (cached.modelSelection ? `${cached.resource.scheme}:${cached.modelSelection.id}` : undefined);
		const selectedAgentUri = cached.mode.get()?.id;

		// Show as `Untitled` until the first request; the host commits it below.
		cached.markChatAsNew(newChatId);

		// Keep the session-state subscription alive so the `chatAdded` it emits
		// flows into `_applyChatCatalogFromState` and updates `cached.chats`.
		this._keepSessionStateAlive(cached.sessionId);
		await connection.createChat(sessionUri, chatUri, {
			model: cached.modelSelection,
		});

		const chat = await waitForState(
			cached.chats.map(chats => chats.find(c => c.resource.fragment === newChatId)),
			c => !!c,
		);

		cached.setChatModelId(chat.resource, selectedModelId);
		cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: '' } : undefined);

		await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
		await this._updateChatSessionState(chat.resource, selectedModelId, selectedAgentUri);
		return chat;
	}

	async forkChat(sessionId: string, sourceChat: URI, turnId: string): Promise<IChat> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!rawId || !cached) {
			throw new Error(`Session '${sessionId}' not found`);
		}
		if (!cached.capabilities.get().supportsMultipleChats) {
			throw new Error(`Session '${sessionId}' does not support multiple chats`);
		}

		const sessionUri = cached.backendUri;
		const newChatId = generateUuid();
		const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
		const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);

		// Keep the session-state subscription alive so the `chatAdded` it emits
		// flows into `_applyChatCatalogFromState` and updates `cached.chats`.
		this._keepSessionStateAlive(cached.sessionId);
		await connection.createChat(sessionUri, chatUri, {
			model: cached.modelSelection,
			fork: { source: sourceBackendUri, turnId },
		});

		const chat = await waitForState(
			cached.chats.map(chats => chats.find(c => c.resource.fragment === newChatId)),
			c => !!c,
		);

		await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
		return chat;
	}

	async createSideChat(sessionId: string, sourceChat: URI, turnId: string, selection?: ISideChatSelection): Promise<IChat> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!rawId || !cached) {
			throw new Error(`Session '${sessionId}' not found`);
		}
		if (!cached.capabilities.get().supportsSideChat) {
			throw new Error(`Session '${sessionId}' does not support side chats`);
		}

		const sessionUri = AgentSession.uri(cached.agentProvider, rawId);
		const newChatId = generateUuid();
		const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
		const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);

		// Inherit the source chat's own model/agent selection (which may differ
		// from the session's default), not the session-level fallback.
		const selectedModel = cached.getChatModelSelection(sourceChat);
		const selectedModelId = cached.getChatModelId(sourceChat)
			?? (selectedModel ? `${cached.resource.scheme}:${selectedModel.id}` : undefined);
		const selectedAgentUri = cached.getChatMode(sourceChat)?.id;

		// Keep the session-state subscription alive so the `chatAdded` it emits
		// flows into `_applyChatCatalogFromState` and updates `cached.chats`.
		this._keepSessionStateAlive(cached.sessionId);
		await connection.createChat(sessionUri, chatUri, {
			model: selectedModel,
			sideChat: {
				source: sourceBackendUri,
				turnId,
				...(selection ? { selection } : {}),
			},
		});

		const chat = await waitForState(
			cached.chats.map(chats => chats.find(c => c.resource.fragment === newChatId)),
			c => !!c,
		);

		cached.setChatModelId(chat.resource, selectedModelId);
		cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: '' } : undefined);

		await this._chatSessionsService.getOrCreateChatSession(chat.resource, CancellationToken.None);
		await this._updateChatSessionState(chat.resource, selectedModelId, selectedAgentUri);
		return chat;
	}

	private _resolveBackendSourceChatUri(sessionId: string, sessionUri: URI, sourceChat: URI): URI {
		if (sourceChat.fragment) {
			return URI.parse(buildChatUri(sessionUri, sourceChat.fragment));
		}
		const hydratedDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
		return hydratedDefaultChat ? URI.parse(hydratedDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
	}

	async sendRequest(chatId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const newSession = this._getNewSession(chatId);
		if (newSession) {
			return this._sendNewSessionRequest(newSession, chatId, chatResource, options);
		}
		return this._sendCommittedChatRequest(chatId, chatResource, options);
	}

	/** Send the first request for an already-committed peer chat, then clear its `new` flag. */
	private async _sendCommittedChatRequest(chatId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const rawId = this._rawIdFromChatId(chatId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!rawId || !cached) {
			throw new Error(`Session '${chatId}' not found`);
		}

		const { query, attachedContext } = options;
		const sessionType = chatResource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const selectedModelId = this._resolveSendModelId(chatId, cached.getChatModelId(chatResource));
		const selectedAgentUri = cached.getChatMode(chatResource)?.id;

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: selectedModelId,
			modeInfo: selectedAgentUri ? {
				kind: ChatModeKind.Agent,
				isBuiltin: false,
				modeInstructions: {
					uri: URI.parse(selectedAgentUri),
					name: '',
					content: '',
					toolReferences: [],
				},
				telemetryModeId: 'custom',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			} : {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			hideFromTranscript: options.hideFromTranscript,
		};

		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			throw new Error(`[${this.id}] Unable to load chat session ${chatResource.toString()}`);
		}

		try {
			this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri);

			const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
			if (result.kind === 'rejected') {
				throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
			}

			this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri, { clearDraft: true });
		} finally {
			modelRef.dispose();
		}

		// First request sent: revert to the host-reported status.
		cached.markChatAsSent(chatResource.fragment);

		return cached;
	}

	private async _updateChatSessionState(chatResource: URI, modelId: string | undefined, agentUri: string | undefined, options?: { readonly clearDraft?: boolean }): Promise<void> {
		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			return;
		}
		try {
			this._applyChatSessionState(modelRef, modelId, agentUri, options);
		} finally {
			modelRef.dispose();
		}
	}

	private _applyChatSessionState(modelRef: IChatModelReference, modelId: string | undefined, agentUri: string | undefined, options?: { readonly clearDraft?: boolean }): void {
		const inputModel = modelRef.object.inputModel;
		if (!inputModel) {
			return;
		}
		if (modelId) {
			const languageModel = this._languageModelsService.lookupLanguageModel(modelId);
			if (languageModel) {
				inputModel.setState({ selectedModel: { identifier: modelId, metadata: languageModel } });
			}
		}
		inputModel.setState({
			mode: { id: agentUri ?? ChatMode.Agent.id, kind: ChatModeKind.Agent },
			...(options?.clearDraft ? { inputText: '', attachments: [], selections: [] } : {}),
		});
	}

	private async _sendNewSessionRequest(newSession: NewSession, chatId: string, chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		if (!this.connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}
		await newSession.waitForConfigResolution();
		await newSession.waitForEagerCreate();
		if (this._getNewSession(newSession.sessionId) !== newSession) {
			throw new Error('Session was disposed before its configuration could be applied.');
		}
		if (!this.connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}

		newSession.setStatus(SessionStatus.InProgress);
		const selectedModelId = this._resolveSendModelId(chatId, newSession.getSelectedModelId());
		const selectedAgent = newSession.getSelectedAgent();

		const { query, attachedContext } = options;

		const sessionType = chatResource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: selectedModelId,
			modeInfo: selectedAgent ? {
				kind: ChatModeKind.Agent,
				isBuiltin: false,
				modeInstructions: {
					uri: URI.parse(selectedAgent.uri),
					name: '',
					content: '',
					toolReferences: [],
				},
				telemetryModeId: 'custom',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			} : {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
				permissionLevel: undefined,
			},
			agentIdSilent: contribution?.type,
			attachedContext,
			agentHostSessionConfig: this.getCreateSessionConfig(chatId),
			hideFromTranscript: options.hideFromTranscript,
		};

		// Chat session model was already created by createNewChat and
		// the widget was opened by the management service. Load session
		// model and apply selected model.
		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			if (selectedModelId) {
				const languageModel = this._languageModelsService.lookupLanguageModel(selectedModelId);
				if (languageModel) {
					modelRef.object.inputModel.setState({ selectedModel: { identifier: selectedModelId, metadata: languageModel } });
				}
			}
			if (selectedAgent) {
				// Seed the chat input's mode with the picked custom agent so the
				// agent picker shows the selection immediately. Without this it
				// would only update once the host echoed `SessionAgentChanged`
				// back after the first turn.
				modelRef.object.inputModel.setState({ mode: { id: selectedAgent.uri, kind: ChatModeKind.Agent } });
			}
			modelRef.dispose();
		}

		// Capture existing session keys before sending so we can detect the new
		// backend session. Must be captured before sendRequest because the
		// backend session may be created during the send and arrive via
		// notification before sendRequest resolves.
		this._ensureSessionCache();
		const existingKeys = new Set(this._sessionCache.keys());
		// The eagerly-created session may already be cached before first send.
		// Treat that raw id as the session we are waiting for, not old state.
		const newSessionRawId = chatResource.path.replace(/^\//, '');
		existingKeys.delete(newSessionRawId);
		// Publish this send's own id so concurrent same-scheme sends don't
		// latch onto it via their novelty fallback (which would swap sessions).
		this._inFlightNewSessionOwnIds.add(newSessionRawId);

		const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
		}

		newSession.setStatus(SessionStatus.InProgress);
		newSession.clearSelectedModelId();

		// Seed the title from the first line of the query so the new-session
		// tab shows something meaningful immediately. This skeleton is replaced
		// by the committed AgentHostSession once it arrives.
		newSession.setTitle((options.title || query.split('\n')[0]).substring(0, 100) || newSession.untitledTitle);
		const skeleton = newSession.session;
		this._pendingSession = skeleton;
		this._onDidChangeSessions.fire({ added: [skeleton], removed: [], changed: [] });

		// Raw id claimed by _waitForNewSession for this send (released in finally).
		let committedRawId: string | undefined;
		try {
			const committedSession = await this._waitForNewSession(existingKeys, chatResource.scheme, newSessionRawId, newSession.cancellationToken);
			if (committedSession) {
				committedRawId = committedSession.resource.path.substring(1);
				this._preserveNewSessionConfig(newSession, committedSession.sessionId);
				if (options.title) {
					await this.renameSession(committedSession.sessionId, options.title);
				}
				// Carry the picked custom agent onto the committed session before
				// the replace event so the agent picker doesn't reset to the
				// default once the active session is swapped (the picker mirrors
				// `session.mode`, which is otherwise `undefined` on the freshly
				// committed adapter). The host already received the agent with the
				// first turn (see `sendOptions.modeInfo`), so update only the local
				// mode observable here rather than re-notifying it via `setAgent`.
				if (selectedAgent) {
					const committedRawIdForAgent = this._rawIdFromChatId(committedSession.sessionId);
					const committedAdapter = committedRawIdForAgent ? this._sessionCache.get(committedRawIdForAgent) : undefined;
					committedAdapter?.setChatAgent(committedAdapter.resource, selectedAgent);
				}
				// Session graduated: release the eager subscription without
				// firing `disposeSession`. The session handler has already
				// acquired its own subscription (chat widget was opened
				// earlier), so the wire-level refcount stays positive.
				newSession.graduate();
				if (this._newSessions.get(newSession.sessionId) === newSession) {
					this._newSessions.deleteAndDispose(newSession.sessionId);
				}
				// Clear the pending session before firing the replace event so
				// that any synchronous listener calling getSessions() sees only
				// the committed session and not both.
				this._pendingSession = undefined;
				this._onDidReplaceSession.fire({ from: skeleton, to: committedSession });
				return committedSession;
			}
		} catch {
			// Connection lost or timeout — fall through to the failure cleanup.
		} finally {
			// Release the claim so unrelated future sends can match this
			// session if needed; concurrent in-flight sends already captured
			// their `existingKeys` and won't retroactively match it.
			if (committedRawId !== undefined) {
				this._committingSessionRawIds.delete(committedRawId);
			}
			this._inFlightNewSessionOwnIds.delete(newSessionRawId);
			// Defensive clear: covers the failure path where the try block
			// never reached the explicit clear above.
			this._pendingSession = undefined;
		}

		// On failure: drop the eager subscription without firing
		// `disposeSession`. The server-side empty-session GC will clean up
		// the provisional session if it remains; we lean on the GC rather
		// than risking a double-dispose race on transient failures.
		newSession.graduate();
		if (this._newSessions.get(newSession.sessionId) === newSession) {
			this._newSessions.deleteAndDispose(newSession.sessionId);
		}
		this._onDidChangeSessions.fire({ added: [], removed: [skeleton], changed: [] });
		throw new Error(localize('sessionNotCommitted', "Agent host session was not committed."));
	}

	/** Localized error message when sendRequest is invoked without a connection. Subclasses can override. */
	protected _notConnectedSendErrorMessage(): string {
		return localize('notConnectedSend', "Cannot send request: not connected to agent host.");
	}

	// -- Session config plumbing ---------------------------------------------

	/**
	 * When a session transitions from untitled (new) to committed (running),
	 * carry over the full resolved config (schema + values) so consumers like
	 * the session-settings JSONC editor can round-trip non-mutable values
	 * (`isolation`, `branch`, …) through a replace dispatch. Mutable-vs-readonly
	 * behavior is still driven off the per-property `sessionMutable` flag.
	 */
	private _preserveNewSessionConfig(newSession: NewSession, committedSessionId: string): void {
		const config = newSession.getConfig();
		if (config && Object.keys(config.schema.properties).length > 0) {
			this._runningSessionConfigs.set(committedSessionId, {
				schema: { type: 'object', properties: { ...config.schema.properties } },
				values: { ...config.values },
			});
		}

		this._applyWorktreeIsolation(committedSessionId, config?.values);
	}

	protected _rawIdFromChatId(chatId: string): string | undefined {
		const prefix = `${this.id}:`;
		const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
		try {
			return URI.parse(resourceStr).path.substring(1) || undefined;
		} catch {
			return undefined;
		}
	}

	private _activeChatResource(session: AgentHostSessionAdapter): URI {
		const activeSession = this._sessionsService.activeSession.get();
		return activeSession?.sessionId === session.sessionId ? activeSession.activeChat.get().resource : session.resource;
	}

	// -- Lazy session-state subscription seeding -----------------------------

	/**
	 * Idle window before a lazily-created session-state subscription is
	 * released. Each call to {@link _keepSessionStateAlive} resets the timer.
	 * Long enough to absorb the open→config-picker churn while a session view
	 * is active; short enough that closed sessions release within a minute or
	 * so, allowing the agent host to evict their cached restored state.
	 */
	private static readonly SESSION_STATE_SUBSCRIPTION_IDLE_MS = 30_000;

	/**
	 * Pin the state subscription of every currently-visible session (so
	 * host-driven catalog changes flow into `cached.chats` while it is on
	 * screen) and resume the idle-release timer for sessions that have left the
	 * viewport. Driven reactively by {@link ISessionsService.visibleSessions}.
	 */
	private _syncVisibleSessionStatePins(reader: IReader): void {
		const visible = this._sessionsService.visibleSessions.read(reader);
		const nowVisible = new Set<string>();
		for (const session of visible) {
			if (!session) {
				continue;
			}
			for (const cached of this._sessionCache.values()) {
				if (isEqual(cached.resource, session.resource)) {
					nowVisible.add(cached.sessionId);
					break;
				}
			}
		}
		// Pin visible sessions: hold the subscription open, cancelling any pending
		// idle release. All operations are idempotent, so re-running per tick also
		// recovers a subscription that could not be created earlier (e.g. a remote
		// provider that was momentarily disconnected).
		for (const sessionId of nowVisible) {
			this._pinnedSessionStates.add(sessionId);
			this._ensureSessionStateSubscription(sessionId);
			this._sessionStateIdleTimers.deleteAndDispose(sessionId);
		}
		// Unpin sessions that have left the viewport: resume the idle-release
		// timer so the agent host can eventually evict their restored state.
		for (const sessionId of [...this._pinnedSessionStates]) {
			if (!nowVisible.has(sessionId)) {
				this._pinnedSessionStates.delete(sessionId);
				this._keepSessionStateAlive(sessionId);
			}
		}
	}

	/**
	 * Bump the idle-release timer for `sessionId` and lazily create the
	 * underlying subscription if needed. Called from query paths
	 * ({@link getSessionByResource}, {@link getSessionConfig}) that depend on
	 * `_runningSessionConfigs` / `_meta` being in sync but cannot themselves
	 * own a subscription handle.
	 */
	private _keepSessionStateAlive(sessionId: string): void {
		this._ensureSessionStateSubscription(sessionId);
		if (!this._sessionStateSubscriptions.has(sessionId)) {
			return;
		}
		// A visible session's subscription is pinned open; never arm the idle
		// release while it is on screen.
		if (this._pinnedSessionStates.has(sessionId)) {
			this._sessionStateIdleTimers.deleteAndDispose(sessionId);
			return;
		}
		this._sessionStateIdleTimers.set(
			sessionId,
			disposableTimeout(
				() => {
					this._sessionStateIdleTimers.deleteAndDispose(sessionId);
					this._sessionStateSubscriptions.deleteAndDispose(sessionId);
				},
				BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS,
			),
		);
	}

	/**
	 * Lazily acquire a session-state subscription for `sessionId` so that
	 * `_runningSessionConfigs` is seeded from the AHP `SessionState.config`
	 * snapshot. Safe to call repeatedly — no-op once a subscription exists.
	 *
	 * The subscription is reference-counted by {@link IAgentConnection.getSubscription},
	 * so when the session handler is also subscribed (chat content open) this
	 * shares the existing wire subscription rather than opening a new one.
	 */
	private _ensureSessionStateSubscription(sessionId: string): void {
		if (this._sessionStateSubscriptions.has(sessionId)) {
			return;
		}
		const connection = this.connection;
		if (!connection) {
			return;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		// A surfaced-but-un-adopted legacy Copilot CLI session must NOT be
		// subscribed passively: subscribing its session/chat channel triggers an
		// agent-host restore, which adopts (migrates) it. Migration must happen
		// only when the user explicitly opens the session. It renders read-only
		// from its summary until then; the marker clears once it is adopted.
		if (readSessionEhcliAdoptable(this._metaByRawId.get(rawId)?._meta)) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const sessionUri = cached.backendUri;
		const ref = connection.getSubscription(StateComponents.Session, sessionUri, 'BaseAgentHostSessionsProvider.summary');
		const store = new DisposableStore();
		store.add(ref);
		store.add(ref.object.onDidChange(state => {
			this._applySessionStateUpdate(sessionId, state);
		}));
		this._sessionStateSubscriptions.set(sessionId, store);

		const value = ref.object.value;
		if (value && !(value instanceof Error)) {
			this._applySessionStateUpdate(sessionId, value);
		}

		this._hydrateAgentFromDraft(connection, cached, sessionId, sessionUri, store);
	}

	/**
	 * Resume hydration: when a session is (re)loaded and its adapter has no agent
	 * selected, restore the persisted selection from the default chat's
	 * `ChatState.draft.agent` and mirror it onto `session.mode` (the picker's
	 * source of truth).
	 *
	 * The agent is persisted on the chat channel — the session channel
	 * ({@link SessionState}) carries no draft — so we briefly observe the default
	 * chat's state until its draft agent arrives. The subscription is shared and
	 * ref-counted with the chat session handler (no extra wire cost) and lives for
	 * the session-state store's lifetime. Hydration is one-shot: the observer
	 * stops as soon as `mode` is set — by us here, or by a concurrent graduation
	 * seed or user pick (guarded inside
	 * {@link AgentHostSessionAdapter.hydrateSelectedAgent}) — so it neither leaks,
	 * overrides a later selection, nor keeps re-running on every chat update.
	 */
	private _hydrateAgentFromDraft(connection: IAgentConnection, cached: AgentHostSessionAdapter, sessionId: string, sessionUri: URI, store: DisposableStore): void {
		if (cached.mode.get() !== undefined) {
			return;
		}
		const lastDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
		const defaultChatUri = lastDefaultChat ? URI.parse(lastDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
		const chatRef = connection.getSubscription(StateComponents.Chat, defaultChatUri, 'BaseAgentHostSessionsProvider.draftAgent');
		store.add(chatRef);
		const listener = store.add(new MutableDisposable());
		const tryHydrate = () => {
			if (cached.mode.get() === undefined) {
				const chatState = chatRef.object.value;
				const agentUri = chatState && !(chatState instanceof Error) ? chatState.draft?.agent?.uri : undefined;
				if (agentUri) {
					cached.hydrateSelectedAgent(agentUri);
				}
			}
			if (cached.mode.get() !== undefined) {
				listener.clear(); // hydration is one-shot; stop observing
			}
		};
		listener.value = chatRef.object.onDidChange(() => tryHydrate());
		tryHydrate();
	}

	/**
	 * Fan-out for AHP `SessionState` snapshots: keeps both the running
	 * session config and the cached adapter's `_meta` (e.g. git state) in
	 * sync.
	 */
	private _applySessionStateUpdate(sessionId: string, state: SessionState): void {
		const previous = this._lastSessionStates.get(sessionId);
		this._lastSessionStates.set(sessionId, state);
		// Only fire when the inputs to `getCustomAgents` actually change.
		// `SessionState` updates fire for every turn-status / activity / meta
		// change too — firing on all of them caused excessive picker
		// recomputes (and a feedback loop with `setAgent`).
		if (!previous || customizationsChanged(previous, state)) {
			this._reconcileAgentFromState(sessionId, state);
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
		this._seedRunningConfigFromState(sessionId, state);
		this._applySessionMetaFromState(sessionId, state);
		this._applyChatCatalogFromState(sessionId, state);

		if (!previous) {
			// This is the first time we've seen this session and the initial
			// list of changesets are included in the state, so we use that to
			// initialize the changeset catalogue.v Subsequent updates will be
			// handled by handling the ActionType.SessionChangesetsChanged
			// action.
			this._applyChangesetsFromState(sessionId, state);
		}
	}

	/**
	 * Seed the cached adapter's changeset catalogue from an AHP
	 * {@link SessionState}. The catalogue otherwise only flows in via the live
	 * `SessionChangesetsChanged` action, which the host emits only when entries
	 * are added or removed. On restore (e.g. after a reload) nothing mutates, so
	 * that action never fires and the catalogue would stay empty. The restored
	 * `SessionState` snapshot carries the persisted `changesets`, so apply it
	 * here to surface the catalogue immediately.
	 */
	private _applyChangesetsFromState(sessionId: string, state: SessionState): void {
		if (state.changesets === undefined) {
			return;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		cached.updateChangesets(state.changesets);
	}

	/**
	 * Rebase the cached running adapter's selected agent against the host's agent
	 * list from an AHP {@link SessionState}, before the picker is notified. A
	 * session that has moved into an isolated worktree keeps its selection instead
	 * of resetting to the default once the host starts reporting worktree-pathed
	 * agents. See {@link AgentHostSessionAdapter.reconcileSelectedAgent}.
	 */
	private _reconcileAgentFromState(sessionId: string, state: SessionState): void {
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		cached.reconcileSelectedAgent(getEffectiveAgents(state.customizations));
	}

	/**
	 * Reconcile the per-chat catalog of the cached running adapter from an AHP
	 * {@link SessionState}. The adapter exposes `chats`/`mainChat` as
	 * observables, so updating them here is enough for the chat-tab UI to
	 * re-render reactively.
	 */
	private _applyChatCatalogFromState(sessionId: string, state: SessionState): void {
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		cached.applyChatCatalog(state);
	}

	/**
	 * NewSession variant of {@link _applySessionStateUpdate}: writes the
	 * customizations subset and applies git/GitHub metadata to the draft
	 * workspace. Skips {@link _seedRunningConfigFromState} because NewSession
	 * owns its own config via `NewSession._config`.
	 */
	private _handleNewSessionStateUpdate(sessionId: string, state: SessionState): void {
		const previous = this._lastSessionStates.get(sessionId);
		this._lastSessionStates.set(sessionId, state);
		this._newSessions.get(sessionId)?.applySessionMeta(state._meta);
		if (!previous || customizationsChanged(previous, state)) {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
	}

	/**
	 * Cleanup sentinel from {@link NewSession.dispose}: drops the cached
	 * `_lastSessionStates` entry the new session contributed. Fires
	 * `_onDidChangeCustomAgents` so any open picker re-reads and falls
	 * back to the empty list rather than rendering stale agents.
	 */
	private _handleNewSessionStateGone(sessionId: string): void {
		if (this._lastSessionStates.delete(sessionId)) {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
	}

	private _applySessionMetaFromState(sessionId: string, state: SessionState): void {
		const rawId = this._rawIdFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}

		if (cached.setMeta(state._meta)) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	/**
	 * Seed {@link _runningSessionConfigs} from the AHP `SessionState.config`
	 * snapshot. Keeps the full schema + values (including non-mutable ones)
	 * so consumers like the JSONC settings editor can round-trip all values
	 * through a replace dispatch. No-op if structurally equal to avoid spurious
	 * `onDidChangeSessionConfig` fires.
	 */
	private _seedRunningConfigFromState(sessionId: string, state: SessionState): void {
		const stateConfig = state.config;
		if (!stateConfig) {
			return;
		}
		if (Object.keys(stateConfig.schema.properties).length === 0) {
			return;
		}
		const existing = this._runningSessionConfigs.get(sessionId);
		let seeded: ResolveSessionConfigResult;
		if (existing && this._runningSessionConfigResolveSeq.has(sessionId)) {
			const values = { ...existing.values };
			for (const key of Object.keys(existing.schema.properties)) {
				if (Object.hasOwn(stateConfig.values, key)) {
					values[key] = stateConfig.values[key];
				}
			}
			seeded = {
				schema: { type: 'object', properties: { ...existing.schema.properties } },
				values,
			};
		} else {
			seeded = {
				schema: {
					type: 'object',
					properties: {
						...(existing?.schema.properties ?? {}),
						...stateConfig.schema.properties,
					},
				},
				values: {
					...(existing?.values ?? {}),
					...stateConfig.values,
				},
			};
		}
		if (existing && resolvedConfigsEqual(existing, seeded)) {
			return;
		}
		this._runningSessionConfigs.set(sessionId, seeded);
		this._applyWorktreeIsolation(sessionId, seeded.values);
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	/** Mirrors a session's `isolation` pick onto its adapter. See {@link ISession.worktreePending}. */
	private _applyWorktreeIsolation(sessionId: string, values: Record<string, unknown> | undefined): void {
		if (!isWorktreeIsolation(values)) {
			return;
		}
		const rawId = this._rawIdFromChatId(sessionId);
		const adapter = rawId ? this._sessionCache.get(rawId) : undefined;
		adapter?.setWorktreeIsolation(true);
	}

	// -- Session cache management --------------------------------------------

	/**
	 * Opt in to persisting {@link _sessionCache} snapshots under `storageKey`.
	 * Subclasses call this at the **end** of their constructor — once the
	 * identity fields that {@link createAdapter}/{@link resourceSchemeForProvider}/
	 * {@link _adapterOptions} depend on are initialized — because the initial
	 * hydration builds adapters. This is why the base cannot auto-load in its
	 * own constructor. Persisted summaries are hydrated into {@link _sessionCache}
	 * immediately so {@link getSessions} returns them before the first
	 * `listSessions()` round-trip resolves.
	 *
	 * `legacyStorageKey`, when given, is removed so stale entries are discarded.
	 */
	protected _enableSessionCachePersistence(storageKey: string, legacyStorageKey?: string): void {
		if (legacyStorageKey) {
			this._storageService.remove(legacyStorageKey, StorageScope.APPLICATION);
		}
		this._sessionCacheStorageKey = storageKey;
		this._loadCachedSessions();
	}

	/**
	 * Whether {@link _onDidChangeSessions} events should update the persistence
	 * bookkeeping ({@link _cacheDirty} + {@link _metaByRawId}). Default `true`;
	 * the remote provider overrides this to suspend tracking while its cached
	 * sessions are unpublished (offline), so the on-disk snapshot survives.
	 */
	protected _shouldTrackSessionCacheChanges(): boolean {
		return true;
	}

	/** Load persisted session summaries into {@link _sessionCache}. */
	private _loadCachedSessions(): void {
		if (!this._sessionCacheStorageKey) {
			return;
		}
		const parsed = this._storageService.getObject(this._sessionCacheStorageKey, StorageScope.APPLICATION);
		if (!Array.isArray(parsed)) {
			return;
		}
		for (const entry of parsed as readonly ISerializedSessionMetadata[]) {
			const deserialized = deserializeMetadata(entry);
			if (!deserialized) {
				continue;
			}
			const meta = this._adoptSessionMeta(deserialized);
			const rawId = AgentSession.id(meta.session);
			if (this._sessionCache.has(rawId)) {
				continue;
			}
			const cached = this.createAdapter(meta);
			this._sessionCache.set(rawId, cached);
		}
	}

	/**
	 * Persist the current {@link _sessionCache} to storage, capping at
	 * {@link CACHED_SESSIONS_MAX_PER_HOST} most-recently-modified entries.
	 * Mutable fields are read from each adapter's observables and overlaid on
	 * top of the original metadata snapshot captured in {@link _metaByRawId}.
	 */
	private _persistCache(): void {
		if (!this._sessionCacheStorageKey) {
			return;
		}
		const entries: ISerializedSessionMetadata[] = [];
		for (const [rawId, adapter] of this._sessionCache) {
			const base = this._metaByRawId.get(rawId);
			if (!base) {
				continue;
			}
			entries.push(serializeMetadata({
				...base,
				summary: adapter.title.get() || base.summary,
				modifiedTime: adapter.updatedAt.get().getTime(),
				// A project assigned by `backfillProject` lives only on the adapter.
				project: adapter.project ?? base.project,
				status: withSessionStatusFlag(
					withSessionStatusFlag(base.status ?? ProtocolSessionStatus.Idle, ProtocolSessionStatus.IsRead, adapter.isRead.get()),
					ProtocolSessionStatus.IsArchived,
					adapter.isArchived.get()),
				// The adapter's live kind wins over the snapshot: several metadata
				// sources omit `_meta`, and persisting a stale one would resurrect
				// the session as a workspace rooted at the host's scratch cwd.
				...(adapter.isQuickChat.get() ? { _meta: withSessionWorkspaceless(base._meta, true) } : {}),
			}));
		}
		if (entries.length === 0) {
			this._storageService.remove(this._sessionCacheStorageKey, StorageScope.APPLICATION);
			return;
		}
		entries.sort((a, b) => b.modifiedTime - a.modifiedTime);
		const limited = entries.slice(0, CACHED_SESSIONS_MAX_PER_HOST);
		this._storageService.store(this._sessionCacheStorageKey, JSON.stringify(limited), StorageScope.APPLICATION, StorageTarget.USER);
	}

	protected _ensureSessionCache(): void {
		if (this._cacheInitialized) {
			return;
		}
		// `_refreshSessions` owns `_cacheInitialized` — it flips it to `true`
		// only once `listSessions()` actually returns. A call that races
		// before the connection/auth is ready will fail and arm a retry
		// rather than permanently pinning an empty cache. Don't launch a new
		// refresh while one is already in flight or a backoff retry is already
		// scheduled — otherwise every synchronous `getSessions()` during the
		// failure window would hammer the agent/auth path and bypass the
		// backoff.
		if (this._sessionRefreshInFlight || this._sessionRefreshRetry.value) {
			return;
		}
		this._refreshSessions();
	}

	protected async _refreshSessions(announceExistingAsAdded = false): Promise<void> {
		const connection = this.connection;
		if (!connection) {
			return;
		}
		// Cancel any pending retry; this attempt supersedes it.
		this._sessionRefreshRetry.clear();
		this._sessionRefreshInFlight = true;
		try {
			const sessions = await connection.listSessions();
			// A successful return (even an empty list) means the cache is
			// authoritative. Mark it initialized and reset the backoff.
			this._cacheInitialized = true;
			this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
			const currentKeys = new Set<string>();
			const listedAgentProviders = new Set<string>();
			const added: ISession[] = [];
			const changed: ISession[] = [];

			for (const rawMeta of sessions) {
				const meta = this._adoptSessionMeta(rawMeta);
				const rawId = AgentSession.id(meta.session);
				currentKeys.add(rawId);
				const agentProvider = AgentSession.provider(meta.session);
				if (agentProvider) {
					listedAgentProviders.add(agentProvider);
				}

				const existing = this._sessionCache.get(rawId);
				if (existing) {
					if (announceExistingAsAdded) {
						added.push(existing);
					}
					if (this.updateAdapter(existing, meta)) {
						changed.push(existing);
					}
				} else {
					const cached = this.createAdapter(meta);
					this._sessionCache.set(rawId, cached);
					added.push(cached);
				}
			}

			const removed: ISession[] = [];
			// Some hosts briefly omit the just-sent eager session from listSessions.
			// Keep the pending session visible until sendRequest graduates it.
			const pendingRawId = this._pendingSession?.resource.path.replace(/^\//, '');
			// The host aggregates one listing across all of its agents, and an
			// agent that cannot enumerate yet (its SDK is not downloaded) can
			// contribute an empty list rather than failing. When other agents
			// did answer, a namespace with no row at all is therefore *unknown*
			// rather than empty, and evicting it would be a silent data loss —
			// `removed` discards the user's pins and group membership. A wholly
			// empty listing keeps the authoritative-empty contract, since an
			// agent that cannot answer at all rejects (and we never get here).
			// Real deletions still arrive through `deleteSessions` and the
			// `sessionRemoved` notification.
			const evictUnlistedAgents = listedAgentProviders.size === 0;
			for (const [key, cached] of this._sessionCache) {
				if (!currentKeys.has(key)) {
					if (key === pendingRawId) {
						continue;
					}
					if (!evictUnlistedAgents && !listedAgentProviders.has(cached.agentProvider)) {
						continue;
					}
					this._sessionCache.delete(key);
					this._runningSessionConfigs.delete(cached.sessionId);
					this._runningSessionConfigResolveSeq.delete(cached.sessionId);
					removed.push(cached);
				}
			}

			if (added.length > 0 || removed.length > 0 || changed.length > 0) {
				this._onDidChangeSessions.fire({ added, removed, changed });
			}
			this._syncActiveClient();
			for (const cached of removed) {
				(cached as AgentHostSessionAdapter).dispose();
			}
		} catch (err) {
			// The connection / agent may not be ready yet — e.g. the agent
			// throws `AHP_AUTH_REQUIRED` until its token is effective
			// server-side, or there's a transient offline/network error. We
			// must NOT mark the cache initialized (that would conflate a
			// failure with a genuinely-empty success and never recover), and
			// we deliberately do NOT pop a sign-in dialog just to render the
			// list. Instead, retry silently in the background with backoff.
			this._logService.trace(`[AgentHostSessionsProvider] listSessions failed; scheduling retry: ${err}`);
			this._scheduleSessionRefreshRetry(announceExistingAsAdded);
		} finally {
			this._sessionRefreshInFlight = false;
		}
	}

	/**
	 * Arm a backoff retry of {@link _refreshSessions}. Used after a failed
	 * refresh so a transient startup failure self-heals without requiring an
	 * unrelated AHP event (a turn completing, a session being added) to force
	 * a re-fetch. Cancelled on the next successful refresh.
	 */
	private _scheduleSessionRefreshRetry(announceExistingAsAdded: boolean): void {
		const delay = this._sessionRefreshRetryDelay;
		this._sessionRefreshRetryDelay = Math.min(delay * 2, BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MAX_MS);
		this._sessionRefreshRetry.value = disposableTimeout(() => {
			this._refreshSessions(announceExistingAsAdded);
		}, delay);
	}

	/**
	 * Cancel any pending session-refresh retry and reset the backoff. Called
	 * by subclasses when the connection goes away (the stale timer would
	 * otherwise fire against a dead connection and no-op).
	 */
	protected _cancelSessionRefreshRetry(): void {
		this._sessionRefreshRetry.clear();
		this._sessionRefreshRetryDelay = BaseAgentHostSessionsProvider.SESSION_REFRESH_RETRY_MIN_MS;
	}


	/**
	 * Resolve the freshly-committed backend session for an in-flight send.
	 *
	 * The local agent host runs a single provider whose session cache holds
	 * **every** agent-host session type (codex, claude, copilot, …). A send
	 * therefore has to identify *its own* new session by both novelty (a raw id
	 * not present before the send) **and** type: `expectedScheme` is the
	 * `chatResource` scheme (e.g. `agent-host-codex`), so a session of another
	 * type that happens to appear mid-send — a slow codex send racing against a
	 * restored claude session, say — is never mistaken for this send's commit.
	 */
	private async _waitForNewSession(existingKeys: Set<string>, expectedScheme: string, ownRawId: string, token: CancellationToken): Promise<ISession | undefined> {
		// A candidate backend session commits THIS send when it is unclaimed,
		// of the expected type, and either (a) carries this send's own id — the
		// eager/committed id is preserved, so this is the exact match — or
		// (b) is a novel session that is not another in-flight send's own
		// session (the novelty fallback covers backends that assign a fresh
		// id, without letting two concurrent same-scheme sends swap sessions).
		const matches = (rawId: string, scheme: string): boolean => {
			if (scheme !== expectedScheme || this._committingSessionRawIds.has(rawId)) {
				return false;
			}
			if (rawId === ownRawId) {
				return true;
			}
			return !existingKeys.has(rawId) && !this._inFlightNewSessionOwnIds.has(rawId);
		};

		await this._refreshSessions();
		// Prefer this send's own id; fall back to any acceptable novel session.
		const scan = (): ISession | undefined => {
			let fallback: ISession | undefined;
			for (const cached of this._sessionCache.values()) {
				const rawId = cached.resource.path.substring(1);
				if (!matches(rawId, cached.resource.scheme)) {
					continue;
				}
				if (rawId === ownRawId) {
					return cached;
				}
				fallback ??= cached;
			}
			return fallback;
		};
		const immediate = scan();
		if (immediate) {
			this._committingSessionRawIds.add(immediate.resource.path.substring(1));
			return immediate;
		}

		const waitDisposables = new DisposableStore();
		try {
			const sessionPromise = new Promise<ISession | undefined>((resolve) => {
				waitDisposables.add(this._onDidChangeSessions.event(e => {
					// Prefer this send's own id within the batch before falling
					// back to an acceptable novel session.
					const exact = e.added.find(s => s.resource.path.substring(1) === ownRawId && matches(ownRawId, s.resource.scheme));
					const newSession = exact ?? e.added.find(s => matches(s.resource.path.substring(1), s.resource.scheme));
					if (newSession) {
						this._committingSessionRawIds.add(newSession.resource.path.substring(1));
						resolve(newSession);
					}
				}));
				waitDisposables.add(this.onConnectionLost(() => resolve(undefined)));
			});
			return await raceCancellationError(sessionPromise, token);
		} finally {
			waitDisposables.dispose();
		}
	}

	// -- AHP notification / action handlers ----------------------------------

	/**
	 * Wire AHP notification and action listeners on the given connection.
	 * Subclasses call this from their constructor (local) or `setConnection`
	 * (remote), passing a store that bounds the listeners' lifetime.
	 */
	protected _attachConnectionListeners(connection: IAgentConnection, store: DisposableStore): void {
		store.add(connection.onDidNotification(n => {
			if (n.type === NotificationType.SessionAdded) {
				this._handleSessionAdded(n.summary);
			} else if (n.type === NotificationType.SessionRemoved) {
				this._handleSessionRemoved(n.session);
			} else if (n.type === NotificationType.SessionSummaryChanged) {
				this._handleSessionSummaryChanged(n.session, n.changes);
			} else if (n.type === NotificationType.Progress) {
				this._downloadProgress.handleProgress(n);
			}
		}));

		store.add(connection.onDidAction(e => {
			if (e.action.type === ActionType.ChatTurnComplete && isChatAction(e.action)) {
				this._refreshSessions();
			} else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
				this._handleTitleChanged(e.channel, e.action.title);
			} else if (e.action.type === ActionType.SessionIsArchivedChanged && isSessionAction(e.action)) {
				this._handleIsArchivedChanged(e.channel, e.action.isArchived);
			} else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
				this._handleIsReadChanged(e.channel, e.action.isRead);
			} else if (e.action.type === ActionType.SessionConfigChanged && isSessionAction(e.action)) {
				this._handleConfigChanged(e.channel, e.action.config, e.action.replace === true);
			} else if (e.action.type === ActionType.SessionChangesetsChanged && isSessionAction(e.action)) {
				this._handleChangesetsChanged(e.channel, e.action.changesets);
			} else if (e.action.type === ActionType.SessionMetaChanged && isSessionAction(e.action)) {
				this._handleSessionMetaChanged(e.channel, e.action._meta);
			}
		}));
	}

	private _handleSessionAdded(summary: SessionSummary): void {
		const workingDirs = summary.workingDirectories?.map(d => this.mapWorkingDirectoryUri(URI.parse(d)));
		const rawMeta: IAgentSessionMetadata = {
			session: URI.parse(summary.resource),
			startTime: Date.parse(summary.createdAt),
			modifiedTime: Date.parse(summary.modifiedAt),
			summary: summary.title,
			activity: summary.activity,
			status: summary.status,
			...(summary.project ? {
				project: {
					displayName: summary.project.displayName,
					uri: this.mapProjectUri(URI.parse(summary.project.uri))
				}
			} : {}),
			workingDirectories: workingDirs,
			changes: summary.changes,
			// Carry `_meta` so a new adapter seeds its session-kind from it and an
			// existing one can be promoted by it.
			...(summary._meta !== undefined ? { _meta: summary._meta } : {}),
		};

		// Adopt before deriving the cache key so a host that addresses sessions under a different
		// scheme routes to the agent provider, as the refresh and persistence paths do.
		const meta = this._adoptSessionMeta(rawMeta);
		const rawId = AgentSession.id(meta.session);

		const existing = this._sessionCache.get(rawId);
		if (existing) {
			if (this.updateAdapter(existing, meta)) {
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [existing] });
			}
			this._syncActiveClient();
			return;
		}

		const cached = this.createAdapter(meta);
		this._sessionCache.set(rawId, cached);
		this._onDidChangeSessions.fire({ added: [cached], removed: [], changed: [] });
		this._syncActiveClient();
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = AgentSession.id(session);
		const cached = this._removeCachedSession(rawId);
		if (cached) {
			this._onDidChangeSessions.fire({ added: [], removed: [cached], changed: [] });
			cached.dispose();
		}
		this._syncActiveClient();
	}

	private _removeCachedSession(rawId: string, expected?: AgentHostSessionAdapter): AgentHostSessionAdapter | undefined {
		const cached = this._sessionCache.get(rawId);
		if (expected && cached && cached !== expected) {
			return undefined;
		}
		this._metaByRawId.delete(rawId);
		const stateOwner = cached ?? expected;
		if (!stateOwner) {
			return undefined;
		}
		if (cached) {
			this._sessionCache.delete(rawId);
		}
		this._runningSessionConfigs.delete(stateOwner.sessionId);
		this._runningSessionConfigResolveSeq.delete(stateOwner.sessionId);
		this._sessionStateIdleTimers.deleteAndDispose(stateOwner.sessionId);
		this._sessionStateSubscriptions.deleteAndDispose(stateOwner.sessionId);
		this._lastSessionStates.delete(stateOwner.sessionId);
		return cached;
	}

	private _handleTitleChanged(session: string, title: string): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsArchivedChanged(session: string, isArchived: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isArchived.set(isArchived, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsReadChanged(session: string, isRead: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached && cached.isRead.get() !== isRead) {
			cached.isRead.set(isRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleSessionSummaryChanged(session: string, changes: Partial<SessionSummary>): void {
		// Set when a delta clears the adoptable-legacy marker so we can reopen the
		// passive state subscription after the transaction commits (the observable
		// updates in `_ensureSessionStateSubscription` must not run nested in `tx`).
		let reopenStateSubscriptionFor: string | undefined;
		transaction((tx) => {
			const rawId = AgentSession.id(session);
			const cached = this._sessionCache.get(rawId);
			if (!cached) {
				return;
			}

			let didChange = false;

			if (changes.status !== undefined) {
				const uiStatus = mapProtocolStatus(changes.status);
				if (uiStatus !== cached.status.get()) {
					cached.status.set(uiStatus, tx);
					didChange = true;
				}

				const isArchived = !!(changes.status & ProtocolSessionStatus.IsArchived);
				if (isArchived !== cached.isArchived.get()) {
					cached.isArchived.set(isArchived, tx);
					didChange = true;
				}

				const isRead = !!(changes.status & ProtocolSessionStatus.IsRead);
				if (isRead !== cached.isRead.get()) {
					cached.isRead.set(isRead, tx);
					didChange = true;
				}
			}

			if (changes.title !== undefined && changes.title !== cached.title.get()) {
				cached.title.set(changes.title, tx);
				didChange = true;
			}

			// `changes.changes` carries the chip aggregate. The catalogue
			// itself (label / URI template / `changeKind`) arrives via the
			// `SessionChangesetsChanged` action, handled by
			// `_handleChangesetsChanged`.
			if (changes.changes !== undefined && cached.setChangesSummary(changes.changes, tx)) {
				didChange = true;
			}

			if (Object.prototype.hasOwnProperty.call(changes, 'activity') && cached.setActivity(changes.activity, tx)) {
				didChange = true;
			}

			if (Object.prototype.hasOwnProperty.call(changes, '_meta')) {
				// Keep the guard map in sync (mirrors `updateAdapter`) so a cleared
				// adoptable-legacy marker reopens the passive session-state
				// subscription in `_ensureSessionStateSubscription`. Use `hasOwnProperty`
				// (like `activity` above) so an explicit clear to `undefined` applies.
				const storedMeta = this._metaByRawId.get(rawId);
				const wasAdoptable = readSessionEhcliAdoptable(storedMeta?._meta);
				if (storedMeta) {
					this._metaByRawId.set(rawId, { ...storedMeta, _meta: changes._meta });
				}
				if (cached.setMeta(changes._meta, tx)) {
					didChange = true;
				}
				// A cleared adoptable-legacy marker means the session is now a real
				// session; the guard in `_ensureSessionStateSubscription` skipped it
				// while it was adoptable, so reopen the subscription explicitly.
				if (wasAdoptable && !readSessionEhcliAdoptable(changes._meta)) {
					reopenStateSubscriptionFor = cached.sessionId;
				}
			}

			if (didChange) {
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			}
		});

		if (reopenStateSubscriptionFor !== undefined) {
			this._ensureSessionStateSubscription(reopenStateSubscriptionFor);
		}
	}

	private _handleConfigChanged(session: string, config: Record<string, unknown>, replace: boolean): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const sessionId = cached.sessionId;
		const existing = this._runningSessionConfigs.get(sessionId);
		if (existing) {
			this._runningSessionConfigs.set(sessionId, {
				...existing,
				values: replace ? { ...config } : { ...existing.values, ...config },
			});
		} else {
			// Session was restored (e.g. after reload) — create a minimal
			// config entry from the changed values so the picker can render.
			// `replace` vs merge is moot here (no existing values to merge with).
			this._runningSessionConfigs.set(sessionId, {
				schema: { type: 'object', properties: buildMutableConfigSchema(config) },
				values: config,
			});
		}
		this._onDidChangeSessionConfig.fire(sessionId);
	}

	private _handleChangesetsChanged(session: string, changesets: readonly Changeset[] | undefined): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.updateChangesets(changesets);
		}
	}

	private _handleSessionMetaChanged(session: string, meta: Record<string, unknown> | undefined): void {
		const rawId = AgentSession.id(session);
		const cached = this._sessionCache.get(rawId);
		if (cached?.setMeta(meta)) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	/**
	 * Optional URI mapper used when applying diff changes. Subclasses
	 * override to translate remote diff URIs into agent-host URIs.
	 */
	protected _diffUriMapper(): ((uri: URI) => URI) | undefined { return undefined; }
}
