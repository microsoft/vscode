/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout, raceCancellation, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { arrayEquals, structuralEquals } from '../../../../../base/common/equals.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString, markdownStringEqual } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, IReference, MutableDisposable, ReferenceCollection, toDisposable } from '../../../../../base/common/lifecycle.js';
import { mapsStrictEqualIgnoreOrder, ResourceMap, ResourceSet } from '../../../../../base/common/map.js';
import { Schemas } from '../../../../../base/common/network.js';
import { deepClone, equals } from '../../../../../base/common/objects.js';
import { constObservable, derived, derivedOpts, IObservable, IReader, ISettableObservable, ITransaction, mapObservableArrayCached, observableFromEvent, observableSignal, observableSignalFromEvent, observableValueOpts, subtransaction, transaction, waitForState, autorun, observableValue } from '../../../../../base/common/observable.js';
import { basename, dirname, extUriIgnorePathCase, getComparisonKey, isEqual, isEqualOrParent, joinPath, relativePath } from '../../../../../base/common/resources.js';
import { themeColorFromId, ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { findDevContainerSample } from '../../../../../platform/agentHost/common/devContainerSamples.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { newAgentHostSessionUri } from '../../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { getAgentHostChatId } from '../../../../../platform/agentHost/common/agentHostChatIdentity.js';
import { isNativeAgentHost } from '../../../../../platform/agentHost/common/meta/agentHostSessionUrisMeta.js';
import { localize } from '../../../../../nls.js';
import { AgentSession, AuthenticateParams, AuthenticateResult, CODEX_AGENT_PROVIDER_ID, type IAgentSessionChatMetadata, IAgentSessionMetadata, protectedResourcesRequireGitHubCopilotSignIn } from '../../../../../platform/agentHost/common/agent.js';
import { AgentMergeSessionOverrides, AgentMergeSessionState, readAgentMergeFolderState, readAgentMergeFolderStates } from '../../../../../platform/agentHost/common/agentMerge.js';
import { readAgentSdkSetupInfos } from '../../../../../platform/agentHost/common/agentSdkSetup.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { fromAgentHostUri, type AgentHostUriMapper } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentHostTransportFailureReason } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { supportsAgentHostArtifactRemoval } from '../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { supportsAgentHostSessionImport } from '../../../../../platform/agentHost/common/meta/agentHostSessionImportMeta.js';
import { getCustomizationDisabledReason, isCustomizationEnabled, withCustomizationEnablement } from '../../../../../platform/agentHost/common/customizationEnablement.js';
import { readCodexAccountInfo } from '../../../../../platform/agentHost/common/codexAccount.js';
import { buildAnnotationsUri } from '../../../../../platform/agentHost/common/annotationsUri.js';
import { ChangesetKind } from '../../../../../platform/agentHost/common/changesetUri.js';
import { buildOpenSessionLinkForChatResource } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { parseGitHubIssueUrl, parseGitHubPullRequestUrl } from '../../../../../platform/github/common/githubUrls.js';
import { getEffectiveAgents } from '../../../../../platform/agentHost/common/customAgents.js';
import { KNOWN_MODE_VALUES, omitAutomationSessionTemplateConfigValues, SessionConfigKey } from '../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { filterSessionConfigValues, getEffectiveSessionApprovalValue, getSessionApprovalProperty, getSessionWorkspaceProperties, isSessionConfigWritable, readSessionIsolation, validateSessionConfigWrite, writeSessionIsolation } from '../../../../../platform/agentHost/common/sessionConfigProperties.js';
import { applyLegacyAutomationSessionConfig } from '../../../../../platform/agentHost/common/automationConfig.js';
import { migrateLegacyAutopilotConfig } from '../../../../../platform/agentHost/common/agentHostSchema.js';
import { readAgentDevContainerWorktreeMetadata, withAgentDevContainerWorktreeMetadata, type IAgentDevContainerWorktreeMetadata } from '../../../../../platform/agentHost/common/meta/agentDevContainerWorktreeMeta.js';
import { readAgentMessageDelegationMeta } from '../../../../../platform/agentHost/common/meta/agentMessageDelegationMeta.js';
import { readRemoteSessionOrigin, withRemoteSessionOrigin, type IRemoteSessionOrigin } from '../../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { getLegacySessionInitiator, readSessionInitiator, withSessionInitiator, SESSION_INITIATOR_METADATA_KEY } from '../../../../../platform/agentHost/common/meta/agentSessionInitiatorMeta.js';
import type { Implementation } from '../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { getSessionApplication } from '../../../../common/sessionApplication.js';
import { readSessionSandboxPolicy, type ISessionSandboxPolicy } from '../../../../../platform/agentHost/common/meta/agentSandboxPolicyMeta.js';
import { readSessionSandboxState } from '../../../../../platform/agentHost/common/meta/agentSandboxStateMeta.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ResolveSessionConfigResult, type SessionConfigPropertySchema, type SessionConfigSchema, type SessionConfigValueItem } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AgentCustomization, ChangesSummary, ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, type CanvasReference, type CanvasState, type ChatOrigin, type ClientPluginCustomization, Customization, CustomizationEnablementKind, CustomizationType, type CustomizationEnablement, McpServerStatus, MessageKind, ModelSelection, SessionStatus as ProtocolSessionStatus, RootConfigState, RootState, type SessionActiveClient, SessionState, SessionSummary, type Changeset } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { isActionKnownToVersion } from '../../../../../platform/agentHost/common/state/protocol/version/registry.js';
import { ActionType, isChatAction, isSessionAction, NotificationType, type SessionSummaryChanges } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { AgentCapabilities, AgentInfo, buildChatUri, buildDefaultChatUri, buildSubagentChatUri, DEFAULT_CHAT_ID, getSessionChatResource, getSessionRelatedPullRequestUrls, isChatInSessionReadAggregate, isDefaultChatUri, isSessionStatusArchived, isSessionStatusRead, parseChatUri, readSessionCreationReference, readSessionEhcliAdoptable, readFolderGitHubState, readFolderScopeGitState, readSessionExternal, parseSessionGitHubData, readSessionGitHubData, readSessionGitState, readWorkingDirectoryKey, readWorkingDirectoryKeys, readWorkingDirectoryScopeId, readWorkingDirectoryScopeIds, withMigratedSessionGitHubState, withSessionGitHubData, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, ROOT_STATE_URI, SESSION_META_MULTI_ROOT_KEY, SessionMeta, SessionSourceControlOutcome, StateComponents, withSessionCreationReference, withSessionExternal, withSessionMultiRootMetadata, withSessionStatusFlag, withSessionWorkspaceless, withWorkingDirectoryKey, withWorkingDirectoryScopeId, type ChatState, type ChatSummary, type ISessionCreationReference as IProtocolSessionCreationReference, type ISessionGitHubState, type ISessionGitState, type ISessionMultiRootMetadata } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService } from '../../../../../platform/workspace/common/workspaceTrust.js';
import { AgentHostDownloadProgress } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostDownloadProgress.js';
import { IAgentCustomizationScope, IAgentHostActiveClientService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js';
import { AgentHostBackgroundShellOutputs } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostBackgroundShells.js';
import type { IChatBackgroundShell } from '../../../../../workbench/contrib/chat/common/sessionChatPills.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ChatMode } from '../../../../../workbench/contrib/chat/common/chatModes.js';
import { IChatSendRequestOptions, IChatService, type IChatModelReference } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSessionFileChange, IChatSessionFileChange2, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { assertAutomationSessionTemplate, IAutomationSessionTemplate } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationModelConfiguration } from '../../../automations/browser/automationModelConfiguration.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, getChatPermissionLevelFromDefaultConfiguration, isChatPermissionLevel, type IChatDefaultConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { isAutoApprovePolicyRestricted, normalizeSessionConfigValue } from '../../../../../workbench/contrib/chat/common/agentHostConfigPolicy.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { getRegisteredLanguageModels, getVisibleLanguageModelsForTarget, resolveConfiguredModel, resolveModelIdentifier, resolveModelIdentifierFromLanguageModels } from '../../../../../workbench/contrib/chat/common/modelSelection.js';
import { canInitializeCodexWithoutGitHub } from '../../../../../workbench/services/agentHost/browser/codexAccountService.js';
import { buildMutableConfigSchema, IAgentHostMcpServer, IAgentHostSessionsProvider, IAgentMergeClientState, resolvedConfigsEqual } from '../../../../common/agentHostSessionsProvider.js';
import { agentHostSessionWorkspaceKey, buildAgentHostChatWorkspace, type IFolderGitHubInfoResolver } from '../../../../common/agentHostSessionWorkspace.js';
import { USE_WORKTREE_SETTING, isSessionConfigComplete } from '../../../../common/sessionConfig.js';
import { linkKey } from '../../../../common/sessionLinks.js';
import { ChatInteractivity, ChatModelSource, ChatOriginKind, DEFAULT_CHAT_CAPABILITIES, effectiveChatInteractivity, getGitHubPullRequestRefs, getHighestPriorityPullRequestIcon, getSessionOwnedGitHubPullRequestRefs, IChat, IChatCapabilities, IGitHubInfo, IGitHubIssueRef, IGitHubPullRequestRef, isActiveSessionStatus, ISession, ISessionAgentRef, ISessionApplication, ISessionEnvironment, ISessionArtifact, ISessionCanvas, ISessionCapabilities, ISessionChangesSummary, ISessionChatCustomization, ISessionChangeset, ISessionCreationReference, ISessionFileChange, ISessionPreparationProgress, ISessionTurnFileChange, ISessionType, ISessionWorkspace, ISessionWorkspaceBrowseAction, ISideChatSelection, sessionFileChangesEqual, sessionWorkspaceEqual, SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus, SessionStatus, SessionTypeAuthRequirement, toSessionId } from '../../../../services/sessions/common/session.js';
import { dedupeLinks, partitionSessionArtifacts, type IRecordedGitHubReference } from './agentHostSessionArtifacts.js';
import { getWorktreeDiskUsage } from './worktreeDiskUsage.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsRecentWorkspacesService } from '../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { IAutomationSessionConfiguration, IDeleteChatOptions, ISendRequestOptions, ISessionChangeEvent, ISessionConfigurationSnapshot, ISessionModelPickerOptions, ISessionModelsSnapshot, ISessionPermissionOption, ISessionsProviderCreateSessionOptions, ISessionWorktreeConfiguration } from '../../../../services/sessions/common/sessionsProvider.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { computePullRequestRefPresentation } from '../../../github/browser/pullRequestIconStatus.js';
import { IPullRequestIconCache } from '../../../github/browser/pullRequestIconCache.js';
import { computePullRequestIcon, GitHubPullRequestState } from '../../../github/common/types.js';
import { mapProtocolStatus } from './agentHostDiffs.js';
import { createActiveSessionSubscriptionObs, createChangesets, createChatChangesets, type IAgentHostCurrentTurnChanges } from './agentHostSessionChangesets.js';
import { createSessionOutputObs, ISessionOutputObs } from './agentHostSessionFiles.js';
import { getAgentHostSessionPermissionConfig, getAgentHostSessionPermissionId, getAgentHostSessionPermissionOptions } from './agentHostSessionPermissions.js';

const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = 'sessions.agentHost.sessionConfigPicker.selectedValues';
const STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS = 'sessions.agentHost.sessionConfigPicker.workspaceIsolations';
const UNSAFE_SESSION_CONFIG_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SESSION_CHANGE_NOTIFICATION_DEBOUNCE_MS = 50;

/**
 * Session config properties derived from settings (see `_derivedNewSessionConfig`),
 * with the value that clears them on the agent host.
 */
const SETTINGS_DERIVED_SESSION_CONFIG_CLEARED_VALUES: Readonly<Record<string, unknown>> = {
	[SessionConfigKey.WorktreeBranchPrefix]: '',
	[SessionConfigKey.WorktreeIncludeFiles]: [],
	[SessionConfigKey.WorktreeSymlinkFolders]: [],
};

function mergeSessionChangeEvents(events: readonly ISessionChangeEvent[]): ISessionChangeEvent {
	const changes = new Map<string, { added?: ISession; removed?: ISession; changed?: ISession }>();
	for (const event of events) {
		for (const session of event.added) {
			changes.set(session.sessionId, { removed: changes.get(session.sessionId)?.removed, added: session });
		}
		for (const session of event.removed) {
			changes.set(session.sessionId, { removed: session });
		}
		for (const session of event.changed) {
			const change = changes.get(session.sessionId);
			if (change?.removed && !change.added) {
				continue;
			}
			if (change?.added) {
				change.added = session;
			} else {
				changes.set(session.sessionId, { changed: session });
			}
		}
	}

	const added: ISession[] = [];
	const removed: ISession[] = [];
	const changed: ISession[] = [];
	for (const change of changes.values()) {
		if (change.added) {
			added.push(change.added);
		}
		if (change.removed) {
			removed.push(change.removed);
		}
		if (change.changed) {
			changed.push(change.changed);
		}
	}
	return {
		added,
		removed,
		changed,
	};
}

function debounceSessionChangeEvents(notifications: Event<ISessionChangeEvent>, immediate: Event<ISessionChangeEvent>, disposable: DisposableStore): Event<ISessionChangeEvent> {
	const event: Event<ISessionChangeEvent> = (listener, thisArgs) => {
		const store = new DisposableStore();
		let pending: ISessionChangeEvent[] | undefined;
		store.add(toDisposable(() => {
			pending?.splice(0);
			pending = undefined;
		}));

		const takePending = (event?: ISessionChangeEvent): ISessionChangeEvent | undefined => {
			if (!pending?.length) {
				pending = undefined;
				return event;
			}
			const events = pending?.splice(0) ?? [];
			pending = undefined;
			if (event) {
				events.push(event);
			}
			return mergeSessionChangeEvents(events);
		};
		const debounced = Event.debounce<ISessionChangeEvent, ISessionChangeEvent[]>(notifications, (events, event) => {
			pending = events ?? [];
			pending.push(event);
			return pending;
		}, SESSION_CHANGE_NOTIFICATION_DEBOUNCE_MS, false, false, undefined, store);
		const onDebounced = Event.filter<ISessionChangeEvent, undefined>(
			Event.map(debounced, () => takePending(), store),
			(event): event is ISessionChangeEvent => event !== undefined,
			store,
		);
		store.add(Event.any(onDebounced, Event.map(immediate, event => takePending(event) ?? event, store))(listener, thisArgs));
		return store;
	};
	return Event.map(event, event => event, disposable);
}

// Well-known config chips whose last-resolved schemas are cached and seeded into
// new drafts, so they stay visible (disabled) while a draft re-resolves rather
// than blanking then reappearing.
const SEEDED_CONFIG_SCHEMA_KEYS = [SessionConfigKey.Isolation, SessionConfigKey.Branch, 'target', 'baseBranch'] as const;

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

interface IAgentHostSessionDiscoveryMetadata {
	readonly summary?: string;
	readonly modifiedTime?: number;
	/** `null` is a discovery-owned absent project; `undefined` leaves the project to the host. */
	readonly project?: IAgentSessionMetadata['project'] | null;
	readonly initiator?: Implementation;
}

/**
 * Serialized shape of an {@link IAgentSessionMetadata} suitable for
 * persisting via {@link IStorageService}. URIs are stored as strings and only
 * lightweight metadata needed to render the session list is retained.
 */
interface ISerializedSessionMetadata {
	readonly session: string;
	readonly provider?: string;
	readonly initiator?: Implementation;
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
	readonly changes?: ChangesSummary;
	readonly chats?: readonly {
		readonly chat: string;
		readonly summary?: string;
		readonly kind: 'default' | 'peer';
		readonly origin?: ChatOrigin;
		readonly interactivity?: ProtocolChatInteractivity;
		readonly archived?: boolean;
		readonly isRead?: boolean;
		readonly changes?: ChangesSummary;
	}[];
	/** Session folder's GitHub state, written by earlier versions; migrated on read. */
	readonly github?: ISessionGitHubState;
	/** GitHub state of each session folder, keyed by working-directory key. */
	readonly githubData?: Record<string, ISessionGitHubState>;
	readonly workingDirectoryKeys?: Record<string, string>;
	readonly workingDirectoryScopeIds?: Record<string, string>;
	/**
	 * Whether the session is a workspace-less quick chat. Persisted because the
	 * adapter seeds its session-kind from this tag at construction (see
	 * {@link AgentHostSessionAdapter}); dropping it on restore would leak the
	 * host's scratch dir as a workspace folder until the next listing arrives.
	 */
	readonly workspaceless?: boolean;
	readonly external?: boolean;
	readonly multiRoot?: ISessionMultiRootMetadata;
	readonly createdBySession?: IProtocolSessionCreationReference;
	readonly remoteOrigin?: IRemoteSessionOrigin;
	readonly devContainerWorktree?: IAgentDevContainerWorktreeMetadata;
	readonly discovery?: {
		readonly summary?: string;
		readonly modifiedTime?: number;
		readonly project?: ISerializedSessionMetadata['project'] | null;
		readonly initiator?: Implementation;
	};
}

/**
 * Only these bits are cached. The activity bits are live state, and restoring them
 * would show a stale spinner until the next `listSessions()` lands — indefinitely
 * for an unreachable remote host, which keeps republishing its cached snapshot.
 */
const SESSION_STATUS_FLAG_MASK = ProtocolSessionStatus.IsRead | ProtocolSessionStatus.IsArchived;

function serializeMetadata(meta: IAgentSessionMetadata, discovery?: IAgentHostSessionDiscoveryMetadata): ISerializedSessionMetadata {
	const gitHubData = readSessionGitHubData(meta._meta);
	const workingDirectoryKeys = readWorkingDirectoryKeys(meta._meta);
	const workingDirectoryScopeIds = readWorkingDirectoryScopeIds(meta._meta);
	return {
		session: meta.session.toString(),
		provider: meta.provider,
		initiator: readSessionInitiator(meta),
		startTime: meta.startTime,
		modifiedTime: meta.modifiedTime,
		summary: meta.summary,
		workingDirectory: meta.workingDirectories?.[0]?.toString(),
		status: meta.status !== undefined ? meta.status & SESSION_STATUS_FLAG_MASK : undefined,
		project: meta.project ? { uri: meta.project.uri.toString(), displayName: meta.project.displayName } : undefined,
		changes: meta.changes,
		chats: meta.chats?.map(chat => ({
			chat: chat.chat.toString(),
			summary: chat.summary,
			kind: chat.kind,
			origin: chat.origin,
			...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
			...(chat.archived === true ? { archived: true } : {}),
			isRead: chat.isRead,
			...(chat.changes !== undefined ? { changes: chat.changes } : {}),
		})),
		githubData: gitHubData.size > 0 ? Object.fromEntries(gitHubData) : undefined,
		workingDirectoryKeys: workingDirectoryKeys.size > 0 ? Object.fromEntries(workingDirectoryKeys) : undefined,
		workingDirectoryScopeIds: workingDirectoryScopeIds.size > 0 ? Object.fromEntries(workingDirectoryScopeIds) : undefined,
		workspaceless: readSessionWorkspaceless(meta._meta) || undefined,
		external: readSessionExternal(meta._meta) || undefined,
		multiRoot: readSessionMultiRootMetadata(meta._meta),
		createdBySession: readSessionCreationReference(meta._meta),
		remoteOrigin: readRemoteSessionOrigin(meta),
		devContainerWorktree: readAgentDevContainerWorktreeMetadata(meta._meta),
		discovery: discovery ? {
			summary: discovery.summary,
			modifiedTime: discovery.modifiedTime,
			project: discovery.project ? { uri: discovery.project.uri.toString(), displayName: discovery.project.displayName } : discovery.project,
			initiator: discovery.initiator,
		} : undefined,
	};
}

function deserializeDiscoveryMetadata(raw: ISerializedSessionMetadata['discovery'], logService: ILogService): IAgentHostSessionDiscoveryMetadata | undefined {
	try {
		return raw ? {
			summary: raw.summary,
			modifiedTime: raw.modifiedTime,
			project: raw.project ? { uri: URI.parse(raw.project.uri), displayName: raw.project.displayName } : raw.project,
			initiator: readSessionInitiator({ _meta: { [SESSION_INITIATOR_METADATA_KEY]: raw.initiator } }),
		} : undefined;
	} catch (error) {
		logService.warn('[AgentHostSessionsProvider] Reading cached discovery metadata failed.', error);
		return undefined;
	}
}

function sessionProjectsEqual(a: IAgentSessionMetadata['project'] | null, b: IAgentSessionMetadata['project'] | null): boolean {
	return a === b || (!!a && !!b && a.displayName === b.displayName && isEqual(a.uri, b.uri));
}

function deserializeMetadata(raw: ISerializedSessionMetadata): IAgentSessionMetadata | undefined {
	try {
		let _meta = withSessionWorkspaceless(undefined, raw.workspaceless === true);
		const initiator = readSessionInitiator({ _meta: { [SESSION_INITIATOR_METADATA_KEY]: raw.initiator } });
		if (initiator) {
			_meta = withSessionInitiator(_meta, initiator);
		}
		_meta = withSessionExternal(_meta, raw.external === true);
		_meta = withSessionMultiRootMetadata(_meta, readSessionMultiRootMetadata({ [SESSION_META_MULTI_ROOT_KEY]: raw.multiRoot }));
		_meta = withSessionGitHubData(_meta, parseSessionGitHubData(raw.githubData));
		for (const [workingDirectory, folderKey] of Object.entries(raw.workingDirectoryKeys ?? {})) {
			_meta = withWorkingDirectoryKey(_meta, workingDirectory, folderKey);
		}
		for (const [scopeKey, scopeId] of Object.entries(raw.workingDirectoryScopeIds ?? {})) {
			try {
				const workingDirectories = JSON.parse(scopeKey);
				if (Array.isArray(workingDirectories) && workingDirectories.every((directory): directory is string => typeof directory === 'string')) {
					_meta = withWorkingDirectoryScopeId(_meta, workingDirectories, scopeId);
				}
			} catch {
				continue;
			}
		}
		if (raw.github && raw.workingDirectory) {
			_meta = withMigratedSessionGitHubState(_meta, fromAgentHostUri(URI.parse(raw.workingDirectory)).toString(), raw.github);
		}
		if (raw.createdBySession) {
			_meta = withSessionCreationReference(_meta, raw.createdBySession);
		}
		if (raw.remoteOrigin) {
			const originMeta = withRemoteSessionOrigin(_meta, raw.remoteOrigin);
			if (readRemoteSessionOrigin({ _meta: originMeta })) {
				_meta = originMeta;
			}
		}
		if (raw.devContainerWorktree) {
			_meta = withAgentDevContainerWorktreeMetadata(_meta, raw.devContainerWorktree.handle);
		}
		return {
			session: URI.parse(raw.session),
			provider: raw.provider,
			startTime: raw.startTime,
			modifiedTime: raw.modifiedTime,
			summary: raw.summary,
			workingDirectories: raw.workingDirectory ? [URI.parse(raw.workingDirectory)] : undefined,
			status: deserializeStatus(raw),
			project: raw.project ? { uri: URI.parse(raw.project.uri), displayName: raw.project.displayName } : undefined,
			changes: raw.changes,
			chats: raw.chats?.map(chat => ({
				chat: URI.parse(chat.chat),
				summary: chat.summary,
				kind: chat.kind,
				origin: chat.origin,
				...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
				...(chat.archived === true ? { archived: true } : {}),
				isRead: chat.isRead,
				...(chat.changes !== undefined ? { changes: chat.changes } : {}),
			})),
			...(_meta ? { _meta } : {}),
		};
	} catch {
		return undefined;
	}
}

function chatMetadataFromSummary(summary: Pick<SessionSummary, 'chats' | 'defaultChat'>): readonly IAgentSessionChatMetadata[] | undefined {
	return summary.chats?.map(chat => ({
		chat: URI.parse(chat.resource),
		summary: chat.title,
		kind: summary.defaultChat === chat.resource || isDefaultChatUri(chat.resource) ? 'default' : 'peer',
		origin: chat.origin,
		...(chat.interactivity !== undefined ? { interactivity: chat.interactivity } : {}),
		...(chat.status !== undefined ? {
			archived: isSessionStatusArchived(chat.status),
			isRead: isSessionStatusRead(chat.status),
		} : {}),
		...(chat.archived === true ? { archived: true } : {}),
		...(chat.changes !== undefined ? { changes: chat.changes } : {}),
	}));
}

/** Normalizes the protocol's optional counts into the Sessions model's summary shape. */
function toSessionChangesSummary(changes: ChangesSummary): ISessionChangesSummary {
	return {
		additions: changes.additions ?? 0,
		deletions: changes.deletions ?? 0,
		files: changes.files ?? 0,
	};
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

type SessionIsolation = 'folder' | 'worktree';

function isSessionIsolation(value: unknown): value is SessionIsolation {
	return value === 'folder' || value === 'worktree';
}

function isGloballyRememberedSessionConfigKey(property: string): boolean {
	return property !== SessionConfigKey.Branch
		&& property !== SessionConfigKey.Isolation
		&& property !== 'target'
		&& property !== 'baseBranch'
		&& property !== 'effectiveApprovalMode'
		&& property !== 'availableApprovalModes'
		&& property !== 'effectiveAutoTier'
		&& property !== SessionConfigKey.SandboxEnabled
		&& !UNSAFE_SESSION_CONFIG_KEYS.has(property);
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
			x.icon?.id === y.icon?.id &&
			x.state === y.state &&
			x.liveState === y.liveState &&
			x.title === y.title &&
			x.createdByThisSession === y.createdByThisSession &&
			x.recordedReferenceId === y.recordedReferenceId) &&
		a.pullRequest?.number === b.pullRequest?.number &&
		a.pullRequest?.icon?.id === b.pullRequest?.icon?.id &&
		a.pullRequest?.state === b.pullRequest?.state &&
		a.pullRequest?.liveState === b.pullRequest?.liveState &&
		a.pullRequest?.title === b.pullRequest?.title &&
		a.pullRequest?.baseRefOid === b.pullRequest?.baseRefOid &&
		a.pullRequest?.headRefOid === b.pullRequest?.headRefOid &&
		arrayEquals(a.issues ?? [], b.issues ?? [], (x, y) =>
			x.owner === y.owner &&
			x.repo === y.repo &&
			x.number === y.number &&
			isEqual(x.uri, y.uri) &&
			x.title === y.title &&
			x.recordedReferenceId === y.recordedReferenceId);
}

function dateEquals(a: Date | undefined, b: Date | undefined): boolean {
	return a?.getTime() === b?.getTime();
}

function markdownStringEquals(a: IMarkdownString | undefined, b: IMarkdownString | undefined): boolean {
	return a === b || !!a && !!b && markdownStringEqual(a, b);
}

/**
 * A GitHub link fed into the ref mappers. Recorded entries arrive as a full
 * {@link IRecordedGitHubReference} and carry their stable removal id; entries
 * discovered from git or session state supply only a url.
 */
type IGitHubReferenceSource = Partial<IRecordedGitHubReference> & { readonly url: string };

/** Maps GitHub issue records from the session metadata to issue references. */
function toGitHubIssueRefs(issues: readonly IGitHubReferenceSource[]): readonly IGitHubIssueRef[] | undefined {
	const refs: IGitHubIssueRef[] = [];
	for (const issue of issues) {
		const reference = parseGitHubIssueUrl(issue.url);
		if (reference) {
			refs.push({
				...reference,
				uri: URI.parse(issue.url),
				...(issue.title ? { title: issue.title } : {}),
				...(issue.recordedReferenceId ? { recordedReferenceId: issue.recordedReferenceId } : {}),
			});
		}
	}
	return refs.length > 0 ? refs : undefined;
}

/**
 * Maps session pull request URLs to references, preserving recency order.
 *
 * Recorded entries retain their stable removal IDs. A discovered association
 * makes a matching recorded entry session-owned without dropping its identity.
 */
function toGitHubPullRequestRefs(state: ISessionGitHubState | undefined, pullRequests: readonly IGitHubReferenceSource[]): readonly IGitHubPullRequestRef[] | undefined {
	const refs: IGitHubPullRequestRef[] = [];
	for (const pullRequest of pullRequests) {
		const reference = parseGitHubPullRequestUrl(pullRequest.url);
		if (reference) {
			refs.push({
				...reference,
				uri: URI.parse(pullRequest.url),
				state: state?.pullRequestStateUrl && linkKey(state.pullRequestStateUrl) === linkKey(pullRequest.url) ? state.pullRequestState : undefined,
				...(pullRequest.title ? { title: pullRequest.title } : {}),
				...(pullRequest.recordedReferenceId ? { recordedReferenceId: pullRequest.recordedReferenceId } : {}),
				createdByThisSession: pullRequest.recordedReferenceId ? pullRequest.isArtifact === true : true,
			});
		}
	}
	return refs.length > 0 ? refs : undefined;
}

/** The host keys folder state by backend working directory; client folders carry mapped URIs. */
function toFolderGitHubKey(meta: SessionMeta | undefined, workingDirectory: URI): string {
	const backendWorkingDirectory = fromAgentHostUri(workingDirectory).toString();
	return readWorkingDirectoryKey(meta, backendWorkingDirectory);
}

function findUniqueIgnorePathCaseKey<T>(entries: ReadonlyMap<string, T>, workingDirectory: string): string | undefined {
	const comparisonKey = extUriIgnorePathCase.getComparisonKey(URI.parse(workingDirectory));
	let match: string | undefined;
	for (const key of entries.keys()) {
		if (extUriIgnorePathCase.getComparisonKey(URI.parse(key)) !== comparisonKey) {
			continue;
		}
		if (match !== undefined) {
			return undefined;
		}
		match = key;
	}
	return match;
}

function readCompatibleFolderGitHubState(meta: SessionMeta | undefined, workingDirectory: URI, folderKey: string): ISessionGitHubState | undefined {
	const folders = readSessionGitHubData(meta);
	const state = folders.get(folderKey);
	if (state) {
		return state;
	}
	const backendWorkingDirectory = fromAgentHostUri(workingDirectory).toString();
	// A key the host published is authoritative: a folder differing only in case is another folder.
	if (readWorkingDirectoryKeys(meta).has(backendWorkingDirectory)) {
		return undefined;
	}
	const fallbackKey = findUniqueIgnorePathCaseKey(folders, backendWorkingDirectory);
	return fallbackKey ? folders.get(fallbackKey) : undefined;
}

/** The folder a chat's Agent Merge settings belong to; see {@link AgentHostSessionAdapter.getAgentMergeFolder}. */
interface IAgentMergeFolder {
	/** Host-authored key of the folder. */
	readonly folderKey: string | undefined;
	/** Key of the session folder, whose settings earlier versions stored in their own keys. */
	readonly sessionFolderKey: string | undefined;
	/** Backend working directory of the folder, which the host keys its settings by. */
	readonly workingDirectory: string | undefined;
}

/** Links of the pull requests any folder of the session discovered for its own working directory. */
function getFolderPullRequestLinks(meta: SessionMeta | undefined): ReadonlySet<string> {
	const links = new Set<string>();
	for (const state of readSessionGitHubData(meta).values()) {
		for (const url of getSessionRelatedPullRequestUrls(state)) {
			links.add(linkKey(url));
		}
	}
	return links;
}

/**
 * Maps session metadata to the GitHub info of the folder with working-directory
 * key `folderKey`. The session folder also falls back to the session's Git state
 * and adopts recorded links for its repository, except pull requests another
 * folder of the session discovered for itself.
 */
function toGitHubInfo(meta: SessionMeta | undefined, workingDirectory: URI | undefined, folderKey: string | undefined, isSessionFolder: boolean): IGitHubInfo | undefined {
	const state = workingDirectory && folderKey ? readCompatibleFolderGitHubState(meta, workingDirectory, folderKey) : readFolderGitHubState(meta, folderKey);
	// The session's Git state describes the session folder.
	const gitState = isSessionFolder ? readSessionGitState(meta) : undefined;
	const discoveredPullRequests = dedupeLinks(getSessionRelatedPullRequestUrls(state))
		.map(url => ({ url }));
	// Recorded links carry no folder, so only the session folder adopts them; other folders report only their own associations.
	const recorded = isSessionFolder ? partitionSessionArtifacts(meta) : { pullRequests: [], issues: [] };
	// A pull request only another folder discovered, such as one a peer chat created from its worktree, belongs to that folder.
	const folderPullRequests = isSessionFolder ? getFolderPullRequestLinks(meta) : new Set<string>();
	const ownPullRequests = new Set(discoveredPullRequests.map(pullRequest => linkKey(pullRequest.url)));
	const recordedPullRequests = recorded.pullRequests.filter(pullRequest => ownPullRequests.has(linkKey(pullRequest.url)) || !folderPullRequests.has(linkKey(pullRequest.url)));
	const recordedIssues = recorded.issues;

	const allPullRequests = [...(toGitHubPullRequestRefs(state, recordedPullRequests) ?? [])];
	const pullRequestLinks = new Map(allPullRequests.map((pullRequest, index) => [linkKey(pullRequest.uri.toString()), index]));
	for (const pullRequest of discoveredPullRequests) {
		const existingIndex = pullRequestLinks.get(linkKey(pullRequest.url));
		if (existingIndex !== undefined) {
			allPullRequests[existingIndex] = { ...allPullRequests[existingIndex], createdByThisSession: true };
			continue;
		}
		const discovered = toGitHubPullRequestRefs(state, [pullRequest])?.[0];
		if (discovered) {
			pullRequestLinks.set(linkKey(pullRequest.url), allPullRequests.length);
			allPullRequests.push(discovered);
		}
	}
	// Another folder's repository comes only from its own state, never from session-wide artifacts.
	const repository = state?.owner && state.repo
		? { owner: state.owner, repo: state.repo }
		: gitState?.githubOwner && gitState.githubRepo
			? { owner: gitState.githubOwner, repo: gitState.githubRepo }
			: isSessionFolder ? allPullRequests?.[0] : undefined;

	if (!repository) {
		return undefined;
	}

	// Repository metadata stays scoped to the checkout; chat pills resolve recorded links independently.
	const belongsToRepository = (ref: { readonly owner: string; readonly repo: string }) =>
		ref.owner.toLowerCase() === repository.owner.toLowerCase() && ref.repo.toLowerCase() === repository.repo.toLowerCase();

	const pullRequests = allPullRequests?.filter(belongsToRepository);
	const pullRequest = pullRequests?.find(pullRequest => pullRequest.createdByThisSession);
	const issues = toGitHubIssueRefs(recordedIssues)?.filter(belongsToRepository);

	return {
		owner: repository.owner,
		repo: repository.repo,
		pullRequests: pullRequests?.length ? pullRequests : undefined,
		pullRequest: pullRequest ? {
			number: pullRequest.number,
			uri: pullRequest.uri,
			state: pullRequest.state,
		} : undefined,
		issues: issues?.length ? issues : undefined,
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
	readonly environment: string;
	/** Loading observable wired to the provider's authentication-pending state. */
	readonly loading: IObservable<boolean>;
	/** Builds the session workspace from session metadata; provider-specific (icon, providerLabel, requiresWorkspaceTrust). */
	readonly buildWorkspace: (project: IAgentSessionMetadata['project'], workingDirectories: readonly URI[] | undefined, gitHubInfo: IObservable<IGitHubInfo | undefined>, gitState: ISessionGitState | undefined) => ISessionWorkspace | undefined;
	/** Optional URI mapping for host-side file resources (remote uses `toAgentHostUri`; local uses identity). */
	readonly mapDiffUri?: AgentHostUriMapper;
	/** Optional URI mapping for host-side working directories. */
	readonly mapWorkingDirectoryUri?: AgentHostUriMapper;
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
	/** Keeps normally interactive chats draftable while their connection is unavailable. */
	readonly allowOfflineDrafts?: IObservable<boolean>;
	/**
	 * Returns the agent connection for the session, tracking replacements when a reader is provided.
	 */
	readonly getConnection: (reader?: IReader) => IAgentConnection | undefined;
	/**
	 * Maps a client chat resource of this provider to its backend chat channel URI,
	 * for operations that name a chat to the host.
	 */
	readonly getBackendChatResource?: (chat: URI) => URI | undefined;
	/** Agent capability lookup shared by every adapter owned by this provider. */
	readonly agentCapabilities: IObservable<ReadonlyMap<string, AgentCapabilities | undefined> | undefined>;
	/** Whether this provider can present server-published canvas channels for the agent. */
	readonly supportsCanvasPresentation?: (agentProvider: string) => boolean;
	/**
	 * The scheme the host addresses this session under, when it differs from the agent provider
	 * (cloud sandbox: provider `copilot`, sessions `ahp-session:/<id>`). Defaults to the provider.
	 */
	readonly backendSessionScheme?: string;
	/** Maps a backend session URI to the client resource used by this host. */
	readonly mapBackendSessionResource: (resource: URI) => URI;
	/** `Changeset.changeKind` the Changes view selects by default. Defaults to `branch`. */
	readonly defaultChangesetKind?: ChangesetKind.Branch | ChangesetKind.Uncommitted | ChangesetKind.Session;
	/** Connection state from the backing remote provider, when there is one. */
	readonly connectionStatus?: IObservable<RemoteAgentHostConnectionStatus>;
	/** Keeps reported activity separate from connection availability for remotely discoverable sessions. */
	readonly preserveStatusWhenDisconnected?: boolean;
	/** Overrides the host's external-session classification. */
	readonly externalSessionState?: (resource: URI, store: DisposableStore) => IObservable<boolean>;
	/** Uses the session title for the main conversation instead of the host's default chat label. */
	readonly useSessionTitleForDefaultChat?: boolean;
}

/**
 * Projects the backing provider's transport status onto the session-facing
 * shape, preserving the machine-readable disconnect reason so consumers can
 * tell a resolvable outage (a stopped host) from a generic one.
 *
 * Returns `undefined` when the provider has no remote transport, which is how
 * a local session reports "no remote host" rather than "host unavailable".
 */
function toSessionRemoteConnectionStatus(owner: object, connectionStatus: IObservable<RemoteAgentHostConnectionStatus> | undefined): IObservable<SessionRemoteConnectionStatus> | undefined {
	if (!connectionStatus) {
		return undefined;
	}
	return derived<SessionRemoteConnectionStatus>(owner, reader => {
		const status = connectionStatus.read(reader);
		switch (status.kind) {
			case 'connected':
			case 'connecting':
			case 'incompatible':
				return { kind: status.kind };
			case 'reconnecting':
				// Omit the key rather than carrying an explicit `undefined`, so a
				// plain reconnect stays structurally equal to the no-deadline case.
				return status.nextAttemptAt === undefined
					? { kind: status.kind }
					: { kind: status.kind, nextAttemptAt: status.nextAttemptAt };
			case 'disconnected':
				switch (status.reason) {
					case AgentHostTransportFailureReason.Unknown:
						return { kind: status.kind, reason: SessionRemoteConnectionFailureReason.Unknown };
					case AgentHostTransportFailureReason.HostNotRunning:
						return { kind: status.kind, reason: SessionRemoteConnectionFailureReason.HostNotRunning };
				}
		}
	});
}

/**
 * An active status is only meaningful while the backing agent host can make
 * progress. Keep the source status intact so it resumes when the host does,
 * but present an error rather than a perpetual activity spinner while it is
 * known to be unreachable.
 */
function toPresentedSessionStatus(owner: object, status: IObservable<SessionStatus>, connectionStatus: IObservable<RemoteAgentHostConnectionStatus> | undefined): IObservable<SessionStatus> {
	if (!connectionStatus) {
		return status;
	}
	return derived(owner, reader => {
		const value = status.read(reader);
		const connection = connectionStatus.read(reader);
		return isActiveSessionStatus(value) && (connection.kind === 'disconnected' || connection.kind === 'incompatible')
			? SessionStatus.Error
			: value;
	});
}

type AgentHostSessionStateMetadata = Pick<IAgentSessionMetadata, 'project' | 'workingDirectories' | '_meta'>;
type AgentHostSessionSummaryWorkspaceMetadata = {
	project?: IAgentSessionMetadata['project'];
	workingDirectories?: IAgentSessionMetadata['workingDirectories'];
};

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

function toProtocolChatInteractivity(interactivity: ChatInteractivity): ProtocolChatInteractivity {
	switch (interactivity) {
		case ChatInteractivity.ReadOnly:
			return ProtocolChatInteractivity.ReadOnly;
		case ChatInteractivity.Hidden:
			return ProtocolChatInteractivity.Hidden;
		default:
			return ProtocolChatInteractivity.Full;
	}
}

function applyConnectionInteractivity(interactivity: ChatInteractivity, readOnly: boolean, allowOfflineDrafts: boolean): ChatInteractivity {
	return readOnly && interactivity === ChatInteractivity.Full
		? allowOfflineDrafts ? ChatInteractivity.DraftOnly : ChatInteractivity.ReadOnly
		: interactivity;
}

/** Per-chat views derived from the session's parsed output stream and metadata. */
interface IChatOutputObs {
	readonly lastTurnChanges: IObservable<readonly ISessionTurnFileChange[]>;
	readonly customizations: IObservable<readonly ISessionChatCustomization[]>;
	readonly canvases: IObservable<readonly ISessionCanvas[] | undefined>;
	/** Resolves the GitHub info each folder of the chat's workspace reports. */
	readonly getFolderGitHubInfo: (reader: IReader) => IFolderGitHubInfoResolver;
	/** Resolves the Git state persisted for the chat's working-directory scope. */
	readonly getScopeGitState: (reader: IReader, workingDirectories: readonly string[] | undefined) => ISessionGitState | undefined;
}

class AgentHostSessionCanvas implements ISessionCanvas {
	readonly resource: URI;
	readonly instanceId: string | undefined;
	readonly title: string;
	readonly status: string | undefined;
	readonly source: URI | undefined;

	constructor(
		resource: URI,
		canvas: CanvasState | undefined,
		@ILogService logService: ILogService,
	) {
		this.resource = resource;
		this.instanceId = canvas?.instanceId;
		this.title = canvas?.title ?? canvas?.extensionName ?? canvas?.canvasId ?? localize('canvas.pendingTitle', "Canvas");
		this.status = canvas?.status;
		if (canvas?.url !== undefined) {
			try {
				const source = URI.parse(canvas.url, true);
				if ((source.scheme === Schemas.http || source.scheme === Schemas.https) && source.authority) {
					this.source = source;
				} else {
					logService.warn('[AgentHostSessionCanvas] Unsupported canvas source');
				}
			} catch {
				logService.warn('[AgentHostSessionCanvas] Invalid canvas source');
			}
		}
	}
}

/** Shares one retained session-state subscription across all observed peer-chat details. */
class SessionChatDetailsReferenceCollection extends ReferenceCollection<void> {

	private readonly _activeSessions = new Set<string>();

	constructor(
		private readonly _onFirstReference: (sessionId: string) => void,
		private readonly _onLastReference: (sessionId: string) => void,
	) {
		super();
	}

	hasReferences(sessionId: string): boolean {
		return this._activeSessions.has(sessionId);
	}

	get activeSessionIds(): readonly string[] {
		return [...this._activeSessions];
	}

	protected createReferencedObject(sessionId: string): void {
		this._activeSessions.add(sessionId);
		this._onFirstReference(sessionId);
	}

	protected destroyReferencedObject(sessionId: string): void {
		this._activeSessions.delete(sessionId);
		this._onLastReference(sessionId);
	}
}

/**
 * A non-default peer chat within an {@link AgentHostSessionAdapter}. Holds its
 * own observables seeded from the protocol {@link ChatSummary} so the chat tab
 * renders the chat's own title/status/activity independently of the aggregated
 * session-level state. The {@link IChat.resource} carries the chatId in its URI
 * fragment so the chat view opens a distinct widget per peer chat.
 */
function createChangesObservable(changesets: IObservable<readonly ISessionChangeset[] | undefined>): IObservable<readonly ISessionFileChange[]> {
	const defaultChangesetObs = derivedOpts<ISessionChangeset | undefined>({
		equalsFn: (first, second) => first?.id === second?.id
	}, reader => changesets.read(reader)?.find(changeset => changeset.isDefault.read(reader) === true));

	return derivedOpts({ equalsFn: sessionFileChangesEqual },
		reader => defaultChangesetObs.read(reader)?.changes.read(reader) ?? []);
}

type AgentHostChatSummary = Omit<ChatSummary, 'modifiedAt'> & { readonly modifiedAt?: string };

class AdditionalChat extends Disposable {

	readonly chat: IChat;
	readonly backendUri: URI;

	private readonly _title: ISettableObservable<string>;
	private readonly _status: ISettableObservable<SessionStatus>;
	private readonly _updatedAt: ISettableObservable<Date | undefined>;
	private readonly _workingDirectories: ISettableObservable<readonly string[] | undefined>;
	private readonly _modelId: ISettableObservable<string | undefined>;
	private readonly _modelSource: ISettableObservable<ChatModelSource | undefined>;
	private readonly _mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	private readonly _description: ISettableObservable<IMarkdownString | undefined>;
	private readonly _lastTurnEnd: ISettableObservable<Date | undefined>;
	private readonly _interactivity: ISettableObservable<ChatInteractivity>;
	private readonly _isNew: ISettableObservable<boolean>;
	private readonly _isArchived: ISettableObservable<boolean>;
	private readonly _isRead: ISettableObservable<boolean>;
	private readonly _origin: ChatOrigin | undefined;
	private readonly _changesSummary: ISettableObservable<ISessionChangesSummary | undefined>;

	constructor(resource: URI, summary: AgentHostChatSummary, createdAtFallback: Date, changesets: IObservable<readonly ISessionChangeset[] | undefined>, backgroundShells: IObservable<readonly IChatBackgroundShell[]>, private readonly _acquireDetails: () => IDisposable, sessionWorkspace: IObservable<ISessionWorkspace | undefined>, mapWorkingDirectoryUri: AgentHostUriMapper, isNew: boolean = false, parentChat?: URI, sessionIsArchived: IObservable<boolean> = constObservable(false), canArchive: IObservable<boolean> = constObservable(false), output?: IChatOutputObs, sessionIsReadOnly: IObservable<boolean> = constObservable(false), connectionStatus?: IObservable<RemoteAgentHostConnectionStatus>, allowOfflineDrafts: IObservable<boolean> = constObservable(false)) {
		super();
		this.backendUri = URI.parse(summary.resource);
		this._origin = summary.origin;
		const modifiedAt = summary.modifiedAt ? new Date(summary.modifiedAt) : undefined;
		this._title = observableValue('chatTitle', summary.title || localize('newChatTab', "New Chat"));
		this._status = observableValue<SessionStatus>('chatStatus', mapProtocolStatus(summary.status));
		this._updatedAt = observableValueOpts<Date | undefined>({ owner: this, debugName: 'chatUpdatedAt', equalsFn: dateEquals }, modifiedAt);
		this._workingDirectories = observableValueOpts<readonly string[] | undefined>({ owner: this, debugName: 'chatWorkingDirectories', equalsFn: structuralEquals }, summary.workingDirectories);
		this._modelId = observableValue<string | undefined>('chatModelId', undefined);
		this._modelSource = observableValue<ChatModelSource | undefined>('chatModelSource', undefined);
		this._mode = observableValueOpts<{ readonly id: string; readonly kind: string } | undefined>({ owner: this, debugName: 'chatMode', equalsFn: structuralEquals }, undefined);
		this._description = observableValueOpts<IMarkdownString | undefined>({ owner: this, debugName: 'chatDescription', equalsFn: markdownStringEquals }, summary.activity ? new MarkdownString().appendText(summary.activity) : undefined);
		this._lastTurnEnd = observableValueOpts<Date | undefined>({ owner: this, debugName: 'chatLastTurnEnd', equalsFn: dateEquals }, modifiedAt);
		this._interactivity = observableValue<ChatInteractivity>('chatInteractivity', toChatInteractivity(summary.interactivity));
		this._isNew = observableValue<boolean>('chatIsNew', isNew);
		this._isArchived = observableValue<boolean>('chatIsArchived', isSessionStatusArchived(summary.status));
		this._isRead = observableValue<boolean>('chatIsRead', isSessionStatusRead(summary.status));
		this._changesSummary = observableValueOpts<ISessionChangesSummary | undefined>({ owner: this, debugName: 'chatChangesSummary', equalsFn: structuralEquals }, summary.changes ? toSessionChangesSummary(summary.changes) : undefined);
		const status = derived(this, reader => this._isNew.read(reader) ? SessionStatus.Untitled : this._status.read(reader));
		const workspace = derived(this, reader => {
			const workingDirectories = this._workingDirectories.read(reader);
			return buildAgentHostChatWorkspace(
				sessionWorkspace.read(reader),
				workingDirectories?.map(directory => mapWorkingDirectoryUri(URI.parse(directory))),
				output?.getFolderGitHubInfo(reader),
				output?.getScopeGitState(reader, workingDirectories),
			);
		});
		const interactivity = derived(reader => effectiveChatInteractivity(
			this._isArchived.read(reader) || sessionIsArchived.read(reader),
			applyConnectionInteractivity(this._interactivity.read(reader), sessionIsReadOnly.read(reader), allowOfflineDrafts.read(reader))));
		const capabilities = summary.origin?.kind === ProtocolChatOriginKind.Tool
			? constObservable<IChatCapabilities>({ canRename: false, canArchive: false, canDelete: false })
			: summary.origin?.kind === ProtocolChatOriginKind.SideChat
				? constObservable<IChatCapabilities>({ ...DEFAULT_CHAT_CAPABILITIES, canArchive: false })
				: derived<IChatCapabilities>(reader => ({ ...DEFAULT_CHAT_CAPABILITIES, canArchive: canArchive.read(reader) }));
		this.chat = {
			resource,
			createdAt: modifiedAt ?? createdAtFallback,
			workspace: this._withDetails(workspace),
			title: this._withDetails(this._title),
			updatedAt: this._withDetails(this._updatedAt),
			status: this._withDetails(toPresentedSessionStatus(this, status, connectionStatus)),
			changes: createChangesObservable(changesets),
			changesets,
			// Catalog-backed, so session lists can read it without acquiring chat details.
			changesSummary: this._changesSummary,
			lastTurnChanges: output?.lastTurnChanges,
			customizations: output?.customizations,
			canvases: output?.canvases,
			backgroundShells,
			checkpoints: observableValue(this, undefined),
			modelId: this._withDetails(this._modelId),
			modelSource: this._withDetails(this._modelSource),
			mode: this._withDetails(this._mode),
			isArchived: this._isArchived,
			isRead: this._withDetails(this._isRead),
			// Archived or replay-only chats must not expose mutating controls.
			interactivity,
			description: this._withDetails(this._description),
			lastTurnEnd: this._withDetails(this._lastTurnEnd),
			origin: summary.origin ? {
				kind: toSessionChatOriginKind(summary.origin.kind),
				parentChat,
				...((summary.origin.kind === ProtocolChatOriginKind.Fork || summary.origin.kind === ProtocolChatOriginKind.SideChat) ? { turnId: summary.origin.turnId } : {}),
				...(summary.origin.kind === ProtocolChatOriginKind.SideChat && summary.origin.selection ? { selection: toSessionSideChatSelection(summary.origin.selection) } : {}),
			} : undefined,
			capabilities,
		};
	}

	private _withDetails<T>(observable: IObservable<T>): IObservable<T> {
		const onDidChange = Event.fromObservableLight(observable);
		return observableFromEvent(this, listener => {
			const store = new DisposableStore();
			store.add(this._acquireDetails());
			store.add(onDidChange(listener));
			return store;
		}, () => observable.get());
	}

	update(summary: ChatSummary, supportsChatReadState: boolean = true): void {
		const modifiedAt = new Date(summary.modifiedAt);
		transaction(tx => {
			this._title.set(summary.title || localize('newChatTab', "New Chat"), tx);
			this._status.set(mapProtocolStatus(summary.status), tx);
			this._updatedAt.set(modifiedAt, tx);
			this._workingDirectories.set(summary.workingDirectories, tx);
			this._description.set(summary.activity ? new MarkdownString().appendText(summary.activity) : undefined, tx);
			this._lastTurnEnd.set(modifiedAt, tx);
			this._interactivity.set(toChatInteractivity(summary.interactivity), tx);
			this._isArchived.set(isSessionStatusArchived(summary.status), tx);
			if (supportsChatReadState) {
				this._isRead.set(isSessionStatusRead(summary.status), tx);
			}
			this._setChangesSummary(summary.changes, tx);
		});
	}

	updateCatalogMetadata(title: string | undefined, interactivity: ProtocolChatInteractivity | undefined, archived: boolean | undefined, isRead: boolean | undefined, changes: ChangesSummary | undefined, tx?: ITransaction): void {
		this._title.set(title || localize('newChatTab', "New Chat"), tx);
		this._interactivity.set(toChatInteractivity(interactivity), tx);
		this._isArchived.set(archived === true, tx);
		if (isRead !== undefined) {
			this._isRead.set(isRead, tx);
		}
		this._setChangesSummary(changes, tx);
	}

	toMetadata(): IAgentSessionChatMetadata {
		const changes = this._changesSummary.get();
		return {
			chat: this.backendUri,
			summary: this._title.get(),
			kind: 'peer',
			origin: this._origin,
			interactivity: toProtocolChatInteractivity(this._interactivity.get()),
			archived: this._isArchived.get(),
			isRead: this._isRead.get(),
			...(changes ? {
				changes: {
					additions: changes.additions,
					deletions: changes.deletions,
					files: changes.files,
				}
			} : {}),
		};
	}

	/** Keeps the last known counts when an update does not carry them. */
	private _setChangesSummary(changes: ChangesSummary | undefined, tx: ITransaction | undefined): void {
		if (changes) {
			this._changesSummary.set(toSessionChangesSummary(changes), tx);
		}
	}

	/** Optimistically update the chat title ahead of the host's `chatUpdated`. */
	setTitle(title: string): void {
		this._title.set(title || localize('newChatTab', "New Chat"), undefined);
	}

	setRead(isRead: boolean, tx?: ITransaction): void {
		this._isRead.set(isRead, tx);
	}

	/** Present as `Untitled` until the first request is sent so the view shows the composer. */
	markNew(): void {
		this._isNew.set(true, undefined);
	}

	/** Clear the `new` presentation after the first request is sent. */
	markSent(): void {
		this._isNew.set(false, undefined);
	}

	setModelId(modelId: string | undefined, source: ChatModelSource): void {
		// One update: a model and where it came from are only meaningful as a pair, and an
		// observer woken by half of it would act on a model credited to the wrong source.
		transaction(tx => {
			this._modelSource.set(modelId ? source : undefined, tx);
			this._modelId.set(modelId, tx);
		});
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
	readonly harness: string;
	readonly environment: string;
	readonly application: IObservable<ISessionApplication>;
	private readonly _legacyInitiator: Implementation;
	readonly icon: ThemeIcon;
	readonly createdAt: Date;
	readonly workspace: ISettableObservable<ISessionWorkspace | undefined>;
	readonly isQuickChat: IObservable<boolean>;
	readonly isAutomation = observableValue('isAutomation', false);
	readonly isExternal: IObservable<boolean>;
	readonly remoteConnectionStatus: IObservable<SessionRemoteConnectionStatus> | undefined;
	readonly createdBySession: IObservable<ISessionCreationReference | undefined>;
	/** See {@link ISession.worktreePending}. */
	readonly worktreePending: IObservable<boolean>;
	readonly title: ISettableObservable<string>;
	readonly updatedAt: ISettableObservable<Date>;
	readonly status: ISettableObservable<SessionStatus>;
	readonly completedStateIcon: IObservable<ThemeIcon | undefined>;
	readonly modelId: ISettableObservable<string | undefined>;
	readonly modelSource: ISettableObservable<ChatModelSource | undefined>;
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
	 * Capabilities combine provider-local policy with the connection's live root
	 * state. Advertised agent capabilities re-emit after hydration; provider-local
	 * capabilities remain available independently of root-state availability.
	 * `supportsRename`/`supportsDelete` are always supported.
	 */
	readonly capabilities: IObservable<ISessionCapabilities>;

	/**
	 * The default chat (resource == this session's resource). Always present;
	 * for single-chat sessions it is the only chat and `chats === [it]`.
	 */
	private readonly _defaultChat: IChat;
	/**
	 * The session's live output observables (per-chat last-turn changes and
	 * customizations), parsed from the active-session subscriptions and shared by
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
	private readonly _defaultChatIsReadOverride = observableValue<boolean | undefined>('defaultChatIsReadOverride', undefined);
	private readonly _defaultChatBackendUri = observableValue<URI | undefined>(this, undefined);
	private readonly _defaultChatUpdatedAt: ISettableObservable<Date | undefined>;
	private readonly _hasMultipleChats: ISettableObservable<boolean>;
	private readonly _aggregateChatResources = new ResourceSet();
	private readonly _defaultChatWorkingDirectories = observableValueOpts<readonly string[] | undefined>({ owner: this, debugName: 'defaultChatWorkingDirectories', equalsFn: structuralEquals }, undefined);
	/** GitHub info per folder, keyed by working-directory key and created on demand. */
	private readonly _folderGitHubInfos = new Map<string, IObservable<IGitHubInfo | undefined>>();
	/** Whether this session was created with worktree isolation. */
	private readonly _worktreeIsolation = observableValue<boolean>('worktreeIsolation', false);
	/** Interactivity of the default chat. Driven from the default chat's protocol summary. */
	private readonly _defaultChatInteractivity = observableValue<ChatInteractivity>('defaultChatInteractivity', ChatInteractivity.Full);
	private readonly _defaultChatChangesSummary = observableValueOpts<ISessionChangesSummary | undefined>({ equalsFn: structuralEquals }, undefined);
	private readonly _mainChatObs: ISettableObservable<IChat>;
	private readonly _chatsObs: ISettableObservable<readonly IChat[]>;
	/** Additional (non-default) peer chats keyed by chatId. */
	private readonly _additionalChats = this._register(new DisposableMap<string, AdditionalChat>());
	private readonly _sessionOutputCache = new Map<string, unknown>();
	private _chatOutputResources = new ResourceSet();
	/** Chat ids that have not yet sent their first request (presented as `Untitled`). */
	private readonly _newChatIds = new Set<string>();
	/**
	 * The model each peer chat was given, and where it came from, keyed by chat id.
	 *
	 * Held outside {@link _additionalChats} because that map is rebuilt from session state: a chat
	 * created locally can have its model set before the state carrying it arrives, and the entry
	 * that write would have landed on may not exist yet. Seeding from here at construction keeps
	 * the selection — and the record of where it came from, which the model-picker's precedence
	 * depends on — from being silently dropped.
	 */
	private readonly _chatModelSelections = new Map<string, { readonly modelId: string | undefined; readonly source: ChatModelSource }>();
	/**
	 * The last {@link SessionState} applied to the chat catalog, retained so the
	 * catalog can be re-reconciled when {@link capabilities} change after the
	 * fact.
	 */
	private _lastCatalogState: SessionState | undefined;
	private readonly _chatCatalogCapabilitiesObserver = this._register(new MutableDisposable());
	private readonly _supportsChatArchive: IObservable<boolean>;
	private readonly _supportsChatReadState: IObservable<boolean>;
	private readonly _rawId: string;
	private readonly _resourceScheme: string;

	readonly agentProvider: string;
	/**
	 * This session's URI as the host's registry is keyed by it, which may use a different scheme
	 * than {@link agentProvider} (cloud sandbox: provider `copilot`, backend `ahp-session:/<id>`).
	 * Every backend call must address the session by this URI.
	 */
	readonly backendUri: URI;

	// Retained so we can rebuild `workspace` when session state changes via
	// actions dispatched on session open (without a full list refresh).
	// See `_applySessionMetadataFromState` / `applySessionStateMetadata`.
	private _project: IAgentSessionMetadata['project'];
	/** Discovery-owned field baselines, persisted separately from authoritative host metadata. */
	discoveryMetadata: IAgentHostSessionDiscoveryMetadata | undefined;
	private _workingDirectories: readonly URI[] | undefined;
	/** Working-directory set used to resolve session customizations. */
	get workingDirectories(): readonly URI[] { return this._workingDirectories ?? []; }
	// The directory that the current `mode` custom-agent URI is rooted at. Used to
	// compute the agent's repo-relative path so the selection can be rebased onto
	// its worktree twin when the session relocates into an isolated worktree (see
	// `reconcileSelectedAgent`).
	private _agentBaseDir: URI | undefined;
	private _meta: SessionMeta | undefined;
	/** The latest session metadata used to build startup-cache presentation state. */
	get sessionMeta(): SessionMeta {
		return withSessionInitiator(this._meta, readSessionInitiator({ _meta: this._meta }) ?? this._legacyInitiator);
	}
	/** Settable so authoritative session metadata can change the session kind in place. */
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

	/** Artifacts recorded by the agent, derived from the session's `_meta` bag. */
	readonly artifacts: IObservable<readonly ISessionArtifact[]>;

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
		chatCatalogLoading: IObservable<boolean>,
		private readonly _acquireChatDetails: (sessionId: string) => IDisposable,
		@IGitHubService private readonly _gitHubService: IGitHubService,
		@ISessionsService private readonly _sessionsService: ISessionsService,
		@IPullRequestIconCache private readonly _pullRequestIconCache: IPullRequestIconCache,
	) {
		super();
		const rawId = AgentSession.id(metadata.session);
		const agentProvider = metadata.provider ?? AgentSession.provider(metadata.session);
		if (!agentProvider) {
			throw new Error(`Agent session URI has no provider scheme: ${metadata.session.toString()}`);
		}
		this.agentProvider = agentProvider;
		this.backendUri = metadata.session;
		this.resource = metadata.session.with({ scheme: resourceScheme });
		this._rawId = rawId;
		this._resourceScheme = resourceScheme;
		this.sessionId = toSessionId(providerId, this.resource);
		this.providerId = providerId;
		this.sessionType = logicalSessionType;
		const harness = metadata.provider ?? agentProvider;
		this.harness = harness === 'copilotcli' ? 'copilot' : harness;
		this.environment = _options.environment;
		this._isQuickChat = observableValue('isQuickChat', readSessionWorkspaceless(metadata._meta));
		this.icon = _options.icon;
		this.createdAt = new Date(metadata.startTime);
		this.title = observableValue('title', metadata.summary || `Session ${rawId.substring(0, 8)}`);
		this.updatedAt = observableValue('updatedAt', new Date(metadata.modifiedTime));
		this.modelSelection = undefined;
		this.status = observableValue<SessionStatus>('status', metadata.status !== undefined ? mapProtocolStatus(metadata.status) : SessionStatus.Completed);
		this.modelId = observableValue<string | undefined>('modelId', undefined);
		this.modelSource = observableValue<ChatModelSource | undefined>('modelSource', undefined);
		this.mode = observableValueOpts<{ readonly id: string; readonly kind: string } | undefined>({ owner: this, debugName: 'mode', equalsFn: structuralEquals }, undefined);
		this.lastTurnEnd = observableValue('lastTurnEnd', metadata.modifiedTime ? new Date(metadata.modifiedTime) : undefined);
		this._activity = observableValue('activity', metadata.activity);
		this._project = metadata.project;
		this._workingDirectories = metadata.workingDirectories;

		this._meta = metadata._meta;
		this._metaObs = observableValue<SessionMeta | undefined>('agentHostSessionMeta', this._meta);
		this.isExternal = _options.externalSessionState?.(this.resource, this._store)
			?? derived(this, reader => readSessionExternal(this._metaObs.read(reader)));
		this._legacyInitiator = getLegacySessionInitiator(this.harness, this.isExternal.get());
		this.application = derivedOpts<ISessionApplication>({ owner: this, equalsFn: structuralEquals }, reader => {
			const initiator = readSessionInitiator({ _meta: this._metaObs.read(reader) }) ?? this._legacyInitiator;
			return getSessionApplication(initiator.name, initiator.title);
		});
		const connectionStatus = _options.connectionStatus;
		this.remoteConnectionStatus = toSessionRemoteConnectionStatus(this, connectionStatus);
		this.createdBySession = derived(this, reader => {
			const meta = this._metaObs.read(reader);
			const creationReference = readSessionCreationReference(meta);
			const remoteOrigin = readRemoteSessionOrigin({ _meta: meta });
			if (remoteOrigin) {
				return { session: URI.parse(remoteOrigin.session), chat: URI.parse(remoteOrigin.chat), turnId: creationReference?.turnId };
			}
			if (!creationReference) {
				return undefined;
			}
			const session = this._options.mapBackendSessionResource(URI.parse(creationReference.session));
			const parsedChat = creationReference.chat ? parseChatUri(creationReference.chat) : undefined;
			const chat = parsedChat
				? session.with({ fragment: parsedChat.chatId === DEFAULT_CHAT_ID ? '' : parsedChat.chatId })
				: undefined;
			return { session, chat, turnId: creationReference.turnId };
		});
		this.artifacts = derivedOpts<readonly ISessionArtifact[]>({ owner: this, equalsFn: structuralEquals }, reader => {
			const meta = this._metaObs.read(reader);
			const defaultChatBackendUri = this._defaultChatBackendUri.read(reader);
			const chats = this._chatsObs.read(reader);
			// Artifact owners use host chat URIs; shared consumers compare UI chat resources.
			return partitionSessionArtifacts(meta, this._options.mapDiffUri).entries.map(({ artifact }) => {
				if (!artifact.chat) {
					return artifact;
				}
				const chat = isEqual(artifact.chat, defaultChatBackendUri)
					? this.resource
					: chats.find(chat => isEqual(this.getBackendChatResource(chat.resource), artifact.chat))?.resource;
				return chat ? { ...artifact, chat } : artifact;
			});
		});

		this.gitHubInfo = this._presentGitHubInfo(derivedOpts<IGitHubInfo | undefined>({
			equalsFn: isGitHubInfoEqual
		}, reader => {
			const workingDirectory = this._getSessionFolderWorkingDirectory(reader);
			return toGitHubInfo(this._metaObs.read(reader), workingDirectory ? URI.parse(workingDirectory) : undefined, this._getSessionFolderKey(reader), true);
		}));
		this.completedStateIcon = derived(this, reader => {
			const sourceControlState = readSessionSourceControlState(this._metaObs.read(reader));
			if (sourceControlState?.latestOutcome === SessionSourceControlOutcome.Merge) {
				return { ...Codicon.gitMerge, color: themeColorFromId('charts.purple') };
			}
			const gitHubInfo = this.gitHubInfo.read(reader);
			return getHighestPriorityPullRequestIcon(getSessionOwnedGitHubPullRequestRefs(gitHubInfo).map(pullRequest => pullRequest.icon));
		});

		const initialWorkspace = this._computeWorkspace();
		this.workspace = observableValue('workspace', initialWorkspace);
		this.isQuickChat = this._isQuickChat;
		// Until the host reports the worktree, the workspace is still the checkout it was started from.
		this.worktreePending = derived(this, reader =>
			this._worktreeIsolation.read(reader)
			&& !this.workspace.read(reader)?.folders.some(folder => !!folder.gitRepository?.workTreeUri));
		this.loading = derived(this, reader => {
			const visible = _sessionsService.visibleSessions.read(reader).some(session => isEqual(session?.resource, this.resource));
			return _options.loading.read(reader) || (visible && chatCatalogLoading.read(reader));
		});
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
		// The last turn's changes and the chat customizations, parsed from the
		// chat-state turns. Computed lazily from the same active-session
		// subscriptions used for changes.
		const sessionOutput = createSessionOutputObs(
			this.backendUri,
			this._options,
			this.isActiveSessionObs,
			this.isArchived,
			this.workspace,
			this._sessionOutputCache,
		);
		this._sessionOutput = sessionOutput;

		const defaultChatStatus = derived(this, reader => this._defaultChatStatusOverride.read(reader) ?? this.status.read(reader));
		const defaultChatIsRead = derived(this, reader => this._defaultChatIsReadOverride.read(reader) ?? this.isRead.read(reader));
		const defaultChatWorkspace = derived(this, reader => {
			const workingDirectories = this._defaultChatWorkingDirectories.read(reader);
			return buildAgentHostChatWorkspace(
				this.workspace.read(reader),
				workingDirectories?.map(directory => this._options.mapWorkingDirectoryUri?.(URI.parse(directory)) ?? URI.parse(directory)),
				this._getFolderGitHubInfoResolver(reader),
				this._getChatScopeGitState(reader, workingDirectories),
			);
		});
		const sessionStateObs = createActiveSessionSubscriptionObs<SessionState>(
			this._options,
			this.isActiveSessionObs,
			StateComponents.Session,
			constObservable(this.backendUri),
		);
		const defaultChatUriObs = derivedOpts<URI | undefined>({ owner: this, equalsFn: isEqual }, reader => {
			const state = sessionStateObs.read(reader).read(reader);
			const resource = state && !(state instanceof Error) ? state.defaultChat ?? state.chats[0]?.resource : undefined;
			return resource ? URI.parse(resource) : undefined;
		});
		const defaultChatChangesets = createChatChangesets(
			this.backendUri,
			defaultChatUriObs,
			this._options,
			this.isActiveSessionObs,
			this._createChatCurrentTurnChangesObservable(defaultChatUriObs),
		);
		const defaultChatChanges = createChangesObservable(defaultChatChangesets);
		const hasMultipleChats = metadata.chats?.some(chat => chat.kind === 'peer') === true;
		this._hasMultipleChats = observableValue('hasMultipleChats', hasMultipleChats);
		this._aggregateChatResources.add(this.resource);
		this._defaultChatUpdatedAt = observableValueOpts<Date | undefined>({ owner: this, debugName: 'defaultChatUpdatedAt', equalsFn: dateEquals }, hasMultipleChats ? undefined : this.updatedAt.get());
		const mainChat: IChat = {
			resource: this.resource,
			createdAt: this.createdAt,
			workspace: defaultChatWorkspace,
			title: this._options.useSessionTitleForDefaultChat ? this.title : derived(this, reader => this._defaultChatTitleOverride.read(reader) ?? this.title.read(reader)),
			updatedAt: this._withChatDetails(this._defaultChatUpdatedAt),
			status: toPresentedSessionStatus(this, defaultChatStatus, this._options.preserveStatusWhenDisconnected ? undefined : connectionStatus),
			changes: defaultChatChanges,
			changesets: defaultChatChangesets,
			changesSummary: this._defaultChatChangesSummary,
			lastTurnChanges: derived(reader => {
				const chatUri = defaultChatUriObs.read(reader);
				return chatUri ? sessionOutput.getLastTurnChanges(chatUri).read(reader) : [];
			}),
			customizations: derived(reader => {
				const chatUri = defaultChatUriObs.read(reader);
				return chatUri ? sessionOutput.getChatCustomizations(chatUri).read(reader) : [];
			}),
			canvases: this._createChatCanvasesObservable(defaultChatUriObs),
			backgroundShells: this._createChatBackgroundShellsObservable(defaultChatUriObs),
			checkpoints: observableValue(this, undefined),
			modelId: this.modelId,
			modelSource: this.modelSource,
			mode: this.mode,
			isArchived: this.isArchived,
			isRead: defaultChatIsRead,
			// Archived or replay-only chats must not expose mutating controls.
			interactivity: derived(this, reader => effectiveChatInteractivity(
				this.isArchived.read(reader),
				applyConnectionInteractivity(this._defaultChatInteractivity.read(reader), this._options.readOnly?.read(reader) ?? false, this._options.allowOfflineDrafts?.read(reader) ?? false))),
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
		this._defaultChat = mainChat;
		this._mainChatObs = observableValue<IChat>(this, mainChat);
		this._chatsObs = observableValueOpts<readonly IChat[]>({ owner: this, equalsFn: arrayEquals }, [mainChat]);
		this.mainChat = this._mainChatObs;
		this.chats = this._chatsObs;

		this._supportsChatArchive = derived(this, reader => {
			this._options.connectionStatus?.read(reader);
			const connection = this._options.getConnection();
			const initializeResult = connection?.initializeResult.read(reader);
			return !!initializeResult && isActionKnownToVersion({ type: ActionType.ChatIsArchivedChanged, isArchived: false }, initializeResult.protocolVersion);
		});
		this._supportsChatReadState = derived(this, reader => {
			this._options.connectionStatus?.read(reader);
			const connection = this._options.getConnection();
			const initializeResult = connection?.initializeResult.read(reader);
			return !!initializeResult && isActionKnownToVersion({ type: ActionType.ChatIsReadChanged, isRead: true }, initializeResult.protocolVersion);
		});
		this.capabilities = derivedOpts<ISessionCapabilities>({ owner: this, equalsFn: structuralEquals }, reader => {
			const agentCapabilities = this._options.agentCapabilities.read(reader)?.get(this.agentProvider);
			this._options.connectionStatus?.read(reader);
			const connection = this._options.getConnection();
			connection?.initializeResult.read(reader);
			return {
				supportsRemoveArtifacts: !!connection?.removeSessionArtifact && supportsAgentHostArtifactRemoval(connection.initializeResult.read(reader)),
				supportsImport: this.isExternal.read(reader) && !!connection?.importSession && supportsAgentHostSessionImport(connection.initializeResult.read(reader)),
				supportsCanvases: this._options.supportsCanvasPresentation?.(this.agentProvider) === true,
				supportsMultipleChats: !this.isQuickChat.read(reader) && (agentCapabilities?.multipleChats !== undefined),
				supportsFork: agentCapabilities?.multipleChats?.fork ?? false,
				supportsSideChat: agentCapabilities?.multipleChats?.sideChat ?? false,
				supportsRename: true,
				supportsDelete: true,
			};
		});
		this.applyChatMetadata(metadata.chats);
	}

	private _withChatDetails<T>(observable: IObservable<T>): IObservable<T> {
		const onDidChange = Event.fromObservableLight(observable);
		return observableFromEvent(this, listener => {
			const store = new DisposableStore();
			const details = store.add(new MutableDisposable());
			store.add(autorun(reader => {
				details.value = this._hasMultipleChats.read(reader) ? this._acquireChatDetails(this.sessionId) : undefined;
			}));
			store.add(onDidChange(listener));
			return store;
		}, () => observable.get());
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
		if (this._chatCatalogCapabilitiesObserver.value) {
			this._applyChatCatalog(state);
		} else {
			this._chatCatalogCapabilitiesObserver.value = autorun(reader => {
				this.capabilities.read(reader);
				const currentState = this._lastCatalogState;
				if (currentState) {
					this._applyChatCatalog(currentState);
				}
			});
		}
	}

	applyChatMetadata(chats: readonly IAgentSessionChatMetadata[] | undefined, tx?: ITransaction): boolean {
		if (!chats) {
			return this._markSessionUnreadForUnreadChat(tx);
		}
		this._aggregateChatResources.clear();
		for (const chat of chats) {
			if (!isChatInSessionReadAggregate(chat.chat.toString(), chat.origin, chat.interactivity)) {
				continue;
			}
			const chatId = getAgentHostChatId(chat.chat);
			this._aggregateChatResources.add(chat.kind === 'default'
				? this.resource
				: this.resource.with({ fragment: chatId }));
		}
		const previousChats = this._chatsObs.get();

		const defaultChat = chats.find(chat => chat.kind === 'default');
		if (defaultChat) {
			this._defaultChatBackendUri.set(defaultChat.chat, tx);
		}
		this._defaultChatTitleOverride.set(defaultChat?.summary || undefined, tx);
		this._defaultChatInteractivity.set(toChatInteractivity(defaultChat?.interactivity), tx);
		if (defaultChat?.changes) {
			this._defaultChatChangesSummary.set(toSessionChangesSummary(defaultChat.changes), tx);
		}

		const peerIds = chats
			.filter(chat => chat.kind === 'peer')
			.map(chat => getAgentHostChatId(chat.chat));
		const hasMultipleChats = peerIds.length > 0;
		const supportsChatReadState = this._supportsChatReadState.get();
		this._hasMultipleChats.set(hasMultipleChats, tx);
		if (!hasMultipleChats) {
			this._defaultChatIsReadOverride.set(undefined, tx);
		} else if (defaultChat?.isRead !== undefined) {
			this._defaultChatIsReadOverride.set(defaultChat.isRead, tx);
		} else if (!supportsChatReadState && this._defaultChatIsReadOverride.get() === undefined) {
			this._defaultChatIsReadOverride.set(false, tx);
		}
		const survivingPeers = new Set(peerIds);
		const chatOutputResources = new ResourceSet(chats.map(chat => chat.chat));
		for (const [chatId, entry] of this._additionalChats) {
			if (entry.chat.origin?.kind === ChatOriginKind.Tool) {
				chatOutputResources.add(entry.backendUri);
			} else if (!survivingPeers.has(chatId)) {
				this._chatModelSelections.delete(chatId);
			}
		}
		this._updateChatOutputResources(chatOutputResources);

		const ordered: IChat[] = [];
		for (const chat of chats) {
			if (chat.kind === 'default') {
				ordered.push(this._defaultChat);
				continue;
			}
			const chatId = getAgentHostChatId(chat.chat);
			let entry = this._additionalChats.get(chatId);
			if (!entry) {
				entry = this._createAdditionalChat(chatId, {
					resource: chat.chat.toString(),
					title: chat.summary ?? '',
					status: withSessionStatusFlag(
						withSessionStatusFlag(ProtocolSessionStatus.Idle, ProtocolSessionStatus.IsArchived, chat.archived === true),
						ProtocolSessionStatus.IsRead,
						chat.isRead ?? supportsChatReadState,
					),
					origin: chat.origin,
					interactivity: chat.interactivity,
					...(chat.changes !== undefined ? { changes: chat.changes } : {}),
				});
				this._additionalChats.set(chatId, entry);
			} else {
				entry.updateCatalogMetadata(chat.summary, chat.interactivity, chat.archived, chat.isRead, chat.changes, tx);
			}
			ordered.push(entry.chat);
		}
		for (const chat of previousChats) {
			if (chat.origin?.kind === ChatOriginKind.Tool && !ordered.includes(chat)) {
				ordered.push(chat);
			}
		}

		for (const chatId of [...this._additionalChats.keys()]) {
			const entry = this._additionalChats.get(chatId);
			if (!survivingPeers.has(chatId) && entry?.chat.origin?.kind !== ChatOriginKind.Tool) {
				this._additionalChats.deleteAndDispose(chatId);
			}
		}

		const nextChats = ordered.length > 0 ? ordered : [this._defaultChat];
		this._chatsObs.set(nextChats, tx);
		this._mainChatObs.set(this._defaultChat, tx);
		const sessionReadChanged = this._markSessionUnreadForUnreadChat(tx);
		return !arrayEquals(previousChats, nextChats) || sessionReadChanged;
	}

	supportsChatReadState(): boolean {
		return this._supportsChatReadState.get();
	}

	hasUnreadChat(): boolean {
		return this._aggregateChatResources.size > 1
			&& this._chatsObs.get().some(chat => this._aggregateChatResources.has(chat.resource) && !chat.isRead.get());
	}

	getUnreadAggregateChats(): readonly IChat[] {
		if (this._aggregateChatResources.size <= 1) {
			return [];
		}
		return this._chatsObs.get().filter(chat => this._aggregateChatResources.has(chat.resource) && !chat.isRead.get());
	}

	private _markSessionUnreadForUnreadChat(tx?: ITransaction): boolean {
		if (!this.isRead.get() || !this.hasUnreadChat()) {
			return false;
		}
		this.isRead.set(false, tx);
		return true;
	}

	getCurrentChatMetadata(chats: readonly IAgentSessionChatMetadata[] | undefined): readonly IAgentSessionChatMetadata[] | undefined {
		if (!chats && this._additionalChats.size === 0) {
			return undefined;
		}
		const defaultMetadata = chats?.find(chat => chat.kind === 'default');
		const defaultChat = defaultMetadata?.chat ?? this._defaultChatBackendUri.get();
		const currentDefaultMetadata: IAgentSessionChatMetadata | undefined = defaultChat ? {
			...defaultMetadata,
			chat: defaultChat,
			summary: this._defaultChat.title.get(),
			kind: 'default',
			interactivity: toProtocolChatInteractivity(this._defaultChatInteractivity.get()),
			archived: this._defaultChat.isArchived.get(),
			isRead: this._defaultChat.isRead.get(),
		} : undefined;
		const result: IAgentSessionChatMetadata[] = [];
		for (const chat of this._chatsObs.get()) {
			if (chat === this._defaultChat) {
				if (currentDefaultMetadata) {
					result.push(currentDefaultMetadata);
				}
				continue;
			}
			const entry = chat.resource.fragment ? this._additionalChats.get(chat.resource.fragment) : undefined;
			if (entry) {
				result.push(entry.toMetadata());
			}
		}
		if (currentDefaultMetadata && !result.includes(currentDefaultMetadata)) {
			result.unshift(currentDefaultMetadata);
		}
		return result;
	}

	private _updateChatOutputResources(resources: ResourceSet): void {
		for (const resource of this._chatOutputResources) {
			if (!resources.has(resource)) {
				this._sessionOutput.releaseChat(resource);
			}
		}
		this._chatOutputResources = resources;
	}

	private _applyChatCatalog(state: SessionState): void {
		this._updateChatOutputResources(new ResourceSet(state.chats.map(chat => URI.parse(chat.resource))));
		// The default chat's catalog title drives its independent tab title.
		// Empty means "inherit the session title"; a non-empty value means it was
		// renamed independently of the session.
		const defaultChatUri = state.defaultChat?.toString();
		const isDefault = (summary: ChatSummary): boolean => defaultChatUri
			? summary.resource.toString() === defaultChatUri
			: isDefaultChatUri(summary.resource);
		this._aggregateChatResources.clear();
		for (const chat of state.chats) {
			if (!isChatInSessionReadAggregate(chat.resource, chat.origin, chat.interactivity)) {
				continue;
			}
			const chatId = getAgentHostChatId(chat.resource);
			this._aggregateChatResources.add(isDefault(chat)
				? this.resource
				: this.resource.with({ fragment: chatId }));
		}
		const defaultSummary = state.chats.find(isDefault);
		if (defaultSummary) {
			this._defaultChatBackendUri.set(URI.parse(defaultSummary.resource.toString()), undefined);
		}
		this._defaultChatTitleOverride.set(defaultSummary?.title || undefined, undefined);
		this._defaultChatInteractivity.set(toChatInteractivity(defaultSummary?.interactivity), undefined);
		this._defaultChatWorkingDirectories.set(defaultSummary?.workingDirectories, undefined);
		this._defaultChatUpdatedAt.set(defaultSummary ? new Date(defaultSummary.modifiedAt) : undefined, undefined);
		if (defaultSummary?.changes) {
			this._defaultChatChangesSummary.set(toSessionChangesSummary(defaultSummary.changes), undefined);
		}

		// Tool-origin subagents and user-created side (`/btw`) chats must reach
		// the peer-chat catalog even when the backing session type is otherwise
		// single-chat; the UI later decides whether to show them by default.
		const surfacesAsPeer = (summary: ChatSummary): boolean => {
			const chatId = getAgentHostChatId(summary.resource);
			return !isDefault(summary)
				&& !!chatId
				&& (this.capabilities.get().supportsMultipleChats
					|| (!this.isQuickChat.get() && this._additionalChats.has(chatId))
					|| summary.origin?.kind === ProtocolChatOriginKind.Tool
					|| summary.origin?.kind === ProtocolChatOriginKind.SideChat);
		};

		const survivingPeers = new Set<string>();
		for (const summary of state.chats) {
			if (surfacesAsPeer(summary)) {
				survivingPeers.add(getAgentHostChatId(summary.resource));
			}
		}
		this._hasMultipleChats.set(survivingPeers.size > 0, undefined);
		// A peer chat the catalog no longer lists is gone for good, so its remembered selection is
		// too. Pruned here, before either branch returns, because peers disappearing is exactly
		// what takes a session back down to a single chat. Only chats this session had already
		// materialized count as gone: a selection recorded for one that has never appeared is
		// waiting for the state that creates it, which {@link setChatModelId} allows.
		for (const chatId of this._additionalChats.keys()) {
			if (!survivingPeers.has(chatId)) {
				this._chatModelSelections.delete(chatId);
			}
		}

		if (survivingPeers.size === 0) {
			// Single visible chat: the default chat is the session, so let it
			// reflect the aggregated session status directly (clear any override).
			this._defaultChatStatusOverride.set(undefined, undefined);
			this._defaultChatIsReadOverride.set(undefined, undefined);
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
		const supportsChatReadState = this._supportsChatReadState.get();
		if (supportsChatReadState) {
			this._defaultChatIsReadOverride.set(defaultSummary ? isSessionStatusRead(defaultSummary.status) : undefined, undefined);
		} else if (this._defaultChatIsReadOverride.get() === undefined) {
			this._defaultChatIsReadOverride.set(false, undefined);
		}

		const ordered: IChat[] = [];
		for (const summary of state.chats) {
			if (isDefault(summary)) {
				ordered.push(this._defaultChat);
				continue;
			}
			if (!surfacesAsPeer(summary)) {
				continue;
			}
			const chatId = getAgentHostChatId(summary.resource);
			let entry = this._additionalChats.get(chatId);
			if (!entry) {
				entry = this._createAdditionalChat(chatId, summary);
				this._additionalChats.set(chatId, entry);
			} else {
				entry.update(summary, supportsChatReadState);
			}
			ordered.push(entry.chat);
		}

		for (const chatId of [...this._additionalChats.keys()]) {
			if (!survivingPeers.has(chatId)) {
				this._additionalChats.deleteAndDispose(chatId);
			}
		}

		const main = (defaultChatUri && ordered.find(c => isEqual(c.resource, this.resource))) || this._defaultChat;
		transaction(tx => {
			this._chatsObs.set(ordered.length > 0 ? ordered : [this._defaultChat], tx);
			this._mainChatObs.set(main, tx);
		});
		this._markSessionUnreadForUnreadChat();
	}

	setDefaultChatRead(isRead: boolean, tx?: ITransaction): boolean {
		if (!this._hasMultipleChats.get() || this._defaultChatIsReadOverride.get() === isRead) {
			return false;
		}
		this._defaultChatIsReadOverride.set(isRead, tx);
		return true;
	}

	private _createAdditionalChat(chatId: string, summary: AgentHostChatSummary): AdditionalChat {
		const resource = this.resource.with({ fragment: chatId });
		const backendUri = URI.parse(summary.resource);
		const output: IChatOutputObs = {
			lastTurnChanges: this._sessionOutput.getLastTurnChanges(backendUri),
			customizations: this._sessionOutput.getChatCustomizations(backendUri),
			canvases: this._createChatCanvasesObservable(backendUri),
			getFolderGitHubInfo: reader => this._getFolderGitHubInfoResolver(reader),
			getScopeGitState: (reader, workingDirectories) => this._getChatScopeGitState(reader, workingDirectories),
		};
		const chat = new AdditionalChat(
			resource,
			summary,
			this.createdAt,
			// Nested chats default to their own Session Changes; the main chat keeps the provider default.
			createChatChangesets(this.backendUri, constObservable(backendUri), this._options, this.isActiveSessionObs, this._createChatCurrentTurnChangesObservable(constObservable(backendUri)), ChangesetKind.Session),
			this._createChatBackgroundShellsObservable(constObservable(backendUri)),
			() => this._acquireChatDetails(this.sessionId),
			this.workspace,
			this._options.mapWorkingDirectoryUri ?? (uri => uri),
			this._newChatIds.has(chatId),
			this._resolveParentChatResource(summary.origin),
			this.isArchived,
			this._supportsChatArchive,
			output,
			this._options.readOnly,
			this._options.preserveStatusWhenDisconnected ? undefined : this._options.connectionStatus,
			this._options.allowOfflineDrafts,
		);
		const selection = this._chatModelSelections.get(chatId);
		if (selection) {
			chat.setModelId(selection.modelId, selection.source);
		}
		return chat;
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

	setChatRead(chatResource: URI, isRead: boolean, tx?: ITransaction): boolean {
		if (isEqual(chatResource, this._defaultChat.resource)) {
			if (this._hasMultipleChats.get()) {
				this.setDefaultChatRead(isRead, tx);
			} else {
				this.isRead.set(isRead, tx);
			}
			this._markSessionUnreadForUnreadChat(tx);
			return true;
		}
		const chat = chatResource.fragment ? this._additionalChats.get(chatResource.fragment) : undefined;
		if (!chat) {
			return false;
		}
		chat.setRead(isRead, tx);
		this._markSessionUnreadForUnreadChat(tx);
		return true;
	}

	setLegacySessionReadState(isRead: boolean, tx?: ITransaction): boolean {
		let didChange = this.isRead.get() !== isRead;
		for (const chat of this._chatsObs.get()) {
			if (this._aggregateChatResources.size > 0 && !this._aggregateChatResources.has(chat.resource)) {
				continue;
			}
			if (chat.isRead.get() !== isRead) {
				this.setChatRead(chat.resource, isRead, tx);
				didChange = true;
			}
		}
		this.isRead.set(isRead, tx);
		return didChange;
	}

	getBackendChatResource(chatResource: URI): URI | undefined {
		if (isEqual(chatResource, this._defaultChat.resource)) {
			return this._defaultChatBackendUri.get();
		}
		return chatResource.fragment ? this._additionalChats.get(chatResource.fragment)?.backendUri : undefined;
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

	setChatModelId(chatResource: URI, modelId: string | undefined, source: ChatModelSource): void {
		const chatId = chatResource.fragment;
		if (chatId) {
			// Recorded whether or not the chat's entry exists yet: a locally created chat can be
			// given its model before the session state that materializes it arrives.
			this._chatModelSelections.set(chatId, { modelId, source });
			this._getAdditionalChat(chatResource)?.setModelId(modelId, source);
		} else {
			transaction(tx => {
				this.modelSource.set(modelId ? source : undefined, tx);
				this.modelId.set(modelId, tx);
			});
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

	/**
	 * As {@link hydrateSelectedAgent}, for the model the session was last running on.
	 *
	 * {@link ChatModelSource.Chosen} because that is what it is: the session's own model, read back
	 * from where the host persisted it. Without this a reopened session reports no model at all,
	 * and model selection cannot tell it from one that has never had a model.
	 */
	hydrateSelectedModel(selection: ModelSelection): void {
		if (this.modelId.get() !== undefined) {
			return;
		}
		this.setChatModelId(this.resource, `${this._resourceScheme}:${selection.id}`, ChatModelSource.Chosen);
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
			const hasMultipleChats = metadata.chats?.some(chat => chat.kind === 'peer') ?? this._hasMultipleChats.get();
			if (!hasMultipleChats && this._defaultChatUpdatedAt.get()?.getTime() !== modifiedTime) {
				this._defaultChatUpdatedAt.set(new Date(modifiedTime), tx);
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

			if (this.applyChatMetadata(metadata.chats, tx)) {
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
	setActivity(activity: string | null | undefined, tx?: ITransaction): boolean {
		const value = activity ?? undefined;
		if (this._activity.get() !== value) {
			this._activity.set(value, tx);
			return true;
		}

		return false;
	}

	/**
	 * Apply a `_meta` delta (the shared session-state / session-summary bag,
	 * fed from `_applySessionMetadataFromState` or a `SessionSummaryChanged`
	 * notification), synchronize the session kind, and rebuild the workspace.
	 * Returns `true` iff anything observable changed, so the list regroups a
	 * session whose kind changed even when its workspace did not.
	 *
	 * Callers that are already inside a transaction MUST pass it: a plain
	 * `transaction()` here would finish (and therefore notify) mid-way through
	 * the enclosing one, letting observers of `_meta` / `isQuickChat` /
	 * `workspace` read a torn snapshot of the fields the caller has not applied
	 * yet.
	 */
	setMeta(meta: SessionMeta | undefined, tx?: ITransaction): boolean {
		// Discovery knows the creating application even when the host reports a fallback.
		const initiator = this.discoveryMetadata?.initiator ?? readSessionInitiator({ _meta: meta }) ?? readSessionInitiator({ _meta: this._meta });
		if (initiator) {
			meta = withSessionInitiator(meta, initiator);
		}
		const metaChanged = !equals(this._meta, meta);
		this._meta = meta;
		let didChange = metaChanged;
		subtransaction(tx, tx => {
			this._metaObs.set(this._meta, tx);
			if (this._syncQuickChatFromMeta(tx)) {
				didChange = true;
			}
			const workspace = this._computeWorkspace();
			if (this._setWorkspace(workspace, tx)) {
				didChange = true;
			}
		});
		return didChange;
	}

	/**
	 * Applies the workspace-bearing fields from authoritative session state in
	 * one transaction so observers cannot see a converted session paired with
	 * its previous working directory. On the first state snapshot, absent
	 * optional fields retain catalogue metadata for compatibility; a later
	 * present-to-absent transition clears them.
	 */
	applySessionStateMetadata(metadata: AgentHostSessionStateMetadata, previous: SessionState | undefined): boolean {
		let didChange = false;
		transaction(tx => {
			if (Object.prototype.hasOwnProperty.call(metadata, 'project')) {
				this._project = metadata.project;
			}
			if (metadata.workingDirectories !== undefined || previous?.workingDirectories !== undefined) {
				this._workingDirectories = metadata.workingDirectories;
			}
			if (metadata._meta !== undefined || previous?._meta !== undefined) {
				didChange = this.setMeta(metadata._meta, tx);
			} else {
				didChange = this._setWorkspace(this._computeWorkspace(), tx);
			}
		});
		return didChange;
	}

	/**
	 * Applies project and working-directory fields from a session-summary delta.
	 * Property presence distinguishes an omitted field from an explicit clear.
	 */
	applySessionSummaryWorkspaceMetadata(metadata: AgentHostSessionSummaryWorkspaceMetadata, tx: ITransaction): boolean {
		let didChange = false;
		if (Object.prototype.hasOwnProperty.call(metadata, 'project')) {
			const project = metadata.project;
			if (!sessionProjectsEqual(this._project, project)) {
				this._project = project;
				didChange = true;
			}
		}
		if (Object.prototype.hasOwnProperty.call(metadata, 'workingDirectories')) {
			const workingDirectories = metadata.workingDirectories;
			const directoriesMatch = this._workingDirectories === workingDirectories
				|| (!!this._workingDirectories && !!workingDirectories && arrayEquals(this._workingDirectories, workingDirectories, (a, b) => isEqual(a, b)));
			if (!directoriesMatch) {
				this._workingDirectories = workingDirectories;
				didChange = true;
			}
		}
		if (didChange) {
			this._setWorkspace(this._computeWorkspace(), tx);
		}
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

	private _syncQuickChatFromMeta(tx: ITransaction): boolean {
		const isQuickChat = readSessionWorkspaceless(this._meta);
		if (this._isQuickChat.get() === isQuickChat) {
			return false;
		}
		this._isQuickChat.set(isQuickChat, tx);
		return true;
	}

	/**
	 * The session's project. Read at persist time so a value assigned after the snapshot was taken
	 * is not lost on the next save.
	 */
	get project(): IAgentSessionMetadata['project'] { return this._project; }

	/** Refresh discovery-owned fields without overwriting fields changed by the host. */
	updateDiscoveryMetadata(metadata: Pick<IAgentSessionMetadata, 'summary' | 'modifiedTime' | 'project' | '_meta'>): boolean {
		const previous: IAgentHostSessionDiscoveryMetadata = this.discoveryMetadata ?? {
			summary: metadata.summary,
			modifiedTime: metadata.modifiedTime,
			project: this._project ? metadata.project ?? null : null,
		};
		const initiator = readSessionInitiator(metadata) ?? previous.initiator;
		let summary: string | undefined;
		let modifiedTime: number | undefined;
		let project: IAgentHostSessionDiscoveryMetadata['project'];
		let didChange = false;
		transaction(tx => {
			if (previous.summary !== undefined && this.title.get() === previous.summary) {
				summary = metadata.summary ?? previous.summary;
				if (summary !== this.title.get()) {
					this.title.set(summary, tx);
					didChange = true;
				}
			}
			if (previous.modifiedTime !== undefined && this.updatedAt.get().getTime() === previous.modifiedTime) {
				modifiedTime = metadata.modifiedTime;
				if (modifiedTime !== this.updatedAt.get().getTime()) {
					this.updatedAt.set(new Date(modifiedTime), tx);
					didChange = true;
				}
			}
			if (previous.project !== undefined && sessionProjectsEqual(this._project, previous.project ?? undefined)) {
				project = metadata.project ?? null;
				didChange = this.applySessionSummaryWorkspaceMetadata({ project: metadata.project }, tx) || didChange;
			}
			didChange ||= !this.discoveryMetadata
				|| previous.summary !== summary
				|| previous.modifiedTime !== modifiedTime
				|| !sessionProjectsEqual(previous.project, project)
				|| !equals(previous.initiator, initiator);
			this.discoveryMetadata = { summary, modifiedTime, project, initiator };
			if (initiator) {
				didChange = this.setMeta(this._meta, tx) || didChange;
			}
		});
		return didChange;
	}

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

	/** Adds live pull request presentation (icon, state, title) to GitHub info. */
	private _presentGitHubInfo(baseGitHubInfoObs: IObservable<IGitHubInfo | undefined>): IObservable<IGitHubInfo | undefined> {
		const gitHubInfoWithIcon = derived<IGitHubInfo | undefined>(this, reader => {
			const baseGitHubInfo = baseGitHubInfoObs.read(reader);
			if (!baseGitHubInfo?.pullRequest) {
				return baseGitHubInfo;
			}

			const isPrimaryPullRequest = (pullRequest: IGitHubPullRequestRef) =>
				pullRequest.number === baseGitHubInfo.pullRequest?.number &&
				isEqual(pullRequest.uri, baseGitHubInfo.pullRequest.uri);
			const baseRefs = getGitHubPullRequestRefs(baseGitHubInfo);
			const primaryIndex = Math.max(0, baseRefs.findIndex(isPrimaryPullRequest));
			const pullRequests = baseRefs.map((pullRequest, index) => ({
				...pullRequest,
				...computePullRequestRefPresentation(
					reader,
					this._gitHubService,
					this._pullRequestIconCache,
					pullRequest,
					index === primaryIndex ? computePullRequestIcon(GitHubPullRequestState.Open) : undefined,
				)
			}));
			const primaryPullRequest = pullRequests[primaryIndex];
			return {
				...baseGitHubInfo,
				pullRequests: baseGitHubInfo.pullRequests ? pullRequests : undefined,
				pullRequest: {
					...baseGitHubInfo.pullRequest,
					icon: primaryPullRequest.icon,
					liveState: primaryPullRequest.liveState,
					title: primaryPullRequest.title,
				}
			};
		});
		return derivedOpts<IGitHubInfo | undefined>({ owner: this, equalsFn: isGitHubInfoEqual }, reader => gitHubInfoWithIcon.read(reader));
	}

	/** Working-directory key of the session folder, the main chat's first folder. */
	private _getSessionFolderKey(reader: IReader): string | undefined {
		const workingDirectory = this._getSessionFolderWorkingDirectory(reader);
		return workingDirectory ? readWorkingDirectoryKey(this._metaObs.read(reader), workingDirectory) : undefined;
	}

	private _getSessionFolderWorkingDirectory(reader: IReader): string | undefined {
		// The session workspace changes whenever its working directories do.
		this.workspace.read(reader);
		const defaultChatWorkingDirectory = this._defaultChatWorkingDirectories.read(reader)?.[0];
		return defaultChatWorkingDirectory ?? (this._workingDirectories?.[0] ? fromAgentHostUri(this._workingDirectories[0]).toString() : undefined);
	}

	/**
	 * The folder whose Agent Merge settings `chat` uses — its first folder, or
	 * the session folder (the main chat's first folder) for the main chat or
	 * when omitted. `undefined` while a peer chat's folders are still loading,
	 * so its settings are never mistaken for the session folder's.
	 */
	getAgentMergeFolder(chat: URI | undefined, reader?: IReader): IAgentMergeFolder | undefined {
		const meta = reader ? this._metaObs.read(reader) : this._metaObs.get();
		const sessionWorkingDirectory = reader
			? this._getSessionFolderWorkingDirectory(reader)
			: this._defaultChatWorkingDirectories.get()?.[0] ?? (this._workingDirectories?.[0] ? fromAgentHostUri(this._workingDirectories[0]).toString() : undefined);
		const sessionFolderKey = sessionWorkingDirectory ? readWorkingDirectoryKey(meta, sessionWorkingDirectory) : undefined;
		if (!chat || isEqual(chat, this._defaultChat.resource)) {
			return { folderKey: sessionFolderKey, sessionFolderKey, workingDirectory: sessionWorkingDirectory };
		}
		const chats = reader ? this._chatsObs.read(reader) : this._chatsObs.get();
		const chatAdapter = chats.find(candidate => isEqual(candidate.resource, chat));
		const folder = (reader ? chatAdapter?.workspace.read(reader) : chatAdapter?.workspace.get())?.folders[0];
		if (!folder) {
			return undefined;
		}
		const workingDirectory = fromAgentHostUri(folder.workingDirectory).toString();
		return { folderKey: readWorkingDirectoryKey(meta, workingDirectory), sessionFolderKey, workingDirectory };
	}

	/** Resolves the GitHub info each session folder reports from its own state. */
	private _getFolderGitHubInfoResolver(reader: IReader): IFolderGitHubInfoResolver {
		const sessionFolderKey = this._getSessionFolderKey(reader);
		return workingDirectory => {
			const meta = this._metaObs.read(reader);
			const folderKey = toFolderGitHubKey(meta, workingDirectory);
			const isSessionFolder = folderKey === sessionFolderKey;
			const cacheKey = `${folderKey}\u0001${isSessionFolder}`;
			let gitHubInfo = this._folderGitHubInfos.get(cacheKey);
			if (isSessionFolder) {
				return this.gitHubInfo;
			}
			if (!gitHubInfo) {
				gitHubInfo = this._presentGitHubInfo(derivedOpts<IGitHubInfo | undefined>({ equalsFn: isGitHubInfoEqual }, reader => {
					const meta = this._metaObs.read(reader);
					return toGitHubInfo(meta, workingDirectory, toFolderGitHubKey(meta, workingDirectory), isSessionFolder);
				}));
				this._folderGitHubInfos.set(cacheKey, gitHubInfo);
			}
			return gitHubInfo;
		};
	}

	private _getChatScopeGitState(reader: IReader, workingDirectories: readonly string[] | undefined): ISessionGitState | undefined {
		return workingDirectories
			? readFolderScopeGitState(this._metaObs.read(reader), readWorkingDirectoryScopeId(this._metaObs.read(reader), workingDirectories))
			: undefined;
	}

	private _createChatCurrentTurnChangesObservable(chatUriObs: IObservable<URI | undefined>): IObservable<IAgentHostCurrentTurnChanges | undefined> {
		const chatStateObs = createActiveSessionSubscriptionObs<ChatState>(
			this._options,
			this.isActiveSessionObs,
			StateComponents.Chat,
			chatUriObs,
		);
		return derived(reader => {
			const chatUri = chatUriObs.read(reader);
			const chatState = chatStateObs.read(reader).read(reader);
			if (!chatUri || !chatState || chatState instanceof Error || !chatState.activeTurn) {
				return undefined;
			}
			return {
				id: chatState.activeTurn.id,
				changes: this._sessionOutput.getLastTurnChanges(chatUri).read(reader).filter(change => !change.isOutsideWorkspace),
			};
		});
	}

	/** Background shells come from the chat channel, which is only subscribed while the session is active. */
	private _createChatBackgroundShellsObservable(chatUriObs: IObservable<URI | undefined>): IObservable<readonly IChatBackgroundShell[]> {
		const chatStateObs = createActiveSessionSubscriptionObs<ChatState>(
			this._options,
			this.isActiveSessionObs,
			StateComponents.Chat,
			chatUriObs,
		);
		const outputs = new AgentHostBackgroundShellOutputs(reader => this._options.getConnection(reader));
		return derivedOpts<readonly IChatBackgroundShell[]>({ owner: this, equalsFn: structuralEquals }, reader => {
			const chatState = chatStateObs.read(reader).read(reader);
			return chatState && !(chatState instanceof Error) ? outputs.project(chatState.backgroundWork) : [];
		});
	}

	private _createChatCanvasesObservable(chatUriOrObservable: URI | IObservable<URI | undefined>): IObservable<readonly ISessionCanvas[] | undefined> {
		const chatUriObs = URI.isUri(chatUriOrObservable) ? constObservable(chatUriOrObservable) : chatUriOrObservable;
		const chatStateObs = createActiveSessionSubscriptionObs<ChatState>(
			this._options,
			this.isActiveSessionObs,
			StateComponents.Chat,
			chatUriObs,
		);
		const canvases = derivedOpts<readonly CanvasReference[] | undefined>({ equalsFn: structuralEquals }, reader => {
			const chatState = chatStateObs.read(reader).read(reader);
			return !chatState || chatState instanceof Error ? undefined : chatState.canvases ?? [];
		});
		const canvasStates = mapObservableArrayCached(this, canvases.map(references => references ?? []), canvas => {
			const resource = URI.parse(canvas.resource);
			const stateObs = createActiveSessionSubscriptionObs<CanvasState>(
				this._options, this.isActiveSessionObs, StateComponents.Canvas, constObservable(resource),
			);
			return derived(reader => {
				const state = stateObs.read(reader).read(reader);
				return this._options.instantiationService.createInstance(AgentHostSessionCanvas, resource,
					state && !(state instanceof Error) ? state : undefined);
			});
		}, canvas => canvas.resource);
		return derived(reader => {
			if (canvases.read(reader) === undefined) {
				return undefined;
			}
			return canvasStates.read(reader).map(canvas => canvas.read(reader));
		});
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
	readonly resolveInitialPermissionConfig?: (config: ResolveSessionConfigResult) => Record<string, unknown>;
	readonly initialModeId?: string;
	/** Pull request the backend session is created from; requires a host that supports pull request sessions. */
	readonly initialPullRequestUrl?: string;
	/** Provider-owned Automation values restored before the first configuration resolution. */
	readonly initialSessionTemplate?: IAutomationSessionTemplate;
	/** Model selected specifically for this draft. */
	readonly initialModelId?: string;
	/** Model-specific primitive values scoped specifically to this draft. */
	readonly initialModelConfiguration?: Readonly<Record<string, string | number | boolean | null>>;
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
	readonly onSessionCreated: (backendSession: URI) => void;
	readonly activeClientScope: IAgentCustomizationScope;
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
	/** This draft's URI as the host's registry is keyed by it. */
	readonly backendUri: URI;
	readonly workspaceUri: URI | undefined;
	readonly requiresWorkspaceTrust: boolean;
	/** `true` when this is a workspace-less quick chat. */
	readonly isQuickChat: boolean;
	/** Session-kind strategy chosen once at construction (quick chat vs. workspace). */
	private readonly _kind: IAgentHostSessionKind;

	private readonly _status: ISettableObservable<SessionStatus>;
	private readonly _title: ISettableObservable<string>;
	private readonly _modelId: ISettableObservable<string | undefined>;
	private readonly _modelSource: ISettableObservable<ChatModelSource | undefined>;
	private readonly _mode: ISettableObservable<{ readonly id: string; readonly kind: string } | undefined>;
	private readonly _workspace: ISettableObservable<ISessionWorkspace | undefined>;
	private readonly _changesets = observableValue<readonly ISessionChangeset[] | undefined>(this, undefined);
	private readonly _worktreePending = observableValue<boolean>(this, false);
	private readonly _description: ISettableObservable<IMarkdownString | undefined>;
	private readonly _isNewSessionRequestInProgress = observableValue(this, false);
	readonly preparationProgress = observableValue<ISessionPreparationProgress | undefined>(this, undefined);
	private readonly _newSessionRequestActivities = new Map<number, string | undefined>();
	private _newSessionRequestId = 0;
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
		return this._activeClientScope.customAgents.get();
	}

	/**
	 * Latest resolved config. Replaces what used to live in `_newSessionConfigs`.
	 * `undefined` indicates the most recent {@link resolveConfig} failed and no
	 * cached values are usable.
	 */
	private _config: ResolveSessionConfigResult | undefined = { schema: { type: 'object', properties: {} }, values: {} };
	private _configResolution: Promise<void> | undefined;
	private _configOperation: Promise<void> | undefined;
	private _unresolvedConfigValues: Record<string, unknown> | undefined;
	private readonly _explicitlySetConfigProperties = new Set<string>();
	private _branchLoad: Promise<readonly SessionConfigValueItem[]> | undefined;

	/**
	 * Monotonic counter for in-flight {@link resolveConfig} calls. Each call
	 * increments the counter and only writes its result back if its sequence
	 * is still the latest one. Bumped on dispose so any pending resolve
	 * discards itself.
	 */
	private _configRequestSeq = 0;
	private _hasResolvedConfig = false;
	private _initialConfigError: Error | undefined;
	private _lastResolvedConfigSchema: SessionConfigSchema | undefined;

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
	/** Held default-chat subscription used to publish the draft's changesets. */
	private _chatSubscription: IReference<IAgentSubscription<ChatState>> | undefined;
	/**
	 * `onDidChange` listener for {@link _subscription}. Forwards every
	 * `SessionState` snapshot to the provider via {@link _onSessionState}
	 * so the new session's customizations (and any other state) reach
	 * `_lastSessionStates` while the session is still Untitled. Detached
	 * in {@link graduate} (handoff) and {@link dispose} (close-without-send).
	 */
	private readonly _stateListener = this._register(new MutableDisposable());
	private readonly _chatStateListener = this._register(new MutableDisposable());
	/**
	 * Autorun republishing active-client changes for this draft. Cleared in
	 * {@link graduate} so the session handler's own reconciliation owns
	 * republishing from then on, and the two never race.
	 */
	private readonly _activeClientPublisher = this._register(new MutableDisposable());
	private readonly _onSessionState: ((sessionId: string, state: SessionState | undefined) => void) | undefined;
	private readonly _onSessionCreated: INewSessionConstructionContext['onSessionCreated'];

	private readonly _activeClientScope: IAgentCustomizationScope;
	private readonly _initialMetadata: Record<string, unknown> | undefined;
	private readonly _initialSessionTemplate: IAutomationSessionTemplate | undefined;
	private readonly _resolveInitialPermissionConfig: INewSessionConstructionContext['resolveInitialPermissionConfig'];
	private readonly _initialModeId: string | undefined;
	private readonly _initialPullRequestUrl: string | undefined;
	readonly modelConfiguration: AutomationModelConfiguration;
	get initialMetadata(): Record<string, unknown> | undefined { return this._initialMetadata; }

	private readonly _logService: ILogService;
	private readonly _providerId: string;

	constructor(
		ctx: INewSessionConstructionContext,
		private readonly _options: IAgentHostAdapterOptions,
		@ISessionsService sessionsService: ISessionsService,
		@ILanguageModelsService languageModelsService: ILanguageModelsService,
	) {
		super();
		const initialSessionTemplate = ctx.initialSessionTemplate;
		const initialModelId = ctx.initialModelId ?? initialSessionTemplate?.modelId;
		if (ctx.initialModelConfiguration && !initialModelId) {
			throw new Error('Session model configuration requires a model identifier.');
		}
		const initialModelConfiguration = ctx.initialModelConfiguration
			?? (initialSessionTemplate?.modelId === initialModelId ? initialSessionTemplate?.modelConfiguration : undefined);
		this.modelConfiguration = this._register(new AutomationModelConfiguration(languageModelsService, initialModelId ? {
			modelId: initialModelId,
			...(initialModelConfiguration !== undefined ? { modelConfiguration: initialModelConfiguration } : {}),
		} : undefined));
		const workspaceUri = ctx.workspace?.folders[0]?.root;
		this._kind = sessionKind(!!ctx.quickChat);
		if (this._kind.requiresWorkspace && !workspaceUri) {
			throw new Error('Workspace has no repository URI');
		}
		this.workspaceUri = workspaceUri && findDevContainerSample(workspaceUri) ? undefined : workspaceUri;
		this.isQuickChat = this._kind.isQuickChat;
		this.requiresWorkspaceTrust = !!ctx.workspace?.requiresWorkspaceTrust;
		this.agentProvider = ctx.sessionType.id;
		this._providerId = ctx.providerId;
		this._logService = ctx.logService;
		this._onSessionState = ctx.onSessionState;
		this._onSessionCreated = ctx.onSessionCreated;
		this._activeClientScope = ctx.activeClientScope;
		this._register(this._activeClientScope);
		this._initialMetadata = ctx.initialMetadata;
		this._initialSessionTemplate = initialSessionTemplate;
		this._resolveInitialPermissionConfig = ctx.resolveInitialPermissionConfig;
		this._initialModeId = ctx.initialModeId;
		this._initialPullRequestUrl = ctx.initialPullRequestUrl;

		const resource = URI.from({ scheme: ctx.resourceScheme, path: `/${generateUuid()}` });
		this._isActiveSessionObs = derived(this, reader => isEqual(sessionsService.activeSession.read(reader)?.resource, resource));
		// Defaults to scheme == provider; only hosts that address sessions under a different
		// scheme (cloud sandbox: provider `copilot`, scheme `ahp-session`) override it.
		this.backendUri = AgentSession.uri(ctx.backendSessionScheme ?? this.agentProvider, AgentSession.id(resource));
		this._status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
		this._title = observableValue<string>(this, '');
		const title = this._title;
		const updatedAt = observableValue(this, new Date());
		this._workspace = observableValue<ISessionWorkspace | undefined>(this, ctx.workspace);
		const changes = observableValueOpts<readonly (IChatSessionFileChange | IChatSessionFileChange2)[]>({ owner: this, equalsFn: sessionFileChangesEqual }, []);
		const checkpoints = observableValue(this, undefined);
		this._selectedModelId = initialModelId;
		this._selectedAgent = ctx.initialSessionTemplate?.agent ? { uri: ctx.initialSessionTemplate.agent.uri, name: '' } : undefined;
		this._modelId = observableValue<string | undefined>(this, this._selectedModelId);
		this._modelSource = observableValue<ChatModelSource | undefined>(this, this._selectedModelId ? ChatModelSource.Chosen : undefined);
		const mode = observableValue<{ readonly id: string; readonly kind: string } | undefined>(this, this._selectedAgent ? { id: this._selectedAgent.uri, kind: AGENT_MODE_KIND } : undefined);
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
			workspace: this._workspace,
			status: this._status,
			changes,
			changesets: this._changesets,
			checkpoints,
			modelId: this._modelId,
			modelSource: this._modelSource,
			mode, isArchived, isRead,
			interactivity: constObservable(ChatInteractivity.Full),
			description: this._description, lastTurnEnd,
		};
		this._mainChat = observableValue<IChat>(this, mainChat);
		const authPending = ctx.authenticationPending;
		const loading = this._loading;
		const chats = this._mainChat.map(c => [c]);
		const connectionStatus = _options.connectionStatus;
		this.session = {
			sessionId: `${ctx.providerId}:${resource.toString()}`,
			resource,
			providerId: ctx.providerId,
			sessionType: ctx.sessionType.id,
			harness: ctx.sessionType.id === 'copilotcli' ? 'copilot' : ctx.sessionType.id,
			environment: _options.environment,
			application: constObservable(getSessionApplication('vscode')),
			icon: ctx.icon,
			createdAt,
			workspace: this._workspace,
			isQuickChat: constObservable(this._kind.isQuickChat),
			worktreePending: this._worktreePending,
			remoteConnectionStatus: toSessionRemoteConnectionStatus(this, connectionStatus),
			title,
			updatedAt,
			status: this._status,
			modelId: this._modelId,
			mode,
			loading: derived(reader => loading.read(reader) || authPending.read(reader)),
			isNewSessionRequestInProgress: this._isNewSessionRequestInProgress,
			preparationProgress: this.preparationProgress,
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
		const config = this._config;
		const isolation = config && getSessionWorkspaceProperties(config.schema).isolation;
		this._worktreePending.set(isolation
			? readSessionIsolation(isolation, config?.values[isolation.key] ?? isolation.schema.default) === 'worktree'
			: isWorktreeIsolation(config?.values), undefined);
	}

	// -- Picker mutations ----------------------------------------------------

	setSelectedModelId(modelId: string, source: ChatModelSource): void {
		this._selectedModelId = modelId;
		transaction(tx => {
			this._modelSource.set(source, tx);
			this._modelId.set(modelId, tx);
		});
	}

	getSelectedModelId(): string | undefined { return this._selectedModelId; }
	clearSelectedModelId(): void { this._selectedModelId = undefined; }
	getSelectedModel(): ModelSelection | undefined {
		const modelId = this._selectedModelId;
		if (!modelId) {
			return undefined;
		}
		const prefix = `${this.session.resource.scheme}:`;
		const config = this.modelConfiguration.getModelConfigurationForRequest(modelId);
		return {
			id: modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId,
			...(config !== undefined ? { config } : {}),
		};
	}
	/** Untitled skeleton title used until the first request commits the session. */
	get untitledTitle(): string { return this._kind.untitledTitle; }
	setSelectedAgent(agent: ISessionAgentRef | undefined): void {
		this._selectedAgent = agent;
		this._mode.set(agent ? { id: agent.uri, kind: AGENT_MODE_KIND } : undefined, undefined);
	}

	getSelectedAgent(): ISessionAgentRef | undefined { return this._selectedAgent; }
	getInitialSessionTemplate(): IAutomationSessionTemplate | undefined { return this._initialSessionTemplate; }
	clearSelectedAgent(): void {
		this._selectedAgent = undefined;
		this._mode.set(undefined, undefined);
	}

	setStatus(status: SessionStatus): void { this._status.set(status, undefined); }
	startRequest(activity: string | undefined): IDisposable {
		const requestId = this._newSessionRequestId++;
		this._newSessionRequestActivities.set(requestId, activity);
		transaction(tx => {
			this._isNewSessionRequestInProgress.set(true, tx);
			this._description.set(activity ? new MarkdownString().appendText(activity) : undefined, tx);
		});
		return toDisposable(() => {
			if (!this._newSessionRequestActivities.delete(requestId)) {
				return;
			}
			const latestActivity = Array.from(this._newSessionRequestActivities.values()).at(-1);
			transaction(tx => {
				this._isNewSessionRequestInProgress.set(this._newSessionRequestActivities.size > 0, tx);
				this._description.set(latestActivity ? new MarkdownString().appendText(latestActivity) : undefined, tx);
			});
		});
	}
	setLoading(loading: boolean): void { this._loading.set(loading, undefined); }
	setTitle(title: string): void { this._title.set(title, undefined); }

	/** Applies the session's Git and GitHub state; `sessionWorkingDirectory` is the backend URI of its first folder. */
	applySessionMeta(meta: SessionMeta | undefined, sessionWorkingDirectory: string | undefined): boolean {
		const workspace = this._workspace.get();
		const primaryFolder = workspace?.folders[0];
		if (!workspace || !primaryFolder) {
			return false;
		}

		const gitState = readSessionGitState(meta);
		const gitHubInfo = toGitHubInfo(meta, sessionWorkingDirectory === undefined ? undefined : URI.parse(sessionWorkingDirectory), sessionWorkingDirectory === undefined ? undefined : readWorkingDirectoryKey(meta, sessionWorkingDirectory), true);
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
					isRepository: constObservable(true),
					branchName: gitState?.branchName ?? currentRepository.branchName,
					baseBranchName: gitState?.baseBranchName ?? currentRepository.baseBranchName,
					hasGitRemote: gitState?.hasGitRemote ?? currentRepository.hasGitRemote,
					hasGitHubRemote: gitState?.hasGitHubRemote ?? currentRepository.hasGitHubRemote,
					upstreamBranchName: gitState?.upstreamBranchName ?? currentRepository.upstreamBranchName,
					defaultBranchName: gitState?.defaultBranchName ?? currentRepository.defaultBranchName,
					defaultRemoteBranchName: gitState?.defaultRemoteBranchName
						?? (gitState?.defaultBranchName !== undefined ? undefined : currentRepository.defaultRemoteBranchName),
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
	getConfigForWrite(): ResolveSessionConfigResult | undefined {
		return this._config ?? (this._lastResolvedConfigSchema ? { schema: this._lastResolvedConfigSchema, values: this._unresolvedConfigValues ?? {} } : undefined);
	}
	getConfigValues(): Record<string, unknown> | undefined { return this._config && filterSessionConfigValues(this._config.schema, this._config.values); }

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

	trackConfigOperation(operation: Promise<void>): void {
		this._configOperation = operation;
		void operation.then(
			() => this._clearConfigOperation(operation),
			() => this._clearConfigOperation(operation),
		);
	}

	/** Whether the backend session may only be created with the resolved initial permissions, mode, or pull request. */
	private get _requiresResolvedInitialConfig(): boolean {
		return !!this._resolveInitialPermissionConfig || !!this._initialModeId || !!this._initialPullRequestUrl;
	}

	async waitForConfigurationReady(): Promise<void> {
		while (this._configOperation || this._configResolution) {
			if (this._configOperation) {
				await raceCancellationError(this._configOperation, this.cancellationToken);
			} else {
				await this.waitForConfigResolution();
			}
		}
		if (this._requiresResolvedInitialConfig && !this._hasResolvedConfig) {
			throw this._initialConfigError ?? new Error(localize('agentHost.initialConfigFailed', "The initial session configuration could not be resolved."));
		}
	}

	private _clearConfigResolution(promise: Promise<void>): void {
		if (this._configResolution === promise) {
			this._configResolution = undefined;
		}
	}

	private _clearConfigOperation(promise: Promise<void>): void {
		if (this._configOperation === promise) {
			this._configOperation = undefined;
		}
	}

	/**
	 * Optimistically updates a single property in the cached config.
	 * An undefined value removes the property.
	 * Preserves the existing schema so schema-driven pickers don't flash
	 * during the async re-resolve. {@link resolveConfig} replaces both
	 * schema and values when its response lands.
	 */
	setConfigValue(property: string, value: unknown, explicitlySet = false): void {
		const current = this._config;
		const values = { ...(current?.values ?? this._unresolvedConfigValues) };
		if (value === undefined) {
			delete values[property];
		} else {
			values[property] = value;
		}
		this._config = {
			schema: current?.schema ?? this._lastResolvedConfigSchema ?? { type: 'object', properties: {} },
			values,
		};
		if (explicitlySet) {
			this._explicitlySetConfigProperties.add(property);
		}
		this._syncWorktreePending();
	}

	wasConfigValueExplicitlySet(property: string): boolean {
		return this._explicitlySetConfigProperties.has(property);
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
		const values = this._config?.values ?? this._unresolvedConfigValues;
		this._isResolvingConfig.set(true, undefined);
		try {
			const discovered = await connection.resolveSessionConfig({
				provider: this.agentProvider,
				workingDirectory: this.workspaceUri,
				config: this._hasResolvedConfig && this._config ? filterSessionConfigValues(this._config.schema, values) : undefined,
			});
			if (seq !== this._configRequestSeq) {
				return false;
			}
			let result = discovered;
			if (!this._hasResolvedConfig || !this._config) {
				const permissions = !this._hasResolvedConfig ? this._resolveInitialPermissionConfig?.(discovered) : undefined;
				const initial = { ...filterSessionConfigValues(discovered.schema, values), ...permissions };
				if (Object.entries(initial).some(([key, value]) => !equals(value, discovered.values[key]))) {
					result = await connection.resolveSessionConfig({
						provider: this.agentProvider,
						workingDirectory: this.workspaceUri,
						config: { ...filterSessionConfigValues(discovered.schema, discovered.values), ...initial },
					});
					if (seq !== this._configRequestSeq) {
						return false;
					}
				}
				for (const [key, value] of Object.entries(permissions ?? {})) {
					const approval = getSessionApprovalProperty(result.schema);
					const effective = approval?.key === key ? getEffectiveSessionApprovalValue(approval, result.schema, result.values)
						: result.values[key] ?? result.schema.properties[key]?.default;
					if (!equals(effective, value)) {
						throw new Error(localize('agentHost.initialPermissionRejected', "The selected session permissions could not be applied: the agent host did not apply '{0}'.", key));
					}
				}
				if (!this._hasResolvedConfig && this._initialModeId) {
					const property = result.schema.properties[SessionConfigKey.Mode];
					const effectiveMode = property ? result.values[SessionConfigKey.Mode] ?? property.default : undefined;
					if (effectiveMode !== this._initialModeId) {
						throw new Error(localize('agentHost.initialModeRejected', "The selected session mode '{0}' could not be applied.", this._initialModeId));
					}
				}
				// Hosts that support pull request sessions always advertise the property.
				if (!this._hasResolvedConfig && this._initialPullRequestUrl && result.values[SessionConfigKey.PullRequestUrl] !== this._initialPullRequestUrl) {
					throw new Error(localize('agentHost.pullRequestSessionsUnsupported', "This agent host does not support creating sessions from pull requests."));
				}
				this._initialConfigError = undefined;
				this._hasResolvedConfig = true;
			}
			this._config = result;
			this._lastResolvedConfigSchema = result.schema;
			this._unresolvedConfigValues = undefined;
			this._syncWorktreePending();
			return true;
		} catch (error) {
			if (seq !== this._configRequestSeq) {
				return false;
			}
			this._config = undefined;
			this._unresolvedConfigValues = values;
			this._syncWorktreePending();
			if (this._requiresResolvedInitialConfig && !this._hasResolvedConfig) {
				this._initialConfigError = error instanceof Error ? error : new Error(getErrorMessage(error));
				this._logService.error(`[${this._providerId}] Failed to resolve initial session configuration`, error);
			}
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
			config: this.getConfigValues(),
			property,
			query,
		});
	}

	loadBranches(connection: IAgentConnection): Promise<readonly SessionConfigValueItem[]> {
		const branch = this._config && getSessionWorkspaceProperties(this._config.schema).baseBranch;
		if (!branch) {
			return Promise.resolve([]);
		}
		if (!this._branchLoad) {
			const load = this.getConfigCompletions(connection, branch.key, undefined).then(result => result.items);
			this._branchLoad = load;
			// The host reports a timed-out or failed git query as an empty list, which is
			// likely right after startup, so only keep a non-empty result for later picker opens.
			const forget = () => {
				if (this._branchLoad === load) {
					this._branchLoad = undefined;
				}
			};
			load.then(items => {
				if (items.length === 0) {
					forget();
				}
			}, forget);
		}
		return this._branchLoad;
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
		const backendUri = this.backendUri;
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

			// Seeds the publisher below so its first run is a no-op when nothing
			// changed, without depending on the state subscription having
			// hydrated by then.
			let createdWithActiveClient: SessionActiveClient | undefined;

			try {
				if (this._requiresResolvedInitialConfig) {
					await this.waitForConfigurationReady();
				}
				await this._activeClientScope.whenResolved();
				if (this._backendUri?.toString() !== backendUri.toString()) {
					return;
				}
				const activeClient = this._activeClientScope.activeClient(connection.clientId).get();
				createdWithActiveClient = activeClient;
				const createdSession = await connection.createSession({
					provider: this.agentProvider,
					session: backendUri,
					...(this._selectedModelId ? { model: this.getSelectedModel() } : {}),
					workingDirectories: this.workspaceUri ? [this.workspaceUri] : undefined,
					config: this.getConfigValues(),
					_meta: this._initialMetadata,
					// MCP-style opt-in: offer to receive `progress` for any
					// long-running bring-up (chiefly the lazy first-use SDK
					// download, which fires later at first-message
					// materialization). The host echoes this token on each
					// `progress` frame so `_handleProgress` can correlate it.
					progressToken: generateUuid(),
					...(this._selectedAgent ? { agent: { uri: this._selectedAgent.uri } } : {}),
					activeClient,
				});
				if (!isEqual(createdSession, backendUri)) {
					throw new Error(`Agent host returned unexpected session URI: ${createdSession.toString()}`);
				}
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
			this._onSessionCreated(backendUri);

			// Hold a state subscription for our lifetime so the agent host's
			// empty-session GC sees a non-zero subscriber count. The session
			// handler refcounts the same subscription via `getSubscription`
			// when chat content opens, so when we release this ref on
			// graduation the wire-level refcount stays positive.
			const ref = connection.getSubscription(StateComponents.Session, backendUri, 'BaseAgentHostSessionsProvider.session');
			this._subscription = ref;
			const chatUri = URI.parse(buildDefaultChatUri(backendUri));
			const chatRef = connection.getSubscription(StateComponents.Chat, chatUri, 'BaseAgentHostSessionsProvider.chat');
			this._chatSubscription = chatRef;
			const initialChatState = chatRef.object.value;
			if (initialChatState && !(initialChatState instanceof Error)) {
				this.updateChangesets(initialChatState.changesets);
			}
			this._chatStateListener.value = chatRef.object.onDidChange(state => this.updateChangesets(state.changesets));

			// Forward `SessionState` updates back to the provider so
			// `_lastSessionStates` (and therefore `getCustomAgents`) becomes
			// populated for this still-Untitled session. Seed once from the
			// cached value, then attach a listener for subsequent deltas.
			const onSessionState = this._onSessionState;
			if (onSessionState) {
				const initial = ref.object.value;
				if (initial && !(initial instanceof Error)) {
					onSessionState(this.sessionId, initial);
				}
				this._stateListener.value = ref.object.onDidChange(state => {
					onSessionState(this.sessionId, state);
				});
			}

			// Republishes this draft's contribution whenever the customization
			// scope changes. Without it a client-owned decision made before the
			// first send — notably disabling a standalone MCP server — would
			// never reach the host, since `createSession` above only ever
			// carried a one-shot snapshot.
			let lastPublished: SessionActiveClient | undefined = createdWithActiveClient;
			this._activeClientPublisher.value = autorun(reader => {
				// Publishing an unresolved scope would transiently wipe the
				// host's customization state for this session.
				if (!this._activeClientScope.isResolved.read(reader)) {
					return;
				}
				const activeClient = this._activeClientScope.activeClient(connection.clientId).read(reader);
				const state = ref.object.value;
				const existing = state instanceof Error ? undefined : state?.activeClients.find(client => client.clientId === activeClient.clientId);
				if (equals(existing, activeClient) || equals(lastPublished, activeClient)) {
					return;
				}
				lastPublished = activeClient;
				connection.dispatch(backendUri.toString(), {
					type: ActionType.SessionActiveClientSet,
					activeClient,
				});
			});
		})();
	}

	async waitForEagerCreate(): Promise<void> {
		if (this._eagerCreateTask) {
			await raceCancellationError(this._eagerCreateTask, this.cancellationToken);
		}
	}

	private updateChangesets(changesetsMetadata: readonly Changeset[] | undefined) {
		if (!changesetsMetadata) {
			this._changesets.set(undefined, undefined);
			return;
		}

		const chatUri = URI.parse(buildDefaultChatUri(this.backendUri));
		const changesets = createChangesets(this.backendUri, this._options, this._isActiveSessionObs, changesetsMetadata, chatUri);

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
		this._chatStateListener.clear();
		this._activeClientPublisher.clear();
		this._subscription?.dispose();
		this._subscription = undefined;
		this._chatSubscription?.dispose();
		this._chatSubscription = undefined;
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
		this._chatStateListener.clear();
		this._activeClientPublisher.clear();
		if (hadListener) {
			this._onSessionState?.(this.sessionId, undefined);
		}

		this._subscription?.dispose();
		this._subscription = undefined;
		this._chatSubscription?.dispose();
		this._chatSubscription = undefined;

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

function escapeResourceLabelPathSeparators(label: string): string {
	return label.replaceAll('/', '\u2215').replaceAll('\\', '\u29F5');
}

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
	abstract readonly environment: ISessionEnvironment;
	abstract readonly icon: ThemeIcon;
	abstract readonly browseActions: readonly ISessionWorkspaceBrowseAction[];
	readonly usesCombinedNewSessionConfigPicker = true;
	readonly supportsModelConfigurationForCreation = true;
	readonly supportsPermissionsForCreation = true;
	readonly supportsAutomationSessionConfiguration = true;

	getPermissionOptionForSession(sessionId: string): ISessionPermissionOption | undefined {
		const sessionType = this._getNewSession(sessionId)?.agentProvider;
		const config = this.getSessionConfig(sessionId);
		if (!sessionType || !config) {
			return undefined;
		}
		const permissionId = getAgentHostSessionPermissionId(sessionType, config);
		const option = getAgentHostSessionPermissionOptions(sessionType, isAutoApprovePolicyRestricted(this._baseConfigurationService), true, config)
			.find(option => option.id === permissionId);
		const mode = config.values[SessionConfigKey.Mode] ?? config.schema.properties[SessionConfigKey.Mode]?.default;
		return option ? { ...option, comparisonModeId: typeof mode === 'string' ? mode : undefined } : undefined;
	}

	get order(): number { return 0; }

	get sessionTypes(): readonly ISessionType[] { return this._sessionTypes; }
	protected _sessionTypes: ISessionType[] = [];

	private _lastAgents: readonly AgentInfo[] | undefined;
	private readonly _agentCapabilities = observableValue<ReadonlyMap<string, AgentCapabilities | undefined> | undefined>(this, undefined);

	protected readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes: Event<void> = this._onDidChangeSessionTypes.event;

	protected readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	private readonly _onDidChangeSessionsFromNotifications = this._register(new Emitter<ISessionChangeEvent>());
	protected readonly _onDidChangeSessionsImmediately = Event.any(this._onDidChangeSessions.event, this._onDidChangeSessionsFromNotifications.event);
	readonly onDidChangeSessions = debounceSessionChangeEvents(this._onDidChangeSessionsFromNotifications.event, this._onDidChangeSessions.event, this._store);
	protected readonly _onDidChangeDraftSessions = this._register(new Emitter<void>());

	protected readonly _onDidReplaceSession = this._register(new Emitter<{ readonly from: ISession; readonly to: ISession }>());
	readonly onDidReplaceSession: Event<{ readonly from: ISession; readonly to: ISession }> = this._onDidReplaceSession.event;

	protected readonly _onDidChangeSessionConfig = this._register(new Emitter<string>());
	readonly onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;
	private readonly _onDidChangeAgentMergeSessionState = this._register(new Emitter<string>());

	protected readonly _onDidChangeRootConfig = this._register(new Emitter<void>());
	readonly onDidChangeRootConfig = this._onDidChangeRootConfig.event;
	protected readonly _onDidChangeCustomAgents = this._register(new Emitter<void>());
	readonly onDidChangeCustomAgents = this._onDidChangeCustomAgents.event;

	protected readonly _onDidChangeCustomizations = this._register(new Emitter<void>());
	readonly onDidChangeCustomizations = this._onDidChangeCustomizations.event;
	readonly onDidChangeModels: Event<void>;
	/** Last-known root config state (schema + values), seeded from `RootState.config`. */
	protected _rootConfig: RootConfigState | undefined;

	/**
	 * Last-known session state per session ID, seeded from
	 * {@link _applySessionStateUpdate}. Holds the snapshot used to extract
	 * `customizations` and `activeClient.customizations` for the picker.
	 */
	protected readonly _lastSessionStates = new Map<string, SessionState>();

	/** Cache of adapted sessions, keyed by exact backend resource. */
	protected readonly _sessionCache = new Map<string, AgentHostSessionAdapter>();
	private readonly _sessionKeysByResource = new ResourceMap<string>();

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
	 * keyed by exact backend resource. Captured in {@link createAdapter}/{@link updateAdapter}
	 * and re-used by {@link _persistCache} to serialize sessions without having to
	 * reconstruct every `IAgentSessionMetadata` field from observables.
	 */
	private readonly _metadataBySession = new Map<string, IAgentSessionMetadata>();

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
	 * Temporary sessions that have been sent (first turn dispatched) but not yet
	 * committed by the backend session list. Shown in the session list until the
	 * server reports each backend session, at which point it is replaced via
	 * {@link _onDidReplaceSession}.
	 */
	protected readonly _pendingSessions = new Map<string, ISession>();

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

	protected _getBackendSessionUri(sessionId: string): URI | undefined {
		const draft = this._newSessions.get(sessionId);
		if (draft) {
			return draft.backendUri;
		}
		const rawId = this._sessionKeyFromChatId(sessionId);
		if (!rawId) {
			return undefined;
		}

		return this._sessionCache.get(rawId)?.backendUri;
	}

	protected _hasSession(sessionId: string): boolean {
		const rawId = this._sessionKeyFromChatId(sessionId);
		return !!rawId && this._sessionCache.has(rawId);
	}

	/**
	 * Dispose every in-flight new session, firing each one's `disposeSession`
	 * sentinel so the eagerly-created backend records are freed. Used when the
	 * connection drops and the composed-but-unsent drafts can no longer commit.
	 */
	protected _disposeAllNewSessions(): void {
		for (const sessionId of this._newSessions.keys()) {
			this._onNewSessionAbandoned(sessionId, 'providerDisposed');
		}
		this._newSessions.clearAndDisposeAll();
		this._onDidChangeDraftSessions.fire();
	}

	deleteNewSession(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._onNewSessionAbandoned(sessionId, 'discarded');
			this._newSessions.deleteAndDispose(sessionId);
			this._onDidChangeDraftSessions.fire();
		}
	}

	protected _onNewSessionAbandoned(_sessionId: string, _reason: 'discarded' | 'sendFailed' | 'providerDisposed'): void { }

	protected _getSessionMetadata(sessionId: string): Record<string, unknown> | undefined {
		const draft = this._newSessions.get(sessionId);
		if (draft) {
			return draft.initialMetadata;
		}
		const rawId = this._sessionKeyFromChatId(sessionId);
		return rawId ? this._metadataBySession.get(rawId)?._meta : undefined;
	}

	protected _getSessionMetadataByKey(rawId: string): Record<string, unknown> | undefined {
		return this._metadataBySession.get(rawId)?._meta;
	}

	/** Full resolved config (schema + values) for running sessions, keyed by session ID. */
	protected readonly _runningSessionConfigs = new Map<string, ResolveSessionConfigResult>();
	private readonly _runningSessionConfigResolveSeq = new Map<string, number>();
	private readonly _runningModelConfigurations = this._register(new DisposableMap<string, AutomationModelConfiguration>());
	/**
	 * Model configuration a side chat inherited from its source chat's turn, keyed by chat
	 * resource. Per chat rather than per session so it cannot change the session's other chats;
	 * consumed by the chat's first committed request.
	 */
	private readonly _carriedOverChatModelConfigurations = new Map<string, { readonly modelId: string; readonly configuration: IAutomationSessionTemplate['modelConfiguration'] }>();

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
	protected readonly _connectionChanged = observableSignal(this);
	private readonly _chatCatalogLoading = new Map<string, ISettableObservable<boolean>>();
	private readonly _agentMergeSessionStateSubscriptions = this._register(new DisposableMap<string, DisposableStore>());
	private readonly _agentMergeSessionStateIdleTimers = this._register(new DisposableMap<string, IDisposable>());
	/** Per session, then per chat (`''` for the session folder). */
	private readonly _agentMergeSessionStateObservables = new Map<string, Map<string, IObservable<IAgentMergeClientState | undefined>>>();
	/** Number of observed Agent Merge state observables per session. */
	private readonly _observedAgentMergeSessionStates = new Map<string, number>();
	/** Every Agent Merge folder seen per session; see {@link _getAgentMergeValues}. */
	private readonly _agentMergeFolders = new Map<string, Record<string, unknown>>();

	/**
	 * Idle-release timers paired with {@link _sessionStateSubscriptions}. Each
	 * call to {@link _keepSessionStateAlive} resets the timer for `sessionId`;
	 * when the timer fires, the subscription is disposed and the wire
	 * `unsubscribe` flows through {@link IAgentConnection.getSubscription}'s
	 * refcount to the agent host.
	 */
	private readonly _sessionStateIdleTimers = this._register(new DisposableMap<string, IDisposable>());
	private readonly _sessionChatDetailsReferences = new SessionChatDetailsReferenceCollection(
		sessionId => {
			this._ensureSessionStateSubscription(sessionId);
			this._sessionStateIdleTimers.deleteAndDispose(sessionId);
		},
		sessionId => {
			if (!this._store.isDisposed) {
				this._keepSessionStateAlive(sessionId);
			}
		},
	);
	private readonly _chatModelRetentionLeases = this._register(new DisposableMap<string, IDisposable>());

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
	private _sessionRefreshGeneration = 0;

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
		@ISessionsRecentWorkspacesService recentWorkspacesService: ISessionsRecentWorkspacesService,
		@IUriIdentityService protected readonly _uriIdentityService: IUriIdentityService,
	) {
		super();
		this.onDidChangeModels = Event.defer(Event.any(
			this._languageModelsService.onDidChangeLanguageModels,
			this._languageModelsService.onDidChangeModelVisibility,
		), false, this._store);
		this._downloadProgress = this._register(this._instantiationService.createInstance(AgentHostDownloadProgress));
		this._register(toDisposable(() => {
			for (const cached of this._sessionCache.values()) {
				cached.dispose();
			}
			this._sessionCache.clear();
			this._sessionKeysByResource.clear();
		}));

		// Keep the state subscription of every on-screen session pinned so
		// host-spawned catalog changes (e.g. subagents) reach `cached.chats`
		// live, instead of relying on the idle timer that only client actions
		// refresh.
		this._register(autorun(reader => this._syncVisibleSessionStatePins(reader)));
		this._register(this._onDidChangeSessionsImmediately(() => {
			for (const sessionId of this._observedAgentMergeSessionStates.keys()) {
				this._keepAgentMergeSessionStateAlive(sessionId);
			}
		}));
		this._register(autorun(reader => {
			this._sessionsService.activeSession.read(reader);
			this._syncActiveClient();
		}));
		// Session-cache persistence. These listeners are inert until a subclass
		// opts in via `_enableSessionCachePersistence` (which sets the storage
		// key). They are safe to register unconditionally because they only act
		// at event time and read the key lazily.
		this._register(this._onDidChangeSessionsImmediately(e => {
			if (!this._shouldTrackSessionCacheChanges()) {
				return;
			}
			if (e.added.length > 0 || e.removed.length > 0 || e.changed.length > 0) {
				this._cacheDirty = true;
			}
			for (const removed of e.removed) {
				if (removed instanceof AgentHostSessionAdapter) {
					this._metadataBySession.delete(removed.backendUri.toString());
					this._sessionKeysByResource.delete(removed.resource.with({ fragment: '' }));
				}
			}
		}));
		this._register(recentWorkspacesService.onDidRemoveRecentWorkspaces(
			workspaceUris => this._forgetWorkspaceIsolations(workspaceUris)));
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
	protected abstract registerBackendSession(backendSession: URI, provider: string): void;

	/** Connection state for remote-host sessions. */
	protected get remoteConnectionStatus(): IObservable<RemoteAgentHostConnectionStatus> | undefined {
		return undefined;
	}

	/**
	 * Subclass-specific portion of the adapter options. Base fills in
	 * the bits that are uniform across hosts (`icon`, `loading`,
	 * `mapDiffUri`) from the corresponding hooks.
	 */
	protected abstract _adapterOptions(): Pick<IAgentHostAdapterOptions, 'buildWorkspace' | 'readOnly' | 'defaultChangesetKind' | 'preserveStatusWhenDisconnected' | 'externalSessionState' | 'useSessionTitleForDefaultChat' | 'supportsCanvasPresentation'>;

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
	 * Creation addressing for a new draft, negotiated with its owning host.
	 * Committed sessions always use their exact advertised resource.
	 */
	protected _backendSessionScheme(agentProvider: string): string {
		return newAgentHostSessionUri(agentProvider, '', this.connection?.initializeResult.get()).scheme;
	}

	protected _logicalSessionTypeForBackendScheme(backendScheme: string): string {
		return backendScheme;
	}

	private _mapBackendSessionResource(resource: URI): URI {
		const known = this._sessionCache.get(resource.toString());
		if (known) {
			return known.resource;
		}
		const sessionType = this._metadataBySession.get(resource.toString())?.provider ?? AgentSession.provider(resource);
		if (!sessionType) {
			throw new Error(`Cannot project session without its advertised provider: ${resource.toString()}`);
		}
		return resource.with({ scheme: this.resourceSchemeForProvider(sessionType) });
	}

	/** Build an adapter for the given metadata. */
	protected createAdapter(meta: IAgentSessionMetadata): AgentHostSessionAdapter {
		const provider = meta.provider ?? AgentSession.provider(meta.session);
		if (!provider) {
			throw new Error(`Agent session URI has no provider scheme: ${meta.session.toString()}`);
		}
		this.registerBackendSession(meta.session, provider);
		const resourceScheme = this.resourceSchemeForProvider(provider);

		const options = {
			icon: this.iconForAgentProvider(provider) ?? this.icon,
			environment: this.environment.id,
			loading: this.authenticationPending,
			mapDiffUri: this._diffUriMapper(),
			mapWorkingDirectoryUri: uri => this.mapWorkingDirectoryUri(uri),
			gitHubService: this._gitHubService,
			instantiationService: this._instantiationService,
			getConnection: reader => {
				this._connectionChanged.read(reader);
				return this.connection;
			},
			getBackendChatResource: chat => this.getBackendChatResource(chat),
			agentCapabilities: this._agentCapabilities,
			backendSessionScheme: this._backendSessionScheme(provider),
			mapBackendSessionResource: resource => this._mapBackendSessionResource(resource),
			connectionStatus: this.remoteConnectionStatus,
			...this._adapterOptions(),
		} satisfies IAgentHostAdapterOptions;

		const rawId = meta.session.toString();
		this._metadataBySession.set(rawId, meta);
		const adapter = this._instantiationService.createInstance(AgentHostSessionAdapter, meta, this.id, resourceScheme, provider, options, this._getChatCatalogLoading(rawId), sessionId => this._acquireSessionChatDetails(sessionId));
		this._sessionKeysByResource.set(adapter.resource.with({ fragment: '' }), rawId);
		return adapter;
	}

	private _getChatCatalogLoading(rawId: string): ISettableObservable<boolean> {
		let loading = this._chatCatalogLoading.get(rawId);
		if (!loading) {
			loading = observableValue(`chatCatalogLoading-${rawId}`, false);
			this._chatCatalogLoading.set(rawId, loading);
		}
		return loading;
	}

	protected updateAdapter(adapter: AgentHostSessionAdapter, meta: IAgentSessionMetadata): boolean {
		const rawId = meta.session.toString();
		if (meta.status !== undefined) {
			const status = withSessionStatusFlag(meta.status, ProtocolSessionStatus.IsArchived, this._resolveArchivedState(rawId, isSessionStatusArchived(meta.status)));
			if (status !== meta.status) {
				meta = { ...meta, status };
			}
		}
		this._metadataBySession.set(rawId, meta);
		this._cacheDirty = true;
		return adapter.update(meta);
	}

	/** Resolve host archive state before applying it to the client cache. */
	protected _resolveArchivedState(_rawId: string, isArchived: boolean): boolean {
		return isArchived;
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
		const setupAgents = new Set(readAgentSdkSetupInfos(rootState).map(setup => setup.agent));
		const canInitializeCodexAccount = canInitializeCodexWithoutGitHub(readCodexAccountInfo(rootState));
		const next = rootState.agents
			.filter(agent => this._shouldAdvertiseAgent(agent.provider))
			.map((agent): ISessionType => ({
				id: agent.provider,
				// Isolation is host-owned; the workspace schema determines the available choices.
				supportsWorktreeConfiguration: true,
				authRequirement: resolveAgentAuthRequirement(agent),
				initializationOnSelection: setupAgents.has(agent.provider) ? {
					canInitializeWithoutGitHub: agent.provider === CODEX_AGENT_PROVIDER_ID && canInitializeCodexAccount,
				} : undefined,
				// The chat session contribution and language models for an agent-host
				// agent are registered under its resource scheme (`agent-host-<provider>`),
				// not the bare provider id, so carry it for availability lookups.
				chatSessionType: this.resourceSchemeForProvider(agent.provider),
				label: this._formatSessionTypeLabel(agent.displayName?.trim() || agent.provider),
				icon: this.iconForAgentProvider(agent.provider) ?? this.icon,
			}));

		const prev = this._sessionTypes;
		if (prev.length === next.length && prev.every((t, i) => t.id === next[i].id
			&& t.label === next[i].label
			&& t.authRequirement === next[i].authRequirement
			&& t.initializationOnSelection?.canInitializeWithoutGitHub === next[i].initializationOnSelection?.canInitializeWithoutGitHub)) {
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

		const rawId = this._sessionKeyFromChatId(activeSession.sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!rawId || !cached || !connection) {
			this._clearActiveSessionScope();
			return;
		}

		const sessionType = this.resourceSchemeForProvider(cached.agentProvider);
		let scope = this._activeSessionScope.value;
		if (!scope || this._activeSessionScopeSessionType !== sessionType || !this._activeClientService.areScopeRootsEqual(this._activeSessionScopeRoots, cached.workingDirectories)) {
			scope = this._activeClientService.acquireScope(sessionType, cached.workingDirectories);
			this._activeSessionScope.value = scope;
			this._activeSessionScopeSessionType = sessionType;
			this._activeSessionScopeRoots = [...cached.workingDirectories];
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

		connection.dispatch(cached.backendUri.toString(), {
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
		const pendingSessions = [...this._pendingSessions.values()];
		const sessions: ISession[] = [];
		for (const cached of this._sessionCache.values()) {
			if (pendingSessions.some(pendingSession => isEqual(cached.resource, pendingSession.resource))) {
				continue;
			}
			if (this._shouldAdvertiseAgent(cached.agentProvider)) {
				sessions.push(cached);
			}
		}
		for (const pendingSession of pendingSessions) {
			if (this._shouldAdvertiseAgent(pendingSession.sessionType)) {
				sessions.push(pendingSession);
			}
		}
		return sessions;
	}

	protected getResourceLabelHomes(): { readonly uri: URI; readonly label: string }[] {
		const homes: { readonly uri: URI; readonly label: string }[] = [];
		for (const session of this.getKnownSessions()) {
			if (session.isQuickChat?.get()) {
				const adapter = session instanceof AgentHostSessionAdapter ? session : undefined;
				const label = this.getResourceLabelHomeLabel(session);
				homes.push(...(adapter?.workingDirectories ?? []).map(uri => ({ uri, label })));
			}
		}
		return homes;
	}

	private readonly _resourceLabelHomeRegistrations = this._register(new DisposableMap<string>());
	private readonly _resourceLabelHomeLabels = new Map<string, Map<string, string>>();
	private readonly _resourceLabelHomeFormattingEvents = this._register(new DisposableMap<string, Emitter<void>>());

	protected updateResourceLabelHomeFormatters(homes: readonly { readonly uri: URI; readonly label: string }[], labelService: ILabelService): void {
		const groups = new Map<string, { readonly parent: URI; readonly labels: Map<string, string> }>();
		for (const home of homes) {
			const parent = dirname(home.uri);
			const key = getComparisonKey(parent);
			let group = groups.get(key);
			if (!group) {
				group = { parent, labels: new Map() };
				groups.set(key, group);
			}
			group.labels.set(basename(home.uri), home.label);
		}

		const registrationKeys = new Set<string>();
		const removedGroupKeys = new Set(this._resourceLabelHomeLabels.keys());
		const changedFormattingEvents: Emitter<void>[] = [];
		for (const [key, group] of groups) {
			removedGroupKeys.delete(key);
			const previousLabels = this._resourceLabelHomeLabels.get(key);
			this._resourceLabelHomeLabels.set(key, group.labels);
			let formattingEvent = this._resourceLabelHomeFormattingEvents.get(key);
			if (!formattingEvent) {
				formattingEvent = new Emitter<void>();
				this._resourceLabelHomeFormattingEvents.set(key, formattingEvent);
			} else if (previousLabels && !mapsStrictEqualIgnoreOrder(previousLabels, group.labels)) {
				changedFormattingEvents.push(formattingEvent);
			}
			const separator = labelService.getSeparator(group.parent.scheme, group.parent.authority);
			const templateKey = `template:${key}`;
			if (group.labels.size > (group.labels.has('') ? 1 : 0)) {
				registrationKeys.add(templateKey);
				if (!this._resourceLabelHomeRegistrations.has(templateKey)) {
					this._resourceLabelHomeRegistrations.set(templateKey, labelService.registerFormatter({
						home: joinPath(group.parent, '${sessionId}'),
						onDidChangeFormatting: formattingEvent.event,
						formatting: context => {
							const label = this._resourceLabelHomeLabels.get(key)?.get(context.parameters.get('sessionId') ?? '');
							return label === undefined ? undefined : { label, separator };
						},
					}));
				}
			}
			const rootKey = `root:${key}`;
			if (group.labels.has('')) {
				registrationKeys.add(rootKey);
				if (!this._resourceLabelHomeRegistrations.has(rootKey)) {
					this._resourceLabelHomeRegistrations.set(rootKey, labelService.registerFormatter({
						home: group.parent,
						onDidChangeFormatting: formattingEvent.event,
						formatting: () => {
							const label = this._resourceLabelHomeLabels.get(key)?.get('');
							return label === undefined ? undefined : { label, separator };
						},
					}));
				}
			}
		}
		for (const [key] of this._resourceLabelHomeRegistrations) {
			if (!registrationKeys.has(key)) {
				this._resourceLabelHomeRegistrations.deleteAndDispose(key);
			}
		}
		for (const key of removedGroupKeys) {
			this._resourceLabelHomeLabels.delete(key);
			this._resourceLabelHomeFormattingEvents.deleteAndDispose(key);
		}
		for (const formattingEvent of changedFormattingEvents) {
			formattingEvent.fire();
		}
	}

	protected getResourceLabelHomeLabel(session: ISession): string {
		const providerLabel = escapeResourceLabelPathSeparators(this.sessionTypes.find(type => type.id === session.sessionType)?.label ?? session.sessionType);
		const sessionLabel = escapeResourceLabelPathSeparators(session.title.get() || localize('sessionHome', "Session"));
		return `${providerLabel}/${sessionLabel}`;
	}

	protected getKnownSessions(): ISession[] {
		const sessions = new Map<string, ISession>();
		for (const session of this._sessionCache.values()) {
			sessions.set(session.resource.toString(), session);
		}
		for (const newSession of this._newSessions.values()) {
			sessions.set(newSession.session.resource.toString(), newSession.session);
		}
		for (const pendingSession of this._pendingSessions.values()) {
			sessions.set(pendingSession.resource.toString(), pendingSession);
		}
		return [...sessions.values()];
	}

	getSessionByResource(resource: URI): ISession | undefined {
		for (const newSession of this._newSessions.values()) {
			if (newSession.session.resource.toString() === resource.toString()) {
				return newSession.session;
			}
		}

		for (const pendingSession of this._pendingSessions.values()) {
			if (pendingSession.resource.toString() === resource.toString()) {
				return pendingSession;
			}
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

		return this._createDraftSession(
			sessionType,
			workspace,
			false,
			options?.createdBySession
				? withSessionCreationReference(options.metadata, {
					session: options.createdBySession.session.toString(),
					chat: options.createdBySession.chat?.toString(),
					turnId: options.createdBySession.turnId,
				})
				: options?.metadata,
			options?.automationConfiguration,
			options?.modelId,
			options?.modelConfiguration,
			options?.permissionId,
			options?.modeId,
			options?.pullRequestUrl,
		);
	}

	startNewSessionRequest(sessionId: string, activity?: string): IDisposable {
		const newSession = this._getNewSession(sessionId);
		if (!newSession) {
			throw new Error('Cannot start a session that is no longer pending.');
		}
		return newSession.startRequest(activity);
	}

	createQuickChat(sessionTypeId: string, options?: ISessionsProviderCreateSessionOptions): ISession {
		const sessionType = this.sessionTypes.find(t => t.id === sessionTypeId);
		if (!sessionType) {
			throw new Error(this._noAgentsErrorMessage());
		}

		this._validateBeforeCreate(sessionType);

		// A quick chat is the same session type as a normal session, just
		// workspace-less: no `resolveWorkspace`, no `workingDirectory`. The
		// agent host runs it in a throwaway scratch cwd and tags it via the
		// `quickChat` create flag.
		return this._createDraftSession(
			sessionType,
			undefined,
			true,
			options?.createdBySession
				? withSessionCreationReference(options.metadata, {
					session: options.createdBySession.session.toString(),
					chat: options.createdBySession.chat?.toString(),
					turnId: options.createdBySession.turnId,
				})
				: options?.metadata,
			options?.automationConfiguration,
			options?.modelId,
			options?.modelConfiguration,
			options?.permissionId,
			options?.modeId,
		);
	}

	/**
	 * Builds, tracks, and eagerly starts a {@link NewSession} draft for the
	 * given session type. Shared by {@link createNewSession} (workspace-bound)
	 * and {@link createQuickChat} (workspace-less, `quickChat === true`).
	 */
	private _createDraftSession(
		sessionType: ISessionType,
		workspace: ISessionWorkspace | undefined,
		quickChat: boolean,
		initialMetadata?: Record<string, unknown>,
		initialAutomationConfiguration?: IAutomationSessionConfiguration,
		initialModelId?: string,
		initialModelConfiguration?: Readonly<Record<string, string | number | boolean | null>>,
		initialPermissionId?: string,
		initialModeId?: string,
		initialPullRequestUrl?: string,
	): ISession {
		// Tear-down of superseded drafts is handled by the management layer
		// (it calls `deleteNewSession` on the previous pending session). Each
		// new session is tracked independently in `_newSessions` so several can
		// be in flight at once (e.g. one sending in the background while the
		// composer re-seeds a fresh draft).
		const connection = this.connection;
		const resourceScheme = this.resourceSchemeForProvider(sessionType.id);
		const initialSessionTemplate = this._resolveAutomationSessionTemplate(sessionType.id, initialAutomationConfiguration);
		const baseInitialConfigValues = initialAutomationConfiguration
			? {
				...this._derivedNewSessionConfig(workspace),
				...this._normalizeAutomationSessionConfig(initialSessionTemplate?.config),
			}
			: this._initialNewSessionConfig(workspace);
		const permissionConfig = initialPermissionId
			? getAgentHostSessionPermissionConfig(
				sessionType.id,
				initialPermissionId,
				isAutoApprovePolicyRestricted(this._baseConfigurationService),
				true,
			)
			: undefined;
		if (initialPermissionId && !permissionConfig && getAgentHostSessionPermissionOptions(sessionType.id, isAutoApprovePolicyRestricted(this._baseConfigurationService), true).length > 0) {
			throw new Error(`Agent '${sessionType.id}' does not support permission '${initialPermissionId}'.`);
		}
		const initialConfigValues = {
			...baseInitialConfigValues,
			...permissionConfig,
			...(initialModeId ? { [SessionConfigKey.Mode]: initialModeId } : {}),
			...(initialPullRequestUrl ? { [SessionConfigKey.PullRequestUrl]: initialPullRequestUrl } : {}),
		};
		const activeClientScope = this._activeClientService.acquireScope(resourceScheme, workspace?.folders.map(folder => folder.root).filter(uri => !findDevContainerSample(uri)) ?? []);
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
				initialConfigValues,
				initialModeId,
				initialPullRequestUrl,
				resolveInitialPermissionConfig: initialPermissionId ? config => {
					const permissions = getAgentHostSessionPermissionConfig(sessionType.id, initialPermissionId, isAutoApprovePolicyRestricted(this._baseConfigurationService), true, config);
					if (!permissions) {
						throw new Error(localize('agentHost.initialPermissionUnsupported', "The selected session permissions could not be applied: agent '{0}' does not support permission '{1}'.", sessionType.id, initialPermissionId));
					}
					return permissions;
				} : undefined,
				initialSessionTemplate,
				initialModelId,
				initialModelConfiguration,
				initialConfigSchema: this._seededConfigSchema(),
				initialMetadata,
				onSessionCreated: backendSession => this.registerBackendSession(backendSession, sessionType.id),
				instantiationService: this._instantiationService,
				onSessionState: (id, state) => state === undefined
					? this._handleNewSessionStateGone(id)
					: this._handleNewSessionStateUpdate(id, state),
				activeClientScope,
			}, {
				icon: this.iconForAgentProvider(sessionType.id) ?? this.icon,
				environment: this.environment.id,
				loading: this.authenticationPending,
				mapDiffUri: this._diffUriMapper(),
				mapWorkingDirectoryUri: uri => this.mapWorkingDirectoryUri(uri),
				gitHubService: this._gitHubService,
				instantiationService: this._instantiationService,
				getConnection: reader => {
					this._connectionChanged.read(reader);
					return this.connection;
				},
				getBackendChatResource: chat => this.getBackendChatResource(chat),
				agentCapabilities: this._agentCapabilities,
				mapBackendSessionResource: resource => this._mapBackendSessionResource(resource),
				connectionStatus: this.remoteConnectionStatus,
				...this._adapterOptions(),
			} satisfies IAgentHostAdapterOptions);
		} catch (err) {
			activeClientScope.dispose();
			throw err;
		}
		this._newSessions.set(newSession.sessionId, newSession);
		this._onDidChangeDraftSessions.fire();
		newSession.observeClientCustomAgents(activeClientScope.customAgents, () => {
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

	private _resolveAutomationSessionTemplate(sessionTypeId: string, configuration: IAutomationSessionConfiguration | undefined): IAutomationSessionTemplate | undefined {
		if (!configuration) {
			return undefined;
		}
		if (configuration.sessionTemplate) {
			const template = configuration.sessionTemplate;
			assertAutomationSessionTemplate(template);
			const config = omitAutomationSessionTemplateConfigValues({ ...template.config });
			return {
				...(template.modelId ? { modelId: template.modelId } : {}),
				...(template.modelConfiguration !== undefined ? { modelConfiguration: template.modelConfiguration } : {}),
				...(template.agent ? { agent: template.agent } : {}),
				...(Object.keys(config).length > 0 ? { config } : {}),
			};
		}
		const config = applyLegacyAutomationSessionConfig(sessionTypeId, undefined, configuration.mode, configuration.permissionLevel);
		if (!configuration.modelId && Object.keys(config).length === 0) {
			return undefined;
		}
		return {
			...(configuration.modelId ? { modelId: configuration.modelId } : {}),
			...(Object.keys(config).length > 0 ? { config } : {}),
		};
	}

	private _normalizeAutomationSessionConfig(config: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		return Object.fromEntries(Object.entries(config ?? {}).map(([key, value]) => [
			key,
			normalizeSessionConfigValue(key, value, policyRestricted),
		]));
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
		const sourceWorkspace = newSession.session.workspace.get()?.folders[0]?.root;
		if (sourceWorkspace && findDevContainerSample(sourceWorkspace)) {
			return;
		}
		if (newSession.workspaceUri) {
			void newSession.waitForConfigResolution().then(() => {
				if (this._getNewSession(newSession.sessionId) === newSession) {
					return newSession.loadBranches(connection);
				}
				return undefined;
			}).catch(error => {
				if (this._getNewSession(newSession.sessionId) === newSession) {
					this._logService.warn(`[${this.id}] Failed to load branches for ${newSession.sessionId}: ${error}`);
				}
			});
		}

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
		readonly strict?: boolean;
	} = {}): Promise<void> {
		const { expected, markSessionLoading } = options;
		const strict = options.strict || expected !== undefined;
		const connection = this.connection;
		if (!connection) {
			// {@link resolveConfig} (the only other clear path) is skipped
			// on this branch, so clear the flag here to avoid stalling
			// the picker forever.
			session.endResolveConfigSync();
			session.setLoading(false);
			this._onDidChangeSessionConfig.fire(session.sessionId);
			if (strict) {
				throw new Error('Cannot resolve session config without an agent host connection.');
			}
			return;
		}
		if (markSessionLoading) {
			session.setLoading(true);
		}
		let applied: boolean;
		try {
			applied = await session.resolveConfig(connection, strict);
		} catch (error) {
			session.setLoading(false);
			this._onDidChangeSessionConfig.fire(session.sessionId);
			throw error;
		}
		// Bail if a newer call superseded us — its own pulse will take over.
		if (!applied || this._newSessions.get(session.sessionId) !== session) {
			if (strict) {
				throw new Error('Session config was superseded before it could be applied.');
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
	 * Initial session-config preferences held locally until schema discovery
	 * validates the advertised writable keys. Portable picks are seeded from a
	 * profile-scoped map. Isolation is seeded from the last session started for
	 * this workspace, falling back to `sessions.useWorktree`.
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
			if (typeof value === 'string' && isGloballyRememberedSessionConfigKey(property)) {
				config[property] = value;
			}
		}
		const remembered = migrateLegacyAutopilotConfig(config);
		const workspaceUri = workspace?.folders[0]?.root;
		if (workspaceUri) {
			remembered[SessionConfigKey.Isolation] = this._getRememberedWorkspaceIsolation(workspaceUri)
				?? (this._baseConfigurationService.getValue<boolean>(USE_WORKTREE_SETTING) !== false ? 'worktree' : 'folder');
		}

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
		Object.assign(remembered, this._derivedNewSessionConfig(workspace));

		return Object.keys(remembered).length > 0 ? remembered : undefined;
	}

	private _derivedNewSessionConfig(workspace: ISessionWorkspace | undefined): Record<string, unknown> {
		const config: Record<string, unknown> = {};
		const resource = workspace?.folders[0]?.root;
		const branchPrefix = this._baseConfigurationService.getValue<string>('git.branchPrefix', { resource });
		if (typeof branchPrefix === 'string' && branchPrefix.length > 0) {
			config[SessionConfigKey.WorktreeBranchPrefix] = branchPrefix;
		}

		const worktreeIncludeFiles = this._baseConfigurationService.getValue<string[]>('git.worktreeIncludeFiles', { resource });
		if (Array.isArray(worktreeIncludeFiles) && worktreeIncludeFiles.length > 0) {
			config[SessionConfigKey.WorktreeIncludeFiles] = worktreeIncludeFiles;
		}

		const worktreeSymlinkFolders = this._baseConfigurationService.getValue<string[]>('git.worktreeSymlinkFolders', { resource });
		if (Array.isArray(worktreeSymlinkFolders) && worktreeSymlinkFolders.length > 0) {
			config[SessionConfigKey.WorktreeSymlinkFolders] = worktreeSymlinkFolders;
		}
		return config;
	}

	/**
	 * Re-reads the settings-derived config values of a draft before its first
	 * request. The Agents window loads the settings of the draft's folder only
	 * once the draft is active, so the values seeded at creation can miss them.
	 * The agent host merges the config it receives on first send into the values
	 * it got at creation, so a property whose setting is gone is cleared explicitly.
	 */
	private _refreshSettingsDerivedNewSessionConfig(newSession: NewSession): void {
		const values = newSession.getConfigValues();
		const derivedValues = this._derivedNewSessionConfig(newSession.session.workspace.get());
		for (const [property, clearedValue] of Object.entries(SETTINGS_DERIVED_SESSION_CONFIG_CLEARED_VALUES)) {
			if (!newSession.getConfig()?.schema.properties[property]) {
				continue;
			}
			const value = derivedValues[property] ?? (values && Object.hasOwn(values, property) ? clearedValue : undefined);
			if (!equals(values?.[property], value)) {
				newSession.setConfigValue(property, value);
			}
		}
	}

	// -- Dynamic session config ----------------------------------------------

	getAutomationModelConfiguration(sessionId: string): AutomationModelConfiguration | undefined {
		const draft = this._getNewSession(sessionId);
		if (draft) {
			return draft.modelConfiguration;
		}
		const rawId = this._sessionKeyFromChatId(sessionId);
		if (!this._runningModelConfigurations.has(sessionId) && rawId && this._sessionCache.has(rawId)) {
			this._runningModelConfigurations.set(sessionId, new AutomationModelConfiguration(this._languageModelsService));
		}
		return this._runningModelConfigurations.get(sessionId);
	}

	async getAutomationSessionConfiguration(sessionId: string): Promise<IAutomationSessionConfiguration | undefined> {
		const newSession = this._getNewSession(sessionId);
		if (!newSession) {
			return undefined;
		}
		await newSession.waitForConfigurationReady();
		if (this._getNewSession(sessionId) !== newSession) {
			return undefined;
		}
		if (!newSession.getConfig()) {
			await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession, { strict: true }));
			await newSession.waitForConfigurationReady();
		}
		if (this._getNewSession(sessionId) !== newSession) {
			return undefined;
		}
		const resolvedConfig = newSession.getConfig();
		if (!resolvedConfig) {
			throw new Error('Cannot capture unresolved Automation session configuration.');
		}
		const config = { ...resolvedConfig.values };
		const initialConfig = newSession.getInitialSessionTemplate()?.config ?? {};
		for (const [key, value] of Object.entries(initialConfig)) {
			if (!newSession.wasConfigValueExplicitlySet(key)) {
				config[key] = value;
			}
		}
		const templateConfig = omitAutomationSessionTemplateConfigValues(config);
		const modelId = newSession.getSelectedModelId();
		const modelConfiguration = newSession.modelConfiguration.captureModelConfiguration(modelId);
		const agent = newSession.getSelectedAgent();
		const sessionTemplate: IAutomationSessionTemplate | undefined = !modelId && !agent && Object.keys(templateConfig).length === 0
			? undefined
			: {
				...(modelId ? { modelId } : {}),
				...(modelConfiguration !== undefined ? { modelConfiguration } : {}),
				...(agent ? { agent: { uri: agent.uri } } : {}),
				...(Object.keys(templateConfig).length > 0 ? { config: templateConfig } : {}),
			};
		const mode = templateConfig[SessionConfigKey.Mode];
		const permissionLevel = templateConfig[SessionConfigKey.AutoApprove];
		return {
			sessionTemplate,
			modelId,
			mode: typeof mode === 'string' ? mode : undefined,
			permissionLevel: typeof permissionLevel === 'string' ? permissionLevel : undefined,
		};
	}

	getSessionSandboxPolicy(sessionId: string): ISessionSandboxPolicy | undefined {
		if (!this._getNewSession(sessionId)) {
			this._keepSessionStateAlive(sessionId);
		}
		return readSessionSandboxPolicy(this._lastSessionStates.get(sessionId));
	}

	getSessionSandboxEnabled(sessionId: string): boolean | undefined {
		return readSessionSandboxState(this._lastSessionStates.get(sessionId))?.enabled;
	}

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

	getNewSessionCancellationToken(sessionId: string): CancellationToken {
		const newSession = this._getNewSession(sessionId);
		if (!newSession) {
			throw new Error(`Cannot get cancellation token for unknown new session '${sessionId}'.`);
		}
		return newSession.cancellationToken;
	}

	async whenSessionConfigResolved(sessionId: string, token: CancellationToken): Promise<ResolveSessionConfigResult> {
		const newSession = this._getNewSession(sessionId);
		if (!newSession) {
			throw new Error(`Cannot resolve configuration for unknown new session '${sessionId}'.`);
		}
		const store = new DisposableStore();
		const cancellation = store.add(new CancellationTokenSource(token));
		store.add(newSession.cancellationToken.onCancellationRequested(() => cancellation.cancel()));
		try {
			await waitForState(this.authenticationPending, pending => !pending, undefined, cancellation.token);
			await raceCancellationError(newSession.waitForConfigResolution(), cancellation.token);
			const config = newSession.getConfig();
			if (!this.connection || !config) {
				throw new Error(localize('agentHost.sessionConfigUnavailable', "Could not resolve the Agent Host session configuration. Please try again."));
			}
			return config;
		} finally {
			cancellation.cancel();
			store.dispose();
		}
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

	private _rememberSessionConfigValue(property: string, normalizedValue: unknown): void {
		if (typeof normalizedValue === 'string' && isGloballyRememberedSessionConfigKey(property)) {
			const rememberedValues = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {});
			const nextRememberedValues = Object.create(null) as Record<string, string>;
			for (const [key, rememberedValue] of Object.entries(rememberedValues)) {
				if (typeof rememberedValue === 'string' && isGloballyRememberedSessionConfigKey(key)) {
					nextRememberedValues[key] = rememberedValue;
				}
			}
			nextRememberedValues[property] = normalizedValue;
			this._storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify(nextRememberedValues), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}

	private _getRememberedWorkspaceIsolation(workspaceUri: URI): SessionIsolation | undefined {
		const workspaceIsolations = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS, StorageScope.PROFILE, {});
		const isolation = workspaceIsolations[this._uriIdentityService.extUri.getComparisonKey(workspaceUri)];

		return isSessionIsolation(isolation) ? isolation : undefined;
	}

	private _rememberWorkspaceIsolation(workspaceUri: URI, isolation: unknown): void {
		if (!isSessionIsolation(isolation)) {
			return;
		}

		const workspaceIsolations = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS, StorageScope.PROFILE, {});
		const nextWorkspaceIsolations = Object.create(null) as Record<string, SessionIsolation>;
		for (const [workspaceKey, rememberedIsolation] of Object.entries(workspaceIsolations)) {
			if (isSessionIsolation(rememberedIsolation)) {
				nextWorkspaceIsolations[workspaceKey] = rememberedIsolation;
			}
		}
		nextWorkspaceIsolations[this._uriIdentityService.extUri.getComparisonKey(workspaceUri)] = isolation;
		this._storageService.store(STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS, JSON.stringify(nextWorkspaceIsolations), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _forgetWorkspaceIsolations(workspaceUris: readonly URI[]): void {
		const removedKeys = new Set(workspaceUris.map(workspaceUri => this._uriIdentityService.extUri.getComparisonKey(workspaceUri)));
		const workspaceIsolations = this._storageService.getObject<Record<string, unknown>>(STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS, StorageScope.PROFILE, {});
		const nextWorkspaceIsolations = Object.create(null) as Record<string, SessionIsolation>;
		let didRemove = false;
		for (const [workspaceKey, rememberedIsolation] of Object.entries(workspaceIsolations)) {
			if (removedKeys.has(workspaceKey)) {
				didRemove = true;
			} else if (isSessionIsolation(rememberedIsolation)) {
				nextWorkspaceIsolations[workspaceKey] = rememberedIsolation;
			}
		}
		if (!didRemove) {
			return;
		}

		if (Object.keys(nextWorkspaceIsolations).length === 0) {
			this._storageService.remove(STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS, StorageScope.PROFILE);
		} else {
			this._storageService.store(STORAGE_KEY_REMEMBERED_WORKSPACE_ISOLATIONS, JSON.stringify(nextWorkspaceIsolations), StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}

	async setSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		const policyRestricted = isAutoApprovePolicyRestricted(this._baseConfigurationService);
		const normalizedValue = normalizeSessionConfigValue(property, value, policyRestricted);

		// Mark resolution before firing so the first picker render is already inert.
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			while (newSession.isResolvingConfig.get()) {
				await newSession.waitForConfigResolution();
				if (this._getNewSession(sessionId) !== newSession) {
					return;
				}
			}
			const config = newSession.getConfigForWrite();
			if (!config || !isSessionConfigWritable(config.schema.properties[property], true)) {
				throw new Error(`Session configuration '${property}' is not writable.`);
			}
			validateSessionConfigWrite(config.schema, config.values, property, normalizedValue, true);
			const workspace = getSessionWorkspaceProperties(config.schema);
			newSession.beginResolveConfigSync();
			if (property === workspace.isolation?.key) {
				// Mirror the host default so the chip does not flash while the config resolves.
				const repository = newSession.session.workspace.get()?.folders[0]?.gitRepository;
				const defaultBranchName = normalizedValue === 'worktree'
					? repository?.defaultRemoteBranchName ?? repository?.defaultBranchName
					: repository?.branchName;
				if (workspace.baseBranch && isSessionConfigWritable(workspace.baseBranch.schema, true)) {
					newSession.setConfigValue(workspace.baseBranch.key, defaultBranchName);
				}
			}
			newSession.setConfigValue(property, normalizedValue, true);
			this._onDidChangeSessionConfig.fire(sessionId);
			await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession));
			this._rememberSessionConfigValue(property, normalizedValue);
			return;
		}

		// Running session: dispatch SessionConfigChanged for sessionMutable properties
		const runningConfig = this._runningSessionConfigs.get(sessionId);
		const connection = this.connection;
		if (!runningConfig || !connection) {
			return;
		}

		const schema = runningConfig.schema.properties[property];
		if (!isSessionConfigWritable(schema, false)) {
			throw new Error(`Session configuration '${property}' is not writable.`);
		}
		validateSessionConfigWrite(runningConfig.schema, runningConfig.values, property, normalizedValue, false);
		this._rememberSessionConfigValue(property, normalizedValue);

		// Update local cache optimistically
		const nextValues = { ...runningConfig.values, [property]: normalizedValue };
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const sessionUri = cached.backendUri;
			const action = { type: ActionType.SessionConfigChanged as const, config: { [property]: normalizedValue } };
			connection.dispatch(sessionUri.toString(), action);
			if (property !== SessionConfigKey.SandboxEnabled) {
				void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
			}
		}
	}

	trackSessionConfigOperation(sessionId: string, operation: Promise<void>): void {
		this._getNewSession(sessionId)?.trackConfigOperation(operation);
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
				if (nextValues[key] !== undefined) {
					validateSessionConfigWrite(runningConfig.schema, runningConfig.values, key, nextValues[key], false);
				}
			} else if (Object.hasOwn(runningConfig.values, key)) {
				nextValues[key] = runningConfig.values[key];
			}
		}
		// Agent Merge settings are kept as they are. The host carries them over
		// itself, as it changes them too and this copy may not reflect that yet,
		// so they are not sent.
		const agentMergeKeys: readonly string[] = [SessionConfigKey.AgentMerge, SessionConfigKey.AgentMergeFolders];
		for (const key of agentMergeKeys) {
			if (Object.hasOwn(runningConfig.values, key)) {
				nextValues[key] = runningConfig.values[key];
			}
		}
		// Unknown keys from the caller are ignored (no schema entry).

		// Skip the dispatch entirely when nothing meaningful changes.
		if (equals(nextValues, runningConfig.values)) {
			return;
		}
		const replacement = filterSessionConfigValues(runningConfig.schema, Object.fromEntries(Object.entries(nextValues).filter(([key]) => !agentMergeKeys.includes(key))));
		const workspace = getSessionWorkspaceProperties(runningConfig.schema);
		for (const [key, schema] of Object.entries(runningConfig.schema.properties)) {
			if (schema.readOnly && Object.hasOwn(runningConfig.values, key)
				&& !agentMergeKeys.includes(key) && !['effectiveApprovalMode', 'availableApprovalModes', 'effectiveAutoTier'].includes(key)
				&& !(key === 'approvalMode' && Object.hasOwn(runningConfig.schema.properties, SessionConfigKey.AutoApprove))
				&& !(workspace.isolationKey === SessionConfigKey.Isolation && (key === 'target' || key === 'baseBranch'))) {
				replacement[key] = runningConfig.values[key];
			}
		}

		// Update local cache optimistically (full replace).
		this._runningSessionConfigs.set(sessionId, {
			...runningConfig,
			values: nextValues,
		});
		this._onDidChangeSessionConfig.fire(sessionId);

		// Dispatch to the agent host with replace semantics.
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			const sessionUri = cached.backendUri;
			const action = {
				type: ActionType.SessionConfigChanged as const,
				config: replacement,
				replace: true,
			};
			connection.dispatch(sessionUri.toString(), action);
			void this._resolveRunningSessionConfig(sessionId, cached, nextValues);
		}
	}

	getAgentMergeSessionState(sessionId: string, chat?: URI): AgentMergeSessionState | undefined {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!cached) {
			const legacy = chat ? undefined : readAgentMergeFolderState(this._lastSessionStates.get(sessionId)?.config?.values, undefined, undefined);
			if (!legacy) {
				return undefined;
			}
			const { chat: _chat, ...state } = legacy;
			return state;
		}
		const folder = cached.getAgentMergeFolder(chat);
		if (!folder) {
			return undefined;
		}
		return this._getAgentMergeSessionState(sessionId, folder);
	}

	private _getAgentMergeSessionState(sessionId: string, folder: IAgentMergeFolder | undefined): AgentMergeSessionState | undefined {
		if (!folder) {
			return undefined;
		}
		const values = this._getAgentMergeValues(sessionId);
		const state = readAgentMergeFolderState(values, folder.folderKey, folder.sessionFolderKey);
		// A key the host published is authoritative: a folder differing only in case is another folder.
		if (state || !folder.workingDirectory || readWorkingDirectoryKeys(this._lastSessionStates.get(sessionId)?._meta).has(folder.workingDirectory)) {
			return state;
		}
		const states = readAgentMergeFolderStates(values, folder.sessionFolderKey);
		const fallbackKey = findUniqueIgnorePathCaseKey(states, folder.workingDirectory);
		return fallbackKey ? states.get(fallbackKey) : undefined;
	}

	/**
	 * The session's config values including every Agent Merge folder seen so far:
	 * a write of one folder is applied locally before the host merges it, so
	 * until then the local config holds only that folder. The host never removes
	 * a folder's settings, so earlier folders are still current.
	 */
	private _getAgentMergeValues(sessionId: string): Record<string, unknown> | undefined {
		const values = this._lastSessionStates.get(sessionId)?.config?.values;
		const folders = this._agentMergeFolders.get(sessionId);
		return values && folders ? { ...values, [SessionConfigKey.AgentMergeFolders]: folders } : values;
	}

	/** Records the Agent Merge folders of a session state; see {@link _getAgentMergeValues}. */
	private _updateAgentMergeFolders(sessionId: string, state: SessionState): void {
		const current = state.config?.values?.[SessionConfigKey.AgentMergeFolders] as Record<string, unknown> | undefined;
		if (current) {
			this._agentMergeFolders.set(sessionId, { ...this._agentMergeFolders.get(sessionId), ...current });
		}
	}

	getAgentMergeClientStateObservable(sessionId: string, chat?: URI): IObservable<IAgentMergeClientState | undefined> {
		let byChat = this._agentMergeSessionStateObservables.get(sessionId);
		const existing = byChat?.get(chat?.toString() ?? '');
		if (existing) {
			return existing;
		}
		const onDidChange = Event.filter(this._onDidChangeAgentMergeSessionState.event, changedSessionId => changedSessionId === sessionId);
		const observedEvent: Event<string> = listener => {
			// Counted, since the session folder's and each chat's observables share the subscription.
			this._observedAgentMergeSessionStates.set(sessionId, (this._observedAgentMergeSessionStates.get(sessionId) ?? 0) + 1);
			this._keepAgentMergeSessionStateAlive(sessionId);
			const listenerDisposable = onDidChange(listener);
			return toDisposable(() => {
				listenerDisposable.dispose();
				const observers = (this._observedAgentMergeSessionStates.get(sessionId) ?? 1) - 1;
				if (observers > 0) {
					this._observedAgentMergeSessionStates.set(sessionId, observers);
				} else {
					this._observedAgentMergeSessionStates.delete(sessionId);
				}
				this._scheduleAgentMergeSessionStateIdleRelease(sessionId);
			});
		};
		const stateChanged = observableSignalFromEvent(this, observedEvent);
		const observable = derivedOpts<IAgentMergeClientState | undefined>({ owner: this, equalsFn: structuralEquals }, reader => {
			stateChanged.read(reader);
			const rawId = this._sessionKeyFromChatId(sessionId);
			const cached = rawId ? this._sessionCache.get(rawId) : undefined;
			const state = cached
				? this._getAgentMergeSessionState(sessionId, cached.getAgentMergeFolder(chat, reader))
				: this.getAgentMergeSessionState(sessionId, chat);
			return state ? { enabled: state.enabled, overrides: state.overrides } : undefined;
		});
		if (!byChat) {
			byChat = new Map();
			this._agentMergeSessionStateObservables.set(sessionId, byChat);
		}
		byChat.set(chat?.toString() ?? '', observable);
		return observable;
	}

	async setAgentMergeEnabled(sessionId: string, enabled: boolean, chat?: URI): Promise<void> {
		const current = this.getAgentMergeSessionState(sessionId, chat);
		await this._writeAgentMergeClientState(sessionId, enabled, current?.overrides, chat);
	}

	async setAgentMergeOverrides(sessionId: string, overrides: AgentMergeSessionOverrides | undefined, chat?: URI): Promise<void> {
		const current = this.getAgentMergeSessionState(sessionId, chat);
		await this._writeAgentMergeClientState(sessionId, current?.enabled ?? false, overrides, chat);
	}

	private _supportsPerFolderAgentMerge(sessionId: string, folder: IAgentMergeFolder): boolean {
		return folder.workingDirectory !== undefined
			&& readWorkingDirectoryKeys(this._lastSessionStates.get(sessionId)?._meta).has(folder.workingDirectory);
	}

	private async _writeAgentMergeClientState(sessionId: string, enabled: boolean, overrides: AgentMergeSessionOverrides | undefined, chat: URI | undefined): Promise<void> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!rawId || !cached || !connection) {
			throw new Error(`[${this.id}] Cannot update Agent Merge state without a running session connection`);
		}
		const folder = cached.getAgentMergeFolder(chat);
		if (!folder) {
			throw new Error(`[${this.id}] Cannot update Agent Merge before the chat's folder is known`);
		}
		const values = this._lastSessionStates.get(sessionId)?.config?.values;
		const clientState = { enabled, ...(overrides ? { overrides } : {}) };
		if (!this._supportsPerFolderAgentMerge(sessionId, folder)) {
			if (folder.folderKey !== folder.sessionFolderKey) {
				throw new Error(`[${this.id}] This Agent Host does not support Agent Merge in peer chat folders`);
			}
			connection.dispatch(cached.backendUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { [SessionConfigKey.AgentMerge]: clientState },
			});
			return;
		}
		// Settings written by earlier versions describe the session folder until the host migrates them.
		if (folder.workingDirectory === undefined || (folder.folderKey === folder.sessionFolderKey && values?.[SessionConfigKey.AgentMerge] !== undefined)) {
			connection.dispatch(cached.backendUri.toString(), {
				type: ActionType.SessionConfigChanged,
				config: { [SessionConfigKey.AgentMerge]: clientState },
			});
			return;
		}
		// Only this folder's entry is written: the host merges it into the others
		// and keys it by the working directory. It records the chat that turned
		// Agent Merge on.
		const owningChat = (chat && this.getBackendChatResource(chat)?.toString())
			?? readAgentMergeFolderState(this._getAgentMergeValues(sessionId), folder.folderKey, folder.sessionFolderKey)?.chat;
		connection.dispatch(cached.backendUri.toString(), {
			type: ActionType.SessionConfigChanged,
			config: { [SessionConfigKey.AgentMergeFolders]: { [folder.workingDirectory]: { ...clientState, ...(owningChat ? { chat: owningChat } : {}) } } },
		});
	}

	private async _resolveRunningSessionConfig(sessionId: string, cached: AgentHostSessionAdapter, values: Record<string, unknown>): Promise<void> {
		const connection = this.connection;
		const schema = this._runningSessionConfigs.get(sessionId)?.schema;
		if (!connection || !schema) {
			return;
		}
		const seq = (this._runningSessionConfigResolveSeq.get(sessionId) ?? 0) + 1;
		this._runningSessionConfigResolveSeq.set(sessionId, seq);
		try {
			const resolved = await connection.resolveSessionConfig({
				provider: cached.agentProvider,
				workingDirectory: cached.workspace.get()?.folders[0]?.root,
				config: filterSessionConfigValues(schema, values),
			});
			if (this._runningSessionConfigResolveSeq.get(sessionId) !== seq) {
				return;
			}
			const sandboxEnabled = this._runningSessionConfigs.get(sessionId)?.values[SessionConfigKey.SandboxEnabled];
			this._runningSessionConfigs.set(sessionId, sandboxEnabled === undefined ? resolved : {
				...resolved,
				values: { ...resolved.values, [SessionConfigKey.SandboxEnabled]: sandboxEnabled },
			});
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
		const config = await this.whenSessionConfigResolved(sessionId, CancellationToken.None);
		if (!config?.schema.properties[property]) {
			throw new Error(`Session configuration '${property}' is not advertised.`);
		}
		if (property === getSessionWorkspaceProperties(config.schema).baseBranch?.key && newSession.workspaceUri) {
			return newSession.loadBranches(connection);
		}
		const result = await newSession.getConfigCompletions(connection, property, query);
		return result.items;
	}

	getCreateSessionConfig(sessionId: string): Record<string, unknown> | undefined {
		return this._getNewSession(sessionId)?.getConfigValues();
	}

	async getNewSessionConfig(sessionId: string): Promise<ISessionConfigurationSnapshot | undefined> {
		const newSession = this._getNewSession(sessionId);
		await newSession?.waitForConfigurationReady();
		const providerConfig = deepClone(newSession?.getConfigValues());
		if (!providerConfig) {
			return undefined;
		}
		const schema = newSession?.getConfig()?.schema;
		const isolationProperty = schema && getSessionWorkspaceProperties(schema).isolation;
		const isolation = isolationProperty && readSessionIsolation(isolationProperty, providerConfig[isolationProperty.key]);
		return {
			isolation: isolation === 'worktree' || isolation === 'folder' ? isolation : undefined,
			providerConfig,
		};
	}

	async setIsolationMode(sessionId: string, mode: string): Promise<void> {
		const config = await this.whenSessionConfigResolved(sessionId, CancellationToken.None);
		const workspace = getSessionWorkspaceProperties(config.schema);
		const value = writeSessionIsolation(workspace.isolation, mode === 'workspace' ? 'folder' : mode);
		if (!workspace.isolation || value === undefined) {
			throw new Error('Workspace isolation is not supported by this host.');
		}
		await this._setTransientNewSessionConfigValues(sessionId, { [workspace.isolation.key]: value }, true, [workspace.baseBranchKey]);
	}

	async setWorktreeConfiguration(sessionId: string, configuration: ISessionWorktreeConfiguration): Promise<void> {
		const config = await this.whenSessionConfigResolved(sessionId, CancellationToken.None);
		const workspace = getSessionWorkspaceProperties(config.schema);
		const values: Record<string, unknown> = {};
		if (configuration.isolationMode) {
			const value = writeSessionIsolation(workspace.isolation, configuration.isolationMode === 'workspace' ? 'folder' : configuration.isolationMode);
			if (!workspace.isolation || value === undefined) {
				throw new Error('Workspace isolation is not supported by this host.');
			}
			if (workspace.isolation.key === 'target' && configuration.branch && !workspace.baseBranch) {
				await this.setIsolationMode(sessionId, configuration.isolationMode);
			} else {
				values[workspace.isolation.key] = value;
			}
		}
		if (configuration.branch) {
			values[workspace.baseBranchKey] = configuration.branch;
		}
		const unsetProperties = configuration.isolationMode && !configuration.branch ? [workspace.baseBranchKey] : undefined;
		await this._setTransientNewSessionConfigValues(sessionId, values, false, unsetProperties);
	}

	async setBranch(sessionId: string, branch: string): Promise<void> {
		const config = await this.whenSessionConfigResolved(sessionId, CancellationToken.None);
		const baseBranchProperty = getSessionWorkspaceProperties(config.schema).baseBranch;
		if (!baseBranchProperty) {
			throw new Error('Base branch selection is not supported by this host.');
		}
		await this._setTransientNewSessionConfigValue(sessionId, baseBranchProperty.key, branch);
	}

	private async _setTransientNewSessionConfigValue(sessionId: string, property: string, value: unknown): Promise<void> {
		await this._setTransientNewSessionConfigValues(sessionId, { [property]: value }, true);
	}

	private async _setTransientNewSessionConfigValues(sessionId: string, values: Readonly<Record<string, unknown>>, waitForCurrentResolve: boolean, unsetProperties?: readonly string[]): Promise<void> {
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
		const config = newSession.getConfig();
		if (!config) {
			throw new Error('Session configuration is unavailable.');
		}
		for (const property of Object.keys(values)) {
			validateSessionConfigWrite(config.schema, config.values, property, values[property], true);
		}

		newSession.beginResolveConfigSync();
		for (const property of unsetProperties ?? []) {
			newSession.setConfigValue(property, undefined);
		}
		for (const [property, value] of Object.entries(values)) {
			newSession.setConfigValue(property, value);
		}
		this._onDidChangeSessionConfig.fire(sessionId);
		await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession, { expected: values }));
	}

	clearSessionConfig(sessionId: string): void {
		if (this._newSessions.has(sessionId)) {
			this._onNewSessionAbandoned(sessionId, 'discarded');
			this._newSessions.deleteAndDispose(sessionId);
			this._onDidChangeDraftSessions.fire();
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
		return this._getModelsSnapshotForTarget(resourceScheme, desiredModelId);
	}

	getModelsSnapshotForCreation(_workspaceUri: URI, sessionTypeId: string, desiredModelId?: string): ISessionModelsSnapshot {
		return this._getModelsSnapshotForTarget(this.resourceSchemeForProvider(sessionTypeId), desiredModelId);
	}

	private _getModelsSnapshotForTarget(resourceScheme: string, desiredModelId?: string): ISessionModelsSnapshot {
		const allModels = getRegisteredLanguageModels(this._languageModelsService);
		const models = getVisibleLanguageModelsForTarget(allModels, resourceScheme, this._languageModelsService);
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
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		return cached?.resource.scheme;
	}

	setModel(sessionId: string, chatResource: URI, modelId: string, source: ChatModelSource): void {
		const newSession = this._getNewSession(sessionId);
		if (newSession) {
			const previousModelId = newSession.getSelectedModelId();
			if (previousModelId && previousModelId !== modelId) {
				const resolution = this.getModelsSnapshot(sessionId, previousModelId).desiredModelResolution;
				if (resolution.kind === 'available' && resolution.model.identifier === modelId) {
					newSession.modelConfiguration.rebindModelConfiguration(previousModelId, modelId);
				}
			}
			newSession.setSelectedModelId(modelId, source);
			return;
		}

		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (cached && rawId && connection) {
			cached.setChatModelId(chatResource, modelId, source);
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

		const rawId = this._sessionKeyFromChatId(sessionId);
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
		const sessionId = toSessionId(this.id, sessionResource);
		const state = this._lastSessionStates.get(sessionId);
		if (!state) {
			const key = this._sessionKeyFromChatId(sessionId);
			return key ? this._sessionCache.get(key)?.getBackendChatResource(chatResource) : undefined;
		}
		// Look up the authoritative host-supplied backend chat URI rather than
		// constructing one: a peer chat's client fragment is exactly the chatId of
		// its `ChatSummary.resource` (see `_createAdditionalChat`); the default
		// chat (no fragment) is `SessionState.defaultChat`, falling back to the
		// summary flagged by `isDefaultChatUri` — mirroring `_applyChatCatalog`.
		const backendResource = getSessionChatResource(state, chatResource.fragment || DEFAULT_CHAT_ID);
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

	getSessionContextReference(chatResource: URI): string | undefined {
		const backendResource = this.getBackendChatResource(chatResource);
		return backendResource ? buildOpenSessionLinkForChatResource(backendResource) : undefined;
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
		const sessionUri = this._getBackendSessionUri(sessionId);
		if (!sessionUri) {
			return [];
		}
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
				...(server.state.kind === McpServerStatus.Starting && server.state.blocking ? {
					background: async () => {
						const connection = this.connection;
						if (!connection) {
							return;
						}
						connection.dispatch(sessionUri.toString(), {
							type: ActionType.SessionMcpServerBackgroundRequested,
							id: server.id,
						});
					},
				} : {}),
			}));
	}

	setCustomizationEnablement(sessionId: string, customizationId: string, enablement: readonly CustomizationEnablement[]): void {
		const sessionUri = this._getBackendSessionUri(sessionId);
		const connection = this.connection;
		if (!sessionUri || !connection) {
			return;
		}
		connection.dispatch(sessionUri.toString(), {
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
		const rawId = this._sessionKeyFromChatId(sessionId);
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
		this._setSessionArchived(sessionId, true);
	}

	async importSession(sessionId: string): Promise<void> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!cached || !connection?.importSession || !supportsAgentHostSessionImport(connection.initializeResult.get())) {
			throw new Error(localize('importSessionUnavailable', "Importing is unavailable for this session."));
		}
		if (cached.isExternal.get()) {
			await connection.importSession(cached.backendUri);
		}
	}

	async getSessionWorktreeDiskUsage(sessionId: string): Promise<number | undefined> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const session = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!session || !connection) {
			return undefined;
		}
		const worktrees = new Map<string, URI>();
		for (const folder of session.workspace.get()?.folders ?? []) {
			const worktreeUri = folder.gitRepository?.workTreeUri;
			if (worktreeUri) {
				worktrees.set(worktreeUri.toString(), worktreeUri);
			}
		}
		if (worktrees.size === 0) {
			return undefined;
		}
		const sizes = await Promise.all([...worktrees.values()].map(worktreeUri => getWorktreeDiskUsage(connection, worktreeUri)));
		if (sizes.every(size => size === undefined)) {
			return undefined;
		}
		return sizes.reduce<number>((total, size) => total + (size ?? 0), 0);
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		this._setSessionArchived(sessionId, false);
	}

	async archiveChat(sessionId: string, chatResource: URI): Promise<void> {
		await this._setChatArchived(sessionId, chatResource, true);
	}

	async unarchiveChat(sessionId: string, chatResource: URI): Promise<void> {
		await this._setChatArchived(sessionId, chatResource, false);
	}

	private async _setChatArchived(sessionId: string, chatResource: URI, archived: boolean): Promise<void> {
		const chatId = chatResource.fragment;
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		const initializeResult = connection?.initializeResult.get();
		if (!chatId || !cached || !connection || !initializeResult || !isActionKnownToVersion({ type: ActionType.ChatIsArchivedChanged, isArchived: archived }, initializeResult.protocolVersion)) {
			throw new Error(localize('chatArchiveUnavailable', "Archiving this chat is unavailable."));
		}
		if (!cached.chats.get().some(chat => chat.resource.fragment === chatId)) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}
		const backendChatResource = this.getBackendChatResource(chatResource);
		if (!backendChatResource) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}
		this._keepSessionStateAlive(cached.sessionId);
		connection.dispatch(backendChatResource.toString(), { type: ActionType.ChatIsArchivedChanged, isArchived: archived });
	}

	/**
	 * Flips a session's archived state locally and dispatches the owning action
	 * so the host persists it and fans it out to other windows.
	 *
	 * Skips the local flip when disconnected: showing a session as archived when
	 * the change can never be recorded is worse than appearing not to archive.
	 */
	protected _setSessionArchived(sessionId: string, isArchived: boolean): boolean {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!cached || !rawId || !connection) {
			return false;
		}
		this._setSessionArchivedLocally(sessionId, isArchived);
		connection.dispatch(cached.backendUri.toString(), { type: ActionType.SessionIsArchivedChanged as const, isArchived });
		return true;
	}

	protected _setSessionArchivedLocally(sessionId: string, isArchived: boolean): boolean {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!cached) {
			return false;
		}
		cached.isArchived.set(isArchived, undefined);
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		return true;
	}

	async setSessionReadState(sessionId: string, isRead: boolean): Promise<void> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (cached && rawId) {
			if (!cached.supportsChatReadState()) {
				this._setLegacySessionReadState(cached, isRead);
				return;
			}
			if (isRead) {
				for (const chat of cached.getUnreadAggregateChats()) {
					await this.setChatReadState(sessionId, chat.resource, true);
				}
			}
			const effectiveIsRead = isRead && !cached.hasUnreadChat();
			const sessionChanged = cached.isRead.get() !== effectiveIsRead;
			if (!sessionChanged) {
				return;
			}
			cached.isRead.set(effectiveIsRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			const connection = this.connection;
			if (connection) {
				const sessionUri = cached.backendUri;
				const action = { type: ActionType.SessionIsReadChanged as const, isRead: effectiveIsRead };
				connection.dispatch(sessionUri.toString(), action);
			}
		}
	}

	async setChatReadState(sessionId: string, chatResource: URI, isRead: boolean): Promise<boolean> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		const initializeResult = connection?.initializeResult.get();
		const action = { type: ActionType.ChatIsReadChanged as const, isRead };
		if (!cached || !connection || !initializeResult) {
			return false;
		}
		const backendChatResource = this.getBackendChatResource(chatResource);
		if (!backendChatResource) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}
		if (!isActionKnownToVersion(action, initializeResult.protocolVersion)) {
			const chatChanged = cached.chats.get().some(chat => isEqual(chat.resource, chatResource) && chat.isRead.get() !== isRead);
			if (!cached.setChatRead(chatResource, isRead)) {
				throw new Error(localize('chatNotFound', "The chat could not be found."));
			}
			if (chatChanged) {
				this._cacheDirty = true;
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
			}
			this._setLegacySessionReadState(cached, isRead);
			return true;
		}
		if (!cached.setChatRead(chatResource, isRead)) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}
		this._cacheDirty = true;
		this._keepSessionStateAlive(cached.sessionId);
		connection.dispatch(backendChatResource.toString(), action);
		return true;
	}

	private _setLegacySessionReadState(cached: AgentHostSessionAdapter, isRead: boolean): void {
		if (cached.setLegacySessionReadState(isRead)) {
			this._cacheDirty = true;
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
		const connection = this.connection;
		if (connection) {
			connection.dispatch(cached.backendUri.toString(), { type: ActionType.SessionIsReadChanged as const, isRead });
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
			const rawId = this._sessionKeyFromChatId(sessionId);
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
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!cached || !rawId) {
			return;
		}
		const chatId = chatUri.fragment;
		if (!chatId && this._adapterOptions().useSessionTitleForDefaultChat) {
			return this.renameSession(sessionId, title);
		}
		if (!connection) {
			return;
		}
		const backendChat = this.getBackendChatResource(chatUri)
			?? (!chatId && isNativeAgentHost(connection.initializeResult.get()) ? URI.parse(buildDefaultChatUri(cached.backendUri)) : undefined);
		if (!backendChat) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}
		const action = { type: ActionType.SessionTitleChanged as const, title };
		if (chatId) {
			// Additional peer chat: rename only that chat by dispatching on its
			// chat channel. The host translates this to a per-chat update.
			cached.setAdditionalChatTitle(chatId, title);
			connection.dispatch(backendChat.toString(), action);
		} else {
			// Default chat: rename the default chat tab independently of the
			// session title by dispatching on the default chat channel.
			cached.setDefaultChatTitle(title);
			connection.dispatch(backendChat.toString(), action);
		}
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
	}

	async renameSession(sessionId: string, title: string): Promise<void> {
		const rawId = this._sessionKeyFromChatId(sessionId);
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

	async removeSessionArtifact(sessionId: string, artifactId: string): Promise<void> {
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!cached || !connection?.removeSessionArtifact || !supportsAgentHostArtifactRemoval(connection.initializeResult.get())) {
			throw new Error(localize('removeSessionArtifactUnavailable', "Removing artifacts is unavailable for this session."));
		}
		await connection.removeSessionArtifact(cached.backendUri, artifactId);
	}

	async deleteChat(sessionId: string, chatUri: URI, options?: IDeleteChatOptions): Promise<boolean> {
		const chatId = chatUri.fragment;
		if (!chatId) {
			// The default chat lives and dies with its session and cannot be
			// deleted in isolation.
			return false;
		}
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		const connection = this.connection;
		if (!rawId || !cached || !connection) {
			return false;
		}
		const ahpChatUri = this.getBackendChatResource(chatUri);
		if (!ahpChatUri) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}

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
		const rawId = this._sessionKeyFromChatId(chatId);
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

		// The model comes from the chat this one was branched off, not from any choice made here.
		cached.setChatModelId(chat.resource, selectedModelId, ChatModelSource.CarriedOver);
		cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: '' } : undefined);

		await this._retainChatSessionModel(chat.resource, selectedModelId, selectedAgentUri);
		return chat;
	}

	async forkChat(sessionId: string, sourceChat: URI, turnId: string): Promise<IChat> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}
		const rawId = this._sessionKeyFromChatId(sessionId);
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

		// Inherit the source chat's own model/agent selection (which may differ from the session's
		// default), matching `createSideChat`: a fork continues the chat it was taken from. A peer
		// whose model this client does not know states none rather than guessing with the session's,
		// which after a reload would fork it onto a model it was never running.
		const selectedModel = cached.getChatModelSelection(sourceChat);
		const selectedModelId = cached.getChatModelId(sourceChat)
			?? (selectedModel ? `${cached.resource.scheme}:${selectedModel.id}` : undefined);
		const selectedAgentUri = cached.getChatMode(sourceChat)?.id;

		// Keep the session-state subscription alive so the `chatAdded` it emits
		// flows into `_applyChatCatalogFromState` and updates `cached.chats`.
		this._keepSessionStateAlive(cached.sessionId);
		await connection.createChat(sessionUri, chatUri, {
			model: selectedModel,
			fork: { source: sourceBackendUri, turnId },
		});

		const chat = await waitForState(
			cached.chats.map(chats => chats.find(c => c.resource.fragment === newChatId)),
			c => !!c,
		);

		// The model comes from the chat this one was forked off, not from any choice made here.
		cached.setChatModelId(chat.resource, selectedModelId, ChatModelSource.CarriedOver);
		cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: '' } : undefined);

		await this._retainChatSessionModel(chat.resource, selectedModelId, selectedAgentUri);
		return chat;
	}

	async createSideChat(sessionId: string, sourceChat: URI, turnId: string, selection?: ISideChatSelection): Promise<IChat> {
		const connection = this.connection;
		if (!connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!rawId || !cached) {
			throw new Error(`Session '${sessionId}' not found`);
		}
		if (!cached.capabilities.get().supportsSideChat) {
			throw new Error(`Session '${sessionId}' does not support side chats`);
		}

		const sessionUri = cached.backendUri;
		const newChatId = generateUuid();
		const chatUri = URI.parse(buildChatUri(sessionUri, newChatId));
		const sourceBackendUri = this._resolveBackendSourceChatUri(cached.sessionId, sessionUri, sourceChat);

		// Inherit the source chat's own model/agent selection (which may differ
		// from the session's default), not the session-level fallback. When this
		// client never learned it (e.g. a resumed chat with no persisted draft
		// model), fall back to what the host recorded the source chat running on.
		const selectedModel = cached.getChatModelSelection(sourceChat) ?? this._readRunningChatModel(connection, sourceBackendUri);
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

		// The model comes from the chat this one was branched off, not from any choice made here.
		cached.setChatModelId(chat.resource, selectedModelId, ChatModelSource.CarriedOver);
		cached.setChatAgent(chat.resource, selectedAgentUri ? { uri: selectedAgentUri, name: '' } : undefined);

		const modelConfiguration = selectedModelId && selectedModel?.config !== undefined ? selectedModel.config : undefined;
		if (selectedModelId && modelConfiguration) {
			this._carriedOverChatModelConfigurations.set(chat.resource.toString(), { modelId: selectedModelId, configuration: modelConfiguration });
		}

		await this._retainChatSessionModel(chat.resource, selectedModelId, selectedAgentUri, modelConfiguration);
		return chat;
	}

	/**
	 * The model a chat is actually running on per the host: its draft model, else the model of
	 * its active or most recent turn. `undefined` when the chat state is not hydrated.
	 */
	private _readRunningChatModel(connection: IAgentConnection, chat: URI): ModelSelection | undefined {
		const ref = connection.getSubscription(StateComponents.Chat, chat, 'BaseAgentHostSessionsProvider.runningChatModel');
		try {
			const state = ref.object.value;
			if (!state || state instanceof Error) {
				return undefined;
			}
			return state.draft?.model ?? state.activeTurn?.message.model ?? state.turns.at(-1)?.message.model;
		} finally {
			ref.dispose();
		}
	}

	private _resolveBackendSourceChatUri(sessionId: string, sessionUri: URI, sourceChat: URI): URI {
		const advertised = this.getBackendChatResource(sourceChat);
		if (advertised) {
			return advertised;
		}
		const state = this._lastSessionStates.get(sessionId);
		const backendResource = state && getSessionChatResource(state, sourceChat.fragment || DEFAULT_CHAT_ID);
		if (backendResource) {
			return URI.parse(backendResource);
		}
		if (!isNativeAgentHost(this.connection?.initializeResult.get())) {
			throw new Error(localize('chatNotFound', "The chat could not be found."));
		}
		if (sourceChat.fragment) {
			const subagentPrefix = 'subagent/';
			if (sourceChat.fragment.startsWith(subagentPrefix)) {
				return URI.parse(buildSubagentChatUri(sessionUri, sourceChat.fragment.slice(subagentPrefix.length)));
			}
			return URI.parse(buildChatUri(sessionUri, sourceChat.fragment));
		}
		const hydratedDefaultChat = state?.defaultChat;
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
		const rawId = this._sessionKeyFromChatId(chatId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!rawId || !cached) {
			throw new Error(`Session '${chatId}' not found`);
		}

		const { query, attachedContext } = options;
		const sessionType = chatResource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const selectedModelId = this._resolveSendModelId(chatId, cached.getChatModelId(chatResource));
		const carriedOverConfiguration = this._carriedOverChatModelConfigurations.get(chatResource.toString());
		this._carriedOverChatModelConfigurations.delete(chatResource.toString());
		const selectedModelConfiguration = carriedOverConfiguration && carriedOverConfiguration.modelId === selectedModelId
			? carriedOverConfiguration.configuration
			: this._runningModelConfigurations.get(cached.sessionId)?.getModelConfigurationForRequest(selectedModelId);
		const selectedAgentUri = cached.getChatMode(chatResource)?.id;

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: selectedModelId,
			userSelectedModelConfiguration: selectedModelConfiguration,
			agentHostSessionConfig: options.sessionConfig,
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
			agentHostMessageOrigin: readAgentMessageDelegationMeta({ _meta: options.metadata }) ? { kind: MessageKind.Agent } : undefined,
			onDidCreateResponse: options.onDidCreateResponse,
			metadata: options.metadata,
		};

		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			throw new Error(`[${this.id}] Unable to load chat session ${chatResource.toString()}`);
		}

		try {
			this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri, { modelConfiguration: selectedModelConfiguration });

			const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
			if (result.kind === 'rejected') {
				throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
			}

			this._applyChatSessionState(modelRef, selectedModelId, selectedAgentUri, { clearDraft: true, modelConfiguration: selectedModelConfiguration });
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

	private async _retainChatSessionModel(chatResource: URI, modelId: string | undefined, agentUri: string | undefined, modelConfiguration?: IAutomationSessionTemplate['modelConfiguration']): Promise<void> {
		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (!modelRef) {
			return;
		}

		this._applyChatSessionState(modelRef, modelId, agentUri, { modelConfiguration });
		const resourceKey = chatResource.toString();
		const lease = new DisposableStore();
		lease.add(modelRef);
		lease.add(disposableTimeout(() => this._chatModelRetentionLeases.deleteAndDispose(resourceKey), BaseAgentHostSessionsProvider.CHAT_MODEL_RETENTION_MS));
		this._chatModelRetentionLeases.set(resourceKey, lease);
	}

	private _applyChatSessionState(
		modelRef: IChatModelReference,
		modelId: string | undefined,
		agentUri: string | undefined,
		options?: {
			readonly clearDraft?: boolean;
			readonly modelConfiguration?: IAutomationSessionTemplate['modelConfiguration'];
		},
	): void {
		const inputModel = modelRef.object.inputModel;
		if (!inputModel) {
			return;
		}
		if (modelId) {
			const languageModel = this._languageModelsService.lookupLanguageModel(modelId);
			if (languageModel) {
				inputModel.setState({
					selectedModel: { identifier: modelId, metadata: languageModel },
					modelConfiguration: options?.modelConfiguration,
				});
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
		await newSession.waitForConfigurationReady();
		await newSession.waitForEagerCreate();
		if (this._getNewSession(newSession.sessionId) !== newSession) {
			throw new Error('Session was disposed before its configuration could be applied.');
		}
		if (!this.connection) {
			throw new Error(this._notConnectedSendErrorMessage());
		}
		this._refreshSettingsDerivedNewSessionConfig(newSession);

		const selectedModelId = this._resolveSendModelId(chatId, newSession.getSelectedModelId());
		const selectedModelSource = newSession.session.mainChat.get().modelSource.get() ?? ChatModelSource.Chosen;
		const selectedModelConfiguration = newSession.modelConfiguration.getModelConfigurationForRequest(selectedModelId);
		const selectedAgent = newSession.getSelectedAgent();

		const { query, attachedContext } = options;

		const sessionType = chatResource.scheme;
		const contribution = this._chatSessionsService.getChatSessionContribution(sessionType);

		const sendOptions: IChatSendRequestOptions = {
			location: ChatAgentLocation.Chat,
			userSelectedModelId: selectedModelId,
			userSelectedModelConfiguration: selectedModelConfiguration,
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
			agentHostMessageOrigin: readAgentMessageDelegationMeta({ _meta: options.metadata }) ? { kind: MessageKind.Agent } : undefined,
			onDidCreateResponse: options.onDidCreateResponse,
			metadata: options.metadata,
		};

		// Chat session model was already created by createNewChat and
		// the widget was opened by the management service. Load session
		// model and apply selected model.
		const modelRef = await this._chatService.acquireOrLoadSession(chatResource, ChatAgentLocation.Chat, CancellationToken.None);
		if (modelRef) {
			if (selectedModelId) {
				const languageModel = this._languageModelsService.lookupLanguageModel(selectedModelId);
				if (languageModel) {
					modelRef.object.inputModel.setState({
						selectedModel: { identifier: selectedModelId, metadata: languageModel },
						modelConfiguration: selectedModelConfiguration,
					});
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

		const newSessionRawId = chatResource.path.replace(/^\//, '');

		const result = await this._chatService.sendRequest(chatResource, query, sendOptions);
		if (result.kind === 'rejected') {
			throw new Error(`[${this.id}] sendRequest rejected: ${result.reason}`);
		}

		if (newSession.workspaceUri && !newSession.getInitialSessionTemplate()) {
			const config = newSession.getConfig();
			const isolation = config && getSessionWorkspaceProperties(config.schema).isolation;
			this._rememberWorkspaceIsolation(newSession.workspaceUri, isolation && readSessionIsolation(isolation, config?.values[isolation.key]));
		}

		newSession.setStatus(SessionStatus.InProgress);
		newSession.clearSelectedModelId();

		// Seed the title from the first line of the query so the new-session
		// tab shows something meaningful immediately. This skeleton is replaced
		// by the committed AgentHostSession once it arrives.
		newSession.setTitle((options.title || query.split('\n')[0]).substring(0, 100) || newSession.untitledTitle);
		const skeleton = newSession.session;
		this._pendingSessions.set(newSession.sessionId, skeleton);
		this._onDidChangeSessions.fire({ added: [skeleton], removed: [], changed: [] });

		try {
			const committedSession = await this._waitForNewSession(chatResource.scheme, newSessionRawId, newSession.cancellationToken);
			if (committedSession) {
				this._preserveNewSessionConfig(newSession, committedSession.sessionId);
				if (options.title) {
					await this.renameSession(committedSession.sessionId, options.title);
				}
				const committedRawIdForSelections = this._sessionKeyFromChatId(committedSession.sessionId);
				const committedAdapter = committedRawIdForSelections ? this._sessionCache.get(committedRawIdForSelections) : undefined;
				if (committedAdapter && selectedModelId) {
					this._preserveNewSessionModelSelection(committedAdapter, selectedModelId, selectedModelSource, selectedModelConfiguration);
				}
				if (committedAdapter && selectedAgent) {
					committedAdapter.setChatAgent(committedAdapter.resource, selectedAgent);
				}
				// Session graduated: release the eager subscription without
				// firing `disposeSession`. The session handler has already
				// acquired its own subscription (chat widget was opened
				// earlier), so the wire-level refcount stays positive.
				newSession.graduate();
				if (this._newSessions.get(newSession.sessionId) === newSession) {
					this._newSessions.deleteAndDispose(newSession.sessionId);
					this._onDidChangeDraftSessions.fire();
				}
				// Clear the pending session before firing the replace event so
				// that any synchronous listener calling getSessions() sees only
				// the committed session and not both.
				this._pendingSessions.delete(newSession.sessionId);
				this._onDidReplaceSession.fire({ from: skeleton, to: committedSession });
				return committedSession;
			}
		} catch {
			// Connection lost or timeout — fall through to the failure cleanup.
		} finally {
			// Defensive clear: covers the failure path where the try block
			// never reached the explicit clear above.
			this._pendingSessions.delete(newSession.sessionId);
		}

		// On failure: drop the eager subscription without firing
		// `disposeSession`. The server-side empty-session GC will clean up
		// the provisional session if it remains; we lean on the GC rather
		// than risking a double-dispose race on transient failures.
		newSession.graduate();
		if (this._newSessions.get(newSession.sessionId) === newSession) {
			this._onNewSessionAbandoned(newSession.sessionId, 'sendFailed');
			this._newSessions.deleteAndDispose(newSession.sessionId);
			this._onDidChangeDraftSessions.fire();
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

	private _preserveNewSessionModelSelection(
		committedAdapter: AgentHostSessionAdapter,
		modelId: string,
		source: ChatModelSource,
		modelConfiguration: IAutomationSessionTemplate['modelConfiguration'],
	): void {
		if (modelConfiguration !== undefined) {
			this._runningModelConfigurations.set(committedAdapter.sessionId, new AutomationModelConfiguration(this._languageModelsService, {
				modelId,
				modelConfiguration,
			}));
		}
		committedAdapter.setChatModelId(committedAdapter.resource, modelId, source);
	}

	protected _sessionKeyFromChatId(chatId: string): string | undefined {
		const prefix = `${this.id}:`;
		const resourceStr = chatId.startsWith(prefix) ? chatId.substring(prefix.length) : chatId;
		try {
			const resource = URI.parse(resourceStr).with({ fragment: '' });
			return this._sessionKeysByResource.get(resource);
		} catch {
			return undefined;
		}
	}

	private _acquireSessionChatDetails(sessionId: string): IDisposable {
		const rawId = this._sessionKeyFromChatId(sessionId);
		if (!rawId || !this._sessionCache.has(rawId)) {
			return Disposable.None;
		}
		return this._sessionChatDetailsReferences.acquire(sessionId);
	}

	/**
	 * Guesses which of a session's chats an operation meant, for APIs that are keyed by session id
	 * alone and so cannot say.
	 *
	 * A guess, not an answer: it reads whichever session is globally active, so an operation on a
	 * visible peer chat that is not the active one lands on the wrong conversation. Callers that
	 * can name their chat should take it as a parameter instead, as
	 * {@link ISessionsProvider.setModel} does.
	 */
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
	private static readonly CHAT_MODEL_RETENTION_MS = 10_000;

	private _keepAgentMergeSessionStateAlive(sessionId: string): void {
		this._agentMergeSessionStateIdleTimers.deleteAndDispose(sessionId);
		if (this._agentMergeSessionStateSubscriptions.has(sessionId)) {
			return;
		}
		const connection = this.connection;
		const rawId = this._sessionKeyFromChatId(sessionId);
		const cached = rawId ? this._sessionCache.get(rawId) : undefined;
		if (!connection || !rawId || !cached || readSessionEhcliAdoptable(this._metadataBySession.get(rawId)?._meta)) {
			return;
		}
		const ref = connection.getSubscription(StateComponents.Session, cached.backendUri, 'BaseAgentHostSessionsProvider.agentMergeState');
		if (ref.object.value instanceof Error) {
			ref.dispose();
			return;
		}
		const store = new DisposableStore();
		store.add(ref);
		store.add(ref.object.onDidChange(state => this._applySessionStateUpdate(sessionId, state)));
		const onDidError = ref.object.onDidError;
		if (onDidError) {
			store.add(onDidError(() => {
				if (this._agentMergeSessionStateSubscriptions.get(sessionId) === store) {
					this._agentMergeSessionStateIdleTimers.deleteAndDispose(sessionId);
					this._agentMergeSessionStateSubscriptions.deleteAndDispose(sessionId);
				}
			}));
		}
		this._agentMergeSessionStateSubscriptions.set(sessionId, store);
		const value = ref.object.value;
		if (value && !(value instanceof Error)) {
			this._applySessionStateUpdate(sessionId, value);
		}
	}

	private _scheduleAgentMergeSessionStateIdleRelease(sessionId: string): void {
		if (this._observedAgentMergeSessionStates.has(sessionId) || !this._agentMergeSessionStateSubscriptions.has(sessionId)) {
			return;
		}
		this._agentMergeSessionStateIdleTimers.set(sessionId, disposableTimeout(() => {
			this._agentMergeSessionStateIdleTimers.deleteAndDispose(sessionId);
			this._agentMergeSessionStateSubscriptions.deleteAndDispose(sessionId);
		}, BaseAgentHostSessionsProvider.SESSION_STATE_SUBSCRIPTION_IDLE_MS));
	}

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
		// A visible session's subscription is pinned open.
		if (this._pinnedSessionStates.has(sessionId) || this._sessionChatDetailsReferences.hasReferences(sessionId)) {
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

	private _keepChatSessionStateAlive(chatChannel: string): void {
		const parsedChat = parseChatUri(chatChannel);
		if (!parsedChat) {
			return;
		}
		const cached = this._sessionCache.get(parsedChat.session);
		if (cached) {
			this._keepSessionStateAlive(cached.sessionId);
		}
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
		const rawId = this._sessionKeyFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		// A surfaced-but-un-adopted legacy Copilot CLI session must NOT be
		// subscribed passively: subscribing its session/chat channel triggers an
		// agent-host restore, which adopts (migrates) it. Migration must happen
		// only when the user explicitly opens the session. It renders read-only
		// from its summary until then; the marker clears once it is adopted.
		if (readSessionEhcliAdoptable(this._metadataBySession.get(rawId)?._meta)) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		const chatCatalogLoading = this._getChatCatalogLoading(rawId);
		if (!this._lastSessionStates.has(sessionId)) {
			chatCatalogLoading.set(true, undefined);
		}
		const sessionUri = cached.backendUri;
		const ref = connection.getSubscription(StateComponents.Session, sessionUri, 'BaseAgentHostSessionsProvider.summary');
		// Do not cache failures, so a later pin can retry sessions addressed before host creation.
		if (ref.object.value instanceof Error) {
			chatCatalogLoading.set(false, undefined);
			ref.dispose();
			return;
		}
		const store = new DisposableStore();
		store.add(ref);
		store.add(ref.object.onDidChange(state => {
			this._applySessionStateUpdate(sessionId, state);
		}));
		// A subscribe that fails after this point settles via `onDidError`, never `onDidChange`.
		const onDidError = ref.object.onDidError;
		if (onDidError) {
			store.add(onDidError(() => {
				chatCatalogLoading.set(false, undefined);
				if (this._sessionStateSubscriptions.get(sessionId) === store) {
					this._sessionStateSubscriptions.deleteAndDispose(sessionId);
					queueMicrotask(() => {
						if (!this._store.isDisposed && this._sessionChatDetailsReferences.hasReferences(sessionId)) {
							this._ensureSessionStateSubscription(sessionId);
						}
					});
				}
			}));
		}
		this._sessionStateSubscriptions.set(sessionId, store);

		const value = ref.object.value;
		if (value && !(value instanceof Error)) {
			this._applySessionStateUpdate(sessionId, value);
		}

		this._hydrateAgentFromDraft(connection, cached, sessionId, sessionUri, store);
		this._hydrateModelFromDraft(connection, cached, sessionId, sessionUri, store);
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
	 * Resume hydration for the model, mirroring {@link _hydrateAgentFromDraft}.
	 *
	 * A reloaded session reports `modelId === undefined` until something tells it otherwise, and an
	 * undefined model reads as "this conversation has never chosen one" — which invites model
	 * selection to seed it from a profile-wide preference and write that through to the backend.
	 * The model the session was actually running on is on the default chat's `ChatState.draft`, so
	 * it is read back the same way the draft agent is.
	 *
	 * One-shot and guarded inside {@link AgentHostSessionAdapter.hydrateSelectedModel}, so it
	 * neither leaks nor overrides a selection made in the meantime.
	 */
	private _hydrateModelFromDraft(connection: IAgentConnection, cached: AgentHostSessionAdapter, sessionId: string, sessionUri: URI, store: DisposableStore): void {
		if (cached.modelId.get() !== undefined) {
			return;
		}
		const lastDefaultChat = this._lastSessionStates.get(sessionId)?.defaultChat;
		const defaultChatUri = lastDefaultChat ? URI.parse(lastDefaultChat.toString()) : URI.parse(buildDefaultChatUri(sessionUri));
		const chatRef = connection.getSubscription(StateComponents.Chat, defaultChatUri, 'BaseAgentHostSessionsProvider.draftModel');
		store.add(chatRef);
		const listener = store.add(new MutableDisposable());
		const tryHydrate = () => {
			if (cached.modelId.get() === undefined) {
				const chatState = chatRef.object.value;
				const model = chatState && !(chatState instanceof Error) ? chatState.draft?.model : undefined;
				if (model) {
					if (model.config !== undefined) {
						const modelId = `${cached.resource.scheme}:${model.id}`;
						this._runningModelConfigurations.set(cached.sessionId, new AutomationModelConfiguration(this._languageModelsService, {
							modelId,
							modelConfiguration: model.config,
						}));
					}
					cached.hydrateSelectedModel(model);
				}
			}
			if (cached.modelId.get() !== undefined) {
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
		// Any folder's Agent Merge settings, including those written by earlier versions.
		const agentMergeSettings = () => [...readAgentMergeFolderStates(this._getAgentMergeValues(sessionId), '').entries()]
			.map(([key, folderState]) => ({ key, enabled: folderState.enabled, overrides: folderState.overrides }));
		const previousAgentMergeSettings = agentMergeSettings();
		this._lastSessionStates.set(sessionId, state);
		this._updateAgentMergeFolders(sessionId, state);
		const agentMergeSettingsChanged = !structuralEquals(previousAgentMergeSettings, agentMergeSettings());
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
		if (!structuralEquals(readSessionSandboxPolicy(previous), readSessionSandboxPolicy(state)) || readSessionSandboxState(previous)?.enabled !== readSessionSandboxState(state)?.enabled) {
			this._onDidChangeSessionConfig.fire(sessionId);
		}
		this._applySessionMetadataFromState(sessionId, state, previous);
		const rawId = this._sessionKeyFromChatId(sessionId);
		this._applyChatCatalogFromState(sessionId, state);
		if (rawId) {
			this._chatCatalogLoading.get(rawId)?.set(false, undefined);
		}
		if (agentMergeSettingsChanged) {
			this._onDidChangeAgentMergeSessionState.fire(sessionId);
		}

	}

	/**
	 * Rebase the cached running adapter's selected agent against the host's agent
	 * list from an AHP {@link SessionState}, before the picker is notified. A
	 * session that has moved into an isolated worktree keeps its selection instead
	 * of resetting to the default once the host starts reporting worktree-pathed
	 * agents. See {@link AgentHostSessionAdapter.reconcileSelectedAgent}.
	 */
	private _reconcileAgentFromState(sessionId: string, state: SessionState): void {
		const rawId = this._sessionKeyFromChatId(sessionId);
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
		const rawId = this._sessionKeyFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}
		cached.applyChatCatalog(state);
		this._cacheDirty = true;
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
		const newSession = this._newSessions.get(sessionId);
		const previousBranchName = newSession?.session.workspace.get()?.folders[0]?.gitRepository?.branchName;
		newSession?.applySessionMeta(state._meta, state.workingDirectories?.[0]);
		const branchName = newSession?.session.workspace.get()?.folders[0]?.gitRepository?.branchName;
		if (newSession && branchName !== undefined && branchName !== previousBranchName) {
			void this._syncFolderDraftBranch(newSession, branchName).catch(error => {
				if (this._getNewSession(sessionId) === newSession) {
					this._logService.warn(`[${this.id}] Failed to follow the checked-out branch for ${sessionId}: ${error}`);
				}
			});
		}
		if (!structuralEquals(readSessionSandboxPolicy(previous), readSessionSandboxPolicy(state)) || readSessionSandboxState(previous)?.enabled !== readSessionSandboxState(state)?.enabled) {
			this._onDidChangeSessionConfig.fire(sessionId);
		}
		if (!previous || customizationsChanged(previous, state)) {
			this._onDidChangeCustomAgents.fire();
			this._onDidChangeCustomizations.fire();
		}
	}

	/**
	 * A folder draft works on the checked-out branch, so its branch value follows
	 * the branch switches its Git state reports, including checkouts made outside
	 * the branch picker. Checkouts from the picker already set the value.
	 */
	private async _syncFolderDraftBranch(newSession: NewSession, branchName: string): Promise<void> {
		const getOutOfSyncBranchKey = (): string | undefined => {
			const config = newSession.getConfig();
			if (!config || this._getNewSession(newSession.sessionId) !== newSession
				|| newSession.session.workspace.get()?.folders[0]?.gitRepository?.branchName !== branchName) {
				return undefined;
			}
			const workspace = getSessionWorkspaceProperties(config.schema);
			return workspace.baseBranch && isSessionConfigWritable(workspace.baseBranch.schema, true)
				&& readSessionIsolation(workspace.isolation, config.values[workspace.isolationKey]) === 'folder'
				&& config.values[workspace.baseBranch.key] !== branchName
				? workspace.baseBranch.key
				: undefined;
		};
		if (!getOutOfSyncBranchKey()) {
			return;
		}
		await waitForState(newSession.isResolvingConfig, resolving => !resolving, undefined, newSession.cancellationToken);
		const branchKey = getOutOfSyncBranchKey();
		if (!branchKey) {
			return;
		}
		newSession.beginResolveConfigSync();
		newSession.setConfigValue(branchKey, branchName);
		this._onDidChangeSessionConfig.fire(newSession.sessionId);
		await newSession.trackConfigResolution(this._refreshNewSessionConfig(newSession));
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

	private _applySessionMetadataFromState(sessionId: string, state: SessionState, previous: SessionState | undefined): void {
		const rawId = this._sessionKeyFromChatId(sessionId);
		if (!rawId) {
			return;
		}
		const cached = this._sessionCache.get(rawId);
		if (!cached) {
			return;
		}

		const metadata: AgentHostSessionStateMetadata = {
			// Unchanged snapshot fields must not overwrite newer catalogue deltas.
			...(!equals(state.project, previous?.project) ? {
				project: state.project ? {
					displayName: state.project.displayName,
					uri: this.mapProjectUri(URI.parse(state.project.uri)),
				} : undefined,
			} : {}),
			workingDirectories: state.workingDirectories?.map(directory => this.mapWorkingDirectoryUri(URI.parse(directory))),
			_meta: state._meta,
		};
		if (cached.applySessionStateMetadata(metadata, previous)) {
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
		const config = this._runningSessionConfigs.get(sessionId);
		const isolation = config && getSessionWorkspaceProperties(config.schema).isolation;
		const isolated = isolation ? readSessionIsolation(isolation, values?.[isolation.key]) === 'worktree' : isWorktreeIsolation(values);
		const rawId = this._sessionKeyFromChatId(sessionId);
		const adapter = rawId ? this._sessionCache.get(rawId) : undefined;
		adapter?.setWorktreeIsolation(isolated);
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
	 * `legacyStorageKeys`, when given, are removed so stale entries are discarded.
	 */
	protected _enableSessionCachePersistence(storageKey: string, legacyStorageKeys?: string | readonly string[]): void {
		for (const legacyStorageKey of typeof legacyStorageKeys === 'string' ? [legacyStorageKeys] : legacyStorageKeys ?? []) {
			this._storageService.remove(legacyStorageKey, StorageScope.APPLICATION);
		}
		this._sessionCacheStorageKey = storageKey;
		this._loadCachedSessions();
	}

	/**
	 * Whether {@link _onDidChangeSessions} events should update the persistence
	 * bookkeeping ({@link _cacheDirty} + {@link _metadataBySession}). Default `true`;
	 * the remote provider overrides this to suspend tracking while its cached
	 * sessions are unpublished (offline), so the on-disk snapshot survives.
	 */
	protected _shouldTrackSessionCacheChanges(): boolean {
		return true;
	}

	protected _adoptCachedSessionMeta(meta: IAgentSessionMetadata): IAgentSessionMetadata {
		return this._adoptSessionMeta(meta);
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
			const meta = this._adoptCachedSessionMeta(deserialized);
			const rawId = meta.session.toString();
			if (this._sessionCache.has(rawId)) {
				continue;
			}
			const cached = this.createAdapter(meta);
			cached.discoveryMetadata = deserializeDiscoveryMetadata(entry.discovery, this._logService);
			this._sessionCache.set(rawId, cached);
		}
	}

	/**
	 * Persist the current {@link _sessionCache} to storage, capping at
	 * {@link CACHED_SESSIONS_MAX_PER_HOST} most-recently-modified entries.
	 * Mutable fields are read from each adapter's observables and overlaid on
	 * top of the original metadata snapshot captured in {@link _metadataBySession}.
	 */
	private _persistCache(): void {
		if (!this._sessionCacheStorageKey) {
			return;
		}
		const entries: ISerializedSessionMetadata[] = [];
		for (const [rawId, adapter] of this._sessionCache) {
			const base = this._metadataBySession.get(rawId);
			if (!base) {
				continue;
			}
			const sessionMeta = adapter.isQuickChat.get()
				? withSessionWorkspaceless(adapter.sessionMeta, true)
				: adapter.sessionMeta;
			entries.push(serializeMetadata({
				...base,
				summary: adapter.title.get() || base.summary,
				modifiedTime: adapter.updatedAt.get().getTime(),
				changes: adapter.changesSummary.get(),
				project: adapter.project,
				chats: adapter.getCurrentChatMetadata(base.chats),
				// Session-state and summary updates can relocate an existing session.
				workingDirectories: adapter.workingDirectories,
				status: withSessionStatusFlag(
					withSessionStatusFlag(base.status ?? ProtocolSessionStatus.Idle, ProtocolSessionStatus.IsRead, adapter.isRead.get()),
					ProtocolSessionStatus.IsArchived,
					adapter.isArchived.get()),
				// Session-state updates can refine presentation metadata without another listing.
				_meta: sessionMeta,
			}, adapter.discoveryMetadata));
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
		const generation = ++this._sessionRefreshGeneration;
		try {
			const sessions = await connection.listSessions();
			if (generation !== this._sessionRefreshGeneration || this._store.isDisposed) {
				return;
			}
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
				const rawId = meta.session.toString();
				currentKeys.add(rawId);
				const agentProvider = meta.provider ?? AgentSession.provider(meta.session);
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
			this._onHostListedSessions(currentKeys);
			// Some hosts briefly omit just-sent eager sessions from listSessions.
			// Keep pending sessions visible until their sendRequest graduates them.
			const pendingRawIds = new Set([...this._pendingSessions.values()]
				.map(session => session.resource.toString()));
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
					if (pendingRawIds.has(cached.resource.toString())) {
						continue;
					}
					if (!this._isSessionEvictable(key)) {
						continue;
					}
					if (!evictUnlistedAgents && !listedAgentProviders.has(cached.agentProvider)) {
						continue;
					}
					this._sessionCache.delete(key);
					this._runningSessionConfigs.delete(cached.sessionId);
					this._runningSessionConfigResolveSeq.delete(cached.sessionId);
					this._runningModelConfigurations.deleteAndDispose(cached.sessionId);
					removed.push(cached);
				}
			}
			this._onHostReconciledSessions(new Set(this._sessionCache.keys()));

			if (added.length > 0 || removed.length > 0 || changed.length > 0) {
				this._onDidChangeSessions.fire({ added, removed, changed });
			}
			this._syncActiveClient();
			for (const cached of removed) {
				(cached as AgentHostSessionAdapter).dispose();
			}
		} catch (err) {
			if (generation !== this._sessionRefreshGeneration || this._store.isDisposed) {
				return;
			}
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
			if (generation === this._sessionRefreshGeneration) {
				this._sessionRefreshInFlight = false;
			}
		}
	}

	/**
	 * Whether a cached session the host did not list may be evicted. Subclasses override this to
	 * protect a session that exists but that the host has not materialized yet.
	 */
	protected _isSessionEvictable(_rawId: string): boolean {
		return true;
	}

	/** Raw ids the host listed, reported before eviction runs so subclasses can retire protections. */
	protected _onHostListedSessions(_rawIds: ReadonlySet<string>): void { }

	/** Raw ids retained after authoritative-list eviction and partial-provider guards have applied. */
	protected _onHostReconciledSessions(_rawIds: ReadonlySet<string>): void { }

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
	 * Resolves the freshly committed backend session for an in-flight send.
	 * A committed session preserves the draft URI, preventing unrelated sessions from replacing it.
	 */
	private async _waitForNewSession(expectedScheme: string, ownRawId: string, token: CancellationToken): Promise<ISession | undefined> {
		const matches = (session: ISession): boolean => session.resource.scheme === expectedScheme && session.resource.path.substring(1) === ownRawId;

		await this._refreshSessions();
		const immediate = [...this._sessionCache.values()].find(matches);
		if (immediate && matches(immediate)) {
			return immediate;
		}

		const waitDisposables = new DisposableStore();
		try {
			const sessionPromise = new Promise<ISession | undefined>((resolve) => {
				waitDisposables.add(this._onDidChangeSessionsImmediately(e => {
					const newSession = e.added.find(matches);
					if (newSession) {
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

	/**
	 * Wire AHP notification and action listeners on the given connection.
	 * Subclasses call this from their constructor (local) or `setConnection`
	 * (remote), passing a store that bounds the listeners' lifetime.
	 */
	protected _attachConnectionListeners(connection: IAgentConnection, store: DisposableStore): void {
		for (const sessionId of this._sessionChatDetailsReferences.activeSessionIds) {
			this._sessionStateIdleTimers.deleteAndDispose(sessionId);
			this._sessionStateSubscriptions.deleteAndDispose(sessionId);
			this._ensureSessionStateSubscription(sessionId);
		}

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
			// A rejected action never reached host state, so it must not be applied
			// here. This does not roll back the dispatcher's own optimistic write:
			// the echo carries the value it already set.
			if (e.rejectionReason) {
				return;
			}
			if (e.action.type === ActionType.ChatTurnComplete && isChatAction(e.action)) {
				this._keepChatSessionStateAlive(e.channel);
				this._refreshSessions();
			} else if (e.action.type === ActionType.SessionTitleChanged && isSessionAction(e.action)) {
				this._handleTitleChanged(e.channel, e.action.title);
			} else if (e.action.type === ActionType.SessionIsArchivedChanged && isSessionAction(e.action)) {
				this._handleIsArchivedChanged(e.channel, e.action.isArchived);
			} else if (e.action.type === ActionType.SessionIsReadChanged && isSessionAction(e.action)) {
				this._handleIsReadChanged(e.channel, e.action.isRead);
			} else if (e.action.type === ActionType.SessionConfigChanged && isSessionAction(e.action)) {
				this._handleConfigChanged(e.channel, e.action.config, e.action.replace === true);
			} else if (e.action.type === ActionType.SessionMetaChanged && isSessionAction(e.action)) {
				this._handleSessionMetaChanged(e.channel, e.action._meta);
			}
		}));
	}

	private _handleSessionAdded(summary: SessionSummary): void {
		const workingDirs = summary.workingDirectories?.map(d => this.mapWorkingDirectoryUri(URI.parse(d)));
		const rawMeta: IAgentSessionMetadata = {
			session: URI.parse(summary.resource),
			provider: summary.provider,
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
			chats: chatMetadataFromSummary(summary),
			// Carry `_meta` so a new adapter seeds its session-kind from it and an
			// existing one can be promoted by it.
			...(summary._meta !== undefined ? { _meta: summary._meta } : {}),
		};

		// Adopt before deriving the cache key so a host that addresses sessions under a different
		// scheme routes to the agent provider, as the refresh and persistence paths do.
		const meta = this._adoptSessionMeta(rawMeta);
		const rawId = meta.session.toString();

		const existing = this._sessionCache.get(rawId);
		if (existing) {
			if (this.updateAdapter(existing, meta)) {
				this._onDidChangeSessionsFromNotifications.fire({ added: [], removed: [], changed: [existing] });
			}
			this._syncActiveClient();
			return;
		}

		const cached = this.createAdapter(meta);
		this._sessionCache.set(rawId, cached);
		this._onDidChangeSessionsFromNotifications.fire({ added: [cached], removed: [], changed: [] });
		this._syncActiveClient();
	}

	private _handleSessionRemoved(session: URI | string): void {
		const rawId = session.toString();
		this._onBackendSessionRemoved(rawId);
		const cached = this._removeCachedSession(rawId);
		if (cached) {
			this._onDidChangeSessionsFromNotifications.fire({ added: [], removed: [cached], changed: [] });
			cached.dispose();
		}
		this._syncActiveClient();
	}

	protected _onBackendSessionRemoved(_rawId: string): void { }

	protected _removeCachedSession(rawId: string, expected?: AgentHostSessionAdapter): AgentHostSessionAdapter | undefined {
		const cached = this._sessionCache.get(rawId);
		if (expected && cached && cached !== expected) {
			return undefined;
		}
		this._metadataBySession.delete(rawId);
		this._chatCatalogLoading.delete(rawId);
		const stateOwner = cached ?? expected;
		if (!stateOwner) {
			return undefined;
		}
		if (cached) {
			this._sessionCache.delete(rawId);
		}
		this._sessionKeysByResource.delete(stateOwner.resource.with({ fragment: '' }));
		this._runningSessionConfigs.delete(stateOwner.sessionId);
		this._runningSessionConfigResolveSeq.delete(stateOwner.sessionId);
		this._runningModelConfigurations.deleteAndDispose(stateOwner.sessionId);
		this._sessionStateIdleTimers.deleteAndDispose(stateOwner.sessionId);
		this._sessionStateSubscriptions.deleteAndDispose(stateOwner.sessionId);
		this._agentMergeSessionStateIdleTimers.deleteAndDispose(stateOwner.sessionId);
		this._agentMergeSessionStateSubscriptions.deleteAndDispose(stateOwner.sessionId);
		this._agentMergeSessionStateObservables.delete(stateOwner.sessionId);
		this._observedAgentMergeSessionStates.delete(stateOwner.sessionId);
		this._agentMergeFolders.delete(stateOwner.sessionId);
		this._lastSessionStates.delete(stateOwner.sessionId);
		return cached;
	}

	private _handleTitleChanged(session: string, title: string): void {
		const rawId = session;
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.title.set(title, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsArchivedChanged(session: string, isArchived: boolean): void {
		const rawId = session;
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			cached.isArchived.set(this._resolveArchivedState(rawId, isArchived), undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleIsReadChanged(session: string, isRead: boolean): void {
		const rawId = session;
		const cached = this._sessionCache.get(rawId);
		if (cached) {
			if (!cached.supportsChatReadState()) {
				if (cached.setLegacySessionReadState(isRead)) {
					this._cacheDirty = true;
					this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
				}
				return;
			}
			const effectiveIsRead = isRead && !cached.hasUnreadChat();
			const sessionChanged = cached.isRead.get() !== effectiveIsRead;
			if (!sessionChanged) {
				return;
			}
			cached.isRead.set(effectiveIsRead, undefined);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	private _handleSessionSummaryChanged(session: string, changes: SessionSummaryChanges): void {
		// Set when a delta clears the adoptable-legacy marker so we can reopen the
		// passive state subscription after the transaction commits (the observable
		// updates in `_ensureSessionStateSubscription` must not run nested in `tx`).
		let reopenStateSubscriptionFor: string | undefined;
		transaction((tx) => {
			const rawId = session;
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

				const isArchived = this._resolveArchivedState(rawId, !!(changes.status & ProtocolSessionStatus.IsArchived));
				if (isArchived !== cached.isArchived.get()) {
					cached.isArchived.set(isArchived, tx);
					didChange = true;
				}

				const isRead = !!(changes.status & ProtocolSessionStatus.IsRead);
				if (!cached.supportsChatReadState()) {
					if (cached.setLegacySessionReadState(isRead, tx)) {
						this._cacheDirty = true;
						didChange = true;
					}
				} else {
					const effectiveIsRead = isRead && !cached.hasUnreadChat();
					if (effectiveIsRead !== cached.isRead.get()) {
						cached.isRead.set(effectiveIsRead, tx);
						didChange = true;
					}
				}
			}

			if (changes.title !== undefined && changes.title !== cached.title.get()) {
				cached.title.set(changes.title, tx);
				didChange = true;
			}
			if (changes.modifiedAt !== undefined) {
				const modifiedTime = Date.parse(changes.modifiedAt);
				if (Number.isFinite(modifiedTime) && cached.updatedAt.get().getTime() !== modifiedTime) {
					cached.updatedAt.set(new Date(modifiedTime), tx);
					didChange = true;
				}
			}

			if (changes.changes !== undefined && cached.setChangesSummary(changes.changes, tx)) {
				didChange = true;
			}

			if (Object.prototype.hasOwnProperty.call(changes, 'activity') && cached.setActivity(changes.activity, tx)) {
				didChange = true;
			}

			if (changes.chats !== undefined && cached.applyChatMetadata(chatMetadataFromSummary(changes), tx)) {
				didChange = true;
			}

			const workspaceMetadata: AgentHostSessionSummaryWorkspaceMetadata = {};
			if (Object.prototype.hasOwnProperty.call(changes, 'project')) {
				workspaceMetadata.project = changes.project ? {
					displayName: changes.project.displayName,
					uri: this.mapProjectUri(URI.parse(changes.project.uri)),
				} : undefined;
			}
			if (Object.prototype.hasOwnProperty.call(changes, 'workingDirectories')) {
				workspaceMetadata.workingDirectories = changes.workingDirectories?.map(directory => this.mapWorkingDirectoryUri(URI.parse(directory)));
			}
			if (cached.applySessionSummaryWorkspaceMetadata(workspaceMetadata, tx)) {
				didChange = true;
			}

			if (Object.prototype.hasOwnProperty.call(changes, '_meta')) {
				// Keep the guard map in sync (mirrors `updateAdapter`) so a cleared
				// adoptable-legacy marker reopens the passive session-state
				// subscription in `_ensureSessionStateSubscription`. Use `hasOwnProperty`
				// (like `activity` above) so an explicit clear to `undefined` applies.
				const storedMeta = this._metadataBySession.get(rawId);
				const wasAdoptable = readSessionEhcliAdoptable(storedMeta?._meta);
				if (storedMeta) {
					this._metadataBySession.set(rawId, { ...storedMeta, _meta: changes._meta });
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
				this._onDidChangeSessionsFromNotifications.fire({ added: [], removed: [], changed: [cached] });
			}
		});

		if (reopenStateSubscriptionFor !== undefined) {
			this._ensureSessionStateSubscription(reopenStateSubscriptionFor);
		}
	}

	private _handleConfigChanged(session: string, config: Record<string, unknown>, replace: boolean): void {
		const rawId = session;
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

	private _handleSessionMetaChanged(session: string, meta: Record<string, unknown> | undefined): void {
		const rawId = session;
		const cached = this._sessionCache.get(rawId);
		if (cached?.setMeta(meta)) {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [cached] });
		}
	}

	/**
	 * Optional URI mapper used when applying diff changes. Subclasses
	 * override to translate remote diff URIs into agent-host URIs.
	 */
	protected _diffUriMapper(): AgentHostUriMapper | undefined { return undefined; }
}
