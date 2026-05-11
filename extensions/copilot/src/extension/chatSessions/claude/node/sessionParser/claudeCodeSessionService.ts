/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Claude Code Session Service
 *
 * This service provides access to Claude Code chat sessions using the
 * `@anthropic-ai/claude-agent-sdk` session APIs. It handles:
 * - Listing sessions via `listSessions()`
 * - Loading full session content via `getSessionInfo()` + `getSessionMessages()`
 * - Subagent loading via `listSubagents()` + `getSubagentMessages()`
 */

import type { CancellationToken } from 'vscode';
import { ILogService } from '../../../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { basename } from '../../../../../util/vs/base/common/resources';
import { URI } from '../../../../../util/vs/base/common/uri';
import { IAgentSessionsWorkspace } from '../../../../chatSessions/common/agentSessionsWorkspace';
import { IFolderRepositoryManager } from '../../../../chatSessions/common/folderRepositoryManager';
import { ClaudeSessionUri } from '../../common/claudeSessionUri';
import { IClaudeCodeSdkService } from '../claudeCodeSdkService';
import { getProjectFolders } from '../claudeProjectFolders';
import {
	IClaudeCodeSession,
	IClaudeCodeSessionInfo,
	ISubagentSession,
} from './claudeSessionSchema';
import { buildClaudeCodeSession, sdkSessionInfoToSessionInfo, sdkSubagentMessagesToSubagentSession } from './sdkSessionAdapter';
import { toErrorMessage } from '../../../../../util/common/errorMessage';

// #region Service Interface

export const IClaudeCodeSessionService = createServiceIdentifier<IClaudeCodeSessionService>('IClaudeCodeSessionService');

/**
 * Service to load and manage Claude Code chat sessions.
 */
export interface IClaudeCodeSessionService {
	readonly _serviceBrand: undefined;

	/**
	 * Get lightweight metadata for all sessions in the current workspace.
	 * This is optimized for listing sessions without loading full content.
	 */
	getAllSessions(token: CancellationToken): Promise<readonly IClaudeCodeSessionInfo[]>;

	/**
	 * Get a specific session with full content by its resource URI.
	 * This loads the complete message history and subagents.
	 */
	getSession(resource: URI, token: CancellationToken): Promise<IClaudeCodeSession | undefined>;
}

// #endregion

// #region Service Implementation

export class ClaudeCodeSessionService implements IClaudeCodeSessionService {
	declare _serviceBrand: undefined;

	constructor(
		@IClaudeCodeSdkService private readonly _sdkService: IClaudeCodeSdkService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceService private readonly _workspace: IWorkspaceService,
		@IFolderRepositoryManager private readonly _folderRepositoryManager: IFolderRepositoryManager,
		@IAgentSessionsWorkspace private readonly _agentSessionsWorkspace: IAgentSessionsWorkspace,
	) { }

	/**
	 * Get lightweight metadata for all sessions in the current workspace.
	 * Delegates to the SDK's `listSessions()` and converts results.
	 */
	async getAllSessions(token: CancellationToken): Promise<readonly IClaudeCodeSessionInfo[]> {
		if (this._agentSessionsWorkspace.isAgentSessionsWorkspace) {
			try {
				const sdkSessions = await this._sdkService.listSessions();
				return sdkSessions.map(sdkInfo => sdkSessionInfoToSessionInfo(sdkInfo));
			} catch (e) {
				this._logService.debug(`[ClaudeCodeSessionService] Failed to list all sessions: ${e}`);
				return [];
			}
		}

		const items: IClaudeCodeSessionInfo[] = [];
		const projectFolders = await this._getProjectFolders();

		for (const { slug, folderUri } of projectFolders) {
			if (token.isCancellationRequested) {
				return items;
			}

			const folderName = basename(folderUri);

			try {
				const sdkSessions = await this._sdkService.listSessions(folderUri.fsPath);
				for (const sdkInfo of sdkSessions) {
					items.push(sdkSessionInfoToSessionInfo(sdkInfo, folderName));
				}
			} catch (e) {
				this._logService.debug(`[ClaudeCodeSessionService] Failed to list sessions for slug ${slug}: ${e}`);
			}
		}

		return items;
	}

	/**
	 * Get a specific session with full content by its resource URI.
	 * Uses SDK APIs for metadata, messages, and subagent transcripts.
	 */
	async getSession(resource: URI, token: CancellationToken): Promise<IClaudeCodeSession | undefined> {
		const sessionId = ClaudeSessionUri.getSessionId(resource);

		if (this._agentSessionsWorkspace.isAgentSessionsWorkspace) {
			try {
				const info = await this._sdkService.getSessionInfo(sessionId);
				if (!info) {
					return undefined;
				}

				const messages = await this._sdkService.getSessionMessages(sessionId, info.cwd);
				if (token.isCancellationRequested) {
					return undefined;
				}

				const subagents = await this._loadSubagents(sessionId, info.cwd, token);
				return buildClaudeCodeSession(info, messages, subagents);
			} catch (e) {
				this._logService.debug(`[ClaudeCodeSessionService] Failed to load session ${sessionId}: ${e}`);
				return undefined;
			}
		}

		const projectFolders = await this._getProjectFolders();

		for (const { slug, folderUri } of projectFolders) {
			if (token.isCancellationRequested) {
				return undefined;
			}

			const dir = folderUri.fsPath;

			try {
				const info = await this._sdkService.getSessionInfo(sessionId, dir);
				if (!info) {
					continue;
				}

				const sessionDir = info.cwd ?? dir;
				const messages = await this._sdkService.getSessionMessages(sessionId, sessionDir);
				if (token.isCancellationRequested) {
					return undefined;
				}

				const subagents = await this._loadSubagents(sessionId, sessionDir, token);

				const folderName = basename(folderUri);
				return buildClaudeCodeSession(info, messages, subagents, folderName);
			} catch (e) {
				this._logService.debug(`[ClaudeCodeSessionService] Failed to load session ${sessionId} from slug ${slug}: ${e}`);
			}
		}

		return undefined;
	}

	// #region Directory Discovery

	/**
	 * Get the project directory slugs to scan for sessions, along with their
	 * original folder URIs (needed for badge display).
	 */
	private _getProjectFolders() {
		return getProjectFolders(this._workspace, this._folderRepositoryManager);
	}

	// #endregion

	// #region Subagent Loading

	private async _loadSubagents(
		sessionId: string,
		cwd: string | undefined,
		token: CancellationToken,
	): Promise<readonly ISubagentSession[]> {
		let agentIds: string[];
		try {
			agentIds = await this._sdkService.listSubagents(sessionId, cwd ? { dir: cwd } : undefined);
		} catch (error) {
			this._logService.warn(`[ClaudeCodeSessionService] listSubagents failed: ${toErrorMessage(error)}`);
			return [];
		}

		if (agentIds.length === 0 || token.isCancellationRequested) {
			return [];
		}

		const results = await Promise.allSettled(
			agentIds.map(agentId => this._loadSubagentFromSdk(sessionId, agentId, cwd))
		);

		if (token.isCancellationRequested) {
			return [];
		}

		const subagents: ISubagentSession[] = [];
		for (const r of results) {
			if (r.status === 'fulfilled' && r.value !== null) {
				subagents.push(r.value);
			}
		}

		subagents.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

		return subagents;
	}

	private async _loadSubagentFromSdk(
		sessionId: string,
		agentId: string,
		cwd: string | undefined,
	): Promise<ISubagentSession | null> {
		try {
			const messages = await this._sdkService.getSubagentMessages(sessionId, agentId, cwd ? { dir: cwd } : undefined);
			return sdkSubagentMessagesToSubagentSession(agentId, messages);
		} catch (error) {
			this._logService.warn(`[ClaudeCodeSessionService] Failed to load subagent ${agentId} for session ${sessionId}: ${toErrorMessage(error)}`);
			return null;
		}
	}

	// #endregion
}

// #endregion
