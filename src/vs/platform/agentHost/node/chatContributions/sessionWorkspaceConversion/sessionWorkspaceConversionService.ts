/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { withMessageRequestHiddenFromTranscript, withMessageSystemInitiatedLabel } from '../../../common/meta/agentMessageMeta.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { basename, extUriBiasedIgnorePathCase, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession, AgentWorkingDirectoryChangedError, type IAgent, type IAgentSessionProjectInfo } from '../../../common/agent.js';
import { IAgentHostGitStateService } from '../../../common/agentHostGitStateService.js';
import { AgentHostGlobalAutoApproveEnabledConfigKey, platformRootSchema, platformSessionSchema } from '../../../common/agentHostSchema.js';
import { toAgentWorkspaceContinuationMessageMeta } from '../../../common/meta/agentWorkspaceContinuationMeta.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { AgentSystemNotificationKind, AgentSystemNotificationWorkspaceKind, serializeAgentWorkspaceTransition, type IAgentSystemNotificationMeta, type IAgentWorkspaceTransitionRecord, toAgentSystemNotificationMeta } from '../../../common/meta/agentSystemNotificationMeta.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY, AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, buildDefaultChatUri, ChatInteractivity, ChatOriginKind, chatStorageUri, isDefaultChatUri, isSubagentSession, MessageKind, parseChatUri, parseSubagentSessionUri, readSessionExternal, readSessionWorkspaceless, ResponsePartKind, SessionLifecycle, SessionStatus, withSessionHasWorkspaceTransitions, withSessionWorkspaceless, type ISessionWithDefaultChat, type SessionConfigState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostClientConnectionService } from '../../agentHostClientConnectionService.js';
import { IAgentConfigurationService } from '../../agentConfigurationService.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostTurnService, type IDeferredAgentHostTurn } from '../../agentHostTurnService.js';
import { IAgentHostServerToolService } from '../../shared/agentServerToolHost.js';
import { IAgentHostWorktreeIsolation, type IIsolationConfigContribution } from '../../shared/worktreeIsolation.js';
import type { IAgentServiceSessionServerToolAccessor } from '../../shared/sessionServerTools.js';

const CHAT_ISOLATION_DIRECTORY_KEY = 'agentHost.chatIsolationDirectory';
const CHAT_ISOLATION_QUARANTINED_KEY = 'agentHost.chatIsolationQuarantined';

export interface IChatIsolationHost {
	readonly prepareChatWorkingDirectory: IAgentServiceSessionServerToolAccessor['prepareChatWorkingDirectory'];
	setChatWorkingDirectory(session: URI, chat: URI, directory: URI, replaceSessionWorkspace: boolean, expectedSessionDirectories?: readonly string[]): Promise<void>;
	runWithChatCatalogLock<T>(session: URI, operation: () => Promise<T>): Promise<T>;
}

interface IPendingSessionWorkspaceConversion {
	readonly chat: URI;
	readonly turnId: string;
	readonly chatOnly?: boolean;
	readonly replaceSessionWorkspace?: boolean;
	readonly workspaceFolder: URI;
	readonly previousWorkingDirectory?: URI;
	readonly isolation: boolean;
	readonly initiatingClientId: string;
	readonly prompt: string | undefined;
	readonly showTransition: boolean;
	/** The host-owned continuation turn of a deferred conversion, once it has started. */
	continuationTurnId?: string;
	phase: 'requested' | 'converting';
	resolvedWorkingDirectory?: URI;
	transition?: IAgentWorkspaceTransitionRecord;
	transitionPersisted?: boolean;
}

interface IResolvedWorkspace {
	readonly workingDirectory: URI;
	readonly configValues: Record<string, unknown>;
	readonly isolationConfig: IIsolationConfigContribution | undefined;
	readonly isolated: boolean;
	readonly project: IAgentSessionProjectInfo | undefined;
	readonly branchName?: string;
}

/** Upper bound for restoring sibling chats before a multi-chat workspace change; the chat cannot be cancelled while it waits. */
const SIBLING_RESTORE_TIMEOUT_MS = 30_000;

/** Whether the session has exactly one chat the user works in; transient subagent chats never count as siblings. */
export function hasSingleUserChat(chats: readonly { readonly origin?: { readonly kind: ChatOriginKind } }[]): boolean {
	return chats.filter(chat => chat.origin?.kind !== ChatOriginKind.Tool).length === 1;
}

class UnsafeProviderWorkingDirectoryError extends Error {
}

export const ISessionWorkspaceConversionService = createDecorator<ISessionWorkspaceConversionService>('sessionWorkspaceConversionService');

/** Coordinates requested workspace changes after the requesting turn has finished. */
export interface ISessionWorkspaceConversionService {
	readonly _serviceBrand: undefined;
	/** Provider support for tool registration, independent of session creation and execution readiness. */
	supportsChatIsolation(session: URI): boolean;
	canIsolateChat(chat: URI): boolean;
	requestChatIsolation(chat: URI, turnId: string, initiatingClientId: string): void;
	restoreChatIsolation(chat: ProtocolURI): Promise<void>;
	/** Returns false when the chat already uses the requested folder without needing a workspace change. */
	requestSessionWorkspaceUpdate(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean, initiatingClientId: string): boolean;
	isPending(chat: ProtocolURI, sessionWide?: boolean): boolean;
	/** Whether the turn is host-owned and needed to finish an in-flight conversion, so a client must not cancel it. */
	isConversionTurn(chat: ProtocolURI, turnId: string): boolean;
	cancel(chat: ProtocolURI, turnId: string | undefined): void;
	updateSessionWorkspace(chat: ProtocolURI, turnId: string | undefined): Promise<void>;
}

/** Changes session workspaces in place while preserving session and chat identities. */
export class SessionWorkspaceConversionService extends Disposable implements ISessionWorkspaceConversionService {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, IPendingSessionWorkspaceConversion>();
	private readonly _quarantined = new Set<string>();
	private readonly _quarantinedChats = new Set<string>();
	private readonly _restoringChats = new Map<string, symbol>();
	private readonly _isolatedChats = new Set<string>();

	constructor(
		private readonly _chatIsolationHost: IChatIsolationHost | undefined,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@IAgentConfigurationService private readonly _configurationService: IAgentConfigurationService,
		@IAgentHostClientConnectionService private readonly _clientConnections: IAgentHostClientConnectionService,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@IAgentHostServerToolService private readonly _serverToolHost: IAgentHostServerToolService,
		@ILogService private readonly _logService: ILogService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
	) {
		super();
		this._register(this._stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionChatRemoved) {
				this._clearChatIsolationState(envelope.action.chat);
			}
			if (envelope.action.type === ActionType.SessionReady) {
				const session = parseChatUri(envelope.channel)?.session ?? envelope.channel;
				if (this._stateManager.getSessionState(session)?.chats.some(chat => this.canIsolateChat(URI.parse(chat.resource)))) {
					this._serverToolHost.advertise(session);
				}
			}
		}));
		this._register(this._stateManager.onDidRemoveSession(session => {
			const chat = buildDefaultChatUri(session);
			this._clearChatIsolationState(chat);
			for (const key of new Set([...this._pending.keys(), ...this._quarantinedChats, ...this._isolatedChats, ...this._restoringChats.keys()])) {
				if (parseChatUri(key)?.session === session) {
					this._clearChatIsolationState(key);
				}
			}
		}));
	}

	private _clearChatIsolationState(chat: ProtocolURI): void {
		this._pending.delete(chat);
		this._quarantined.delete(chat);
		this._quarantinedChats.delete(chat);
		this._restoringChats.delete(chat);
		this._isolatedChats.delete(chat);
	}

	supportsChatIsolation(session: URI): boolean {
		const provider = this._providerService.getProviderForSession(session);
		return !!this._chatIsolationHost && !isSubagentSession(session.toString())
			&& this._worktreeIsolation.supported && provider?.agentHostCapabilities.workspaceConversion === true
			&& !!provider.setChatWorkingDirectory;
	}

	/**
	 * Whether the chat can move into a new worktree. A chat already in a worktree can still move to a worktree of
	 * a different {@link workspaceFolder}, but a chat with its own isolated worktree only when it replaces the session workspace.
	 */
	canIsolateChat(chat: URI, workspaceFolder?: URI): boolean {
		const parsed = parseChatUri(chat);
		const state = parsed && this._stateManager.getSessionState(parsed.session);
		const directories = state?.chats.find(candidate => candidate.resource === chat.toString())?.workingDirectories
			?? (parsed ? this._stateManager.getSessionSummary(parsed.session)?.workingDirectories : undefined);
		const movesElsewhere = !!workspaceFolder && !!directories?.length && !isEqual(workspaceFolder, URI.parse(directories[0]));
		return this._canChangeChatWorkspace(chat) && !!state && this._worktreeIsolation.supported
			&& !readSessionWorkspaceless(state._meta)
			&& !(!movesElsewhere && state.config?.values[SessionConfigKey.Isolation] === 'worktree'
				&& directories?.[0] === this._stateManager.getSessionSummary(parsed!.session)?.workingDirectories?.[0])
			&& (!this._isolatedChats.has(chat.toString()) || (movesElsewhere && hasSingleUserChat(state.chats)));
	}

	private _canChangeChatWorkspace(chat: URI): boolean {
		const parsed = parseChatUri(chat);
		const state = parsed && this._stateManager.getSessionState(parsed.session);
		const summary = state?.chats.find(candidate => candidate.resource === chat.toString());
		const sessionDirectories = parsed ? this._stateManager.getSessionSummary(parsed.session)?.workingDirectories : undefined;
		const directories = summary?.workingDirectories ?? sessionDirectories;
		const provider = parsed && this._providerService.getProviderForSession(URI.parse(parsed.session));
		return !!parsed && !!this._chatIsolationHost && !isSubagentSession(parsed.session)
			&& provider?.agentHostCapabilities.workspaceConversion === true && !!provider.setChatWorkingDirectory && !!summary
			&& state?.lifecycle === SessionLifecycle.Ready
			&& summary.origin?.kind !== ChatOriginKind.Tool
			&& (summary.interactivity === undefined || summary.interactivity === ChatInteractivity.Full)
			&& ((summary.status ?? 0) & SessionStatus.IsArchived) === 0
			&& !readSessionExternal(state._meta)
			&& (state.status & SessionStatus.IsArchived) !== SessionStatus.IsArchived
			&& directories?.length === 1 && URI.parse(directories[0]).scheme === Schemas.file
			&& (hasSingleUserChat(state.chats) || !!provider?.getDescriptor().capabilities?.multipleWorkingDirectories)
			&& (!readSessionWorkspaceless(state._meta) || hasSingleUserChat(state.chats))
			&& !this.isPending(chat.toString());
	}

	requestChatIsolation(chat: URI, turnId: string, initiatingClientId: string): void {
		if (!initiatingClientId || this._stateManager.getActiveTurnId(chat.toString()) !== turnId) {
			throw new Error(localize('agentHost.chatIsolationRequiresTurn', "Changing a chat's workspace with this tool requires an active turn initiated by a connected client."));
		}
		if (!this.canIsolateChat(chat)) {
			throw new Error(localize('agentHost.chatIsolationRequirements', "This chat's workspace cannot be changed to a new worktree. It must work in one local folder and must not already use a worktree or be changing workspace."));
		}
		const state = this._stateManager.getSessionState(parseChatUri(chat)!.session)!;
		const summary = state.chats.find(candidate => candidate.resource === chat.toString())!;
		this._pending.set(chat.toString(), {
			chat, turnId, chatOnly: true,
			replaceSessionWorkspace: hasSingleUserChat(state.chats),
			workspaceFolder: URI.parse((summary.workingDirectories ?? this._stateManager.getSessionSummary(parseChatUri(chat)!.session)?.workingDirectories)![0]),
			isolation: true, initiatingClientId,
			prompt: this._stateManager.getChatState(chat.toString())?.activeTurn?.message.text,
			showTransition: true, phase: 'requested',
		});
	}

	async restoreChatIsolation(chat: ProtocolURI): Promise<void> {
		const storage = chatStorageUri(chat);
		if (!storage) {
			return;
		}
		const restore = Symbol();
		this._restoringChats.set(chat, restore);
		this._quarantinedChats.add(chat);
		try {
			const database = await this._sessionDataService.tryOpenDatabase(storage);
			try {
				const directory = await database?.object.getMetadata(CHAT_ISOLATION_DIRECTORY_KEY);
				const quarantined = await database?.object.getMetadata(CHAT_ISOLATION_QUARANTINED_KEY);
				if (this._restoringChats.get(chat) === restore) {
					if (directory) {
						this._isolatedChats.add(chat);
					} else {
						this._isolatedChats.delete(chat);
					}
					if (quarantined !== 'true') {
						this._quarantinedChats.delete(chat);
					}
				}
			} finally {
				database?.dispose();
			}
		} finally {
			if (this._restoringChats.get(chat) === restore) {
				this._restoringChats.delete(chat);
			}
		}
	}

	requestSessionWorkspaceUpdate(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean, initiatingClientId: string): boolean {
		if (!initiatingClientId) {
			throw new Error('Session workspace conversion requires an initiating client.');
		}
		const session = parseChatUri(chat)?.session;
		const state = session ? this._stateManager.getSessionState(session) : undefined;
		const chatOnly = !!state && !readSessionWorkspaceless(state._meta);
		if (chatOnly) {
			if (!this._canChangeChatWorkspace(chat)) {
				throw new Error(localize('agentHost.chatWorkspaceUnavailable', "This chat's workspace cannot be changed."));
			}
			if (isolation && !this.canIsolateChat(chat, workspaceFolder)) {
				throw new Error(localize('agentHost.chatWorkspaceIsolationUnavailable', "This chat's workspace cannot be changed to a new worktree of {0}. The chat already uses a worktree of it, or worktrees are not available for it.", workspaceFolder.fsPath));
			}
			if (workspaceFolder.scheme !== Schemas.file || !workspaceFolder.path.startsWith('/') || workspaceFolder.query || workspaceFolder.fragment) {
				throw new Error(localize('agentHost.chatWorkspaceInvalid', "Select an existing folder on the chat's host."));
			}
		} else {
			this._validateConversion(chat, workspaceFolder);
		}
		const activeTurnId = this._stateManager.getActiveTurnId(chat.toString());
		if (activeTurnId !== turnId) {
			throw new Error('Session workspace conversion must be requested from the active turn.');
		}
		const chatState = this._stateManager.getChatState(chat.toString());
		const prompt = chatState?.activeTurn?.message.text;
		const key = chat.toString();
		if (this.isPending(key)) {
			throw new Error('A workspace conversion is already pending for this session.');
		}
		const directories = state?.chats.find(candidate => candidate.resource === key)?.workingDirectories ?? state?.workingDirectories;
		if (chatOnly && !isolation && extUriBiasedIgnorePathCase.isEqual(workspaceFolder, URI.parse(directories![0]))) {
			return false;
		}
		this._pending.set(key, {
			chat, turnId, workspaceFolder, isolation, initiatingClientId, prompt,
			showTransition: chatOnly || !!chatState?.turns.length, phase: 'requested',
			...(chatOnly ? {
				chatOnly: true, replaceSessionWorkspace: hasSingleUserChat(state.chats),
				previousWorkingDirectory: URI.parse(directories![0]),
			} : {}),
		});
		return true;
	}

	isPending(chat: ProtocolURI, sessionWide = false): boolean {
		const key = this._pendingKey(chat);
		const pending = this._pending.get(key);
		return (!!pending && (!pending.chatOnly || pending.replaceSessionWorkspace || (!sessionWide && pending.chat.toString() === chat)))
			|| this._quarantined.has(key) || (!sessionWide && this._quarantinedChats.has(chat));
	}

	isConversionTurn(chat: ProtocolURI, turnId: string): boolean {
		const pending = this._pending.get(chat);
		return pending?.phase === 'converting' && pending.continuationTurnId === turnId;
	}

	private _pendingKey(chat: ProtocolURI): string {
		if (this._pending.get(chat)?.chatOnly) {
			return chat;
		}
		let session = parseChatUri(chat)?.session ?? chat;
		let parent;
		while ((parent = parseSubagentSessionUri(session))) {
			session = parent.parentSession.toString();
		}
		return buildDefaultChatUri(session);
	}

	cancel(chat: ProtocolURI, turnId: string | undefined): void {
		const pending = this._pending.get(chat);
		if (pending && pending.turnId === turnId && pending.phase === 'requested') {
			this._pending.delete(chat);
		}
	}

	async updateSessionWorkspace(chat: ProtocolURI, turnId: string | undefined): Promise<void> {
		const key = this._pendingKey(chat);
		const pending = this._pending.get(key);
		if (!pending || pending.phase === 'converting' || pending.turnId !== turnId || pending.chat.toString() !== chat) {
			return;
		}

		pending.phase = 'converting';
		let continuation: IDeferredAgentHostTurn | undefined;
		try {
			continuation = this._beginContinuation(pending);
			pending.continuationTurnId = continuation.turnId;
			if (pending.showTransition) {
				pending.transition = this._createWorkspaceTransition(pending);
			}
			pending.resolvedWorkingDirectory = pending.chatOnly
				? pending.replaceSessionWorkspace
					? await this._chatIsolationHost!.runWithChatCatalogLock(URI.parse(parseChatUri(pending.chat)!.session), () => this._convertChat(pending, continuation!))
					: await this._convertChat(pending, continuation)
				: await this._convert(pending, continuation);
			this._pending.delete(key);
			await this._continueConversion(continuation, pending, true);
		} catch (error) {
			let conversionError = error;
			if (pending.transitionPersisted && continuation) {
				try {
					await this._discardPersistedWorkspaceTransition(pending, continuation);
				} catch (discardError) {
					conversionError = new UnsafeProviderWorkingDirectoryError(`${toErrorMessage(error)}; failed to discard the workspace transition: ${toErrorMessage(discardError)}`);
				}
			}
			this._logService.error(`[SessionWorkspaceConversionService] Failed to convert ${pending.chat.toString()}: ${toErrorMessage(conversionError)}`);
			if (conversionError instanceof UnsafeProviderWorkingDirectoryError) {
				if (this._pending.get(key) === pending) {
					this._pending.delete(key);
					(pending.chatOnly ? this._quarantinedChats : this._quarantined).add(key);
				}
				this._failConversion(continuation, pending, conversionError);
			} else {
				if (this._pending.get(key) === pending) {
					this._pending.delete(key);
				}
				await this._continueConversion(continuation, pending, false, conversionError);
			}
		}
	}

	private async _convertChat(pending: IPendingSessionWorkspaceConversion, continuation: IDeferredAgentHostTurn): Promise<URI> {
		const host = this._chatIsolationHost!;
		const { chat, workspaceFolder, initiatingClientId } = pending;
		const session = URI.parse(parseChatUri(chat)!.session);
		const storage = chatStorageUri(chat)!;
		const provider = this._providerService.getProviderForSession(session)!;
		let workspaceFinalized = false;
		const assertWorkspace = (expected = pending.previousWorkingDirectory ?? workspaceFolder) => {
			const state = this._stateManager.getSessionState(session.toString());
			const summary = state?.chats.find(candidate => candidate.resource === chat.toString());
			const directories = summary?.workingDirectories ?? this._stateManager.getSessionSummary(session.toString())?.workingDirectories;
			if (!summary || state?.lifecycle !== SessionLifecycle.Ready
				|| (state.status & SessionStatus.IsArchived) === SessionStatus.IsArchived
				|| ((summary.status ?? 0) & SessionStatus.IsArchived) !== 0
				|| summary.origin?.kind === ChatOriginKind.Tool
				|| (summary.interactivity !== undefined && summary.interactivity !== ChatInteractivity.Full)
				|| (pending.isolation && readSessionWorkspaceless(state._meta)) || readSessionExternal(state._meta)
				|| (pending.isolation && !this._worktreeIsolation.supported) || !provider?.agentHostCapabilities.workspaceConversion || !provider.setChatWorkingDirectory
				|| this._providerService.getProviderForSession(session) !== provider
				|| this._pending.get(chat.toString()) !== pending || this._quarantinedChats.has(chat.toString())
				|| (!workspaceFinalized && pending.isolation && state.config?.values[SessionConfigKey.Isolation] === 'worktree'
					&& isEqual(workspaceFolder, pending.previousWorkingDirectory)
					&& directories?.[0] === this._stateManager.getSessionSummary(session.toString())?.workingDirectories?.[0])
				|| (pending.replaceSessionWorkspace ? !hasSingleUserChat(state.chats) : !provider.getDescriptor().capabilities?.multipleWorkingDirectories)
				|| directories?.length !== 1 || !isEqual(URI.parse(directories[0]), expected)
				|| this._stateManager.getActiveTurnId(chat.toString()) !== continuation.turnId) {
				throw new Error(localize('agentHost.chatWorkspaceChanged', "The chat changed while preparing its new workspace."));
			}
		};
		const trustRequired = this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) !== true
			&& (this._configurationService.getEffectiveValue(session.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default') !== 'autoApprove';
		assertWorkspace();
		await this._requireWorkspaceTrust(trustRequired, initiatingClientId, workspaceFolder);
		assertWorkspace();
		if (!pending.replaceSessionWorkspace) {
			// A provider can only keep a sibling in its current folder once it has restored that chat. Subagent chats never hold a folder of their own.
			const siblings = (this._stateManager.getSessionState(session.toString())?.chats ?? [])
				.filter(sibling => sibling.resource !== chat.toString() && sibling.origin?.kind !== ChatOriginKind.Tool);
			let restored: Awaited<ReturnType<AgentHostStateManager['resolveChatState']>>[] | undefined;
			try {
				restored = await raceTimeout(Promise.all(siblings.map(sibling => this._stateManager.resolveChatState(sibling.resource))), SIBLING_RESTORE_TIMEOUT_MS);
			} catch (error) {
				throw new Error(localize('agentHost.chatWorkspaceSiblingRestoreFailed', "The workspace cannot be changed because another chat in this session could not be restored: {0}", toErrorMessage(error)));
			}
			if (!restored || restored.some(state => !state)) {
				throw new Error(localize('agentHost.chatWorkspaceSiblingUnavailable', "The workspace cannot be changed because another chat in this session could not be restored."));
			}
			assertWorkspace();
		}
		const database = this._sessionDataService.openDatabase(storage);
		let providerChanged = false;
		let prepared: Awaited<ReturnType<IChatIsolationHost['prepareChatWorkingDirectory']>> | undefined;
		let workspace: IResolvedWorkspace | undefined;
		let workspaceMetadata: Readonly<Record<string, string>> | undefined;
		try {
			if (pending.replaceSessionWorkspace) {
				const sessionDirectory = this._stateManager.getSessionSummary(session.toString())?.workingDirectories?.[0];
				if (pending.isolation && pending.previousWorkingDirectory && sessionDirectory && isEqual(pending.previousWorkingDirectory, URI.parse(sessionDirectory))
					&& this._stateManager.getSessionState(session.toString())?.config?.values[SessionConfigKey.Isolation] === 'worktree') {
					// The session's current worktree is kept on disk; the new worktree takes over the session's worktree ownership.
					await this._worktreeIsolation.retainSessionWorktree(session, AgentSession.id(session));
					assertWorkspace();
				}
				workspace = await this._resolveWorkspace(session, chat, workspaceFolder, pending.isolation, trustRequired, initiatingClientId, pending.prompt, this._stateManager.getSessionState(session.toString())?.config?.values);
				if (!pending.isolation) {
					const externalWorktree = await this._worktreeIsolation.resolveExternalWorktreeProject(workspaceFolder);
					workspace = { ...workspace, project: externalWorktree?.project ?? { uri: workspaceFolder, displayName: basename(workspaceFolder) } };
					workspaceMetadata = externalWorktree?.metadata;
				}
				prepared = {
					directory: workspace.workingDirectory,
					release: async () => {
						if (!pending.isolation) {
							return;
						}
						const error = await this._removeWorktree(session);
						if (error) {
							throw error;
						}
					},
				};
			} else {
				prepared = await host.prepareChatWorkingDirectory(session, workspaceFolder, { isolation: pending.isolation ? 'worktree' : 'folder', forceNewWorktree: pending.isolation, prompt: pending.prompt ?? '' });
				if (pending.isolation) {
					await this._requireWorkspaceTrust(trustRequired, initiatingClientId, prepared.directory, workspaceFolder);
				}
			}
			assertWorkspace();
			await database.object.setMetadata(CHAT_ISOLATION_QUARANTINED_KEY, 'true');
			assertWorkspace();
			const sessionDirectoriesBeforeProviderMove = this._stateManager.getSessionSummary(session.toString())?.workingDirectories;
			const context = { configurationResource: session, resource: storage };
			if (pending.replaceSessionWorkspace) {
				await provider.setChatWorkingDirectory!(chat, context, prepared.directory, { replaceSessionWorkspace: true });
			} else {
				await provider.setChatWorkingDirectory!(chat, context, prepared.directory);
			}
			providerChanged = true;
			assertWorkspace();
			if (!pending.isolation && pending.replaceSessionWorkspace) {
				await this._worktreeIsolation.retainSessionWorktree(session, AgentSession.id(session));
				assertWorkspace();
			}
			if (workspace?.branchName) {
				this._stateManager.setSessionMeta(session.toString(), this._gitStateService.getMaterializedWorktreeMeta(session.toString(), workspace.branchName));
			}
			await host.setChatWorkingDirectory(session, chat, prepared.directory, pending.replaceSessionWorkspace === true, sessionDirectoriesBeforeProviderMove);
			assertWorkspace(prepared.directory);
			let configValues: Record<string, unknown> | undefined;
			while (true) {
				const currentValues = this._stateManager.getSessionState(session.toString())?.config?.values;
				if (workspace) {
					configValues = { ...currentValues, [SessionConfigKey.Isolation]: workspace.configValues[SessionConfigKey.Isolation] };
					if (pending.isolation) {
						configValues[SessionConfigKey.Branch] = workspace.configValues[SessionConfigKey.Branch];
					} else {
						delete configValues[SessionConfigKey.Branch];
					}
				}
				const metadata = {
					[CHAT_ISOLATION_DIRECTORY_KEY]: pending.isolation ? prepared.directory.toString() : '',
					[CHAT_ISOLATION_QUARANTINED_KEY]: 'false',
					...(configValues ? { configValues: JSON.stringify(configValues) } : {}),
					...workspaceMetadata,
					...(!pending.isolation && pending.replaceSessionWorkspace ? { [AH_META_WORKSPACELESS_DB_KEY]: 'false' } : {}),
				};
				if (pending.transition) {
					await database.object.setWorkspaceConversion(continuation.turnId, serializeAgentWorkspaceTransition(pending.transition), metadata);
					pending.transitionPersisted = true;
				} else {
					await database.object.setMetadataValues(metadata);
				}
				assertWorkspace(prepared.directory);
				if (!workspace || equals(currentValues, this._stateManager.getSessionState(session.toString())?.config?.values)) {
					break;
				}
			}
			workspaceFinalized = true;
			if (workspace) {
				if (workspace.project) {
					this._stateManager.setSessionProject(session.toString(), { uri: workspace.project.uri.toString(), displayName: workspace.project.displayName });
				}
				this._updateIsolationConfig(session, this._stateManager.getSessionState(session.toString())?.config, configValues!, workspace.isolationConfig, pending.isolation);
				if (!pending.isolation) {
					this._stateManager.setSessionMeta(session.toString(), withSessionWorkspaceless(this._stateManager.getSessionState(session.toString())?._meta, false));
				}
			}
			if (pending.isolation) {
				this._isolatedChats.add(chat.toString());
			} else {
				this._isolatedChats.delete(chat.toString());
			}
			if (isDefaultChatUri(chat)) {
				this._stateManager.setSessionMeta(session.toString(), withSessionHasWorkspaceTransitions(this._stateManager.getSessionState(session.toString())?._meta, true));
			}
			this._serverToolHost.advertise(session.toString());
			if (pending.replaceSessionWorkspace) {
				try {
					const customizations = await provider.getChatCustomizations(chat, session);
					if (this._pending.get(chat.toString()) === pending) {
						this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...customizations] });
					}
				} catch (error) {
					this._logService.error(`[SessionWorkspaceConversionService] Failed to refresh customizations for ${session.toString()}: ${toErrorMessage(error)}`);
				}
			}
			assertWorkspace(prepared.directory);
			return prepared.directory;
		} catch (error) {
			if (this._pending.get(chat.toString()) !== pending) {
				if (!providerChanged) {
					await prepared?.release();
				}
				throw error;
			}
			if (providerChanged || error instanceof AgentWorkingDirectoryChangedError) {
				try {
					await database.object.setMetadata(CHAT_ISOLATION_QUARANTINED_KEY, 'true');
				} catch (persistenceError) {
					throw new UnsafeProviderWorkingDirectoryError(localize('agentHost.chatWorkspaceFinalizeAndQuarantineFailed', "The workspace change could not be finalized: {0}; failed to persist quarantine: {1}", toErrorMessage(error), toErrorMessage(persistenceError)));
				}
				throw new UnsafeProviderWorkingDirectoryError(localize('agentHost.chatWorkspaceFinalizeFailed', "The workspace change could not be finalized: {0}", toErrorMessage(error)));
			}
			try {
				await database.object.deleteMetadata([CHAT_ISOLATION_QUARANTINED_KEY]);
			} catch (persistenceError) {
				throw new UnsafeProviderWorkingDirectoryError(localize('agentHost.chatWorkspaceAndQuarantineFailed', "Changing the chat's workspace failed: {0}; failed to clear quarantine: {1}", toErrorMessage(error), toErrorMessage(persistenceError)));
			}
			await prepared?.release();
			throw error;
		} finally {
			database.dispose();
		}
	}

	private async _convert(pending: IPendingSessionWorkspaceConversion, continuation: IDeferredAgentHostTurn): Promise<URI> {
		const { chat, workspaceFolder, isolation, initiatingClientId, prompt, transition } = pending;
		const { session, state, previousWorkingDirectory } = this._validateConversion(chat, workspaceFolder);
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.agentHostCapabilities.workspaceConversion) {
			throw new Error(`Provider does not support changing the working directory: ${AgentSession.provider(session) ?? '(unknown)'}`);
		}
		const sessionKey = session.toString();
		const workspaceTrustRequired = this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) !== true
			&& (this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default') !== 'autoApprove';
		await this._requireWorkspaceTrust(workspaceTrustRequired, initiatingClientId, workspaceFolder);
		const resolvedWorkspace = await this._resolveWorkspace(session, chat, workspaceFolder, isolation, workspaceTrustRequired, initiatingClientId, prompt, state.config?.values);
		let authoritativeWorkingDirectory = resolvedWorkspace.workingDirectory;
		let providerAlignmentError: AgentWorkingDirectoryChangedError | undefined;
		try {
			await provider.setWorkingDirectory(chat, session, resolvedWorkspace.workingDirectory);
		} catch (error) {
			if (!(error instanceof AgentWorkingDirectoryChangedError)) {
				const cleanupError = resolvedWorkspace.isolated ? await this._removeWorktree(session) : undefined;
				if (cleanupError) {
					throw new Error(`${toErrorMessage(error)}; failed to clean up the isolated worktree: ${toErrorMessage(cleanupError)}`);
				}
				throw error;
			}
			authoritativeWorkingDirectory = error.workingDirectory;
			providerAlignmentError = error;
		}
		if (!isEqual(authoritativeWorkingDirectory, resolvedWorkspace.workingDirectory)) {
			try {
				await this._requireWorkspaceTrust(workspaceTrustRequired, initiatingClientId, authoritativeWorkingDirectory);
			} catch (error) {
				const finalizationErrors = [error];
				const disposal = await this._disposeUnsafeProviderChat(provider, chat, session);
				finalizationErrors.push(...disposal.errors);
				if (resolvedWorkspace.isolated) {
					const cleanupError = await this._removeWorktree(session);
					if (cleanupError) {
						finalizationErrors.push(cleanupError);
					}
				}
				throw new UnsafeProviderWorkingDirectoryError(`The provider changed to an untrusted working directory and was disposed: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}`);
			}
		}

		const convertedState = this._getUnchangedConversionState(session, chat, previousWorkingDirectory);
		if (!convertedState) {
			const disposal = await this._disposeUnsafeProviderChat(provider, chat, session);
			const finalizationErrors = [...disposal.errors];
			if (resolvedWorkspace.isolated) {
				const cleanupError = await this._removeWorktree(session);
				if (cleanupError) {
					finalizationErrors.push(cleanupError);
				}
			}
			throw new UnsafeProviderWorkingDirectoryError(`The workspace-less session state changed after the provider working directory changed, so the provider was disposed${finalizationErrors.length > 0 ? `: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}` : ''}`);
		}
		const worktreeApplied = resolvedWorkspace.isolated && isEqual(authoritativeWorkingDirectory, resolvedWorkspace.workingDirectory);
		const worktreeCleanupError = resolvedWorkspace.isolated && !worktreeApplied ? await this._removeWorktree(session) : undefined;
		const configPatch: Record<string, unknown> = worktreeApplied
			? {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: resolvedWorkspace.configValues[SessionConfigKey.Branch],
			}
			: { [SessionConfigKey.Isolation]: 'folder' };
		const configValues = convertedState.config || worktreeApplied
			? { ...convertedState.config?.values, ...configPatch }
			: undefined;
		let project = worktreeApplied ? resolvedWorkspace.project : undefined;
		let externalWorktreeMetadata: Readonly<Record<string, string>> | undefined;
		if (!worktreeApplied && this._worktreeIsolation.supported) {
			try {
				const externalWorktree = await this._worktreeIsolation.resolveExternalWorktreeProject(authoritativeWorkingDirectory);
				project = externalWorktree?.project;
				externalWorktreeMetadata = externalWorktree?.metadata;
			} catch (error) {
				this._logService.warn(`[SessionWorkspaceConversionService] Failed to resolve external worktree project for ${session.toString()}: ${toErrorMessage(error)}`);
			}
		}
		let persistenceError: unknown;
		const persistTransition = !!transition && this._stateManager.getActiveTurnId(chat.toString()) === continuation.turnId;
		const database = this._sessionDataService.openDatabase(session);
		try {
			const metadata = {
				[AH_META_WORKSPACELESS_DB_KEY]: 'false',
				...externalWorktreeMetadata,
			};
			if (configValues) {
				Object.assign(metadata, { configValues: JSON.stringify(configValues) });
			}
			if (persistTransition && transition) {
				await database.object.setWorkspaceConversion(continuation.turnId, serializeAgentWorkspaceTransition(transition), metadata);
				pending.transitionPersisted = true;
			} else {
				await database.object.setMetadataValues(metadata);
			}
		} catch (error) {
			persistenceError = error;
		} finally {
			database.dispose();
		}
		if (persistenceError) {
			const finalizationErrors = [persistenceError];
			const quarantineError = await this._persistQuarantine(session);
			if (quarantineError) {
				finalizationErrors.push(quarantineError);
			}
			throw new UnsafeProviderWorkingDirectoryError(`The provider working directory changed, but the converted session metadata could not be committed atomically: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}`);
		}

		const finalState = this._getUnchangedConversionState(session, chat, previousWorkingDirectory, convertedState);
		if (!finalState) {
			const disposal = await this._disposeUnsafeProviderChat(provider, chat, session);
			const finalizationErrors = [...disposal.errors];
			if (resolvedWorkspace.isolated) {
				const cleanupError = await this._removeWorktree(session);
				if (cleanupError) {
					finalizationErrors.push(cleanupError);
				}
			}
			throw new UnsafeProviderWorkingDirectoryError(`The workspace-less session state changed while converted metadata was being persisted, so the provider was disposed and the session was quarantined${finalizationErrors.length > 0 ? `: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}` : ''}`);
		}

		if (project) {
			this._stateManager.setSessionProject(session.toString(), {
				uri: project.uri.toString(),
				displayName: project.displayName,
			});
		}
		const workspaceMeta = worktreeApplied && resolvedWorkspace.branchName
			? this._gitStateService.getMaterializedWorktreeMeta(session.toString(), resolvedWorkspace.branchName)
			: finalState._meta;
		this._stateManager.setSessionMeta(
			session.toString(),
			withSessionHasWorkspaceTransitions(withSessionWorkspaceless(workspaceMeta, false), persistTransition),
		);
		this._stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: previousWorkingDirectory,
			replacement: authoritativeWorkingDirectory.toString(),
		});
		this._updateIsolationConfig(session, finalState.config, configValues ?? configPatch, resolvedWorkspace.isolationConfig, worktreeApplied);
		this._serverToolHost.advertise(session.toString());
		try {
			const customizations = await provider.getChatCustomizations(chat, session);
			this._stateManager.dispatchServerAction(session.toString(), {
				type: ActionType.SessionCustomizationsChanged,
				customizations: [...customizations],
			});
		} catch (error) {
			this._logService.error(`[SessionWorkspaceConversionService] Failed to refresh customizations for ${session.toString()}: ${toErrorMessage(error)}`);
		}
		const finalizationErrors: unknown[] = [];
		if (providerAlignmentError) {
			finalizationErrors.push(providerAlignmentError);
		}
		if (worktreeCleanupError) {
			finalizationErrors.push(worktreeCleanupError);
		}
		if (finalizationErrors.length > 0) {
			throw new Error(`The workspace changed to '${authoritativeWorkingDirectory.fsPath}', but conversion did not complete cleanly: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}`);
		}
		return authoritativeWorkingDirectory;
	}

	private async _requireWorkspaceTrust(required: boolean, clientId: string, workspace: URI, trustedParent?: URI): Promise<void> {
		if (!required) {
			return;
		}
		const trusted = await this._clientConnections.requestWorkspaceTrust(clientId, {
			workspace: workspace.toString(),
			...(trustedParent ? { trustedParent: trustedParent.toString() } : {}),
		});
		if (!trusted) {
			throw new Error(`Workspace trust was not granted for '${workspace.fsPath}'`);
		}
	}

	private async _persistQuarantine(session: URI): Promise<unknown | undefined> {
		const database = this._sessionDataService.openDatabase(session);
		try {
			await database.object.setMetadata(AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, 'true');
			return undefined;
		} catch (error) {
			return error;
		} finally {
			database.dispose();
		}
	}

	private async _disposeUnsafeProviderChat(provider: IAgent, chat: URI, session: URI): Promise<{ readonly errors: readonly unknown[] }> {
		const errors: unknown[] = [];
		const quarantineError = await this._persistQuarantine(session);
		if (quarantineError) {
			errors.push(quarantineError);
		}
		try {
			await provider.chats.releaseChat(chat, session);
		} catch (error) {
			errors.push(error);
		}
		try {
			await provider.chats.disposeChat(chat, session);
		} catch (error) {
			errors.push(error);
		}
		return { errors };
	}

	private async _resolveWorkspace(
		session: URI,
		chat: URI,
		workspaceFolder: URI,
		isolation: boolean,
		workspaceTrustRequired: boolean,
		initiatingClientId: string,
		prompt: string | undefined,
		currentConfig: Record<string, unknown> | undefined,
	): Promise<IResolvedWorkspace> {
		if (!isolation) {
			const configValues: Record<string, unknown> = { ...currentConfig, [SessionConfigKey.Isolation]: 'folder' };
			delete configValues[SessionConfigKey.Branch];
			return {
				workingDirectory: workspaceFolder,
				configValues,
				isolationConfig: undefined,
				isolated: false,
				project: undefined,
			};
		}
		if (!this._worktreeIsolation.supported) {
			throw new Error('Isolated worktrees are not supported by this Agent Host.');
		}

		const requestedConfig: Record<string, unknown> = { ...currentConfig, [SessionConfigKey.Isolation]: 'worktree' };
		delete requestedConfig[SessionConfigKey.Branch];
		const isolationConfig = await this._worktreeIsolation.resolveIsolationConfig({
			workingDirectory: workspaceFolder,
			config: requestedConfig,
		});
		if (!isolationConfig || isolationConfig.isolationValue !== 'worktree' || !isolationConfig.branchValue) {
			throw new Error('An isolated worktree requires a local Git repository with at least one commit.');
		}
		const configValues = {
			...requestedConfig,
			[SessionConfigKey.Branch]: isolationConfig.branchValue,
		};
		const workingDirectory = await this._worktreeIsolation.resolveForWorkspaceConversion({
			sessionUri: session,
			sessionId: AgentSession.id(session),
			workingDirectory: workspaceFolder,
			config: configValues,
			prompt,
			onWillCreate: async metadata => {
				if (!isEqual(metadata.repositoryRoot, workspaceFolder)) {
					await this._requireWorkspaceTrust(workspaceTrustRequired, initiatingClientId, metadata.repositoryRoot);
				}
				await this._requireWorkspaceTrust(workspaceTrustRequired, initiatingClientId, metadata.worktreePath, metadata.repositoryRoot);
			},
		});
		if (!workingDirectory || isEqual(workingDirectory, workspaceFolder)) {
			throw new Error('The isolated worktree could not be created.');
		}
		this._worktreeIsolation.takePendingAnnouncement(AgentSession.id(session));
		const worktreeInfo = this._worktreeIsolation.sessionWorktreeInfo(AgentSession.id(session));
		if (!worktreeInfo) {
			const cleanupError = await this._removeWorktree(session);
			throw new Error(cleanupError
				? `The isolated worktree project could not be resolved, and cleanup failed: ${toErrorMessage(cleanupError)}`
				: 'The isolated worktree project could not be resolved.');
		}
		return { workingDirectory, configValues, isolationConfig, isolated: true, project: worktreeInfo.project, branchName: worktreeInfo.branchName };
	}

	private async _removeWorktree(session: URI): Promise<unknown | undefined> {
		const sessionId = AgentSession.id(session);
		try {
			const worktree = await this._worktreeIsolation.prepareSessionDeletion(session, sessionId);
			await this._worktreeIsolation.discardSessionWorktree(session, sessionId, worktree, {
				preserveWorkingDirectory: !readSessionWorkspaceless(this._stateManager.getSessionState(session.toString())?._meta),
			});
			return undefined;
		} catch (error) {
			return error;
		}
	}

	private _updateIsolationConfig(
		session: URI,
		currentConfig: SessionConfigState | undefined,
		configPatch: Record<string, unknown>,
		isolationConfig: IIsolationConfigContribution | undefined,
		worktreeApplied: boolean,
	): void {
		if (worktreeApplied && isolationConfig) {
			const properties = {
				...currentConfig?.schema.properties,
				[SessionConfigKey.Isolation]: isolationConfig.isolationProperty.protocol,
				...(isolationConfig.branchProperty ? { [SessionConfigKey.Branch]: isolationConfig.branchProperty.protocol } : {}),
				...(isolationConfig.worktreeBranchPrefixProperty ? { [SessionConfigKey.WorktreeBranchPrefix]: isolationConfig.worktreeBranchPrefixProperty.protocol } : {}),
				...(isolationConfig.worktreeBranchTrackProperty ? { [SessionConfigKey.WorktreeBranchTrack]: isolationConfig.worktreeBranchTrackProperty.protocol } : {}),
				...(isolationConfig.worktreeCreateNewBranchProperty ? { [SessionConfigKey.WorktreeCreateNewBranch]: isolationConfig.worktreeCreateNewBranchProperty.protocol } : {}),
				...(isolationConfig.worktreeIncludeFilesProperty ? { [SessionConfigKey.WorktreeIncludeFiles]: isolationConfig.worktreeIncludeFilesProperty.protocol } : {}),
				...(isolationConfig.worktreeSymlinkFoldersProperty ? { [SessionConfigKey.WorktreeSymlinkFolders]: isolationConfig.worktreeSymlinkFoldersProperty.protocol } : {}),
			};
			this._stateManager.setSessionConfig(session.toString(), {
				schema: { type: 'object', properties },
				values: { ...currentConfig?.values },
			});
		}
		if (this._stateManager.getSessionState(session.toString())?.config) {
			this._stateManager.dispatchServerAction(session.toString(), {
				type: ActionType.SessionConfigChanged,
				config: configPatch,
				replace: true,
			});
		}
	}

	private _getUnchangedConversionState(session: URI, chat: URI, previousWorkingDirectory: ProtocolURI, expectedState?: ISessionWithDefaultChat): ISessionWithDefaultChat | undefined {
		const state = this._stateManager.getSessionState(session.toString());
		if (!state
			|| this._pending.get(chat.toString())?.phase !== 'converting'
			|| !readSessionWorkspaceless(state._meta)
			|| (state.status & SessionStatus.IsArchived) === SessionStatus.IsArchived
			|| state.defaultChat !== chat.toString()
			|| state.workingDirectories?.length !== 1
			|| state.workingDirectories[0] !== previousWorkingDirectory
			|| (expectedState && (!equals(state._meta, expectedState._meta) || !equals(state.config, expectedState.config) || !equals(state.project, expectedState.project)))
		) {
			return undefined;
		}
		return state;
	}

	private _validateConversion(chat: URI, workspaceFolder: URI) {
		const parsedChat = parseChatUri(chat);
		if (!parsedChat) {
			throw new Error(`Cannot change the working directory for invalid chat resource: ${chat.toString()}`);
		}
		if (workspaceFolder.scheme !== Schemas.file || !workspaceFolder.path.startsWith('/')) {
			throw new Error('The workspace folder must be an absolute local path or file URI.');
		}
		const session = URI.parse(parsedChat.session, true);
		const state = this._stateManager.getSessionState(session.toString());
		if (!state) {
			throw new Error(`Cannot change the working directory for unknown session: ${session.toString()}`);
		}
		if (!readSessionWorkspaceless(state._meta)) {
			throw new Error('Only a workspace-less session can be converted to a workspace session.');
		}
		if ((state.status & SessionStatus.IsArchived) === SessionStatus.IsArchived) {
			throw new Error('An archived session cannot be converted to a workspace session.');
		}
		if (!isDefaultChatUri(chat) || state.defaultChat !== chat.toString()) {
			throw new Error('Only the owning default chat can convert the session to a workspace session.');
		}
		if (state.workingDirectories?.length !== 1) {
			throw new Error('A workspace-less session must have exactly one working directory before conversion.');
		}
		return { session, state, previousWorkingDirectory: state.workingDirectories[0] };
	}

	private _beginContinuation(pending: IPendingSessionWorkspaceConversion): IDeferredAgentHostTurn {
		const continuation = this._turnService.beginDeferredTurnMessage(pending.chat, withMessageRequestHiddenFromTranscript(withMessageSystemInitiatedLabel({
			text: pending.chatOnly && pending.isolation
				? localize('agentHost.continueIsolatedMessage', "Continue the task in the worktree.")
				: localize('agentHost.continueInWorkspaceMessage', "Continue in the requested workspace."),
			origin: { kind: MessageKind.SystemNotification },
			_meta: toAgentWorkspaceContinuationMessageMeta(),
		}, pending.chatOnly && pending.isolation
			? localize('agentHost.continueIsolatedLabel', "Continue in Worktree")
			: localize('agentHost.continueInWorkspaceLabel', "Continue in Requested Workspace")), true));
		return continuation;
	}

	private _createWorkspaceTransition(pending: IPendingSessionWorkspaceConversion): IAgentWorkspaceTransitionRecord {
		const workspaceName = basename(pending.workspaceFolder) || pending.workspaceFolder.path;
		return {
			content: pending.isolation
				? localize('agentHost.chatIsolationTransitionLabel', "Workspace changed to a new worktree of {0}", workspaceName)
				: localize('agentHost.workspaceTransitionLabel', "Workspace changed to {0}", workspaceName),
			workspaceKind: pending.isolation ? AgentSystemNotificationWorkspaceKind.Worktree : AgentSystemNotificationWorkspaceKind.Folder,
			workspaceName,
		};
	}

	private async _continueConversion(continuation: IDeferredAgentHostTurn | undefined, pending: IPendingSessionWorkspaceConversion, converted: boolean, error?: unknown): Promise<void> {
		if (!continuation) {
			this._logService.error(`[SessionWorkspaceConversionService] Cannot continue workspace conversion for ${pending.chat.toString()} because its deferred turn did not start.`);
			return;
		}
		const errorMessage = error === undefined ? undefined : toErrorMessage(error).replace(/\.+$/, '');
		const text = converted
			? pending.chatOnly
				? pending.isolation
					? `Only this chat now uses the worktree at ${pending.resolvedWorkingDirectory!.fsPath}. Other chats and their folders are unchanged. The session workspace includes this worktree. Continue the user's original task here without requesting another worktree.`
					: `Only this chat now uses the workspace at ${pending.resolvedWorkingDirectory!.fsPath}. Other chats and their folders are unchanged. Continue the user's original task here. Do not change this workspace again unless the user explicitly asks.`
				: `The current session is now attached to ${(pending.resolvedWorkingDirectory ?? pending.workspaceFolder).fsPath}${pending.isolation ? ' in an isolated worktree' : ''}. Continue the user's original task in this workspace. Do not request another session or workspace conversion.`
			: `The requested workspace setup did not complete successfully: ${errorMessage}. Do not run the user's task. Tell the user that workspace setup failed and include this error.`;
		const label = converted
			? localize('agentHost.workspaceSetLabel', "Workspace Set")
			: localize('agentHost.workspaceSetupFailedLabel', "Workspace Setup Failed");
		if (converted && pending.transitionPersisted && pending.transition) {
			this._publishConversionOutcome(
				pending.chat,
				continuation,
				pending.transition.content,
				{
					kind: AgentSystemNotificationKind.WorkspaceTransition,
					workspaceKind: pending.transition.workspaceKind,
					workspaceName: pending.transition.workspaceName,
				},
			);
		} else if (!converted || pending.showTransition) {
			this._publishConversionOutcome(pending.chat, continuation, label);
		}
		try {
			if (!this._turnService.continueDeferredTurnMessage(pending.chat, continuation, withMessageSystemInitiatedLabel({
				text,
				origin: { kind: MessageKind.SystemNotification },
			}, label))) {
				await this._discardPersistedWorkspaceTransition(pending, continuation);
				this._logService.info(`[SessionWorkspaceConversionService] The deferred workspace conversion turn for ${pending.chat.toString()} ended before it could continue.`);
			}
		} catch (continuationError) {
			let failure = continuationError;
			try {
				await this._discardPersistedWorkspaceTransition(pending, continuation);
			} catch (discardError) {
				failure = new Error(`${toErrorMessage(continuationError)}; failed to discard the workspace transition: ${toErrorMessage(discardError)}`);
			}
			this._logService.error(`[SessionWorkspaceConversionService] Failed to start the conversion continuation for ${pending.chat.toString()}: ${toErrorMessage(failure)}`);
			this._failConversion(continuation, pending, failure instanceof Error ? failure : new Error(toErrorMessage(failure)), false);
		}
	}

	private async _discardPersistedWorkspaceTransition(pending: IPendingSessionWorkspaceConversion, continuation: IDeferredAgentHostTurn): Promise<void> {
		if (!pending.transitionPersisted) {
			return;
		}
		await this._discardWorkspaceTransition(pending.chat, continuation.turnId);
		pending.transitionPersisted = false;
	}

	private async _discardWorkspaceTransition(chat: URI, turnId: string): Promise<void> {
		const storage = chatStorageUri(chat);
		if (!storage) {
			throw new Error(`Cannot discard workspace transition for invalid chat resource: ${chat.toString()}`);
		}
		const database = this._sessionDataService.openDatabase(storage);
		try {
			await database.object.deleteTurnWorkspaceTransition(turnId);
			const hasTransitions = await database.object.getMetadata(AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY) === 'true';
			const session = parseChatUri(chat)?.session;
			if (session && isDefaultChatUri(chat)) {
				const state = this._stateManager.getSessionState(session);
				this._stateManager.setSessionMeta(session, withSessionHasWorkspaceTransitions(state?._meta, hasTransitions));
			}
		} finally {
			database.dispose();
		}
	}

	private _failConversion(continuation: IDeferredAgentHostTurn | undefined, pending: IPendingSessionWorkspaceConversion, error: Error, publishOutcome = true): void {
		if (!continuation) {
			this._logService.error(`[SessionWorkspaceConversionService] Cannot report workspace conversion failure for ${pending.chat.toString()} because its deferred turn did not start.`);
			return;
		}
		if (publishOutcome) {
			this._publishConversionOutcome(pending.chat, continuation, localize('agentHost.workspaceSetupFailedLabel', "Workspace Setup Failed"));
		}
		if (!this._turnService.failDeferredTurnMessage(pending.chat, continuation, {
			errorType: 'workspaceConversionFailed',
			message: toErrorMessage(error),
		})) {
			this._logService.info(`[SessionWorkspaceConversionService] The deferred workspace conversion turn for ${pending.chat.toString()} ended before its failure could be reported.`);
		}
	}

	private _publishConversionOutcome(chat: URI, continuation: IDeferredAgentHostTurn, label: string, meta?: IAgentSystemNotificationMeta): void {
		if (this._stateManager.getActiveTurnId(chat.toString()) !== continuation.turnId) {
			return;
		}
		this._stateManager.dispatchServerAction(chat.toString(), {
			type: ActionType.ChatResponsePart,
			turnId: continuation.turnId,
			part: {
				kind: ResponsePartKind.SystemNotification,
				content: label,
				...(meta ? { _meta: toAgentSystemNotificationMeta(meta) } : {}),
			},
		});
	}

	override dispose(): void {
		this._pending.clear();
		this._quarantined.clear();
		this._quarantinedChats.clear();
		this._restoringChats.clear();
		this._isolatedChats.clear();
		super.dispose();
	}
}
