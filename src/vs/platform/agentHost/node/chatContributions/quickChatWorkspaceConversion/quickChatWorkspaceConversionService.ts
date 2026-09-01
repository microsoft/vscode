/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable, toDisposable, type IDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../../log/common/log.js';
import { AgentSession, AgentWorkingDirectoryChangedError, type IAgentSessionProjectInfo } from '../../../common/agent.js';
import type { ITurnEnd } from '../../../common/agentHostChatContributionsService.js';
import { ISessionDataService } from '../../../common/sessionDataService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { ActionType } from '../../../common/state/sessionActions.js';
import { AH_META_WORKSPACELESS_DB_KEY, buildDefaultChatUri, isDefaultChatUri, MessageKind, parseChatUri, readSessionWorkspaceless, withMessageSystemInitiatedLabel, withSessionWorkspaceless, type Message, type SessionConfigState, type URI as ProtocolURI } from '../../../common/state/sessionState.js';
import { IAgentHostStateManager, type AgentHostStateManager } from '../../agentHostStateManager.js';
import { IAgentHostProviderService } from '../../agentHostProviderService.js';
import { IAgentHostWorktreeIsolation, type IIsolationConfigContribution } from '../../shared/worktreeIsolation.js';

interface IPendingQuickChatWorkspaceConversion {
	readonly chat: URI;
	readonly turnId: string;
	readonly workspaceFolder: URI;
	readonly isolation: boolean;
	readonly prompt: string | undefined;
	phase: 'scheduled' | 'converting';
	resolvedWorkspaceFolder?: URI;
}

interface IResolvedWorkspace {
	readonly workingDirectory: URI;
	readonly configValues: Record<string, unknown>;
	readonly isolationConfig: IIsolationConfigContribution | undefined;
	readonly isolated: boolean;
	readonly project: IAgentSessionProjectInfo | undefined;
}

export interface IQuickChatWorkspaceConversionHost {
	startContinuation(chat: URI, message: Message): Promise<void>;
}

export const IQuickChatWorkspaceConversionService = createDecorator<IQuickChatWorkspaceConversionService>('quickChatWorkspaceConversionService');

export interface IQuickChatWorkspaceConversionService {
	readonly _serviceBrand: undefined;
	registerHost(host: IQuickChatWorkspaceConversionHost): IDisposable;
	schedule(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean): void;
	isPending(chat: ProtocolURI): boolean;
	handleTurnEnd(turn: ITurnEnd): Promise<void>;
	convertNow(chat: URI, workspaceFolder: URI, isolation: boolean, prompt?: string): Promise<URI>;
}

export class QuickChatWorkspaceConversionService extends Disposable implements IQuickChatWorkspaceConversionService {

	declare readonly _serviceBrand: undefined;

	private readonly _pending = new Map<string, IPendingQuickChatWorkspaceConversion>();
	private _host: IQuickChatWorkspaceConversionHost | undefined;

	constructor(
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostProviderService private readonly _providerService: IAgentHostProviderService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostWorktreeIsolation private readonly _worktreeIsolation: IAgentHostWorktreeIsolation,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(this._stateManager.onDidRemoveSession(session => this._pending.delete(buildDefaultChatUri(session))));
	}

	registerHost(host: IQuickChatWorkspaceConversionHost): IDisposable {
		if (this._host) {
			throw new Error('Quick Chat workspace conversion host is already registered.');
		}
		this._host = host;
		return toDisposable(() => {
			if (this._host === host) {
				this._host = undefined;
			}
		});
	}

	schedule(chat: URI, turnId: string, workspaceFolder: URI, isolation: boolean): void {
		if (!this._host) {
			throw new Error('Quick Chat workspace conversion is unavailable.');
		}
		this._validateConversion(chat, workspaceFolder);
		const activeTurnId = this._stateManager.getActiveTurnId(chat.toString());
		if (activeTurnId !== turnId) {
			throw new Error('Quick Chat workspace conversion must be scheduled from the active turn.');
		}
		const prompt = this._stateManager.getChatState(chat.toString())?.activeTurn?.message.text;
		const key = chat.toString();
		if (this._pending.has(key)) {
			throw new Error('A workspace conversion is already pending for this Quick Chat.');
		}
		this._pending.set(key, { chat, turnId, workspaceFolder, isolation, prompt, phase: 'scheduled' });
	}

	isPending(chat: ProtocolURI): boolean {
		return this._pending.has(chat);
	}

	async handleTurnEnd(turn: ITurnEnd): Promise<void> {
		const pending = this._pending.get(turn.channel);
		if (!pending || pending.turnId !== turn.turnId || pending.phase !== 'scheduled') {
			return;
		}
		if (turn.reason.kind !== 'success') {
			this._pending.delete(turn.channel);
			return;
		}

		pending.phase = 'converting';
		try {
			pending.resolvedWorkspaceFolder = await this.convertNow(pending.chat, pending.workspaceFolder, pending.isolation, pending.prompt);
			this._pending.delete(turn.channel);
			await this._startContinuation(pending, true);
		} catch (error) {
			this._pending.delete(turn.channel);
			this._logService.error(`[QuickChatWorkspaceConversionService] Failed to convert ${pending.chat.toString()}: ${toErrorMessage(error)}`);
			await this._startContinuation(pending, false, error);
		}
	}

	async convertNow(chat: URI, workspaceFolder: URI, isolation: boolean, prompt?: string): Promise<URI> {
		const { session, state } = this._validateConversion(chat, workspaceFolder);
		const provider = this._providerService.getProviderForSession(session);
		if (!provider?.setWorkingDirectory) {
			throw new Error(`Provider does not support changing the working directory: ${AgentSession.provider(session) ?? '(unknown)'}`);
		}
		const resolvedWorkspace = await this._resolveWorkspace(session, chat, workspaceFolder, isolation, prompt, state.config?.values);
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

		const convertedState = this._stateManager.getSessionState(session.toString());
		if (!convertedState
			|| !readSessionWorkspaceless(convertedState._meta)
			|| convertedState.defaultChat !== chat.toString()
			|| convertedState.workingDirectories?.length !== 1
		) {
			throw new Error('The workspace-less session state changed while it was being converted.');
		}
		const previousWorkingDirectory = convertedState.workingDirectories[0];
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
			const writes = [database.object.setMetadata(AH_META_WORKSPACELESS_DB_KEY, 'false')];
			if (configValues) {
				writes.push(database.object.setMetadata('configValues', JSON.stringify(configValues)));
			}
			await Promise.all(writes);
		} catch (error) {
			persistenceError = error;
		} finally {
			database.dispose();
		}

		if (worktreeApplied && resolvedWorkspace.project) {
			this._stateManager.setSessionProject(session.toString(), {
				uri: resolvedWorkspace.project.uri.toString(),
				displayName: resolvedWorkspace.project.displayName,
			});
		}
		this._stateManager.dispatchServerAction(session.toString(), {
			type: ActionType.SessionWorkingDirectoryReplaced,
			directory: previousWorkingDirectory,
			replacement: authoritativeWorkingDirectory.toString(),
		});
		this._stateManager.setSessionMeta(session.toString(), withSessionWorkspaceless(convertedState._meta, false));
		this._updateIsolationConfig(session, convertedState.config, configPatch, resolvedWorkspace.isolationConfig, worktreeApplied);
		const finalizationErrors: unknown[] = [];
		if (providerAlignmentError) {
			finalizationErrors.push(providerAlignmentError);
		}
		if (worktreeCleanupError) {
			finalizationErrors.push(worktreeCleanupError);
		}
		if (persistenceError) {
			finalizationErrors.push(persistenceError);
		}
		if (finalizationErrors.length > 0) {
			throw new Error(`The workspace changed to '${authoritativeWorkingDirectory.fsPath}', but conversion did not complete cleanly: ${finalizationErrors.map(error => toErrorMessage(error)).join('; ')}`);
		}
		return authoritativeWorkingDirectory;
	}

	private async _resolveWorkspace(
		session: URI,
		chat: URI,
		workspaceFolder: URI,
		isolation: boolean,
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
		let reportedActivity = false;
		let workingDirectory: URI | undefined;
		try {
			workingDirectory = await this._worktreeIsolation.resolveOnFirstSend({
				sessionUri: session,
				sessionId: AgentSession.id(session),
				workingDirectory: workspaceFolder,
				config: configValues,
				prompt,
				onProgress: activity => {
					reportedActivity = true;
					this._stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatActivityChanged, activity });
				},
			});
		} finally {
			if (reportedActivity) {
				this._stateManager.dispatchServerAction(chat.toString(), { type: ActionType.ChatActivityChanged, activity: undefined });
			}
		}
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
			await this._worktreeIsolation.removeSessionWorktree(sessionId, worktree);
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
		if (!isDefaultChatUri(chat) || state.defaultChat !== chat.toString()) {
			throw new Error('Only the owning default chat can convert the session to a workspace session.');
		}
		if (state.workingDirectories?.length !== 1) {
			throw new Error('A workspace-less session must have exactly one working directory before conversion.');
		}
		return { session, state };
	}

	private async _startContinuation(pending: IPendingQuickChatWorkspaceConversion, converted: boolean, error?: unknown): Promise<void> {
		const host = this._host;
		if (!host) {
			this._logService.error('[QuickChatWorkspaceConversionService] Cannot continue because the conversion host is unavailable.');
			return;
		}
		const text = converted
			? `The current session is now attached to ${(pending.resolvedWorkspaceFolder ?? pending.workspaceFolder).fsPath}${pending.isolation ? ' in an isolated worktree' : ''}. Continue the user's original task in this workspace. Do not request another session or workspace conversion.`
			: `The requested workspace setup did not complete successfully: ${toErrorMessage(error)}. Do not run the user's task. Tell the user that workspace setup failed and include this error.`;
		const label = converted
			? localize('agentHost.workspaceSetLabel', "Workspace Set")
			: localize('agentHost.workspaceSetupFailedLabel', "Workspace Setup Failed");
		try {
			await host.startContinuation(pending.chat, withMessageSystemInitiatedLabel({
				text,
				origin: { kind: MessageKind.SystemNotification },
			}, label));
		} catch (continuationError) {
			this._logService.error(`[QuickChatWorkspaceConversionService] Failed to start the conversion continuation for ${pending.chat.toString()}: ${toErrorMessage(continuationError)}`);
		}
	}

	override dispose(): void {
		this._pending.clear();
		super.dispose();
	}
}
