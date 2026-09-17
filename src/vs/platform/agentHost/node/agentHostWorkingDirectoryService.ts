/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import { ActionType } from '../common/state/sessionActions.js';
import { ResponsePartKind } from '../common/state/sessionState.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';
import { IAgentHostAuthenticationService } from './agentHostAuthenticationService.js';
import { IAgentHostGitHubEndpointService } from './agentHostGitHubEndpointService.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { buildWorktreeFailureNotification, IAgentHostWorktreeIsolation } from './shared/worktreeIsolation.js';

export const IAgentHostWorkingDirectoryService = createDecorator<IAgentHostWorkingDirectoryService>('agentHostWorkingDirectoryService');

interface IWorkingDirectoryRequest {
	readonly session: string;
	readonly chat: string;
	readonly turnId: string;
	readonly prompt: string;
}

/** Resolves the session workspace and reports preparation on the requesting turn. */
export interface IAgentHostWorkingDirectoryService {
	readonly _serviceBrand: undefined;
	resolve(request: IWorkingDirectoryRequest): Promise<readonly URI[] | undefined>;
}

export class AgentHostWorkingDirectoryService implements IAgentHostWorkingDirectoryService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IAgentConfigurationService private readonly _configuration: IAgentConfigurationService,
		@IAgentHostWorktreeIsolation private readonly _worktree: IAgentHostWorktreeIsolation,
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostAuthenticationService private readonly _authentication: IAgentHostAuthenticationService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpoints: IAgentHostGitHubEndpointService,
		@ILogService private readonly _logService: ILogService,
	) { }

	async resolve(request: IWorkingDirectoryRequest): Promise<readonly URI[] | undefined> {
		const sessionId = AgentSession.id(request.session);
		const pickedFolders = this._configuration.getEffectiveWorkingDirectories(request.session);
		const pickedFolder = pickedFolders?.[0] ? URI.parse(pickedFolders[0]) : undefined;
		const tail = (pickedFolders ?? []).slice(1).map(directory => URI.parse(directory));
		if (!this._worktree.isWorkingDirectoryPending(sessionId)) {
			const primary = this._worktree.getResolvedWorktree(sessionId) ?? pickedFolder;
			if (!primary) {
				return undefined;
			}
			const resolved = await this._worktree.resolveWorkingDirectoryForResume(URI.parse(request.session), sessionId, primary);
			return [resolved, ...tail];
		}
		const resolved = await this._resolveWorktree(request, sessionId, pickedFolder) ?? pickedFolder;
		return resolved ? [resolved, ...tail] : undefined;
	}

	private async _resolveWorktree(request: IWorkingDirectoryRequest, sessionId: string, pickedFolder: URI | undefined): Promise<URI | undefined> {
		let reportedActivity = false;
		let failureDiagnostic: string | undefined;
		try {
			const resource = this._gitHubEndpoints.getCopilotResource();
			await this._worktree.resolveOnFirstSend({
				sessionUri: URI.parse(request.session),
				sessionId,
				workingDirectory: pickedFolder,
				config: this._configuration.getSessionConfigValues(request.session),
				prompt: request.prompt,
				githubToken: this._authentication.getAuthToken({ resource: resource.resource, scopes: resource.scopes_supported }),
				onProgress: activity => {
					reportedActivity = true;
					this._stateManager.dispatchServerAction(request.chat, { type: ActionType.ChatActivityChanged, activity });
				},
			});
		} catch (error) {
			failureDiagnostic = toErrorMessage(error);
			this._logService.warn(`[AgentHostWorkingDirectoryService] Worktree resolution failed for ${request.session}: ${failureDiagnostic}`);
		}
		if (reportedActivity) {
			this._stateManager.dispatchServerAction(request.chat, { type: ActionType.ChatActivityChanged, activity: undefined });
		}
		const resolved = this._worktree.getResolvedWorktree(sessionId);
		if (!resolved) {
			try {
				await this._worktree.persistCreationFailure(URI.parse(request.session), sessionId, failureDiagnostic);
			} catch (error) {
				this._logService.warn(`[AgentHostWorkingDirectoryService] Failed to persist worktree creation failure for ${request.session}`, error);
			}
			this._stateManager.dispatchServerAction(request.chat, {
				type: ActionType.ChatResponsePart, turnId: request.turnId,
				part: buildWorktreeFailureNotification(failureDiagnostic),
			});
			return undefined;
		}
		const announcement = this._worktree.takePendingAnnouncement(sessionId);
		if (announcement !== undefined) {
			this._stateManager.dispatchServerAction(request.chat, {
				type: ActionType.ChatResponsePart, turnId: request.turnId,
				part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
			});
		}
		return resolved;
	}
}
