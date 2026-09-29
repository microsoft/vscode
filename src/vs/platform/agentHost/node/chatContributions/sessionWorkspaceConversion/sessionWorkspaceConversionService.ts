/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
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
import { AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY, AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, buildDefaultChatUri, chatStorageUri, isDefaultChatUri, isSubagentSession, MessageKind, parseChatUri, parseSubagentSessionUri, readSessionExternal, readSessionWorkspaceless, ResponsePartKind, SessionLifecycle, SessionStatus, withMessageRequestHiddenFromTranscript, withMessageSystemInitiatedLabel, withSessionHasWorkspaceTransitions, withSessionWorkspaceless, type ISessionWithDefaultChat, type SessionConfigState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
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
	setChatWorkingDirectory(session: URI, chat: URI, directory: URI): Promise<void>;
}

interface IPendingSessionWorkspaceConversion {
	readonly chat: URI;
	readonly turnId: string;
	readonly convertFolder?: boolean;
	readonly chatOnly?: boolean;
	readonly workspaceFolder: URI;
	readonly isolation: boolean;
	readonly initiatingClientId: string;
	readonly prompt: string | undefined;
	readonly showTransition: boolean;
	phase: 'requested' | 'waiting' | 'converting';
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

class UnsafeProviderWorkingDirectoryError extends Error {
}

export const ISessionWorkspaceConversionService = createDecorator<ISessionWorkspaceConversionService>('sessionWorkspaceConversionService');

/** Coordinates requested workspace changes after the requesting turn has finished. */
export interface ISessionWorkspaceConversionService {
	readonly _serviceBrand: undefined;
	readonly onDidChangePendingSession: Event<ProtocolURI>;
	canIsolateSession(session: URI): boolean;
	canIsolateChat(chat: URI): boolean;
	requestChatIsolation(chat: URI, turnId: string, initiatingClientId: string): void;
	restoreChatIsolation(chat: ProtocolURI): Promise<void>;
	requestSessionIsolation(chat: URI, turnId: string, initiatingClientId: string): void;
	requestSessionWorkspaceUpdate(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean, initiatingClientId: string): void;
	isPending(chat: ProtocolURI, sessionWide?: boolean): boolean;
	cancel(chat: ProtocolURI, turnId: string | undefined): void;
	updateSessionWorkspace(chat: ProtocolURI, turnId: string | undefined): Promise<void>;
}

/** Changes session workspaces in place while preserving session and chat identities. */
export class SessionWorkspaceConversionService extends Disposable implements ISessionWorkspaceConversionService {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, IPendingSessionWorkspaceConversion>();
	private readonly _quarantined = new Set<string>();
	private readonly _quarantinedChats = new Set<string>();
	private readonly _isolatedChats = new Set<string>();
	private readonly _onDidChangePendingSession = this._register(new Emitter<ProtocolURI>());
	readonly onDidChangePendingSession = this._onDidChangePendingSession.event;

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
		this._register(this._stateManager.onDidRemoveSession(session => {
			const chat = buildDefaultChatUri(session);
			this._pending.delete(chat);
			this._quarantined.delete(chat);
			for (const key of new Set([...this._pending.keys(), ...this._quarantinedChats, ...this._isolatedChats])) {
				if (parseChatUri(key)?.session === session) {
					this._pending.delete(key);
					this._quarantinedChats.delete(key);
					this._isolatedChats.delete(key);
				}
			}
		}));
	}

	canIsolateChat(chat: URI): boolean {
		const parsed = parseChatUri(chat);
		const state = parsed && this._stateManager.getSessionState(parsed.session);
		const summary = state?.chats.find(candidate => candidate.resource === chat.toString());
		const directories = summary?.workingDirectories ?? state?.workingDirectories;
		const provider = parsed && this._providerService.getProviderForSession(URI.parse(parsed.session));
		return !!this._chatIsolationHost && !!parsed && !isSubagentSession(parsed.session) && !!summary
			&& state?.lifecycle === SessionLifecycle.Ready
			&& !readSessionWorkspaceless(state._meta) && !readSessionExternal(state._meta)
			&& (state.status & SessionStatus.IsArchived) !== SessionStatus.IsArchived
			&& directories?.length === 1 && URI.parse(directories[0]).scheme === Schemas.file
			&& !(state.config?.values[SessionConfigKey.Isolation] === 'worktree' && directories[0] === state.workingDirectories?.[0])
			&& this._worktreeIsolation.supported && provider?.agentHostCapabilities.workspaceConversion === true
			&& !!provider.setChatWorkingDirectory
			&& !!provider.getDescriptor().capabilities?.multipleWorkingDirectories
			&& !this._isolatedChats.has(chat.toString()) && !this.isPending(chat.toString());
	}

	requestChatIsolation(chat: URI, turnId: string, initiatingClientId: string): void {
		if (!initiatingClientId || this._stateManager.getActiveTurnId(chat.toString()) !== turnId) {
			throw new Error('Chat isolation requires an active turn initiated by a connected client.');
		}
		if (!this.canIsolateChat(chat)) {
			throw new Error('This chat cannot be isolated. It must work in one local folder and must not already be isolated or changing workspace.');
		}
		const state = this._stateManager.getSessionState(parseChatUri(chat)!.session)!;
		const summary = state.chats.find(candidate => candidate.resource === chat.toString())!;
		this._pending.set(chat.toString(), {
			chat, turnId, convertFolder: true, chatOnly: true,
			workspaceFolder: URI.parse((summary.workingDirectories ?? state.workingDirectories)![0]),
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
		this._quarantinedChats.add(chat);
		const database = await this._sessionDataService.tryOpenDatabase(storage);
		try {
			if (await database?.object.getMetadata(CHAT_ISOLATION_DIRECTORY_KEY)) {
				this._isolatedChats.add(chat);
			}
			if (await database?.object.getMetadata(CHAT_ISOLATION_QUARANTINED_KEY) !== 'true') {
				this._quarantinedChats.delete(chat);
			}
		} finally {
			database?.dispose();
		}
	}

	requestSessionWorkspaceUpdate(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean, initiatingClientId: string): void {
		if (!initiatingClientId) {
			throw new Error('Session workspace conversion requires an initiating client.');
		}
		this._validateConversion(chat, workspaceFolder);
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
		this._pending.set(key, { chat, turnId, workspaceFolder, isolation, initiatingClientId, prompt, showTransition: !!chatState?.turns.length, phase: 'requested' });
	}

	canIsolateSession(session: URI): boolean {
		const state = this._stateManager.getSessionState(session.toString());
		const provider = this._providerService.getProviderForSession(session);
		return !!state && !isSubagentSession(session) && this._isFolderSession(state)
			&& state.workingDirectories?.length === 1
			&& URI.parse(state.workingDirectories[0]).scheme === Schemas.file
			&& (state.status & SessionStatus.IsArchived) !== SessionStatus.IsArchived
			&& this._worktreeIsolation.supported
			&& provider?.agentHostCapabilities.workspaceConversion === true
			&& !!provider.setSessionWorkingDirectory
			&& !this.isPending(buildDefaultChatUri(session));
	}

	requestSessionIsolation(chat: URI, turnId: string, initiatingClientId: string): void {
		if (!initiatingClientId) {
			throw new Error('Session workspace conversion requires an initiating client.');
		}
		const parsed = parseChatUri(chat);
		if (!parsed || !isDefaultChatUri(chat) || isSubagentSession(parsed.session)) {
			throw new Error('Only the session main chat can request isolation.');
		}
		const session = URI.parse(parsed.session);
		const key = chat.toString();
		if (this.isPending(key)) {
			throw new Error('A workspace conversion is already pending for this session.');
		}
		const state = this._stateManager.getSessionState(session.toString());
		const directory = state?.workingDirectories?.[0];
		if (!state || !directory) {
			throw new Error('The session has no working directory.');
		}
		const workspaceFolder = URI.parse(directory);
		this._validateConversion(chat, workspaceFolder, true);
		if (!this.canIsolateSession(session)) {
			throw new Error('This session does not support isolation.');
		}
		if (this._stateManager.getActiveTurnId(key) !== turnId) {
			throw new Error('Session isolation must be requested from the active turn.');
		}
		const chatState = this._stateManager.getChatState(key);
		const pending: IPendingSessionWorkspaceConversion = {
			chat, turnId, convertFolder: true, workspaceFolder, isolation: true,
			initiatingClientId, prompt: chatState?.activeTurn?.message.text, showTransition: true, phase: 'requested',
		};
		this._pending.set(key, pending);
		this._onDidChangePendingSession.fire(session.toString());
	}

	isPending(chat: ProtocolURI, sessionWide = false): boolean {
		const key = this._pendingKey(chat);
		const pending = this._pending.get(key);
		return (!!pending && (!pending.chatOnly || (!sessionWide && pending.chat.toString() === chat)))
			|| this._quarantined.has(key) || (!sessionWide && this._quarantinedChats.has(chat));
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
			if (pending.convertFolder) {
				this._onDidChangePendingSession.fire(parseChatUri(chat)!.session);
			}
		}
	}

	async updateSessionWorkspace(chat: ProtocolURI, turnId: string | undefined): Promise<void> {
		const key = this._pendingKey(chat);
		const pending = this._pending.get(key);
		if (!pending || pending.phase === 'converting' || (pending.chatOnly && pending.chat.toString() !== chat)) {
			return;
		}
		if (pending.convertFolder) {
			if (pending.phase === 'requested') {
				if (pending.chat.toString() !== chat || pending.turnId !== turnId) {
					return;
				}
				pending.phase = 'waiting';
			}
			if (!pending.chatOnly && this._hasActiveChats(parseChatUri(pending.chat)!.session)) {
				return;
			}
		} else if (pending.turnId !== turnId || pending.chat.toString() !== chat) {
			return;
		}

		pending.phase = 'converting';
		let continuation: IDeferredAgentHostTurn | undefined;
		try {
			continuation = this._beginContinuation(pending);
			if (pending.showTransition) {
				pending.transition = this._createWorkspaceTransition(pending);
			}
			pending.resolvedWorkingDirectory = pending.chatOnly ? await this._convertChat(pending, continuation) : await this._convert(pending, continuation);
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
				this._pending.delete(key);
				(pending.chatOnly ? this._quarantinedChats : this._quarantined).add(key);
				this._failConversion(continuation, pending, conversionError);
			} else {
				this._pending.delete(key);
				await this._continueConversion(continuation, pending, false, conversionError);
			}

		} finally {
			if (pending.convertFolder) {
				this._onDidChangePendingSession.fire(parseChatUri(pending.chat)!.session);
			}
		}
	}

	private async _convertChat(pending: IPendingSessionWorkspaceConversion, continuation: IDeferredAgentHostTurn): Promise<URI> {
		const host = this._chatIsolationHost!;
		const { chat, workspaceFolder, initiatingClientId } = pending;
		const session = URI.parse(parseChatUri(chat)!.session);
		const storage = chatStorageUri(chat)!;
		const provider = this._providerService.getProviderForSession(session)!;
		const assertWorkspace = (expected = workspaceFolder) => {
			const state = this._stateManager.getSessionState(session.toString());
			const summary = state?.chats.find(candidate => candidate.resource === chat.toString());
			const directories = summary?.workingDirectories ?? state?.workingDirectories;
			if (!summary || state?.lifecycle !== SessionLifecycle.Ready
				|| (state.status & SessionStatus.IsArchived) === SessionStatus.IsArchived
				|| directories?.length !== 1 || !isEqual(URI.parse(directories[0]), expected)
				|| this._stateManager.getActiveTurnId(chat.toString()) !== continuation.turnId) {
				throw new Error('The chat changed while preparing isolation.');
			}
		};
		const trustRequired = this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) !== true
			&& (this._configurationService.getEffectiveValue(session.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default') !== 'autoApprove';
		await this._requireWorkspaceTrust(trustRequired, initiatingClientId, workspaceFolder);
		assertWorkspace();
		const database = this._sessionDataService.openDatabase(storage);
		let providerChanged = false;
		let prepared: Awaited<ReturnType<IChatIsolationHost['prepareChatWorkingDirectory']>> | undefined;
		try {
			prepared = await host.prepareChatWorkingDirectory(session, workspaceFolder, { isolation: 'worktree', forceNewWorktree: true, prompt: pending.prompt ?? '' });
			await this._requireWorkspaceTrust(trustRequired, initiatingClientId, prepared.directory, workspaceFolder);
			assertWorkspace();
			await database.object.setMetadata(CHAT_ISOLATION_QUARANTINED_KEY, 'true');
			await provider.setChatWorkingDirectory!(chat, { configurationResource: session, resource: storage }, prepared.directory);
			providerChanged = true;
			assertWorkspace();
			await host.setChatWorkingDirectory(session, chat, prepared.directory);
			assertWorkspace(prepared.directory);
			await this._gitStateService.refreshSessionGitState(chat.toString(), prepared.directory);
			assertWorkspace(prepared.directory);
			await database.object.setWorkspaceConversion(continuation.turnId, serializeAgentWorkspaceTransition(pending.transition!), {
				[CHAT_ISOLATION_DIRECTORY_KEY]: prepared.directory.toString(),
				[CHAT_ISOLATION_QUARANTINED_KEY]: 'false',
			});
			pending.transitionPersisted = true;
			assertWorkspace(prepared.directory);
			this._isolatedChats.add(chat.toString());
			if (isDefaultChatUri(chat)) {
				this._stateManager.setSessionMeta(session.toString(), withSessionHasWorkspaceTransitions(this._stateManager.getSessionState(session.toString())?._meta, true));
			}
			this._serverToolHost.advertise(session.toString());
			return prepared.directory;
		} catch (error) {
			if (providerChanged || error instanceof AgentWorkingDirectoryChangedError) {
				try {
					await database.object.setMetadata(CHAT_ISOLATION_QUARANTINED_KEY, 'true');
				} catch (persistenceError) {
					throw new UnsafeProviderWorkingDirectoryError(`Chat isolation could not be finalized: ${toErrorMessage(error)}; failed to persist quarantine: ${toErrorMessage(persistenceError)}`);
				}
				throw new UnsafeProviderWorkingDirectoryError(`Chat isolation could not be finalized: ${toErrorMessage(error)}`);
			}
			try {
				await database.object.deleteMetadata([CHAT_ISOLATION_QUARANTINED_KEY]);
			} catch (persistenceError) {
				throw new UnsafeProviderWorkingDirectoryError(`Chat isolation failed: ${toErrorMessage(error)}; failed to clear quarantine: ${toErrorMessage(persistenceError)}`);
			}
			await prepared?.release();
			throw error;
		} finally {
			database.dispose();
		}
	}

	private _hasActiveChats(session: string, exceptChat?: string): boolean {
		const key = buildDefaultChatUri(session);
		for (const candidate of this._stateManager.getSessionUris()) {
			if (this._pendingKey(buildDefaultChatUri(candidate)) !== key) {
				continue;
			}
			const state = this._stateManager.getSessionState(candidate);
			if (state?.chats.some(chat => chat.resource !== exceptChat && this._stateManager.getActiveTurnId(chat.resource) !== undefined)) {
				return true;
			}
		}
		return false;
	}

	private async _convert(pending: IPendingSessionWorkspaceConversion, continuation?: IDeferredAgentHostTurn): Promise<URI> {
		const { chat, workspaceFolder, isolation, initiatingClientId, prompt, transition } = pending;
		const { session, state, previousWorkingDirectory } = this._validateConversion(chat, workspaceFolder, pending.convertFolder);
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.agentHostCapabilities.workspaceConversion) {
			throw new Error(`Provider does not support changing the working directory: ${AgentSession.provider(session) ?? '(unknown)'}`);
		}
		const sessionKey = session.toString();
		const workspaceTrustRequired = this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) !== true
			&& (this._configurationService.getEffectiveValue(sessionKey, platformSessionSchema, SessionConfigKey.AutoApprove) ?? 'default') !== 'autoApprove';
		await this._requireWorkspaceTrust(workspaceTrustRequired, initiatingClientId, workspaceFolder);
		if (pending.convertFolder && !this._getUnchangedConversionState(session, chat, previousWorkingDirectory)) {
			throw new Error('The session changed while preparing worktree conversion.');
		}
		const resolvedWorkspace = await this._resolveWorkspace(session, chat, workspaceFolder, isolation, workspaceTrustRequired, initiatingClientId, prompt, state.config?.values);
		let authoritativeWorkingDirectory = resolvedWorkspace.workingDirectory;
		let providerAlignmentError: AgentWorkingDirectoryChangedError | undefined;
		try {
			if (pending.convertFolder && !this._getUnchangedConversionState(session, chat, previousWorkingDirectory)) {
				throw new Error('The session changed while creating the isolated worktree.');
			}
			if (pending.convertFolder) {
				if (!provider.setSessionWorkingDirectory) {
					throw new Error('The provider cannot isolate all chats in this session.');
				}
				await provider.setSessionWorkingDirectory(session, resolvedWorkspace.workingDirectory);
			} else {
				await provider.setWorkingDirectory(chat, session, resolvedWorkspace.workingDirectory);
			}
		} catch (error) {
			if (pending.convertFolder && error instanceof AgentWorkingDirectoryChangedError) {
				const quarantineError = await this._persistQuarantine(session);
				throw new UnsafeProviderWorkingDirectoryError(`Session isolation could not align every chat: ${toErrorMessage(error)}${quarantineError ? `; failed to persist quarantine: ${toErrorMessage(quarantineError)}` : ''}`);
			}
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
			if (pending.convertFolder) {
				const quarantineError = await this._persistQuarantine(session);
				throw new UnsafeProviderWorkingDirectoryError(`The session changed after its chats were isolated${quarantineError ? `; failed to persist quarantine: ${toErrorMessage(quarantineError)}` : ''}`);
			}
			const disposal = await this._disposeUnsafeProviderChat(provider, chat, session);
			const finalizationErrors = [...disposal.errors];
			if (resolvedWorkspace.isolated) {
				const cleanupError = await this._removeWorktree(session);
				if (cleanupError) {
					finalizationErrors.push(cleanupError);
				}
			}
			throw new UnsafeProviderWorkingDirectoryError(`The session state changed after the provider working directory changed, so the provider was disposed${finalizationErrors.length > 0 ? `: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}` : ''}`);
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
		const persistTransition = !!transition && !!continuation && this._stateManager.getActiveTurnId(chat.toString()) === continuation.turnId;
		const database = this._sessionDataService.openDatabase(session);
		try {
			const metadata = {
				[AH_META_WORKSPACELESS_DB_KEY]: 'false',
				...externalWorktreeMetadata,
			};
			if (configValues) {
				Object.assign(metadata, { configValues: JSON.stringify(configValues) });
			}
			if (persistTransition && transition && continuation) {
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
			if (pending.convertFolder) {
				const quarantineError = await this._persistQuarantine(session);
				throw new UnsafeProviderWorkingDirectoryError(`The session changed while isolation metadata was being persisted${quarantineError ? `; failed to persist quarantine: ${toErrorMessage(quarantineError)}` : ''}`);
			}
			const disposal = await this._disposeUnsafeProviderChat(provider, chat, session);
			const finalizationErrors = [...disposal.errors];
			if (resolvedWorkspace.isolated) {
				const cleanupError = await this._removeWorktree(session);
				if (cleanupError) {
					finalizationErrors.push(cleanupError);
				}
			}
			throw new UnsafeProviderWorkingDirectoryError(`The session state changed while converted metadata was being persisted, so the provider was disposed and the session was quarantined${finalizationErrors.length > 0 ? `: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}` : ''}`);
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
		this._updateIsolationConfig(session, finalState.config, configPatch, resolvedWorkspace.isolationConfig, worktreeApplied);
		await this._gitStateService.refreshSessionGitState(session.toString(), authoritativeWorkingDirectory);
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
			return {
				workingDirectory: workspaceFolder,
				configValues: { ...currentConfig, [SessionConfigKey.Isolation]: 'folder' },
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
		const workingDirectory = await this._worktreeIsolation.resolveOnFirstSend({
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
			});
		}
	}

	private _getUnchangedConversionState(session: URI, chat: URI, previousWorkingDirectory: ProtocolURI, expectedState?: ISessionWithDefaultChat): ISessionWithDefaultChat | undefined {
		const state = this._stateManager.getSessionState(session.toString());
		const pending = this._pending.get(chat.toString());
		if (!state
			|| pending?.phase !== 'converting'
			|| (pending.convertFolder ? !this._isFolderSession(state) : !readSessionWorkspaceless(state._meta))
			|| (pending.convertFolder && this._hasActiveChats(session.toString(), chat.toString()))
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

	private _isFolderSession(state: ISessionWithDefaultChat): boolean {
		return !readSessionWorkspaceless(state._meta)
			&& !readSessionExternal(state._meta)
			&& state.lifecycle !== SessionLifecycle.Failed
			&& state.config?.values[SessionConfigKey.Isolation] === 'folder';
	}

	private _validateConversion(chat: URI, workspaceFolder: URI, convertFolder = false) {
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
		if (convertFolder ? !this._isFolderSession(state) : !readSessionWorkspaceless(state._meta)) {
			if (convertFolder) {
				throw new Error('Only a folder session can be converted to an isolated session.');
			}
			throw new Error('Only a workspace-less session can be converted to a workspace session.');
		}
		if (convertFolder && state.lifecycle !== SessionLifecycle.Ready) {
			throw new Error('The session must finish initializing before isolation.');
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
			text: pending.convertFolder
				? localize('agentHost.continueIsolatedMessage', "Continue the task in isolation.")
				: localize('agentHost.continueInWorkspaceMessage', "Continue in the requested workspace."),
			origin: { kind: MessageKind.SystemNotification },
			_meta: toAgentWorkspaceContinuationMessageMeta(),
		}, pending.convertFolder
			? localize('agentHost.continueIsolatedLabel', "Continue in Isolation")
			: localize('agentHost.continueInWorkspaceLabel', "Continue in Requested Workspace")), true));
		return continuation;
	}

	private _createWorkspaceTransition(pending: IPendingSessionWorkspaceConversion): IAgentWorkspaceTransitionRecord {
		const workspaceName = basename(pending.workspaceFolder) || pending.workspaceFolder.path;
		return {
			content: pending.convertFolder
				? pending.chatOnly ? localize('agentHost.chatIsolationTransitionLabel', "Chat isolated") : localize('agentHost.isolationTransitionLabel', "Session isolated")
				: localize('agentHost.workspaceTransitionLabel', "Now working in {0}", workspaceName),
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
			? pending.convertFolder
				? pending.chatOnly
					? `Only this chat is now isolated in ${pending.resolvedWorkingDirectory!.fsPath}. Other chats and their folders are unchanged. The session workspace includes this worktree. Continue the user's original task here without requesting isolation again.`
					: `The current session and all its chats are now isolated in ${(pending.resolvedWorkingDirectory ?? pending.workspaceFolder).fsPath}. The project and conversation histories are unchanged. Continue the user's original task in this worktree. Do not request isolation again.`
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
		this._isolatedChats.clear();
		super.dispose();
	}
}
