/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { equals } from '../../../../../base/common/objects.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession, AgentWorkingDirectoryChangedError, type IAgent, type IAgentSessionProjectInfo } from '../../../common/agent.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, buildDefaultChatUri, isDefaultChatUri, MessageKind, parseChatUri, readSessionWorkspaceless, ResponsePartKind, SessionStatus, withMessageSystemInitiatedLabel, withSessionWorkspaceless, type ISessionWithDefaultChat, type SessionConfigState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostClientConnectionService } from '../../agentHostClientConnectionService.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostTurnService, type IDeferredAgentHostTurn } from '../../agentHostTurnService.js';
import { IAgentHostServerToolService } from '../../shared/agentServerToolHost.js';
import { IAgentHostWorktreeIsolation, type IIsolationConfigContribution } from '../../shared/worktreeIsolation.js';

interface IPendingSessionWorkspaceConversion {
	readonly chat: URI;
	readonly turnId: string;
	readonly workspaceFolder: URI;
	readonly isolation: boolean;
	readonly initiatingClientId: string;
	readonly prompt: string | undefined;
	phase: 'requested' | 'converting';
	resolvedWorkingDirectory?: URI;
}

interface IResolvedWorkspace {
	readonly workingDirectory: URI;
	readonly configValues: Record<string, unknown>;
	readonly isolationConfig: IIsolationConfigContribution | undefined;
	readonly isolated: boolean;
	readonly project: IAgentSessionProjectInfo | undefined;
}

class UnsafeProviderWorkingDirectoryError extends Error {
}

export const ISessionWorkspaceConversionService = createDecorator<ISessionWorkspaceConversionService>('sessionWorkspaceConversionService');

/** Coordinates requested workspace changes after the requesting turn has finished. */
export interface ISessionWorkspaceConversionService {
	readonly _serviceBrand: undefined;
	requestSessionWorkspaceUpdate(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean, initiatingClientId: string): void;
	isPending(chat: ProtocolURI): boolean;
	cancel(chat: ProtocolURI, turnId: string | undefined): void;
	updateSessionWorkspace(chat: ProtocolURI, turnId: string | undefined): Promise<void>;
}

/** Converts workspace-less sessions in place while preserving their session and chat identities. */
export class SessionWorkspaceConversionService extends Disposable implements ISessionWorkspaceConversionService {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, IPendingSessionWorkspaceConversion>();
	private readonly _quarantined = new Set<string>();

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@IAgentHostClientConnectionService private readonly _clientConnections: IAgentHostClientConnectionService,
		@IAgentHostTurnService private readonly _turnService: IAgentHostTurnService,
		@IAgentHostServerToolService private readonly _serverToolHost: IAgentHostServerToolService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._stateManager.onDidRemoveSession(session => {
			const chat = buildDefaultChatUri(session);
			this._pending.delete(chat);
			this._quarantined.delete(chat);
		}));
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
		const prompt = this._stateManager.getChatState(chat.toString())?.activeTurn?.message.text;
		const key = chat.toString();
		if (this.isPending(key)) {
			throw new Error('A workspace conversion is already pending for this session.');
		}
		this._pending.set(key, { chat, turnId, workspaceFolder, isolation, initiatingClientId, prompt, phase: 'requested' });
	}

	isPending(chat: ProtocolURI): boolean {
		return this._pending.has(chat) || this._quarantined.has(chat);
	}

	cancel(chat: ProtocolURI, turnId: string | undefined): void {
		const pending = this._pending.get(chat);
		if (pending && pending.turnId === turnId && pending.phase === 'requested') {
			this._pending.delete(chat);
		}
	}

	async updateSessionWorkspace(chat: ProtocolURI, turnId: string | undefined): Promise<void> {
		const pending = this._pending.get(chat);
		if (!pending || pending.turnId !== turnId || pending.phase !== 'requested') {
			return;
		}

		pending.phase = 'converting';
		let continuation: IDeferredAgentHostTurn | undefined;
		try {
			continuation = this._beginContinuation(pending);
			pending.resolvedWorkingDirectory = await this._convert(pending.chat, pending.workspaceFolder, pending.isolation, pending.initiatingClientId, pending.prompt);
			this._pending.delete(chat);
			this._continueConversion(continuation, pending, true);
		} catch (error) {
			this._logService.error(`[SessionWorkspaceConversionService] Failed to convert ${pending.chat.toString()}: ${toErrorMessage(error)}`);
			if (error instanceof UnsafeProviderWorkingDirectoryError) {
				this._pending.delete(chat);
				this._quarantined.add(chat);
				this._failConversion(continuation, pending, error);
			} else {
				this._pending.delete(chat);
				this._continueConversion(continuation, pending, false, error);
			}
		}
	}

	private async _convert(chat: URI, workspaceFolder: URI, isolation: boolean, initiatingClientId: string, prompt?: string): Promise<URI> {
		const { session, state, previousWorkingDirectory } = this._validateConversion(chat, workspaceFolder);
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.agentHostCapabilities.workspaceConversion) {
			throw new Error(`Provider does not support changing the working directory: ${AgentSession.provider(session) ?? '(unknown)'}`);
		}
		await this._requireWorkspaceTrust(initiatingClientId, workspaceFolder);
		const resolvedWorkspace = await this._resolveWorkspace(session, chat, workspaceFolder, isolation, initiatingClientId, prompt, state.config?.values);
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
				await this._requireWorkspaceTrust(initiatingClientId, authoritativeWorkingDirectory);
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
		let persistenceError: unknown;
		const database = this._sessionDataService.openDatabase(session);
		try {
			const metadata = { [AH_META_WORKSPACELESS_DB_KEY]: 'false' };
			if (configValues) {
				Object.assign(metadata, { configValues: JSON.stringify(configValues) });
			}
			await database.object.setMetadataValues(metadata);
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

		if (worktreeApplied && resolvedWorkspace.project) {
			this._stateManager.setSessionProject(session.toString(), {
				uri: resolvedWorkspace.project.uri.toString(),
				displayName: resolvedWorkspace.project.displayName,
			});
		}
		this._stateManager.setSessionMeta(session.toString(), withSessionWorkspaceless(finalState._meta, false));
		this._stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: previousWorkingDirectory,
			replacement: authoritativeWorkingDirectory.toString(),
		});
		this._updateIsolationConfig(session, finalState.config, configPatch, resolvedWorkspace.isolationConfig, worktreeApplied);
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

	private async _requireWorkspaceTrust(clientId: string, workspace: URI, trustedParent?: URI): Promise<void> {
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
					await this._requireWorkspaceTrust(initiatingClientId, metadata.repositoryRoot);
				}
				await this._requireWorkspaceTrust(initiatingClientId, metadata.worktreePath, metadata.repositoryRoot);
			},
		});
		if (!workingDirectory || isEqual(workingDirectory, workspaceFolder)) {
			throw new Error('The isolated worktree could not be created.');
		}
		this._worktreeIsolation.takePendingAnnouncement(AgentSession.id(session));
		const project = this._worktreeIsolation.sessionWorktreeProject(AgentSession.id(session));
		if (!project) {
			const cleanupError = await this._removeWorktree(session);
			throw new Error(cleanupError
				? `The isolated worktree project could not be resolved, and cleanup failed: ${toErrorMessage(cleanupError)}`
				: 'The isolated worktree project could not be resolved.');
		}
		return { workingDirectory, configValues, isolationConfig, isolated: true, project };
	}

	private async _removeWorktree(session: URI): Promise<unknown | undefined> {
		const sessionId = AgentSession.id(session);
		try {
			const worktree = await this._worktreeIsolation.prepareSessionDeletion(session, sessionId);
			await this._worktreeIsolation.discardSessionWorktree(session, sessionId, worktree);
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
		const continuation = this._turnService.beginDeferredTurnMessage(pending.chat, withMessageSystemInitiatedLabel({
			text: localize('agentHost.continueInWorkspaceMessage', "Continue in the requested workspace."),
			origin: { kind: MessageKind.SystemNotification },
		}, localize('agentHost.continueInWorkspaceLabel', "Continue in Requested Workspace")));
		return continuation;
	}

	private _continueConversion(continuation: IDeferredAgentHostTurn | undefined, pending: IPendingSessionWorkspaceConversion, converted: boolean, error?: unknown): void {
		if (!continuation) {
			this._logService.error(`[SessionWorkspaceConversionService] Cannot continue workspace conversion for ${pending.chat.toString()} because its deferred turn did not start.`);
			return;
		}
		const errorMessage = error === undefined ? undefined : toErrorMessage(error).replace(/\.+$/, '');
		const text = converted
			? `The current session is now attached to ${(pending.resolvedWorkingDirectory ?? pending.workspaceFolder).fsPath}${pending.isolation ? ' in an isolated worktree' : ''}. Continue the user's original task in this workspace. Do not request another session or workspace conversion.`
			: `The requested workspace setup did not complete successfully: ${errorMessage}. Do not run the user's task. Tell the user that workspace setup failed and include this error.`;
		const label = converted
			? localize('agentHost.workspaceSetLabel', "Workspace Set")
			: localize('agentHost.workspaceSetupFailedLabel', "Workspace Setup Failed");
		this._publishConversionOutcome(pending.chat, continuation, label);
		try {
			if (!this._turnService.continueDeferredTurnMessage(pending.chat, continuation, withMessageSystemInitiatedLabel({
				text,
				origin: { kind: MessageKind.SystemNotification },
			}, label))) {
				this._logService.info(`[SessionWorkspaceConversionService] The deferred workspace conversion turn for ${pending.chat.toString()} ended before it could continue.`);
			}
		} catch (continuationError) {
			this._logService.error(`[SessionWorkspaceConversionService] Failed to start the conversion continuation for ${pending.chat.toString()}: ${toErrorMessage(continuationError)}`);
			this._failConversion(continuation, pending, continuationError instanceof Error ? continuationError : new Error(toErrorMessage(continuationError)), false);
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

	private _publishConversionOutcome(chat: URI, continuation: IDeferredAgentHostTurn, label: string): void {
		if (this._stateManager.getActiveTurnId(chat.toString()) !== continuation.turnId) {
			return;
		}
		this._stateManager.dispatchServerAction(chat.toString(), {
			type: ActionType.ChatResponsePart,
			turnId: continuation.turnId,
			part: {
				kind: ResponsePartKind.SystemNotification,
				content: label,
			},
		});
	}

	override dispose(): void {
		this._pending.clear();
		this._quarantined.clear();
		super.dispose();
	}
}
